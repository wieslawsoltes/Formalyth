import test from 'node:test';import assert from 'node:assert/strict';
import {Workbench} from '../packages/workbench/index.js';import {Engine} from '../packages/tasks/engine.js';
const transport=()=>({engine:new Engine(),async run(type,data){return this.engine.dispatch(type,data);},cancelAll(){},dispose(){}});
test('an in-flight build cannot claim newer source geometry was evaluated',async()=>{
 const model=transport(),w=new Workbench({modelTasks:model,jobTasks:transport()});const id=await w.addFeature('box',{width:10});
 const original=model.run.bind(model);let resolve;model.run=(type,data)=>{const output=model.engine.dispatch(type,data);return new Promise(r=>resolve=()=>r(output));};
 const pending=w.rebuild();w.project.transact('Direct update',d=>d.model.features[0].params.width=20);resolve();assert.equal(await pending,null);assert.throws(()=>w.selectedValue(),/not current/);
 model.run=original;await w.rebuild();assert.equal(w.builtVersion,w.project.data.geometryVersion);assert.equal(w.stats.changedOutputs,1);assert.equal(w.selected,id);w.dispose();
});

test('timeline changes invalidate current geometry even without a model edit',async()=>{
 const w=new Workbench({modelTasks:transport(),jobTasks:transport()});await w.addFeature('box');w.project.updateView({timeline:0});assert.throws(()=>w.selectedValue(),/not current/);await assert.rejects(w.derived('inspect',{}),/not current/);w.dispose();
});
test('an in-flight derived result cannot attach after timeline rollback',async()=>{
 const w=new Workbench({modelTasks:transport(),jobTasks:transport()});await w.addFeature('box');let done;w.jobTasks.run=()=>new Promise(r=>done=r);const task=w.derived('inspect',{});w.project.updateView({timeline:0});done({});await assert.rejects(task,{name:'AbortError'});w.dispose();
});
