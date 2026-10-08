import * as T from 'three';
import { MOODS } from './data.js';
import { TIPR } from './pier.js';

// Emotion lanterns = feelings. Today's check-ins hang as coloured lanterns along the island's pier (main.js
// buildPier), from its top rail between the posts, clear of the shore's bushes, where you can walk up to them and
// read each one (near); past the boardwalk's six they go round the round deck. Earlier days have settled high above as stars.
const HANG=.5, RAIL=.92;   // lantern centre and rail top, above the deck
export function createMood(texture){
  const skies=new Map(), lanterns=[], body=new T.CylinderGeometry(.27,.21,.56,10), cord=new T.MeshBasicMaterial({color:'#4a3322'});
  const cordGeo=new T.CylinderGeometry(.012,.012,RAIL-HANG-.2,4);
  // island-local: where lantern n hangs on this island's pier (or, with no pier, low over the gate side)
  function slot(island,n){
    const p=island.pier;
    if(!p){const a=n*2.399;return new T.Vector3(-10+Math.cos(a)*4,3,-10+Math.sin(a)*4);}
    if(n<6)return p.pierAt(3.5+(n>>1)*2.04).addScaledVector(p.along,(n%2?-1:1)*1.62).add(new T.Vector3(0,HANG,0));
    const a=(n-6)*.7+Math.atan2(p.along.z,p.along.x);return p.tip.clone().add(new T.Vector3(Math.cos(a)*(TIPR+.15),HANG,Math.sin(a)*(TIPR+.15)));
  }

  function lantern(island,entry,from){
    const c=new T.Color(MOODS[entry.mood].color), sky=skies.get(island.id), n=sky.count++;
    const g=new T.Group();
    const mesh=new T.Mesh(body,new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:1.8,roughness:1}));
    const glow=new T.Sprite(new T.SpriteMaterial({map:texture,color:c,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.8}));
    const string=new T.Mesh(cordGeo,cord);string.position.y=(RAIL-HANG)/2+.1;
    glow.scale.setScalar(1.8);g.add(mesh,glow,string);
    const home=slot(island,n);
    const item={g,home,from:(from??home).clone(),age:from?0:99,entry,island,phase:n*1.7};
    g.position.copy(item.from);sky.group.add(g);mesh.userData.moodLantern=item;lanterns.push(item);
    return item;
  }

  return {
    addIsland(island,checkins){
      const group=new T.Group();island.group.add(group);skies.set(island.id,{group,count:0});
      const past=checkins.filter(c=>c.day>0), pos=new Float32Array(past.length*3), col=new Float32Array(past.length*3);
      past.forEach((c,i)=>{
        const a=i*2.399+1.1, r=6+(i*3.7)%12;
        pos.set([Math.cos(a)*r,24+(i*1.9)%7,Math.sin(a)*r],i*3);
        const k=new T.Color(MOODS[c.mood].color);col.set([k.r,k.g,k.b],i*3);
      });
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('color',new T.BufferAttribute(col,3));
      group.add(new T.Points(geo,new T.PointsMaterial({size:1.7,map:texture,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending})));
      for(const c of checkins.filter(c=>c.day===0))lantern(island,c);
    },
    // `from` is island-local; the lantern rises from there to its place in the sky
    checkIn(island,entry,from){return lantern(island,entry,from);},
    show(id,on){const sky=skies.get(id);if(sky)sky.group.visible=on;},   // hidden while the island shows a past week
    update(t,dt,motion){
      for(const l of lanterns){
        l.age+=dt;const e=1-Math.pow(1-Math.min(1,l.age/5),3);
        l.g.position.lerpVectors(l.from,l.home,e);
        if(motion){l.g.rotation.z=Math.sin(t*.9+l.phase)*.06*e;l.g.rotation.y=Math.sin(t*.4+l.phase)*.3;}   // a little sway on its cord
      }
    },
    // the lantern within reach of a world point on this island, if any (life.js shows its card)
    near(id,p,reach=2){const v=new T.Vector3();let best=null,bd=reach;
      for(const l of lanterns){if(l.island.id!==id||l.age<5||!skies.get(id).group.visible)continue;const d=l.g.getWorldPosition(v).setY(p.y).distanceTo(p);if(d<bd){bd=d;best=l;}}
      return best;},
    pick(raycaster){
      return raycaster.intersectObjects(lanterns.filter(l=>skies.get(l.island.id).group.visible).map(l=>l.g.children[0]),false)[0]?.object.userData.moodLantern??null;
    },
  };
}
