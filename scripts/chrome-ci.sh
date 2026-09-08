#!/usr/bin/env bash
# Use Mesa's software Vulkan driver for both ANGLE and Dawn. The bundled
# SwiftShader ICD has no XCB surface support in this runner's Chrome build.
set -euo pipefail
icd="$(find /usr/share/vulkan/icd.d -maxdepth 1 -name 'lvp_icd*.json' -print -quit)"
if [[ -z "$icd" ]]; then echo 'Mesa lavapipe ICD is required for graphics CI' >&2; exit 1; fi
export VK_ICD_FILENAMES="$icd"
export VK_DRIVER_FILES="$icd"
export LIBGL_ALWAYS_SOFTWARE=1
args=()
for arg in "$@"; do
  case "$arg" in
    --headless=*|--use-vulkan=*|--use-webgpu-adapter=*|--disable-vulkan-surface|--enable-features=*|--ozone-platform=*) ;;
    *) args+=("$arg") ;;
  esac
done
exec /usr/bin/google-chrome "${args[@]}" --ozone-platform=x11 --use-vulkan=native --enable-features=Vulkan,VulkanFromANGLE --enable-gpu
