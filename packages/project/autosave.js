/** Debounced, coalesced autosave. Completed old writes never mark newer edits saved. */
export class Autosave{
  constructor(write,{delay=600,onStatus=()=>{}}={}){
    if(typeof write!=='function'||!Number.isFinite(delay)||delay<0)throw new TypeError('Invalid autosave configuration');
    this.write=write;this.delay=delay;this.onStatus=onStatus;this.generation=0;this.project=null;this.savedRevision=-1;this.running=null;this.closed=false;
  }
  get dirty(){return !!this.project&&this.savedRevision!==this.project.revision;}
  emit(state,error){try{this.onStatus({state,error,dirty:this.dirty,project:this.project});}catch(e){console.error('Autosave observer failed',e);}}
  attach(project,{dirty=false}={}){
    if(this.closed)throw new Error('Autosave disposed');clearTimeout(this.timer);this.unsubscribe?.();this.generation++;this.project=project;this.savedRevision=dirty?-1:project.revision;
    this.unsubscribe=project.subscribe(()=>this.schedule());if(dirty)this.schedule();else this.emit('saved');
  }
  schedule(){if(this.closed)return;clearTimeout(this.timer);this.emit('dirty');this.timer=setTimeout(()=>this.flush().catch(()=>{}),this.delay);}
  flush(){
    clearTimeout(this.timer);if(this.closed)return Promise.reject(new Error('Autosave disposed'));if(this.running)return this.running;
    this.running=(async()=>{
      while(this.dirty&&!this.closed){
        const generation=this.generation,project=this.project,revision=project.revision,name=project.data.name,text=project.serialize();
        const snapshot=Object.freeze({data:Object.freeze({name}),serialize:()=>text});this.emit('saving');
        try{await this.write(snapshot);}catch(error){if(generation===this.generation)this.emit('error',error);throw error;}
        if(generation===this.generation){this.savedRevision=revision;this.emit(this.dirty?'dirty':'saved');}
      }
    })().finally(()=>{this.running=null;});return this.running;
  }
  dispose(){this.closed=true;this.generation++;clearTimeout(this.timer);this.unsubscribe?.();}
}
