import './style.css';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HeightField, bridgePoint, surfaceAt, islandSurface } from './navigation.js';
import { createAtmosphere, createWeather, createSinkBank } from './atmosphere.js';
import { initLife, setStrain } from './life.js';
import { ME } from './data.js';
import { createForest } from './forest.js';
import { createLogin } from './login.js';

const $=id=>document.getElementById(id), canvas=$('world');
// One activity category = one tree species (groves.js). The gathering
// island's mushrooms and clover are decoration only.
const SPECIES_SCALE={sakura:1.05,purple:1.2,oak:.85,palm:1.0,mushrooms:.5,clover:.32,
                     willow:.95,pale:.9,magic_mushrooms:1.25};

// NOTE: owner names are placeholders -- swap them for your real members.
// Torii pillars, in member-island model units (same for every variant).
const TORII_POSTS=[{x:-6.44,z:-3.85,r:.42},{x:-4.36,z:-6.15,r:.42}];
// Everyone arrives just inside their own torii (PRODUCT.md: the arch is the
// spawn point), the camera out beyond the gate looking in across the island.
const ARCH_SPAWN=[-4.1,-3.8], ARCH_CAM=[-11.9,10,-10.7];

// Bridges leave the gathering tree at 150, 10 and 300 degrees; the pond sits
// in the middle against the tree's plaza, ringed by a path. Each member island is its own
// irregular outline (meadow_a/b/c), and plantings sit away from its bridge
// landing, its torii, and the camera side (+z) of the spawn -- the walk-in
// camera sits behind the gardener at +z, so a grove there fills the view.
const definitions=[
  {id:'community',model:'community',name:'The gathering Island',owner:null,
   description:'Everyone’s island. The bridges start here.',
   x:0,z:0,altitude:0,scale:2.2,spawn:[2,.5],
   // the trunk; its buttress roots are fenced off by field.block() in init()
   obstacles:[{x:6.2,z:-5.6,r:2.7}],
   plantings:[{asset:'mushrooms',n:4,a:2.36,r:16,spread:3},
              {asset:'clover',n:4,a:4.10,r:15,spread:3.5}]},

  {id:'sakura',model:'meadow_a',owner:'Aisha',description:'A study-heavy week, softened by friends.',
   x:-73.6,z:-42.5,altitude:5,scale:2.0,spawn:ARCH_SPAWN,cam:ARCH_CAM,obstacles:TORII_POSTS},

  {id:'purple',model:'meadow_b',owner:'Ben',description:'Café shifts, lab work and band practice.',
   x:83.7,z:-14.8,altitude:7,scale:2.0,spawn:ARCH_SPAWN,cam:ARCH_CAM,obstacles:TORII_POSTS},

  {id:'oak',model:'meadow_c',owner:'Chen',description:'Long internship days and exam prep.',
   x:42.5,z:73.6,altitude:-4,scale:2.0,spawn:ARCH_SPAWN,cam:ARCH_CAM,obstacles:TORII_POSTS},
];
for(const d of definitions){
  d.name=d.id===ME?'My island':d.owner?`${d.owner}’s island`:d.name;
}

// Decorative groves on the gathering island: `n` of one species in a tight
// cluster. Member islands grow their activity trees in forest.js.
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
let renderer,scene,camera,controls,composer,atmosphere,gardener,life,forest;
const islands=[],bridges=[],keys=new Set();
let selected='community',mode='overview',ready=false,motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0,transition=null,noticeTimer;
const player={position:new T.Vector3(),surface:null,distance:0,hop:0,vy:0,stuck:0};
const look=new T.Vector3(),targetPosition=new T.Vector3(),cameraOffset=new T.Vector3(0,11,17);
const raycaster=new T.Raycaster(),pointer=new T.Vector2();
const bridgeMaterial=new T.MeshStandardMaterial({color:'#efd2a2',emissive:'#ffbd62',emissiveIntensity:.3,roughness:.8});

