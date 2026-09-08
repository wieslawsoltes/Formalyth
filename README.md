# Formalyth

An independent, MIT-licensed design and manufacturing workbench for the browser. Plain JavaScript, HTML, CSS and original SVG assets; native WebGPU rendering with a WebGL2 fallback. No runtime framework, remote service, CDN or package installation is required.

**Version 0.6 is experimental, not a fully compatible professional engineering suite.** The [feature matrix](docs/FEATURES.md) and [engineering safety notes](docs/SAFETY.md) distinguish working capabilities from unsupported or unqualified operations.

## Workbench 0.6

The interface now uses compact contextual tool menus, modeless docked panels, typed parameter controls, in-place live previews, a graphical parameter table, virtualized browser/history lists, dependency-aware feature actions, resizable panels, searchable pinned commands, perspective and saved camera views, and directly selectable workspace records.

The core indexes dependencies without recursive traversal. A validated modeling preview is isolated from project history until Apply, and its geometry can then be adopted without recomputation. See [workbench and engine contracts](docs/CONTINUATION-0.6.md).

## Run locally

Use Node 22 or newer. No npm dependency installation is needed.

```sh
npm start
```

Open `http://localhost:4173`. The publication target is [Formalyth on GitHub Pages](https://wieslawsoltes.github.io/Formalyth/). [GitHub Actions](https://github.com/wieslawsoltes/Formalyth/actions) records the exact validated and deployed revision.

```sh
npm test
npm run verify
npm run bench
npm run build
# Chromium required; CHROME_BIN can specify its executable.
npm run test:browser
```

Release gates cover numerical/domain tests, source validation, static packaging, and browser workflows on both native WebGPU and WebGL2. CI retains exact committed source, machine-readable reports and screenshots. Software graphics adapters test API/render-path behavior, not physical-GPU throughput.

## Working in the application

Drag to orbit, Shift-drag to pan, wheel or pinch to zoom. **F** fits the model and **S** opens commands. **Ctrl/Cmd+S** exports the native project. Double-click a feature to edit; right-click for history, visibility and dependency-aware actions. Tool menus expose secondary commands without an overcrowded toolbar. Apply stores one validated history step; Cancel discards a speculative edit.

The ten workspaces are Design, Surface, Mesh, Sheet Metal, Assemble, Manufacture, Additive, Simulation, Drawing and Electronics. Native `.formalyth` files retain modeling history and cross-workspace records. IndexedDB provides revision-checked autosave and named snapshots. Export a native backup rather than relying solely on browser storage.

## Reusable engines and documentation

Computational engines are in `packages/`; application integration is in `app/`. Modeling and long-running jobs use separate cancellable Workers. Incremental evaluation transfers changed geometry only and the renderer retains unchanged resources.

[Architecture](docs/ARCHITECTURE.md) · [Feature matrix](docs/FEATURES.md) · [API examples](docs/API.md) · [Interchange](docs/FORMATS.md) · [Development](docs/DEVELOPMENT.md) · [Roadmap](docs/ROADMAP.md)

Implementation notes: [construction and graphical constraints](docs/CONTINUATION-0.3.md), [topology selection and convex chamfers](docs/CONTINUATION-0.4.md), [direct editing and hollow enclosures](docs/CONTINUATION-0.5.md), and [the 0.6 workbench](docs/CONTINUATION-0.6.md).

The geometry kernel remains faceted. Manufacturing output is an unqualified draft, analysis meshes are approximate, and some specialized UI fields still use advanced JSON. Exact analytic B-rep, unrestricted fillet networks and complete graphical domain editors remain future work, not hidden implementations.

## License

MIT. See [LICENSE](LICENSE). Original implementation and assets, with no proprietary SDK or runtime engine dependency. [Recovery audit](docs/RECOVERY.md) records the earlier incomplete handoff and reconstruction.
