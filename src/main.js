import './style.css';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HeightField, bridgePoint, bridgeSlope, surfaceAt, islandSurface } from './navigation.js';
import { createAtmosphere, createWeather, createSinkBank } from './atmosphere.js';
import { initLife, setStrain } from './life.js';
import { ME, HIGH, LOW, symbolImg } from './data.js';
import { createForest } from './forest.js';
import { createPier } from './pier.js';
import { GATE_POSTS, GATE_OUT as GATE_WAY, moveGate } from './gate.js';
import { makeGardener } from './blomy.js';
import { createGuide } from './guide.js';
import { createWatering } from './watering.js';
import * as sound from './sound.js';
import { createLogin } from './login.js';
import { demoWorld, enterWorld, DEMO_PEOPLE } from './world.js';
import * as backend from './backend.js';

const $=id=>document.getElementById(id), canvas=$('world');
// One activity category = one tree species (groves.js). The gathering
// island's mushrooms and clover are decoration only.
const SPECIES_SCALE={sakura:1.05,purple:1.2,oak:.85,palm:1.0,mushrooms:.5,clover:.32,
                     willow:.95,pale:.9,magic_mushrooms:1.25};
// Torii pillars, in member-island model units (same for every variant): the torii stands at the shore (gate.js).
const TORII_POSTS=GATE_POSTS;
// Everyone arrives on their own pier, just in front of the torii, facing in (spawnOn), with the camera out
// beyond, looking through the gate across the island. ARCH_SPAWN is only the fallback for an island without one.
const ARCH_SPAWN=[-4.1,-3.8], ARCH_CAM=[-11.9,10,-10.7];

// A sky holds up to five member islands, 72 degrees apart on a ring round the
// gathering island; a member's slot fixes where their island floats. Each is
// one of three irregular outlines (meadow_a/b/c); plantings sit away from its
// bridge landing, its torii, and the camera side (+z) of the spawn -- the
// walk-in camera sits behind the gardener at +z, so a grove there fills the view.
const RING=120;   // far enough out that a bridge between 0 m and 45 m climbs at about 30 degrees
const SLOTS={sakura:{model:'meadow_a',angle:210,altitude:14},purple:{model:'meadow_b',angle:354,altitude:20},
             oak:{model:'meadow_c',angle:66,altitude:-11},willow:{model:'meadow_b',angle:282,altitude:8},
             palm:{model:'meadow_c',angle:138,altitude:25}};
const COMMUNITY={id:'community',model:'community',name:'The gathering Island',owner:null,
   description:'Everyone’s island. The bridges start here.',
   x:0,z:0,altitude:0,scale:2.2,spawn:[2,.5],
   // the trunk; its buttress roots are fenced off by field.block() in init()
   obstacles:[{x:6.2,z:-5.6,r:2.7}],
   // between the bridges, clear of every landing
   plantings:[{asset:'mushrooms',n:4,a:1.78,r:16,spread:3},
              {asset:'clover',n:4,a:4.29,r:15,spread:3.5}]};
// people: [{id, name}] in slot order; ME (data.js) says which one is yours
function defineIslands(people){
  return [COMMUNITY,...people.map(p=>{
    const s=SLOTS[p.id], a=s.angle*Math.PI/180;
    return {id:p.id,model:s.model,owner:p.name,description:p.description??'',
            x:+(Math.cos(a)*RING).toFixed(1),z:+(Math.sin(a)*RING).toFixed(1),altitude:s.altitude,scale:2.0,
            spawn:ARCH_SPAWN,cam:ARCH_CAM,obstacles:TORII_POSTS};
  })].map(d=>({...d,name:d.id===ME?'My island':d.owner?`${d.owner}’s island`:d.name}));
}
// until someone signs in, the sky view frames the full five
let definitions=defineIslands(DEMO_PEOPLE);

// Decorative groves on the gathering island: `n` of one species in a tight
// cluster. Member islands grow their activity trees in forest.js.
// The pier the whale brings Blomy to on the welcome page (src/pier.js): out from the shore in front of each
// member island's torii, so the landing and the island are the same place. Its deck is walkable (navigation.js).
const GATE_MID={x:-5.4,z:-5.0}, GATE_OUT=new T.Vector3(-.742,0,-.671);   // model units, the same on every meadow island
function buildPier(island){
  const h=d=>island.field.height(GATE_MID.x+GATE_OUT.x*d,GATE_MID.z+GATE_OUT.z*d);
  let d=2.5;while(d<12&&h(d+.1)!==null)d+=.1;d-=.3;             // the last ground before the edge
  const s=island.scale, shore=new T.Vector3((GATE_MID.x+GATE_OUT.x*d)*s,(h(d)??.33)*s,(GATE_MID.z+GATE_OUT.z*d)*s);
  let seed=island.id.length*7919+13;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const pier=createPier({shore,out:GATE_OUT,rnd,lights:false});
  pier.group.traverse(o=>{o.userData.islandId=island.id;});
  return pier;
}
function plantIsland(island,group,assets){
  let seed=island.id.length*977+41;
  const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  for(const g of island.plantings??[]){
    const cx=Math.cos(g.a)*g.r,cz=Math.sin(g.a)*g.r;
    let made=0;
    for(let tries=0;tries<g.n*20&&made<g.n;tries++){
      const t=rnd()*Math.PI*2,d=Math.sqrt(rnd())*g.spread;
      const ox=cx+Math.cos(t)*d,oz=cz+Math.sin(t)*d;
      const surface=islandSurface(island,island.x+ox,island.z+oz,1.1);
      if(!surface)continue;
      const lx=ox/island.scale,lz=oz/island.scale;
      if(island.obstacles.some(o=>Math.hypot(lx-o.x,lz-o.z)<o.r+.8))continue;
      const model=assets[g.asset].clone(true);
      const sc=(SPECIES_SCALE[g.asset]??1)*(.85+rnd()*.4);
      model.scale.setScalar(sc);
      model.position.set(ox,surface.y-island.altitude,oz);
      model.rotation.y=rnd()*Math.PI*2;
      model.traverse(o=>{o.userData.islandId=island.id;});
      group.add(model);
      if(g.asset!=='mushrooms'&&g.asset!=='clover')
        island.obstacles.push({x:lx,z:lz,r:.85*sc/island.scale});
      made++;
    }
  }
}
let renderer,scene,camera,controls,composer,atmosphere,gardener,life,forest,watering,sunLight,hemiLight,fillLight;
const islands=[],bridges=[],keys=new Set();
let selected='community',mode='overview',ready=false,motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0,transition=null,noticeTimer;
const player={position:new T.Vector3(),surface:null,distance:0,hop:0,vy:0,stuck:0};
const look=new T.Vector3(),targetPosition=new T.Vector3(),cameraOffset=new T.Vector3(0,11,17);
const raycaster=new T.Raycaster(),pointer=new T.Vector2();
const bridgeMaterial=new T.MeshStandardMaterial({color:'#efd2a2',emissive:'#ffbd62',emissiveIntensity:.3,roughness:.8});

function notice(message){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),3000);}
function makeMesh(geometry,material,parent,position){const m=new T.Mesh(geometry,material);if(position)m.position.copy(position);parent.add(m);return m;}
// Small scattered detail (flowers, tufts, vines, floating rocks under the island) keeps receiving shadow but no
// longer casts it: those shadows were a few pixels each, and casting them meant drawing ~0.5M more triangles a frame.
const NO_SHADOW=/^(Flowers|Tufts|FloatGrass|FloatRock|VineLeaves|VineStems|RimBlossom|ScatterRocks|LilyPads|Lotus|ReedHeads|Reeds|Water|Waterfalls)$/;
function setMaterials(root){root.traverse(o=>{if(!o.isMesh)return;o.castShadow=!NO_SHADOW.test(o.name);o.receiveShadow=true;o.material.side=T.DoubleSide;
  if(/Glass|Lantern/i.test(o.name)){o.material=o.material.clone();o.material.emissive=new T.Color('#ffd38a');o.material.emissiveIntensity=2.2;}
  if(o.name==='Water'){o.material=new T.MeshStandardMaterial({color:'#8ac5b6',metalness:.35,roughness:.2,transparent:true,opacity:.86});}
  if(o.name==='Waterfalls'){o.material=new T.MeshStandardMaterial({color:'#c0e3d9',emissive:'#87c6c4',emissiveIntensity:.15,transparent:true,opacity:.65,side:T.DoubleSide,roughness:.3});}
  // Mushroom gills and spots, pale-tree motes: unlit, and bright enough to bloom.
  if(o.name==='Glow'){o.material=new T.MeshBasicMaterial({vertexColors:true,color:new T.Color(1.7,1.55,1.3),side:T.DoubleSide});o.castShadow=false;}
});}

