import * as T from 'three';
import { placeBubble } from './bubble.js';

// Talking to your flower (flowermodel.js) is how you check in: she asks "How do you feel?" in a bubble beside her
// (index.html #flower-ask, the mood buttons and the optional photo). She talks only while you're walking on your own
// island: tap her (an invisible button rides on her face, #flower-talk), press T, or walk up and she asks on her own.
// After you answer she rests for a while (rest(): minutes left), and says so if you ask. Until today's check-in she
// droops; then her petals take its colour.
//   here(): you're walking on your own island   near(): you're standing by her
//   blocked(): a sheet, dialog or panel covers the world   mood(): today's mood colour, or null before the check-in
//   rest(): minutes until she asks again (0: ready)   resting(min): you asked while she rests
const GAP=46;   // from her face to her bubble's edge

export function createFlowerTalk({camera,flower,here=()=>false,near=()=>false,blocked=()=>false,mood=()=>null,rest=()=>0,resting=()=>{}}){
  const $=id=>document.getElementById(id);
  const talk=$('flower-talk'), tag=talk.querySelector('span'), box=$('flower-ask'), v=new T.Vector3();
  let open=false, auto=false, wasNear=false, clock=0, wanted=false, wiggle=0;

  // her face on screen (CSS px), or null when she's behind you or well off screen
  function face(){
    flower.userData.head.getWorldPosition(v).project(camera);
    return v.z<1&&Math.abs(v.x)<1.02&&Math.abs(v.y)<1.02?{x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight}:null;
  }
  function place(){placeBubble(box,face()??{x:innerWidth*.55,y:innerHeight*.36},{gap:GAP,rise:64});}
  function setOpen(on,byWalking=false){
    if(on===open)return;
    open=on;auto=on&&byWalking;flower.userData.setTalking(on);
    if(on){box.hidden=false;place();requestAnimationFrame(()=>box.classList.add('on'));box.querySelector('.mood')?.focus({preventScroll:true});}
    else{box.classList.remove('on');box.hidden=true;}
  }
  // asked by you (tap or T): her question, or, while she rests, a little wiggle and when she'll ask again
  function ask(){
    if(open){setOpen(false);return;}
    if(!here()||blocked())return;
    const left=rest();
    if(left>0){wiggle=.7;resting(left);return;}
    setOpen(true);
  }
  box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);talk.focus({preventScroll:true});}});
  box.querySelector('.flower-later').onclick=()=>setOpen(false);
  talk.onclick=ask;
  addEventListener('keydown',e=>{
    if(e.code!=='KeyT'||e.repeat||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(!open&&!here())return;
    e.preventDefault();ask();
  });

  return {
    // her question the next time you're on your island and she's free (a phone prompt: ?ask=mood)
    request(){wanted=true;},
    close(){setOpen(false);},
    get isOpen(){return open;},
    update(dt){
      clock+=dt;
      const today=mood();flower.userData.setDroop(!today);flower.userData.setMood(today);
      wiggle=Math.max(0,wiggle-dt);flower.userData.setTalking(open||wiggle>0);
      flower.userData.animate(clock,dt);
      const home=here(), free=rest()<=0;
      if(open&&(blocked()||!home))setOpen(false);
      if(wanted&&home&&!blocked()){wanted=false;if(free)setOpen(true);}
      // walking up to her opens her question (unless she's resting); walking off again closes it, if that's how it opened
      const n=home&&near();
      if(n&&!wasNear&&!open&&free&&!blocked())setOpen(true,true);
      else if(!n&&wasNear&&open&&auto)setOpen(false);
      wasNear=n;
      // the tap target rides on her face, only while you're on your island; its tag says if she's resting
      const p=home?face():null, show=!!p&&!open&&!blocked();
      if(talk.hidden===show)talk.hidden=!show;
      if(show){
        talk.style.left=`${p.x}px`;talk.style.top=`${p.y}px`;
        // while she rests the tag stays up (phones have no hover), so you can see your feeling was kept
        const left=rest(), text=left>0?`Zzz… check in again in ${left} min`:'How do you feel?';
        if(tag.textContent!==text){tag.textContent=text;talk.classList.toggle('resting',left>0);
          talk.setAttribute('aria-label',left>0?`Your flower is napping. Check in again in ${left} minutes.`:'Talk to your flower: how do you feel?');}
        // she can stand near the edge of the view: the tag slides along so it stays readable on screen
        const half=tag.offsetWidth/2, edge=8;
        tag.style.marginLeft=`${Math.max(0,edge-(p.x-half))+Math.min(0,innerWidth-edge-(p.x+half))}px`;
      }
      if(open)place();
    },
  };
}
