import {registerFeature, featureRegistry} from '../document/index.js';
import {offsetFaces, draftFaces, shellConvex, roundEdges} from './editing.js';
/** Feature handlers preserve support descriptors and expressions in native data. */
export function installEditingFeatures() {
  if (!featureRegistry.has('faceOffset')) registerFeature('faceOffset', ({p,n,inputs}) =>
    offsetFaces(inputs[0], p.allFaces === true ? null : p.faces, n('distance',1), {tolerance:n('tolerance',1e-6)}));
  if (!featureRegistry.has('convexShell')) registerFeature('convexShell', ({p,n,numeric,inputs}) =>
    shellConvex(inputs[0], p.openings || [], n('thickness',2), {
      direction:p.direction || 'inward', tolerance:n('tolerance',1e-6),
      overrides:(p.overrides || []).map(o => ({face:o.face, thickness:numeric(o.thickness)}))
    }));
  if (!featureRegistry.has('edgeRound')) registerFeature('edgeRound', ({p,n,inputs}) =>
    roundEdges(inputs[0], p.edges, n('radius',2), {segments:n('segments',12), tolerance:n('tolerance',1e-6)}));
  if (!featureRegistry.has('faceDraft')) registerFeature('faceDraft', ({p,n,numeric,inputs}) => {
    const plane=inputs[1], frame=plane?.kind==='plane'?plane.frame:null;
    if (inputs.length>1 && !frame) throw new TypeError('Draft neutral reference must be a construction plane');
    return draftFaces(inputs[0], p.faces, n('angle',5), {
      normal:frame?[frame[8],frame[9],frame[10]]:numeric(p.normal || [0,0,1]),
      origin:frame?[frame[12],frame[13],frame[14]]:numeric(p.origin || [0,0,0]), tolerance:n('tolerance',1e-6)
    });
  });
}
