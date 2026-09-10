import * as T from 'three';
import { CATEGORIES, SCHEDULES, ME, fmt, hours } from './data.js';
import { SPECIES, HISTORY, tier, treeCard } from './groves.js';

// The forest on each member island (PRODUCT.md "trees = activities"):
// a solid tree for everything done this past week, and one tree for each of
// today's blocks -- a glass ghost while it is planned, which "takes root"
// (fills with colour from the roots up, a band of light riding the front)
// once its time is done. A skipped block's ghost thins out and drifts away.
//
// Territories: the ring outside the timetable loop is cut into wedges, one
// per category in a fixed order, sized by how many trees each holds, with a
// gap at the bridge landing. Inside its wedge each tree takes the open spot
// furthest from every other tree (best-candidate sampling), so trees spread
// evenly instead of bunching or leaving bare ground.

const ORDER=['study','work','errands','social','exercise','rest','other'];
const R_IN=11.5, R_OUT=26;   // scene units; the timetable loop runs at r=8 (timetable.js RADIUS)
const BRIDGE_GAP=.35;        // radians kept clear either side of the bridge landing
// ...and either side of the line from the walk-in camera to the spawn point
// (main.js island.spawn / island.cam): trees there pull the camera in close.
const CAMERA_GAP=.35;
const TAU=Math.PI*2, mod=a=>((a%TAU)+TAU)%TAU;

// Free arcs of the ring once the gaps ([centre, half-width] pairs, the first
// being the bridge) are cut out. Gaps may overlap -- the camera line and the
// bridge landing do on Chen's island -- so they are merged first. Returns the
// total free angle and angleAt(u), which maps 0..span onto the free arcs.
function freeRing(gaps){
  const start=mod(gaps[0][0]+gaps[0][1]);
  const cuts=[];
  for(const [c,h] of gaps){
    const a=mod(c-h-start), b=a+2*h;
    if(b<=TAU)cuts.push([a,b]);else cuts.push([a,TAU],[0,b-TAU]);
  }
  cuts.sort((p,q)=>p[0]-q[0]);
  const free=[];let at=0;
  for(const [a,b] of cuts){if(a>at)free.push([at,a]);at=Math.max(at,b);}
  if(at<TAU)free.push([at,TAU]);
  const span=free.reduce((s,[a,b])=>s+b-a,0);
  const angleAt=u=>{
    for(const [a,b] of free){if(u<=b-a)return start+a+u;u-=b-a;}
    return start+free.at(-1)[1];
  };
  return {span,angleAt};
}
const ROOT_SECONDS=2.6, DRIFT_SECONDS=3;
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go'};
const SUN=new T.Vector3(-45,65,25).normalize();   // main.js key light

