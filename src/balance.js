import { CATEGORIES, CAPACITY, TRENDS, MOODS, hours, weatherLabel } from './data.js';
import { TODAY, addDays, mondayOf, dow } from './plan.js';

// The balance sheet: analysis plus solutions for your own week. The avatar
// stands at its edge looking at the readout (it never speaks or advises).
// Every suggestion is an action; applying one edits the plan, and the path,
// ghost trees and altitude behind the sheet rebalance at once.
// Tone: surfacing, never diagnosing; suggesting, never scolding.
const $=id=>document.getElementById(id);
const SHOWN=['study','work','errands','social','exercise','rest'];
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const h1=h=>`${+h.toFixed(1)} h`;
const list=parts=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;

export function createBalance({plans,me,friends,clock,checkins,sheets,notice,avatar,dew}){
  const sheet=$('balance-sheet'), owner=me.id, cap=CAPACITY[owner];
  $('balance-avatar').src=avatar;
  const ended=b=>b.date<TODAY||(b.date===TODAY&&b.start+b.mins<=clock.minutes);
  const ahead=b=>b.date>TODAY||(b.date===TODAY&&b.start>=clock.minutes);
  const when=day=>day===TODAY?'tonight':day===addDays(TODAY,1)?'tomorrow':`on ${DAYS[dow(day)-1]}`;
  let current=[];
  const applied=new Set();

  // three scripted suggestions for the v1 demo: rebalance, rest, social
  function suggest(){
    const week=plans.week(owner).filter(b=>!b.skipped), monday=mondayOf(TODAY), out=[];
    const lows=week.filter(b=>b.priority==='low'&&ahead(b)).slice(0,2);
    out.push(lows.length
      ?{key:'rebalance',text:`Push ${list(lows.map(b=>`“${b.title}”`))} to next week`,
        sub:`Frees ${h1(lows.reduce((a,b)=>a+b.mins,0)/60)}. ${lows.length>1?'Both':'It'} can wait.`,
        apply:()=>lows.forEach(b=>plans.shift(owner,b,7)),done:'Moved to next week.'}
      :{key:'rebalance',text:'Nothing left this week that can wait',sub:'Your plan is already as light as it goes.'});
    let evening=null;
    for(let day=TODAY;day<=addDays(monday,6)&&!evening;day=addDays(day,1)){
      if(day===TODAY&&clock.minutes>20*60+30)continue;
      if(!plans.on(owner,day).some(b=>!b.skipped&&b.start<21*60+30&&b.start+b.mins>20*60+30))evening=day;
    }
    const rest=plans.hours(week.filter(b=>b.cat==='rest'));
    out.push(evening
      ?{key:'rest',text:`Add a slow evening ${when(evening)}, 20:30`,
        sub:rest<2?'Your rest grove has been quiet this week 🌿':'A pause before the week closes.',
        apply:()=>plans.add(owner,{date:evening,start:20*60+30,mins:60,cat:'rest',title:'Slow evening',vis:'hidden'}),done:'A slow evening is on your plan.'}
      :{key:'rest',text:'Keep one evening free next week',sub:'Every evening this week is already spoken for.'});
    const friend=friends[0], sat=addDays(monday,5)>=TODAY?addDays(monday,5):addDays(monday,12);
    out.push({key:'social',text:`Invite ${friend.owner} for a walk ${sat===addDays(monday,5)?'this':'next'} Saturday`,
      sub:'A little warmth across the bridge.',
      apply:()=>plans.add(owner,{date:sat,start:10*60,mins:60,cat:'social',title:`Walk with ${friend.owner}`,vis:'open'}),
      done:`Walk with ${friend.owner} added for Saturday.`});
    return out;
  }

  function trend(values){
    const w=132,h=36,p=5,max=Math.max(cap,...values),y=v=>h-p-v/max*(h-2*p);
    const pts=values.map((v,i)=>[p+i*(w-2*p)/(values.length-1),y(v)]);
    $('bal-trend').innerHTML=`<line class="cap" x1="${p}" x2="${w-p}" y1="${y(cap)}" y2="${y(cap)}"/>`+
      `<polyline points="${pts.map(q=>q.join(',')).join(' ')}"/>`+pts.map((q,i)=>`<circle cx="${q[0]}" cy="${q[1]}" r="${i===pts.length-1?3.2:2}"/>`).join('');
    $('bal-trend').setAttribute('aria-label',`Committed hours, last four weeks: ${values.join(', ')}. Dashed line: your ${cap} hours.`);
  }
  function chart(week){
    const cats=SHOWN.concat(week.some(b=>b.cat==='other'&&!b.skipped)?['other']:[]);
    const rows=cats.map(c=>{const bl=week.filter(b=>b.cat===c&&!b.skipped);return {c,planned:plans.hours(bl),done:plans.hours(bl.filter(ended))};});
    const max=Math.max(4,...rows.map(r=>r.planned));
    $('bal-chart').replaceChildren(...rows.map(r=>{
      const row=el('div',{className:'bal-row'},el('span',{className:'bal-label',textContent:CATEGORIES[r.c].label}),
        el('span',{className:'bal-track'},el('i',{className:'bal-planned',style:`width:${r.planned/max*100}%`}),el('i',{className:'bal-done',style:`width:${r.done/max*100}%`})),
        el('span',{className:'bal-note',textContent:r.planned?`${h1(r.done)} of ${h1(r.planned)}`:'quiet this week'}));
      row.style.setProperty('--cat',CATEGORIES[r.c].color);return row;
    }));
  }
  function weatherLine(week,load){
    const heavy=checkins.filter(c=>c.day<=4&&MOODS[c.mood].strain>0).length;
    const late=week.filter(b=>!b.skipped&&b.start+b.mins>=21*60+30).length;
    const bits=[];
    if(heavy)bits.push(heavy===1?'one heavier day':heavy<4?'a few low-mood days':'a run of low-mood days');
    if(late)bits.push(late===1?'one late night':late===2?'two late nights':'several late nights');
    if(load>.8)bits.push('a very full week');
    const label=weatherLabel(me.strain??0);
    return bits.length?`${label}: ${list(bits)} this week.`:`${label}: steady days, and room to breathe.`;
  }
  function renderList(){
    $('bal-suggest').replaceChildren(...current.map(s=>{
      const done=applied.has(s.key);
      const btn=el('button',{type:'button',className:'bal-apply',textContent:done?'Done ✓':'Apply',disabled:done||!s.apply});
      btn.onclick=()=>{s.apply();applied.add(s.key);notice(s.done);render();};
      return el('li',{className:done?'done':''},el('div',{},el('strong',{textContent:s.text}),el('span',{textContent:s.sub})),btn);
    }));
  }
  function render(){
    if(sheet.hidden)return;
    const week=plans.week(owner), h=plans.hours(week), load=h/cap;
    $('bal-load').textContent=`${Math.round(h)} / ${cap} hrs committed · ${Math.round(load*100)}%`;
    $('bal-band').textContent=load<.35?'Floating high: plenty of open sky':load<.7?'Mid-sky: full, but breathing':'Low, close to the cloud sea';
    trend(TRENDS[owner].concat(Math.round(h)));
    chart(week);
    $('bal-weather').textContent=weatherLine(week,load);
    renderList();
    $('bal-dew').textContent=`💧 ${dew()} dewdrops, a slow drip from finished blocks and golden-window moments. They grew the windmill in the middle of your island.`;
  }
  return {
    open(from){current=suggest();applied.clear();sheets.show(sheet,from??$('balance-toggle'));render();},
    render,
  };
}
