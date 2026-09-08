# Formalyth 0.3 — construction, graphical constraints and dependable persistence

This continuation builds on the actual integrated application, not the incompatible standalone project library in the previous handoff archive. Existing native projects remain schema 2; modeling features remain schema 1. Older applications will report the new feature types as unsupported rather than silently interpreting them.

## Construction and extrusion

`packages/construction/frames.js` defines rigid, right-handed local sketch frames. New construction planes support XY (normal +Z), XZ (normal -Y), YZ (normal +X), optional custom normal/reference axis, origin, normal offset and in-plane rotation. Distances are millimeters and rotation is degrees. Invalid axes, nonfinite inputs, nonrigid matrices and reflections reject explicitly. The old version-1 sketch plane/elevation convention is preserved for files that have no explicit frame.

Use **Construction plane**, select that feature, then **Create sketch** or **Constrained sketch**. New region and polygon sketches retain a dependency on the selected plane. Changing its expressions rebuilds dependent geometry. Plane outlines and sketch edges are displayed using the same frame as extrusion.

**Extrude / cut** accepts a selected profile or multi-loop region, signed one-sided distance, symmetric total distance, unequal two-sided distances, a normal start offset, and new body/join/cut/intersect intent. Boolean operations require an explicit available target body. Holes and material islands retain even/odd region behavior. This is straight faceted extrusion, not general analytic B-rep construction, draft or solid fillet support.

```js
import {buildExtrusion, constructionFrame} from './packages/construction/index.js';
const profile = {kind:'region', loops:[[[0,0],[20,0],[20,10],[0,10]]],
  frame:constructionFrame({plane:'YZ', origin:[5,0,0]})};
const body = buildExtrusion(profile, {depth:12, extent:'symmetric'});
```

Register extension feature types with `installConstructionFeatures()` when using the low-level FeatureEvaluator directly; the application Engine does this automatically. `constructionPlane` outputs a frame, `region` or `sketch` can depend on it, and `extrusion` accepts the profile followed by an optional Boolean target.

Three-axis contour/pocket/face machining maps horizontal sketch coordinates into world XY. Tilted/vertical sketch planes reject instead of silently machining their untransformed local coordinates. Indexed or multi-axis setup transforms are not implemented.

## Graphical polygon constraints

**Constrained sketch** opens a real interactive editor. Select an edge or two vertices to add horizontal, vertical or driving-distance constraints; select one vertex to fix its coordinates. Dragging a vertex proposes a new starting position and the solver projects it back onto the constraints. Conflicting constraints are rejected atomically, leaving the prior sketch intact. The side panel supports driving-value editing and constraint removal. Local undo/redo, residuals, degrees of freedom and redundant-equation counts are visible.

The graphical editor supports one closed polygon with at most 64 vertices, not circles, arbitrary open geometry or the complete analytic sketch entity set. Other supported numerical constraints remain available through the existing library/JSON workflow. A new polygon starts with edge-alignment constraints and one fixed point; its two remaining size dimensions can be driven by numeric values or named parameter expressions.

`ConstraintSession` is a DOM-free async editing controller. The UI injects `Workbench.task('solveSketch', ...)`, so numerical solving runs in the job Worker, not the main thread. Superseded solves cannot overwrite newer session state. The editor rejects finishing into a project whose geometry changed while it was open. Feature history stores dimension expressions, not just their last evaluated values; named parameter changes replay them through the solver.

## Persistence and source freshness

`ProjectStorage` retains the existing IndexedDB database/object store. Each stored snapshot now has a monotonically increasing version. Read/check/write runs in a single readwrite transaction. A storage connection must load an existing record before overwriting it; a changed or deleted record in another tab raises `StorageConflictError` with code `PROJECT_CONFLICT`. Existing records without a version are treated as version 0 and upgraded on a validated write. Reload or export a backup after a conflict; the application never force-overwrites it automatically.

`Autosave` subscribes to the active Project, debounces edits and permits one active write while coalescing pending revisions. A completion marks only the captured revision saved. Newer edits and project switches remain dirty until their own write succeeds. Errors preserve dirty state and are shown in the UI; native-file export remains available when local storage fails. Saves, loads, lists and removals are ordered within each storage connection.

Workbench freshness now includes both geometry version and timeline endpoint. A pending build or derived job cannot label a rolled-back timeline as current. Machining exports and simulations check this context. Assembly fit uses every transformed bounds corner rather than the untransformed source geometry. The renderer's frame statistics now call traversed buffer bytes `residentDrawBytes`, not falsely report them as fresh uploads.

## Validation and deployment

The missing Mesa package caused the prior release pipeline's graphics failures. Restoring that dependency, without weakening the required WebGPU tests, produced a successful test and Pages deployment in run 34249958994. The new features add numerical/domain tests and browser checks for construction geometry, vertical-plane machining rejection, actual IndexedDB conflict transactions, pointer-driven dimension entry, parameter replay and autosave reload.

Run `npm test`, `npm run verify`, `npm run build`, and `npm run test:browser`. The complete release workflow requires the numerical suite and real browser checks before Pages deployment; it retains exact source, reports and screenshots. Local browser execution in this authoring environment was blocked by its loopback-site policy, so application browser validation is performed in repository CI. Software-adapter rendering tests are not physical-GPU benchmarks or manufacturing qualification.
