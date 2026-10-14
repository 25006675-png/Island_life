// The altitude rail, down the left of the sky view: every island on one upright scale, because perspective hides
// height in the scene (a far island can look higher than a near one). Lighter weeks float up top, heavier ones sink
// toward the cloud sea at the bottom, and the gathering island is the 0 m line everyone is measured from. It is the
// island card's gauge (life.js) made tall: each half stretched on its own, so 0 m is always the middle.
// Your own mark says how far; a friend's says only who (README.md privacy: a friend's altitude is never a number).
// Clicking a name visits that island, and hovering one lifts its sign in the sky.
import { ME, HIGH, LOW, loadFromAltitude } from './data.js';

const GAP=30;        // px between two names, so names at about the same height never overlap
const MIN_TALL=160;  // px of track below which the rail steps aside (a short window, or the island card unfolded)
const say=m=>Math.abs(m)<2?'usual height':`${Math.round(Math.abs(m))} m ${m>0?'above':'below'}`;   // life.js altWords

export function createAltitudeRail(parent,{visit}){
  const mk=(tag,cls,text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
  const root=mk('aside','');root.id='altitude-rail';root.setAttribute('aria-label','Altitude: how high each island floats');
  const body=mk('div','rail-body'), track=mk('div','rail-track'), names=mk('div','rail-names');
  // the metres down the left of the bar, each level with its height on it; the names down the right
  const scale=mk('div','rail-scale');
  for(const m of [HIGH,0,LOW]){const s=mk('span','',`${m>0?'+':m<0?'−':''}${Math.abs(m)} m`);s.style.top=`${loadFromAltitude(m)*100}%`;scale.append(s);}
  body.append(scale,track,names);
  root.append(mk('span','rail-kicker','Altitude'),mk('small','rail-end','Lighter week'),body,mk('small','rail-end','Heavier week'));
  parent.append(root);
  // measured only on resize; the rail stays laid out while hidden (visibility), so the height is always known
  let rows=[],tall=0,right=0,shown=false;
  new ResizeObserver(()=>{tall=track.clientHeight;right=root.offsetLeft+root.offsetWidth;}).observe(root);

  function build(islands){
    track.replaceChildren();names.replaceChildren();
    rows=islands.map(island=>{
      const own=island.id===ME, zero=!island.owner;
      const dot=mk('i',zero?'rail-zero':own?'rail-dot me':'rail-dot');
      const tag=mk('button',`rail-tag${own?' me':zero?' zero':''}`);tag.type='button';tag.title=`Visit ${island.name}`;
      const note=mk('span','rail-note');
      tag.append(mk('b','',own?'You':zero?'Gathering island':island.owner));
      if(own)tag.append(note);
      tag.onclick=()=>visit(island.id);
      tag.onpointerenter=()=>{dot.classList.add('lit');island.label?.classList.add('pointed');};
      tag.onpointerleave=()=>{dot.classList.remove('lit');island.label?.classList.remove('pointed');};
      track.append(dot);names.append(tag);
      return {island,own,zero,dot,tag,note,y:0,at:-1,said:''};
    });
  }

  function update(islands,show){
    show=show&&tall>=MIN_TALL;
    if(show!==shown){shown=show;root.classList.toggle('on',show);}
    if(!show)return;
    if(rows.length!==islands.length)build(islands);   // a friend who joins mid-visit gets a mark too
    for(const r of rows){
      r.y=Math.round(Math.min(1,Math.max(0,loadFromAltitude(r.island.altitude)))*tall);
      if(r.own){const t=say(r.island.altitude);if(t!==r.said){r.said=t;r.note.textContent=t;}}
    }
    // a mark and its name share one line, so which is whose never needs working out. Islands at about the same
    // height are spread apart, away from the 0 m line, which stays put; then any pushed past an end come back inside.
    const zy=Math.round(tall/2);   // 0 m: a normal week's load, .5
    const up=rows.filter(r=>!r.zero&&r.y<=zy).sort((a,b)=>b.y-a.y), down=rows.filter(r=>!r.zero&&r.y>zy).sort((a,b)=>a.y-b.y);
    let edge=zy;for(const r of up){r.ty=Math.min(r.y,edge-GAP);edge=r.ty;}
    edge=zy;for(const r of down){r.ty=Math.max(r.y,edge+GAP);edge=r.ty;}
    edge=0;for(let i=up.length-1;i>=0;i--){up[i].ty=Math.max(up[i].ty,edge);edge=up[i].ty+GAP;}
    edge=tall;for(let i=down.length-1;i>=0;i--){down[i].ty=Math.min(down[i].ty,edge);edge=down[i].ty-GAP;}
    for(const r of rows){
      if(r.zero)r.ty=zy;
      if(r.ty!==r.at){r.at=r.ty;r.dot.style.top=r.tag.style.top=`${r.ty}px`;}
    }
  }
  // the screen x that edge-pinned island signs keep to the right of, while the rail shows
  return {update,clear:()=>shown?right:0};
}
