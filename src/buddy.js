// The gardener, drawn small, stands on the top edge of a dashboard sheet and
// walks to whatever you point at or focus -- the same character as in the
// world behind, so opening a sheet never feels like leaving it. It hops when
// the plan changes. It never speaks or advises.
export function createBuddy(sheet,src){
  const img=Object.assign(document.createElement('img'),{src,alt:'',className:'buddy'});
  img.setAttribute('aria-hidden','true');sheet.append(img);
  img.addEventListener('animationend',e=>{if(e.animationName==='buddy-hop')img.classList.remove('hop');});
  const still=matchMedia('(prefers-reduced-motion: reduce)');
  let x=60, target=60, face=1, last=0, raf=0;
  const aim=clientX=>{const r=sheet.getBoundingClientRect();target=Math.max(44,Math.min(r.width-44,clientX-r.left));};
  sheet.addEventListener('pointermove',e=>aim(e.clientX));
  sheet.addEventListener('focusin',e=>{const r=e.target.getBoundingClientRect();aim(r.left+r.width/2);});
  function step(t){
    raf=0;if(sheet.hidden)return;
    const dt=Math.min(.05,(t-(last||t))/1000), d=target-x;last=t;
    if(still.matches)x=target;else x+=Math.sign(d)*Math.min(Math.abs(d),150*dt);
    if(Math.abs(d)>3)face=d>0?1:-1;
    img.style.left=`${x}px`;img.style.setProperty('--face',face);
    img.classList.toggle('walking',Math.abs(d)>3&&!still.matches);
    raf=requestAnimationFrame(step);
  }
  return {
    show(){x=target=60;last=0;img.style.left=`${x}px`;if(!raf)raf=requestAnimationFrame(step);},
    hop(){if(sheet.hidden||still.matches)return;img.classList.remove('hop');void img.offsetWidth;img.classList.add('hop');},
  };
}
