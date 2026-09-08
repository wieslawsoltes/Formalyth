/** Convex support-plane edits, hollow bodies and sampled straight-edge rounds. */
import {v3} from '../math/index.js';
import {massProperties, meshBounds} from '../kernel/index.js';
import {boolean} from '../kernel/csg.js';
import {buildTopology, resolveFace, resolveEdge, TopologyError} from './index.js';
import {requireConvex, clipPolygons, triangulateConvexPolygons} from './operations.js';
import {intersectHalfspaces} from './halfspaces.js';
const fail = (code, message) => { throw new TopologyError(code, message); };
const finite = (value, name) => { if (!Number.isFinite(value)) fail('VALUE', `${name} must be finite`); return value; };
function supports(body, options) {
  const topology = buildTopology(body, options); requireConvex(topology);
  if (topology.faces.length > 96) fail('LIMIT', 'Convex editing supports at most 96 planar faces');
  return {topology, planes: topology.faces.map(f => ({normal: f.normal, origin: f.origin, tag: `face:${f.id}`}))};
}
function faces(topology, references, allowEmpty = false) {
  if (!Array.isArray(references) || (!allowEmpty && !references.length) || references.length > 96) fail('REFERENCE', 'Select valid planar faces');
  const result = references.map(r => resolveFace(topology, r));
  if (new Set(result.map(f => f.id)).size !== result.length) fail('REFERENCE', 'Duplicate selected faces');
  return result;
}
const shifted = (plane, distance) => ({...plane, origin: v3.add(plane.origin, v3.scale(plane.normal, distance))});
/** Positive distance moves selected supports outwards; adjacent planes extend
 * or trim by intersection. null explicitly selects all support planes. */
export function offsetFaces(body, references, distance, options = {}) {
  finite(distance, 'Offset');
  const {topology, planes} = supports(body, options), ids = new Set((references === null ? topology.faces : faces(topology, references)).map(f => f.id));
  if (Math.abs(distance) <= topology.tolerance * 4) fail('DISTANCE', 'Offset magnitude must exceed four tolerances');
  return intersectHalfspaces(planes.map((p, i) => shifted(p, ids.has(i) ? distance : 0)), {
    ...options, tolerance: topology.tolerance, requireAll: true,
    meta: {kind: 'faceOffset', distance, faceCount: ids.size, scope: 'convex-planar'}
  }).body;
}
/** A positive draft narrows the selected support above the neutral plane and
 * widens it below. The original support/neutral intersection line is invariant. */
export function draftFaces(body, references, angle, {
  normal = [0, 0, 1], origin = [0, 0, 0], ...options
} = {}) {
  finite(angle, 'Draft angle');
  if (Math.abs(angle) < 1e-5 || Math.abs(angle) > 60) fail('ANGLE', 'Draft angle magnitude must be between 0.00001 and 60 degrees');
  if (!Array.isArray(normal) || normal.length !== 3 || !normal.every(Number.isFinite) || v3.length(normal) < 1e-12 ||
      !Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) fail('PLANE', 'Invalid neutral plane');
  normal = v3.normalize(normal);
  const {topology, planes} = supports(body, options), selected = faces(topology, references), a = angle * Math.PI / 180;
  for (const f of selected) {
    const cosine = v3.dot(f.normal, normal), s2 = 1 - cosine * cosine;
    if (s2 < 1e-10) fail('ANGLE', 'Draft face must intersect the neutral plane, not be parallel to it');
    const delta = v3.dot(normal, v3.sub(origin, f.origin));
    const tangent = v3.scale(v3.sub(normal, v3.scale(f.normal, cosine)), 1 / Math.sqrt(s2));
    const pivot = v3.add(f.origin, v3.scale(tangent, delta / Math.sqrt(s2)));
    planes[f.id] = {tag: `face:${f.id}`, origin: pivot, normal: v3.add(v3.scale(f.normal, Math.cos(a)), v3.scale(tangent, Math.sin(a)))};
  }
  return intersectHalfspaces(planes, {...options, tolerance: topology.tolerance, requireAll: true,
    meta: {kind: 'faceDraft', angle, faceCount: selected.length, scope: 'convex-neutral-plane'}}).body;
}
/** Hollow a convex polyhedron. Opening planes remain at their source position;
 * retained walls have the specified normal thickness. Closed cavities allowed.
 * Multiple openings must still leave one connected material boundary. */
