import * as T from 'three';
import { fmt, toMin } from './data.js';

// The carousel = today's photos, shared. Anyone can hang a photo any time of
// the day; the golden window is the bonus -- once a day it opens by surprise
// for two minutes, and what's shared inside it hangs in gold, one per person.
// It stands on the pond's deck and turns slowly; walk up to it to open the day
// as an album. Only hooks that carry a photo are hung, so a missing photo is
// never drawn. The day clears at midnight.
const WINDOW_MS=120000;
const DIR=`${import.meta.env.BASE_URL}assets/moments/`;
// Today's photos for the demo: real photos (Unsplash licence, most via Lorem
// Picsum). The golden three were shared in today's window at 13:27; listed
// first, they take the carousel's best hooks.
const WINDOW_AT='13:27';
const MOMENTS=[
  {id:'sakura',src:'you.jpg',at:'13:31',golden:true},
  {id:'purple',src:'ben.jpg',at:'13:27',golden:true},
  {id:'oak',src:'chen.jpg',at:'13:29',golden:true},
  {id:'oak',src:'sunset.jpg',at:'06:55',caption:'Sunrise from the bus'},
  {id:'oak',src:'path.jpg',at:'07:05',caption:'The long way to the pool'},
  {id:'purple',src:'guitar.jpg',at:'07:40',caption:'New strings for band practice'},
  {id:'sakura',src:'teapot.jpg',at:'08:05',caption:'A slow breakfast'},
  {id:'purple',src:'cafe.jpg',at:'08:55',caption:'Before the first customer'},
  {id:'sakura',src:'desk.jpg',at:'09:40',caption:'Calculus, chapter four'},
  {id:'purple',src:'plants.jpg',at:'10:40',caption:'The café window'},
  {id:'sakura',src:'book.jpg',at:'11:20',caption:'One more from the library'},
  {id:'sakura',src:'blossom.jpg',at:'11:35',caption:'On the walk back'},
  {id:'purple',src:'cooking.jpg',at:'12:15',caption:'Prepping tonight’s dinner'},
  {id:'oak',src:'grass.jpg',at:'12:30',caption:'Ten minutes on the grass'},
  {id:'purple',src:'puppy.jpg',at:'12:40',caption:'A regular’s dog'},
  {id:'sakura',src:'bench.jpg',at:'12:50',caption:'Lunch with Ben'},
];
const load=src=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(square(img,img.naturalWidth,img.naturalHeight,512));img.onerror=reject;
  img.src=DIR+src;
});
const $=id=>document.getElementById(id);

// Sizes in world units. The deck is ~3 across its radius: the plinth fits on
// it, the canopy reaches out over the water, and every photo hangs well above
// the gardener's head.
const R_BASE=2, R_CANOPY=3.6, Y_CEIL=5.6, R_OUT=3.35, R_IN=2.3, PW=1.5, PH=1.75;
const PANEL_W=2*R_CANOPY*Math.sin(Math.PI/12), PANEL_H=1;
const C={cream:'#f7eedc',gold:'#e3b964',rose:'#eaa3b1',lav:'#c2b4e8',mint:'#a9dac4',peach:'#f5bb9c',leaf:'#80b48f',plum:'#7a5c8e'};
const PEG={sakura:'#f2a9c2',purple:'#b9a2ea',oak:'#94c9a2'};   // each member's clothes-peg colour
// Hooks: twelve on the outer ring, eight on the inner one hanging lower,
// ordered so the first few photos spread evenly round the carousel.
const SLOTS=[...[0,6,3,9,1,7,4,10,2,8,5,11].map(k=>({r:R_OUT,a:k/12*Math.PI*2,drop:.3+(k*7%5)*.1})),
             ...[0,4,2,6,1,5,3,7].map(k=>({r:R_IN,a:(k+.5)/8*Math.PI*2,drop:.9+(k*3%4)*.13}))];

