// The dewdrop shop: a few things to grow on your island (garden.js builds
// them). Each is bought once and stays; friends see it when they visit.
// Dewdrops are only ever earned by living the week -- no buying drops, no
// timers, nothing "limited" -- so the shop never adds pressure.
// Prices are kept in step with supabase/migrations/..._shop.sql shop_items,
// where a signed-in purchase is checked.
const $=id=>document.getElementById(id);
export const ITEMS=[
  {id:'flowers',icon:'🌼',name:'Flower bed',called:'a flower bed',blurb:'A ring of flowers round the foot of your windmill.',cost:15,
   line:'Flowers round the windmill. The bees will find them by tomorrow.'},
  {id:'bench',icon:'🪑',name:'Garden bench',called:'a garden bench',blurb:'A wooden bench beside the windmill, for sitting a while.',cost:30,
   line:'A bench by the windmill. Somewhere to sit when the day is done.'},
  {id:'lanterns',icon:'🏮',name:'Stone lanterns',called:'stone lanterns',blurb:'A pair just inside your torii, lit from dusk.',cost:40,
   line:'Two stone lanterns by the gate. They’ll light your way home tonight.'},
  {id:'kite',icon:'🪁',name:'Kite',called:'a kite',blurb:'Flies high over your island, so friends spot it from the sky.',cost:50,
   line:'A kite over your island. Friends will see it from across the sky.'},
  {id:'well',icon:'🪣',name:'Little well',called:'a little well',blurb:'A stone well with a tiny roof, near the windmill.',cost:60,
   line:'A little well, full to the brim. Your island feels lived in.'},
];
export const itemById=id=>ITEMS.find(i=>i.id===id);

// dew(): your balance now. owns(id): already on your island. buy(item):
// resolves true once it's yours.
export function createShop({sheets,dew,owns,buy,notice}){
  const sheet=$('shop-sheet'), grid=$('shop-grid'), cards=new Map();
  let busy=false;
  for(const item of ITEMS){
    const card=document.createElement('button');card.type='button';card.className='shop-card';
    card.innerHTML=`<span class="icon" aria-hidden="true">${item.icon}</span><strong>${item.name}</strong><span>${item.blurb}</span><em></em>`;
    card.onclick=()=>choose(item);
    cards.set(item.id,card);grid.append(card);
  }
  async function choose(item){
    if(busy)return;
    if(owns(item.id)){notice(`${item.name}: already on your island.`);return;}
    const short=item.cost-dew();
    if(short>0){notice(`${short} more ${short===1?'dewdrop':'dewdrops'} to go. They come from finished blocks, golden moments and notes between friends.`);return;}
    if(!await confirmBuy(item))return;
    busy=true;card(item).setAttribute('aria-busy','true');
    try{await buy(item);}finally{busy=false;card(item).removeAttribute('aria-busy');render();}
  }
  const card=item=>cards.get(item.id);
  function confirmBuy(item){
    return new Promise(resolve=>{
      const d=$('buy-dialog'), have=dew();
      $('buy-title').textContent=`${item.icon} ${item.name}`;
      $('buy-text').textContent=`${item.blurb} It costs ${item.cost} dewdrops; you have ${have}, so ${have-item.cost} will be left.`;
      $('buy-yes').textContent=`Grow it for ${item.cost} 💧`;
      const answer=v=>{d.close();resolve(v);};
      $('buy-yes').onclick=()=>answer(true);
      $('buy-no').onclick=()=>answer(false);
      d.oncancel=()=>resolve(false);
      d.showModal();$('buy-no').focus();
    });
  }
  function render(){
    if(sheet.hidden)return;
    const have=dew();
    $('shop-dew').textContent=`💧 ${have} dewdrops`;
    for(const item of ITEMS){
      const c=card(item), mine=owns(item.id), short=item.cost-have;
      c.classList.toggle('owned',mine);c.classList.toggle('short',!mine&&short>0);
      c.querySelector('em').textContent=mine?'✓ On your island':short>0?`${item.cost} 💧 · ${short} to go`:`${item.cost} 💧`;
      c.setAttribute('aria-label',`${item.name}, ${mine?'on your island':`${item.cost} dewdrops`}`);
    }
  }
  return {open(){sheets.show(sheet,$('shop-toggle'));render();},render};
}