export function shellConvex(body, openings, thickness, {
  direction = 'inward', overrides = [], ...options
} = {}) {
  finite(thickness, 'Wall thickness');
  if (!['inward', 'outward', 'symmetric'].includes(direction)) fail('VALUE', 'Shell direction must be inward, outward or symmetric');
  const {topology, planes} = supports(body, options), e = topology.tolerance;
  if (thickness <= e * 8) fail('DISTANCE', 'Wall thickness must exceed eight tolerances');
  const removed = new Set(faces(topology, openings, true).map(f => f.id));
  if (removed.size === planes.length) fail('COLLAPSE', 'A shell must retain at least one wall');
  if (!Array.isArray(overrides) || overrides.length > planes.length) fail('REFERENCE', 'Invalid wall-thickness overrides');
  const widths = planes.map(() => thickness), overridden = new Set();
  for (const override of overrides) {
    const f = resolveFace(topology, override?.face);
    if (removed.has(f.id) || overridden.has(f.id)) fail('REFERENCE', 'Duplicate override or override on an opening face');
    if (!Number.isFinite(override.thickness) || override.thickness <= e * 8) fail('DISTANCE', 'Wall override must exceed eight tolerances');
    widths[f.id] = override.thickness; overridden.add(f.id);
  }
  const outerFactor = direction === 'outward' ? 1 : direction === 'symmetric' ? .5 : 0;
  const outerPlanes = planes.map((p, i) => shifted(p, removed.has(i) ? 0 : widths[i] * outerFactor));
  const innerPlanes = planes.map((p, i) => shifted(p, removed.has(i) ? 0 : -widths[i] * (1 - outerFactor)));
  const limits = {...options, tolerance: e, requireAll: true};
  const outer = intersectHalfspaces(outerPlanes, limits).body, core = intersectHalfspaces(innerPlanes, limits).body;
  const outerVolume = massProperties(outer).volume, coreVolume = massProperties(core).volume;
  if (coreVolume <= e ** 3 || outerVolume - coreVolume <= e ** 3) fail('COLLAPSE', 'Wall thickness collapses the shell or its cavity');
  // Extend opening planes past the outer envelope. Retained side planes still
  // bound the cutter; redundant opening caps need not survive this extension.
  const over = Math.max(...meshBounds(outer).size) * 4 + Math.max(...widths);
  const cutter = removed.size ? intersectHalfspaces(innerPlanes.map((p, i) => shifted(p, removed.has(i) ? over : 0)), {...limits, requireAll: false}).body : core;
  const result = boolean(outer, cutter, 'subtract', e), check = buildTopology(result, {tolerance: e});
  if (!check.closed || check.components !== (removed.size ? 1 : 2)) fail('TOPOLOGY', 'Openings leave disconnected material or invalid shell topology');
  const measured = massProperties(result).volume, expected = outerVolume - coreVolume;
  if (Math.abs(measured - expected) > Math.max(expected * 1e-7, e * Math.max(...meshBounds(outer).size) ** 2 * 8)) fail('TOPOLOGY', 'Shell volume verification failed');
  result.meta = {kind: 'shell', faceted: true, direction, thickness, openingCount: removed.size,
    variableWalls: overrides.length, scope: 'convex-planar', cavityVolume: coreVolume};
  return result;
}
/** Tangent-plane approximation of a constant-radius straight-edge fillet.
 * Selected edges may not share endpoints. End faces trim the cylindrical round;
 * rolling-ball vertex blends and concave edge rounds are deliberately rejected.
 */
