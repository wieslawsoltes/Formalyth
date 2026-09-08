/** Pure range math and an injected, keyed animation-frame invalidation queue. */
export function visibleRange(count,offset,viewport,itemSize,overscan=4){
  if(!Number.isInteger(count)||count<0||![offset,viewport,itemSize,overscan].every(Number.isFinite)||itemSize<=0||viewport<0||overscan<0)throw new RangeError('Invalid virtual viewport');
  const first=Math.max(0,Math.min(count,Math.floor(Math.max(0,offset)/itemSize)-Math.floor(overscan)));
  return {first,last:Math.min(count,Math.ceil((Math.max(0,offset)+viewport)/itemSize)+Math.floor(overscan)),extent:count*itemSize};
}
export class FrameQueue {
  constructor(request=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)){
    this.request=request;this.cancel=cancel;this.jobs=new Map();this.frame=null;this.disposed=false;this.stats={frames:0,jobs:0,coalesced:0};
  }
  schedule(key,fn){if(this.disposed)return;if(this.jobs.has(key))this.stats.coalesced++;this.jobs.set(key,fn);if(this.frame===null)this.frame=this.request(()=>this.flush());}
  flush(){if(this.disposed)return;if(this.frame!==null)this.cancel(this.frame);this.frame=null;const jobs=[...this.jobs.values()];this.jobs.clear();this.stats.frames++;for(const fn of jobs){this.stats.jobs++;fn();}}
  dispose(){this.disposed=true;if(this.frame!==null)this.cancel(this.frame);this.jobs.clear();this.frame=null;}
}
