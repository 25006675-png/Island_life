import './style.css';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HeightField, bridgePoint, surfaceAt, islandSurface } from './navigation.js';
import { createAtmosphere, createLanterns, createWeather } from './atmosphere.js';

const $=id=>document.getElementById(id), canvas=$('world');
const definitions=[
  {id:'community',name:'The gathering tree',description:'A quiet shore, a familiar place.',x:0,z:0,altitude:0,scale:1,spawn:[1,10],obstacles:[{x:6.2,z:-5.6,r:2.7}]},
  {id:'sakura',name:'Blossom garden',description:'A few petals, carried on the breeze.',x:-33,z:-14,altitude:7,scale:.55,tree:'sakura',treeScale:1.05,spawn:[0,4]},
  {id:'purple',name:'Lavender grove',description:'Room to wander. Time to breathe.',x:33,z:-15,altitude:10,scale:.53,tree:'purple',treeScale:1.2,spawn:[0,4]},
  {id:'oak',name:'Golden meadow',description:'The last of the sunlight lives here.',x:-29,z:27,altitude:-3,scale:.48,tree:'oak',treeScale:.85,spawn:[0,4]},
  {id:'palm',name:'The little hideaway',description:'A small corner of the endless sky.',x:30,z:26,altitude:-5,scale:.48,tree:'palm',treeScale:1.0,spawn:[0,4]},
];
let renderer,scene,camera,controls,composer,atmosphere,lanterns,gardener;
const islands=[],bridges=[],keys=new Set();
let selected='community',mode='overview',ready=false,motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0,transition=null,noticeTimer;
const player={position:new T.Vector3(),surface:null,distance:0};
const look=new T.Vector3(),targetPosition=new T.Vector3(),cameraOffset=new T.Vector3(0,11,17);
const raycaster=new T.Raycaster(),pointer=new T.Vector2();
const bridgeMaterial=new T.MeshStandardMaterial({color:'#efd2a2',emissive:'#ffbd62',emissiveIntensity:.3,roughness:.8});

function notice(message){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),3000);}
function makeMesh(geometry,material,parent,position){const m=new T.Mesh(geometry,material);if(position)m.position.copy(position);parent.add(m);return m;}
function setMaterials(root){root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.material.side=T.DoubleSide;
  if(/Glass|Lantern/i.test(o.name)){o.material=o.material.clone();o.material.emissive=new T.Color('#ffd38a');o.material.emissiveIntensity=2.2;}
  if(o.name==='Water'){o.material=new T.MeshStandardMaterial({color:'#8ac5b6',metalness:.35,roughness:.2,transparent:true,opacity:.86});}
  if(o.name==='Waterfalls'){o.material=new T.MeshStandardMaterial({color:'#c0e3d9',emissive:'#87c6c4',emissiveIntensity:.15,transparent:true,opacity:.65,side:T.DoubleSide,roughness:.3});}
});}

function buildBridge(island){
  let bridge=bridges.find(b=>b.id===island.id);
  if(bridge){scene.remove(bridge.group);bridge.group.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
  else {bridge={id:island.id,glow:1.2,width:1.75,arch:3.4};bridges.push(bridge);}
  const central=islands[0],dx=island.x,dz=island.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
  // Start well inside each safe shoreline so terrain and bridge overlap.
  let startRadius=10.8;
  for(let r=10.8;r<14;r+=.15){if(islandSurface(central,ux*r,uz*r,.05)){startRadius=r;break;}}
  const endRadius=5.0;
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
  if(island.id==='community')for(const i of islands.slice(1))buildBridge(i);else buildBridge(island);
  if(player.surface?.kind==='island'&&player.surface.id===island.id)player.position.y+=altitude-old;
  const surface=surfaceAt(islands,bridges,player.position.x,player.position.z);if(surface){player.position.y=surface.y;player.surface=surface;}
}

function syncPanel(){const i=islands.find(i=>i.id===selected);if(!i)return;$('island-select').value=selected;$('altitude').value=i.altitude;$('altitude-value').value=`${i.altitude.toFixed(1)} m`;$('weather').value=i.weather;$('bridge-control').hidden=i.id==='community';if(i.id!=='community'){const b=bridges.find(b=>b.id===i.id);$('bridge-glow').value=b.glow;$('bridge-value').value=b.glow.toFixed(1);}document.querySelectorAll('.island-label').forEach(b=>b.classList.toggle('selected',b.dataset.island===selected));}

function spawnOn(island){
  const desired={x:island.x+island.spawn[0]*island.scale,z:island.z+island.spawn[1]*island.scale};
  let found=islandSurface(island,desired.x,desired.z);
  for(let r=.5;!found&&r<10;r+=.5)for(let a=0;a<Math.PI*2;a+=.35){found=islandSurface(island,desired.x+Math.cos(a)*r,desired.z+Math.sin(a)*r);if(found)break;}
  if(!found)throw new Error(`No walkable spawn for ${island.id}`);
  player.position.set(found.x,found.y,found.z);player.surface=found;
}

function visit(id){if(!ready)return;selected=id;mode='walk';const island=islands.find(i=>i.id===id);spawnOn(island);controls.enabled=false;cameraOffset.set(0,10,16);
  transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};
  $('location-kicker').textContent='A little time on your island';$('location-title').textContent=island.name;$('hint').textContent='WASD or arrow keys to wander. Follow a light bridge to visit a neighbor.';$('mode-hint').textContent='WASD / arrows to walk · Esc for sky view';$('overview').setAttribute('aria-pressed','false');$('walk').setAttribute('aria-pressed','true');syncPanel();canvas.focus({preventScroll:true});}
