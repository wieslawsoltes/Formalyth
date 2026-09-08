import {formDialog,report,h,toast} from '../packages/ui/index.js';
import {RegionEditor} from '../packages/ui/sketch.js';
import {parameters} from '../packages/solver/index.js';
import {rectangle,circle} from '../packages/kernel/index.js';
export const scalar=value=>typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value;
export async function parameterDialog(title,defaults,description='Numeric modeling fields accept named parameter expressions.'){
 const fields=Object.entries(defaults).map(([name,value])=>({name,label:name.replace(/([A-Z])/g,' $1'),type:typeof value==='boolean'?'checkbox':typeof value==='object'?'textarea':'text',value:typeof value==='object'?JSON.stringify(value):value}));
 return formDialog(title,fields,{description,validate:values=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,typeof defaults[key]==='object'?JSON.parse(value):scalar(value)]))});
}
export function installModelCommands(ctx){
 const {commands,workbench:w,renderer}=ctx,c=(...args)=>commands.add(...args);
 const body=()=>w.selectedValue({mesh:true});
 const feature=(id,label,image,type,defaults,requires=false)=>c(id,label,image,'Modeling',async supplied=>{const input=requires?body():null,p=supplied||await parameterDialog(label,defaults);if(p)return w.addFeature(type,p,input?[input.id]:[],label);});
 feature('solid.box','Box','cube','box',{width:60,depth:40,height:12,radius:0});
 feature('solid.cylinder','Cylinder','circle','cylinder',{radius:18,height:30,segments:64});
 feature('solid.cone','Cone','cube','cone',{radius:20,topRadius:8,height:35,segments:64});
 feature('solid.sphere','Sphere','circle','sphere',{radius:20,segments:48});
 feature('solid.torus','Torus','circle','torus',{majorRadius:25,minorRadius:6,segments:64});
 feature('solid.move','Move / rotate','move','move',{x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1},true);
 feature('solid.holes','Holes','circle','holes',{radius:4,centers:[[0,0]],through:true,depth:5,segments:48},true);
 feature('solid.pocket','Pocket','cut','pocket',{width:30,depth:20,cutDepth:5,radius:2,x:0,y:0},true);
 feature('solid.pattern','Pattern','pattern','pattern',{count:3,circular:false,x:40,y:0,z:0,angle:120},true);
 feature('solid.mirror','Mirror','pattern','mirror',{axis:'X'},true);
 feature('solid.tube','Tube','circle','tube',{radius:20,thickness:2,height:30});
 feature('solid.shellbox','Open box','cube','shellBox',{width:60,depth:40,height:30,thickness:2});
 feature('solid.helix','Helical sweep','curve','helix',{radius:15,pitch:6,turns:4,tubeRadius:1.5,segments:192});
 feature('mesh.smooth','Smooth','curve','smooth',{iterations:2,strength:.2},true);
 feature('mesh.subdivide','Subdivide','pattern','subdivide',{iterations:1},true);
 feature('mesh.simplify','Reduce mesh','layers','simplify',{cellSize:1},true);
 feature('mesh.stitch','Stitch vertices','joint','stitch',{tolerance:1e-6},true);
 feature('surface.patch','NURBS patch','curve','surface',{grid:Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>[(i-1.5)*20,(j-1.5)*20,Math.sin(i*Math.PI/3)*Math.cos(j*Math.PI/3)*20])),degreeU:3,degreeV:3,steps:32});
 c('sketch.create','Create sketch','sketch','Sketch',async supplied=>{
   const plane=w.assets.get(w.selected)?.value?.kind==='plane'?w.selected:null;
   if(supplied?.loops)return w.addFeature('region',{loops:supplied.loops},plane?[plane]:[],'Closed sketch regions');
   if(ctx.getEditor())return;
   const editor=new RegionEditor(document.querySelector('#viewport'),{onFinish:async loops=>{await w.addFeature('region',{loops},plane?[plane]:[],'Closed sketch regions');ctx.setEditor(null);toast('Sketch saved. Select Extrude to create a solid.');},onCancel:()=>ctx.setEditor(null)});ctx.setEditor(editor);
 });
 c('sketch.parametric','Dimensioned sketch','rectangle','Sketch',async supplied=>{const p=supplied||await parameterDialog('Parametric sketch',{shape:'rectangle',width:50,depth:30,radius:15,rx:25,ry:15,x:0,y:0,z:0,plane:'XY',segments:64},'Shape: rectangle, circle or ellipse. Width, radius and other dimensions accept named expressions.');if(p){if(!['rectangle','circle','ellipse'].includes(p.shape))throw new TypeError('Shape must be rectangle, circle, or ellipse');return w.addFeature('sketch',p,[],'Dimensioned '+p.shape);}});
 c('sketch.constraints','Constraint sketch','parameters','Sketch',async supplied=>{const p=supplied||await parameterDialog('Numerically constrained sketch',{points:[[0,0],[30,1],[31,20],[0,21]],constraints:[{type:'fixed',a:0,x:0,y:0},{type:'horizontal',a:0,b:1},{type:'vertical',a:1,b:2},{type:'horizontal',a:2,b:3},{type:'vertical',a:3,b:0},{type:'distance',a:0,b:1,value:30},{type:'distance',a:1,b:2,value:20}],plane:'XY'},'Constraint indices refer to points. Supported: fixed, coincidence, horizontal/vertical, dimensions, parallel/perpendicular, angle, midpoint and more. Inconsistent constraints fail explicitly.');if(p)return w.addFeature('sketch',p,[],'Constrained sketch');});
 c('solid.extrude','Extrude','extrude','Modeling',async supplied=>{
  const profiles=[...w.assets.values()].filter(a=>w.available.has(a.id)&&['profile','region'].includes(a.value?.kind));
  const opts=profiles.map(a=>({value:a.id,label:w.project.data.model.features.find(f=>f.id===a.id)?.name||a.id}));opts.push({value:'new',label:'New rectangle profile'});
  const p=supplied||await formDialog('Extrude profile',[{name:'profileId',label:'Profile',type:'select',options:opts,value:profiles.some(p=>p.id===w.selected)?w.selected:opts[0].value},{name:'depth',label:'Distance / expression (mm)',value:20},{name:'width',label:'New rectangle width (mm)',value:50},{name:'height',label:'New rectangle depth (mm)',value:30}]);if(!p)return;
  let id=p.profileId||w.selected;if(id==='new'||!id)id=await w.addFeature('sketch',{shape:'rectangle',width:scalar(p.width||50),depth:scalar(p.height||30)},[],'Extrusion sketch');
  const value=w.assets.get(id)?.value;if(!['region','profile'].includes(value?.kind))throw new TypeError('Select a closed sketch profile');
  return w.addFeature(value.kind==='region'?'extrudeRegion':'extrude',{depth:scalar(p.depth)},[id],'Extrude');
 });
 c('solid.revolve','Revolve','curve','Modeling',async supplied=>{let selected=w.assets.get(w.selected);const defaults={innerRadius:12,outerRadius:24,height:30,angle:360,segments:64};const p=supplied||await parameterDialog('Revolve about Z axis',defaults,'Uses the selected single-loop parametric sketch as radius/height coordinates. Without a selected sketch, creates the specified rectangular radial profile.');if(!p)return;let id=selected?.value?.kind==='profile'?selected.id:null;if(!id){if(p.outerRadius<=p.innerRadius)throw new RangeError('Outer radius must exceed inner radius');id=await w.addFeature('sketch',{points:[[p.innerRadius,0],[p.outerRadius,0],[p.outerRadius,p.height],[p.innerRadius,p.height]]},[],'Radial profile');}return w.addFeature('revolve',{angle:p.angle,segments:p.segments},[id],'Revolve');});
 c('solid.loft','Loft','layers','Modeling',async supplied=>{const p=supplied||await parameterDialog('Loft sections',{sections:[{profile:circle(24,48),z:0},{profile:circle(14,48),z:25},{profile:circle(20,48),z:50}],samples:48},'Sections are XY polygon profiles with Z heights. The output is a faceted loft.');if(p)return w.addFeature('loft',p,[],'Loft');});
 c('solid.sweep','Sweep','curve','Modeling',async supplied=>{const p=supplied||await parameterDialog('Sweep a profile',{radius:4,path:[[0,0,0],[0,0,20],[8,0,35],[25,0,40],[45,0,40]]},'Uses a selected single-loop sketch; otherwise creates a circular profile. Sharp paths may self-intersect and require validation.');if(!p)return;let id=w.assets.get(w.selected)?.value?.kind==='profile'?w.selected:null;if(!id)id=await w.addFeature('sketch',{shape:'circle',radius:p.radius,segments:32},[],'Sweep profile');return w.addFeature('sweep',{path:p.path},[id],'Sweep');});
 c('solid.combine','Combine','cut','Modeling',async supplied=>{const items=w.scene.filter(i=>i.value?.positions);if(items.length<2)throw new Error('Create two bodies first');const options=items.map(i=>({value:i.id,label:i.name})),p=supplied||await formDialog('Boolean combine',[{name:'a',label:'Target body',type:'select',options,value:options[0].value},{name:'b',label:'Tool body',type:'select',options,value:options[1].value},{name:'operation',label:'Operation',type:'select',options:['union','subtract','intersect']}]);if(p){if(p.a===p.b)throw new Error('Target and tool must differ');return w.addFeature('boolean',{operation:p.operation},[p.a,p.b],p.operation);}});
 c('feature.parameter','Edit parameter','parameters','Modeling',(id,key,value)=>w.editFeature(id,{params:{[key]:scalar(value)}}));
 c('feature.edit','Edit feature','parameters','Modeling',async id=>{const f=w.project.data.model.features.find(f=>f.id===(id||w.selected));if(!f)throw new Error('Select a feature');
  if(f.type==='sketch'&&!f.params.shape){w.select(f.id);return commands.execute('sketch.constraintEditor');}
  if(f.type==='region'){if(ctx.getEditor())return;const editor=new RegionEditor(document.querySelector('#viewport'),{loops:f.params.loops,onFinish:async loops=>{await w.editFeature(f.id,{params:{loops}});ctx.setEditor(null);},onCancel:()=>ctx.setEditor(null)});ctx.setEditor(editor);return;}
  const p=await formDialog('Edit '+f.name,[{name:'name',label:'Name',value:f.name},{name:'params',label:'Parameters (JSON)',type:'textarea',value:JSON.stringify(f.params,null,2),rows:14},{name:'color',label:'Body color (#rrggbb)',value:f.color}],{validate:d=>({...d,params:JSON.parse(d.params)})});if(p){if(!/^#[0-9a-f]{6}$/i.test(p.color))throw new TypeError('Expected #rrggbb color');await w.editFeature(f.id,p);}
 });
 c('design.parameters','Parameters','parameters','Modeling',async supplied=>{const values=supplied||await parameterDialog('Named parameter expressions',w.project.data.model.parameters);if(values){parameters(values);w.mutateModel('Parameters',d=>d.transact('Parameters',data=>data.parameters=values));await w.rebuild();}});
 // A JSON editor also allows adding or removing named definitions in an empty project.
 c('design.parameterTable','Parameter table','parameters','Modeling',async()=>{const p=await formDialog('Named parameters',[{name:'json',label:'Name → numeric expression',type:'textarea',value:JSON.stringify(w.project.data.model.parameters,null,2),rows:12}],{validate:d=>{const values=JSON.parse(d.json);parameters(values);return values;}});if(p){w.mutateModel('Parameters',d=>d.transact('Set parameters',data=>data.parameters=p));await w.rebuild();}});
 return {'Design':[['Create',['sketch.create','sketch.parametric','solid.extrude','solid.revolve','solid.loft','solid.sweep']],['Primitives',['solid.box','solid.cylinder','solid.sphere','solid.torus']],['Modify',['solid.holes','solid.pocket','solid.combine','solid.move','solid.pattern','solid.mirror']],['Inspect',['inspect.measure','inspect.properties','inspect.section']],['Manage',['design.parameterTable','file.export']]],
 'Surface':[['Create',['surface.patch','solid.loft','solid.sweep','solid.helix']],['Construct',['solid.cone','solid.tube','solid.shellbox']],['Sketch',['sketch.parametric','sketch.constraints']],['Inspect',['inspect.properties','file.export']]],
 'Mesh':[['Modify',['mesh.smooth','mesh.subdivide','mesh.simplify','mesh.stitch']],['Inspect',['inspect.properties','inspect.section','inspect.measure']],['Data',['file.open','file.export','view.restore']]]};
}
