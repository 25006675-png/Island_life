import * as T from 'three';
import { MOODS } from './data.js';

// Emotion lanterns = feelings. Today's check-ins hang as coloured lanterns in
// the island's own sky; earlier days have settled higher up as stars.
export function createMood(texture){
  const skies=new Map(), lanterns=[], body=new T.CylinderGeometry(.3,.24,.62,10);

  function lantern(island,entry,from){
    const c=new T.Color(MOODS[entry.mood].color), sky=skies.get(island.id), n=sky.count++;
    const g=new T.Group();
    const mesh=new T.Mesh(body,new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:1.8,roughness:1}));
    const glow=new T.Sprite(new T.SpriteMaterial({map:texture,color:c,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.8}));
    glow.scale.setScalar(2.2);g.add(mesh,glow);
    const a=n*2.399+island.id.length, r=5+(n%3)*3.5;
    const home=new T.Vector3(Math.cos(a)*r,10+(n%4)*1.4,Math.sin(a)*r);
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
    update(t,dt,motion){
      for(const l of lanterns){
        l.age+=dt;const e=1-Math.pow(1-Math.min(1,l.age/5),3);
        l.g.position.lerpVectors(l.from,l.home,e);
        if(motion){l.g.position.y+=Math.sin(t*.9+l.phase)*.18;l.g.rotation.y=t*.3+l.phase;}
      }
    },
    pick(raycaster){
      return raycaster.intersectObjects(lanterns.map(l=>l.g.children[0]),false)[0]?.object.userData.moodLantern??null;
    },
  };
}
