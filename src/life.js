import * as T from 'three';
import { ME, DAWN, NIGHT, CATEGORIES, MOODS, CHECKINS, CAPACITY, WARMTH, fmt, hours, toMin,
         deriveStrain, weatherLabel, loadFromAltitude, altitudeFromLoad } from './data.js';
import { plans, TODAY } from './plan.js';
import { createTimetable, blockStatus } from './timetable.js';
import { createMood } from './mood.js';
import { createPhotoLake, loadSquare } from './photos.js';
import { createSheets } from './sheets.js';
import { createCalendar } from './calendar.js';
import { createBalance } from './balance.js';
import { createNoticeBoard, createWindmill } from './decor.js';
import { createBuddy } from './buddy.js';

// Everything PRODUCT.md asks the world to *mean*: the timetable path and wisp,
// emotion lanterns, weather and altitude from the plan, the shared photo
// lake, proximity reveal, and the planner and balance sheets. main.js calls
// initLife() once the islands exist, then life.update() every frame.
const $=id=>document.getElementById(id);
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go'};
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};

// Weather is one strain value (0..1); the label is only a name for where it sits.
export const setStrain=(island,s)=>{island.strain=s;island.weather=weatherLabel(s);island.weatherFx.setStrain(s);};

export function initLife({islands,camera,texture,player,notice,visit,nearTree,getMode,getSelected,setAltitude,setGlow}){
  const me=islands.find(i=>i.id===ME), members=islands.filter(i=>i.owner), community=islands.find(i=>!i.owner);
  // Real time by default; outside the day the path would be empty, so start the demo mid-afternoon.
  const clock={live:true,minutes:nowMinutes()};
  if(clock.minutes<DAWN+30||clock.minutes>NIGHT-30){clock.live=false;clock.minutes=toMin('14:30');}

  // ---- world ---------------------------------------------------------------
  const tables={};
  for(const i of members)tables[i.id]=createTimetable(i,{texture,own:i.id===ME,blocks:plans.on(i.id,TODAY)});
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
  // the gathering island's notice board carries shared news only
  const board=createNoticeBoard(community,{at:[3.4,2.6],face:1.11});   // faces the pond and the arrival spot
  let boardKey='';
  const writeBoard=()=>{
    const {open,rung}=photos.status, n=photos.items.length, key=`${open}${rung}${n}`;
    if(key===boardKey)return;boardKey=key;
    board.write(['The gathering tree',
      open?'✦ The golden window is open':rung?`✦ ${n} moment${n===1?'':'s'} on the deck today`:'✦ The golden window comes by surprise',
      'Saturday: picnic on the deck, all welcome','Bridges glow when friends visit']);
  };
  writeBoard();
  // Dewdrops: a slow drip from finished blocks and golden-window moments,
  // spent on decorations -- v1 shows the windmill they grew, at the hub of
  // the clock-face path. They never touch load or stress.
  const windmill=createWindmill(me,{face:-2.35});
  const dew=()=>36+plans.week(ME).filter(b=>!b.skipped&&(b.done||b.date<TODAY||(b.date===TODAY&&b.start+b.mins<=clock.minutes))).length
                  +(photos.items.some(i=>i.member.id===ME)?3:0);
  const loadText=i=>{
    const cap=CAPACITY[i.id];if(!cap)return '';
    const h=Math.round(loadFromAltitude(i.altitude)*cap);
    return `${h} / ${cap} hrs · ${Math.round(h/cap*100)}%`;
  };

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
  const buddies={planner:sheetBuddy($('planner-sheet')),balance:sheetBuddy($('balance-sheet'))};
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
  for(const id of ['balance-toggle','load','weather-chip','dew-chip'])$(id).onclick=()=>{closeOthers(null);balance.open($(id));buddies.balance.reset(80);};

  // ---- demo controls: time of day, golden window ------------------------------
  const showClock=()=>{$('clock').value=Math.round(clock.minutes);$('clock-value').value=fmt(clock.minutes);$('clock-live').checked=clock.live;};
  $('clock').oninput=e=>{clock.live=false;clock.minutes=+e.target.value;showClock();};
  $('clock-live').onchange=e=>{clock.live=e.target.checked;if(clock.live)clock.minutes=nowMinutes();showClock();};
  $('golden-ring').onclick=()=>photos.ring();
  showClock();

  // ---- schedule: lift the path into a readable ribbon ----------------------------
  let lifted=null;
  const labels=[];
  // on the lifted timetable your gardener starts at "now"; walk it through the
  // day with ← →, and the block it stands on lights up
  const w0=new T.Vector3();
  let ribbonTable=null;
  const ribbonBuddy=createBuddy($('ribbon-labels'),{height:84,speed:110,place:(el,m,lift,walking)=>{
    m=Math.max(DAWN,Math.min(NIGHT,m));if(!ribbonTable)return m;
    ribbonTable.ribbonPoint(m,-1.3,w0).project(camera);
    el.style.left=`${(w0.x*.5+.5)*innerWidth}px`;el.style.top=`${(-w0.y*.5+.5)*innerHeight}px`;
    el.style.translate=`-50% calc(-100% + 4px - ${lift}px)`;el.classList.toggle('walking',walking);return m;
  }});
  ribbonBuddy.el.classList.add('ribbon-buddy');
  function setLift(id){
    if(lifted&&lifted!==id)tables[lifted].setLift(false);
    lifted=id;if(id)tables[id].setLift(true);
    $('schedule').setAttribute('aria-pressed',String(!!id));
    $('ribbon-labels').replaceChildren(ribbonBuddy.el);labels.length=0;
    ribbonTable=id?tables[id]:null;
    if(getMode()==='walk')$('mode-hint').textContent=id?'← → walk through your day · Space jump · Q E turn · Schedule to lower it'
                                                        :'WASD to walk · Space to jump · Drag to look around · Esc for sky view';
    if(!id)return;
    ribbonBuddy.reset(clock.minutes);
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
  const activeBuddy=()=>!$('planner-sheet').hidden?buddies.planner:!$('balance-sheet').hidden?buddies.balance
                       :lifted&&tables[lifted].lift>.75?ribbonBuddy:null;
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
    const key=next?.key??null;if(key===(card?.key??null))return;card=next;
    $('reveal').hidden=!next;if(!next)return;
    $('reveal').style.setProperty('--cat',next.color??'');
    $('reveal-kicker').textContent=next.kicker;$('reveal-title').textContent=next.title;$('reveal-sub').textContent=next.sub;
    $('reveal-action').hidden=!next.action;$('reveal-action-label').textContent=next.actionLabel??'View photo';
  }
  // Your own planned block, finished early: its card offers "Done", and the ghost takes root.
  const finish=b=>{plans.markDone(ME,b);notice(`${b.title} took root.`);};
  const withDone=(card,b)=>['planned','now'].includes(blockStatus(b,clock.minutes))?{...card,action:()=>finish(b),actionLabel:'Done'}:card;
  $('reveal-action').onclick=()=>card?.action?.();
  window.addEventListener('keydown',e=>{
    if(e.code!=='KeyE'||!card?.action||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;
    card.action();
  });
  function nearest(){
    if(getMode()!=='walk')return null;
    const table=tables[getSelected()];
    if(table){
      // a path stop wins; otherwise the nearest tree's activity (main.js nearTree)
      const own=getSelected()===ME, n=table.near(player.position,4.5);
      if(!n){
        const c=nearTree?.(getSelected(),player.position)??null;
        // a ghost of one of today's blocks: forest.js keys its card g<id><status>
        const b=own&&c&&table.blocks.find(b=>c.key===`g${b.id}${blockStatus(b,clock.minutes)}`);
        return b?withDone(c,b):c;
      }
      const b=n.block, open=own||b.vis==='open', st=blockStatus(b,clock.minutes);
      const c={key:`b${b.id}${st}`,color:CATEGORIES[b.cat].color,kicker:`${fmt(b.start)}–${fmt(b.start+b.mins)}`,
               title:open?b.title:CATEGORIES[b.cat].label,sub:`${open?CATEGORIES[b.cat].label+' · ':''}${hours(b.mins)} · ${STATUS[st]}`};
      return own?withDone(c,b):c;
    }
    if(getSelected()===community.id){
      const p=photos.near(player.position,8);if(!p)return null;
      return {key:`p${p.item.member.id}`,kicker:'On the lake',title:p.item.member.id===ME?'Your moment':`${p.item.member.owner}’s moment`,
              sub:`${fmt(p.item.time)}${p.item.late?' · a little late':''}`,action:p.view,actionLabel:'View photo'};
    }
    return null;
  }

  // ---- per frame --------------------------------------------------------------------
  let lastSelected=null,lastMode=null,lastMinute=-1,chips='',lastDew=null;
  const v=new T.Vector3();
  return {
    update(dt,elapsed,motion){
      if(clock.live)clock.minutes=nowMinutes();
      const minute=Math.floor(clock.minutes);
      if(minute!==lastMinute){lastMinute=minute;showClock();calendar.render();}
      const mode=getMode(), selected=getSelected();
      if(mode!==lastMode||selected!==lastSelected){
        if(lifted&&(mode!=='walk'||selected!==lifted))setLift(null);
        lastMode=mode;lastSelected=selected;
      }
      // footer chips: the visited island's load and weather, your own from the sky;
      // only your own open the balance sheet
      const shown=mode==='walk'?islands.find(i=>i.id===selected):me, load=shown?.owner?loadText(shown):'';
      const drops=dew(), dewText=shown===me?`💧 ${drops} dewdrops`:'', key=`${load}|${shown?.weather}|${shown===me}|${dewText}`;
      if(key!==chips){
        chips=key;
        for(const [id,text] of [['load',load],['weather-chip',shown?.weather??'']]){
          const c=$(id);c.hidden=!load;c.textContent=text;c.disabled=shown!==me;
          c.title=shown===me?'Open your balance':`${shown?.owner}’s ${id==='load'?'week':'weather'}`;
        }
        $('dew-chip').hidden=!dewText;$('dew-chip').textContent=dewText;
      }
      // dewdrops earned: the badge pulses and the gain floats up from it
      if(lastDew!==null&&drops>lastDew&&dewText){
        const chip=$('dew-chip'), float=Object.assign(document.createElement('span'),{className:'dew-float',textContent:`+${drops-lastDew} 💧`});
        chip.classList.remove('gain');void chip.offsetWidth;chip.classList.add('gain');chip.append(float);setTimeout(()=>float.remove(),1500);
      }
      lastDew=drops;
      windmill.update(dt,motion);writeBoard();
      for(const t of Object.values(tables))t.update(clock.minutes,elapsed,dt,camera,motion);
      mood.update(elapsed,dt,motion);photos.update(elapsed,camera,motion);
      const table=lifted&&tables[lifted];
      $('ribbon-labels').style.opacity=table?Math.max(0,table.lift*4-3):0;
      if(table&&table.lift>.75){
        labels.forEach(({el,block},i)=>{
          table.ribbonPoint(block.start+block.mins/2,.35+(i%2)*1.1,v).project(camera);
          el.style.left=`${(v.x*.5+.5)*innerWidth}px`;el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;
        });
        const at=ribbonBuddy.step(dt);
        labels.forEach(({el,block})=>el.classList.toggle('here',at>=block.start&&at<block.start+block.mins));
      }
      if(!$('planner-sheet').hidden)buddies.planner.step(dt);
      if(!$('balance-sheet').hidden)buddies.balance.step(dt);
      reveal(lifted?null:nearest());
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
