import test from 'node:test';import assert from 'node:assert/strict';
import {FeatureGraph,editModel} from '../packages/document/graph.js';
import {DesignDocument,FeatureEvaluator,validateDocument} from '../packages/document/index.js';
import {Engine} from '../packages/tasks/engine.js';import {Workbench} from '../packages/workbench/index.js';
import {newFeature} from '../packages/workbench/edit-session.js';
const transport=()=>({engine:new Engine(),async run(type,payload){return this.engine.dispatch(type,payload);},cancelAll(){},cancelKey(){},dispose(){}});
const make=()=>new Workbench({modelTasks:transport(),jobTasks:transport()});
const node=(id,inputs=[])=>({id,type:'move',params:{},inputs,name:id});
test('indexed graph ancestors/dependents preserve feature order and reject cycles',()=>{
 const fs=[node('a'),node('b',['a']),node('c',['a']),node('d',['b','c'])],g=new FeatureGraph(fs);
 assert.deepEqual(g.dependents('a'),['b','c','d']);assert.deepEqual(g.ancestors('d'),['a','b','c']);assert.deepEqual(g.dependents('d'),[]);
 assert.deepEqual(g.ancestors('d',{includeSeeds:true}),['a','b','c','d']);assert.throws(()=>new FeatureGraph([node('a',['b']),node('b',['a'])]),/Cyclic/);
 assert.throws(()=>new FeatureGraph([node('a',['x'])]),/Missing/);
});
test('reordering independent features works; breaking dependencies fails',()=>{
 const g=new FeatureGraph([node('a'),node('b',['a']),node('c')]);assert.deepEqual(g.reorder('c',0).map(f=>f.id),['c','a','b']);
 assert.throws(()=>g.reorder('b',0),/inputs/);assert.throws(()=>g.reorder('a',2),/inputs/);assert.throws(()=>g.reorder('a',3),/position/);
});
test('batch edits are atomic, input-owned and preserve unrelated parameters',()=>{
 const d=new DesignDocument();const id=d.addFeature('box',{width:10,height:2});const before=d.serialize();
 const next=editModel(d.data,[{action:'update',id,patch:{params:{width:20},name:'Renamed'}}]);assert.equal(next.features[0].params.height,2);assert.equal(d.serialize(),before);
 assert.throws(()=>editModel(d.data,[{action:'update',id,patch:{params:{width:30}}},{action:'delete',id:'missing'}]),/not found/);assert.equal(d.serialize(),before);
 assert.throws(()=>editModel(d.data,[{action:'update',id,patch:{id:'oops'}}]),/cannot be edited/);
});
test('cascade delete follows all branches and requires explicit permission',()=>{
 const d=new DesignDocument();d.data.features=[node('a'),node('b',['a']),node('c',['a']),node('d',['b','c']),node('e')];
 assert.throws(()=>editModel(d.data,[{action:'delete',id:'a'}]),/confirm/);
 assert.deepEqual(editModel(d.data,[{action:'delete',id:'a',cascade:true}]).features.map(f=>f.id),['e']);
});
test('5,000-feature reverse-ordered graph validates and evaluates without recursion overflow',()=>{
 const d=new DesignDocument();const base={...node('n0'),type:'box',params:{width:1,depth:1,height:1}};
 d.data.features=[base,...Array.from({length:4999},(_,i)=>node('n'+(i+1),['n'+i]))].reverse();
 validateDocument(d.data);const e=new FeatureEvaluator(),r=e.evaluate(d.data);assert.equal(r.errors.length,0);assert.equal(r.stats.computed,5000);assert.equal(r.scene.length,1);
 assert.equal(e.evaluate(d.data).stats.reused,5000);
});
test('failed dependency is evaluated once and error propagated to dependents',()=>{
 const d=new DesignDocument();d.data.features=[{...node('bad'),type:'box',params:{width:-1}},node('a',['bad']),node('b',['bad'])];
 const r=new FeatureEvaluator().evaluate(d.data);assert.equal(r.errors.length,3);assert.match(r.errors[1].message,/Input bad failed/);assert.equal(r.scene.length,0);
});
test('suppression does not display duplicate pass-through solids',()=>{
 const d=new DesignDocument();const a=d.addFeature('box'),b=d.addFeature('move',{x:2},[a]);d.editFeature(b,{suppressed:true});
 const e=new FeatureEvaluator();assert.deepEqual(e.evaluate(d.data).scene.map(s=>s.id),[a]);const c=d.addFeature('move',{y:3},[b]);assert.deepEqual(e.evaluate(d.data).scene.map(s=>s.id),[c]);
});
test('preview changes no project state, history, committed cache or transport baseline',async()=>{
 const w=make(),id=await w.addFeature('box',{width:10});const before=w.project.serialize(),session=w.beginEdit();
 const r=await session.update([{action:'update',id,patch:{params:{width:20}}}]);assert.ok(r.scene[0].value);assert.equal(w.project.serialize(),before);
 session.cancel();assert.equal(w.project.serialize(),before);assert.equal((await w.rebuild()).stats.computed,0);assert.equal(w.stats.changedOutputs,0);w.dispose();
});
test('valid preview Apply is one undo transaction and adopts cached geometry',async()=>{
 const w=make(),id=await w.addFeature('box',{width:10});const n=w.project.historySize,session=w.beginEdit();
 await session.update([{action:'update',id,patch:{params:{width:25}}}]);await session.commit();assert.equal(w.project.historySize,n+1);assert.equal(w.stats.computed,0);
 assert.equal(w.project.data.model.features[0].params.width,25);await w.undo();assert.equal(w.project.data.model.features[0].params.width,10);w.dispose();
});
test('primitive preview can be added once and cancelled without a history entry',async()=>{
 const w=make();await w.rebuild();const f=newFeature('box',{width:12}),s=w.beginEdit();await s.update([{action:'add',feature:f}]);assert.equal(w.project.data.model.features.length,0);
 await s.commit();assert.equal(w.project.data.model.features.length,1);assert.equal(w.selected,f.id);assert.equal(w.stats.computed,0);w.dispose();
});
test('invalid speculative geometry cannot be applied; a corrected edit recovers',async()=>{
 const w=make(),id=await w.addFeature('box'),s=w.beginEdit();await assert.rejects(s.update([{action:'update',id,patch:{params:{width:-3}}}]),/positive/);
 await assert.rejects(s.commit());assert.equal(s.valid,false);await s.update([{action:'update',id,patch:{params:{width:3}}}]);await s.commit();assert.equal(w.errors.length,0);w.dispose();
});
test('source edits, project switches and timeline changes invalidate speculative operations',async()=>{
 const w=make(),id=await w.addFeature('box');const s=w.beginEdit();await s.update([{action:'update',id,patch:{params:{width:20}}}]);
 w.project.updateView({timeline:0});await assert.rejects(s.commit(),{name:'AbortError'});s.cancel();w.dispose();
});
test('newer previews win and late results cannot overwrite current edit state',async()=>{
 const w=make(),id=await w.addFeature('box');const real=w.modelTasks.run.bind(w.modelTasks),waiting=[];
 w.modelTasks.run=(t,p)=>new Promise(resolve=>waiting.push(async()=>resolve(await real(t,p))));const s=w.beginEdit();
 const a=s.update([{action:'update',id,patch:{params:{width:20}}}]),b=s.update([{action:'update',id,patch:{params:{width:30}}}]);
 await waiting[1]();await b;await waiting[0]();assert.equal(await a,null);assert.equal(s.edits[0].patch.params.width,30);s.cancel();w.dispose();
});
test('batch visibility, rename, ordering and deletion participate in unified undo',async()=>{
 const w=make(),a=await w.addFeature('box'),b=await w.addFeature('cylinder');const before=w.project.historySize;
 await w.batchEdit([{action:'update',id:a,patch:{visible:false,name:'Hidden'}},{action:'reorder',id:b,to:0}]);assert.equal(w.project.historySize,before+1);assert.equal(w.scene.length,1);assert.equal(w.stats.computed,0);
 await w.undo();assert.equal(w.scene.length,2);assert.equal(w.project.data.model.features[0].id,a);w.dispose();
});

test('cancelled previews never reuse a geometry version for another session',async()=>{
 const w=make(),id=await w.addFeature('box',{width:10});const first=w.beginEdit();
 const a=await first.update([{action:'update',id,patch:{params:{width:20}}}]);first.cancel();
 const second=w.beginEdit();const b=await second.update([{action:'update',id,patch:{params:{width:30}}}]);
 assert.notEqual(a.scene[0].version,b.scene[0].version);await second.commit();assert.equal(w.stats.computed,0);w.dispose();
});
