/** @module @formalyth/solver — damped nonlinear least squares and 2D sketch constraints. */
import {finite, positive, integer, solveLinear, matrixRank} from '../math/index.js';
export * from './expressions.js';
const norm2 = r => r.reduce((sum, x) => sum+x*x, 0);
function jacobian(evaluate, x, residuals) {
  const j = residuals.map(() => new Float64Array(x.length));
  for (let k = 0; k < x.length; k++) {
    const h = 1e-6*(Math.abs(x[k])+1), p = x.slice(); p[k] += h;
    const r = evaluate(p); if (r.length !== residuals.length) throw new RangeError('Residual dimension changed');
    for (let i = 0; i < r.length; i++) j[i][k] = (r[i]-residuals[i])/h;
  }
  return j;
}
export function leastSquares(initial, residualFunction, {tolerance = 1e-7, maxIterations = 100} = {}) {
  positive(tolerance); integer(maxIterations, 1, 1000);
  let x = Float64Array.from(initial, v => finite(v)); if (x.length > 1024) throw new RangeError('Solver variable budget exceeded');
  const evaluate = p => residualFunction(p).map(v => finite(v, 'constraint residual'));
  let r = evaluate(x), error = norm2(r), damping = 1e-3, iterations = 0;
  for (; iterations < maxIterations && error > tolerance*tolerance; iterations++) {
    const j = jacobian(evaluate, x, r), n = x.length;
    const a = Array.from({length: n}, () => new Float64Array(n)), b = new Float64Array(n);
    for (let row = 0; row < r.length; row++) for (let col = 0; col < n; col++) {
      b[col] -= j[row][col]*r[row]; for (let k = col; k < n; k++) a[col][k] += j[row][col]*j[row][k];
    }
    for (let col = 0; col < n; col++) { for (let k = 0; k < col; k++) a[col][k] = a[k][col]; a[col][col] += damping*(a[col][col]+1); }
    let step; try { step = solveLinear(a, b); } catch { damping *= 10; continue; }
    const candidate = x.map((v, i) => v+step[i]), next = evaluate(candidate), nextError = norm2(next);
    if (nextError < error) { x = candidate; r = next; error = nextError; damping = Math.max(1e-12, damping/3); }
    else damping = Math.min(1e16, damping*10);
    if (damping >= 1e16 || (norm2(step) < 1e-24 && error > tolerance*tolerance)) break;
  }
  const rank = matrixRank(jacobian(evaluate, x, r)), dof = Math.max(0, x.length-rank), residual = Math.sqrt(error), converged = residual <= tolerance;
  return {values: x, residuals: r, residual, iterations, rank, dof, redundant: Math.max(0, r.length-rank), converged, status: !converged ? 'inconsistent' : dof ? 'underconstrained' : 'fully constrained'};
}
export function solveSketch(sketch, options = {}) {
  if (!Array.isArray(sketch.points) || sketch.points.length > 256) throw new RangeError('Sketch supports up to 256 points');
  const circles = sketch.circles || [], constraints = sketch.constraints || [];
  if (circles.length > 128 || constraints.length > 2048) throw new RangeError('Sketch complexity limit exceeded');
  const points = sketch.points.map(p => { if (p.length !== 2) throw new TypeError('Sketch points are 2D'); return p.map(x => finite(x)); });
  circles.forEach(c => { integer(c.center, 0, points.length-1, 'circle center'); positive(c.radius, 'circle radius'); });
  const initial = points.flat().concat(circles.map(c => c.radius)), pointCount = points.length;
  const residualFunction = x => {
    const p = i => { integer(i, 0, pointCount-1, 'point reference'); return [x[i*2], x[i*2+1]]; };
    const circle = i => { integer(i, 0, circles.length-1, 'circle reference'); return {center: p(circles[i].center), radius: x[pointCount*2+i]}; };
    const delta = (a, b) => { a = p(a); b = p(b); return [b[0]-a[0], b[1]-a[1]]; };
    const length = v => Math.hypot(v[0], v[1]);
    const signedDistance = (a, b, c) => { const line = [c[0]-b[0], c[1]-b[1]], d = length(line); if (d < 1e-12) throw new RangeError('Constraint refers to zero-length line'); return ((a[0]-b[0])*line[1]-(a[1]-b[1])*line[0])/d; };
    const r = [];
    for (const c of constraints) {
      const scale = c.weight === undefined ? 1 : positive(c.weight, 'constraint weight'); let values;
      switch (c.type) {
        case 'fixed': { const a = p(c.a); values = [a[0]-finite(c.x), a[1]-finite(c.y)]; break; }
        case 'coincident': values = delta(c.a, c.b); break;
        case 'horizontal': values = [delta(c.a, c.b)[1]]; break;
        case 'vertical': values = [delta(c.a, c.b)[0]]; break;
        case 'distance': values = [length(delta(c.a, c.b))-positive(c.value, 'distance')]; break;
        case 'xDistance': values = [delta(c.a, c.b)[0]-finite(c.value)]; break;
        case 'yDistance': values = [delta(c.a, c.b)[1]-finite(c.value)]; break;
        case 'equal': values = [length(delta(c.a, c.b))-length(delta(c.c, c.d))]; break;
        case 'parallel': case 'perpendicular': case 'angle': {
          const a = delta(c.a, c.b), b = delta(c.c, c.d), l = length(a)*length(b);
          if (l < 1e-12) throw new RangeError('Angular constraint on zero-length line');
          const dot = (a[0]*b[0]+a[1]*b[1])/l, cross = (a[0]*b[1]-a[1]*b[0])/l;
          const theta = Math.atan2(cross, dot)-(c.type === 'angle' ? finite(c.value) : 0);
          values = [c.type === 'parallel' ? cross : c.type === 'perpendicular' ? dot : Math.atan2(Math.sin(theta), Math.cos(theta))]; break;
        }
        case 'midpoint': { const a = p(c.a), b = p(c.b), d = p(c.c); values = [a[0]-(b[0]+d[0])/2, a[1]-(b[1]+d[1])/2]; break; }
        case 'pointOnLine': values = [signedDistance(p(c.a), p(c.b), p(c.c))]; break;
        case 'radius': values = [circle(c.circle).radius-positive(c.value, 'radius')]; break;
        case 'equalRadius': values = [circle(c.circleA).radius-circle(c.circleB).radius]; break;
        case 'concentric': { const a = circle(c.circleA).center, b = circle(c.circleB).center; values = [a[0]-b[0], a[1]-b[1]]; break; }
        case 'pointOnCircle': { const a = p(c.a), b = circle(c.circle); values = [Math.hypot(a[0]-b.center[0], a[1]-b.center[1])-b.radius]; break; }
        case 'tangentLine': { const a = circle(c.circle); values = [Math.abs(signedDistance(a.center, p(c.a), p(c.b)))-a.radius]; break; }
        case 'tangentCircles': { const a = circle(c.circleA), b = circle(c.circleB); values = [Math.hypot(a.center[0]-b.center[0], a.center[1]-b.center[1])-(c.internal ? Math.abs(a.radius-b.radius) : a.radius+b.radius)]; break; }
        case 'symmetric': { const a = p(c.a), b = p(c.b), axisA = p(c.c), axisB = p(c.d), ab = delta(c.a, c.b), axis = delta(c.c, c.d); values = [signedDistance([(a[0]+b[0])/2, (a[1]+b[1])/2], axisA, axisB), (ab[0]*axis[0]+ab[1]*axis[1])/(length(axis)||1)]; break; }
        default: throw new TypeError(`Unsupported sketch constraint: ${c.type}`);
      }
      r.push(...values.map(v => v*scale));
    }
    return r;
  };
  const report = leastSquares(initial, residualFunction, options);
  const solved = {...structuredClone(sketch), points: points.map((_, i) => Array.from(report.values.slice(i*2, i*2+2))), circles: circles.map((c, i) => ({...c, radius: report.values[pointCount*2+i]}))};
  if (solved.circles.some(c => c.radius <= 0)) return {...report, converged: false, status: 'inconsistent', sketch: solved};
  return {...report, sketch: solved};
}
