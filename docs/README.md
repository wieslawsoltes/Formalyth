# Formalyth engineering documentation

Formalyth is an independent experimental design and manufacturing workbench. The source uses plain JavaScript, HTML, CSS and original SVG assets with no runtime third-party package dependencies.

- [0.3 construction, constraints and persistence](CONTINUATION-0.3.md)
- [0.4 topology modeling and selection](CONTINUATION-0.4.md)
- [Faceted topology library](TOPOLOGY.md)
- [Architecture and data ownership](ARCHITECTURE.md)
- [Implemented features and explicit limitations](FEATURES.md)
- [Reusable library and command API examples](API.md)
- [File interchange contracts](FORMATS.md)
- [Development, tests and Pages deployment](DEVELOPMENT.md)
- [Engineering safety](SAFETY.md)
- [Remaining implementation work](ROADMAP.md)
- [Unified project model and cancellable tasks](PROJECTS-AND-TASKS.md)
- [Closed sketch regions](REGIONS.md)
- [Repository recovery audit](RECOVERY.md)

Run with Node 22 or newer: `npm start`, then open localhost port 4173. No npm dependency installation or bundler is required. `npm test`, `npm run verify`, `npm run bench`, and `npm run build` execute numerical tests, source validation, CPU benchmarks and static packaging. CI records browser checks and retains screenshots and source artifacts.

Native files preserve cross-workspace data. The geometry kernel remains faceted, manufacturing output remains unqualified, selected-body meshing is approximate, electronics is ideal linear RLC simulation, and full product compatibility is not established. These boundaries are part of the documented contracts rather than hidden behind menu entries.
