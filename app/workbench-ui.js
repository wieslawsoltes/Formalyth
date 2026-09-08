import {h,icon,toast,formDialog,report,download,setFormPresentation,Menu,VirtualList,FrameQueue,Preferences,labelFor,scalar,FeatureGraph,parameters,expression,cameraState,restoreCamera,installFeatureTools,$,safe,short,icons,designGroups,bodyCommands} from './workbench-shared.js';
import {WorkbenchPanels} from './workbench-panels.js';
/** Native-DOM workbench: command menus, virtual tree/history and retained property panels. */
export class WorkbenchUI extends WorkbenchPanels {
  constructor(ctx,ribbons){
    super();
    Object.assign(this,{ctx,w:ctx.workbench,r:ctx.renderer,c:ctx.commands,ribbons});this.prefs=new Preferences();this.queue=new FrameQueue();this.abort=new AbortController();this.collapsed=new Set(this.prefs.data.collapsed);this.treeRows=[];this.treeFocus=0;this.inspectorKey=null;this.previewScene=null;this.activeWorkspace=null;this.lastRepeat=null;this.ownedInspector=null;
    const oldPick=this.r.onPick;this.r.onPick=(...args)=>{if(this.w.editSession&&!this.w.editSession.closed)return;return oldPick?.(...args);};
    setFormPresentation('docked');installFeatureTools(ctx);this.installCommands();this.chrome();
    this.tree=new VirtualList($('#browser'),{role:'tree',size:this.rowSize,render:(row,i)=>this.treeRow(row,i),key:row=>row.key});
    this.tree.onDraw=()=>{const row=this.treeRows[this.treeFocus];if(row&&this.tree.nodes.has(row.key))$('#browser').setAttribute('aria-activedescendant','tree-node-'+this.treeFocus);else $('#browser').removeAttribute('aria-activedescendant');};
    this.timeline=new VirtualList($('#timeline'),{role:'listbox',horizontal:true,size:40,render:(f,i)=>this.historyTile(f,i)});
    this.events();this.applyPreferences();
    this.c.subscribe(e=>{if(e.type==='complete'&&!/^(ui\.|selection\.|feature\.parameter)/.test(e.id)){this.prefs.record(e.id);this.lastRepeat=e.id;}if(e.type==='error')this.lastError=e.error.message;this.updateAvailability();});
    this.w.subscribe(e=>{
      if(e.type==='preview'){this.updateAvailability();this.previewScene=e.scene;this.ctx.renderScene(e.scene);$('#status').textContent='Live preview · Apply to save';}
      if(e.type==='previewError'){this.previewScene=null;this.ctx.renderScene();}
      if(e.type==='previewEnd'){if(this.ownedInspector?.id===e.session){this.ownedInspector=null;this.inspectorKey=null;}this.previewScene=null;if(!e.committed)this.ctx.renderScene();this.queue.schedule('inspector',()=>this.inspector());}
      if(e.type==='selection'&&!this.w.recordSelection)this.record=null;
      if(e.type==='replace'){this.record=null;this.inspectorKey=null;this.previewScene=null;}
    });
  }
  get rowSize(){return this.prefs.data.density==='comfortable'?34:28;}
  get metrics(){return {frames:{...this.queue.stats},tree:{...this.tree.stats,totalRows:this.treeRows.length},timeline:{...this.timeline.stats,totalRows:this.timeline.items.length},renderer:this.r.frameStats};}
  execute(id,...args){
    const available=this.availability(id);if(!available.enabled){toast(available.reason);return Promise.resolve();}
    return this.ctx.run(id,...args);
  }
  availability(id){
    if(!this.c.items.has(id))return {enabled:false,reason:'Unknown command'};
    const live=!!document.querySelector('dialog[data-tool-panel][open]');
    if((live||this.ctx.getEditor())&&!/^(view\.|ui\.theme|ui\.commands|file\.save|selection\.)/.test(id))return {enabled:false,reason:'Finish or cancel the current tool first'};
    if(id==='edit.undo')return {enabled:this.w.project.canUndo,reason:'No operation to undo'};
    if(id==='edit.redo')return {enabled:this.w.project.canRedo,reason:'No operation to redo'};
    if(['edit.delete','feature.edit','feature.rename','feature.hide','feature.isolate','feature.suppress','feature.earlier','feature.later'].includes(id)&&!this.w.selected)return {enabled:false,reason:'Select a feature first'};
    if(bodyCommands.has(id)&&!this.w.scene.some(x=>x.value?.positions))return {enabled:false,reason:'Create or select a model body first'};
    if(id==='solid.extrusion'&&![...this.w.available].some(id=>['profile','region'].includes(this.w.assets.get(id)?.value?.kind)))return {enabled:false,reason:'Create a closed sketch first'};
    if(id==='sketch.fromFace'&&!this.ctx.topologySelection.items.some(i=>i.kind==='face'))return {enabled:false,reason:'Pick a planar face first'};
    return {enabled:true};
  }
  menuEntry(id){const command=this.c.items.get(id);if(!command)return null;return {id,label:short(command.label),icon:command.icon,shortcut:command.shortcut,...this.availability(id),run:()=>this.execute(id)};}
  menu(ids,anchor,label,x,y){return new Menu(ids.map(id=>typeof id==='string'?this.menuEntry(id):id).filter(Boolean),{anchor,label,x,y,onError:e=>toast(e.message,true)});}
  chrome(){
    const brand=$('.brand');brand.tabIndex=0;brand.setAttribute('role','button');brand.setAttribute('aria-label','File menu');brand.setAttribute('aria-haspopup','menu');brand.addEventListener('click',()=>this.fileMenu(brand));brand.addEventListener('keydown',e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();this.fileMenu(brand);}});
    const header=$('.titlebar'),menus=h('div',{class:'main-menus'});
    for(const [label,ids]of [['Edit',['edit.undo','edit.redo','feature.edit','feature.rename','feature.suppress','edit.delete']],['View',['view.fit','view.orthographic','view.perspective','view.shaded','view.edges','view.wire','view.grid','view.named','ui.layout','ui.browser','ui.inspector','ui.theme']],['Help',['ui.commands','ui.shortcuts','ui.help','ui.performance']]]){
      const b=h('button',{class:'main-menu-button','aria-haspopup':'menu','aria-expanded':'false'},label);b.addEventListener('click',()=>this.menu(ids,b,label));b.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();this.menu(ids,b,label);}});menus.append(b);
    }
    brand.after(menus);$('.local-badge').textContent='LOCAL PROJECT';
    const title=$('#document-title');title.tabIndex=0;title.setAttribute('role','button');title.title='Rename project';title.addEventListener('click',()=>this.execute('project.rename'));title.addEventListener('keydown',e=>{if(e.key==='Enter')this.execute('project.rename');});
    const hint=$('.workspace-hint');hint.replaceChildren(h('span',{class:'release-chip'},'0.6'),h('span',{},'DESIGN & MANUFACTURE'));
    this.addGrip($('.sidebar'),'leftWidth');this.addGrip($('.inspector'),'rightWidth');
    const sideHeader=$('.sidebar .panel-header');sideHeader.append(h('button',{class:'icon-button',title:'Collapse browser','aria-label':'Collapse browser',onclick:()=>this.execute('ui.browser')},icon('close',14)));
    $('.inspector .panel-header').replaceChildren(h('span',{},'PROPERTIES'),h('span',{class:'spacer'}),h('button',{class:'icon-button','aria-label':'Toggle inspector',onclick:()=>this.execute('ui.inspector')},icon('close',14)));
    this.historyLabel=h('span',{class:'history-position'},'End of history');this.scrubber=h('input',{type:'range',min:0,max:0,value:0,'aria-label':'History position',oninput:e=>this.historyLabel.textContent=`Preview history at ${e.target.value}`,onchange:e=>this.w.history(Number(e.target.value)).catch(err=>toast(err.message,true))});
    $('.timeline').append(h('div',{class:'history-scrubber'},this.historyLabel,this.scrubber));
    $('.timeline-hint').replaceChildren(h('span',{},'FEATURE HISTORY'),h('small',{},'Right-click for actions'));
    $('#performance').title='Feature build time / cached features. For frame timings use Help → Performance.';
    this.searchInput=$('.browser-search input');this.searchInput.placeholder='Find features or workspace data';
  }
  fileMenu(anchor){return this.menu(['file.new','file.open','file.save',{separator:true},'file.projects','file.export','file.examples','example.enclosure',{separator:true},'project.rename'],anchor,'File');}
  addGrip(panel,key){
    const left=key==='leftWidth',grip=h('div',{class:'panel-grip '+(left?'right':'left'),role:'separator',tabindex:0,'aria-label':left?'Browser width':'Inspector width','aria-orientation':'vertical','aria-valuemin':left?190:240,'aria-valuemax':left?440:480,'aria-valuenow':this.prefs.data[key]});panel.append(grip);
    let start=null;
    const resize=value=>{const bounds=left?[190,440]:[240,480],v=Math.max(bounds[0],Math.min(bounds[1],value));document.body.style.setProperty(left?'--browser-width':'--inspector-width',v+'px');grip.setAttribute('aria-valuenow',v);return v;};
    grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,value:this.prefs.data[key]};grip.setPointerCapture(e.pointerId);document.body.classList.add('resizing-panels');});
    grip.addEventListener('pointermove',e=>{if(start)resize(start.value+(e.clientX-start.x)*(left?1:-1));});
    const end=()=>{if(start){this.prefs.update({[key]:Number(grip.getAttribute('aria-valuenow'))});start=null;document.body.classList.remove('resizing-panels');}};
    grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);grip.addEventListener('dblclick',()=>{this.prefs.update({[key]:resize(left?250:286)});});
    grip.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const v=e.key==='Home'?(left?190:240):e.key==='End'?(left?440:480):this.prefs.data[key]+(e.key==='ArrowRight'?8:-8)*(left?1:-1);this.prefs.update({[key]:resize(v)});}});
  }
  applyPreferences(){
    const p=this.prefs.data;document.body.style.setProperty('--browser-width',p.leftWidth+'px');document.body.style.setProperty('--inspector-width',p.rightWidth+'px');document.body.dataset.density=p.density;this.r.showGrid=p.showGrid;
    if(this.tree){this.tree.size=this.rowSize;this.renderTree();}this.r.invalidate();
  }
  groups(){
    const w=this.w.project.data.view.workspace;
    if(w==='Design')return designGroups.map(([name,ids,count])=>({name,ids:ids.filter(id=>this.c.items.has(id)),count}));
    return (this.ribbons[w]||[]).map(([name,ids])=>({name,ids:[...new Set(ids)].filter(id=>this.c.items.has(id)),count:name==='Select'?3:Math.min(ids.length,2)}));
  }
  ribbon(){
    const name=this.w.project.data.view.workspace;
    $('.workspace-select').value=name;
    if(this.activeWorkspace===name)return this.updateAvailability();this.activeWorkspace=name;
    const tabDefs=['Design','Surface','Mesh','Sheet Metal'].includes(name)?[['Design','SOLID'],['Surface','SURFACE'],['Mesh','MESH'],['Sheet Metal','SHEET METAL']]:['Manufacture','Additive'].includes(name)?[['Manufacture','MILLING'],['Additive','ADDITIVE']]:[[name,name.toUpperCase()]];
    const tabs=$('.workspace-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workspace tools');
    tabs.replaceChildren(...tabDefs.map(([value,label])=>h('button',{class:'workspace-tab '+(name===value?'active':''),role:'tab','aria-selected':String(name===value),tabindex:name===value?0:-1,onclick:()=>this.ctx.setWorkspace(value),onkeydown:e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();let index=tabDefs.findIndex(([v])=>v===value);index=e.key==='Home'?0:e.key==='End'?tabDefs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabDefs.length)%tabDefs.length;this.ctx.setWorkspace(tabDefs[index][0]);tabs.querySelector('[aria-selected="true"]').focus();}}},label)));
    const root=$('#ribbon');root.replaceChildren();
    for(const group of this.groups()){
      const tools=h('div',{class:'ribbon-tools'});
      for(const id of group.ids.slice(0,group.count)){const c=this.c.items.get(id);const b=h('button',{class:'tool-button','data-command':id,'aria-label':c.label,title:c.label,onclick:()=>this.execute(id)},icon(c.icon,27),h('span',{},short(c.label)));tools.append(b);}
      const more=h('button',{class:'ribbon-menu-label','aria-label':group.name+' tools','aria-haspopup':'menu','aria-expanded':'false'},group.name,h('span',{class:'menu-chevron'},'⌄'));
      more.addEventListener('click',()=>this.menu(group.ids,more,group.name));more.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();this.menu(group.ids,more,group.name);}});
      root.append(h('div',{class:'ribbon-group'},tools,more));
    }
    const all=h('button',{class:'all-tools','aria-label':'All commands',onclick:()=>this.execute('ui.commands')},icon('inspect',21),h('span',{},'All tools'),h('kbd',{},'S'));root.append(all);
    this.updateAvailability();
  }
  revealCommand(label){
    const c=[...this.c.items.values()].find(c=>c.label===label||c.id===label);if(!c)throw new Error('Command not found: '+label);
    const escaped=CSS.escape(c.id),direct=document.querySelector(`#ribbon [data-command="${escaped}"]`);if(direct){direct.scrollIntoView({block:'nearest',inline:'nearest'});return `[data-command="${escaped}"]`;}
    const group=this.groups().find(g=>g.ids.includes(c.id));const anchor=group?[...$('#ribbon').querySelectorAll('.ribbon-menu-label')].find(b=>b.getAttribute('aria-label')===group.name+' tools'):$('#ribbon .all-tools');
    this.menu(group?.ids||[c.id],anchor,group?.name||'Command');return `.command-menu [data-command="${escaped}"]`;
  }
  updateAvailability(){
    if(!this.tree)return;
    for(const b of document.querySelectorAll('#ribbon [data-command]')){const a=this.availability(b.dataset.command);b.disabled=!a.enabled;b.title=a.enabled?this.c.items.get(b.dataset.command)?.label:a.reason;}
    for(const[id,label]of [['edit.undo','Undo · Ctrl+Z'],['edit.redo','Redo · Ctrl+Shift+Z']]){const b=document.querySelector(`.titlebar [aria-label="${label}"]`);if(b)b.disabled=!this.availability(id).enabled;}
  }
  update(){
    const data=this.w.project.data;$('#document-title').textContent=data.name;$('#viewport-title').textContent=data.name;
    $('#viewport-subtitle').textContent=`${data.view.workspace} · ${this.r.camera.projection} · ${this.r.backend}`;
    document.body.classList.toggle('dark',data.view.theme==='dark');this.r.background=data.view.theme==='dark'?[.08,.12,.16,1]:[.925,.937,.944,1];
    this.ribbon();this.queue.schedule('tree',()=>this.renderTree());this.queue.schedule('history',()=>this.renderTimeline());this.queue.schedule('inspector',()=>this.inspector());this.r.invalidate();
  }
  visibleScene(scene){const ids=this.w.project.data.view.isolatedIds;return Array.isArray(ids)&&ids.length?scene.filter(s=>ids.includes(s.id)):scene;}
  events(){
    $('#browser').addEventListener('keydown',e=>{
      const row=this.treeRows[this.treeFocus];if(!row)return;let i=this.treeFocus;
      if(e.key==='ArrowDown')i++;else if(e.key==='ArrowUp')i--;else if(e.key==='Home')i=0;else if(e.key==='End')i=this.treeRows.length-1;
      else if(e.key==='ArrowRight'){if(row.group&&!row.open)this.activateRow(i);else i++;}
      else if(e.key==='ArrowLeft'){if(row.group&&row.open)this.activateRow(i);else if(row.parent)i=this.treeRows.findIndex(x=>x.key===row.parent);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();this.activateRow(i);return;}
      else if(e.key==='F2'&&row.id){e.preventDefault();this.w.select(row.id);this.execute('feature.rename');return;}
      else if((e.key==='F10'&&e.shiftKey)||e.key==='ContextMenu'){e.preventDefault();const rect=$('#browser').getBoundingClientRect();if(row.id)this.w.select(row.id);this.contextMenu(rect.left+60,rect.top+40);return;}
      else return;
      e.preventDefault();e.stopPropagation();this.treeFocus=Math.max(0,Math.min(this.treeRows.length-1,i));this.tree.dirty=true;this.tree.scrollTo(this.treeFocus);
    },{signal:this.abort.signal});
    this.r.canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(this.ctx.getEditor())return;this.contextMenu(e.clientX,e.clientY);},{signal:this.abort.signal});
    $('#timeline').addEventListener('keydown',e=>{
      const fs=this.w.project.data.model.features;let i=Math.max(0,fs.findIndex(f=>f.id===this.w.selected));
      if(e.key==='ArrowLeft')i--;else if(e.key==='ArrowRight')i++;else if(e.key==='Home')i=0;else if(e.key==='End')i=fs.length-1;else if(e.key==='Enter'){this.execute('feature.edit');return;}else return;
      e.preventDefault();e.stopPropagation();i=Math.max(0,Math.min(fs.length-1,i));if(fs[i]){this.w.select(fs[i].id);this.timeline.scrollTo(i);}
    },{signal:this.abort.signal});
    document.addEventListener('keydown',e=>{
      if(e.defaultPrevented||e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]')||this.ctx.getEditor())return;
      if(e.key==='Delete'&&this.w.selected){e.preventDefault();this.execute('edit.delete');}
      if(e.key==='F2'){e.preventDefault();this.execute('feature.rename');}
      if(e.key==='Enter'&&this.lastRepeat){e.preventDefault();this.execute(this.lastRepeat);}
    },{signal:this.abort.signal});
  }
  dispose(){this.ownedInspector?.cancel();this.abort.abort();this.queue.dispose();this.tree.dispose();this.timeline.dispose();Menu.close();}
}
