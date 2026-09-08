import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTopology,faceReference,edgeReference,resolveFace,resolveEdge} from '../packages/topology/index.js';
import {requireConvex,chamferEdges,splitConvex} from '../packages/topology/operations.js';
import {box,mesh,transform,merge,extrude,subdivide,massProperties,topology} from '../packages/kernel/index.js';
import {m4,v3} from '../packages/math/index.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const cube=()=>box(20,20,10),concave=()=>extrude([[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]],6);
const code=name=>({code:name});
test('half-edge topology distinguishes planar faces from triangle diagonals',()=>{
 const t=buildTopology(cube());assert.deepEqual(t.summary,{vertices:8,triangleEdges:18,triangles:12,faces:6,edges:12,boundaryEdges:0,components:1,euler:2});
 for(let h=0;h<t.twin.length;h++){assert.equal(t.twin[t.twin[h]],h);const n=h-h%3+(h+1)%3;assert.equal(t.indices[n],t.indices[t.twin[h]]);}
 assert.ok(t.faces.every(f=>f.loops.length===1&&f.loops[0].length===4));near(t.faces.reduce((s,f)=>s+f.area,0),1600);
});
test('subdivided coplanar boundaries collapse to the same twelve geometric edges',()=>{
 const t=buildTopology(subdivide(cube()));assert.equal(t.faces.length,6);assert.equal(t.edges.length,12);assert.ok(t.edges.every(e=>e.segments.length===2));
});
test('triangle soup is welded by distance and source arrays remain untouched',()=>{
 const b=cube(),p=Array.from(b.indices).flatMap(i=>Array.from(b.positions.slice(i*3,i*3+3))),s=mesh(p,p.map((_,i)=>i).filter(i=>i%3===0).map(i=>i/3)),before=structuredClone(s);
 assert.equal(buildTopology(s).points.length,8);assert.deepEqual(s,before);
});
test('open surfaces report their boundary without pretending to be closed solids',()=>{
 const t=buildTopology(mesh([0,0,0,10,0,0,0,10,0],[0,1,2]));assert.equal(t.closed,false);assert.equal(t.summary.boundaryEdges,3);assert.throws(()=>requireConvex(t),code('CONVEX_REQUIRED'));assert.throws(()=>edgeReference(t,0),code('REFERENCE'));
});
test('malformed topology inputs and exhausted budgets reject explicitly',()=>{
 assert.throws(()=>buildTopology(mesh()),code('MESH'));assert.throws(()=>buildTopology({positions:[0,0,NaN],indices:[0,0,0]}),code('MESH'));assert.throws(()=>buildTopology({positions:[0,0,0],indices:[0,1,2]}),code('MESH'));
 assert.throws(()=>buildTopology(cube(),{maxTriangles:3}),code('LIMIT'));assert.throws(()=>buildTopology(cube(),{tolerance:0}),code('LIMIT'));assert.throws(()=>buildTopology(cube(),{angleTolerance:1}),code('LIMIT'));
});
test('degenerate triangles and inconsistent orientation are detected',()=>{
 assert.throws(()=>buildTopology(mesh([0,0,0,1,0,0,2,0,0],[0,1,2])),code('DEGENERATE'));
 const b=cube();[b.indices[0],b.indices[1]]=[b.indices[1],b.indices[0]];assert.throws(()=>buildTopology(b),code('ORIENTATION'));
});
test('nonmanifold edges reject rather than losing a third incident face',()=>{
 assert.throws(()=>buildTopology(mesh([0,0,0,1,0,0,0,1,0,0,0,1,0,-1,0],[0,1,2,1,0,3,0,1,4])),code('NON_MANIFOLD'));
});
test('disconnected bodies remain separate components and are not convex-operation inputs',()=>{
 const b=merge([cube(),transform(cube(),m4.translation(40,0,0))]),t=buildTopology(b);assert.equal(t.components,2);assert.throws(()=>requireConvex(t),code('CONVEX_REQUIRED'));
});
test('convexity checks reject concave solids and inverted closed shells',()=>{
 assert.throws(()=>requireConvex(buildTopology(concave())),code('CONVEX_REQUIRED'));const b=cube();for(let i=0;i<b.indices.length;i+=3)[b.indices[i],b.indices[i+1]]=[b.indices[i+1],b.indices[i]];
 assert.throws(()=>requireConvex(buildTopology(b)),code('CONVEX_REQUIRED'));
});
test('convexity work budget prevents unbounded plane/vertex testing',()=>assert.throws(()=>requireConvex(buildTopology(cube()),{maxPlaneTests:1}),code('LIMIT')));
test('support-normal references survive translation, dimension changes and triangle reordering',()=>{
 const t=buildTopology(cube()),ref=edgeReference(t,3),b=transform(box(28,18,12),m4.translation(100,50,30)),triangles=[];
 for(let i=b.indices.length-3;i>=0;i-=3)triangles.push(...b.indices.slice(i,i+3));const newer=buildTopology(mesh(b.positions,triangles));const e=resolveEdge(newer,JSON.parse(JSON.stringify(ref)));assert.ok(e.length>0);assert.deepEqual(e.faces.map(i=>newer.faces[i].normal).sort(),ref.faces.map(f=>f.normal).sort());
});
test('ambiguous parallel patches and missing rotated support planes reject reference resolution',()=>{
 const ref=faceReference(buildTopology(cube()),0),t=buildTopology(merge([cube(),transform(cube(),m4.translation(40,0,0))]));assert.throws(()=>resolveFace(t,ref),code('REFERENCE'));
 const rotated=buildTopology(transform(cube(),m4.rotation([1,1,1],.3)));assert.throws(()=>resolveFace(rotated,ref),code('REFERENCE'));assert.throws(()=>resolveEdge(rotated,{kind:'bad'}),code('REFERENCE'));assert.throws(()=>resolveFace(rotated,{kind:'planar-face-v1',normal:[0,0,0]}),code('REFERENCE'));
});
test('single right-angle edge chamfer removes the expected triangular-prism volume',()=>{
 const b=cube(),t=buildTopology(b),e=t.edges.find(e=>Math.abs(e.length-10)<1e-6),result=chamferEdges(b,[edgeReference(t,e.id)],2);
 near(massProperties(result).volume,4000-10*2*2/2);assert.equal(topology(result).watertight,true);assert.equal(buildTopology(result).faces.length,7);assert.equal(result.meta.edgeCount,1);
});
test('all twelve box edges can be chamfered without cracks',()=>{
 const b=cube(),t=buildTopology(b),r=chamferEdges(b,t.edges.map(e=>edgeReference(t,e.id)),1),out=buildTopology(r);
 assert.equal(out.summary.euler,2);assert.equal(out.closed,true);assert.equal(out.faces.length,18);assert.ok(massProperties(r).volume<4000);requireConvex(out);
});
test('chamfer volume is invariant under rigid transformation',()=>{
 const b=transform(cube(),m4.multiply(m4.translation(45,-80,120),m4.rotation([1,2,3],.7))),t=buildTopology(b),e=t.edges[0],r=chamferEdges(b,[edgeReference(t,e.id)],1.5);near(massProperties(r).volume,4000-e.length*1.5**2/2);assert.equal(topology(r).watertight,true);
});
test('overlarge, duplicate, empty and nonfinite chamfer requests reject without input mutation',()=>{
 const b=cube(),before=structuredClone(b),t=buildTopology(b),refs=[edgeReference(t,0)];
 assert.throws(()=>chamferEdges(b,refs,100),code('COLLAPSE'));assert.throws(()=>chamferEdges(b,[...refs,...refs],1),code('REFERENCE'));assert.throws(()=>chamferEdges(b,[],1),code('LIMIT'));assert.throws(()=>chamferEdges(b,refs,NaN),code('DISTANCE'));assert.deepEqual(b,before);
});
test('axis-aligned plane split produces two capped solids and conserves volume',()=>{
 for(const normal of [[0,0,1],[1,0,0],[0,-1,0]]){const s=splitConvex(cube(),{normal,origin:[0,0,5]});near(massProperties(s.negative).volume,2000);near(massProperties(s.positive).volume,2000);assert.equal(topology(s.negative).watertight,true);assert.equal(topology(s.positive).watertight,true);}
});
test('oblique plane through vertices preserves both side inequalities and volume',()=>{
 const normal=v3.normalize([1,1,1]),origin=[0,0,5],s=splitConvex(cube(),{normal,origin});near(massProperties(s.negative).volume+massProperties(s.positive).volume,4000);
 for(const [side,b]of Object.entries(s)){const t=buildTopology(b);for(const p of t.points)assert.ok(v3.dot(normal,v3.sub(p,origin))*(side==='positive'?-1:1)<1e-5);assert.equal(t.closed,true);}
});
test('plane split remains stable far from the coordinate origin',()=>{
 const b=transform(cube(),m4.translation(1e8,-1e8,1e8)),s=splitConvex(b,{normal:[1,1,2],origin:[1e8,-1e8,1e8+5]});near(massProperties(s.negative).volume+massProperties(s.positive).volume,4000,1e-3);
});
test('tangent, external, invalid and concave splits fail explicitly',()=>{
 assert.throws(()=>splitConvex(cube(),{origin:[0,0,10]}),code('NO_SPLIT'));assert.throws(()=>splitConvex(cube(),{origin:[0,0,20]}),code('NO_SPLIT'));assert.throws(()=>splitConvex(cube(),{normal:[0,0,0]}),code('PLANE'));assert.throws(()=>splitConvex(concave()),code('CONVEX_REQUIRED'));
});
