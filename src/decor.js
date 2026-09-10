import * as T from 'three';

// Small hand-made props. The notice board on the gathering island carries
// shared news only (never anyone's plan). The windmill is the one island
// decoration dewdrops have grown so far.
const place=(island,[mx,mz])=>{
  const s=island.scale;
  return new T.Vector3(mx*s,(island.field.height(mx,mz)??.35)*s,mz*s);
};

export function createNoticeBoard(island,{at,face}){
  const g=new T.Group();g.position.copy(place(island,at));g.rotation.y=face;island.group.add(g);
  const wood=new T.MeshStandardMaterial({color:'#9b7350',roughness:.9});
  for(const px of [-1.25,1.25]){const post=new T.Mesh(new T.CylinderGeometry(.1,.13,2.7,8),wood);post.position.set(px,1.35,0);g.add(post);}
  const back=new T.Mesh(new T.BoxGeometry(2.8,1.85,.12),wood);back.position.y=1.9;
  const roof=new T.Mesh(new T.BoxGeometry(3.2,.14,.55),new T.MeshStandardMaterial({color:'#7d5a3e',roughness:.9}));roof.position.y=2.95;roof.rotation.x=.18;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=340;
  const ctx=canvas.getContext('2d'), tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const paper=new T.Mesh(new T.PlaneGeometry(2.6,1.72),new T.MeshBasicMaterial({map:tex}));paper.position.set(0,1.9,.065);
  g.add(back,roof,paper);
  island.obstacles.push({x:at[0],z:at[1],r:1.5/island.scale});
  return {
    write([title,...lines]){
      ctx.fillStyle='#f6ecd9';ctx.fillRect(0,0,512,340);
      ctx.fillStyle='#4a3b5a';ctx.font='34px Georgia, serif';ctx.fillText(title,34,62);
      ctx.font='23px "Segoe UI", sans-serif';
      lines.forEach((l,i)=>{
        ctx.fillStyle=['#e0a33a','#8ec3a8','#e39bb6'][i%3];ctx.beginPath();ctx.arc(42,112+i*66,7,0,7);ctx.fill();
        ctx.fillStyle='#4a3b5a';ctx.fillText(l,62,120+i*66);
      });
      tex.needsUpdate=true;
    },
  };
}

export function createWindmill(island,{at=[0,0],face=0}={}){
  const g=new T.Group();g.position.copy(place(island,at));g.rotation.y=face;island.group.add(g);
  const mat=(color,side=T.FrontSide)=>new T.MeshStandardMaterial({color,roughness:.92,side});
  const tower=new T.Mesh(new T.CylinderGeometry(.55,.85,3.2,10),mat('#f1e6d6'));tower.position.y=1.6;
  const roof=new T.Mesh(new T.ConeGeometry(.82,1.1,10),mat('#c9876a'));roof.position.y=3.75;
  const door=new T.Mesh(new T.BoxGeometry(.42,.72,.1),mat('#a47a55'));door.position.set(0,.36,.8);
  const hub=new T.Group();hub.position.set(0,3.1,.78);
  const beam=mat('#a47a55'), sail=mat('#fbf6ee',T.DoubleSide);
  for(let k=0;k<4;k++){
    const arm=new T.Group();arm.rotation.z=k*Math.PI/2;
    const b=new T.Mesh(new T.BoxGeometry(.08,1.9,.06),beam);b.position.y=.95;
    const c=new T.Mesh(new T.PlaneGeometry(.42,1.45),sail);c.position.set(.25,1.05,0);
    arm.add(b,c);hub.add(arm);
  }
  g.add(tower,roof,door,hub);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  island.obstacles.push({x:at[0],z:at[1],r:1.1/island.scale});
  return {update(dt,motion){if(motion)hub.rotation.z-=dt*.6;}};
}
