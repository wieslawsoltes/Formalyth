import test from 'node:test';import assert from 'node:assert/strict';
import {Workbench} from '../packages/workbench/index.js';import {Engine} from '../packages/tasks/engine.js';
const transport=()=>({engine:new Engine(),async run(type,data){return this.engine.dispatch(type,data);},cancelAll(){},dispose(){}});
test('an in-flight build cannot claim newer source geometry was evaluated',async()=>{
 const model=transport(),w=new Workbench({modelTasks:model,jobTasks:transport()});const id=await w.addFeature('box',{width:10});
 const original=model.run.bind(model);let resolve;model.run=(type,data)=>{const output=model.engine.dispatch(type,data);return new Promise(r=>resolve=()=>r(output));};
 const pending=w.rebuild();w.project.transact('Direct update',d=>d.model.features[0].params.width=20);resolve();assert.equal(await pending,null);assert.throws(()=>w.selectedValue(),/not current/);
 model.run=original;await w.rebuild();assert.equal(w.builtVersion,w.project.data.geometryVersion);assert.equal(w.stats.changedOutputs,1);assert.equal(w.selected,id);w.dispose();
});
