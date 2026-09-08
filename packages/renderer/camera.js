import {clamp, m4, v3} from '../math/index.js';
/** Orthographic Z-up CAD camera. Scale is vertical world-space span. */
export class OrbitCamera {
  constructor() { this.target = [0, 0, 0]; this.scale = 130; this.yaw = -.8; this.pitch = .65; this.aspect = 1; }
  get eye() { const d = this.scale*4+100, c = Math.cos(this.pitch); return v3.add(this.target, [d*c*Math.cos(this.yaw), d*c*Math.sin(this.yaw), d*Math.sin(this.pitch)]); }
  get viewMatrix() { return m4.lookAt(this.eye, this.target); }
  matrix(zeroToOne = false) { const h = this.scale/2; return m4.multiply(m4.ortho(-h*this.aspect, h*this.aspect, -h, h, .001, this.scale*20+1000, zeroToOne), this.viewMatrix); }
  orbit(dx, dy) { this.yaw -= dx*.008; this.pitch = clamp(this.pitch+dy*.008, -Math.PI/2+.00001, Math.PI/2-.00001); }
  pan(dx, dy, height) { const view = this.viewMatrix, units = this.scale/height; this.target = v3.add(this.target, v3.add(v3.scale([view[0], view[4], view[8]], -dx*units), v3.scale([view[1], view[5], view[9]], dy*units))); }
  zoom(factor) { this.scale = clamp(this.scale*factor, .001, 1e7); }
  fit(box) { this.target = [...box.center]; this.scale = Math.max(box.size[2], box.size[1], box.size[0]/this.aspect, 1)*1.65; }
  preset(name) {
    const angles = {iso: [-.8, .65], top: [-Math.PI/2, Math.PI/2-.00001], bottom: [-Math.PI/2, -Math.PI/2+.00001], front: [-Math.PI/2, 0], back: [Math.PI/2, 0], right: [0, 0], left: [Math.PI, 0]};
    if (!angles[name]) throw new TypeError('Unknown camera view'); [this.yaw, this.pitch] = angles[name];
  }
  project(point, width, height) { const p = m4.point(this.matrix(), point); return [(p[0]+1)*width/2, (1-p[1])*height/2, p[2]]; }
  ray(x, y, width, height) { const inverse = m4.inverse(this.matrix()), a = m4.point(inverse, [x/width*2-1, 1-y/height*2, -1]), b = m4.point(inverse, [x/width*2-1, 1-y/height*2, 1]); return {origin: a, direction: v3.normalize(v3.sub(b, a))}; }
}
