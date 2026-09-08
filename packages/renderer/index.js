/** @module @formalyth/renderer — native WebGPU, WebGL2 fallback, demand-driven frames. */
import {m4, v3, bounds} from '../math/index.js';
import {TriangleBVH} from '../kernel/spatial.js';
import {OrbitCamera} from './camera.js';
import {prepareMesh, prepareLines} from './prepare.js';
export {OrbitCamera, prepareMesh, prepareLines};
const WGSL = `
struct Uniforms { mvp: mat4x4<f32>, color: vec4<f32>, clip: vec4<f32>, eye: vec4<f32>, light: vec4<f32>, flags: vec4<f32> };
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VOut { @builtin(position) position: vec4<f32>, @location(0) p: vec3<f32>, @location(1) n: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) n: vec3<f32>) -> VOut {
  var out: VOut; out.position = u.mvp*vec4<f32>(p,1.0); out.p = p; out.n = n; return out;
}
@fragment fn fs(in: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  if (u.flags.y > 0.5 && dot(u.clip,vec4<f32>(in.p,1.0)) > 0.0) { discard; }
  if (u.flags.x > 0.5) { return u.color; }
  let n = normalize(in.n)*select(-1.0,1.0,front); let l = normalize(u.light.xyz); let v = normalize(u.eye.xyz-in.p);
  let diffuse = max(dot(n,l),0.0); let fill = max(dot(n,normalize(vec3<f32>(-0.7,0.3,0.4))),0.0);
  let specular = pow(max(dot(n,normalize(l+v)),0.0),mix(90.0,8.0,u.flags.z))*0.28;
  let rgb = u.color.rgb*(0.39+0.57*diffuse+0.13*fill)+vec3<f32>(specular);
  return vec4<f32>(rgb,u.color.a);
}`;
const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; layout(location=1) in vec3 aNormal;
uniform mat4 uMVP; out vec3 vPosition; out vec3 vNormal;
void main(){gl_Position=uMVP*vec4(aPosition,1.0);vPosition=aPosition;vNormal=aNormal;}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPosition; in vec3 vNormal; out vec4 outColor;
uniform vec4 uColor; uniform vec4 uClip; uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uFlags;
void main(){
 if(uFlags.y>0.5 && dot(uClip,vec4(vPosition,1.0))>0.0)discard;
 if(uFlags.x>0.5){outColor=uColor;return;}
 vec3 n=normalize(vNormal)*(gl_FrontFacing?1.0:-1.0),l=normalize(uLight),v=normalize(uEye-vPosition);
 float diffuse=max(dot(n,l),0.0),fill=max(dot(n,normalize(vec3(-0.7,0.3,0.4))),0.0);
 float specular=pow(max(dot(n,normalize(l+v)),0.0),mix(90.0,8.0,uFlags.z))*0.28;
 outColor=vec4(uColor.rgb*(0.39+0.57*diffuse+0.13*fill)+vec3(specular),uColor.a);
}`;
function rgb(hex, alpha = 1) { if (!/^#[0-9a-f]{6}$/i.test(hex || '')) hex = '#6497b2'; return [1, 3, 5].map(i => parseInt(hex.slice(i, i+2), 16)/255).concat(alpha); }
export class Renderer {
  constructor(canvas, {onFrame = () => {}, onError = console.error, onPick = () => {}} = {}) {
    this.canvas = canvas; this.camera = new OrbitCamera(); this.onFrame = onFrame; this.onError = onError; this.onPick = onPick;
    this.items = new Map(); this.lines = new Map(); this.selected = new Set(); this.clipZ = null; this.edges = true; this.wireframe = false;
    this.background = [.925, .937, .944, 1]; this.backend = 'initializing'; this.pending = false; this.ready = false; this.disposed = false; this.interaction = 'orbit';
    this.abort = new AbortController(); this.observe = new ResizeObserver(() => this.resize()); this.observe.observe(canvas);
  }
  async initialize({forceWebGL = false} = {}) {
    if (!forceWebGL && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
        if (adapter) {
          this.device = await adapter.requestDevice(); const device = this.device;
          this.format = navigator.gpu.getPreferredCanvasFormat(); const module = device.createShaderModule({code: WGSL});
          const base = {layout: 'auto', vertex: {module, entryPoint: 'vs', buffers: [{arrayStride: 24, attributes: [{shaderLocation: 0, offset: 0, format: 'float32x3'}, {shaderLocation: 1, offset: 12, format: 'float32x3'}]}]}, fragment: {module, entryPoint: 'fs', targets: [{format: this.format, blend: {color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha'}, alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha'}}}]}, multisample: {count: 4}};
          this.pipeline = await device.createRenderPipelineAsync({...base, primitive: {topology: 'triangle-list'}, depthStencil: {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal', depthBias: 1, depthBiasSlopeScale: 1}});
          this.linePipeline = await device.createRenderPipelineAsync({...base, primitive: {topology: 'line-list'}, depthStencil: {format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal'}});
          this.context = this.canvas.getContext('webgpu'); if (!this.context) throw new Error('WebGPU canvas unavailable');
          this.context.configure({device, format: this.format, alphaMode: 'opaque'}); this.backend = 'WebGPU';
          device.addEventListener('uncapturederror', e => this.onError(e.error.message));
          device.lost.then(info => { if (!this.disposed) { this.ready = false; this.onError(`Graphics device lost: ${info.message || info.reason}. Save your project and reload.`); } });
        }
      } catch (error) { console.warn('WebGPU initialization failed:', error.message); if (this.context) throw error; this.device?.destroy(); this.device = null; }
    }
    if (this.backend !== 'WebGPU') this.initializeGL();
    this.ready = true; this.attachControls(); this.resize(); this.grid(); this.invalidate(); return this;
  }
  initializeGL() {
    const gl = this.canvas.getContext('webgl2', {alpha: false, antialias: true, preserveDrawingBuffer: true});
    if (!gl) throw new Error('A WebGPU or WebGL2-capable browser and graphics device are required.');
    const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram(), vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    this.gl = gl; this.program = program; this.uniforms = Object.fromEntries(['uMVP', 'uColor', 'uClip', 'uEye', 'uLight', 'uFlags'].map(k => [k, gl.getUniformLocation(program, k)])); this.backend = 'WebGL2';
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ready = false; this.onError('Graphics context lost. Save your project and reload.'); }, {signal: this.abort.signal});
  }
  resize() {
    if (!this.ready) return;
    const rect = this.canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width*ratio)), h = Math.max(1, Math.round(rect.height*ratio));
    this.camera.aspect = rect.width/Math.max(1, rect.height);
    if (w !== this.canvas.width || h !== this.canvas.height || (this.device && !this.depth)) {
      this.canvas.width = w; this.canvas.height = h;
      if (this.device) {
        this.depth?.destroy(); this.multisample?.destroy();
        this.depth = this.device.createTexture({size: [w, h], sampleCount: 4, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT});
        this.multisample = this.device.createTexture({size: [w, h], sampleCount: 4, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT});
      }
    }
    this.invalidate();
  }
  resource(vertices, line) {
    if (!vertices.length) return null;
    const out = {count: vertices.length/6, bytes: vertices.byteLength, line};
    if (this.device) {
      out.buffer = this.device.createBuffer({size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST}); this.device.queue.writeBuffer(out.buffer, 0, vertices);
      out.uniform = this.device.createBuffer({size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
      out.bind = this.device.createBindGroup({layout: (line ? this.linePipeline : this.pipeline).getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: out.uniform}}]});
    } else {
      const gl = this.gl; out.vao = gl.createVertexArray(); gl.bindVertexArray(out.vao); out.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, out.buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    }
    return out;
  }
  release(entry) { if (!entry) return; for (const r of [entry.surface, entry.edge]) if (r) { if (this.device) { r.buffer.destroy(); r.uniform.destroy(); } else { this.gl.deleteBuffer(r.buffer); this.gl.deleteVertexArray(r.vao); } } }
  setScene(items) {
    if (!this.ready) throw new Error('Initialize renderer before setting scene');
    const keep = new Set();
    for (const item of items) {
      if (!item.value?.positions) continue; keep.add(item.id); const old = this.items.get(item.id);
      if (old && old.version === item.version && old.body === item.value) { old.color = item.color; continue; }
      if (old && item.version !== undefined && old.version === item.version) { old.color = item.color; continue; }
      this.release(old); const prepared = item.prepared || prepareMesh(item.value);
      this.items.set(item.id, {id: item.id, version: item.version, body: item.value, color: item.color, origin: prepared.origin, bounds: prepared.bounds, model: m4.identity(), triangles: prepared.triangles, surface: this.resource(prepared.vertices, false), edge: this.resource(prepared.edges, true), bvh: null});
    }
    for (const [id, entry] of this.items) if (!keep.has(id)) { this.release(entry); this.items.delete(id); }
    this.invalidate();
  }
  setLines(id, segments, color = '#3c98c9') {
    const old = this.lines.get(id); this.release(old); this.lines.delete(id);
    if (segments.length) { const p = prepareLines(segments); this.lines.set(id, {id, origin: p.origin, model: m4.identity(), color, surface: this.resource(p.vertices, true)}); }
    this.invalidate();
  }
  clearLines(prefix = '') { for (const [id, entry] of this.lines) if (id.startsWith(prefix)) { this.release(entry); this.lines.delete(id); } this.invalidate(); }
  grid() {
    const step = 10**Math.floor(Math.log10(this.camera.scale/6)), extent = step*20, minor = [], major = [];
    for (let i = -20; i <= 20; i++) if (i) { const group = i%5 ? minor : major; group.push([[-extent, i*step, -.05], [extent, i*step, -.05]], [[i*step, -extent, -.05], [i*step, extent, -.05]]); }
    this.setLines('grid-minor', minor, '#d1dce2'); this.setLines('grid-major', major, '#b9cbd3'); this.setLines('axis-x', [[[0, 0, 0], [extent*.8, 0, 0]]], '#bf7373'); this.setLines('axis-y', [[[0, 0, 0], [0, extent*.8, 0]]], '#7b9b76');
    this.gridStep = step;
  }
  fit() {
    const coords = []; for (const item of this.items.values()) coords.push(...item.bounds.min, ...item.bounds.max);
    if (coords.length) this.camera.fit(bounds(coords)); this.grid(); this.invalidate();
  }
  view(name) { this.camera.preset(name); this.invalidate(); }
  select(ids) { this.selected = new Set(ids); this.invalidate(); }
  setClip(z) { this.clipZ = z; this.invalidate(); }
  transform(id, matrix) { const item = this.items.get(id); if (item) { item.model = matrix; this.invalidate(); } }
  project(p) { const r = this.canvas.getBoundingClientRect(); return this.camera.project(p, r.width, r.height); }
  planePoint(x, y, z = 0) { const r = this.canvas.getBoundingClientRect(), ray = this.camera.ray(x, y, r.width, r.height); if (Math.abs(ray.direction[2]) < 1e-9) return null; return v3.add(ray.origin, v3.scale(ray.direction, (z-ray.origin[2])/ray.direction[2])); }
  pick(x, y) {
    const rect = this.canvas.getBoundingClientRect(), ray = this.camera.ray(x, y, rect.width, rect.height); let result = null;
    for (const item of this.items.values()) {
      const inverse = m4.inverse(item.model), origin = m4.point(inverse, ray.origin), direction = v3.normalize(m4.vector(inverse, ray.direction));
      item.bvh ||= new TriangleBVH(item.body); const hit = item.bvh.intersect(origin, direction, this.clipZ===null ? null : candidate => m4.point(item.model,candidate.point)[2]<=this.clipZ+1e-6);
      if (hit) { const point = m4.point(item.model, hit.point), distance = v3.distance(point, ray.origin); if (this.clipZ !== null && point[2] > this.clipZ+1e-6) continue;
        if (!result || distance < result.distance) result = {...hit, id: item.id, point, distance};
      }
    }
    return result;
  }
  invalidate() { if (this.pending || !this.ready || this.disposed) return; this.pending = true; requestAnimationFrame(() => { this.pending = false; if (this.ready && !this.disposed) this.draw(); }); }
  uniformData(entry, resource, edge = false) {
    const model = m4.multiply(entry.model, m4.translation(...entry.origin)), inverse = m4.inverse(model), out = new Float32Array(36);
    out.set(m4.multiply(this.camera.matrix(!!this.device), model));
    let color = rgb(edge ? (this.selected.has(entry.id) ? '#167bcb' : '#324b59') : entry.color || '#6497b2');
    if (!edge && this.selected.has(entry.id)) color = [color[0]*.65+.1, color[1]*.65+.24, color[2]*.65+.34, 1];
    out.set(color, 16);
    if (this.clipZ !== null) { const plane = [0, 0, 1, -this.clipZ]; out.set([0, 1, 2, 3].map(col => plane.reduce((s, v, row) => s+v*model[col*4+row], 0)), 20); }
    out.set([...m4.point(inverse, this.camera.eye), 0], 24); out.set([...m4.vector(inverse, [-.4, -.55, 1]), 0], 28);
    out.set([resource.line ? 1 : 0, this.clipZ !== null && !entry.id.startsWith('grid') && !entry.id.startsWith('axis') ? 1 : 0, .35, 0], 32); return out;
  }
  draw() {
    const started = performance.now(); let drawCalls = 0, bytes = 0, triangles = 0;
    const draws = [];
    for (const entry of this.lines.values()) if (entry.surface) draws.push([entry, entry.surface, false]);
    for (const entry of this.items.values()) { triangles += entry.triangles; if (!this.wireframe && entry.surface) draws.push([entry, entry.surface, false]); if ((this.edges || this.wireframe) && entry.edge) draws.push([entry, entry.edge, true]); }
    if (this.device) {
      const encoder = this.device.createCommandEncoder(), pass = encoder.beginRenderPass({colorAttachments: [{view: this.multisample.createView(), resolveTarget: this.context.getCurrentTexture().createView(), clearValue: this.background, loadOp: 'clear', storeOp: 'store'}], depthStencilAttachment: {view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard'}});
      for (const [entry, resource, edge] of draws) { const data = this.uniformData(entry, resource, edge); this.device.queue.writeBuffer(resource.uniform, 0, data); pass.setPipeline(resource.line ? this.linePipeline : this.pipeline); pass.setBindGroup(0, resource.bind); pass.setVertexBuffer(0, resource.buffer); pass.draw(resource.count); drawCalls++; bytes += resource.bytes; }
      pass.end(); this.device.queue.submit([encoder.finish()]);
    } else {
      const gl = this.gl, u = this.uniforms; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(...this.background); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.useProgram(this.program);
      for (const [entry, resource, edge] of draws) {
        const data = this.uniformData(entry, resource, edge); gl.uniformMatrix4fv(u.uMVP, false, data.subarray(0, 16)); gl.uniform4fv(u.uColor, data.subarray(16, 20)); gl.uniform4fv(u.uClip, data.subarray(20, 24)); gl.uniform3fv(u.uEye, data.subarray(24, 27)); gl.uniform3fv(u.uLight, data.subarray(28, 31)); gl.uniform3fv(u.uFlags, data.subarray(32, 35));
        if (resource.line) { gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(false); } else { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); gl.depthMask(true); }
        gl.bindVertexArray(resource.vao); gl.drawArrays(resource.line ? gl.LINES : gl.TRIANGLES, 0, resource.count); drawCalls++; bytes += resource.bytes;
      }
      gl.depthMask(true);
    }
    this.onFrame({backend: this.backend, triangles, drawCalls, uploadedBytes: bytes, cpuMilliseconds: performance.now()-started, gridStep: this.gridStep});
  }
  attachControls() {
    const signal = this.abort.signal, pointers = new Map(); let gesture = null, down = null, moved = false;
    const local = e => { const r = this.canvas.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; };
    this.canvas.addEventListener('contextmenu', e => e.preventDefault(), {signal});
    this.canvas.addEventListener('pointerdown', e => { this.canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, local(e)); down = {point: local(e), button: e.button}; moved = false; gesture = null; }, {signal});
    this.canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return; const previous = pointers.get(e.pointerId), next = local(e); pointers.set(e.pointerId, next);
      if (down && Math.hypot(next[0]-down.point[0], next[1]-down.point[1]) > 4) moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], now = {center: [(a[0]+b[0])/2, (a[1]+b[1])/2], distance: Math.hypot(a[0]-b[0], a[1]-b[1])};
        if (gesture && now.distance > 0) { this.camera.zoom(gesture.distance/now.distance); this.camera.pan(now.center[0]-gesture.center[0], now.center[1]-gesture.center[1], this.canvas.clientHeight); }
        gesture = now; moved = true;
      } else if (this.interaction !== 'sketch' || e.buttons !== 1) {
        const dx = next[0]-previous[0], dy = next[1]-previous[1];
        if (e.buttons === 4 || e.buttons === 2 || e.shiftKey) this.camera.pan(dx, dy, this.canvas.clientHeight); else this.camera.orbit(dx, dy);
      }
      this.invalidate();
    }, {signal});
    const up = e => { if (pointers.has(e.pointerId) && pointers.size === 1 && !moved && down?.button === 0) { const [x, y] = local(e); this.onPick(this.interaction === 'sketch' ? null : this.pick(x, y), {x, y, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey}); } pointers.delete(e.pointerId); gesture = null; down = null; };
    this.canvas.addEventListener('pointerup', up, {signal}); this.canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; gesture = null; }, {signal});
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.camera.zoom(Math.exp(e.deltaY*.001)); const step = 10**Math.floor(Math.log10(this.camera.scale/6)); if (step !== this.gridStep) this.grid(); this.invalidate(); }, {passive: false, signal});
    this.canvas.addEventListener('dblclick', () => { if (this.interaction === 'orbit') this.fit(); }, {signal});
  }
  dispose() { this.disposed = true; this.ready = false; this.abort.abort(); this.observe.disconnect(); for (const e of this.items.values()) this.release(e); for (const e of this.lines.values()) this.release(e); this.depth?.destroy(); this.multisample?.destroy(); if (this.device) this.device.destroy(); else if (this.gl) this.gl.deleteProgram(this.program); }
}
