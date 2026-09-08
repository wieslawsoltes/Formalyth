/** Experimental planar FDM slicing. No support generation or printer-specific control. */
import {finite,positive,integer,v3} from '../math/index.js';
import {section,topology,meshBounds,cleanProfile,area2} from '../kernel/index.js';
import {pointInPolygon,offsetPolygon,hatch,polygonBounds} from './geometry.js';
function closedLoops(segments,tolerance=1e-6){
  const nodes=new Map(),edges=[],key=p=>p.map(x=>Math.round(x/tolerance)).join(',');
  const node=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{point:p,edges:[]});return k;};
  segments.forEach(([a,b],i)=>{const aa=node(a),bb=node(b);if(aa===bb)return;const e={a:aa,b:bb,used:false};edges.push(e);nodes.get(aa).edges.push(e);nodes.get(bb).edges.push(e);});
  for(const n of nodes.values())if(n.edges.length!==2)throw new RangeError('Slice has an open or branching contour; repair mesh topology');
  const loops=[];for(const seed of edges){if(seed.used)continue;const start=seed.a;let current=start,edge=seed;const points=[];let guard=edges.length+1;
    do{if(!guard--)throw new RangeError('Slice contour traversal failed');points.push(nodes.get(current).point.slice(0,2));edge.used=true;current=edge.a===current?edge.b:edge.a;edge=nodes.get(current).edges.find(e=>!e.used);if(current!==start&&!edge)throw new RangeError('Open slice contour');}while(current!==start);
    loops.push(cleanProfile(points));
  }return loops;
}
export function sliceMesh(body,{layerHeight=.3,lineWidth=.45,shells=2,infill=.2,solidLayers=3,maxLayers=2000}={}){
  positive(layerHeight,'layer height');positive(lineWidth,'line width');if(layerHeight>lineWidth)throw new RangeError('Layer height exceeds extrusion width');integer(shells,1,10,'perimeters');finite(infill);if(infill<0||infill>1)throw new RangeError('Infill must be between 0 and 1');integer(solidLayers,0,100);integer(maxLayers,1,10000);
  if(!topology(body).watertight)throw new TypeError('Slicing requires a watertight consistently oriented mesh');const bounds=meshBounds(body),ratio=bounds.size[2]/layerHeight,nearest=Math.round(ratio);
  // Do not add a near-zero cap layer when a computed bound lies a few ULPs
  // above an exact layer multiple. Coordinate-scale error is capped at 1e-6
  // of a layer; real fractional layers are still retained.
  const ratioNoise=Math.min(1e-6,64*Number.EPSILON*Math.max(1,...bounds.min.map(Math.abs),...bounds.max.map(Math.abs),bounds.size[2])/layerHeight);
  const count=nearest>=1&&Math.abs(ratio-nearest)<=ratioNoise?nearest:Math.ceil(ratio);integer(count,1,maxLayers,'layer count');if(count*body.indices.length/3>30000000)throw new RangeError('Slice triangle-plane work budget exceeded');
  const layers=[];let totalLength=0,extrusionVolume=0,totalSegments=0;
  for(let layer=0;layer<count;layer++){
    const bottom=bounds.min[2]+layer*layerHeight,top=layer===count-1?bounds.max[2]:Math.min(bounds.max[2],bottom+layerHeight),height=top-bottom,contours=closedLoops(section(body,(bottom+top)/2)),depths=contours.map((p,i)=>contours.reduce((n,q,j)=>n+(i!==j&&Math.abs(area2(q))>Math.abs(area2(p))&&pointInPolygon(p[0],q)?1:0),0)),paths=[];
    const add=(points,closed,kind)=>{if(points.length<2)return;let length=0;for(let i=0;i<points.length-(closed?0:1);i++)length+=Math.hypot(points[(i+1)%points.length][0]-points[i][0],points[(i+1)%points.length][1]-points[i][1]);totalLength+=length;extrusionVolume+=length*height*lineWidth;totalSegments+=points.length;if(totalSegments>2000000)throw new RangeError('Additive path budget exceeded');paths.push({points,closed,kind,length});};
    for(let shell=shells-1;shell>=0;shell--)contours.forEach((p,i)=>{const offset=offsetPolygon(p,(depths[i]%2?1:-1)*(shell+.5)*lineWidth);if(depths[i]%2)offset.reverse();add(offset,true,'perimeter');});
    const density=layer<solidLayers||layer>=count-solidLayers?1:infill;
    if(density>0){const inner=contours.map((p,i)=>offsetPolygon(p,(depths[i]%2?1:-1)*(shells+.5)*lineWidth));for(const [a,b]of hatch(inner,lineWidth/density,{angle:layer%2?Math.PI/2:0}))add([a,b],false,density===1?'solid':'infill');}
    layers.push({index:layer,z:top,height,contours,paths});
  }
  return {layers,bounds,settings:{layerHeight,lineWidth,shells,infill,solidLayers},stats:{layers:layers.length,pathLength:totalLength,extrusionVolume,segments:totalSegments},warnings:['Experimental slicer: no supports, bridging analysis, cooling model, pressure advance, seam optimization, or printer collision verification.','Mitered perimeter offsets reject narrow or topology-changing regions rather than dropping them.']};
}
/** Absolute-E generic toolpath. Printer must already be homed and heated. */
export function postAdditive(slice,{bedWidth=220,bedDepth=220,margin=10,filamentDiameter=1.75,printFeed=1800,travelFeed=6000,retract=1,zHop=.4}={}){
  [bedWidth,bedDepth,filamentDiameter,printFeed,travelFeed].forEach(positive);[margin,retract,zHop].forEach(finite);if(margin<0||retract<0||zHop<0)throw new RangeError('Negative printer clearance');const b=slice.bounds;if(b.size[0]+2*margin>bedWidth||b.size[1]+2*margin>bedDepth)throw new RangeError('Model does not fit the declared print bed');
  const dx=bedWidth/2-b.center[0],dy=bedDepth/2-b.center[1],area=Math.PI*(filamentDiameter/2)**2,out=['; Formalyth experimental extrusion paths','; HOME, HEAT, PRIME AND VERIFY THE PRINTER BEFORE RUNNING','; Generic coordinates only; no machine configuration is inferred','G21','G90','M82','G92 E0'];let extrusion=0,previousZ=0;
  const f=x=>finite(x).toFixed(5).replace(/\.?0+$/,'')||'0';
  for(const layer of slice.layers){out.push(`; LAYER ${layer.index}`);const z=layer.z-b.min[2];for(const path of layer.paths){if(path.points.length<2)continue;const start=path.points[0],retracted=Math.min(retract,extrusion);if(retracted)out.push(`G1 E${f(extrusion-retracted)} F1800`);out.push(`G0 Z${f(Math.max(previousZ,z)+zHop)} F${f(travelFeed)}`,`G0 X${f(start[0]+dx)} Y${f(start[1]+dy)}`,`G0 Z${f(z)}`);if(retracted)out.push(`G1 E${f(extrusion)} F1800`);
      for(let i=1;i<path.points.length+(path.closed?1:0);i++){const a=path.points[i-1],p=path.points[i%path.points.length],length=Math.hypot(p[0]-a[0],p[1]-a[1]);extrusion+=length*layer.height*slice.settings.lineWidth/area;out.push(`G1 X${f(p[0]+dx)} Y${f(p[1]+dy)} E${f(extrusion)} F${f(printFeed)}`);}previousZ=z;
    }}out.push(`G0 Z${f(previousZ+5)} F${f(travelFeed)}`,'M400','; End of draft paths. Apply the printer-specific end sequence.');return out.join('\n')+'\n';
}
