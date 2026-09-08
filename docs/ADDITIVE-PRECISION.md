# Slicing computed solid bounds

A computed mesh can report its top a few floating-point representable steps above an exact layer multiple. Rounding every quotient upwards created a near-zero extra cap layer on the rounded enclosure, whose inconsistent cap intersection then failed the polygon-offset checks.

The slicer now compares the layer quotient with its nearest integer using a coordinate-scale floating-point noise bound, capped at one millionth of a layer. Only quotients within that bound are snapped. Genuine fractional layers remain and the final layer still ends at the actual mesh bound; the geometry is not truncated or rescaled.

Regression fixtures include the native rounded enclosure at 0.4 and 0.35 mm layer heights, real fractional final layers, and translated coordinates. The browser gate also slices the composed enclosure, preserves the hollow cross-section and checks that the additive result is saved against current geometry. Drawings and embedded static GLB interchange are tested on the same generated hollow body.

This fixes numerical layer counting, not the broader slicer limitations: topology-changing offsets, automatic support generation, bridging, qualified machine setup and collision verification remain outside its contract. See SAFETY.md before using any generated machine output.
