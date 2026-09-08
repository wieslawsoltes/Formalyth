/** Unified, versioned project state. No DOM, kernel, or framework dependency. */
export const PROJECT_VERSION = 2;
export const COLLECTIONS = Object.freeze({
  assembly: ['components', 'joints'], manufacturing: ['setups', 'operations'],
  additive: ['jobs'], sheet: ['plans'], analysis: ['studies'],
  drawings: ['sheets'], electronics: ['boards', 'circuits']
});
const uid = () => globalThis.crypto.randomUUID();
const clone = value => structuredClone(value);
const plain = v => !!v && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);

function checkJSON(value, depth = 0, budget = {nodes: 0}, seen = new Set()) {
  if (++budget.nodes > 16000000 || depth > 64) throw new RangeError('Project structure exceeds resource budget');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!Array.isArray(value) && !plain(value)) throw new TypeError('Project data must contain finite JSON values');
  if (seen.has(value)) throw new TypeError('Cyclic project data');
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new TypeError(`Forbidden project key: ${key}`);
    checkJSON(child, depth + 1, budget, seen);
  }
  seen.delete(value);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function modelSignature(model) {
  return JSON.stringify([model.parameters, model.features.map(f => [f.id, f.type, f.params, f.inputs, !!f.suppressed])]);
}
export function createProject(name = 'Untitled design', model = null) {
  const workspaces = {};
  for (const [domain, collections] of Object.entries(COLLECTIONS)) {
    workspaces[domain] = {settings: {}};
    for (const key of collections) workspaces[domain][key] = [];
  }
  return {format: 'formalyth-project', version: PROJECT_VERSION, id: uid(), name,
    geometryVersion: uid(), model: model ?? {format: 'formalyth', version: 1, id: uid(), name,
      units: 'mm', parameters: {}, features: [], manufacturing: {setups: [], operations: []}, drawings: [], board: null, metadata: {}},
    workspaces, view: {workspace: 'Design', theme: 'light', timeline: null}, extensions: {}};
}
export function migrateProject(input) {
  const data = clone(input);
  if (data?.format === 'formalyth-project' && data.version === PROJECT_VERSION) return data;
  if (data?.format !== 'formalyth' || data.version !== 1) throw new TypeError('Unsupported project format or version');
  const project = createProject(data.name, data);
  project.workspaces.manufacturing.setups = data.manufacturing?.setups ?? [];
  project.workspaces.manufacturing.operations = data.manufacturing?.operations ?? [];
  project.workspaces.drawings.sheets = data.drawings ?? [];
  if (data.board) project.workspaces.electronics.boards.push(data.board);
  // Legacy outputs have no reliable source revision; consider them stale until regenerated.
  for (const [domain, keys] of Object.entries(COLLECTIONS)) for (const key of keys) {
    project.workspaces[domain][key] = project.workspaces[domain][key].map(record => ({...record, id: record.id || uid()}));
  }
  data.manufacturing = {setups: [], operations: []}; data.drawings = []; data.board = null;
  return project;
}
export function validateProject(data) {
  checkJSON(data);
  if (data.format !== 'formalyth-project' || data.version !== PROJECT_VERSION) throw new TypeError('Unsupported project version');
  if (typeof data.id !== 'string' || !data.id || typeof data.geometryVersion !== 'string') throw new TypeError('Invalid project identity');
  if (typeof data.name !== 'string' || data.name.length > 256) throw new TypeError('Invalid project name');
  const m = data.model;
  if (!plain(m) || m.format !== 'formalyth' || m.version !== 1 || m.units !== 'mm' || !plain(m.parameters)) throw new TypeError('Invalid modeling document');
  if (!Array.isArray(m.features) || m.features.length > 5000) throw new RangeError('Invalid feature collection');
  const ids = new Set(), complete = new Set();
  for (const f of m.features) {
    if (!plain(f) || typeof f.id !== 'string' || !f.id || ids.has(f.id) || typeof f.type !== 'string' || !plain(f.params) || !Array.isArray(f.inputs)) throw new TypeError('Invalid or duplicate feature');
    ids.add(f.id);
  }
  const remaining = new Map(m.features.map(f => [f.id, f]));
  for (const f of m.features) for (const id of f.inputs) if (!ids.has(id)) throw new ReferenceError(`Missing feature input: ${id}`);
  while (remaining.size) {
    let progress = false;
    for (const [id, f] of remaining) if (f.inputs.every(i => complete.has(i))) { complete.add(id); remaining.delete(id); progress = true; }
    if (!progress) throw new RangeError('Cyclic feature dependency');
  }
  if (!plain(data.workspaces) || !plain(data.view) || !plain(data.extensions)) throw new TypeError('Missing project domains');
  for (const [domain, keys] of Object.entries(COLLECTIONS)) {
    const workspace = data.workspaces[domain];
    if (!plain(workspace) || !plain(workspace.settings)) throw new TypeError(`Invalid workspace: ${domain}`);
    for (const key of keys) {
      const list = workspace[key];
      if (!Array.isArray(list) || list.length > 10000) throw new RangeError(`Invalid collection: ${domain}.${key}`);
      const recordIds = new Set();
      for (const record of list) {
        if (!plain(record) || typeof record.id !== 'string' || !record.id || recordIds.has(record.id)) throw new TypeError(`Invalid or duplicate record: ${domain}.${key}`);
        recordIds.add(record.id);
        if (record.bodyIds !== undefined && (!Array.isArray(record.bodyIds) || record.bodyIds.some(id => typeof id !== 'string'))) throw new TypeError('Invalid linked body identifiers');
      }
    }
  }
  return data;
}