// ---- painted details --------------------------------------------------------
function paint(w,h,draw,repeat=[1,1]){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
  t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(...repeat);return t;
}
function flower(x,cx,cy,s,petal){
  x.strokeStyle=C.leaf;x.lineWidth=s*.09;x.beginPath();x.moveTo(cx,cy+s*1.1);x.quadraticCurveTo(cx-s*.12,cy+s*.5,cx,cy);x.stroke();
  x.fillStyle=C.leaf;for(const d of [-1,1]){x.beginPath();x.ellipse(cx+d*s*.3,cy+s*.72,s*.3,s*.11,-d*.6,0,Math.PI*2);x.fill();}
  x.fillStyle=petal;
  for(let k=0;k<5;k++){const a=k/5*Math.PI*2-Math.PI/2;x.beginPath();x.ellipse(cx+Math.cos(a)*s*.3,cy+Math.sin(a)*s*.3,s*.27,s*.16,a,0,Math.PI*2);x.fill();}
  x.fillStyle=C.gold;x.beginPath();x.arc(cx,cy,s*.14,0,Math.PI*2);x.fill();
}
function rosette(x,cx,cy,s,petal,heart){
  x.fillStyle=petal;
  for(let k=0;k<8;k++){const a=k/8*Math.PI*2;x.beginPath();x.ellipse(cx+Math.cos(a)*s*.55,cy+Math.sin(a)*s*.55,s*.4,s*.19,a,0,Math.PI*2);x.fill();}
  x.fillStyle=heart;x.beginPath();x.arc(cx,cy,s*.36,0,Math.PI*2);x.fill();
  x.fillStyle=C.gold;x.beginPath();x.arc(cx,cy,s*.16,0,Math.PI*2);x.fill();
}
// A valance panel: flat along the bottom, rising to a soft pointed arch.
// Origin bottom-centre, y up; the same outline cuts the panel and paints its border.
const arch=(p,w,h,i=0)=>{
  p.moveTo(-w/2+i,i);p.lineTo(w/2-i,i);p.lineTo(w/2-i,h*.56);
  p.quadraticCurveTo(w/2-i,h-i*1.2,0,h-i);p.quadraticCurveTo(-w/2+i,h-i*1.2,-w/2+i,h*.56);p.closePath();
};
function panelTexture(petal){
  const W=256,H=Math.round(W*PANEL_H/PANEL_W);
  return paint(W,H,x=>{
    x.fillStyle=C.cream;x.fillRect(0,0,W,H);
    x.save();x.translate(W/2,H);x.scale(W/PANEL_W,-H/PANEL_H);
    x.lineWidth=.035;x.strokeStyle=C.gold;x.beginPath();arch(x,PANEL_W,PANEL_H,.07);x.stroke();
    x.lineWidth=.014;x.strokeStyle=C.rose;x.beginPath();arch(x,PANEL_W,PANEL_H,.13);x.stroke();
    x.restore();
    flower(x,W/2,H*.47,H*.22,petal);
    x.fillStyle=C.gold;for(let k=1;k<12;k++){x.beginPath();x.arc(k*W/12,H-9,2.6,0,Math.PI*2);x.fill();}
  });
}
const shaftTexture=()=>paint(128,512,(x,W,H)=>{
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,C.cream);g.addColorStop(1,'#f3dcc6');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle=C.gold;x.lineWidth=4;
  for(const [top,bot,petal] of [[46,236,C.rose],[302,492,C.lav]]){
    x.beginPath();x.moveTo(22,bot);x.lineTo(22,top+50);x.quadraticCurveTo(22,top,64,top-12);x.quadraticCurveTo(106,top,106,top+50);x.lineTo(106,bot);x.stroke();
    flower(x,64,(top+bot)/2-14,24,petal);
  }
  x.fillStyle=C.mint;x.fillRect(0,250,W,14);
  x.fillStyle=C.gold;for(let k=0;k<4;k++){x.beginPath();x.arc(16+k*32,257,4,0,Math.PI*2);x.fill();}
},[5,2]);
const drumTexture=()=>paint(256,224,(x,W,H)=>{
  x.fillStyle=C.mint;x.fillRect(0,0,W,H);
  x.fillStyle=C.gold;x.fillRect(0,10,W,6);x.fillRect(0,H-16,W,6);
  x.strokeStyle=C.cream;x.lineWidth=5;x.beginPath();x.arc(W/2,H/2,62,0,Math.PI*2);x.stroke();
  rosette(x,W/2,H/2,48,C.rose,C.cream);
  for(const cx of [0,W]){x.fillStyle=C.lav;x.beginPath();x.moveTo(cx,H/2-26);x.lineTo(cx+16,H/2);x.lineTo(cx,H/2+26);x.lineTo(cx-16,H/2);x.fill();}
},[4,1]);
const bandTexture=()=>paint(256,64,(x,W,H)=>{
  x.fillStyle=C.lav;x.fillRect(0,0,W,H);
  x.fillStyle=C.gold;x.fillRect(0,4,W,4);x.fillRect(0,H-8,W,4);
  rosette(x,W*.25,H/2,17,C.cream,C.rose);
  x.fillStyle=C.cream;x.beginPath();x.moveTo(W*.75-18,H/2);x.lineTo(W*.75,H/2-14);x.lineTo(W*.75+18,H/2);x.lineTo(W*.75,H/2+14);x.fill();
  x.fillStyle=C.peach;x.beginPath();x.arc(W*.75,H/2,5,0,Math.PI*2);x.fill();
},[10,1]);
const roofTexture=()=>paint(512,64,(x,W,H)=>{
  for(let k=0;k<12;k++){x.fillStyle=k%2?C.cream:'#b9d7ee';x.fillRect(k*W/12,0,W/12,H);}
  x.fillStyle=C.gold;for(let k=0;k<12;k++)x.fillRect(k*W/12-1.5,0,3,H);
});

