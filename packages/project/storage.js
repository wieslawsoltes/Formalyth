/** Atomic IndexedDB snapshots with optimistic concurrency across browser tabs. */
import {Project} from './index.js';
export class StorageConflictError extends Error{
  constructor(id){super(`Project ${id} changed in another tab. Reload it or export a native backup before continuing.`);this.name='StorageConflictError';this.code='PROJECT_CONFLICT';}
}
export class ProjectStorage{
  constructor(name='formalyth-unified-projects'){this.name=name;this.pending=Promise.resolve();this.versions=new Map();this.opening=null;}
  open(){
    if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      let settled=false;const request=indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects',{keyPath:'id'});};
      const fail=error=>{if(!settled){settled=true;this.opening=null;reject(error);}};
      request.onerror=()=>fail(request.error);request.onblocked=()=>fail(new Error('Project database is blocked by another tab'));
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();this.opening=null;};resolve(db);};
    });return this.opening;
  }
  enqueue(action){const operation=this.pending.catch(()=>{}).then(action);this.pending=operation;return operation;}
  async read(action){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly');let request;try{request=action(tx.objectStore('projects'));}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error||new Error('Storage read aborted'));tx.onerror=()=>reject(tx.error);});}
  async write(id,record,expectedVersion){
    if(typeof id!=='string'||!id)throw new TypeError('Storage ID must be a nonempty string');
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');let conflict=null,version=null;
      const request=store.get(id);request.onsuccess=()=>{
        const current=request.result,actual=current?(current.version??0):null;
        const expected=expectedVersion===undefined?(this.versions.get(id)??null):expectedVersion;
        if(expected!==actual){conflict=new StorageConflictError(id);tx.abort();return;}
        if(record===null)store.delete(id);else{version=(actual??0)+1;store.put({...record,id,version});}
      };
      tx.oncomplete=()=>{this.versions.set(id,version);resolve(version);};
      tx.onabort=()=>reject(conflict||tx.error||new Error('Storage write aborted'));tx.onerror=()=>reject(conflict||tx.error);
    });
  }
  save(id,project,{expectedVersion}={}){
    const record={name:project.data.name,updated:Date.now(),text:project.serialize()};
    return this.enqueue(()=>this.write(id,record,expectedVersion));
  }
  load(id){return this.enqueue(async()=>{const row=await this.read(store=>store.get(id));const project=row?Project.parse(row.text):null;this.versions.set(id,row?(row.version??0):null);return project;});}
  list(){return this.enqueue(async()=>{const rows=await this.read(store=>store.getAll());return rows.map(({text,...row})=>row).sort((a,b)=>b.updated-a.updated);});}
  remove(id,{expectedVersion}={}){return this.enqueue(()=>this.write(id,null,expectedVersion));}
  async close(){await this.pending.catch(()=>{});if(this.opening){const db=await this.opening;db.close();this.opening=null;}}
}
