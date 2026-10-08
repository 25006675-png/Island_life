import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from './merge.js';

// The pier the whale brings Blomy to: a boardwalk and a round deck, held up by a living root that grows out of the
// cliff, with moss, flowers, hanging vines and two lanterns at the tip. The welcome page and every member island
// in the app build the same one, out from the shore in front of the torii, so the landing and the island match.
// shore: world point at the shore's edge; out: unit direction away from the island. Sizes are in world metres
// (member islands are shown at scale 2). lights:false leaves out the four warm point lights, for the app, where
// five islands of them would cost every material in the scene; the lanterns and glow beads still shine.
export const PIER=11, TIPR=2.75, WALK_HALF=1.4;
export function createPier({shore,out,rnd=Math.random,lights=true}){
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), lerp=(a,b,t)=>a+(b-a)*t;
out=out.clone().setY(0).normalize();const along=V(-out.z,0,out.x);
const DECK=shore.y+.12;
const pierAt=d=>shore.clone().addScaledVector(out,d).setY(DECK);          // d metres out from the shore
const pier=new T.Group(), detail=new T.Group();pier.add(detail);   // detail: moss, flowers, vines, leaves, glow beads
const TIPC=pierAt(PIER+1.4);
{const PA=(d,a,y)=>pierAt(d).addScaledVector(along,a).add(V(0,y,0));        // pier-relative: out, along, up from the deck
 const yawOut=Math.atan2(out.x,out.z);
 const canvasTex=(w,h,draw,rep)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;if(rep){t.wrapS=t.wrapT=T.RepeatWrapping;}t.anisotropy=4;return t;};
 // timber: warm planks with darker gaps and a few nail heads
 const plankTex=canvasTex(512,512,(g,w,h)=>{const n=9,ph=h/n;for(let i=0;i<n;i++){const l=48+rnd()*14;g.fillStyle=`hsl(${24+rnd()*6},${44+rnd()*10}%,${l}%)`;g.fillRect(0,i*ph,w,ph);
     for(let k=0;k<16;k++){g.fillStyle=`rgba(90,50,25,${.05+rnd()*.08})`;g.fillRect(rnd()*w,i*ph+rnd()*ph,60+rnd()*160,1+rnd()*2);}
     g.fillStyle='rgba(60,32,16,.75)';g.fillRect(0,i*ph,w,3);g.fillStyle='rgba(255,230,190,.18)';g.fillRect(0,i*ph+3,w,2);
     g.fillStyle='rgba(70,40,20,.6)';for(const x of[30,w-30]){g.beginPath();g.arc(x,i*ph+ph/2,3.5,0,7);g.fill();}}},false);
 // bark: long grooves along the root
 const barkTex=canvasTex(256,512,(g,w,h)=>{g.fillStyle='#8a5a36';g.fillRect(0,0,w,h);
     for(let i=0;i<70;i++){const x=rnd()*w,wd=2+rnd()*7;const gr=g.createLinearGradient(x,0,x+wd,0);const dark=rnd()<.55;gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.5,dark?'rgba(70,40,20,.55)':'rgba(190,130,80,.35)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x,0,wd,h);}
     for(let i=0;i<40;i++){g.fillStyle='rgba(60,34,18,.35)';g.fillRect(rnd()*w,rnd()*h,1+rnd()*3,8+rnd()*30);}},true);
 const deckTopM=new T.MeshStandardMaterial({map:plankTex,roughness:.82});
 const woodM=new T.MeshStandardMaterial({color:'#b5774a',roughness:.85});
 const rimM=new T.MeshStandardMaterial({color:'#ffffff',roughness:.8,vertexColors:false});
 const barkM=new T.MeshStandardMaterial({map:barkTex,color:'#f0c08e',roughness:.88,emissive:'#4a2410',emissiveIntensity:.35});
 const fenceM=new T.MeshStandardMaterial({color:'#f2e3c6',roughness:.7});
 const mossM=new T.MeshStandardMaterial({color:'#ffffff',roughness:1});
 const beamM=new T.MeshStandardMaterial({color:'#7a4c2c',roughness:.9});
 const shade=o=>{o.castShadow=true;o.receiveShadow=true;return o;};

 // the boardwalk: thick planks across two stringers, each plank a little different
 const n=Math.round((PIER+.6)/.46);const planks=shade(new T.InstancedMesh(new RoundedBoxGeometry(3.3,.2,.4,2,.05),woodM,n));const d=new T.Object3D();const col=new T.Color();
 for(let i=0;i<n;i++){const p=pierAt(-2.2+i*.46);d.position.copy(p).add(V(0,-.08+(rnd()-.5)*.03,0));d.rotation.set(0,yawOut+(rnd()-.5)*.04,(rnd()-.5)*.02);d.scale.set(1+(rnd()-.5)*.06,1,1);d.updateMatrix();planks.setMatrixAt(i,d.matrix);
   planks.setColorAt(i,col.setHSL(.07+rnd()*.02,.45+rnd()*.1,.42+rnd()*.1));}
 pier.add(planks);
 for(const s of[-1,1]){const a=pierAt(-2.4).addScaledVector(along,s*1.35),b=pierAt(PIER-.6).addScaledVector(along,s*1.35);const L=a.distanceTo(b);
   const st=shade(new T.Mesh(new T.BoxGeometry(.26,.34,L),beamM));st.position.copy(a).lerp(b,.5).add(V(0,-.32,0));st.rotation.y=yawOut;pier.add(st);}

 // the round deck at the tip: planked top, a crown of chunky blocks around its edge
 // TIPC, TIPR: above
 const tip=shade(new T.Mesh(new T.CylinderGeometry(TIPR,TIPR*.97,.5,40),[woodM,deckTopM,woodM]));tip.position.copy(TIPC).add(V(0,-.17,0));tip.rotation.y=yawOut;pier.add(tip);
 {const N=26,blk=shade(new T.InstancedMesh(new RoundedBoxGeometry(2*Math.PI*TIPR/N*.9,.62,.42,2,.08),rimM,N));
  for(let i=0;i<N;i++){const a=i/N*Math.PI*2;d.position.set(TIPC.x+Math.cos(a)*(TIPR-.05),TIPC.y-.24+(rnd()-.5)*.06,TIPC.z+Math.sin(a)*(TIPR-.05));d.rotation.set((rnd()-.5)*.05,-a+Math.PI/2,(rnd()-.5)*.05);d.scale.set(1,1+(rnd()-.5)*.1,1);d.updateMatrix();blk.setMatrixAt(i,d.matrix);
    blk.setColorAt(i,col.setHSL(.065+rnd()*.02,.42+rnd()*.12,.4+rnd()*.1));}
  pier.add(blk);}

 // a cream fence along the boardwalk: square posts with caps, a top rail and a mid rail. The deck itself stays open.
 const posts=shade(new T.InstancedMesh(new RoundedBoxGeometry(.17,1.05,.17,2,.03),fenceM,12)),caps=shade(new T.InstancedMesh(new RoundedBoxGeometry(.24,.1,.24,2,.03),fenceM,12));pier.add(posts,caps);let fk=0;
 for(const s of[-1,1]){const xs=[];for(let k=0;k<=5;k++)xs.push(-1.6+k/5*(PIER-.8));
   xs.forEach(x=>{const p=PA(x,s*1.5,0);d.rotation.set(0,yawOut,0);d.scale.set(1,1,1);d.position.copy(p).add(V(0,.5,0));d.updateMatrix();posts.setMatrixAt(fk,d.matrix);
     d.position.copy(p).add(V(0,1.05,0));d.updateMatrix();caps.setMatrixAt(fk++,d.matrix);});
   for(const [h,th] of[[.9,.11],[.48,.08]]){const a=PA(xs[0],s*1.5,h),b=PA(xs[xs.length-1],s*1.5,h);const rail=shade(new T.Mesh(new RoundedBoxGeometry(th,th,a.distanceTo(b),2,.025),fenceM));rail.position.copy(a).lerp(b,.5);rail.rotation.y=yawOut;pier.add(rail);}}

 // the living root: thick out of the cliff, sagging under the boardwalk, rising to cup the round deck; a second root under the walk,
 // one that curls round the deck's rim, and one that hangs free. Each is a tube that tapers and swells a little along its length.
 const rootGeo=(pts,r0,r1,seg=72,rad=12)=>{const c=new T.CatmullRomCurve3(pts,false,'centripetal');const fr=c.computeFrenetFrames(seg,false);const len=c.getLength();const pos=[],uv=[],idx=[];
   for(let i=0;i<=seg;i++){const u=i/seg,p=c.getPointAt(u),r=lerp(r0,r1,Math.pow(u,.75))*(1+.07*Math.sin(u*19+r0*3)),N=fr.normals[i],B=fr.binormals[i];
     for(let j=0;j<=rad;j++){const a=j/rad*Math.PI*2,k=r*(1+.07*Math.sin(a*3+u*11));const cx=Math.cos(a),sy=Math.sin(a);pos.push(p.x+(N.x*cx+B.x*sy)*k,p.y+(N.y*cx+B.y*sy)*k,p.z+(N.z*cx+B.z*sy)*k);uv.push(j/rad,u*len/4);}}
   for(let i=0;i<seg;i++)for(let j=0;j<rad;j++){const a=i*(rad+1)+j,b=a+rad+1;idx.push(a,b,a+1,b,b+1,a+1);}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.userData={curve:c,r0,r1};return g;};
 const ROOTS=[
   [[PA(-7,-.3,-7.5),PA(-3,-.2,-5.4),PA(1,0,-4.6),PA(5,.1,-4.4),PA(8.4,.1,-3.3),PA(10.6,0,-1.9),PA(12.2,0,-.85),PA(13.4,0,-.55)],1.7,.6],   // the main root
   [[PA(-4,1.1,-2.6),PA(-.5,1,-1.7),PA(3,.85,-1.25),PA(6.5,.6,-1.15),PA(9.2,.3,-1.7),PA(10.6,.1,-2.3)],.75,.38],                   // under the walk
   [[PA(-4.5,-1.2,-3),PA(-1,-1.4,-3.6),PA(2.2,-1,-4.4)],.6,.3],                                                                     // a short brace into the main
   [[PA(5.4,.2,-4.3),PA(6.6,-.2,-2.4),PA(7.8,-.4,-1.3),PA(9.2,-.3,-1.6),PA(9.9,-.1,-2.6)],.5,.32],                                // a loop up under the walk and back
   [[PA(11.4,-.2,-1.2),PA(13.4,-.6,-1),PA(14.25,-1.4,-.5),PA(14.3,-1.9,-.05)],.48,.12],                                             // curling round the rim
   [[PA(3.2,-.2,-4.8),PA(4.6,-.6,-6.6),PA(5.4,-1,-8.6),PA(5.6,-1.2,-10.2)],.62,.05]];                                              // hanging free
 const rootGeos=ROOTS.map(([pts,r0,r1])=>rootGeo(pts,r0,r1));pier.add(shade(new T.Mesh(mergeGeometries(rootGeos),barkM)));   // all roots in one draw

 // moss along the tops of the roots and in tufts on the deck's edge; small flowers in it; vines hanging off the rim
 const mossG=new T.IcosahedronGeometry(1,2);{const p=mossG.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)*.62);mossG.computeVertexNormals();}
 const MOSS=[];const flowers=[];
 rootGeos.forEach((g,k)=>{const {curve,r0,r1}=g.userData;const cnt=k===5?6:k===0?56:20;for(let i=0;i<cnt;i++){const u=.08+rnd()*.84,p=curve.getPointAt(u),r=lerp(r0,r1,Math.pow(u,.75));
   MOSS.push([p.clone().add(V((rnd()-.5)*r*.8,r*.84,(rnd()-.5)*r*.8)),r*(.2+rnd()*.24)]);if(rnd()<.55)flowers.push(p.clone().add(V((rnd()-.5)*r*.5,r*1.08+.05,(rnd()-.5)*r*.5)));}});
 for(let i=0;i<46;i++){const a=rnd()*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a-Math.atan2(-along.z,-along.x)),Math.cos(a-Math.atan2(-along.z,-along.x))))<.6)continue;   // keep the whale's side clear
   const p=V(TIPC.x+Math.cos(a)*(TIPR+.08),TIPC.y-.05-rnd()*.3,TIPC.z+Math.sin(a)*(TIPR+.08));MOSS.push([p,.11+rnd()*.12]);if(rnd()<.5)flowers.push(p.clone().add(V(Math.cos(a)*.08,.12,Math.sin(a)*.08)));}
 for(let i=0;i<18;i++){const p=PA(-1.4+rnd()*(PIER-1),(rnd()<.5?-1:1)*1.72,-.22);MOSS.push([p,.1+rnd()*.12]);if(rnd()<.6)flowers.push(p.clone().add(V(0,.16,0)));}
 const moss=shade(new T.InstancedMesh(mossG,mossM,MOSS.length));
 MOSS.forEach(([p,s],i)=>{d.position.copy(p);d.rotation.set((rnd()-.5)*.4,rnd()*6,(rnd()-.5)*.4);d.scale.set(s*(1+rnd()*.5),s,s*(1+rnd()*.3));d.updateMatrix();moss.setMatrixAt(i,d.matrix);moss.setColorAt(i,col.setHSL(.26+rnd()*.05,.5+rnd()*.15,.24+rnd()*.1));});
 detail.add(moss);
 const flowerTex=canvasTex(64,64,(g)=>{g.translate(32,32);for(let i=0;i<5;i++){g.rotate(Math.PI*2/5);g.fillStyle='#ffffff';g.beginPath();g.ellipse(0,-13,8,12,0,0,7);g.fill();}g.fillStyle='#f6c64a';g.beginPath();g.arc(0,0,7,0,7);g.fill();},false);
 for(const [tint,share] of[['#ffffff',.5],['#ffc2d8',.5]]){const pts=flowers.filter(()=>rnd()<share);const g=new T.BufferGeometry().setFromPoints(pts);
   detail.add(new T.Points(g,new T.PointsMaterial({map:flowerTex,color:tint,size:.42,sizeAttenuation:true,alphaTest:.5,transparent:false})));}
 // vines: thin stems hanging from the rim and the walk's edge, a leaf every so often
 const vineM=new T.MeshStandardMaterial({color:'#5f8f36',roughness:.8});const leafG=new T.SphereGeometry(1,8,6);{const p=leafG.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)*.25);leafG.computeVertexNormals();}
 const LEAVES=[];
 const vineFrom=[];for(let i=0;i<7;i++){const a=(i/7)*Math.PI*1.3+Math.atan2(along.z,along.x)-.4;vineFrom.push(V(TIPC.x+Math.cos(a)*TIPR,TIPC.y-.3,TIPC.z+Math.sin(a)*TIPR));}
 for(let i=0;i<6;i++)vineFrom.push(PA(-.5+rnd()*(PIER-1.5),1.5,-.4));
 const vineGeos=[];
 vineFrom.forEach(top=>{const L=1.2+rnd()*2.6,sw=(rnd()-.5)*.6;const pts=[];for(let k=0;k<=6;k++){const u=k/6;pts.push(top.clone().add(V(Math.sin(u*3+sw*5)*.2+sw*u,-u*L,Math.cos(u*2.4+sw*4)*.15)));}
   const c=new T.CatmullRomCurve3(pts);vineGeos.push(new T.TubeGeometry(c,16,.03,4));for(let k=1;k<=Math.round(L*3);k++){const u=k/Math.round(L*3)*.96;LEAVES.push(c.getPointAt(u));}});
 detail.add(shade(new T.Mesh(mergeGeometries(vineGeos),vineM)));
 const leaves=shade(new T.InstancedMesh(leafG,vineM,LEAVES.length));LEAVES.forEach((p,i)=>{d.position.copy(p);d.rotation.set(rnd()*6,rnd()*6,rnd()*6);const s=.1+rnd()*.07;d.scale.set(s,s*1.3,s);d.updateMatrix();leaves.setMatrixAt(i,d.matrix);leaves.setColorAt(i,col.setHSL(.24+rnd()*.06,.5,.36+rnd()*.12));});detail.add(leaves);
 // a warm glow tucked under the deck, where the root meets the wood, as in the picture
 const glowDotM=new T.MeshBasicMaterial({color:'#ffd27a'}),dots=new T.InstancedMesh(new T.SphereGeometry(1,8,6),glowDotM,14);detail.add(dots);for(let i=0;i<14;i++){const a=rnd()*Math.PI*2;const p=i<9?V(TIPC.x+Math.cos(a)*TIPR*.8,TIPC.y-.55,TIPC.z+Math.sin(a)*TIPR*.8):PA(-1+rnd()*(PIER-2),(rnd()-.5)*2.4,-.5);
   d.position.copy(p);d.rotation.set(0,0,0);d.scale.setScalar(.06+rnd()*.04);d.updateMatrix();dots.setMatrixAt(i,d.matrix);}
 if(lights){
 const under=new T.PointLight(0xffb066,16,11,2);under.position.copy(TIPC).add(V(0,-1.1,0));pier.add(under);
 const underWalk=new T.PointLight(0xffb066,10,10,2);underWalk.position.copy(pierAt(4)).add(V(0,-1,0));pier.add(underWalk);
 }

 // two lanterns on tall posts at the tip, the same warm gold as the torii lantern
 const darkM=new T.MeshStandardMaterial({color:'#6e4426',roughness:.9});
 const lanM=new T.MeshStandardMaterial({color:'#f7c86a',emissive:'#ff9f3a',emissiveIntensity:1.1,roughness:.4});
 for(const s of[-1,1]){const p=pierAt(PIER-.7).addScaledVector(along,s*2.2);const post=new T.Mesh(new T.CylinderGeometry(.08,.1,3.6,6),darkM);post.position.copy(p).add(V(0,1.8,0));pier.add(post);
   const lan=new T.Mesh(new T.BoxGeometry(.36,.46,.36),lanM);lan.position.copy(p).add(V(0,3.7,0));pier.add(lan);const roof=new T.Mesh(new T.ConeGeometry(.42,.26,4),darkM);roof.position.copy(p).add(V(0,4.05,0));roof.rotation.y=Math.PI/4;pier.add(roof);
   if(lights){const pl=new T.PointLight(0xffb86a,9,14,2);pl.position.copy(p).add(V(0,3.7,0));pier.add(pl);}}}
// one draw per material: the pier and its decoration each (the decoration can be hidden from afar)
mergeStatic(pier);
// where people can stand: the boardwalk from the shore out, and the round deck at the tip
const walk={shore:shore.clone(),out,along,deckY:DECK,tip:TIPC.clone(),
  on(x,z){const dx=x-shore.x,dz=z-shore.z,d=dx*out.x+dz*out.z,a=dx*along.x+dz*along.z;
    return (d>-1&&d<PIER+.4&&Math.abs(a)<WALK_HALF)||Math.hypot(x-TIPC.x,z-TIPC.z)<TIPR-.25;}};
return {group:pier,detail,walk,deckY:DECK,tip:TIPC,pierAt,along};
}
