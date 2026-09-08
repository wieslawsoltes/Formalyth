import {h,toast,formDialog,report} from '../packages/ui/index.js';
import {m4} from '../packages/math/index.js';
import {expression,parameters} from '../packages/solver/index.js';
import {meshBounds} from '../packages/kernel/index.js';
import {edgeReference,faceReference} from '../packages/topology/index.js';
import {nearestFaceEdge,selectionSegments} from '../packages/topology/picking.js';
import {scalar} from './model.js';
/** Integrated selection and commands; numerical topology/operations stay in Workers. */
export function installTopologyCommands(ctx,ribbons){
  const {workbench:w,renderer:r,commands:c}=ctx,cache=new Map();let sequence=0,mode='body',items=[];
  const snapshot=()=>({project:w.project,version:w.project.data.geometryVersion,timeline:w.project.data.view.timeline});
  const current=s=>s.project===w.project&&s.version===w.project.data.geometryVersion&&s.timeline===w.project.data.view.timeline;
  const assert=s=>{w.assertCurrent();if(!current(s))throw new DOMException('Source changed during selection or editing; select again','AbortError');};
  const source=id=>{w.assertCurrent();const a=id?w.assets.get(id):w.selectedValue({mesh:true});if(!a?.value?.positions||!w.available.has(a.id))throw new Error('Select an available model body, not an assembly or result preview');return a;};
  async function load(asset){
    const key=`${asset.id}:${asset.version}`;if(!cache.has(key)){const task=w.derived('topology',{body:asset.value}).then(x=>x.result).catch(e=>{cache.delete(key);throw e;});cache.set(key,task);if(cache.size>4)cache.delete(cache.keys().next().value);}
    return cache.get(key);
  }
  const clear=()=>{sequence++;items=[];r.clearLines('selection-detail');document.querySelector('#topology-selection')?.remove();};
  function paint(){
    // Source sketches remain visible after projection; do not leave their former
    // selected color behind when a body edge becomes the active selection.
    for(const [id,line] of r.lines)if(id.startsWith('profile-')){
      const sourceId=id.slice(8),value=w.assets.get(sourceId)?.value;
      if(value?.kind==='region'||value?.kind==='profile')line.color=w.selected===sourceId?'#ec9d2c':'#1688c9';
    }
    document.querySelector('#topology-selection')?.remove();r.clearLines('selection-detail');
    if(mode==='body')return;
    const panel=h('section',{id:'topology-selection',class:'info-card tint'},h('strong',{},mode==='edge'?'EDGE SELECTION':'FACE SELECTION'),h('p',{},items.length?`${items.length} selected · Shift-click adds or removes`:'Click a visible face or near its boundary. Shift-click selects more.'));
    for(const item of items){const value=item.kind==='edge'?item.topology.edges[item.index]:item.topology.faces[item.index];panel.append(h('div',{},`${item.kind} ${item.index+1} · ${(item.kind==='edge'?value.length:value.area).toFixed(3)} ${item.kind==='edge'?'mm':'mm²'}`));}
    panel.append(ctx.button('Clear selection','close',()=>{clear();paint();},'full-button'));document.querySelector('#inspector')?.prepend(panel);
    const segments=items.flatMap(item=>{const matrix=r.items.get(item.bodyId)?.model||m4.identity();return selectionSegments(item.topology,item.kind,item.index).map(s=>s.map(p=>m4.point(matrix,p)));});
    if(segments.length)r.setLines('selection-detail',segments,'#f39b24');
    document.querySelector('#status').textContent=`Select ${mode}s${items.length?` · ${items.length} selected`:''}`;
  }
  function setMode(value){if(!['body','face','edge'].includes(value))throw new TypeError('Unknown selection mode');if(ctx.getEditor())throw new Error('Finish the sketch first');mode=value;clear();paint();}
  const originalPick=r.onPick;
  r.onPick=(hit,event={})=>{
    if(mode==='body'||ctx.getEditor())return originalPick(hit,event);
    const token=++sequence,s=snapshot();
    (async()=>{
      if(!hit){items=[];w.select(null);paint();return;}
      const asset=source(hit.id),topology=await load(asset);assert(s);if(token!==sequence)return;
      const faceId=topology.triangleFaces[hit.triangle];if(faceId===undefined)throw new Error('Picked triangle is not part of the current topology');
      const matrix=r.items.get(hit.id)?.model||m4.identity(),edge=mode==='edge'?nearestFaceEdge(topology,faceId,p=>r.project(m4.point(matrix,p)),event.x,event.y,12):null;
      if(mode==='edge'&&!edge){toast('Click closer to a visible geometric edge');return;}
      const index=mode==='edge'?edge.id:faceId,kind=mode,entry={bodyId:hit.id,assetVersion:asset.version,kind,index,topology};
      if(!(event.shift||event.ctrl)||items.some(i=>i.bodyId!==hit.id||i.kind!==kind))items=[];
      const old=items.findIndex(i=>i.bodyId===hit.id&&i.index===index&&i.kind===kind);if(old>=0)items.splice(old,1);else items.push(entry);
      w.select(hit.id);paint();
    })().catch(e=>{if(e.name!=='AbortError')toast(e.message,true);});
  };
  let state=snapshot();w.subscribe(event=>{
    if(!current(state)){state=snapshot();cache.clear();clear();}
    if(event.type==='selection'&&items.some(i=>i.bodyId!==w.selected))clear();
    if(event.type==='scene'&&items.some(i=>w.assets.get(i.bodyId)?.version!==i.assetVersion))clear();
    if(['scene','selection','project','replace'].includes(event.type))queueMicrotask(paint);
  });
  for(const [value,label]of [['body','Pick bodies'],['face','Pick faces'],['edge','Pick edges']])c.add('selection.'+value,label,value==='edge'?'measure':value==='face'?'sheet':'cube','Selection',()=>setMode(value));
  const measure=c.items.get('inspect.measure'),baseMeasure=measure.run;measure.run=(...args)=>{setMode('body');return baseMeasure(...args);};
  c.add('inspect.topology','Inspect topology','inspect','Selection',async()=>{const a=source(),s=snapshot(),t=await load(a);assert(s);report('Oriented mesh topology',{...t.summary,closed:t.closed,referencePolicy:'Support normals must resolve uniquely. Rotated, removed or ambiguous faces require reselection.',faces:t.faces.slice(0,100).map(f=>({id:f.id,area:f.area,normal:f.normal,loops:f.loops.length})),edges:t.edges.slice(0,100).map(e=>({id:e.id,length:e.length,faces:e.faces})),truncated:t.faces.length>100||t.edges.length>100});});
  c.add('solid.chamfer','Edge chamfer','cut','Modify',async supplied=>{
    const a=source(supplied?.bodyId||items[0]?.bodyId),s=snapshot(),t=await load(a);assert(s);
    const picked=items.filter(i=>i.kind==='edge'&&i.bodyId===a.id),p=supplied||await formDialog('Equal-distance edge chamfer',[{name:'distance',label:'Setback on each face (mm / expression)',value:1},{name:'allEdges',label:'Chamfer every geometric edge',type:'checkbox',value:false}],{description:`${picked.length} selected edge(s). Closed convex polyhedra only. Concave solids, ambiguous references and distances consuming a support face are rejected.`});if(!p)return;assert(s);
    const refs=p.edges||((p.allEdges?t.edges.map(e=>e.id):p.edgeIds||picked.map(i=>i.index)).map(id=>edgeReference(t,id)));
    const distance=scalar(p.distance??1);await w.derived('chamfer',{body:a.value,edges:refs,distance:expression(distance,parameters(w.project.data.model.parameters))});assert(s);
    const id=await w.addFeature('edgeChamfer',{edges:refs,distance},[a.id],'Edge chamfer');clear();return id;
  });
  c.add('sketch.fromFace','Sketch from face','sketch','Sketch',async supplied=>{
    const selected=items.find(i=>i.kind==='face'),a=source(supplied?.bodyId||selected?.bodyId),s=snapshot(),t=await load(a);assert(s);
    const id=supplied?.faceId??selected?.index,reference=supplied?.face||(id===undefined?null:faceReference(t,id));if(!reference)throw new Error('Use Pick faces and select a planar face first');
    await w.derived('faceProfile',{body:a.value,face:reference});assert(s);const feature=await w.addFeature('faceSketch',{face:reference},[a.id],'Projected face sketch');setMode('body');return feature;
  });
  c.add('solid.split','Split convex body','cut','Modify',async supplied=>{
    const a=source(supplied?.bodyId),s=snapshot(),b=meshBounds(a.value),planes=[...w.assets.values()].filter(a=>w.available.has(a.id)&&a.value?.kind==='plane');
    const p=supplied||await formDialog('Split with a plane',[{name:'planeId',label:'Construction plane',type:'select',options:[{value:'',label:'Explicit origin and normal'},...planes.map(a=>({value:a.id,label:w.project.data.model.features.find(f=>f.id===a.id)?.name||a.id}))]},{name:'normal',label:'Normal [x,y,z]',value:'[0,0,1]'},{name:'origin',label:'Origin [x,y,z] (mm)',value:JSON.stringify(b.center)},{name:'keep',label:'Keep',type:'select',options:['both','negative','positive']}],{description:'Creates capped solids from one closed convex polyhedron. A construction-plane dependency updates both halves. Concave bodies are explicitly unsupported.'});if(!p)return;assert(s);
    const normal=typeof p.normal==='string'?JSON.parse(p.normal):p.normal||[0,0,1],origin=typeof p.origin==='string'?JSON.parse(p.origin):p.origin||b.center,plane=p.planeId?planes.find(a=>a.id===p.planeId):null;if(p.planeId&&!plane)throw new Error('Construction plane is unavailable');
    const frame=plane?.value.frame,values=parameters(w.project.data.model.parameters),numeric=v=>v.map(x=>expression(x,values));
    await w.derived('splitConvex',{body:a.value,options:{normal:frame?[frame[8],frame[9],frame[10]]:numeric(normal),origin:frame?[frame[12],frame[13],frame[14]]:numeric(origin)}});assert(s);
    const keep=p.keep||'both';if(!['both','negative','positive'].includes(keep))throw new TypeError('Invalid split side');
    const ids=w.mutateModel('Split convex body',d=>(keep==='both'?['negative','positive']:[keep]).map(side=>d.addFeature('splitConvex',{normal,origin,side},[a.id,...(plane?[plane.id]:[])],`Split ${side}`)));
    w.selected=ids.at(-1);await w.rebuild();clear();return ids;
  });
  const group=['Select & modify',['selection.body','selection.face','selection.edge','solid.chamfer','solid.split','sketch.fromFace','inspect.topology']];
  ribbons.Design.unshift(group);ribbons.Mesh.unshift(group);ribbons.Surface.unshift(['Select',['selection.body','selection.face','sketch.fromFace','inspect.topology']]);
  ctx.topologySelection={get mode(){return mode;},get items(){return items.map(({topology,...i})=>i);},setMode,clear};
  return ctx.topologySelection;
}
