import * as T from 'three';
import { ME, LIVE, DAWN, NIGHT, CATEGORIES, MOODS, CHECKINS, WARMTH, NOTES, NOTE_PRESETS, TASKS, fmt, hours, toMin,
         deriveStrain, weatherLabel, loadFromAltitude, altitudeFromLoad, catImg, fullness, WEEK, symbolImg } from './data.js';
import { reading, weekReading, gardener as gardenerFor, eveningAsks, answer as recordAnswer, ANSWERS, forecast } from './readings.js';
import { FORECAST_WORDS } from './climate.js';
import * as backend from './backend.js';
import { createAsk } from './ask.js';
import { mountSkyPanel } from './account.js';
import { plans, TODAY, addDays, dow, mondayOf, isDone, fromIso, daysBetween } from './plan.js';
import { HISTORY } from './groves.js';
import { confirmLetGo } from './confirm.js';
import { createTimetable, blockStatus, ARCH } from './timetable.js';
import { createMood } from './mood.js';
import { createCarousel, loadSquare } from './photos.js';
import { createSheets } from './sheets.js';
import { createCalendar } from './calendar.js';
import { createBalance } from './balance.js';
import { createGoalsBoard, createWindmill, createGateSign } from './decor.js';
import { createShop, itemById } from './shop.js';
import { createGarden, setGardenDusk } from './garden.js';
import { createBuddy } from './buddy.js';
import * as sound from './sound.js';

// Everything README.md says the world should show: the timetable path and wisp,
// emotion lanterns, weather and altitude from the plan, the shared photo
// carousel, proximity reveal, and the planner and balance sheets. main.js calls
// initLife() once the islands exist, then life.update() every frame.
const $=id=>document.getElementById(id);
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go',waiting:'did it happen?'};
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};

// Weather is one strain value (0..1); the label is only a name for where it sits.
export const setStrain=(island,s)=>{island.strain=s;island.weather=weatherLabel(s);island.weatherFx.setStrain(s);};

