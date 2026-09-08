import {h,icon,toast,formDialog,report,download,setFormPresentation,Menu,VirtualList,FrameQueue,Preferences,labelFor,scalar,FeatureGraph,parameters,expression,cameraState,restoreCamera,installFeatureTools,$,safe,short,icons,designGroups,bodyCommands} from './workbench-shared.js';
import {WorkbenchActions} from './workbench-actions.js';
/** Virtual browser, history and retained contextual inspectors. */
export class WorkbenchPanels extends WorkbenchActions {
  groupRows(key,name,children,iconName='open'){
    if(!children.length)return [];
    const open=!this.collapsed.has(key)||!!this.searchInput?.value;return [{key:'group:'+key,group:key,label:name,icon:iconName,level:2,count:children.length,open},...(open?children.map(row=>({...row,parent:'group:'+key,level:3})):[])];
  }
  renderTree(){
    const p=this.w.project.data,q=(this.searchInput?.value||'').trim().toLowerCase(),features=p.model.features,active=new Set(this.w.scene.map(s=>s.id));
    const row=f=>({key:f.id,id:f.id,label:f.name||f.type,icon:icons[f.type]||'cube',hidden:f.visible===false,error:this.w.errors.find(e=>e.id===f.id)?.message,suppressed:f.suppressed,kind:f.type});
    const match=f=>!q||`${f.name} ${f.type}`.toLowerCase().includes(q);
    const bodies=features.filter(f=>match(f)&&(active.has(f.id)||f.visible===false)&&this.w.assets.get(f.id)?.value?.positions).map(row);
    const sketches=features.filter(f=>match(f)&&['sketch','region','faceSketch'].includes(f.type)).map(row),planes=features.filter(f=>match(f)&&f.type==='constructionPlane').map(row);
    let rows=[{key:'root',label:p.name,icon:'open',level:1,root:true},...this.groupRows('bodies','Bodies',bodies,'cube'),...this.groupRows('sketches','Sketches',sketches,'sketch'),...this.groupRows('construction','Construction',planes,'sheet'),...this.groupRows('features','Features',features.filter(match).map(f=>({...row(f),key:'history:'+f.id})),'layers')];
    for(const[domain,ws]of Object.entries(p.workspaces)){
      const records=[];for(const[collection,items]of Object.entries(ws))if(Array.isArray(items))for(const item of items){const label=item.name||item.id;if(!q||`${label} ${domain} ${collection}`.toLowerCase().includes(q))records.push({key:`record:${domain}:${collection}:${item.id}`,label,icon:domain==='manufacturing'?'mill':domain==='electronics'?'circuit':'layers',record:item,domain,collection,stale:!!item.sourceVersion&&this.w.project.isStale(item)});}
      rows.push(...this.groupRows('domain:'+domain,labelFor(domain),records));
    }
    const previous=this.treeRows[this.treeFocus]?.key;this.treeRows=rows;const index=rows.findIndex(r=>r.key===previous);this.treeFocus=index<0?Math.min(this.treeFocus,Math.max(0,rows.length-1)):index;this.tree.setItems(rows);
  }
  treeRow(row,i){
    const selected=row.id===this.w.selected||this.record?.key===row.key;
    const node=h('div',{id:'tree-node-'+i,role:'treeitem','aria-level':row.level,'aria-expanded':row.group?String(row.open):undefined,'aria-selected':String(selected),class:`tree-row ${row.root?'root':''} ${row.group?'group':''} ${selected?'selected':''} ${i===this.treeFocus?'keyboard-focus':''} ${row.hidden?'hidden-feature':''}`,style:`padding-left:${8+(row.level-1)*13}px`,title:row.error||row.label,onclick:()=>this.activateRow(i),ondblclick:()=>row.id&&this.execute('feature.edit',row.id),oncontextmenu:e=>{e.preventDefault();this.activateRow(i);if(row.id)this.contextMenu(e.clientX,e.clientY,row.id);}});
    if(row.group)node.append(h('span',{class:'tree-chevron'},row.open?'⌄':'›'));else node.append(h('span',{class:'tree-dot'},row.error?'!':row.stale?'●':''));
    node.append(icon(row.icon,15),h('span',{class:'name'},row.label));
    if(row.group)node.append(h('span',{class:'tree-count'},row.count));
    if(row.id)node.append(h('button',{class:'tree-visibility','aria-label':`${row.hidden?'Show':'Hide'} ${row.label}`,title:row.hidden?'Show feature':'Hide feature',onclick:e=>{e.stopPropagation();this.w.batchEdit([{action:'update',id:row.id,patch:{visible:row.hidden?true:false}}],'Change visibility').catch(error=>toast(error.message,true));}},icon('eye',14)));
    if(row.stale)node.append(h('span',{class:'stale-dot',title:'Geometry-dependent data is stale'},'!'));
    return node;
  }
  activateRow(i){
    const row=this.treeRows[i];if(!row)return;this.treeFocus=i;
    if(row.group){if(row.open)this.collapsed.add(row.group);else this.collapsed.delete(row.group);this.prefs.update({collapsed:[...this.collapsed]});this.renderTree();}
    else if(row.record){this.record=row;this.w.selectRecord(row.domain,row.collection,row.record.id);this.inspectorKey=null;this.inspector();}
    else {this.record=null;this.w.select(row.id||null);}
    $('#browser').focus({preventScroll:true});
  }
  historyTile(f,i){
    const upto=this.w.project.data.view.timeline??this.w.project.data.model.features.length;
    return h('button',{class:`feature-tile ${this.w.selected===f.id?'selected':''} ${f.suppressed?'suppressed':''} ${i>=upto?'future':''} ${this.w.errors.some(e=>e.id===f.id)?'error':''}`,role:'option','aria-selected':String(this.w.selected===f.id),'aria-label':f.name||f.type,title:`${i+1}. ${f.name||f.type} · ${f.type}`,onclick:()=>this.w.select(f.id),ondblclick:()=>this.execute('feature.edit',f.id),oncontextmenu:e=>{e.preventDefault();this.w.select(f.id);this.contextMenu(e.clientX,e.clientY,f.id);}},icon(icons[f.type]||'cube',21));
  }
  renderTimeline(){const fs=this.w.project.data.model.features,upto=this.w.project.data.view.timeline??fs.length;this.timeline.setItems(fs);this.scrubber.max=fs.length;this.scrubber.value=upto;this.historyLabel.textContent=upto===fs.length?`${fs.length} features · End`:`${upto} / ${fs.length} · Rolled back`;this.scrubber.disabled=!fs.length;}
  async contextMenu(x,y,id=this.w.selected){
    const f=this.w.project.data.model.features.find(f=>f.id===id),fs=this.w.project.data.model.features;
    const extras=f?[{separator:true},{label:'Roll history to here',icon:'layers',run:()=>this.w.history(fs.indexOf(f)+1)},{label:'Roll history before this',icon:'undo',run:()=>this.w.history(fs.indexOf(f))},this.menuEntry('feature.earlier'),this.menuEntry('feature.later')]:[];
    this.menu([...(f?['feature.edit','feature.rename','feature.hide','feature.isolate','feature.suppress','edit.delete']:['sketch.create','solid.box','solid.cylinder']),...extras,{separator:true},'edit.undo','edit.redo','view.fit','ui.commands'],null,'Context commands',x,y);
  }
  inspector(){
    const root=$('#inspector'),f=this.w.project.data.model.features.find(f=>f.id===this.w.selected);
    // Source changes arrive before the worker result. Include built state so a
    // retained inspector cannot keep the previous body's count/error status.
    const builtKey=`${this.w.builtVersion}:${this.w.builtTimeline}:${this.w.scene.length}:${this.w.errors.map(e=>e.id+':'+e.message).join('|')}`;
    const record=this.record?this.currentRecord(this.record):null;
    if(record!==this.inspectedRecord){this.inspectorKey=null;this.inspectedRecord=record;}
    const key=(f?`${f.id}:${this.w.project.data.geometryVersion}:${f.name}:${f.color}:${f.visible}:${f.suppressed}`:`${this.w.project.data.geometryVersion}:${this.w.project.data.view.workspace}:${this.record?.key||''}`)+':'+builtKey;
    if(this.inspectorKey===key)return;
    this.inspectorCleanup?.();this.ownedInspector?.cancel();this.ownedInspector=null;this.inspectorKey=key;
    const selection=$('#topology-selection');if(selection)selection.remove();root.replaceChildren();if(selection)root.append(selection);
    if(this.record){this.recordInspector(root,this.record);return;}
    if(!f){
      root.append(h('h2',{class:'inspector-title'},this.w.project.data.view.workspace),h('div',{class:'inspector-subtitle'},'Ready to design'),h('div',{class:'project-summary'},h('strong',{},this.w.scene.filter(i=>i.value?.positions).length),h('span',{},'bodies'),h('strong',{},this.w.project.data.model.features.length),h('span',{},'features')),
        h('p',{class:'panel-help'},'Select a body, face or feature to edit. Press S to find any tool.'),this.actionButton('sketch.create'),this.actionButton('design.parameterTable'),this.actionButton('file.projects'),h('h3',{class:'section-heading'},'View'),this.actionButton('view.named'),this.actionButton('view.fit'),h('h3',{class:'section-heading'},'Recent tools'));
      for(const id of this.prefs.data.recent.filter(id=>this.c.items.has(id)).slice(0,5))root.append(this.actionButton(id));
      root.append(h('p',{class:'panel-footnote'},'Local project · mm · Experimental geometry. Review manufacturing and analysis output independently.'));return;
    }
    root.append(h('h2',{class:'inspector-title'},f.name||f.type),h('div',{class:'inspector-subtitle'},`${labelFor(f.type)} · Feature ${this.w.project.data.model.features.indexOf(f)+1}`));
    const error=this.w.errors.find(e=>e.id===f.id);if(error)root.append(h('div',{class:'warning-note'},error.message));
    const scalarParams=Object.entries(f.params).filter(([,v])=>['string','number','boolean'].includes(typeof v));
    const form=h('form',{class:'property-form'}),fields=new Map(),status=h('p',{class:'property-status','aria-live':'polite'}),apply=h('button',{type:'submit',class:'primary',disabled:true},'Apply'),cancel=h('button',{type:'button'},'Cancel'),footer=h('div',{class:'property-commit',hidden:true},cancel,apply);let pending=0,timer;
    const changed=async()=>{
      if(document.querySelector('dialog[data-tool-panel][open]')){toast('Finish the current tool first');return;}
      clearTimeout(timer);const token=++pending;footer.hidden=false;apply.disabled=true;status.textContent='Previewing…';
      timer=setTimeout(async()=>{if(token!==pending||key!==this.inspectorKey)return;try{
        const values=Object.fromEntries([...fields].map(([key,input])=>[key,input.type==='checkbox'?input.checked:scalar(input.value)]));
        const session=this.ownedInspector||=this.w.beginEdit({label:'Edit '+f.name});await session.update([{action:'update',id:f.id,patch:{params:values}}]);
        if(token!==pending||key!==this.inspectorKey)return;apply.disabled=false;status.textContent='Live preview · not applied';
      }catch(e){if(token!==pending)return;status.textContent=e.message;apply.disabled=true;}},150);
    };
    for(const[name,value]of scalarParams){const input=h('input',{type:typeof value==='boolean'?'checkbox':'text',value:typeof value==='boolean'?undefined:value,checked:value===true,'aria-label':labelFor(name),oninput:changed,onchange:changed});fields.set(name,input);form.append(h('label',{class:'property-row'},h('span',{},labelFor(name)),input));}
    this.inspectorCleanup=()=>{clearTimeout(timer);pending++;};
    cancel.addEventListener('click',()=>{clearTimeout(timer);pending++;this.ownedInspector?.cancel();this.ownedInspector=null;this.inspectorKey=null;this.inspector();});
    form.addEventListener('submit',async e=>{e.preventDefault();if(!this.ownedInspector?.valid)return;apply.disabled=true;try{await this.ownedInspector.commit();this.ownedInspector=null;this.inspectorKey=null;this.inspector();}catch(err){status.textContent=err.message;}});
    form.append(status,footer);root.append(form,this.actionButton('feature.edit'),h('h3',{class:'section-heading'},'Appearance'));
    const color=h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(f.color)?f.color:'#6497b2','aria-label':'Body color',onchange:e=>this.w.batchEdit([{action:'update',id:f.id,patch:{color:e.target.value}}],'Change appearance').catch(e=>toast(e.message,true))});root.append(h('label',{class:'property-row'},h('span',{},'Body color'),color));
    if(f.inputs.length){root.append(h('h3',{class:'section-heading'},'Inputs'));for(const id of f.inputs){const input=this.w.project.data.model.features.find(x=>x.id===id);root.append(h('button',{class:'dependency-link',onclick:()=>this.w.select(id)},icon('joint',14),input?.name||id));}}
    root.append(h('h3',{class:'section-heading'},'Feature actions'),this.actionButton('feature.rename'),this.actionButton('feature.hide'),this.actionButton('feature.suppress'),this.actionButton('edit.delete'));
  }
  actionButton(id){const c=this.c.items.get(id);return c?h('button',{class:'full-button','data-command':id,onclick:()=>this.execute(id)},icon(c.icon,16),short(c.label)):null;}
  recordInspector(root,row){
    root.append(h('h2',{class:'inspector-title'},row.label),h('div',{class:'inspector-subtitle'},`${labelFor(row.domain)} / ${labelFor(row.collection)}`));
    const current=this.currentRecord(row);if(current?.sourceVersion&&this.w.project.isStale(current))root.append(h('div',{class:'warning-note'},'Source geometry changed. Regenerate before using this output.'));
    const r=this.currentRecord(row);if(!r){root.append(h('p',{class:'warning-note'},'This record no longer exists. Select another record.'));return;}for(const[name,value]of Object.entries(r.config||r.settings||{}))if(['string','number','boolean'].includes(typeof value))root.append(h('div',{class:'property-row'},h('span',{},labelFor(name)),h('strong',{},safe(value))));
    root.append(h('button',{class:'full-button',onclick:()=>this.showRecord(row)},icon('eye',16),'Show saved result'),h('button',{class:'full-button',onclick:()=>report(row.label,r)},icon('inspect',16),'Inspect record'),h('button',{class:'full-button',onclick:()=>download(JSON.stringify(r,null,2),row.domain+'-record.json','application/json')},icon('export',16),'Export record JSON'));
    if(row.domain==='manufacturing')root.append(this.actionButton('cam.regenerate'),this.actionButton('cam.post'));
    root.append(h('p',{class:'panel-help'},'Selected workspace actions use this record. Selecting a model feature returns commands to their latest-record default.'));
  }
  currentRecord(row){return this.w.project.data.workspaces[row.domain]?.[row.collection]?.find(record=>record.id===row.record.id)||null;}
  showRecord(row){
    const r=this.currentRecord(row);if(!r)throw new ReferenceError('The selected record no longer exists');if(r.sourceVersion)this.w.assertFresh(r);
    if(r.output?.svg){const url=URL.createObjectURL(new Blob([r.output.svg],{type:'image/svg+xml'}));const d=report(row.label,h('img',{src:url,alt:row.label,style:'width:100%;background:white'}));d.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});}
    else if(r.output?.moves){const segments=r.output.moves.slice(1).map((m,i)=>[[r.output.moves[i].x,r.output.moves[i].y,r.output.moves[i].z],[m.x,m.y,m.z]]);this.r.setLines('overlay-record',segments,'#1688c9');}
    else if(r.output?.body?.positions){this.r.setScene([{id:r.id,value:r.output.body,color:'#ce9653'}]);this.r.fit();}
    else report(row.label,r.output||r);
  }
}
