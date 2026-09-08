import {h,icon,toast,formDialog,report,download,setFormPresentation} from '../packages/ui/index.js';
import {Menu} from '../packages/ui/menu.js';
import {VirtualList} from '../packages/ui/virtual-list.js';
import {FrameQueue} from '../packages/ui/scheduling.js';
import {Preferences} from '../packages/ui/preferences.js';
import {labelFor,scalar} from '../packages/ui/fields.js';
import {FeatureGraph} from '../packages/document/graph.js';
import {parameters,expression} from '../packages/solver/index.js';
import {cameraState,restoreCamera} from '../packages/renderer/projection.js';
import {installFeatureTools} from './feature-tools.js';
const $=s=>document.querySelector(s),safe=name=>String(name??''),short=label=>label.replace(/ · .*/,'');
const icons={constructionPlane:'sheet',region:'sketch',sketch:'sketch',faceSketch:'sketch',extrusion:'extrude',extrude:'extrude',extrudeRegion:'extrude',edgeChamfer:'cut',convexShell:'cube',faceDraft:'sheet',edgeRound:'curve',move:'move',pattern:'pattern',holes:'circle',surface:'curve'};
const designGroups=[
 ['Sketch',['sketch.create','sketch.constraintEditor','sketch.parametric','sketch.constraints','sketch.fromFace'],1],
 ['Create',['solid.extrusion','solid.box','solid.cylinder','solid.revolve','solid.sweep','solid.loft','solid.sphere','solid.torus','solid.cone','solid.tube','solid.shellbox','solid.helix'],2],
 ['Modify',['solid.chamfer','solid.shell','solid.round','solid.offsetFaces','solid.offsetAll','solid.draft','solid.move','solid.pattern','solid.mirror','solid.holes','solid.pocket','solid.combine','solid.split'],2],
 ['Construct',['construct.plane'],1],
 ['Inspect',['inspect.measure','inspect.properties','inspect.topology','inspect.section'],1],
 ['Select',['selection.body','selection.face','selection.edge'],3],
 ['Manage',['design.parameterTable','file.open','file.export','workspace.records','example.enclosure','file.examples'],1]
];
const bodyCommands=new Set(['solid.move','solid.pattern','solid.mirror','solid.holes','solid.pocket','solid.chamfer','solid.shell','solid.round','solid.offsetFaces','solid.offsetAll','solid.draft','solid.split','mesh.smooth','mesh.subdivide','mesh.simplify','mesh.stitch','inspect.properties','inspect.topology','cam.setup','cam.parallel','additive.slice','analysis.elastic','analysis.thermal','drawing.create']);
export {h,icon,toast,formDialog,report,download,setFormPresentation,Menu,VirtualList,FrameQueue,Preferences,labelFor,scalar,FeatureGraph,parameters,expression,cameraState,restoreCamera,installFeatureTools,$,safe,short,icons,designGroups,bodyCommands};