function notice(message){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),3000);}
function makeMesh(geometry,material,parent,position){const m=new T.Mesh(geometry,material);if(position)m.position.copy(position);parent.add(m);return m;}
function setMaterials(root){root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.material.side=T.DoubleSide;
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
  const sh=central.field.height(sx,sz)??.35,eh=island.field.height((ex-island.x)/island.scale,(ez-island.z)/island.scale)??.35;
  bridge.start=new T.Vector3(sx,central.altitude+Math.max(sh,.2)+.06,sz);
  bridge.end=new T.Vector3(ex,island.altitude+eh*island.scale+.06,ez);
  bridge.group=new T.Group();scene.add(bridge.group);
  const side=new T.Vector3(-uz,0,ux),points=[];
  for(let n=0;n<=64;n++){let p=bridgePoint(bridge,n/64);points.push(new T.Vector3(p.x,p.y,p.z));}
  const deckMaterial=bridgeMaterial.clone();deckMaterial.emissiveIntensity=bridge.glow*.16;bridge.deckMaterial=deckMaterial;
  const planks=new T.InstancedMesh(new T.BoxGeometry(bridge.width,.11,.36),deckMaterial,Math.ceil(length*2.4));
  const usable=bridge.start.distanceTo(bridge.end),count=Math.ceil(usable/.39);planks.count=count;const dummy=new T.Object3D();
  for(let n=0;n<count;n++){const t=n/(count-1),p=bridgePoint(bridge,t);dummy.position.set(p.x,p.y-.03,p.z);dummy.rotation.set(0,Math.atan2(ux,uz),0);dummy.rotation.x=-Math.atan((bridge.end.y-bridge.start.y+4*bridge.arch*(1-2*t))/Math.hypot(ex-sx,ez-sz));dummy.updateMatrix();planks.setMatrixAt(n,dummy.matrix);}planks.castShadow=true;planks.receiveShadow=true;bridge.group.add(planks);
  const glow=new T.MeshStandardMaterial({color:'#ffe5ac',emissive:'#ffc36c',emissiveIntensity:bridge.glow*2.2,roughness:.45});bridge.glowMaterial=glow;
  for(const sign of [-1,1]){
    for(const height of [.12,1.05]){const railPoints=points.map(p=>p.clone().addScaledVector(side,sign*bridge.width*.48).add(new T.Vector3(0,height,0)));makeMesh(new T.TubeGeometry(new T.CatmullRomCurve3(railPoints),64,.026,5,false),glow,bridge.group);}
    for(let n=0;n<=12;n++){const p=bridgePoint(bridge,n/12),post=new T.Mesh(new T.CylinderGeometry(.035,.035,1.05,5),glow);post.position.set(p.x+side.x*sign*bridge.width*.48,p.y+.54,p.z+side.z*sign*bridge.width*.48);bridge.group.add(post);}
  }
}

function updateAltitude(island,altitude){
  const old=island.altitude;island.altitude=altitude;island.group.position.y=altitude;island.weatherFx.group.position.y=altitude;
  island.sink.group.position.y=altitude;island.sink.set(altitude);
  if(island.id==='community')for(const i of islands.slice(1))buildBridge(i);else buildBridge(island);
  if(player.surface?.kind==='island'&&player.surface.id===island.id)player.position.y+=altitude-old;
  const surface=surfaceAt(islands,bridges,player.position.x,player.position.z);if(surface){player.position.y=surface.y;player.surface=surface;}
}

function syncPanel(){const i=islands.find(i=>i.id===selected);if(!i)return;$('island-select').value=selected;$('altitude').value=i.altitude;$('altitude-value').value=`${i.altitude.toFixed(1)} m`;$('weather').value=i.strain??0;$('weather-value').value=i.weather;$('bridge-control').hidden=i.id==='community';if(i.id!=='community'){const b=bridges.find(b=>b.id===i.id);$('bridge-glow').value=b.glow;$('bridge-value').value=b.glow.toFixed(1);}document.querySelectorAll('.island-label').forEach(b=>b.classList.toggle('selected',b.dataset.island===selected));}

