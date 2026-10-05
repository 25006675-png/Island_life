import { CATEGORIES, fmt, catImg } from './data.js';

// "How draining was that?" (docs/algorithm.md 1): asked soon after an activity
// ends, about that one activity. Light, okay or draining; skipping is fine.
// The answer goes to `onAnswer`, which returns the gardener's one-line reply.
const $=id=>document.getElementById(id);

export function createAsk({onAnswer,notice}){
  const dialog=$('ask-dialog');
  let current=null, queue=[];
  function show(b){
    current=b;
    $('ask-title').textContent=`How draining was ${b.title||CATEGORIES[b.cat].label.toLowerCase()}?`;
    $('ask-what').replaceChildren(catImg(b.cat),`${CATEGORIES[b.cat].label} · ${fmt(b.start)}–${fmt(b.start+b.mins)}`);
    dialog.showModal();dialog.querySelector('[data-answer="okay"]').focus();
  }
  for(const button of dialog.querySelectorAll('[data-answer]'))button.onclick=()=>{
    const b=current;dialog.close();
    if(b)notice(onAnswer(b,button.dataset.answer));
  };
  $('ask-skip').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{current=null;const next=queue.shift();if(next)setTimeout(()=>show(next),500);});
  return {
    // ask now, or straight after whatever is being asked
    ask(b){if(dialog.open||document.querySelector('dialog[open]'))queue.push(b);else show(b);},
    get open(){return dialog.open;},
  };
}
