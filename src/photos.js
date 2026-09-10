import * as T from 'three';
import { fmt } from './data.js';

// Photo lanterns = the daily shared moment. A two-minute golden window pings
// everyone; each member's photo floats onto the community lake as a small
// lantern. Late posts (after the window, before midnight) still land, a little
// softer. One lantern per person per day. No post, no lantern -- absence is
// never drawn.
const WINDOW_MS=120000, FIRST_RING_MS=20000;
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

  function post(member,canvas,late){
    if(items.some(i=>i.member.id===member.id))return false;
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    const k=items.length, g=lanternFor(tex,late);
    const item={member,canvas,late,time:time(),g,radius:orbit,angle:SLOTS[k%SLOTS.length]+.4};
    g.traverse(o=>{o.userData.photoLantern=item;});lake.add(g);items.push(item);
    notice(member.id===me?'Your moment is drifting on the lake.':`${member.owner}’s moment drifted onto the lake${late?', a little late':''}.`);
    refresh();return true;
  }

  // ---- the golden window --------------------------------------------------
  function tick(){
    const left=Math.max(0,endsAt-Date.now());
    $('golden-time').textContent=`${Math.floor(left/60000)}:${String(Math.ceil(left/1000)%60).padStart(2,'0')} left`;
    if(left<=0)close();
  }
  function ring(){
    if(open)return;
    open=true;rung=true;endsAt=Date.now()+WINDOW_MS;clearInterval(timer);timer=setInterval(tick,500);tick();
    notice('✦ The golden window is open. Two minutes to share this moment.');
    // mock friends: most post inside the window, the last one a little late
    friends.forEach((m,i)=>{
      const late=friends.length>1&&i===friends.length-1;
      setTimeout(()=>post(m,snapshot(MOMENTS[i%MOMENTS.length]),late),late?WINDOW_MS+8000:5000+i*9000+Math.random()*5000);
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
  if(!new URLSearchParams(location.search).has('quiet'))setTimeout(ring,FIRST_RING_MS);

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
      return best&&{...best,view:()=>viewItem(best.item)};
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

// Mock friends' photos, painted so the demo needs no image files.
function snapshot(draw){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');draw(x);
  const v=x.createRadialGradient(128,128,70,128,128,190);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(30,20,40,.35)');
  x.fillStyle=v;x.fillRect(0,0,256,256);
  const img=x.getImageData(0,0,256,256),d=img.data;
  for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*14;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}
  x.putImageData(img,0,0);return c;
}
const MOMENTS=[
  x=>{ // a desk by the window at dusk
    let g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'#4a4063');g.addColorStop(1,'#2e2a3d');x.fillStyle=g;x.fillRect(0,0,256,256);
    g=x.createLinearGradient(0,30,0,140);g.addColorStop(0,'#f6b88f');g.addColorStop(1,'#c98bb0');x.fillStyle=g;x.fillRect(120,26,110,112);
    x.strokeStyle='#2e2a3d';x.lineWidth=5;x.strokeRect(120,26,110,112);x.beginPath();x.moveTo(175,26);x.lineTo(175,138);x.stroke();
    x.fillStyle='#7c5a44';x.fillRect(0,170,256,86);
    const l=x.createRadialGradient(70,150,4,70,150,110);l.addColorStop(0,'rgba(255,221,150,.85)');l.addColorStop(1,'rgba(255,221,150,0)');x.fillStyle=l;x.fillRect(0,40,256,216);
    x.save();x.translate(128,205);x.rotate(-.12);x.fillStyle='#f4efe4';x.fillRect(-55,-28,110,56);x.strokeStyle='#b9b0c8';x.lineWidth=1.5;
    for(let y=-18;y<24;y+=8){x.beginPath();x.moveTo(-46,y);x.lineTo(46,y);x.stroke();}x.restore();
    x.fillStyle='#e7d3b8';x.fillRect(196,178,30,36);x.fillStyle='#6b4a3a';x.fillRect(199,180,24,7);
    x.strokeStyle='#3b3346';x.lineWidth=4;x.beginPath();x.moveTo(40,170);x.lineTo(62,110);x.lineTo(92,126);x.stroke();
    x.fillStyle='#f1d59a';x.beginPath();x.moveTo(80,112);x.lineTo(108,124);x.lineTo(96,142);x.closePath();x.fill();
  },
  x=>{ // noodles from above
    x.fillStyle='#c89a6c';x.fillRect(0,0,256,256);x.strokeStyle='rgba(120,80,50,.25)';x.lineWidth=3;
    for(let y=10;y<256;y+=22){x.beginPath();x.moveTo(0,y);x.bezierCurveTo(90,y+8,170,y-8,256,y+4);x.stroke();}
    x.fillStyle='#f5efe6';x.beginPath();x.arc(128,132,92,0,7);x.fill();x.fillStyle='#e7b465';x.beginPath();x.arc(128,132,76,0,7);x.fill();
    x.strokeStyle='#fbe9bd';x.lineWidth=4;
    for(let i=0;i<14;i++){const a=i*.45;x.beginPath();x.moveTo(128+Math.cos(a)*10,132+Math.sin(a)*10);
      x.bezierCurveTo(128+Math.cos(a+1)*40,132+Math.sin(a+1)*40,128+Math.cos(a+2)*30,132+Math.sin(a+2)*60,128+Math.cos(a+2.4)*62,132+Math.sin(a+2.4)*62);x.stroke();}
    for(const [ex,ey] of [[100,110],[150,150]]){x.fillStyle='#fffaf0';x.beginPath();x.ellipse(ex,ey,17,13,.4,0,7);x.fill();x.fillStyle='#f2a93b';x.beginPath();x.arc(ex+2,ey,7,0,7);x.fill();}
    x.fillStyle='#7cae5a';for(let i=0;i<22;i++){x.beginPath();x.arc(96+(i*37)%70,110+(i*53)%60,3,0,7);x.fill();}
    x.strokeStyle='#3d2b22';x.lineWidth=6;x.beginPath();x.moveTo(40,236);x.lineTo(226,40);x.moveTo(56,244);x.lineTo(236,56);x.stroke();
  },
  x=>{ // sky from the bus window
    const g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'#9d93c9');g.addColorStop(.55,'#f4c4b0');g.addColorStop(1,'#ffe1b8');x.fillStyle=g;x.fillRect(0,0,256,256);
    x.fillStyle='rgba(255,255,255,.55)';for(const [cx,cy,r] of [[60,70,26],[90,64,20],[180,96,30],[210,90,20],[150,50,16]]){x.beginPath();x.arc(cx,cy,r,0,7);x.fill();}
    x.fillStyle='#6f6a96';x.beginPath();x.moveTo(0,200);x.bezierCurveTo(60,160,110,190,160,170);x.bezierCurveTo(200,156,230,176,256,168);x.lineTo(256,256);x.lineTo(0,256);x.fill();
    x.fillStyle='#4d4a70';x.beginPath();x.moveTo(0,226);x.bezierCurveTo(80,200,150,232,256,210);x.lineTo(256,256);x.lineTo(0,256);x.fill();
    x.fillStyle='#2f2c40';x.fillRect(0,0,256,14);x.fillRect(0,242,256,14);x.fillRect(0,0,12,256);x.fillRect(244,0,12,256);
  },
];
