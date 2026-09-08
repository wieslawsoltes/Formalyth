/** Triangle BVH for picking and geometric queries; immutable after construction. */
import {bounds, rayBox, rayTriangle, v3} from '../math/index.js';
import {triangleAt} from './index.js';
export class TriangleBVH {
  constructor(body, leafSize = 12) {
    this.body = body;
    const count = body.indices.length/3;
    const boxes = Array.from({length: count}, (_, i) => bounds(triangleAt(body, i).flat()));
    const build = ids => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const i of ids) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], boxes[i].min[k]); max[k] = Math.max(max[k], boxes[i].max[k]); }
      const node = {box: {min, max}};
      if (ids.length <= leafSize) { node.ids = ids; return node; }
      const size = v3.sub(max, min); let axis = size[1] > size[0] ? 1 : 0; if (size[2] > size[axis]) axis = 2;
      ids.sort((a, b) => boxes[a].center[axis]-boxes[b].center[axis]);
      const mid = ids.length >>> 1; node.left = build(ids.slice(0, mid)); node.right = build(ids.slice(mid)); return node;
    };
    this.root = count ? build(Array.from({length: count}, (_, i) => i)) : null;
  }
  intersect(origin, direction, accept = null) {
    let best = null;
    const visit = node => {
      if (!node) return;
      const distance = rayBox(origin, direction, node.box);
      if (distance === null || (best && distance > best.t)) return;
      if (node.ids) { for (const i of node.ids) { const hit = rayTriangle(origin, direction, ...triangleAt(this.body, i)); if (hit && (!accept || accept(hit)) && (!best || hit.t < best.t)) best = {...hit, triangle: i}; } return; }
      const a = rayBox(origin, direction, node.left.box), b = rayBox(origin, direction, node.right.box);
      if (a !== null && (b === null || a < b)) { visit(node.left); visit(node.right); } else { visit(node.right); visit(node.left); }
    };
    visit(this.root); return best;
  }
}
