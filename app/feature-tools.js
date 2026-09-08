import {formDialog,toast} from '../packages/ui/index.js';
import {fieldsFor,valuesFromFields} from '../packages/ui/fields.js';
import {newFeature} from '../packages/workbench/edit-session.js';
/** One reusable panel drives creation and editing; Apply alone changes history. */
export async function featureTool(ctx,{type,params,inputs=[],name=type,featureId=null}={}){
  if(document.querySelector('dialog[data-tool-panel][open]'))throw new Error('Apply or cancel the current tool first');
  if(ctx.getEditor())throw new Error('Finish the sketch first');
  const w=ctx.workbench,feature=featureId?w.project.data.model.features.find(f=>f.id===featureId):newFeature(type,params,inputs,name);
  if(!feature)throw new ReferenceError('Feature not found');
  const fields=fieldsFor(params??feature.params),session=w.beginEdit({label:featureId?'Edit '+feature.name:'Create '+feature.name});
  let output=null;
  const edits=values=>featureId?[{action:'update',id:featureId,patch:{params:values}}]:[{action:'add',feature:{...feature,params:values}}];
  try{
    await formDialog(featureId?'Edit '+feature.name:feature.name,fields,{docked:true,description:'Values accept named expressions. Orbit and zoom remain available. Apply saves one history step; Cancel discards the preview.',
      validate:values=>valuesFromFields(fields,values),preview:values=>session.update(edits(values)),
      commit:async values=>{await session.update(edits(values));output=await session.commit();},onCancel:()=>session.cancel()});
  }finally{if(!session.closed)session.cancel();}
  return output;
}
export function installFeatureTools(ctx){
  const previous=ctx.commands.items.get('feature.edit').run;
  ctx.commands.items.get('feature.edit').run=async id=>{
    const f=ctx.workbench.project.data.model.features.find(f=>f.id===(id||ctx.workbench.selected));if(!f)throw new Error('Select a feature');
    if(f.type==='region')return previous(f.id);
    if(f.type==='sketch'&&!f.params.shape){ctx.workbench.select(f.id);return ctx.commands.execute('sketch.constraintEditor');}
    return featureTool(ctx,{featureId:f.id,params:f.params});
  };
}