export class Project {
  #data; #text; #past = []; #future = []; #listeners = new Set(); #editing = false;
  constructor(data = createProject(), {historyLimit = 50, historyBytes = 32 * 1024 * 1024, maxBytes = 100 * 1024 * 1024} = {}) {
    if (!Number.isInteger(historyLimit) || historyLimit < 0 || historyLimit > 1000 || !Number.isFinite(historyBytes) || historyBytes < 0 || !Number.isFinite(maxBytes) || maxBytes < 1) throw new RangeError('Invalid project limits');
    this.limits = Object.freeze({historyLimit, historyBytes, maxBytes}); this.revision = 0;
    this.#install(validateProject(migrateProject(data)));
  }
  #install(data) {
    const text = JSON.stringify(data);
    if (new TextEncoder().encode(text).byteLength > this.limits.maxBytes) throw new RangeError('Project exceeds size limit');
    this.#data = freeze(data); this.#text = text;
  }
  get data() { return this.#data; }
  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }
  get historySize() { return this.#past.length; }
  snapshot() { return clone(this.#data); }
  serialize() { return this.#text; }
  subscribe(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #emit(label) {
    this.revision++;
    // A UI observer cannot roll back an already committed domain transaction.
    for (const fn of this.#listeners) { try { fn({label, revision: this.revision, project: this}); } catch (error) { console.error('Project observer failed', error); } }
  }
  #trim() {
    let bytes = this.#past.reduce((n, entry) => n + entry.text.length * 2, 0);
    while (this.#past.length && (this.#past.length > this.limits.historyLimit || bytes > this.limits.historyBytes)) bytes -= this.#past.shift().text.length * 2;
  }
  transact(label, mutate) {
    if (this.#editing) throw new Error('Nested project transaction');
    if (typeof mutate !== 'function') throw new TypeError('Expected synchronous mutation function');
    this.#editing = true;
    try {
      const draft = clone(this.#data), result = mutate(draft);
      if (result && typeof result.then === 'function') throw new TypeError('Transactions must be synchronous');
      validateProject(draft);
      if (modelSignature(draft.model) !== modelSignature(this.#data.model)) draft.geometryVersion = uid();
      else draft.geometryVersion = this.#data.geometryVersion;
      const text = JSON.stringify(draft);
      if (text === this.#text) return result;
      const before = {data: this.#data, text: this.#text, label};
      this.#install(draft); this.#past.push(before); this.#trim(); this.#future = [];
      this.#editing = false; this.#emit(label); return result;
    } finally { this.#editing = false; }
  }
  updateView(patch) {
    if (this.#editing || !plain(patch)) throw new TypeError('Invalid view update');
    checkJSON(patch);
    const next = {...this.#data, view: {...this.#data.view, ...clone(patch)}};
    validateProject(next); this.#install(next); this.#emit('View');
  }
  undo() {
    if (this.#editing) throw new Error('History change during transaction');
    const previous = this.#past.pop(); if (!previous) return false;
    this.#future.push({data: this.#data, text: this.#text, label: previous.label});
    this.#data = previous.data; this.#text = previous.text; this.#emit(`Undo ${previous.label}`); return true;
  }
  redo() {
    if (this.#editing) throw new Error('History change during transaction');
    const next = this.#future.pop(); if (!next) return false;
    this.#past.push({data: this.#data, text: this.#text, label: next.label}); this.#trim();
    this.#data = next.data; this.#text = next.text; this.#emit(`Redo ${next.label}`); return true;
  }
  put(domain, collection, record, {linked = false} = {}) {
    if (!COLLECTIONS[domain]?.includes(collection)) throw new ReferenceError('Unknown workspace collection');
    const item = {...clone(record), id: record.id || uid()};
    if (linked) item.sourceVersion = this.#data.geometryVersion;
    this.transact(`Save ${domain} ${collection}`, draft => {
      const list = draft.workspaces[domain][collection], i = list.findIndex(x => x.id === item.id);
      if (i < 0) list.push(item); else list[i] = item;
    });
    return item.id;
  }
  isStale(record) {
    return record.sourceVersion !== this.#data.geometryVersion || (record.bodyIds || []).some(id => !this.#data.model.features.some(f => f.id === id));
  }
  static parse(text, options = {}) {
    if (typeof text !== 'string' || text.length > (options.maxBytes ?? 100 * 1024 * 1024)) throw new RangeError('Project text exceeds limit');
    return new Project(JSON.parse(text), options);
  }
}
