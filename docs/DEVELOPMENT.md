# Development, verification and deployment

## Local execution

Node 22 or newer is required for the supplied scripts. There are no runtime npm dependencies and no bundler. Run `npm start` and open `http://localhost:4173`. Serving over HTTPS or localhost is required for browser features such as module workers and WebGPU. Opening index.html as a file is not a supported execution path.

`npm test` runs numerical and domain regression tests. `npm run verify` checks JavaScript syntax, relative module imports and required app entry points. `npm run bench` writes CPU timing samples and cache counters to reports/benchmark.json. `npm run build` creates a static _site directory with a build-info.json containing the source commit when built by Actions.

`npm run test:browser` drives Chromium directly through its debugging protocol; no browser automation dependency is needed. Set CHROME_BIN to the browser executable. The CI wrapper selects a headless software-Vulkan configuration suitable for the runner. These test-only browser flags are not application runtime requirements or recommended everyday browser settings.

## Release gates

The workflow runs on every main push and by manual dispatch. Numerical failure, source verification failure, build failure or any required browser check prevents deployment. Bash pipefail preserves the exit status of numerical tests piped into the TAP report. Browser checks require both the WebGL2 fallback and the native WebGPU path; selecting a fallback must not silently count as a native WebGPU pass.

Browser checks include a real ribbon click and parameter-dialog submission, cached worker replay, machining record generation, stale-output blocking/regeneration, slicing, selected-body studies, drawings, linear circuits, folded strips, assembly joint driving, native-file round trips, IndexedDB reload and mobile viewport layout. Screenshots, structured reports and the exact committed source ZIP are retained as Actions artifacts.

Software-adapter rendering is an API/render-path test. It is not evidence of hardware GPU throughput, graphics-driver coverage, complete touch usability, or cross-browser conformance. Independent hardware and browser validation remains necessary.

## GitHub Pages

The test job packages _site with upload-pages-artifact; the dependent deploy job uses the Pages deployment action with pages:write and id-token:write. The deployment target is the repository's Pages URL. The Actions deployment result and the served build-info.json identify the deployed revision. A configured repository URL or has_pages flag alone does not prove the current application is published.

Do not store credentials, native browser profiles or unreviewed imported files in the published tree. The application has no remote service keys or runtime API tokens. The local static server is for development, not a public production server.

## Contribution discipline

Keep computational modules DOM-free. Use typed numerical data and explicit ownership. Add both success and rejection tests, including resource budgets and stale/asynchronous cases. Version persisted schemas rather than silently interpreting incompatible data. Document library-only versus integrated UI capability accurately. Preserve independent source provenance and original assets.

The feature matrix and architecture describe actual implementation boundaries; expand them only when code, tests and workflows support the change.