function buildBridge(island){
  let bridge=bridges.find(b=>b.id===island.id);
  if(bridge){scene.remove(bridge.group);bridge.group.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
  else {bridge={id:island.id,glow:1.2,width:1.75,arch:3.4};bridges.push(bridge);}
  const central=islands[0],dx=island.x,dz=island.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
  // Start well inside each safe shoreline so terrain and bridge overlap.
  const cs=central.scale;
  let startRadius=10.8*cs;
  for(let r=10.8*cs;r<14*cs;r+=.15*cs){if(islandSurface(central,ux*r,uz*r,.05)){startRadius=r;break;}}
  const endRadius=10.5*island.scale;
  const sx=ux*startRadius,sz=uz*startRadius,ex=island.x-ux*endRadius,ez=island.z-uz*endRadius;
  const sh=central.field.height(sx/cs,sz/cs)??.35,eh=island.field.height((ex-island.x)/island.scale,(ez-island.z)/island.scale)??.35;
  bridge.start=new T.Vector3(sx,central.altitude+Math.max(sh,.2)*cs+.06,sz);
  bridge.end=new T.Vector3(ex,island.altitude+eh*island.scale+.06,ez);
  bridge.group=new T.Group();scene.add(bridge.group);
  const side=new T.Vector3(-uz,0,ux),points=[];
  for(let n=0;n<=64;n++){let p=bridgePoint(bridge,n/64);points.push(new T.Vector3(p.x,p.y,p.z));}
  const deckMaterial=bridgeMaterial.clone();deckMaterial.emissiveIntensity=bridge.glow*.16;bridge.deckMaterial=deckMaterial;
  const planks=new T.InstancedMesh(new T.BoxGeometry(bridge.width,.11,.36),deckMaterial,Math.ceil(length*2.4));
  const usable=points.reduce((s,p,n)=>n?s+p.distanceTo(points[n-1]):0,0),count=Math.min(planks.count,Math.ceil(usable/.39));planks.count=count;const dummy=new T.Object3D();
  for(let n=0;n<count;n++){const t=n/(count-1),p=bridgePoint(bridge,t);dummy.position.set(p.x,p.y-.03,p.z);dummy.rotation.set(0,Math.atan2(ux,uz),0);dummy.rotation.x=-Math.atan(bridgeSlope(bridge,t)/Math.hypot(ex-sx,ez-sz));dummy.updateMatrix();planks.setMatrixAt(n,dummy.matrix);}planks.castShadow=true;planks.receiveShadow=true;bridge.group.add(planks);
  const glow=new T.MeshStandardMaterial({color:'#ffe5ac',emissive:'#ffc36c',emissiveIntensity:bridge.glow*2.2,roughness:.45});bridge.glowMaterial=glow;
  // the 26 posts are one instanced draw
  const posts=new T.InstancedMesh(new T.CylinderGeometry(.035,.035,1.05,5),glow,26);let k=0;
  for(const sign of [-1,1]){
    for(const height of [.12,1.05]){const railPoints=points.map(p=>p.clone().addScaledVector(side,sign*bridge.width*.48).add(new T.Vector3(0,height,0)));makeMesh(new T.TubeGeometry(new T.CatmullRomCurve3(railPoints),64,.026,5,false),glow,bridge.group);}
    for(let n=0;n<=12;n++){const p=bridgePoint(bridge,n/12);dummy.position.set(p.x+side.x*sign*bridge.width*.48,p.y+.54,p.z+side.z*sign*bridge.width*.48);dummy.rotation.set(0,0,0);dummy.updateMatrix();posts.setMatrixAt(k++,dummy.matrix);}
  }
  bridge.group.add(posts);
}

// A new altitude glides in over a couple of seconds instead of jumping, so a sinking island visibly passes into
// the clouds and the mist has something to react to; bridges follow a few times a second while it moves.
// Before the world is ready, or with motion off, it is set at once.
function updateAltitude(island,altitude){
  if(!ready||!motion){island.altTarget=null;applyAltitude(island,altitude,true);return;}
  island.altTarget=altitude;
}
let glideTick=0;
function glideAltitudes(dt){
  glideTick++;
  for(const i of islands){
    if(i.altTarget==null)continue;
    const d=i.altTarget-i.altitude, done=Math.abs(d)<.05;
    applyAltitude(i,done?i.altTarget:i.altitude+d*Math.min(1,dt*1.6),done||glideTick%4===0);
    if(done)i.altTarget=null;
  }
}
function applyAltitude(island,altitude,bridgesToo){
  const old=island.altitude;island.altitude=altitude;island.group.position.y=altitude;island.weatherFx.group.position.y=altitude;
  island.sink.group.position.y=altitude;island.sink.set(altitude);
  if(bridgesToo){if(island.id==='community')for(const i of islands.slice(1))buildBridge(i);else buildBridge(island);}
  if(player.surface?.kind==='island'&&player.surface.id===island.id)player.position.y+=altitude-old;
  const surface=surfaceAt(islands,bridges,player.position.x,player.position.z);if(surface){player.position.y=surface.y;player.surface=surface;}
}

function syncPanel(){const i=islands.find(i=>i.id===ME);if(!i)return;$('altitude').value=i.altitude;$('altitude-value').value=`${i.altitude.toFixed(1)} m`;$('weather').value=i.strain??0;$('weather-value').value=i.weather;document.querySelectorAll('.island-label').forEach(b=>b.classList.toggle('selected',b.dataset.island===selected));}

function spawnOn(island){
  if(island.pier){   // on the pier, a step in front of the gate, facing in
    const p=island.pier.pierAt(1.8).add(island.group.position),s=surfaceAt(islands,bridges,p.x,p.z);
    if(s){player.position.set(s.x,s.y,s.z);player.surface=s;if(gardener)gardener.rotation.y=Math.atan2(-GATE_WAY.x,-GATE_WAY.z);return;}
  }
  const desired={x:island.x+island.spawn[0]*island.scale,z:island.z+island.spawn[1]*island.scale};
  let found=islandSurface(island,desired.x,desired.z);
  for(let r=.5;!found&&r<10;r+=.5)for(let a=0;a<Math.PI*2;a+=.35){found=islandSurface(island,desired.x+Math.cos(a)*r,desired.z+Math.sin(a)*r);if(found)break;}
  if(!found)throw new Error(`No walkable spawn for ${island.id}`);
  player.position.set(found.x,found.y,found.z);player.surface=found;
}

// Arriving anywhere: "Welcome to …" sits in the middle of the screen for a
// moment, then slides down into its corner and settles as the usual kicker.
let arriveTimer;
// Arriving on an island, the way games title a new area: its name big in the middle, with its weather and its
// altitude, for a couple of seconds; then it drifts away and the corner already says where you are.
const SKY_ICON={'Clear':'clear','Light cloud':'light-cloud','Cloudy':'cloudy','Drizzle':'drizzle','Rain':'rain'};
const SKY_SAYS=s=>s<.2?'clear days lately':s<.35?'mostly clear':s<.55?'a heavier few days':s<.75?'a tiring stretch':'a hard week';
const heightSays=(i,a)=>i.id==='community'?'Where the bridges meet':Math.abs(a)<2?`At ${i.id===ME?'your':'their'} usual height`
  :`${Math.round(Math.abs(a))} m ${a>0?'above':'below'} ${i.id===ME?'your':'their'} usual`;
function arrive(island){
  const kicker=island.id===ME?'Home':island.owner?`Visiting ${island.owner}`:'Everyone’s island';
  $('location-kicker').textContent=kicker;$('location-title').textContent=island.name;
  const place=document.querySelector('.place');place.classList.add('arriving');
  $('arrival-kicker').textContent=island.id===ME?'Welcome home':'Welcome to';$('arrival-title').textContent=island.name;
  const pill=(icon,text)=>{const p=document.createElement('span');p.className='arrival-pill';p.append(icon,text);return p;};
  $('arrival-stats').replaceChildren(
    pill(symbolImg(`sky-${SKY_ICON[island.weather]??'clear'}`,'arrival-icon'),`${island.weather} · ${SKY_SAYS(island.strain??0)}`),
    pill(symbolImg('altitude','arrival-icon'),heightSays(island,island.altTarget??island.altitude)));
  const el=$('arrival');el.hidden=false;el.classList.remove('on','calm');void el.offsetWidth;el.classList.add('on');if(!motion)el.classList.add('calm');
  clearTimeout(arriveTimer);
  arriveTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('on');place.classList.remove('arriving');},motion?3000:1600);
}
// Camera on the keyboard: Q/E turn, R/F tilt, Z/X zoom. A held key moves the
// camera at a steady rate, which records far more smoothly than dragging.
const CAM_TURN=.85, CAM_TILT=.5, CAM_ZOOM=1.25, sph=new T.Spherical(), off=new T.Vector3();
function turnCamera(dt){
  const turn=(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0);
  const tilt=(keys.has('KeyF')?1:0)-(keys.has('KeyR')?1:0);
  const zoom=(keys.has('KeyX')?1:0)-(keys.has('KeyZ')?1:0);
  if(!turn&&!tilt&&!zoom)return;
  off.subVectors(camera.position,controls.target);sph.setFromVector3(off);
  sph.theta-=turn*CAM_TURN*dt;
  sph.phi=T.MathUtils.clamp(sph.phi+tilt*CAM_TILT*dt,controls.minPolarAngle+.05,controls.maxPolarAngle-.05);
  sph.radius=T.MathUtils.clamp(sph.radius*(1+zoom*CAM_ZOOM*dt),controls.minDistance,controls.maxDistance);
  camera.position.copy(controls.target).add(off.setFromSpherical(sph));
}
function visit(id){if(!ready)return;selected=id;mode='walk';$('app').dataset.mode=mode;if(innerWidth>=600&&!TOUCH)$('island-card').open=true;const island=islands.find(i=>i.id===id);spawnOn(island);controls.enabled=true;controls.minDistance=6;controls.maxDistance=skyReach();cameraOffset.set(...(island.cam??[0,10,16]));
  transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};
  arrive(island);
  $('hint').textContent='';   // the island's status shows below instead (life.js)
