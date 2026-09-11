import * as T from 'three';

// Small hand-made props, all written on wood. The board on the gathering
// island carries the group's shared goals (never anyone's plan). The windmill
// is the one island decoration dewdrops have grown so far.
const place=(island,[mx,mz])=>{
  const s=island.scale;
  return new T.Vector3(mx*s,(island.field.height(mx,mz)??.35)*s,mz*s);
};
const NOTE_FONT='italic 30px "Segoe Print","Bradley Hand",Georgia,serif';
const INK='#3b2a1c';
function woodGrain(x,w,h){
  const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#c9a074');g.addColorStop(1,'#ad8157');x.fillStyle=g;x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(70,40,15,.14)';x.lineWidth=2;
  for(let y=-40;y<h+40;y+=17){x.beginPath();x.moveTo(0,y);x.bezierCurveTo(w/3,y+9,w*2/3,y-9,w,y+5);x.stroke();}
}

// Shared goals, written on a wide wooden board: title, then one row per goal
// with its dewdrop reward on the right. Done rows get a tick and fade a little.
export function createGoalsBoard(island,{at,face}){
  const g=new T.Group();g.position.copy(place(island,at));g.rotation.y=face;island.group.add(g);
  const wood=new T.MeshStandardMaterial({color:'#9b7350',roughness:.9});
  for(const px of [-1.55,1.55]){const post=new T.Mesh(new T.CylinderGeometry(.1,.13,3.1,8),wood);post.position.set(px,1.55,0);g.add(post);}
  const back=new T.Mesh(new T.BoxGeometry(3.4,2.25,.12),wood);back.position.y=2.1;
  const roof=new T.Mesh(new T.BoxGeometry(3.8,.14,.55),new T.MeshStandardMaterial({color:'#7d5a3e',roughness:.9}));roof.position.y=3.35;roof.rotation.x=.18;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;
  const ctx=canvas.getContext('2d'), tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const face_=new T.Mesh(new T.PlaneGeometry(3.2,2.1),new T.MeshBasicMaterial({map:tex}));face_.position.set(0,2.1,.065);
  g.add(back,roof,face_);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  island.obstacles.push({x:at[0],z:at[1],r:1.8/island.scale});
  return {
    group:g,
    write(title,rows){
      woodGrain(ctx,640,420);
      ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=INK;
      ctx.font='34px Georgia,serif';ctx.fillText(title,34,30);
      rows.slice(0,4).forEach((r,i)=>{
        const y=104+i*74;ctx.globalAlpha=r.done?.6:1;
        ctx.textAlign='left';ctx.font='italic 24px "Segoe Print","Bradley Hand",Georgia,serif';
        let s=`${r.done?'✓ ':''}${r.text}`;   // long titles trim to leave room for the reward
        if(ctx.measureText(s).width>470){while(s.length>4&&ctx.measureText(s+'…').width>470)s=s.slice(0,-1);s+='…';}
        ctx.fillText(s,34,y);
        ctx.textAlign='right';ctx.font='bold 26px "Segoe UI",sans-serif';ctx.fillStyle='#2a5f7a';
        ctx.fillText(`${r.reward} 💧`,606,y+2);ctx.fillStyle=INK;
      });
      ctx.globalAlpha=1;tex.needsUpdate=true;
    },
  };
}

// Notes are small wooden plaques, the words written straight onto the wood.
// One stands at a member's gate while notes are waiting there.
const woodMat=new T.MeshStandardMaterial({color:'#a97d55',roughness:.95});
const cordMat=new T.MeshStandardMaterial({color:'#6b4a33',roughness:1});
const boardGeo=new T.BoxGeometry(.98,.66,.06), cordGeo=new T.CylinderGeometry(.012,.012,1,4), stakeGeo=new T.CylinderGeometry(.045,.055,1,6);
function writeOnWood(head,body,foot){
  const c=document.createElement('canvas');c.width=512;c.height=340;const x=c.getContext('2d');
  woodGrain(x,512,340);
  x.fillStyle=INK;x.textBaseline='top';
  x.font='22px Georgia,serif';x.fillText(head,36,28);
  x.font=NOTE_FONT;
  const lines=[];let line='';
  for(const w of body.split(' ')){const t=line?`${line} ${w}`:w;if(x.measureText(t).width>440&&line){lines.push(line);line=w;}else line=t;}
  lines.push(line);
  lines.slice(0,4).forEach((l,i)=>x.fillText(l,36,78+i*46));
  x.font='italic 22px Georgia,serif';x.textAlign='right';x.fillText(foot,476,292);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
// A plaque hangs from a cord of length `drop`, or stands on a stake of length
// `post` driven into the ground below it.
function createPlaque({head,body,foot,drop=.4,post=0}){
  const g=new T.Group();
  const board=new T.Mesh(boardGeo,woodMat);board.castShadow=true;
  const face=new T.Mesh(new T.PlaneGeometry(.92,.6),new T.MeshBasicMaterial({map:writeOnWood(head,body,foot)}));face.position.z=.032;
  const hold=post?new T.Mesh(stakeGeo,woodMat):new T.Mesh(cordGeo,cordMat);
  if(post){hold.scale.y=post;hold.position.y=-.33-post/2+.05;}else{hold.scale.y=drop;hold.position.y=.33+drop/2;}
  g.add(board,face,hold);return g;
}
const unhang=(parent,g)=>{parent.remove(g);g.children[1].material.map.dispose();g.children[1].material.dispose();};

// A small signpost just inside a torii, beside one pillar and facing the way
// you arrive, standing only while notes wait there. `at` is the spot in model
// units, `face` the way its text points; set({head,body,foot}) or set(null).
export function createGateSign(island,{at:[mx,mz],face}){
  const s=island.scale;let sign=null;
  return {
    set(text){
      if(sign){unhang(island.group,sign);sign=null;}
      if(!text)return;
      sign=createPlaque({...text,post:.95});
      sign.position.set(mx*s,(island.field.height(mx,mz)??.35)*s+.95+.33,mz*s);sign.rotation.y=face;
      island.group.add(sign);
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
