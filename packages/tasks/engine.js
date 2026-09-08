/** DOM-free task dispatch for the browser worker and Node integration tests. */
import {m4} from '../math/index.js';
import {profileFrame} from '../construction/frames.js';
import {FeatureEvaluator, validateDocument} from '../document/index.js';
import {prepareMesh} from '../renderer/prepare.js';
import {meshBounds, massProperties, topology, rectangle} from '../kernel/index.js';
import {evaluateSketch} from '../sketch/constraints.js';
import {installConstructionFeatures} from '../construction/index.js';
import {installRegionFeatures} from '../regions/index.js';
import {createToolpath, postProcess, simulateStock, nestRectangles} from '../manufacturing/index.js';
import {sliceMesh, postAdditive} from '../manufacturing/additive.js';
import {voxelTetrahedralize, solveElasticity, solveThermal, planeConstraints, surfaceLoad, deformationMesh} from '../analysis/index.js';
import {createDrawing} from '../drawing/index.js';
import {foldedStrip} from '../sheet/index.js';
import {evaluateAssembly, billOfMaterials, interference} from '../assembly/index.js';
import {solveCircuit, transient, acSweep} from '../electronics/index.js';
import {importGeometry, exportGeometry} from '../exchange/index.js';

installRegionFeatures();installConstructionFeatures();
export class Engine {
  constructor() { this.evaluator = new FeatureEvaluator(); this.sent = new Map(); this.epoch = crypto.randomUUID(); }
  evaluate({document, upto = document.features.length, reset = false}) {
    validateDocument(document);
    if (!Number.isInteger(upto) || upto < 0 || upto > document.features.length) throw new RangeError('Invalid history position');
    if (reset) { this.evaluator.clear(); this.sent.clear(); this.epoch = crypto.randomUUID(); }
    const result = this.evaluator.evaluate(document, {upto}), changes = [], removed = [];
    const ids = new Set(document.features.map(f => f.id));
    for (const id of this.sent.keys()) if (!ids.has(id)) { this.sent.delete(id); removed.push(id); }
    for (const [id, value] of result.outputs) {
      const version = `${this.epoch}:${this.evaluator.cache.get(id)?.version}`;
      if (this.sent.get(id) !== version) {
        changes.push({id, value, version, ...(value?.positions ? {prepared: prepareMesh(value)} : {})});
        this.sent.set(id, version);
      }
    }
    return {scene: result.scene.map(({value, ...item}) => ({...item, version: this.sent.get(item.id)})), changes, removed,
      available: [...result.outputs.keys()], errors: result.errors, parameters: result.parameters, stats: {...result.stats, changedOutputs: changes.length}};
  }
  dispatch(type, payload) {
    switch (type) {
      case 'solveSketch': return evaluateSketch(payload.sketch,payload.parameters||{},payload.options);
      case 'evaluate': return this.evaluate(payload);
      case 'inspect': return {bounds: meshBounds(payload.body), properties: massProperties(payload.body), topology: topology(payload.body)};
      case 'machining': {
        const settings = {...payload.settings}; let geometry = payload.geometry;
        if (settings.strategy !== 'parallel' && settings.strategy !== 'drill') {
          if (geometry?.kind==='region'||geometry?.kind==='profile') {
            const frame=profileFrame(geometry);
            if(Math.abs(frame[8])>1e-8||Math.abs(frame[9])>1e-8)throw new TypeError('Three-axis machining requires a world-XY sketch; reorient the setup explicitly');
            const map=loop=>loop.map(p=>m4.point(frame,[...p,0]).slice(0,2));
            geometry=geometry.kind==='profile'?{...geometry,points:map(geometry.points)}:{...geometry,regions:geometry.regions.map(r=>({...r,outer:map(r.outer),holes:r.holes.map(map)}))};
          }
          if (geometry?.kind === 'region') {
            if (geometry.regions.length !== 1) throw new RangeError('Machining requires one exterior region; split disjoint regions into operations');
            settings.islands = geometry.regions[0].holes; geometry = geometry.regions[0].outer;
          } else if (geometry?.kind === 'profile') geometry = geometry.points;
          else if (geometry?.positions) {
            if (!payload.allowBoundingProfile) throw new TypeError('Choose a sketch region or explicitly enable the rectangular body-bounds profile');
            const b = meshBounds(geometry); geometry = rectangle(b.size[0], b.size[1]).map(([x,y]) => [x+b.center[0],y+b.center[1]]);
          }
        }
        return createToolpath(settings, geometry);
      }
      case 'postMill': return postProcess(payload.path);
      case 'stock': return simulateStock(payload.path, payload.options);
      case 'slice': return sliceMesh(payload.body, payload.options);
      case 'postPrint': return postAdditive(payload.slice, payload.options);
      case 'nest': return nestRectangles(payload.parts, payload.options);
      case 'draw': return createDrawing(payload.bodies, payload.options);
      case 'sheet': return foldedStrip(payload.options);
      case 'assembly': return {...evaluateAssembly(payload.assembly), bom: billOfMaterials(payload.assembly)};
      case 'interference': return interference(payload.assembly, new Map(payload.bodies), payload.options);
      case 'elastic': case 'thermal': {
        const options = payload.options || {}, model = voxelTetrahedralize(payload.body, {resolution: options.resolution ?? 5});
        const axis = options.axis ?? 0;
        if (![0,1,2].includes(axis)) throw new TypeError('Analysis axis must be 0, 1 or 2');
        const coordinates = model.nodes.map(p => p[axis]), lo = Math.min(...coordinates), hi = Math.max(...coordinates);
        let result;
        if (type === 'elastic') {
          const force = [0,0,0]; force[axis] = options.force ?? 100;
          result = solveElasticity(model, {young: options.young ?? 70000, poisson: options.poisson ?? .33,
            fixed: planeConstraints(model, axis, lo), loads: surfaceLoad(model, axis, hi, force)});
        } else {
          const fixed = model.nodes.flatMap((p,node) => Math.abs(p[axis]-lo)<1e-7 ? [{node,temperature:options.left ?? 100}] : Math.abs(p[axis]-hi)<1e-7 ? [{node,temperature:options.right ?? 20}] : []);
          result = solveThermal(model, {conductivity: options.conductivity ?? .2, fixed});
        }
        const body = deformationMesh(model, result, {scale: type === 'elastic' ? options.scale ?? 100 : 0});
        return {result, body, prepared: prepareMesh(body), mesh: {nodes:model.nodes.length, elements:model.elements.length, approximation:model.approximation},
          boundaryConditions:{axis,fixedPlane:lo,loadedPlane:hi},warning:'Approximate voxel mesh. Boundary planes and convergence must be reviewed. Not a design safety approval.'};
      }
      case 'circuit': {
        if (payload.mode === 'ac') return acSweep(payload.circuit, payload.options);
        if (payload.mode === 'transient') return transient(payload.circuit, payload.options);
        return solveCircuit(payload.circuit);
      }
      case 'import': return importGeometry(payload.data, payload.extension, payload.options);
      case 'export': return exportGeometry(payload.entries, payload.extension, payload.options);
      default: throw new TypeError(`Unknown engine task: ${type}`);
    }
  }
}
