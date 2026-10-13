import * as T from 'three';

// The talking flower on your island (flower.js asks "How do you feel?"), drawn like a sticker come to life: a flat
// yellow face with dot eyes and a small smile, eight rounded salmon petals, a green centre at the back, a straight
// stem and two pointed leaves, every part ringed in a dark brown line. About 1.5 units tall, standing on its origin,
// facing +z.
//   userData.animate(t,dt)   sway; ease toward drooping or upright; bounce while talking
//   userData.setDroop(on)    sleepy and hanging her head until today's check-in
//   userData.setMood(hex)    the petals take today's mood colour (null: her own salmon pink)
//   userData.setTalking(on)  a little bounce while her question is open
//   userData.head            the face group (the point flower.js anchors the bubble to)
const PETAL='#f28b80', LINE='#4a3418';
function mat(hex,o={}){return new T.MeshPhysicalMaterial(Object.assign({color:hex,roughness:.75,sheen:.3,sheenRoughness:.9,sheenColor:new T.Color(hex).lerp(new T.Color('#ffffff'),.5)},o));}

// a flat part with round edges and an outline: a thin core of the shape whose whole edge is rounded off like a
// pillow (a bevel as deep as it is wide), and behind it the same shape rounded a line-width further in dark brown,
// turned inside out, so an even line shows all round it from any side
const LINE_W=.012;
function flat(shape,m,ink,{round=.03,core=.01}={}){
  const g=new T.Group(), puff=r=>new T.ExtrudeGeometry(shape,{depth:core,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:6,curveSegments:16});
  const body=new T.Mesh(puff(round),m);body.position.z=-core/2;body.castShadow=true;g.add(body);
  const line=new T.Mesh(puff(round+LINE_W),ink);line.position.z=-core/2;g.add(line);
  return g;
}
// the outlines below are drawn smaller than they look: the rounded edge adds its own width all round
function petalShape(){   // narrow at the face, a round lobe at the tip (along +y)
  const s=new T.Shape();s.moveTo(-.025,.12);
  s.quadraticCurveTo(-.095,.2,-.085,.31);s.absarc(0,.31,.085,Math.PI,0,true);s.quadraticCurveTo(.095,.2,.025,.12);s.closePath();return s;
}
function leafShape(){    // from the stem (0,0) out to a tip curving up (along +x)
  const s=new T.Shape();s.moveTo(.01,.005);
  s.bezierCurveTo(.065,.115,.21,.19,.41,.17);s.bezierCurveTo(.32,.04,.165,-.03,.01,.005);return s;
}

