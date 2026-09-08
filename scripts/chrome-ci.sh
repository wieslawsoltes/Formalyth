#!/usr/bin/env bash
# A GPU-less SwiftShader build has no X11 surface extensions. Use headless Ozone
# consistently rather than asking ANGLE to create an XCB Vulkan surface.
set -euo pipefail
exec /usr/bin/google-chrome --headless=new --ozone-platform=headless "$@"