// A photo as a polaroid: the picture on paper, the name and time handwritten
// underneath. Golden-window photos are printed on gold.
function polaroid(item){
  const W=384,H=448,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,H);
  g.addColorStop(0,item.golden?'#fff3cf':'#fdfaf3');g.addColorStop(1,item.golden?'#efd08a':'#f1e9da');
  x.fillStyle=g;x.fillRect(0,0,W,H);
  if(item.golden){x.strokeStyle='#c9993f';x.lineWidth=6;x.strokeRect(10,10,W-20,H-20);}
  x.drawImage(item.canvas,27,27,330,330);
  x.fillStyle='#3b2a1c';x.textAlign='center';x.textBaseline='middle';
  x.font='28px "Segoe Print","Bradley Hand",Georgia,serif';
  x.fillText(`${item.golden?'✦ ':''}${item.name} · ${fmt(item.time)}`,W/2,400);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}

export function createCarousel({island,members,me,notice,view,time}){
  const deck=island.model.getObjectByName('Deck')??island.model.getObjectByName('Water');
  island.group.updateMatrixWorld(true);
  const deckBox=new T.Box3().setFromObject(deck);
  const root=new T.Group();root.position.copy(island.group.worldToLocal(deckBox.getCenter(new T.Vector3())));
  root.position.y=deckBox.max.y-island.group.position.y;island.group.add(root);
  // the plinth is solid: the gardener walks round it on the deck's rim
  island.obstacles.push({x:root.position.x/island.scale,z:root.position.z/island.scale,r:(R_BASE+.2)/island.scale});
  const items=[], friends=members.filter(m=>m.id!==me), owner=members.find(m=>m.id===me);
  let open=false, rung=false, endsAt=0, windowAt=toMin(WINDOW_AT), timer=null, stream=null, pending=null, lastT=0;

  // ---- the carousel ---------------------------------------------------------
  const spin=new T.Group();root.add(spin);   // everything above the plinth turns
  const std=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.75,...o});
  const gold=std(C.gold,{metalness:.35,roughness:.45}), leaf=std(C.leaf,{flatShading:true});
  const petals=[C.rose,C.lav,C.peach,C.mint].map(c=>std(c));
  const bulbMat=std('#fff4dc',{emissive:'#ffd48a',emissiveIntensity:1.3});
  const add=(parent,geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const flat=m=>{m.rotation.x=Math.PI/2;return m;};
  const bead=new T.SphereGeometry(.06,8,6);
  // the plinth, painted with rosettes, studded and trimmed in gold
  add(root,new T.CylinderGeometry(R_BASE+.08,R_BASE+.16,.3,40),[std('#fff',{map:bandTexture()}),std(C.lav),std(C.lav)],0,.15,0);
  flat(add(root,new T.TorusGeometry(R_BASE+.1,.04,6,48),gold,0,.3,0));
  for(let k=0;k<20;k++){const a=k/20*Math.PI*2;add(root,bead,gold,Math.cos(a)*(R_BASE+.18),.15,Math.sin(a)*(R_BASE+.18));}
  // the turning platform, with a small garden round the column
  add(spin,new T.CylinderGeometry(R_BASE,R_BASE+.02,.14,40),std(C.cream),0,.37,0);
  const tuft=new T.IcosahedronGeometry(.24,0), bud=new T.SphereGeometry(.07,8,6);
  for(let k=0;k<6;k++){
    const a=k/6*Math.PI*2+.3, x=Math.cos(a)*1.35, z=Math.sin(a)*1.35;
    add(spin,tuft,leaf,x,.58,z);
    for(let j=0;j<3;j++){const b=a+j*2.1;add(spin,bud,petals[(k+j)%4],x+Math.cos(b)*.15,.76,z+Math.sin(b)*.15);}
  }
  // the column: a painted drum, then a tall shaft of arches, ringed in gold
  add(spin,new T.CylinderGeometry(.62,.72,.9,24),std('#fff',{map:drumTexture()}),0,.89,0);
  flat(add(spin,new T.TorusGeometry(.63,.045,6,32),gold,0,1.34,0));
  add(spin,new T.CylinderGeometry(.4,.44,Y_CEIL-1.34,24,1,true),std('#fff',{map:shaftTexture()}),0,(Y_CEIL+1.34)/2,0);
  for(const y of [2.9,4.3])flat(add(spin,new T.TorusGeometry(.44,.05,6,32),gold,0,y,0));
  add(spin,new T.CylinderGeometry(.66,.46,.42,24),petals[0],0,Y_CEIL-.21,0);
  // the canopy: a ceiling with gold spokes and two rings of hooks, a crown
  // of arched panels each painted with a flower, bulbs, and a striped roof
  add(spin,new T.CircleGeometry(R_CANOPY,36),std('#efe6f7',{side:T.DoubleSide}),0,Y_CEIL,0).rotation.x=Math.PI/2;
  const rib=new T.BoxGeometry(R_CANOPY-.1,.06,.06);
  for(let k=0;k<12;k++){const a=k/12*Math.PI*2;add(spin,rib,gold,Math.cos(a)*R_CANOPY/2,Y_CEIL-.03,Math.sin(a)*R_CANOPY/2).rotation.y=-a;}
  for(const r of [R_IN,R_OUT])flat(add(spin,new T.TorusGeometry(r,.03,5,48),gold,0,Y_CEIL-.05,0));
  const shape=new T.Shape();arch(shape,PANEL_W,PANEL_H);
  const panel=new T.ShapeGeometry(shape,8);
  {const p=panel.attributes.position,uv=panel.attributes.uv;for(let n=0;n<p.count;n++)uv.setXY(n,p.getX(n)/PANEL_W+.5,p.getY(n)/PANEL_H);}
  const panels=[C.rose,C.lav,C.peach,C.mint].map(c=>std('#fff',{map:panelTexture(c),side:T.DoubleSide}));
  const pendant=new T.ConeGeometry(.055,.18,6);
  for(let k=0;k<12;k++){
    const a=(k+.5)/12*Math.PI*2, d=R_CANOPY*Math.cos(Math.PI/12);
    add(spin,panel,panels[k%4],Math.cos(a)*d,Y_CEIL-.02,Math.sin(a)*d).rotation.y=Math.PI/2-a;
    add(spin,pendant,gold,Math.cos(a)*d,Y_CEIL-.12,Math.sin(a)*d).rotation.x=Math.PI;
    const v=k/12*Math.PI*2;add(spin,bead,bulbMat,Math.cos(v)*(R_CANOPY+.03),Y_CEIL-.07,Math.sin(v)*(R_CANOPY+.03)).scale.setScalar(1.3);
  }
  flat(add(spin,new T.TorusGeometry(R_CANOPY,.05,6,12),gold,0,Y_CEIL,0));   // twelve sides, meeting the panels' corners
  const ROOF=1.6, eave=Y_CEIL+PANEL_H*.45;
  add(spin,new T.ConeGeometry(R_CANOPY*.97,ROOF,12),std('#fff',{map:roofTexture(),flatShading:true}),0,eave+ROOF/2,0);
  add(spin,new T.CylinderGeometry(.4,.48,.3,12),petals[0],0,eave+ROOF-.05,0);
  add(spin,new T.SphereGeometry(.26,14,10),std(C.peach),0,eave+ROOF+.3,0);
  add(spin,new T.ConeGeometry(.07,.42,8),gold,0,eave+ROOF+.72,0);

  // ---- hanging the photos ---------------------------------------------------
  const cordGeo=new T.CylinderGeometry(.012,.012,1,4), frameGeo=new T.BoxGeometry(PW,PH,.04);
  const faceGeo=new T.PlaneGeometry(PW-.02,PH-.02), pegGeo=new T.BoxGeometry(.13,.24,.09);
  const cordMat=std('#8a6a55'), paper=std('#fbf6ec',{roughness:.9});
  const goldPaper=std('#f5d98c',{emissive:'#ffc86a',emissiveIntensity:.25,roughness:.6});
  const pegs={};const pegMat=id=>pegs[id]??=std(PEG[id]??C.gold);
  function hang(item){
    let slot=SLOTS.findIndex((_,k)=>!items.some(i=>i.slot===k));
    if(slot<0){   // every hook is taken: the oldest everyday photo comes down (it stays in the album)
      const old=items.filter(i=>i.slot>=0&&!i.golden&&i!==item).sort((a,b)=>a.time-b.time)[0];
      if(!old)return;slot=old.slot;unhang(old);
    }
    const s=SLOTS[slot], pivot=new T.Group();
    pivot.position.set(Math.cos(s.a)*s.r,Y_CEIL-.05,Math.sin(s.a)*s.r);pivot.rotation.y=Math.PI/2-s.a;   // faces outward
    const cord=new T.Mesh(cordGeo,item.golden?gold:cordMat);cord.scale.y=s.drop;cord.position.y=-s.drop/2;
    const card=new T.Group();card.position.y=-s.drop-PH/2;
    const face=new T.MeshBasicMaterial({map:item.tex});
    const frame=new T.Mesh(frameGeo,item.golden?goldPaper:paper), front=new T.Mesh(faceGeo,face), back=new T.Mesh(faceGeo,face);
    front.position.z=.021;back.position.z=-.021;back.rotation.y=Math.PI;frame.castShadow=true;
    const peg=new T.Mesh(pegGeo,pegMat(item.member.id));peg.position.y=PH/2;
    card.add(frame,front,back,peg);pivot.add(cord,card);
    pivot.traverse(o=>{o.userData.moment=item;});
    spin.add(pivot);Object.assign(item,{pivot,face,slot,phase:slot*1.7});
  }
  function unhang(item){if(!item.pivot)return;spin.remove(item.pivot);item.face.dispose();item.pivot=null;item.slot=-1;}
  function remove(item){unhang(item);item.tex.dispose();items.splice(items.indexOf(item),1);}

  // Several photos a day for everyone; one golden one each per window.
  function post(member,canvas,{golden=false,at,caption='',src,quiet}={}){
    if(golden&&items.some(i=>i.golden&&i.member.id===member.id))golden=false;
    const item={member,canvas,golden,caption,time:at??time(),name:member.id===me?'You':member.owner,
                src:src??canvas.toDataURL('image/jpeg',.9),slot:-1};
    item.tex=polaroid(item);items.push(item);hang(item);
    if(!quiet)notice(member.id===me?`Your ${golden?'golden moment':'photo'} is hanging on the carousel.`
                    :golden?`${member.owner}’s golden moment is on the carousel.`:`${member.owner} hung a photo on the carousel.`);
    refresh();if($('album').open)renderAlbum();
  }

  // ---- the golden window ----------------------------------------------------
  function tick(){
    const left=Math.max(0,endsAt-Date.now());
    $('golden-time').textContent=`${Math.floor(left/60000)}:${String(Math.ceil(left/1000)%60).padStart(2,'0')} left`;
    if(left<=0)close();
  }
  function ring(){
    if(open)return;
    for(const i of items.filter(i=>i.golden))remove(i);   // demo control: a new window replaces today's
    open=true;rung=true;windowAt=time();endsAt=Date.now()+WINDOW_MS;clearInterval(timer);timer=setInterval(tick,500);tick();
    notice('✦ The golden window is open. Two minutes to share this moment.');
    // mock friends: most share inside the window, the last one just misses it
    friends.forEach((m,i)=>{
      const late=friends.length>1&&i===friends.length-1, src=MOMENTS.find(x=>x.golden&&x.id===m.id)?.src;
      if(src)setTimeout(()=>load(src).then(c=>post(m,c,{golden:open,src:DIR+src,caption:open?'':'Just after the window'})),
                        late?WINDOW_MS+8000:5000+i*9000+Math.random()*5000);
    });
    refresh();
  }
  function close(){open=false;clearInterval(timer);refresh();setTimeout(()=>{if(!open)$('golden').hidden=true;},9000);}
  function refresh(){
    const mine=items.some(i=>i.golden&&i.member.id===me);
    $('golden').hidden=!rung||(mine&&!open);
    $('golden').classList.toggle('closed',!open);
    $('golden-title').textContent=open?'The golden window is open':'The golden window has closed';
    if(!open)$('golden-time').textContent='You can still hang a photo on the carousel today.';
    $('golden-share').hidden=mine;$('golden-share').textContent=open?'Share this moment':'Hang a photo';
    $('share-late').hidden=!rung||mine;
  }

  // ---- capture: webcam if there is one, a file otherwise ---------------------
  async function openCapture(){
    pending=null;$('capture-send').disabled=true;$('capture-preview').hidden=true;$('capture-video').hidden=false;
    $('capture-snap').hidden=false;$('capture-status').textContent='Looking for a camera…';$('capture-caption').value='';
    $('capture-title').textContent=open?'Share this moment':'Hang a photo';
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
    $('capture-send').disabled=false;$('capture-status').textContent=open?'Ready when you are. It will hang in gold.':'Ready when you are.';
  }
  $('capture-snap').onclick=()=>{const v=$('capture-video');preview(square(v,v.videoWidth,v.videoHeight,512));};
  $('capture-file').onchange=e=>{const f=e.target.files[0];if(f)loadSquare(f,512).then(preview);e.target.value='';};
  $('capture-send').onclick=()=>{if(pending)post(owner,pending,{golden:open,caption:$('capture-caption').value.trim()});$('capture').close();};
  $('capture-cancel').onclick=()=>$('capture').close();
  $('capture').addEventListener('close',stop);
  $('golden-share').onclick=openCapture;$('share-late').onclick=openCapture;
  $('golden-dismiss').onclick=()=>{$('golden').hidden=true;};

  // ---- the album: the golden window first, then the day in order ------------
  const TILT=[-2.2,1.4,-.9,2,-1.6,.8];
  const detail=i=>[fmt(i.time),i.caption].filter(Boolean).join(' · ');
  const viewItem=i=>view({src:i.src,sub:detail(i),
    title:i.member.id===me?`Your ${i.golden?'golden moment':'photo'}`:`${i.member.owner}’s ${i.golden?'golden moment':'photo'}`});
  function card(item,k){
    const b=document.createElement('button');b.type='button';b.className='polaroid';
    b.style.setProperty('--tilt',`${TILT[k%TILT.length]}deg`);b.style.setProperty('--peg',PEG[item.member.id]??C.gold);
    b.append(Object.assign(document.createElement('img'),{src:item.src,alt:item.caption||`${item.name}’s photo`}),
             Object.assign(document.createElement('span'),{className:'pol-name',textContent:item.name}),
             Object.assign(document.createElement('span'),{className:'pol-meta',textContent:detail(item)}));
    b.onclick=()=>viewItem(item);
    const li=document.createElement('li');li.append(b);return li;
  }
  function renderAlbum(){
    const byTime=(a,b)=>a.time-b.time, golden=items.filter(i=>i.golden).sort(byTime), day=items.filter(i=>!i.golden).sort(byTime);
    $('album-count').textContent=`${items.length} ${items.length===1?'moment':'moments'} hung today. The carousel clears at midnight.`;
    $('album-golden-note').textContent=open?'Open right now. Two minutes, everyone at once.'
      :golden.length?`Opened at ${fmt(windowAt)}. Two minutes, everyone at once.`:'It hasn’t rung yet today. It opens by surprise, for two minutes.';
    $('album-golden').replaceChildren(...golden.map(card));$('album-golden').hidden=!golden.length;
    $('album-day').replaceChildren(...day.map(card));$('album-day-note').hidden=!!day.length;
  }
  function openAlbum(){renderAlbum();$('album').showModal();}
  $('album-close').onclick=()=>$('album').close();
  $('album-add').onclick=()=>{$('album').close();openCapture();};

  // Today so far: the golden window rang at 13:27, and the day's photos are up.
  Promise.all(MOMENTS.map(m=>load(m.src).then(c=>[m,c]))).then(list=>{
    rung=true;
    for(const [m,c] of list)post(members.find(x=>x.id===m.id),c,{golden:!!m.golden,at:toMin(m.at),caption:m.caption,src:DIR+m.src,quiet:true});
  }).catch(e=>console.warn('[photos] moments did not load',e));

  const wp=new T.Vector3();
  return {
    ring,openAlbum,
    get items(){return items;},
    get status(){return {open,rung};},
    update(t,motion){
      const dt=Math.min(.1,Math.max(0,t-lastT));lastT=t;
      spin.rotation.y+=dt*(open?.22:.07);   // a slow turn; livelier while the window is open
      bulbMat.emissiveIntensity=open?2.8:1.3;goldPaper.emissiveIntensity=open?.6:.25;
      for(const i of items)if(i.pivot){
        i.pivot.rotation.z=motion?Math.sin(t*.9+i.phase)*.05:0;
        i.pivot.rotation.x=motion?Math.sin(t*.6+i.phase*1.3)*.03:0;
      }
    },
    near(world,radius){
      root.getWorldPosition(wp);
      const d=Math.hypot(world.x-wp.x,world.z-wp.z);
      return d<radius?{d,at:wp.clone().setY(wp.y+8.9)}:null;
    },
    pick(raycaster){
      const hit=raycaster.intersectObject(root,true)[0];
      if(!hit)return false;
      const item=hit.object.userData.moment;if(item)viewItem(item);else openAlbum();return true;
    },
  };
}

function square(source,w,h,size=320){
  const c=document.createElement('canvas');c.width=c.height=size;const s=Math.min(w,h);
  c.getContext('2d').drawImage(source,(w-s)/2,(h-s)/2,s,s,0,0,size,size);return c;
}
export function loadSquare(file,size){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>{resolve(square(img,img.naturalWidth,img.naturalHeight,size));URL.revokeObjectURL(img.src);};
    img.onerror=reject;img.src=URL.createObjectURL(file);
  });
}
