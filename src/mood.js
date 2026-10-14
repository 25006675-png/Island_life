import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOODS } from './data.js';

// Feelings = blooms. Every check-in of the last seven days opens a small flower in its feeling's colour, in a bed
// round the spot just inside the gate (main.js flowerSpot): on your island your talking flower stands in the middle
// of it (flowermodel.js), and a friend's bed shows how their week has felt when you visit. Today's blooms are a
// little bigger; a new one grows in. The weather still comes from the same check-ins (life.js).
// Each island's bed is three instanced draws (stems, petals, centres), however many blooms it holds.
const MAX=14;                       // the newest fourteen, a week of two a day
const SIZE=1.8;                     // a bloom about a metre tall, readable beside the talking flower
const UP=new T.Vector3(0,1,0);
function petalsGeo(){               // five round petals round a point, facing up, about 0.5 across
  const parts=[];
  for(let k=0;k<5;k++){
    const g=new T.SphereGeometry(.13,10,6);g.scale(1,.32,.62);
    const a=k/5*Math.PI*2;g.translate(Math.cos(a)*.13,0,Math.sin(a)*.13);g.rotateY(-a);parts.push(g);
  }
  return mergeGeometries(parts);
}
const STEM=new T.CylinderGeometry(.022,.028,1,6).translate(0,.5,0), PETALS=petalsGeo(), CENTRE=new T.SphereGeometry(.07,10,8).scale(1,.6,1);
const stemMat=new T.MeshStandardMaterial({color:'#6f9e43',roughness:.8});
const petalMat=new T.MeshStandardMaterial({color:'#ffffff',roughness:.7});
const centreMat=new T.MeshStandardMaterial({color:'#ffd23c',roughness:.6,emissive:'#5a4300',emissiveIntensity:.25});
const easeOutBack=k=>1+2.70158*(k-1)**3+1.70158*(k-1)**2;

export function createMood(){
  const beds=new Map(), m=new T.Matrix4(), q=new T.Quaternion(), s=new T.Vector3(), p=new T.Vector3(), c=new T.Color(), v=new T.Vector3();
  // where bloom n stands, island-local: a loose spiral round the bed's middle, clear of the talking flower's leaves
  function spot(bed,n){
    const a=n*2.399+.6, r=1.5+.16*n;
    for(let t=0;t<6;t++){
      const x=bed.at.x+Math.cos(a+t*.5)*r, z=bed.at.z+Math.sin(a+t*.5)*r, h=bed.island.field.height(x/bed.island.scale,z/bed.island.scale);
      if(h!==null)return new T.Vector3(x,h*bed.island.scale,z);
    }
    return bed.at.clone();
  }
  function layout(bed){
    const list=bed.items.slice(-MAX);
    bed.stems.count=bed.heads.count=bed.centres.count=list.length;
    list.forEach((it,n)=>{
      it.n=n;it.home??=spot(bed,n);
      const grow=Math.max(.001,it.age<1.4?easeOutBack(Math.min(1,it.age/1.4)):1), big=SIZE*(it.entry.day===0?1.25:1)*grow;
      const h=(.42+(n%3)*.06)*big;
      m.compose(it.home,q.identity(),s.set(big,h,big));bed.stems.setMatrixAt(n,m);
      p.copy(it.home).y+=h;q.setFromAxisAngle(UP,n*1.3);
      m.compose(p,q,s.setScalar(big));bed.heads.setMatrixAt(n,m);
      p.y+=.03*big;m.compose(p,q,s.setScalar(big));bed.centres.setMatrixAt(n,m);
      bed.heads.setColorAt(n,c.set(MOODS[it.entry.mood].color));
    });
    for(const im of [bed.stems,bed.heads,bed.centres]){im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();}
    if(bed.heads.instanceColor)bed.heads.instanceColor.needsUpdate=true;
  }
  function bloom(bed,entry,grow){
    const it={entry,island:bed.island,age:grow?0:99};bed.items.push(it);
    if(bed.items.length>MAX){bed.items.shift();for(const x of bed.items)x.home=null;}   // the oldest goes; the rest re-settle
    layout(bed);return it;
  }
  const visible=bed=>bed.group.visible;
  return {
    // at: the bed's middle, island-local (main.js flowerSpot), or null to keep it just inside the gate
    addIsland(island,checkins,at){
      const group=new T.Group();island.group.add(group);
      const make=(geo,mat)=>{const im=new T.InstancedMesh(geo,mat,MAX);im.count=0;im.castShadow=true;im.receiveShadow=true;group.add(im);return im;};
      const bed={island,group,at:at??new T.Vector3(-4*island.scale,(island.field.height(-4,-4)??.35)*island.scale,-4*island.scale),items:[],
                 stems:make(STEM,stemMat),heads:make(PETALS,petalMat),centres:make(CENTRE,centreMat)};
      bed.heads.userData.moodBed=bed;
      beds.set(island.id,bed);
      for(const e of checkins.filter(e=>e.day<=6).sort((a,b)=>b.day-a.day||(a.time??0)-(b.time??0)))bloom(bed,e,false);
    },
    // a new check-in: its bloom grows in (`from` is no longer used: blooms grow where they stand)
    checkIn(island,entry){const bed=beds.get(island.id);return bed?bloom(bed,entry,true):null;},
    show(id,on){const bed=beds.get(id);if(bed)bed.group.visible=on;},   // hidden while the island shows a past week
    update(t,dt){
      for(const bed of beds.values()){
        let moving=false;for(const it of bed.items)if(it.age<1.5){it.age+=dt;moving=true;}
        if(moving)layout(bed);
      }
    },
    // the bloom within reach of a world point on this island, if any (life.js shows its card): {entry, island, at}
    near(id,pt,reach=2){
      const bed=beds.get(id);if(!bed||!visible(bed))return null;let best=null,bd=reach;
      for(const it of bed.items){if(!it.home)continue;const d=v.copy(it.home).add(bed.island.group.position).setY(pt.y).distanceTo(pt);if(d<bd){bd=d;best=it;}}
      return best&&{...best,at:best.home.clone().add(bed.island.group.position)};
    },
    pick(raycaster){
      for(const bed of beds.values()){
        if(!visible(bed))continue;
        const hit=raycaster.intersectObject(bed.heads,false)[0];
        if(hit){const it=bed.items.slice(-MAX)[hit.instanceId];if(it)return {...it,at:it.home.clone().add(bed.island.group.position)};}
      }
      return null;
    },
  };
}