$('overview').setAttribute('aria-pressed','false');$('walk').setAttribute('aria-pressed','true');syncPanel();canvas.focus({preventScroll:true});}
function overview(){if(!ready)return;mode='overview';$('app').dataset.mode=mode;$('island-card').open=false;controls.enabled=true;controls.minDistance=14;controls.maxDistance=skyReach();transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};clearTimeout(arriveTimer);document.querySelector('.place').classList.remove('arriving');document.querySelector('.place-title').style.transform='';$('location-kicker').textContent='Your sky neighborhood';$('location-title').textContent='A world of little wonders.';$('hint').textContent='Choose an island. Stay a little while.';$('overview').setAttribute('aria-pressed','true');$('walk').setAttribute('aria-pressed','false');keys.clear();}
// The sky view may zoom out a little past the framing, never far enough to lose the world.
const skyReach=()=>overviewPosition().distanceTo(new T.Vector3(0,2,0))*1.25;
function overviewPosition(){
  // Project every island's corners and solve for the distance that fits them
  // all. A closed-form guess breaks as soon as the layout is asymmetric --
  // an island placed toward the camera sits much nearer than its radius says.
  // a lower look (about 30 degrees) than straight down, so a high island reads as high, not as far away
  const dir=new T.Vector3(0,.5,.87).normalize(),target=new T.Vector3(0,2,0),pts=[];
  // the islands as they float now, once built; before that, the layout's own seeds
  for(const d of islands.length?islands:definitions){
    const r=15.5*d.scale;
    for(const ox of [-r,r]) for(const oz of [-r,r]) for(const oy of [-3*d.scale,9*d.scale])
      pts.push(new T.Vector3(d.x+ox,d.altitude+oy,d.z+oz));
  }
  const probe=camera.clone();
  const tanY=Math.tan(T.MathUtils.degToRad(probe.fov)/2),tanX=tanY*probe.aspect;
  let dist=220;
  for(let n=0;n<26;n++){
    probe.position.copy(target).addScaledVector(dir,dist);
    probe.lookAt(target); probe.updateMatrixWorld(true);
    const inv=new T.Matrix4().copy(probe.matrixWorld).invert();
    let need=0;
    for(const p of pts){
      const q=p.clone().applyMatrix4(inv),z=-q.z;
      if(z<=.5){need=Math.max(need,4);continue;}
      need=Math.max(need,Math.abs(q.x)/(z*tanX),Math.abs(q.y)/(z*tanY));
    }
    const want=need*0.99;
    if(Math.abs(want-1)<.008)break;
    dist*=1+.8*(want-1);
  }
  return target.clone().addScaledVector(dir,dist);
}

const facing=new T.Vector3();
// Never trapped: when pressing a direction goes nowhere, check whether any
// nearby step is possible; if none is (a tree grew here, the island moved),
// step out to the nearest open ground.
const around=(r,n,ok)=>{
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,s=surfaceAt(islands,bridges,player.position.x+Math.cos(a)*r,player.position.z+Math.sin(a)*r);if(s&&ok(s))return s;}
  return null;
};
function unstick(){
  if(surfaceAt(islands,bridges,player.position.x,player.position.z)&&around(.3,8,s=>Math.abs(s.y-player.position.y)<.65))return;
  for(let r=.5;r<=3;r+=.5){const s=around(r,16,()=>true);if(s){player.position.set(s.x,s.y,s.z);player.surface=s;return;}}
}
// Blomy, the gardener from the welcome page (src/blomy.js), at a walking size for the island: about 2 m (on the
// welcome page she is shown storybook-large). Her legs and arms swing as she walks; standing, she breathes.
const BLOMY_HEIGHT=2, STRIDE=6;   // metres tall; leg-swing phase per metre walked
function makeBlomy(){
  const b=makeGardener();b.scale.setScalar(BLOMY_HEIGHT/new T.Box3().setFromObject(b).getSize(new T.Vector3()).y);
  b.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=false;});   // no blocky self-shadow on her face
  return b;
}
function pose(dt){
  if(!gardener)return;const g=gardener.userData;
  if(chore?.pouring)g.water(chore.time/POUR,elapsed);
  else if(player.moving&&!player.hop)g.walk(player.distance*STRIDE,motion?1:0);else g.idle(motion?elapsed:0);
  g.after(dt,elapsed);
}
// Footsteps: one each time a foot comes down (every half walk cycle), on whatever is underfoot (navigation.js
// `under`). Her legs cycle fast, so steps are spaced to a natural pace, a little quicker running. Breaking into a
// run pushes off with a rush of air.
let footfall=0,lastStep=0,wasRunning=false;
function footsteps(){
  const n=Math.floor(player.distance*STRIDE/Math.PI);
  const now=performance.now()/1000;   // not `elapsed`: that stands still with motion off
  if(player.moving&&!player.hop&&n!==footfall&&now-lastStep>=(player.running?.2:.26)){lastStep=now;sound.step(player.surface?.under??'grass',{run:player.running});}
  footfall=n;
  if(player.running&&player.moving&&!wasRunning)sound.play('sprint',{gain:.6,cooldown:1.2});
  wasRunning=player.running&&player.moving;
}
// Getting about: 4.1 m/s on foot, quicker on a bridge (they are long now the islands float far apart), and Shift
// runs anywhere. On a bridge a banner says where it leads; Go walks you the rest of the way at a run.
const WALK=4.1, BRIDGE_PACE=1.8, RUN=1.6;
let travel=null, lastT=null, heading=1;
function bridgeBanner(){
  const s=mode==='walk'&&!transition&&player.surface?.kind==='bridge'?player.surface:null, el=$('bridge-banner');
  if(!s){if(!el.hidden)el.hidden=true;lastT=null;return;}
  if(travel)heading=travel.dir;else if(lastT!==null&&Math.abs(s.t-lastT)>1e-4)heading=Math.sign(s.t-lastT);lastT=s.t;
  const to=heading>0?islands.find(i=>i.id===s.id):islands[0];
  const text=to.id===ME?'Heading home':`Heading to ${to.name}`;
  if(el.hidden)el.hidden=false;if($('bridge-to').textContent!==text)$('bridge-to').textContent=text;
  $('bridge-go').hidden=!!travel;
}
function crossBridge(dt){
  const b=bridges.find(b=>b.id===travel.bridge),len=b.start.distanceTo(b.end),pace=WALK*BRIDGE_PACE*RUN;
  travel.t=Math.min(1,Math.max(0,travel.t+travel.dir*pace*dt/len));
  const p=bridgePoint(b,travel.t), ux=(b.end.x-b.start.x)/len*travel.dir, uz=(b.end.z-b.start.z)/len*travel.dir;
  player.position.set(p.x,p.y,p.z);player.surface={...p,t:travel.t,kind:'bridge',id:b.id,under:'wood'};player.distance+=pace*dt;player.moving=player.running=true;
  turnTo(Math.atan2(ux,uz),dt);
  if(travel.t>0&&travel.t<1)return;
  // the end of the bridge: step off onto the island there
  for(let d=.5;d<8;d+=.5){const s=surfaceAt(islands,[],p.x+ux*d,p.z+uz*d);if(s?.kind==='island'){player.position.set(s.x,s.y,s.z);player.surface=s;break;}}
  travel=null;
  if(player.surface.kind==='island'&&player.surface.id!==selected){selected=player.surface.id;arrive(islands.find(i=>i.id===selected));syncPanel();}
}
$('bridge-go').onclick=()=>{const s=player.surface;if(s?.kind!=='bridge')return;travel={bridge:s.id,t:s.t,dir:heading};canvas.focus({preventScroll:true});};
// Touch screens: a joystick for walking, bottom left, on foot only (?touch shows it with a mouse, for testing).
// Push to walk, all the way to run; it drives the same walking as WASD. A second finger on the scene still turns
// the camera. On a phone the island card folds away while you walk, so it isn't under your thumb.
const TOUCH=matchMedia('(pointer: coarse)').matches||new URLSearchParams(location.search).has('touch');
const stick={on:false,x:0,y:0,id:null};
{const base=$('stick'),knob=base.firstElementChild,R=46;
  const move=e=>{const r=base.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    const d=Math.hypot(dx,dy);if(d>R){dx*=R/d;dy*=R/d;}stick.x=dx/R;stick.y=dy/R;knob.style.translate=`${dx}px ${dy}px`;};
  base.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();base.setPointerCapture(e.pointerId);stick.on=true;stick.id=e.pointerId;move(e);});
  base.addEventListener('pointermove',e=>{if(stick.on&&e.pointerId===stick.id)move(e);});
  const end=e=>{if(e.pointerId!==stick.id)return;stick.on=false;stick.x=stick.y=0;stick.id=null;knob.style.translate='';};
  base.addEventListener('pointerup',end);base.addEventListener('pointercancel',end);}
