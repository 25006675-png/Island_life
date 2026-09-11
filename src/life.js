import * as T from 'three';
import { ME, DAWN, NIGHT, CATEGORIES, MOODS, CHECKINS, CAPACITY, WARMTH, NOTES, NOTE_PRESETS, TASKS, fmt, hours, toMin,
         deriveStrain, weatherLabel, loadFromAltitude, altitudeFromLoad } from './data.js';
import { plans, TODAY, addDays, dow, mondayOf } from './plan.js';
import { confirmLetGo } from './confirm.js';
import { createTimetable, blockStatus, ARCH } from './timetable.js';
import { createMood } from './mood.js';
import { createPhotoLake, loadSquare } from './photos.js';
import { createSheets } from './sheets.js';
import { createCalendar } from './calendar.js';
import { createBalance } from './balance.js';
import { createGoalsBoard, createWindmill, createGateSign } from './decor.js';
import { createShop } from './shop.js';
import { createBuddy } from './buddy.js';

// Everything PRODUCT.md asks the world to *mean*: the timetable path and wisp,
// emotion lanterns, weather and altitude from the plan, the shared photo
// lake, proximity reveal, and the planner and balance sheets. main.js calls
// initLife() once the islands exist, then life.update() every frame.
const $=id=>document.getElementById(id);
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go',waiting:'did it happen?'};
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};

// Weather is one strain value (0..1); the label is only a name for where it sits.
export const setStrain=(island,s)=>{island.strain=s;island.weather=weatherLabel(s);island.weatherFx.setStrain(s);};

