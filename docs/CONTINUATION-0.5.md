# Formalyth 0.5 — direct solid editing and hollow enclosures

This release adds five integrated modeling commands to **Design / Mesh → Direct editing**. They use the existing face/edge picker, cancellable Workers, support-reference descriptors, named parameters, feature replay, undo/redo and native project schema. No external geometry kernel, framework or runtime dependency was added.

## Available workflows

**Move / offset faces** moves selected planar supports by a signed normal distance. Positive moves outward; negative moves inward. Neighboring support planes extend or trim at their new intersections. **Offset solid** applies that distance to every support plane, rather than scaling vertex positions. A 40 × 30 × 20 box offset outward by 2 becomes 44 × 34 × 24. All original support faces must survive.

**Draft faces** tilts selected supports about their intersection with a neutral plane. Use a construction-plane feature or an explicit world normal/origin. Positive angle narrows the body above the neutral plane, toward its positive normal, and expands it below. The neutral intersection line remains fixed. The all-sides option selects faces not parallel to the neutral plane. Plane-reference edits rebuild the draft; parallel faces, vanished supports, invalid intersections and angles outside the supported range reject explicitly.

**Shell / hollow** removes selected opening faces and creates normal-thickness walls. Inward, outward and symmetric wall placement are supported. Opening planes stay at the source position in all three modes. A closed internal cavity requires an explicit choice when there is no face selection. Per-face thickness overrides accept support normals and expressions, for example:

```json
[{"normal":[1,0,0],"thickness":"wall * 2"}]
```

Overrides apply only to retained walls. Adjacent or opposite openings are allowed when the resulting material stays connected. A closed cavity has two oriented boundary components: the outward exterior and inward cavity surface. This is not two separate material bodies. The operation checks closed topology and verifies material volume against exterior minus cavity volume. Disconnected residual walls and collapsed cavities reject before feature insertion.

**Faceted edge round** constructs a tangent-plane approximation to a constant-radius cylindrical fillet on selected straight convex edges. Multiple selected edges must be parallel and must not meet. End faces trim the cylindrical surface; no spherical corner patch or rolling-ball junction is synthesized. The result records its radial-deviation bound, and the UI reports that bound after construction. This is genuine geometry, not a shading effect, but it is not an exact analytic cylinder.

**Rounded enclosure example** creates a parametric blank, four rounded side edges and an open shell. Width, depth, height, cornerRadius and wall remain editable in the parameter table. It demonstrates that the new operations compose into a native history-based model.

## Reusable algorithms

`packages/topology/halfspaces.js` reconstructs the bounded intersection of support planes. It enumerates nonsingular plane triples, tests candidate vertices against all halfspaces, orders face boundaries and rebuilds checked closed topology. It does not guess an oversized bounding box. Plane calculations use a local origin to preserve accuracy for small models far from world zero. This is floating-point construction, not exact predicates or exact B-rep.

`packages/topology/editing.js` provides `offsetFaces`, `draftFaces`, `shellConvex` and `roundEdges`. `editing-features.js` registers `faceOffset`, `faceDraft`, `convexShell` and `edgeRound`; the application Engine installs these automatically. Operations are also available as direct job-worker tasks. Source changes during a dialog or preflight invalidate the request. Stable topology error codes now survive Worker transport.

For a round radius r, angle θ between adjacent outward face normals, and N sampling intervals, the tangent-facet radial excess is bounded by:

```text
r × (sec(θ / (2N)) − 1)
```

The ideal cylindrical tangency setback is r × tan(θ/2). The algorithm separately checks this ideal footprint: coarse tangent facets must not leave a false planar sliver after the requested true fillets have consumed that support. That overlap case has a regression test at several sample counts.

## Limits and reference behavior

Convex editing accepts a single closed outward-oriented convex polyhedron with at most 96 planar faces. Reconstruction has a default 16-million potential plane-test budget. Near-singular triples below the determinant threshold are excluded; collapsed, unbounded or invalid reconstructions fail. A result must preserve all original supports unless the internal opening cutter explicitly allows redundant cap planes.

Round requests accept 1–32 edges, 2–64 sampling intervals per edge and at most 512 total intervals. Very small features below the active topology tolerance reject. The reported deviation is local to the cylindrical arc approximation; it is not a certificate for arbitrary surface intersections or manufactured tolerances.

Face references still identify a uniquely resolving oriented support normal. Translations and support-preserving dimension changes can resolve; rotations, draft-modified normals and topology-changing edits can invalidate downstream references. There is no unrestricted persistent face naming. Concave offsets/shells/drafts, exact curved offsets, interacting fillet networks and rolling-ball vertex blends remain unimplemented.

## API examples

```js
import {box} from '../packages/kernel/index.js';
import {offsetFaces, shellConvex, draftFaces} from '../packages/topology/editing.js';
const top = {kind:'planar-face-v1', normal:[0,0,1]};
const side = {kind:'planar-face-v1', normal:[1,0,0]};
const body = box(40,30,20);
const taller = offsetFaces(body, [top], 5);
const larger = offsetFaces(body, null, 2); // explicit all-support offset
const hollow = shellConvex(body, [top], 2, {direction:'inward'});
const tapered = draftFaces(body, [side], 5, {normal:[0,0,1], origin:[0,0,0]});
```

In the browser, `window.formalyth.execute` accepts `solid.offsetFaces`, `solid.offsetAll`, `solid.shell`, `solid.draft`, `solid.round` and `example.enclosure`. Face/edge commands accept explicit persisted descriptors or transient `faceIds`/`edgeIds` that are resolved before saving. `bodyId` selects an available source body; omitted arguments open the interactive dialogs. `solid.shell` uses `openings` or the selected faces, and `closed:true` explicitly requests a sealed cavity. `solid.draft` optionally takes `planeId`.

## Regression and release checks

New numerical tests cover analytical box offsets, wall/cavity volumes, variable thickness, adjacent/opposed openings, orientation, ideal tapered-volume integrals, transformed and far-translated fixtures, round convergence, radial bounds, failed-reference behavior, budgets, atomic preflight and input ownership. Feature tests cover expression replay, construction-plane dependencies, native persistence, error-code transport and a composed rounded enclosure.

`scripts/solid-editing-browser.mjs` is part of the mandatory release gate. It uses real pointer face/edge picks and submits shell, face-offset, draft and round dialogs; it also exercises parameter edits, native reload, unsupported-operation rejection and the enclosure example. The exact Actions run and retained reports determine the release's browser/deployment outcome. Software-adapter graphics checks remain separate from physical-GPU performance qualification.

The mathematical half-space convention is described in the public [CGAL half-space intersection reference](https://doc.cgal.org/latest/Convex_hull_3/group__PkgConvexHull3Functions.html). This independent implementation uses direct plane intersections, not that library's source or its dual-hull implementation.
