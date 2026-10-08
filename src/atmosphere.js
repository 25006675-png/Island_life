import * as T from 'three';
import { CLOUD_SEA, LOW, HIGH } from './data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+11.4;a*=.5;}return v;}`;
// the cloud sea's own tint, shared so anything cloudy can match it
export const cloudTint=new T.Color('#f5cfbf');
// A sky tone sets the sky (top, middle, horizon), the cloud sea (shade, lit tops, billows), the fog and the light.
// Violet dusk is the welcome page's evening: violet light from above, orange bounced up from below and a warm
// sun, so shade turns violet and lit sides turn gold. The older tones keep their softer, near-white light.
const SOFT={sky:'#fff2d4',ground:'#8d92aa',hemi:1.15,sun:'#ffdeb2',sunI:2.0,fill:'#bcd9e5',fillI:.9};
export const TONES={
  dusk:    {sky:['#2a1f5c','#6c47aa','#ff9f70'],tint:'#d2c0ea',lit:'#fbe6ea',billow:'#f3e8f6',fog:['#8f73bd',.0009],
            light:{sky:'#b8a6f2',ground:'#e9ad9c',hemi:1.2,sun:'#ffe2c4',sunI:2.25,fill:'#b49cff',fillI:.8}},
  peach:   {sky:['#787da9','#c0afd0','#ffd7b2'],tint:'#f5cfbf',lit:'#ffe6cf',billow:'#ffe3d3',fog:['#f5cfbf',.0009],light:SOFT},
  lavender:{sky:['#666b9b','#ae9bcb','#eec7d5'],tint:'#cdbbd9',lit:'#ffe6cf',billow:'#ffe3d3',fog:['#cdbbd9',.0009],light:SOFT},
  mint:    {sky:['#77a8b8','#b3d2c9','#ffe0b8'],tint:'#c5dcd2',lit:'#ffe6cf',billow:'#ffe3d3',fog:['#c5dcd2',.0009],light:SOFT}};
// Many soft camera-facing puffs in ONE draw call. Each puff is an instance of a unit quad that the vertex shader
// turns to face the camera (like a Sprite) and sizes from its instance scale. Same look as separate Sprites,
// without a draw call per puff. Draw order inside the batch is fixed, which suits overlapping soft puffs.
export function puffBatch(items,{map,color='#ffffff',blending=T.NormalBlending}={}){
  const n=items.length, mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),null,n), op=new Float32Array(n), m=new T.Matrix4();
  items.forEach((it,i)=>{m.makeScale(it.sx,it.sy,1).setPosition(it.x,it.y,it.z);mesh.setMatrixAt(i,m);op[i]=it.opacity??1;});
  mesh.geometry.setAttribute('aOpacity',new T.InstancedBufferAttribute(op,1));
  mesh.material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending,fog:true,
    uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{map:{value:null},color:{value:new T.Color(color)}}]),
    vertexShader:`attribute float aOpacity;varying float vO;varying vec2 vUv;
#include <fog_pars_vertex>
void main(){vUv=uv;vO=aOpacity;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
  vec2 s=vec2(length(instanceMatrix[0].xyz)*length(modelMatrix[0].xyz),length(instanceMatrix[1].xyz)*length(modelMatrix[1].xyz));
  mvPosition.xy+=position.xy*s;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform sampler2D map;uniform vec3 color;varying float vO;varying vec2 vUv;
#include <fog_pars_fragment>
void main(){vec4 t=texture2D(map,vUv);gl_FragColor=vec4(color*t.rgb,t.a*vO);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`});
  mesh.material.uniforms.map.value=map;mesh.frustumCulled=false;
  mesh.setOpacity=(i,o)=>{op[i]=o;mesh.geometry.attributes.aOpacity.needsUpdate=true;};
  return mesh;
}

