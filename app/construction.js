import {h,formDialog,toast} from '../packages/ui/index.js';
import {ConstraintEditor} from '../packages/ui/constraints.js';
import {parameters} from '../packages/solver/index.js';
import {scalar} from './model.js';
const rectangle=()=>({points:[[-20,-15],[20,-15],[20,15],[-20,15]],circles:[],constraints:[{type:'fixed',a:0,x:-20,y:-15},{type:'horizontal',a:0,b:1},{type:'vertical',a:1,b:2},{type:'horizontal',a:2,b:3},{type:'vertical',a:3,b:0}]});
export function installConstructionCommands(ctx,ribbons){
  const {workbench:w,commands}=ctx;
  commands.add('construct.plane','Construction plane','sheet','Construct',async supplied=>{
    const p=supplied||await formDialog('Construction plane',[{name:'plane',label:'Base orientation',type:'select',options:['XY','XZ','YZ']},{name:'origin',label:'Origin [x,y,z] / expressions',value:'[0,0,0]'},{name:'offset',label:'Offset along normal (mm)',value:0},{name:'rotation',label:'Rotation in plane (degrees)',value:0},{name:'normal',label:'Custom normal [x,y,z] (optional)',value:''}]);if(!p)return;
    const data={plane:p.plane||'XY',origin:typeof p.origin==='string'?JSON.parse(p.origin):p.origin||[0,0,0],offset:scalar(p.offset??0),rotation:scalar(p.rotation??0)};if(p.normal)data.normal=typeof p.normal==='string'?JSON.parse(p.normal):p.normal;
    return w.addFeature('constructionPlane',data,[],'Construction plane');
  });
  commands.add('solid.extrusion','Extrude / cut','extrude','Modeling',async supplied=>{
    w.assertCurrent();const profiles=[...w.assets.values()].filter(a=>w.available.has(a.id)&&['profile','region'].includes(a.value?.kind)),bodies=w.scene.filter(a=>a.value?.positions);
    if(!profiles.length)throw new Error('Create a closed sketch first');
    const choices=profiles.map(a=>({value:a.id,label:w.project.data.model.features.find(f=>f.id===a.id)?.name||a.id}));
    const p=supplied||await formDialog('Profile extrusion',[{name:'profileId',label:'Sketch',type:'select',options:choices,value:profiles.some(a=>a.id===w.selected)?w.selected:choices.at(-1).value},{name:'depth',label:'Distance (signed mm / expression)',value:20},{name:'extent',label:'Extent',type:'select',options:[{value:'oneSide',label:'One side'},{value:'symmetric',label:'Symmetric (total distance)'},{value:'twoSide',label:'Two sides'}]},{name:'secondDepth',label:'Second-side distance (mm)',value:10},{name:'offset',label:'Start offset along sketch normal (mm)',value:0},{name:'operation',label:'Operation',type:'select',options:[{value:'new',label:'New body'},{value:'union',label:'Join'},{value:'subtract',label:'Cut'},{value:'intersect',label:'Intersect'}]},{name:'targetId',label:'Boolean target',type:'select',options:[{value:'',label:'No target'},...bodies.map(b=>({value:b.id,label:b.name}))],value:bodies[0]?.id||''}],{description:'Uses the sketch construction plane, including nested holes and islands. Symmetric distance is the total extent. Boolean geometry remains faceted.'});if(!p)return;
    const id=p.profileId||w.selected;if(!profiles.some(a=>a.id===id))throw new TypeError('Sketch is unavailable');const operation=p.operation||'new',inputs=[id];if(operation!=='new'){if(!bodies.some(b=>b.id===p.targetId))throw new TypeError('Select an available target body');inputs.push(p.targetId);}
    return w.addFeature('extrusion',{depth:scalar(p.depth??20),extent:p.extent||'oneSide',secondDepth:scalar(p.secondDepth??0),offset:scalar(p.offset??0),operation},inputs,operation==='subtract'?'Extrusion cut':operation==='union'?'Extrusion join':'Profile extrusion');
  });
  commands.add('sketch.constraintEditor','Constrained sketch','parameters','Sketch',async supplied=>{
    if(ctx.getEditor())return;const project=w.project,version=project.data.geometryVersion,selected=w.project.data.model.features.find(f=>f.id===w.selected),value=w.assets.get(w.selected)?.value;
    const editing=selected?.type==='sketch'&&!selected.params.shape,plane=value?.kind==='plane'?selected.id:null;
    const data=supplied?.sketch||(editing?{points:selected.params.points,constraints:selected.params.constraints||[],circles:selected.params.circles||[]}:rectangle());
    if(data.points.length>64||(data.circles||[]).length)throw new RangeError('Graphical constraint editor currently supports one polygon with at most 64 vertices and no circles');
    const editor=new ConstraintEditor(document.querySelector('#viewport'),{sketch:data,solve:sketch=>w.task('solveSketch',{sketch,parameters:parameters(project.data.model.parameters)},{key:'interactive-sketch'}),onFinish:async sketch=>{
      if(project!==w.project||version!==project.data.geometryVersion)throw new Error('Project changed during sketch editing. Cancel and reopen the sketch.');
      if(editing)await w.editFeature(selected.id,{params:sketch});else await w.addFeature('sketch',sketch,plane?[plane]:[],'Constrained polygon');ctx.setEditor(null);toast('Driving constraints saved in feature history');
    },onCancel:()=>{w.jobTasks.cancelKey?.('interactive-sketch');ctx.setEditor(null);}});ctx.setEditor(editor);await editor.ready;
    return editor.session.report;
  });
  ribbons.Design.unshift(['Sketch & construct',['construct.plane','sketch.constraintEditor','solid.extrusion']]);
  ribbons.Surface.unshift(['Construct',['construct.plane','solid.extrusion']]);
}
