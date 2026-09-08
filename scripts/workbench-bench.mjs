/** Deterministic CPU/editing samples. No inference about physical GPU throughput. */
import {FeatureGraph,editModel} from '../packages/document/graph.js';
import {emptyDocument} from '../packages/document/index.js';
import {Engine} from '../packages/tasks/engine.js';
import {visibleRange} from '../packages/ui/scheduling.js';
export function workbenchBench(sample){
 const features=Array.from({length:5000},(_,i)=>({id:'chain-'+i,name:'Feature '+i,type:i?'move':'box',inputs:i?['chain-'+(i-1)]:[],params:i?{x:.01}:{width:1,depth:1,height:1},visible:null,suppressed:false})).reverse();
 const graph=sample('5000-feature-index',()=>new FeatureGraph(features));
 const model={...emptyDocument('Editing sample'),features:[{id:'box',name:'Box',type:'box',inputs:[],params:{width:20,depth:15,height:10},visible:null,suppressed:false}]},engine=new Engine();engine.evaluate({document:model});
 const edits=[{action:'update',id:'box',patch:{params:{width:30}}}],preview=sample('preview-edit',()=>engine.preview({document:model,edits,session:'benchmark'}));
 const adopted=engine.evaluate({document:editModel(model,edits)});
 if(adopted.errors.length||adopted.stats.computed)throw new Error('Validated preview was not adopted without recomputation');
 return {graphVertices:graph.byId.size,previewCached:preview.stats.computed===0,applyComputed:adopted.stats.computed,
   visibleRowsAt5000:visibleRange(5000,70000,560,28).last-visibleRange(5000,70000,560,28).first,
   note:'Engine/CPU samples. First preview computes the edit; repeats reuse it. DOM counts are measured separately in browser tests.'};
}
