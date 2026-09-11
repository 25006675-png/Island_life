import * as T from 'three';
import { CATEGORIES, DAWN, NIGHT } from './data.js';

// Path = today's timetable, laid out like a clock face. The day leaves the
// torii arch, runs once round the middle of the island at a steady pace, and
// curves back toward the arch, ending in an arrow. Each block is an arc as
// long as it lasts, cut into 30-minute segments and coloured by category;
// free time shows as pale path. Behind the wisp the path glows; ahead it
// waits, dim.

// Torii centre and its inward axis, in member-island model units
// (run2.py TORII_AT / TORII_FACING, mirrored into Three.js x/z).
export const ARCH={x:-5.4,z:-5.0};
const INWARD=new T.Vector3(.743,0,.669).normalize();
const SAMPLES=480, LEG=40, WIDTH=1.25, HOVER=.09;
const RADIUS=8, LEG_MIN=20;   // loop radius (world units); minutes spent on each arch leg
const RIBBON={length:26,height:1.3,distance:21};
const NEUTRAL=new T.Color('#f3e2b8'), HIDDEN=new T.Color('#d9d2c6'), GREY=new T.Color('#b9b4c4');
const COLORS=Object.fromEntries(Object.entries(CATEGORIES).map(([k,c])=>[k,new T.Color(c.color)]));
const clamp01=v=>Math.min(1,Math.max(0,v)), smooth=v=>v*v*(3-2*v);
// curve parameter u: [0,UE] leaves the arch, [UE,UX] is the loop, [UX,1] heads home
const UE=LEG/(SAMPLES-1), UX=1-UE;

// Only an explicit Done makes a block done; once its time has passed without
// an answer it is 'waiting' (its ghost tree stays until you say Done or Let go).
export const blockStatus=(b,now)=>b.skipped?'skipped':b.done?'done':b.start+b.mins<=now?'waiting':b.start<=now?'now':'planned';

function timeToU(m){
  if(m<=DAWN)return 0;
  if(m>=NIGHT)return 1;
  if(m<DAWN+LEG_MIN)return UE*(m-DAWN)/LEG_MIN;
  if(m>NIGHT-LEG_MIN)return UX+UE*(m-(NIGHT-LEG_MIN))/LEG_MIN;
  return UE+(UX-UE)*(m-DAWN-LEG_MIN)/(NIGHT-DAWN-2*LEG_MIN);
}
function uToTime(u){
  if(u<UE)return DAWN+LEG_MIN*u/UE;
  if(u>UX)return NIGHT-LEG_MIN+LEG_MIN*(u-UX)/UE;
  return DAWN+LEG_MIN+(NIGHT-DAWN-2*LEG_MIN)*(u-UE)/(UX-UE);
}