function spawnOn(island){
  const desired={x:island.x+island.spawn[0]*island.scale,z:island.z+island.spawn[1]*island.scale};
  let found=islandSurface(island,desired.x,desired.z);
  for(let r=.5;!found&&r<10;r+=.5)for(let a=0;a<Math.PI*2;a+=.35){found=islandSurface(island,desired.x+Math.cos(a)*r,desired.z+Math.sin(a)*r);if(found)break;}
  if(!found)throw new Error(`No walkable spawn for ${island.id}`);
  player.position.set(found.x,found.y,found.z);player.surface=found;
}

// Arriving anywhere: "Welcome to …" sits in the middle of the screen for a
// moment, then slides down into its corner and settles as the usual kicker.
let arriveTimer;
function arrive(island){
  const kicker=island.id===ME?'Home':island.owner?`Visiting ${island.owner}`:'Everyone’s island';
  $('location-kicker').textContent=island.id===ME?'Welcome home':'Welcome to';
  $('location-title').textContent=island.name;
  const place=document.querySelector('.place'), title=place.querySelector('.place-title');
  title.style.transition='none';place.classList.add('arriving');
  const r=title.getBoundingClientRect();
  title.style.transform=`translate(${innerWidth/2-(r.left+r.width/2)}px,${innerHeight*.42-(r.top+r.height/2)}px) scale(1.4)`;
  void title.offsetWidth;title.style.transition='';
  clearTimeout(arriveTimer);
  arriveTimer=setTimeout(()=>{title.style.transform='';place.classList.remove('arriving');$('location-kicker').textContent=kicker;},motion?1600:300);
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
function visit(id){if(!ready)return;selected=id;mode='walk';const island=islands.find(i=>i.id===id);spawnOn(island);controls.enabled=true;controls.minDistance=6;controls.maxDistance=skyReach();cameraOffset.set(...(island.cam??[0,10,16]));
  transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};
  arrive(island);
  $('hint').textContent='';   // the island's status shows below instead (life.js)
$('mode-hint').textContent='WASD to walk · Space to jump · Q E turn · R F tilt · Z X zoom · Esc for sky view';$('overview').setAttribute('aria-pressed','false');$('walk').setAttribute('aria-pressed','true');syncPanel();canvas.focus({preventScroll:true});}
function overview(){if(!ready)return;mode='overview';controls.enabled=true;controls.minDistance=14;controls.maxDistance=skyReach();transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};clearTimeout(arriveTimer);document.querySelector('.place').classList.remove('arriving');document.querySelector('.place-title').style.transform='';$('location-kicker').textContent='Your sky neighborhood';$('location-title').textContent='A world of little wonders.';$('hint').textContent='Choose an island. Stay a little while.';$('mode-hint').textContent='Drag to look around · Scroll to zoom';$('overview').setAttribute('aria-pressed','true');$('walk').setAttribute('aria-pressed','false');keys.clear();}
// The sky view may zoom out a little past the framing, never far enough to lose the world.
const skyReach=()=>overviewPosition().distanceTo(new T.Vector3(0,2,0))*1.25;
function overviewPosition(){
  // Project every island's corners and solve for the distance that fits them
  // all. A closed-form guess breaks as soon as the layout is asymmetric --
  // an island placed toward the camera sits much nearer than its radius says.
  const dir=new T.Vector3(0,.64,.77).normalize(),target=new T.Vector3(0,2,0),pts=[];
  for(const d of definitions){
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
function jump(){if(mode==='walk'&&!transition&&!player.hop&&!player.vy)player.vy=6.2;}
function walk(dt){
  if(mode!=='walk'||transition)return;
  // A hop only lifts the gardener off the ground; the surface underfoot keeps tracking.
  if(player.vy||player.hop){player.vy-=18*dt;player.hop=Math.max(0,player.hop+player.vy*dt);if(!player.hop)player.vy=0;}
  gardener.position.y=player.hop;
  const ix=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  const iz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  if(!ix&&!iz){gardener.rotation.z=0;return;}
  // Camera-relative: W always walks away from the camera, wherever it has been dragged.
  const f=facing.subVectors(controls.target,camera.position).setY(0).normalize();
  const dx=-f.z*ix-f.x*iz, dz=f.x*ix-f.z*iz;
  const len=Math.hypot(dx,dz),speed=4.1,step=speed*dt/len;
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
  if(moved){player.distance+=speed*dt;const turn=Math.atan2(dx,dz)-gardener.rotation.y;gardener.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-12*dt));if(!player.hop)gardener.position.y=motion?Math.sin(player.distance*5)*.045:0;gardener.rotation.z=motion?Math.sin(player.distance*2.5)*.025:0;
    if(player.surface.kind==='island'&&player.surface.id!==selected){selected=player.surface.id;arrive(islands.find(i=>i.id===selected));syncPanel();}
  }
}

