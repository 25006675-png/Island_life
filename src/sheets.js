// Sheets slide up over the living scene, which stays dimmed and softly blurred
// behind a veil. One is open at a time; the ×, a tap on the scene, Esc, or a
// swipe down on the handle closes it.
export function createSheets(){
  const veil=document.getElementById('veil');
  let open=null, opener=null;
  function show(el,from){
    if(open&&open!==el)hide();
    open=el;opener=from??null;el.hidden=false;veil.hidden=false;
    opener?.setAttribute('aria-expanded','true');
    el.querySelector('.sheet-close')?.focus();
  }
  function hide(){
    if(!open)return;
    const el=open;open=null;el.hidden=true;veil.hidden=true;el.style.translate='';
    opener?.setAttribute('aria-expanded','false');opener?.focus();opener=null;
  }
  veil.addEventListener('click',hide);
  for(const sheet of document.querySelectorAll('.sheet'))sheet.querySelector('.sheet-close')?.addEventListener('click',hide);
  // capture phase, so Esc closes the sheet instead of also leaving the walk
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!open||document.querySelector('dialog[open]'))return;
    e.stopImmediatePropagation();e.preventDefault();hide();
  },true);
  for(const handle of document.querySelectorAll('.sheet-handle')){
    let y0=null;
    handle.addEventListener('pointerdown',e=>{y0=e.clientY;handle.setPointerCapture(e.pointerId);});
    handle.addEventListener('pointermove',e=>{if(y0!==null&&open)open.style.translate=`0 ${Math.max(0,e.clientY-y0)}px`;});
    handle.addEventListener('pointerup',e=>{
      if(y0===null)return;const dy=e.clientY-y0;y0=null;
      if(dy>70)hide();else if(open)open.style.translate='';
    });
  }
  return {show,hide,isOpen:el=>open===el};
}
