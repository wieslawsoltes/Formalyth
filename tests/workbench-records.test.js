import test from 'node:test';import assert from 'node:assert/strict';
import {Workbench} from '../packages/workbench/index.js';import {Engine} from '../packages/tasks/engine.js';
import {describe} from '../packages/ui/inspect.js';
const transport=()=>{const engine=new Engine();return {async run(t,p){return engine.dispatch(t,p);},cancelAll(){},dispose(){}};};
const make=()=>new Workbench({modelTasks:transport(),jobTasks:transport()});
test('selected workspace operations resolve by ID rather than silently using the latest record',()=>{
 const w=make();w.project.put('manufacturing','operations',{id:'a',name:'First'});w.project.put('manufacturing','operations',{id:'b',name:'Last'});
 assert.equal(w.record('manufacturing','operations').id,'b');w.selectRecord('manufacturing','operations','a');assert.equal(w.record('manufacturing','operations').id,'a');
 w.select(null);assert.equal(w.record('manufacturing','operations').id,'b');w.dispose();
});
test('missing/deleted selected records fail and unrelated record collections use their latest record',()=>{
 const w=make();w.project.put('additive','jobs',{id:'a'});w.project.put('analysis','studies',{id:'s'});w.selectRecord('additive','jobs','a');
 assert.equal(w.record('analysis','studies').id,'s');w.project.transact('Remove job',p=>p.workspaces.additive.jobs=[]);assert.throws(()=>w.record('additive','jobs'),/Select or create/);
 assert.throws(()=>w.selectRecord('additive','jobs','missing'),/not found/);w.dispose();
});
test('large numerical buffers can be summarized without copying or serializing their elements',()=>{
 const values=new Float32Array(1e6);assert.equal(describe(values),'Float32Array (1000000)');assert.equal(describe([1,2]),'Array (2)');
 assert.equal(describe('x'.repeat(4000)).length,2000);assert.equal(describe(null),'null');
});