function overview(){if(!ready)return;mode='overview';controls.enabled=true;transition={from:camera.position.clone(),targetFrom:controls.target.clone(),time:0};$('location-kicker').textContent='Your sky neighborhood';$('location-title').textContent='A world of little wonders.';$('hint').textContent='Choose an island. Stay a little while.';$('mode-hint').textContent='Drag to look around · Scroll to zoom';$('overview').setAttribute('aria-pressed','true');$('walk').setAttribute('aria-pressed','false');keys.clear();}
function overviewPosition(){return new T.Vector3(0,55,96).multiplyScalar(Math.max(1,1.5/camera.aspect));}

function walk(dt){
  if(mode!=='walk'||transition)return;
  const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  if(!dx&&!dz){gardener.position.y=0;gardener.rotation.z=0;return;}
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
  if(moved){player.distance+=speed*dt;gardener.rotation.y=T.MathUtils.lerp(gardener.rotation.y,Math.atan2(dx,dz),1-Math.exp(-12*dt));gardener.position.y=motion?Math.sin(player.distance*5)*.045:0;gardener.rotation.z=motion?Math.sin(player.distance*2.5)*.025:0;
    if(player.surface.kind==='island'&&player.surface.id!==selected){selected=player.surface.id;const i=islands.find(i=>i.id===selected);$('location-title').textContent=i.name;syncPanel();notice(`Welcome to ${i.name.toLowerCase()}.`);}
  }
}

