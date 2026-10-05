// How the island reads your week (docs/algorithm.md). Plain arithmetic, no
// DOM and no imports, so the browser, the tests and the server share it.
//
//   altitude -- this week's load against your normal week (sections 2.1-2.5)
//   learning -- "How draining was that?" teaches cost, sensitivity, recovery (2.3)
//   forecast -- each coming day against a typical day (2.4)
//   link     -- how much your weather follows your island (4)
//   gardener -- which kind of help fits (5.1); when to ask (5.2)
//
// An "occurrence" is one dated appearance of a block, as plan.js produces:
// {date:'YYYY-MM-DD', start:minutes, mins, cat, skipped, drain?}. `drain` is
// set when the student answered for that occurrence.

export const ANSWER={light:.5,okay:1,draining:1.6};
export const PRIOR={study:1,work:1,errands:.6,social:.5,exercise:.7,rest:.15,other:.6};
const PRIOR_N=5, SENSITIVITY=.5, HALF_LIVES=[2,3.5,5], MIDDLE=3.5;
export const NORMAL={start:30,min:10,max:45}, WEEK_ALPHA=.4;
const COST=[.1,2.5], SENS=[0,1.5], WORN=[-.5,1], LOOKBACK=14;

const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const dayNum=iso=>Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/864e5;
const when=(date,min)=>dayNum(date)+min/1440;

export function freshClimate(){
  return {cost:{...PRIOR},n:Object.fromEntries(Object.keys(PRIOR).map(k=>[k,0])),sensitivity:SENSITIVITY,halfLife:MIDDLE,answers:0};
}

// ---- 2.1 load ------------------------------------------------------------------
export const blockLoad=(b,drain)=>b.mins/60*drain;

// ---- 2.3 worn: the days before `at`, fading at your recovery speed, against
// what the same days would weigh if each were a typical day. 0 = a normal stretch.
export function worn(occurrences,at,normal,climate){
  const h=climate.halfLife;let load=0,ref=0;
  for(const b of occurrences){
    if(b.skipped)continue;
    const ago=at-when(b.date,b.start+b.mins);
    if(ago<=0||ago>LOOKBACK)continue;
    load+=blockLoad(b,b.drain??climate.cost[b.cat])*.5**(ago/h);
  }
  for(let d=.5;d<LOOKBACK;d++)ref+=.5**(d/h);
  return clamp(load/(ref*normal/7)-1,...WORN);
}
export const predict=(climate,cat,w)=>clamp(climate.cost[cat]*(1+climate.sensitivity*w),.05,3);

// ---- 2.3 learning: replay every answer from the starting values, in order.
// Replaying (rather than storing nudged numbers) keeps it exact and lets the
// island try each recovery speed against the same answers.
function replay(answers,occurrences,normal,halfLife){
  const c=freshClimate();c.halfLife=halfLife;
  const answered=occurrences.map(o=>({...o}));
  const key=o=>`${o.date}|${o.start}|${o.cat}`;
  const index=new Map(answered.map(o=>[key(o),o]));
  const recent=answers.length?dayNum(answers.at(-1).date)-28:0;
  let err=0;
  const days=new Map();
  for(const a of answers){if(!days.has(a.date))days.set(a.date,[]);days.get(a.date).push(a);}
  for(const [date,list] of days){
    const items=list.map(a=>{
      const w=worn(answered,when(date,a.start),normal,c), p=predict(c,a.cat,w);
      return {a,w,e:ANSWER[a.answer]-p};
    });
    if(dayNum(date)>=recent)for(const i of items)err+=i.e*i.e;
    // a bad day is not a bad activity: half of a day's shared error is the day's
    const day=items.length>=2?items.reduce((s,i)=>s+i.e,0)/items.length:0;
    for(const {a,w,e:raw} of items){
      const e=raw-day/2, step=1/(c.n[a.cat]+1+PRIOR_N);   // the starting value counts as five answers
      c.cost[a.cat]=clamp(c.cost[a.cat]+step*e*(1+c.sensitivity*w),...COST);
      c.sensitivity=clamp(c.sensitivity+step*e*c.cost[a.cat]*w*.5,...SENS);
      c.n[a.cat]++;c.answers++;
      const o=index.get(key(a));if(o)o.drain=ANSWER[a.answer];
    }
  }
  return {climate:c,err};
}
// answers: [{date,start,mins,cat,answer:'light'|'okay'|'draining'}]
export function learn(answers,occurrences,normal){
  const sorted=[...answers].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.start-b.start);
  if(sorted.length<8)return replay(sorted,occurrences,normal,MIDDLE).climate;
  let best=null;
  for(const h of HALF_LIVES){const r=replay(sorted,occurrences,normal,h);if(!best||r.err<best.err-1e-9)best=r;}
  return best.climate;
}

