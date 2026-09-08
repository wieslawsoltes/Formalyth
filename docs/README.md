# Formalyth engineering documentation

Latest: [0.6 UI, speculative editing and rendering contracts](CONTINUATION-0.6.md).

Formalyth is an independent experimental design and manufacturing workbench using plain JavaScript, HTML, CSS and original SVG assets, with no runtime third-party package dependencies.

[Architecture](ARCHITECTURE.md) · [Feature matrix](FEATURES.md) · [API examples](API.md) · [Interchange](FORMATS.md) · [Development and deployment](DEVELOPMENT.md) · [Engineering safety](SAFETY.md) · [Roadmap](ROADMAP.md)

## Implementation notes

- [0.3 construction, graphical constraints and persistence](CONTINUATION-0.3.md)
- [0.4 topology modeling and selection](CONTINUATION-0.4.md)
- [0.5 direct editing, hollow bodies and rounded enclosures](CONTINUATION-0.5.md)
- [0.6 workbench and core execution](CONTINUATION-0.6.md)

[Topology library](TOPOLOGY.md) · [Project state and worker tasks](PROJECTS-AND-TASKS.md) · [Closed sketch regions](REGIONS.md) · [Boolean performance](BOOLEAN-PERFORMANCE.md) · [Graphics validation](GRAPHICS-VALIDATION.md) · [Recovery audit](RECOVERY.md)

Run `npm start` with Node 22 or newer and open localhost port 4173. `npm test`, `npm run verify`, `npm run bench`, and `npm run build` execute regression tests, source validation, CPU benchmarks and static packaging. CI requires browser workflows on WebGPU and WebGL2 before Pages deployment and retains reports and screenshots.

Native files preserve cross-workspace data. The kernel is faceted, manufacturing output is unqualified, selected-body analysis meshing is approximate, and electronics is ideal linear RLC simulation. Full professional-suite compatibility is not established. These boundaries are part of the documented contracts.
