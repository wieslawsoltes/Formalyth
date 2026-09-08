/** CPU-side render preparation can run in a Worker. No graphics API dependency. */
import {v3} from '../math/index.js';
import {pointAt, triangleAt, weld, meshBounds} from '../kernel/index.js';
export function prepareMesh(input, {creaseAngle = 35} = {}) {
  const body = weld(input, 1e-6), count = body.indices.length/3, origin = meshBounds(body).center, normals = new Float32Array(count*3);
  const adjacent = Array.from({length: body.positions.length/3}, () => []), edges = new Map();
  for (let t = 0; t < count; t++) {
    const [a, b, c] = triangleAt(body, t), normal = v3.normalize(v3.cross(v3.sub(b, a), v3.sub(c, a))); normals.set(normal, t*3);
    for (let k = 0; k < 3; k++) {
      const i = body.indices[t*3+k], j = body.indices[t*3+(k+1)%3]; adjacent[i].push(t);
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (!edges.has(key)) edges.set(key, {i, j, faces: []}); edges.get(key).faces.push(t);
    }
  }
  const threshold = Math.cos(creaseAngle*Math.PI/180), vertices = new Float32Array(count*18); let offset = 0;
  for (let t = 0; t < count; t++) {
    const faceNormal = Array.from(normals.subarray(t*3, t*3+3));
    for (let k = 0; k < 3; k++) {
      const i = body.indices[t*3+k]; let normal = [0, 0, 0];
      for (const f of adjacent[i]) { const n = normals.subarray(f*3, f*3+3); if (v3.dot(faceNormal, n) >= threshold) normal = v3.add(normal, n); }
      vertices.set(v3.sub(pointAt(body, i), origin), offset); vertices.set(v3.normalize(normal), offset+3); offset += 6;
    }
  }
  const lines = [];
  for (const edge of edges.values()) {
    const ns = edge.faces.map(f => normals.subarray(f*3, f*3+3));
    if (ns.length === 1 || ns.some(n => v3.dot(n, ns[0]) < threshold)) for (const i of [edge.i, edge.j]) lines.push(...v3.sub(pointAt(body, i), origin), 0, 0, 1);
  }
  return {vertices, edges: new Float32Array(lines), origin, triangles: count, bounds: meshBounds(body)};
}
export function prepareLines(segments) {
  const values = new Float32Array(segments.length*12); let i = 0;
  for (const pair of segments) for (const p of pair) { values.set(p, i); values.set([0, 0, 1], i+3); i += 6; }
  return {vertices: values, origin: [0, 0, 0], edges: new Float32Array(), triangles: 0};
}
