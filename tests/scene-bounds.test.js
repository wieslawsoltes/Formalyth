import test from 'node:test';import assert from 'node:assert/strict';
import {worldBounds} from '../packages/renderer/scene-bounds.js';import {m4} from '../packages/math/index.js';
test('fit includes translated assembly occurrences',()=>{const b=worldBounds([{bounds:{min:[0,0,0],max:[10,20,30]},model:m4.translation(100,0,0)}]);assert.deepEqual(b.min,[100,0,0]);assert.deepEqual(b.max,[110,20,30]);});
test('rotated and reflected occurrence bounds use all eight corners',()=>{const b=worldBounds([{bounds:{min:[-1,-2,-3],max:[1,2,3]},model:m4.multiply(m4.rotation([0,0,1],Math.PI/4),m4.scaling(-1,1,1))}]);assert.ok(Math.abs(b.size[0]-3*Math.SQRT2)<1e-10);assert.ok(Math.abs(b.size[1]-3*Math.SQRT2)<1e-10);assert.equal(b.size[2],6);});
test('empty scenes have no artificial origin bounds',()=>assert.equal(worldBounds([]),null));