let stickShown=false;
function showStick(){
  const want=TOUCH&&mode==='walk'&&!transition;if(want===stickShown)return;stickShown=want;$('stick').hidden=!want;
  if(want&&innerWidth<600)$('island-card').open=false;
  if(!want){stick.on=false;stick.x=stick.y=0;}
}
// The first-time guide (guide.js): come home, walk, hang a feeling, open the planner and your balance, then the
// bridges. Each step lights up what to touch and waits until you have touched it.
let walkedFrom=0, felt=false;
$('moods').addEventListener('click',e=>{if(e.target.closest('.mood'))felt=true;});
const closeSheet=id=>document.querySelector(`#${id} .sheet-close`)?.click();
const guide=createGuide([
  {say:'Hi, I’m Blomy! This is your sky: every island is someone’s week, and yours is “My island”. Tap it to come home.',
   target:()=>islands.find(i=>i.id===ME)?.label,hand:true,done:()=>mode==='walk'&&!transition},
  {say:()=>TOUCH?'This is home! Walk with the joystick, and drag with another finger to look around.'
                :'This is home! Try walking: press the keys and watch them light up.',
   art:()=>TOUCH?'stick':'keys',target:()=>TOUCH?$('stick'):null,hand:true,
   start:()=>{walkedFrom=player.distance;},done:()=>player.distance-walkedFrom>8},
  {say:'How are you feeling right now? Tap here.',target:()=>$('mood-toggle'),hand:true,done:()=>!$('mood-panel').hidden},
  {say:'Pick the one closest. It hangs as a lantern on your pier, and over a few days your feelings make your island’s weather.',
   start:()=>{felt=false;},target:()=>$('mood-panel').hidden?null:$('moods'),hand:true,done:()=>felt},
  {say:'Your week lives in the Planner. Every activity you finish grows a tree on your island.',
   target:()=>$('planner-toggle'),hand:true,done:()=>!$('planner-sheet').hidden},
  {say:'And Your balance shows how heavy your week is, with small changes that would help.',
   start:()=>setTimeout(()=>closeSheet('planner-sheet'),1400),
   target:()=>$('planner-sheet').hidden?$('balance-toggle'):null,hand:true,done:()=>!$('balance-sheet').hidden},
  {say:'That’s your island! Bridges lead to your friends: walk onto one and press Go. Esc takes you up to the sky.',art:'esc',
   start:()=>setTimeout(()=>closeSheet('balance-sheet'),1600)},
]);
$('guide-again').onclick=()=>{setPanel(false);overview();guide.start(true);};
// Watering. Done on your own island while you walk it leaves the tree glass for a moment (forest.js "thirsty"):
// the gardener walks over with her can, the tree on her right, and pours; it takes root as the water lands. Trees
// wait while a sheet covers the view, so you see her go once the planner is closed, and are watered nearest first.
// Any walking key, leaving the island or turning motion off takes the controls back: the rest take root at once.
const POUR=2.4, LANDS=.4, GIVE_UP=6, CROSS=3.5;   // seconds watering; when in it the tree starts to take root; longest walk; a far tree's walk
const thirst=[];let chore=null;
const home=()=>motion&&mode==='walk'&&!transition&&player.surface?.kind==='island'&&player.surface.id===ME;
const wantsWater=t=>t.island.id===ME&&!t.island.past&&home()&&(thirst.push(t),true);
function quench(){if(chore){forest.water(chore.t);chore.sfx?.stop?.();}chore=null;for(const t of thirst.splice(0))forest.water(t);}
function turnTo(yaw,dt){const turn=yaw-gardener.rotation.y;gardener.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-12*dt));}
// a step of at most `d` toward (ux,uz) on your own island, bending round a trunk in the way
function stepToward(ux,uz,d,dt){
  for(const a of [0,.5,-.5,1,-1,1.5,-1.5]){
    const c=Math.cos(a),s=Math.sin(a),vx=ux*c-uz*s,vz=ux*s+uz*c,n=Math.max(1,Math.ceil(d/.1));let moved=false;
    for(let k=0;k<n;k++){const f=surfaceAt(islands,bridges,player.position.x+vx*d/n,player.position.z+vz*d/n);
      if(f?.kind!=='island'||f.id!==ME||Math.abs(f.y-player.position.y)>=.65)break;player.position.set(f.x,f.y,f.z);player.surface=f;moved=true;}
    if(moved){player.distance+=d;player.moving=true;turnTo(Math.atan2(vx,vz),dt);return true;}
  }
  return false;
}
// where to stand: a step out from the trunk, on the side you come from if that is open ground
function standFor(b){
  const a0=Math.atan2(player.position.z-b.z,player.position.x-b.x), R=b.r+1.5;
  for(const da of [0,.4,-.4,.8,-.8,1.2,-1.2,1.6,-1.6,2.2,-2.2,Math.PI]){
    const x=b.x+Math.cos(a0+da)*R, z=b.z+Math.sin(a0+da)*R, f=surfaceAt(islands,bridges,x,z);
    if(f?.kind==='island'&&f.id===ME)return f;
  }
  return player.position.clone();
}
const spoutAt=new T.Vector3(), soil=new T.Vector3();
function tend(dt){
  if(!home()){quench();return;}
  if(!chore){
    if(document.querySelector('.sheet:not([hidden])'))return;   // wait until she can be seen
    const d=t=>{const b=forest.base(t);return Math.hypot(b.x-player.position.x,b.z-player.position.z);};
    thirst.sort((a,b)=>d(a)-d(b));const t=thirst.shift();
    if(t.anim!=='thirsty')return;   // undone, or let go, meanwhile
    chore={t,b:forest.base(t),time:0,stuck:0,pouring:false};chore.stand=standFor(chore.b);
    chore.pace=Math.min(WALK*RUN*1.5,Math.max(WALK,Math.hypot(chore.stand.x-player.position.x,chore.stand.z-player.position.z)/CROSS));   // far: she runs
  }
  const c=chore,b=c.b=forest.base(c.t);c.time+=dt;   // re-read: the island may still be gliding to a new altitude
  if(!c.pouring){
    if(c.t.anim!=='thirsty'){chore=null;return;}
    const dx=c.stand.x-player.position.x,dz=c.stand.z-player.position.z,d=Math.hypot(dx,dz);
    player.running=c.pace>WALK*1.2;
    if(d>.25&&c.time<GIVE_UP){if(!stepToward(dx/d,dz/d,Math.min(d,c.pace*dt),dt)&&(c.stuck+=dt)>.6)c.time=GIVE_UP;return;}
    c.pouring=true;c.time=0;   // there (or as close as she gets): water from here
  }
  const toTree=Math.atan2(b.x-player.position.x,b.z-player.position.z);
  turnTo(toTree+.75,dt);   // the can is in her right hand
  const k=c.time/POUR;
  if(k>.2&&k<.82){
    c.sfx??=sound.play('water_pour',{gain:.8})??true;   // once (true: there was no sound to play)
    gardener.userData.spout.getWorldPosition(spoutAt);
    // the ground a little beyond the rose, toward the tree: the stream stays in view instead of ending inside the trunk
    const ux=b.x-spoutAt.x,uz=b.z-spoutAt.z,u=Math.hypot(ux,uz)||1,x=spoutAt.x+ux/u*.6,z=spoutAt.z+uz/u*.6;
    soil.set(x,surfaceAt(islands,bridges,x,z)?.y??player.position.y,z);
    watering.pour(spoutAt,soil,dt);
  }
  if(k>=LANDS)forest.water(c.t);
  if(k>=1)chore=null;
}
function jump(){if(mode==='walk'&&!transition&&!player.hop&&!player.vy){player.vy=6.2;sound.play('jump',{gain:.55});}}
function walk(dt){
  player.moving=player.running=false;
  if(mode!=='walk'||transition){quench();return;}
  // A hop only lifts the gardener off the ground; the surface underfoot keeps tracking.
  if(player.vy||player.hop){player.vy-=18*dt;player.hop=Math.max(0,player.hop+player.vy*dt);if(!player.hop){player.vy=0;sound.play('land',{gain:.5});sound.step(player.surface?.under??'grass',{gain:1.3});}}
  gardener.position.y=player.hop;
  let ix=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  let iz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  if(stick.on&&Math.hypot(stick.x,stick.y)>.15){ix=stick.x;iz=stick.y;}   // the touch joystick, analog
  if(travel&&(ix||iz))travel=null;   // any walking key takes the controls back from Go
  if(chore||thirst.length){if(ix||iz||travel)quench();else{tend(dt);return;}}   // ...and from the watering
  if(travel){crossBridge(dt);return;}
  if(!ix&&!iz)return;
  // Camera-relative: W always walks away from the camera, wherever it has been dragged.
  const f=facing.subVectors(controls.target,camera.position).setY(0).normalize();
  const dx=-f.z*ix-f.x*iz, dz=f.x*ix-f.z*iz;
  player.running=keys.has('ShiftLeft')||keys.has('ShiftRight')||(stick.on&&Math.hypot(stick.x,stick.y)>.9);
  const len=Math.hypot(dx,dz),speed=WALK*(player.surface?.kind==='bridge'?BRIDGE_PACE:1)*(player.running?RUN:1),step=speed*dt/len;
  let moved=false; // Small substeps and axis sliding keep the gardener inside the shore.
  const substeps=Math.max(1,Math.ceil(speed*dt/.1));
  for(let n=0;n<substeps;n++){
    for(const [sx,sz] of [[dx*step/substeps,dz*step/substeps],[dx*step/substeps,0],[0,dz*step/substeps]]){
      if(sx===0&&sz===0)continue;
      const s=surfaceAt(islands,bridges,player.position.x+sx,player.position.z+sz);
      if(s&&Math.abs(s.y-player.position.y)<.65){player.position.set(s.x,s.y,s.z);player.surface=s;moved=true;break;}
    }
  }
  if(moved)player.stuck=0;else if((player.stuck+=dt)>.5){player.stuck=0;unstick();}
  if(moved){player.distance+=speed*dt;turnTo(Math.atan2(dx,dz),dt);player.moving=true;
    if(player.surface.kind==='island'&&player.surface.id!==selected){selected=player.surface.id;arrive(islands.find(i=>i.id===selected));syncPanel();}
  }
}

