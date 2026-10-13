// A white speech bubble beside someone on screen (the fairy, your flower): on her right, or on her left near the
// right edge. When neither side has room (a phone), it goes under her, or over her when there's no room below; its
// tail moves to point at her. It always stays on screen, below the header's buttons and above the bottom bar.
//   at: her point on screen (CSS px)   gap: from her to the bubble's edge   rise: how far the bubble's top sits above her
const M=12;   // the margin kept from the screen's edges, the header and the bottom bar

export function placeBubble(el,at,{gap=46,rise=58}={}){
  const W=innerWidth,H=innerHeight,w=el.offsetWidth,h=el.offsetHeight;
  const top=(parseFloat(document.getElementById('app').style.getPropertyValue('--header-bottom'))||0)+M;
  const side=at.x+gap+w<=W-M?'right':at.x-gap-w>=M?'left':null;
  let x=side==='right'?at.x+gap:side==='left'?at.x-gap-w:at.x-w/2;
  x=Math.min(Math.max(x,M),W-M-w);
  // the bottom bar: the island's name and card, and the view switcher, wherever the bubble would be over them
  let bottom=H-M;
  for(const e of document.querySelectorAll('footer .place, footer .view-controls')){
    const r=e.getBoundingClientRect();if(r.width&&r.left<x+w&&r.right>x)bottom=Math.min(bottom,r.top-M);
  }
  let y, under=false, over=false;
  if(side)y=at.y-rise;
  else if(at.y+gap+h<=bottom){y=at.y+gap;under=true;}
  else{y=at.y-gap-h;over=true;}
  y=Math.max(top,Math.min(y,bottom-h));
  el.style.left=`${Math.round(x)}px`;el.style.top=`${Math.round(y)}px`;
  el.classList.toggle('flip',side==='left');el.classList.toggle('under',under);el.classList.toggle('over',over);
  el.style.setProperty('--tail',`${Math.round(Math.min(Math.max(at.x-x,24),w-24))}px`);
}
