import * as T from 'three';

// The empty places in a sky. A sky is you and up to four friends; every slot nobody holds yet keeps the island a
// friend would bring there, in glass, floating where it will be: a new sky shows its shape, and what an invite
// fills. Only the ground and the torii are drawn (two draws each). It bobs a little and a band of light climbs it
// now and then; its label (or a click on it) opens the invite window. When someone joins while you are here, their
// slot turns gold until you reload to welcome them, and the first time you see a new friend's island it grows
// out of its glass (arrive). Which islands you have already seen is remembered per browser.
const GLASS=new T.Color('#8f6fd8'), GOLD=new T.Color('#ffb85c');   // deep enough to read on the pale cloud sea
const easeOutBack=k=>1+2.70158*(k-1)**3+1.70158*(k-1)**2;

function glassMaterial(){
  return new T.ShaderMaterial({
    uniforms:{uTint:{value:GLASS.clone()},uTime:{value:0},uBand:{value:1},uWarm:{value:0},uFade:{value:1},uBase:{value:0},uHeight:{value:10}},
    vertexColors:true,transparent:true,depthWrite:false,
    vertexShader:/* glsl */`
      varying vec3 vColor; varying vec3 vN; varying vec3 vView; varying float vY;
      void main(){
        #if defined(USE_COLOR_ALPHA)
          vColor=color.rgb;
        #elif defined(USE_COLOR)
          vColor=color;
        #else
          vColor=vec3(1.0);
        #endif
        vec4 wp=modelMatrix*vec4(position,1.0);
        vY=wp.y;
        vec4 mv=viewMatrix*wp;
        vN=normalize(normalMatrix*normal);
        vView=-mv.xyz;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:/* glsl */`
      uniform vec3 uTint; uniform float uTime,uBand,uWarm,uFade,uBase,uHeight;
      varying vec3 vColor; varying vec3 vN; varying vec3 vView; varying float vY;
      void main(){
        float f=pow(1.0-abs(dot(normalize(vN),normalize(vView))),2.5);
        float lum=dot(vColor,vec3(0.3,0.59,0.11));
        // a band of light climbs from the floating rock to the treetops every six seconds, then rests
        float h=(vY-uBase)/uHeight, at=fract(uTime/6.0)*1.8-0.3;
        float band=uBand*exp(-abs(h-at)*12.0)*0.9;
        float pulse=uWarm*(0.55+0.45*sin(uTime*3.0));
        vec3 glass=uTint*(0.55+0.7*lum)+mix(uTint,vec3(1.0),0.5)*(f*(0.9+pulse)+band);
        gl_FragColor=vec4(glass,(0.3+0.45*f+0.3*band+0.15*pulse)*uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// places: [{id, model, x, z, altitude, scale}] for the open slots; onInvite() when one is chosen
export function createVacancies({scene,assets,places,labels,onInvite}){
  const list=[], growing=[];
  function build(place){
    const mat=glassMaterial(), group=new T.Group();
    group.position.set(place.x,place.altitude,place.z);group.scale.setScalar(place.scale);
    const model=assets[place.model];model.updateMatrixWorld(true);
    for(const name of ['Island','Torii']){
      const o=model.getObjectByName(name);if(!o)continue;
      o.traverse(m=>{if(!m.isMesh)return;
        // drawn after the cloud sea (renderOrder 0): sorted by distance, the sea's huge sheet painted over glass on the far side
        const mesh=new T.Mesh(m.geometry,mat);mesh.applyMatrix4(m.matrixWorld);mesh.renderOrder=1;mesh.userData.vacant=place.id;group.add(mesh);});
    }
    scene.add(group);group.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(group);
    mat.uniforms.uBase.value=box.min.y;mat.uniforms.uHeight.value=Math.max(1,box.max.y-box.min.y);
    return {...place,group,mat,phase:list.length*1.7,warm:0,vacant:true};
  }
  for(const place of places){
    const v=build(place);
    const label=document.createElement('button');label.className='island-label vacant';label.textContent='+ Invite a friend';
    label.title='Invite a friend. Their island grows here when they join.';
    label.addEventListener('click',()=>choose(v.id));labels.append(label);v.label=label;
    list.push(v);
  }
  function choose(id){
    const v=list.find(v=>v.id===id);if(!v)return;
    if(v.warm)location.reload();else onInvite();
  }
  return {
    list,
    groups:()=>list.map(v=>v.group),
    choose,
    // someone took this slot just now: it glows gold and waits to be welcomed
    warm(id){
      const v=list.find(v=>v.id===id);if(!v)return false;
      v.warm=1;v.mat.uniforms.uTint.value.copy(GOLD);
      v.label.textContent='Someone’s here · welcome them';v.label.classList.add('warm');v.label.title='Reload to bring their island into your sky';
      return true;
    },
    // a friend's island you haven't seen yet grows out of the glass where it waited (island.group is the real
    // one, standing at `place`), after `wait` seconds of gold glass
    arrive(island,place,wait){
      const v=build({...place,id:`arriving-${island.id}`});
      v.mat.uniforms.uTint.value.copy(GOLD);v.mat.uniforms.uWarm.value=1;
      island.group.scale.setScalar(.001);
      growing.push({v,island,k:-wait/2.4});
    },
    update(dt,elapsed,motion){
      for(const v of list){
        const u=v.mat.uniforms;u.uTime.value=elapsed+v.phase;u.uBand.value=motion?1:0;u.uWarm.value=v.warm;
        v.group.position.y=v.altitude+(motion?Math.sin(elapsed*.6+v.phase)*.5:0);
      }
      for(let n=growing.length-1;n>=0;n--){
        const g=growing[n],u=g.v.mat.uniforms;g.k+=motion?dt/2.4:1;u.uTime.value=elapsed;g.v.group.position.y=g.island.group.position.y;
        const k=Math.max(0,g.k);
        g.island.group.scale.setScalar(Math.max(.001,easeOutBack(Math.min(1,k/.7))));
        u.uFade.value=1-k;
        if(g.k>=1){g.island.group.scale.setScalar(1);scene.remove(g.v.group);g.v.mat.dispose();growing.splice(n,1);}
      }
    },
  };
}

// Which friends' islands you haven't seen in this sky before (none the first time: then everyone is simply here).
export function newArrivals(sky,people,me){
  const key=`il-seen-${sky.id}`, now=people.map(p=>p.id);
  let seen=null;try{seen=JSON.parse(localStorage.getItem(key));}catch{}
  try{localStorage.setItem(key,JSON.stringify(now));}catch{}
  return Array.isArray(seen)?now.filter(id=>id!==me&&!seen.includes(id)):[];
}