// module scope: frame() is top-level and reads this too
const LITE=new URLSearchParams(location.search).has('lite');
// Smoothness governor, for everyday laptops and phones. It watches real frame times; slower than ~36 fps for a
// second and a half, it gives something up, the least missed first: the glow (bloom), then the shadow map's detail,
// and only then pixels, a step at a time and never below 0.8x. Keeping pace with the screen's own refresh for a
// while takes the last thing back, after a wait that grows each time, so nothing flickers. Shader warm-up at the
// start is ignored. Smaller devices (TIER mid) start with the lighter shadow map.
// ?pr=1 pins the pixel ratio and turns the governor off, so frame times compare like with like (tools/perf.mjs)
const PIN=parseFloat(new URLSearchParams(location.search).get('pr'));
const MEM=navigator.deviceMemory??8, CORES=navigator.hardwareConcurrency??8;
const TIER=LITE?'low':innerWidth<820||MEM<=4||CORES<=4?'mid':'high';
const PR_MAX=PIN>0?PIN:LITE?1:Math.min(devicePixelRatio,1.5), PR_MIN=PIN>0?PIN:Math.min(PR_MAX,.8), PR_STEP=.15;
const SHADOW=LITE?512:TIER==='mid'?1024:2048;
const TOP=2+Math.ceil((PR_MAX-PR_MIN)/PR_STEP-1e-6);   // the last rung: no glow, light shadows, fewest pixels
let pixelRatio=PR_MAX,rung=0,bloomPass=null,win=[],warm=0,refresh=1e3/60,calm=0,holdUntil=0,hold=20000;
function setRung(r){
  rung=r;
  if(bloomPass)bloomPass.enabled=rung<1;
  const size=rung>=2?Math.max(512,SHADOW/2):SHADOW;
  if(sunLight&&sunLight.shadow.mapSize.x!==size){sunLight.shadow.mapSize.set(size,size);sunLight.shadow.map?.dispose();sunLight.shadow.map=null;}
  const pr=rung<=2?PR_MAX:Math.max(PR_MIN,+(PR_MAX-PR_STEP*(rung-2)).toFixed(2));
  if(pr!==pixelRatio){pixelRatio=pr;renderer.setPixelRatio(pixelRatio);composer.setPixelRatio(pixelRatio);}
}
function govern(ms,now){
  if(LITE||PIN>0||!(ms>0)||ms>250)return;              // a tab switch or a hitch, not a trend
  if(warm<120){warm++;return;}
  win.push(ms);if(win.reduce((a,b)=>a+b,0)<1500)return;
  const sorted=[...win].sort((a,b)=>a-b),avg=sorted.reduce((a,b)=>a+b,0)/sorted.length;win=[];
  refresh=Math.min(refresh,sorted[Math.floor(sorted.length*.25)]);   // the display's own frame period, learnt
  if(avg>28&&rung<TOP){setRung(rung+1);calm=0;holdUntil=now+hold;hold=Math.min(hold*2,160000);}
  else if(avg<refresh*1.12&&rung>0&&now>holdUntil&&++calm>=3){setRung(rung-1);calm=0;}
}
// ?skiplogin -> straight into the demo world (embedding, tests).
// ?enter -> arriving from the welcome page (welcome/index.html), which has
// already signed you in (the session is saved) or chosen the demo (?enter=demo):
// your sky opens without the sign-in screen. Anything else -- no session, no
// sky yet, a network hiccup -- falls back to the sign-in screen.
// Otherwise the world loads behind the sign-in, and its islands are built once
// we know whose sky it is: the demo's five, or a signed-in student's (world.js).
let world;
const worldReady=new Promise(resolve=>{
  const QS=new URLSearchParams(location.search);
  const hello=w=>{
    resolve(w);canvas.focus({preventScroll:true});
    notice(w.live?`Welcome back, ${w.people.find(p=>p.id===ME)?.name||'friend'}. Your island kept growing while you were away.`
                 :'Welcome to the demo sky. This is Aisha’s island, and her four friends.');
  };
  if(QS.has('skiplogin')){$('login').hidden=true;resolve(demoWorld());return;}
  if(QS.has('enter')){
    $('login').hidden=true;
    if(QS.get('enter')==='demo'||!backend.configured){hello(demoWorld());return;}
    (async()=>{
      const user=await backend.currentUser(), sky=user&&await backend.mySky(user.id);
      if(!sky)throw new Error('no sky yet');
      hello(enterWorld(await backend.loadWorld(user,sky)));
    })().catch(e=>{console.warn('Arrival without a sky:',e.message);$('login').hidden=false;createLogin(hello);});
    return;
  }
  createLogin(hello);
});

