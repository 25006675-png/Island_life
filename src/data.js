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

// Altitude = load. An empty week floats at 16 m; a full one sits at -10 m,
// down by the cloud sea.
const HIGH=16, LOW=-10;
export const loadFromAltitude=a=>Math.min(1,Math.max(0,(HIGH-a)/(HIGH-LOW)));
export const altitudeFromLoad=l=>HIGH-Math.min(1,Math.max(0,l))*(HIGH-LOW);
export const CAPACITY={sakura:35,purple:36,oak:35};   // hours a week each member can give
// How full a week is, in words: shown instead of hours (balance and planner).
export const fullness=l=>l<.35?'light':l<.65?'about half full':l<.85?'full':'very full';
// Bridge glow = recent interaction warmth with the group (0 quiet ... 3 bright); never breaks.
export const WARMTH={sakura:1.7,purple:1.4,oak:.6};

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
  // three heavy days in the last five: the windmill sign is up when the demo opens
  sakura:[{day:6,mood:'happy'},{day:5,mood:'calm'},{day:4,mood:'tired'},{day:3,mood:'happy'},
          {day:2,mood:'tired'},{day:1,mood:'stressed'},{day:0,mood:'calm',time:toMin('08:10')}],
  purple:[{day:6,mood:'happy'},{day:5,mood:'happy'},{day:4,mood:'tired'},{day:3,mood:'stressed'},
          {day:2,mood:'calm'},{day:1,mood:'tired'},{day:0,mood:'low',time:toMin('09:40')}],
  // Chen is mid hard week, so his sky stays rainy
  oak:   [{day:6,mood:'tired'},{day:5,mood:'calm'},{day:4,mood:'stressed'},{day:3,mood:'tired'},
          {day:2,mood:'stressed'},{day:1,mood:'low'},{day:0,mood:'stressed',time:toMin('07:15')}],
};

// Notes = support. A few words left for a friend, written on a wooden plaque
// left at the friend's gate. Oldest first; `day` counts days before today.
export const NOTE_PRESETS=['Thinking of you this week','Proud of you. Rest a little.','Tea on the deck soon?','You’ve got this.'];
export const NOTES=[
  {from:'purple',to:'oak',text:'Swim on Sunday? You need the air.',day:1,read:true},
  {from:'oak',to:'sakura',text:'Thinking of you this week',day:1,read:false},
  {from:'purple',to:'sakura',text:'Good luck with the essay. Lunch is on me.',day:0,read:false},
];

// The task board: small things anyone can post or join this week, then do on
// their own, any day. Everyone who finishes earns the reward, plus one dewdrop
// for each friend who finished too. `by` is who posted it (null: suggested for
// the group). `done` maps a member to their optional photo (null: no photo).
// Only finishers are named; everyone else is a count.
export const TASKS=[
  {id:'walk',title:'A 30-minute walk outside',cat:'exercise',mins:30,by:null,reward:3,joined:['purple','oak'],done:{purple:'walk.jpg'}},
  {id:'cook',title:'Cook yourself a proper dinner',cat:'other',mins:60,by:'purple',reward:3,joined:['purple','sakura'],done:{purple:'dinner.jpg'}},
  {id:'screens',title:'One evening with no screens after 9pm',cat:'rest',mins:60,by:'oak',reward:3,joined:['oak','purple'],done:{oak:'tea.jpg',purple:null}},
  {id:'focus',title:'One focused hour, phone in another room',cat:'study',mins:60,by:'oak',reward:2,joined:['oak'],done:{}},
  {id:'message',title:'Message someone you miss',cat:'social',mins:30,by:null,reward:2,joined:['sakura','oak'],done:{sakura:null}},
];

// Weather = how your week has felt: this week's check-ins, with the most recent
// days weighing most, so a hard yesterday shows while a hard last Sunday fades.
// Only the heavier feelings (tired, stressed, low) gather cloud; calm and happy
// days clear it. How full the week is shows in altitude, never in the weather.
// One continuous 0..1 value -- cloud gathers, then rain grows. It surfaces a
// trend; it never diagnoses.
export const WEEK=6;                       // days back: today plus the six before it
const recency=day=>1-day*.13;              // 1 today ... .22 a week ago
export function deriveStrain(checkins){
  const recent=checkins.filter(c=>c.day<=WEEK);
  if(!recent.length)return 0;
  const weight=recent.reduce((a,c)=>a+recency(c.day),0);
  return Math.min(1,recent.reduce((a,c)=>a+MOODS[c.mood].strain*recency(c.day),0)/weight);
}
export const weatherLabel=s=>s<.2?'Clear':s<.35?'Light cloud':s<.55?'Cloudy':s<.75?'Drizzle':'Rain';

// Species icons: one small render of each category's tree (tools/render_species_icon.py),
// shown beside the category's name wherever it appears. Decorative: the name is always there too.
export const catIcon=cat=>`${import.meta.env.BASE_URL}assets/icons/${cat}.webp`;
export const catImg=(cat,cls='cat-icon')=>Object.assign(document.createElement('img'),{src:catIcon(cat),alt:'',className:cls,decoding:'async'});
