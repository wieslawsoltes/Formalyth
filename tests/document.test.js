import test from 'node:test'; import assert from 'node:assert/strict';
import {expression, parameters, solveSketch} from '../packages/solver/index.js';
import {DesignDocument, FeatureEvaluator} from '../packages/document/index.js';
import {massProperties} from '../packages/kernel/index.js';
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
test('expression precedence, units and functions', () => {
  near(expression('2 + 3*4^2'), 50); near(expression('-2^2'), -4); near(expression('2^3^2'), 512);
  near(expression('2 in + 3 mm'), 53.8); near(expression('sin(90 deg)'), 1); near(expression('max(3, 7)+sqrt(9)'), 10);
  near(parameters({a: 'b*2', b: '5 mm'}).a, 10);
});
test('expression rejects code execution, invalid names and cycles', () => {
  for (const s of ['globalThis.alert(1)', 'process.exit()', 'constructor(1)', '1/0', '1;2', '2 +']) assert.throws(() => expression(s));
  assert.throws(() => parameters({a: 'b', b: 'a'}), /Cyclic/); assert.throws(() => parameters({constructor: '1'}), /Reserved/);
});
test('sketch rectangle dimensions and rank', () => {
  const result = solveSketch({points: [[0, 0], [11, 1], [9, 8], [-1, 9]], constraints: [
    {type: 'fixed', a: 0, x: 0, y: 0}, {type: 'horizontal', a: 0, b: 1}, {type: 'vertical', a: 1, b: 2}, {type: 'horizontal', a: 2, b: 3}, {type: 'vertical', a: 3, b: 0}, {type: 'distance', a: 0, b: 1, value: 20}, {type: 'distance', a: 1, b: 2, value: 10}
  ]});
  assert.equal(result.converged, true); assert.equal(result.dof, 0); near(result.sketch.points[2][0], 20); near(result.sketch.points[2][1], 10);
});
test('unconstrained and inconsistent sketches are distinguished', () => {
  assert.equal(solveSketch({points: [[0, 0], [5, 0]], constraints: []}).status, 'underconstrained');
  const result = solveSketch({points: [[0, 0]], constraints: [{type: 'fixed', a: 0, x: 0, y: 0}, {type: 'fixed', a: 0, x: 3, y: 0}]});
  assert.equal(result.converged, false); assert.equal(result.status, 'inconsistent');
});
test('circle radius and line tangency constraints', () => {
  const r = solveSketch({points: [[0, 2], [-10, 0], [10, 0]], circles: [{center: 0, radius: 3}], constraints: [
    {type: 'fixed', a: 1, x: -10, y: 0}, {type: 'fixed', a: 2, x: 10, y: 0}, {type: 'radius', circle: 0, value: 5}, {type: 'tangentLine', circle: 0, a: 1, b: 2}
  ]}); assert.equal(r.converged, true); near(r.sketch.circles[0].radius, 5); near(r.sketch.points[0][1], 5);
});
test('document undo/redo and serialization', () => {
  const doc = new DesignDocument(); const a = doc.addFeature('box', {width: 10, depth: 10, height: 10}, [], 'Block');
  assert.equal(doc.data.features.length, 1); doc.undo(); assert.equal(doc.data.features.length, 0); doc.redo(); assert.equal(doc.data.features[0].id, a);
  assert.deepEqual(DesignDocument.parse(doc.serialize()).data, doc.data);
});
test('transactions are atomic', () => {
  const doc = new DesignDocument(); assert.throws(() => doc.transact('Bad edit', d => { d.units = 'invalid'; })); assert.equal(doc.data.units, 'mm'); assert.equal(doc.past.length, 0);
  assert.throws(() => doc.transact('Invalid parameter', d => { d.parameters.a = 'unknown'; })); assert.deepEqual(doc.data.parameters, {});
});
test('dependency caching and parameter-driven rebuild', () => {
  const doc = new DesignDocument(); doc.transact('Parameters', d => { d.parameters.w = 10; });
  const a = doc.addFeature('box', {width: 'w', depth: 10, height: 10}), b = doc.addFeature('move', {x: 20}, [a]); const evaluator = new FeatureEvaluator();
  const first = evaluator.evaluate(doc.data); assert.equal(first.stats.computed, 2); assert.equal(first.scene.length, 1); assert.equal(first.scene[0].id, b);
  assert.equal(evaluator.evaluate(doc.data).stats.computed, 0);
  doc.transact('Change width', d => { d.parameters.w = 20; }); const next = evaluator.evaluate(doc.data); assert.equal(next.stats.computed, 2); near(massProperties(next.outputs.get(b)).volume, 2000);
});
test('dependent deletion and graph cycles fail explicitly', () => {
  const doc = new DesignDocument(), a = doc.addFeature('box', {}), b = doc.addFeature('move', {}, [a]);
  assert.throws(() => doc.removeFeature(a), /downstream/); assert.throws(() => doc.editFeature(a, {inputs: [b]}), /Cyclic/);
  assert.deepEqual(doc.data.features[0].inputs, []); doc.removeFeature(a, true); assert.equal(doc.data.features.length, 0);
});
test('sketch-to-solid feature and timeline rollback', () => {
  const doc = new DesignDocument(), sketch = doc.addFeature('sketch', {shape: 'rectangle', width: 20, depth: 10}), ext = doc.addFeature('extrude', {depth: 5}, [sketch]);
  const e = new FeatureEvaluator(); near(massProperties(e.evaluate(doc.data).outputs.get(ext)).volume, 1000);
  const preview = e.evaluate(doc.data, {upto: 1}); assert.equal(preview.scene[0].value.kind, 'profile'); assert.equal(preview.scene.length, 1);
});
test('unsupported feature produces an explicit feature error', () => { const doc = new DesignDocument(); doc.addFeature('future-operation', {}); const r = new FeatureEvaluator().evaluate(doc.data); assert.equal(r.scene.length, 0); assert.match(r.errors[0].message, /Unsupported/); });

test('unrelated parameter edits do not invalidate independent features', () => {
  const d = new DesignDocument(), e = new FeatureEvaluator();
  d.transact('parameters', data => { data.parameters = {size: 10, unrelated: 3}; });
  d.addFeature('box', {width: 'size', depth: 2, height: 3});
  d.addFeature('sphere', {radius: 2});
  e.evaluate(d.data);
  d.transact('unrelated', data => { data.parameters.unrelated = 4; });
  assert.equal(e.evaluate(d.data).stats.computed, 0);
  d.transact('size', data => { data.parameters.size = 20; });
  const result = e.evaluate(d.data); assert.equal(result.stats.computed, 1); assert.equal(result.stats.reused, 1);
});