// Glass ghost of a tree. Unlit: faint in the body, a soft edge light
// (fresnel), tinted with the category colour, keeping a little of the painted
// shading so the species still reads. uFill (0..1) runs the take-root
// animation; uFade fades a skipped ghost out; uPulse breathes while the block
// is happening now. uBase/uHeight are the tree's world base height and height.
export function ghostMaterial(color){
  return new T.ShaderMaterial({
    uniforms:{uTint:{value:new T.Color(color)},uFill:{value:0},uBase:{value:0},uHeight:{value:8},
              uFade:{value:1},uPulse:{value:0},uSun:{value:SUN}},
    vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:/* glsl */`
      varying vec3 vColor; varying vec3 vN; varying vec3 vView; varying vec3 vWN; varying float vY;
      void main(){
        #if defined(USE_COLOR_ALPHA)
          vColor=color.rgb;
        #elif defined(USE_COLOR)
          vColor=color;
        #else
          vColor=vec3(1.0);
        #endif
        vec4 wp=modelMatrix*vec4(position,1.0);
        vY=wp.y;
        vWN=normalize(mat3(modelMatrix)*normal);
        vec4 mv=viewMatrix*wp;
        vN=normalize(normalMatrix*normal);
        vView=-mv.xyz;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:/* glsl */`
      uniform vec3 uTint,uSun; uniform float uFill,uBase,uHeight,uFade,uPulse;
      varying vec3 vColor; varying vec3 vN; varying vec3 vView; varying vec3 vWN; varying float vY;
      void main(){
        // A strong rim on every round cluster core read as soap bubbles, so the
        // body carries the look and the rim is only a soft edge light.
        float f=pow(1.0-abs(dot(normalize(vN),normalize(vView))),2.5);
        float lum=dot(vColor,vec3(0.3,0.59,0.11));
        vec3 glass=mix(uTint,vec3(1.0),0.15)*(0.45+0.9*lum)+uTint*f*(0.7+0.9*uPulse);
        // take root: painted colour rises from the roots behind a band of light
        float front=uBase+uFill*uHeight*1.1;
        float filled=uFill>0.0?1.0-smoothstep(front-0.3,front+0.3,vY):0.0;
        vec3 painted=vColor*(0.6+0.55*max(dot(normalize(vWN),uSun),0.0));
        float band=uFill>0.0?exp(-abs(vY-front)*2.2)*(1.0-uFill*uFill):0.0;
        gl_FragColor=vec4(mix(glass,painted,filled)+uTint*band*1.8,mix(0.24+0.28*f,1.0,filled)*uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function blockCard(b,own){
  const c=CATEGORIES[b.cat], vis=own?'open':b.vis, st=STATUS[b.status]??b.status;
  const key=`g${b.id}${b.status}`, kicker=`Today · ${fmt(b.start)}–${fmt(b.start+b.mins)}`;
  if(vis==='hidden')return {key,kicker,title:'Kept private',sub:st};
  if(vis==='open')return {key,color:c.color,kicker,title:b.title,sub:`${c.label} · ${hours(b.mins)} · ${st}`};
  return {key,color:c.color,kicker,title:c.label,sub:`${tier(b.mins).label} tree · ${st}`};
}

export function createForest({assets,islandSurface,speciesScale}){
  const islands=[], byBlock=new Map(), animating=new Set(), heights={};
  const heightOf=k=>heights[k]??=new T.Box3().setFromObject(assets[k]).getSize(new T.Vector3()).y;
  const scaleFor=(island,cat,mins)=>(speciesScale[SPECIES[cat]]??1)*tier(mins).scale*(.92+island.rnd()*.16);

  // One wedge per category, widths weighted by tree count (+2 so a small
  // category still gets room). Wedges are laid out in "free angle" u, which
  // runs round the island from just past the bridge landing and skips the
  // gaps; island.angleAt(u) turns it back into a real angle.
  function layout(island){
    const count={};
    for(const e of HISTORY[island.id]??[])count[e.cat]=(count[e.cat]??0)+1;
    for(const b of SCHEDULES[island.id]??[])count[b.cat]=(count[b.cat]??0)+1;
    const cats=ORDER.filter(c=>count[c]), weight=c=>count[c]+2;
    const total=cats.reduce((a,c)=>a+weight(c),0);
    const s=island.scale, cam=island.cam??[0,10,16];
    const camAngle=Math.atan2(island.spawn[1]*s+cam[2],island.spawn[0]*s+cam[0]);
    const ring=freeRing([[Math.atan2(-island.z,-island.x),BRIDGE_GAP],[camAngle,CAMERA_GAP]]);
    island.span=ring.span;island.angleAt=ring.angleAt;
    island.territories={};
    let u=0;
    for(const c of cats){const w=island.span*weight(c)/total;island.territories[c]={u0:u,u1:u+w};u+=w;}
  }

  function spot(island,cat,sc,anywhere){
    const t=anywhere?{u0:0,u1:island.span}:island.territories[cat], s=island.scale, own=.85*sc/s;
    const arch={x:-5.4*s,z:-5*s};   // the torii and its path legs
    const m=Math.min(.12,(t.u1-t.u0)*.15);
    let best=null;
    for(let k=0;k<60;k++){
      const a=island.angleAt(t.u0+m+island.rnd()*(t.u1-t.u0-2*m));
      const r=Math.sqrt(R_IN*R_IN+island.rnd()*(R_OUT*R_OUT-R_IN*R_IN));   // even over area
      const x=Math.cos(a)*r, z=Math.sin(a)*r;
      if(Math.hypot(x-arch.x,z-arch.z)<6)continue;
      if(island.obstacles.some(o=>Math.hypot(x/s-o.x,z/s-o.z)<o.r+own+.25))continue;
      const surface=islandSurface(island,island.x+x,island.z+z,1.1);
      if(!surface)continue;
      let gap=Infinity;for(const o of island.trees)gap=Math.min(gap,Math.hypot(x-o.x,z-o.z));
      if(!best||gap>best.gap)best={x,z,y:surface.y,gap};
    }
    return best;
  }

  function addTree(island,{cat,mins,entry,block}){
    const sc=scaleFor(island,cat,mins), key=SPECIES[cat], s=island.scale;
    const p=spot(island,cat,sc)??spot(island,cat,sc,true);
    if(!p){console.warn(`[forest] no room for a ${cat} tree on ${island.id}`);return null;}
    const solid=assets[key].clone(true);
    solid.scale.setScalar(sc);
    solid.position.set(p.x,p.y-island.altitude,p.z);
    solid.rotation.y=island.rnd()*Math.PI*2;
    solid.traverse(o=>{o.userData.islandId=island.id;});   // main.js camera occluders rely on this
    island.group.add(solid);
    const obstacle={x:p.x/s,z:p.z/s,r:.85*sc/s};island.obstacles.push(obstacle);
    const tree={island,cat,key,sc,x:p.x,z:p.z,entry,block,solid,obstacle,reach:1.8+1.6*sc,state:'solid'};
    if(block){
      tree.mat=ghostMaterial(CATEGORIES[cat].color);
      tree.ghost=solid.clone(true);
      tree.ghost.traverse(o=>{if(o.isMesh){o.material=tree.mat;o.castShadow=false;}});
      island.group.add(tree.ghost);
      tree.state=null;tree.solid.visible=false;   // settled by the first sync
      byBlock.set(block.id,tree);
    }
    island.trees.push(tree);
    return tree;
  }

  function setState(t,state,now){
    t.now=now;
    if(t.state===state)return;
    const first=t.state===null, prev=t.state, u=t.mat.uniforms;
    t.state=state;t.k=0;
    const show=(solid,ghost)=>{t.solid.visible=solid;t.ghost.visible=ghost;};
    if(state!=='gone'&&!t.island.obstacles.includes(t.obstacle))t.island.obstacles.push(t.obstacle);
    // what was already true when the page loaded appears without animating
    if(first||state==='ghost'){
      t.anim=null;animating.delete(t);u.uFill.value=0;u.uFade.value=1;t.mat.depthWrite=false;
      t.ghost.position.y=t.solid.position.y;
      show(state==='solid',state==='ghost');
      if(state==='gone')t.island.obstacles.splice(t.island.obstacles.indexOf(t.obstacle),1);
      return;
    }
    if(state==='solid'&&prev==='ghost'){t.anim='root';t.mat.depthWrite=true;show(false,true);}
    else if(state==='gone'){t.anim='drift';show(false,true);}
    else {t.anim=null;show(state==='solid',false);return;}
    animating.add(t);
  }

  function sync(getSchedule){
    for(const island of islands){
      const blocks=getSchedule(island.id);if(!blocks)continue;
      const seen=new Set();
      for(const b of blocks){
        seen.add(b.id);
        const t=byBlock.get(b.id)??addTree(island,{cat:b.cat,mins:b.mins,block:b});   // added in the planner
        if(!t)continue;
        t.block=b;
        setState(t,b.status==='done'?'solid':b.status==='skipped'?'gone':'ghost',b.status==='now');
      }
      for(const [id,t] of byBlock)if(t.island===island&&!seen.has(id))setState(t,'gone',false);   // removed from the plan
    }
  }

  let tick=0;
  return {
    plant(island){
      let seed=island.id.length*7919+13;
      island.rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
      island.trees=[];layout(island);islands.push(island);
      // Long activities first, so the big trees claim room before the small
      // ones; today's ghosts interleave with the week's solid trees.
      const items=[...(HISTORY[island.id]??[]).map(e=>({cat:e.cat,mins:e.mins,entry:e})),
                   ...(SCHEDULES[island.id]??[]).map(b=>({cat:b.cat,mins:b.mins,block:b}))];
      items.sort((a,b)=>b.mins-a.mins);
      for(const it of items)addTree(island,it);
    },
    update(dt,elapsed,motion,getSchedule){
      if((tick-=dt)<=0){tick=.25;sync(getSchedule);}
      for(const t of animating){
        const u=t.mat.uniforms;
        if(t.anim==='root'){
          t.k=motion?Math.min(1,t.k+dt/ROOT_SECONDS):1;
          u.uFill.value=1-Math.pow(1-t.k,2);
          if(t.k>=1){t.solid.visible=true;t.ghost.visible=false;t.mat.depthWrite=false;u.uFill.value=0;t.anim=null;animating.delete(t);}
        }else if(t.anim==='drift'){
          t.k=motion?Math.min(1,t.k+dt/DRIFT_SECONDS):1;
          u.uFade.value=1-t.k;t.ghost.position.y=t.solid.position.y+t.k*2.5;
          if(t.k>=1){
            t.ghost.visible=false;t.anim=null;animating.delete(t);
            const i=t.island.obstacles.indexOf(t.obstacle);if(i>=0)t.island.obstacles.splice(i,1);
          }
        }
      }
      for(const island of islands)for(const t of island.trees){
        if(!t.ghost?.visible)continue;
        const u=t.mat.uniforms;
        u.uBase.value=island.group.position.y+t.solid.position.y;
        u.uHeight.value=heightOf(t.key)*t.sc;
        u.uPulse.value=t.now&&motion?.5+.5*Math.sin(elapsed*2.4):t.now?.6:0;
      }
    },
    // the tree nearest `pos` on island `id`, as a reveal card for life.js
    near(id,pos){
      const island=islands.find(i=>i.id===id);let best=null;
      for(const t of island?.trees??[]){
        if(t.state==='gone')continue;
        const d=Math.hypot(pos.x-island.x-t.x,pos.z-island.z-t.z);
        if(d<t.reach&&(!best||d<best.d))best={t,d};
      }
      if(!best)return null;
      return best.t.block?blockCard(best.t.block,id===ME):treeCard(best.t.entry,id===ME);
    },
  };
}