export function createTimetable(island,{texture,own,blocks:initial}){
  const s=island.scale, group=new T.Group(); island.group.add(group);
  const ground=(x,z)=>{const h=island.field.height(x/s,z/s);return h===null?null:h*s;};

  const centres=new Float32Array(SAMPLES*3), base=new Float32Array(SAMPLES*6), sky=new Float32Array(SAMPLES*6);
  const position=new Float32Array(SAMPLES*6), color=new Float32Array(SAMPLES*8), index=[];
  for(let i=0;i<SAMPLES-1;i++){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
  const geometry=new T.BufferGeometry();geometry.setIndex(index);
  geometry.setAttribute('position',new T.BufferAttribute(position,3));
  geometry.setAttribute('color',new T.BufferAttribute(color,4));
  const path=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide}));
  path.frustumCulled=false;path.renderOrder=2;group.add(path);

  // The wisp: a small light spirit standing on "now".
  const wisp=new T.Group();
  wisp.add(new T.Mesh(new T.SphereGeometry(.2,16,12),new T.MeshBasicMaterial({color:new T.Color(2.4,2.2,1.7)})));
  const halo=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#ffe9b0',transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  halo.scale.setScalar(2.4);wisp.add(halo);group.add(wisp);

  // Home arrow: the day curves back and points at the arch without closing the loop.
  const arrowGeo=new T.BufferGeometry();arrowGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(9),3));
  const arrow=new T.Mesh(arrowGeo,new T.MeshBasicMaterial({color:NEUTRAL.clone().multiplyScalar(1.4),transparent:true,depthWrite:false,side:T.DoubleSide}));
  arrow.frustumCulled=false;arrow.renderOrder=2;group.add(arrow);
  // Each block has a node midway along its arc -- where its detail card
  // appears when you walk up. Nothing is drawn there: the arc itself is enough.

  // The loop opens toward the arch: out through the gate on one side,
  // clockwise round the middle, home on the other side.
  {
    const arch=new T.Vector3(ARCH.x*s,0,ARCH.z*s), side=new T.Vector3(-INWARD.z,0,INWARD.x);
    const gate=arch.clone().addScaledVector(INWARD,2*s), a0=Math.atan2(gate.z,gate.x), gap=.38;
    const onLoop=a=>new T.Vector3(Math.cos(a)*RADIUS,0,Math.sin(a)*RADIUS);
    const start=onLoop(a0+gap), end=onLoop(a0+Math.PI*2-gap);
    const outCtl=gate.clone().addScaledVector(side,-.9*s), inCtl=gate.clone().addScaledVector(side,.9*s);
    const home=arch.clone().addScaledVector(INWARD,1.5*s).addScaledVector(side,.6*s);
    const bez=(p0,p1,p2,t)=>p0.clone().multiplyScalar((1-t)**2).addScaledVector(p1,2*(1-t)*t).addScaledVector(p2,t*t);
    for(let i=0;i<SAMPLES;i++){
      const p=i<LEG?bez(arch,outCtl,start,i/LEG)
             :i>SAMPLES-1-LEG?bez(end,inCtl,home,(i-(SAMPLES-1-LEG))/LEG)
             :onLoop(a0+gap+(Math.PI*2-2*gap)*(i-LEG)/(SAMPLES-1-2*LEG));
      centres.set([p.x,0,p.z],i*3);
    }
  }

  let blocks=[],lift=0,target=0,morphed=false,painted=null,wispScale=0;
  const nodes=[], frame={centre:new T.Vector3(),right:new T.Vector3(),up:new T.Vector3(),length:RIBBON.length};

  function setBlocks(list){
    blocks=[...list].sort((a,b)=>a.start-b.start);
    const up=new T.Vector3(0,1,0), tan=new T.Vector3(), sd=new T.Vector3();
    let y=ground(centres[0],centres[2])??.7;
    for(let i=0;i<SAMPLES;i++){
      const a=Math.max(0,i-1)*3, b=Math.min(SAMPLES-1,i+1)*3, cx=centres[i*3], cz=centres[i*3+2];
      const g=ground(cx,cz);if(g!==null)y=g;
      centres[i*3+1]=y+HOVER;
      sd.crossVectors(up,tan.set(centres[b]-centres[a],0,centres[b+2]-centres[a+2])).normalize().multiplyScalar(WIDTH/2);
      base.set([cx+sd.x,y+HOVER,cz+sd.z,cx-sd.x,y+HOVER,cz-sd.z],i*6);
    }
    const e=(SAMPLES-1)*3, p=(SAMPLES-3)*3, ay=y+HOVER+.01;
    const dir=new T.Vector3(centres[e]-centres[p],0,centres[e+2]-centres[p+2]).normalize(), perp=new T.Vector3(-dir.z,0,dir.x);
    const end=new T.Vector3(centres[e],0,centres[e+2]), tip=end.clone().addScaledVector(dir,1.3);
    arrowGeo.attributes.position.array.set([tip.x,ay,tip.z,end.x+perp.x*.95,ay,end.z+perp.z*.95,end.x-perp.x*.95,ay,end.z-perp.z*.95]);
    arrowGeo.attributes.position.needsUpdate=true;
    nodes.length=0;
    for(const b of blocks){
      const i=Math.round(timeToU(b.start+b.mins/2)*(SAMPLES-1));
      nodes.push({block:b,local:new T.Vector3(centres[i*3],centres[i*3+1],centres[i*3+2])});
    }
    position.set(base);geometry.attributes.position.needsUpdate=true;morphed=false;painted=null;
  }

  const tmp=new T.Color();
  function paint(now,t,motion){
    // with motion on, light flows along the lit path every frame, so no caching
    const wu=timeToU(now), key=motion?null:`${wu.toFixed(4)}|${lift}`;if(key!==null&&painted===key)return;painted=key;
    for(let i=0;i<SAMPLES;i++){
      const u=i/(SAMPLES-1), m=uToTime(u), b=blocks.find(b=>m>=b.start&&m<b.start+b.mins), glow=u<=wu||!!b?.done;let a;   // finished early: lit now
      if(b){
        const f=((m-b.start)%30)/30;
        tmp.copy(!own&&b.vis==='hidden'?HIDDEN:COLORS[b.cat]??HIDDEN);
        a=f<.08||f>.92?0:glow?1:.62;                       // a hairline gap every 30 minutes
        if(b.skipped){tmp.lerp(GREY,.6);a*=.35;}
      }else{tmp.copy(NEUTRAL);a=glow?.45:.18;}             // free time stays quiet
      // true colour when lit (overdriving it bleached everything white); ahead, a little softer
      let k=glow?1.15:.8;
      if(glow&&motion)k*=1+.6*Math.pow(Math.max(0,Math.sin(u*70-t*1.4)),10);   // pulses travel toward the wisp
      for(const v of [0,1])color.set([tmp.r*k,tmp.g*k,tmp.b*k,a],(i*2+v)*4);
    }
    geometry.attributes.color.needsUpdate=true;
  }

  // The lifted ribbon hangs in front of the camera, laid out by clock time.
  const q=new T.Vector3(), fwd=new T.Vector3();
  function aim(camera){
    camera.updateMatrixWorld();camera.matrixWorld.extractBasis(frame.right,frame.up,fwd);fwd.negate();
    const visible=2*RIBBON.distance*Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.aspect;
    frame.length=Math.min(RIBBON.length,visible*.84);
    frame.centre.copy(camera.position).addScaledVector(fwd,RIBBON.distance).addScaledVector(frame.up,1.8);
    const gp=island.group.position;
    for(let i=0;i<SAMPLES;i++){
      const x=(uToTime(i/(SAMPLES-1))-DAWN)/(NIGHT-DAWN)-.5;
      for(const v of [0,1]){
        q.copy(frame.centre).addScaledVector(frame.right,x*frame.length).addScaledVector(frame.up,(v?-.5:.5)*RIBBON.height).sub(gp);
        sky.set([q.x,q.y,q.z],(i*2+v)*3);
      }
    }
  }
  function morph(){
    for(let i=0;i<SAMPLES;i++){
      const p=smooth(clamp01(lift*1.6-i/(SAMPLES-1)*.6));   // the morning lifts first
      for(let j=i*6;j<i*6+6;j++)position[j]=base[j]+(sky[j]-base[j])*p;
    }
    geometry.attributes.position.needsUpdate=true;morphed=true;
  }

  setBlocks(initial??[]);
  return {
    setBlocks,
    setLift(on){target=on?1:0;},
    get lifted(){return target===1;},
    get lift(){return lift;},
    get blocks(){return blocks;},
    // Clear scenery sitting on the path (a shrub puff, a tuft, a rock) so the
    // day stays readable. Whole pieces go at a time; everything beside the
    // path stays. `root` is the island model, `names` its meshes to check.
    clearPath(root,names){
      island.group.updateMatrixWorld(true);
      const toGroup=new T.Matrix4().copy(group.matrixWorld).invert(), m=new T.Matrix4(), p=new T.Vector3();
      const reach=WIDTH/2+.15;
      const near=(x,z,r)=>{for(let i=0;i<SAMPLES;i+=2){const dx=x-centres[i*3],dz=z-centres[i*3+2];if(dx*dx+dz*dz<r*r)return true;}return false;};
      for(const name of names){
        const mesh=root.getObjectByName(name);if(!mesh?.isMesh)continue;
        const g=mesh.geometry, pos=g.attributes.position, n=pos.count;
        m.multiplyMatrices(toGroup,mesh.matrixWorld);
        // a piece = vertices joined by triangles, or sharing a position (flat-shaded seams)
        const parent=Int32Array.from({length:n},(_,i)=>i);
        const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
        const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
        const seen=new Map();
        for(let i=0;i<n;i++){const k=`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`,j=seen.get(k);if(j===undefined)seen.set(k,i);else join(i,j);}
        const idx=g.index?Array.from(g.index.array):Array.from({length:n},(_,i)=>i);
        for(let t=0;t<idx.length;t+=3){join(idx[t],idx[t+1]);join(idx[t],idx[t+2]);}
        const world=new Float32Array(n*2), box=new Map();
        for(let i=0;i<n;i++){
          p.fromBufferAttribute(pos,i).applyMatrix4(m);world[i*2]=p.x;world[i*2+1]=p.z;
          const r=find(i);let b=box.get(r);if(!b)box.set(r,b=[p.x,p.x,p.z,p.z]);
          b[0]=Math.min(b[0],p.x);b[1]=Math.max(b[1],p.x);b[2]=Math.min(b[2],p.z);b[3]=Math.max(b[3],p.z);
        }
        // small pieces go whole when they touch the path; a large merged piece is tested triangle by triangle
        const verdict=new Map();
        for(const [r,b] of box){const size=Math.max(b[1]-b[0],b[3]-b[2])/2;if(size<1.5)verdict.set(r,near((b[0]+b[1])/2,(b[2]+b[3])/2,reach+size));}
        const kept=[];let dropped=0;
        for(let t=0;t<idx.length;t+=3){
          const v=verdict.get(find(idx[t]));
          const cut=v??near((world[idx[t]*2]+world[idx[t+1]*2]+world[idx[t+2]*2])/3,(world[idx[t]*2+1]+world[idx[t+1]*2+1]+world[idx[t+2]*2+1])/3,reach);
          if(cut)dropped++;else kept.push(idx[t],idx[t+1],idx[t+2]);
        }
        if(dropped)g.setIndex(kept);
      }
    },
    // world point on the lifted ribbon, `drop` units below its lower edge
    ribbonPoint(minutes,drop,out){
      const x=(minutes-DAWN)/(NIGHT-DAWN)-.5;
      return out.copy(frame.centre).addScaledVector(frame.right,x*frame.length).addScaledVector(frame.up,-RIBBON.height/2-drop);
    },
    near(world,radius){
      const gp=island.group.position;let best=null;
      for(const n of nodes){
        if(!own&&n.block.vis==='hidden')continue;
        const d=Math.hypot(world.x-gp.x-n.local.x,world.z-gp.z-n.local.z);
        if(d<radius&&(!best||d<best.d))best={block:n.block,d,at:n.local.clone().add(gp).add(new T.Vector3(0,.5,0))};
      }
      return best;
    },
    update(now,t,dt,camera,motion){
      paint(now,t,motion);arrow.material.opacity=.85*(1-lift);
      if(lift!==target)lift=motion?clamp01(lift+Math.sign(target-lift)*dt/1.4):target;
      if(lift>0){aim(camera);morph();}
      else if(morphed){position.set(base);geometry.attributes.position.needsUpdate=true;morphed=false;}
      const wu=timeToU(now), on=wu>.002&&wu<.998;
      wispScale+=((on?1:0)-wispScale)*Math.min(1,dt*3);
      wisp.visible=wispScale>.01;wisp.scale.setScalar(wispScale);
      const f=wu*(SAMPLES-1), i0=Math.min(SAMPLES-2,Math.floor(f)), k=f-i0;
      for(const [axis,o] of [['x',0],['y',1],['z',2]]){
        const a=(position[i0*6+o]+position[i0*6+3+o])/2, b=(position[i0*6+6+o]+position[i0*6+9+o])/2;
        wisp.position[axis]=a+(b-a)*k;
      }
      wisp.position.y+=.6*(1-smooth(lift))+(motion?Math.sin(t*2.3)*.08:0);
    },
  };
}
