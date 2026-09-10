import { CATEGORIES, hours } from './data.js';

// Trees = activities. Each solid tree on a member island is one thing its
// owner did this past week: the species says what kind (one category, one
// species), the size says how long it took. Today's blocks grow as ghost
// trees instead (forest.js), so nothing here is dated today. Walking up to a
// tree shows its card, and friends see only what that activity's visibility
// allows.
export const SPECIES={study:'purple',work:'oak',errands:'magic_mushrooms',social:'sakura',
                      exercise:'palm',rest:'willow',other:'pale'};

// PRODUCT.md duration tiers: small up to 30 min, medium ~1-1.5 h, large 2 h+.
export const tier=mins=>mins<=30?{scale:.72,label:'Small'}:mins<=90?{scale:1,label:'Medium'}:{scale:1.3,label:'Large'};

// Mock past week. `day` counts days before today; `vis` works as in data.js:
// 'open' (label shown up close) / 'silhouette' (kind + size only) / 'hidden'.
// Every member touches all seven categories, unevenly.
let nextId=0;
const t=(day,cat,mins,title,vis='silhouette')=>({id:++nextId,day,cat,mins,title,vis});
export const HISTORY={
  sakura:[   // Aisha: a study-heavy week
    t(1,'study',180,'Essay research','open'),t(2,'study',60,'Flashcards','open'),
    t(3,'study',120,'Chemistry lab write-up','open'),t(5,'study',30,'Vocab review','open'),
    t(1,'social',90,'Dinner with Ben','open'),t(3,'social',60,'Coffee with Mei','open'),
    t(6,'social',30,'Call with Nana','open'),
    t(2,'rest',60,'Long bath','open'),t(4,'rest',30,'Nap','open'),
    t(4,'errands',30,'Library returns','open'),t(6,'errands',60,'Laundry','open'),
    t(5,'exercise',60,'Morning run','open'),
    t(2,'other',90,'Sketching','open'),
    t(3,'work',120,'Tutoring shift','open')],
  purple:[   // Ben: café shifts take most of the week
    t(1,'work',240,'Café shift'),t(2,'work',180,'Café shift'),
    t(4,'work',120,'Inventory count'),t(5,'work',180,'Café shift'),
    t(1,'study',120,'Lab report'),t(3,'study',60,'Reading','open'),t(6,'study',30,'Quiz prep'),
    t(2,'social',120,'Band practice','open'),t(5,'social',60,'Gig planning','open'),
    t(3,'errands',60,'Groceries'),
    t(4,'rest',90,'Nap','hidden'),t(6,'rest',30,'Tea break'),
    t(2,'exercise',60,'Bike ride'),
    t(4,'other',90,'Record shopping','open')],
  oak:[      // Chen: long internship days
    t(1,'work',240,'Internship'),t(2,'work',120,'Client deck','hidden'),
    t(3,'work',240,'Internship'),t(4,'work',60,'Timesheets'),t(6,'work',90,'Team retro'),
    t(1,'study',90,'Stats problem set'),t(2,'study',120,'Exam prep'),
    t(4,'study',30,'Lecture notes'),t(5,'study',180,'Group project'),
    t(3,'exercise',30,'Stretching','open'),
    t(5,'other',60,'Call home','open'),
    t(6,'errands',30,'Post office'),
    t(1,'social',90,'Dinner with family'),
    t(3,'rest',60,'Lazy morning')],
};

const when=day=>day===0?'Today':day===1?'Yesterday':
  new Date(Date.now()-day*864e5).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

// The proximity card for one past-week tree (drawn by life.js reveal()). On
// your own island everything is open.
export function treeCard(e,own){
  const c=CATEGORIES[e.cat], vis=own?'open':e.vis, key=`t${e.id}`;
  if(vis==='hidden')return {key,kicker:when(e.day),title:'Kept private',sub:'Only its owner can see what this was.'};
  if(vis==='open')return {key,color:c.color,kicker:when(e.day),title:e.title,sub:`${c.label} · ${hours(e.mins)}`};
  return {key,color:c.color,kicker:when(e.day),title:c.label,sub:`${tier(e.mins).label} tree · details kept private`};
}
