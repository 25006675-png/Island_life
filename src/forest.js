import { GATE } from './gate.js';
import { RADIUS as LOOP } from './timetable.js';
import * as T from 'three';
import { CATEGORIES, SCHEDULES, ME, fmt, hours } from './data.js';
import { SPECIES, HISTORY, tier, treeCard } from './groves.js';

// The forest on each member island (README.md "trees = activities"):
// a solid tree for everything done this past week, and one tree for each of
// today's blocks -- a glass ghost while it is planned, which "takes root"
// (fills with colour from the roots up, a band of light riding the front)
// once its time is done. A skipped block's ghost thins out and drifts away.
// On your own island, while you are walking it, the ghost waits for water
// instead: `thirsty(tree)` sends the gardener over with her can (main.js
// "Watering") and `water(tree)` starts the take-root once the water lands. `onRoot(tree)` hears every take-root.
//
// Territories: the ring outside the timetable loop is cut into wedges, one
// per category in a fixed order, sized by how many trees each holds, with a
// gap at the bridge landing. Inside its wedge each tree takes the open spot
// furthest from every other tree (best-candidate sampling), so trees spread
// evenly instead of bunching or leaving bare ground.

const ORDER=['study','work','errands','social','exercise','rest','other'];
// Trees grow in two bands, inside the day's loop and outside it (timetable.js RADIUS), with a clear lane where
// the path runs. Scene units, even over area.
const BAND_IN=[4.5,LOOP-3.2], BAND_OUT=[LOOP+3.2,30], AREA=([a,b])=>b*b-a*a;
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
const ROOT_SECONDS=2.6, DRIFT_SECONDS=3, GROW_SECONDS=.9, GROW_GAP=.12;   // grow-in: each tree, then the next a beat later
const easeOutBack=k=>1+2.70158*(k-1)**3+1.70158*(k-1)**2;
const STATUS={done:'done',now:'happening now',planned:'planned',skipped:'let go',waiting:'did it happen?'};
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
  if(vis==='open')return {key,color:c.color,cat:b.cat,kicker,title:b.title,sub:`${c.label} · ${hours(b.mins)} · ${st}`};
  return {key,color:c.color,cat:b.cat,kicker,title:c.label,sub:`${tier(b.mins).label} tree · ${st}`};
}

// Equal time should look equally big, and a tree is judged by the area of its
// coloured parts (canopy, caps; the pale tree's whole wood), not its height.
// These even that area out across species as the walk camera sees it; they are
// the "scale-to-median" column of tools/measure_canopy.py. Re-run it after
// changing a species model or SPECIES_SCALE.
const CANOPY_MATCH={sakura:.87,magic_mushrooms:.96,willow:.98,oak:1,purple:1.04,palm:1.05,pale:1.27};

