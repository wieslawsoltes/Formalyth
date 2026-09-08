import test from 'node:test';
import assert from 'node:assert/strict';
import * as k from '../packages/kernel/index.js';
import * as csg from '../packages/kernel/csg.js';
import {TriangleBVH} from '../packages/kernel/spatial.js';
import {m4, v3, solveLinear} from '../packages/math/index.js';
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual-expected) <= tolerance, `${actual} ≠ ${expected}`);
test('matrix composition and inversion', () => {
  const a = m4.multiply(m4.translation(10, -7, 4), m4.rotation([1, 2, 3], .73));
  const p = m4.point(m4.inverse(a), m4.point(a, [1, 2, 3])); p.forEach((x, i) => near(x, i+1));
  assert.throws(() => m4.inverse(m4.scaling(0)), /Singular/);
});
test('linear equations with pivoting', () => { const x = solveLinear([[0, 2], [1, 3]], [4, 7]); near(x[0], 1); near(x[1], 2); assert.throws(() => solveLinear([[1, 1], [2, 2]], [1, 2]), /Singular/); });
test('box exact volume, area, centroid and topology', () => {
  const body = k.box(10, 20, 30), p = k.massProperties(body);
  near(p.volume, 6000); near(p.area, 2200); near(p.mass, 16.2); assert.deepEqual(p.centroid, [0, 0, 15]); assert.equal(k.topology(body).watertight, true);
});
test('mass properties remain stable away from origin', () => { const p = k.massProperties(k.transform(k.box(1, 2, 3), m4.translation(1e8, 1e8, 1e8))); near(p.volume, 6); near(p.centroid[2], 1e8+1.5); });
for (const [name, body, volume, tolerance] of [
  ['cylinder', () => k.cylinder(5, 10, 96), Math.PI*250, 1],
  ['sphere', () => k.sphere(5, 64), Math.PI*500/3, 3],
  ['cone', () => k.cone(5, 0, 10, 96), Math.PI*250/3, .3],
  ['torus', () => k.torus(10, 2, 96, 48), 80*Math.PI*Math.PI, 3]
]) test(`${name} volume and closed topology`, () => { const b = body(); near(k.massProperties(b).volume, volume, tolerance); assert.equal(k.topology(b).watertight, true); });
test('rounded rectangle extrusion', () => { const b = k.box(20, 10, 5, 2); assert.equal(k.topology(b).watertight, true); near(k.massProperties(b).volume, (200-16+4*Math.PI)*5, 1); });
test('concave extrusion has correct area and caps', () => { const b = k.extrude([[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]], 3); near(k.massProperties(b).volume, 21); assert.equal(k.topology(b).watertight, true); });
test('negative extrusion preserves outward orientation', () => { const b = k.extrude(k.rectangle(2, 3), -4); near(k.massProperties(b).signedVolume, 24); near(k.massProperties(b).centroid[2], -2); });
test('invalid profiles and dimensions fail explicitly', () => {
  assert.throws(() => k.box(0, 1, 1)); assert.throws(() => k.circle(-1)); assert.throws(() => k.extrude([[0, 0], [4, 4], [0, 4], [4, 0]], 2));
  assert.throws(() => k.mesh([0, 0, 0], [0, 1, 2])); assert.throws(() => k.extrude(k.rectangle(2, 2), 0));
});
test('partial revolution is capped', () => { const b = k.revolve([[2, 0], [4, 0], [4, 5], [2, 5]], Math.PI, 48); assert.equal(k.topology(b).watertight, true); near(k.massProperties(b).volume, 30*Math.PI, .1); });
test('loft and sweep are closed', () => {
  const b = k.loft([{profile: k.rectangle(10, 10), z: 0}, {profile: k.rectangle(5, 5), z: 10}], 16); assert.equal(k.topology(b).watertight, true); near(k.massProperties(b).volume, 1750/3);
  const s = k.sweep(k.rectangle(2, 3), [[0, 0, 0], [0, 0, 10]]); near(k.massProperties(s).volume, 60); assert.equal(k.topology(s).watertight, true);
});
test('reflection reverses winding', () => { near(k.massProperties(k.transform(k.box(2, 3, 4), m4.scaling(-1, 1, 1))).signedVolume, 24); });
test('NURBS endpoint and rational quadratic circle', () => {
  const points = [[1, 0], [1, 1], [0, 1]], knots = [0, 0, 0, 1, 1, 1], weights = [1, Math.SQRT1_2, 1];
  assert.deepEqual(k.nurbs(points, 2, knots, weights, 0), [1, 0]); assert.deepEqual(k.nurbs(points, 2, knots, weights, 1), [0, 1]);
  const p = k.nurbs(points, 2, knots, weights, .5); near(p[0], Math.SQRT1_2); near(p[1], Math.SQRT1_2);
});
test('tensor product rational surface', () => { const p = k.nurbsSurface([[[0, 0, 0], [2, 0, 0]], [[0, 4, 0], [2, 4, 0]]], 1, 1, [0, 0, 1, 1], [0, 0, 1, 1], null, .5, .5); assert.deepEqual(p, [1, 2, 0]); });
for (const [operation, volume] of [['union', 1500], ['subtract', 500], ['intersect', 500]]) test(`Boolean ${operation}: volume and conforming topology`, () => {
  const a = k.box(10, 10, 10), b = k.transform(a, m4.translation(5, 0, 0)), result = csg.boolean(a, b, operation);
  near(k.massProperties(result).signedVolume, volume); assert.equal(k.topology(result).watertight, true);
});
test('Boolean through hole is watertight', () => {
  const a = k.box(60, 40, 10), hole = k.transform(k.cylinder(5, 12, 32), m4.translation(0, 0, -1));
  const b = csg.subtract(a, hole); assert.equal(k.topology(b).watertight, true); near(k.massProperties(b).volume, 24000-k.massProperties(k.cylinder(5, 10, 32)).volume);
});
test('Boolean identical/disjoint/empty operands', () => {
  const a = k.box(2, 3, 4), b = k.transform(a, m4.translation(100, 0, 0));
  near(k.massProperties(csg.union(a, a)).volume, 24); near(k.massProperties(csg.subtract(a, a)).volume, 0);
  near(k.massProperties(csg.intersect(a, b)).volume, 0); near(k.massProperties(csg.union(a, b)).volume, 48);
  near(k.massProperties(csg.union(a, k.mesh())).volume, 24); assert.equal(csg.intersect(a, k.mesh()).indices.length, 0);
});
test('sectioning and BVH picking', () => {
  const b = k.box(10, 20, 30); assert.equal(k.section(b, 15).length, 8);
  const hit = new TriangleBVH(b).intersect([0, 0, 50], [0, 0, -1]); near(hit.t, 20); assert.deepEqual(hit.point, [0, 0, 30]);
  assert.equal(new TriangleBVH(b).intersect([100, 0, 50], [0, 0, -1]), null);
});
test('subdivision preserves closed mesh and volume', () => { const b = k.subdivide(k.box(2, 3, 4), 2); assert.equal(b.indices.length/3, 192); near(k.massProperties(b).volume, 24); assert.equal(k.topology(b).watertight, true); });
