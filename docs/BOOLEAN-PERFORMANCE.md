# Boolean edge-conformance optimization

BSP splitting creates T-junctions: one polygon edge may meet several shorter edges in its neighbors. The conforming pass must insert every relevant collinear vertex before triangulation; skipping this work can leave visible cracks and non-watertight output.

`packages/kernel/edge-index.js` provides an independent `CollinearPointIndex(points, tolerance, {cacheLimit})`. It sorts point IDs along each axis, uses binary searches to choose the smallest candidate interval for a segment's padded bounds, then checks exact projected distance. Undirected edge queries share cached splits while preserving orientation in the returned ID sequence. Returned arrays are copies. The input points must remain unchanged during the index lifetime.

The old pass selected the segment's longest axis, which can include almost every vertex in a model. The new pass selects the axis by actual candidate count and avoids temporary vector allocation inside the inner loop. Shared edges reuse their split sequence. Retained query cache entries are bounded (250,000 by default); eviction affects performance, not correctness.

Seven added tests compare deterministic 3D queries with brute force, check geometric tolerances, reversed edges, cache ownership and limits, invalid input, a large narrow-query fixture, and matching shared-edge topology after stitching. The complete 133-test numerical/domain suite passed locally with this implementation.

## Local before/after sample

Using Node 22.16.0 on the same Linux host reporting Intel Xeon Platinum 8272CL, three fresh Engine evaluations of the bearing-housing example per version yielded median cold-build times of 4,839.98 ms before and 1,383.14 ms after. These are separate-process CPU samples, not controlled hardware-rendering benchmarks or a general speed guarantee. The 200-box construction medians were 32.46 and 33.15 ms respectively, while unchanged replay still computed and transferred zero geometry outputs.

Run `npm run bench` to record fresh measurements for your machine. The faceted Boolean kernel retains its existing input/work budgets and numerical limitations; the index does not turn it into an exact analytic B-rep kernel.
