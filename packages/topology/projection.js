/** Parametric planar-face projection, including inner boundary loops. */
import {m4,v3} from '../math/index.js';
import {constructionFrame} from '../construction/frames.js';
import {classifyRegions} from '../regions/classify.js';
import {buildTopology,resolveFace,TopologyError} from './index.js';
export function faceProfile(body,reference,{tolerance=1e-6}={}){
  const topology=buildTopology(body,{tolerance}),face=resolveFace(topology,reference),frame=constructionFrame({origin:face.origin,normal:face.normal}),inverse=m4.inverse(frame);
  const loops=face.loops.map(loop=>loop.map(id=>{
    const p=topology.points[id];if(Math.abs(v3.dot(face.normal,v3.sub(p,face.origin)))>tolerance*2)throw new TopologyError('PLANAR_REQUIRED','Selected face is not planar within tolerance');
    return m4.point(inverse,p).slice(0,2);
  }));
  return {kind:'region',frame,...classifyRegions(loops,{epsilon:tolerance}),sourceFace:reference};
}
