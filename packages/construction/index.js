/** Construction features and multi-loop extrusion with explicit Boolean intent. */
import {transform} from '../kernel/index.js';
import {boolean} from '../kernel/csg.js';
import {extrudeRegions} from '../regions/index.js';
import {m4} from '../math/index.js';
import {registerFeature,featureRegistry} from '../document/index.js';
import {constructionFrame,profileFrame,extrusionRange} from './frames.js';
export * from './frames.js';
export function buildExtrusion(profile,options={},target=null){
  if(!['profile','region'].includes(profile?.kind))throw new TypeError('Extrusion requires a closed sketch or region');
  const operation=options.operation||'new';if(!['new','union','subtract','intersect'].includes(operation))throw new TypeError('Unknown extrusion operation');
  if(operation!=='new'&&(!target?.positions||!target.indices))throw new TypeError('Choose a target body for the Boolean operation');
  const range=extrusionRange(options),lo=Math.min(...range),hi=Math.max(...range),frame=profileFrame(profile);
  const tool=transform(extrudeRegions(profile.loops||[profile.points],hi-lo),m4.multiply(frame,m4.translation(0,0,lo)));
  return operation==='new'?tool:boolean(target,tool,operation,options.tolerance??1e-6);
}
export function installConstructionFeatures(){
  if(!featureRegistry.has('constructionPlane'))registerFeature('constructionPlane',({p,n,numeric})=>({kind:'plane',frame:constructionFrame({plane:p.plane||'XY',origin:numeric(p.origin||[0,0,0]),offset:n('offset',0),rotation:n('rotation',0),...(p.normal?{normal:numeric(p.normal)}:{}),...(p.xAxis?{xAxis:numeric(p.xAxis)}:{})})}));
  if(!featureRegistry.has('extrusion'))registerFeature('extrusion',({p,n,inputs})=>buildExtrusion(inputs[0],{depth:n('depth',20),offset:n('offset',0),extent:p.extent||'oneSide',secondDepth:n('secondDepth',0),operation:p.operation||'new',tolerance:n('tolerance',1e-6)},inputs[1]));
}
