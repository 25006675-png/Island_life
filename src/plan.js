import { SEEDS, SCHEDULES, toMin } from './data.js';

// The plan store: dated blocks for each member -- one-offs, and weekly
// repeats (a series; each dated appearance is an "occurrence"). The demo's
// mock week is built around the real current week, so today is always today;
// a signed-in sky loads real rows instead (backend.js), and every change to
// the viewer's own plan is handed to `persist` to be saved.
export const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const fromIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
export const addDays=(s,n)=>{const d=fromIso(s);d.setDate(d.getDate()+n);return iso(d);};
export const daysBetween=(a,b)=>Math.round((fromIso(b)-fromIso(a))/864e5);
export const dow=s=>(fromIso(s).getDay()+6)%7+1;     // 1 = Monday ... 7 = Sunday
export const mondayOf=s=>addDays(s,1-dow(s));
export const TODAY=iso(new Date());

function createPlans(){
  let nextId=1, persist=null, owner=null;
  const store={}, listeners=new Set();
  const fresh=fields=>({id:nextId++,vis:'silhouette',priority:'normal',repeat:false,skipped:false,done:false,
                        skippedOn:[],doneOn:[],exceptOn:[],source:'island',...fields});
  const block=(date,[start,mins,cat,title,vis='silhouette',priority='normal'],repeat=false)=>
    fresh({date,start:toMin(start),mins,cat,title,vis,priority,repeat});

  const occurs=(b,date)=>b.repeat?date>=b.date&&dow(date)===dow(b.date)&&!b.exceptOn.includes(date):b.date===date;
  const occurrence=(b,date)=>b.repeat?{...b,id:`${b.id}@${date}`,date,series:b,skipped:b.skippedOn.includes(date),done:b.doneOn.includes(date)}:b;
  const on=(id,date)=>(store[id]??[]).filter(b=>occurs(b,date)).map(b=>occurrence(b,date)).sort((a,b)=>a.start-b.start);
  const range=(id,from,days)=>{const out=[];for(let i=0;i<days;i++)out.push(...on(id,addDays(from,i)));return out;};
  const changed=id=>{SCHEDULES[id]=on(id,TODAY);for(const f of listeners)f(id);};
  // the viewer's own changes are saved; friends' plans are read-only here
  const save=(id,b,how)=>{if(persist&&id===owner)persist[how](b);};

  return {
    on, range,
    week:(id,date=TODAY)=>range(id,mondayOf(date),7),
    hours:list=>list.filter(b=>!b.skipped).reduce((a,b)=>a+b.mins,0)/60,
    // where every block lives, newest-loaded wins (backend.js, or the demo below)
    load(id,blocks){store[id]=blocks.map(b=>fresh(b));SCHEDULES[id]=on(id,TODAY);},
    all:id=>store[id]??[],
    // The demo's lived-in week, placed around the real current week.
    seedDemo(){
      const monday=mondayOf(TODAY);
      for(const [id,seed] of Object.entries(SEEDS)){
        const list=store[id]=seed.today.map(r=>block(TODAY,r));
        for(const [d,...r] of seed.week){const date=addDays(monday,d-1);if(date!==TODAY)list.push(block(date,r));}
        // today's plan is curated, so weekly repeats sit today out
        for(const [d,...r] of seed.repeat){const b=block(addDays(monday,d-1),r,true);b.exceptOn.push(TODAY);list.push(b);}
        SCHEDULES[id]=on(id,TODAY);
      }
    },
    // signed in: `who` is the viewer's island; `writer` has add/update/remove,
    // and add() resolves to the saved block's id
    persistTo(who,writer){owner=who;persist=writer;},
    add(id,fields){
      const b=fresh(fields);(store[id]??=[]).push(b);changed(id);
      if(persist&&id===owner)persist.add(b).then(saved=>{if(saved&&saved!==b.id){b.id=saved;changed(id);}});
      return b;
    },
    // Edits land on the series for a repeating block; moving one of its days
    // moves the weekday. Turning "repeat" off leaves a one-off on that day.
    // Changing the kind of an imported block keeps the student's choice
    // through later syncs.
    update(id,occ,fields){
      const b=occ.series??occ, f={...fields};
      if(occ.series&&f.repeat===false)f.date??=occ.date;
      else if(occ.series&&f.date){b.date=addDays(b.date,daysBetween(occ.date,f.date));delete f.date;}
      if(b.source==='google'&&f.cat&&f.cat!==b.cat)b.keptCat=true;
      Object.assign(b,f);changed(id);save(id,b,'update');
    },
    remove(id,occ){const b=occ.series??occ,l=store[id];l.splice(l.indexOf(b),1);changed(id);save(id,b,'remove');},
    toggleSkip(id,occ){
      if(occ.series){const s=occ.series.skippedOn,i=s.indexOf(occ.date);if(i<0)s.push(occ.date);else s.splice(i,1);}
      else occ.skipped=!occ.skipped;
      changed(id);save(id,occ.series??occ,'update');
    },
    // finished early: the block counts as done now, and its ghost takes root
    markDone(id,occ){if(occ.series)occ.series.doneOn.push(occ.date);else occ.done=true;changed(id);save(id,occ.series??occ,'update');},
    unmarkDone(id,occ){if(occ.series){const d=occ.series.doneOn,i=d.indexOf(occ.date);if(i>=0)d.splice(i,1);}else occ.done=false;
      changed(id);save(id,occ.series??occ,'update');},
    // Move one day's block `days` later; one occurrence of a series becomes a one-off.
    shift(id,occ,days){
      if(occ.series){
        const {series,...rest}=occ;series.exceptOn.push(occ.date);save(id,series,'update');
        const b=fresh({...rest,id:undefined,repeat:false,date:addDays(occ.date,days),done:false,skippedOn:[],doneOn:[],exceptOn:[]});
        b.id=nextId++;store[id].push(b);
        if(persist&&id===owner)persist.add(b).then(saved=>{if(saved){b.id=saved;changed(id);}});
      }else{occ.date=addDays(occ.date,days);save(id,occ,'update');}
      changed(id);
    },
    onChange(f){listeners.add(f);},
    touch:id=>changed(id),   // tell every listener an island's plan was reloaded
  };
}
export const plans=createPlans();