export function createAtmosphere(scene) {
  const uniforms={top:{value:new T.Color()},mid:{value:new T.Color()},bottom:{value:new T.Color()},time:{value:0}};
  const sky=new T.Mesh(new T.SphereGeometry(450,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vWorld;uniform vec3 top,mid,bottom;uniform float time;${noise}
void main(){vec3 d=normalize(vWorld);float h=d.y;vec3 col=mix(bottom,mid,smoothstep(-.2,.28,h));col=mix(col,top,smoothstep(.15,.8,h));float sun=pow(max(0.,dot(d,normalize(vec3(-.8,.13,-1.)))),18.);col+=vec3(.17,.10,.025)*sun;float clouds=fbm(d.xz*5./max(.25,abs(d.y)+.3)+time*.002);float veil=smoothstep(.48,.77,clouds)*(1.-smoothstep(.08,.6,h));col=mix(col,bottom*1.07,veil*.38);float stars=step(.9978,hash(floor(d.xz/max(.16,h)*340.)))*smoothstep(.28,.75,h);col+=stars*.38;gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  scene.add(sky);
  const cloudUniforms={time:uniforms.time,tint:{value:cloudTint},lit:{value:new T.Color('#ffe6cf')},holes:{value:[...Array(6)].map(()=>new T.Vector4())}};
  // the cloud sea is far wider than any view and fades out, so no edge ever shows
  const sea=new T.Mesh(new T.PlaneGeometry(4000,4000),new T.ShaderMaterial({uniforms:cloudUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 tint,lit;uniform vec4 holes[6];${noise}
void main(){vec2 p=vWorld.xz*.011+vec2(time*.001,0.);float open=0.;vec2 sw=vec2(0.);for(int i=0;i<6;i++){vec4 h=holes[i];if(h.w<=0.)continue;vec2 d=vWorld.xz-h.xy;float r=length(d);float k=h.w*(1.-smoothstep(h.z*.5,h.z*1.4,r));if(k>0.){float an=atan(d.y,d.x)+time*.06+(1.-min(1.,r/h.z))*1.8;sw+=vec2(cos(an),sin(an))*k;open=max(open,k);}}float n=fbm(p+sw*.6);float detail=fbm(p*3.+sw);vec3 col=mix(tint*.92,lit,smoothstep(.12,.95,n));col+=pow(detail,3.)*.06;float wisp=smoothstep(.32,.82,fbm(vWorld.xz*.045+sw*1.6+vec2(time*.03,-time*.02)));float alpha=.98*(1.-smoothstep(700.,1800.,length(vWorld.xz)))*mix(1.,.1+.6*wisp,open);gl_FragColor=vec4(col,alpha);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  sea.rotation.x=-Math.PI/2;sea.position.y=CLOUD_SEA;scene.add(sea);
  // Soft billows use one shared procedural sprite, keeping the cloud sea inexpensive.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.55)');gradient.addColorStop(.45,'rgba(255,255,255,.26)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas),clouds=new T.Group();scene.add(clouds);
  const billows=puffBatch([...Array(100)].map((_,n)=>{const angle=n*2.399,r=22+Math.sqrt(n/100)*150;return {x:Math.cos(angle)*r,y:CLOUD_SEA+4+(n%5)*.5,z:Math.sin(angle)*r,sx:30+n%7*5,sy:11+n%4*3,opacity:.45};}),{map:texture,color:'#ffe3d3'});clouds.add(billows);
  const bands=new T.Group();scene.add(bands);
  for(const y of [LOW+15,0,HIGH*.5,HIGH+12]){const band=new T.Mesh(new T.CylinderGeometry(190,190,.13,100,1,true),new T.MeshBasicMaterial({color:'#fae5c1',transparent:true,opacity:.095,side:T.DoubleSide,depthWrite:false}));band.position.y=y;bands.add(band);}
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
    return geo;
  }
  // one draw per isle: every part carries its colour in its vertices and joins the rock's geometry
  const isleMat=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});
  const painted=(geo,color,x=0,y=0,z=0)=>{const g=(geo.index?geo.toNonIndexed():geo);g.deleteAttribute('uv');g.translate(x,y,z);
    if(!g.attributes.color){const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);g.setAttribute('color',new T.BufferAttribute(a,3));}return g;};
  for(let i=0;i<9;i++){
    const a=i*2.399+.6, r=280+(i*53)%150, s=5+(i*7)%9, g=new T.Group();
    const parts=[painted(rockIsle(s,i*1.7))];
    for(let k=0;k<1+i%3;k++){
      const x=(k-1)*s*.35, z=((k*5)%3-1)*s*.25;
      parts.push(painted(new T.CylinderGeometry(s*.05,s*.07,s*.45,5),bark.color,x,s*.4,z));
      parts.push(painted(new T.IcosahedronGeometry(s*(.24+.06*k),0),leaves[(i+k)%3].color,x,s*(.72+.05*k),z));
    }
    const merged=mergeGeometries(parts);merged.computeVertexNormals();g.add(new T.Mesh(merged,isleMat));
    g.position.set(Math.cos(a)*r,CLOUD_SEA+10+(i*17)%(HIGH+20-CLOUD_SEA),Math.sin(a)*r);g.rotation.y=a;g.userData={y:g.position.y,p:i};isles.add(g);
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
      const d0=heave(0,t);attr.setY(tail,d0);attr.needsUpdate=true;   // normals stay as at rest: far away and a small bend, so recomputing them every frame bought nothing
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
  haze.add(puffBatch([...Array(26)].map((_,n)=>{const a=n*2.399+.3,r=160+(n*37)%230;return {x:Math.cos(a)*r,y:24+(n*13)%46,z:Math.sin(a)*r,sx:60+(n%5)*14,sy:14+(n%3)*5,opacity:.16+(n%4)*.04};}),{map:texture,color:'#fff3ea'}));
  // drifting sparkles: a little light in the air, rising slowly and wrapping round
  const SP=140, spark=new Float32Array(SP*3), sparkGeo=new T.BufferGeometry();
  sparkGeo.setAttribute('position',new T.BufferAttribute(spark,3));
  scene.add(new T.Points(sparkGeo,new T.PointsMaterial({map:texture,color:'#fff1c9',size:1.1,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending})));
  return {texture,light:TONES.dusk.light,
    // islands down in the cloud sea open it into wisps round them (main.js, every frame)
    setHoles(islands){const h=cloudUniforms.holes.value;for(let k=0;k<h.length;k++){const i=islands[k];
      h[k].set(i?.x??0,i?.z??0,(i?.scale??2)*21,i?Math.min(1,Math.max(0,(CLOUD_SEA+28-i.altitude)/(CLOUD_SEA+28-LOW))):0);}},
    setTone(name){const p=TONES[name]??TONES.dusk;uniforms.top.value.set(p.sky[0]);uniforms.mid.value.set(p.sky[1]);uniforms.bottom.value.set(p.sky[2]);
      cloudUniforms.tint.value.set(p.tint);cloudUniforms.lit.value.set(p.lit);billows.material.uniforms.color.value.set(p.billow);
      scene.fog.color.set(p.fog[0]);scene.fog.density=p.fog[1];this.light=p.light;},
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
      for(let i=0;i<SP;i++){const a=i*2.399+t*.01*(i%3+1),r=20+(i*37)%120,k=i*3;spark[k]=Math.cos(a)*r;spark[k+1]=CLOUD_SEA+6+(i*7.3+t*.4)%(HIGH+20-CLOUD_SEA);spark[k+2]=Math.sin(a)*r;}   // written in place: no throwaway arrays
      sparkGeo.attributes.position.needsUpdate=true;
      if(camera)sky.position.copy(camera.position);   // the dome travels with the eye: no outside to see
    }};
}

const ramp=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// Weather is one continuous strain value (0..1) and reads from the sky view:
// the sun glow fades as cloud gathers; the cloud deck thickens and darkens;
// low mist comes and goes in the middle; past ~0.55 rain starts as a drizzle
// and grows into a shower. `radius` is the island's, in world units.
// Cumulus, drawn once on canvases: a flat-bottomed heap of soft, cotton-edged lobes, biggest in the middle, white
// where the sun catches the top and a gentle lavender-grey underneath, then blurred, so they read as vapour rather
// than as solid shapes. Four variations, so no two clumps match.
let cumulus=null;
function cumulusTextures(){
  if(cumulus)return cumulus;
  cumulus=[0,1,2,3].map(v=>{
    const W=256,H=160,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
    let s=v*7919+17;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};
    const base=H*.78;
    const lobe=(x,y,rad,al)=>{const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,`rgba(255,255,255,${al})`);gr.addColorStop(.55,`rgba(255,255,255,${al*.85})`);gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gr;g.beginPath();g.arc(x,y,rad,0,7);g.fill();};
    for(let i=0;i<22;i++){const t=r(),mid=1-Math.abs(t-.5)*2,x=W*(.12+.76*t),rad=12+mid*24+r()*12,y=base-rad*.45-mid*mid*26-r()*10;lobe(x,y,rad,.75+r()*.25);}
    for(let i=0;i<6;i++)lobe(W*(.25+.5*r()),base-6-r()*6,22+r()*10,.6);   // a soft, flattish underside
    g.globalCompositeOperation='source-atop';
    const gr=g.createLinearGradient(0,H*.15,0,base+6);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.6,'rgba(214,206,236,.22)');gr.addColorStop(1,'rgba(172,162,206,.5)');
    g.fillStyle=gr;g.fillRect(0,0,W,H);
    const out=document.createElement('canvas');out.width=W;out.height=H;const o=out.getContext('2d');o.filter='blur(4px)';o.drawImage(c,0,0);
    const tex=new T.CanvasTexture(out);tex.colorSpace=T.SRGBColorSpace;return tex;
  });
  return cumulus;
}
export function createWeather(texture,radius=26) {
  const group=new T.Group(), mist=new T.Group(), R=radius;group.add(mist);
  const sprite=(color,blending=T.NormalBlending)=>new T.Sprite(new T.SpriteMaterial({map:texture,color,opacity:0,transparent:true,depthWrite:false,blending}));
  // The clouds over an island: separate cumulus clumps drifting above it, with sky between them, so the ground
  // stays in view. Each clump is a few puffs of real cloud shape (cumulusTextures: round lobes, lit on top, shaded
  // underneath). More clumps gather, and darken, as its sky turns heavier; rain brings the darkest. One draw per
  // cloud shape (puffBatch), drifting slowly round.
  const deckGroup=new T.Group(), deck=[], light=new T.Color('#ffffff'), dark=new T.Color('#7a7499'), CLUMPS=6;
  group.add(deckGroup);
  const shapes=cumulusTextures(), items=shapes.map(()=>[]);
  for(let k=0;k<CLUMPS;k++){
    const a=k*2.399+.4, r=R*(.18+.62*((k*.618)%1)), cx=Math.cos(a)*r, cz=Math.sin(a)*r, cy=20+(k%3)*1.6, from=.12+k*.075, size=11+(k%3)*2.5;
    const across=new T.Vector2(-Math.sin(a),Math.cos(a));
    for(let j=0;j<7;j++){   // a loose heap: four along the bottom, three smaller ones riding higher, each nudged
      const top=j>=4, n=k*7+j, jit=((n*.618)%1-.5), along=top?(j-5)*size*.34+jit*size*.2:(j-1.5)*size*.42+jit*size*.15;
      const s=size*(top?.62+((n*.37)%1)*.18:.78+((n*.29)%1)*.3), depth=jit*size*.35;
      const p={x:cx+across.x*along-across.y*depth,y:cy+(top?size*.2+jit*2:jit*1.2),z:cz+across.y*along+across.x*depth,sx:s,sy:s*.62,opacity:0};
      const v=(k+j)%shapes.length;deck.push({v,i:items[v].length,pos:new T.Vector3(p.x,p.y,p.z),from:from+j*.01,base:0});items[v].push(p);
    }
  }
  const batches=items.map((list,v)=>{const b=puffBatch(list,{map:shapes[v]});b.renderOrder=10+v;deckGroup.add(b);return b;});
  // low mist, out past the island's edge only, so it never lies over the grass
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,s=sprite('#eceef0');s.position.set(Math.cos(a)*R*1.15,1.2+(i%3)*.8,Math.sin(a)*R*1.15);s.scale.set(R*.7,5,1);s.renderOrder=4+i;mist.add(s);}
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
  // clear: no orb of its own (the sky has one sun); a few golden motes drift up through the warm air instead
  const MOTES=26, mote=new Float32Array(MOTES*3), moteGeo=new T.BufferGeometry();moteGeo.setAttribute('position',new T.BufferAttribute(mote,3));
  const glow=new T.Points(moteGeo,new T.PointsMaterial({map:texture,color:'#ffd98a',size:1.3,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));group.add(glow);

  let strain=0, rain=0;
  function setStrain(s){
    strain=Math.min(1,Math.max(0,s));
    const tone=ramp(.35,.95,strain);
    for(const p of deck){p.base=ramp(p.from,p.from+.08,strain)*.92;batches[p.v].setOpacity(p.i,p.base);}
    for(const b of batches)b.material.uniforms.color.value.copy(light).lerp(dark,tone);
    const m=ramp(.2,.4,strain)*(1-ramp(.65,.85,strain))*.3;for(const b of mist.children){b.userData.base=m;b.material.opacity=m;}
    rain=ramp(.55,.95,strain);
    shaft.material.opacity=rain*.85;shaft.visible=rain>0;
    geometry.setDrawRange(0,Math.floor(DROPS*ramp(.5,1,strain))*2);drops.visible=strain>.5;
  }
  setStrain(0);
  const eye=new T.Vector3(), eyeD=new T.Vector3(), UP=new T.Vector3(0,1,0);
  return {group,setStrain,
    update(t,camera){
      // fade what the camera is about to fly through, instead of letting a
      // puff (or the rain column) suddenly fill the whole screen
      if(camera){
        eye.copy(camera.position).sub(group.position);
        eyeD.copy(eye).applyAxisAngle(UP,-deckGroup.rotation.y);   /* the clumps drift round: measure in their frame */
        for(const p of deck)batches[p.v].setOpacity(p.i,p.base*ramp(8,24,eyeD.distanceTo(p.pos)));
        for(const b of mist.children){b.material.opacity=b.userData.base*ramp(4,14,eye.distanceTo(b.position));b.visible=b.material.opacity>.003;}
        shaft.material.opacity=rain*.85*ramp(R*.7,R*1.1,Math.hypot(eye.x,eye.z));
      }
      if(shaft.visible)streaks.offset.y=t*(.6+rain*.8);
      if(drops.visible){
        for(let i=0;i<DROPS;i++){const y=15-(i*.21+t*(3+4*rain))%14,a=i*2.399,d=Math.sqrt((i*.618)%1)*R*.85,x=Math.cos(a)*d,z=Math.sin(a)*d,k=i*6;positions[k]=x;positions[k+1]=y;positions[k+2]=z;positions[k+3]=x-.05;positions[k+4]=y-.5;positions[k+5]=z;}
        geometry.attributes.position.needsUpdate=true;
      }
      mist.rotation.y=Math.sin(t*.05)*.2;deckGroup.rotation.y=t*.012;   // the clumps drift slowly round
      glow.material.opacity=(1-ramp(.1,.3,strain))*.85;glow.visible=glow.material.opacity>.003;
      if(glow.visible){for(let i=0;i<MOTES;i++){const an=i*2.399+t*.05*(i%3?1:-1),d=Math.sqrt((i*.618)%1)*R*.75,k=i*3;
        mote[k]=Math.cos(an)*d;mote[k+1]=2+(i*1.37+t*.35)%11;mote[k+2]=Math.sin(an)*d;}moteGeo.attributes.position.needsUpdate=true;}
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

// The mist round an island down in the cloud sea: layered, see-through puffs in soft dusk colours (lavender, rose,
// peach), gathered where the island meets the sea, slowly orbiting, bobbing and breathing, with a faint shimmer.
// It reacts as the island moves through it: sinking or rising, the puffs part outward and are dragged along with
// it, then drift back and settle. Close to the camera they thin out, so walking there is never a white-out.
export function createSinkBank(radius=26){
  const group=new T.Group(), puffs=[], map=puffTexture();
  const TINTS=['#efe2ff','#ffdcee','#ffe6d2','#e4d6ff','#f7ecff','#dbe6ff'].map(c=>new T.Color(c));
  const clamp01=x=>Math.min(1,Math.max(0,x)), ramp=(lo,hi,x)=>clamp01((x-lo)/(hi-lo));
  const mk=(ring,i,n,dy,size,o,from,glow=false)=>{
    const s=new T.Sprite(new T.SpriteMaterial({map,transparent:true,opacity:0,depthWrite:false,blending:glow?T.AdditiveBlending:T.NormalBlending}));
    s.material.color.copy(TINTS[(i*3+ring)%TINTS.length]);if(glow)s.material.color.multiplyScalar(.28);
    s.userData={a:(i+ring*.37)/n*Math.PI*2,r:radius*[1.3,1.02,.72][ring],dy,size,o,from,glow,
      w:(.025+((i*7)%5)*.009)*(i%2?1:-1),ph:i*1.7+ring*2.3,push:0,lift:0};
    s.renderOrder=2+puffs.length;group.add(s);puffs.push(s);
  };
  for(let i=0;i<12;i++)mk(0,i,12,-7+(i%2)*1.6,radius*1.15,.5,0);       // the deep bank under the sea line
  for(let i=0;i<14;i++)mk(1,i,14,(i%3)*1.5-.5,radius*.82,.45,.2);      // at the sea line, wrapping the island
  for(let i=0;i<10;i++)mk(2,i,10,3+(i%2)*2.8,radius*.56,.2,.5);       // wisps reaching up over the rim
  for(let i=0;i<6;i++)mk(1,i,6,1.2,radius*.6,.4,.35,true);              // a faint shimmer in the mist
  let depth=0, alt=null, prev=null, last=null, v=0;
  const eye=new T.Vector3();
  group.visible=false;
  return {group,
    // how deep: nothing while the island is clear of the sea (its underside reaches ~24 m down), full at the floor
    set(altitude){alt=altitude;depth=ramp(CLOUD_SEA+28,LOW,altitude);group.visible=depth>.02;},
    update(elapsed,camera){
      const dt=last===null?0:Math.min(.1,Math.max(0,elapsed-last));last=elapsed;
      if(dt>0&&prev!==null)v+=((alt-prev)/dt-v)*Math.min(1,dt*6);prev=alt;   // the island's vertical speed, smoothed
      if(!group.visible)return;
      const sea=CLOUD_SEA-alt, speed=Math.min(8,Math.abs(v));
      if(camera)eye.copy(camera.position).sub(group.position);
      for(const s of puffs){
        const u=s.userData;
        // pushed while the island moves (quickly), settling once it stops (slowly)
        u.push+=(speed*1.6-u.push)*Math.min(1,dt*(speed*1.6>u.push?3:.7));
        u.lift+=(v*.9-u.lift)*Math.min(1,dt*(Math.abs(v)>.2?2.5:.6));
        const an=u.a+elapsed*u.w, r=u.r+u.push+Math.sin(elapsed*.3+u.ph)*1.4;
        s.position.set(Math.cos(an)*r,sea+u.dy+u.lift+Math.sin(elapsed*.5+u.ph)*.7,Math.sin(an)*r);
        const sc=u.size*(1+.07*Math.sin(elapsed*.42+u.ph))*(1+u.push*.03);s.scale.set(sc,sc*.4,1);
        let o=u.o*ramp(u.from,1,depth)*(1-Math.min(.5,u.push*.04));
        if(u.glow)o*=.6+.4*Math.sin(elapsed*1.3+u.ph);
        if(camera)o*=ramp(6,22,eye.distanceTo(s.position));
        s.material.opacity=o;s.visible=o>.003;
      }
      group.rotation.y=elapsed*.01;
    }};
}
