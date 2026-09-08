# Formalyth 0.6 — responsive workbench and speculative editing

This release prioritizes the interface and core execution path. All ten existing workspaces remain integrated. It does not introduce an exact analytic geometry kernel or claim complete compatibility with another engineering product.

## Native workbench controls

The Design ribbon is organized into Sketch, Create, Modify, Construct, Inspect, Select and Manage groups. Common commands remain directly visible; each group opens a keyboard-navigable menu containing its remaining commands. Other workspaces use the same menu mechanism over their actual registered operations. S opens searchable commands with recent and pinned tools; Ctrl/Cmd+D pins the selected search result. Menus support arrow keys, Home/End, typeahead, Enter and Escape with focus restoration. File, Edit, View and Help menus expose project and view actions.

The browser groups bodies, sketches, construction geometry, feature history and persisted workspace records. Groups collapse, filtering searches names/types, arrow keys navigate rows, F2 renames, and context actions expose edit, visibility, isolation, suppression, deletion, ordering and rollback. Cascade deletion requires an explicit choice when other features depend on the selection. Moving a history feature cannot cross its dependencies. The timeline also supports keyboard selection and an explicit rollback slider.

Browser and timeline mount only the visible rows plus overscan. Both retain scroll position rather than reconstructing thousands of controls on every update. Inspector updates are keyed and component invalidations are coalesced into animation frames. Browser/inspector widths can be resized with a pointer or separator keyboard controls and saved as local UI preferences. Compact and comfortable densities are available. On narrow screens panels collapse and docked tools become bottom sheets.

## Tool panels and live edits

Native tool forms are docked and modeless, so the viewport can still orbit and zoom. Structured controls cover scalar expressions, checkboxes, choices, vectors and point tables. Advanced nested descriptors can still require JSON; this is not a fully graphical editor for every specialized domain.

Generic primitive and feature creation, generic existing-feature editing, inline scalar properties and the named-parameter table use `EditSession`. A preview runs in the modeling Worker and displays transient geometry without changing the native project, undo stack or autosave state. Invalid edits display errors and cannot be applied. Apply validates the latest values and stores one transaction. Cancel restores committed geometry. Project, source-geometry and timeline changes invalidate stale edit sessions. Other specialized creation forms remain real docked workflows but do not all provide automatic live preview.

The parameter table edits named expressions in rows instead of requiring a JSON object. Names are checked for uniqueness and supported identifier syntax. All changed definitions preview together, preserving downstream expression-driven modeling.

## Workspace records and views

Saved operations, jobs and studies appear directly in the browser. Selecting a record targets the matching workspace action by ID instead of always choosing the newest record. Missing selected records fail explicitly. Selecting a model feature returns to the existing latest-record default. Geometry-dependent results still require freshness checks. Large numerical result buffers are lazily expanded in pages rather than immediately converted into a huge visible JSON string.

View actions include orthographic and perspective projection, seven presets, shading/edge/wire modes, grid visibility, isolation and named views. Named views travel with the native project and store only validated camera fields. Imported view data cannot overwrite renderer methods. UI layout preferences and command pins remain local, not part of model geometry.

## Core-engine changes

`FeatureGraph` builds ID, child and ordering indexes and traverses dependencies using an explicit stack. A 5,000-feature reverse-ordered chain can validate/evaluate without recursive call-stack overflow. Failed dependencies are evaluated once and propagate explicit errors. Suppressed features remain pass-through dependencies but no longer create duplicate coincident display bodies.

`editModel` applies validated batches to an independent copy. `Engine.preview` maintains a speculative evaluator distinct from committed results and transfers only changed outputs. A matching validated Apply adopts that evaluator cache, so the committed rebuild does not recompute the previewed geometry. Preview version numbers remain globally unique within a worker epoch even after cancellation; an old retained GPU resource cannot be mistaken for a different result from a new preview session.

The renderer computes a camera matrix once per frame and reuses per-resource uniform arrays and per-object transforms. Conservative homogeneous-frustum tests skip bodies wholly outside the view without discarding intersecting bounds. Geometry upload counters measure new uploads, not resident bytes traversed by drawing. Culling is independently disableable for diagnostics.

## Scope and verification

Node tests cover graph indexing, a deep dependency chain, batch atomicity, preview ownership/cancel/apply/races, saved camera validation, perspective depth conventions, conservative culling, range math, UI scheduling, record selection and bounded data descriptions. Browser tests add real menu and dialog interactions, invalid/corrected previews, inline Apply/Cancel, parameter rows, panel resizing, named views, pinning and a 2,000-feature virtual-list fixture to the existing mandatory modeling workflows. Both native WebGPU and WebGL2 remain release gates.

The exact Actions run and reports establish which checks passed. Software adapters test rendering/API behavior, not physical GPU throughput. Virtualized DOM does not remove full-project JSON cloning costs, and expensive Boolean operations retain their numerical/work-budget limits. Missing areas still include complete analytic sketch tools, fully graphical manufacturing setup selection, multi-document tab management, manipulator gizmos, graphical PCB editing, general fillet networks, exact B-rep and production-qualified machine posts.

The interaction patterns were checked against the public WAI-ARIA [menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) and [tree view](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) guidance. This is not an independent accessibility certification.

## Reproducing performance checks

`npm run bench` records a 5,000-feature dependency-index fixture and a repeated speculative-edit fixture in addition to the prior solid-model benchmarks. The first preview computes geometry; repeated identical previews reuse it. The benchmark separately asserts that Apply needs zero feature recomputations. Browser tests use 2,000 hidden primitive features to measure bounded browser/timeline DOM windows; this does not imply a 2,000-body interactive GPU throughput result.

Retained inspectors also key their state on completed build results, so an asynchronous rebuild cannot leave obsolete body counts or errors visible. Selected workspace result inspection resolves the current record by ID, not a stale captured object. Escape explicitly closes command palettes and reports; the browser gate checks that no modal backdrop remains.
