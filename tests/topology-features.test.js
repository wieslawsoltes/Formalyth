import test from 'node:test';import assert from 'node:assert/strict';
import {DesignDocument,FeatureEvaluator} from '../packages/document/index.js';
import {Engine} from '../packages/tasks/engine.js';
import {buildTopology,edgeReference,faceReference} from '../packages/topology/index.js';
import {faceProfile} from '../packages/topology/projection.js';
import {extrudeRegions} from '../packages/regions/index.js';
import {buildExtrusion} from '../packages/construction/index.js';
import {Project,createProject} from '../packages/project/index.js';
import {box,massProperties,meshBounds} from '../packages/kernel/index.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const square=(a,b)=>[[a,a],[b,a],[b,b],[a,b]];
test('face projection preserves through-hole boundaries and supports extrusion',()=>{
 const b=extrudeRegions([square(0,20),square(5,15)],10),t=buildTopology(b),f=t.faces.find(f=>f.normal[2]>.999),p=faceProfile(b,faceReference(t,f.id));
 assert.equal(p.loops.length,2);near(p.area,300);const r=buildExtrusion(p,{depth:3});near(massProperties(r).volume,900);near(meshBounds(r).min[2],10);near(meshBounds(r).max[2],13);
});
test('vertical face projection retains its right-handed world frame',()=>{
 const b=box(20,30,10),t=buildTopology(b),f=t.faces.find(f=>f.normal[0]>.99),p=faceProfile(b,faceReference(t,f.id)),r=buildExtrusion(p,{depth:4});near(massProperties(r).volume,1200);near(meshBounds(r).min[0],10);near(meshBounds(r).max[0],14);
});
test('parametric chamfer resolves after source dimension changes and caches unchanged output',()=>{
 const engine=new Engine(),d=new DesignDocument();d.transact('parameters',p=>p.parameters={width:20,bevel:2});const source=d.addFeature('box',{width:'width',depth:20,height:10});const initial=engine.evaluate({document:d.data}),t=buildTopology(initial.changes[0].value),e=t.edges.find(e=>Math.abs(e.length-10)<1e-5);d.addFeature('edgeChamfer',{distance:'bevel',edges:[edgeReference(t,e.id)]},[source]);
 let r=engine.evaluate({document:d.data});assert.deepEqual(r.errors,[]);near(massProperties(r.changes.at(-1).value).volume,3980);assert.equal(engine.evaluate({document:d.data}).changes.length,0);
 d.transact('resize',p=>p.parameters.width=30);r=engine.evaluate({document:d.data});assert.deepEqual(r.errors,[]);near(massProperties(r.changes.at(-1).value).volume,5980);
});
test('face sketches do not consume source bodies and replay dimensions',()=>{
 const d=new DesignDocument(),evaluator=new FeatureEvaluator(),id=d.addFeature('box',{width:20,depth:30,height:10}),b=evaluator.evaluate(d.data).scene[0].value,t=buildTopology(b),f=t.faces.find(f=>f.normal[2]>.99),sketch=d.addFeature('faceSketch',{face:faceReference(t,f.id)},[id]);
 let r=evaluator.evaluate(d.data);assert.deepEqual(r.errors,[]);assert.equal(r.scene.length,2);near(r.outputs.get(sketch).area,600);d.editFeature(id,{params:{width:40}});r=evaluator.evaluate(d.data);near(r.outputs.get(sketch).area,1200);
});
test('split halves follow a construction plane dependency and conserve source volume',()=>{
 const d=new DesignDocument(),e=new Engine(),id=d.addFeature('box',{width:20,depth:20,height:10}),plane=d.addFeature('constructionPlane',{plane:'XY',offset:4});
 for(const side of ['negative','positive'])d.addFeature('splitConvex',{side},[id,plane]);let r=e.evaluate({document:d.data});assert.deepEqual(r.errors,[]);const bodies=r.changes.filter(c=>c.value?.meta?.kind==='split');near(bodies.reduce((s,b)=>s+massProperties(b.value).volume,0),4000);near(massProperties(bodies[0].value).volume,1600);
 d.editFeature(plane,{params:{offset:6}});r=e.evaluate({document:d.data});assert.deepEqual(r.errors,[]);near(massProperties(r.changes.find(c=>c.value?.meta?.side==='negative').value).volume,2400);
});
test('new topology features and references round-trip through native project history',()=>{
 const d=new DesignDocument(),id=d.addFeature('box',{width:20,depth:20,height:10}),t=buildTopology(box(20,20,10));d.addFeature('edgeChamfer',{distance:1,edges:[edgeReference(t,0)]},[id]);const p=new Project(createProject('Bevel',d.data)),q=Project.parse(p.serialize()),e=new Engine();const r=e.evaluate({document:q.data.model});assert.deepEqual(r.errors,[]);assert.equal(r.scene.length,1);assert.equal(r.changes.at(-1).value.meta.kind,'chamfer');
});
test('failed remapping is a feature error, never replacement geometry',()=>{
 const d=new DesignDocument(),id=d.addFeature('box'),t=buildTopology(box(20,20,10));d.addFeature('edgeChamfer',{distance:1,edges:[{...edgeReference(t,0),faces:[{kind:'planar-face-v1',normal:[Math.SQRT1_2,Math.SQRT1_2,0]},faceReference(t,0)]}]},[id]);const r=new Engine().evaluate({document:d.data});assert.equal(r.errors.length,1);assert.match(r.errors[0].message,/reference/);assert.equal(r.scene.length,1);assert.equal(r.scene[0].id,id);
});
test('worker dispatch supports topology, bevel, split and face projection',()=>{
 const e=new Engine(),b=box(20,20,10),t=e.dispatch('topology',{body:b});assert.equal(t.edges.length,12);assert.ok(e.dispatch('chamfer',{body:b,edges:[edgeReference(t,0)],distance:1}).positions.length);assert.ok(e.dispatch('splitConvex',{body:b,options:{origin:[0,0,5]}}).positive.positions.length);assert.equal(e.dispatch('faceProfile',{body:b,face:faceReference(t,0)}).kind,'region');
});
