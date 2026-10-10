import * as T from 'three';

// Water from the gardener's can (main.js "Watering"): drops leave the rose on an arc, land at the tree's foot and
// break into a few small splashes. One instanced mesh over a fixed pool, so it costs a single draw.
const N=180, G=9.8, FLIGHT=.5;

export function createWatering(scene){
  const mesh=new T.InstancedMesh(new T.SphereGeometry(1,8,6),
    new T.MeshBasicMaterial({color:'#7fd2ff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false}),N);
  mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
  const drops=[], m=new T.Matrix4(), q=new T.Quaternion(), s=new T.Vector3(), up=new T.Vector3(0,1,0), dir=new T.Vector3();
  const r=k=>(Math.random()-.5)*k;
  let carry=0;
  return {
    // pour for dt seconds from `from` toward the ground at `to` (world Vector3s), `rate` drops a second
    pour(from,to,dt,rate=55){
      for(carry+=dt*rate;carry>=1&&drops.length<N;carry--){
        const t=FLIGHT*(1+r(.25)), v=new T.Vector3(to.x+r(.45)-from.x,0,to.z+r(.45)-from.z).divideScalar(t);
        v.y=(to.y-from.y)/t+.5*G*t;
        drops.push({p:from.clone(),v,floor:to.y,splash:false,life:FLIGHT*3});
      }
    },
    update(dt){
      for(let i=drops.length-1;i>=0;i--){
        const d=drops[i];d.v.y-=G*dt;d.p.addScaledVector(d.v,dt);d.life-=dt;
        if(!d.splash&&d.p.y<=d.floor){
          d.p.y=d.floor;
          for(let k=0;k<3&&drops.length<N;k++)drops.push({p:d.p.clone(),v:new T.Vector3(r(1.6),1+Math.random()*1.2,r(1.6)),floor:d.floor,splash:true,life:.4});
          drops.splice(i,1);continue;
        }
        if(d.life<=0||(d.splash&&d.p.y<d.floor))drops.splice(i,1);
      }
      // a falling drop is drawn a little long, along its path; a splash is a small bead
      for(let i=0;i<drops.length;i++){
        const d=drops[i];
        q.setFromUnitVectors(up,dir.copy(d.v).normalize());
        d.splash?s.setScalar(.07):s.set(.09,.22,.09);
        mesh.setMatrixAt(i,m.compose(d.p,q,s));
      }
      mesh.count=drops.length;mesh.instanceMatrix.needsUpdate=true;
    },
  };
}
