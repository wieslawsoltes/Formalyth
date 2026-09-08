/** @module @formalyth/kernel — faceted modeling kernel, no browser dependencies. */
import {EPS, TAU, finite, positive, integer, v3, m4, bounds} from '../math/index.js';
import {rectangle, circle, resampleClosed} from './curves.js';
export * from './curves.js';
export function mesh(positions = [], indices = [], meta = {}) {
  if (positions.length%3 || indices.length%3) throw new RangeError('Triangle mesh array dimensions');
  const p = positions instanceof Float64Array ? positions : new Float64Array(positions);
  const count = p.length/3;
  for (const x of p) finite(x, 'vertex coordinate');
  for (const i of indices) if (!Number.isInteger(i) || i < 0 || i >= count) throw new RangeError('Mesh index out of range');
  return {positions: p, indices: indices instanceof Uint32Array ? indices : new Uint32Array(indices), meta};
}
export const pointAt = (m, i) => [m.positions[i*3], m.positions[i*3+1], m.positions[i*3+2]];
export const triangleAt = (m, i) => [pointAt(m, m.indices[i*3]), pointAt(m, m.indices[i*3+1]), pointAt(m, m.indices[i*3+2])];
export const meshBounds = m => bounds(m.positions);
export function area2(profile) { let a = 0; for (let i = 0; i < profile.length; i++) { const p = profile[i], q = profile[(i+1)%profile.length]; a += p[0]*q[1]-q[0]*p[1]; } return a/2; }
const cross2 = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const equal2 = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]) < EPS;
export function cleanProfile(profile) {
  if (!Array.isArray(profile) || profile.length < 3 || profile.length > 8192) throw new RangeError('A profile requires 3–8192 vertices');
  let p = profile.map(p => [finite(p[0]), finite(p[1])]).filter((v, i, a) => !i || !equal2(v, a[i-1]));
  if (p.length > 2 && equal2(p[0], p.at(-1))) p.pop();
  let changed = true;
  while (changed && p.length > 3) { changed = false; p = p.filter((q, i, a) => { if (Math.abs(cross2(a[(i+a.length-1)%a.length], q, a[(i+1)%a.length])) < EPS) { changed = true; return false; } return true; }); }
  if (p.length < 3 || Math.abs(area2(p)) < EPS) throw new RangeError('Degenerate profile');
  for (let i = 0; i < p.length; i++) for (let j = i+2; j < p.length; j++) {
    if (i === 0 && j === p.length-1) continue;
    const a = p[i], b = p[(i+1)%p.length], c = p[j], d = p[(j+1)%p.length];
    const x1 = cross2(a, b, c), x2 = cross2(a, b, d), y1 = cross2(c, d, a), y2 = cross2(c, d, b);
    if (x1*x2 < -EPS && y1*y2 < -EPS) throw new RangeError('Self-intersecting profile');
    if (equal2(a, c) || equal2(a, d) || equal2(b, c) || equal2(b, d)) throw new RangeError('Self-touching profile');
  }
  return area2(p) < 0 ? p.reverse() : p;
}
/** Ear clipping for a simple CCW polygon. Rejects unsupported self intersections. */
export function triangulate(profile) {
  const ids = profile.map((_, i) => i), triangles = []; let guard = profile.length*profile.length;
  while (ids.length > 3 && guard-- > 0) {
    let found = false;
    for (let j = 0; j < ids.length; j++) {
      const a = ids[(j+ids.length-1)%ids.length], b = ids[j], c = ids[(j+1)%ids.length];
      if (cross2(profile[a], profile[b], profile[c]) <= EPS) continue;
      const occupied = ids.some(i => i !== a && i !== b && i !== c && cross2(profile[a], profile[b], profile[i]) >= -EPS && cross2(profile[b], profile[c], profile[i]) >= -EPS && cross2(profile[c], profile[a], profile[i]) >= -EPS);
      if (occupied) continue;
      triangles.push(a, b, c); ids.splice(j, 1); found = true; break;
    }
    if (!found) throw new RangeError('Profile cannot be triangulated; check crossings and collinear edges');
  }
  if (ids.length === 3) triangles.push(...ids);
  return triangles;
}
export function extrude(profile, depth, {topScale = 1, twist = 0, steps = 1} = {}) {
  finite(depth, 'depth'); positive(topScale, 'top scale'); finite(twist); integer(steps, 1, 512);
  if (Math.abs(depth) < EPS) throw new RangeError('Extrusion depth is zero');
  const p = cleanProfile(profile), n = p.length, positions = [], indices = [], caps = triangulate(p);
  for (let k = 0; k <= steps; k++) { const t = k/steps, s = 1+(topScale-1)*t, a = twist*t;
    for (const [x, y] of p) positions.push(s*(x*Math.cos(a)-y*Math.sin(a)), s*(x*Math.sin(a)+y*Math.cos(a)), depth*t);
  }
  for (let k = 0; k < steps; k++) for (let i = 0; i < n; i++) { const a = k*n+i, b = k*n+(i+1)%n; indices.push(a, b, b+n, a, b+n, a+n); }
  for (let i = 0; i < caps.length; i += 3) indices.push(caps[i+2], caps[i+1], caps[i], caps[i]+steps*n, caps[i+1]+steps*n, caps[i+2]+steps*n);
  if (depth < 0) for (let i = 0; i < indices.length; i += 3) [indices[i+1], indices[i+2]] = [indices[i+2], indices[i+1]];
  return mesh(positions, indices, {kind: 'extrusion', depth, profile: p});
}
export function box(width, depth, height, radius = 0) { return extrude(rectangle(width, depth, radius), positive(height, 'height')); }
export function cylinder(radius, height, segments = 64) { return extrude(circle(radius, segments), positive(height, 'height')); }
export function revolve(profile, angle = TAU, segments = 64) {
  positive(angle, 'angle'); if (angle > TAU+EPS) throw new RangeError('Revolution exceeds one turn');
  integer(segments, 3, 512); const p = cleanProfile(profile);
  if (p.some(q => q[0] < -EPS)) throw new RangeError('Revolution profile crosses the axis');
  const closed = Math.abs(angle-TAU) < EPS, n = p.length, rings = closed ? segments : segments+1, positions = [], indices = [];
  for (let k = 0; k < rings; k++) { const a = k*angle/segments; for (const [r, z] of p) positions.push(r*Math.cos(a), r*Math.sin(a), z); }
  for (let k = 0; k < segments; k++) for (let i = 0; i < n; i++) {
    const a = k*n+i, b = ((k+1)%rings)*n+i, c = ((k+1)%rings)*n+(i+1)%n, d = k*n+(i+1)%n; indices.push(a, b, c, a, c, d);
  }
  if (!closed) { const cap = triangulate(p); for (let i = 0; i < cap.length; i += 3) indices.push(cap[i], cap[i+1], cap[i+2], cap[i+2]+segments*n, cap[i+1]+segments*n, cap[i]+segments*n); }
  return removeDegenerate(mesh(positions, indices, {kind: 'revolution'}));
}
export function cone(radius, topRadius, height, segments = 64) {
  positive(radius); positive(height); finite(topRadius);
  if (topRadius < 0) throw new RangeError('Top radius is negative');
  return revolve([[0, 0], [radius, 0], [topRadius, height], [0, height]], TAU, segments);
}
export function sphere(radius, segments = 48) {
  positive(radius); integer(segments, 8, 256);
  const p = Array.from({length: Math.floor(segments/2)+1}, (_, i) => { const a = -Math.PI/2+i*Math.PI/Math.floor(segments/2); return [Math.max(0, radius*Math.cos(a)), radius*Math.sin(a)]; });
  return revolve(p, TAU, segments);
}
export function torus(majorRadius, minorRadius, segments = 64, tubeSegments = 24) {
  positive(minorRadius); if (majorRadius <= minorRadius) throw new RangeError('Major radius must exceed minor radius');
  return revolve(circle(minorRadius, tubeSegments, [majorRadius, 0]), TAU, segments);
}
export function loft(sections, samples = 64) {
  if (sections.length < 2 || sections.length > 256) throw new RangeError('Loft requires 2–256 sections');
  const rings = sections.map(s => resampleClosed(cleanProfile(s.profile), samples)), positions = [], indices = [];
  for (let k = 0; k < rings.length; k++) { finite(sections[k].z); if (k && sections[k].z <= sections[k-1].z) throw new RangeError('Loft section heights must increase');
    for (const [x, y] of rings[k]) positions.push(x+(sections[k].x || 0), y+(sections[k].y || 0), sections[k].z);
  }
  for (let k = 0; k < rings.length-1; k++) for (let i = 0; i < samples; i++) { const a = k*samples+i, b = k*samples+(i+1)%samples; indices.push(a, b, b+samples, a, b+samples, a+samples); }
  const capA = triangulate(rings[0]), capB = triangulate(rings.at(-1)), offset = (rings.length-1)*samples;
  for (let i = 0; i < capA.length; i += 3) indices.push(capA[i+2], capA[i+1], capA[i]);
  indices.push(...capB.map(i => i+offset));
  return mesh(positions, indices, {kind: 'loft'});
}
/** Sweeps a 2D section using a parallel-transport frame along a polyline. */
export function sweep(profile, path) {
  if (path.length < 2 || path.length > 8192) throw new RangeError('Sweep requires 2–8192 path points');
  path = path.map(p => p.map(x => finite(x)));
  const p = cleanProfile(profile), n = p.length, positions = [], indices = [];
  const tangents = path.map((q, i) => v3.normalize(v3.sub(path[Math.min(path.length-1, i+1)], path[Math.max(0, i-1)])));
  if (tangents.some(t => v3.length(t) < EPS)) throw new RangeError('Degenerate sweep path');
  let u = v3.normalize(v3.cross(Math.abs(tangents[0][2]) < .9 ? [0, 0, 1] : [0, 1, 0], tangents[0]));
  for (let k = 0; k < path.length; k++) {
    if (k) { const axis = v3.cross(tangents[k-1], tangents[k]), sin = v3.length(axis), cos = v3.dot(tangents[k-1], tangents[k]);
      if (cos < -.999999) throw new RangeError('Sweep path reverses direction');
      if (sin > EPS) u = m4.vector(m4.rotation(axis, Math.atan2(sin, cos)), u);
    }
    const v = v3.cross(tangents[k], u);
    for (const [x, y] of p) positions.push(...v3.add(path[k], v3.add(v3.scale(u, x), v3.scale(v, y))));
  }
  for (let k = 0; k < path.length-1; k++) for (let i = 0; i < n; i++) { const a = k*n+i, b = k*n+(i+1)%n; indices.push(a, b, b+n, a, b+n, a+n); }
  const caps = triangulate(p), offset = (path.length-1)*n;
  for (let i = 0; i < caps.length; i += 3) indices.push(caps[i+2], caps[i+1], caps[i], caps[i]+offset, caps[i+1]+offset, caps[i+2]+offset);
  return mesh(positions, indices, {kind: 'sweep'});
}
export function tessellateSurface(evaluate, stepsU = 32, stepsV = 32) {
  integer(stepsU, 1, 512); integer(stepsV, 1, 512);
  const positions = [], indices = [];
  for (let j = 0; j <= stepsV; j++) for (let i = 0; i <= stepsU; i++) positions.push(...evaluate(i/stepsU, j/stepsV));
  for (let j = 0; j < stepsV; j++) for (let i = 0; i < stepsU; i++) { const a = j*(stepsU+1)+i, b = a+1, c = a+stepsU+1; indices.push(a, b, c+1, a, c+1, c); }
  return mesh(positions, indices, {kind: 'surface', open: true});
}
export function transform(body, matrix) {
  const positions = new Float64Array(body.positions.length);
  for (let i = 0; i < positions.length/3; i++) positions.set(m4.point(matrix, pointAt(body, i)), i*3);
  const indices = body.indices.slice();
  const determinant = v3.dot([matrix[0], matrix[1], matrix[2]], v3.cross([matrix[4], matrix[5], matrix[6]], [matrix[8], matrix[9], matrix[10]]));
  if (Math.abs(determinant) < EPS) throw new RangeError('Transform collapses geometry');
  if (determinant < 0) for (let i = 0; i < indices.length; i += 3) [indices[i+1], indices[i+2]] = [indices[i+2], indices[i+1]];
  return mesh(positions, indices, {...body.meta});
}
export function merge(bodies) {
  const positions = new Float64Array(bodies.reduce((n, b) => n+b.positions.length, 0));
  const indices = new Uint32Array(bodies.reduce((n, b) => n+b.indices.length, 0));
  let p = 0, t = 0;
  for (const b of bodies) { positions.set(b.positions, p); for (const i of b.indices) indices[t++] = i+p/3; p += b.positions.length; }
  return mesh(positions, indices, {kind: 'compound'});
}
export function pattern(body, count, delta, angular = false) {
  integer(count, 1, 512);
  return merge(Array.from({length: count}, (_, i) => transform(body, angular ? m4.rotation([0, 0, 1], delta*i) : m4.translation(...v3.scale(delta, i)))));
}
export function removeDegenerate(body, tolerance = 1e-12) {
  const indices = [];
  for (let i = 0; i < body.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => pointAt(body, body.indices[i+k]));
    if (v3.length(v3.cross(v3.sub(b, a), v3.sub(c, a))) > tolerance) indices.push(body.indices[i], body.indices[i+1], body.indices[i+2]);
  }
  return mesh(body.positions.slice(), indices, {...body.meta});
}
export function weld(body, tolerance = 1e-7) {
  positive(tolerance);
  const map = new Map(), remap = new Uint32Array(body.positions.length/3), positions = [];
  for (let i = 0; i < remap.length; i++) { const p = pointAt(body, i), key = p.map(x => Math.round(x/tolerance)).join(',');
    if (!map.has(key)) { map.set(key, positions.length/3); positions.push(...p); } remap[i] = map.get(key);
  }
  return removeDegenerate(mesh(positions, Array.from(body.indices, i => remap[i]), {...body.meta}));
}
export function topology(body, tolerance = 1e-7) {
  const b = weld(body, tolerance), edges = new Map();
  for (let i = 0; i < b.indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = b.indices[i+j], c = b.indices[i+(j+1)%3], key = a < c ? `${a}:${c}` : `${c}:${a}`;
    if (!edges.has(key)) edges.set(key, {count: 0, direction: 0, vertices: [a, c]});
    const e = edges.get(key); e.count++; e.direction += a < c ? 1 : -1;
  }
  let boundaryEdges = 0, nonManifoldEdges = 0, inconsistentEdges = 0;
  for (const e of edges.values()) { if (e.count === 1) boundaryEdges++; if (e.count > 2) nonManifoldEdges++; if (e.count === 2 && e.direction !== 0) inconsistentEdges++; }
  return {vertices: b.positions.length/3, triangles: b.indices.length/3, edges: edges.size, boundaryEdges, nonManifoldEdges, inconsistentEdges,
    watertight: edges.size > 0 && !boundaryEdges && !nonManifoldEdges && !inconsistentEdges, eulerCharacteristic: b.positions.length/3-edges.size+b.indices.length/3};
}
/** Surface-integral properties; volume requires a closed consistently oriented mesh. */
export function massProperties(body, density = 0.0027) {
  positive(density, 'density in g/mm³'); let signedVolume = 0, area = 0, centroid = [0, 0, 0];
  // Translate to the bounding-box centre to reduce cancellation for distant parts.
  const origin = meshBounds(body).center;
  for (let i = 0; i < body.indices.length/3; i++) {
    const [a, b, c] = triangleAt(body, i).map(p => v3.sub(p, origin));
    area += v3.length(v3.cross(v3.sub(b, a), v3.sub(c, a)))/2;
    const volume = v3.dot(a, v3.cross(b, c))/6; signedVolume += volume;
    centroid = v3.add(centroid, v3.scale(v3.add(v3.add(a, b), c), volume/4));
  }
  return {volume: Math.abs(signedVolume), signedVolume, area, mass: Math.abs(signedVolume)*density,
    centroid: Math.abs(signedVolume) > EPS ? v3.add(origin, v3.scale(centroid, 1/signedVolume)) : origin, bounds: meshBounds(body)};
}
export function section(body, z) {
  finite(z); const lines = [];
  for (let i = 0; i < body.indices.length/3; i++) {
    const p = triangleAt(body, i), hits = [];
    for (let e = 0; e < 3; e++) {
      const a = p[e], b = p[(e+1)%3];
      // Half-open edge interval avoids duplicate hits at a mesh vertex.
      if ((a[2] <= z && b[2] > z) || (b[2] <= z && a[2] > z)) hits.push(v3.lerp(a, b, (z-a[2])/(b[2]-a[2])));
    }
    if (hits.length === 2 && v3.distance(hits[0], hits[1]) > EPS) lines.push(hits);
  }
  return lines;
}
export function subdivide(body, iterations = 1) {
  integer(iterations, 1, 4);
  let b = weld(body);
  for (let k = 0; k < iterations; k++) {
    if (b.indices.length > 1500000) throw new RangeError('Subdivision exceeds triangle budget');
    const positions = Array.from(b.positions), indices = [], midpoints = new Map();
    const midpoint = (a, c) => { const key = a < c ? `${a}:${c}` : `${c}:${a}`; if (!midpoints.has(key)) { midpoints.set(key, positions.length/3); positions.push(...v3.scale(v3.add(pointAt(b, a), pointAt(b, c)), .5)); } return midpoints.get(key); };
    for (let i = 0; i < b.indices.length; i += 3) { const [a, c, d] = b.indices.slice(i, i+3), ac = midpoint(a, c), cd = midpoint(c, d), da = midpoint(d, a); indices.push(a, ac, da, ac, c, cd, da, cd, d, ac, cd, da); }
    b = mesh(positions, indices, {...body.meta});
  }
  return b;
}
export function smooth(body, iterations = 1, strength = .25) {
  integer(iterations, 1, 50); if (!(strength > 0 && strength < 1)) throw new RangeError('Smoothing strength must be in (0,1)');
  let b = weld(body); const neighbors = Array.from({length: b.positions.length/3}, () => new Set());
  for (let i = 0; i < b.indices.length; i += 3) for (let k = 0; k < 3; k++) { const a = b.indices[i+k], c = b.indices[i+(k+1)%3]; neighbors[a].add(c); neighbors[c].add(a); }
  for (let k = 0; k < iterations; k++) { const p = b.positions.slice(); neighbors.forEach((ns, i) => { if (!ns.size) return; let avg = [0, 0, 0]; for (const j of ns) avg = v3.add(avg, pointAt(b, j)); p.set(v3.lerp(pointAt(b, i), v3.scale(avg, 1/ns.size), strength), i*3); }); b = mesh(p, b.indices, {...b.meta}); }
  return b;
}
/** Quantized vertex clustering, explicitly approximate and not topology preserving. */
export const simplify = (body, cellSize) => weld(body, positive(cellSize));
