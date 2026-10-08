import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Fewer draw calls for built-up models: meshes (and instanced meshes) that sit under the same parent and share a
// material become one mesh there, so anything that moves -- a parent group that is animated -- still moves as
// before. Instance colours turn into vertex colours. Left alone: multi-material meshes, points, lights, and
// anything listed in `keep` (and its children).
export function mergeStatic(root,{keep=[]}={}){
  root.updateMatrixWorld(true);
  const kept=new Set();for(const k of keep)k?.traverse?.(o=>kept.add(o));
  const groups=new Map();
  root.traverse(o=>{
    if(!(o.isMesh)||kept.has(o)||o.children.length||Array.isArray(o.material)||o.isSkinnedMesh)return;
    const key=`${o.parent.uuid}|${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    (groups.get(key)??groups.set(key,[]).get(key)).push(o);
  });
  let before=0,after=0;
  for(const list of groups.values()){
    before+=list.length;
    if(list.length<2){after++;continue;}
    const parent=list[0].parent, toParent=new T.Matrix4().copy(parent.matrixWorld).invert();
    const material=list[0].material, colours=list.some(o=>o.isInstancedMesh&&o.instanceColor)||material.vertexColors;
    const uv=!!material.map, parts=[], m=new T.Matrix4(), im=new T.Matrix4(), c=new T.Color();
    const piece=(geo,matrix,colour)=>{
      const g=(geo.index?geo.toNonIndexed():geo.clone()).applyMatrix4(matrix);
      for(const name of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(name))g.deleteAttribute(name);
      if(!g.attributes.normal)g.computeVertexNormals();
      if(uv&&!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      if(!uv&&g.attributes.uv)g.deleteAttribute('uv');
      if(colours&&!g.attributes.color){const a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([colour.r,colour.g,colour.b],i);g.setAttribute('color',new T.Float32BufferAttribute(a,3));}
      if(!colours&&g.attributes.color)g.deleteAttribute('color');
      parts.push(g);
    };
    for(const o of list){
      m.multiplyMatrices(toParent,o.matrixWorld);
      if(o.isInstancedMesh)for(let i=0;i<o.count;i++){o.getMatrixAt(i,im);if(o.instanceColor)o.getColorAt(i,c);else c.setRGB(1,1,1);piece(o.geometry,new T.Matrix4().multiplyMatrices(m,im),c);}
      else piece(o.geometry,m,c.setRGB(1,1,1));
    }
    const geo=mergeGeometries(parts);if(!geo){after+=list.length;continue;}
    // a material that gains vertex colours is copied: others may still use it without any (they would turn black)
    const mat=colours&&!material.vertexColors?Object.assign(material.clone(),{vertexColors:true}):material;
    const merged=new T.Mesh(geo,mat);
    Object.assign(merged,{castShadow:list[0].castShadow,receiveShadow:list[0].receiveShadow,renderOrder:list[0].renderOrder});
    merged.userData={...list[0].userData};
    for(const o of list)o.removeFromParent();
    parent.add(merged);after++;
  }
  return {before,after};
}
