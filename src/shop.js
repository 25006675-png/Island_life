// The dewdrop shop, preview only: the kinds of things dewdrops will grow on
// your island one day. Nothing is for sale yet; every card says so when
// tapped, and no dewdrop is ever spent.
const $=id=>document.getElementById(id);
const KINDS=[
  {icon:'🌾',name:'Garden props',blurb:'A windmill, a bench, a little well by the path.',from:40,note:'1 grown so far'},
  {icon:'🏮',name:'Lanterns',blurb:'New shapes and colours for the feelings in your sky.',from:25},
  {icon:'🪨',name:'Paths & stones',blurb:'Stepping stones and a softer glow for your day.',from:30},
  {icon:'🌱',name:'Care tokens',blurb:'Small gifts to leave at a friend’s gate.',from:15},
];

export function createShop({sheets,dew,notice}){
  const sheet=$('shop-sheet'), grid=$('shop-grid');
  for(const k of KINDS){
    const card=document.createElement('button');card.type='button';card.className='shop-card';
    card.innerHTML=`<span class="icon" aria-hidden="true">${k.icon}</span><strong>${k.name}</strong><span>${k.blurb}</span>`+
                   `<em>from ${k.from} 💧${k.note?` · ${k.note}`:''}</em><span class="soon" aria-hidden="true">Coming soon</span>`;
    card.onclick=()=>{
      card.classList.add('soon-shown');setTimeout(()=>card.classList.remove('soon-shown'),1400);
      notice(`${k.name} are coming soon. Your dewdrops are safe.`);
    };
    grid.append(card);
  }
  const render=()=>{if(!sheet.hidden)$('shop-dew').textContent=`💧 ${dew()} dewdrops`;};
  return {open(){sheets.show(sheet,$('shop-toggle'));render();},render};
}
