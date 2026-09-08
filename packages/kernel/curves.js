/** Original parametric curve and surface evaluators. CPU precision is Float64. */
import {TAU, EPS, positive, finite, integer, v3} from '../math/index.js';
export function rectangle(width, height, radius = 0, segments = 8) {
  positive(width, 'width'); positive(height, 'height'); finite(radius);
  if (radius < 0 || radius > Math.min(width, height)/2) throw new RangeError('Corner radius exceeds profile');
  if (radius === 0) return [[-width/2, -height/2], [width/2, -height/2], [width/2, height/2], [-width/2, height/2]];
  integer(segments, 1, 256);
  const out = [], centers = [[width/2-radius, height/2-radius], [-width/2+radius, height/2-radius], [-width/2+radius, -height/2+radius], [width/2-radius, -height/2+radius]];
  centers.forEach((c, k) => { for (let j = 0; j <= segments; j++) { const a = (k+j/segments)*Math.PI/2; out.push([c[0]+radius*Math.cos(a), c[1]+radius*Math.sin(a)]); } });
  return out;
}
export function circle(radius, segments = 64, center = [0, 0]) {
  positive(radius, 'radius'); integer(segments, 3, 4096);
  return Array.from({length: segments}, (_, i) => [center[0]+radius*Math.cos(i*TAU/segments), center[1]+radius*Math.sin(i*TAU/segments)]);
}
export function ellipse(rx, ry, segments = 64) { positive(ry); return circle(rx, segments).map(([x, y]) => [x, y*ry/rx]); }
export function arc(center, radius, start, end, segments = 32) {
  positive(radius); integer(segments, 1, 4096); finite(start); finite(end);
  return Array.from({length: segments+1}, (_, i) => { const a = start+(end-start)*i/segments; return [center[0]+radius*Math.cos(a), center[1]+radius*Math.sin(a)]; });
}
export function bezier(points, t) {
  if (points.length < 2 || t < 0 || t > 1) throw new RangeError('Invalid Bezier curve');
  const p = points.map(p => [...p]);
  for (let k = p.length-1; k > 0; k--) for (let i = 0; i < k; i++) for (let d = 0; d < p[i].length; d++) p[i][d] = p[i][d]*(1-t)+p[i+1][d]*t;
  return p[0];
}
export function clampedKnots(count, degree) {
  integer(degree, 1, count-1, 'degree');
  return Array.from({length: count+degree+1}, (_, i) => i <= degree ? 0 : i >= count ? 1 : (i-degree)/(count-degree));
}
export function nurbs(points, degree, knots, weights, t) {
  integer(degree, 1, points.length-1, 'degree');
  if (knots.length !== points.length+degree+1 || knots.some((k, i) => !Number.isFinite(k) || (i && k < knots[i-1]))) throw new RangeError('Invalid knot vector');
  if (!weights) weights = points.map(() => 1);
  if (weights.length !== points.length || weights.some(w => !Number.isFinite(w) || w <= 0)) throw new RangeError('Positive NURBS weights required');
  const low = knots[degree], high = knots[points.length];
  if (t < low || t > high) throw new RangeError('Parameter outside knot domain');
  let span = points.length-1;
  if (t < high) { span = degree; while (span < points.length-1 && t >= knots[span+1]) span++; }
  const dimension = points[0].length;
  const d = Array.from({length: degree+1}, (_, j) => { const i = span-degree+j; return [...points[i].map(x => x*weights[i]), weights[i]]; });
  for (let r = 1; r <= degree; r++) for (let j = degree; j >= r; j--) {
    const i = span-degree+j, den = knots[i+degree-r+1]-knots[i], a = Math.abs(den) < EPS ? 0 : (t-knots[i])/den;
    for (let k = 0; k <= dimension; k++) d[j][k] = (1-a)*d[j-1][k]+a*d[j][k];
  }
  return d[degree].slice(0, dimension).map(x => x/d[degree][dimension]);
}
/** Tensor-product rational surface. Homogeneous interpolation preserves weights. */
export function nurbsSurface(grid, degreeU, degreeV, knotsU, knotsV, weights, u, v) {
  const rows = grid.map((row, j) => nurbs(row.map((p, i) => { const w = weights?.[j]?.[i] ?? 1; positive(w, 'weight'); return [...p.map(x => x*w), w]; }), degreeU, knotsU, null, u));
  const p = nurbs(rows, degreeV, knotsV, null, v);
  return p.slice(0, 3).map(x => x/p[3]);
}
export function resampleClosed(points, count) {
  integer(count, 3, 4096);
  const d = [0];
  for (let i = 0; i < points.length; i++) d.push(d.at(-1)+Math.hypot(...points[i].map((x, k) => x-points[(i+1)%points.length][k])));
  positive(d.at(-1), 'profile perimeter');
  return Array.from({length: count}, (_, k) => {
    const distance = d.at(-1)*k/count; let i = 0;
    while (i < points.length-1 && d[i+1] <= distance) i++;
    const t = (distance-d[i])/(d[i+1]-d[i]); return points[i].map((x, j) => x+(points[(i+1)%points.length][j]-x)*t);
  });
}
export function helix(radius, pitch, turns, segments = 128) {
  positive(radius); finite(pitch); positive(turns); integer(segments, 3, 8192);
  return Array.from({length: segments+1}, (_, i) => { const t = i/segments; return [radius*Math.cos(TAU*turns*t), radius*Math.sin(TAU*turns*t), pitch*turns*t]; });
}
export const tangent = (evaluate, t, delta = 1e-5) => v3.normalize(v3.sub(evaluate(Math.min(1, t+delta)), evaluate(Math.max(0, t-delta))));
