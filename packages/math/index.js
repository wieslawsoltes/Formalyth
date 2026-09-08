/** @module @formalyth/math — dependency-free, Z-up, millimetre model space. */
export const EPS = 1e-8;
export const TAU = Math.PI * 2;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function finite(value, name = 'value') {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
export function positive(value, name = 'value') {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
export function integer(value, lo, hi, name = 'count') {
  if (!Number.isInteger(value) || value < lo || value > hi) throw new RangeError(`${name} must be an integer in [${lo}, ${hi}]`);
  return value;
}
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: a => Math.hypot(a[0], a[1], a[2]),
  distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize(a) { const n = this.length(a); return n > EPS ? this.scale(a, 1 / n) : [0, 0, 0]; },
  lerp: (a, b, t) => a.map((x, i) => x + (b[i] - x) * t)
};
/** Column-major matrices, column vectors. */
export const m4 = {
  identity: () => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  multiply(a, b) {
    const c = new Float64Array(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    return c;
  },
  translation(x, y, z) { const a = this.identity(); a[12] = x; a[13] = y; a[14] = z; return a; },
  scaling(x, y = x, z = x) { const a = this.identity(); a[0] = x; a[5] = y; a[10] = z; return a; },
  rotation(axis, angle) {
    if (v3.length(axis) < EPS) throw new RangeError('Rotation axis is zero');
    const [x, y, z] = v3.normalize(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return new Float64Array([t*x*x+c, t*x*y+s*z, t*x*z-s*y, 0, t*x*y-s*z, t*y*y+c, t*y*z+s*x, 0, t*x*z+s*y, t*y*z-s*x, t*z*z+c, 0, 0, 0, 0, 1]);
  },
  point(a, p) {
    const w = a[3]*p[0] + a[7]*p[1] + a[11]*p[2] + a[15];
    if (Math.abs(w) < EPS) throw new RangeError('Point projects to infinity');
    return [0, 1, 2].map(i => (a[i]*p[0] + a[4+i]*p[1] + a[8+i]*p[2] + a[12+i]) / w);
  },
  vector: (a, p) => [0, 1, 2].map(i => a[i]*p[0] + a[4+i]*p[1] + a[8+i]*p[2]),
  inverse(a) {
    const rows = Array.from({length: 4}, (_, r) => Array.from({length: 8}, (_, c) => c < 4 ? a[c*4+r] : +(c-4 === r)));
    for (let i = 0; i < 4; i++) {
      let p = i;
      for (let j = i+1; j < 4; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[p][i])) p = j;
      if (Math.abs(rows[p][i]) < 1e-14) throw new RangeError('Singular matrix');
      [rows[i], rows[p]] = [rows[p], rows[i]];
      const d = rows[i][i]; for (let k = 0; k < 8; k++) rows[i][k] /= d;
      for (let j = 0; j < 4; j++) if (j !== i) { const q = rows[j][i]; for (let k = 0; k < 8; k++) rows[j][k] -= q * rows[i][k]; }
    }
    return new Float64Array(Array.from({length: 16}, (_, i) => rows[i%4][4+Math.floor(i/4)]));
  },
  lookAt(eye, target, up = [0, 0, 1]) {
    const z = v3.normalize(v3.sub(eye, target));
    let x = v3.normalize(v3.cross(up, z));
    if (v3.length(x) < EPS) x = [1, 0, 0];
    const y = v3.cross(z, x);
    return new Float64Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1]);
  },
  ortho(left, right, bottom, top, near, far, zeroToOne = false) {
    const a = this.identity();
    a[0] = 2/(right-left); a[5] = 2/(top-bottom);
    a[10] = (zeroToOne ? -1 : -2)/(far-near);
    a[12] = -(right+left)/(right-left); a[13] = -(top+bottom)/(top-bottom);
    a[14] = zeroToOne ? -near/(far-near) : -(far+near)/(far-near);
    return a;
  }
};
/** Gaussian elimination with scaled partial pivoting. Does not mutate inputs. */
export function solveLinear(matrix, rhs, tolerance = 1e-12) {
  const n = rhs.length;
  if (matrix.length !== n || matrix.some(row => row.length !== n)) throw new RangeError('Linear system dimensions');
  const a = matrix.map((r, i) => [...r, rhs[i]]);
  const scales = a.map(r => Math.max(...r.slice(0, n).map(Math.abs)) || 1);
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col+1; r < n; r++) if (Math.abs(a[r][col])/scales[r] > Math.abs(a[p][col])/scales[p]) p = r;
    if (Math.abs(a[p][col])/scales[p] < tolerance) throw new RangeError('Singular or insufficiently constrained system');
    [a[col], a[p]] = [a[p], a[col]]; [scales[col], scales[p]] = [scales[p], scales[col]];
    for (let r = col+1; r < n; r++) { const q = a[r][col]/a[col][col]; a[r][col] = 0; for (let c = col+1; c <= n; c++) a[r][c] -= q*a[col][c]; }
  }
  const x = new Float64Array(n);
  for (let r = n-1; r >= 0; r--) { let s = a[r][n]; for (let c = r+1; c < n; c++) s -= a[r][c]*x[c]; x[r] = s/a[r][r]; }
  return x;
}
export function matrixRank(matrix, tolerance = 1e-7) {
  if (!matrix.length) return 0;
  const a = matrix.map(r => [...r]), cols = a[0].length; let rank = 0;
  for (let c = 0; c < cols && rank < a.length; c++) {
    let p = rank;
    for (let r = rank+1; r < a.length; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) <= tolerance) continue;
    [a[p], a[rank]] = [a[rank], a[p]];
    for (let r = rank+1; r < a.length; r++) { const q = a[r][c]/a[rank][c]; for (let k = c; k < cols; k++) a[r][k] -= q*a[rank][k]; }
    rank++;
  }
  return rank;
}
export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const k = i%3; min[k] = Math.min(min[k], positions[i]); max[k] = Math.max(max[k], positions[i]); }
  if (!positions.length) return {min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0]};
  return {min, max, size: v3.sub(max, min), center: v3.scale(v3.add(min, max), .5)};
}
export function rayBox(origin, direction, box) {
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < EPS) { if (origin[i] < box.min[i] || origin[i] > box.max[i]) return null; continue; }
    const a = (box.min[i]-origin[i])/direction[i], b = (box.max[i]-origin[i])/direction[i];
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (hi < lo) return null;
  }
  return hi < 0 ? null : Math.max(0, lo);
}
export function rayTriangle(origin, direction, a, b, c) {
  const e1 = v3.sub(b, a), e2 = v3.sub(c, a), p = v3.cross(direction, e2), det = v3.dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const s = v3.sub(origin, a), u = v3.dot(s, p)/det;
  if (u < 0 || u > 1) return null;
  const q = v3.cross(s, e1), v = v3.dot(direction, q)/det;
  if (v < 0 || u+v > 1) return null;
  const t = v3.dot(e2, q)/det;
  return t >= 0 ? {t, u, v, point: v3.add(origin, v3.scale(direction, t))} : null;
}
