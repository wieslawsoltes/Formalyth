/** IndexedDB transactions atomically replace complete, versioned project snapshots. */
import {Project} from './index.js';
export class ProjectStorage {
  constructor(name = 'formalyth-unified-projects') { this.name = name; this.pending = Promise.resolve(); }
  open() {
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', {keyPath: 'id'});
      request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();this.opening=null;}; resolve(db); };
      request.onerror = () => { this.opening=null; reject(request.error); };
      request.onblocked = () => { this.opening=null; reject(new Error('Project database is blocked by another tab')); };
    }); return this.opening;
  }
  async transaction(mode, action) {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx=db.transaction('projects',mode),request=action(tx.objectStore('projects'));
      tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Storage transaction aborted'));
    });
  }
  save(id, project) {
    const record={id,name:project.data.name,updated:Date.now(),text:project.serialize()};
    this.pending=this.pending.catch(()=>{}).then(()=>this.transaction('readwrite',s=>s.put(record)));
    return this.pending;
  }
  async load(id) { await this.pending.catch(()=>{}); const r=await this.transaction('readonly',s=>s.get(id));return r?Project.parse(r.text):null; }
  async list() { const rows=await this.transaction('readonly',s=>s.getAll());return rows.map(({text,...row})=>row).sort((a,b)=>b.updated-a.updated); }
  remove(id) { return this.transaction('readwrite',s=>s.delete(id)); }
}
