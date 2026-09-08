# Formalyth

An independent, open-source design and manufacturing workbench for the browser. Written in plain JavaScript and HTML, with a native WebGPU viewport and reusable engine libraries.

## Principles

- Original implementation and original UI assets. No proprietary code, SDKs, assets, or reverse-engineered binaries.
- Standalone computational libraries with no DOM dependencies.
- Performance by design: typed geometry buffers, cached feature evaluation, worker isolation, incremental GPU uploads, and demand-driven drawing.
- A unified workflow for parametric modeling, sketches, assemblies, manufacturing, analysis, drawings, and electronics.
- Compatibility is reported per format and supported entity, not assumed. Unsupported operations must fail explicitly.

Implementation is being developed in separately reviewable stages. The feature matrix, architecture, API contracts, tests, and deployment instructions live in `docs/`.

## License

MIT. See `LICENSE`.
