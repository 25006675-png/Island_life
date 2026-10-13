import * as T from 'three';

// The fairy (fairy.js flies her): a chibi girl about one unit tall, built from rounded shapes in the gardener's
// soft-toy materials (blomy.js) -- big red-orange hair, a gold zigzag crown, a yellow petal dress with a red-brown
// belt, red shoes, four see-through wings and a star wand. She faces +z; the group's origin is her middle.
// userData.animate(time) flaps the wings, bobs her, swings the free leg and twinkles the star.
function mat(hex,o={}){return new T.MeshPhysicalMaterial(Object.assign({color:hex,roughness:.7,sheen:.35,sheenRoughness:.9,sheenColor:new T.Color(hex).lerp(new T.Color('#ffffff'),.5)},o));}

// a soft round glow for the halo and the star (additive sprites)
function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,240,170,.55)');r.addColorStop(1,'rgba(255,220,120,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
// a wing: a long rounded leaf from its root (0,0) to its tip (0,len), cream at the root fading to mint at the tip
function wingGeometry(len,wid){
  const s=new T.Shape();s.moveTo(0,0);
  s.bezierCurveTo(wid*1.1,len*.18,wid*1.05,len*.85,0,len);
  s.bezierCurveTo(-wid*.75,len*.82,-wid*.55,len*.2,0,0);
  const g=new T.ShapeGeometry(s,20),p=g.attributes.position,col=[],a=new T.Color('#fffbe2'),b=new T.Color('#a8ecd0'),c=new T.Color();
  for(let i=0;i<p.count;i++){c.copy(a).lerp(b,Math.min(1,p.getY(i)/len));col.push(c.r,c.g,c.b);}
  g.setAttribute('color',new T.Float32BufferAttribute(col,3));return g;
}
function starGeometry(outer,inner,depth){
  const s=new T.Shape();
  for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?inner:outer;i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}
  const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:depth*.45,bevelSize:outer*.12,bevelSegments:3,curveSegments:4});g.center();return g;
}

