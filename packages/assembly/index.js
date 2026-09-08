/** @module @formalyth/assembly — rigid component frames and acyclic joint kinematics. */
import {m4,v3,finite,integer,bounds} from '../math/index.js';
import {transform,meshBounds,massProperties} from '../kernel/index.js';
import {intersect} from '../kernel/csg.js';
export function rigidMatrix(values=m4.identity()){
  if(values.length!==16||Array.from(values).some(x=>!Number.isFinite(x)))throw new TypeError('A rigid frame needs 16 finite matrix entries');const m=new Float64Array(values);
  if(Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])+Math.abs(m[15]-1)>1e-8)throw new RangeError('Rigid frame must be affine');const axes=[0,4,8].map(i=>Array.from(m.slice(i,i+3)));
  if(axes.some(a=>Math.abs(v3.length(a)-1)>1e-7)||Math.abs(v3.dot(axes[0],axes[1]))>1e-7||Math.abs(v3.dot(axes[1],axes[2]))>1e-7||Math.abs(v3.dot(axes[0],axes[2]))>1e-7||v3.dot(axes[0],v3.cross(axes[1],axes[2]))<.999999)throw new RangeError('Assembly frames require a right-handed rigid rotation, without scale or shear');return m;
}
export function jointFrame({origin=[0,0,0],axis=[0,0,1],xDirection}={}){
  if(origin.length!==3||axis.length!==3)throw new TypeError('Joint frame vectors must be 3D');[...origin,...axis].forEach(finite);if(v3.length(axis)<1e-10)throw new RangeError('Joint axis is zero');const z=v3.normalize(axis),candidate=xDirection||(Math.abs(z[0])<.8?[1,0,0]:[0,1,0]),x=v3.normalize(v3.sub(candidate,v3.scale(z,v3.dot(candidate,z))));if(v3.length(x)<1e-10)throw new RangeError('Frame X direction is parallel to joint axis');const y=v3.cross(z,x),m=m4.identity();m.set(x,0);m.set(y,4);m.set(z,8);m.set(origin,12);return m;
}
function motion(joint,value){
  const limit=(x,min,max)=>{finite(x);if(min!==undefined&&x<finite(min)-1e-9||max!==undefined&&x>finite(max)+1e-9)throw new RangeError(`Joint ${joint.id} exceeds its motion limits`);return x;};
  switch(joint.type){
    case 'fixed':return m4.identity();
    case 'revolute':return m4.rotation([0,0,1],limit(value??joint.value??0,joint.min,joint.max)*Math.PI/180);
    case 'slider':return m4.translation(0,0,limit(value??joint.value??0,joint.min,joint.max));
    case 'cylindrical':{const p=value??joint.value??{};return m4.multiply(m4.translation(0,0,limit(p.distance??0,joint.min,joint.max)),m4.rotation([0,0,1],finite(p.angle??0)*Math.PI/180));}
    case 'planar':{const p=value??joint.value??{};return m4.multiply(m4.translation(finite(p.x??0),finite(p.y??0),0),m4.rotation([0,0,1],finite(p.angle??0)*Math.PI/180));}
    case 'ball':{const p=value??joint.value??{};return m4.multiply(m4.rotation([0,0,1],finite(p.z??0)*Math.PI/180),m4.multiply(m4.rotation([0,1,0],finite(p.y??0)*Math.PI/180),m4.rotation([1,0,0],finite(p.x??0)*Math.PI/180)));}
    default:throw new TypeError(`Unsupported assembly joint: ${joint.type}`);
  }
}
export function evaluateAssembly(assembly,{values={}}={}){
  if(!Array.isArray(assembly?.components)||!Array.isArray(assembly?.joints)||assembly.components.length>1000||assembly.joints.length>1000)throw new RangeError('Invalid assembly size');const components=new Map(),incoming=new Map(),jointIds=new Set();
  for(const c of assembly.components){if(typeof c.id!=='string'||!c.id||components.has(c.id))throw new TypeError('Duplicate or invalid component ID');components.set(c.id,c);rigidMatrix(c.transform);}
  for(const j of assembly.joints){if(!j.id||jointIds.has(j.id))throw new TypeError('Duplicate or missing joint ID');jointIds.add(j.id);if(!components.has(j.child)||j.parent!==null&&j.parent!==undefined&&!components.has(j.parent))throw new ReferenceError('Joint component is missing');if(j.child===j.parent||incoming.has(j.child))throw new RangeError('Closed-loop and multiply constrained assemblies are unsupported');if(components.get(j.child).grounded)throw new RangeError('A grounded component cannot be driven by a joint');incoming.set(j.child,j);}
  const worlds=new Map(),active=new Set();
  const get=id=>{if(worlds.has(id))return worlds.get(id);if(active.has(id))throw new RangeError('Closed-loop joint cycle');active.add(id);const c=components.get(id),j=incoming.get(id);let world;
    if(j){const parent=j.parent?get(j.parent):m4.identity(),a=j.frameA?rigidMatrix(j.frameA):jointFrame({origin:j.origin||[0,0,0],axis:j.axis||[0,0,1]}),b=j.frameB?rigidMatrix(j.frameB):m4.identity();world=m4.multiply(parent,m4.multiply(a,m4.multiply(motion(j,values[j.id]),m4.inverse(b))));}
    else world=rigidMatrix(c.transform);worlds.set(id,world);active.delete(id);return world;
  };
  assembly.components.forEach(c=>get(c.id));return {worlds,components:assembly.components.map(c=>({...c,world:worlds.get(c.id)})),degreesOfFreedom:assembly.joints.reduce((n,j)=>n+({fixed:0,revolute:1,slider:1,cylindrical:2,planar:3,ball:3}[j.type]??0),0),limitations:'Tree-structured kinematics, not a general assembly constraint or dynamic-contact solver.'};
}
export function billOfMaterials(assembly){const groups=new Map();for(const c of assembly.components){const key=String(c.partNumber||c.featureId||c.name||c.id);if(!groups.has(key))groups.set(key,{partNumber:key,name:c.name||key,material:c.material||'',quantity:0,components:[]});const row=groups.get(key);row.quantity++;row.components.push(c.id);}return [...groups.values()].sort((a,b)=>a.partNumber.localeCompare(b.partNumber));}
export function assemblyBodies(assembly,geometries,options={}){const evaluated=evaluateAssembly(assembly,options);return evaluated.components.filter(c=>c.visible!==false).map(c=>{const body=geometries.get(c.featureId);if(!body?.positions)throw new ReferenceError(`No geometry for component ${c.id}`);return {id:c.id,name:c.name||c.id,mesh:transform(body,c.world),world:c.world,source:body,color:c.color};});}
export function interference(assembly,geometries,{exact=false,maxPairs=100,...options}={}){
  integer(maxPairs,1,1000);const bodies=assemblyBodies(assembly,geometries,options),boxes=bodies.map(b=>meshBounds(b.mesh)),pairs=[];
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const size=[0,1,2].map(k=>Math.min(boxes[i].max[k],boxes[j].max[k])-Math.max(boxes[i].min[k],boxes[j].min[k]));if(size.some(v=>v<=1e-7))continue;if(pairs.length>=maxPairs)throw new RangeError('Interference pair budget exceeded');const candidate={a:bodies[i].id,b:bodies[j].id,boundingBoxOverlap:size.reduce((a,b)=>a*b,1),classification:'bounding-box candidate'};if(exact){const common=intersect(bodies[i].mesh,bodies[j].mesh);candidate.volume=massProperties(common).volume;candidate.classification=candidate.volume>1e-6?'faceted volume interference':'no faceted volume interference';}pairs.push(candidate);}
  return {pairs,method:exact?'tolerance-based faceted Boolean intersection':'bounding boxes only; false positives are expected'};
}
export function explodedTransforms(evaluated,geometries,distance=30){finite(distance);const centers=evaluated.components.map(c=>{const b=geometries.get(c.featureId);if(!b)throw new ReferenceError('Missing component geometry');return m4.point(c.world,meshBounds(b).center);}),center=centers.reduce((a,b)=>v3.add(a,b),[0,0,0]).map(x=>x/Math.max(1,centers.length));return new Map(evaluated.components.map((c,i)=>{let direction=v3.normalize(v3.sub(centers[i],center));if(v3.length(direction)<1e-9)direction=[0,0,1];return [c.id,m4.multiply(m4.translation(...v3.scale(direction,distance)),c.world)];}));}
