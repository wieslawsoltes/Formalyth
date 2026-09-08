import {WorkbenchUI} from './workbench-ui.js';
import {installTopologyCommands} from './topology.js';
import {h,icon,Commands,toast,download,formDialog,report} from '../packages/ui/index.js';
import {Project,createProject} from '../packages/project/index.js';
import {Autosave} from '../packages/project/autosave.js';
import {ProjectStorage} from '../packages/project/storage.js';
import {TaskRunner} from '../packages/tasks/index.js';
import {Workbench,bearingProject} from '../packages/workbench/index.js';
import {Renderer} from '../packages/renderer/index.js';
import {installConstructionCommands} from './construction.js';
import {profileSegments} from '../packages/construction/frames.js';
import {m4} from '../packages/math/index.js';
import {installModelCommands} from './model.js';
import {installWorkspaces} from './workspaces.js';
const $=s=>document.querySelector(s),storage=new ProjectStorage(),commands=new Commands(),graphicsErrors=[];
const transport=()=>new TaskRunner(()=>new Worker(new URL('./engine.worker.js',import.meta.url),{type:'module'}));
const workbench=new Workbench({modelTasks:transport(),jobTasks:transport()}),workspaces=['Design','Surface','Mesh','Sheet Metal','Assemble','Manufacture','Additive','Simulation','Drawing','Electronics'];
let ui=null,renderer,ribbons={},modelBusy=false,jobBusy=false,jobLabel='',editor=null,measuring=false,measurePoints=[];
const run=async(id,...args)=>{try{return await commands.execute(id,...args);}catch(e){if(e.name!=='AbortError')toast(e.message,true);}};
const button=(label,image,fn,cls='icon-button')=>h('button',{class:cls,title:label,'aria-label':label,onclick:fn},image?icon(image,20):null,cls==='icon-button'?null:label);
const commandButton=(id,cls='tool-button')=>{const c=commands.items.get(id);return c?button(c.label,c.icon,()=>ui?ui.execute(id):run(id),cls):null;};
function shell(){
  $('#app').append(h('header',{class:'titlebar'},h('div',{class:'brand'},h('span',{class:'brand-mark'},'F'),'Formalyth'),...['file.new','file.open','file.save','edit.undo','edit.redo'].map(id=>commandButton(id,'icon-button')),h('div',{class:'document-title',id:'document-title'}),h('div',{class:'spacer'}),h('span',{class:'local-badge'},'LOCAL-FIRST'),commandButton('ui.commands','icon-button'),commandButton('ui.theme','icon-button'),commandButton('ui.help','icon-button')),
  h('div',{class:'workspacebar'},h('select',{class:'workspace-select','aria-label':'Workspace',onchange:e=>setWorkspace(e.target.value)},...workspaces.map(w=>h('option',{value:w},w))),h('div',{class:'workspace-tabs'},h('button',{class:'workspace-tab active',id:'workspace-label'},'DESIGN')),h('span',{class:'workspace-hint'},'INDEPENDENT ENGINEERING · EXPERIMENTAL')),
  h('div',{class:'ribbon',id:'ribbon'}),
  h('div',{class:'main-area'},h('aside',{class:'sidebar'},h('div',{class:'panel-header'},'BROWSER',h('span',{class:'spacer'}),commandButton('file.projects','icon-button')),h('label',{class:'browser-search'},icon('inspect',14),h('input',{placeholder:'Search document','aria-label':'Search document',oninput:renderBrowser})),h('div',{class:'browser-content',id:'browser'}),h('div',{class:'browser-footer',id:'save-status'},'Stored on this device')),
  h('main',{class:'viewport',id:'viewport'},h('canvas',{id:'canvas',tabindex:0,'aria-label':'Interactive CAD viewport'}),h('div',{class:'viewport-label'},h('strong',{id:'viewport-title'},'Formalyth'),h('span',{id:'viewport-subtitle'},'Orthographic · shaded with edges')),
  h('div',{class:'viewcube'},button('FRONT',null,()=>renderer.view('front'),'cube-front'),button('TOP',null,()=>renderer.view('top'),'cube-top'),button('RIGHT',null,()=>renderer.view('right'),'cube-right'),button('ISO',null,()=>renderer.view('iso'),'cube-home')),
  h('div',{class:'viewport-watermark'},'FORMALYTH / DESIGN & MANUFACTURING'),h('div',{class:'nav-hint'},'Drag to orbit · Shift-drag to pan · Wheel or pinch to zoom'),
  h('nav',{class:'nav-bar','aria-label':'View controls'},button('Toggle browser','open',()=>$('.sidebar').classList.toggle('mobile-open')),button('Toggle properties','parameters',()=>$('.inspector').classList.toggle('mobile-open')),button('Fit view · F','fit',()=>renderer.fit()),button('Isometric','cube',()=>renderer.view('iso')),button('Wireframe','layers',()=>{renderer.wireframe=!renderer.wireframe;renderer.invalidate();}),button('Section','cut',()=>run('inspect.section'))),
  h('div',{class:'busy-indicator',id:'busy'},h('div',{class:'busy-card'},h('div',{class:'spinner'}),h('div',{},h('strong',{id:'busy-title'},'Computing'),h('small',{},'Isolated worker · cancel stops computation')),button('Cancel',null,()=>workbench.cancel(),'secondary')))),
  h('aside',{class:'inspector'},h('div',{class:'panel-header'},'PROPERTIES'),h('div',{class:'inspector-content',id:'inspector'}))),
  h('div',{class:'timeline'},h('div',{class:'timeline-controls'},button('History start','undo',()=>workbench.history(0)),button('History end','redo',()=>workbench.history(workbench.project.data.model.features.length))),h('div',{class:'timeline-scroll',id:'timeline'}),h('div',{class:'timeline-hint'},'PARAMETRIC HISTORY',h('br'),'Double-click to edit')),
  h('footer',{class:'statusbar'},h('span',{id:'status'},'Ready'),h('span',{class:'spacer'}),h('span',{id:'geometry',class:'status-details'}),h('span',{id:'performance',class:'status-chip status-details'}),h('span',{id:'backend',class:'status-chip'},'Graphics'),h('span',{class:'status-chip'},'mm')));
}
function setWorkspace(name){if(editor||document.querySelector('dialog[data-tool-panel][open]')){toast('Finish or cancel the active sketch first');$('.workspace-select').value=workbench.project.data.view.workspace;return;}if(!workspaces.includes(name))throw new TypeError('Unknown workspace');workbench.project.updateView({workspace:name});renderer.clearLines('overlay');renderScene();renderAll();}
function renderRibbon(){ui?.ribbon();}
function renderBrowser(){ui?.queue.schedule('tree',()=>ui.renderTree());}
function renderTimeline(){ui?.queue.schedule('history',()=>ui.renderTimeline());}
function renderInspector(){ui?.queue.schedule('inspector',()=>ui.inspector());}
function renderScene(items=workbench.scene){
 const scene=ui?ui.visibleScene(items):items;renderer.setScene(scene);renderer.clearLines('profile');
 for(const item of scene){const v=item.value;
  if(v?.kind==='profile'||v?.kind==='region')renderer.setLines(`profile-${item.id}`,profileSegments(v),workbench.selected===item.id?'#ec9d2c':'#1688c9');
  if(v?.kind==='plane'){const points=[[-25,-25,0],[25,-25,0],[25,25,0],[-25,25,0]].map(p=>m4.point(v.frame,p));renderer.setLines(`profile-${item.id}`,points.map((p,i)=>[p,points[(i+1)%4]]),'#b18b39');}
 }
 renderer.select(workbench.selected?[workbench.selected]:[]);
}
function renderAll(){ui?.update();}
const autosave=new Autosave(snapshot=>storage.save('autosave',snapshot),{onStatus:({state,error})=>{
 const node=$('#save-status');if(!node)return;
 node.textContent=state==='saved'?'Saved locally · '+new Date().toLocaleTimeString():state==='saving'?'Saving local snapshot…':state==='error'?(error.code==='PROJECT_CONFLICT'?'Another tab changed this project · export a backup':'Local save failed · export a backup'):'Unsaved local changes';
 if(state==='error')toast(error.message,true);
}});
async function save(){await autosave.flush();}
function coreCommands(){
 const c=(...args)=>commands.add(...args);
 c('file.new','New project','new','File',async name=>{const p=typeof name==='string'?{name}:await formDialog('New project',[{name:'name',label:'Name',value:'Untitled design'}]);if(!p)return;await save();workbench.setProject(new Project(createProject(p.name)));await workbench.rebuild({fit:true});});
 c('file.save','Save project · Ctrl+S','save','File',async()=>{try{await save();}catch{toast('Local storage failed. Exporting a native backup instead.',true);}download(workbench.project.serialize(),workbench.project.data.name+'.formalyth','application/json');});
 c('file.open','Open / import','open','File',()=>{const input=h('input',{type:'file',accept:'.formalyth,.json,.stl,.obj,.ply,.step,.stp,.dxf,.glb,.gltf',onchange:async()=>{const file=input.files[0];if(!file)return;await run('file.import',file);}});input.click();});
 c('file.import','Import file','open','File',async file=>{if(file.size>100*1024*1024)throw new RangeError('Import exceeds 100 MB');await save();const ext=file.name.split('.').pop().toLowerCase();if(['formalyth','json'].includes(ext)){workbench.setProject(Project.parse(await file.text()));await workbench.rebuild({fit:true});}else{const data=['stl','ply','glb'].includes(ext)?await file.arrayBuffer():await file.text(),result=await workbench.task('import',{extension:ext,data});workbench.mutateModel('Import geometry',d=>{for(const b of result.bodies||[])d.addFeature('mesh',{positions:Array.from(b.mesh.positions),indices:Array.from(b.mesh.indices)},[],b.name||file.name);for(const p of result.profiles||[])d.addFeature('sketch',{points:p.points.map(p=>p.slice(0,2)),z:p.z||0},[],file.name+' profile');});await workbench.rebuild({fit:true});if(result.warnings?.length)toast(result.warnings.join('; '));}});
 c('file.projects','Local projects','open','File',async()=>{const rows=await storage.list(),node=h('div');let panel;node.append(button('Save named snapshot','save',async()=>{await storage.save(crypto.randomUUID(),workbench.project);panel.close();run('file.projects');},'full-button'));for(const row of rows)node.append(button(`${row.name} · ${new Date(row.updated).toLocaleString()}`,'open',async()=>{const p=await storage.load(row.id);if(p){panel.close();workbench.setProject(p);await workbench.rebuild({fit:true});}},'full-button'));panel=report('Local project snapshots',node);});
 c('file.examples','Example projects','open','File',()=>{let panel;panel=report('Examples',h('div',{class:'document-cards'},button('Bearing housing','cube',async()=>{await save();workbench.setProject(bearingProject());panel.close();await workbench.rebuild({fit:true});},'document-card'),button('Nested sketch regions','sketch',async()=>{await save();workbench.setProject(new Project(createProject('Nested regions')));panel.close();const r=(a,b)=>[[a,a],[b,a],[b,b],[a,b]],id=await workbench.addFeature('region',{loops:[r(-30,30),r(-20,20),r(-8,8)]},[],'Island profile');await workbench.addFeature('extrudeRegion',{depth:12},[id],'Multi-loop extrusion');renderer.fit();},'document-card')));});
 c('file.export','Export geometry','export','File',async supplied=>{const opts=supplied||await formDialog('Export visible bodies',[{name:'extension',label:'Format',type:'select',options:['stl','obj','ply','glb','gltf','step'],value:'stl'}],{description:'STEP supports faceted B-rep only. Neutral formats do not preserve parametric history.'});if(!opts)return;workbench.assertCurrent();const entries=workbench.scene.filter(i=>i.value?.positions);const data=await workbench.task('export',{entries,extension:opts.extension});download(data,workbench.project.data.name+'.'+opts.extension);return data;});
 c('edit.undo','Undo · Ctrl+Z','undo','Edit',()=>workbench.undo());c('edit.redo','Redo · Ctrl+Shift+Z','redo','Edit',()=>workbench.redo());c('edit.delete','Delete selected','close','Edit',async()=>{if(workbench.selected)await workbench.removeFeature(workbench.selected);});
 c('ui.theme','Toggle theme','theme','View',()=>workbench.project.updateView({theme:workbench.project.data.view.theme==='dark'?'light':'dark'}));
 c('ui.commands','Commands · S','inspect','Help',()=>{const input=h('input',{class:'palette-input',placeholder:'Search commands','aria-label':'Search commands'}),list=h('div',{class:'palette-list'});const panel=report('Command palette',h('div',{},input,list));const update=()=>list.replaceChildren(...commands.search(input.value).map(c=>h('button',{class:'palette-item',onclick:()=>{panel.close();run(c.id);}},icon(c.icon,18),c.label,h('small',{},c.group))));input.addEventListener('input',update);input.addEventListener('keydown',e=>{if(e.key==='Enter')list.querySelector('button')?.click();});update();input.focus();});
 c('ui.help','Help & scope','help','Help',()=>report('Formalyth 0.6 · Experimental',`Independent design and manufacturing workbench.\n\nDrag to orbit, Shift-drag to pan, wheel/pinch to zoom. F fits the model. S opens commands. Ctrl+S exports the entire project.\n\nSelect bodies in the browser or viewport. Double-click a history tile to edit. Right-click for feature actions and history rollback. Numeric modeling fields accept named parameter expressions.\n\nManufacturing, additive jobs, assemblies, studies, drawings and RLC circuits are stored in one native project. Changed geometry invalidates derived results.\n\nBoundaries: faceted solids, not exact trimmed B-rep; no general fillet networks, arbitrary shelling or native proprietary-file compatibility. Milling is experimental three-axis/2.5D. Selected-body FEA uses approximate voxels, not a conforming mesh. Electronics supports ideal linear RLC circuits, not a PCB editor or full device simulator. Independently validate every engineering result and machine program.\n\nSee docs/README.md in the source for architecture, verification and remaining scope.`));
 c('inspect.properties','Inspect geometry','inspect','Inspect',async()=>report('Geometry inspection',await workbench.task('inspect',{body:workbench.selectedValue({mesh:true}).value})));
 c('inspect.section','Section plane','cut','Inspect',async()=>{const d=await formDialog('Z section plane',[{name:'enabled',label:'Enable section',type:'checkbox',value:renderer.clipZ===null},{name:'z',label:'Z coordinate (mm)',type:'number',value:0}]);if(d)renderer.setClip(d.enabled?d.z:null);});
 c('inspect.measure','Measure distance','measure','Inspect',()=>{measuring=true;measurePoints=[];toast('Pick two points on solid surfaces');});
 c('view.restore','Restore model view','cube','View',()=>{renderer.clearLines('overlay');renderer.setClip(null);renderScene();renderer.fit();});
}
async function boot(){
 coreCommands();shell();renderer=new Renderer($('#canvas'),{onError:message=>{const text=typeof message==='string'?message:message.message;graphicsErrors.push(text);toast(text,true);},onPick:hit=>{if(measuring&&hit){measurePoints.push(hit.point);if(measurePoints.length===2){const d=Math.hypot(...measurePoints[0].map((v,i)=>v-measurePoints[1][i]));renderer.setLines('overlay-measure',[measurePoints],'#e6a02d');toast(`Distance ${d.toFixed(4)} mm`);measuring=false;measurePoints=[];}}else workbench.select(workbench.project.data.workspaces.assembly.components.find(c=>c.id===hit?.id)?.featureId||hit?.id||null);}});
 await renderer.initialize({forceWebGL:new URLSearchParams(location.search).get('renderer')==='webgl'});$('#backend').textContent=renderer.backend;
 const ctx={commands,workbench,renderer,storage,autosave,run,button,commandButton,setWorkspace,renderAll,renderScene,getEditor:()=>editor,setEditor:e=>editor=e};
 ribbons={...installModelCommands(ctx),...installWorkspaces(ctx)};installConstructionCommands(ctx,ribbons);installTopologyCommands(ctx,ribbons);ui=new WorkbenchUI(ctx,ribbons);
 workbench.subscribe(event=>{if(event.type==='scene'){renderScene();if(event.fit)renderer.fit();$('#geometry').textContent=`${workbench.scene.filter(i=>i.value?.positions).length} bodies`;$('#performance').textContent=`${workbench.stats.milliseconds.toFixed(1)} ms · ${workbench.stats.reused} reused`;renderAll();}
   if(event.type==='project'&&event.label!=='View'){renderer.clearLines('overlay');}
   if(event.type==='selection'){renderer.select(workbench.selected?[workbench.selected]:[]);renderBrowser();renderTimeline();renderInspector();}
   if(['project','replace'].includes(event.type)){renderAll();if(event.type==='replace')autosave.attach(workbench.project,{dirty:true});}
   if(event.type==='building')modelBusy=event.active;if(event.type==='task'){jobBusy=event.active;jobLabel=event.label||'';}
   if(event.type==='building'||event.type==='task'){$('#busy').classList.toggle('visible',modelBusy||jobBusy);$('#busy-title').textContent=jobBusy?`Computing ${jobLabel}`:'Rebuilding model';$('#status').textContent=modelBusy||jobBusy?'Computing in worker':'Ready';}
 });
 let saved;try{saved=await storage.load('autosave');}catch{}workbench.setProject(saved||bearingProject());await workbench.rebuild({fit:true});ui.update();ui.queue.flush();ui.tree.draw();ui.timeline.draw();$('#boot').remove();
 window.formalyth={version:'0.6.0',ui,selection:ctx.topologySelection,ready:true,graphicsErrors,commands,workbench,renderer,autosave,execute:(id,...args)=>commands.execute(id,...args),setWorkspace};
 document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]')||editor)return;const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();let id=mod&&k==='s'?'file.save':mod&&k==='z'?(e.shiftKey?'edit.redo':'edit.undo'):mod&&k==='o'?'file.open':!mod&&k==='s'?'ui.commands':!mod&&k==='e'?'solid.extrude':null;if(id){e.preventDefault();run(id);}else if(k==='f'&&!mod)renderer.fit();else if(k==='escape'){measuring=false;workbench.select(null);}});
}
boot().catch(e=>{console.error(e);$('#boot').replaceChildren(h('div',{class:'boot-mark'},'F'),h('h1',{},'Unable to start'),h('p',{},e.message),h('p',{},'Serve over HTTPS or localhost with WebGPU or WebGL2 enabled.'));});
