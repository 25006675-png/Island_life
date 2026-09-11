import { CATEGORIES, CAPACITY, DAWN, NIGHT, fmt, hours, toMin, fullness, catImg } from './data.js';
import { TODAY, iso, fromIso, addDays, dow, mondayOf } from './plan.js';
import { blockStatus } from './timetable.js';
import { confirmLetGo } from './confirm.js';

// The planner sheet -- the conventional input side of the app.
//   Day   -- one day's list; today's is the plan the island draws as its path
//   Week  -- drag on empty time to add, drag a block to move it, drag its
//            lower edge to resize, click (or Enter) to edit
//   Month -- an overview of load and kinds of time; a day opens its week
const $=id=>document.getElementById(id);
const ROW=22, SLOT=30;                       // px per half hour, minutes per slot
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go',waiting:'did it happen?'};
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const option=(value,text)=>el('option',{value,textContent:text});

export function createCalendar({plans,owner,clock,notice,sheets}){
  const sheet=$('planner-sheet'), cap=CAPACITY[owner];
  let tab='day', date=TODAY, editing=null;
  // weeks before this one are settled history; this week waits for Done or Let go
  const statusOn=b=>b.skipped?'skipped':b.done||b.date<mondayOf(TODAY)?'done':b.date<TODAY?'waiting':b.date>TODAY?'planned':blockStatus(b,clock.minutes);
  const short=s=>{const d=fromIso(s);return `${DAYS[dow(s)-1]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`;};

  // ---- editor (shared by every view) -------------------------------------------
  for(const [k,c] of Object.entries(CATEGORIES))$('ed-cat').append(option(k,c.label));
  const edIcon=catImg('study','ed-cat-icon');$('ed-cat').before(edIcon);
  const showKind=()=>{edIcon.src=catImg($('ed-cat').value).src;};$('ed-cat').onchange=showKind;
  for(const m of [30,60,90,120,150,180,240])$('ed-mins').append(option(m,hours(m)));
  $('ed-vis').append(option('silhouette','Kind and size only'),option('open','Everything'),option('hidden','Nothing'));
  function edit(occ,defaults={}){
    editing=occ;
    const b=occ??{title:'',date:defaults.date??date,start:defaults.start??Math.max(DAWN,Math.ceil(clock.minutes/SLOT)*SLOT),
                  mins:defaults.mins??60,cat:'study',vis:'silhouette',priority:'normal',repeat:false};
    $('editor-title').textContent=occ?'Edit block':'New block';
    if(![...$('ed-mins').options].some(o=>+o.value===b.mins))$('ed-mins').append(option(b.mins,hours(b.mins)));
    $('ed-title').value=b.title;$('ed-date').value=b.date;$('ed-start').value=fmt(Math.min(b.start,NIGHT-SLOT));
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
  // Calendar sync -- demo only: the connect flow is real-looking, but nothing
  // leaves the page. (Planned: Google Calendar API, Microsoft Graph, CalDAV, ICS.)
  const SYNC=[
    {id:'google',name:'Google Calendar',glyph:'G',color:'#4a7fd8',how:'Two-way: classes come in, your blocks go out'},
    {id:'outlook',name:'Outlook or Microsoft 365',glyph:'O',color:'#2f6fb5',how:'Two-way, with your uni account'},
    {id:'apple',name:'Apple iCloud Calendar',glyph:'A',color:'#55596a',how:'Your iPhone and Mac calendars'},
    {id:'lms',name:'Canvas, Moodle or Blackboard',glyph:'C',color:'#c0613f',how:'Deadlines from your course calendar link',
     link:'https://canvas.your-uni.edu/feeds/calendars/…ics'},
  ];
  const synced=new Set();
  function renderSync(){
    $('sync-list').replaceChildren(...SYNC.map(s=>{
      const on=synced.has(s.id), link=s.link&&!on?el('input',{type:'url',placeholder:s.link,ariaLabel:`${s.name} calendar link`}):null;
      const btn=el('button',{type:'button',className:on?'text-button':'solid-small',textContent:on?'Disconnect':'Connect'});
      btn.onclick=()=>{
        if(on){synced.delete(s.id);renderSync();notice(`${s.name} disconnected.`);return;}
        if(link&&!link.value.trim()){link.focus();notice('Paste your course calendar link first.');return;}
        btn.disabled=true;btn.textContent='Connecting…';
        setTimeout(()=>{synced.add(s.id);renderSync();notice(`${s.name} connected. In the full app its events arrive as blocks.`);},900);
      };
      return el('li',{className:on?'on':''},
        el('span',{className:'sync-glyph',style:`--c:${s.color}`,textContent:s.glyph,ariaHidden:'true'}),
        el('span',{className:'sync-what'},el('strong',{textContent:s.name}),el('span',{textContent:on?'Connected · synced just now':s.how}),...(link?[link]:[])),
        btn);
    }));
    const n=synced.size;
    $('cal-sync-label').textContent=n?`Synced · ${n} calendar${n===1?'':'s'}`:'Sync calendars';
    $('cal-sync').classList.toggle('on',n>0);
  }
  $('cal-sync').onclick=()=>{renderSync();$('sync-dialog').showModal();};
  $('sync-done').onclick=()=>$('sync-dialog').close();

  // ---- Day -------------------------------------------------------------------------
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
      if(st==='done')act('Undo',()=>plans.unmarkDone(owner,b));
      else if(st==='skipped')act('Bring back',()=>plans.toggleSkip(owner,b));
      else{
        // Done only once it has happened; upcoming blocks can still be let go
        const d=act('Done',()=>plans.markDone(owner,b),'plan-done');
        if(st!=='waiting'){d.disabled=true;d.title='You can mark it done once it has happened';}
        act('Let go',async()=>{if(await confirmLetGo(b.title))plans.toggleSkip(owner,b);});
      }
      li.append(acts);list.append(li);
    }
    // blocks whose time has passed wait for an answer; one tap answers them all
    const waiting=blocks.filter(b=>statusOn(b)==='waiting');
    $('mark-all').hidden=!waiting.length;$('mark-all').textContent=`Mark all as done (${waiting.length})`;
    $('mark-all').onclick=()=>{for(const b of waiting)plans.markDone(owner,b);notice(`${waiting.length} block${waiting.length===1?'':'s'} took root.`);};
  }

  // ---- Week ------------------------------------------------------------------------
  const grid=$('week-grid'), slots=(NIGHT-DAWN)/SLOT;
  grid.style.setProperty('--rows',slots);grid.style.setProperty('--row',`${ROW}px`);
  function lanes(blocks){                      // overlapping blocks sit side by side
    const ends=[];
    const placed=blocks.map(b=>{let l=ends.findIndex(e=>e<=b.start);if(l<0){l=ends.length;ends.push(0);}ends[l]=b.start+b.mins;return {b,lane:l};});
    return placed.map(p=>({...p,of:Math.max(1,ends.length)}));
  }
  function card(b,lane,of){
    const st=statusOn(b), c=el('button',{type:'button',className:`wk-block ${st}${b.mins<=SLOT?' short':''}`});
    c.style.cssText=`--cat:${CATEGORIES[b.cat].color};top:${(b.start-DAWN)/SLOT*ROW}px;height:${Math.max(ROW,b.mins/SLOT*ROW)-2}px;`+
                    `left:calc(${lane/of*100}% + 2px);width:calc(${100/of}% - 4px)`;
    c.append(el('strong',{},catImg(b.cat),b.title),el('span',{textContent:`${fmt(b.start)}–${fmt(b.start+b.mins)}${b.repeat?' · weekly':''}`}));
    const grip=el('i',{className:'grip'});grip.setAttribute('aria-hidden','true');c.append(grip);
    c.setAttribute('aria-label',`${b.title}, ${DAYS[dow(b.date)-1]} ${fmt(b.start)} to ${fmt(b.start+b.mins)}, ${CATEGORIES[b.cat].label}, ${STATUS[st]}`);
    c.occ=b;return c;
  }
  function renderWeek(){
    grid.replaceChildren(el('div',{className:'wk-corner'}));
    const monday=mondayOf(date);
    for(let d=0;d<7;d++){
      const day=addDays(monday,d);
      grid.append(el('div',{className:`wk-day${day===TODAY?' today':''}`},el('span',{textContent:DAYS[d]}),el('strong',{textContent:String(fromIso(day).getDate())})));
    }
    const gutter=el('div',{className:'wk-gutter'});
    for(let m=DAWN;m<NIGHT;m+=60)gutter.append(el('span',{textContent:fmt(m),style:`top:${(m-DAWN)/SLOT*ROW}px`}));
    grid.append(gutter);
    for(let d=0;d<7;d++){
      const day=addDays(monday,d), col=el('div',{className:`wk-col${day===TODAY?' today':''}`});col.dataset.date=day;
      for(const {b,lane,of} of lanes(plans.on(owner,day)))col.append(card(b,lane,of));
      if(day===TODAY&&clock.minutes>DAWN&&clock.minutes<NIGHT)col.append(el('div',{className:'wk-now',style:`top:${(clock.minutes-DAWN)/SLOT*ROW}px`}));
      grid.append(col);
    }
  }
  const clampSlot=s=>Math.max(0,Math.min(slots-1,s));
  let drag=null;
  grid.addEventListener('pointerdown',e=>{
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
      return edit(null,{date:d.col.dataset.date,start:DAWN+a*SLOT,mins:d.moved?(b-a+1)*SLOT:60});
    }
    if(!d.moved)return edit(d.occ);
    if(d.kind==='move'){
      const target=document.elementsFromPoint(e.clientX,e.clientY).find(n=>n.classList?.contains('wk-col'));
      const start=Math.max(DAWN,Math.min(NIGHT-d.occ.mins,d.occ.start+Math.round((e.clientY-d.y0)/ROW)*SLOT));
      plans.update(owner,d.occ,{start,date:target?.dataset.date??d.occ.date});
    }else plans.update(owner,d.occ,{mins:Math.max(SLOT,Math.round((d.h0+2+e.clientY-d.y0)/ROW)*SLOT)});
  });
  grid.addEventListener('pointercancel',()=>{drag?.ghost?.remove();drag=null;render();});
  // keyboard: Enter/Space on a block fires a click with detail 0
  grid.addEventListener('click',e=>{const c=e.target.closest('.wk-block');if(c&&e.detail===0)edit(c.occ);});

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
      cell.onclick=()=>{date=day;tab='week';render();};
      box.append(cell);
    }
  }

  // ---- chrome ----------------------------------------------------------------------
  function step(n){
    if(tab==='day')date=addDays(date,n);
    else if(tab==='week')date=addDays(date,7*n);
    else{const d=fromIso(date);date=iso(new Date(d.getFullYear(),d.getMonth()+n,1));}
    render();
  }
  $('cal-prev').onclick=()=>step(-1);$('cal-next').onclick=()=>step(1);$('cal-today').onclick=()=>{date=TODAY;render();};
  for(const t of sheet.querySelectorAll('[role=tab]'))t.onclick=()=>{tab=t.dataset.tab;render();};
  function render(){
    if(sheet.hidden)return;
    for(const t of sheet.querySelectorAll('[role=tab]'))t.setAttribute('aria-selected',String(t.dataset.tab===tab));
    for(const p of ['day','week','month'])$(`pane-${p}`).hidden=p!==tab;
    const d=fromIso(date), mon=mondayOf(date), sun=fromIso(addDays(mon,6));
    $('cal-range').textContent=tab==='day'?short(date):tab==='week'?`${fromIso(mon).getDate()} ${MONTHS[fromIso(mon).getMonth()].slice(0,3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0,3)}`:`${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const h=plans.hours(plans.week(owner,date));
    const meter=el('span',{className:'fullness'},el('i',{style:`width:${Math.min(100,h/cap*100)}%`}));meter.setAttribute('aria-hidden','true');
    $('plan-load').replaceChildren(el('span',{textContent:`That week is ${fullness(h/cap)}`}),meter);
    if(tab==='day')renderDay();else if(tab==='week')renderWeek();else renderMonth();
  }
  return {
    open(which){if(which)tab=which;sheets.show(sheet,$('planner-toggle'));render();},
    render,
  };
}
