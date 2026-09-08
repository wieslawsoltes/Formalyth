# Implemented features and boundaries — 0.2

An implemented entry means a real algorithm and command exist; it does not establish production qualification or parity with another application. The tests in `tests/` and the browser checks in `scripts/browser.mjs` define the demonstrated cases.

| Area | Available in the workbench | Boundaries / not implemented |
| --- | --- | --- |
| Application | Ten contextual workspaces; browser, properties, history, command palette, native dialogs, light/dark themes, responsive panels, keyboard and touch navigation | No multi-user collaboration, accounts, cloud jobs or full UI customization |
| Projects | Native schema-2 files, schema-1 migration, immutable cross-domain transactions, bounded undo/redo, IndexedDB autosave, named snapshots, stale-output tracking | JSON snapshots scale with document size; browser storage is not a backup service |
| Sketching | Interactive rectangles, tessellated circles and closed polygons; move vertices, snapping, multiple loops, holes/islands, undo; dimensioned parametric profiles and JSON-defined numerical constraints | No complete graphical constraint/dimension editor, arbitrary trim/extend, automatic region extraction from intersecting open entities or persistent analytic sketch topology |
| Solid modeling | Primitives, extrusion, revolve, loft, sweep, helix, faceted union/subtract/intersect, holes, box pockets, transforms, patterns, mirrors, specialized tubes/open boxes, parameters and cached feature replay | No exact trimmed B-rep, persistent face naming, general fillet networks, arbitrary shell/draft, broad healing or exact surface intersections |
| Regions | Even/odd nesting, disjoint exteriors, holes, islands, winding normalization, input validation and positive-Z faceted extrusion | Touching/crossing boundaries reject; quadratic boundary validation; polygonal rather than exact curved boundaries |
| Surfaces | Rational NURBS evaluation and tessellated tensor-product patches; loft and sweep | No general trimmed-surface topology, continuity-constrained surface modeling or T-spline environment |
| Mesh | Topology/mass inspection, smoothing, subdivision, vertex-cluster reduction, stitching, section clipping and BVH picking | No guaranteed topology-preserving decimation or robust arbitrary-mesh repair |
| Sheet metal | Constant-width strip folds, bend allowances, developed flat blank and DXF | No arbitrary folded-body unfolding, bend relief inference or full sheet rules |
| Assemblies | Component capture, tree-structured fixed/revolute/slider/cylindrical/planar/ball joints, driving, BOM and bounded interference | No closed-loop constraint solver, contact dynamics or linked external document management |
| Milling | Stock/tool records, contour, pocket with islands, face, peck drilling, sampled parallel ball finishing, regeneration, path overlays, heightfield stock preview, draft generic NC | No qualified posts, full machine/fixture/holder collision, turning, adaptive clearing, simultaneous multi-axis, tool change validation or safe-machine certification |
| Additive | Planar slicing, perimeters, alternating rectilinear infill, top/bottom solid layers, layer preview, draft extrusion paths | No supports/bridging, material profiles, qualified printer setup or machine-specific validation |
| Nesting | Rectangular XY envelope placement with rotation and spacing | Not true polygon nesting or optimized arbitrary-part packing |
| Static analysis | Selected mesh converted to approximate voxel tetrahedra; isotropic linear elasticity, plane restraints/load, deformation and stress results | No conforming tetra mesher, arbitrary face loads, nonlinear material/contact, buckling, fatigue, dynamic or safety qualification |
| Thermal | Selected-body voxel conduction, prescribed temperatures on opposing planes, heat-flow results | No transient heat, radiation, convection-boundary UI or coupled multiphysics |
| Drawing | Orthographic faceted projections, hidden-line classification, projected dimensions, SVG sheet and title data | No complete drafting-standard system, associative annotation editing or exact analytic hidden-line engine |
| Electronics | Circuit JSON editing, ideal RLC plus independent sources, DC, AC sweep and backward-Euler transient; persisted circuit/results | No graphical schematic editor, PCB routing, Gerber generation, semiconductor device models or electrical-product certification |
| Exchange | STL, OBJ, PLY, embedded static glTF/GLB, bounded text DXF, faceted STEP | No foreign native project compatibility; analytic STEP and other unsupported entities reject explicitly |
| Rendering | Native WebGPU and WebGL2 fallback, orthographic camera, shaded faces/creases, clipping, object selection, retained buffers and demand-driven drawing | No photorealistic ray tracing, perspective-camera UI, GPU deformation contours or hardware benchmark qualification |

## Performance behavior

Modeling and expensive jobs execute in separate cancellable workers. Unchanged feature outputs are neither recomputed nor transferred. Numeric geometry remains typed in computation/rendering and is converted to JSON arrays only for project records. Worker restarts use unique cache epochs so retained GPU objects cannot confuse old and new numeric cache versions.

Cold faceted Boolean construction remains a bottleneck; whole-project JSON cloning and large report rendering remain size-dependent. `npm run bench` writes reproducible CPU samples instead of an unsupported FPS claim.

## Verification interpretation

Numerical tests check selected invariants such as topology, volume, parameter caching, equation residuals, analytical circuit responses, state migration and cancellation. Browser tests exercise cross-workspace commands, dialogs, save/load, mobile layout and both rendering backends. Passing these cases is not proof of unrestricted compatibility, numerical robustness for arbitrary models, or machine safety.
