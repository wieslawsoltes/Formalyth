import {formDialog, toast} from '../packages/ui/index.js';
import {faceReference, edgeReference} from '../packages/topology/index.js';
import {expression, parameters} from '../packages/solver/index.js';
import {v3} from '../packages/math/index.js';
import {scalar} from './model.js';
import {roundedEnclosureProject} from '../packages/workbench/examples.js';

/** Share the existing selection cache, source checks and Worker transport. */
export function installSolidEditingCommands(ctx, ribbons, selection) {
  const {workbench:w, commands:c} = ctx;
  const {source, load, snapshot, assert, clear, setMode, getItems} = selection;
  const value = x => expression(x, parameters(w.project.data.model.parameters));
  const picked = (asset,kind) => getItems().filter(i=>i.kind===kind && i.bodyId===asset.id).map(i=>i.index);
  const refs = (asset,topology,p,kind='face') => p[kind==='face'?'faces':'edges'] ||
    (p[kind==='face'?'faceIds':'edgeIds'] || picked(asset,kind)).map(id=>(kind==='face'?faceReference:edgeReference)(topology,id));
  const text = (name,label,initial) => ({name,label,value:initial});
  const bool = (name,label,initial=false) => ({name,label,type:'checkbox',value:initial});
  const common = 'One closed convex polyhedron, up to 96 planar faces. Failed preflight leaves feature history unchanged. Distances and angles accept named parameters.';
  async function prepare(supplied) {
    if (ctx.getEditor()) throw new Error('Finish or cancel the active sketch first');
    const asset=source(supplied?.bodyId || getItems()[0]?.bodyId), context=snapshot(), topology=await load(asset);
    assert(context); return {asset,context,topology};
  }
  async function offset(supplied,all=false) {
    const {asset:a,context:s,topology:t}=await prepare(supplied);
    const p=supplied || await formDialog(all?'Offset entire solid':'Move / offset faces',[
      text('distance','Signed outward normal offset (mm / expression)',2)
    ],{description:common+(all?' Every support plane moves; this is not a scale operation.':` ${picked(a,'face').length} selected face(s). Adjacent planes extend or trim.`)});
    if(!p)return;assert(s);
    const distance=scalar(p.distance??2),allFaces=all||p.allFaces===true,faces=allFaces?[]:refs(a,t,p);
    await w.derived('offsetFaces',{body:a.value,faces:allFaces?null:faces,distance:value(distance)});assert(s);
    const id=await w.addFeature('faceOffset',{faces,allFaces,distance},[a.id],allFaces?'Offset solid':'Offset faces');clear();return id;
  }
  c.add('solid.offsetFaces','Move / offset faces','move','Direct editing',p=>offset(p));
  c.add('solid.offsetAll','Offset solid','cube','Direct editing',p=>offset(p,true));
  c.add('solid.shell','Shell / hollow','cube','Direct editing',async supplied=>{
    const {asset:a,context:s,topology:t}=await prepare(supplied),count=picked(a,'face').length;
    const p=supplied || await formDialog('Hollow a convex solid',[
      text('thickness','Default wall thickness (mm / expression)',2),
      {name:'direction',label:'Wall placement',type:'select',options:['inward','outward','symmetric'],value:'inward'},
      bool('closed','Closed internal cavity (ignore selected opening faces)'),
      {name:'overrides',label:'Wall overrides [{"normal":[1,0,0],"thickness":3}]',type:'textarea',value:'[]',rows:3}
    ],{description:`${count} selected face(s) will become openings. ${common} Retained walls have normal thickness; opening planes stay fixed. Disconnected walls and collapsed cavities reject.`});
    if(!p)return;assert(s);
    const openings=p.closed===true?[]:p.openings||refs(a,t,p);
    if(!openings.length&&p.closed!==true&&!Array.isArray(p.openings))throw new Error('Pick opening faces, or explicitly select a closed internal cavity');
    const thickness=scalar(p.thickness??2),direction=p.direction||'inward';
    const raw=typeof p.overrides==='string'?JSON.parse(p.overrides):p.overrides||[];
    if(!Array.isArray(raw))throw new TypeError('Wall overrides must be a JSON array');
    const overrides=raw.map(o=>({face:o.face||{kind:'planar-face-v1',normal:o.normal},thickness:scalar(o.thickness)}));
    await w.derived('shellConvex',{body:a.value,openings,thickness:value(thickness),options:{direction,overrides:overrides.map(o=>({...o,thickness:value(o.thickness)}))}});assert(s);
    const id=await w.addFeature('convexShell',{openings,thickness,direction,overrides},[a.id],'Hollow shell');setMode('body');return id;
  });
  c.add('solid.round','Faceted edge round','curve','Direct editing',async supplied=>{
    const {asset:a,context:s,topology:t}=await prepare(supplied);
    const p=supplied || await formDialog('Constant-radius edge round',[
      text('radius','Radius (mm / expression)',2),{name:'segments',label:'Tangent-plane segments per arc',type:'number',min:2,max:64,value:12}
    ],{description:`${picked(a,'edge').length} selected edge(s). Convex straight edges only. Multiple edges must be parallel and must not meet. Arc surfaces are faceted with a reported radial bound; corner blends are not included.`});
    if(!p)return;assert(s);
    const radius=scalar(p.radius??2),segments=scalar(p.segments??12),edges=refs(a,t,p,'edge');
    const {result}=await w.derived('roundEdges',{body:a.value,edges,radius:value(radius),options:{segments:value(segments)}});assert(s);
    const id=await w.addFeature('edgeRound',{edges,radius,segments},[a.id],'Faceted edge round');clear();
    toast(`Round saved · radial deviation ≤ ${result.meta.maxRadialDeviation.toFixed(5)} mm`);return id;
  });
  c.add('solid.draft','Draft faces','sheet','Direct editing',async supplied=>{
    const {asset:a,context:s,topology:t}=await prepare(supplied),planes=[...w.assets.values()].filter(x=>w.available.has(x.id)&&x.value?.kind==='plane');
    const p=supplied || await formDialog('Draft about a neutral plane',[
      text('angle','Signed draft angle (degrees / expression)',5),
      {name:'planeId',label:'Neutral construction plane',type:'select',options:[{value:'',label:'Explicit world plane'},...planes.map(x=>({value:x.id,label:w.project.data.model.features.find(f=>f.id===x.id)?.name||x.id}))]},
      text('normal','Explicit neutral normal [x,y,z]','[0,0,1]'),text('origin','Explicit neutral origin [x,y,z] (mm)','[0,0,0]'),
      bool('allSides','Draft all faces not parallel to the neutral plane')
    ],{description:`${picked(a,'face').length} selected face(s). ${common} Positive angles taper toward the positive neutral normal. The face/neutral intersection line remains fixed.`});
    if(!p)return;assert(s);
    const angle=scalar(p.angle??5),normal=typeof p.normal==='string'?JSON.parse(p.normal):p.normal||[0,0,1],origin=typeof p.origin==='string'?JSON.parse(p.origin):p.origin||[0,0,0];
    const plane=p.planeId?planes.find(x=>x.id===p.planeId):null;if(p.planeId&&!plane)throw new Error('Neutral construction plane is unavailable');
    const frame=plane?.value.frame,n=frame?[frame[8],frame[9],frame[10]]:normal.map(value),o=frame?[frame[12],frame[13],frame[14]]:origin.map(value);
    const faces=p.allSides?t.faces.filter(f=>Math.abs(v3.dot(f.normal,v3.normalize(n)))<1-1e-8).map(f=>faceReference(t,f.id)):refs(a,t,p);
    await w.derived('draftFaces',{body:a.value,faces,angle:value(angle),options:{normal:n,origin:o}});assert(s);
    const id=await w.addFeature('faceDraft',{faces,angle,normal,origin},[a.id,...(plane?[plane.id]:[])],'Drafted faces');clear();return id;
  });
  c.add('example.enclosure','Rounded enclosure example','open','Examples',async()=>{
    if(ctx.getEditor())throw new Error('Finish or cancel the sketch first');
    await c.execute('file.new','Rounded enclosure');w.setProject(roundedEnclosureProject());await w.rebuild({fit:true});
    if(w.errors.length)throw new Error(w.errors.map(e=>e.message).join('; '));setMode('body');ctx.setWorkspace('Design');return w.project.data.id;
  });
  const group=['Direct editing',['solid.offsetFaces','solid.offsetAll','solid.draft','solid.round','solid.shell','example.enclosure']];
  ribbons.Design.splice(1,0,group);ribbons.Mesh.splice(1,0,group);
}
