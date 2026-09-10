import { SEEDS, SCHEDULES, toMin } from './data.js';

// The plan store: dated blocks for each member -- one-offs, and weekly
// repeats (a series; each dated appearance is an "occurrence"). The mock week
// is built around the real current week, so today is always today.
export const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const fromIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
export const addDays=(s,n)=>{const d=fromIso(s);d.setDate(d.getDate()+n);return iso(d);};
export const daysBetween=(a,b)=>Math.round((fromIso(b)-fromIso(a))/864e5);
export const dow=s=>(fromIso(s).getDay()+6)%7+1;     // 1 = Monday ... 7 = Sunday
export const mondayOf=s=>addDays(s,1-dow(s));
export const TODAY=iso(new Date());

function createPlans(){
  let nextId=1;
  const store={}, listeners=new Set();
  const block=(date,[start,mins,cat,title,vis='silhouette',priority='normal'],repeat=false)=>
    ({id:nextId++,date,start:toMin(start),mins,cat,title,vis,priority,repeat,skipped:false,skippedOn:[],exceptOn:[]});
  const monday=mondayOf(TODAY);
  for(const [id,seed] of Object.entries(SEEDS)){
    const list=store[id]=seed.today.map(r=>block(TODAY,r));
    for(const [d,...r] of seed.week){const date=addDays(monday,d-1);if(date!==TODAY)list.push(block(date,r));}
    // today's plan is curated, so weekly repeats sit today out
    for(const [d,...r] of seed.repeat){const b=block(addDays(monday,d-1),r,true);b.exceptOn.push(TODAY);list.push(b);}
  }

  const occurs=(b,date)=>b.repeat?date>=b.date&&dow(date)===dow(b.date)&&!b.exceptOn.includes(date):b.date===date;
  const occurrence=(b,date)=>b.repeat?{...b,id:`${b.id}@${date}`,date,series:b,skipped:b.skippedOn.includes(date)}:b;
  const on=(id,date)=>(store[id]??[]).filter(b=>occurs(b,date)).map(b=>occurrence(b,date)).sort((a,b)=>a.start-b.start);
  const range=(id,from,days)=>{const out=[];for(let i=0;i<days;i++)out.push(...on(id,addDays(from,i)));return out;};
  const changed=id=>{SCHEDULES[id]=on(id,TODAY);for(const f of listeners)f(id);};
  for(const id of Object.keys(store))SCHEDULES[id]=on(id,TODAY);

  return {
    on, range,
    week:(id,date=TODAY)=>range(id,mondayOf(date),7),
    hours:list=>list.filter(b=>!b.skipped).reduce((a,b)=>a+b.mins,0)/60,
    add(id,fields){
      const b={id:nextId++,vis:'silhouette',priority:'normal',repeat:false,skipped:false,skippedOn:[],exceptOn:[],...fields};
      store[id].push(b);changed(id);return b;
    },
    // Edits land on the series for a repeating block; moving one of its days
    // moves the weekday. Turning "repeat" off leaves a one-off on that day.
    update(id,occ,fields){
      const b=occ.series??occ, f={...fields};
      if(occ.series&&f.repeat===false)f.date??=occ.date;
      else if(occ.series&&f.date){b.date=addDays(b.date,daysBetween(occ.date,f.date));delete f.date;}
      Object.assign(b,f);changed(id);
    },
    remove(id,occ){const b=occ.series??occ,l=store[id];l.splice(l.indexOf(b),1);changed(id);},
    toggleSkip(id,occ){
      if(occ.series){const s=occ.series.skippedOn,i=s.indexOf(occ.date);if(i<0)s.push(occ.date);else s.splice(i,1);}
      else occ.skipped=!occ.skipped;
      changed(id);
    },
    // Move one day's block `days` later; one occurrence of a series becomes a one-off.
    shift(id,occ,days){
      if(occ.series){
        const {series,...rest}=occ;series.exceptOn.push(occ.date);
        store[id].push({...rest,id:nextId++,repeat:false,date:addDays(occ.date,days),skippedOn:[],exceptOn:[]});
      }else occ.date=addDays(occ.date,days);
      changed(id);
    },
    onChange(f){listeners.add(f);},
  };
}
export const plans=createPlans();
