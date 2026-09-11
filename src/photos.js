import * as T from 'three';
import { fmt } from './data.js';

// Photo lanterns = the daily shared moment. A two-minute golden window pings
// everyone; each member's photo floats onto the community lake as a small
// lantern. Late posts (after the window, before midnight) still land, a little
// softer. One lantern per person per day. No post, no lantern -- absence is
// never drawn.
const WINDOW_MS=120000;
// Today's moments for the demo: real photos (Unsplash, free licence), one per
// member, all posted in today's golden window.
const MOMENTS={sakura:{src:'you.jpg',at:13*60+31},purple:{src:'ben.jpg',at:13*60+27},oak:{src:'chen.jpg',at:13*60+29}};
const photo=id=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(square(img,img.naturalWidth,img.naturalHeight));img.onerror=reject;
  img.src=`${import.meta.env.BASE_URL}assets/moments/${MOMENTS[id].src}`;
});
const FLOAT=1.05;   // lanterns hover this far above the deck: just over the gardener's head
const $=id=>document.getElementById(id);

export function createPhotoLake({island,texture,members,me,notice,view,time}){
  const deck=island.model.getObjectByName('Deck')??island.model.getObjectByName('Water');
  island.group.updateMatrixWorld(true);
  const deckBox=new T.Box3().setFromObject(deck);
  const lake=new T.Group();lake.position.copy(island.group.worldToLocal(deckBox.getCenter(new T.Vector3())));
  lake.position.y=deckBox.max.y-island.group.position.y;island.group.add(lake);
  // lanterns gather over the deck itself, spaced round its middle
  const SLOTS=[0,2.09,4.19,1.05,3.14], orbit=deckBox.getSize(new T.Vector3()).x*.5*.52;
  const items=[], friends=members.filter(m=>m.id!==me), owner=members.find(m=>m.id===me);
  let open=false, rung=false, endsAt=0, timer=null, stream=null, pending=null;

  function lanternFor(tex,late){
    const g=new T.Group(), soft=late?.55:1;
    const paper=new T.MeshStandardMaterial({color:'#fff1da',emissive:'#ffc978',emissiveIntensity:.8*soft,roughness:.9});
    const frame=new T.Mesh(new T.BoxGeometry(1.5,1.65,.2),paper);frame.position.y=1;
    const photo=new T.Mesh(new T.PlaneGeometry(1.24,1.24),new T.MeshBasicMaterial({map:tex,transparent:late,opacity:late?.78:1}));
    photo.position.set(0,1.02,.105);
    const roof=new T.Mesh(new T.ConeGeometry(1.15,.42,4),new T.MeshStandardMaterial({color:'#b98a5e',roughness:.9}));
    roof.position.y=2.03;roof.rotation.y=Math.PI/4;
    // a soft pool of light on the deck below
    const glow=new T.Sprite(new T.SpriteMaterial({map:texture,color:'#ffcf8a',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.55*soft}));
    glow.position.y=(-FLOAT+.08)/.9;glow.scale.set(3.4,1.4,1);
    g.add(frame,photo,roof,glow);g.scale.setScalar(.9);
    return g;
  }

  // `at` backdates a moment (minutes); `quiet` skips the notice
  function post(member,canvas,late,{at,quiet}={}){
    if(items.some(i=>i.member.id===member.id))return false;
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const k=items.length, g=lanternFor(tex,late);
    const item={member,canvas,tex,late,time:at??time(),g,radius:orbit,angle:SLOTS[k%SLOTS.length]+.4};
    g.traverse(o=>{o.userData.photoLantern=item;});lake.add(g);items.push(item);
    if(!quiet)notice(member.id===me?'Your moment is drifting on the lake.':`${member.owner}’s moment drifted onto the lake${late?', a little late':''}.`);
    refresh();return true;
  }
  function clearDeck(){for(const i of items){lake.remove(i.g);i.tex.dispose();}items.length=0;}

  // ---- the golden window --------------------------------------------------
  function tick(){
    const left=Math.max(0,endsAt-Date.now());
    $('golden-time').textContent=`${Math.floor(left/60000)}:${String(Math.ceil(left/1000)%60).padStart(2,'0')} left`;
    if(left<=0)close();
  }
  function ring(){
    if(open)return;
    clearDeck();   // demo control: a new window starts a fresh deck
    open=true;rung=true;endsAt=Date.now()+WINDOW_MS;clearInterval(timer);timer=setInterval(tick,500);tick();
    notice('✦ The golden window is open. Two minutes to share this moment.');
    // mock friends: most post inside the window, the last one a little late
    friends.forEach((m,i)=>{
      const late=friends.length>1&&i===friends.length-1;
      setTimeout(()=>photo(m.id).then(c=>post(m,c,late)),late?WINDOW_MS+8000:5000+i*9000+Math.random()*5000);
    });
    refresh();
  }
  function close(){open=false;clearInterval(timer);refresh();setTimeout(()=>{if(!open)$('golden').hidden=true;},9000);}
  function refresh(){
    const mine=items.some(i=>i.member.id===me);
    $('golden').hidden=!rung||(mine&&!open);
    $('golden').classList.toggle('closed',!open);
    $('golden-title').textContent=open?'The golden window is open':'The golden window has closed';
    $('golden-time').textContent=open?$('golden-time').textContent:'Late moments still land until midnight, a little softer.';
    $('golden-share').hidden=mine;$('golden-share').textContent=open?'Share this moment':'Share late';
    $('share-late').hidden=!rung||mine;
  }

  // ---- capture: webcam if there is one, a file otherwise ---------------------
  async function openCapture(){
    pending=null;$('capture-send').disabled=true;$('capture-preview').hidden=true;$('capture-video').hidden=false;
    $('capture-snap').hidden=false;$('capture-status').textContent='Looking for a camera…';
    $('capture').showModal();
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:640},audio:false});
      $('capture-video').srcObject=stream;await $('capture-video').play();
      $('capture-status').textContent='Just as it is. No retakes needed.';
    }catch{
      $('capture-video').hidden=true;$('capture-snap').hidden=true;
      $('capture-status').textContent='No camera here. Choose a photo instead.';
    }
  }
  function stop(){stream?.getTracks().forEach(t=>t.stop());stream=null;}
  function preview(canvas){
    pending=canvas;stop();$('capture-video').hidden=true;$('capture-snap').hidden=true;
    $('capture-preview').src=canvas.toDataURL('image/jpeg',.9);$('capture-preview').hidden=false;
    $('capture-send').disabled=false;$('capture-status').textContent=open?'Ready when you are.':'The window has closed, so this will land a little softer.';
  }
  $('capture-snap').onclick=()=>{const v=$('capture-video');preview(square(v,v.videoWidth,v.videoHeight));};
  $('capture-file').onchange=e=>{const f=e.target.files[0];if(f)loadSquare(f).then(preview);e.target.value='';};
  $('capture-send').onclick=()=>{if(pending)post(owner,pending,!open);$('capture').close();};
  $('capture-cancel').onclick=()=>$('capture').close();
  $('capture').addEventListener('close',stop);
  $('golden-share').onclick=openCapture;$('share-late').onclick=openCapture;
  $('golden-dismiss').onclick=()=>{$('golden').hidden=true;};
  // Today's golden window already rang at 13:27: everyone's moment is on the deck.
  Promise.all(members.map(m=>photo(m.id).then(c=>[m,c]))).then(list=>{
    rung=true;for(const [m,c] of list)post(m,c,false,{at:MOMENTS[m.id].at,quiet:true});
  }).catch(e=>console.warn('[photos] moments did not load',e));

  const viewItem=i=>view({src:i.canvas.toDataURL('image/jpeg',.92),title:i.member.id===me?'Your moment':`${i.member.owner}’s moment`,sub:`${fmt(i.time)}${i.late?' · a little late':''}`});
  const wp=new T.Vector3();
  return {
    ring,
    get items(){return items;},
    get status(){return {open,rung};},
    update(t,camera,motion){
      for(const i of items){
        const r=i.radius+(motion?Math.sin(t*.35+i.angle*3)*.18:0);   // a gentle drift in place
        i.g.position.set(Math.cos(i.angle)*r,FLOAT+(motion?Math.sin(t*1.1+i.angle)*.12:0),Math.sin(i.angle)*r);
        i.g.getWorldPosition(wp);
        i.g.rotation.set(motion?Math.sin(t*.9+i.angle)*.03:0,Math.atan2(camera.position.x-wp.x,camera.position.z-wp.z),0);
      }
    },
    near(world,radius){
      let best=null;
      for(const i of items){i.g.getWorldPosition(wp);const d=Math.hypot(world.x-wp.x,world.z-wp.z);if(d<radius&&(!best||d<best.d))best={item:i,d};}
      if(!best)return null;
      const at=best.item.g.getWorldPosition(new T.Vector3());at.y+=2.3;
      return {...best,at,view:()=>viewItem(best.item)};
    },
    pick(raycaster){
      const hit=raycaster.intersectObjects(items.map(i=>i.g),true)[0];
      if(!hit)return false;viewItem(hit.object.userData.photoLantern);return true;
    },
  };
}

function square(source,w,h){
  const c=document.createElement('canvas');c.width=c.height=320;const s=Math.min(w,h);
  c.getContext('2d').drawImage(source,(w-s)/2,(h-s)/2,s,s,0,0,320,320);return c;
}
export function loadSquare(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>{resolve(square(img,img.naturalWidth,img.naturalHeight));URL.revokeObjectURL(img.src);};
    img.onerror=reject;img.src=URL.createObjectURL(file);
  });
}
