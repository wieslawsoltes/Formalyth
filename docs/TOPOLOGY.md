# Faceted topology and convex-solid operations

`packages/topology` is an original DOM-free adapter over oriented triangle meshes. It builds welded vertex IDs, opposite half-edges, triangle-to-face mappings, oriented planar face boundary loops and straight geometric edges. Internal triangulation diagonals are excluded from selectable edges. Adjacent collinear subdivisions between the same two faces become one edge. Open boundaries and disconnected components are reported; degenerate triangles, inconsistent orientation and nonmanifold edges reject explicitly.

`buildTopology(mesh, options)` returns typed connectivity plus face/edge records and a summary. The default absolute welding tolerance is 1e-6 mm. It is a distance tolerance, not a rounded-coordinate equality test. The default budget is 200,000 triangles; convexity verification has an eight-million plane/vertex-test ceiling. The caller must not mutate returned connectivity while using its references.

`edgeReference`, `faceReference`, `resolveEdge` and `resolveFace` serialize support-normal descriptors rather than transient triangle indices. These descriptors survive translations, dimension changes that preserve support normals, and tessellation reordering. They deliberately fail for missing or ambiguous normals, including multiple disconnected parallel patches. They do not provide general persistent naming across rotations, changing topology, curved faces or arbitrary edits.

`chamferEdges(body, references, distance)` clips equal-distance bevel planes at selected straight edges of a single closed convex polyhedron. Distance is the setback on either incident face perpendicular to the edge. Multiple bevel planes meet through half-space intersection. A request that eliminates an original support face or another bevel is rejected instead of silently consuming it. This is not general concave edge chamfering or filleting.

`splitConvex(body, {normal, origin})` returns negative- and positive-side solids with oppositely oriented planar caps. The plane must cut the interior. Tangency, a miss, a nonconvex input or an invalid result rejects. Both operations reconstruct and check closed, connected, genus-zero topology before returning geometry. Input meshes are unchanged on success and failure.

Twenty initial regression cases cover half-edge opposites, geometric edge grouping, soup welding, malformed and nonmanifold inputs, connectivity, reference stability/ambiguity, analytical bevel volume, intersecting bevels, rigid-transform invariance, capped splits, side inequalities and translated coordinates.

The conventional half-edge vocabulary is described in the public [surface-mesh connectivity documentation](https://doc.cgal.org/latest/Surface_mesh/index.html). No external mesh implementation or runtime dependency is included. This adapter does not replace the current faceted geometry with an exact analytic boundary-representation kernel.
