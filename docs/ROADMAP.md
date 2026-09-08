# Remaining engineering work

This is an implementation roadmap, not a claim that the listed capabilities exist.

## Geometry correctness and richer design

Introduce an exact analytic/topological layer with stable vertex/edge/face identities and orientation. Add robust curve/surface intersection, trimmed surfaces, tolerance-aware sewing, persistent references and independent topology fixtures before exposing general fillets, chamfers, shelling and draft. Extend sketch entities and graphical constraints, then derive closed regions from open/intersecting analytic geometry. Current polygon regions should remain an independently testable adapter rather than becoming the permanent exact-topology model.

## Scale and responsiveness

Replace whole-project history snapshots with structural sharing or validated patches. Persist large result buffers separately with transactional manifests. Add algorithm-level work budgets, cancellation checkpoints for cooperative tasks, batched array transport, large-profile spatial indexing and realistic large-assembly benchmarks. Optimize faceted Boolean cleanup and avoid rendering complete giant JSON reports on the UI thread. Expand GPU resource-lifetime, resize, context-loss and adapter-compatibility tests.

## Manufacturing

Add true rest-material/roughing strategies, more robust offsets and polygon nesting, toolholder/fixture collision, machine kinematics and travel limits. Define versioned machine/post contracts with independently reviewed output fixtures before claiming any qualified post. Turning, indexed and simultaneous multi-axis machining require new engines, not ribbon entries. Additive needs supports, bridge handling, machine/material profiles and validated setup/output.

## Analysis, drawings and electronics

Implement conforming meshing and explicit support/load selection, followed by convergence and cross-solver fixtures. Expand engineering drawings with editable associative dimensions and standards-aware output. Add graphical schematic and PCB domain models, connectivity, routing and fabrication outputs; the current electronics workspace is ideal RLC analysis only.

## Compatibility and product integrity

Broaden neutral-format coverage entity by entity using independent corpora. Keep unsupported operations explicit. Test migration across schema versions and partial-document recovery. Add cross-browser and hardware GPU validation, accessibility audits and repeated touch interaction tests. Collaboration, multi-document linking and cloud features need independent persistence/security designs.

## Completion criteria

A feature is complete only when its algorithm, public library contract, project serialization, UI workflow, failure behavior, regression fixtures and user documentation agree. Passing a demonstration or adding a menu item is not sufficient. Full product parity is not currently established.
