/** Rigid, right-handed sketch frames. All distances are millimeters. */
import {m4, v3} from '../math/index.js';
const vector=(v,name)=>{if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new TypeError(`${name} must be finite XYZ coordinates`);return v;};
const unit=(v,name)=>{vector(v,name);if(v3.length(v)<1e-12)throw new RangeError(`${name} must be nonzero`);return v3.normalize(v);};
export function constructionFrame({plane='XY',origin=[0,0,0],offset=0,rotation=0,normal,xAxis}={}){
  const presets={XY:[[1,0,0],[0,0,1]],XZ:[[1,0,0],[0,-1,0]],YZ:[[0,1,0],[1,0,0]]};
  if(!Object.hasOwn(presets,plane))throw new TypeError('Plane must be XY, XZ or YZ');
  vector(origin,'Origin');if(!Number.isFinite(offset)||!Number.isFinite(rotation))throw new TypeError('Plane offset and rotation must be finite');
  const z=unit(normal||presets[plane][1],'Normal');
  let reference=xAxis||(normal?(Math.abs(z[0])<.9?[1,0,0]:[0,1,0]):presets[plane][0]);vector(reference,'X axis');
  let x=unit(v3.sub(reference,v3.scale(z,v3.dot(reference,z))),'Projected X axis'),y=v3.cross(z,x);
  const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),xx=v3.add(v3.scale(x,c),v3.scale(y,s));
  y=v3.add(v3.scale(x,-s),v3.scale(y,c));x=xx;const o=v3.add(origin,v3.scale(z,offset));
  return [x[0],x[1],x[2],0,y[0],y[1],y[2],0,z[0],z[1],z[2],0,...o,1];
}
export function validateFrame(frame){
  if((!Array.isArray(frame)&&!ArrayBuffer.isView(frame))||frame.length!==16||!Array.from(frame).every(Number.isFinite))throw new TypeError('Expected a finite 4x4 frame');
  if([3,7,11].some(i=>Math.abs(frame[i])>1e-9)||Math.abs(frame[15]-1)>1e-9)throw new TypeError('Frame must be affine');
  const x=Array.from(frame.slice(0,3)),y=Array.from(frame.slice(4,7)),z=Array.from(frame.slice(8,11));
  if([x,y,z].some(a=>Math.abs(v3.length(a)-1)>1e-8)||Math.abs(v3.dot(x,y))>1e-8||v3.distance(v3.cross(x,y),z)>1e-8)throw new TypeError('Frame must be rigid and right-handed');
  return frame;
}
export function profileFrame(profile){
  if(profile.frame)return Array.from(validateFrame(profile.frame));
  // Retain the version-1 sketch placement convention for existing native files.
  if(!['XY','XZ','YZ'].includes(profile.plane||'XY'))throw new TypeError('Unknown sketch plane');
  const rotation=profile.plane==='XZ'?m4.rotation([1,0,0],Math.PI/2):profile.plane==='YZ'?m4.rotation([0,1,0],Math.PI/2):m4.identity();
  const z=profile.z??0;if(!Number.isFinite(z))throw new TypeError('Sketch elevation must be finite');
  return Array.from(m4.multiply(m4.translation(0,0,z),rotation));
}
export function profileSegments(profile){
  const frame=profileFrame(profile),loops=profile.loops||[profile.points];
  return loops.flatMap(loop=>loop.map((p,i)=>[m4.point(frame,[...p,0]),m4.point(frame,[...loop[(i+1)%loop.length],0])]));
}
export function extrusionRange({depth=20,offset=0,extent='oneSide',secondDepth=0}={}){
  if(!Number.isFinite(depth)||Math.abs(depth)<1e-7||!Number.isFinite(offset))throw new RangeError('Extrusion distance must be finite and nonzero');
  switch(extent){
    case 'oneSide':return [offset,offset+depth];
    case 'symmetric':return [offset-Math.abs(depth)/2,offset+Math.abs(depth)/2];
    case 'twoSide':if(depth<=0||!Number.isFinite(secondDepth)||secondDepth<0)throw new RangeError('Two-sided extrusion requires positive first and nonnegative second distances');return [offset-secondDepth,offset+depth];
    default:throw new TypeError('Unknown extrusion extent');
  }
}