// module scope: frame() is top-level and reads this too
const LITE=new URLSearchParams(location.search).has('lite');
// ?skiplogin -> straight into the world (embedding, tests). The sign-in is
// mock: it only waits for a click while the world loads behind it.
if(new URLSearchParams(location.search).has('skiplogin'))$('login').hidden=true;
else createLogin(()=>{canvas.focus({preventScroll:true});notice('Welcome back, Aisha. Your island kept growing while you were away.');});

async function init(){
  // ?lite  -> low-stress dev mode: halves resolution, drops bloom + shadows,
  // caps to 30fps. Purely additive; default behaviour is unchanged.
renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(LITE?1:Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=!LITE;renderer.shadowMap.type=T.PCFSoftShadowMap;
  // Hybrid-graphics laptop: report which adapter WebGL actually picked.
  // The internal panel is wired to the Radeon iGPU, so Task Manager shows it
  // busy even when the RTX 4070 is doing all the rendering.
  const gpu=(()=>{try{const gl=renderer.getContext();const x=gl.getExtension('WEBGL_debug_renderer_info');
    return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(e){return 'unknown';}})();
  console.info('[Island Life] rendering on:',gpu);
  scene=new T.Scene();camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,2000);camera.position.copy(overviewPosition());
  controls=new OrbitControls(camera,canvas);controls.target.set(0,2,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=14;controls.maxDistance=camera.position.distanceTo(controls.target)*1.25;controls.minPolarAngle=.3;controls.maxPolarAngle=1.33;controls.update();
  scene.add(new T.HemisphereLight('#fff2d4','#8d92aa',1.15));
  const sun=new T.DirectionalLight('#ffdeb2',2.0);sun.position.set(-45,65,25);sun.castShadow=true;sun.shadow.mapSize.set(LITE?512:2048,LITE?512:2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=180;sun.shadow.normalBias=.09;sun.shadow.bias=-.00015;scene.add(sun);
  const fill=new T.DirectionalLight('#bcd9e5',.9);fill.position.set(20,20,-30);scene.add(fill);
  atmosphere=createAtmosphere(scene);atmosphere.setTone('peach');
  composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));if(!LITE){const bloom=new UnrealBloomPass(new T.Vector2(innerWidth/2,innerHeight/2),.14,.6,1.25);composer.addPass(bloom);}composer.addPass(new OutputPass());
  const KEYS=['community','meadow_a','meadow_b','meadow_c','purple','oak','sakura','palm','mushrooms','clover',
              'willow','pale','magic_mushrooms','gardener'];
  $('load-progress').max=KEYS.length;
  const loader=new GLTFLoader(),assets={};let loaded=0;
  await Promise.all(KEYS.map(async key=>{assets[key]=(await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${key}.glb`)).scene;setMaterials(assets[key]);$('load-progress').value=++loaded;$('loading-text').textContent=`Gathering the gardens · ${loaded} of ${KEYS.length}`; }));
  // walkable = terrain PLUS the raised surfaces people stand on
  const WALKABLE={community:['Island','Plaza','Jetty','LilySteps','Deck'],meadow:['Island','ToriiSteps']};
  const fields={};
  for(const key of ['community','meadow_a','meadow_b','meadow_c'])
    fields[key]=new HeightField(WALKABLE[key==='community'?'community':'meadow'].map(n=>assets[key].getObjectByName(n)));
  fields.community.block([assets.community.getObjectByName('TreeWood')]);   // the buttress roots are solid
  for(const def of definitions){const island={...def,weather:'clear',field:fields[def.model],obstacles:[...(def.obstacles??[])]};
    const group=new T.Group();group.position.set(def.x,def.altitude,def.z);scene.add(group);island.group=group;
    const model=assets[def.model].clone(true);model.scale.setScalar(def.scale);group.add(model);island.model=model;model.traverse(o=>{o.userData.islandId=def.id;});
    plantIsland(island,group,assets);
    // activity trees and today's ghosts
    forest??=createForest({assets,islandSurface,speciesScale:SPECIES_SCALE});
    if(def.owner)forest.plant(island);
    island.weatherFx=createWeather(atmosphere.texture);island.weatherFx.group.position.copy(group.position);scene.add(island.weatherFx.group);
    island.sink=createSinkBank();island.sink.group.position.copy(group.position);island.sink.set(def.altitude);scene.add(island.sink.group);
    const label=document.createElement('button');label.className='island-label';label.textContent=def.name;label.dataset.island=def.id;label.addEventListener('click',()=>visit(def.id));$('island-labels').append(label);island.label=label;
    const option=document.createElement('option');option.value=def.id;option.textContent=def.name;$('island-select').append(option);islands.push(island);
  }
  for(const island of islands.slice(1))buildBridge(island);
  const playerRoot=new T.Group();scene.add(playerRoot);gardener=assets.gardener;gardener.scale.setScalar(.38);playerRoot.add(gardener);player.root=playerRoot;
  const shadow=new T.Mesh(new T.CircleGeometry(.43,24),new T.MeshBasicMaterial({color:'#35492f',transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;playerRoot.add(shadow);
  spawnOn(islands[0]);
  life=initLife({islands,camera,texture:atmosphere.texture,player,notice,visit,nearTree:forest.near,getMode:()=>mode,getSelected:()=>selected,
    setAltitude:(id,h)=>{updateAltitude(islands.find(i=>i.id===id),T.MathUtils.clamp(h,-10,16));syncPanel();},
    setGlow:(id,g)=>{const b=bridges.find(b=>b.id===id);if(!b)return;b.glow=T.MathUtils.clamp(g,.15,3);b.glowMaterial.emissiveIntensity=b.glow*2.2;b.deckMaterial.emissiveIntensity=b.glow*.16;syncPanel();}});
  ready=true;
  const want=new URLSearchParams(location.search).get('island');
  if(want&&islands.some(i=>i.id===want))setTimeout(()=>visit(want),0);
$('loading').hidden=true;$('motion').checked=motion;syncPanel();
  renderer.setAnimationLoop(frame);
  // A small inspection API also exposes meaningful world state for embedding.
  window.islandLife={visit,overview,setAltitude:(id,h)=>{if(!Number.isFinite(h))return;updateAltitude(islands.find(i=>i.id===id),T.MathUtils.clamp(h,-10,16));syncPanel();},setWeather:(id,s)=>{const i=islands.find(i=>i.id===id),v=typeof s==='number'?s:{clear:.05,cloudy:.45,mist:.45,rain:.85}[s];if(!i||v==null)return;setStrain(i,v);syncPanel();},getState:()=>({ready,mode,selected,gpu,player:{x:player.position.x,y:player.position.y,z:player.position.z,surface:player.surface},islands:islands.map(({id,altitude,weather,strain})=>({id,altitude,weather,strain})),bridges:bridges.map(({id,start,end,width,arch,glow})=>({id,start,end,width,arch,glow})),render:renderer.info.render}),surfaceAt:(x,z)=>surfaceAt(islands,bridges,x,z),life:life.api};
}

let _last=0;
function frame(time){
  if(LITE){ if(time-_last<33) return; _last=time; }   // cap ~30fps

  const dt=Math.min((time-last)/1000,.04);last=time;if(document.hidden)return;if(motion)elapsed+=dt;
  turnCamera(dt);walk(dt);player.root.position.copy(player.position);atmosphere.update(elapsed,camera);for(const i of islands){i.weatherFx.update(elapsed,camera);i.sink.update(elapsed);}
  if(transition){transition.time+=dt;const a=motion?Math.min(transition.time/1.2,1):1,e=1-Math.pow(1-a,4);look.copy(mode==='walk'?player.position:new T.Vector3(0,2,0));if(mode==='walk')look.y+=1;targetPosition.copy(mode==='walk'?player.position.clone().add(cameraOffset):overviewPosition());camera.position.lerpVectors(transition.from,targetPosition,e);controls.target.lerpVectors(transition.targetFrom,look,e);camera.lookAt(controls.target);if(a===1)transition=null;}
  // walk: orbit controls around the gardener -- drag to turn, scroll to zoom -- carried along as they move
  // (no collision pull-in: the camera stays exactly where the user put it)
  else if(mode==='walk'){look.copy(player.position);look.y+=1;camera.position.add(look).sub(controls.target);controls.target.copy(look);controls.autoRotate=false;controls.update(dt);}
  else {controls.autoRotate=motion;controls.autoRotateSpeed=.1;controls.update(dt);}
  life.update(dt,elapsed,motion);
  forest.update(dt,elapsed,motion,id=>life.api.getSchedule(id));
  for(const island of islands){const p=new T.Vector3(island.x,island.altitude+.7,island.z+8*island.scale).project(camera);island.label.style.left=`${(p.x*.5+.5)*innerWidth}px`;island.label.style.top=`${(-p.y*.5+.5)*innerHeight}px`;island.label.hidden=mode==='walk'||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
  composer.render();
}

let down=null;
canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
canvas.addEventListener('pointerup',e=>{if(!ready||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;down=null;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);if(life.pick(raycaster))return;if(mode!=='overview')return;const hit=raycaster.intersectObjects(islands.map(i=>i.group),true).find(h=>h.object.userData.islandId);if(hit)visit(hit.object.userData.islandId);});
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Escape'){overview();return;}if(e.code==='Space'&&mode==='walk'){e.preventDefault();jump();return;}if(/^(Key[WASDQERFZX]|Arrow(Up|Down|Left|Right))$/.test(e.code)){if(mode==='walk'||/^Key[QERFZX]$/.test(e.code))e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
$('overview').onclick=overview;$('walk').onclick=()=>visit(selected);
function setPanel(open){$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));if(open)$('sky-tone').focus();else $('settings-toggle').focus();}
$('settings-toggle').onclick=()=>setPanel($('settings').hidden);$('settings-close').onclick=()=>setPanel(false);
$('island-select').onchange=e=>{selected=e.target.value;syncPanel();};
$('sky-tone').onchange=e=>{atmosphere?.setTone(e.target.value);$('sky-label').textContent=e.target.selectedOptions[0].textContent;};
$('motion').onchange=e=>{motion=e.target.checked;};
$('altitude').oninput=e=>{if(!ready)return;updateAltitude(islands.find(i=>i.id===selected),+e.target.value);syncPanel();};
$('weather').oninput=e=>{if(!ready)return;setStrain(islands.find(i=>i.id===selected),+e.target.value);syncPanel();};
$('bridge-glow').oninput=e=>{const b=bridges.find(b=>b.id===selected);if(!b)return;b.glow=+e.target.value;b.glowMaterial.emissiveIntensity=b.glow*2.2;b.deckMaterial.emissiveIntensity=b.glow*.16;$('bridge-value').value=b.glow.toFixed(1);};
$('reset').onclick=()=>{if(!ready)return;for(const d of definitions){const i=islands.find(i=>i.id===d.id);updateAltitude(i,d.altitude);setStrain(i,i.derivedStrain??0);}for(const b of bridges){b.glow=1.2;b.glowMaterial.emissiveIntensity=2.64;b.deckMaterial.emissiveIntensity=.192;}life.api.resettle();$('sky-tone').value='peach';$('sky-tone').dispatchEvent(new Event('change'));syncPanel();notice('Back to a quiet peach twilight.');};
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').hidden=false;$('loading-text').textContent='The world could not load. Check the local server and reload to try again.';$('load-progress').hidden=true;const button=document.createElement('button');button.textContent='Try again';button.onclick=()=>location.reload();$('loading').append(button);});
