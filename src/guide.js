// The first-time guide, the way games teach: Blomy speaks in the welcome page's dialogue box (typed out, a dot per
// step), the screen dims around the one thing to touch, a cartoon hand taps on it, and controls are drawn -- the
// W A S D keys press down as you press them, or the joystick moves on a phone. Each step waits until you have
// done it (`done()`), cheers ("Nice!"), then moves on; steps without `done` wait for the button. Skippable at any
// point; finished or skipped, it stays away on this device until "Show the guide again" in the settings panel.
//   step: {say, art?:'keys'|'stick'|'esc', target?:()=>Element|null, hand?:bool, start?(), done?()}
const KEY='il-guide';
const $=id=>document.getElementById(id);
const seen=()=>{try{return localStorage.getItem(KEY)==='done';}catch{return false;}};
const remember=()=>{try{localStorage.setItem(KEY,'done');}catch{}};
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEYS={KeyW:'w',ArrowUp:'w',KeyA:'a',ArrowLeft:'a',KeyS:'s',ArrowDown:'s',KeyD:'d',ArrowRight:'d',ShiftLeft:'shift',ShiftRight:'shift',Escape:'esc'};

export function createGuide(steps){
  const box=$('guide'), text=$('guide-text'), dots=$('guide-dots'), next=$('guide-next'), art=$('guide-art');
  const spot=$('guide-spot'), hand=$('guide-hand');
  let at=-1, step=null, since=0, cheered=false;
  dots.replaceChildren(...steps.map(()=>document.createElement('i')));
  // Blomy's line types out like the welcome page's: a span per letter, words kept whole
  const type=line=>{let i=0;text.replaceChildren(...line.split(' ').flatMap((w,k)=>{
    const word=document.createElement('span');word.className='w';
    for(const ch of w){const c=document.createElement('span');c.className='c';c.style.setProperty('--i',i++);c.textContent=ch;word.append(c);}
    return k?[' ',word]:[word];}));text.setAttribute('aria-label',line);};
  const drawArt=kind=>{
    art.hidden=!kind;art.className=`guide-art ${kind??''}`;
    if(kind==='keys')art.innerHTML='<div class="keys"><kbd data-k="w">W</kbd><kbd data-k="a">A</kbd><kbd data-k="s">S</kbd><kbd data-k="d">D</kbd></div>'
      +'<div class="key-note"><kbd data-k="shift" class="wide">Shift</kbd><span>to run</span></div>'
      +'<div class="key-note"><span class="mouse" aria-hidden="true"><i></i></span><span>drag to look</span></div>';
    else if(kind==='stick')art.innerHTML='<div class="stick-art" aria-hidden="true"><i></i></div><span>push to walk, all the way to run</span>';
    else if(kind==='esc')art.innerHTML='<div class="key-note"><kbd data-k="esc">Esc</kbd><span>up to the sky</span></div><div class="key-note"><span class="bridge-art" aria-hidden="true"></span><span>a bridge to a friend</span></div>';
    else art.replaceChildren();
  };
  const show=i=>{
    at=i;step=steps[i];cheered=false;box.classList.remove('yay');
    if(!step){finish(true);return;}
    since=0;step.start?.();
    type(typeof step.say==='function'?step.say():step.say);
    drawArt(typeof step.art==='function'?step.art():step.art);
    [...dots.children].forEach((d,k)=>{d.className=k<i?'done':k===i?'now':'';});
    next.hidden=!!step.done;next.textContent=i===steps.length-1?'Let’s go!':'Got it';
    box.hidden=false;box.classList.remove('in');void box.offsetWidth;box.classList.add('in');
  };
  const finish=happy=>{
    box.hidden=true;spot.hidden=true;hand.hidden=true;at=-1;step=null;remember();
    if(happy&&!calm())confetti();
  };
  // a handful of sparkles from the middle of the screen, at the very end
  const confetti=()=>{const cols=['#ff9fd8','#c9a2ff','#ffd6a8','#9fc4ff','#ffffff','#9df0c0'];
    for(let k=0;k<36;k++){const s=document.createElement('i');s.className='guide-confetti';const a=Math.random()*Math.PI*2,d=120+Math.random()*260;
      s.style.cssText=`--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d-80}px;--c:${cols[k%cols.length]};--r:${Math.random()*540-270}deg`;
      document.body.append(s);setTimeout(()=>s.remove(),1400);}};
  next.onclick=()=>show(at+1);
  $('guide-skip').onclick=()=>finish(false);
  // the drawn keys press down with yours
  const press=(e,down)=>{const k=KEYS[e.code];if(!k||box.hidden)return;art.querySelector(`[data-k="${k}"]`)?.classList.toggle('down',down);};
  addEventListener('keydown',e=>press(e,true));addEventListener('keyup',e=>press(e,false));
  // the spotlight and the hand follow their target (labels move with the camera), every frame
  const place=()=>{
    const el=step?.target?.(), r=el&&!el.hidden&&el.getClientRects().length?el.getBoundingClientRect():null;
    const lit=!!r&&!cheered;
    spot.hidden=!lit;hand.hidden=!(lit&&step.hand);
    if(!lit)return;
    const pad=8;Object.assign(spot.style,{left:`${r.left-pad}px`,top:`${r.top-pad}px`,width:`${r.width+pad*2}px`,height:`${r.height+pad*2}px`});
    // the hand: below and a little right of the target, its fingertip on the target's lower middle
    hand.style.left=`${r.left+r.width/2}px`;hand.style.top=`${r.bottom-4}px`;
  };
  return {
    start(force){if(force||!seen())show(0);},
    update(dt){
      if(!step)return;place();
      if(!step.done||!step.done())return;
      if(!cheered){cheered=true;box.classList.add('yay');spot.hidden=true;hand.hidden=true;}
      since+=dt;if(since>.9)show(at+1);
    },
    get on(){return !!step;},
  };
}
