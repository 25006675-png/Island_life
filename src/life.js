import * as T from 'three';
import { ME, DAWN, NIGHT, CATEGORIES, MOODS, CHECKINS, CAPACITY, fmt, hours, toMin,
         deriveStrain, weatherLabel, loadFromAltitude, altitudeFromLoad } from './data.js';
import { plans, TODAY } from './plan.js';
import { createTimetable, blockStatus } from './timetable.js';
import { createMood } from './mood.js';
import { createPhotoLake, loadSquare } from './photos.js';
import { createSheets } from './sheets.js';
import { createCalendar } from './calendar.js';
import { createBalance } from './balance.js';

// Everything PRODUCT.md asks the world to *mean*: the timetable path and wisp,
// emotion lanterns, weather and altitude from the plan, the shared photo
// lake, proximity reveal, and the planner and balance sheets. main.js calls
// initLife() once the islands exist, then life.update() every frame.
const $=id=>document.getElementById(id);
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go'};
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};

// Weather is one strain value (0..1); the label is only a name for where it sits.
export const setStrain=(island,s)=>{island.strain=s;island.weather=weatherLabel(s);island.weatherFx.setStrain(s);};

export function initLife({islands,camera,texture,player,notice,visit,nearTree,getMode,getSelected,setAltitude}){
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
  const checkins=Object.fromEntries(members.map(i=>[i.id,[...(CHECKINS[i.id]??[])]]));
  const weather=i=>{i.derivedStrain=deriveStrain(checkins[i.id],loadFromAltitude(i.altitude));setStrain(i,i.derivedStrain);};
  members.forEach(weather);
  const mood=createMood(texture);
  for(const i of members)mood.addIsland(i,checkins[i.id]);
  const photos=createPhotoLake({island:community,texture,members:members.map(({id,owner})=>({id,owner})),me:ME,notice,view,time:()=>clock.minutes});
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
  const balance=createBalance({plans,me,friends:members.filter(i=>i.id!==ME),clock,checkins:checkins[ME],sheets,notice,
    avatar:`${import.meta.env.BASE_URL}assets/avatar.png`});
  // any plan edit re-draws that island's path, settles its altitude, refreshes the sheets
  plans.onChange(id=>{
    tables[id]?.setBlocks(plans.on(id,TODAY));settle(id);
    if(lifted===id)setLift(id);
    if(id===ME){calendar.render();balance.render();}
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
  $('planner-toggle').onclick=()=>{closeOthers(null);calendar.open();};
  for(const id of ['balance-toggle','load','weather-chip'])$(id).onclick=()=>{closeOthers(null);balance.open($(id));};

  // ---- demo controls: time of day, golden window ------------------------------
  const showClock=()=>{$('clock').value=Math.round(clock.minutes);$('clock-value').value=fmt(clock.minutes);$('clock-live').checked=clock.live;};
  $('clock').oninput=e=>{clock.live=false;clock.minutes=+e.target.value;showClock();};
  $('clock-live').onchange=e=>{clock.live=e.target.checked;if(clock.live)clock.minutes=nowMinutes();showClock();};
  $('golden-ring').onclick=()=>photos.ring();
  showClock();

  // ---- schedule: lift the path into a readable ribbon ----------------------------
  let lifted=null;
  const labels=[];
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
      el.append(Object.assign(document.createElement('span'),{textContent:fmt(b.start)}),Object.assign(document.createElement('strong'),{textContent:what}));
      $('ribbon-labels').append(el);labels.push({el,block:b});
    }
  }
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
    $('reveal-action').hidden=!next.action;
  }
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
      const n=table.near(player.position,4.5);if(!n)return nearTree?.(getSelected(),player.position)??null;
      const b=n.block, own=getSelected()===ME, open=own||b.vis==='open';
      return {key:`b${b.id}${b.skipped}`,color:CATEGORIES[b.cat].color,kicker:`${fmt(b.start)}–${fmt(b.start+b.mins)}`,
              title:open?b.title:CATEGORIES[b.cat].label,sub:`${open?CATEGORIES[b.cat].label+' · ':''}${hours(b.mins)} · ${STATUS[blockStatus(b,clock.minutes)]}`};
    }
    if(getSelected()===community.id){
      const p=photos.near(player.position,8);if(!p)return null;
      return {key:`p${p.item.member.id}`,kicker:'On the lake',title:p.item.member.id===ME?'Your moment':`${p.item.member.owner}’s moment`,
              sub:`${fmt(p.item.time)}${p.item.late?' · a little late':''}`,action:p.view};
    }
    return null;
  }

  // ---- per frame --------------------------------------------------------------------
  let lastSelected=null,lastMode=null,lastMinute=-1,chips='';
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
      const key=`${load}|${shown?.weather}|${shown===me}`;
      if(key!==chips){
        chips=key;
        for(const [id,text] of [['load',load],['weather-chip',shown?.weather??'']]){
          const c=$(id);c.hidden=!load;c.textContent=text;c.disabled=shown!==me;
          c.title=shown===me?'Open your balance':`${shown?.owner}’s ${id==='load'?'week':'weather'}`;
        }
      }
      for(const t of Object.values(tables))t.update(clock.minutes,elapsed,dt,camera,motion);
      mood.update(elapsed,dt,motion);photos.update(elapsed,camera,motion);
      const table=lifted&&tables[lifted];
      $('ribbon-labels').style.opacity=table?Math.max(0,table.lift*4-3):0;
      if(table&&table.lift>.75)labels.forEach(({el,block},i)=>{
        table.ribbonPoint(block.start+block.mins/2,.35+(i%2)*1.1,v).project(camera);
        el.style.left=`${(v.x*.5+.5)*innerWidth}px`;el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;
      });
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
      openPlanner:tab=>calendar.open(tab),
      openBalance:()=>balance.open(),
      // "Restore this evening": altitude and weather back to what the plan and check-ins say
      resettle:()=>{members.forEach(i=>settle(i.id));members.forEach(weather);},
      photos:()=>photos.items.map(i=>({member:i.member.id,time:i.time,late:i.late})),
    },
  };
}
