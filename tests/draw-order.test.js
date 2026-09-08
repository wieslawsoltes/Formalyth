import test from 'node:test';import assert from 'node:assert/strict';
import {collectDraws} from '../packages/renderer/draw-order.js';
const item=(id)=>({id,surface:{name:id+'-surface'},edge:{name:id+'-edge'}});
test('all solid depths precede edges, and selection overlays are drawn last',()=>{
 const items=new Map([['a',item('a')],['b',item('b')]]),lines=new Map([['selection-detail',item('selection-detail')],['profile',item('profile')],['grid',item('grid')]]);
 const draws=collectDraws(items,lines);assert.deepEqual(draws.map(d=>d[1].name),['a-surface','b-surface','a-edge','b-edge','profile-surface','grid-surface','selection-detail-surface']);assert.equal(draws[2][2],true);assert.equal(draws.at(-1)[2],false);
});
test('wireframe and edge visibility preserve overlay ordering and resource identity',()=>{
 const a=item('a'),lines=new Map([['selection-detail',item('selection-detail')]]),items=new Map([['a',a]]);
 assert.deepEqual(collectDraws(items,lines,{wireframe:true,edges:false}).map(d=>d[1].name),['a-edge','selection-detail-surface']);
 assert.deepEqual(collectDraws(items,lines,{edges:false}).map(d=>d[1].name),['a-surface','selection-detail-surface']);assert.equal(collectDraws(items,lines)[0][1],a.surface);
});
