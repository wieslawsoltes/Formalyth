/** Indexed feature dependencies and validated edits. Pure data; no DOM or kernel. */
export class FeatureGraph {
  constructor(features, {allowMissing = false} = {}) {
    if (!Array.isArray(features) || features.length > 5000) throw new RangeError('Invalid feature collection');
    this.features = features; this.byId = new Map(); this.children = new Map(); this.index = new Map();
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (!f || typeof f.id !== 'string' || this.byId.has(f.id) || !Array.isArray(f.inputs) || f.inputs.length > 512) throw new TypeError('Invalid or duplicate feature');
      this.byId.set(f.id, f); this.children.set(f.id, new Set()); this.index.set(f.id, i);
    }
    for (const f of features) for (const id of f.inputs) {
      if (!this.byId.has(id)) { if (allowMissing) continue; throw new ReferenceError(`Missing input ${id}`); }
      this.children.get(id).add(f.id);
    }
    // An explicit DFS stack keeps even a 5,000-feature chain off the JS call stack.
    const state = new Map(); this.order = [];
    for (const f of features) {
      if (state.get(f.id) === 2) continue;
      const stack = [{id:f.id, next:0}]; state.set(f.id, 1);
      while (stack.length) {
        const entry = stack.at(-1), node = this.byId.get(entry.id);
        if (entry.next < node.inputs.length) {
          const id = node.inputs[entry.next++];
          if (!this.byId.has(id)) continue;
          if (state.get(id) === 1) throw new RangeError('Cyclic feature dependency');
          if (state.get(id) !== 2) { state.set(id, 1); stack.push({id, next:0}); }
        } else { state.set(entry.id, 2); this.order.push(entry.id); stack.pop(); }
      }
    }
  }
  dependents(ids, {includeSeeds = false} = {}) { return this.walk(ids, false, includeSeeds); }
  ancestors(ids, {includeSeeds = false} = {}) { return this.walk(ids, true, includeSeeds); }
  walk(ids, upstream, includeSeeds) {
    const seeds = new Set(typeof ids === 'string' ? [ids] : ids), found = new Set(), queue = [...seeds];
    for (const id of seeds) if (!this.byId.has(id)) throw new ReferenceError(`Feature not found: ${id}`);
    for (let i=0; i<queue.length; i++) {
      const id=queue[i]; for (const next of upstream ? this.byId.get(id).inputs : this.children.get(id)) if (!found.has(next)) { found.add(next); queue.push(next); }
    }
    if (includeSeeds) for (const id of seeds) found.add(id); else for (const id of seeds) found.delete(id);
    return this.features.filter(f=>found.has(f.id)).map(f=>f.id);
  }
  reorder(id, to) {
    if (!this.byId.has(id)) throw new ReferenceError('Feature not found');
    if (!Number.isInteger(to) || to < 0 || to >= this.features.length) throw new RangeError('Invalid history position');
    const result = this.features.slice(), [item] = result.splice(this.index.get(id), 1); result.splice(to, 0, item);
    const indices = new Map(result.map((f,i)=>[f.id,i]));
    for (const f of result) for (const input of f.inputs) if (indices.get(input)>=indices.get(f.id)) throw new RangeError('Cannot move a feature before its inputs or after its dependents');
    return result;
  }
}
const allowed = new Set(['name','inputs','visible','suppressed','color','material','params']);
/** Edits are applied to a copy. Call validateDocument before committing the result. */
export function editModel(model, edits) {
  if (!Array.isArray(edits) || edits.length > 5000) throw new RangeError('Invalid edit batch');
  const draft = structuredClone(model);
  let byId = new Map(draft.features.map(f=>[f.id,f]));
  for (const op of edits) {
    if (!op || typeof op !== 'object') throw new TypeError('Invalid model edit');

    if (op.action === 'add') {
      if (!op.feature || byId.has(op.feature.id)) throw new TypeError('New feature ID must be unique');
      const feature=structuredClone(op.feature); draft.features.push(feature); byId.set(feature.id,feature);
    } else if (op.action === 'update') {
      const f = byId.get(op.id); if (!f) throw new ReferenceError('Feature not found');
      if (!op.patch || typeof op.patch !== 'object' || Array.isArray(op.patch)) throw new TypeError('Invalid feature patch');
      for (const [key,value] of Object.entries(op.patch)) {
        if (!allowed.has(key)) throw new TypeError(`Feature property cannot be edited: ${key}`);
        if (key==='params') {
          if (!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError('Invalid feature parameters');
          f.params = {...f.params, ...structuredClone(value)};
        } else f[key] = structuredClone(value);
      }
    } else if (op.action === 'delete') {
      if (!byId.has(op.id)) throw new ReferenceError('Feature not found');
      const downstream=new FeatureGraph(draft.features).dependents(op.id);
      if (downstream.length && !op.cascade) throw new RangeError(`Feature has ${downstream.length} dependent feature(s); confirm cascade deletion`);
      const remove=new Set([op.id,...downstream]); draft.features=draft.features.filter(f=>!remove.has(f.id)); for(const id of remove)byId.delete(id);
    } else if (op.action === 'reorder') draft.features=new FeatureGraph(draft.features).reorder(op.id,op.to);
    else if (op.action === 'parameters') draft.parameters=structuredClone(op.values);
    else if (op.action === 'rename') draft.name=op.name;
    else throw new TypeError(`Unknown model edit: ${op.action}`);
  }
  new FeatureGraph(draft.features); return draft;
}
