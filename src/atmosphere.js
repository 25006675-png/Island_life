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
  const sea=new T.Mesh(new T.PlaneGeometry(1100,1100),new T.ShaderMaterial({uniforms:cloudUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:`varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 tint;${noise}
void main(){vec2 p=vWorld.xz*.026+vec2(time*.002,0.);float n=fbm(p);float detail=fbm(p*3.);vec3 col=mix(tint*.83,vec3(1.,.9,.81),smoothstep(.22,.8,n));col+=pow(detail,3.)*.14;gl_FragColor=vec4(col,.98);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')}));
  sea.rotation.x=-Math.PI/2;sea.position.y=-17;scene.add(sea);
  // Soft billows use one shared procedural sprite, keeping the cloud sea inexpensive.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.55)');gradient.addColorStop(.45,'rgba(255,255,255,.26)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas),clouds=new T.Group();scene.add(clouds);
  for(let n=0;n<100;n++) {const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#ffe3d3',transparent:true,depthWrite:false,opacity:.45}));const angle=n*2.399,r=22+Math.sqrt(n/100)*150;s.position.set(Math.cos(angle)*r,-13+(n%5)*.5,Math.sin(angle)*r);s.scale.set(30+n%7*5,11+n%4*3,1);clouds.add(s);}
  const bands=new T.Group();scene.add(bands);
  for(const y of [7,19,32]){const band=new T.Mesh(new T.CylinderGeometry(190,190,.13,100,1,true),new T.MeshBasicMaterial({color:'#fae5c1',transparent:true,opacity:.095,side:T.DoubleSide,depthWrite:false}));band.position.y=y;bands.add(band);}
  scene.fog=new T.FogExp2('#dec4d1',.004);
  return {texture,setTone(tone){const p=palettes[tone]??palettes.peach;uniforms.top.value.set(p[0]);uniforms.mid.value.set(p[1]);uniforms.bottom.value.set(p[2]);cloudUniforms.tint.value.set(p[3]);scene.fog.color.set(p[3]);},update(t){uniforms.time.value=t;clouds.rotation.y=t*.001;}};
}

export function createLanterns(scene,texture) {
  const count=80,group=new T.Group();scene.add(group);
  const body=new T.InstancedMesh(new T.CylinderGeometry(.22,.17,.48,8),new T.MeshStandardMaterial({color:'#ffd496',emissive:'#ffb951',emissiveIntensity:2.4,roughness:1}),count);group.add(body);
  const sparks=new T.BufferGeometry(),positions=new Float32Array(160*3);sparks.setAttribute('position',new T.BufferAttribute(positions,3));
  const points=new T.Points(sparks,new T.PointsMaterial({color:'#ffdea0',size:.19,map:texture,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending}));group.add(points);
  const dummy=new T.Object3D();let density=36;
  return {setDensity(n){density=n;body.count=n;sparks.setDrawRange(0,n*2);},update(t,altitude){group.position.y=altitude;for(let i=0;i<density;i++){const y=2+((i*1.71+t*.7)%29),a=i*2.399;dummy.position.set(Math.cos(a)*(3+i%7)+Math.sin(t*.2+i)*.4,y,Math.sin(a)*(3+i%5));dummy.rotation.set(Math.sin(t+i)*.08,a,Math.sin(t*.5+i)*.08);dummy.scale.setScalar(.7+(i%3)*.18);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);}body.instanceMatrix.needsUpdate=true;for(let i=0;i<density*2;i++){positions[i*3]=Math.sin(i*9.1+t*.04)*(6+i%15);positions[i*3+1]=(i*.47+t*.25)%20;positions[i*3+2]=Math.cos(i*3.1+t*.06)*(5+i%10);}sparks.attributes.position.needsUpdate=true;}};
}

export function createWeather(texture) {
  const group=new T.Group(),rainGroup=new T.Group(),mist=new T.Group();group.add(rainGroup,mist);
  for(let i=0;i<7;i++){const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#c8c4de',opacity:.9,depthWrite:false}));s.position.set((i%4-1.5)*1.8,10+(i%3)*.4,-1);s.scale.set(8,4.5,1);rainGroup.add(s);}
  const positions=new Float32Array(160*6),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));const rain=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#c8dfec',transparent:true,opacity:.5,depthWrite:false}));rainGroup.add(rain);
  for(let i=0;i<7;i++){const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#e0e3df',opacity:.42,depthWrite:false}));s.position.set(Math.sin(i*3)*6,.7+ i%3*.7,Math.cos(i*3)*5);s.scale.set(18,5,1);mist.add(s);}
  rainGroup.visible=mist.visible=false;
  return {group,set(type){rainGroup.visible=type==='rain';mist.visible=type==='mist';},update(t){if(rainGroup.visible){for(let i=0;i<160;i++){let y=9-(i*.21+t*4)%8.5,x=Math.sin(i*12.2)*4,z=Math.cos(i*2.8)*3;positions.set([x,y,z,x-.04,y-.35,z],i*6);}geometry.attributes.position.needsUpdate=true;}mist.rotation.y=Math.sin(t*.05)*.2;}};
}
