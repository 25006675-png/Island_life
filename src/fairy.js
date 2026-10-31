import * as T from 'three';
import { makeFairy } from './fairymodel.js';
import { placeBubble, topBand } from './bubble.js';
import { onPhone } from './data.js';

// The fairy: after you finish a block (Done in the planner, "Mark all as done", the walk-up card), she flies out of
// that block's tree -- a real 3D figure in the world (fairymodel.js) -- and hovers by you, about TALL pixels high, to
// ask "How draining was it?" in a white bubble beside her: light, okay, draining, or not now.
// She comes out of the tree when the gardener has watered it (fromTree, main.js), or otherwise once nothing covers
// the world, wherever the tree stands (treeAt: its crown in world units; from the right edge when there's none).
// One question per block, one fairy at a time.
//   ask(b): still worth asking (today's, done, not yet rated)   answer(b,value): record it   title(b): what to call it
//   blocked(): a sheet or dialog is open   waiting(b): its tree is about to be watered   treeAt(b): Vector3 or null
const SETTLE=.6;                     // seconds a finished block waits, so its tree can join the watering queue first
const TALL=80, NEAR=3;               // her height on screen while she asks (px); how far in front of the camera she hovers
const OUT=1.6, HAPPY=.75, AWAY=1.1;  // seconds: flying out of the tree, the happy spin, flying off
const BUBBLE=300, GAP=48;            // the bubble's width (style.css .fairy-bubble); from her middle to its edge
const CHOICES={light:'Light',okay:'Okay',draining:'Draining'};

