import { CATEGORIES, DAWN, fmt, hours, toMin, fullness, catImg, onPhone } from './data.js';
import { TODAY, iso, fromIso, addDays, dow, mondayOf, isDone } from './plan.js';
import { blockStatus } from './timetable.js';
import { confirmLetGo } from './confirm.js';
import { dayReading, weekReading, forget } from './readings.js';
import { FORECAST_WORDS } from './climate.js';
import { calendar as google } from './backend.js';

// The planner sheet -- the conventional input side of the app.
//   Day   -- one day's list; today's is the plan the island draws as its path
//   Week  -- drag on empty time to add, drag a block to move it, drag its
//            lower edge to resize, click (or Enter) to edit
//   Month -- an overview of load and kinds of time; a day opens its week
// Each coming day carries how heavy it looks for you (docs/algorithm.md 2.4).
const $=id=>document.getElementById(id);
const ROW=22, SLOT=30;                       // px per half hour, minutes per slot
// the week grid covers the whole day (the island's path keeps DAWN..NIGHT); it opens scrolled to the morning
const FROM=0, TO=24*60;
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go',waiting:'did it happen?'};
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const option=(value,text)=>el('option',{value,textContent:text});

// rate: {state(b), answer(b,value), done(blocks)} -- today's finished blocks ask "How draining was it?" in the Day list (life.js);
// done hears the blocks you just marked done (the firefly fairy asks about them)
export function createCalendar({plans,owner,clock,notice,sheets,live=null,rate=null}){
  const sheet=$('planner-sheet');
  // a coming day's heaviness, in words; past days have already happened
  const ahead=date=>{if(date<TODAY)return null;const f=dayReading(owner,date);return f.label==='usual'?null:f;};
  let tab='day', date=TODAY, editing=null;
  // earlier days are settled (plan.js isDone); today waits for Done or Let go
  const statusOn=b=>b.skipped?'skipped':isDone(b)?'done':b.date>TODAY?'planned':blockStatus(b,clock.minutes);
  const short=s=>{const d=fromIso(s);return `${DAYS[dow(s)-1]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`;};

  // ---- editor (shared by every view) -------------------------------------------
  for(const [k,c] of Object.entries(CATEGORIES))$('ed-cat').append(option(k,c.label));
  const edIcon=catImg('study','ed-cat-icon');$('ed-cat').before(edIcon);
  const showKind=()=>{edIcon.src=catImg($('ed-cat').value).src;};$('ed-cat').onchange=showKind;
  for(const m of [30,60,90,120,150,180,240])$('ed-mins').append(option(m,hours(m)));
  $('ed-vis').append(option('silhouette','Kind and size only'),option('open','Everything'),option('hidden','Nothing'));
  function edit(occ,defaults={}){
    editing=occ;
    const b=occ??{title:defaults.title??'',date:defaults.date??date,start:defaults.start??Math.min(TO-SLOT,Math.max(DAWN,Math.ceil(clock.minutes/SLOT)*SLOT)),
                  mins:defaults.mins??60,cat:defaults.cat??'study',vis:defaults.vis??'silhouette',priority:'normal',repeat:false};
    $('editor-title').textContent=occ?'Edit block':'New block';
    if(![...$('ed-mins').options].some(o=>+o.value===b.mins))$('ed-mins').append(option(b.mins,hours(b.mins)));
    $('ed-title').value=b.title;$('ed-date').value=b.date;$('ed-start').value=fmt(Math.min(b.start,TO-SLOT));
    $('ed-mins').value=b.mins;$('ed-cat').value=b.cat;showKind();$('ed-vis').value=b.vis;
    $('ed-repeat').checked=!!b.repeat;$('ed-low').checked=b.priority==='low';$('ed-delete').hidden=!occ;
    $('block-editor').showModal();$('ed-title').focus();
  }
  $('editor-form').onsubmit=e=>{
    e.preventDefault();const title=$('ed-title').value.trim();if(!title||!$('ed-date').value||!$('ed-start').value)return;
    const fields={title,date:$('ed-date').value,start:toMin($('ed-start').value),mins:+$('ed-mins').value,cat:$('ed-cat').value,
                  vis:$('ed-vis').value,priority:$('ed-low').checked?'low':'normal',repeat:$('ed-repeat').checked};
    if(editing)plans.update(owner,editing,fields);else plans.add(owner,fields);
    $('block-editor').close();notice(editing?`${title} updated.`:`${title} is on your plan.`);
  };
  $('ed-delete').onclick=()=>{if(editing){plans.remove(owner,editing);notice(`${editing.title} removed.`);}$('block-editor').close();};
  $('ed-cancel').onclick=()=>$('block-editor').close();
  $('cal-add').onclick=()=>edit(null);
  // Calendar sync. Signed in, Google Calendar is real: import, then an
  // optional toggle that sends your island blocks to a separate "Island Life"
  // calendar. Outlook, Apple and course calendars are coming later. In the
  // demo nothing leaves the page.
  const SYNC=[
    {id:'google',name:'Google Calendar',glyph:'G',color:'#4a7fd8',how:'Classes, shifts and deadlines come in by themselves'},
    {id:'outlook',name:'Outlook or Microsoft 365',glyph:'O',color:'#2f6fb5',soon:true},
    {id:'apple',name:'Apple iCloud Calendar',glyph:'A',color:'#55596a',soon:true},
    {id:'lms',name:'Canvas, Moodle or Blackboard',glyph:'C',color:'#c0613f',soon:true},
  ];
  let conn=live?.connection??null, demoOn=false;
  // Google shows an "unverified app" screen until its review is done: say so first, then go
  const viaWarning=go=>{$('gcal-warn-ok').onclick=()=>{$('gcal-warn').close();go();};$('gcal-warn').showModal();};
  $('gcal-warn-no').onclick=()=>$('gcal-warn').close();
  // No Google Calendar, or rather not connect one: a typical student week goes on this week's plan, saved like
  // any plan (so the island moves with it), each block tagged "sample:" so one press takes them all off again.
  const SAMPLE=[   // [day 0 = Monday, start, minutes, kind, title, 'low' = can wait]
    [0,'09:00',120,'study','MA1521 Lecture'],[0,'14:00',60,'study','CS2040 Tutorial'],[0,'18:00',60,'exercise','Gym'],
    [1,'10:00',120,'study','Physics lab'],[1,'17:00',240,'work','Shift at the café'],
    [2,'09:00',120,'study','MA1521 Lecture'],[2,'13:00',90,'study','Group project meeting'],[2,'19:00',120,'social','Dinner with friends'],
    [3,'11:00',60,'errands','Dentist'],[3,'14:00',120,'study','Library: revise','low'],[3,'17:00',240,'work','Shift at the café'],
    [4,'09:00',120,'study','CS2040 Midterm'],[4,'16:00',60,'exercise','Badminton'],
    [5,'10:00',60,'errands','Groceries and laundry','low'],[5,'15:00',120,'social','Movie with roommates'],
    [6,'10:00',60,'social','Call home'],[6,'20:00',90,'rest','Slow evening'],
  ];
  const isSample=b=>String(b.externalId??'').startsWith('sample:');
  const sampleBlocks=()=>plans.all(owner).filter(isSample);
  function addSampleWeek(){
    const monday=mondayOf(TODAY);
    SAMPLE.forEach(([d,start,mins,cat,title,priority='normal'],i)=>plans.add(owner,{date:addDays(monday,d),start:toMin(start),mins,cat,title,priority,
      externalId:`sample:${monday}:${i}`}));
    renderSync();
    notice('A sample week is on your plan. Remove it any time from Sync calendars.');
  }
  function removeSampleWeek(){
    for(const b of sampleBlocks())plans.remove(owner,b);
    renderSync();
    notice('The sample week is off your plan.');
  }
  const ago=t=>{if(!t)return 'not synced yet';const m=Math.round((Date.now()-Date.parse(t))/60000);
    return m<2?'synced just now':m<60?`synced ${m} min ago`:m<1440?`synced ${Math.round(m/60)} h ago`:`synced ${Math.round(m/1440)} d ago`;};
  // Sync now: the dialog's link and the planner's own button (beside Sync calendars) do the same thing
  let syncing=false;
  async function syncNow(){
    if(syncing||!live)return;syncing=true;
    const b=$('cal-sync-now');b.disabled=true;b.classList.add('busy');$('cal-sync-now-label').textContent='Syncing…';
    try{await google.sync();conn=await google.connection();await reloadImported();notice('Google Calendar synced.');}
    catch{notice('Sync didn’t finish. Try again in a moment.');}
    syncing=false;b.disabled=false;b.classList.remove('busy');$('cal-sync-now-label').textContent='Sync now';
    renderSync();render();
  }
  async function reloadImported(){
    if(!live)return;
    plans.load(owner,await google.reloadMine(live.uid));forget(owner);
    plans.touch(owner);   // path, trees and altitude follow
  }
  function renderSync(){
    const connected=live?!!conn:demoOn;
    $('sync-demo').hidden=!!live;
    $('sync-list').replaceChildren(...SYNC.map(s=>{
      if(s.soon)return el('li',{className:'soon'},
        el('span',{className:'sync-glyph',style:`--c:${s.color}`,textContent:s.glyph,ariaHidden:'true'}),
        el('span',{className:'sync-what'},el('strong',{textContent:s.name}),el('span',{textContent:'Coming in a later version'})),
        el('span',{className:'sync-soon',textContent:'Coming soon'}));
      const status=!connected?s.how
        :live?(conn.status==='needs_reconnect'?'Google asked us to reconnect':`${conn.account_email??'Connected'} · ${ago(conn.last_synced_at)}`)
        :'Connected · synced just now';
      const btn=el('button',{type:'button',className:connected?'text-button':'solid-small',textContent:connected?'Disconnect':'Connect'});
      const kids=[el('strong',{textContent:s.name}),el('span',{textContent:status})];
      // under Google, signed in only (the demo already has a week): the sample week, or taking it off again
      const has=live&&sampleBlocks().length>0;
      if(live&&s.id==='google'&&(has||!connected)){
        const b=el('button',{type:'button',className:'text-button',textContent:has?'Remove it':'Try a sample week'});
        b.onclick=has?removeSampleWeek:addSampleWeek;
        kids.push(el('small',{className:'sync-sample'},has?'A sample week is on your plan. ':'No Google Calendar? ',b));
      }
      const row=el('li',{className:connected?'on':''},el('span',{className:'sync-glyph',style:`--c:${s.color}`,textContent:s.glyph,ariaHidden:'true'}),
        el('span',{className:'sync-what'},...kids),btn);
      if(connected&&live){
        if(conn.status==='needs_reconnect'){btn.textContent='Reconnect';btn.className='solid-small';btn.onclick=()=>viaWarning(()=>google.connect(conn.write_enabled));return row;}
        const two=el('input',{type:'checkbox',checked:conn.write_enabled});
        const label=el('label',{className:'check sync-two'},two,' Also send my Island Life plans to Google');
        const note=el('small',{className:'sync-note',textContent:'They go into a separate “Island Life” calendar. Your own calendars are never changed.'});
        const now=el('button',{type:'button',className:'text-button',textContent:'Sync now'});
        kids.push(label,note,now);
        two.onchange=async()=>{
          two.disabled=true;
          try{const r=await google.setWrite(two.checked);if(r===null)return;conn={...conn,write_enabled:two.checked};
            notice(two.checked?'Your plans now appear in an “Island Life” calendar on Google.':'Island Life stopped sending plans to Google.');}
          catch(e){two.checked=!two.checked;notice('That didn’t work. Try again in a moment.');}
          two.disabled=false;
        };
        now.onclick=()=>{now.disabled=true;now.textContent='Syncing…';syncNow();};
        row.querySelector('.sync-what').replaceChildren(...kids);
      }
      btn.onclick=async()=>{
        if(!live){
          if(connected){demoOn=false;renderSync();notice(`${s.name} disconnected.`);return;}
          btn.disabled=true;btn.textContent='Connecting…';
          setTimeout(()=>{demoOn=true;renderSync();notice(`${s.name} connected. In the full app its events arrive as blocks.`);},900);
          return;
        }
        if(!connected){
          viaWarning(async()=>{btn.disabled=true;btn.textContent='Opening Google…';
            try{await google.connect(false);}catch{btn.disabled=false;btn.textContent='Connect';notice('Google couldn’t be reached. Try again in a moment.');}});
          return;
        }
        btn.disabled=true;btn.textContent='Disconnecting…';
        try{await google.disconnect();conn=null;await reloadImported();notice('Google Calendar disconnected. Imported plans from today on were removed.');}
        catch{notice('That didn’t work. Try again in a moment.');}
        renderSync();
      };
      return row;
    }));
    const on=live?!!conn:demoOn;
    $('cal-sync-label').textContent=on?'Synced · Google Calendar':'Sync calendars';
    $('cal-sync').classList.toggle('on',on);
    $('cal-sync-now').hidden=!(live&&conn&&conn.status!=='needs_reconnect');
  }
  $('cal-sync').onclick=()=>{renderSync();$('sync-dialog').showModal();};
  $('cal-sync-now').onclick=syncNow;
  $('sync-done').onclick=()=>$('sync-dialog').close();
  renderSync();
  // back from Google's consent screen (life.js reads ?calendar=)
  async function openSync(result){
    if(live)conn=await google.connection().catch(()=>conn);
    if(result==='connected')await reloadImported();
    renderSync();$('sync-dialog').showModal();
    notice(result==='connected'?'Google Calendar connected. Your classes and plans are on your island.'
          :result==='cancelled'?'Google Calendar wasn’t connected.':'Something went wrong connecting Google Calendar. Try again.');
  }

  // ---- Day -------------------------------------------------------------------------
  const DRAIN={light:'Light',okay:'Okay',draining:'Draining'};
  function renderDay(){
    const list=$('plan-list'), blocks=plans.on(owner,date);list.replaceChildren();
    if(!blocks.length)list.append(el('li',{className:'plan-empty',textContent:'Nothing planned. A quiet day.'}));
    for(const b of blocks){
      const st=statusOn(b);
      const open=el('button',{type:'button',className:'plan-open'},
        el('span',{className:'plan-when',textContent:`${fmt(b.start)}–${fmt(b.start+b.mins)}`}),
        el('span',{className:'plan-what'},el('strong',{textContent:b.title}),
          el('span',{},catImg(b.cat),`${CATEGORIES[b.cat].label} · ${hours(b.mins)} · ${STATUS[st]}${b.repeat?' · weekly':''}${b.priority==='low'?' · can wait':''}`)));
      open.onclick=()=>edit(b);
      const li=el('li',{className:`plan-item ${st}`},open);li.style.setProperty('--cat',CATEGORIES[b.cat].color);
      // every block can be answered: Done grows its tree, Let go lets it drift away
      const acts=el('span',{className:'plan-acts'});
      const act=(label,fn,cls='text-button')=>{const x=el('button',{type:'button',className:cls,textContent:label});x.onclick=fn;acts.append(x);return x;};
      if(st==='done'&&b.done)act('Undo',()=>plans.unmarkDone(owner,b));
      else if(st==='done')act('Didn’t happen',async()=>{if(await confirmLetGo(b.title))plans.toggleSkip(owner,b);});   // a settled earlier day
      else if(st==='skipped')act('Bring back',()=>plans.toggleSkip(owner,b));
      else{
        // Done only once it has happened; upcoming blocks can still be let go
        const d=act('Done',()=>{plans.markDone(owner,b);rate?.done?.([b]);},'plan-done');
        if(st!=='waiting'){d.disabled=true;d.title='You can mark it done once it has happened';}
        act('Let go',async()=>{if(await confirmLetGo(b.title))plans.toggleSkip(owner,b);});
      }
      li.append(acts);
      // "How draining was it?": today's blocks you've pressed Done on, one tap each (light, okay, draining); then the word you picked
      const felt=date===TODAY&&rate?rate.state(b):undefined;
      if(felt!==undefined){
        const row=el('div',{className:'plan-rate'},el('span',{className:'plan-rate-q',textContent:felt?'Felt':'How draining was it?'}));
        if(felt)row.append(el('span',{className:'ask-done',textContent:DRAIN[felt]}));
        else for(const [v,label] of Object.entries(DRAIN)){const x=el('button',{type:'button',className:'ask-pick',textContent:label});x.onclick=()=>rate.answer(b,v);row.append(x);}
        li.append(row);
      }
      list.append(li);
    }
    // today's blocks whose time has passed wait for an answer; one tap answers them all
    const waiting=blocks.filter(b=>statusOn(b)==='waiting');
    $('mark-all').hidden=!waiting.length;$('mark-all').textContent=`Mark all as done (${waiting.length})`;
    $('mark-all').onclick=()=>{for(const b of waiting)plans.markDone(owner,b);rate?.done?.(waiting);notice(`${waiting.length} block${waiting.length===1?'':'s'} took root.`);};
  }

  // ---- Week ------------------------------------------------------------------------
  const grid=$('week-grid'), slots=(TO-FROM)/SLOT;
  grid.style.setProperty('--rows',slots);grid.style.setProperty('--row',`${ROW}px`);
  function lanes(blocks){                      // overlapping blocks sit side by side
    const ends=[];
    const placed=blocks.map(b=>{let l=ends.findIndex(e=>e<=b.start);if(l<0){l=ends.length;ends.push(0);}ends[l]=b.start+b.mins;return {b,lane:l};});
    return placed.map(p=>({...p,of:Math.max(1,ends.length)}));
  }
  function card(b,lane,of){
    const st=statusOn(b), c=el('button',{type:'button',className:`wk-block ${st}${b.mins<=SLOT?' short':''}`});
    c.style.cssText=`--cat:${CATEGORIES[b.cat].color};top:${(b.start-FROM)/SLOT*ROW}px;height:${Math.max(ROW,Math.min(b.mins,TO-b.start)/SLOT*ROW)-2}px;`+
                    `left:calc(${lane/of*100}% + 2px);width:calc(${100/of}% - 4px)`;
    c.append(el('strong',{},catImg(b.cat),b.title),el('span',{textContent:`${fmt(b.start)}–${fmt(b.start+b.mins)}${b.repeat?' · weekly':''}`}));
    const grip=el('i',{className:'grip'});grip.setAttribute('aria-hidden','true');c.append(grip);
    c.setAttribute('aria-label',`${b.title}, ${DAYS[dow(b.date)-1]} ${fmt(b.start)} to ${fmt(b.start+b.mins)}, ${CATEGORIES[b.cat].label}, ${STATUS[st]}`);
    c.occ=b;return c;
  }
  // A phone: the blocks are too narrow for words (style.css shows their colour only) and a finger scrolls the
  // day, so a tap on a block opens its details here, under it (over it near the end of the day), with Edit.
  // A tap anywhere else, or on the same block, closes them; they stay open through the clock's redraws.
  const weekNote=$('pane-week').querySelector('.panel-note'), dragNote=weekNote.textContent;
  let peeked=null;                             // the id of the block whose details show
  function peek(c,{focus=null,scroll=false}={}){
    grid.querySelector('.wk-peek')?.remove();grid.querySelector('.wk-block.picked')?.classList.remove('picked');
    peeked=c?c.occ.id:null;if(!c)return;
    const b=c.occ, st=statusOn(b);
    const open=el('button',{type:'button',className:'solid-small',textContent:'Edit'});open.onclick=()=>{peek(null);edit(b);};
    const shut=el('button',{type:'button',className:'wk-peek-close',textContent:'×',ariaLabel:'Close the details'});
    shut.onclick=()=>{peek(null);c.focus({preventScroll:true});};
    const box=el('div',{className:'wk-peek',tabIndex:-1},el('strong',{},catImg(b.cat),b.title),shut,
      el('span',{textContent:`${short(b.date)} · ${fmt(b.start)}–${fmt(b.start+b.mins)}`}),open,
      el('span',{textContent:[CATEGORIES[b.cat].label,hours(b.mins),STATUS[st],b.repeat&&'weekly',b.priority==='low'&&'can wait'].filter(Boolean).join(' · ')}));
    box.style.setProperty('--cat',CATEGORIES[b.cat].color);box.setAttribute('role','dialog');box.setAttribute('aria-label',b.title);
    c.classList.add('picked');grid.append(box);
    const h=box.offsetHeight, below=c.offsetTop+c.offsetHeight+6;
    box.style.top=`${below+h<=slots*ROW?below:Math.max(0,c.offsetTop-6-h)}px`;
    if(scroll){                                // into the grid's view, clear of the pinned day names
      const head=grid.querySelector('.wk-day').offsetHeight, y=box.offsetTop;
      const to=y-head-8<grid.scrollTop?y-head-8:y+h+8>grid.scrollTop+grid.clientHeight?y+h+8-grid.clientHeight:null;
      if(to!==null)grid.scrollTo({top:to,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    if(focus)(focus==='edit'?open:box).focus({preventScroll:true});
  }
  document.addEventListener('click',e=>{if(peeked!==null&&!grid.contains(e.target))peek(null);});
  // opening the week (or moving to another one) scrolls the day to the morning, or to an earlier block that week
  let toMorning=true;
  function scrollToMorning(){
    if(!toMorning)return;toMorning=false;
    const first=Math.min(DAWN,...plans.week(owner,date).filter(b=>!b.skipped).map(b=>Math.floor((b.start-30)/60)*60));
    grid.scrollTop=Math.max(0,(first-FROM)/SLOT*ROW-12);   // a little above, so that hour's label shows
  }
  function renderWeek(){
    grid.replaceChildren(el('div',{className:'wk-corner'}));
    const monday=mondayOf(date);
    for(let d=0;d<7;d++){
      const day=addDays(monday,d);
      const f=ahead(day), head=el('div',{className:`wk-day${day===TODAY?' today':''}${f?` fc-${f.label.replace(' ','-')}`:''}`},
        el('span',{textContent:DAYS[d]}),el('strong',{textContent:String(fromIso(day).getDate())}));
      if(f){head.append(el('small',{className:'wk-forecast',textContent:FORECAST_WORDS[f.label]}));head.title=`${FORECAST_WORDS[f.label]}: the island’s forecast from your plan`;}
      grid.append(head);
    }
    const gutter=el('div',{className:'wk-gutter'});
    for(let m=FROM+60;m<TO;m+=60)gutter.append(el('span',{textContent:fmt(m),style:`top:${(m-FROM)/SLOT*ROW}px`}));
    grid.append(gutter);
    for(let d=0;d<7;d++){
      const day=addDays(monday,d), col=el('div',{className:`wk-col${day===TODAY?' today':''}`});col.dataset.date=day;
      for(const {b,lane,of} of lanes(plans.on(owner,day)))col.append(card(b,lane,of));
      if(day===TODAY&&clock.minutes>FROM&&clock.minutes<TO)col.append(el('div',{className:'wk-now',style:`top:${(clock.minutes-FROM)/SLOT*ROW}px`}));
      grid.append(col);
    }
    const phone=onPhone();
    weekNote.textContent=phone?'Tap empty time to add a block, or tap a block to see it.':dragNote;
    if(peeked!==null)peek(phone?[...grid.querySelectorAll('.wk-block')].find(c=>c.occ.id===peeked):null);
  }
  const clampSlot=s=>Math.max(0,Math.min(slots-1,s));
  let drag=null;
  grid.addEventListener('pointerdown',e=>{
    if(onPhone())return;                       // a phone drags nothing: a finger scrolls, a tap is a click (below)
    const col=e.target.closest('.wk-col');if(e.button!==0||!col)return;
    const c=e.target.closest('.wk-block'), top=col.getBoundingClientRect().top;
    drag=c?{kind:e.target.classList.contains('grip')?'resize':'move',card:c,occ:c.occ,h0:c.offsetHeight}
          :{kind:'create',col,s0:clampSlot(Math.floor((e.clientY-top)/ROW))};
    Object.assign(drag,{x0:e.clientX,y0:e.clientY,moved:false});drag.s1=drag.s0;
    grid.setPointerCapture(e.pointerId);e.preventDefault();
  });
  grid.addEventListener('pointermove',e=>{
    if(!drag)return;const dx=e.clientX-drag.x0, dy=e.clientY-drag.y0;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;drag.moved=true;
    if(drag.kind==='create'){
      drag.s1=clampSlot(Math.floor((e.clientY-drag.col.getBoundingClientRect().top)/ROW));
      const a=Math.min(drag.s0,drag.s1), b=Math.max(drag.s0,drag.s1);
      drag.ghost??=drag.col.appendChild(el('div',{className:'wk-ghost'}));
      drag.ghost.style.top=`${a*ROW}px`;drag.ghost.style.height=`${(b-a+1)*ROW-2}px`;
    }else if(drag.kind==='move'){drag.card.classList.add('dragging');drag.card.style.translate=`${dx}px ${Math.round(dy/ROW)*ROW}px`;}
    else drag.card.style.height=`${Math.max(ROW,Math.round((drag.h0+2+dy)/ROW)*ROW)-2}px`;
  });
  grid.addEventListener('pointerup',e=>{
    const d=drag;drag=null;if(!d)return;
    if(d.kind==='create'){
      d.ghost?.remove();const a=Math.min(d.s0,d.s1), b=Math.max(d.s0,d.s1);
      return edit(null,{date:d.col.dataset.date,start:FROM+a*SLOT,mins:d.moved?Math.min((b-a+1)*SLOT,TO-FROM-a*SLOT):60});
    }
    if(!d.moved)return edit(d.occ);
    if(d.kind==='move'){
      const target=document.elementsFromPoint(e.clientX,e.clientY).find(n=>n.classList?.contains('wk-col'));
      const start=Math.max(FROM,Math.min(TO-d.occ.mins,d.occ.start+Math.round((e.clientY-d.y0)/ROW)*SLOT));
      plans.update(owner,d.occ,{start,date:target?.dataset.date??d.occ.date});
    }else plans.update(owner,d.occ,{mins:Math.min(TO-d.occ.start,Math.max(SLOT,Math.round((d.h0+2+e.clientY-d.y0)/ROW)*SLOT))});
  });
  // (a phone's swipe cancels its pointer as the scroll begins: nothing was dragged, so nothing to redraw)
  grid.addEventListener('pointercancel',()=>{if(!drag&&onPhone())return;drag?.ghost?.remove();drag=null;render();});
  // keyboard: Enter/Space on a block fires a click with detail 0
  grid.addEventListener('click',e=>{
    const c=e.target.closest('.wk-block');
    if(onPhone()){
      // a phone: a block shows (or hides) its details; empty time closes them, or else adds an hour's block at that half hour
      if(e.target.closest('.wk-peek'))return;
      if(c)return peek(c.occ.id===peeked?null:c,{focus:e.detail===0?'edit':'box',scroll:true});
      const col=e.target.closest('.wk-col');
      if(peeked!==null)return peek(null);
      if(!col)return;
      const r=col.getBoundingClientRect(), s=clampSlot(Math.floor((e.clientY-r.top)/(r.height/slots)));
      return edit(null,{date:col.dataset.date,start:FROM+s*SLOT,mins:60});
    }
    if(c&&e.detail===0)edit(c.occ);
  });

  // ---- Month -----------------------------------------------------------------------
  function renderMonth(){
    const box=$('month-grid'), d=fromIso(date), month=d.getMonth();
    const start=mondayOf(iso(new Date(d.getFullYear(),month,1)));
    box.replaceChildren(...DAYS.map(n=>el('div',{className:'mo-head',textContent:n})));
    for(let i=0;i<42;i++){
      const day=addDays(start,i), blocks=plans.on(owner,day).filter(b=>!b.skipped), h=plans.hours(blocks);
      const cats=[...new Set(blocks.map(b=>b.cat))];
      const cell=el('button',{type:'button',className:`mo-day${fromIso(day).getMonth()!==month?' other':''}${day===TODAY?' today':''}`},
        el('span',{className:'mo-num',textContent:String(fromIso(day).getDate())}),
        el('span',{className:'mo-bar'},el('i',{style:`width:${Math.min(100,h/8*100)}%`})),
        el('span',{className:'mo-dots'},...cats.map(c=>el('i',{style:`background:${CATEGORIES[c].color}`}))));
      cell.setAttribute('aria-label',`${short(day)}: ${h?`${hours(h*60)} planned`:'nothing planned'}`);
      cell.onclick=()=>{date=day;tab='week';toMorning=true;render();};
      box.append(cell);
    }
  }

  // ---- chrome ----------------------------------------------------------------------
  function step(n){
    if(tab==='day')date=addDays(date,n);
    else if(tab==='week'){date=addDays(date,7*n);toMorning=true;}
    else{const d=fromIso(date);date=iso(new Date(d.getFullYear(),d.getMonth()+n,1));}
    render();
  }
  $('cal-prev').onclick=()=>step(-1);$('cal-next').onclick=()=>step(1);$('cal-today').onclick=()=>{date=TODAY;toMorning=true;render();};
  for(const t of sheet.querySelectorAll('[role=tab]'))t.onclick=()=>{if(t.dataset.tab==='week'&&tab!=='week')toMorning=true;tab=t.dataset.tab;render();};
  function render(){
    if(sheet.hidden)return;
    for(const t of sheet.querySelectorAll('[role=tab]'))t.setAttribute('aria-selected',String(t.dataset.tab===tab));
    for(const p of ['day','week','month'])$(`pane-${p}`).hidden=p!==tab;
    const d=fromIso(date), mon=mondayOf(date), sun=fromIso(addDays(mon,6));
    $('cal-range').textContent=tab==='day'?short(date):tab==='week'?`${fromIso(mon).getDate()} ${MONTHS[fromIso(mon).getMonth()].slice(0,3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0,3)}`:`${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const w=weekReading(owner,date), f=tab==='day'?ahead(date):null;
    const meter=el('span',{className:'fullness'},el('i',{style:`width:${Math.min(100,w.sink*100)}%`}));meter.setAttribute('aria-hidden','true');
    $('plan-load').replaceChildren(el('span',{textContent:`${mondayOf(date)===mondayOf(TODAY)?'This week':'That week'} is ${fullness(w.sink)}`}),meter,
      ...(f?[el('span',{className:`plan-forecast fc-${f.label.replace(' ','-')}`,textContent:`${date===TODAY?'Today':'This day'}: ${FORECAST_WORDS[f.label].toLowerCase()}`})]:[]));
    if(tab==='day')renderDay();else if(tab==='week'){renderWeek();scrollToMorning();}else renderMonth();
  }
  return {
    open(which){if(which)tab=which;toMorning=true;sheets.show(sheet,$('planner-toggle'));render();},
    edit,
    render,
    openSync,
  };
}
