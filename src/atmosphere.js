import * as T from 'three';
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+11.4;a*=.5;}return v;}`;
// the cloud sea's own tint, shared so anything cloudy can match it
export const cloudTint=new T.Color('#f5cfbf');
const palettes={peach:['#787da9','#c0afd0','#ffd7b2','#f5cfbf'],lavender:['#666b9b','#ae9bcb','#eec7d5','#cdbbd9'],mint:['#77a8b8','#b3d2c9','#ffe0b8','#c5dcd2']};
export function createAtmosphere(scene) {
  const uniforms={top:{value:new T.Color()},mid:{value:new T.Color()},bottom:{value:new T.Color()},time:{value:0}};
  const sky=new T.Mesh(new T.SphereGeometry(450,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vWorld;uniform vec3 top,mid,bottom;uniform float time;${noise}
void main(){vec3 d=normalize(vWorld);float h=d.y;vec3 col=mix(bottom,mid,smoothstep(-.2,.28,h));col=mix(col,top,smoothstep(.15,.8,h));float sun=pow(max(0.,dot(d,normalize(vec3(-.8,.13,-1.)))),18.);col+=vec3(.17,.10,.025)*sun;float clouds=fbm(d.xz*5./max(.25,abs(d.y)+.3)+time*.002);float veil=smoothstep(.48,.77,clouds)*(1.-smoothstep(.08,.6,h));col=mix(col,bottom*1.07,veil*.38);float stars=step(.9978,hash(floor(d.xz/max(.16,h)*340.)))*smoothstep(.28,.75,h);col+=stars*.38;gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  scene.add(sky);
  const cloudUniforms={time:uniforms.time,tint:{value:cloudTint}};
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
  // far scenery for the sky view: small rock islands adrift, thin high cloud,
  // and a sky whale with her calf
  const isles=new T.Group(), haze=new T.Group();scene.add(isles,haze);
  const mat=c=>new T.MeshStandardMaterial({color:c,roughness:1,flatShading:true});
  const leaves=[mat('#a9c08a'),mat('#e9bfcc'),mat('#c9b6e4')], bark=mat('#9a7a62');
  // displacement comes from the vertex position, so shared corners stay joined
  const hash=(x,y,z)=>{const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s);};
  const grassC=new T.Color('#b9cf8c'), rockC=new T.Color('#c6b3a6'), rockD=new T.Color('#a38e80');
  function rockIsle(s,seed){
    const geo=new T.IcosahedronGeometry(1,2), p=geo.attributes.position, col=new Float32Array(p.count*3), c=new T.Color();
    for(let i=0;i<p.count;i++){
      let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const h=hash(x+seed,y,z), h2=hash(z,x+seed,y);
      if(y>-.05){y=.16+y*.16+(h-.5)*.05;x*=1.08+(h2-.5)*.14;z*=1.08+(h-.5)*.14;c.copy(grassC).offsetHSL(0,0,(h-.5)*.06);}   // a softly domed grassy top
      else{const k=-y,taper=1-k*.55;y=-k*(1.5+h*.9);x*=taper*(1+(h2-.5)*.35);z*=taper*(1+(h-.5)*.35);c.copy(rockC).lerp(rockD,h2);}  // a jagged keel
      p.setXYZ(i,x*s,y*s,z*s);col.set([c.r,c.g,c.b],i*3);
    }
    geo.setAttribute('color',new T.BufferAttribute(col,3));geo.computeVertexNormals();
    return new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
  }
  for(let i=0;i<9;i++){
    const a=i*2.399+.6, r=280+(i*53)%150, s=5+(i*7)%9, g=new T.Group();
    g.add(rockIsle(s,i*1.7));
    for(let k=0;k<1+i%3;k++){
      const x=(k-1)*s*.35, z=((k*5)%3-1)*s*.25;
      const trunk=new T.Mesh(new T.CylinderGeometry(s*.05,s*.07,s*.45,5),bark);trunk.position.set(x,s*.4,z);
      const crown=new T.Mesh(new T.IcosahedronGeometry(s*(.24+.06*k),0),leaves[(i+k)%3]);crown.position.set(x,s*(.72+.05*k),z);
      g.add(trunk,crown);
    }
    g.position.set(Math.cos(a)*r,-2+(i*17)%38,Math.sin(a)*r);g.rotation.y=a;g.userData={y:g.position.y,p:i};isles.add(g);
  }
  // A humpback, lofted along its spine (head at +z): a broad, flat-topped head,
  // a pale grooved throat, long pectoral fins, a small dorsal fin, wide flukes.
  // The back half undulates in a travelling wave, so the tail beats slowly.
  const PROFILE=[[0,.05],[.1,.11],[.25,.3],[.45,.72],[.62,.92],[.8,.86],[.92,.62],[1,.16]];   // [along the body, radius]
  const girth=f=>{
    for(let i=1;i<PROFILE.length;i++)if(f<=PROFILE[i][0]){const [f0,r0]=PROFILE[i-1],[f1,r1]=PROFILE[i],u=(f-f0)/(f1-f0);return r0+(r1-r0)*u*u*(3-2*u);}
    return PROFILE.at(-1)[1];
  };
  const blade=(pts,material)=>{const s=new T.Shape();s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);return new T.Mesh(new T.ShapeGeometry(s),material);};
  function whale(size){
    const g=new T.Group(), RINGS=30, SEG=20, LEN=6;
    const back=new T.Color('#2c4a93'), flank=new T.Color('#4a6fc0'), throat=new T.Color('#d3daee'), groove=new T.Color('#aab7da');
    const pos=[], col=[], rest=[], index=[];
    for(let i=0;i<RINGS;i++){
      const f=i/(RINGS-1), r=girth(f), z=(f-.5)*LEN;
      for(let j=0;j<SEG;j++){
        const a=j/SEG*Math.PI*2, up=Math.cos(a), y=up*r*(up>0&&f>.7?.62:.8);   // a flatter crown over the head
        pos.push(Math.sin(a)*r,y,z);rest.push(y);
        const c=up<-.25&&f>.42?(Math.sin(a*22)>0?throat:groove):back.clone().lerp(flank,(1-up)/2);
        col.push(c.r,c.g,c.b);
      }
    }
    for(let i=0;i<RINGS-1;i++)for(let j=0;j<SEG;j++){const a=i*SEG+j,b=i*SEG+(j+1)%SEG;index.push(a,a+SEG,b,b,a+SEG,b+SEG);}
    const tail=pos.length/3;pos.push(0,0,-LEN/2-.05);rest.push(0);col.push(back.r,back.g,back.b);
    const nose=pos.length/3;pos.push(0,-.02,LEN/2+.12);rest.push(-.02);col.push(back.r,back.g,back.b);
    for(let j=0;j<SEG;j++){index.push(tail,(j+1)%SEG,j);const o=(RINGS-1)*SEG;index.push(nose,o+j,o+(j+1)%SEG);}
    const geo=new T.BufferGeometry();geo.setIndex(index);
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.computeVertexNormals();
    // self-lit a little, so backlight and haze never turn it black
    const skin=new T.MeshStandardMaterial({vertexColors:true,roughness:.65,emissive:'#22387a',emissiveIntensity:.5,side:T.DoubleSide});
    const finMat=new T.MeshStandardMaterial({color:'#34549f',roughness:.7,emissive:'#22387a',emissiveIntensity:.5,side:T.DoubleSide});
    g.add(new T.Mesh(geo,skin));
    // long pectoral fins -- the humpback's signature -- laid flat, reaching out and back
    const pecs=[-1,1].map(s=>{
      const p=new T.Group();p.position.set(s*.7,-.42,1.1);p.scale.x=s;
      const m=blade([[0,.2],[.9,.35],[1.8,.65],[2.35,.85],[2.4,.7],[1.7,.35],[.8,0],[0,-.22]],finMat);m.rotation.x=-Math.PI/2;
      p.add(m);g.add(p);return p;
    });
    const dorsal=blade([[-.1,0],[.55,0],[.42,.2],[.3,.24]],finMat);dorsal.rotation.y=Math.PI/2;dorsal.position.set(0,girth(.32)*.8-.04,(.32-.5)*LEN);g.add(dorsal);
    const flukes=new T.Group();
    const half=[[0,-.1],[.4,.05],[1,.3],[1.4,.55],[1.45,.72],[1.1,.62],[.55,.5],[.12,.58],[0,.45]];
    const fl=blade([...half,...half.slice(1,-1).reverse().map(([x,y])=>[-x,y])],finMat);fl.rotation.x=-Math.PI/2;flukes.add(fl);g.add(flukes);
    for(const s of [-1,1]){const eye=new T.Mesh(new T.SphereGeometry(.05,8,6),new T.MeshBasicMaterial({color:'#101830'}));eye.position.set(s*.56,.02,(.9-.5)*LEN);g.add(eye);}
    const attr=geo.attributes.position;
    const heave=(f,t)=>(f<.62?((.62-f)/.62)**2*.55*Math.sin(t*1.25-f*4.5):0)+(f<.4?((.4-f)/.4)**2*.3:0);   // wave + the tail stock's upward sweep
    g.userData.swim=t=>{
      for(let i=0;i<RINGS;i++){const d=heave(i/(RINGS-1),t);for(let j=0;j<SEG;j++){const n=i*SEG+j;attr.setY(n,rest[n]+d);}}
      const d0=heave(0,t);attr.setY(tail,d0);attr.needsUpdate=true;geo.computeVertexNormals();
      flukes.position.set(0,d0,-LEN/2);flukes.rotation.x=-Math.atan((heave(.05,t)-d0)/(.05*LEN))*1.4;   // flukes tilt with the beat
      pecs.forEach(p=>{p.rotation.z=-.45+Math.sin(t*.8)*.16;});
    };
    g.scale.setScalar(size);scene.add(g);return g;
  }
  // The whales swim fixed lanes in the world: wide circles far out round the
  // neighbourhood, softened by haze, so turning the camera shows them from a
  // new angle, just like the distant isles. Swimming along a circle keeps them
  // side-on from the islands. Five groups spread round the ring (two going the
  // other way), so wherever you look one comes by every half minute or so.
  // `a` start angle (radians; the sky view looks toward -pi/2, so the mother
  // and calf are in view at load), `r` lane radius, `speed` units a second.
  const pods=[
    {size:18,r:650,y:80,speed:16,dir:1,a:-1.75},{size:9,r:650,y:70,speed:16,dir:1,a:-1.83},   // mother and calf
    {size:15,r:820,y:130,speed:13,dir:-1,a:-.6},                                                  // a higher adult, the other way
    {size:11,r:900,y:40,speed:11,dir:1,a:.9},                                                      // a small far one
    {size:16,r:720,y:95,speed:15,dir:1,a:2.4},{size:8,r:720,y:86,speed:15,dir:1,a:2.33},        // a second pair
    {size:13,r:780,y:60,speed:12,dir:-1,a:-2.9},                                                   // a lone one, the other way
  ].map(p=>({...p,w:whale(p.size)}));
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
      // each whale swims round its circle for good, heading along it
      pods.forEach((p,k)=>{
        const th=p.a+p.dir*p.speed*t/p.r;
        p.w.position.set(Math.cos(th)*p.r,p.y+Math.sin(t*.25+k)*3,Math.sin(th)*p.r);
        p.w.rotation.set(Math.sin(t*.25+k)*.03,Math.atan2(-Math.sin(th)*p.dir,Math.cos(th)*p.dir),Math.sin(t*.2+k)*.04);
        p.w.userData.swim(t+k*.9);
      });
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
  // the cloud deck spans the whole island; each puff arrives at its own strain
  // (in scattered order), so cover accumulates everywhere at once
  const deck=[], light=new T.Color('#f0eef4'), dark=new T.Color('#65607f'), PUFFS=34;
  for(let i=0;i<PUFFS;i++){
    const a=i*2.399, r=Math.sqrt((i+.5)/PUFFS)*R*.95, s=sprite('#f0eef4');
    s.position.set(Math.cos(a)*r,19+(i%3)*.9,Math.sin(a)*r);s.scale.set(28*(1+(i%4)*.15),11,1);
    // a fixed draw order: re-sorting overlapping puffs as the camera moves made them blink
    s.userData.from=.12+.45*((i*13)%PUFFS)/PUFFS;s.renderOrder=10+i;group.add(s);deck.push(s);
  }
  // low mist banks hugging the island's edge
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,s=sprite('#eceef0');s.position.set(Math.cos(a)*R*.8,1.2+(i%3)*.8,Math.sin(a)*R*.8);s.scale.set(R*.9,7,1);s.renderOrder=4+i;mist.add(s);}
  // rain: a streaked shaft that fades top and bottom, plus close-up streaks
  const paint=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));return new T.CanvasTexture(c);};
  const streaks=paint(64,128,x=>{for(let i=0;i<70;i++){const px=Math.random()*64,py=Math.random()*128;
    x.strokeStyle=`rgba(225,235,248,${.25+Math.random()*.55})`;x.lineWidth=1+Math.random();x.beginPath();x.moveTo(px,py);x.lineTo(px-2,py+18+Math.random()*20);x.stroke();}});
  streaks.wrapS=streaks.wrapT=T.RepeatWrapping;streaks.repeat.set(7,1.5);
  const fade=paint(4,64,x=>{const g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'#000');g.addColorStop(.25,'#fff');g.addColorStop(.7,'#fff');g.addColorStop(1,'#000');x.fillStyle=g;x.fillRect(0,0,4,64);});
  const shaft=new T.Mesh(new T.CylinderGeometry(R*.8,R*.9,16,40,1,true),
    new T.MeshBasicMaterial({map:streaks,alphaMap:fade,color:'#8e9bbd',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
  shaft.position.y=10;shaft.scale.y=1.2;group.add(shaft);
  const DROPS=700,positions=new Float32Array(DROPS*6),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const drops=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#d4e4f0',transparent:true,opacity:.6,depthWrite:false}));group.add(drops);
  // clear: a soft warm sun glow
  const glow=sprite('#ffc766',T.AdditiveBlending);glow.position.y=22;glow.scale.setScalar(22);group.add(glow);

  let strain=0, rain=0;
  function setStrain(s){
    strain=Math.min(1,Math.max(0,s));
    const tone=ramp(.3,.9,strain);
    for(const p of deck){p.userData.base=ramp(p.userData.from,p.userData.from+.1,strain)*.95;p.material.opacity=p.userData.base;p.material.color.copy(light).lerp(dark,tone);}
    const m=ramp(.2,.4,strain)*(1-ramp(.65,.85,strain))*.5;for(const b of mist.children){b.userData.base=m;b.material.opacity=m;}
    rain=ramp(.55,.95,strain);
    shaft.material.opacity=rain*.85;shaft.visible=rain>0;
    geometry.setDrawRange(0,Math.floor(DROPS*ramp(.5,1,strain))*2);drops.visible=strain>.5;
  }
  setStrain(0);
  const eye=new T.Vector3();
  return {group,setStrain,
    update(t,camera){
      // fade what the camera is about to fly through, instead of letting a
      // puff (or the rain column) suddenly fill the whole screen
      if(camera){
        eye.copy(camera.position).sub(group.position);
        for(const p of deck)p.material.opacity=p.userData.base*ramp(8,24,eye.distanceTo(p.position));
        for(const b of mist.children)b.material.opacity=b.userData.base*ramp(4,14,eye.distanceTo(b.position));
        shaft.material.opacity=rain*.85*ramp(R*.7,R*1.1,Math.hypot(eye.x,eye.z));
      }
      if(shaft.visible)streaks.offset.y=t*(.6+rain*.8);
      if(drops.visible){
        for(let i=0;i<DROPS;i++){const y=15-(i*.21+t*(3+4*rain))%14,a=i*2.399,d=Math.sqrt((i*.618)%1)*R*.85,x=Math.cos(a)*d,z=Math.sin(a)*d;positions.set([x,y,z,x-.05,y-.5,z],i*6);}
        geometry.attributes.position.needsUpdate=true;
      }
      mist.rotation.y=Math.sin(t*.05)*.2;
      glow.material.opacity=(1-ramp(.1,.3,strain))*(.72+Math.sin(t*.6)*.08);
    }};
}

// A cloud bank that gathers around an island as its week fills up: the lower it
// sinks, the thicker the clouds hugging its rim. Billboards only, and drawn
// solely while the island is low, so a light week costs nothing. The puff is
// drawn as a row of lobes, so its silhouette reads as billows, not as haze.
let puff=null;
const puffTexture=()=>{
  if(puff)return puff;
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  const blob=(cx,cy,r,a)=>{
    const g=x.createRadialGradient(cx,cy,r*.15,cx,cy,r);
    g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(.55,`rgba(255,255,255,${a*.5})`);g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
  };
  blob(128,158,112,.5);                                   // the body of the cloud
  for(const [cx,cy,r,a] of [[128,104,74,.95],[68,134,58,.85],[188,140,56,.85],[98,166,54,.7],[162,170,52,.7]])blob(cx,cy,r,a);
  puff=new T.CanvasTexture(c);return puff;
};

export function createSinkBank(radius=26){
  const group=new T.Group(), puffs=[], map=puffTexture();
  // lit: the same cream the cloud sea catches the light with. shade: the sea's
  // own tint, darkened. Both follow the sky tone, so the bank never goes cold.
  const lit=new T.Color(1,.92,.84), shade=new T.Color();
  let tone=-1;
  const mk=(a,r,y,sx,sy,up,o,order,from)=>{
    const s=new T.Sprite(new T.SpriteMaterial({map,transparent:true,opacity:0,depthWrite:false}));
    s.position.set(Math.cos(a)*r,y,Math.sin(a)*r);s.scale.set(sx,sy,1);s.userData={o,up,from};s.renderOrder=order;
    group.add(s);puffs.push(s);
  };
  const recolour=()=>{
    tone=cloudTint.getHex();shade.copy(cloudTint).multiplyScalar(.88);
    for(const s of puffs)s.material.color.copy(s.userData.up?lit:shade);
  };
  for(let i=0;i<14;i++){const a=(i+.5)/14*Math.PI*2;mk(a,radius*1.25,-9.5+(i%2)*1.1,radius*1.05,radius*.34,0,.8,2+i,.02);}   // the deep bank, in shadow
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;mk(a,radius*1.06,-5.4+(i%3)*.9,radius*.9,radius*.32,1,1,6+i,.34+(i%4)*.12);}  // lit tops, rising to the rim
  group.visible=false;
  return {group,
    // nothing until the island dips below -2; full cover by the floor at -10
    set(altitude){
      const t=Math.min(1,Math.max(0,(-2-altitude)/8));
      group.visible=t>.02;if(tone!==cloudTint.getHex())recolour();
      // each puff waits its turn, so the bank rises from below rather than all at once
      for(const s of puffs){const {o,from}=s.userData;s.material.opacity=Math.max(0,Math.min(1,(t-from)/(1-from)))*o;}
    },
    update(elapsed){if(!group.visible)return;if(tone!==cloudTint.getHex())recolour();group.rotation.y=elapsed*.02;}};
}
