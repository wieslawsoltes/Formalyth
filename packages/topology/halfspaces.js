/** Bounded floating-point half-space reconstruction. No DOM or external kernel. */
import {v3} from '../math/index.js';
import {TopologyError} from './index.js';
import {triangulateConvexPolygons} from './operations.js';
const fail = (code, message) => { throw new TopologyError(code, message); };
const vector = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

/** Intersect n·(x-origin) <= 0 planes. All calculations use a local reference
 * origin; this avoids catastrophic cancellation for translated small objects.
 * Triples are enumerated rather than relying on a guessed bounding box.
 */
export function intersectHalfspaces(planes, {
  tolerance = 1e-6, maxPlanes = 96, maxTests = 16000000, requireAll = true, meta = {}
} = {}) {
  if (!Array.isArray(planes) || !Number.isFinite(tolerance) || tolerance <= 0 ||
      !Number.isInteger(maxPlanes) || maxPlanes < 4 || maxPlanes > 256 ||
      !Number.isInteger(maxTests) || maxTests < 1 || maxTests > 100000000 ||
      planes.length < 4 || planes.length > maxPlanes) fail('LIMIT', 'Half-space reconstruction requires 4–96 planes within the configured budget');
  const n = planes.length;
  if (n * (n - 1) * (n - 2) / 6 * n > maxTests) fail('LIMIT', 'Half-space plane-test budget exceeded');
  for (const p of planes) if (!vector(p.normal) || v3.length(p.normal) < 1e-12 || !vector(p.origin)) fail('PLANE', 'Each support plane requires a finite origin and nonzero normal');
  const anchor = planes[0].origin;
  const local = planes.map((p, i) => {
    const normal = v3.normalize(p.normal);
    return {normal, offset: v3.dot(normal, v3.sub(p.origin, anchor)), tag: p.tag ?? `plane:${i}`};
  });
  const points = [], eps = tolerance * 2;
  let tested = 0;
  for (let i = 0; i < n - 2; i++) for (let j = i + 1; j < n - 1; j++) {
    const a = local[i], b = local[j], ab = v3.cross(a.normal, b.normal);
    if (v3.length(ab) < 1e-10) continue;
    for (let k = j + 1; k < n; k++) {
      const c = local[k], det = v3.dot(ab, c.normal);
      if (Math.abs(det) < 1e-10) continue;
      const bc = v3.cross(b.normal, c.normal), ca = v3.cross(c.normal, a.normal);
      const q = [0, 1, 2].map(d => (bc[d] * a.offset + ca[d] * b.offset + ab[d] * c.offset) / det);
      let inside = q.every(Number.isFinite);
      for (let f = 0; inside && f < n; f++) {
        tested++;
        if (v3.dot(local[f].normal, q) - local[f].offset > eps) inside = false;
      }
      if (inside && !points.some(p => v3.distance(p, q) <= tolerance)) points.push(q);
    }
  }
  if (points.length < 4) fail('COLLAPSE', 'Support planes have no bounded, nonzero-thickness intersection');
  const polygons = [];
  for (const plane of local) {
    const ring = points.filter(p => Math.abs(v3.dot(plane.normal, p) - plane.offset) <= eps);
    if (ring.length < 3) {
      if (requireAll) fail('FACE_LOSS', 'The edit removes a support face; reduce the distance or angle');
      continue;
    }
    const center = ring.reduce((s, p) => v3.add(s, v3.scale(p, 1 / ring.length)), [0, 0, 0]);
    const axis = Math.abs(plane.normal[0]) < .8 ? [1, 0, 0] : [0, 1, 0];
    const u = v3.normalize(v3.cross(axis, plane.normal)), v = v3.cross(plane.normal, u);
    ring.sort((a, b) => {
      const x = v3.sub(a, center), y = v3.sub(b, center);
      return Math.atan2(v3.dot(x, v), v3.dot(x, u)) - Math.atan2(v3.dot(y, v), v3.dot(y, u));
    });
    let area = 0;
    for (let i = 0; i < ring.length; i++) area += v3.dot(plane.normal, v3.cross(v3.sub(ring[i], center), v3.sub(ring[(i + 1) % ring.length], center))) / 2;
    if (area <= tolerance * tolerance) {
      if (requireAll) fail('FACE_LOSS', 'The edit collapses a support face');
      continue;
    }
    polygons.push({tag: plane.tag, normal: plane.normal, points: ring.map(p => v3.add(p, anchor))});
  }
  const body = triangulateConvexPolygons(polygons, tolerance, {...meta, faceted: true});
  return {body, polygons, stats: {planes: n, vertices: points.length, planeTests: tested}};
}
