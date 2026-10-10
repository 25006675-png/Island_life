// Sound: the effects in public/assets/sfx (rendered by tools/make_sfx.mjs), played through one Web Audio graph.
// Browsers keep a page silent until its first tap or key press, so the context waits for that and wakes then;
// anything played before is simply skipped. Mute and volume are remembered per browser.
const BASE=`${import.meta.env.BASE_URL}assets/sfx/`, KEY='il-sound';
const TAKES={step_grass:4,step_wood:7,step_stone:4,step_water:4};   // footsteps come in several takes, never the same twice running
const FILES=['click','whale_call','whale_hum','jump','land','sprint','water_pour','task_done','rain_loop',
             ...Object.entries(TAKES).flatMap(([n,k])=>Array.from({length:k},(_,i)=>`${n}_${i+1}`))];
const prefs={muted:false,volume:.8};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(KEY)??'{}'));}catch{}
let ctx=null,master=null,loading=null;
const buffers=new Map(), lastTake={}, lastPlayed={};

function context(){
  if(ctx)return ctx;
  const AC=window.AudioContext??window.webkitAudioContext;if(!AC)return null;
  ctx=new AC();master=ctx.createGain();master.gain.value=prefs.muted?0:prefs.volume;master.connect(ctx.destination);
  return ctx;
}
function load(){
  if(loading||prefs.muted||!context())return;
  loading=Promise.all(FILES.map(n=>fetch(BASE+n+'.wav').then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).then(b=>buffers.set(n,b),()=>{})));
}
const wake=()=>{load();if(ctx?.state==='suspended')ctx.resume();};
for(const ev of ['pointerdown','keydown','touchend'])addEventListener(ev,wake,{capture:true,passive:true});
const live=()=>ctx?.state==='running'&&!prefs.muted;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}};

// One sound. gain, rate (pitch and speed together) and pan (-1..1); `cooldown` seconds since this sound last
// played, or it is skipped. A name with takes (TAKES) picks one at random. Returns a handle to fade it out early.
export function play(name,{gain=1,rate=1,pan=0,cooldown=0}={}){
  if(!live())return null;
  if(TAKES[name]){let k;do k=1+Math.floor(Math.random()*TAKES[name]);while(k===lastTake[name]&&TAKES[name]>1);lastTake[name]=k;name=`${name}_${k}`;}
  const buffer=buffers.get(name), now=ctx.currentTime;if(!buffer)return null;
  if(cooldown&&now-(lastPlayed[name]??-1e9)<cooldown)return null;lastPlayed[name]=now;
  const src=ctx.createBufferSource(), g=ctx.createGain();src.buffer=buffer;src.playbackRate.value=rate;g.gain.value=gain;
  let out=g;if(pan&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;g.connect(p);out=p;}
  src.connect(g);out.connect(master);src.start();
  return {stop(fade=.12){const t=ctx.currentTime;g.gain.setTargetAtTime(0,t,fade/3);src.stop(t+fade);}};
}
// A footstep on a surface (grass, wood, stone, water); a running step lands harder and a little quicker.
export const step=(surface,{run=false,gain=1}={})=>play(`step_${surface}`,{gain:gain*(run?.75:.5),rate:(run?1.08:1)*(.94+Math.random()*.12)});
// A looping bed (the rain): set(level) eases its volume, 0..1; it starts the first time it is wanted.
export function ambient(name,{gain=1}={}){
  let src=null,g=null,level=0;
  return {set(v){
    if(Math.abs(v-level)<.01&&(src||v<=0))return;level=v;
    if(!src&&v>0&&live()&&buffers.has(name)){src=ctx.createBufferSource();src.buffer=buffers.get(name);src.loop=true;g=ctx.createGain();g.gain.value=0;src.connect(g).connect(master);src.start();}
    g?.gain.setTargetAtTime(v*gain,ctx.currentTime,.6);
  }};
}
// Every button, link and toggle answers a press with a soft click.
export function listenForClicks(root=document){
  root.addEventListener('click',e=>{if(e.target.closest?.('button,a[href],summary,select,input[type=checkbox],[role=button],.island-label'))play('click',{gain:.45,rate:.96+Math.random()*.08});},true);
}
export const muted=()=>prefs.muted, volume=()=>prefs.volume;
export function setMuted(m){prefs.muted=m;save();if(m){if(master)master.gain.value=0;return;}wake();master&&(master.gain.value=prefs.volume);}
export function setVolume(v){prefs.volume=v;save();if(master&&!prefs.muted)master.gain.setTargetAtTime(v,ctx.currentTime,.05);}
// Fetch the sounds ahead of the first press, so the first one is already there. Not while muted.
export const preload=()=>load();