export function createFairy({scene,camera,ask,answer,title,blocked=()=>false,waiting=()=>false,treeAt=()=>null}){
  const pending=[], ready=[];   // pending: {b,at} waiting for the watering; ready: {b,from,watered} to show
  let model=null, bubble=null, cur=null, clock=0, sparkAt=0;
  const same=(a,b)=>String(a.id)===String(b.id);
  const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const v=new T.Vector3(), fwd=new T.Vector3(), q=new T.Quaternion();
  const ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;

  function build(){
    model=makeFairy();model.visible=false;scene.add(model);
    bubble=document.createElement('div');bubble.className='fairy-bubble';bubble.hidden=true;
    bubble.setAttribute('role','dialog');bubble.setAttribute('aria-labelledby','fairy-q');
    bubble.innerHTML='<small class="fairy-kicker"></small><p id="fairy-q" class="fairy-q">How draining was it?</p><div class="fairy-picks"></div><button type="button" class="text-button fairy-later">Not now</button>';
    document.getElementById('app').append(bubble);
    bubble.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();leave(false);}});
    bubble.querySelector('.fairy-later').onclick=()=>leave(false);
  }
  // screen <-> world: a screen point (CSS px) NEAR units in front of the camera, and where a world point lands on screen
  function hoverAt(x,y,out){
    camera.getWorldDirection(fwd);
    out.set(x/innerWidth*2-1,-(y/innerHeight)*2+1,.5).unproject(camera).sub(camera.position).normalize();
    return out.multiplyScalar(NEAR/out.dot(fwd)).add(camera.position);
  }
  function onScreen(p){v.copy(p).project(camera);return v.z<1?{x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,in:Math.abs(v.x)<1&&Math.abs(v.y)<1}:null;}
  // world units per screen pixel at a point (her size is set in pixels)
  const perPixel=p=>p.distanceTo(camera.position)*2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)/innerHeight;
  function spark(x,y,dx=0,dy=14){
    const s=document.createElement('i');s.className='fairy-spark';s.style.left=`${x}px`;s.style.top=`${y}px`;
    s.style.setProperty('--dx',`${dx}px`);s.style.setProperty('--dy',`${dy}px`);
    document.getElementById('app').append(s);setTimeout(()=>s.remove(),900);
  }

  function show({b,from,watered}){
    if(!model)build();
    const W=innerWidth,H=innerHeight;
    from??=treeAt(b);   // read now: the camera may have moved since you pressed Done
    const seen=from&&onScreen(from);
    // where she hovers (her middle, in px): beside and above her tree, clear of the top bar and the bottom controls
    const rest=seen?.in?{x:Math.min(Math.max(seen.x+80,56),W-56),y:Math.min(Math.max(seen.y-120,200),H-220)}
                       :{x:Math.max(56,Math.min(W*.6,W-56-BUBBLE-70)),y:Math.max(H*.32,200)};
    const start=from?from.clone():hoverAt(W+120,H*.3,new T.Vector3());
    cur={b,phase:'out',t:0,start,rest,from:start.clone()};
    bubble.querySelector('.fairy-kicker').textContent=watered?`You watered ${title(b)}!`:`You finished ${title(b)}!`;
    bubble.querySelector('.fairy-picks').replaceChildren(...Object.entries(CHOICES).map(([val,label])=>{
      const x=document.createElement('button');x.type='button';x.className='fairy-pick';x.textContent=label;
      x.onclick=()=>{answer(b,val);leave(true);};return x;}));
    // a phone: her bubble waits at the top (bubble.js), and she hovers just under it, so it's plainly hers
    if(onPhone()){bubble.hidden=false;const w=bubble.offsetWidth,h=bubble.offsetHeight;bubble.hidden=true;
      rest.x=Math.min(Math.max(rest.x,(W-w)/2+40),(W+w)/2-40);rest.y=topBand()+h+GAP;}
    model.visible=true;document.getElementById('app').classList.add('fairy-out');
    if(seen?.in&&!still())for(let k=0;k<10;k++){const a=k/10*Math.PI*2,d=14+Math.random()*16;spark(seen.x,seen.y,Math.cos(a)*d,Math.sin(a)*d);}   // a puff where she comes out
    if(still())settle();
  }
  function settle(){
    cur.phase='ask';cur.t=0;
    bubble.hidden=false;place();requestAnimationFrame(()=>bubble.classList.add('on'));
    bubble.querySelector('.fairy-pick')?.focus({preventScroll:true});
  }
  function leave(happy){
    if(cur?.phase!=='ask')return;
    bubble.classList.remove('on');setTimeout(()=>{if(cur?.phase!=='ask')bubble.hidden=true;},220);
    cur.phase=happy&&!still()?'happy':'away';cur.t=0;
    hoverAt(cur.rest.x,cur.rest.y,cur.from);
    if(still())done();
  }
  function done(){model.visible=false;cur=null;document.getElementById('app').classList.remove('fairy-out');}
  // the bubble sits beside her on screen (bubble.js), or under her on a narrow screen; on a phone she keeps just
  // under it, should a notice above push it down
  function place(){placeBubble(bubble,cur.rest,{gap:GAP,rise:58});if(onPhone())cur.rest.y=bubble.offsetTop+bubble.offsetHeight+GAP;}

  // one frame of her: where she is, how big, which way she faces
  const at=new T.Vector3(), end=new T.Vector3(), mid=new T.Vector3(), up=new T.Vector3();
  function pose(dt){
    const c=cur;c.t+=dt;
    hoverAt(c.rest.x,c.rest.y,end);
    let size=1,spin=0,bank=0;
    if(c.phase==='out'){
      const k=Math.min(1,c.t/OUT),e=ease(k);
      up.set(0,1,0).applyQuaternion(camera.quaternion);
      mid.lerpVectors(c.start,end,.5).addScaledVector(up,c.start.distanceTo(end)*.35);   // an arc, up and over
      at.copy(c.start).multiplyScalar((1-e)*(1-e)).addScaledVector(mid,2*(1-e)*e).addScaledVector(end,e*e);
      size=.4+.6*e;bank=Math.sin(k*Math.PI)*.35*(c.rest.x>innerWidth/2?-1:1);
      if(k>=1)settle();
    }else if(c.phase==='ask'){at.copy(end);}
    else if(c.phase==='happy'){
      const k=Math.min(1,c.t/HAPPY);at.copy(end);spin=ease(k)*Math.PI*2;
      up.set(0,1,0).applyQuaternion(camera.quaternion);at.addScaledVector(up,Math.sin(k*Math.PI)*perPixel(end)*30);
      if(k>=1){c.phase='away';c.t=0;c.from.copy(end);}
    }else{
      const k=Math.min(1,c.t/AWAY),e=k*k;
      hoverAt(innerWidth+140,-120,end);at.lerpVectors(c.from,end,e);size=1-.4*e;bank=-.4*Math.sin(k*Math.PI);
      if(k>=1){done();return;}
    }
    model.position.copy(at);
    model.scale.setScalar(TALL*size*perPixel(at));
    // face the viewer, turned a little toward her heading, banking as she swoops
    model.quaternion.copy(camera.quaternion);
    q.setFromAxisAngle(up.set(0,1,0),spin+(c.phase==='ask'?Math.sin(clock*1.3)*.18:0));model.quaternion.multiply(q);
    q.setFromAxisAngle(up.set(0,0,1),bank);model.quaternion.multiply(q);
    model.userData.animate(clock);
    // a trail of sparks while she flies
    if((c.phase==='out'||c.phase==='away')&&clock-sparkAt>.05&&!still()){
      sparkAt=clock;const s=onScreen(at);if(s?.in)spark(s.x+(Math.random()-.5)*14,s.y+TALL*size*.15+(Math.random()-.5)*10);
    }
    if(c.phase==='ask')place();
  }

  return {
    // blocks you just finished: each gets its question, after its watering if there is one
    expect(blocks){for(const b of blocks)if(ask(b)&&!pending.some(p=>same(p.b,b))&&!ready.some(r=>same(r.b,b)))pending.push({b,at:clock});},
    // the gardener has watered this block's tree: she comes out of it (`top`: the crown, world units)
    idle:()=>!cur&&!ready.length&&!pending.length,   // nobody waiting to be asked about (guide.js waits on this)
    fromTree(b,top){const i=pending.findIndex(p=>same(p.b,b));if(i<0)return;ready.push({b:pending[i].b,from:top.clone(),watered:true});pending.splice(i,1);},
    tick(dt){
      clock+=dt;
      if(cur)pose(dt);
      for(const p of pending.filter(p=>clock-p.at>=SETTLE&&!waiting(p.b))){ready.push({b:p.b,from:null,watered:false});pending.splice(pending.indexOf(p),1);}
      if(cur||!ready.length||blocked())return;
      const next=ready.shift();
      if(ask(next.b))show(next);
    },
  };
}
