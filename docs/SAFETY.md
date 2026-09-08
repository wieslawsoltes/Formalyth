# Engineering safety and result interpretation

Formalyth 0.2 is experimental engineering software, not a qualified machine controller or a safety-assessment system. A plausible image, a converged equation solver, or a syntactically valid machine program is not evidence that a physical design or process is safe.

## Manufacturing and additive output

Generated NC and printer paths are generic drafts. Verify units, coordinates, work offsets, spindle conventions, stock, fixtures, tool and holder geometry, clearances, feeds, speeds, machine travel, tool changes and dialect in an independently qualified workflow. The built-in sampled heightfield preview cannot establish full collision avoidance and can miss narrow features, undercuts and holder collisions. Printer output assumes a separately established homed, heated and primed machine and does not implement a qualified startup procedure.

The workbench requires an explicit acknowledgement before exporting draft programs and blocks geometry-stale results. These checks reduce specific mistakes; they do not certify correctness. Do not bypass independent review by treating the acknowledgement as validation.

## Analysis

Selected-body meshing uses voxel occupancy, not an exact conforming representation of the CAD boundary. Thin features may disappear, surfaces are approximated, and automatically selected boundary planes may not represent real supports or loading. Check connectivity, units, material data, equilibrium, solver residuals and mesh convergence against independent analytical or validated numerical results. Linear isotropic elasticity excludes large deformation, plasticity, contact, fatigue and many failure modes. The thermal model is steady conduction, not a complete thermal environment.

## Geometry and interchange

Faceted Boolean operations and polygon offsets have numerical and topological limits. Inspect watertightness, orientation, dimensions, tolerances and small features after every critical modeling/import operation. Format support is per entity; a matching extension does not imply complete compatibility or preservation of modeling history.

## Data and execution

Imported native files are data, not executable scripts. Project parsing rejects invalid JSON structures, non-finite values and unsupported versions. Imported numerical data can still consume substantial CPU and memory; computational budgets and worker cancellation are safeguards, not a complete adversarial-input proof. Export native backups rather than relying solely on IndexedDB storage.

The browser CI uses explicit software-rendering flags inside disposable runners. Those flags are never injected into the deployed application and are not instructions to weaken a normal browsing session.
