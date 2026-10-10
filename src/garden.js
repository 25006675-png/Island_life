import * as T from 'three';
import { GATE } from './gate.js';
import { mergeStatic } from './merge.js';

// What dewdrops buy (shop.js ITEMS), built by hand like the windmill. Most
// stand round the windmill in the clearing at the hub of the day's path, where
// no tree grows (forest.js BAND_IN); the stone lanterns stand just inside the
// torii, in the clearing kept round it. Each item merges down to a draw call
// or two, and every member island can show the same ones, since friends see
// your island when they visit. Places in model units, sizes in world metres.
const IN={x:.743,z:.669}, SIDE={x:-.669,z:.743};   // into the island from the torii, and across it
const at=(o,i,s)=>[o.x+IN.x*i+SIDE.x*s,o.z+IN.z*i+SIDE.z*s];
const HUB={x:0,z:0};
const FACE_GATE=Math.atan2(-IN.x,-IN.z);           // a front (+z) turned toward the torii
const SPOTS={
  flowers:at(HUB,0,0),
  bench:at(HUB,-1.1,1.5),        // the other side from the gardener's sign, looking toward the torii
  well:at(HUB,1,-1.6),
  lanterns:at(GATE,1.3,0),
  kite:at(HUB,0,0),
};

const mat=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.9,...o});
const M={
  wood:mat('#a47a55'), dark:mat('#7d5a3e'), roof:mat('#c9876a'), stone:mat('#c2bbb0'), stoneDark:mat('#9d968c'),
  wellStone:mat('#c2bbb0',{side:T.DoubleSide}),
  stem:mat('#6f9a52'), bloom:mat('#ffffff'), water:mat('#7fb7d6',{roughness:.25,metalness:.1}),
  // the lantern's paper window: dark by day, glowing from dusk (update below)
  glow:mat('#f6e7c8',{emissive:new T.Color('#ffb45c'),emissiveIntensity:0}),
  // seen from below against the sky, so it carries a little light of its own
  kite:new T.MeshStandardMaterial({vertexColors:true,roughness:.8,side:T.DoubleSide,emissive:new T.Color('#6a4a4a'),emissiveIntensity:.8}),
  string:new T.LineBasicMaterial({color:'#f4efe6',transparent:true,opacity:.75}),
};
const box=(w,h,d,m,x=0,y=0,z=0)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o;};
const cyl=(rt,rb,h,m,x=0,y=0,z=0,seg=10)=>{const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg),m);o.position.set(x,y,z);return o;};

// A ring of flowers round the windmill's foot, leaving its door clear.
function flowers(rnd){
  const g=new T.Group(), n=38, d=new T.Object3D(), c=new T.Color();
  const stems=new T.InstancedMesh(new T.CylinderGeometry(.018,.022,.3,4),M.stem,n);
  const blooms=new T.InstancedMesh(new T.IcosahedronGeometry(.09,0),M.bloom,n);
  const COLORS=['#f4b6c2','#fbe38e','#c8b6f2','#fff3e4','#f7a98b'];
  for(let i=0;i<n;i++){
    let a;do a=rnd()*Math.PI*2;while(Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<.5);   // not in front of the door
    const r=1.15+rnd()*.4, h=.22+rnd()*.14, x=Math.sin(a)*r, z=Math.cos(a)*r;
    d.position.set(x,h/2,z);d.scale.set(1,h/.3,1);d.rotation.set(0,0,0);d.updateMatrix();stems.setMatrixAt(i,d.matrix);
    d.position.set(x,h+.04,z);d.scale.setScalar(.8+rnd()*.5);d.rotation.set(rnd(),rnd(),rnd());d.updateMatrix();blooms.setMatrixAt(i,d.matrix);
    blooms.setColorAt(i,c.set(COLORS[Math.floor(rnd()*COLORS.length)]));
  }
  g.add(stems,blooms);return g;
}

function bench(){
  const g=new T.Group();
  for(const z of [-.12,0,.12])g.add(box(1.6,.06,.11,M.wood,0,.46,z));
  for(const y of [.68,.86]){const p=box(1.6,.11,.05,M.wood,0,y,-.2);p.rotation.x=-.12;g.add(p);}
  for(const x of [-.68,.68]){
    g.add(box(.08,.46,.08,M.dark,x,.23,.13),box(.08,.92,.08,M.dark,x,.46,-.17),box(.08,.05,.42,M.dark,x,.66,-.01));
  }
  return g;
}

function well(){
  const g=new T.Group();
  const ring=new T.Mesh(new T.CylinderGeometry(.6,.66,.72,16,1,true),M.wellStone);ring.position.y=.36;
  const rim=new T.Mesh(new T.TorusGeometry(.62,.07,6,18),M.stoneDark);rim.rotation.x=Math.PI/2;rim.position.y=.72;
  const water=new T.Mesh(new T.CircleGeometry(.56,16),M.water);water.rotation.x=-Math.PI/2;water.position.y=.42;
  g.add(ring,rim,water);
  for(const x of [-.62,.62])g.add(box(.09,1.5,.09,M.dark,x,1.1,0));
  g.add(cyl(.04,.04,1.36,M.wood,0,1.62,0,6).rotateZ(Math.PI/2));
  const roof=new T.Mesh(new T.ConeGeometry(1.05,.62,4),M.roof);roof.rotation.y=Math.PI/4;roof.scale.z=.7;roof.position.y=2.1;
  g.add(roof,cyl(.012,.012,.6,M.wood,.1,1.3,0,4),cyl(.13,.11,.18,M.dark,.1,.92,0));   // the rope and its bucket
  return g;
}