export function createForest({assets,islandSurface,speciesScale,thirsty,onRoot}){
  const islands=[], byBlock=new Map(), animating=new Set(), growing=new Set(), heights={};
  const heightOf=k=>heights[k]??=new T.Box3().setFromObject(assets[k]).getSize(new T.Vector3()).y;
  const scaleFor=(island,cat,mins)=>(speciesScale[SPECIES[cat]]??1)*(CANOPY_MATCH[SPECIES[cat]]??1)*tier(mins).scale*(.92+island.rnd()*.16);

  // One wedge per category, widths weighted by tree count (+2 so a small
  // category still gets room). Wedges are laid out in "free angle" u, which
  // runs round the island from just past the bridge landing and skips the
  // gaps; island.angleAt(u) turns it back into a real angle.
  function layout(island,items){
    const count={};
    for(const it of items)count[it.cat]=(count[it.cat]??0)+1;
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
    // a kind the island had no trees of when it was planted has no wedge: anywhere will do
    const t=anywhere||!island.territories[cat]?{u0:0,u1:island.span}:island.territories[cat], s=island.scale, own=.85*sc/s;
    const arch={x:GATE.x*s,z:GATE.z*s};   // the torii and its path legs
    const foot={x:-9.3*s,z:-8.6*s};   // where the pier meets the shore (main.js buildPier)
    const m=Math.min(.12,(t.u1-t.u0)*.15);
    let best=null;
    for(let k=0;k<60;k++){
      const a=island.angleAt(t.u0+m+island.rnd()*(t.u1-t.u0-2*m));
      const band=island.rnd()*(AREA(BAND_IN)+AREA(BAND_OUT))<AREA(BAND_IN)?BAND_IN:BAND_OUT;
      const r=Math.sqrt(band[0]**2+island.rnd()*AREA(band));   // even over area, across both bands
      const x=Math.cos(a)*r, z=Math.sin(a)*r;
      if(Math.hypot(x-arch.x,z-arch.z)<6||Math.hypot(x-foot.x,z-foot.z)<5)continue;
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
    solid.traverse(o=>{o.userData.islandId=island.id;});   // the sky-view click-to-visit raycast relies on this
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
    if(state==='solid'&&prev==='ghost'&&thirsty?.(t)){t.anim='thirsty';animating.delete(t);show(false,true);return;}
    if(state==='solid'&&prev==='ghost'){t.anim='root';t.mat.depthWrite=true;show(false,true);onRoot?.(t);}
    else if(state==='gone'){t.anim='drift';show(false,true);}
    else {t.anim=null;show(state==='solid',false);return;}
    animating.add(t);
  }

  function sync(getSchedule){
    for(const island of islands){
      if(island.past)continue;   // showing a past week; today's trees are put away
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

  // Long activities first, so the big trees claim room before the small ones.
  function grove(island,items,seed){
    island.rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    island.trees=[];layout(island,items);
    for(const it of [...items].sort((a,b)=>b.mins-a.mins))addTree(island,it);
  }
  const visibleNow=t=>{t.solid.visible=t.state==='solid';if(t.ghost)t.ghost.visible=t.state==='ghost'||!!t.anim;};

  let tick=0;
  return {
    plant(island){
      islands.push(island);
      // today's ghosts interleave with the week's solid trees
      grove(island,[...(HISTORY[island.id]??[]).map(e=>({cat:e.cat,mins:e.mins,entry:e})),
                    ...(SCHEDULES[island.id]??[]).map(b=>({cat:b.cat,mins:b.mins,block:b}))],island.id.length*7919+13);
    },
    // The week grows in, Monday's trees first and today's last: shown once a
    // calendar has just been connected. Returns how many trees are growing.
    grow(id){
      const island=islands.find(i=>i.id===id);if(!island)return 0;
      const list=island.trees.filter(t=>t.state!=='gone').sort((a,b)=>(b.entry?.day??-1)-(a.entry?.day??-1));
      list.forEach((t,n)=>{t.grow=-n*GROW_GAP;growing.add(t);for(const o of [t.solid,t.ghost])o?.scale.setScalar(.001);});
      return list.length;
    },
    // A past week on island `id` (life.js "Past islands"): this week's trees are
    // put away and that week's grow in their place, until present(id).
    // entries: [{id, day, cat, mins, title, vis}], as groves.js HISTORY.
    past(id,entries,seed){
      const island=islands.find(i=>i.id===id);if(!island)return;
      if(island.past)for(const t of island.trees){island.group.remove(t.solid);growing.delete(t);}
      else{
        island.past={trees:island.trees,rnd:island.rnd,territories:island.territories,obstacles:island.obstacles};
        for(const t of island.trees){t.solid.visible=false;if(t.ghost)t.ghost.visible=false;}
      }
      const own=new Set(island.past.trees.map(t=>t.obstacle));
      island.obstacles=island.past.obstacles.filter(o=>!own.has(o));
      grove(island,entries.map(e=>({cat:e.cat,mins:e.mins,entry:e})),seed);
    },
    present(id){
      const island=islands.find(i=>i.id===id);if(!island?.past)return;
      for(const t of island.trees){island.group.remove(t.solid);growing.delete(t);}
      Object.assign(island,{trees:island.past.trees,rnd:island.past.rnd,territories:island.past.territories,obstacles:island.past.obstacles});
      island.past=null;
      for(const t of island.trees)visibleNow(t);
    },
    update(dt,elapsed,motion,getSchedule){
      if((tick-=dt)<=0){tick=.25;sync(getSchedule);}
      for(const t of growing){
        t.grow+=motion?dt:GROW_SECONDS;
        const k=Math.min(1,Math.max(0,t.grow/GROW_SECONDS)), sc=t.sc*Math.max(.001,easeOutBack(k));
        for(const o of [t.solid,t.ghost])o?.scale.setScalar(sc);
        if(k>=1)growing.delete(t);
      }
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
    // a thirsty tree (see the top) takes root: the gardener's water has reached it
    water(t){if(t.anim!=='thirsty')return;t.anim='root';t.k=0;t.mat.depthWrite=true;animating.add(t);onRoot?.(t);},
    // where a tree stands, in world units: its foot, the trunk's reach and its height
    base(t){const p=t.solid.getWorldPosition(new T.Vector3());return {x:p.x,y:p.y,z:p.z,r:.85*t.sc,h:heightOf(t.key)*t.sc};},
    // the tree nearest `pos` on island `id`, as a reveal card for life.js
    near(id,pos){
      const island=islands.find(i=>i.id===id);let best=null;
      for(const t of island?.trees??[]){
        if(t.state==='gone')continue;
        const d=Math.hypot(pos.x-island.x-t.x,pos.z-island.z-t.z);
        if(d<t.reach&&(!best||d<best.d))best={t,d};
      }
      if(!best)return null;
      const t=best.t, at=t.solid.getWorldPosition(new T.Vector3());at.y+=heightOf(t.key)*t.sc*.7;   // the card floats by the crown
      return {...(t.block?blockCard(t.block,id===ME):treeCard(t.entry,id===ME)),at};
    },
  };
}
