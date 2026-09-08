/** Oriented half-edge connectivity, coplanar faces and explicit geometric references.
 * Original faceted topology adapter; not an analytic boundary-representation kernel.
 */
import {v3} from '../math/index.js';
export class TopologyError extends Error {
  constructor(code, message) { super(message); this.name = 'TopologyError'; this.code = code; }
}
const fail = (code, message) => { throw new TopologyError(code, message); };
const next = h => h - h % 3 + (h + 1) % 3;
const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
export function buildTopology(body, {tolerance = 1e-6, angleTolerance = 1e-9, maxTriangles = 200000} = {}) {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(angleTolerance) || angleTolerance <= 0 || angleTolerance > .001 || !Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 1000000) fail('LIMIT', 'Invalid topology tolerances or budget');
  const p = body?.positions, source = body?.indices;
  if (!p || !source || !p.length || !source.length || p.length % 3 || source.length % 3) fail('MESH', 'Expected nonempty XYZ triangle mesh');
  if (source.length / 3 > maxTriangles || p.length / 3 > maxTriangles * 3) fail('LIMIT', 'Topology triangle or vertex budget exceeded');
  for (const x of p) if (!Number.isFinite(x)) fail('MESH', 'Topology requires finite coordinates');
  for (const i of source) if (!Number.isInteger(i) || i < 0 || i >= p.length / 3) fail('MESH', 'Topology index out of range');
  // Actual distance welding, including neighboring cells; unused vertices are omitted.
  const points = [], cells = new Map(), mapping = new Int32Array(p.length / 3).fill(-1), origin = [p[source[0]*3], p[source[0]*3+1], p[source[0]*3+2]];
  for (const i of source) if (mapping[i] === -1) {
    const q = [p[i*3], p[i*3+1], p[i*3+2]], cell = q.map((x, j) => Math.floor((x-origin[j])/tolerance));
    if (cell.some(x => !Number.isSafeInteger(x))) fail('PRECISION', 'Coordinate span exceeds the topology tolerance precision budget');
    let found = -1;
    for (let x=-1; x<=1 && found<0; x++) for (let y=-1; y<=1 && found<0; y++) for (let z=-1; z<=1 && found<0; z++) {
      for (const id of cells.get(`${cell[0]+x},${cell[1]+y},${cell[2]+z}`) || []) if (v3.distance(points[id],q) <= tolerance) { found=id; break; }
    }
    if (found < 0) { found=points.length; points.push(q); const k=cell.join(','); if(!cells.has(k))cells.set(k,[]); cells.get(k).push(found); }
    mapping[i]=found;
  }
  const indices=Uint32Array.from(source, i=>mapping[i]), count=indices.length/3, twin=new Int32Array(indices.length).fill(-1), raw=new Map(), normals=[], areas=new Float64Array(count), parent=Int32Array.from({length:count},(_,i)=>i);
  const root = i => { while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];} return i; };
  for (let t=0; t<count; t++) {
    const [a,b,c]=[0,1,2].map(j=>points[indices[t*3+j]]), cross=v3.cross(v3.sub(b,a),v3.sub(c,a)), length=v3.length(cross);
    if(length <= tolerance*tolerance)fail('DEGENERATE', `Degenerate triangle ${t}`);
    normals.push(v3.scale(cross,1/length));areas[t]=length/2;
    for(let j=0;j<3;j++){
      const h=t*3+j,a=indices[h],b=indices[next(h)],k=key(a,b),old=raw.get(k);
      if(!old)raw.set(k,{h,count:1});
      else {
        if(++old.count>2)fail('NON_MANIFOLD','An edge has more than two incident triangles');
        if(indices[old.h]===a)fail('ORIENTATION','Adjacent triangles have inconsistent orientation');
        twin[h]=old.h;twin[old.h]=h;
      }
    }
  }
  // Merge only adjacent planar triangles. Disconnected coplanar patches remain distinct.
  for(let h=0;h<twin.length;h++)if(twin[h]>h){
    const a=Math.floor(h/3),b=Math.floor(twin[h]/3);
    if(v3.dot(normals[a],normals[b])>=1-angleTolerance){
      const anchor=points[indices[a*3]];
      if([0,1,2].every(j=>Math.abs(v3.dot(normals[a],v3.sub(points[indices[b*3+j]],anchor)))<=tolerance))parent[root(b)]=root(a);
    }
  }
  const faces=[], groups=new Map(), triangleFaces=new Uint32Array(count);
  for(let t=0;t<count;t++){
    const r=root(t);if(!groups.has(r)){groups.set(r,faces.length);faces.push({id:faces.length,normal:normals[t],origin:points[indices[t*3]],area:0,triangles:[],loops:[],edges:[]});}
    const f=faces[groups.get(r)];triangleFaces[t]=f.id;f.triangles.push(t);f.area+=areas[t];
  }
  // Walk each oriented face boundary, skipping internal triangulation diagonals.
  const boundary=new Set();for(let h=0;h<twin.length;h++)if(twin[h]<0||triangleFaces[Math.floor(h/3)]!==triangleFaces[Math.floor(twin[h]/3)])boundary.add(h);
  const visited=new Set();
  for(const start of boundary)if(!visited.has(start)){
    const f=faces[triangleFaces[Math.floor(start/3)]],loop=[];let h=start;
    do{
      if(visited.has(h))fail('NON_MANIFOLD','Face boundary branches or touches itself');
      visited.add(h);loop.push(indices[h]);let n=next(h),guard=0;
      while(!boundary.has(n)){if(twin[n]<0||++guard>twin.length)fail('NON_MANIFOLD','Broken half-edge fan');n=next(twin[n]);}
      h=n;if(loop.length>twin.length)fail('NON_MANIFOLD','Face boundary did not close');
    }while(h!==start);
    f.loops.push(loop);
  }
  // Join adjacent collinear boundary segments between the same two planar faces.
  const pairs=new Map();
  for(const h of boundary)if(twin[h]<0||h<twin[h]){
    const fs=[triangleFaces[Math.floor(h/3)],twin[h]<0?-1:triangleFaces[Math.floor(twin[h]/3)]].sort((a,b)=>a-b),k=fs.join(':');
    if(!pairs.has(k))pairs.set(k,{faces:fs,segments:[]});pairs.get(k).segments.push([indices[h],indices[next(h)]]);
  }
  const edges=[];
  for(const group of pairs.values()){
    const incident=new Map();group.segments.forEach((s,i)=>s.forEach(v=>{if(!incident.has(v))incident.set(v,[]);incident.get(v).push(i);}));
    const seen=new Set();
    for(let i=0;i<group.segments.length;i++)if(!seen.has(i)){
      const stack=[i],segments=[],vertices=new Set();
      while(stack.length){const j=stack.pop();if(seen.has(j))continue;seen.add(j);const s=group.segments[j];segments.push(s);for(const v of s){vertices.add(v);for(const k of incident.get(v))if(!seen.has(k))stack.push(k);}}
      const endpoints=[...vertices].filter(v=>incident.get(v).length===1);let straight=endpoints.length===2;
      if(straight){const a=points[endpoints[0]],d=v3.normalize(v3.sub(points[endpoints[1]],a));straight=[...vertices].every(v=>v3.length(v3.cross(v3.sub(points[v],a),d))<=tolerance*2);}
      // Curved/open boundaries are represented as individual segments, never as a false straight edge.
      const pieces=straight?[{segments,vertices:endpoints}]:segments.map(s=>({segments:[s],vertices:s}));
      for(const piece of pieces){const [a,b]=piece.vertices.map(v=>points[v]),e={id:edges.length,faces:group.faces,vertices:piece.vertices,segments:piece.segments,length:v3.distance(a,b),midpoint:v3.scale(v3.add(a,b),.5),straight};edges.push(e);for(const f of e.faces)if(f>=0)faces[f].edges.push(e.id);}
    }
  }
  let components=0;const connected=new Uint8Array(count);
  for(let t=0;t<count;t++)if(!connected[t]){components++;const stack=[t];connected[t]=1;while(stack.length){const i=stack.pop();for(let j=0;j<3;j++){const other=twin[i*3+j];if(other>=0&&!connected[Math.floor(other/3)]){connected[Math.floor(other/3)]=1;stack.push(Math.floor(other/3));}}}}
  const boundaryEdges=[...raw.values()].filter(e=>e.count===1).length;
  return {points,indices,twin,triangleFaces,faces,edges,tolerance,closed:boundaryEdges===0,components,summary:{vertices:points.length,triangleEdges:raw.size,triangles:count,faces:faces.length,edges:edges.length,boundaryEdges,components,euler:points.length-raw.size+count}};
}
export function faceReference(topology, id) {
  const face=topology.faces[id];if(!face)fail('REFERENCE','Unknown face');
  return {kind:'planar-face-v1',normal:[...face.normal]};
}
export function resolveFace(topology, reference) {
  const n=reference?.normal;if(reference?.kind!=='planar-face-v1'||!Array.isArray(n)||n.length!==3||!n.every(Number.isFinite)||Math.abs(v3.length(n)-1)>1e-6)fail('REFERENCE','Invalid planar face reference');
  const matches=topology.faces.filter(f=>v3.dot(f.normal,n)>1-1e-10);
  if(matches.length!==1)fail('REFERENCE',matches.length?'Ambiguous planar face reference; select again':'Planar face reference no longer resolves');
  return matches[0];
}
export function edgeReference(topology, id) {
  const e=topology.edges[id];if(!e||e.faces.includes(-1)||!e.straight)fail('REFERENCE','Select a straight edge between two planar faces');
  return {kind:'planar-edge-v1',faces:e.faces.map(f=>faceReference(topology,f))};
}
export function resolveEdge(topology, reference) {
  if(reference?.kind!=='planar-edge-v1'||!Array.isArray(reference.faces)||reference.faces.length!==2)fail('REFERENCE','Invalid planar edge reference');
  const ids=reference.faces.map(r=>resolveFace(topology,r).id).sort((a,b)=>a-b),matches=topology.edges.filter(e=>e.straight&&e.faces[0]===ids[0]&&e.faces[1]===ids[1]);
  if(matches.length!==1)fail('REFERENCE','Edge reference is missing or ambiguous; select again');
  return matches[0];
}