// A pair of stone lanterns (tōrō) either side of the way in, lit at dusk.
function lanterns(){
  const g=new T.Group();
  for(const s of [-1.7,1.7]){
    const l=new T.Group();l.position.x=s;
    l.add(box(.46,.12,.46,M.stoneDark,0,.06,0),cyl(.09,.12,.62,M.stone,0,.43,0,8),box(.4,.08,.4,M.stone,0,.78,0),
          box(.3,.28,.3,M.glow,0,.96,0));
    const roof=new T.Mesh(new T.ConeGeometry(.42,.26,4),M.stone);roof.rotation.y=Math.PI/4;roof.position.y=1.23;
    l.add(roof,new T.Mesh(new T.SphereGeometry(.07,8,6),M.stone).translateY(1.4));
    g.add(l);
  }
  return g;
}

// A kite on a long string from the windmill's cap, high enough to be seen from
// the sky, so friends spot it from afar.
function kite(){
  const g=new T.Group(), flier=new T.Group();
  const geo=new T.BufferGeometry();
  const P=[[0,1.3],[-.9,0],[0,-1.7],[.9,0]], C=['#ff8f9c','#ffd87a'];
  const pos=[], col=[], c=new T.Color();
  for(let k=0;k<4;k++){
    const a=P[k], b=P[(k+1)%4];
    pos.push(0,0,0,a[0],a[1],0,b[0],b[1],0);
    c.set(C[k%2]);for(let v=0;v<3;v++)col.push(c.r,c.g,c.b);
  }
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.computeVertexNormals();
  flier.add(new T.Mesh(geo,M.kite));
  const tail=[];
  for(let k=1;k<=5;k++){const bow=box(.28,.12,.02,M.roof,0,-1.7-k*.42,0);flier.add(bow);tail.push(bow);}
  const N=14, line=new T.Line(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(new Float32Array(N*3),3)),M.string);
  line.frustumCulled=false;
  g.add(flier,line);
  const anchor=new T.Vector3(0,3.9,0), wind=new T.Vector3(IN.x,0,IN.z), p=new T.Vector3();
  g.userData.update=(t,motion)=>{
    const sway=motion?t:0;
    flier.position.copy(anchor).addScaledVector(wind,7+Math.sin(sway*.37)*.8).add(p.set(Math.sin(sway*.53)*1.6,10+Math.sin(sway*.71)*.7,0));
    flier.lookAt(anchor.x,flier.position.y-2,anchor.z);flier.rotateZ(Math.sin(sway*.9)*.18);
    tail.forEach((b,k)=>{b.position.x=Math.sin(sway*2.2-k*.8)*.12*(k+1);b.rotation.z=Math.sin(sway*2-k)*.5;});
    const a=line.geometry.attributes.position;
    for(let i=0;i<N;i++){const u=i/(N-1);p.lerpVectors(anchor,flier.position,u);p.y-=Math.sin(u*Math.PI)*1.2;a.setXYZ(i,p.x,p.y,p.z);}
    a.needsUpdate=true;
  };
  g.userData.keep=[flier,line];
  return g;
}

const BUILD={flowers,bench,well,lanterns,kite};
const FACE={flowers:-2.35,bench:FACE_GATE,lanterns:FACE_GATE,well:FACE_GATE+.6};   // flowers turn with the windmill (life.js), so its door stays clear
const R={bench:.5,well:.45};     // obstacles kept clear of trees (forest.js spot), model units
// its own seed per item, so placing one never shifts the forest's own random layout (island.rnd)
const seeded=seed=>()=>{seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};   // mulberry32

export function createGarden(island){
  const have=new Map(), s=island.scale;
  return {
    has:id=>have.has(id),
    items:()=>[...have.keys()],
    // fresh: just bought, so it grows in instead of simply being there
    add(id,{fresh=false}={}){
      if(have.has(id)||!BUILD[id])return;
      const [mx,mz]=SPOTS[id], g=BUILD[id](seeded([...island.id+id].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)));
      g.position.set(mx*s,(island.field.height(mx,mz)??.35)*s,mz*s);g.rotation.y=FACE[id]??0;
      g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      island.group.add(g);mergeStatic(g,{keep:g.userData.keep});
      if(R[id])island.obstacles.push({x:mx,z:mz,r:R[id]});
      have.set(id,{group:g,born:fresh?-1:null});   // born: when it started growing in; null once grown
    },
    update(t,motion){
      for(const item of have.values()){
        if(item.born===-1)item.born=t;
        if(item.born!==null){
          const k=Math.min(1,(t-item.born)/.9);
          item.group.scale.setScalar(Math.max(.001,1+2.2*(k-1)**3+1.2*(k-1)**2));   // grows in with a little overshoot
          if(k===1)item.born=null;
        }
        item.group.userData.update?.(t,motion);
      }
    },
  };
}

// Lantern glow follows the day: off in daylight, warm from dusk to dawn (minutes since midnight).
export function setGardenDusk(minutes){
  const k=minutes>=17*60?Math.min(1,(minutes-17*60)/60):minutes<6*60+30?1:minutes<7*60+30?1-(minutes-(6*60+30))/60:0;
  M.glow.emissiveIntensity=k*2.2;
}
