import test from 'node:test';
import assert from 'node:assert/strict';
import {Project, createProject, COLLECTIONS} from '../packages/project/index.js';
const add = p => p.transact('Body', d => d.model.features.push({id:'body',type:'box',inputs:[],params:{width:20}}));
test('all workspace collections survive a native-file round trip', () => {
  const p = new Project(); add(p);
  for (const [domain, keys] of Object.entries(COLLECTIONS)) for (const key of keys) p.put(domain,key,{id:domain+key,bodyIds:['body'],settings:{nested:[1,2,3]}},{linked:true});
  const q = Project.parse(p.serialize()); assert.deepEqual(q.snapshot(), p.snapshot());
  for (const [domain, keys] of Object.entries(COLLECTIONS)) for (const key of keys) assert.equal(q.isStale(q.data.workspaces[domain][key][0]), false);
});
test('model changes invalidate linked results, undo restores exact validity', () => {
  const p = new Project(); add(p); p.put('manufacturing','operations',{id:'op',bodyIds:['body']},{linked:true});
  const before=p.serialize(); p.transact('Dimension',d=>d.model.features[0].params.width=30);
  assert.ok(p.isStale(p.data.workspaces.manufacturing.operations[0])); p.undo(); assert.equal(p.serialize(),before);
  assert.equal(p.isStale(p.data.workspaces.manufacturing.operations[0]),false); p.redo(); assert.ok(p.isStale(p.data.workspaces.manufacturing.operations[0]));
});
test('appearance and navigation changes do not invalidate geometry results',()=>{
 const p=new Project();add(p);const v=p.data.geometryVersion;
 p.transact('Appearance',d=>{d.model.features[0].color='#112233';d.view.workspace='Manufacture';});assert.equal(p.data.geometryVersion,v);
});
test('atomic multi-domain undo and redo',()=>{
 const p=new Project();p.transact('Multiple',d=>{d.workspaces.analysis.studies.push({id:'s'});d.workspaces.electronics.boards.push({id:'b'});});p.undo();assert.equal(p.data.workspaces.analysis.studies.length,0);p.redo();assert.equal(p.data.workspaces.electronics.boards.length,1);
});
test('failed mutations roll back without emitting or affecting history',()=>{
 const p=new Project(),before=p.serialize();let emits=0;p.subscribe(()=>emits++);
 assert.throws(()=>p.transact('Bad',d=>{d.name='Changed';d.model.features.push({id:'x',type:'box',params:{},inputs:['missing']});}),/Missing/);
 assert.equal(p.serialize(),before);assert.equal(emits,0);assert.equal(p.canUndo,false);
});
test('rejects invalid JSON, future versions, duplicate IDs, and cycles',()=>{
 const p=new Project();add(p);
 assert.throws(()=>p.transact('nan',d=>d.view.x=NaN),/finite/);
 assert.throws(()=>p.transact('duplicate',d=>d.model.features.push(d.model.features[0])),/duplicate/);
 assert.throws(()=>p.transact('cycle',d=>d.model.features[0].inputs=['body']),/Cyclic/);
 assert.throws(()=>Project.parse('{"format":"formalyth-project","version":3}'),/Unsupported/);
 assert.throws(()=>Project.parse(p.serialize().replace('"extensions":{}','"extensions":{"__proto__":{}}')),/Forbidden/);
});
test('legacy document migration preserves manufacturing, drawing, board, metadata',()=>{
 const d=createProject().model;d.manufacturing={setups:[{id:'setup'}],operations:[{id:'op'}]};d.drawings=[{name:'sheet'}];d.board={name:'PCB'};d.metadata.custom=42;
 const p=new Project(d);assert.equal(p.data.workspaces.manufacturing.setups[0].id,'setup');assert.equal(p.data.workspaces.drawings.sheets[0].name,'sheet');assert.equal(p.data.workspaces.electronics.boards[0].name,'PCB');assert.equal(p.data.model.metadata.custom,42);assert.ok(p.isStale(p.data.workspaces.manufacturing.operations[0]));
});
test('state is immutable; snapshots are independent',()=>{
 const p=new Project();assert.throws(()=>p.data.model.features.push({}));const s=p.snapshot();s.name='changed';assert.notEqual(p.data.name,s.name);
});
test('bounded history, no-op detection, branching redo invalidation',()=>{
 const p=new Project(undefined,{historyLimit:2});for(let i=0;i<4;i++)p.transact('rename',d=>d.name='P'+i);assert.equal(p.historySize,2);
 p.transact('noop',()=>{});assert.equal(p.historySize,2);p.undo();p.transact('branch',d=>d.name='Branch');assert.equal(p.canRedo,false);
});
test('size limits roll back atomically',()=>{
 const p=new Project(undefined,{maxBytes:3000}),before=p.serialize();assert.throws(()=>p.transact('large',d=>d.extensions.text='x'.repeat(4000)),/size limit/);assert.equal(p.serialize(),before);
});
test('nested and asynchronous mutations are rejected',()=>{
 const p=new Project();assert.throws(()=>p.transact('outer',()=>p.transact('inner',()=>{})),/Nested/);
 assert.throws(()=>p.transact('async',()=>Promise.resolve()),/synchronous/);
});
test('unknown collection and duplicate workspace record rejection',()=>{
 const p=new Project();assert.throws(()=>p.put('unknown','jobs',{}),/Unknown/);
 assert.throws(()=>p.transact('dupe',d=>d.workspaces.additive.jobs.push({id:'a'},{id:'a'})),/duplicate/);
});
