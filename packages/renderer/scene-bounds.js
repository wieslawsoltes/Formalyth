/** World-space scene bounds include all eight transformed local AABB corners. */
import {m4, bounds} from '../math/index.js';
export function worldBounds(items) {
  const points=[];
  for (const item of items) {
    const box=item.bounds, matrix=item.model||m4.identity();
    if (!box?.min || !box?.max) continue;
    for(let mask=0;mask<8;mask++)points.push(...m4.point(matrix,[0,1,2].map(i=>mask&(1<<i)?box.max[i]:box.min[i])));
  }
  return points.length?bounds(points):null;
}
