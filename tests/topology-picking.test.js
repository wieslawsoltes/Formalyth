import test from 'node:test';import assert from 'node:assert/strict';
import {buildTopology} from '../packages/topology/index.js';
import {nearestFaceEdge,selectionSegments} from '../packages/topology/picking.js';
import {box,subdivide} from '../packages/kernel/index.js';
const t=buildTopology(box(20,20,10)),top=t.faces.find(f=>f.normal[2]>.99),project=p=>[100+p[0]*10,100-p[1]*10];
test('edge picking ignores internal face triangulation diagonals',()=>assert.equal(nearestFaceEdge(t,top.id,project,100,100,12),null));
test('screen tolerance selects a geometric boundary and respects the threshold',()=>{
 const e=nearestFaceEdge(t,top.id,project,3,100,5);assert.ok(e);assert.equal(e.length,20);assert.equal(nearestFaceEdge(t,top.id,project,10,100,5),null);
});
test('edge screen picking stays restricted to the visible hit face',()=>{
 const e=nearestFaceEdge(t,top.id,project,100,1,5);assert.ok(e.faces.includes(top.id));
});
test('face and edge outlines keep geometric boundary subdivision points',()=>{
 const sub=buildTopology(subdivide(box(20,20,10))),f=sub.faces.find(f=>f.normal[2]>.99);assert.equal(selectionSegments(sub,'face',f.id).length,8);assert.equal(selectionSegments(sub,'edge',f.edges[0]).length,2);
});
test('invalid picks and nonexistent selections reject',()=>{assert.throws(()=>nearestFaceEdge(t,999,project,0,0));assert.throws(()=>nearestFaceEdge(t,0,project,0,0,-1));assert.throws(()=>selectionSegments(t,'body',0));assert.throws(()=>selectionSegments(t,'face',999));});
