// The leaf gardener, rebuilt in three.js from the same recipe as gardener_v3.blend.
// Blender coordinates (x, y, z; front = -y) map to three (x, z, -y), so the model faces +z.
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeStatic} from './merge.js';

const clamp01=x=>Math.min(1,Math.max(0,x));
const P=(x,y,z)=>new T.Vector3(x,z,-y);                       // Blender position -> three
const SC=(x,y,z)=>new T.Vector3(x,z,y);                       // Blender scale -> three
const ROT=(x,y,z)=>new T.Euler(x,z,-y);                       // Blender euler (xyz) -> three, approximately for small single-axis turns
function mat(hex,o={}){return new T.MeshPhysicalMaterial(Object.assign({color:hex,roughness:.72,clearcoat:0,sheen:.35,sheenRoughness:.9,sheenColor:new T.Color(hex).lerp(new T.Color('#ffffff'),.5)},o));}
// a thin ink line around a part: the same geometry, flipped and a little larger, in deep plum. It is what makes the painted look hold up at any size.
const INK=new T.MeshBasicMaterial({color:'#2a1f3d',side:T.BackSide});
function outline(mesh,k=1.035){return mesh;}                 // ink shells read as seams between parts; off

export function makeGardener(){
  const M={skin:mat('#ffe6d8',{roughness:.6,clearcoat:.05}),hair:mat('#f6c238',{roughness:.6,sheen:.5,sheenColor:new T.Color('#ffe9a0'),side:T.DoubleSide}),leaf:mat('#6fb14e',{roughness:.55,clearcoat:.12,sheen:.4,sheenColor:new T.Color('#c8f0a0'),side:T.DoubleSide}),leafDark:mat('#3f7a35',{roughness:.7,side:T.DoubleSide}),
    leaf2:mat('#86c660',{roughness:.5,clearcoat:.25,side:T.DoubleSide}),green:mat('#3f9447',{roughness:.6,clearcoat:.15,sheen:.4,sheenColor:new T.Color('#9fd3a0')}),shirt:mat('#fbf5ea',{roughness:.75,clearcoat:.08,sheen:.4}),
    boot:mat('#f3c21c',{roughness:.35,clearcoat:.5}),ink:mat('#151216',{roughness:.25,clearcoat:.6}),white:mat('#ffffff',{roughness:.2,clearcoat:.5}),blush:mat('#f29ba4',{roughness:.7}),
    can:mat('#348a40',{roughness:.3,clearcoat:.5}),gold:mat('#f2c14e',{roughness:.4,clearcoat:.3}),seam:mat('#2f6b32',{roughness:.8})};
  const sph=new T.SphereGeometry(1,56,36);
  const add=(parent,geo,m,pos,scale=[1,1,1],rot=null,ink=0)=>{const o=new T.Mesh(geo,m);o.position.copy(P(...pos));o.scale.copy(SC(...scale));if(rot)o.rotation.copy(rot);o.castShadow=true;o.receiveShadow=true;parent.add(o);if(ink)outline(o,ink);return o;};
  const cone=(r1,r2,h,seg=24)=>{const g=new T.CylinderGeometry(r2,r1,h,seg,1);return g;};   // three: top radius first
  const rbox=(w,d,h,bev)=>new RoundedBoxGeometry(w,h,d,6,Math.min(bev,Math.min(w,d,h)/2*.98));   // Blender (x,y,z) extents -> three (x, z, y)

  const root=new T.Group();
  const hips=new T.Group();hips.position.copy(P(0,0,.95));root.add(hips);
  const chest=new T.Group();chest.position.copy(P(0,0,.35));hips.add(chest);
  const head=new T.Group();head.position.copy(P(0,0,.46));head.scale.setScalar(1.12);chest.add(head);

  // ---- legs with hip pivots, so they can walk
  const legs=[];
  for(const s of[-1,1]){
    const piv=new T.Group();piv.position.copy(P(.23*s,0,-.3));hips.add(piv);legs.push(piv);
    const L=(x,y,z)=>[x-.23*s,y,z+.3];
    add(piv,cone(.13*1.4,.14*1.4,.5*.75,20),M.skin,L(.23*s,0,-.52));
    add(piv,cone(.2*1.12,.2*1.12,.08*.9),M.green,L(.23*s,0,-.4));
    add(piv,cone(.19*1.4,.17*1.4,.34*.95),M.boot,L(.23*s,0,-.68),[1,1,1],null,1.05);
    add(piv,cone(.2*1.45,.2*1.45,.07),M.boot,L(.23*s,0,-.54));
    add(piv,sph,M.boot,L(.23*s,-.15,-.78),[.27,.34,.15],null,1.06);
  }
  // ---- overalls
  add(hips,rbox(1.0,.82,.62,.4),M.green,[0,0,-.12],[1,1,1],null,1.03);
  add(hips,sph,M.seam,[0,-.41,-.34],[.02,.03,.1]);
  add(hips,rbox(.48,.08,.3,.16),M.green,[0,-.46,.2]);
  for(const s of[-1,1]){
    add(hips,rbox(.11,.05,.42,.03),M.green,[.17*s,-.42,.42],[1,1,1],new T.Euler(-.25,0,0));
    add(hips,sph,M.gold,[.17*s,-.52,.3],[.05,.02,.05]);
  }
  add(hips,rbox(.24,.04,.17,.06),M.green,[0,-.52,.06]);
  add(hips,cone(.012,.01,.1,8),M.leaf2,[0,-.56,.17]);
  for(const rz of[0,Math.PI]){const l=add(hips,leafGeo(),M.leaf2,[0,-.57,.22],[.06,.05,.08]);l.rotation.set(-1.22,rz,1.4);}   // small sprout on the pocket
  // ---- shirt, sleeves, arms with shoulder pivots
  add(chest,sph,M.shirt,[0,0,.12],[.5,.44,.42],null,1.035);
  add(chest,sph,M.shirt,[0,-.03,.43],[.3,.26,.09]);
  const arms=[];
  for(const s of[-1,1]){
    const sh=new T.Group();sh.position.copy(P(.52*s,-.04,.26));chest.add(sh);arms.push(sh);
    add(sh,sph,M.shirt,[0,0,-.1],[.21,.2,.25],null,1.06);
    add(sh,cone(.12*1.45,.13*1.45,.07,20),M.shirt,[0,0,-.3]);
    const hand=add(sh,sph,M.skin,[0,0,-.42],[.15,.14,.15],null,1.08);
    sh.userData.hand=hand;
  }
  // ---- head: skull with fuller cheeks
  {const g=sph.clone();const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const w=1+.1*Math.exp(-Math.pow((y+.25)/.45,2));p.setXYZ(i,x*w,y,z*(1+.04*Math.exp(-Math.pow((y+.25)/.45,2))));}g.computeVertexNormals();
   add(head,g,M.skin,[0,0,.5],[.63,.6,.6],null,1.028);}
  const eyes=[];
  for(const s of[-1,1]){
    const nx=.19*s/.62,nz=(.42-.5)/.6,ny=-Math.sqrt(Math.max(0,1-nx*nx-nz*nz));
    // each eye sits in its own pivot so it can blink (scale) and glance (slide) without touching the skull
    const ep=new T.Group();ep.position.copy(P(.19*s,ny*.62-.012,.42));head.add(ep);eyes.push(ep);
    add(ep,sph,M.ink,[0,0,0],[.08,.03,.105]);
    add(ep,sph,M.white,[.026*s,-.045,.04],[.022,.012,.022]);
    add(head,sph,M.blush,[.42*s,-.47,.3],[.1,.02,.07]);
  }
  // a small closed-mouth smile, so the face has somewhere to land below the eyes
  {const pts=[];for(let i=0;i<=12;i++){const a=-.5+i/12;const x=a*.13,y=.3-(1-Math.pow(a*2,2))*.02;pts.push(new T.Vector3(x,y,.6*Math.sqrt(Math.max(0,1-Math.pow(x/.63,2)-Math.pow((y-.5)/.6,2)))+.012));}
   const smile=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),16,.009,6),mat('#b8606a',{roughness:.8}));head.add(smile);}
  // ---- hair: bob, fringe halves, side locks (sphere shells with cut-outs, like the Blender meshes)
  add(head,shell(48,28,(x,y,z)=>z<-.55||(y<-.42&&z<.42&&Math.abs(x)<.78),(v)=>{if(v.z<-.3)v.z=-.3-(v.z+.3)*.3;},1.06),M.hair,[0,.02,.52],[.68,.66,.66],null,1.03);
  // the fringe: one smooth shell over the brow, its lower edge a soft wave rather than two cut halves
  add(head,shell(56,24,(x,y,z)=>y>.15||z<-.3,(v)=>{const w=Math.cos(v.x*4.2)*.035;v.z-=.07*Math.exp(-Math.pow((Math.abs(v.x)-.55)/.45,2))*(v.z<0?1:.2);v.z+=w*(v.z<0?1:.2);},1.05),M.hair,[0,-.33,.66],[.6,.42,.42]);
  for(const s of[-1,1])add(head,shell(32,18,()=>false,(v)=>{if(v.z<-.1)v.z=-.1+(v.z+.1)*.8;}),M.hair,[.6*s,-.18,.26],[.25,.33,.44]);
  // ---- the leaf hat
  for(const s of[-1,1]){
    add(head,hatLeaf(s),M.leaf,[0,0,0]);                                      // (no ink shell on an open surface: its winding flips side to side)
    const under=add(head,hatLeaf(s,.975),M.leafDark,[0,0,0]);under.castShadow=false;      // the shaded underside, seen where the leaf lifts off the hair
    // the vein: a thin tube laid along the leaf's centre line, just above the surface
    const pts=[];for(let i=0;i<=20;i++){const u=i/20,phi=-.12+u*1.7,droop=Math.max(0,u-.75)*.6,r=HAT_R+.05;pts.push(new T.Vector3(s*(r*Math.sin(phi)+droop*.2),HAT_Z+r*Math.cos(phi)-droop,0));}
    const vein=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,.014,6),M.leaf2);head.add(vein);
  }
  // the sprout: a short stem on the crown with three small leaves, like a seedling
  const sprout=new T.Group();sprout.position.copy(P(0,.02,1.3+(HAT_Z-.5)+(HAT_R-.8)));head.add(sprout);
  {const stem=new T.Mesh(cone(.032,.024,.26,10),M.leaf2);stem.position.y=.12;stem.castShadow=true;sprout.add(stem);
   for(const [rz,ry,sc] of[[1.0,0,1],[-1.0,0,1],[0,0,.75]]){const l=new T.Mesh(leafGeo(),M.leaf2);l.position.y=.25;l.scale.set(.13*sc,.19*sc,.1*sc);l.rotation.set(0,ry,rz);l.position.x+=Math.sin(rz)*.08;l.castShadow=true;sprout.add(l);}}
  // ---- watering can, in the left hand (character's right)
  const can=new T.Group();arms[0].userData.hand.add(can);
  can.position.set(-.9,-.9,.35);can.scale.set(1.75/.15,1.75/.15,1.75/.14);can.rotation.y=-.25;
  {const body=new T.Mesh(cone(.17,.15,.3,32),M.can);body.castShadow=true;can.add(body);
   add(can,cone(.15,.08,.07,32),M.can,[0,0,.18]);add(can,cone(.07,.075,.05),M.can,[0,0,.235]);
   const curve=new T.QuadraticBezierCurve3(P(-.13,0,.02),P(-.3,0,.12),P(-.36,0,.27));
   const sp=new T.Mesh(new T.TubeGeometry(curve,20,.038,10),M.can);sp.castShadow=true;can.add(sp);
   const rose=add(can,cone(.028*1.25,.075*1.25,.06,20),M.can,[-.39,0,.3]);rose.rotation.z=.8;
   const face=add(can,cone(.072*1.25,.072*1.25,.012,20),M.seam,[-.405,0,.315]);face.rotation.z=.8;
   const h1=new T.Mesh(new T.TorusGeometry(.09,.02,10,24,Math.PI),M.can);h1.position.copy(P(0,0,.27));can.add(h1);
   const h2=new T.Mesh(new T.TorusGeometry(.1,.022,10,24,Math.PI),M.can);h2.position.copy(P(.2,0,.03));h2.rotation.z=-Math.PI/2;can.add(h2);}
  // rest pose
  arms[0].rotation.set(-.2,0,-.42);arms[1].rotation.set(.08,0,.28);
  head.rotation.set(0,0,0);

  // ---- poses. There is no skeleton: the hips, chest, head, two legs and two shoulders are the only joints,
  // and every pose below is written against those. The controller calls exactly one pose per frame, then `after`.
  const REST={a0:[-.2,0,-.42],a1:[.08,0,.28]};
  const mix=(a,b,k)=>a+(b-a)*k;
  const toRest=(k=.15)=>{   // relax every joint a step toward the standing rest pose
    for(const l of legs){l.rotation.x*=1-k;l.rotation.z*=1-k;}
    arms[0].rotation.x=mix(arms[0].rotation.x,REST.a0[0],k);arms[0].rotation.z=mix(arms[0].rotation.z,REST.a0[2],k);
    arms[1].rotation.x=mix(arms[1].rotation.x,REST.a1[0],k);arms[1].rotation.z=mix(arms[1].rotation.z,REST.a1[2],k);
    chest.rotation.x*=1-k;chest.rotation.z*=1-k;hips.rotation.z*=1-k;hips.rotation.x*=1-k;hips.position.y=mix(hips.position.y,.95,k);head.rotation.z*=1-k;};
  let blinkAt=2.2,blinkT=-1,glance=0;const eyeBase=eyes.map(e=>e.position.clone());
  let lastHeadQ=new T.Quaternion(),sprV=0,sprA=0;const fwd=new T.Vector3();
  root.userData={legs,arms,head,hips,chest,eyes,sprout,
    // walking: legs swing from the hip, arms swing opposite, a soft body bob; `amount` 0 = standing
    walk(phase,amount=1){const a=.55*amount;legs[0].rotation.x=Math.sin(phase)*a;legs[1].rotation.x=-Math.sin(phase)*a;legs[0].rotation.z=legs[1].rotation.z=0;
      arms[1].rotation.x=.08-Math.sin(phase)*.35*amount;arms[0].rotation.x=-.2+Math.sin(phase)*.15*amount;arms[1].rotation.z=mix(arms[1].rotation.z,.28,.2);arms[0].rotation.z=mix(arms[0].rotation.z,-.42,.2);
      hips.position.y=.95+Math.abs(Math.sin(phase))*.04*amount;hips.rotation.z=Math.sin(phase)*.03*amount;hips.rotation.x=.04*amount;chest.rotation.x*=.8;head.rotation.z=-Math.sin(phase)*.03*amount;},
    // riding: seated astride, knees out, a hand on the back; `bank` is the whale's roll and `sway` its heave, she leans against both
    ride(t,bank=0,sway=0){const b=Math.sin(t*1.7);
      legs[0].rotation.x=legs[1].rotation.x=-.72;legs[0].rotation.z=-.3;legs[1].rotation.z=.3;
      hips.position.y=.95-.21+sway*.02;hips.rotation.z=-bank*.55;hips.rotation.x=-.06;chest.rotation.x=-.08+b*.015;chest.rotation.z=-bank*.25;
      arms[0].rotation.x=-.55+b*.02;arms[0].rotation.z=-.36;arms[1].rotation.x=-.5-b*.02;arms[1].rotation.z=.34;head.rotation.z=-bank*.2;},
    // the jump: crouch (p<0), rise and tuck in the air (0..1), land with a squash that recovers (p>1)
    jump(p){legs[0].rotation.z*=.7;legs[1].rotation.z*=.7;
      if(p<0){const c=clamp01(-p),e=c*c*(3-2*c);legs[0].rotation.x=legs[1].rotation.x=-.25*e;hips.position.y=.95-.21+.06*e-.14*e;hips.rotation.x=.08*e;chest.rotation.x=.3*e;arms[0].rotation.x=-.2-.7*e;arms[1].rotation.x=.08-.7*e;arms[0].rotation.z=-.5;arms[1].rotation.z=.4;head.rotation.x=.12*e;}
      else if(p<=1){const air=Math.sin(Math.PI*p),up=1-p;legs[0].rotation.x=-.45*air-.1;legs[1].rotation.x=-.85*air;hips.position.y=.95+.02*air;hips.rotation.x=-.05*air;chest.rotation.x=-.14*air+.06;arms[0].rotation.x=-.2-1.3*air;arms[1].rotation.x=.08-1.5*air;arms[0].rotation.z=-.5-.3*air;arms[1].rotation.z=.4+.3*air;head.rotation.x=-.1*up+.08*p;}
      else{const c=Math.max(0,1-(p-1)),e=c*c*(3-2*c),s=Math.sin(Math.PI*clamp01((p-1)*1.3))*.5;legs[0].rotation.x=legs[1].rotation.x=-.05*e;hips.position.y=.95-.18*e*(1+s*.3);hips.rotation.x=.05*e;chest.rotation.x=.28*e;arms[0].rotation.x=-.2-.45*e;arms[1].rotation.x=.08-.45*e;arms[0].rotation.z=mix(-.42,-.6,e);arms[1].rotation.z=mix(.28,.5,e);head.rotation.x=.1*e;}},
    // a small goodbye: the free arm lifts over the shoulder and wags twice, then settles
    wave(p){const up=p<.28?p/.28:p>.78?1-(p-.78)/.22:1,e=up*up*(3-2*up),wag=p>.26&&p<.8?Math.sin((p-.26)/.54*Math.PI*5)*.3*e:0;
      toRest(.2);arms[1].rotation.z=mix(.28,1.9,e)+wag;arms[1].rotation.x=mix(.08,-.9,e)+wag*.35;arms[1].rotation.y=0;arms[0].rotation.x=mix(arms[0].rotation.x,-.1,.2);
      chest.rotation.z=-.06*e;hips.rotation.z=.03*e;head.rotation.z=.08*e;hips.position.y=.95;},
    // standing still: breath, a little weight shift, the free hand drifting. Everything else relaxes to rest.
    idle(t){toRest(.12);const br=Math.sin(t*1.45);hips.position.y=.95+br*.008;chest.rotation.x=br*.012+.01;chest.rotation.z=Math.sin(t*.37)*.012;hips.rotation.z=Math.sin(t*.37+1)*.01;
      arms[1].rotation.x=.08+Math.sin(t*1.45+.8)*.035;arms[1].rotation.z=.28+Math.sin(t*.9)*.02;head.rotation.z=Math.sin(t*.31)*.025;},
    // glance toward a point of interest: head turns a little, the eyes lead it. Angles in radians, clamped.
    look(yaw,pitch,k=.1){yaw=Math.max(-.55,Math.min(.55,yaw));pitch=Math.max(-.22,Math.min(.3,pitch));
      head.rotation.y=mix(head.rotation.y,yaw,k);head.rotation.x=mix(head.rotation.x,pitch,k);glance=mix(glance,yaw,k*1.6);},
    // run once per frame after the pose: blinks, eye slide, and the sprout lagging behind head turns
    after(dt,t){blinkAt-=dt;if(blinkAt<0&&blinkT<0){blinkT=0;blinkAt=2.4+Math.random()*3.2;}
      if(blinkT>=0){blinkT+=dt;const k=blinkT/.16;const s=k>=1?1:1-Math.sin(Math.PI*k)*.92;eyes.forEach(e=>e.scale.y=s);if(k>=1)blinkT=-1;}
      eyes.forEach((e,i)=>{e.position.copy(eyeBase[i]);e.position.x+=glance*.05;});
      // sprout: a spring that reacts to how fast the head yaws, then settles
      const q=new T.Quaternion();head.getWorldQuaternion(q);fwd.set(0,0,1).applyQuaternion(q);const yaw=Math.atan2(fwd.x,fwd.z);
      const f2=new T.Vector3(0,0,1).applyQuaternion(lastHeadQ);const d=Math.atan2(Math.sin(yaw-Math.atan2(f2.x,f2.z)),Math.cos(yaw-Math.atan2(f2.x,f2.z)));lastHeadQ.copy(q);
      const rate=dt>0?d/dt:0;sprV+=(-sprA*38-sprV*7-rate*.9)*dt;sprA+=sprV*dt;sprA=Math.max(-.45,Math.min(.45,sprA));sprout.rotation.z=sprA;sprout.rotation.x=sprA*.3;}};
  mergeStatic(root);                                            // one draw per part and material: the parts still move
  return root;
}
// a sphere shell with parts removed and a shaping pass, built from a lat/long grid so edges stay clean
function shell(nu,nv,kill,shape,r=1){
  const pos=[],idx=[];const keep=[];
  for(let j=0;j<=nv;j++){const ph=j/nv*Math.PI;for(let i=0;i<=nu;i++){const th=i/nu*Math.PI*2;
    const v=new T.Vector3(Math.sin(ph)*Math.cos(th),Math.sin(ph)*Math.sin(th),Math.cos(ph));   // Blender-style: z up
    keep.push(!kill(v.x,v.y,v.z));shape(v);pos.push(v.x*r,v.z*r,-v.y*r);}}
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;if(keep[a]&&keep[b]&&keep[c]&&keep[d]){idx.push(a,c,b,b,c,d);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
const HAT_R=.9,HAT_Z=.6;                                       // the leaves sit a little above the hair now, so the hat reads as a hat
function hatLeaf(s,k=1){
  const ns=30,nt=16,R=(HAT_R-.01*(s>0))*k;const pos=[],idx=[];
  for(let i=0;i<=ns;i++){const u=i/ns,phi=-.12+u*1.7,thmax=.98*Math.sqrt(Math.max(0,1-Math.pow(u*1.0,2.2)))+.03,droop=Math.max(0,u-.75)*.6;
    for(let j=0;j<=nt;j++){const t=j/nt*2-1,th=t*thmax,ridge=.04*Math.pow(1-Math.abs(t),2),r=R+ridge;
      const x=s*(r*Math.sin(phi)*Math.cos(th)+droop*.2),y=r*Math.sin(th),z=HAT_Z+r*Math.cos(phi)*Math.cos(th)-droop;pos.push(x,z,-y);}}
  for(let i=0;i<ns;i++)for(let j=0;j<nt;j++){const a=i*(nt+1)+j,b=a+1,c=a+nt+1,d=c+1;idx.push(a,b,c,b,d,c);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function leafGeo(){const g=new T.SphereGeometry(1,20,10);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const bz=y,by=-z;const t=Math.abs(bz);const nx=x*((1-Math.pow(t,1.6))*.9+.1);let ny=by*.16;ny+=bz*bz*.25-.1;p.setXYZ(i,nx,bz,-ny);}
  g.computeVertexNormals();return g;}
