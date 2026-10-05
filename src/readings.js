import { MOODS, TRENDS, DEMO_ANSWERS, CATEGORIES, deriveStrain, WEEK } from './data.js';
import { plans, TODAY, addDays, mondayOf, daysBetween } from './plan.js';
import * as C from './climate.js';

// Reads an island the way docs/algorithm.md describes, from the plan store and
// the answers to "How draining was that?". climate.js holds the arithmetic;
// this file only gathers what it needs.
//
//   reading(id)  -> { climate, normal, week, sink, hours, late, days:[{date,load,label}] }
//   answer(...)  -> records an answer and says, in one line, what the island learned
//   gardener(...) -> which kind of help fits right now

// answers per island: {date, start, mins, cat, answer, blockId}
export const ANSWERS={};
export function seedDemoAnswers(){
  for(const [id,rows] of Object.entries(DEMO_ANSWERS))
    ANSWERS[id]=rows.map(([ago,start,mins,cat,answer])=>{
      const [h,m]=start.split(':').map(Number);return {date:addDays(TODAY,-ago),start:h*60+m,mins,cat,answer,blockId:null};
    });
}
// the week a student began (a signed-in island ignores weeks before it)
export const STARTED={};

const HISTORY_WEEKS=6;
const occurrences=(id,from,days)=>{
  const answers=ANSWERS[id]??[];
  return plans.range(id,from,days).map(b=>{
    const series=b.series?.id??b.id;
    const a=answers.find(a=>a.blockId!=null&&String(a.blockId)===String(series)&&a.date===b.date);
    return {date:b.date,start:b.start,mins:b.mins,cat:b.cat,skipped:b.skipped,...(a?{drain:C.ANSWER[a.answer]}:{})};
  });
};

const cache=new Map();
plans.onChange(id=>cache.delete(id));
export const forget=id=>cache.delete(id);

export function reading(id){
  if(cache.has(id))return cache.get(id);
  const monday=mondayOf(TODAY), from=addDays(monday,-7*HISTORY_WEEKS);
  const history=occurrences(id,from,7*HISTORY_WEEKS+14);           // six weeks back, this week and next
  const past=history.filter(b=>b.date<TODAY);
  const answers=ANSWERS[id]??[];
  // earlier weeks: the demo's are given; a signed-in island's come from its own blocks
  const weekLoadsWith=climate=>{
    if(TRENDS[id])return TRENDS[id];
    if(!STARTED[id])return [];                                  // nothing yet: the starting normal week
    const out=[];
    for(let w=HISTORY_WEEKS;w>=1;w--){
      const start=addDays(monday,-7*w);
      if(STARTED[id]&&start<mondayOf(STARTED[id]))continue;
      out.push(C.loadOf(history.filter(b=>b.date>=start&&b.date<addDays(start,7)),history,C.NORMAL.start,climate));
    }
    return out;
  };
  // normal week with the starting costs, then learn, then the normal week again with what was learned
  let normal=C.normalWeek(weekLoadsWith(C.freshClimate()));
  const climate=C.learn(answers,past,normal);
  normal=C.normalWeek(weekLoadsWith(climate));
  const thisWeek=history.filter(b=>b.date>=monday&&b.date<addDays(monday,7));
  const week=C.loadOf(thisWeek,history,normal,climate);
  const hours=thisWeek.filter(b=>!b.skipped).reduce((a,b)=>a+b.mins,0)/60, late=thisWeek.filter(C.isLate).length;
  const days=[];
  for(let d=0;d<14;d++){
    const date=addDays(monday,d), load=C.loadOf(history.filter(b=>b.date===date),history,normal,climate);
    days.push({date,load,...C.dayForecast(load,normal)});
  }
  const r={climate,normal,week,hours,late,sink:C.sinkOf({week,normal,hours,late}),days,answers:answers.length};
  cache.set(id,r);return r;
}
export const forecast=(id,date)=>reading(id).days.find(d=>d.date===date)??null;
// any day or week, weighed with what the island knows now
export function dayReading(id,date){
  const found=forecast(id,date);if(found)return found;
  const r=reading(id), hist=occurrences(id,addDays(date,-14),15), load=C.loadOf(hist.filter(b=>b.date===date),hist,r.normal,r.climate);
  return {date,load,...C.dayForecast(load,r.normal)};
}
export function weekReading(id,date){
  const monday=mondayOf(date);
  if(monday===mondayOf(TODAY))return reading(id);
  const r=reading(id), hist=occurrences(id,addDays(monday,-14),21), week=hist.filter(b=>b.date>=monday);
  const load=C.loadOf(week,hist,r.normal,r.climate), hours=week.filter(b=>!b.skipped).reduce((a,b)=>a+b.mins,0)/60;
  return {...r,week:load,hours,sink:C.sinkOf({week:load,normal:r.normal,hours,late:week.filter(C.isLate).length})};
}

