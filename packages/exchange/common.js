/** Shared import bounds and polygon triangulation. No importer performs network I/O. */
import {mesh, triangulate, area2, pointAt, transform} from '../kernel/index.js';
import {v3, m4, finite, positive} from '../math/index.js';
export const LIMITS = Object.freeze({bytes:100*1024*1024,vertices:3_000_000,triangles:3_000_000,objects:1000,polygon:4096,records:1_000_000});
export function bytes(data) {
  let value;
  if (data instanceof ArrayBuffer) value = new Uint8Array(data);
  else if (ArrayBuffer.isView(data)) value = new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  else if (typeof data === 'string') value = new TextEncoder().encode(data);
  else throw new TypeError('Expected text or a byte buffer');
  if(value.byteLength>LIMITS.bytes)throw new RangeError('Import exceeds 100 MB');return value;
}
export function text(data) { if(typeof data==='string'){if(data.length>LIMITS.bytes)throw new RangeError('Import exceeds 100 MB');return data;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes(data)); }
export function checkedCount(value,limit,label='count'){if(!Number.isSafeInteger(value)||value<0||value>limit)throw new RangeError(`Invalid ${label}: ${value}`);return value;}
export function coordinates(values,dimensions=3){if(values.length<dimensions)throw new TypeError('Missing coordinates');return values.slice(0,dimensions).map(x=>finite(Number(x),'coordinate'));}
export function polygonTriangles(positions,ids) {
  checkedCount(ids.length,LIMITS.polygon,'polygon size');if(ids.length<3)throw new RangeError('Face requires at least three vertices');
  for(const i of ids)checkedCount(i,positions.length/3-1,'vertex index');
  if(ids.length===3)return [...ids];
  const points=ids.map(i=>[positions[i*3],positions[i*3+1],positions[i*3+2]]);let normal=[0,0,0];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];normal=v3.add(normal,[(a[1]-b[1])*(a[2]+b[2]),(a[2]-b[2])*(a[0]+b[0]),(a[0]-b[0])*(a[1]+b[1])]);}
  if(v3.length(normal)<1e-12)throw new RangeError('Degenerate polygon face');
  let drop=0;for(let i=1;i<3;i++)if(Math.abs(normal[i])>Math.abs(normal[drop]))drop=i;
  let projected=points.map(p=>p.filter((_,i)=>i!==drop));if(area2(projected)<0)projected=projected.map(([x,y])=>[x,-y]);
  return triangulate(projected).map(i=>ids[i]);
}
export function compactMesh(positions,indices,meta={}) {
  checkedCount(indices.length/3,LIMITS.triangles,'triangle count');const remap=new Map(),out=[],triangles=[];
  for(const i of indices){checkedCount(i,positions.length/3-1,'vertex index');if(!remap.has(i)){remap.set(i,out.length/3);out.push(positions[i*3],positions[i*3+1],positions[i*3+2]);}triangles.push(remap.get(i));}
  return mesh(out,triangles,meta);
}
export function scaled(body,scale=1){positive(scale,'unit scale');return scale===1?body:transform(body,m4.scaling(scale));}
export const label = value => String(value || 'Imported geometry').replace(/[\r\n\0]/g,' ').slice(0,256);
export function result(bodies=[],profiles=[],warnings=[],curves=[]) {return {bodies,profiles,curves,warnings:[...new Set(warnings)]};}
export function componentMeshes(body) {
  const count=body.indices.length/3,edges=new Map(),neighbors=Array.from({length:count},()=>[]);
  for(let i=0;i<count;i++)for(let j=0;j<3;j++){const a=body.indices[i*3+j],b=body.indices[i*3+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key)){const other=edges.get(key);neighbors[i].push(other);neighbors[other].push(i);}else edges.set(key,i);}
  const seen=new Uint8Array(count),out=[];
  for(let seed=0;seed<count;seed++)if(!seen[seed]){const stack=[seed],indices=[];seen[seed]=1;while(stack.length){const i=stack.pop();indices.push(body.indices[i*3],body.indices[i*3+1],body.indices[i*3+2]);for(const j of neighbors[i])if(!seen[j]){seen[j]=1;stack.push(j);}}out.push(compactMesh(body.positions,indices));}
  return out;
}
