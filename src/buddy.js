// Your gardener in 2D, on the dashboard sheets and on the lifted timetable.
// It waits at a home spot; while a sheet (or the timetable) is open you walk
// it with ← → or A D, jump with Space / W / ↑, and turn it with Q E through
// eight real angles rendered from the 3D model. It never speaks or advises.
const FRAMES=[...Array(8)].map((_,i)=>`${import.meta.env.BASE_URL}assets/gardener_${i}.png`);
for(const src of FRAMES)Object.assign(new Image(),{src});       // warm the cache so turning never flickers
// frame i = the model turned 45°·i: 0 front, 2 right profile, 4 back, 6 left profile
const RIGHT=2, LEFT=6, HOME=1;                                   // at home it looks three-quarter, toward the readout
const KEYS={ArrowLeft:'L',KeyA:'L',ArrowRight:'R',KeyD:'R',Space:'J',KeyW:'J',ArrowUp:'J',KeyQ:'Q',KeyE:'E'};

// `place(el, pos, lift, walking)` puts the figure on its host and returns the clamped position.
export function createBuddy(parent,{height,speed,place}){
  const el=document.createElement('div');el.className='buddy';el.setAttribute('aria-hidden','true');
  const img=Object.assign(document.createElement('img'),{alt:'',src:FRAMES[HOME]});img.style.height=`${height}px`;
  el.append(img);parent.append(el);
  const held=new Set();
  let pos=0, frame=HOME, lift=0, vy=0;
  const show=f=>{if(f!==frame){frame=f;img.src=FRAMES[f];}};
  return {
    el,
    reset(p){pos=p;lift=vy=0;held.clear();show(HOME);pos=place(el,pos,0,false);},
    // returns true when the key is one of the gardener's
    key(code,down){
      const k=KEYS[code];if(!k)return false;
      if(down&&!held.has(k)){
        if(k==='J'&&!lift&&!vy)vy=560;
        if(k==='Q')show((frame+7)%8);
        if(k==='E')show((frame+1)%8);
      }
      if(down)held.add(k);else held.delete(k);
      return true;
    },
    hop(){if(!lift&&!vy)vy=420;},
    step(dt){
      const dir=(held.has('R')?1:0)-(held.has('L')?1:0);
      if(dir){pos+=dir*speed*dt;show(dir>0?RIGHT:LEFT);}
      if(vy||lift){vy-=1600*dt;lift=Math.max(0,lift+vy*dt);if(!lift)vy=0;}
      pos=place(el,pos,lift,!!dir);
      return pos;
    },
  };
}
