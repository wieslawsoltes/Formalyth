/** Speculative edits, isolated from history until validated Apply. No DOM. */
import {editModel} from '../document/graph.js';
import {validateDocument, id} from '../document/index.js';
const aborted=message=>new DOMException(message,'AbortError');
export function newFeature(type,params={},inputs=[],name=type){
  return {id:id('f'),type,name,params:structuredClone(params),inputs:[...inputs],visible:null,suppressed:false,color:'#6497b2',material:'aluminum'};
}
export class EditSession {
  constructor(workbench,{label='Edit feature'}={}){
    workbench.assertCurrent();this.workbench=workbench;this.project=workbench.project;this.version=this.project.data.geometryVersion;
    this.timeline=this.project.data.view.timeline;this.id=crypto.randomUUID();this.label=label;this.sequence=0;this.closed=false;this.valid=false;
    this.assets=new Map(workbench.assets);this.edits=[];this.error=null;this.pending=null;
  }
  assertContext(){
    if(this.closed)throw new Error('Edit session is closed');
    if(this.workbench.project!==this.project||this.project.data.geometryVersion!==this.version||this.project.data.view.timeline!==this.timeline)throw aborted('Source changed during editing. Cancel and reopen the tool.');
  }
  async update(edits){
    this.assertContext();const sequence=++this.sequence;this.valid=false;this.error=null;this.edits=structuredClone(edits);
    const run=async()=>{
      try{
        const result=await this.workbench.modelTasks.run('preview',{document:this.project.data.model,edits:this.edits,session:this.id},{key:'preview'});
        if(sequence!==this.sequence||this.closed)return null;this.assertContext();
        for(const item of result.changes)this.assets.set(item.id,item);
        if(result.errors.length){const error=new Error(result.errors.map(e=>`${e.name||e.id}: ${e.message}`).join('\n'));error.code='PREVIEW_INVALID';throw error;}
        const scene=result.scene.map(item=>({...this.assets.get(item.id),...item}));
        if(scene.some(item=>!item.value))throw new Error('Preview transport omitted required geometry');
        this.valid=true;this.result={...result,scene};this.workbench.emit({type:'preview',session:this.id,scene,stats:result.stats});return this.result;
      }catch(error){if(sequence!==this.sequence||this.closed)return null;this.error=error;this.valid=false;this.workbench.emit({type:'previewError',session:this.id,error});throw error;}
    };
    this.pending=run();return this.pending;
  }
  async commit(){
    this.assertContext();const sequence=this.sequence;
    if(this.pending)await this.pending;
    if(sequence!==this.sequence||!this.valid)throw new Error('Wait for a valid preview before applying');
    this.assertContext();const draft=validateDocument(editModel(this.project.data.model,this.edits));
    this.project.transact(this.label,p=>{p.model=draft;p.name=draft.name;p.view.timeline=null;});
    const lastAdded=this.edits.filter(op=>op.action==='add').at(-1)?.feature.id;
    if(lastAdded)this.workbench.selected=lastAdded;
    this.closed=true;this.workbench.emit({type:'previewEnd',session:this.id,committed:true});
    await this.workbench.rebuild();return lastAdded??true;
  }
  cancel(){
    if(this.closed)return;this.closed=true;this.sequence++;this.valid=false;
    this.workbench.modelTasks.cancelKey?.('preview');this.workbench.emit({type:'previewEnd',session:this.id,committed:false});
  }
}
