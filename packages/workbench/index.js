/** Headless application controller. UI and worker transports are injected. */
import {Project, createProject} from '../project/index.js';
import {DesignDocument} from '../document/index.js';
export class Workbench {
  constructor({modelTasks, jobTasks, project = new Project()} = {}) {
    if (!modelTasks || !jobTasks) throw new TypeError('Two task transports are required');
    this.modelTasks=modelTasks;this.jobTasks=jobTasks;this.listeners=new Set();this.assets=new Map();this.scene=[];this.available=new Set();this.sequence=0;this.selected=null;this.stats={};this.errors=[];this.setProject(project);
  }
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(event){for(const fn of this.listeners){try{fn(event);}catch(e){console.error('Workbench observer failed',e);}}}
  setProject(project){
    if(!(project instanceof Project))throw new TypeError('Expected unified Project');
    new DesignDocument(project.data.model);this.sequence++;this.modelTasks.cancelAll();this.jobTasks.cancelAll();this.unsubscribe?.();
    this.project=project;this.assets.clear();this.available.clear();this.builtVersion=null;this.builtTimeline=null;this.scene=[];this.selected=null;this.reset=true;
    this.unsubscribe=project.subscribe(event=>this.emit({type:'project',...event}));this.emit({type:'replace'});
  }
  async rebuild({fit=false}={}){
    const token=++this.sequence,project=this.project,version=project.data.geometryVersion,timeline=project.data.view.timeline;this.emit({type:'building',active:true});
    try{
      const result=await this.modelTasks.run('evaluate',{document:project.data.model,upto:project.data.view.timeline??project.data.model.features.length,reset:this.reset},{key:'model'});
      if(token!==this.sequence||project!==this.project)return null;
      if(version!==project.data.geometryVersion||timeline!==project.data.view.timeline){this.reset=true;return null;}
      this.reset=false;this.builtVersion=version;this.builtTimeline=timeline;this.available=new Set(result.available);for(const id of result.removed)this.assets.delete(id);for(const item of result.changes)this.assets.set(item.id,item);
      this.scene=result.scene.map(item=>({...this.assets.get(item.id),...item}));this.stats=result.stats;this.errors=result.errors;
      if(this.selected&&!project.data.model.features.some(f=>f.id===this.selected))this.selected=null;
      this.emit({type:'scene',fit});return result;
    }catch(error){if(error.name!=='AbortError'){this.emit({type:'error',error});throw error;}return null;}
    finally{if(token===this.sequence)this.emit({type:'building',active:false});}
  }
  mutateModel(label,mutate){
    const document=new DesignDocument(this.project.data.model),result=mutate(document);
    this.project.transact(label,draft=>{draft.model=document.data;draft.name=document.data.name;draft.view.timeline=null;});return result;
  }
  async addFeature(type,params={},inputs=[],name=type){const id=this.mutateModel(`Create ${name}`,d=>d.addFeature(type,params,inputs,name));this.selected=id;await this.rebuild();return id;}
  async editFeature(id,patch){this.mutateModel('Edit feature',d=>d.editFeature(id,patch));await this.rebuild();}
  async removeFeature(id,cascade=false){this.mutateModel('Delete feature',d=>d.removeFeature(id,cascade));await this.rebuild();}
  async undo(){if(this.project.undo())await this.rebuild();}
  async redo(){if(this.project.redo())await this.rebuild();}
  async history(upto){if(!Number.isInteger(upto)||upto<0||upto>this.project.data.model.features.length)throw new RangeError('Invalid history position');this.project.updateView({timeline:upto===this.project.data.model.features.length?null:upto});await this.rebuild();}
  select(id){this.selected=id;this.emit({type:'selection'});}
  selectedValue({mesh=false}={}){
    if(this.builtVersion!==this.project.data.geometryVersion||this.builtTimeline!==this.project.data.view.timeline)throw new Error('Geometry rebuild is not current');
    if(this.selected&&!this.available.has(this.selected))throw new Error('Selected feature is unavailable or failed to rebuild');
    let item=this.assets.get(this.selected);
    if(!item)item=[...this.scene].reverse().find(i=>mesh?i.value?.positions:!!i.value);
    if(!item?.value||(mesh&&!item.value.positions))throw new TypeError(mesh?'Select a solid or mesh body':'Select a sketch or body');return item;
  }
  assertCurrent(){
    if(this.builtVersion!==this.project.data.geometryVersion||this.builtTimeline!==this.project.data.view.timeline)throw new Error('Geometry rebuild is not current');
  }
  async task(type,payload,{key=type}={}){
    this.emit({type:'task',active:true,label:type});
    try{return await this.jobTasks.run(type,payload,{key});}finally{this.emit({type:'task',active:!!this.jobTasks.active,label:this.jobTasks.active?.type});}
  }
  async derived(type,payload){
    this.assertCurrent();
    const project=this.project,version=project.data.geometryVersion,timeline=project.data.view.timeline,result=await this.task(type,payload);
    if(project!==this.project||version!==project.data.geometryVersion||timeline!==project.data.view.timeline)throw new DOMException('Source geometry changed while computing; regenerate the result','AbortError');
    return {result,sourceVersion:version,sourceTimeline:timeline};
  }
  assertFresh(record){this.assertCurrent();if(this.project.isStale(record)||(record.sourceTimeline??null)!==this.project.data.view.timeline)throw new Error('Result is stale. Regenerate it from the current geometry before exporting or simulating.');}
  cancel(){this.modelTasks.cancelAll();this.jobTasks.cancelAll();}
  dispose(){this.unsubscribe?.();this.modelTasks.dispose();this.jobTasks.dispose();this.listeners.clear();}
}
export function bearingProject(){
  const d=new DesignDocument();d.transact('Example parameters',data=>{data.name='Bearing housing';data.parameters={plateWidth:80,plateDepth:52,plateHeight:8,bossRadius:16,bossHeight:24};});
  const base=d.addFeature('box',{width:'plateWidth',depth:'plateDepth',height:'plateHeight',radius:4},[],'Mounting plate');
  const boss=d.addFeature('cylinder',{radius:'bossRadius',height:'bossHeight',segments:48},[],'Bearing boss');
  const raised=d.addFeature('move',{z:'plateHeight'},[boss],'Raise boss');
  const joined=d.addFeature('boolean',{operation:'union'},[base,raised],'Join housing');
  const bore=d.addFeature('holes',{radius:8,segments:48},[joined],'Shaft bore');
  d.addFeature('holes',{radius:3,centers:[[-29,-17],[29,-17],[29,17],[-29,17]],segments:20},[bore],'Fastener holes');
  return new Project(createProject(d.data.name,d.data));
}
