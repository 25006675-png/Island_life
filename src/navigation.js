// Rasterize the authored terrain once. Walking reads a small height field,
// never a high-detail render mesh. Coordinates are local Three.js x/z.
export class HeightField {
  // Accepts one object or several (terrain + plaza terraces + steps): the
  // walkable height is the HIGHEST surface in each cell, so the gardener walks
  // up the stone terraces instead of wading through them at grass level.
  // Bounds come from the geometry, so larger or irregular islands just fit.
  constructor(objects, step = 0.35) {
    const list = [];
    for (const o of (Array.isArray(objects) ? objects : [objects]))
      o?.traverse?.(c => { if (c.isMesh) list.push(c); });
    let lo = Infinity, hi = -Infinity;
    for (const m of list) {
      const p = m.geometry.attributes.position;
      for (let n = 0; n < p.count; n++) {
        const x = p.getX(n), z = p.getZ(n);
        if (x < lo) lo = x; if (z < lo) lo = z; if (x > hi) hi = x; if (z > hi) hi = z;
      }
    }
    this.step = step; this.origin = Math.floor(lo) - 1;
    this.size = Math.ceil((hi - this.origin + 1) / step) + 1;
    this.heights = new Float32Array(this.size ** 2).fill(NaN);
    for (const m of list) this.rasterize(m);
  }
  rasterize(mesh) {
    const step = this.step;
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const get = (n) => { const i = index ? index.getX(n) : n; return [pos.getX(i), pos.getY(i), pos.getZ(i)]; };
    for (let k = 0, count = index?.count ?? pos.count; k < count; k += 3) {
      const a = get(k), b = get(k+1), c = get(k+2);
      if (Math.min(a[1], b[1], c[1]) < -0.9 || Math.max(a[1], b[1], c[1]) > 1.7) continue;
      const denominator = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      if (Math.abs(denominator) < 1e-7) continue;
      const minX = Math.max(0, Math.ceil((Math.min(a[0],b[0],c[0])-this.origin)/step));
      const maxX = Math.min(this.size-1, Math.floor((Math.max(a[0],b[0],c[0])-this.origin)/step));
      const minZ = Math.max(0, Math.ceil((Math.min(a[2],b[2],c[2])-this.origin)/step));
      const maxZ = Math.min(this.size-1, Math.floor((Math.max(a[2],b[2],c[2])-this.origin)/step));
      for(let iz=minZ;iz<=maxZ;iz++) for(let ix=minX;ix<=maxX;ix++) {
        const x=this.origin+ix*step,z=this.origin+iz*step;
        const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator;
        const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator;
        if(u>=-0.001&&v>=-0.001&&u+v<=1.001) {
          const h=u*a[1]+v*b[1]+(1-u-v)*c[1], id=iz*this.size+ix;
          if(!Number.isFinite(this.heights[id])||h>this.heights[id]) this.heights[id]=h;
        }
      }
    }
  }
  // Solid scenery standing on the ground (a trunk, buttress roots) makes its
  // cells unwalkable: any vertex between `above` and `below` over the ground.
  block(objects,above=.15,below=2.6) {
    const hit=new Set();
    for(const o of objects)o?.traverse?.(m=>{
      if(!m.isMesh)return;const p=m.geometry.attributes.position;
      for(let n=0;n<p.count;n++){
        const x=p.getX(n),z=p.getZ(n),h=this.height(x,z);if(h===null)continue;
        const rise=p.getY(n)-h;
        if(rise>above&&rise<below)hit.add(Math.round((z-this.origin)/this.step)*this.size+Math.round((x-this.origin)/this.step));
      }
    });
    for(const id of hit)this.heights[id]=NaN;
  }
  height(x,z) {
    const ix=Math.round((x-this.origin)/this.step),iz=Math.round((z-this.origin)/this.step);
    if(ix<0||iz<0||ix>=this.size||iz>=this.size)return null;
    const h=this.heights[iz*this.size+ix];return Number.isFinite(h)?h:null;
  }
}

export function bridgePoint(bridge,t) {
  const {start:a,end:b,arch}=bridge;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+4*arch*t*(1-t),z:a.z+(b.z-a.z)*t};
}
export function bridgeSurface(bridge,x,z,margin=.25) {
  const dx=bridge.end.x-bridge.start.x,dz=bridge.end.z-bridge.start.z;
  const t=((x-bridge.start.x)*dx+(z-bridge.start.z)*dz)/(dx*dx+dz*dz);
  if(t<0||t>1)return null;
  const p=bridgePoint(bridge,t);
  return Math.hypot(x-p.x,z-p.z)<=bridge.width/2-margin?{...p,t,kind:'bridge',id:bridge.id}:null;
}

export function islandSurface(island,x,z,clearance=.27) {
  const lx=(x-island.x)/island.scale,lz=(z-island.z)/island.scale;
  const h=island.field.height(lx,lz);
  if(h===null)return null;
  for(const [dx,dz] of [[clearance,0],[-clearance,0],[0,clearance],[0,-clearance]])
    if(island.field.height(lx+dx/island.scale,lz+dz/island.scale)===null)return null;
  // The central pond is authored below water level; it is not walkable ground.
  if(island.id==='community'&&h<.17)return null;
  for(const o of island.obstacles??[])if(Math.hypot(lx-o.x,lz-o.z)<o.r+clearance/island.scale)return null;
  return {x,y:island.altitude+h*island.scale,z,kind:'island',id:island.id};
}

export function surfaceAt(islands,bridges,x,z) {
  for(const b of bridges){const s=bridgeSurface(b,x,z);if(s)return s;}
  for(const i of islands){const s=islandSurface(i,x,z);if(s)return s;}
  return null;
}
