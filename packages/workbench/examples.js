import {DesignDocument} from '../document/index.js';
import {Project,createProject} from '../project/index.js';
import {box} from '../kernel/index.js';
import {buildTopology,edgeReference} from '../topology/index.js';
/** Native parametric enclosure; original features, no imported fixture geometry. */
export function roundedEnclosureProject() {
  const d=new DesignDocument();
  d.transact('Enclosure dimensions',data=>{data.name='Rounded enclosure';data.parameters={width:80,depth:55,height:28,cornerRadius:6,wall:2};});
  const base=d.addFeature('box',{width:'width',depth:'depth',height:'height'},[],'Enclosure blank');
  const topology=buildTopology(box(80,55,28));
  const edges=topology.edges.filter(e=>{
    const[a,b]=e.vertices.map(id=>topology.points[id]);return Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6;
  }).map(e=>edgeReference(topology,e.id));
  const rounded=d.addFeature('edgeRound',{edges,radius:'cornerRadius',segments:8},[base],'Rounded corners');
  d.addFeature('convexShell',{openings:[{kind:'planar-face-v1',normal:[0,0,1]}],thickness:'wall',direction:'inward'},[rounded],'Open enclosure');
  return new Project(createProject(d.data.name,d.data));
}