async function init(){
  // ?lite  -> low-stress dev mode: halves resolution, drops bloom + shadows,
  // caps to 30fps. Purely additive; default behaviour is unchanged.
renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);renderer.info.autoReset=false;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=!LITE;renderer.shadowMap.type=T.PCFShadowMap;
  // Hybrid-graphics laptop: report which adapter WebGL actually picked.
  // The internal panel is wired to the Radeon iGPU, so Task Manager shows it
  // busy even when the RTX 4070 is doing all the rendering.
  const gpu=(()=>{try{const gl=renderer.getContext();const x=gl.getExtension('WEBGL_debug_renderer_info');
    return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(e){return 'unknown';}})();
  console.info('[Island Life] rendering on:',gpu);
  scene=new T.Scene();camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,2000);camera.position.copy(overviewPosition());
  controls=new OrbitControls(camera,canvas);controls.target.set(0,2,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=14;controls.maxDistance=camera.position.distanceTo(controls.target)*1.25;controls.minPolarAngle=.3;controls.maxPolarAngle=1.33;controls.update();
  scene.add(hemiLight=new T.HemisphereLight('#fff2d4','#8d92aa',1.15));
  const sun=sunLight=new T.DirectionalLight('#ffdeb2',2.0);scene.add(sun.target);sun.position.set(-45,65,25);sun.castShadow=true;sun.shadow.mapSize.set(SHADOW,SHADOW);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=180;sun.shadow.normalBias=.09;sun.shadow.bias=-.00015;scene.add(sun);
  const fill=fillLight=new T.DirectionalLight('#bcd9e5',.9);fill.position.set(20,20,-30);scene.add(fill);
  atmosphere=createAtmosphere(scene);atmosphere.setTone('dusk');
  composer=new EffectComposer(renderer,new T.WebGLRenderTarget(innerWidth*pixelRatio,innerHeight*pixelRatio,{type:T.HalfFloatType,samples:!LITE&&PR_MAX<=1.25?4:0}));composer.setSize(innerWidth,innerHeight);/* a supplied target is otherwise read as CSS size */composer.addPass(new RenderPass(scene,camera));if(!LITE){bloomPass=new UnrealBloomPass(new T.Vector2(innerWidth/2,innerHeight/2),.22,.6,1.25);composer.addPass(bloomPass);}composer.addPass(new OutputPass());
  const KEYS=['community','meadow_a','meadow_b','meadow_c','purple','oak','sakura','palm','mushrooms','clover',
              'willow','pale','magic_mushrooms'];
  $('load-progress').max=KEYS.length;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),assets={};let loaded=0;
  const lows={};   // far-off copies of the trees (see treeDetail); a missing one just means that species stays detailed
  await Promise.all([...KEYS.map(async key=>{assets[key]=(await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${key}.glb`)).scene;setMaterials(assets[key]);$('load-progress').value=++loaded;$('loading-text').textContent=`Gathering the gardens · ${loaded} of ${KEYS.length}`; }),
                     ...LOW_KEYS.map(key=>loader.loadAsync(`${import.meta.env.BASE_URL}assets/far/${key}.glb`).then(g=>{lows[key]=g.scene;},()=>{}))]);
  for(const key of LOW_KEYS){
    if(!lows[key])continue;
    const hi=[],lo=[];assets[key].traverse(o=>{if(o.isMesh)hi.push(o);});lows[key].traverse(o=>{if(o.isMesh)lo.push(o);});
    if(hi.length===lo.length&&hi.every((m,i)=>m.name===lo[i].name))hi.forEach((m,i)=>{lowOf.set(m.geometry,lo[i].geometry);highOf.set(lo[i].geometry,m.geometry);});
  }
  // the torii moves out to the shore and its steps go (gate.js), before anything reads the ground
  for(const key of ['meadow_a','meadow_b','meadow_c'])moveGate(assets[key]);
  // walkable = terrain PLUS the raised surfaces people stand on
  const WALKABLE={community:['Island','Plaza','Jetty','LilySteps','Deck'],meadow:['Island','ToriiSteps']};
  // underfoot, for the footsteps: the stepping stones cross the pond, so they splash
  const UNDER={Plaza:'stone',ToriiSteps:'stone',Jetty:'wood',Deck:'wood',LilySteps:'water'};
  const fields={};
  for(const key of ['community','meadow_a','meadow_b','meadow_c'])
    {const names=WALKABLE[key==='community'?'community':'meadow'];fields[key]=new HeightField(names.map(n=>assets[key].getObjectByName(n)),.35,names.map(n=>UNDER[n]));}
  fields.community.block([assets.community.getObjectByName('TreeWood')]);   // the buttress roots are solid
  // whose sky: the islands are built only once that is known
  world=await worldReady;
  definitions=defineIslands(world.people);
  camera.position.copy(overviewPosition());controls.maxDistance=skyReach();controls.update();
  for(const def of definitions){const island={...def,weather:'clear',field:fields[def.model],obstacles:[...(def.obstacles??[])]};
    const group=new T.Group();group.position.set(def.x,def.altitude,def.z);scene.add(group);island.group=group;
    const model=assets[def.model].clone(true);model.scale.setScalar(def.scale);group.add(model);island.model=model;model.traverse(o=>{o.userData.islandId=def.id;});
    plantIsland(island,group,assets);
    if(def.owner){island.pier=buildPier(island);group.add(island.pier.group);}
    // activity trees and today's ghosts
    forest??=createForest({assets,islandSurface,speciesScale:SPECIES_SCALE,thirsty:wantsWater,
      onRoot:t=>{if(ready&&t.island.id===ME)sound.play('task_done',{gain:.55,cooldown:.6});}});   // one chime for "Mark all
    if(def.owner)forest.plant(island);
    island.weatherFx=createWeather(atmosphere.texture);island.weatherFx.group.position.copy(group.position);scene.add(island.weatherFx.group);
    island.sink=createSinkBank();island.sink.group.position.copy(group.position);island.sink.set(def.altitude);scene.add(island.sink.group);
    const label=document.createElement('button');label.className='island-label';label.textContent=def.name;label.title=`Visit ${def.name}`;label.dataset.island=def.id;label.addEventListener('click',()=>visit(def.id));$('island-labels').append(label);island.label=label;
    islands.push(island);
  }
  for(const island of islands.slice(1))buildBridge(island);
  watering=createWatering(scene);
  const playerRoot=new T.Group();scene.add(playerRoot);gardener=makeBlomy();playerRoot.add(gardener);player.root=playerRoot;
  const shadow=new T.Mesh(new T.CircleGeometry(.43,24),new T.MeshBasicMaterial({color:'#35492f',transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;playerRoot.add(shadow);
  spawnOn(islands[0]);
  life=initLife({world,islands,camera,texture:atmosphere.texture,player,notice,visit,forest,guiding:()=>guide.on,getMode:()=>mode,getSelected:()=>selected,
    setAltitude:(id,h)=>{updateAltitude(islands.find(i=>i.id===id),T.MathUtils.clamp(h,LOW,HIGH));syncPanel();},
    setGlow:(id,g)=>{const b=bridges.find(b=>b.id===id);if(!b)return;b.glow=T.MathUtils.clamp(g,.15,3);b.glowMaterial.emissiveIntensity=b.glow*2.2;b.deckMaterial.emissiveIntensity=b.glow*.16;syncPanel();}});
  ready=true;sound.preload();peekHelp();
  // first time here (not in tests, unless ?guide): Blomy shows you round, once the welcome has been said
  {const q=new URLSearchParams(location.search);if(!q.has('skiplogin')||q.has('guide'))setTimeout(()=>guide.start(q.has('guide')),2600);}
  // pieces too small to throw a visible shadow (beads, buttons, little props) stop casting one: each was a draw in the shadow pass
  {const ws=new T.Vector3();scene.traverse(o=>{if(!o.isMesh||!o.castShadow)return;const g=o.geometry;if(!g.boundingSphere)g.computeBoundingSphere();o.getWorldScale(ws);if(g.boundingSphere.radius*Math.max(ws.x,ws.y,ws.z)<.3)o.castShadow=false;});}
  const want=new URLSearchParams(location.search).get('island');
  if(want&&islands.some(i=>i.id===want))setTimeout(()=>visit(want),0);
$('loading').hidden=true;$('motion').checked=motion;syncPanel();
  renderer.setAnimationLoop(frame);
  // A small inspection API also exposes meaningful world state for embedding.
  window.islandLife={visit,overview,setAltitude:(id,h)=>{if(!Number.isFinite(h))return;updateAltitude(islands.find(i=>i.id===id),T.MathUtils.clamp(h,LOW,HIGH));syncPanel();},setWeather:(id,s)=>{const i=islands.find(i=>i.id===id),v=typeof s==='number'?s:{clear:.05,cloudy:.45,mist:.45,rain:.85}[s];if(!i||v==null)return;setStrain(i,v);syncPanel();},getState:()=>({ready,mode,selected,gpu,perf:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio,rung,tier:TIER},player:{x:player.position.x,y:player.position.y,z:player.position.z,surface:player.surface},watering:chore&&{pouring:chore.pouring,time:chore.time},thirsty:thirst.length,islands:islands.map(({id,altitude,altTarget,weather,strain})=>({id,altitude:altTarget??altitude,weather,strain})),bridges:bridges.map(({id,start,end,width,arch,glow})=>({id,start,end,width,arch,glow})),render:renderer.info.render}),surfaceAt:(x,z)=>surfaceAt(islands,bridges,x,z),life:life.api};
}

// Shadows follow you. From the sky the shadow box spans the middle of the neighbourhood; on foot it covers the
// ground ahead of you (the outer islands used to sit outside it, with no shadows at all), far-off casters drop out
// of the shadow pass, and the shadows come out twice as sharp. The box moves in whole shadow-map texels, so
// shadow edges stay still as you walk instead of shimmering.
const SUN_DIR=new T.Vector3(-45,65,25).normalize(), SKY_BOX=65, WALK_BOX=32, AHEAD=14;
const L_R=new T.Vector3().crossVectors(new T.Vector3(0,1,0),SUN_DIR).normalize(), L_U=new T.Vector3().crossVectors(SUN_DIR,L_R).normalize();
let shadowMode=null;
function followSun(){
  const c=sunLight.shadow.camera, walking=mode==='walk'&&!transition;
  if(walking){
    const texel=2*WALK_BOX/sunLight.shadow.mapSize.x, p=sunLight.target.position.subVectors(player.position,camera.position).setY(0);
    p.multiplyScalar(AHEAD/Math.max(1e-3,p.length())).add(player.position);   // centred a little ahead, where the camera looks
    const a=p.dot(L_R),b=p.dot(L_U);p.addScaledVector(L_R,Math.round(a/texel)*texel-a).addScaledVector(L_U,Math.round(b/texel)*texel-b);
    sunLight.position.copy(p).addScaledVector(SUN_DIR,90);
    if(shadowMode!=='walk'){shadowMode='walk';c.left=c.bottom=-WALK_BOX;c.right=c.top=WALK_BOX;c.updateProjectionMatrix();}
  }else if(shadowMode!=='sky'){shadowMode='sky';sunLight.target.position.set(0,0,0);sunLight.position.set(-45,65,25);c.left=c.bottom=-SKY_BOX;c.right=c.top=SKY_BOX;c.updateProjectionMatrix();}
}
// Far trees. A tree on another island is a few dozen pixels tall, yet each carried ~20k triangles. Every
// species has a copy simplified to about a fifth (public/assets/far, gltfpack -si -sa from the source model),
// and a tree wears it whenever it stands smaller than ~70 px on screen -- from the sky, and across the
// bridges when you are walking. Only the geometry is swapped: materials, shadows, ghosts and clicks are the same.
const LOW_KEYS=['purple','oak','sakura','palm','mushrooms','clover','willow','pale','magic_mushrooms'], lowOf=new Map(), highOf=new Map();
let detailed=null, rescanIn=0, warmFrames=2;
const hiOf=new WeakMap();   // mesh -> its full-detail geometry
const sizeAt=new T.Vector3();
function treeDetail(){
  // the first frames draw every tree in full, so the detailed models are on the GPU before any swap back to them
  if(!lowOf.size||warmFrames-->0)return;
  if(!detailed||--rescanIn<=0){   // trees planted since are picked up within a couple of seconds
    detailed=[];rescanIn=120;
    scene.traverse(o=>{if(!o.isMesh)return;const hi=hiOf.get(o)??highOf.get(o.geometry)??o.geometry;if(!lowOf.has(hi))return;
      hiOf.set(o,hi);if(!hi.boundingSphere)hi.computeBoundingSphere();detailed.push(o);});
  }
  const px=innerHeight/(2*Math.tan(camera.fov*Math.PI/360));   // screen pixels per unit at distance 1
  for(const o of detailed){
    const hi=hiOf.get(o), e=o.matrixWorld.elements, scale=Math.hypot(e[0],e[1],e[2]);
    const size=2*hi.boundingSphere.radius*scale*px/Math.max(.1,sizeAt.copy(hi.boundingSphere.center).applyMatrix4(o.matrixWorld).distanceTo(camera.position));
    const g=size<(o.geometry===hi?70:85)?lowOf.get(hi):hi;   // a little hysteresis, so nothing flickers at the edge
    if(o.geometry!==g)o.geometry=g;
  }
}
// The light follows the sky tone, and the weather of the island you are standing on: the greyer its sky,
// the more the warm sun and the coloured shade give way to a cool, flat grey. From the sky view it is the
// tone's own clear light; each island's clouds and rain still show there on their own.
const GREY={sky:new T.Color('#b9bccb'),ground:new T.Color('#8d8f9c'),sun:new T.Color('#e6e3e0'),fill:new T.Color('#c3cad6')},lightTmp=new T.Color();
let overcast=0,shadeKey='';
function shadeLight(dt){
  const here=mode==='walk'&&islands.find(i=>i.id===selected), want=here?Math.min(1,Math.max(0,((here.strain??0)-.3)/.6))*.6:0;
  overcast+=(want-overcast)*Math.min(1,dt*1.5);
  const L=atmosphere.light,key=`${overcast.toFixed(3)}|${L.sun}|${L.sky}`;if(key===shadeKey)return;shadeKey=key;
  hemiLight.color.copy(lightTmp.set(L.sky)).lerp(GREY.sky,overcast);hemiLight.groundColor.copy(lightTmp.set(L.ground)).lerp(GREY.ground,overcast);hemiLight.intensity=L.hemi;
  sunLight.color.copy(lightTmp.set(L.sun)).lerp(GREY.sun,overcast);sunLight.intensity=L.sunI*(1-overcast*.4);
  fillLight.color.copy(lightTmp.set(L.fill)).lerp(GREY.fill,overcast);fillLight.intensity=L.fillI;
}
// A pier's moss, flowers and vines are a few pixels from the sky view: drawn only within ~70 m of the camera.
const pierAt=new T.Vector3();
function pierDetail(){for(const i of islands)if(i.pier)i.pier.detail.visible=pierAt.copy(i.pier.tip).add(i.group.position).distanceTo(camera.position)<70;}
const labelAt=new T.Vector3();
// Island labels never vanish in the sky view: an island off screen, or behind you, keeps its label at the edge of
// the screen with an arrow pointing toward it, so you always know where everyone is. Edge labels stay inside a safe
// frame -- above the bottom bar, and on the left above the place title and the island card -- and are spread
// apart so none covers another. Clicking still visits.
const EDGE_X=.9, EDGE_TOP=.78, EDGE_BOTTOM=-.55, LEFT_ZONE=-.3, LEFT_FLOOR=.18, GAP=36;
function placeLabels(){
  const edges=[];
  for(const island of islands){
    const el=island.label;
    if(mode==='walk'){if(!el.hidden)el.hidden=true;continue;}
    const p=labelAt.set(island.x,island.altitude+.7,island.z+8*island.scale).project(camera);
    let x=p.x,y=p.y;const behind=p.z>1;if(behind){x=-x;y=-y;}   // behind the camera the projection flips
    const k=Math.max(Math.abs(x)/EDGE_X,y>0?y/EDGE_TOP:y/EDGE_BOTTOM);
    const edge=behind||k>1;
    if(edge){x/=Math.max(k,1e-6);y/=Math.max(k,1e-6);if(x<LEFT_ZONE&&y<LEFT_FLOOR)y=LEFT_FLOOR;}
    el.hidden=false;el.classList.toggle('edge',edge);
    if(edge){el.style.setProperty('--toward',`${Math.atan2(-p.y*(behind?-1:1),p.x*(behind?-1:1))}rad`);edges.push({el,px:(x*.5+.5)*innerWidth,py:(-y*.5+.5)*innerHeight});}
    else{el.style.left=`${(x*.5+.5)*innerWidth}px`;el.style.top=`${(-y*.5+.5)*innerHeight}px`;}
  }
  // whole label on screen; then spread labels that share a side, each at least GAP px below the one above it, and
  // if that runs a column past its floor (the bottom bar, or the title on the left), lift the column back up
  for(const e of edges){const w=e.el.offsetWidth/2+8;e.px=Math.min(innerWidth-w,Math.max(w,e.px));}
  edges.sort((a,b)=>a.py-b.py);
  for(let i=1;i<edges.length;i++)for(let j=0;j<i;j++){const a=edges[j],b=edges[i];if(Math.abs(a.px-b.px)<160&&b.py-a.py<GAP)b.py=a.py+GAP;}
  const floorAt=px=>(-(px<(LEFT_ZONE*.5+.5)*innerWidth?LEFT_FLOOR:EDGE_BOTTOM)*.5+.5)*innerHeight;
  for(let i=edges.length-1;i>=0;i--){const e=edges[i],over=e.py-floorAt(e.px);if(over<=0)continue;
    for(const f of edges)if(Math.abs(f.px-e.px)<160&&f.py<=e.py)f.py-=over;}
  for(const e of edges){e.py=Math.max(e.px<(LEFT_ZONE*.5+.5)*innerWidth?120:64,e.py);   // clear of the logo
    e.el.style.left=`${e.px}px`;e.el.style.top=`${e.py}px`;}
}
let _last=0;
function frame(time){
  if(LITE){ if(time-_last<33) return; _last=time; }   // cap ~30fps

  govern(time-last,time);const dt=Math.min((time-last)/1000,.04);last=time;if(document.hidden)return;if(motion)elapsed+=dt;
  turnCamera(dt);walk(dt);pose(dt);footsteps();bridgeBanner();showStick();guide.update(dt);player.root.position.copy(player.position);atmosphere.update(elapsed,camera);glideAltitudes(dt);atmosphere.setHoles(islands);for(const i of islands){i.weatherFx.update(elapsed,camera);i.sink.update(elapsed,camera);}
  if(transition){transition.time+=dt;const a=motion?Math.min(transition.time/1.2,1):1,e=1-Math.pow(1-a,4);look.copy(mode==='walk'?player.position:new T.Vector3(0,2,0));if(mode==='walk')look.y+=1;targetPosition.copy(mode==='walk'?player.position.clone().add(cameraOffset):overviewPosition());camera.position.lerpVectors(transition.from,targetPosition,e);controls.target.lerpVectors(transition.targetFrom,look,e);camera.lookAt(controls.target);if(a===1)transition=null;}
  // walk: orbit controls around the gardener -- drag to turn, scroll to zoom -- carried along as they move
  // (no collision pull-in: the camera stays exactly where the user put it)
  else if(mode==='walk'){look.copy(player.position);look.y+=1;camera.position.add(look).sub(controls.target);controls.target.copy(look);controls.autoRotate=false;controls.update(dt);}
  else {controls.autoRotate=motion;controls.autoRotateSpeed=.1;controls.update(dt);}
  life.update(dt,elapsed,motion);
  {const i=islands.find(i=>i.id===selected);rain.set(Math.min(1,Math.max(0,((i?.strain??0)-.55)/.4))*(mode==='walk'?1:.4));}   // atmosphere.js: rain from .55
  forest.update(dt,elapsed,motion,id=>life.api.getSchedule(id));watering.update(dt);
  followSun();treeDetail();shadeLight(dt);pierDetail();
  placeLabels();
  renderer.info.reset();composer.render();   // counted over every pass of the frame (autoReset is off)
}

let down=null;
canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
canvas.addEventListener('pointerup',e=>{if(!ready||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;down=null;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);if(life.pick(raycaster))return;if(mode!=='overview')return;const hit=raycaster.intersectObjects(islands.map(i=>i.group),true).find(h=>h.object.userData.islandId);if(hit)visit(hit.object.userData.islandId);});
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Escape'){overview();return;}if(e.code==='Space'&&mode==='walk'){e.preventDefault();jump();return;}if(/^(Key[WASDQERFZX]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code)){if(mode==='walk'||/^Key[QERFZX]$/.test(e.code))e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();helpKeys(null);});
// the key card at the bottom right (index.html .help) presses down with your keys
const HELP_KEYS={KeyW:'w',ArrowUp:'w',KeyA:'a',ArrowLeft:'a',KeyS:'s',ArrowDown:'s',KeyD:'d',ArrowRight:'d',ShiftLeft:'shift',ShiftRight:'shift',Space:'space',KeyQ:'q',KeyE:'e',KeyR:'r',KeyF:'f',KeyZ:'z',KeyX:'x',Escape:'esc'};
function helpKeys(e,down){if(!e){document.querySelectorAll('.help kbd.down').forEach(k=>k.classList.remove('down'));return;}const k=HELP_KEYS[e.code];if(k)document.querySelector(`.help [data-k="${k}"]`)?.classList.toggle('down',down);}
window.addEventListener('keydown',e=>helpKeys(e,true));
// the key card peeks out for a second once the world is ready, then tucks behind the right edge; a click on its tab (or on it) toggles it
let helpTimer=0;
function setHelp(open){$('help').classList.toggle('tucked',!open);$('help-toggle').setAttribute('aria-expanded',String(open));$('help-toggle').setAttribute('aria-label',open?'Hide controls':'Show controls');}
function peekHelp(){setHelp(true);helpTimer=setTimeout(()=>setHelp(false),1450);}   // .45s to slide out, then 1s in view
$('help').onclick=()=>{clearTimeout(helpTimer);setHelp($('help').classList.contains('tucked'));};
window.addEventListener('keyup',e=>helpKeys(e,false));document.addEventListener('visibilitychange',()=>keys.clear());
$('overview').onclick=overview;$('walk').onclick=()=>visit(selected);
function setPanel(open){$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));if(open)$('sky-tone').focus();else $('settings-toggle').focus();}
$('settings-toggle').onclick=()=>setPanel($('settings').hidden);$('settings-close').onclick=()=>setPanel(false);
$('sky-tone').onchange=e=>{atmosphere?.setTone(e.target.value);};
$('motion').onchange=e=>{motion=e.target.checked;};
// Sound: the speaker in the header mutes, the slider in the settings sets the volume (both remembered).
const rain=sound.ambient('rain_loop',{gain:.6});
sound.listenForClicks();
function syncSound(){$('sound-toggle').setAttribute('aria-pressed',String(sound.muted()));$('sound-toggle').title=sound.muted()?'Sound off':'Sound on';$('volume').value=sound.volume();}
$('sound-toggle').onclick=()=>{sound.setMuted(!sound.muted());syncSound();};
$('volume').oninput=e=>{sound.setVolume(+e.target.value);if(sound.muted())sound.setMuted(false);syncSound();};
syncSound();
$('altitude').oninput=e=>{if(!ready)return;updateAltitude(islands.find(i=>i.id===ME),+e.target.value);syncPanel();};
$('weather').oninput=e=>{if(!ready)return;setStrain(islands.find(i=>i.id===ME),+e.target.value);syncPanel();};
// The demo's scenarios: altitude and weather together, as the real reading would set them, said in one line.
const SCENARIOS={
  exam:{altitude:-38,strain:.55,say:'Exam week: about twice your normal hours. Your island sinks toward the clouds, and cloud gathers.'},
  light:{altitude:38,strain:.05,say:'A light week: about half your usual load. Your island floats high under a clear sky.'},
  rough:{altitude:-8,strain:.92,say:'A rough few days: tired and stressed check-ins bring cloud, then rain. The load itself is only a little above usual.'}};
for(const b of document.querySelectorAll('[data-scenario]'))b.onclick=()=>{
  if(!ready)return;const s=SCENARIOS[b.dataset.scenario],me=islands.find(i=>i.id===ME);
  updateAltitude(me,s.altitude);setStrain(me,s.strain);syncPanel();notice(s.say);
};
$('reset').onclick=()=>{if(!ready)return;for(const d of definitions){const i=islands.find(i=>i.id===d.id);updateAltitude(i,d.altitude);setStrain(i,i.derivedStrain??0);}for(const b of bridges){b.glow=1.2;b.glowMaterial.emissiveIntensity=2.64;b.deckMaterial.emissiveIntensity=.192;}life.api.resettle();$('sky-tone').value='dusk';$('sky-tone').dispatchEvent(new Event('change'));syncPanel();notice('Back to a quiet peach twilight.');};
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').hidden=false;$('loading-text').textContent='The world could not load. Check the local server and reload to try again.';$('load-progress').hidden=true;const button=document.createElement('button');button.textContent='Try again';button.onclick=()=>location.reload();$('loading').append(button);});
