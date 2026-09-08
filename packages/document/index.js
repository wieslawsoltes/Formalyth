import {FeatureGraph} from './graph.js';
/** @module @formalyth/document — serializable feature graph, transactions and history. */
import * as k from '../kernel/index.js';
import {boolean, stitch} from '../kernel/csg.js';
import {m4, TAU, finite, integer} from '../math/index.js';
import {expression, parameters} from '../solver/index.js';
import {evaluateSketch} from '../sketch/constraints.js';
import {profileFrame} from '../construction/frames.js';
export const SCHEMA_VERSION = 1;
export function id(prefix) { const bytes = new Uint8Array(12); globalThis.crypto.getRandomValues(bytes); return `${prefix}-${Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('')}`; }
export function emptyDocument(name = 'Untitled design') {
  return {format: 'formalyth', version: SCHEMA_VERSION, id: id('doc'), name, units: 'mm', parameters: {}, features: [], manufacturing: {setups: [], operations: []}, drawings: [], board: null, metadata: {}};
}
export function validateDocument(data) {
  if (!data || data.format !== 'formalyth' || data.version !== SCHEMA_VERSION) throw new TypeError('Unsupported Formalyth document version');
  if (!Array.isArray(data.features) || data.features.length > 5000) throw new RangeError('Invalid feature collection');
  if (typeof data.name !== 'string' || data.name.length > 256 || data.units !== 'mm') throw new TypeError('Invalid document metadata');
  const ids = new Set();
  for (const f of data.features) {
    if (!f || typeof f.id !== 'string' || !/^[\w-]{1,80}$/.test(f.id) || ids.has(f.id)) throw new TypeError('Invalid or duplicate feature ID');
    ids.add(f.id);
    if (typeof f.type !== 'string' || !Array.isArray(f.inputs) || f.inputs.length > 512 || !f.params || typeof f.params !== 'object' || Array.isArray(f.params)) throw new TypeError(`Invalid feature: ${f.id}`);
  }
  for (const f of data.features) for (const input of f.inputs) if (!ids.has(input)) throw new ReferenceError(`Missing input ${input}`);
  parameters(data.parameters || {});
  new FeatureGraph(data.features); return data;
}
export class DesignDocument {
  constructor(data = emptyDocument(), {historyLimit = 100} = {}) {
    this.data = structuredClone(validateDocument(data)); this.revision = 0; this.historyLimit = historyLimit; this.past = []; this.future = []; this.listeners = new Set(); this.inTransaction = false;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(label) { this.revision++; for (const fn of this.listeners) fn({label, revision: this.revision, document: this}); }
  transact(label, mutate) {
    if (this.inTransaction) throw new Error('Nested document transaction');
    const before = structuredClone(this.data); this.inTransaction = true;
    try {
      const result = mutate(this.data); if (result && typeof result.then === 'function') throw new TypeError('Document transactions must be synchronous');
      validateDocument(this.data); this.past.push({data: before, label}); if (this.past.length > this.historyLimit) this.past.shift(); this.future = []; this.inTransaction = false; this.emit(label); return result;
    } catch (error) { this.data = before; this.inTransaction = false; throw error; }
  }
  addFeature(type, params = {}, inputs = [], name = type) {
    const feature = {id: id('f'), type, name, params: structuredClone(params), inputs: [...inputs], visible: null, suppressed: false, color: '#6497b2', material: 'aluminum'};
    this.transact(`Create ${name}`, data => data.features.push(feature)); return feature.id;
  }
  editFeature(featureId, patch) {
    this.transact('Edit feature', data => { const f = data.features.find(f => f.id === featureId); if (!f) throw new ReferenceError('Feature not found');
      for (const key of ['name', 'inputs', 'visible', 'suppressed', 'color', 'material']) if (Object.hasOwn(patch, key)) f[key] = structuredClone(patch[key]);
      if (patch.params) f.params = {...f.params, ...structuredClone(patch.params)};
    });
  }
  removeFeature(featureId, cascade = false) {
    if (!this.data.features.some(f => f.id === featureId)) throw new ReferenceError('Feature not found');
    const remove = new Set([featureId]); let changed = true;
    while (changed) { changed = false; for (const f of this.data.features) if (!remove.has(f.id) && f.inputs.some(i => remove.has(i))) { if (!cascade) throw new Error('Feature is used downstream; remove dependents explicitly'); remove.add(f.id); changed = true; } }
    this.transact('Delete features', data => { data.features = data.features.filter(f => !remove.has(f.id)); });
  }
  undo() { const entry = this.past.pop(); if (!entry) return false; this.future.push({data: this.data, label: entry.label}); this.data = entry.data; this.emit(`Undo ${entry.label}`); return true; }
  redo() { const entry = this.future.pop(); if (!entry) return false; this.past.push({data: this.data, label: entry.label}); this.data = entry.data; this.emit(`Redo ${entry.label}`); return true; }
  serialize() { return JSON.stringify(this.data, null, 2); }
  static parse(text) { if (typeof text !== 'string' || text.length > 100*1024*1024) throw new RangeError('Project file exceeds 100 MB'); return new DesignDocument(JSON.parse(text)); }
}
function referencedValues(params, values) {
  const used = new Set();
  const visit = value => { if (typeof value === 'string') { for (const name of value.match(/[A-Za-z_]\w*/g) || []) if (Object.hasOwn(values, name)) used.add(name); } else if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
  visit(params); return [...used].sort().map(name => [name, values[name]]);
}
const requireBody = value => { if (!value?.positions || !value?.indices) throw new TypeError('Feature requires a solid or mesh input'); return value; };
const requireProfile = value => { if (value?.kind !== 'profile') throw new TypeError('Feature requires a sketch profile'); return value; };
const radians = degrees => degrees*Math.PI/180;
export const featureRegistry = new Map();
export const featurePolicies = new Map();
export function registerFeature(type, evaluate, {consumeInputs = true} = {}) { if (featureRegistry.has(type)) throw new Error(`Feature already registered: ${type}`); if (typeof evaluate !== 'function') throw new TypeError('Feature evaluator must be a function'); featureRegistry.set(type, evaluate); featurePolicies.set(type, Object.freeze({consumeInputs: consumeInputs !== false})); }
function profilePlacement(body, profile) {
  return k.transform(body, profileFrame(profile));
}
const handlers = {
  box: ({n}) => k.box(n('width', 80), n('depth', 50), n('height', 10), n('radius', 0)),
  cylinder: ({n}) => k.cylinder(n('radius', 20), n('height', 30), n('segments', 64)),
  cone: ({n}) => k.cone(n('radius', 20), n('topRadius', 10), n('height', 30), n('segments', 64)),
  sphere: ({n}) => k.sphere(n('radius', 20), n('segments', 48)),
  torus: ({n}) => k.torus(n('majorRadius', 25), n('minorRadius', 5), n('segments', 64)),
  sketch: ({p, n, numeric, parameters: values, inputs}) => {
    let points, report = null;
    if (p.shape === 'circle') points = k.circle(n('radius', 20), n('segments', 64), [n('x', 0), n('y', 0)]);
    else if (p.shape === 'ellipse') points = k.ellipse(n('rx', 30), n('ry', 15), n('segments', 64));
    else if (p.shape === 'rectangle') points = k.rectangle(n('width', 50), n('depth', 30), n('radius', 0)).map(([x, y]) => [x+n('x', 0), y+n('y', 0)]);
    else { const sketch = {points: numeric(p.points || []), constraints: p.constraints || [], circles: p.circles || []}; report = evaluateSketch(sketch, values);
      if (!report.converged) throw new Error(`Sketch constraints inconsistent (residual ${report.residual.toPrecision(3)})`);
      points = report.sketch.points;
      if (p.useCircle !== undefined) { const c = report.sketch.circles[p.useCircle]; if (!c) throw new Error('Sketch circle not found'); points = k.circle(c.radius, n('segments', 64), report.sketch.points[c.center]); }
    }
    return {kind: 'profile', points: k.cleanProfile(points), plane: p.plane || 'XY', z: n('z', 0), report, ...(inputs[0]?.kind==='plane'?{frame:inputs[0].frame}:p.frame?{frame:profileFrame(p)}:{})};
  },
  extrude: ({p, n, inputs}) => { const profile = requireProfile(inputs[0]); return profilePlacement(k.extrude(profile.points, n('depth', 20), {topScale: n('topScale', 1), twist: radians(n('twist', 0)), steps: n('steps', 1)}), profile); },
  revolve: ({n, inputs}) => k.revolve(requireProfile(inputs[0]).points, radians(n('angle', 360)), n('segments', 64)),
  loft: ({p, n, numeric, inputs}) => k.loft(inputs.length ? inputs.map((input, i) => ({profile: requireProfile(input).points, z: p.heights ? numeric(p.heights)[i] : input.z})) : numeric(p.sections), n('samples', 64)),
  sweep: ({p, numeric, inputs}) => k.sweep(requireProfile(inputs[0]).points, numeric(p.path)),
  helix: ({n}) => k.sweep(k.circle(n('tubeRadius', 1.5), 12), k.helix(n('radius', 15), n('pitch', 6), n('turns', 4), n('segments', 192))),
  boolean: ({p, n, inputs}) => boolean(requireBody(inputs[0]), requireBody(inputs[1]), p.operation || 'union', n('tolerance', 1e-6)),
  move: ({n, inputs}) => {
    let matrix = m4.scaling(n('scale', 1));
    for (const [axis, key] of [[[1, 0, 0], 'rx'], [[0, 1, 0], 'ry'], [[0, 0, 1], 'rz']]) matrix = m4.multiply(m4.rotation(axis, radians(n(key, 0))), matrix);
    return k.transform(requireBody(inputs[0]), m4.multiply(m4.translation(n('x', 0), n('y', 0), n('z', 0)), matrix));
  },
  mirror: ({p, inputs}) => { if (!['X', 'Y', 'Z'].includes(p.axis)) throw new TypeError('Mirror axis must be X, Y, or Z'); return k.transform(requireBody(inputs[0]), m4.scaling(...['X', 'Y', 'Z'].map(a => a === p.axis ? -1 : 1))); },
  pattern: ({p, n, inputs}) => k.pattern(requireBody(inputs[0]), n('count', 3), p.circular ? radians(n('angle', 90)) : [n('x', 30), n('y', 0), n('z', 0)], !!p.circular),
  holes: ({p, n, numeric, inputs}) => {
    const body = requireBody(inputs[0]), box = k.meshBounds(body), top = box.max[2]+.01, depth = p.through !== false ? box.size[2]+.02 : n('depth', 5)+.01;
    const positions = p.centers ? numeric(p.centers) : [[n('x', 0), n('y', 0)]];
    if (positions.length > 128) throw new RangeError('At most 128 holes per feature');
    const tools = positions.map(([x, y]) => k.transform(k.cylinder(n('radius', 4), depth, n('segments', 48)), m4.translation(x, y, top-depth)));
    return boolean(body, k.merge(tools), 'subtract');
  },
  pocket: ({n, inputs}) => {
    const body = requireBody(inputs[0]), top = k.meshBounds(body).max[2];
    const tool = k.transform(k.box(n('width', 30), n('depth', 20), n('cutDepth', 5)+.01, n('radius', 2)), m4.translation(n('x', 0), n('y', 0), top-n('cutDepth', 5)));
    return boolean(body, tool, 'subtract');
  },
  tube: ({n}) => { const r = n('radius', 20), t = n('thickness', 2), h = n('height', 30); if (t <= 0 || t >= r) throw new RangeError('Tube wall thickness exceeds radius'); return boolean(k.cylinder(r, h), k.transform(k.cylinder(r-t, h+.02), m4.translation(0, 0, -.01)), 'subtract'); },
  shellBox: ({n}) => {
    const w = n('width', 60), d = n('depth', 40), h = n('height', 30), t = n('thickness', 2);
    if (t <= 0 || t*2 >= Math.min(w, d) || t >= h) throw new RangeError('Shell thickness is invalid');
    return boolean(k.box(w, d, h), k.transform(k.box(w-2*t, d-2*t, h-t+.01), m4.translation(0, 0, t)), 'subtract');
  },
  mesh: ({p}) => { if (p.positions.length > 9000000 || p.indices.length > 9000000) throw new RangeError('Imported mesh exceeds document budget'); return k.mesh(p.positions, p.indices, {kind: 'imported'}); },
  subdivide: ({n, inputs}) => k.subdivide(requireBody(inputs[0]), n('iterations', 1)),
  smooth: ({n, inputs}) => k.smooth(requireBody(inputs[0]), n('iterations', 2), n('strength', .2)),
  simplify: ({n, inputs}) => k.simplify(requireBody(inputs[0]), n('cellSize', 1)),
  stitch: ({n, inputs}) => stitch(requireBody(inputs[0]), n('tolerance', 1e-6)),
  surface: ({p, n, numeric}) => {
    const grid = numeric(p.grid), degreeU = n('degreeU', Math.min(3, grid[0].length-1)), degreeV = n('degreeV', Math.min(3, grid.length-1));
    return k.tessellateSurface((u, v) => k.nurbsSurface(grid, degreeU, degreeV, p.knotsU || k.clampedKnots(grid[0].length, degreeU), p.knotsV || k.clampedKnots(grid.length, degreeV), p.weights, u, v), n('steps', 32), n('steps', 32));
  }
};
for (const [type, handler] of Object.entries(handlers)) registerFeature(type, handler);
export class FeatureEvaluator {
  constructor() { this.cache = new Map(); this.sequence = 0; }
  clear() { this.cache.clear(); }
  evaluate(data, {upto = data.features.length} = {}) {
    const start=performance.now();
    if(!Number.isInteger(upto)||upto<0||upto>data.features.length)throw new RangeError('Invalid history position');
    const values=parameters(data.parameters),features=data.features.slice(0,upto),graph=new FeatureGraph(features,{allowMissing:true});
    const outputs=new Map(),failures=new Map(),consumed=new Set();let computed=0,reused=0;
    for(const featureId of graph.order){
      const f=graph.byId.get(featureId);
      try{
        const inputs=f.inputs.map(id=>{
          if(!graph.byId.has(id))throw new Error(`Input ${id} is unavailable at this timeline position`);
          if(failures.has(id))throw new Error(`Input ${id} failed: ${failures.get(id).message}`);
          return outputs.get(id);
        });
        const key=JSON.stringify([f.type,f.params,f.suppressed,referencedValues(f.params,values),f.inputs.map(id=>[id,this.cache.get(id)?.version])]),cached=this.cache.get(f.id);
        let result;
        if(cached?.key===key){result=cached.result;reused++;}
        else{
          const handler=featureRegistry.get(f.type);if(!handler)throw new TypeError(`Unsupported feature: ${f.type}`);
          const n=(key,fallback)=>expression(f.params[key]??fallback,values);
          const numeric=value=>Array.isArray(value)?value.map(numeric):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,numeric(v)])):expression(value,values);
          result=f.suppressed?inputs[0]||null:handler({p:f.params,n,numeric,inputs,parameters:values});
          this.cache.set(f.id,{key,result,version:++this.sequence});computed++;
        }
        outputs.set(f.id,result);
        if(!f.suppressed&&featurePolicies.get(f.type)?.consumeInputs!==false)for(const input of f.inputs){
          let id=input;consumed.add(id);
          // Suppression is a pass-through, not a second coincident display body.
          while(graph.byId.get(id)?.suppressed&&graph.byId.get(id).inputs.length){id=graph.byId.get(id).inputs[0];consumed.add(id);}
        }
      }catch(error){failures.set(f.id,{id:f.id,name:f.name,message:error.message,code:error.code||'FEATURE_EVALUATION'});}
    }
    const allIds=new Set(data.features.map(f=>f.id));for(const key of this.cache.keys())if(!allIds.has(key))this.cache.delete(key);
    const scene=features.filter(f=>!f.suppressed&&outputs.get(f.id)&&f.visible!==false&&(f.visible===true||!consumed.has(f.id))).map(f=>({id:f.id,name:f.name,color:f.color,material:f.material,value:outputs.get(f.id)}));
    return {scene,outputs,errors:features.filter(f=>failures.has(f.id)).map(f=>failures.get(f.id)),parameters:values,
      stats:{computed,reused,milliseconds:performance.now()-start,cachedFeatures:this.cache.size,graphVertices:graph.byId.size}};
  }
}
