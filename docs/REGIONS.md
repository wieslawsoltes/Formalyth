# Closed sketch regions

`classifyRegions(loops)` validates finite XY polygon boundaries, normalizes explicit closing points, rejects self-intersections and touching/crossing loops, and constructs a containment forest. Nesting depth follows even/odd fill: exterior material at depth 0, holes at depth 1, material islands at depth 2, and so on. Input winding and order are irrelevant. Disjoint exterior regions are supported.

The default limits are 128 loops, 4,096 total vertices, and a 1e-7 mm boundary tolerance. Validation uses pairwise segment tests; it is quadratic rather than a large-profile sweep-line implementation. Boundaries separated by less than the tolerance are rejected rather than guessed.

`extrudeRegions(loops, depth)` extrudes positive-Z material regions, subtracts their immediate holes using the existing faceted Boolean kernel, and merges disjoint material islands. The registered `region` and `extrudeRegion` feature types participate in parameter evaluation and feature caching. This is not exact analytic B-rep construction; it inherits the numerical limitations of the faceted Boolean engine.

Regression tests cover nested islands, winding, input order, translated coordinates, invalid crossings, resource budgets, volume, watertightness, and cached parametric replay.
