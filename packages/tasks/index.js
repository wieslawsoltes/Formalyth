/** Bounded worker queue with hard cancellation and latest-request coalescing. */
const abortError = message => new DOMException(message || 'Task cancelled', 'AbortError');
export class TaskRunner {
  constructor(factory, {maxQueue = 8, timeout = 120000} = {}) {
    if (typeof factory !== 'function' || !Number.isInteger(maxQueue) || maxQueue < 1 || !Number.isFinite(timeout) || timeout <= 0) throw new TypeError('Invalid worker queue configuration');
    this.factory = factory; this.maxQueue = maxQueue; this.timeout = timeout;
    this.queue = []; this.active = null; this.worker = null; this.nextId = 0; this.closed = false;
  }
  run(type, payload, {signal, key = null, onProgress = null, timeout = this.timeout} = {}) {
    if (this.closed) return Promise.reject(new Error('Task runner disposed'));
    if (signal?.aborted) return Promise.reject(abortError());
    if (!Number.isFinite(timeout) || timeout <= 0) return Promise.reject(new RangeError('Invalid task timeout'));
    if (key !== null) this.cancelKey(key);
    if (this.queue.length >= this.maxQueue) return Promise.reject(new RangeError('Task queue is full'));
    return new Promise((resolve, reject) => {
      const task = {id: ++this.nextId, type, payload, key, onProgress, resolve, reject, signal, timeout};
      task.abort = () => this.cancel(task.id);
      signal?.addEventListener('abort', task.abort, {once: true}); this.queue.push(task); this.pump();
    });
  }
  pump() {
    if (this.closed || this.active || !this.queue.length) return;
    const task = this.active = this.queue.shift();
    try {
      if (!this.worker) {
        const worker = this.worker = this.factory();
        worker.onmessage = event => {
          if (this.worker !== worker || !this.active || event.data?.id !== this.active.id) return;
          const current = this.active, message = event.data;
          if (message.kind === 'progress') { try { current.onProgress?.(message.value); } catch {} return; }
          if (message.kind === 'result') this.finish(current, null, message.value);
          else if (message.kind === 'error') { const error = new Error(message.message || 'Worker task failed'); error.name = message.name || 'Error'; this.finish(current, error); }
        };
        worker.onerror = event => { event.preventDefault?.(); if (this.worker === worker && this.active) { const current = this.active; this.kill(); this.finish(current, new Error(event.message || 'Worker crashed')); } };
        worker.onmessageerror = () => { if (this.worker === worker && this.active) { const current = this.active; this.kill(); this.finish(current, new Error('Worker message could not be decoded')); } };
      }
      task.timer = setTimeout(() => { if (this.active === task) { this.kill(); this.finish(task, new Error('Task time budget exceeded')); } }, task.timeout);
      this.worker.postMessage({id: task.id, type: task.type, payload: task.payload});
    } catch (error) { this.kill(); this.finish(task, error); }
  }
  finish(task, error, value) {
    clearTimeout(task.timer); task.signal?.removeEventListener('abort', task.abort);
    if (this.active === task) this.active = null;
    if (error) task.reject(error); else task.resolve(value);
    this.pump();
  }
  kill() { this.worker?.terminate(); this.worker = null; }
  cancel(id) {
    const index = this.queue.findIndex(task => task.id === id);
    if (index >= 0) { const [task] = this.queue.splice(index, 1); task.signal?.removeEventListener('abort', task.abort); task.reject(abortError()); return; }
    if (this.active?.id === id) { const task = this.active; this.kill(); this.finish(task, abortError()); }
  }
  cancelKey(key) {
    // Remove pending matches before cancelling active work, so pump cannot start an obsolete task.
    for (const task of [...this.queue]) if (task.key === key) this.cancel(task.id);
    if (this.active?.key === key) this.cancel(this.active.id);
  }
  cancelAll() {
    for (const task of [...this.queue]) this.cancel(task.id);
    if (this.active) this.cancel(this.active.id);
  }
  dispose() { this.closed = true; this.cancelAll(); this.kill(); }
}
/** Transfer a clone, never the persistent evaluator's cached buffers. */
export function transferableCopy(value) {
  const copy = structuredClone(value), buffers = new Set(), visited = new Set();
  const visit = v => {
    if (!v || typeof v !== 'object' || visited.has(v)) return; visited.add(v);
    if (v instanceof ArrayBuffer) { buffers.add(v); return; }
    if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer) buffers.add(v.buffer); return; }
    if (v instanceof Map) for (const [key, item] of v) { visit(key); visit(item); }
    else if (v instanceof Set) for (const item of v) visit(item);
    else Object.values(v).forEach(visit);
  };
  visit(copy); return {value: copy, transfer: [...buffers]};
}
