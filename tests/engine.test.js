import test from 'node:test';import assert from 'node:assert/strict';
import {Engine} from '../packages/tasks/engine.js';
import {DesignDocument} from '../packages/document/index.js';
import {box} from '../packages/kernel/index.js';
import {transferableCopy} from '../packages/tasks/index.js';
test('incremental builds send no unchanged geometry or detached cache data',()=>{
 const engine=new Engine(),d=new DesignDocument();const id=d.addFeature('box',{width:20,depth:10,height:5});
 const a=engine.dispatch('evaluate',{document:d.data});assert.equal(a.changes.length,1);
 const copy=transferableCopy(a);structuredClone(copy.value,{transfer:copy.transfer});
 const b=engine.dispatch('evaluate',{document:d.data});assert.equal(b.changes.length,0);assert.equal(b.stats.computed,0);
 d.editFeature(id,{color:'#ff0000'});const c=engine.dispatch('evaluate',{document:d.data});assert.equal(c.changes.length,0);assert.equal(c.scene[0].color,'#ff0000');
 d.editFeature(id,{params:{width:25}});const e=engine.dispatch('evaluate',{document:d.data});assert.equal(e.changes.length,1);assert.ok(e.changes[0].value.positions.byteLength>0);
});
test('cache epochs prevent stale GPU resources after worker resets',()=>{const d=new DesignDocument();d.addFeature('box');const a=new Engine().evaluate({document:d.data}),b=new Engine().evaluate({document:d.data});assert.notEqual(a.scene[0].version,b.scene[0].version);});
test('machining body bounds require explicit acknowledgement',()=>{const engine=new Engine();assert.throws(()=>engine.dispatch('machining',{settings:{strategy:'contour'},geometry:box(20,20,5)}),/explicitly/);const path=engine.dispatch('machining',{settings:{strategy:'contour',top:5,bottom:0,safe:10},geometry:box(20,20,5),allowBoundingProfile:true});assert.ok(path.moves.length>5);});
test('selected-body voxel analysis runs on actual supplied geometry',()=>{const r=new Engine().dispatch('elastic',{body:box(12,4,4),options:{resolution:3,force:10,poisson:0}});assert.ok(r.result.maxDisplacement>0);assert.ok(r.mesh.elements>0);assert.ok(r.result.relativeResidual<1e-6);assert.ok(r.body.positions.length>0);});
test('unknown tasks and invalid history positions reject',()=>{const e=new Engine(),d=new DesignDocument();assert.throws(()=>e.dispatch('fake',{}),/Unknown/);assert.throws(()=>e.evaluate({document:d.data,upto:2}),/history/);});
