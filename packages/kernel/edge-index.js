/** Axis-selective point queries for conforming triangle/polygon boundaries. */
export class CollinearPointIndex {
  constructor(points, tolerance = 1e-6, {cacheLimit = 250000} = {}) {
    if (!Array.isArray(points) || points.length > 4000000 || !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isInteger(cacheLimit) || cacheLimit < 0) throw new RangeError('Invalid point index or limits');
    for (const point of points) if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) throw new TypeError('Expected finite XYZ points');
    this.points = points; this.tolerance = tolerance; this.cacheLimit = cacheLimit; this.cache = new Map();
    this.sorted = [0, 1, 2].map(axis => Uint32Array.from(points, (_, i) => i).sort((a, b) => points[a][axis] - points[b][axis]));
    this.stats = {queries: 0, reused: 0, candidates: 0};
  }
  bound(axis, value, upper = false) {
    const list = this.sorted[axis]; let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1, coordinate = this.points[list[mid]][axis]; if (coordinate < value || upper && coordinate === value) lo = mid + 1; else hi = mid; }
    return lo;
  }
  between(start, end) {
    const n = this.points.length;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start >= n || end >= n) throw new RangeError('Point index out of range');
    this.stats.queries++;
    if (start === end) return [];
    const reverse = start > end, ia = Math.min(start, end), ib = Math.max(start, end), key = `${ia}:${ib}`;
    let hits = this.cache.get(key);
    if (hits) { this.stats.reused++; return reverse ? hits.slice().reverse() : hits.slice(); }
    const a = this.points[ia], b = this.points[ib], dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2], length2 = dx*dx+dy*dy+dz*dz;
    const epsilon = this.tolerance, padding = epsilon*2;
    if (length2 <= epsilon*epsilon) return [];
    const minimum = epsilon/Math.sqrt(length2), low = [0,1,2].map(i => Math.min(a[i],b[i])-padding), high = [0,1,2].map(i => Math.max(a[i],b[i])+padding);
    // Query the narrowest actual index interval, then test segment distance.
    let axis = 0, begin = 0, finish = n;
    for (let i=0;i<3;i++) { const lo=this.bound(i,low[i]), hi=this.bound(i,high[i],true); if(hi-lo < finish-begin){axis=i;begin=lo;finish=hi;} }
    const candidates = [];
    for (let i=begin;i<finish;i++) {
      this.stats.candidates++; const id=this.sorted[axis][i], q=this.points[id];
      if(q[0]<low[0]||q[0]>high[0]||q[1]<low[1]||q[1]>high[1]||q[2]<low[2]||q[2]>high[2])continue;
      const x=q[0]-a[0],y=q[1]-a[1],z=q[2]-a[2],t=(x*dx+y*dy+z*dz)/length2;
      if(t<=minimum||t>=1-minimum)continue;
      const ex=x-t*dx,ey=y-t*dy,ez=z-t*dz;
      if(ex*ex+ey*ey+ez*ez<=padding*padding)candidates.push({id,t});
    }
    hits=candidates.sort((a,b)=>a.t-b.t||a.id-b.id).map(item=>item.id);
    if(this.cacheLimit){if(this.cache.size>=this.cacheLimit)this.cache.clear();this.cache.set(key,hits);}
    return reverse?hits.slice().reverse():hits.slice();
  }
}