export function initLife({world,islands,camera,texture,player,notice,visit,forest,getMode,getSelected,setAltitude,setGlow,guiding=()=>false}){
  const me=islands.find(i=>i.id===ME), members=islands.filter(i=>i.owner), community=islands.find(i=>!i.owner);
  // The demo opens at 23:00, after the whole day has happened, so every one of
  // today's trees can be answered with Done. "Live" in Tune the world follows
  // real time, and a signed-in sky always does.
  const clock={live:LIVE,minutes:LIVE?nowMinutes():toMin('23:00')};
  backend.reportErrorsTo(()=>notice('Something didn’t save. Check your connection; your island will catch up.'));

  // ---- world ---------------------------------------------------------------
  // Today, only an explicit Done grows a tree; earlier days are settled (plan.js
  // isDone). In the demo, friends answer their own blocks as they end. Your
  // blocks from earlier today wait for you (planner: Done, Let go, or Mark all).
  // (Demo only: real friends answer their own blocks on their own islands.)
  const settleFriends=()=>{
    if(LIVE)return;
    for(const i of members)if(i.id!==ME)for(const b of plans.on(i.id,TODAY))
      if(!b.done&&!b.skipped&&b.start+b.mins<=clock.minutes)plans.markDone(i.id,b);
  };
  if(!LIVE)for(const i of members)for(const b of plans.week(i.id))if(b.date<TODAY&&!b.done&&!b.skipped)plans.markDone(i.id,b);
  settleFriends();
  const tables={};
  for(const i of members)tables[i.id]=createTimetable(i,{texture,own:i.id===ME,blocks:plans.on(i.id,TODAY)});
  // greenery stays, except the pieces sitting on the path
  for(const i of members)tables[i.id].clearPath(i.model,['RimShrubs','RimBlossom','Tufts','ScatterRocks']);
  // Altitude = how heavy this week is for you, against your own normal week
  // (readings.js, docs/algorithm.md 2). A real friend's island shows what
  // their own app published; hours and titles never cross the bridge.
  const status=world.status??{};
  const sinkOf=id=>LIVE&&id!==ME?(status[id]?.sink??.5):reading(id).sink;
  const publish=()=>{if(LIVE)backend.publishStatus(world,reading(ME).sink,me.derivedStrain??0);};
  const settle=id=>{if(id===ME&&pastWeek)return;setAltitude(id,altitudeFromLoad(sinkOf(id)));if(id===ME)publish();};
  let pastWeek=null;   // a past week shown on your island (below)
  members.forEach(i=>settle(i.id));
  // Bridge glow = recent warmth with the group; time spent together warms it.
  const warmth={};
  const warm=(id,by=0)=>{warmth[id]=Math.min(3,(warmth[id]??WARMTH[id]??1.2)+by);setGlow?.(id,warmth[id]);};
  members.forEach(i=>warm(i.id));
  const checkins=Object.fromEntries(members.map(i=>[i.id,[...(CHECKINS[i.id]??[])]]));
  const weather=i=>{i.derivedStrain=deriveStrain(checkins[i.id]);setStrain(i,i.derivedStrain);if(i===me)publish();};   // feelings only; load is altitude
  members.forEach(weather);
  const mood=createMood(texture);
  for(const i of members)mood.addIsland(i,checkins[i.id]);
  const photos=createCarousel({island:community,members:members.map(({id,owner})=>({id,owner})),me:ME,notice,view,time:()=>clock.minutes,
    live:LIVE?{moments:world.moments,golden:world.golden,hang:shot=>backend.hangMoment(world,shot)}:null});
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
    if(LIVE)backend.sendNote(world,to,text);
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
    if(LIVE&&unread().length)backend.markNotesRead(world);
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
  // (a signed-in student's joined tasks are already on their plan)
  if(!LIVE)for(const t of TASKS)if(t.joined.includes(ME)&&t.done[ME]===undefined){
    const y=addDays(TODAY,-1);
    if(y>=mondayOf(TODAY))t.block=plans.add(ME,{date:y,start:19*60,mins:t.mins,cat:t.cat,title:t.title,vis:'open'});else schedule(t);
  }
  const happened=b=>!!b&&(b.date<TODAY||(b.date===TODAY&&b.start+b.mins<=clock.minutes));
  function join(t){
    if(!t.joined.includes(ME))t.joined.push(ME);
    if(LIVE)Promise.resolve(t.saved??t.id).then(id=>id&&backend.joinTask(id));
    schedule(t);notice(`${t.title} is on your plan for ${dayName(t.block.date)} ${fmt(t.block.start)}. Move it any time in the planner.`);
    renderTasks();
  }
  function finishTask(t){
    // a block on today's plan grows a tree, which chimes as it takes root (main.js); otherwise chime now
    if(!(t.block&&!t.block.done&&t.block.date===TODAY))sound.play('task_done',{gain:.55,cooldown:.6});
    if(t.block&&!t.block.done)plans.markDone(ME,t.block);
    t.done[ME]=null;
    if(LIVE)Promise.resolve(t.saved??t.id).then(id=>id&&backend.finishTask(world,id));
    const n=earned(t);notice(`Done. +${n} 💧${n>t.reward?`, ${n-t.reward} of them for friends who finished too`:''}.`);
    renderTasks();
  }
  let photoFor=null;
  $('task-photo').onchange=e=>{
    const f=e.target.files[0], t=photoFor;e.target.value='';photoFor=null;
    if(f&&t)loadSquare(f).then(c=>{t.done[ME]=c.toDataURL('image/jpeg',.85);renderTasks();if(LIVE)backend.taskPhoto(world,t.id,t.done[ME]);});
  };
  for(const c of ['study','work','errands','social','exercise','rest'])$('task-cat').append(mk('option',{value:c,textContent:CATEGORIES[c].label}));
  $('task-form').onsubmit=e=>{
    e.preventDefault();const title=$('task-title').value.trim();if(!title)return;
    const t={id:`mine${TASKS.length}`,title,cat:$('task-cat').value,mins:30,by:ME,reward:2,joined:[],done:{}};
    if(LIVE)t.saved=backend.postTask(world,t).then(r=>{if(r)t.id=r.id;return r?.id;});
    TASKS.unshift(t);$('task-title').value='';join(t);
  };
  function renderTasks(){
    $('goals-list').replaceChildren(...TASKS.map(t=>{
      const mine=t.done[ME]!==undefined, joined=t.joined.includes(ME), fin=finishers(t);
      const li=mk('li',{className:'task'},
        mk('div',{className:'task-head'},mk('strong',{textContent:t.title}),mk('em',{textContent:`${t.reward} 💧 +1 per friend`})),
        mk('span',{className:'task-meta'},catImg(t.cat),`${CATEGORIES[t.cat].label} · ${t.by?`posted by ${who(t.by)}`:'suggested for the group'} · ${t.joined.length} joined`));
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
  // ...and what dewdrops bought since, round it (garden.js). Signed in, the
  // server keeps everyone's purchases; the demo keeps yours in this browser,
  // and the friends' islands come with a few things already grown.
  const gardens=Object.fromEntries(members.map(i=>[i.id,createGarden(i)]));
  const SHOP_KEY='island-shop-demo';
  let demoBought=[];try{demoBought=JSON.parse(localStorage.getItem(SHOP_KEY))?.filter(itemById)??[];}catch{}
  const DEMO_GARDENS={purple:['flowers','bench'],oak:['kite','lanterns'],willow:['well']};
  const bought=LIVE?world.purchases??[]
    :[...demoBought.map(item=>({member:ME,item})),...Object.entries(DEMO_GARDENS).flatMap(([member,list])=>member===ME?[]:list.map(item=>({member,item})))];
  for(const b of bought)gardens[b.member]?.add(b.item);

  // The gardener's offer (docs/algorithm.md 5.1). The rules pick which kind of
  // help fits -- never a reason, only an offer -- and a sign appears by your
  // windmill, with a notice pointing to it once:
  //   schedule -- your week (or a day ahead) is heavier than usual for you:
  //               move something marked "can wait", or keep an evening free
  //   rest     -- your sky is heavy but your week isn't: it might not be your
  //               schedule, so rest or a friend, not a timetable fix
  //   support  -- a grey sky for two weeks running: a gentle pointer to real help
  // Signed in, Gemini reads a summary of the week (kinds and hours, never titles)
  // and suggests the idea itself, choosing from free times and "can wait" blocks
  // the app offers; it is shown only while that time is still free. The ideas
  // below are the fallback, and Gemini words them. Support is never AI-written.
  const NUDGE_AT=[-.93,-2.23];   // gate side of the windmill, seen on arrival
  const nudgeSign=createGateSign(me,{at:NUDGE_AT,face:-2.3});
  const DAYS_LONG=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  let nudgeOn=false, nudgeTaken=false, nudgeWhy=null, ideaAt=0, gardenerNow={mode:null};
  const refreshGardener=()=>{gardenerNow=gardenerFor(ME,checkins[ME],me.derivedStrain??0);};
  const nudgeTitle=()=>nudgeWhy==='support'?'A heavy couple of weeks'
    :nudgeWhy==='rest'?'It might not be your schedule'
    :gardenerNow.heavyDay&&gardenerNow.heavyDay!==TODAY?`${DAYS_LONG[dow(gardenerNow.heavyDay)-1]} looks heavy for you`
    :'Your week is heavier than usual for you';
  function freeSlots(starts,mins,count){
    const out=[];
    for(let d=0;d<=7&&out.length<count;d++){
      const date=addDays(TODAY,d);
      for(const start of starts){
        if(d===0&&start<clock.minutes+30)continue;
        if(plans.on(ME,date).some(b=>!b.skipped&&b.start<start+mins&&b.start+b.mins>start))continue;
        out.push({date,start});if(out.length>=count)break;
      }
    }
    return out;
  }
  function freeSlot(starts,mins){
    for(let d=0;d<=7;d++){
      const date=addDays(TODAY,d);
      for(const start of starts){
        if(d===0&&start<clock.minutes+30)continue;
        if(!plans.on(ME,date).some(b=>!b.skipped&&b.start<start+mins&&b.start+b.mins>start))return {date,start};
      }
    }
    return null;
  }
  const fits=(s,mins)=>!(s.date===TODAY&&s.start<clock.minutes+30)
    &&!plans.on(ME,s.date).some(b=>!b.skipped&&b.start<s.start+mins&&b.start+b.mins>s.start);
  // blocks still ahead this week that their owner marked "can wait", the heavy day's first
  const canWait=()=>plans.week(ME).filter(b=>b.priority==='low'&&!b.skipped&&!b.done&&(b.date>TODAY||(b.date===TODAY&&b.start>=clock.minutes)))
    .sort((a,b)=>(b.date===gardenerNow.heavyDay)-(a.date===gardenerNow.heavyDay));
  const byWarmth=()=>members.filter(i=>i.id!==ME).sort((a,b)=>(warmth[a.id]??1.2)-(warmth[b.id]??1.2));
  let smart={key:null,idea:null};
  function askGemini(){
    const key=`${nudgeWhy}|${TODAY}`;
    if(!LIVE||!['schedule','rest'].includes(nudgeWhy)||smart.key===key)return;
    smart={key,idea:null};
    const hrs=list=>{const h={};for(const b of list)h[b.cat]=Math.round(((h[b.cat]??0)+b.mins/60)*2)/2;return h;};
    const week=plans.week(ME).filter(b=>!b.skipped);
    const days=reading(ME).days.filter(d=>d.date>=TODAY&&d.date<addDays(TODAY,7))
      .map(d=>({day:`${dayName(d.date)}${d.date===TODAY?' (today)':''}`,looks:FORECAST_WORDS[d.label],hours:hrs(plans.on(ME,d.date).filter(b=>!b.skipped))}));
    const slots=freeSlots([8*60,12*60+30,17*60+30,19*60,20*60+30,21*60+30],60,14), waits=canWait().slice(0,6), friends=byWarmth().slice(0,4);
    backend.gardenerIdea({mode:nudgeWhy,
      week:{sky:me.weather,island:shortBand(loadFromAltitude(me.altitude)),lateNights:week.filter(b=>b.start+b.mins>=22*60).length,hours:hrs(week),days},
      slots:slots.map(s=>({day:dayName(s.date)+(s.date===TODAY?' (today)':''),time:fmt(s.start)})),
      canWait:waits.map(b=>({kind:b.cat,day:dayName(b.date),hours:b.mins/60})),friends:friends.map(f=>f.owner)})
      .then(g=>{
        if(smart.key!==key||!g)return;
        smart.idea=g.type==='move'?{...g,move:waits[g.move]}:{...g,slot:slots[g.slot],friend:friends.find(f=>f.owner===g.friend)??null};
        ideaAt=0;
      });
  }
  // Gemini's idea, while it still fits the plan
  function smartIdea(){
    const g=smart.key===`${nudgeWhy}|${TODAY}`?smart.idea:null;if(!g)return null;
    if(g.type==='move'){
      const b=canWait().find(b=>b.id===g.move.id&&b.date===g.move.date);
      return b?{fit:9,ai:true,move:b,title:`Move ${b.title}`,label:`moving “${b.title}” to next week`,button:'Move it to next week',line:g.line}:null;
    }
    if(!fits(g.slot,g.mins))return null;
    return {fit:9,ai:true,title:g.title,cat:g.cat,mins:g.mins,starts:[g.slot.start],slot:g.slot,vis:g.cat==='rest'?'hidden':'open',
            label:g.title.toLowerCase(),button:g.button,line:g.line,friend:g.friend};
  }
  function ideas(){
    const week=plans.week(ME).filter(b=>!b.skipped), mins=c=>week.filter(b=>b.cat===c).reduce((a,b)=>a+b.mins,0);
    const late=week.filter(b=>b.start+b.mins>=22*60).length, moved=mins('exercise');
    const friend=byWarmth()[0];
    const rest=nudgeWhy==='rest', wait=nudgeWhy==='schedule'?canWait()[0]:null;
    const all=[
      smartIdea(),
      wait&&{fit:5,move:wait,title:`Move ${wait.title}`,label:`moving “${wait.title}” to next week`,button:'Move it to next week',
       why:`You marked “${wait.title}” as able to wait.`},
      {fit:late>=2?3:0,title:'Early night',cat:'rest',mins:60,starts:[21*60+30],vis:'hidden',label:'an early night',button:'Plan an early night',
       why:late>=2?`${late} late nights this week.`:'Sleep is the quickest reset.'},
      {fit:moved<90?2.6:rest?2.3:0,title:'A walk outside',cat:'exercise',mins:30,starts:[17*60+30,12*60+30,8*60],vis:'open',label:'a walk outside',button:'Add a walk',
       why:moved<90?'You’ve hardly moved this week.':'Fresh air helps after heavy days.'},
      friend&&{fit:rest?2.8:mins('social')<120?1.2:.8,title:`Tea with ${friend.owner}`,cat:'social',mins:60,starts:[18*60,12*60+30],vis:'open',label:`tea with ${friend.owner}`,
       button:`Invite ${friend.owner}`,why:rest?'Your week isn’t heavy, but the last few days have been.':`It’s been a while since you and ${friend.owner} caught up.`,friend},
      {fit:rest?2.5:1.5,title:'Slow evening',cat:'rest',mins:60,starts:[20*60+30],vis:'hidden',label:'a slow evening',button:'Add a slow evening',
       why:rest?'Your week isn’t heavy, but the last few days have been.':'Nothing planned, nothing to finish.'},
    ].filter(Boolean).sort((a,b)=>b.fit-a.fit);
    for(const i of all)if(!i.move&&!i.ai)i.slot=freeSlot(i.starts,i.mins);
    return all.filter(i=>i.move||i.slot);
  }
  const whenText=s=>`${s.date===TODAY?'today':s.date===addDays(TODAY,1)?'tomorrow':dayName(s.date)} at ${fmt(s.start)}`;
  const slotLabel=s=>`${s.date===TODAY?'Today':s.date===addDays(TODAY,1)?'Tomorrow':dayName(s.date)} ${fmt(s.start)}`;
  const idea=()=>{const l=ideas();return l.length?l[ideaAt%l.length]:null;};
  // Gemini's wording for the current offer, fetched once per offer (signed in only)
  const worded={};
  function wording(i){
    if(i.line)return i.line;
    const fallback=`${i.why} How about ${i.label}?`, key=`${nudgeWhy}|${i.title}`;
    if(!LIVE)return fallback;
    if(!(key in worded)){
      worded[key]=fallback;
      backend.gardenerLine(nudgeWhy,{offer:i.label,why:i.why,kind:i.cat??'',friend:i.friend?.owner??''},fallback)
        .then(line=>{worded[key]=line;});
    }
    return worded[key];
  }
  function checkNudge(){
    const mode=nudgeTaken&&gardenerNow.mode!=='support'?null:gardenerNow.mode, on=!!mode&&(mode==='support'||!!idea()), was=nudgeOn;
    if(on===nudgeOn&&mode===nudgeWhy)return;nudgeOn=on;nudgeWhy=mode;if(on)askGemini();
    nudgeSign.set(on?{head:'From your island',body:mode==='support'?'A heavy couple of weeks. There’s help nearby.':`${nudgeTitle()}. Here’s an idea.`,
                      foot:'walk up to read it'}:null);
    if(on&&!was)notice(mode==='support'?'Your gardener has left you a note by the windmill.':`${nudgeTitle()}. Your gardener has an idea.`);
  }
  function takeIdea(i,slot=i.slot){
    if(i.move){plans.shift(ME,i.move,7);nudgeTaken=true;checkNudge();notice(`${i.move.title} moved to next week. Your island rises a little.`);return;}
    plans.add(ME,{date:slot.date,start:slot.start,mins:i.mins,cat:i.cat,title:i.title,vis:i.vis});
    if(i.friend){warm(i.friend.id,.8);warm(ME,.8);}
    nudgeTaken=true;checkNudge();
    notice(`${i.title} is on your plan for ${whenText(slot)}.`);
  }
  // Saying yes opens a second step: which free time suits you, or pick your own
  // in the planner. Nothing lands on the plan until you choose.
  let asking=false;
  function pickOwnTime(i,slot){
    nudgeTaken=true;checkNudge();
    calendar.edit(null,{date:slot.date,start:slot.start,mins:i.mins,cat:i.cat,title:i.title,vis:i.vis});
  }
  // the gardener's advice comes from the same reading as Your balance: "See why" opens it
  const seeWhy={more:()=>openBalance($('balance-toggle'),'suggest'),moreLabel:'See why'};
  function nudgeCard(key,kicker,at,dismiss){
    if(nudgeWhy==='support')
      return {key:`${key}support`,wood:true,kicker,title:nudgeTitle(),sub:'Your sky has been grey for a while. You don’t have to carry it alone.',
              action:()=>{$('support-dialog').showModal();nudgeTaken=true;},actionLabel:'Where to find support',
              ...(dismiss?{letGo:dismiss,letGoLabel:'Not now'}:{}),...seeWhy,at};
    const i=idea();if(!i)return null;
    if(asking&&!i.move){
      const slots=i.ai?[i.slot,...freeSlots(i.starts,i.mins,3).filter(s=>s.date!==i.slot.date)].slice(0,2):freeSlots(i.starts,i.mins,2);
      if(slots.length)return {key:`${key}when${ideaAt}`,wood:true,kicker,title:i.title,sub:'When suits you?',
        action:()=>{asking=false;takeIdea(i,slots[0]);},actionLabel:slotLabel(slots[0]),
        ...(slots[1]?{alt:()=>{asking=false;takeIdea(i,slots[1]);},altLabel:slotLabel(slots[1])}:{}),
        letGo:()=>{asking=false;pickOwnTime(i,slots[0]);},letGoLabel:'Pick a time',at};
      asking=false;
    }
    const sub=wording(i);
    return {key:`${key}${ideaAt}${nudgeWhy}${i.title}${sub.length}`,wood:true,kicker,title:nudgeTitle(),sub,
            action:i.move?()=>takeIdea(i):()=>{asking=true;},actionLabel:i.button,alt:()=>{ideaAt++;},altLabel:'Another idea',
            ...(dismiss?{letGo:dismiss,letGoLabel:'Not now'}:{}),...seeWhy,at};
  }
  $('support-close').onclick=()=>$('support-dialog').close();
  // What this week has earned, counted here. The demo spends from it (536 to
  // start -- enough to try everything in the shop -- less what you bought).
  // Signed in, the server counts all time (supabase/migrations/..._shop.sql),
  // so savings carry over the weeks; anything earned here since its last
  // count shows straight away and asks it again.
  const DEMO_START=536;
  const earnedHere=()=>(LIVE?0:DEMO_START)+plans.week(ME).filter(isDone).length
                  +(photos.items.some(i=>i.golden&&i.member.id===ME)?3:0)
                  +NOTES.filter(n=>n.to===ME&&n.read).length+given.size+taskDew();
  const spentHere=()=>demoBought.reduce((a,id)=>a+itemById(id).cost,0);
  let serverDew=world.dew??0, counted=null, recount=null;
  const askServer=()=>{clearTimeout(recount);recount=setTimeout(async()=>{
    const at=earnedHere(), n=await backend.dewBalance();if(n!=null){serverDew=n;counted=at;}
  },1500);};
  const dew=()=>{
    const e=earnedHere();
    if(!LIVE)return Math.max(0,e-spentHere());
    counted??=e;if(e!==counted)askServer();
    return Math.max(0,serverDew+e-counted);
  };
  // What anyone may see of an island (README.md privacy): its weather and its
  // altitude, in words -- never hours, and never what's on the plan.
  const band=l=>l<.35?'Floating high, a light week':l<.7?'Mid-sky, a steady week':'Low, near the clouds, a full week';
  const trend=s=>s<.2?'clear days lately':s<.35?'mostly clear':s<.55?'a heavier few days':s<.75?'a tiring stretch':'a hard week';
  // Your island, at a glance (only ever your own; friends see the rows above):
  // the trees standing on it by kind, activity capacity, and this week's feelings.
  // Trees = what the island shows: this week's grown trees (groves.js HISTORY) plus
  // one per block today -- solid once Done, glass until then; let-go ones drift off.
  // While a past week is shown, that week's trees and lanterns instead.
  function islandPanel(){
    const past=pastWeek?pastWeek.blocks:HISTORY[ME]??[], today=pastWeek?[]:plans.on(ME,TODAY).filter(b=>!b.skipped), feel={};
    for(const c of pastWeek?pastWeek.lanterns:checkins[ME].filter(c=>c.day<=6))feel[c.mood]=(feel[c.mood]??0)+1;
    return {trees:Object.keys(CATEGORIES).map(c=>({c,done:past.filter(e=>e.cat===c).length+today.filter(b=>b.cat===c&&b.done).length,
                                                   glass:today.filter(b=>b.cat===c&&!b.done).length})),
            load:Math.round(loadFromAltitude(me.altitude)*100)/100,altitude:Math.round(me.altitude*10)/10,
            weather:me.weather,strain:Math.round((me.strain??0)*100)/100,feel};
  }
  // One card for whichever island you are looking at. The rows friends can see
  // carry an eye; the private rows below them only ever appear on your own island.
  const SKY={'Clear':'clear','Light cloud':'light-cloud','Cloudy':'cloudy','Drizzle':'drizzle','Rain':'rain'};
  const shortBand=l=>l<.35?'Floating high':l<.65?'Mid-sky':l<.85?'Sinking low':'Low';
  const feelNodes=d=>{
    const moods=Object.keys(MOODS).filter(m=>d.feel[m]);
    return moods.length?moods.map(m=>mk('span',{},symbolImg(`lantern-${m}`,'mi-lantern'),`${d.feel[m]} ${MOODS[m].label.toLowerCase()}`))
                       :[mk('span',{textContent:'no lanterns yet'})];
  };
  const treeNodes=d=>d.trees.map(t=>{
    const name=CATEGORIES[t.c].label, it=mk('div',{className:`mi-tree${t.done+t.glass?'':' none'}`,title:`${name}: ${t.done} grown, ${t.glass} still glass`},
      catImg(t.c,'mi-icon'),mk('b',{textContent:String(t.done)}),mk('small',{textContent:t.glass?`+${t.glass}`:''}));
    it.setAttribute('role','listitem');it.setAttribute('aria-label',it.title);return it;
  });
  // Altitude, said once and plainly: metres from your usual height (0 m, level with the gathering island), an
  // upright scale -- lighter weeks up top, heavier ones down by the clouds -- with your island on it, and what it means.
  const altWords=(m,long)=>Math.abs(m)<2?(long?'At your usual height':'usual height'):`${Math.round(Math.abs(m))} m ${m>0?'above':'below'}${long?' your usual':''}`;
  const altMeaning=l=>l<.35?'Your week is lighter than usual, so your island floats higher.'
                      :l<.6?'A usual week for you: your island floats level with the gathering island.'
                      :l<.85?'Your week is heavier than usual, so your island sits lower. A lighter day lifts it.'
                      :'Much heavier than usual: your island is down by the cloud sea. Rest lifts it.';
  const gauge=l=>{const g=mk('span',{className:'ic-gauge',role:'img',ariaLabel:altMeaning(l)},mk('i',{className:'ic-gauge-dot'}),
      mk('small',{},mk('b',{textContent:'45 m'}),' lighter'),mk('small',{},mk('b',{textContent:'0 m'}),' usual'),mk('small',{},mk('b',{textContent:'−55 m'}),' heavier'));
    g.style.setProperty('--at',`${Math.round(Math.min(1,Math.max(0,l))*100)}%`);return g;};
  const altRow=(m,l)=>mk('span',{className:'ic-alt'},gauge(l),mk('span',{className:'ic-alt-text'},mk('b',{textContent:altWords(m,true)}),mk('span',{className:'ic-note',textContent:altMeaning(l)})));
  function cardRows(i,d){
    if(!i?.owner){                                   // the gathering island: what the group shares
      const n=photos.items.length, f=TASKS.reduce((a,t)=>a+finishers(t).length,0);
      return [{name:'Carousel',val:[`${n} moment${n===1?'':'s'} today`]},
              {name:'Task board',val:[`${f} ${f===1?'finish':'finishes'} this week`]}];
    }
    const own=i.id===ME;
    const rows=[
      {name:'Altitude',eye:own,val:own?[altRow(d.altitude,d.load)]
                                     :[band(loadFromAltitude(i.altitude))]},
      {name:'Sky',eye:own,val:[mk('b',{textContent:i.weather}),mk('span',{className:'ic-dim',textContent:trend(i.strain??0)})]},
    ];
    if(own)rows.push({sep:true},{name:'Feelings',val:feelNodes(d)},{name:'Trees',val:treeNodes(d),list:true});
    return rows;
  }
  function renderCard(i,d){
    const own=i?.id===ME;
    $('ic-title').textContent='At a glance';
    const glance=(icon,text)=>mk('span',{className:'ic-glance'},icon,mk('span',{textContent:text}));
    const sky=w=>symbolImg(`sky-${SKY[w]??'clear'}`,'ic-mini');
    let strip=[];
    if(own){
      const top=Object.entries(d.feel).sort((a,b)=>b[1]-a[1])[0];
      strip=[glance(sky(i.weather),i.weather),
             glance(symbolImg('altitude','ic-mini'),altWords(d.altitude)),
             top?glance(symbolImg(`lantern-${top[0]}`,'ic-mini'),MOODS[top[0]].label.toLowerCase()):null,
             glance(symbolImg('trees','ic-mini'),`${d.trees.reduce((a,t)=>a+t.done,0)} grown`)].filter(Boolean);
    }else if(i?.owner){
      strip=[glance(sky(i.weather),i.weather),
             glance(symbolImg('altitude','ic-mini'),shortBand(loadFromAltitude(i.altitude)))];
    }
    $('ic-chips').replaceChildren(...strip);
    $('ic-rows').replaceChildren(...cardRows(i,d).map(r=>{
      if(r.sep)return mk('div',{className:'ic-sep'});   // a breath between what friends see and what only you see
      const val=mk('div',{className:'ic-val'},...r.val);
      if(r.list)val.setAttribute('role','list');
      const eye=mk('span',{className:'ic-eye',textContent:r.eye?'👁':''});
      if(r.eye)eye.title='Friends can see this';else eye.setAttribute('aria-hidden','true');
      return mk('div',{className:'ic-row'},eye,mk('span',{className:'ic-name',textContent:r.name}),val);
    }));
    $('mi-balance').hidden=!own;$('ic-foot').hidden=!own;$('mi-past').hidden=!own||!LIVE;
  }

  $('mi-balance').onclick=()=>openBalance($('mi-balance'));

  // ---- viewer (carousel photos and emotion lanterns) ------------------------
  function view({src,title,sub}){
    $('viewer-img').hidden=!src;if(src){$('viewer-img').src=src;$('viewer-img').alt=title;}
    $('viewer-title').textContent=title;$('viewer-sub').textContent=sub??'';$('viewer').showModal();
  }
  $('viewer-close').onclick=()=>$('viewer').close();

  // ---- sheets: the planner (input) and your balance (analysis + solutions) ---
  const sheets=createSheets();
  const calendar=createCalendar({plans,owner:ME,clock,notice,sheets,live:LIVE?{connection:world.connection,uid:world.uid}:null});
  const balance=createBalance({plans,me,friends:members.filter(i=>i.id!==ME),clock,checkins:checkins[ME],sheets,notice,dew,warm:id=>warm(id,.8)});
  // your gardener waits at the left end of an open sheet's top edge; walk it
  // with ← →, jump with Space, turn it with Q E
  const sheetBuddy=sheet=>{
    return createBuddy(sheet,{height:132,speed:260,place:(el,x,lift,walking)=>{
      x=Math.max(46,Math.min(sheet.clientWidth-46,x));
      el.style.left=`${x}px`;el.style.translate=`-50% ${-lift}px`;el.classList.toggle('walking',walking);return x;
    }});
  };
  const shop=createShop({sheets,dew,notice,owns:id=>gardens[ME].has(id),buy:async item=>{
    if(LIVE){
      const r=await backend.buy(item.id);
      if(r.error){
        notice(r.error==='short'?'That needs a few more dewdrops than you have right now.':r.error==='owned'?'That’s already on your island.'
              :'The shop couldn’t reach your island. Try again in a moment.');
        if(r.error!=='failed')askServer();
        return false;
      }
      serverDew-=item.cost;askServer();
    }else{demoBought.push(item.id);try{localStorage.setItem(SHOP_KEY,JSON.stringify(demoBought));}catch{}}
    gardens[ME].add(item.id,{fresh:true});
    // home to see it grow in
    sheets.hide();if(getMode()!=='walk'||getSelected()!==ME)visit(ME);
    notice(`Blomy: “${item.line}”`);
    return true;
  }});
  // "How draining was that?" -- straight after the evening's "How are you?",
  // about the one or two of today's activities the island knows least
  // (readings.js eveningAsks). The gardener says what it learned; the island
  // re-reads your week at once.
  const answerDrain=(b,value)=>{
    const line=recordAnswer(ME,b,value);
    if(LIVE)backend.saveAnswer(ANSWERS[ME].at(-1));
    settle(ME);refreshGardener();balance.render();calendar.render();renderAsks();
    return line;
  };
  const ask=createAsk({notice,onAnswer:answerDrain});
  // The same question, any time: today's finished activities sit under "How do you feel?", each one tap to rate
  // (light, okay, draining), and a dot on that button says some are waiting. Answering is never required.
  const DRAIN={light:'Light',okay:'Okay',draining:'Draining'};
  function renderAsks(){
    const answered=new Map((ANSWERS[ME]??[]).filter(a=>a.date===TODAY).map(a=>[String(a.blockId),a.answer]));
    const ended=plans.on(ME,TODAY).filter(b=>!b.skipped&&b.mins>=15&&['done','waiting'].includes(blockStatus(b,clock.minutes)));
    const open=ended.filter(b=>!answered.has(String(b.series?.id??b.id))).length;
    $('mood-toggle').classList.toggle('has-asks',open>0);
    $('today-asks').hidden=!ended.length;
    $('ask-list').replaceChildren(...ended.map(b=>{
      const done=answered.get(String(b.series?.id??b.id));
      const name=`${b.title||CATEGORIES[b.cat].label} · ${fmt(b.start)}`;
      const li=mk('li',{className:'ask-row'},catImg(b.cat),mk('span',{className:'ask-name',textContent:name,title:name}));
      // the choices sit on their own row under the name, so names show in full
      li.append(mk('span',{className:'ask-picks'},...(done?[mk('span',{className:'ask-done',textContent:DRAIN[done]})]
        :Object.entries(DRAIN).map(([v,label])=>{const x=mk('button',{type:'button',className:'ask-pick',textContent:label});x.onclick=()=>notice(answerDrain(b,v));return x;}))));
      return li;
    }));
  }
  const buddies={planner:sheetBuddy($('planner-sheet')),balance:sheetBuddy($('balance-sheet')),shop:sheetBuddy($('shop-sheet'))};
  // any plan edit re-draws that island's path, settles its altitude, refreshes the sheets
  plans.onChange(id=>{
    tables[id]?.setBlocks(plans.on(id,TODAY));settle(id);
    if(lifted===id)setLift(id);
    if(id===ME){calendar.render();balance.render();buddies.planner.hop();buddies.balance.hop();refreshGardener();}
  });
  refreshGardener();

  // ---- check-in and the small top-right panels ------------------------------
  for(const [k,m] of Object.entries(MOODS)){
    const b=document.createElement('button');b.type='button';b.className='mood';b.dataset.mood=k;
    b.style.setProperty('--mood',m.color);b.textContent=m.label;b.onclick=()=>checkIn(k);$('moods').append(b);
  }
  let checkinPhoto=null;
  $('checkin-photo').onchange=e=>{const f=e.target.files[0];checkinPhoto=null;if(f)loadSquare(f).then(c=>{checkinPhoto=c.toDataURL('image/jpeg',.9);});};
  function checkIn(k){
    showPresent();
    const entry={day:0,mood:k,time:clock.minutes,photo:checkinPhoto};checkins[ME].push(entry);
    const onMine=player.surface?.kind==='island'&&player.surface.id===ME;
    mood.checkIn(me,entry,onMine?player.position.clone().sub(me.group.position).add(new T.Vector3(0,1.2,0)):null);
    if(LIVE)backend.saveCheckin(world,{mood:k,minute:clock.minutes,photo:checkinPhoto});
    weather(me);checkinPhoto=null;$('checkin-photo').value='';balance.render();refreshGardener();
    notice(`A ${MOODS[k].label.toLowerCase()} lantern lights up on your pier.`);
    if(!$('mood-panel').hidden)setMoodPanel(false);
    // then two quick ones about today, if the island has something to learn
    const ended=plans.on(ME,TODAY).filter(b=>['done','waiting'].includes(blockStatus(b,clock.minutes)));
    // (not while Blomy is guiding: the question would cover what the guide points at; it waits in the panel)
    if(!guiding())eveningAsks(ME,ended).forEach((b,n)=>setTimeout(()=>ask.ask(b),1600+n*50));
  }
  const PANELS=[['settings','settings-toggle'],['mood-panel','mood-toggle']];
  const closeOthers=keep=>{for(const [p,t] of PANELS)if(p!==keep){$(p).hidden=true;$(t).setAttribute('aria-expanded','false');}};
  function setMoodPanel(open){
    $('mood-panel').hidden=!open;$('mood-toggle').setAttribute('aria-expanded',String(open));
    if(open){closeOthers('mood-panel');sheets.hide();renderAsks();$('moods').querySelector('button')?.focus();}
    else $('mood-toggle').focus();
  }
  $('mood-toggle').onclick=()=>setMoodPanel($('mood-panel').hidden);$('mood-close').onclick=()=>setMoodPanel(false);
  $('settings-toggle').addEventListener('click',()=>{closeOthers('settings');sheets.hide();});
  $('planner-toggle').onclick=()=>{closeOthers(null);calendar.open();buddies.planner.reset(80);};
  const openBalance=(from,at)=>{closeOthers(null);balance.open(from,at);buddies.balance.reset(80);};
  $('balance-toggle').onclick=()=>openBalance($('balance-toggle'));
  $('shop-toggle').onclick=()=>{closeOthers(null);shop.open();buddies.shop.reset(80);};

  // ---- demo controls: time of day, golden window ------------------------------
  const showClock=()=>{$('clock').value=Math.round(clock.minutes);$('clock-value').value=fmt(clock.minutes);$('clock-live').checked=clock.live;};
  $('clock').oninput=e=>{clock.live=false;clock.minutes=+e.target.value;showClock();};
  $('clock-live').onchange=e=>{clock.live=e.target.checked;if(clock.live)clock.minutes=nowMinutes();showClock();};
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
    if(!id)return;
    const own=id===ME;
    for(const b of tables[id].blocks){
      if(!own&&b.vis==='hidden')continue;
      const el=document.createElement('div');el.className='ribbon-label';el.style.setProperty('--cat',CATEGORIES[b.cat].color);
      const what=own||b.vis==='open'?b.title:`${CATEGORIES[b.cat].label} · ${hours(b.mins)}`;
      const time=document.createElement('span');time.append(catImg(b.cat),fmt(b.start));
      el.append(time,Object.assign(document.createElement('strong'),{textContent:what}));
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
    $('reveal-icon').hidden=!next.cat;if(next.cat)$('reveal-icon').src=catImg(next.cat).src;
    $('reveal-kicker').textContent=(next.kicker??'').replace(/ · /g,'  ');$('reveal-title').textContent=next.title;
    // a line like "Social · 1.5 h · done" reads better as small chips
    const bits=String(next.sub??'').split(' · ').filter(Boolean);
    $('reveal-sub').replaceChildren(...(bits.length>1?bits.map(t=>mk('span',{className:'rv-chip',textContent:t}))
                                                    :[document.createTextNode(next.sub??'')]));
    $('reveal-action').hidden=!next.action;$('reveal-action-label').textContent=next.actionLabel??'View photo';
    $('reveal-alt').hidden=!next.alt;if(next.alt)$('reveal-alt').textContent=next.altLabel;
    $('reveal-letgo').hidden=!next.letGo;$('reveal-letgo').textContent=next.letGoLabel??'Let go';
    $('reveal-more').hidden=!next.more;if(next.more)$('reveal-more').textContent=next.moreLabel??'See why';
  }
  // Your own planned block, finished early: its card offers "Done", and the ghost takes root.
  const finish=b=>{plans.markDone(ME,b);notice(`${b.title} took root.`);};
  // Your own open blocks: Done once it has happened, Let go (after a gentle confirm) any time.
  const letGo=async b=>{if(await confirmLetGo(b.title)){plans.toggleSkip(ME,b);notice(`${b.title} drifted away. Bring it back from the planner any time.`);}};
  const withActions=(card,b)=>{
    const st=blockStatus(b,clock.minutes);if(!['planned','now','waiting'].includes(st))return card;
    return {...card,...(st==='waiting'?{action:()=>finish(b),actionLabel:'Done'}:{}),letGo:()=>letGo(b)};
  };
  $('reveal-action').onclick=()=>{card?.action?.();reveal(nearest());};
  $('reveal-letgo').onclick=()=>card?.letGo?.();
  $('reveal-more').onclick=()=>card?.more?.();
  $('reveal-alt').onclick=()=>{card?.alt?.();reveal(nearest());};   // redraw now, so the button always matches the idea shown
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
  // The gardener speaks up once per visit home while the windmill sign is up: a
  // bubble over their head with the same offer. "Not now", the offer itself, or a
  // few steps away close it; the sign keeps the offer. Leaving the island resets it.
  let bubble=null, bubbleSeen=false;   // bubble: where the gardener stood when it opened
  function gardenerBubble(){
    const home=getMode()==='walk'&&getSelected()===ME;
    if(!home){bubble=null;bubbleSeen=false;return null;}
    if(!nudgeOn||pastWeek){bubble=null;return null;}
    if(!bubbleSeen){bubbleSeen=true;bubble=player.position.clone();}
    if(bubble&&Math.hypot(player.position.x-bubble.x,player.position.z-bubble.z)>4)bubble=null;
    if(!bubble)return null;
    return nudgeCard('bubble','Your gardener',new T.Vector3(player.position.x,player.position.y+1.7,player.position.z),
                     ()=>{bubble=null;asking=false;notice('It’ll wait on the sign by the windmill.');});
  }
  function nearest(){
    const said=gardenerBubble();if(said)return said;
    if(getMode()!=='walk')return null;
    const here=islands.find(i=>i.id===getSelected());
    if(nudgeOn&&!pastWeek&&here?.id===ME&&Math.hypot(player.position.x-me.x-NUDGE_AT[0]*me.scale,player.position.z-me.z-NUDGE_AT[1]*me.scale)<3.2){
      const c=nudgeCard('nudge','From your island',new T.Vector3(me.x+NUDGE_AT[0]*me.scale,me.altitude+(me.field.height(...NUDGE_AT)??.35)*me.scale+2.4,me.z+NUDGE_AT[1]*me.scale));
      if(c)return c;
    }
    if(here?.owner&&Math.hypot(player.position.x-here.x-ARCH.x*here.scale,player.position.z-here.z-ARCH.z*here.scale)<3.9){
      const gy=here.altitude+(here.field.height(ARCH.x,ARCH.z)??.35)*here.scale;
      return {...gateCard(here),at:new T.Vector3(here.x+ARCH.x*here.scale,gy+5.6,here.z+ARCH.z*here.scale)};   // above the torii beam
    }
    // a lantern on the pier, within reach: whose feeling, and when
    if(here?.owner){const l=mood.near(here.id,player.position);if(l){
      const m=MOODS[l.entry.mood],whose=l.island.id===ME?'Your':`${l.island.owner}’s`;
      return {key:`ln${l.island.id}${l.entry.time}${l.entry.mood}`,color:m.color,kicker:l.entry.time!=null?`Checked in at ${fmt(l.entry.time)}`:'Today',
              title:`${whose} ${m.label.toLowerCase()} lantern`,sub:l.island.id===ME?'How you felt, hung on your pier':'How they felt today',
              ...(l.entry.photo?{action:()=>view({src:l.entry.photo,title:`${whose} ${m.label.toLowerCase()} lantern`,sub:'Today'}),actionLabel:'View photo'}:{}),
              at:l.g.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,1.4,0))};}}
    const table=tables[getSelected()];
    if(table){
      // a path stop wins; otherwise the nearest tree's activity (forest.js near)
      const own=getSelected()===ME, n=table.near(player.position,4.5);
      if(!n){
        const c=forest.near(getSelected(),player.position);
        // a ghost of one of today's blocks: forest.js keys its card g<id><status>
        const b=own&&c&&table.blocks.find(b=>c.key===`g${b.id}${blockStatus(b,clock.minutes)}`);
        return b?withActions(c,b):c;
      }
      const b=n.block, open=own||b.vis==='open', st=blockStatus(b,clock.minutes);
      const c={key:`b${b.id}${st}`,color:CATEGORIES[b.cat].color,cat:b.cat,kicker:`${fmt(b.start)}–${fmt(b.start+b.mins)}`,
               title:open?b.title:CATEGORIES[b.cat].label,sub:`${open?CATEGORIES[b.cat].label+' · ':''}${hours(b.mins)} · ${STATUS[st]}`};
      return own?withActions(c,b):c;
    }
    if(getSelected()===community.id){
      const p=photos.near(player.position,11);   // the carousel stands on the deck; reachable from the pond's edge
      if(p){
        const n=photos.items.length, g=photos.items.filter(i=>i.golden).length;
        return {key:`carousel${n}.${g}`,kicker:'The carousel',title:`${n} ${n===1?'moment':'moments'} today`,
                sub:g?`${g} from the golden window`:'The golden window hasn’t rung yet',action:photos.openAlbum,actionLabel:'Open the album',at:p.at};
      }
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

  // ---- past islands: every Monday your island starts fresh, and earlier weeks
  // can be walked again with that week's trees, height and sky. Signed in only:
  // the demo has no earlier weeks of its own.
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayMonth=date=>{const d=fromIso(date);return `${d.getDate()} ${MON[d.getMonth()]}`;};
  const weekRange=monday=>`${dayMonth(monday)} – ${dayMonth(addDays(monday,6))}`;
  function weekOf(monday){
    const blocks=plans.range(ME,monday,7).filter(b=>!b.skipped)
      .map((b,n)=>({id:`p${monday}${n}`,day:daysBetween(b.date,TODAY),cat:b.cat,mins:b.mins,title:b.title,vis:b.vis}));
    const end=daysBetween(addDays(monday,6),TODAY), lanterns=checkins[ME].filter(c=>c.day>=end&&c.day<end+7);
    // that week's sky as it stood on its Sunday evening
    const strain=deriveStrain(checkins[ME].filter(c=>c.day>=end).map(c=>({...c,day:c.day-end})));
    return {monday,blocks,lanterns,strain,sink:weekReading(ME,monday).sink};
  }
  function pastMondays(){
    const first=mondayOf(world.started??TODAY), out=[];
    for(let w=1;w<=6;w++){const m=addDays(mondayOf(TODAY),-7*w);if(m<first)break;out.push(m);}
    return out;
  }
  function openPast(){
    const weeks=pastMondays().map(weekOf);
    $('past-list').replaceChildren(...(weeks.length?weeks.map(w=>{
      const b=mk('button',{type:'button'},mk('strong',{textContent:weekRange(w.monday)}),
        mk('span',{textContent:`${shortBand(w.sink)} · ${w.lanterns.length?weatherLabel(w.strain):'no lanterns'} · ${plural(w.blocks.length,'tree')}`}));
      b.onclick=()=>showPast(w);
      return mk('li',{},b);
    }):[mk('li',{className:'past-empty',textContent:'No earlier weeks yet. Next Monday, this one will be here.'})]));
    $('past-dialog').showModal();
  }
  function showPast(w){
    $('past-dialog').close();
    if(getMode()!=='walk'||getSelected()!==ME)visit(ME);
    if(lifted)setLift(null);
    pastWeek=w;
    forest.past(ME,w.blocks,daysBetween(w.monday,TODAY)*7919+13);forest.grow(ME);
    tables[ME].show(false);mood.show(ME,false);
    setAltitude(ME,altitudeFromLoad(w.sink));setStrain(me,w.strain);
    $('past-label').textContent=`Your island, ${weekRange(w.monday)}`;$('past-banner').hidden=false;
  }
  function showPresent(){
    if(!pastWeek)return;
    pastWeek=null;forest.present(ME);tables[ME].show(true);mood.show(ME,true);
    settle(ME);weather(me);$('past-banner').hidden=true;
  }
  $('mi-past').onclick=openPast;
  $('past-close').onclick=()=>$('past-dialog').close();
  $('past-back').onclick=showPresent;

  // ---- a signed-in sky: your sky's panel, live updates, links from phone prompts ----
  mountSkyPanel(world,notice);
  $('demo-controls').hidden=LIVE;
  if(LIVE){
    backend.listen(world,{
      status:(id,r)=>{status[id]={sink:r.sink,strain:r.strain};settle(id);},
      checkin:(id,entry)=>{
        checkins[id].push(entry);const i=members.find(m=>m.id===id);
        mood.checkIn(i,entry,null);weather(i);notice(`A ${MOODS[entry.mood].label.toLowerCase()} lantern lights up on ${i.owner}’s pier.`);
      },
      note:n=>{NOTES.push(n);syncNotes();notice(`${owners[n.from]} left a note at your gate.`);},
      moment:m=>photos.receive(m),
      golden:g=>photos.schedule(g.opensAt),
      task:t=>{TASKS.unshift(t);renderTasks();},
      taskMember:(taskId,id,photo)=>{
        const t=TASKS.find(t=>t.id===taskId);if(!t)return;
        if(!t.joined.includes(id))t.joined.push(id);
        if(photo!==undefined)t.done[id]=photo;
        renderTasks();
      },
      purchase:(id,item)=>{if(!itemById(item))return;gardens[id]?.add(item,{fresh:true});notice(`${owners[id]} grew ${itemById(item).called} on their island.`);},
      membersChanged:()=>notice('Someone new joined your sky. Reload to see their island.'),
    });
  }
  // a phone prompt opens the app on its question: ?ask=drain&block=..&date=.. or ?ask=mood
  const params=new URLSearchParams(location.search);
  if(params.get('ask')==='mood')setTimeout(()=>setMoodPanel(true),1200);
  if(params.get('ask')==='drain'){
    const b=plans.on(ME,params.get('date')??TODAY).find(b=>String(b.series?.id??b.id)===params.get('block'));
    if(b)setTimeout(()=>ask.ask(b),1200);
  }
  // the golden window's notification opens the camera: ?golden on a fresh load,
  // or a message from the service worker when the island was already open
  const shareGolden=()=>{if(!$('capture').open)photos.capture();};
  if(params.has('golden'))setTimeout(shareGolden,1200);
  navigator.serviceWorker?.addEventListener('message',e=>{
    if(e.data?.open&&new URL(e.data.open).searchParams.has('golden'))shareGolden();
  });
  // back from Google: connected, you're taken home and your week so far grows
  // in, Monday's trees first; otherwise the planner's sync dialog says what happened
  const cal=params.get('calendar');
  if(cal==='connected'&&LIVE)setTimeout(()=>{
    visit(ME);
    setTimeout(()=>{const n=forest.grow(ME);
      notice(n?`Google Calendar is connected. Your week so far grew in: ${plural(n,'tree')}.`:'Google Calendar is connected. Your plans are on your island.');},1400);
  },900);
  else if(cal)setTimeout(()=>{calendar.open('week');calendar.openSync(cal);},900);
  if(params.has('ask')||params.has('calendar')||params.has('join')||params.has('golden'))history.replaceState(null,'',location.pathname);
  // Once a day, the first time you open the island: what today holds, in words.
  try{
    const key=`island-morning-${ME}`, day=forecast(ME,TODAY);
    if(day&&localStorage.getItem(key)!==TODAY&&clock.minutes<17*60){
      localStorage.setItem(key,TODAY);
      const n=plans.on(ME,TODAY).filter(b=>!b.skipped).length;
      if(n)setTimeout(()=>notice(`Today: ${FORECAST_WORDS[day.label].toLowerCase()}. ${n} thing${n===1?'':'s'} planned.`),4200);
    }
  }catch{}

  // ---- per frame --------------------------------------------------------------------
  let lastSelected=null,lastMode=null,lastMinute=-1,chips='',lastDew=null,slowIn=0,ribbonO=-1;
  const v=new T.Vector3(), rv=new T.Vector3(), bv=new T.Vector3();
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  return {
    update(dt,elapsed,motion){
      if(clock.live)clock.minutes=nowMinutes();
      const minute=Math.floor(clock.minutes);
      if(minute!==lastMinute){lastMinute=minute;showClock();settleFriends();calendar.render();refreshGardener();renderAsks();}
      const mode=getMode(), selected=getSelected(), moved=mode!==lastMode||selected!==lastSelected;
      if(moved){
        if(lifted&&(mode!=='walk'||selected!==lifted))setLift(null);
        if(pastWeek&&(mode!=='walk'||selected!==ME))showPresent();
        // a visit warms that friend's bridge a little, once a session
        if(mode==='walk'&&selected!==ME&&tables[selected]&&!visited.has(selected)){visited.add(selected);warm(selected,.3);}
        lastMode=mode;lastSelected=selected;
      }
      // The card, the board and the nudge only change when the plan does, so
      // they are checked a few times a second rather than every frame.
      slowIn-=dt;
      if(moved||slowIn<=0){slowIn=.2;
      // bottom left: what friends can see of the island you're on; from the sky
      // and at home it's your own, and each row opens your balance
      const shown=mode==='walk'?islands.find(i=>i.id===selected):me, drops=dew();
      const panel=shown===me?islandPanel():null;
      const key=`${shown?.id}|${shown?.weather}|${Math.round((shown?.strain??0)*60)}|${Math.round(shown?.altitude??0)}`
        +`|${JSON.stringify(panel)}|${drops}|${photos.items.length}|${TASKS.reduce((a,t)=>a+finishers(t).length,0)}`;
      if(key!==chips){
        chips=key;
        renderCard(shown,panel);
        $('dew-chip').textContent=`💧 ${drops}`;$('dew-chip').title=`${drops} dewdrops`;
        shop.render();
      }
      // dewdrops earned: the badge pulses and the gain floats up from it
      if(lastDew!==null&&drops>lastDew){
        const chip=$('dew-chip'), float=Object.assign(document.createElement('span'),{className:'dew-float',textContent:`+${drops-lastDew} 💧`});
        chip.classList.remove('gain');void chip.offsetWidth;chip.classList.add('gain');chip.append(float);setTimeout(()=>float.remove(),1500);
      }
      // ...and spent: it dips, and the cost drifts down out of it
      else if(lastDew!==null&&drops<lastDew){
        const chip=$('dew-chip'), float=Object.assign(document.createElement('span'),{className:'dew-float spend',textContent:`−${lastDew-drops} 💧`});
        chip.classList.remove('spend');void chip.offsetWidth;chip.classList.add('spend');chip.append(float);setTimeout(()=>float.remove(),1500);
      }
      lastDew=drops;
      writeBoard();checkNudge();
      }
      for(const w of windmills)w.update(dt,motion);
      setGardenDusk(clock.minutes);for(const g of Object.values(gardens))g.update(elapsed,motion);
      for(const t of Object.values(tables))t.update(clock.minutes,elapsed,dt,camera,motion);
      mood.update(elapsed,dt,motion);photos.update(elapsed,motion);
      const table=lifted&&tables[lifted];
      const ro=table?Math.max(0,table.lift*4-3):0;
      if(ro!==ribbonO){ribbonO=ro;$('ribbon-labels').style.opacity=ro;}
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
      garden:id=>gardens[id??ME]?.items()??null,
      dew,
      checkIn,
      lift:id=>setLift(id??null),
      liftAmount:()=>Math.max(0,...Object.values(tables).map(t=>t.lift)),   // 0..1, eased: how far a timetable is lifted
      openPlanner:tab=>{calendar.open(tab);buddies.planner.reset(80);},
      openBalance:()=>{balance.open();buddies.balance.reset(80);},
      markDone:id=>{const b=tables[ME].blocks.find(b=>String(b.id)===String(id));if(b)finish(b);},
      // "Restore this evening": altitude and weather back to what the plan and check-ins say
      resettle:()=>{members.forEach(i=>{settle(i.id);weather(i);delete warmth[i.id];warm(i.id);});},
      photos:()=>photos.items.map(i=>({member:i.member.id,time:i.time,golden:i.golden,caption:i.caption,hung:!!i.pivot})),
      openAlbum:()=>photos.openAlbum(),
      nudge:()=>({on:nudgeOn,taken:nudgeTaken,why:nudgeWhy,idea:idea()?.title,bubble:!!bubble,x:me.x+NUDGE_AT[0]*me.scale,z:me.z+NUDGE_AT[1]*me.scale}),
    },
  };
}