export function roundEdges(body, references, radius, {segments = 12, ...options} = {}) {
  finite(radius, 'Round radius');
  if (!Array.isArray(references) || !references.length || references.length > 32 || !Number.isInteger(segments) || segments < 2 || segments > 64 || references.length * segments > 512) fail('LIMIT', 'Round requires 1–32 edges, 2–64 segments and at most 512 total samples');
  const {topology} = supports(body, options), e = topology.tolerance;
  if (radius <= e * 8) fail('DISTANCE', 'Round radius must exceed eight tolerances');
  let polygons = requireConvex(topology);
  const edges = references.map(r => resolveEdge(topology, r));
  if (new Set(edges.map(x => x.id)).size !== edges.length) fail('REFERENCE', 'Duplicate rounded edges');
  const axis = edge => v3.normalize(v3.sub(...edge.vertices.map(id => topology.points[id])));
  if (edges.length > 1 && edges.some(edge => Math.abs(v3.dot(axis(edges[0]), axis(edge))) < 1 - 1e-10))
    fail('ROUND_JUNCTION', 'Multiple rounds must be parallel; intersecting cylindrical blends are not implemented');
  const tangentCuts = new Map();
  const endpoints = [];
  for (const edge of edges) for (const id of edge.vertices) {
    if (endpoints.some(p => v3.distance(p, topology.points[id]) <= e * 4)) fail('ROUND_JUNCTION', 'Selected rounds meet at a vertex; rolling-ball corner blends are not implemented');
    endpoints.push(topology.points[id]);
  }
  const cuts = []; let maxDeviation = 0;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i], [a, b] = edge.faces.map(id => topology.faces[id].normal), theta = Math.acos(Math.max(-1, Math.min(1, v3.dot(a, b)))), halfCosine = Math.cos(theta / 2);
    if (theta < 1e-5 || halfCosine < 1e-5) fail('ANGLE', 'Rounded edge supports are nearly parallel or opposite');
    const bisector = v3.normalize(v3.add(a, b)), center = v3.sub(edge.midpoint, v3.scale(bisector, radius / halfCosine));
    // Validate the *ideal* cylindrical tangency footprint, not only the sampled
    // bevel. Otherwise coarse facets can leave a false planar sliver where two
    // true fillets have already consumed the whole support face.
    for (const id of edge.faces) {
      const faceNormal = topology.faces[id].normal;
      const contact = v3.add(center, v3.scale(faceNormal, radius));
      const inward = v3.normalize(v3.sub(contact, edge.midpoint));
      if (!tangentCuts.has(id)) tangentCuts.set(id, []);
      tangentCuts.get(id).push({contact, inward});
    }
    maxDeviation = Math.max(maxDeviation, radius * (1 / Math.cos(theta / (2 * segments)) - 1));
    for (let j = 1; j < segments; j++) {
      const t = j / segments, normal = v3.normalize(v3.add(v3.scale(a, Math.sin((1 - t) * theta)), v3.scale(b, Math.sin(t * theta))));
      cuts.push({normal, origin: v3.add(center, v3.scale(normal, radius)), tag: `round:${i}:${j}`});
    }
  }
  for (const [id, limits] of tangentCuts) {
    const face = topology.faces[id]; let ring = face.loops[0].map(i => topology.points[i]);
    for (const {contact, inward} of limits) {
      const next = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const da = v3.dot(inward, v3.sub(a, contact)), db = v3.dot(inward, v3.sub(b, contact));
        if (da >= -e) next.push(a);
        if ((da >= -e) !== (db >= -e)) next.push(v3.lerp(a, b, Math.max(0, Math.min(1, da / (da - db)))));
      }
      ring = next;
    }
    let area = 0;
    for (let i = 1; i + 1 < ring.length; i++) area += Math.abs(v3.dot(face.normal, v3.cross(v3.sub(ring[i], ring[0]), v3.sub(ring[i + 1], ring[0])))) / 2;
    if (area <= e * e * 16) fail('COLLAPSE', 'Ideal round tangency consumes a support face; reduce radius');
  }
  if (maxDeviation < e * 4) fail('PRECISION', 'Round facets are below the geometric tolerance; reduce segments or increase radius');
  for (const cut of cuts) {
    const result = clipPolygons(polygons, cut.normal, cut.origin, e, cut.tag);
    if (!result.changed) fail('COLLAPSE', 'Rounded edges overlap or a selected round no longer cuts the solid');
    polygons = result.polygons;
  }
  const tags = new Set(polygons.map(p => p.tag));
  if (topology.faces.some(f => !tags.has(`face:${f.id}`)) || cuts.some(c => !tags.has(c.tag))) fail('COLLAPSE', 'Round removes a support face or overlaps another round; reduce radius');
  return triangulateConvexPolygons(polygons, e, {kind: 'edgeRound', faceted: true, radius, segments,
    edgeCount: edges.length, maxRadialDeviation: maxDeviation, scope: 'convex-straight-parallel-nonmeeting-edges'});
}
