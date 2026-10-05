import { setViewer, OWNERS, CHECKINS, NOTES, TASKS, WARMTH, TRENDS, SLOT_IDS } from './data.js';
import { plans, TODAY, addDays, daysBetween } from './plan.js';
import { HISTORY } from './groves.js';
import { ANSWERS, STARTED, seedDemoAnswers } from './readings.js';
import { planWriter } from './backend.js';

// Whose sky is this? Either the demo's five friends on mock data, or a
// signed-in student's real sky (backend.loadWorld). Both end up in the same
// containers (data.js, plan.js, readings.js), so the rest of the app reads
// one shape either way.
export const DEMO_PEOPLE=[
  {id:'sakura',name:OWNERS.sakura,description:'A study-heavy week, softened by friends.'},
  {id:'purple',name:OWNERS.purple,description:'Café shifts, lab work and band practice.'},
  {id:'oak',name:OWNERS.oak,description:'Long internship days and exam prep.'},
  {id:'willow',name:OWNERS.willow,description:'Ward placements, and a choir that keeps her going.'},
  {id:'palm',name:OWNERS.palm,description:'A light timetable, and a lot of football.'},
];

export function demoWorld(){
  setViewer('sakura',false);
  plans.seedDemo();seedDemoAnswers();
  return {live:false,people:DEMO_PEOPLE};
}

// Bridge glow from the last week together: notes either way, tasks both finished.
function warmthOf(w){
  const out={}, week=w.notes.filter(n=>n.day<=7);
  for(const p of w.people){
    if(p.id===w.me){out[p.id]=Math.min(3,1+.2*week.filter(n=>n.from===w.me||n.to===w.me).length);continue;}
    const notes=week.filter(n=>(n.from===w.me&&n.to===p.id)||(n.from===p.id&&n.to===w.me)).length;
    const together=w.tasks.filter(t=>p.id in t.done&&w.me in t.done).length;
    out[p.id]=Math.min(3,.9+.35*notes+.25*together);
  }
  return out;
}

export function enterWorld(w){
  setViewer(w.me,true);
  for(const k of Object.keys(OWNERS))delete OWNERS[k];
  for(const k of Object.keys(TRENDS))delete TRENDS[k];
  for(const k of Object.keys(CHECKINS))delete CHECKINS[k];
  for(const k of Object.keys(WARMTH))delete WARMTH[k];
  for(const p of w.people){OWNERS[p.id]=p.name;CHECKINS[p.id]=w.checkins[p.id]??[];plans.load(p.id,w.blocks[p.id]??[]);}
  // last week's grown trees: what each member marked done (friends' as their visibility allows)
  for(const k of Object.keys(HISTORY))delete HISTORY[k];
  for(const p of w.people)HISTORY[p.id]=plans.range(p.id,addDays(TODAY,-7),7).filter(b=>b.done&&!b.skipped)
    .map((b,i)=>({id:`h${p.id}${i}`,day:daysBetween(b.date,TODAY),cat:b.cat,mins:b.mins,title:b.title,vis:b.vis}));
  NOTES.length=0;NOTES.push(...w.notes);
  TASKS.length=0;TASKS.push(...w.tasks);
  Object.assign(WARMTH,warmthOf(w));
  ANSWERS[w.me]=w.answers;STARTED[w.me]=w.started;
  plans.persistTo(w.me,planWriter());
  return {live:true,...w};
}
export { SLOT_IDS };
