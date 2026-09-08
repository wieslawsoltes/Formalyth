#!/usr/bin/env bash
# Disposable CI only. Native WebGPU and WebGL2 pixel readback, compositor
# screenshots and the actual workbench passed with this configuration.
# Disabling Chromium's GPU rasterizer does not disable WebGPU rendering.
set -euo pipefail
args=()
for arg in "$@"; do
  case "$arg" in
    --headless=*|--window-size=*|--use-vulkan=*|--use-webgpu-adapter=*|--use-angle=*|--use-gl=*|--disable-vulkan-surface|--enable-features=*|--ozone-platform=*) ;;
    *) args+=("$arg") ;;
  esac
done
exec /usr/bin/google-chrome "${args[@]}" --no-first-run --no-default-browser-check --disable-search-engine-choice-screen --window-size=800,600 --use-gl=angle --use-angle=vulkan --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --disable-vulkan-surface --disable-gpu-rasterization
