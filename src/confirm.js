// One gentle confirmation before letting a block go, shared by the planner and
// the island. Resolves true for "Let it go", false for "Keep it" or Esc.
const $=id=>document.getElementById(id);

export function confirmLetGo(title){
  return new Promise(resolve=>{
    const d=$('letgo-dialog');
    $('letgo-title').textContent=`Let “${title}” go?`;
    const answer=v=>{d.close();resolve(v);};
    $('letgo-yes').onclick=()=>answer(true);
    $('letgo-no').onclick=()=>answer(false);
    d.oncancel=()=>resolve(false);
    d.showModal();$('letgo-no').focus();
  });
}
