import {installEditingFeatures} from './editing-features.js';
import {faceProfile} from './projection.js';
import {registerFeature,featureRegistry} from '../document/index.js';
import {chamferEdges,splitConvex} from './operations.js';
export function installTopologyFeatures(){
  installEditingFeatures();
  if(!featureRegistry.has('faceSketch'))registerFeature('faceSketch',({p,n,inputs})=>faceProfile(inputs[0],p.face,{tolerance:n('tolerance',1e-6)}),{consumeInputs:false});
  if(!featureRegistry.has('edgeChamfer'))registerFeature('edgeChamfer',({p,n,inputs})=>chamferEdges(inputs[0],p.edges,n('distance',1),{tolerance:n('tolerance',1e-6)}));
  if(!featureRegistry.has('splitConvex'))registerFeature('splitConvex',({p,n,numeric,inputs})=>{
    const frame=inputs[1]?.kind==='plane'?inputs[1].frame:null,normal=frame?[frame[8],frame[9],frame[10]]:numeric(p.normal||[0,0,1]),origin=frame?[frame[12],frame[13],frame[14]]:numeric(p.origin||[0,0,0]);
    if(p.side!=='negative'&&p.side!=='positive')throw new TypeError('Split side must be negative or positive');
    return splitConvex(inputs[0],{normal,origin,tolerance:n('tolerance',1e-6)})[p.side];
  });
}
