import * as T from 'three';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const sph=new T.SphereGeometry(1,48,32);
export const mat=(c,o={})=>new T.MeshPhysicalMaterial(Object.assign({color:c,roughness:.62,clearcoat:.35,clearcoatRoughness:.5},o));
export const INK=mat('#1a1722',{roughness:.15,clearcoat:.8}), WHITE=mat('#ffffff',{roughness:.2});
export function radial(stops,size=128){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');const gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);stops.forEach(([o,col])=>gr.addColorStop(o,col));g.fillStyle=gr;g.fillRect(0,0,size,size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
export const blushTex=radial([[0,'rgba(246,140,150,.8)'],[.6,'rgba(246,150,160,.3)'],[1,'rgba(246,160,170,0)']]);
export const add=(p,geo,m,x,y,z,sx=1,sy=sx,sz=sx)=>{const e=new T.Mesh(geo,m);e.position.set(x,y,z);e.scale.set(sx,sy,sz);e.castShadow=true;e.receiveShadow=true;p.add(e);return e;};
// a face laid onto a sphere of radius r centred at c (local to p): eyes, highlights, blush, a tiny mouth
export function face(p,c,r,{eyeX=.3,eyeY=-.05,eyeS=.09,blush=true,mouth=true,gap=1}={}){
  const on=(x,y,lift=0)=>{const d=Math.sqrt(Math.max(0,r*r-x*x-y*y));const q=V(c.x+x,c.y+y,c.z+d+lift);return {q,n:q.clone().sub(c).normalize()};};
  for(const s of[-1,1]){const e=on(eyeX*s*gap,eyeY,-.02*r);add(p,sph,INK,e.q.x,e.q.y,e.q.z,eyeS,eyeS*1.25,eyeS*.6);add(p,sph,WHITE,e.q.x+.025*s,e.q.y+.045,e.q.z+.05,eyeS*.3,eyeS*.3,eyeS*.2);
    if(blush){const b=on((eyeX+.2)*s*gap,eyeY-.22,.01);const bl=new T.Mesh(new T.PlaneGeometry(r*.5,r*.34),new T.MeshBasicMaterial({map:blushTex,transparent:true,depthWrite:false}));bl.position.copy(b.q);bl.lookAt(b.q.clone().add(b.n));p.add(bl);}}
  if(mouth){const m=on(0,eyeY-.3,.01);add(p,new T.TorusGeometry(.06,.014,6,12,Math.PI),mat('#c2606e'),m.q.x,m.q.y,m.q.z).rotation.z=Math.PI;}}

export const makers={
  dewdrop(){ // Dewdrop: a drop of the island's own currency, with a sprout
    const g=new T.Group();const body=mat('#8fc4f2',{roughness:.28,clearcoat:1,clearcoatRoughness:.15,emissive:'#3f7fc4',emissiveIntensity:.18});
    const prof=[];for(let i=0;i<=28;i++){const a=i/28;prof.push(new T.Vector2(Math.sin(Math.PI*Math.pow(a,.62))*1.05*(1-a*.15)+.001,a*2.5-1.05));}
    const drop=new T.Mesh(new T.LatheGeometry(prof,48),body);drop.castShadow=true;g.add(drop);
    add(g,sph,mat('#e9f5ff',{roughness:.2}),-.38,.25,.75,.2,.3,.08).rotation.z=.5;             // the wet highlight
    face(g,V(0,-.15,0),1.0,{eyeX:.32,eyeY:-.1,eyeS:.1});
    const leaf=mat('#8ccc5f',{side:T.DoubleSide});add(g,sph,leaf,.18,1.5,0,.22,.06,.1).rotation.z=.7;add(g,sph,leaf,-.18,1.5,0,.22,.06,.1).rotation.z=-.7;add(g,new T.CylinderGeometry(.03,.04,.3,6),mat('#6aa64a'),0,1.4,0);
    for(const s of[-1,1])add(g,sph,body,.78*s,-.75,.55,.17,.13,.15);                              // little hands, low and forward
    const halo=new T.Mesh(new T.CircleGeometry(.9,32),new T.MeshBasicMaterial({map:radial([[0,'rgba(120,150,200,.35)'],[1,'rgba(120,150,200,0)']]),transparent:true,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=-1.55;g.add(halo);
    g.userData.float=true;return g;},
  cloud(){ // Nimbus: a small cloud with boots, carrying a lantern
    const g=new T.Group();const c=mat('#fffaf7',{roughness:.7,clearcoat:.2});
    for(const [x,y,z,s] of[[0,0,0,1.05],[-.8,-.1,.15,.72],[.8,-.05,.1,.75],[-.3,.55,-.1,.7],[.4,.6,.05,.66],[0,-.2,.5,.8],[-.5,.2,-.6,.7],[.5,.1,-.6,.7]])add(g,sph,c,x,y,z,s);
    face(g,V(0,-.1,.35),1.0,{eyeX:.3,eyeY:-.05,eyeS:.095});
    const boot=mat('#f6d55c',{roughness:.45});for(const s of[-1,1]){add(g,new T.CylinderGeometry(.17,.19,.3,16),boot,.32*s,-1.05,.1);add(g,sph,boot,.32*s,-1.18,.18,.2,.11,.27);}
    const stick=add(g,new T.CylinderGeometry(.03,.03,1.1,6),mat('#8d6540'),1.15,-.1,.3);stick.rotation.z=-.35;
    const lan=add(g,new T.BoxGeometry(.28,.34,.28),mat('#f7c86a',{emissive:'#ff9f3a',emissiveIntensity:.9}),1.42,-.75,.3);add(g,new T.ConeGeometry(.3,.18,4),mat('#8d6540'),1.42,-.5,.3).rotation.y=Math.PI/4;
    for(let i=0;i<3;i++)add(g,sph,mat('#9fc6ee',{roughness:.3,clearcoat:1}),-.9+i*.3,-1.15-(i%2)*.15,.6,.07,.1,.07);   // a drizzle of drops under it
    return g;},
  fox(){ // Ember: a lantern fox, tail lit like the bridges
    const g=new T.Group();const fur=mat('#f4b26a'),cream=mat('#fff3e2'),dark=mat('#8a4d2c');
    add(g,sph,fur,0,-.55,0,.85,.75,.95);add(g,sph,cream,0,-.75,.45,.55,.45,.45);              // sitting body, chest
    add(g,sph,fur,0,.45,.1,.95,.85,.9);add(g,sph,cream,0,.2,.78,.42,.3,.3);                   // head, muzzle
    add(g,sph,INK,0,.3,1.06,.08,.06,.06);
    face(g,V(0,.45,.1),.95,{eyeX:.33,eyeY:.05,eyeS:.085,mouth:false});
    for(const s of[-1,1]){const e=add(g,new T.ConeGeometry(.26,.62,16),fur,.55*s,1.2,-.05);e.rotation.z=-.35*s;const i=add(g,new T.ConeGeometry(.14,.36,12),mat('#f6c2c6'),.55*s,1.16,.05);i.rotation.z=-.35*s;}
    for(const s of[-1,1]){add(g,sph,fur,.5*s,-1.15,.5,.22,.16,.3);add(g,sph,dark,.5*s,-1.2,.72,.14,.08,.12);}   // paws
    const tail=new T.Group();tail.position.set(-.75,-1.05,.1);g.add(tail);
    add(tail,new T.CapsuleGeometry(.3,.9,8,20),fur,-.3,.5,.1).rotation.z=.75;
    add(tail,sph,mat('#fff2c6',{emissive:'#ffcf70',emissiveIntensity:1.4}),-.85,1.0,.15,.34,.34,.34);
    g.userData.tail=tail;return g;},
  moss(){ // Mossy: a moss ball with two sprouts, roots for feet, a red cord
    const g=new T.Group();const m1=mat('#86b85a',{roughness:.9}),m2=mat('#9ccb6c',{roughness:.9});
    add(g,sph,m1,0,0,0,1.05,1,1.05);
    let s=3;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};
    for(let i=0;i<70;i++){const a=r()*6.28,b=Math.acos(r()*2-1);const p=V(Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a));if(p.z>.55&&Math.abs(p.x)<.6&&p.y>-.6&&p.y<.4)continue;add(g,sph,i%2?m1:m2,p.x*1.02,p.y*.98,p.z*1.02,.12+r()*.1);}
    face(g,V(0,0,0),1.06,{eyeX:.3,eyeY:-.02,eyeS:.1});
    const leaf=mat('#a7dc74',{side:T.DoubleSide});for(const [x,z,rz] of[[-.2,.1,.8],[.22,-.05,-.7]]){add(g,new T.CylinderGeometry(.025,.035,.5,6),mat('#6aa64a'),x,1.2,z).rotation.z=rz*.3;add(g,sph,leaf,x+Math.sin(rz)*.25,1.45,z,.26,.07,.14).rotation.z=rz;}
    const cord=mat('#c9484f');add(g,new T.TorusGeometry(1.0,.03,8,48),cord,0,-.1,0).rotation.x=Math.PI/2*.92;for(const s of[-1,1]){const l=add(g,new T.TorusGeometry(.13,.035,8,20),cord,.42+.14*s,-.06+.02,.98,1,.7,1);l.rotation.set(0,.45,s*.5);}add(g,sph,cord,.42,-.06,1.0,.06);
    for(const [x,z] of[[-.45,.2],[.45,.1],[0,-.45]])add(g,new T.CylinderGeometry(.05,.02,.5,6),mat('#a8774d'),x,-1.15,z);
    return g;},
  pip(){ // Pip: a mushroom-cap kid, the gardener re-drawn
    const g=new T.Group();const skin=mat('#ffe8dc',{roughness:.6}),hair=mat('#e7a955'),smock=mat('#fff4ea'),capM=mat('#f2a4b8'),boot=mat('#f6d55c',{roughness:.45});
    for(const s of[-1,1]){add(g,new T.CylinderGeometry(.14,.14,.26,14),skin,.2*s,-1.0,0);add(g,new T.CylinderGeometry(.18,.19,.2,16),boot,.2*s,-1.18,.01);add(g,sph,boot,.2*s,-1.3,.07,.2,.11,.26);}
    add(g,new T.CylinderGeometry(.34,.5,.62,28),smock,0,-.6,0);add(g,sph,smock,0,-.32,0,.38,.2,.34);
    add(g,new T.BoxGeometry(.26,.16,.04),mat('#c9d7a6'),0,-.6,.49);
    for(const s of[-1,1]){const a=new T.Group();a.position.set(.4*s,-.35,0);g.add(a);add(a,new T.CapsuleGeometry(.11,.2,6,14),smock,0,-.16,0);add(a,sph,skin,0,-.36,0,.11);a.rotation.z=.35*s;}
    const head=new T.Group();head.position.y=.4;g.add(head);
    add(head,sph,hair,0,.05,-.03,.82,.78,.8);add(head,sph,skin,0,-.07,.17,.72,.7,.72);add(head,sph,hair,0,.34,.33,.66,.28,.46);for(const s of[-1,1])add(head,sph,hair,.6*s,-.25,0,.25,.42,.33);
    face(head,V(0,-.07,.17),.72,{eyeX:.25,eyeY:-.1,eyeS:.08});
    const cap=new T.Group();cap.position.y=.62;head.add(cap);
    const capG=new T.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI*.52);add(cap,capG,capM,0,-.05,0,1.25,.95,1.25);add(cap,new T.CylinderGeometry(1.25,1.2,.08,48),mat('#f7d9e2'),0,-.06,0);
    const dot=mat('#fff6ee');for(const [x,y,z,s] of[[-.5,.55,.6,.17],[.55,.5,.55,.14],[0,.85,.3,.2],[-.75,.3,-.3,.13],[.6,.4,-.55,.16],[.1,.6,-.75,.12]]){const d=add(cap,sph,dot,x*1.25,y*.95-.05,z*1.25,s,s*.5,s);d.lookAt(V(x*4,y*4,z*4));}
    // a dewdrop lantern on a stick
    const stick=add(g,new T.CylinderGeometry(.025,.025,1.0,6),mat('#8d6540'),.95,-.35,.15);stick.rotation.z=-.15;
    add(g,sph,mat('#8fc4f2',{roughness:.3,clearcoat:1,emissive:'#3f7fc4',emissiveIntensity:.5}),1.03,.22,.15,.15,.2,.15);add(g,new T.ConeGeometry(.08,.14,8),mat('#8fc4f2'),1.03,.42,.15);
    return g;}
};
