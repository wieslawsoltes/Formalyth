# Graphics validation

The workbench uses native WebGPU with a WebGL2 fallback. Neither backend is a static image or a fake status label. Chromium software-driver validation and physical-GPU performance qualification are separate concerns.

`scripts/gpu-probe.mjs` tests isolated GPU and WebGL contexts and then loads the actual workbench. It clears a WebGPU texture to red, copies that texture to a mapped GPU buffer, clears a WebGL2 target to green, reads pixels from both, and decodes the captured PNG to verify that the compositor displayed those colors. It then requires the real application to report native WebGPU, a ready renderer, nonempty geometry and no graphics errors, and captures the rendered model.

The successful GitHub Actions driver-matrix run 34243583026 used headed Chrome under Xvfb, SwiftShader for native WebGPU, ANGLE Vulkan and the browser's GPU rasterizer disabled. Disabling the browser rasterizer is not disabling the application's WebGPU API. That run verified native pixel values and displayed the bearing-housing model in the real workbench. The software driver is not a physical GPU benchmark.

The complete release browser suite additionally exercises application commands, state round trips, reloads, responsive layout and both rendering paths. Its result is stored separately in reports/browser.json. An isolated driver-matrix pass does not substitute for the full release gate.

The CI wrapper flags apply only to disposable test browsers. The deployed page neither changes browser flags nor asks users to disable browser security. Normal users receive the browser's available WebGPU adapter or the WebGL2 fallback.
