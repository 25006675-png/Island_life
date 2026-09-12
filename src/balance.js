import { CATEGORIES, CAPACITY, TRENDS, MOODS, hours, weatherLabel, fullness, catImg, WEEK } from './data.js';
import { TODAY, addDays, mondayOf, dow, fromIso, daysBetween } from './plan.js';

// The balance sheet: analysis plus solutions for your own week. Your gardener
// walks along its top edge (buddy.js; it never speaks or advises).
// Every suggestion is an action; applying one edits the plan, and the path,
// ghost trees and altitude behind the sheet rebalance at once.
// Tone: surfacing, never diagnosing; suggesting, never scolding.
const $=id=>document.getElementById(id);
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const h1=h=>`${+h.toFixed(1)} h`;
const list=parts=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;

export function createBalance({plans,me,friends,clock,checkins,sheets,notice,dew,warm}){
  const sheet=$('balance-sheet'), owner=me.id, cap=CAPACITY[owner];
  const ahead=b=>!b.done&&(b.date>TODAY||(b.date===TODAY&&b.start>=clock.minutes));
  const when=day=>day===TODAY?'tonight':day===addDays(TODAY,1)?'tomorrow':`on ${DAYS[dow(day)-1]}`;
  let current=[], span='week';
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
      apply:()=>{plans.add(owner,{date:sat,start:10*60,mins:60,cat:'social',title:`Walk with ${friend.owner}`,vis:'open'});warm?.(friend.id);warm?.(owner);},
      done:`Walk with ${friend.owner} added for Saturday. Your bridges warm a little.`});
    return out;
  }

  function trend(values){
    const w=132,h=36,p=5,max=Math.max(cap,...values),y=v=>h-p-v/max*(h-2*p);
    const pts=values.map((v,i)=>[p+i*(w-2*p)/(values.length-1),y(v)]);
    $('bal-trend').innerHTML=`<line class="cap" x1="${p}" x2="${w-p}" y1="${y(cap)}" y2="${y(cap)}"/>`+
      `<polyline points="${pts.map(q=>q.join(',')).join(' ')}"/>`+pts.map((q,i)=>`<circle cx="${q[0]}" cy="${q[1]}" r="${i===pts.length-1?3.2:2}"/>`).join('');
    $('bal-trend').setAttribute('aria-label','How full your last four weeks were, oldest first. The dashed line is a full week.');
  }
  const DAYN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const pct=(x,t)=>Math.round(x/t*100);
  // Where your time goes: each kind of activity's share of the week's plan.
  const byCatOf=blocks=>{const o={};for(const b of blocks)if(!b.skipped)o[b.cat]=(o[b.cat]||0)+b.mins;return o;};
  function mix(byCat,span='week'){
    const total=Object.values(byCat).reduce((a,b)=>a+b,0)||1;
    const rows=Object.keys(CATEGORIES).map(c=>({c,m:byCat[c]||0})).filter(r=>r.m).sort((a,b)=>b.m-a.m);
    const R=46, C=2*Math.PI*R;let off=0;
    const arcs=rows.map(r=>{
      const len=r.m/total*C, arc=`<circle r="${R}" cx="60" cy="60" fill="none" stroke="${CATEGORIES[r.c].color}" stroke-width="15" stroke-dasharray="${Math.max(.1,len-1.4)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
      off+=len;return arc;
    }).join('');
    const top=rows[0];
    $('bal-donut').innerHTML=`<circle r="${R}" cx="60" cy="60" fill="none" stroke="oklch(.93 .01 295)" stroke-width="15"/>${arcs}`+
      (top?`<text x="60" y="58" text-anchor="middle" class="donut-big">${pct(top.m,total)}%</text><text x="60" y="74" text-anchor="middle" class="donut-small">${CATEGORIES[top.c].label.toLowerCase()}</text>`:'');
    $('bal-donut').setAttribute('aria-label',`Share of ${span==='week'?'this week':'the last five weeks'} by kind: `+rows.map(r=>`${CATEGORIES[r.c].label} ${pct(r.m,total)}%`).join(', '));
    // every kind is listed, so a missing one reads as "none this week" instead of vanishing
    const none=Object.keys(CATEGORIES).filter(c=>!byCat[c]).map(c=>({c,m:0}));
    $('bal-legend').replaceChildren(...rows.concat(none).map(r=>{
      const li=el('li',{className:r.m?'':'none'},catImg(r.c),el('span',{textContent:CATEGORIES[r.c].label}),el('b',{textContent:`${pct(r.m,total)}%`}));
      li.style.setProperty('--c',CATEGORIES[r.c].color);return li;
    }));
  }
  // How you've felt: the last seven days' lanterns, the mix of feelings, one gentle line.
  function moods(){
    $('bal-moods').classList.remove('month');
    const days=[];
    for(let d=6;d>=0;d--){const es=checkins.filter(c=>c.day===d);days.push({d,e:es[es.length-1],name:d===0?'Today':DAYN[dow(addDays(TODAY,-d))-1],full:d===0?'today':DAYS[dow(addDays(TODAY,-d))-1]});}
    $('bal-moods').replaceChildren(...days.map(x=>{
      const lantern=el('span',{className:'lantern'});
      if(x.e){lantern.style.setProperty('--c',MOODS[x.e.mood].color);lantern.title=MOODS[x.e.mood].label;}else lantern.classList.add('none');
      return el('div',{className:`mood-day${x.d===0?' today':''}`},lantern,el('small',{textContent:x.name}));
    }));
    const counts={};for(const x of days)if(x.e)counts[x.e.mood]=(counts[x.e.mood]||0)+1;
    const n=Object.values(counts).reduce((a,b)=>a+b,0)||1, order=Object.keys(MOODS).filter(k=>counts[k]);
    $('bal-moodmix').replaceChildren(...order.map(k=>{const i=el('i');i.style.cssText=`--c:${MOODS[k].color};flex:${counts[k]}`;return i;}));
    $('bal-moodkey').replaceChildren(...order.map(k=>{
      const li=el('li',{},el('i'),el('span',{textContent:MOODS[k].label}),el('b',{textContent:`${pct(counts[k],n)}%`}));
      li.style.setProperty('--c',MOODS[k].color);return li;
    }));
    const heavy=days.filter(x=>x.e&&MOODS[x.e.mood].strain>=.55).map(x=>x.full);
    const light=days.filter(x=>x.e&&MOODS[x.e.mood].strain===0).length;
    $('bal-mood-note').textContent=!heavy.length?'Light days all week, and your sky has stayed clear.'
      :`${light>=4?'Mostly light days.':'A mixed week.'} The heavier ${heavy.length===1?'one was':'ones were'} ${list(heavy)}.`;
  }
  // Done so far: blocks answered Done against the week's plan, day by day.
  function progress(week){
    $('bal-days').classList.remove('weeks');
    const live=week.filter(b=>!b.skipped), done=live.filter(b=>b.done), monday=mondayOf(TODAY);
    $('bal-progress').textContent=`${done.length} of ${live.length} blocks done so far`;
    const per=DAYN.map((name,i)=>{const date=addDays(monday,i), bl=live.filter(b=>b.date===date);
      return {name,date,plan:bl.reduce((a,b)=>a+b.mins,0),done:bl.filter(b=>b.done).reduce((a,b)=>a+b.mins,0),n:bl.length,d:bl.filter(b=>b.done).length};});
    const max=Math.max(60,...per.map(p=>p.plan));
    $('bal-days').replaceChildren(...per.map(p=>{
      const col=el('div',{className:`day-col${p.date===TODAY?' today':''}`,title:`${p.name}: ${p.d} of ${p.n} done`},
        el('span',{className:'day-bar'},el('i',{className:'day-plan'}),el('i',{className:'day-done'})),el('small',{textContent:p.date===TODAY?'Today':p.name}));
      col.style.setProperty('--plan',p.plan/max);col.style.setProperty('--done',p.done/max);return col;
    }));
  }
  // ---- Month: the last four weeks and this one ------------------------------
  // This week's plan and your last seven check-ins are real; earlier days are
  // mock history for the demo, generated the same way on every load. The
  // fullest earlier week (TRENDS) also runs heavier in mood, so the calendar
  // has a pattern worth seeing.
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayLabel=date=>{const d=fromIso(date);return `${d.getDate()} ${MON[d.getMonth()]}`;};
  const weekLabel=w=>`week of ${dayLabel(w)}`;
  function monthData(){
    const monday=mondayOf(TODAY), weeks=[-28,-21,-14,-7,0].map(n=>addDays(monday,n));
    let seed=[...monday].reduce((a,c)=>(a*31+c.charCodeAt(0))&0x7fffffff,7);
    const r=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    const pick=w=>{let x=r()*w.reduce((a,[,n])=>a+n,0);for(const [k,n] of w)if((x-=n)<0)return k;return w[0][0];};
    const past=[20,...TRENDS[owner]];   // hours planned in the four weeks before this one, oldest first
    const crunch=weeks[past.indexOf(Math.max(...past))];
    const days=[];
    for(let i=0;i<35;i++){
      const date=addDays(weeks[0],i), back=daysBetween(date,TODAY);
      let mood=null;
      if(back>=0&&back<=6){const es=checkins.filter(c=>c.day===back);mood=es.length?es[es.length-1].mood:null;}
      else if(back>6&&r()>.08)mood=pick(mondayOf(date)===crunch
        ?[['calm',14],['happy',12],['tired',30],['stressed',28],['low',16]]
        :[['calm',36],['happy',34],['tired',20],['stressed',5],['low',5]]);
      days.push({date,mood,future:back<0});
    }
    const byCat={}, add=(c,m)=>{byCat[c]=(byCat[c]||0)+m;};
    const bars=weeks.map((w,i)=>{
      if(i===4){const wk=plans.week(owner).filter(b=>!b.skipped);wk.forEach(b=>add(b.cat,b.mins));
        return {w,plan:plans.hours(wk)/cap,done:plans.hours(wk.filter(b=>b.done))/cap,now:true};}
      const share=w===crunch?{study:.55,work:.05,errands:.07,social:.08,exercise:.07,rest:.06,other:.12}
                            :{study:.38,work:.05,errands:.1,social:.16,exercise:.11,rest:.11,other:.09};
      for(const [c,f] of Object.entries(share))add(c,past[i]*60*f*(.9+r()*.2));
      const plan=past[i]/cap;return {w,plan,done:plan*(.8+r()*.15)};
    });
    return {weeks,crunch,days,bars,byCat};
  }
  function monthHead(m){
    const avg=m.bars.reduce((a,b)=>a+b.plan,0)/m.bars.length, top=m.bars.reduce((a,b)=>b.plan>a.plan?b:a);
    $('bal-load').textContent=`Your last five weeks were ${fullness(avg)}`;
    $('bal-fill').style.width=`${Math.min(100,avg*100)}%`;
    $('bal-band').textContent=`Fullest: the ${top.now?'current week':weekLabel(top.w)}`;
  }
  function moodMonth(m){
    const box=$('bal-moods');box.classList.add('month');
    box.replaceChildren(...['M','T','W','T','F','S','S'].map(t=>el('span',{className:'wk-letter',textContent:t})),
      ...m.days.map(x=>{
        const lantern=el('span',{className:'lantern'});
        if(x.mood)lantern.style.setProperty('--c',MOODS[x.mood].color);else lantern.classList.add('none');
        return el('div',{className:`mood-cell${x.future?' future':''}${x.date===TODAY?' today':''}`,title:`${dayLabel(x.date)}${x.mood?`: ${MOODS[x.mood].label}`:''}`},
          lantern,el('small',{textContent:String(fromIso(x.date).getDate())}));
      }));
    const felt=m.days.filter(x=>x.mood), counts={};
    for(const x of felt)counts[x.mood]=(counts[x.mood]||0)+1;
    const n=felt.length||1, order=Object.keys(MOODS).filter(k=>counts[k]);
    $('bal-moodmix').replaceChildren(...order.map(k=>{const i=el('i');i.style.cssText=`--c:${MOODS[k].color};flex:${counts[k]}`;return i;}));
    $('bal-moodkey').replaceChildren(...order.map(k=>{
      const li=el('li',{},el('i'),el('span',{textContent:MOODS[k].label}),el('b',{textContent:`${pct(counts[k],n)}%`}));
      li.style.setProperty('--c',MOODS[k].color);return li;
    }));
    const heavyIn=w=>felt.filter(x=>mondayOf(x.date)===w&&MOODS[x.mood].strain>=.55).length;
    const worst=m.weeks.reduce((a,w)=>heavyIn(w)>heavyIn(a)?w:a,m.weeks[0]);
    const calm=m.weeks.slice(0,4).reduce((a,w)=>heavyIn(w)<heavyIn(a)?w:a,m.weeks[0]);
    $('bal-mood-note').textContent=heavyIn(worst)>=2
      ?`Heavier days gathered in the ${worst===m.weeks[4]?'current week':weekLabel(worst)}. The ${weekLabel(calm)} was your calmest.`
      :'No heavy stretch in the last five weeks.';
  }
  function weeksBars(m){
    const box=$('bal-days');box.classList.add('weeks');
    const past=m.bars.slice(0,4), rate=past.reduce((a,b)=>a+b.done/b.plan,0)/past.length;
    $('bal-progress').textContent=`About ${pct(rate,1)}% of each week’s plan got done`;
    const max=Math.max(1,...m.bars.map(b=>b.plan));
    box.replaceChildren(...m.bars.map(b=>{
      const col=el('div',{className:`day-col${b.now?' today':''}`,title:`${b.now?'This week':weekLabel(b.w)}: ${fullness(b.plan)}`},
        el('span',{className:'day-bar'},el('i',{className:'day-plan'}),el('i',{className:'day-done'})),el('small',{textContent:b.now?'This week':dayLabel(b.w)}));
      col.style.setProperty('--plan',b.plan/max);col.style.setProperty('--done',b.done/max);return col;
    }));
  }
  // ---- This week, by area: the five the brief names, read back in words ----
  // Each gets a status dot: steady, worth watching, or heavy. Physical reads
  // movement planned and late nights (blocks ending at 22:00 or later).
  const STATUS_DOT={ok:'oklch(.74 .12 150)',watch:'oklch(.8 .13 80)',high:'oklch(.68 .15 35)'};
  const cap1=t=>t[0].toUpperCase()+t.slice(1);
  function areas(week,load){
    const live=week.filter(b=>!b.skipped), mins=c=>live.filter(b=>b.cat===c).reduce((a,b)=>a+b.mins,0);
    const heavy=checkins.filter(c=>c.day<=WEEK&&MOODS[c.mood].strain>=.55).length;
    const late=live.filter(b=>b.start+b.mins>=22*60).length, move=mins('exercise'), social=mins('social');
    const todo=live.filter(b=>b.cat==='errands'&&!b.done).length;
    const rows=[
      ['Time',cap1(fullness(load)),load<.65?'ok':load<.85?'watch':'high'],
      ['Mental',heavy===0?'Steady days':heavy===1?'One heavier day':heavy<4?'A few heavy days':'A heavy run of days',heavy<2?'ok':heavy<4?'watch':'high'],
      ['Physical',(move>=120?'Moving well':move>0?'A little movement':'No movement planned')+(late>=2?` · ${late} late nights`:''),
        move===0&&late>=2?'high':move<120||late>=2?'watch':'ok'],
      ['Social',social>=180?'Plenty of time with people':social>=60?'Some time with people':'Quiet this week',social>=60?'ok':'watch'],
      ['Errands',todo===0?'All clear':todo<=2?`${todo} to do`:`${todo} piling up`,todo<=2?'ok':todo<=4?'watch':'high'],
    ];
    $('bal-area-list').replaceChildren(...rows.map(([name,text,st])=>{
      const li=el('li',{},el('b',{textContent:name}),el('span',{textContent:text}));
      li.style.setProperty('--s',STATUS_DOT[st]);li.title=`${name}: ${st==='ok'?'steady':st==='watch'?'worth watching':'heavy'}`;return li;
    }));
  }
  // Weather is feelings only (data.js deriveStrain); how full the week is lives in altitude.
  function weatherLine(){
    const heavy=checkins.filter(c=>c.day<=WEEK&&MOODS[c.mood].strain>0).length;
    const label=weatherLabel(me.strain??0);
    return heavy?`${label}: ${heavy===1?'one heavier day':heavy<4?'a few heavier days':'a run of heavier days'} this week.`:`${label}: calm, steady days this week.`;
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
    for(const t of sheet.querySelectorAll('[data-span]'))t.setAttribute('aria-selected',String(t.dataset.span===span));
    $('balance-title').textContent=span==='week'?'Your week, in balance':'Your month, in balance';
    $('bal-done-title').textContent=span==='week'?'Done so far':'Week by week';
    trend(TRENDS[owner].concat(Math.round(h)));
    $('bal-areas').hidden=span!=='week';
    if(span==='week'){
      $('bal-load').textContent=`Your week is ${fullness(load)}`;
      $('bal-fill').style.width=`${Math.min(100,load*100)}%`;
      $('bal-band').textContent=load<.35?'Floating high: plenty of open sky':load<.65?'Mid-sky: room to breathe':load<.85?'Lower in the sky: a full week':'Low, close to the cloud sea';
      mix(byCatOf(week));moods();progress(week);areas(week,load);
    }else{const m=monthData();monthHead(m);mix(m.byCat,'month');moodMonth(m);weeksBars(m);}
    $('bal-weather').textContent=weatherLine();
    renderList();
    $('bal-dew').textContent=`💧 ${dew()} dewdrops, a slow drip from finished blocks, golden-window moments and notes between friends. They grew the windmill in the middle of your island.`;
  }
  for(const t of sheet.querySelectorAll('[data-span]'))t.onclick=()=>{span=t.dataset.span;render();};
  return {
    open(from){current=suggest();applied.clear();sheets.show(sheet,from??$('balance-toggle'));render();},
    render,
  };
}