export function makeFlower(){
  const M={stem:mat('#7bab45',{roughness:.65}),leaf:mat('#78a83c',{roughness:.65}),face:mat('#ffd23c',{roughness:.6,sheen:.45,sheenColor:new T.Color('#fff0a0')}),
    petal:mat(PETAL,{roughness:.7}),centre:mat('#73a63c',{roughness:.65}),dot:mat('#3a2410',{roughness:.3,clearcoat:.5}),
    ink:new T.MeshBasicMaterial({color:LINE,side:T.DoubleSide}),line:new T.MeshBasicMaterial({color:LINE,side:T.BackSide}),hull:new T.MeshBasicMaterial({color:LINE,side:T.BackSide})};
  const ball=new T.SphereGeometry(1,28,20);
  const mesh=(parent,geo,m,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0])=>{const o=new T.Mesh(geo,m);o.position.set(...pos);o.scale.set(...scale);o.rotation.set(...rot);parent.add(o);return o;};
  const LW=.016;   // outline width on the round parts (an inverted hull this much bigger)
  const group=new T.Group();group.name='TalkingFlower';

  // the stem: straight, rounded at the foot, hinged halfway so she can hang her head
  const stem=(parent,h,y)=>{mesh(parent,new T.CylinderGeometry(.034,.036,h,12),M.stem,[0,y,0]).castShadow=true;mesh(parent,new T.CylinderGeometry(.034+LW,.036+LW,h,12),M.hull,[0,y,0]);};
  stem(group,.62,.31);
  mesh(group,ball,M.stem,[0,0,0],[.036,.036,.036]);mesh(group,ball,M.hull,[0,0,0],[.036+LW,.036+LW,.036+LW]);
  const bend=new T.Group();bend.position.set(0,.62,0);group.add(bend);
  stem(bend,.46,.23);
  mesh(bend,ball,M.stem,[0,0,0],[.036,.036,.036]);

  // two leaves on the lower stem, the left one bigger, each with a vein
  const leaves=[];
  for(const [side,y,size] of [[-1,.36,1.1],[1,.44,.95]]){
    const l=new T.Group();l.position.set(side*.02,y,0);l.rotation.set(0,side*-.35,0);l.scale.set(side*size,size,size);group.add(l);
    l.add(flat(leafShape(),M.leaf,M.line,{round:.022}));
    const vein=new T.QuadraticBezierCurve3(new T.Vector3(.05,.03,0),new T.Vector3(.19,.07,0),new T.Vector3(.33,.15,0));
    for(const z of [.026,-.026])mesh(l,new T.TubeGeometry(vein,12,.007,6),M.ink,[0,0,z]);
    leaves.push(l);
  }

  // the head: petals behind, the green centre at the back, the yellow face in front
  const head=new T.Group();head.position.set(0,.47,.02);bend.add(head);
  const bob=new T.Group();head.add(bob);
  const petals=[];
  for(let i=0;i<8;i++){
    const p=new T.Group();p.rotation.z=i/8*Math.PI*2+Math.PI/8;p.position.z=-.03-.008*(i%2);bob.add(p);   // alternate ones a hair behind, so the lines between them show
    const fold=new T.Group();p.add(fold);fold.add(flat(petalShape(),M.petal,M.line,{round:.03}));petals.push(fold);   // fold: each petal cups toward her face
  }
  mesh(bob,ball,M.centre,[0,0,-.1],[.09,.09,.04]);mesh(bob,ball,M.hull,[0,0,-.1],[.09+LW,.09+LW,.04+LW]);
  mesh(bob,ball,M.face,[0,0,.035],[.2,.2,.06]).castShadow=true;mesh(bob,ball,M.hull,[0,0,.035],[.2+LW,.2+LW,.06+LW]);
  const eyes=[];
  for(const s of [-1,1])eyes.push(mesh(bob,ball,M.dot,[s*.075,.035,.089],[.022,.027,.012]));
  mesh(bob,new T.TorusGeometry(.034,.008,8,18,Math.PI),M.dot,[0,-.035,.092],[1,1,1],[0,0,Math.PI]);   // a small smile

  let droop=0,droopTo=0,talking=false;
  const petalColor=new T.Color(PETAL), toColor=new T.Color(PETAL);
  group.userData={head,
    setDroop(on){droopTo=on?1:0;},
    setMood(hex){toColor.set(hex??PETAL);},
    setTalking(on){talking=on;},
    animate(t,dt){
      droop+=(droopTo-droop)*Math.min(1,dt*2.5);
      petalColor.lerp(toColor,Math.min(1,dt*3));M.petal.color.copy(petalColor);M.petal.sheenColor.copy(petalColor).lerp(new T.Color('#ffffff'),.5);
      const sway=Math.sin(t*1.3)*.06*(1-droop*.5);
      bend.rotation.set(droop*.5,0,sway);head.rotation.x=droop*.3;   // sleepy: the head hangs forward
      for(const p of petals)p.rotation.x=droop*.22;                    // and the petals fold in a little
      for(const e of eyes)e.scale.y=.027*(1-.75*droop);                // half-closed eyes
      const hop=talking?Math.abs(Math.sin(t*5))*.04:0;bob.position.y=hop;bob.scale.set(1+hop*.6,1-hop*.6,1);
      for(const l of leaves)l.rotation.z=Math.sin(t*1.1+l.position.y*4)*.05;
    }};
  return group;
}
