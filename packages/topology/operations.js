/** Half-space operations for closed convex polyhedra. No general concave-body claim. */
import {v3} from '../math/index.js';
import {mesh} from '../kernel/index.js';
import {buildTopology, resolveEdge, TopologyError} from './index.js';
const fail=(code,message)=>{throw new TopologyError(code,message);};
export function requireConvex(topology,{maxPlaneTests=8000000}={}){
  if(!topology.closed||topology.components!==1)fail('CONVEX_REQUIRED','A single closed oriented convex solid is required');
  if(topology.points.length*topology.faces.length>maxPlaneTests)fail('LIMIT','Convexity verification budget exceeded');
  const e=topology.tolerance*4;
  for(const f of topology.faces){
    if(f.loops.length!==1)fail('CONVEX_REQUIRED','Faces with holes are not supported by convex operations');
    for(const p of topology.points)if(v3.dot(f.normal,v3.sub(p,f.origin))>e)fail('CONVEX_REQUIRED','Concave or inward-facing bodies require a general solid operation; no approximation was applied');
  }
  if(topology.faces.length<4)fail('CONVEX_REQUIRED','A nonzero-volume convex solid is required');
  return topology.faces.map(f=>({tag:`face:${f.id}`,normal:f.normal,points:f.loops[0].map(i=>topology.points[i])}));
}
const unique=(points,e)=>{const out=[];for(const p of points)if(!out.some(q=>v3.distance(p,q)<=e))out.push(p);return out;};
const clean=(points,e)=>{const p=points.filter((q,i)=>!i||v3.distance(q,points[i-1])>e);if(p.length>1&&v3.distance(p[0],p.at(-1))<=e)p.pop();return p;};
function polygonArea(p){if(p.length<3)return 0;let sum=[0,0,0];for(let i=1;i<p.length-1;i++)sum=v3.add(sum,v3.cross(v3.sub(p[i],p[0]),v3.sub(p[i+1],p[0])));return v3.length(sum)/2;}
function cut(polygons,normal,origin,e,tag){
  const distance=p=>v3.dot(normal,v3.sub(p,origin));
  let positive=false,negative=false;
  for(const f of polygons)for(const p of f.points){const d=distance(p);positive ||= d>e;negative ||= d< -e;}
  if(!positive)return {polygons,changed:false};
  if(!negative)return {polygons:[],changed:true};
  const output=[],section=[];
  for(const f of polygons){
    const out=[];
    for(let i=0;i<f.points.length;i++){
      const a=f.points[i],b=f.points[(i+1)%f.points.length],da=distance(a),db=distance(b),insideA=da<=e,insideB=db<=e;
      if(insideA){const q=Math.abs(da)<=e?v3.sub(a,v3.scale(normal,da)):a;out.push(q);if(Math.abs(da)<=e)section.push(q);}
      if(insideA!==insideB){
        const t=da/(da-db);if(t< -1e-6||t>1+1e-6)continue;
        let q=v3.add(a,v3.scale(v3.sub(b,a),Math.max(0,Math.min(1,t))));q=v3.sub(q,v3.scale(normal,distance(q)));out.push(q);section.push(q);
      }
    }
    const points=clean(out,e);if(points.length>=3&&polygonArea(points)>e*e)output.push({...f,points});
  }
  const cap=unique(section,e);
  if(cap.length<3)fail('COLLAPSE','The cutting plane produced a degenerate cap');
  const center=cap.reduce((s,p)=>v3.add(s,v3.scale(v3.sub(p,cap[0]),1/cap.length)),[...cap[0]]);
  const axis=Math.abs(normal[0])<.8?[1,0,0]:[0,1,0],u=v3.normalize(v3.cross(axis,normal)),v=v3.cross(normal,u);
  cap.sort((a,b)=>{const x=v3.sub(a,center),y=v3.sub(b,center);return Math.atan2(v3.dot(x,v),v3.dot(x,u))-Math.atan2(v3.dot(y,v),v3.dot(y,u));});
  if(polygonArea(cap)<=e*e)fail('COLLAPSE','The cutting plane produced a zero-area cap');
  output.push({tag,normal,points:cap});return {polygons:output,changed:true};
}
function triangulated(polygons,tolerance,meta){
  if(polygons.length<4)fail('COLLAPSE','Operation removes the solid or leaves zero thickness');
  const positions=[],indices=[];
  for(const f of polygons){
    const p=f.points,base=positions.length/3,anchor=p[0],center=p.reduce((s,q)=>v3.add(s,v3.scale(v3.sub(q,anchor),1/p.length)),[...anchor]);
    // A centroid fan preserves boundary split vertices shared with neighboring faces.
    positions.push(...center);for(const q of p)positions.push(...q);
    for(let i=0;i<p.length;i++)if(v3.length(v3.cross(v3.sub(p[i],center),v3.sub(p[(i+1)%p.length],center)))>tolerance*tolerance)indices.push(base,base+i+1,base+(i+1)%p.length+1);
  }
  const topology=buildTopology(mesh(positions,indices),{tolerance});
  if(!topology.closed||topology.components!==1||topology.summary.euler!==2)fail('TOPOLOGY','Operation did not produce a closed genus-zero solid');
  return mesh(topology.points.flat(),topology.indices,meta);
}
export function chamferEdges(body,references,distance,{tolerance=1e-6}={}){
  if(!Number.isFinite(distance)||distance<=tolerance*4)fail('DISTANCE','Chamfer distance must be finite and greater than four tolerances');
  if(!Array.isArray(references)||!references.length||references.length>128)fail('LIMIT','Select 1–128 straight edges');
  const topology=buildTopology(body,{tolerance});let polygons=requireConvex(topology);
  const edges=references.map(r=>resolveEdge(topology,r));if(new Set(edges.map(e=>e.id)).size!==edges.length)fail('REFERENCE','Duplicate chamfer edges');
  const cuts=edges.map((edge,i)=>{
    const [a,b]=edge.faces.map(f=>topology.faces[f].normal),cos=Math.max(-1,Math.min(1,v3.dot(a,b))),normal=v3.normalize(v3.add(a,b));
    if(v3.length(normal)<.5||1-cos<1e-10)fail('ANGLE','Chamfer requires two distinct nonparallel support planes');
    return {normal,origin:v3.sub(edge.midpoint,v3.scale(normal,distance*Math.sqrt((1-cos)/2))),tag:`chamfer:${i}`};
  });
  for(const plane of cuts){const r=cut(polygons,plane.normal,plane.origin,tolerance,plane.tag);if(!r.changed)fail('COLLAPSE','Selected edge no longer intersects the chamfer');polygons=r.polygons;}
  const tags=new Set(polygons.map(p=>p.tag));
  if(topology.faces.some(f=>!tags.has(`face:${f.id}`))||cuts.some(c=>!tags.has(c.tag)))fail('COLLAPSE','Chamfer distance removes an original face or another bevel; reduce the distance');
  return triangulated(polygons,tolerance,{kind:'chamfer',faceted:true,distance,edgeCount:edges.length,scope:'convex-planar'});
}
export function splitConvex(body,{normal=[0,0,1],origin=[0,0,0],tolerance=1e-6}={}){
  if(!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||v3.length(normal)<1e-12||!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite))fail('PLANE','Expected a finite plane origin and nonzero normal');
  normal=v3.normalize(normal);const topology=buildTopology(body,{tolerance}),polygons=requireConvex(topology);
  const negative=cut(polygons,normal,origin,tolerance,'section'),positive=cut(polygons,v3.scale(normal,-1),origin,tolerance,'section');
  if(!negative.changed||!positive.changed||!negative.polygons.length||!positive.polygons.length)fail('NO_SPLIT','Plane must cross the solid interior, not merely touch it');
  return {negative:triangulated(negative.polygons,tolerance,{kind:'split',side:'negative',faceted:true}),positive:triangulated(positive.polygons,tolerance,{kind:'split',side:'positive',faceted:true})};
}

// Shared low-level routines. Callers supply outward unit normals and a validated
// closed convex input; public editing functions perform validation before use.
export {cut as clipPolygons, triangulated as triangulateConvexPolygons};
