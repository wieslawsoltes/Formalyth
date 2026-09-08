#!/usr/bin/env bash
# Disposable CI only. This configuration passed independent WebGPU/WebGL2
# readback and screenshot pixel checks in scripts/gpu-probe.mjs.
set -euo pipefail
args=()
for arg in "$@"; do
  case "$arg" in
    --headless=*|--use-vulkan=*|--use-webgpu-adapter=*|--use-angle=*|--use-gl=*|--disable-vulkan-surface|--enable-features=*|--ozone-platform=*) ;;
    *) args+=("$arg") ;;
  esac
done
exec /usr/bin/google-chrome "${args[@]}" --no-first-run --no-default-browser-check --disable-search-engine-choice-screen --use-gl=angle --use-angle=vulkan --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --disable-vulkan-surface
