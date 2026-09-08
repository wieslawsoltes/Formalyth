# Formalyth

An independent, MIT-licensed design and manufacturing workbench for the browser. Original plain JavaScript, HTML, CSS and SVG assets; native WebGPU rendering with a WebGL2 fallback. No runtime framework, remote service, CDN or package installation is required.

**Version 0.2 is experimental. It is not a complete or fully compatible professional engineering suite.** See [implemented features and limitations](docs/FEATURES.md) and [engineering safety](docs/SAFETY.md).

## Run

Use Node 22 or newer:

```sh
npm start
```

Open `http://localhost:4173`. The static deployment target is [Formalyth on GitHub Pages](https://wieslawsoltes.github.io/Formalyth/). The latest [Actions run](https://github.com/wieslawsoltes/Formalyth/actions) records whether that revision passed validation and deployed; a configured URL alone does not prove a successful deployment.

```sh
npm test
npm run verify
npm run bench
npm run build
# Chromium required. CHROME_BIN can point to its executable.
npm run test:browser
```

On Linux CI the browser test runs under Xvfb and uses software Vulkan to exercise both WebGL2 and native WebGPU. This is API/render-path verification, not hardware-GPU performance qualification. The deploy job runs only after the numerical, source, build and browser gates succeed. Actions retains the exact committed source, machine-readable reports and screenshots.

## Workflows

The application combines Design, Surface, Mesh, Sheet Metal, Assemble, Manufacture, Additive, Simulation, Drawing and Electronics workspaces. It includes parametric feature history, numerical sketch constraints, closed sketch regions with nested holes/islands, faceted solids and Booleans, tree-joint assemblies, draft milling and printing paths, selected-body voxel analysis, projected drawings and ideal linear RLC circuits.

Native `.formalyth` files preserve modeling history and cross-workspace records in a versioned, validated project. IndexedDB autosave and named local snapshots are available. Export a native file for portable backup: browser storage is not a backup service.

Drag to orbit, Shift-drag to pan, wheel/pinch to zoom. **F** fits the model, **S** opens the command palette, and **Ctrl/Cmd+S** exports the project. Double-click a history tile to edit, right-click to roll back. Commands reject unavailable or failed source geometry, and stale machining results cannot be posted through the workbench.

## Architecture

Reusable engines live in `packages/`; integration lives in `app/`. Computational packages are DOM-free. Modeling and long-running jobs use separate cancellable Workers. Incremental builds transfer changed geometry only and the viewport retains unchanged GPU resources.

[Architecture](docs/ARCHITECTURE.md) · [Feature matrix](docs/FEATURES.md) · [API examples](docs/API.md) · [Interchange scope](docs/FORMATS.md) · [Development](docs/DEVELOPMENT.md) · [Roadmap](docs/ROADMAP.md)

## License and provenance

MIT. See [LICENSE](LICENSE). No proprietary code, SDKs, icons, screenshots, binary formats or branding were copied into this implementation. Shared concepts and published neutral-format specifications do not imply compatibility with any particular product. [Recovery audit](docs/RECOVERY.md) records the incomplete previous handoff and this continuation's reconstruction.
