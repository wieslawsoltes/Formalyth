# File interchange contracts

Internal modeling units are millimeters, using a right-handed Z-up coordinate system. Native project files retain history; neutral geometry formats generally do not. Parsers are bounded and local-only; the workbench does not fetch remote linked resources while importing a file.

| Format | Implemented scope | Important exclusions |
| --- | --- | --- |
| `.formalyth` / native JSON | Version-2 unified project; model, domains, view, extensions; migration from version-1 modeling document | Unknown versions reject; foreign native project formats are not supported |
| STL | ASCII and binary triangles, including binary files whose header begins with `solid`; explicit unit conversion in library options | No units encoded by STL itself, feature history, assemblies or reliable colors |
| OBJ | Polygon mesh faces, triangulation of concave faces, negative indices, groups and names | Not a complete material/texture/animation workflow |
| PLY | ASCII and binary little/big-endian polygon meshes within the supported property schema | Arbitrary user-defined semantic attributes are not a full round-trip contract |
| glTF / GLB 2.0 | Embedded static triangle scenes, transforms, bounded buffers/accessors; internal mm/Z-up converted to format m/Y-up | External buffers/resources, required unsupported extensions, skins and animation are not supported |
| Text DXF | Supported lines, polylines/bulges, circles/arcs and spline entities; profile joining, supported OCS/elevation and unit conversion | Not a complete drawing database, all entity types, external references, layouts or native history |
| STEP Part 21 | Narrow faceted boundary-representation subset, Cartesian points, polygon loops, planar face shells, compounds and supported units | General analytic/trimmed advanced surfaces, full assembly semantics and arbitrary schema coverage are not implemented |
| SVG | Generated engineering sheet output | SVG is not a native parametric project import format |
| NC / G-code | Experimental generic milling and planar printer path output | Not qualified or universal machine compatibility; see SAFETY.md |

Library API:

```js
import {importGeometry, exportGeometry} from './packages/exchange/index.js';
const imported = importGeometry(binaryOrText, 'stl', {units: 'mm'});
const output = exportGeometry(imported.bodies, 'glb');
```

Consult the individual parser and its tests for exact option names and budgets. The `formats` registry describes available readers/writers, not universal compatibility. For example, accepting a faceted STEP fixture must not be described as accepting all STEP files.

Round-trip tests check supported geometry, dimensions, orientation, transformed units, malformed inputs and explicit unsupported cases. Independent test corpora from multiple writers remain an open validation requirement.
