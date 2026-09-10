// Mock data for the v1 demo -- there is no backend. Times are minutes after
// midnight; `day` on a check-in counts days before today (0 = today).
export const ME='sakura';               // the viewer's own island (placeholder: Aisha's)
export const DAWN=7*60, NIGHT=22*60;    // the wisp leaves the arch at dawn, is home by night

// One category = one tree species (groves.js) = one colour. The colours must
// read on grass and stay apart from the cream of free time on the path.
export const CATEGORIES={
  study:   {label:'Study',   color:'#9272e0'},
  work:    {label:'Work',    color:'#eb9f35'},
  errands: {label:'Errands', color:'#3fb8a8'},
  social:  {label:'Social',  color:'#f07fae'},
  exercise:{label:'Exercise',color:'#f2704f'},
  rest:    {label:'Rest',    color:'#5aa7e6'},
  other:   {label:'Other',   color:'#8a93a8'},
};

// `strain` feeds the weather: how much a feeling weighs on the recent trend.
export const MOODS={
  calm:    {label:'Calm',    color:'#9fdcc8',strain:0},
  happy:   {label:'Happy',   color:'#ffd580',strain:0},
  tired:   {label:'Tired',   color:'#bba9e0',strain:.55},
  stressed:{label:'Stressed',color:'#f39a7c',strain:1},
  low:     {label:'Low',     color:'#92aede',strain:.8},
};

// Altitude = load. An empty week floats at 16 m; a full one sits at -7 m,
// down by the cloud sea.
const HIGH=16, LOW=-7;
export const loadFromAltitude=a=>Math.min(1,Math.max(0,(HIGH-a)/(HIGH-LOW)));
export const altitudeFromLoad=l=>HIGH-Math.min(1,Math.max(0,l))*(HIGH-LOW);
export const CAPACITY={sakura:35,purple:36,oak:35};   // hours a week each member can give

export const toMin=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
export const fmt=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.floor(m%60)).padStart(2,'0')}`;
export const hours=m=>`${+(m/60).toFixed(1)} h`;

// A lived-in week for each member; plan.js places it around the real current
// week. Rows: [start, minutes, category, title, friends-see, priority].
//   today  -- today's plan, the one the island draws as its path
//   week   -- one-offs on a weekday (1 = Monday)
//   repeat -- weekly, like a class timetable
// friends-see: 'open' (label shown up close) / 'silhouette' (kind + size, the
// default) / 'hidden'. priority 'low' = "can wait if the week gets full".
export const SEEDS={
  sakura:{
    today:[['08:00',30,'rest','Slow breakfast','open'],['08:30',120,'study','Calculus revision','open'],
           ['11:00',60,'errands','Library returns','open'],['12:30',90,'social','Lunch with Ben','open'],
           ['14:30',120,'study','Essay draft'],['17:30',60,'exercise','Evening run','open'],
           ['19:30',90,'other','Sketching','open','low']],
    week:[[4,'20:30',90,'study','Problem set'],[7,'16:00',60,'errands','Room tidy','open','low']],
    repeat:[[1,'10:00',120,'study','Linear algebra lecture','open'],[3,'10:00',120,'study','Linear algebra lecture','open'],
            [4,'18:00',60,'exercise','Badminton','open']]},
  purple:{
    today:[['09:00',180,'work','Café shift'],['13:00',60,'errands','Groceries'],['14:30',120,'study','Lab report'],
           ['17:00',60,'social','Band practice','open'],['19:00',60,'rest','Nap','hidden'],['20:30',60,'study','Reading']],
    week:[[7,'10:00',60,'rest','Lie-in','hidden']],
    repeat:[[1,'09:00',180,'work','Café shift'],[2,'13:00',120,'study','Lab']]},
  oak:{
    today:[['07:30',60,'exercise','Swim'],['09:00',240,'work','Internship'],['14:00',120,'work','Client deck','hidden'],
           ['16:30',90,'study','Stats problem set'],['18:30',60,'other','Call home'],['20:00',120,'study','Exam prep']],
    week:[[2,'20:00',120,'study','Exam prep'],[3,'21:00',90,'work','Report edits','hidden']],
    repeat:[[1,'09:00',240,'work','Internship'],[2,'09:00',240,'work','Internship'],
            [3,'09:00',240,'work','Internship'],[4,'09:00',240,'work','Internship']]},
};
// Today's blocks per island, kept current by plan.js (forest.js reads this).
export const SCHEDULES={};
// Committed hours in the three weeks before this one, oldest first.
export const TRENDS={sakura:[21,19,18],purple:[16,15,15],oak:[24,27,29]};

export const CHECKINS={
  sakura:[{day:6,mood:'happy'},{day:5,mood:'calm'},{day:4,mood:'tired'},{day:3,mood:'happy'},
          {day:2,mood:'calm'},{day:1,mood:'happy'},{day:0,mood:'calm',time:toMin('08:10')}],
  purple:[{day:6,mood:'happy'},{day:5,mood:'happy'},{day:4,mood:'tired'},{day:3,mood:'stressed'},
          {day:2,mood:'calm'},{day:1,mood:'tired'},{day:0,mood:'low',time:toMin('09:40')}],
  oak:   [{day:6,mood:'tired'},{day:5,mood:'calm'},{day:4,mood:'stressed'},{day:3,mood:'tired'},
          {day:2,mood:'stressed'},{day:1,mood:'low'},{day:0,mood:'tired',time:toMin('07:15')}],
};

// Weather = subjective strain, looking back: the last five days of check-ins,
// nudged by a heavy week. One continuous 0..1 value -- cloud gathers, then
// rain grows. It surfaces a trend; it never diagnoses.
export function deriveStrain(checkins,load){
  const recent=checkins.filter(c=>c.day<=4);
  const strain=recent.length?recent.reduce((a,c)=>a+MOODS[c.mood].strain,0)/recent.length:0;
  return Math.min(1,strain*.75+Math.max(0,load-.6)*.6);
}
export const weatherLabel=s=>s<.2?'Clear':s<.35?'Light cloud':s<.55?'Cloudy':s<.75?'Drizzle':'Rain';
