/** Browser-only persistence adapter. Core document and kernel remain platform independent. */
export class ProjectStore {
  async open() {
    if (this.database) return this.database;
    this.database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('formalyth-projects', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('projects', {keyPath: 'id'}); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); return this.database;
  }
  async operation(mode, action) {
    const db = await this.open(); return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', mode), request = action(transaction.objectStore('projects')); let value;
      request.onsuccess = () => { value = request.result; }; request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(value); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
    });
  }
  save(data) { return this.operation('readwrite', store => store.put({id: data.id, name: data.name, updated: new Date().toISOString(), data: structuredClone(data)})); }
  async list() { return (await this.operation('readonly', store => store.getAll())).map(({id, name, updated}) => ({id, name, updated})).sort((a, b) => b.updated.localeCompare(a.updated)); }
  async load(id) { return (await this.operation('readonly', store => store.get(id)))?.data || null; }
  remove(id) { return this.operation('readwrite', store => store.delete(id)); }
  close() { this.database?.close(); this.database = null; }
}
