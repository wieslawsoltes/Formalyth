# Architecture

## Layers and ownership

`app/main.js` builds the native-DOM shell. `app/model.js` and `app/workspaces.js` register user commands against the same headless `Workbench` controller. UI controls do not directly mutate renderer geometry or invent successful modeling results: commands change project state, await worker evaluation, and present returned results.

| Package | Responsibility |
| --- | --- |
| math | Vectors, matrices, numerical helpers and input checks |
| kernel | Faceted solids, triangulation, Booleans, NURBS evaluation, topology, sections and spatial queries |
| regions | Boundary validation, containment hierarchy and even/odd material extrusion |
| solver | Safe arithmetic expressions, named parameters and nonlinear sketch constraints |
| document | Feature registry, dependencies, parameter resolution and cached evaluation |
| project | Immutable versioned cross-workspace data, transactions, migration, undo/redo and stale-result tracking |
| workbench | Headless command-side controller, selection, rebuild scheduling and result attachment |
| tasks | Bounded cancellable worker queues, structured transfer ownership and engine dispatch |
| renderer | Camera, retained WebGPU/WebGL2 resources, shaded/edge rendering, clipping and picking |
| manufacturing | Bounded draft milling, offsets, sampled stock simulation, planar FFF and rectangular-envelope nesting |
| sheet | Constant-width strip folds, bend allowance and developed blanks |
| assembly | Component transforms, tree-joint kinematics, BOM and faceted interference |
| analysis | Voxel tetrahedra, linear elasticity and steady conduction |
| drawing | Faceted orthographic projection, hidden-line classification and SVG sheets |
| electronics | Ideal linear RLC DC, AC and backward-Euler transient analysis |
| exchange | Explicitly bounded neutral-format parsers and writers |
| ui | Safe DOM creation, original icons, command registry, dialogs and closed-region editor |

Computational modules import no browser DOM APIs. `project/storage.js` is a separate IndexedDB adapter. `tasks/engine.js` can execute in a browser Worker or Node integration test. `app/engine.worker.js` is only the worker transport entry point.

## Modeling path

A command clones the modeling document through `DesignDocument`, applies a feature edit, and commits the result through `Project.transact`. The workbench schedules an `evaluate` job on the modeling worker with the selected history endpoint. `FeatureEvaluator` resolves parameters and dependencies, reuses valid cache entries and returns explicit per-feature errors.

`Engine` attaches a worker-epoch plus cache-version key to outputs. It transfers only changed outputs; deleted IDs and available IDs are explicit. Preparation of triangle/edge buffers runs in the worker. The main-thread asset map merges deltas and hands retained scene items to `Renderer`. Unchanged versions keep their GPU buffers. A worker restart changes the epoch, preventing accidental reuse of incompatible buffers with coincident numeric cache counters.

A build captures the source geometry version before dispatch. Results from an older request, replaced project, or edited source cannot be installed as current. Failed features remain inspectable in history but their old cached geometry is unavailable for downstream jobs.

## Job path and cancellation

A second Worker queue handles machining, slicing, analysis, exchange and related jobs. Jobs are FIFO with a bounded pending count. Keyed requests replace obsolete work. AbortSignal, Cancel, timeout or worker failure terminates synchronous work by terminating the worker itself. A replacement worker is created for the next task. Messages from terminated workers are ignored.

`transferableCopy` clones outgoing results before transferring their buffers. Transferring the evaluator's original arrays would detach its cache; tests explicitly prevent this ownership error.

## State and persistence

Project schema 2 owns modeling, assembly, manufacturing, additive, sheet, analysis, drawing, electronics, view and extension state. JSON is finite and bounded; duplicate IDs, invalid dependencies, cycles and dangerous property names reject the whole transaction. Derived data is stored as ordinary arrays for portable JSON, not browser-specific buffers.

Transactions are synchronous, atomic and deeply frozen on commit. Undo/redo spans domains and is bounded by count and estimated serialized memory. View updates do not add modeling undo entries. Geometry edits generate a new source version; appearance-only edits do not. Undo restores the earlier version and its matching result validity.

IndexedDB writes serialize complete snapshots atomically. Explicit native-file export is the portable backup mechanism. There is no cloud sync, account service, collaboration transport or remote execution.

## Rendering and performance boundaries

The camera is orthographic. WebGPU uses typed vertex buffers, WGSL, MSAA, depth testing and per-object uniforms; WebGL2 implements the fallback. Picking uses a lazily constructed triangle BVH. Repainting is invalidation-driven rather than an idle animation loop. GPU buffers are released when objects or overlays are replaced.

Performance is not uniform across algorithms. Faceted Boolean cleanup and pairwise region validation can be expensive. Project snapshots and JSON serialization remain proportional to document size. UI record inspection can be costly for large results. Benchmarks record cold and cached CPU build samples; they do not establish frame rates or large-assembly capacity. These are explicit optimization targets, not hidden production claims.

## Direct editing extensions (0.5)

The topology package now reconstructs support halfspaces for planar offsets and neutral-plane drafts. Shelling combines checked inner/outer support intersections with the existing faceted Boolean kernel. Straight-edge rounding clips sampled cylinder tangents with a separately validated ideal tangency footprint. All commands share the existing selection cache and source-context checks, and run preflight and replay through Workers. See CONTINUATION-0.5.md for numerical bounds and unsupported cases.