// ---- asking -----------------------------------------------------------------
// what the island expects one finished block to have cost, and how worn the student was
export function expectation(id,b){
  const r=reading(id), hist=occurrences(id,addDays(TODAY,-21),22);
  const w=C.worn(hist,Date.UTC(...b.date.split('-').map((x,i)=>i===1?x-1:+x))/864e5+b.start/1440,r.normal,r.climate);
  return {drain:C.predict(r.climate,b.cat,w),worn:w,known:r.climate.n[b.cat]};
}
// should the island ask about this block right now? (docs/algorithm.md 5.2)
export function shouldAsk(id,b){
  if(b.mins<30||(ANSWERS[id]??[]).some(a=>String(a.blockId)===String(b.series?.id??b.id)&&a.date===b.date))return false;
  const e=expectation(id,b);
  return Math.random()<C.askChance(e.known,e.worn)*(b.cat==='rest'?.3:1);
}
const WHAT={study:'study',work:'work',errands:'errands',social:'time with friends',exercise:'exercise',rest:'rest',other:'that kind of thing'};
// Record an answer; the reply says what was learned, never a number.
export function answer(id,b,value){
  const e=expectation(id,b);
  (ANSWERS[id]??=[]).push({date:b.date,start:b.start,mins:b.mins,cat:b.cat,answer:value,blockId:b.series?.id??b.id});
  cache.delete(id);
  const diff=C.ANSWER[value]-e.drain, what=WHAT[b.cat];
  return diff>.3?`Noted: ${what} weighs more on you than I thought. I’ll warn you sooner next time.`
       :diff<-.3?`Noted: ${what} was lighter for you than I expected. I’ll worry less.`
       :'About what I expected. Thank you.';
}
// What the island has learned, for the balance sheet: kinds with answers, heaviest first.
export function learned(id){
  const r=reading(id);
  return Object.keys(CATEGORIES).filter(c=>r.climate.n[c]).map(c=>({cat:c,cost:r.climate.cost[c],prior:C.PRIOR[c],n:r.climate.n[c]}))
    .sort((a,b)=>b.cost/b.prior-a.cost/a.prior);
}

// ---- the link and the gardener ---------------------------------------------------
// checkins: [{day, mood}] with day = days before today
const dayStrain=(checkins,day)=>{const es=checkins.filter(c=>c.day===day);return es.length?es.reduce((a,c)=>a+MOODS[c.mood].strain,0)/es.length:null;};
export function linkFor(id,checkins){
  const r=reading(id), pairs=[];
  for(let d=0;d<28;d++){
    const s=dayStrain(checkins,d);if(s==null)continue;
    const date=addDays(TODAY,-d), occ=occurrences(id,date,1);
    pairs.push([s,C.loadOf(occ,occ,r.normal,r.climate)/C.typicalDay(r.normal)]);
  }
  return C.link(pairs);
}
// days running, back from today, with the weather at Drizzle or worse
export function rainyDays(checkins){
  let n=0;
  for(let d=0;d<60;d++){
    const shifted=checkins.filter(c=>c.day>=d).map(c=>({...c,day:c.day-d}));
    if(!shifted.some(c=>c.day<=WEEK)||deriveStrain(shifted)<C.RAINY)break;
    n++;
  }
  return n;
}
export function gardener(id,checkins,strain){
  const r=reading(id);
  const heavyAhead=r.days.some(d=>d.date>=TODAY&&d.date<=addDays(TODAY,3)&&(d.label==='heavy'||d.label==='very heavy'));
  return {mode:C.gardenerMode({sink:r.sink,strain,link:linkFor(id,checkins),heavyAhead,rainyDays:rainyDays(checkins)}),heavyAhead,
          heavyDay:r.days.find(d=>d.date>=TODAY&&d.date<=addDays(TODAY,3)&&(d.label==='heavy'||d.label==='very heavy'))?.date??null};
}
export { daysBetween };
