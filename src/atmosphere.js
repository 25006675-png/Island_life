import * as T from 'three';
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+11.4;a*=.5;}return v;}`;
const palettes={peach:['#787da9','#c0afd0','#ffd7b2','#f5cfbf'],lavender:['#666b9b','#ae9bcb','#eec7d5','#cdbbd9'],mint:['#77a8b8','#b3d2c9','#ffe0b8','#c5dcd2']};
export function createAtmosphere(scene) {
  const uniforms={top:{value:new T.Color()},mid:{value:new T.Color()},bottom:{value:new T.Color()},time:{value:0}};
  const sky=new T.Mesh(new T.SphereGeometry(450,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vWorld;uniform vec3 top,mid,bottom;uniform float time;${noise}
void main(){vec3 d=normalize(vWorld);float h=d.y;vec3 col=mix(bottom,mid,smoothstep(-.2,.28,h));col=mix(col,top,smoothstep(.15,.8,h));float sun=pow(max(0.,dot(d,normalize(vec3(-.8,.13,-1.)))),18.);col+=vec3(.17,.10,.025)*sun;float clouds=fbm(d.xz*5./max(.25,abs(d.y)+.3)+time*.002);float veil=smoothstep(.48,.77,clouds)*(1.-smoothstep(.08,.6,h));col=mix(col,bottom*1.07,veil*.38);float stars=step(.9978,hash(floor(d.xz/max(.16,h)*340.)))*smoothstep(.28,.75,h);col+=stars*.38;gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  scene.add(sky);
  const cloudUniforms={time:uniforms.time,tint:{value:new T.Color()}};
  // the cloud sea is far wider than any view and fades out, so no edge ever shows
  const sea=new T.Mesh(new T.PlaneGeometry(4000,4000),new T.ShaderMaterial({uniforms:cloudUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 tint;${noise}
void main(){vec2 p=vWorld.xz*.026+vec2(time*.002,0.);float n=fbm(p);float detail=fbm(p*3.);vec3 col=mix(tint*.83,vec3(1.,.9,.81),smoothstep(.22,.8,n));col+=pow(detail,3.)*.14;gl_FragColor=vec4(col,.98*(1.-smoothstep(700.,1800.,length(vWorld.xz))));#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  sea.rotation.x=-Math.PI/2;sea.position.y=-17;scene.add(sea);
  // Soft billows use one shared procedural sprite, keeping the cloud sea inexpensive.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.55)');gradient.addColorStop(.45,'rgba(255,255,255,.26)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas),clouds=new T.Group();scene.add(clouds);
  for(let n=0;n<100;n++) {const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#ffe3d3',transparent:true,depthWrite:false,opacity:.45}));const angle=n*2.399,r=22+Math.sqrt(n/100)*150;s.position.set(Math.cos(angle)*r,-13+(n%5)*.5,Math.sin(angle)*r);s.scale.set(30+n%7*5,11+n%4*3,1);clouds.add(s);}
  const bands=new T.Group();scene.add(bands);
  for(const y of [7,19,32]){const band=new T.Mesh(new T.CylinderGeometry(190,190,.13,100,1,true),new T.MeshBasicMaterial({color:'#fae5c1',transparent:true,opacity:.095,side:T.DoubleSide,depthWrite:false}));band.position.y=y;bands.add(band);}
  // .004 buried the islands in haze; .0009 keeps depth without the milk
  scene.fog=new T.FogExp2('#dec4d1',.0009);
  // far scenery for the sky view: small islands adrift, and thin high cloud
  const isles=new T.Group(), haze=new T.Group();scene.add(isles,haze);
  const mat=c=>new T.MeshStandardMaterial({color:c,roughness:1,flatShading:true});
  const grass=mat('#c3cf9c'), rock=mat('#c7b6ab'), leaves=[mat('#a9c08a'),mat('#e9bfcc'),mat('#c9b6e4')];
  for(let i=0;i<9;i++){
    const a=i*2.399+.6, r=280+(i*53)%150, s=5+(i*7)%9, g=new T.Group();
    const base=new T.Mesh(new T.ConeGeometry(s*.95,s*1.7,9),rock);base.rotation.x=Math.PI;base.position.y=-s*.95;
    g.add(new T.Mesh(new T.CylinderGeometry(s,s*.92,s*.22,9),grass),base);
    for(let k=0;k<1+i%3;k++){const t=new T.Mesh(new T.IcosahedronGeometry(s*(.28+.08*k),0),leaves[(i+k)%3]);t.position.set((k-1)*s*.35,s*.35,((k*5)%3-1)*s*.25);g.add(t);}
    g.position.set(Math.cos(a)*r,-2+(i*17)%38,Math.sin(a)*r);g.rotation.y=a;g.userData={y:g.position.y,p:i};isles.add(g);
  }
  for(let n=0;n<26;n++){
    const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#fff3ea',transparent:true,depthWrite:false,opacity:.16+(n%4)*.04}));
    const a=n*2.399+.3,r=160+(n*37)%230;s.position.set(Math.cos(a)*r,24+(n*13)%46,Math.sin(a)*r);s.scale.set(60+(n%5)*14,14+(n%3)*5,1);haze.add(s);
  }
  // drifting sparkles: a little light in the air, rising slowly and wrapping round
  const SP=140, spark=new Float32Array(SP*3), sparkGeo=new T.BufferGeometry();
  sparkGeo.setAttribute('position',new T.BufferAttribute(spark,3));
  scene.add(new T.Points(sparkGeo,new T.PointsMaterial({map:texture,color:'#fff1c9',size:1.1,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending})));
  return {texture,setTone(tone){const p=palettes[tone]??palettes.peach;uniforms.top.value.set(p[0]);uniforms.mid.value.set(p[1]);uniforms.bottom.value.set(p[2]);cloudUniforms.tint.value.set(p[3]);scene.fog.color.set(p[3]);},
    update(t,camera){
      uniforms.time.value=t;clouds.rotation.y=t*.001;haze.rotation.y=t*.0006;
      for(const g of isles.children)g.position.y=g.userData.y+Math.sin(t*.15+g.userData.p)*.8;
      for(let i=0;i<SP;i++){const a=i*2.399+t*.01*(i%3+1),r=20+(i*37)%120;spark.set([Math.cos(a)*r,-4+(i*7.3+t*.4)%34,Math.sin(a)*r],i*3);}
      sparkGeo.attributes.position.needsUpdate=true;
      if(camera)sky.position.copy(camera.position);   // the dome travels with the eye: no outside to see
    }};
}

const ramp=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// Weather is one continuous strain value (0..1) and reads from the sky view:
// the sun glow fades as cloud gathers; the cloud deck thickens and darkens;
// low mist comes and goes in the middle; past ~0.55 rain starts as a drizzle
// and grows into a shower. `radius` is the island's, in world units.
export function createWeather(texture,radius=26) {
  const group=new T.Group(), mist=new T.Group(), R=radius;group.add(mist);
  const sprite=(color,blending=T.NormalBlending)=>new T.Sprite(new T.SpriteMaterial({map:texture,color,opacity:0,transparent:true,depthWrite:false,blending}));
  // the cloud deck: each puff arrives at its own strain, so cover accumulates
  const deck=[], light=new T.Color('#f0eef4'), dark=new T.Color('#65607f');
  for(let i=0;i<18;i++){
    const a=i*2.399, r=Math.sqrt((i+.5)/18)*R*.5, s=sprite('#f0eef4');
    s.position.set(Math.cos(a)*r,19+(i%3)*.9,Math.sin(a)*r);s.scale.set(24*(1+(i%4)*.15),10,1);
    s.userData.from=.12+.45*((i*7)%18)/18;group.add(s);deck.push(s);
  }
  // low mist banks hugging the island
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2,s=sprite('#eceef0');s.position.set(Math.cos(a)*R*.55,1.2+(i%3)*.8,Math.sin(a)*R*.55);s.scale.set(R*.9,7,1);mist.add(s);}
  // rain: a streaked shaft that fades top and bottom, plus close-up streaks
  const paint=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));return new T.CanvasTexture(c);};
  const streaks=paint(64,128,x=>{for(let i=0;i<70;i++){const px=Math.random()*64,py=Math.random()*128;
    x.strokeStyle=`rgba(225,235,248,${.25+Math.random()*.55})`;x.lineWidth=1+Math.random();x.beginPath();x.moveTo(px,py);x.lineTo(px-2,py+18+Math.random()*20);x.stroke();}});
  streaks.wrapS=streaks.wrapT=T.RepeatWrapping;streaks.repeat.set(7,1.5);
  const fade=paint(4,64,x=>{const g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'#000');g.addColorStop(.25,'#fff');g.addColorStop(.7,'#fff');g.addColorStop(1,'#000');x.fillStyle=g;x.fillRect(0,0,4,64);});
  const shaft=new T.Mesh(new T.CylinderGeometry(R*.42,R*.5,16,32,1,true),
    new T.MeshBasicMaterial({map:streaks,alphaMap:fade,color:'#8e9bbd',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
  shaft.position.y=10;shaft.scale.y=1.2;group.add(shaft);
  const DROPS=320,positions=new Float32Array(DROPS*6),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const drops=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#d4e4f0',transparent:true,opacity:.6,depthWrite:false}));group.add(drops);
  // clear: a soft warm sun glow
  const glow=sprite('#ffc766',T.AdditiveBlending);glow.position.y=22;glow.scale.setScalar(22);group.add(glow);

  let strain=0, rain=0;
  function setStrain(s){
    strain=Math.min(1,Math.max(0,s));
    const tone=ramp(.3,.9,strain);
    for(const p of deck){p.material.opacity=ramp(p.userData.from,p.userData.from+.1,strain)*.95;p.material.color.copy(light).lerp(dark,tone);}
    const m=ramp(.2,.4,strain)*(1-ramp(.65,.85,strain))*.5;for(const b of mist.children)b.material.opacity=m;
    rain=ramp(.55,.95,strain);
    shaft.material.opacity=rain*.85;shaft.visible=rain>0;
    geometry.setDrawRange(0,Math.floor(DROPS*ramp(.5,1,strain))*2);drops.visible=strain>.5;
  }
  setStrain(0);
  return {group,setStrain,
    update(t){
      if(shaft.visible)streaks.offset.y=t*(.6+rain*.8);
      if(drops.visible){
        for(let i=0;i<DROPS;i++){const y=15-(i*.21+t*(3+4*rain))%14,x=Math.sin(i*12.2)*R*.4,z=Math.cos(i*2.8)*R*.4;positions.set([x,y,z,x-.05,y-.5,z],i*6);}
        geometry.attributes.position.needsUpdate=true;
      }
      mist.rotation.y=Math.sin(t*.05)*.2;
      glow.material.opacity=(1-ramp(.1,.3,strain))*(.72+Math.sin(t*.6)*.08);
    }};
}
