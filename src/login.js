import { createBuddy } from './buddy.js';

// A mock sign-in for the demo: nothing is checked, Enter or the button lets
// you in, and the world loads behind it meanwhile. The gardener waits big on
// the cloud line and can be walked right across the page, in front of the
// cards (← → walk, Space jump, Q E turn), so the sign-in is already the world.
const $=id=>document.getElementById(id);

export function createLogin(onEnter){
  const el=$('login');
  // Signposts on the island (index.html .login-sign): each opens when the
  // gardener walks up to it, or when clicked, tapped or focused. The first
  // opens for a few seconds on arrival, so people see that signs open.
  const signs=[...el.querySelectorAll('.login-sign')].map(s=>({s,btn:s.querySelector('.sign-post'),pinned:false,near:false,focus:false,hint:false}));
  const show=o=>{const on=o.pinned||o.near||o.focus||o.hint;if(o.s.classList.contains('open')!==on){o.s.classList.toggle('open',on);o.btn.setAttribute('aria-expanded',String(on));}};
  for(const o of signs){
    o.btn.onclick=()=>{o.pinned=!o.pinned;show(o);};
    o.btn.onfocus=()=>{o.focus=true;show(o);};o.btn.onblur=()=>{o.focus=false;show(o);};
  }
  const nearSigns=x=>{for(const o of signs){const near=Math.abs(o.s.getBoundingClientRect().left-x)<110;if(near!==o.near){o.near=near;show(o);}}};
  if(signs[0])setTimeout(()=>{signs[0].hint=true;show(signs[0]);setTimeout(()=>{signs[0].hint=false;show(signs[0]);},4500);},1400);
  const buddy=createBuddy(el,{height:Math.round(Math.min(300,innerHeight*.4,innerWidth*.42)),speed:340,place:(node,x,lift,walking)=>{
    x=Math.max(90,Math.min(innerWidth-90,x));
    node.style.left=`${x}px`;node.style.translate=`-50% ${-lift}px`;node.classList.toggle('walking',walking);nearSigns(x);return x;
  }});
  // He starts in the middle of the page and walks in front of the text and
  // the sign-in card (he ignores the mouse, so clicks still reach the form).
  buddy.reset(innerWidth/2);
  let last=0,raf=0;
  const tick=t=>{buddy.step(Math.min((t-last)/1000,.04));last=t;raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(t=>{last=t;tick(t);});
  // capture phase, so the arrows walk the gardener instead of scrolling; typing is untouched
  const keys=e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    const onButton=document.activeElement.tagName==='BUTTON';   // a focused sign or button keeps Enter and Space
    if(e.code==='Enter'&&e.type==='keydown'&&!onButton){enter();return;}   // Enter anywhere else lets you in
    if(e.code==='Space'&&onButton)return;
    if(buddy.key(e.code,e.type==='keydown')){e.preventDefault();e.stopImmediatePropagation();}
  };
  for(const type of ['keydown','keyup'])document.addEventListener(type,keys,true);
  // the sky answers the mouse (style.css #login::before, .login-mote): the
  // glow and the lean follow the pointer; motes rise only over open sky
  const calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTES=['#ffd580','#ffe7b0','#ffd580','#9fdcc8','#bba9e0','#f39a7c','#92aede'];
  let lastMote=0;
  el.addEventListener('pointermove',e=>{
    el.style.setProperty('--mx',(e.clientX/innerWidth-.5).toFixed(3));
    el.style.setProperty('--my',(e.clientY/innerHeight-.5).toFixed(3));
    if(calm||e.timeStamp-lastMote<45||e.target.closest('.login-card,.sign-card')||el.querySelectorAll('.login-mote').length>36)return;
    lastMote=e.timeStamp;
    const m=document.createElement('i'), s=4+Math.random()*6;m.className='login-mote';m.setAttribute('aria-hidden','true');
    m.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;width:${s}px;height:${s}px;--c:${MOTES[Math.random()*MOTES.length|0]};--dx:${((Math.random()-.5)*60).toFixed(0)}px`;
    el.append(m);m.addEventListener('animationend',()=>m.remove());
  });
  let left=false;
  const enter=()=>{
    if(left)return;left=true;el.classList.add('leaving');
    setTimeout(()=>{
      el.hidden=true;cancelAnimationFrame(raf);
      for(const type of ['keydown','keyup'])document.removeEventListener(type,keys,true);
      onEnter?.();
    },matchMedia('(prefers-reduced-motion: reduce)').matches?0:450);
  };
  $('login-form').onsubmit=e=>{e.preventDefault();enter();};
  $('login-guest').onclick=enter;
}
