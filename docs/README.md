# Formalyth engineering documentation

Formalyth is an independent experimental design and manufacturing workbench. The source is original, plain JavaScript and HTML with no runtime third-party dependencies.

- [Unified project model and cancellable tasks](PROJECTS-AND-TASKS.md)
- [Closed sketch regions](REGIONS.md)
- [Repository recovery audit](RECOVERY.md)

Run with Node 22 or newer: `npm start`. Open localhost port 4173. No dependency installation or bundler is required. `npm test`, `npm run verify`, `npm run bench`, and `npm run build` execute numerical tests, syntax/module validation, CPU benchmarks and static packaging. `npm run test:browser` requires a Chromium executable; set CHROME_BIN when it is not in a standard location. CI retains reports and screenshots.

The native .formalyth file stores modeling history, manufacturing setups/operations, additive jobs, sheet plans, assemblies, studies, drawings, circuits, view state and extension data. Numerical tasks execute in separate workers; Cancel terminates ongoing computation. Geometry-dependent results are marked stale after modeling changes.

The ten workspaces expose real but bounded implementations. The geometry kernel is faceted, not an exact trimmed analytic B-rep kernel. STEP support is limited to faceted entities. Manufacturing paths are unverified generic drafts, with no qualified machine post or full toolholder/fixture collision verification. Selected-body elasticity and conduction use approximate voxel tetrahedra and require independent mesh-convergence studies. Electronics is ideal linear RLC simulation, not a PCB editor or a complete device simulator.
