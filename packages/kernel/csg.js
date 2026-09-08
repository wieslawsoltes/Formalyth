/** BSP Boolean operations on oriented, closed faceted solids.
 * Tolerance is absolute model-space distance; this is not an exact B-rep kernel.
 * Original implementation; no runtime dependency on a CSG library.
 */
import {EPS, positive, v3} from '../math/index.js';
import {mesh, pointAt, removeDegenerate, weld} from './index.js';
function polygon(vertices, tolerance) {
  if (vertices.length < 3) return null;
  let normal;
  for (let i = 1; i < vertices.length-1; i++) { const n = v3.cross(v3.sub(vertices[i], vertices[0]), v3.sub(vertices[i+1], vertices[0])); if (v3.length(n) > tolerance*tolerance) { normal = v3.normalize(n); break; } }
  return normal ? {vertices, normal, w: v3.dot(normal, vertices[0])} : null;
}
const flipped = p => ({vertices: [...p.vertices].reverse(), normal: v3.scale(p.normal, -1), w: -p.w});
function split(plane, p, front, back, coplanarFront, coplanarBack, tolerance) {
  const distances = p.vertices.map(v => v3.dot(plane.normal, v)-plane.w);
  const signs = distances.map(d => d > tolerance ? 1 : d < -tolerance ? -1 : 0);
  const hasFront = signs.includes(1), hasBack = signs.includes(-1);
  if (!hasFront && !hasBack) { (v3.dot(plane.normal, p.normal) >= 0 ? coplanarFront : coplanarBack).push(p); return; }
  if (!hasBack) { front.push(p); return; }
  if (!hasFront) { back.push(p); return; }
  const f = [], b = [];
  for (let i = 0; i < p.vertices.length; i++) {
    const j = (i+1)%p.vertices.length, v = p.vertices[i];
    if (signs[i] >= 0) f.push(v); if (signs[i] <= 0) b.push(v);
    if (signs[i]*signs[j] === -1) { const hit = v3.lerp(v, p.vertices[j], distances[i]/(distances[i]-distances[j])); f.push(hit); b.push(hit); }
  }
  const pf = polygon(f, tolerance), pb = polygon(b, tolerance); if (pf) front.push(pf); if (pb) back.push(pb);
}
class BSP {
  constructor(polygons = [], tolerance = 1e-6, budget = {left: 1000000}, depth = 0) {
    this.plane = null; this.polygons = []; this.front = null; this.back = null; this.tolerance = tolerance; this.budget = budget; this.depth = depth;
    if (depth > 800) throw new RangeError('Boolean depth budget exceeded');
    this.build(polygons);
  }
  build(polygons) {
    if (!polygons.length) return;
    this.budget.left -= polygons.length; if (this.budget.left < 0) throw new RangeError('Boolean complexity budget exceeded');
    if (!this.plane) {
      // Choose a plane with a balanced split. Sampled candidates bound setup work.
      let best = polygons[0], bestScore = Infinity;
      const stride = Math.max(1, Math.floor(polygons.length/8));
      for (let k = 0; k < polygons.length; k += stride) {
        const candidate = polygons[k]; let f = 0, b = 0, spanning = 0;
        for (let j = 0; j < polygons.length; j += Math.max(1, Math.floor(polygons.length/64))) {
          let pos = false, neg = false;
          for (const v of polygons[j].vertices) { const d = v3.dot(candidate.normal, v)-candidate.w; pos ||= d > this.tolerance; neg ||= d < -this.tolerance; }
          if (pos) f++; if (neg) b++; if (pos && neg) spanning++;
        }
        const score = Math.abs(f-b)+spanning*3; if (score < bestScore) { bestScore = score; best = candidate; }
      }
      this.plane = {normal: [...best.normal], w: best.w};
    }
    const front = [], back = [];
    for (const p of polygons) split(this.plane, p, front, back, this.polygons, this.polygons, this.tolerance);
    if (front.length) { this.front ||= new BSP([], this.tolerance, this.budget, this.depth+1); this.front.build(front); }
    if (back.length) { this.back ||= new BSP([], this.tolerance, this.budget, this.depth+1); this.back.build(back); }
  }
  invert() {
    this.polygons = this.polygons.map(flipped);
    if (this.plane) { this.plane.normal = v3.scale(this.plane.normal, -1); this.plane.w *= -1; }
    this.front?.invert(); this.back?.invert(); [this.front, this.back] = [this.back, this.front];
  }
  clip(polygons) {
    if (!this.plane) return [...polygons];
    let front = [], back = [];
    for (const p of polygons) split(this.plane, p, front, back, front, back, this.tolerance);
    if (this.front) front = this.front.clip(front);
    back = this.back ? this.back.clip(back) : [];
    return front.concat(back);
  }
  clipTo(other) { this.polygons = other.clip(this.polygons); this.front?.clipTo(other); this.back?.clipTo(other); }
  all() { return this.polygons.concat(this.front?.all() || [], this.back?.all() || []); }
}
function polygonsOf(body, tolerance) {
  const out = [];
  for (let i = 0; i < body.indices.length; i += 3) { const p = polygon([pointAt(body, body.indices[i]), pointAt(body, body.indices[i+1]), pointAt(body, body.indices[i+2])], tolerance); if (p) out.push(p); }
  return out;
}
export function boolean(a, b, operation = 'union', tolerance = 1e-6) {
  positive(tolerance);
  if (!['union', 'subtract', 'intersect'].includes(operation)) throw new TypeError('Unknown Boolean operation');
  if (a.indices.length+b.indices.length > 300000) throw new RangeError('Boolean input exceeds 100,000 triangles');
  if (!a.indices.length || !b.indices.length) {
    const body = operation === 'union' ? (a.indices.length ? a : b) : operation === 'subtract' ? a : mesh();
    return mesh(body.positions.slice(), body.indices.slice(), {...body.meta});
  }
  const budget = {left: 4000000}, left = new BSP(polygonsOf(a, tolerance), tolerance, budget), right = new BSP(polygonsOf(b, tolerance), tolerance, budget);
  if (operation === 'union') { left.clipTo(right); right.clipTo(left); right.invert(); right.clipTo(left); right.invert(); left.build(right.all()); }
  if (operation === 'subtract') { left.invert(); left.clipTo(right); right.clipTo(left); right.invert(); right.clipTo(left); right.invert(); left.build(right.all()); left.invert(); }
  if (operation === 'intersect') { left.invert(); right.clipTo(left); right.invert(); left.clipTo(right); right.clipTo(left); left.build(right.all()); left.invert(); }
  return conformPolygons(left.all(), tolerance, {kind: 'boolean', operation, faceted: true});
}
/** Split every shared edge at all collinear vertices, removing BSP T-junctions. */
function conformPolygons(polygons, tolerance, meta) {
  const unique = new Map(), points = [];
  const key = p => p.map(x => Math.round(x/tolerance)).join(',');
  for (const p of polygons) for (const v of p.vertices) if (!unique.has(key(v))) { unique.set(key(v), points.length); points.push(v); }
  const sorted = [0, 1, 2].map(axis => points.map((_, i) => i).sort((a, b) => points[a][axis]-points[b][axis]));
  const lowerBound = (axis, value) => { let lo = 0, hi = points.length; while (lo < hi) { const mid = (lo+hi) >>> 1; if (points[sorted[axis][mid]][axis] < value) lo = mid+1; else hi = mid; } return lo; };
  const positions = points.flat(), indices = [];
  for (const p of polygons) {
    const ring = [];
    for (let i = 0; i < p.vertices.length; i++) {
      const a = p.vertices[i], b = p.vertices[(i+1)%p.vertices.length], d = v3.sub(b, a), length2 = v3.dot(d, d);
      ring.push(unique.get(key(a)));
      if (length2 < tolerance*tolerance) continue;
      let axis = 0; if (Math.abs(d[1]) > Math.abs(d[axis])) axis = 1; if (Math.abs(d[2]) > Math.abs(d[axis])) axis = 2;
      const hits = [], lo = Math.min(a[axis], b[axis])-tolerance, hi = Math.max(a[axis], b[axis])+tolerance;
      for (let j = lowerBound(axis, lo); j < points.length && points[sorted[axis][j]][axis] <= hi; j++) {
        const id = sorted[axis][j], q = points[id], t = v3.dot(v3.sub(q, a), d)/length2;
        if (t <= tolerance/Math.sqrt(length2) || t >= 1-tolerance/Math.sqrt(length2)) continue;
        if (v3.distance(q, v3.add(a, v3.scale(d, t))) <= tolerance*2) hits.push({id, t});
      }
      hits.sort((a, b) => a.t-b.t); for (const h of hits) if (ring.at(-1) !== h.id) ring.push(h.id);
    }
    if (ring.length === 3) { indices.push(...ring); continue; }
    // A centroid fan retains inserted collinear boundary vertices without degenerate ears.
    const center = p.vertices.reduce((a, b) => v3.add(a, b), [0, 0, 0]).map(x => x/p.vertices.length), c = positions.length/3;
    positions.push(...center);
    for (let i = 0; i < ring.length; i++) indices.push(c, ring[i], ring[(i+1)%ring.length]);
  }
  return weld(removeDegenerate(mesh(positions, indices, meta)), tolerance);
}
export function stitch(body, tolerance = 1e-6) { positive(tolerance); return conformPolygons(polygonsOf(body, tolerance), tolerance, {...body.meta}); }
export const union = (a, b, tolerance) => boolean(a, b, 'union', tolerance);
export const subtract = (a, b, tolerance) => boolean(a, b, 'subtract', tolerance);
export const intersect = (a, b, tolerance) => boolean(a, b, 'intersect', tolerance);
