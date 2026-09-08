# Public library examples

All examples below run as native ES modules from the repository root on Node 22+, except the explicitly browser-only transport example. The computational libraries have no runtime package dependencies. There is no implicit success fallback for unsupported operations.

## Parametric modeling and cached replay

```js
import {DesignDocument, FeatureEvaluator} from './packages/document/index.js';
const document = new DesignDocument();
document.transact('Parameters', data => { data.parameters = {width: 40}; });
const sketch = document.addFeature('sketch', {
  shape: 'rectangle', width: 'width', depth: 20
}, [], 'Base sketch');
document.addFeature('extrude', {depth: 10}, [sketch], 'Extrusion');
const evaluator = new FeatureEvaluator();
const built = evaluator.evaluate(document.data);
if (built.errors.length) throw new Error(JSON.stringify(built.errors));
console.log(built.scene[0].value.positions.length);
console.log(evaluator.evaluate(document.data).stats); // cached replay
```

Features reference stable feature IDs, not current scene array indices. `addFeature` returns an ID string. Scene geometry is in `.value`; a mesh is a plain object with typed `.positions` and `.indices`, not an instance of a Mesh class. Feature-specific numeric fields accept safe named expressions where supported by the registry.

## Regions with holes

```js
import {extrudeRegions} from './packages/regions/index.js';
import {massProperties} from './packages/kernel/index.js';
const rectangle = (a, b) => [[a,a],[b,a],[b,b],[a,b]];
const solid = extrudeRegions([rectangle(0,10), rectangle(2,8)], 5);
console.log(massProperties(solid).volume); // approximately 320 mm^3
```

Call `installRegionFeatures()` before using `region` and `extrudeRegion` through `FeatureEvaluator`; `Engine` does this automatically. Boundaries that cross or touch are rejected, and nesting uses even/odd material classification.

## Cross-workspace project transactions

```js
import {Project, createProject} from './packages/project/index.js';
const project = new Project(createProject('Fixture', document.data));
project.put('analysis', 'studies', {
  name: 'Example record', bodyIds: [document.data.features.at(-1).id],
  config: {kind: 'illustrative'}, output: {reviewed: false}
}, {linked: true});
project.transact('Rename', data => { data.name = 'Fixture revision'; });
project.undo();
const restored = Project.parse(project.serialize());
console.log(restored.data.workspaces.analysis.studies.length);
```

Do not mutate `project.data`: it is deeply frozen. Transactions must be synchronous and atomic. Failed validation rolls back without creating history. `snapshot()` returns an editable independent copy. `updateView()` persists navigation without adding modeling history entries. Geometry-linked records use `sourceVersion`; `isStale(record)` must be consulted before reusing them.

## Worker-compatible computation

```js
import {Engine} from './packages/tasks/engine.js';
const engine = new Engine();
const delta = engine.dispatch('evaluate', {document: document.data});
console.log(delta.changes.length, delta.stats.computed);
const repeat = engine.dispatch('evaluate', {document: document.data});
console.log(repeat.changes.length); // 0
```

`evaluate` returns changed assets, removed IDs, available IDs, scene metadata, feature errors and statistics. Versions contain a worker epoch. Keep the same Engine instance to benefit from the cache.

In a browser, use `TaskRunner` with a module Worker whose entry point is `app/engine.worker.js`. `run(type, payload, {signal, key})` returns a Promise. Abort, replacement of a keyed request, timeout and disposal terminate obsolete synchronous work. `transferableCopy` protects the worker cache from buffer detachment.

## Browser command integration

After the application exposes `window.formalyth.ready`:

```js
await window.formalyth.execute('solid.box', {width: 30, depth: 20, height: 5});
await window.formalyth.execute('additive.slice', {
  layerHeight: 0.3, lineWidth: 0.45, shells: 2, infill: 0.2, solidLayers: 3
});
const nativeText = window.formalyth.workbench.project.serialize();
```

`execute` propagates failures. The UI wrapper catches failures for toasts; automated callers should handle rejected Promises explicitly. Read `commands.items` for registered command IDs and labels. Some commands open dialogs when arguments are omitted. An automated command API is not an MCP server or a remote authentication boundary.

## Extending a feature

Register a new feature through `registerFeature(type, handler)` in `packages/document/index.js`. The handler receives evaluated inputs and numeric-expression helpers and returns a supported output value. Add dependency, parameter, error and replay tests; include serialization in the native model; wire a real command through the workbench; document the numerical limits. Do not add success-shaped placeholder geometry when an operation is unsupported.
