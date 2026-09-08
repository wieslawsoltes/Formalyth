# Formalyth 0.4 — topology selection, chamfers, splits and face-derived sketches

This release extends the integrated workbench with a DOM-free topology library, Worker-backed modeling operations, native feature-history persistence and real viewport selection. The model remains faceted. There is no claim of exact analytic B-rep, unrestricted persistent naming, general concave chamfers or fillets.

## Use in the application

In Design or Mesh, the **Select & modify** group offers Pick bodies, Pick faces, Pick edges, Edge chamfer, Split convex body, Sketch from face and Inspect topology. Face picking maps the hit triangle to its connected planar patch. Edge picking searches only geometric boundaries of the visible hit face within a 12-CSS-pixel tolerance; triangulation diagonals are not selectable. Selected boundaries are outlined and the inspector reports area or length. Shift-click adds/removes selections on the same body. Selection is cleared after source-geometry/timeline changes rather than silently keeping stale indices.

**Edge chamfer** accepts selected straight edges, or an explicit all-edges choice, and an equal setback distance on both incident faces. Distance can reference a named parameter. The operation supports one closed convex polyhedron. It rejects concave bodies, malformed topology, ambiguous support references, degenerate distances, and bevels that consume an original support face or another bevel. This is a bounded planar bevel operation, not general rounded-edge filleting.

**Split convex body** accepts a construction-plane feature or an explicit world-space normal/origin. Keep the negative side, positive side, or both. Both outputs have oriented planar caps and remain parametric. Creating both halves is one project undo transaction. Moving the construction plane rebuilds the halves. A tangent or external plane does not count as a split. Concave, open and disconnected bodies reject rather than substituting approximate geometry.

**Sketch from face** creates a dependency-linked region from a uniquely resolved planar face, preserving its local frame and inner boundary loops. It follows source dimensions and does not hide the referenced body. The resulting region can feed the existing extrusion/cut workflow. It is an associative projection, not an independently editable unconstrained copy. The face reference can be inspected through the feature parameters.

## Libraries and contracts

`packages/topology/index.js` builds oriented half-edge connectivity, connected coplanar faces, ordered boundary loops and straight geometric edges. It welds triangle-soup coordinates by actual distance, handles subdivided edges and reports open boundaries/components. Typed arrays store triangle indices, opposite half-edges and triangle-to-face mappings. The default topology budget is 200,000 triangles and tolerance is 1e-6 mm. See [Topology](TOPOLOGY.md) for numerical scope.

`operations.js` implements convexity validation, half-space clipping, equal-distance chamfer planes and capped splits. Every output is rebuilt as a closed, connected, genus-zero triangle mesh before it is accepted. Inputs are not mutated. `projection.js` projects a planar face through a rigid, right-handed frame and uses the existing region classifier for nested loops. `picking.js` contains the DOM-free screen-distance and boundary-outline helpers.

`features.js` registers `edgeChamfer`, `splitConvex` and `faceSketch`. Engine installs these handlers in the modeling Worker and exposes topology/chamfer/split/projection tasks through the existing cancellable job Worker. `registerFeature` now accepts `{consumeInputs:false}` for reference features: dependencies still evaluate and invalidate caches, but they do not automatically hide their source bodies. Existing handlers retain their default consuming behavior.

Geometric references contain oriented support normals, not triangle IDs. They can survive translations, support-preserving dimension changes and triangle reordering. Missing normals or multiple matching planar patches fail explicitly. Rotating a source, changing its support topology, curved-face identification and general semantic face naming are outside this descriptor's contract. Selection indices are transient; only validated support descriptors are saved in new features.

The UI keeps at most four topology-cache entries keyed by evaluated asset version. Numerical construction is Worker-backed; repeated picks reuse topology. Source context is checked after asynchronous computation and dialogs, and failed operation preflight does not add a feature. Modeling replay uses the existing dependency cache; unchanged new features produce no changed-geometry transfers.

## API examples

```js
import {buildTopology, edgeReference, faceReference} from './packages/topology/index.js';
import {chamferEdges, splitConvex} from './packages/topology/operations.js';
import {faceProfile} from './packages/topology/projection.js';
import {box} from './packages/kernel/index.js';
const body = box(40, 30, 20);
const topology = buildTopology(body);
const bevel = chamferEdges(body, [edgeReference(topology, 0)], 2);
const halves = splitConvex(bevel, {origin:[0,0,10], normal:[0,0,1]});
const top = topology.faces.find(face => face.normal[2] > 0.999);
const profile = faceProfile(body, faceReference(topology, top.id));
```

Browser automation can call `selection.face`, `selection.edge`, `solid.chamfer`, `solid.split` and `sketch.fromFace` through `window.formalyth.execute`. Supplied chamfer arguments may use `bodyId`, explicit serialized `edges`, transient `edgeIds`, or `allEdges:true`; the command resolves transient IDs before persistence. Split accepts `bodyId`, optional `planeId`, `normal`, `origin`, and `keep`. `window.formalyth.selection` exposes mode and transient selected IDs without exposing its cached connectivity.

## Verification

The added Node tests cover connectivity, soup welding, nonmanifold rejection, support-reference stability/ambiguity, analytical bevel volume, intersecting bevel planes, rigid transforms, split volume conservation, cap topology, large coordinates, face holes, parametric replay, native round trips and screen-space selection. The complete local numerical/domain suite has 199 passing tests.

`scripts/topology-browser.mjs` extends the mandatory browser release gate with real pointer face/edge picks, a submitted chamfer dialog, driving-parameter edits, source-preserving face sketches, transactional splits, native reload and rejected concave operations. Browser and publication outcomes must be read from the exact commit's Actions run and artifacts, not inferred from the existence of test code. Native WebGPU testing remains required; software-adapter tests are not physical-GPU throughput qualification.
