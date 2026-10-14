// The first-time guide, the way games teach: Blomy speaks in the welcome page's dialogue box (typed out, a dot per
// step), the screen dims around the one thing to touch, a cartoon hand taps on it, and controls are drawn -- the
// W A S D keys press down as you press them, or the joystick moves on a phone. Each step waits until you have
// done it (`done()`), cheers ("Nice!"), then moves on; steps without `done` wait for the button. Skippable at any
// point; finished or skipped, it stays away on this device until "Show the guide again" in the settings panel.
// It comes in chapters, each remembered on its own, so it can teach a thing when it first matters (the friends
// chapter waits for a first friend); a finished chapter may lead straight on to the next (`next`).
//   chapter: {key, steps, next?()=>name|null, end?()}   end() runs however the chapter closes
//   step: {say, art?:'keys'|'stick'|'esc', target?:()=>Element|null, hand?:bool, when?(), button?, over?, start?(), done?()}
//   over: Blomy stays in view over an open planner or balance (moved up to the top), for steps that happen in it
//   free: the world isn't held for Blomy (the fairy may come out and ask)
//   reveal: the card for what you walk up to stays usable (the board, a gate), and Blomy moves up out of its way
//   quiet: Blomy's box steps away entirely while something plays out in the world (the watering, the fairy)
//   high: Blomy's box sits at the top, leaving the lower half of the view clear (the demo's island sinking into it)
//   flower: the flower asks even if she's resting (the check-in steps); other steps leave her rest alone
//   act(): what the step's own button does before moving on (the demo's "Exam week" presses Exam week)
//   back(): true sends you back a step to do it again (the board closed before its practice task was done)
const $=id=>document.getElementById(id);
const seen=key=>{try{return localStorage.getItem(key)==='done';}catch{return false;}};
const remember=key=>{try{localStorage.setItem(key,'done');}catch{}};
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEYS={KeyW:'w',ArrowUp:'w',KeyA:'a',ArrowLeft:'a',KeyS:'s',ArrowDown:'s',KeyD:'d',ArrowRight:'d',ShiftLeft:'shift',ShiftRight:'shift',Escape:'esc'};

export function createGuide(chapters){
  const box=$('guide'), text=$('guide-text'), dots=$('guide-dots'), next=$('guide-next'), art=$('guide-art');
  const spot=$('guide-spot'), hand=$('guide-hand');
  let at=-1, step=null, since=0, cheered=false, chapter=null, steps=[];
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
    since=0;document.body.classList.toggle('guide-over',!!step.over);document.body.classList.toggle('guide-reveal',!!step.reveal);document.body.classList.toggle('guide-high',!!step.high);step.start?.();
    type((typeof step.say==='function'?step.say():step.say)??'');   // a quiet step says nothing
    drawArt(typeof step.art==='function'?step.art():step.art);
    [...dots.children].forEach((d,k)=>{d.className=k<i?'done':k===i?'now':'';});
    next.hidden=!!step.done;next.textContent=step.button??(i===steps.length-1?'Let’s go!':'Got it');
    box.hidden=!!step.quiet;box.classList.remove('in');void box.offsetWidth;box.classList.add('in');
  };
  const open=(name,force)=>{
    const c=chapters[name];if(!c||(!force&&seen(c.key)))return false;
    chapter=c;steps=c.steps.filter(s=>!s.when||s.when());
    dots.replaceChildren(...steps.map(()=>document.createElement('i')));
    show(0);return true;
  };
  const finish=happy=>{
    const c=chapter;
    box.hidden=true;spot.hidden=true;hand.hidden=true;at=-1;step=null;chapter=null;document.body.classList.remove('guide-over','guide-reveal','guide-high');
    if(!c)return;
    remember(c.key);c.end?.();
    const then=happy&&c.next?.();
    if(then&&open(then,true))return;   // leading on, the next chapter plays even if seen before: you're mid-way
    if(happy&&!calm())confetti();
  };
  // a handful of sparkles from the middle of the screen, at the very end
  const confetti=()=>{const cols=['#ff9fd8','#c9a2ff','#ffd6a8','#9fc4ff','#ffffff','#9df0c0'];
    for(let k=0;k<36;k++){const s=document.createElement('i');s.className='guide-confetti';const a=Math.random()*Math.PI*2,d=120+Math.random()*260;
      s.style.cssText=`--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d-80}px;--c:${cols[k%cols.length]};--r:${Math.random()*540-270}deg`;
      document.body.append(s);setTimeout(()=>s.remove(),1400);}};
  next.onclick=()=>{step?.act?.();show(at+1);};
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
    start(name,force){if(!chapter)open(name,force);},
    update(dt){
      if(!step)return;place();
      if(step.back?.()&&at>0){show(at-1);return;}
      if(!step.done||!step.done())return;
      if(!cheered){cheered=true;box.classList.add('yay');spot.hidden=true;hand.hidden=true;}
      since+=dt;if(since>.9)show(at+1);
    },
    get on(){return !!step;},
    get free(){return !!step?.free;},
    get flower(){return !!step?.flower;},
  };
}
