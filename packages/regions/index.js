/** Faceted extrusion of disjoint and nested polygon regions. */
import {extrude, merge, transform} from '../kernel/index.js';
import {boolean} from '../kernel/csg.js';
import {m4} from '../math/index.js';
import {registerFeature, featureRegistry} from '../document/index.js';
import {classifyRegions} from './classify.js';
import {profileFrame,extrusionRange} from '../construction/frames.js';
export {classifyRegions, signedArea} from './classify.js';
export function extrudeRegions(loops,depth,{epsilon=1e-7}={}){
  if(!Number.isFinite(depth)||depth<=epsilon)throw new RangeError('Extrusion depth must be positive');
  const classified=classifyRegions(loops,{epsilon}),over=Math.max(epsilon*100,depth*1e-6);
  const bodies=classified.regions.map(({outer,holes})=>{
    let body=extrude(outer,depth);
    for(const hole of holes){const cutter=transform(extrude(hole,depth+2*over),m4.translation(0,0,-over));body=boolean(body,cutter,'subtract',epsilon);}
    return body;
  });return merge(bodies);
}
export function installRegionFeatures(){
  if(!featureRegistry.has('region'))registerFeature('region',({p,numeric,inputs})=>({kind:'region',...classifyRegions(numeric(p.loops)),frame:profileFrame(inputs[0]?.kind==='plane'?inputs[0]:p)}));
  if(!featureRegistry.has('extrudeRegion'))registerFeature('extrudeRegion',({inputs,n,p})=>{
    if(inputs[0]?.kind!=='region')throw new TypeError('Extrude regions requires a closed-region sketch');
    const range=extrusionRange({depth:n('depth',20),offset:n('offset',0),extent:p.extent||'oneSide',secondDepth:n('secondDepth',0)}),lo=Math.min(...range),hi=Math.max(...range);
    return transform(extrudeRegions(inputs[0].loops,hi-lo),m4.multiply(profileFrame(inputs[0]),m4.translation(0,0,lo)));
  });
}