export function makeFairy(){
  const M={skin:mat('#ffd9c4',{roughness:.6,clearcoat:.05}),
    hair:mat('#e9462b',{roughness:.6,sheen:.55,sheenColor:new T.Color('#ff9d72'),side:T.DoubleSide}),hairDeep:mat('#c63421',{roughness:.65,sheen:.4,sheenColor:new T.Color('#f0704e')}),
    dress:mat('#ffd534',{roughness:.6,sheen:.5,sheenColor:new T.Color('#fff3a8')}),dress2:mat('#f7bb22',{roughness:.62,sheen:.45,sheenColor:new T.Color('#ffe08a')}),
    belt:mat('#a63a28',{roughness:.55}),shoe:mat('#df2f2a',{roughness:.35,clearcoat:.5}),
    crown:mat('#ffcb2b',{roughness:.38,clearcoat:.35,emissive:'#ffb300',emissiveIntensity:.18}),
    eye:mat('#191214',{roughness:.2,clearcoat:.8}),white:new T.MeshBasicMaterial({color:'#ffffff'}),blush:mat('#ff8e9b',{roughness:.85}),mouth:mat('#a3332f',{roughness:.6}),
    wand:mat('#7b2b22',{roughness:.5}),star:new T.MeshStandardMaterial({color:'#ffe14a',emissive:'#ffcf1a',emissiveIntensity:1.5,roughness:.35}),
    wing:new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.78,side:T.DoubleSide,depthWrite:false})};
  const ball=new T.SphereGeometry(1,28,20);
  const add=(parent,geo,m,pos,scale=[1,1,1],rot=[0,0,0])=>{const o=new T.Mesh(geo,m);o.position.set(...pos);o.scale.set(...scale);o.rotation.set(...rot);parent.add(o);return o;};
  const group=new T.Group();group.name='Fairy';
  const body=new T.Group();body.position.y=-.5;group.add(body);   // feet at y 0 inside, her middle at the group's origin

  // head and face, on a short neck: the head group is drawn at full size, then shrunk (HEAD) about the top of the
  // neck and set a little above the dress, so a bit of neck shows between the chin and the collar
  const HEAD=.88, NECK=.58, LIFT=.04;
  const head=new T.Group();head.scale.setScalar(HEAD);head.position.y=NECK*(1-HEAD)+LIFT;body.add(head);
  add(head,ball,M.skin,[0,.74,0],[.198,.183,.188]);
  for(const s of [-1,1]){
    add(head,ball,M.skin,[s*.188,.715,.005],[.03,.04,.03]);                                   // ears, mostly under the hair
    add(head,ball,M.eye,[s*.066,.73,.168],[.032,.044,.02],[0,s*.38,0]);                        // big round eyes
    add(head,ball,M.white,[s*.066+.012,.748,.183],[.011,.011,.006]);                           // their shine
    add(head,ball,M.blush,[s*.112,.684,.146],[.04,.029,.012],[0,s*.62,0]);                    // cheeks
  }
  add(head,new T.TorusGeometry(.019,.005,8,16,Math.PI),M.mouth,[0,.684,.181],[1,1,1],[0,0,Math.PI]);   // a small smile

  // hair: a cap tipped back so the face stays open, a side-swept fringe, locks by the cheeks and a big flowing back;
  // the locks hang behind the shoulders, so the arms are seen joining the body
  add(head,new T.SphereGeometry(1,32,20,0,Math.PI*2,0,Math.PI*.6),M.hair,[0,.755,-.012],[.212,.205,.212],[-.55,0,0]);
  add(head,ball,M.hair,[.035,.835,.15],[.135,.068,.06],[-.32,0,.38]);
  add(head,ball,M.hair,[-.1,.808,.142],[.088,.056,.05],[-.3,0,-.55]);
  add(head,ball,M.hair,[.135,.79,.12],[.075,.06,.05],[-.25,0,.6]);
  for(const s of [-1,1])add(head,ball,M.hair,[s*.18,.65,-.035],[.058,.15,.065],[0,0,s*.12]);
  add(head,ball,M.hairDeep,[0,.6,-.135],[.235,.31,.15]);   // the back of the hair keeps behind the neck
  add(head,ball,M.hair,[0,.66,-.1],[.225,.25,.13]);
  add(head,ball,M.hairDeep,[-.12,.4,-.12],[.11,.16,.1],[0,0,.22]);
  add(head,ball,M.hair,[.2,.5,-.12],[.11,.2,.1],[0,0,-.3]);                                  // the big lock flowing behind her left shoulder

  // crown: a gold band with zigzag points across the front, tipped back and a little askew
  const crown=new T.Group();crown.position.set(0,.9,-.02);crown.rotation.set(-.42,0,.12);head.add(crown);
  add(crown,new T.CylinderGeometry(.118,.124,.03,28,1,true),M.crown,[0,0,0]);
  for(let i=-3;i<=3;i++){const a=i*.34;add(crown,new T.ConeGeometry(.026,.058,4),M.crown,[Math.sin(a)*.12,.04,Math.cos(a)*.12],[1,1,.6],[0,a,0]);}

  // dress: sleeveless top, belt, and a skirt of seven petals
  add(body,new T.CylinderGeometry(.034,.038,.08,14),M.skin,[0,.57,0]);                       // neck, from the dress up into the head
  add(body,new T.CylinderGeometry(.072,.084,.15,22),M.dress,[0,.48,0]);
  add(body,ball,M.dress,[0,.552,0],[.074,.026,.064]);
  add(body,new T.TorusGeometry(.083,.012,10,30),M.belt,[0,.415,0],[1,1,1],[Math.PI/2,0,0]);
  add(body,new T.CylinderGeometry(.084,.15,.16,26),M.dress2,[0,.33,0]);
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2+.2, pivot=new T.Group();pivot.position.set(0,.405,0);pivot.rotation.y=a;body.add(pivot);
    add(pivot,ball,i%2?M.dress2:M.dress,[0,-.105,.098],[.078,.15,.032],[-.42,0,0]);
  }

  // legs and red shoes: one straight, one kicked back as in the picture
  const leg=new T.CapsuleGeometry(.031,.13,6,12), shoe=[.043,.032,.062];
  add(body,leg,M.skin,[-.05,.145,.008]);
  add(body,ball,M.shoe,[-.05,.04,.03],shoe);
  const kick=new T.Group();kick.position.set(.052,.23,0);kick.rotation.x=.75;body.add(kick);
  add(kick,leg,M.skin,[0,-.085,0]);
  add(kick,ball,M.shoe,[0,-.17,.02],shoe,[-.2,0,0]);

  // arms: each grows out of a round shoulder sunk into the top of the dress -- the right one relaxed,
  // the left one out to the side holding the wand upright
  const arm=new T.CapsuleGeometry(.024,.095,6,10);
  const shoulder=(x,rot)=>{const g=new T.Group();g.position.set(x,.528,.005);g.rotation.set(...rot);body.add(g);
    add(g,ball,M.skin,[0,0,0],[.036,.036,.036]);add(g,arm,M.skin,[0,-.065,0]);add(g,ball,M.skin,[0,-.13,0],[.034,.034,.034]);return g;};
  shoulder(-.088,[-.1,0,-.55]);
  const raise=shoulder(.088,[-.45,0,1.25]);
  const wand=new T.Group();wand.position.set(0,-.13,0);raise.add(wand);
  wand.quaternion.copy(raise.quaternion).invert().multiply(new T.Quaternion().setFromEuler(new T.Euler(.2,0,-.3)));   // upright, a touch out and forward
  add(wand,new T.CylinderGeometry(.0075,.0075,.26,8),M.wand,[0,.11,0]);
  const star=add(wand,starGeometry(.058,.026,.018),M.star,[0,.255,0]);

  // wings: two big upper, two smaller lower, hinged at her upper back; each flaps on its own hinge
  const wings=[];
  for(const s of [-1,1])for(const [len,wid,tilt] of [[.52,.2,.92],[.36,.14,2.2]]){
    const hinge=new T.Group();hinge.position.set(s*.03,.52,-.2);body.add(hinge);   // behind the hair, so they open out past it
    const w=add(hinge,wingGeometry(len,wid),M.wing,[0,0,0],[s,1,1],[0,0,-s*tilt]);w.renderOrder=2;
    wings.push({hinge,s});
  }

  // a soft halo, and a twinkle on the star
  const tex=glowTexture();
  const halo=new T.Sprite(new T.SpriteMaterial({map:tex,color:'#ffe88a',transparent:true,opacity:.16,blending:T.AdditiveBlending,depthWrite:false}));
  halo.position.set(0,.55,-.06);halo.scale.setScalar(1.05);halo.renderOrder=1;body.add(halo);
  const twinkle=new T.Sprite(new T.SpriteMaterial({map:tex,color:'#fff1a0',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));
  twinkle.scale.setScalar(.2);twinkle.renderOrder=3;star.add(twinkle);

  group.userData.animate=t=>{
    for(const {hinge,s} of wings)hinge.rotation.y=s*(.25+.6*(.5+.5*Math.sin(t*Math.PI*2*5)));   // a quick butterfly flutter
    body.position.y=-.5+.035*Math.sin(t*2.6);
    kick.rotation.x=.75+.12*Math.sin(t*2.6+1);
    star.rotation.y=t*1.8;
    const k=.18+.05*Math.sin(t*6);twinkle.scale.setScalar(k);halo.material.opacity=.14+.04*Math.sin(t*3);
  };
  group.traverse(o=>{o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;});
  return group;
}