export function initLife({islands,camera,texture,player,notice,visit,nearTree,getMode,getSelected,setAltitude,setGlow}){
  const me=islands.find(i=>i.id===ME), members=islands.filter(i=>i.owner), community=islands.find(i=>!i.owner);
  // Real time by default; outside the day the path would be empty, so start the demo mid-afternoon.
  const clock={live:true,minutes:nowMinutes()};
  if(clock.minutes<DAWN+30||clock.minutes>NIGHT-30){clock.live=false;clock.minutes=toMin('14:30');}

  // ---- world ---------------------------------------------------------------
  // Only an explicit Done grows a tree. The mock week is lived in: earlier days
  // are answered for everyone, and friends answer their own blocks as they end.
  // Your blocks from earlier today wait for you (planner: Done, Let go, or Mark all).
  const settleFriends=()=>{
    for(const i of members)if(i.id!==ME)for(const b of plans.on(i.id,TODAY))
      if(!b.done&&!b.skipped&&b.start+b.mins<=clock.minutes)plans.markDone(i.id,b);
  };
  for(const i of members)for(const b of plans.week(i.id))if(b.date<TODAY&&!b.done&&!b.skipped)plans.markDone(i.id,b);
  settleFriends();
  const tables={};
  for(const i of members)tables[i.id]=createTimetable(i,{texture,own:i.id===ME,blocks:plans.on(i.id,TODAY)});
  // greenery stays, except the pieces sitting on the path
  for(const i of members)tables[i.id].clearPath(i.model,['RimShrubs','RimBlossom','Tufts','ScatterRocks']);
  // Altitude = load: this week's committed hours against what the member can give.
  const settle=id=>setAltitude(id,altitudeFromLoad(plans.hours(plans.week(id))/CAPACITY[id]));
  members.forEach(i=>settle(i.id));
  // Bridge glow = recent warmth with the group; time spent together warms it.
  const warmth={};
  const warm=(id,by=0)=>{warmth[id]=Math.min(3,(warmth[id]??WARMTH[id]??1.2)+by);setGlow?.(id,warmth[id]);};
  members.forEach(i=>warm(i.id));
  const checkins=Object.fromEntries(members.map(i=>[i.id,[...(CHECKINS[i.id]??[])]]));
  const weather=i=>{i.derivedStrain=deriveStrain(checkins[i.id],loadFromAltitude(i.altitude));setStrain(i,i.derivedStrain);};
  members.forEach(weather);
  const mood=createMood(texture);
  for(const i of members)mood.addIsland(i,checkins[i.id]);
  const photos=createPhotoLake({island:community,texture,members:members.map(({id,owner})=>({id,owner})),me:ME,notice,view,time:()=>clock.minutes});
  // the board by the arrival spot carries the group's shared goals (below)
  const board=createGoalsBoard(community,{at:[3.4,2.6],face:1.11});   // faces the pond and the arrival spot
  // Notes = support: a few words for a friend, written on wood and left at
  // their gate. Leave one at a friend's gate; read yours at your own. Each
  // warms a bridge a little.
  const owners=Object.fromEntries(members.map(i=>[i.id,i.owner]));
  const names=ids=>[...new Set(ids)].map(id=>id===ME?'you':owners[id]).join(' and ');
  // a signpost just inside each torii, beside a pillar, while notes wait there
  const gateSigns=Object.fromEntries(members.map(i=>[i.id,createGateSign(i,{at:[ARCH.x-.74+.22,ARCH.z+.82+.2],face:-2.3})]));
  const given=new Set(), visited=new Set();   // friends noted today; islands visited this session
  const unread=()=>NOTES.filter(n=>n.to===ME&&!n.read);
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  function syncNotes(){
    for(const i of members){
      const mine=i.id===ME, waiting=mine?unread():NOTES.filter(n=>n.to===i.id);
      gateSigns[i.id].set(waiting.length?{head:mine?'At your gate':`For ${i.owner}`,foot:'written on wood',
        body:`${plural(waiting.length,'note')} waiting${mine?' for you':''}, from ${names(waiting.map(n=>n.from))}`}:null);
    }
  }
  for(const p of NOTE_PRESETS){
    const b=document.createElement('button');b.type='button';b.className='note-preset';b.textContent=p;
    b.onclick=()=>{$('note-text').value=p;$('note-text').focus();};$('note-presets').append(b);
  }
  for(const f of members.filter(i=>i.id!==ME))$('note-to').append(Object.assign(document.createElement('option'),{value:f.id,textContent:f.owner}));
  function writeNote(to){if(to)$('note-to').value=to;$('note-text').value='';$('note-dialog').showModal();$('note-text').focus();}
  $('note-form').onsubmit=e=>{
    e.preventDefault();const to=$('note-to').value, text=$('note-text').value.trim();if(!text)return;
    NOTES.push({from:ME,to,text,day:0,read:false});given.add(to);warm(to,.5);warm(ME,.3);syncNotes();
    $('note-dialog').close();notice(`Your note is waiting at ${owners[to]}’s gate.`);
  };
  $('note-cancel').onclick=()=>$('note-dialog').close();
  function readNotes(){
    $('notes-list').replaceChildren(...NOTES.filter(n=>n.to===ME).reverse().map(n=>{
      const li=document.createElement('li');li.className=n.to===ME?'mine':'';
      li.append(Object.assign(document.createElement('span'),{textContent:`for ${owners[n.to]} · from ${owners[n.from]}`}),
                Object.assign(document.createElement('strong'),{textContent:n.text}));
      return li;
    }));
    $('notes-dialog').showModal();
    for(const n of unread())n.read=true;syncNotes();
  }
  $('notes-close').onclick=()=>$('notes-dialog').close();
  $('notes-write').onclick=()=>{$('notes-dialog').close();writeNote(null);};
  syncNotes();
  // The task board: small things anyone can post or join this week, then do on
  // their own, any day (data.js TASKS). Everyone who finishes earns the reward
  // plus one dewdrop for each friend who finished too -- no cliff, so nobody
  // is ever the reason others missed out. Only finishers are named; everyone
  // else is a count. A photo is optional and never proof.
  const mk=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
  const who=id=>id===ME?'You':owners[id];
  const DAY=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], dayName=date=>DAY[dow(date)-1];
  const photoSrc=f=>f&&(f.startsWith('data:')?f:`${import.meta.env.BASE_URL}assets/moments/${f}`);
  const finishers=t=>Object.keys(t.done);
  const earned=t=>t.done[ME]===undefined?0:t.reward+finishers(t).length-1;
  const taskDew=()=>TASKS.reduce((a,t)=>a+earned(t),0);
  // joining puts the task on your plan: the first free evening from tomorrow (move it in the planner)
  function planSlot(mins){
    for(let d=1;d<=7;d++){
      const date=addDays(TODAY,d);
      for(const start of [19*60,18*60,20*60])
        if(!plans.on(ME,date).some(b=>!b.skipped&&b.start<start+mins&&b.start+b.mins>start))return {date,start};
    }
    return {date:addDays(TODAY,1),start:19*60};
  }
  const schedule=t=>{const {date,start}=planSlot(t.mins);t.block=plans.add(ME,{date,start,mins:t.mins,cat:t.cat,title:t.title,vis:'open'});};
  // already joined when the demo opens: done last night, so it waits for an answer
  for(const t of TASKS)if(t.joined.includes(ME)&&t.done[ME]===undefined){
    const y=addDays(TODAY,-1);
    if(y>=mondayOf(TODAY))t.block=plans.add(ME,{date:y,start:19*60,mins:t.mins,cat:t.cat,title:t.title,vis:'open'});else schedule(t);
  }
  const happened=b=>!!b&&(b.date<TODAY||(b.date===TODAY&&b.start+b.mins<=clock.minutes));
  function join(t){
    if(!t.joined.includes(ME))t.joined.push(ME);
    schedule(t);notice(`${t.title} is on your plan for ${dayName(t.block.date)} ${fmt(t.block.start)}. Move it any time in the planner.`);
    renderTasks();
  }
  function finishTask(t){
    if(t.block&&!t.block.done)plans.markDone(ME,t.block);
    t.done[ME]=null;
    const n=earned(t);notice(`Done. +${n} 💧${n>t.reward?`, ${n-t.reward} of them for friends who finished too`:''}.`);
    renderTasks();
  }
  let photoFor=null;
  $('task-photo').onchange=e=>{
    const f=e.target.files[0], t=photoFor;e.target.value='';photoFor=null;
    if(f&&t)loadSquare(f).then(c=>{t.done[ME]=c.toDataURL('image/jpeg',.85);renderTasks();});
  };
  for(const c of ['study','work','errands','social','exercise','rest'])$('task-cat').append(mk('option',{value:c,textContent:CATEGORIES[c].label}));
  $('task-form').onsubmit=e=>{
    e.preventDefault();const title=$('task-title').value.trim();if(!title)return;
    const t={id:`mine${TASKS.length}`,title,cat:$('task-cat').value,mins:30,by:ME,reward:2,joined:[],done:{}};
    TASKS.unshift(t);$('task-title').value='';join(t);
  };
  function renderTasks(){
    $('goals-list').replaceChildren(...TASKS.map(t=>{
      const mine=t.done[ME]!==undefined, joined=t.joined.includes(ME), fin=finishers(t);
      const li=mk('li',{className:'task'},
        mk('div',{className:'task-head'},mk('strong',{textContent:t.title}),mk('em',{textContent:`${t.reward} 💧 +1 per friend`})),
        mk('span',{className:'task-meta',textContent:`${CATEGORIES[t.cat].label} · ${t.by?`posted by ${who(t.by)}`:'suggested for the group'} · ${t.joined.length} joined`}));
      if(fin.length)li.append(mk('div',{className:'task-finishers'},...fin.map(id=>{
        const src=photoSrc(t.done[id]);
        if(!src)return mk('span',{className:'finisher',textContent:`🌿 ${who(id)}`});
        const b=mk('button',{type:'button',className:'finisher',title:'View photo'},`🌿 ${who(id)}`,mk('img',{src,alt:''}));
        b.onclick=()=>view({src,title:t.title,sub:`Finished by ${who(id)}`});return b;
      })));
      const act=mk('div',{className:'task-actions'});
      if(mine){
        act.append(mk('span',{className:'task-status',textContent:`Done · +${earned(t)} 💧`}));
        if(!t.done[ME]){const b=mk('button',{type:'button',className:'text-button',textContent:'Add a photo (optional)'});b.onclick=()=>{photoFor=t;$('task-photo').click();};act.append(b);}
      }else if(joined){
        const b=mk('button',{type:'button',className:'wood-button',textContent:'Mark done'});b.onclick=()=>finishTask(t);
        if(!happened(t.block)){b.disabled=true;b.title='You can mark it done once it has happened';}
        act.append(mk('span',{className:'task-status',textContent:t.block?`On your plan · ${dayName(t.block.date)} ${fmt(t.block.start)}`:'On your plan'}),b);
      }else{const b=mk('button',{type:'button',className:'wood-button',textContent:'Join'});b.onclick=()=>join(t);act.append(b);}
      li.append(act);return li;
    }));
  }
  function openTasks(){renderTasks();$('goals-dialog').showModal();}
  $('goals-close').onclick=()=>$('goals-dialog').close();
  let boardKey='';
  const writeBoard=()=>{
    const key=TASKS.map(t=>`${t.joined.length}.${finishers(t).length}.${t.done[ME]!==undefined}`).join();
    if(key===boardKey)return;boardKey=key;
    board.write('Small things, together',TASKS.slice(0,4).map(t=>({text:t.title,reward:t.reward,done:t.done[ME]!==undefined})));
  };
  writeBoard();
  // Dewdrops: a slow drip from finished blocks, golden-window moments and
  // notes between friends, spent on decorations -- v1 shows the windmill they
  // grew, at the hub of the clock-face path. They never touch load or stress.
  const windmills=members.map(i=>createWindmill(i,{face:-2.35}));   // every clock face turns round one
  const dew=()=>36+plans.week(ME).filter(b=>!b.skipped&&b.done).length   // explicit Done only
                  +(photos.items.some(i=>i.member.id===ME)?3:0)
                  +NOTES.filter(n=>n.to===ME&&n.read).length+given.size+taskDew();
  // What anyone may see of an island (PRODUCT.md privacy): its weather and its
  // altitude, in words -- never hours, and never what's on the plan.
  const band=l=>l<.35?'Floating high, a light week':l<.7?'Mid-sky, a steady week':'Low, near the clouds, a full week';
  const trend=s=>s<.2?'clear days lately':s<.35?'mostly clear':s<.55?'a heavier few days':s<.75?'a tiring stretch':'a hard week';
  function statusRows(i){
    if(!i?.owner){   // the gathering island: only what the group shares
      const n=photos.items.length, f=TASKS.reduce((a,t)=>a+finishers(t).length,0);
      return {head:'',rows:[{label:'The deck',text:`${n} moment${n===1?'':'s'} today`,color:'#ffcf8a'},
                            {label:'Task board',text:`${f} ${f===1?'finish':'finishes'} this week`,color:'#b98a5e'}]};
    }
    const rows=[
      {label:'Weather',text:`${i.weather}, ${trend(i.strain??0)}`,color:'#9fb7d6'},
      {label:'Altitude',text:band(loadFromAltitude(i.altitude)),color:'#c9b8e8'},
    ];
    return {head:i.id===ME?'What friends see':'',rows};
  }

  // ---- viewer (photo lanterns and emotion lanterns) -------------------------
  function view({src,title,sub}){
    $('viewer-img').hidden=!src;if(src){$('viewer-img').src=src;$('viewer-img').alt=title;}
    $('viewer-title').textContent=title;$('viewer-sub').textContent=sub??'';$('viewer').showModal();
  }
  $('viewer-close').onclick=()=>$('viewer').close();

  // ---- sheets: the planner (input) and your balance (analysis + solutions) ---
  const sheets=createSheets();
  const calendar=createCalendar({plans,owner:ME,clock,notice,sheets});
  const balance=createBalance({plans,me,friends:members.filter(i=>i.id!==ME),clock,checkins:checkins[ME],sheets,notice,dew,warm:id=>warm(id,.8)});
  // your gardener waits at the left end of an open sheet's top edge; walk it
  // with ← →, jump with Space, turn it with Q E
  const sheetBuddy=sheet=>{
    sheet.append(Object.assign(document.createElement('span'),{className:'buddy-hint',textContent:'← → walk · Space jump · Q E turn'}));
    return createBuddy(sheet,{height:132,speed:260,place:(el,x,lift,walking)=>{
      x=Math.max(46,Math.min(sheet.clientWidth-46,x));
      el.style.left=`${x}px`;el.style.translate=`-50% ${-lift}px`;el.classList.toggle('walking',walking);return x;
    }});
  };
  const shop=createShop({sheets,dew,notice});
  const buddies={planner:sheetBuddy($('planner-sheet')),balance:sheetBuddy($('balance-sheet')),shop:sheetBuddy($('shop-sheet'))};
  // any plan edit re-draws that island's path, settles its altitude, refreshes the sheets
  plans.onChange(id=>{
    tables[id]?.setBlocks(plans.on(id,TODAY));settle(id);
    if(lifted===id)setLift(id);
    if(id===ME){calendar.render();balance.render();buddies.planner.hop();buddies.balance.hop();}
  });

  // ---- check-in and the small top-right panels ------------------------------
  for(const [k,m] of Object.entries(MOODS)){
    const b=document.createElement('button');b.type='button';b.className='mood';b.dataset.mood=k;
    b.style.setProperty('--mood',m.color);b.textContent=m.label;b.onclick=()=>checkIn(k);$('moods').append(b);
  }
  let checkinPhoto=null;
  $('checkin-photo').onchange=e=>{const f=e.target.files[0];checkinPhoto=null;if(f)loadSquare(f).then(c=>{checkinPhoto=c.toDataURL('image/jpeg',.9);});};
  function checkIn(k){
    const entry={day:0,mood:k,time:clock.minutes,photo:checkinPhoto};checkins[ME].push(entry);
    const onMine=player.surface?.kind==='island'&&player.surface.id===ME;
    mood.checkIn(me,entry,onMine?player.position.clone().sub(me.group.position).add(new T.Vector3(0,1.2,0)):null);
    weather(me);checkinPhoto=null;$('checkin-photo').value='';balance.render();
    notice(`A ${MOODS[k].label.toLowerCase()} lantern rises over your island.`);
    if(!$('mood-panel').hidden)setMoodPanel(false);
  }
  const PANELS=[['settings','settings-toggle'],['mood-panel','mood-toggle']];
  const closeOthers=keep=>{for(const [p,t] of PANELS)if(p!==keep){$(p).hidden=true;$(t).setAttribute('aria-expanded','false');}};
  function setMoodPanel(open){
    $('mood-panel').hidden=!open;$('mood-toggle').setAttribute('aria-expanded',String(open));
    if(open){closeOthers('mood-panel');sheets.hide();$('moods').querySelector('button')?.focus();}
    else $('mood-toggle').focus();
  }
  $('mood-toggle').onclick=()=>setMoodPanel($('mood-panel').hidden);$('mood-close').onclick=()=>setMoodPanel(false);
  $('settings-toggle').addEventListener('click',()=>{closeOthers('settings');sheets.hide();});
  $('planner-toggle').onclick=()=>{closeOthers(null);calendar.open();buddies.planner.reset(80);};
  const openBalance=from=>{closeOthers(null);balance.open(from);buddies.balance.reset(80);};
  $('balance-toggle').onclick=()=>openBalance($('balance-toggle'));
  $('shop-toggle').onclick=()=>{closeOthers(null);shop.open();buddies.shop.reset(80);};

  // ---- demo controls: time of day, golden window ------------------------------
  const showClock=()=>{$('clock').value=Math.round(clock.minutes);$('clock-value').value=fmt(clock.minutes);$('clock-live').checked=clock.live;};
  $('clock').oninput=e=>{clock.live=false;clock.minutes=+e.target.value;showClock();};
  $('clock-live').onchange=e=>{clock.live=e.target.checked;if(clock.live)clock.minutes=nowMinutes();showClock();};
  $('golden-ring').onclick=()=>photos.ring();
  showClock();

  // ---- schedule: lift the path into a readable ribbon ----------------------------
  let lifted=null;
  const labels=[];
  // on the lifted timetable the block happening now lights up; the 3D gardener
  // is already standing right there, so no 2D one is drawn here
  function setLift(id){
    if(lifted&&lifted!==id)tables[lifted].setLift(false);
    lifted=id;if(id)tables[id].setLift(true);
    $('schedule').setAttribute('aria-pressed',String(!!id));
    $('ribbon-labels').replaceChildren();labels.length=0;
    if(getMode()==='walk')$('mode-hint').textContent=id?'Your day, lifted · Schedule to lower it'
                                                        :'WASD to walk · Space to jump · Drag to look around · Esc for sky view';
    if(!id)return;
    const own=id===ME;
    for(const b of tables[id].blocks){
      if(!own&&b.vis==='hidden')continue;
      const el=document.createElement('div');el.className='ribbon-label';el.style.setProperty('--cat',CATEGORIES[b.cat].color);
      const what=own||b.vis==='open'?b.title:`${CATEGORIES[b.cat].label} · ${hours(b.mins)}`;
      el.append(Object.assign(document.createElement('span'),{textContent:fmt(b.start)}),Object.assign(document.createElement('strong'),{textContent:what}));
      $('ribbon-labels').append(el);labels.push({el,block:b});
    }
  }
  // While a sheet or the lifted timetable is open, the movement keys drive the
  // 2D gardener instead of the 3D one (Esc still closes; typing is untouched).
  const activeBuddy=()=>!$('planner-sheet').hidden?buddies.planner:!$('balance-sheet').hidden?buddies.balance:!$('shop-sheet').hidden?buddies.shop:null;
  for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
    if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    const b=activeBuddy();
    if(b?.key(e.code,type==='keydown')){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  $('schedule').onclick=()=>{
    if(lifted)return setLift(null);
    if(getMode()!=='walk'){visit(ME);setTimeout(()=>setLift(ME),1300);return;}
    if(!tables[getSelected()])return notice('The gathering island keeps no timetable. Cross a bridge to someone’s island.');
    setLift(getSelected());
  };

  // ---- proximity reveal -----------------------------------------------------------
  let card=null;
  function reveal(next){
    const key=next?.key??null;if(key===(card?.key??null)){if(next)card.at=next.at;return;}card=next;
    $('reveal').hidden=!next;if(!next)return;
    $('reveal').classList.toggle('wood',!!next.wood);   // notes and the goals board: written on wood, like their dialogs
    $('reveal').style.setProperty('--cat',next.color??'');
    $('reveal-kicker').textContent=next.kicker;$('reveal-title').textContent=next.title;$('reveal-sub').textContent=next.sub;
    $('reveal-action').hidden=!next.action;$('reveal-action-label').textContent=next.actionLabel??'View photo';
    $('reveal-letgo').hidden=!next.letGo;
  }
  // Your own planned block, finished early: its card offers "Done", and the ghost takes root.
  const finish=b=>{plans.markDone(ME,b);notice(`${b.title} took root.`);};
  // Your own open blocks: Done once it has happened, Let go (after a gentle confirm) any time.
  const letGo=async b=>{if(await confirmLetGo(b.title)){plans.toggleSkip(ME,b);notice(`${b.title} drifted away. Bring it back from the planner any time.`);}};
  const withActions=(card,b)=>{
    const st=blockStatus(b,clock.minutes);if(!['planned','now','waiting'].includes(st))return card;
    return {...card,...(st==='waiting'?{action:()=>finish(b),actionLabel:'Done'}:{}),letGo:()=>letGo(b)};
  };
  $('reveal-action').onclick=()=>card?.action?.();
  $('reveal-letgo').onclick=()=>card?.letGo?.();
  window.addEventListener('keydown',e=>{
    if(e.code!=='KeyE'||!card?.action||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;
    card.action();
  });
  // At a gate: your own shows what is waiting for you; a friend's takes a note.
  function gateCard(i){
    if(i.id===ME){
      const mine=NOTES.filter(n=>n.to===ME), u=unread();
      return {key:`gate${u.length}${mine.length}`,wood:true,kicker:'Your gate',
              title:u.length?`${plural(u.length,'note')} waiting for you`:mine.length?'Notes from your friends':'A quiet gate',
              sub:u.length?`From ${names(u.map(n=>n.from))}`:mine.length?'Read them again whenever you like':'No notes yet',
              action:mine.length?readNotes:null,actionLabel:'Read'};
    }
    const done=given.has(i.id);
    return {key:`gate${i.id}${done}`,wood:true,kicker:`${i.owner}’s gate`,title:done?`Your note for ${i.owner} is waiting here`:`Leave a note for ${i.owner}`,
            sub:done?'A little warmth across the bridge':'A few words for their week',action:done?null:()=>writeNote(i.id),actionLabel:'Write'};
  }
  function nearest(){
    if(getMode()!=='walk')return null;
    const here=islands.find(i=>i.id===getSelected());
    if(here?.owner&&Math.hypot(player.position.x-here.x-ARCH.x*here.scale,player.position.z-here.z-ARCH.z*here.scale)<3.9){
      const gy=here.altitude+(here.field.height(ARCH.x,ARCH.z)??.35)*here.scale;
      return {...gateCard(here),at:new T.Vector3(here.x+ARCH.x*here.scale,gy+5.6,here.z+ARCH.z*here.scale)};   // above the torii beam
    }
    const table=tables[getSelected()];
    if(table){
      // a path stop wins; otherwise the nearest tree's activity (main.js nearTree)
      const own=getSelected()===ME, n=table.near(player.position,4.5);
      if(!n){
        const c=nearTree?.(getSelected(),player.position)??null;
        // a ghost of one of today's blocks: forest.js keys its card g<id><status>
        const b=own&&c&&table.blocks.find(b=>c.key===`g${b.id}${blockStatus(b,clock.minutes)}`);
        return b?withActions(c,b):c;
      }
      const b=n.block, open=own||b.vis==='open', st=blockStatus(b,clock.minutes);
      const c={key:`b${b.id}${st}`,color:CATEGORIES[b.cat].color,kicker:`${fmt(b.start)}–${fmt(b.start+b.mins)}`,
               title:open?b.title:CATEGORIES[b.cat].label,sub:`${open?CATEGORIES[b.cat].label+' · ':''}${hours(b.mins)} · ${STATUS[st]}`};
      return own?withActions(c,b):c;
    }
    if(getSelected()===community.id){
      const p=photos.near(player.position,9);   // reachable from the pond's edge; the lanterns hover over the deck
      if(p)return {key:`p${p.item.member.id}`,kicker:'On the lake',title:p.item.member.id===ME?'Your moment':`${p.item.member.owner}’s moment`,
                   sub:`${fmt(p.item.time)}${p.item.late?' · a little late':''}`,action:p.view,actionLabel:'View photo',at:p.at};
      const bp=board.group.getWorldPosition(bv), bd=Math.hypot(player.position.x-bp.x,player.position.z-bp.z);
      if(bd<4.2){
        const n=TASKS.reduce((a,t)=>a+finishers(t).length,0);bp.y+=3.6;
        return {key:`tasks${n}.${TASKS.length}`,wood:true,kicker:'The task board',title:`${n} ${n===1?'finish':'finishes'} this week`,
                sub:'Small tasks anyone can join, any day this week.',action:openTasks,actionLabel:'View',at:bp.clone()};
      }
      return null;
    }
    return null;
  }

  // ---- per frame --------------------------------------------------------------------
  let lastSelected=null,lastMode=null,lastMinute=-1,chips='',lastDew=null;
  const v=new T.Vector3(), rv=new T.Vector3(), bv=new T.Vector3();
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  return {
    update(dt,elapsed,motion){
      if(clock.live)clock.minutes=nowMinutes();
      const minute=Math.floor(clock.minutes);
      if(minute!==lastMinute){lastMinute=minute;showClock();settleFriends();calendar.render();}
      const mode=getMode(), selected=getSelected();
      if(mode!==lastMode||selected!==lastSelected){
        if(lifted&&(mode!=='walk'||selected!==lifted))setLift(null);
        // a visit warms that friend's bridge a little, once a session
        if(mode==='walk'&&selected!==ME&&tables[selected]&&!visited.has(selected)){visited.add(selected);warm(selected,.3);}
        lastMode=mode;lastSelected=selected;
      }
      // bottom left: what friends can see of the island you're on; from the sky
      // and at home it's your own, and each row opens your balance
      const shown=mode==='walk'?islands.find(i=>i.id===selected):me, drops=dew();
      const status=statusRows(shown), key=`${JSON.stringify(status)}|${shown===me}|${drops}`;
      if(key!==chips){
        chips=key;
        const own=shown===me;
        $('status-head').hidden=!status.head;$('status-head').textContent=status.head;
        $('island-status').replaceChildren(...status.rows.map(r=>{
          const item=mk(own?'button':'span',{className:'status-row'},mk('i'),mk('b',{textContent:r.label}),r.text);
          item.style.setProperty('--dot',r.color);item.firstChild.setAttribute('aria-hidden','true');
          if(own){item.type='button';item.title='Open your balance';item.onclick=()=>openBalance(item);}
          return mk('li',{},item);
        }));
        $('dew-chip').textContent=`💧 ${drops}`;$('dew-chip').title=`${drops} dewdrops`;
        shop.render();
      }
      // dewdrops earned: the badge pulses and the gain floats up from it
      if(lastDew!==null&&drops>lastDew){
        const chip=$('dew-chip'), float=Object.assign(document.createElement('span'),{className:'dew-float',textContent:`+${drops-lastDew} 💧`});
        chip.classList.remove('gain');void chip.offsetWidth;chip.classList.add('gain');chip.append(float);setTimeout(()=>float.remove(),1500);
      }
      lastDew=drops;
      for(const w of windmills)w.update(dt,motion);writeBoard();
      for(const t of Object.values(tables))t.update(clock.minutes,elapsed,dt,camera,motion);
      mood.update(elapsed,dt,motion);photos.update(elapsed,camera,motion);
      const table=lifted&&tables[lifted];
      $('ribbon-labels').style.opacity=table?Math.max(0,table.lift*4-3):0;
      if(table&&table.lift>.75){
        labels.forEach(({el,block},i)=>{
          table.ribbonPoint(block.start+block.mins/2,.35+(i%2)*1.1,v).project(camera);
          el.style.left=`${(v.x*.5+.5)*innerWidth}px`;el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;
        });
        labels.forEach(({el,block})=>el.classList.toggle('here',clock.minutes>=block.start&&clock.minutes<block.start+block.mins));
      }
      if(!$('planner-sheet').hidden)buddies.planner.step(dt);
      if(!$('balance-sheet').hidden)buddies.balance.step(dt);
      if(!$('shop-sheet').hidden)buddies.shop.step(dt);
      reveal(lifted?null:nearest());
      // the card floats beside what it describes, kept inside the screen
      const r=$('reveal');
      if(card?.at&&!r.hidden){
        rv.copy(card.at).project(camera);
        r.style.setProperty('--x',`${clamp((rv.x*.5+.5)*innerWidth,150,innerWidth-150)}px`);
        r.style.setProperty('--y',`${clamp((-rv.y*.5+.5)*innerHeight,150,innerHeight-130)}px`);
        r.classList.add('anchored');
      }else r.classList.remove('anchored');
    },
    pick(raycaster){
      if(photos.pick(raycaster))return true;
      const l=mood.pick(raycaster);if(!l)return false;
      const whose=l.island.id===ME?'Your':`${l.island.owner}’s`;
      view({src:l.entry.photo,title:`${whose} ${MOODS[l.entry.mood].label.toLowerCase()} lantern`,sub:l.entry.time!=null?`Checked in at ${fmt(l.entry.time)}`:'Today'});
      return true;
    },
    api:{
      getSchedule:id=>tables[id]?.blocks.map(b=>({...b,status:blockStatus(b,clock.minutes)}))??null,
      week:id=>plans.week(id??ME).map(({id,date,start,mins,cat,title,skipped,priority})=>({id,date,start,mins,cat,title,skipped,priority})),
      setTime:m=>{clock.live=false;clock.minutes=m;showClock();},
      ringGoldenWindow:()=>photos.ring(),
      checkIn,
      lift:id=>setLift(id??null),
      openPlanner:tab=>{calendar.open(tab);buddies.planner.reset(80);},
      openBalance:()=>{balance.open();buddies.balance.reset(80);},
      markDone:id=>{const b=tables[ME].blocks.find(b=>String(b.id)===String(id));if(b)finish(b);},
      // "Restore this evening": altitude and weather back to what the plan and check-ins say
      resettle:()=>{members.forEach(i=>{settle(i.id);weather(i);delete warmth[i.id];warm(i.id);});},
      photos:()=>photos.items.map(i=>({member:i.member.id,time:i.time,late:i.late})),
    },
  };
}