// ---- 2.2 your normal week: a running average of completed weeks, newest
// weighing most. weekLoads: oldest first, only weeks since the student began.
export function normalWeek(weekLoads){
  if(!weekLoads.length)return NORMAL.start;
  let c=weekLoads[0];
  for(const w of weekLoads.slice(1))c=WEEK_ALPHA*w+(1-WEEK_ALPHA)*c;
  return clamp(c,NORMAL.min,NORMAL.max);
}

// The load of a set of occurrences: answered ones as answered, the rest as
// predicted at the start of their day.
export function loadOf(list,history,normal,climate){
  const wornOn=new Map();let load=0;
  for(const b of list){
    if(b.skipped)continue;
    let drain=b.drain;
    if(drain==null){
      if(!wornOn.has(b.date))wornOn.set(b.date,worn(history,dayNum(b.date),normal,climate));
      drain=predict(climate,b.cat,wornOn.get(b.date));
    }
    load+=blockLoad(b,drain);
  }
  return load;
}

// ---- 2.2 + 2.5 altitude: 0 = high in the sky, 1 = down at the cloud sea
export function sinkOf({week,normal,hours=0,late=0}){
  const sink=clamp(week/normal-.5,0,1);
  return hours>=55||late>=4?Math.max(sink,.85):sink;
}
// blocks ending after 23:00 (guardrail 2.5)
export const isLate=b=>!b.skipped&&b.start+b.mins>23*60;

// ---- 2.4 forecast for one day, against a typical busy day: your normal week
// spread over five days (most students' weeks are weekday-heavy)
export const typicalDay=normal=>normal/5;
export function dayForecast(dayLoad,normal){
  const ratio=dayLoad/typicalDay(normal);
  return {ratio,label:ratio<.6?'light':ratio<=1.4?'usual':ratio<=1.8?'heavy':'very heavy'};
}
export const FORECAST_WORDS={light:'Light for you',usual:'A usual day','heavy':'Heavy for you','very heavy':'Very heavy for you'};

// ---- 4 the link: correlation of (weather, day load ÷ typical day), shrunk
// towards zero while there are few days. null = still learning.
export function link(pairs){
  const n=pairs.length;if(n<7)return null;
  const mx=pairs.reduce((s,p)=>s+p[0],0)/n, my=pairs.reduce((s,p)=>s+p[1],0)/n;
  let sxy=0,sxx=0,syy=0;
  for(const [x,y] of pairs){sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;syy+=(y-my)**2;}
  if(!sxx||!syy)return 0;
  return sxy/Math.sqrt(sxx*syy)*n/(n+10);
}

// ---- 5.1 which help fits. Never a reason, only a kind of offer.
//   support  -- drizzle or worse for 14 days running
//   rest     -- a heavy sky that the schedule doesn't explain
//   schedule -- a low island or a heavy day ahead
export const RAINY=.55;
export function gardenerMode({sink,strain,link:l,heavyAhead=false,rainyDays=0}){
  if(rainyDays>=14)return 'support';
  const rainy=strain>=RAINY, unlinked=l==null||l<.15;
  if(rainy&&sink<.5&&unlinked)return 'rest';
  if(sink>=.65||heavyAhead)return rainy&&l!=null&&l<.15?'rest':'schedule';
  return null;
}

// ---- 5.2 how likely the island is to ask about one finished activity
export function askChance(answersForKind,w){
  return clamp(1/Math.sqrt(answersForKind+1)+.3*Math.abs(w),.15,1);
}