async function init(){
  // ?lite  -> low-stress dev mode: halves resolution, drops bloom + shadows,
  // caps to 30fps. Purely additive; default behaviour is unchanged.
  const LITE=new URLSearchParams(location.search).has('lite');
renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(LITE?1:Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.enabled=!LITE;renderer.shadowMap.type=T.PCFSoftShadowMap;
  // Hybrid-graphics laptop: report which adapter WebGL actually picked.
  // The internal panel is wired to the Radeon iGPU, so Task Manager shows it
  // busy even when the RTX 4070 is doing all the rendering.
  const gpu=(()=>{try{const gl=renderer.getContext();const x=gl.getExtension('WEBGL_debug_renderer_info');
    return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(e){return 'unknown';}})();
  console.info('[Island Life] rendering on:',gpu);
  scene=new T.Scene();camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,700);camera.position.copy(overviewPosition());
  controls=new OrbitControls(camera,canvas);controls.target.set(0,2,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=18;controls.maxDistance=180;controls.minPolarAngle=.3;controls.maxPolarAngle=1.33;controls.update();
  scene.add(new T.HemisphereLight('#fff2d4','#8d92aa',2.5));
  const sun=new T.DirectionalLight('#ffdeb2',3.2);sun.position.set(-45,65,25);sun.castShadow=true;sun.shadow.mapSize.set(LITE?512:2048,LITE?512:2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=180;sun.shadow.normalBias=.09;sun.shadow.bias=-.00015;scene.add(sun);
  const fill=new T.DirectionalLight('#bcd9e5',.9);fill.position.set(20,20,-30);scene.add(fill);
  atmosphere=createAtmosphere(scene);atmosphere.setTone('peach');lanterns=createLanterns(scene,atmosphere.texture);lanterns.setDensity(36);
  composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));if(!LITE){const bloom=new UnrealBloomPass(new T.Vector2(innerWidth/2,innerHeight/2),.24,.65,1.1);composer.addPass(bloom);}composer.addPass(new OutputPass());
  const loader=new GLTFLoader(),assets={};let loaded=0;
  await Promise.all(['community','meadow','purple','oak','sakura','palm','mushrooms','clover','gardener'].map(async key=>{assets[key]=(await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${key}.glb`)).scene;setMaterials(assets[key]);$('load-progress').value=++loaded;$('loading-text').textContent=`Gathering the gardens · ${loaded} of 9`; }));
  const fields={community:new HeightField(assets.community.getObjectByName('Island')),meadow:new HeightField(assets.meadow.getObjectByName('Island'))};
  for(const def of definitions){const island={...def,weather:'clear',field:fields[def.id==='community'?'community':'meadow'],obstacles:[...(def.obstacles??[])]};
    const group=new T.Group();group.position.set(def.x,def.altitude,def.z);scene.add(group);island.group=group;
    const model=assets[def.id==='community'?'community':'meadow'].clone(true);model.scale.setScalar(def.scale);group.add(model);island.model=model;model.traverse(o=>{o.userData.islandId=def.id;});
    if(def.tree){const tree=assets[def.tree].clone(true);tree.position.set(2.1,.22,-1.8);tree.scale.setScalar(def.treeScale);tree.rotation.y=def.id==='palm'?-.5:.3;group.add(tree);tree.traverse(o=>{o.userData.islandId=def.id;});island.obstacles.push({x:2.1/def.scale,z:-1.8/def.scale,r:.8/def.scale});
      for(let n=0;n<3;n++){const prop=assets[n===2?'mushrooms':'clover'].clone(true);prop.scale.setScalar(n===2?.5:.3);prop.position.set(-2+n*2,.24,1.7+n%2*.9);group.add(prop);}
      // The authored gate posts are solid; the opening remains walkable.
      island.obstacles.push({x:-6.5,z:-6,r:.3},{x:-4.3,z:-4,r:.3});
    }
    island.weatherFx=createWeather(atmosphere.texture);island.weatherFx.group.position.copy(group.position);scene.add(island.weatherFx.group);
    const label=document.createElement('button');label.className='island-label';label.textContent=def.name;label.dataset.island=def.id;label.addEventListener('click',()=>visit(def.id));$('island-labels').append(label);island.label=label;
    const option=document.createElement('option');option.value=def.id;option.textContent=def.name;$('island-select').append(option);islands.push(island);
  }
  for(const island of islands.slice(1))buildBridge(island);
  const playerRoot=new T.Group();scene.add(playerRoot);gardener=assets.gardener;gardener.scale.setScalar(.38);playerRoot.add(gardener);player.root=playerRoot;
  const shadow=new T.Mesh(new T.CircleGeometry(.43,24),new T.MeshBasicMaterial({color:'#35492f',transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;playerRoot.add(shadow);
  spawnOn(islands[0]);ready=true;$('loading').hidden=true;$('motion').checked=motion;syncPanel();
  renderer.setAnimationLoop(frame);
  // A small inspection API also exposes meaningful world state for embedding.
  window.islandLife={visit,overview,setAltitude:(id,h)=>{if(!Number.isFinite(h))return;updateAltitude(islands.find(i=>i.id===id),T.MathUtils.clamp(h,-7,16));syncPanel();},setWeather:(id,type)=>{if(!['clear','rain','mist'].includes(type))return;const i=islands.find(i=>i.id===id);i.weather=type;i.weatherFx.set(type);syncPanel();},getState:()=>({ready,mode,selected,gpu,player:{x:player.position.x,y:player.position.y,z:player.position.z,surface:player.surface},islands:islands.map(({id,altitude,weather})=>({id,altitude,weather})),bridges:bridges.map(({id,start,end,width,arch,glow})=>({id,start,end,width,arch,glow})),render:renderer.info.render}),surfaceAt:(x,z)=>surfaceAt(islands,bridges,x,z)};
}

let _last=0;
function frame(time){
  if(LITE){ if(time-_last<33) return; _last=time; }   // cap ~30fps

  const dt=Math.min((time-last)/1000,.04);last=time;if(document.hidden)return;if(motion)elapsed+=dt;
  walk(dt);player.root.position.copy(player.position);atmosphere.update(elapsed);lanterns.update(elapsed,islands[0].altitude);for(const i of islands)i.weatherFx.update(elapsed);
  if(transition){transition.time+=dt;const a=motion?Math.min(transition.time/1.2,1):1,e=1-Math.pow(1-a,4);look.copy(mode==='walk'?player.position:new T.Vector3(0,2,0));if(mode==='walk')look.y+=1;targetPosition.copy(mode==='walk'?player.position.clone().add(cameraOffset):overviewPosition());camera.position.lerpVectors(transition.from,targetPosition,e);controls.target.lerpVectors(transition.targetFrom,look,e);camera.lookAt(controls.target);if(a===1)transition=null;}
  else if(mode==='walk'){look.copy(player.position);look.y+=1;targetPosition.copy(player.position).add(cameraOffset);camera.position.lerp(targetPosition,1-Math.exp(-4*dt));controls.target.lerp(look,1-Math.exp(-5*dt));camera.lookAt(controls.target);}
  else {controls.autoRotate=motion;controls.autoRotateSpeed=.1;controls.update(dt);}
  for(const island of islands){const p=new T.Vector3(island.x,island.altitude+.7,island.z+8*island.scale).project(camera);island.label.style.left=`${(p.x*.5+.5)*innerWidth}px`;island.label.style.top=`${(-p.y*.5+.5)*innerHeight}px`;island.label.hidden=mode==='walk'||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
  composer.render();
}

let down=null;
canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
canvas.addEventListener('pointerup',e=>{if(!ready||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;down=null;if(mode!=='overview')return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(islands.map(i=>i.group),true).find(h=>h.object.userData.islandId);if(hit)visit(hit.object.userData.islandId);});
canvas.addEventListener('wheel',e=>{if(mode==='walk'){e.preventDefault();const factor=e.deltaY>0?1.08:.92;cameraOffset.multiplyScalar(factor);cameraOffset.clampLength(9,35);}},{passive:false});
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Escape'){overview();return;}if(/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)){if(mode==='walk')e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
$('overview').onclick=overview;$('walk').onclick=()=>visit(selected);
function setPanel(open){$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));if(open)$('sky-tone').focus();else $('settings-toggle').focus();}
$('settings-toggle').onclick=()=>setPanel($('settings').hidden);$('settings-close').onclick=()=>setPanel(false);
$('island-select').onchange=e=>{selected=e.target.value;syncPanel();};
$('sky-tone').onchange=e=>{atmosphere?.setTone(e.target.value);$('sky-label').textContent=e.target.selectedOptions[0].textContent;};
$('lantern-density').oninput=e=>{lanterns?.setDensity(+e.target.value);$('lantern-value').value=e.target.value;};
$('motion').onchange=e=>{motion=e.target.checked;};
$('altitude').oninput=e=>{if(!ready)return;updateAltitude(islands.find(i=>i.id===selected),+e.target.value);syncPanel();};
$('weather').onchange=e=>{if(!ready)return;const i=islands.find(i=>i.id===selected);i.weather=e.target.value;i.weatherFx.set(i.weather);};
$('bridge-glow').oninput=e=>{const b=bridges.find(b=>b.id===selected);if(!b)return;b.glow=+e.target.value;b.glowMaterial.emissiveIntensity=b.glow*2.2;b.deckMaterial.emissiveIntensity=b.glow*.16;$('bridge-value').value=b.glow.toFixed(1);};
$('reset').onclick=()=>{if(!ready)return;for(const d of definitions){const i=islands.find(i=>i.id===d.id);updateAltitude(i,d.altitude);i.weather='clear';i.weatherFx.set('clear');}for(const b of bridges){b.glow=1.2;b.glowMaterial.emissiveIntensity=2.64;b.deckMaterial.emissiveIntensity=.192;}$('sky-tone').value='peach';$('sky-tone').dispatchEvent(new Event('change'));$('lantern-density').value=36;$('lantern-density').dispatchEvent(new Event('input'));syncPanel();notice('Back to a quiet peach twilight.');};
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').hidden=false;$('loading-text').textContent='The world could not load. Check the local server and reload to try again.';$('load-progress').hidden=true;const button=document.createElement('button');button.textContent='Try again';button.onclick=()=>location.reload();$('loading').append(button);});
