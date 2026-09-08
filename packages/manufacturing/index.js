/** @module @formalyth/manufacturing — bounded, offline toolpaths and sampled stock analysis.
 * Output is draft NC, not a validated machine program. No machine communication exists.
 */
import {finite,positive,integer,v3} from '../math/index.js';
import {cleanProfile,meshBounds,mesh} from '../kernel/index.js';
import {TriangleBVH} from '../kernel/spatial.js';
import {offsetPolygon,polygonBounds,scanline,subtractIntervals,pointInPolygon} from './geometry.js';
export * from './geometry.js';
export const toolLibrary=Object.freeze([
  {id:'endmill-6',name:'6 mm flat end mill',type:'flat',diameter:6,fluteLength:25,number:1},
  {id:'endmill-3',name:'3 mm flat end mill',type:'flat',diameter:3,fluteLength:15,number:2},
  {id:'ball-6',name:'6 mm ball end mill',type:'ball',diameter:6,fluteLength:25,number:3},
  {id:'drill-5',name:'5 mm drill',type:'drill',diameter:5,fluteLength:45,number:4}
]);
export function validateTool(tool){if(!tool||!['flat','ball','drill'].includes(tool.type))throw new TypeError('Supported tools are flat, ball, and drill');positive(tool.diameter,'tool diameter');positive(tool.fluteLength,'flute length');integer(tool.number??1,1,999,'tool number');return {...tool,number:tool.number??1};}
export function levels(top,bottom,stepDown){finite(top);finite(bottom);positive(stepDown);if(bottom>=top)throw new RangeError('Cut bottom must be below stock top');const count=Math.ceil((top-bottom)/stepDown);integer(count,1,2000,'depth passes');return Array.from({length:count},(_,i)=>Math.max(bottom,top-(i+1)*stepDown));}
function settings(spec){const tool=validateTool(spec.tool||toolLibrary[0]),top=finite(spec.top??0),bottom=finite(spec.bottom??-5),safe=finite(spec.safe??top+8),feed=positive(spec.feed??600,'cut feed'),plunge=positive(spec.plunge??180,'plunge feed'),rpm=positive(spec.rpm??10000,'spindle RPM'),stepDown=positive(spec.stepDown??2,'stepdown');
  if(safe<=top+.1)throw new RangeError('Safe height must exceed stock top');if(top-bottom>tool.fluteLength+1e-8)throw new RangeError('Cut depth exceeds declared flute length');if(feed>100000||plunge>100000||rpm>100000)throw new RangeError('Feed or speed exceeds application limits');return {tool,top,bottom,safe,feed,plunge,rpm,stepDown};}
class PathBuilder{
  constructor(settings){this.settings=settings;this.moves=[];}
  add(x,y,z,kind='cut'){[x,y,z].forEach(finite);if(this.moves.length>1000000)throw new RangeError('Toolpath move budget exceeded');const previous=this.moves.at(-1);if(previous&&Math.hypot(x-previous.x,y-previous.y,z-previous.z)<1e-9)return;this.moves.push({x,y,z,kind,feed:kind==='rapid'?null:kind==='plunge'?this.settings.plunge:this.settings.feed});}
  begin(x,y){const previous=this.moves.at(-1);if(previous)this.add(previous.x,previous.y,this.settings.safe,'rapid');this.add(x,y,this.settings.safe,'rapid');}
  end(){const p=this.moves.at(-1);if(p)this.add(p.x,p.y,this.settings.safe,'rapid');}
  line(a,b,z){this.begin(...a);this.add(a[0],a[1],z,'plunge');this.add(b[0],b[1],z);this.end();}
  contour(profile,z){this.begin(...profile[0]);this.add(profile[0][0],profile[0][1],z,'plunge');for(let i=1;i<=profile.length;i++){const p=profile[i%profile.length];this.add(p[0],p[1],z);}this.end();}
}
const asPoint=m=>[m.x,m.y,m.z];
export function pathStatistics(moves,{rapidFeed=3000}={}){positive(rapidFeed);let length=0,cutLength=0,rapidLength=0,minutes=0;for(let i=1;i<moves.length;i++){const a=moves[i-1],b=moves[i],distance=v3.distance(asPoint(a),asPoint(b));length+=distance;if(b.kind==='rapid')rapidLength+=distance;else cutLength+=distance;minutes+=distance/(b.kind==='rapid'?rapidFeed:positive(b.feed));}return {length,cutLength,rapidLength,estimatedMinutes:minutes,moveCount:moves.length,timeModel:'constant feed; no acceleration, tool changes, or spindle delays'};}
export function createToolpath(spec,geometry){
  const s=settings(spec),path=new PathBuilder(s),warnings=['Draft toolpath. Verify work coordinates, stock, fixtures, tool geometry, spindle, feeds, and machine limits before use.'];
  const p=Array.isArray(geometry)?cleanProfile(geometry):geometry?.kind==='profile'?cleanProfile(geometry.points):null;
  const body=geometry?.positions?geometry:null;
  if(['contour','pocket','face'].includes(spec.strategy)&&s.tool.type!=='flat')throw new TypeError('This strategy requires a flat end mill');
  if(spec.strategy==='contour'){
    if(!p)throw new TypeError('Contour requires a planar profile');const allowance=finite(spec.allowance??0);if(allowance<0)throw new RangeError('Stock allowance cannot be negative');
    const side=spec.side||'outside';if(!['outside','inside','center'].includes(side))throw new TypeError('Invalid contour side');
    const distance=side==='center'?0:(side==='outside'?1:-1)*(s.tool.diameter/2+allowance),profile=offsetPolygon(p,distance);
    const direction=spec.direction||(side==='inside'?'counterclockwise':'clockwise');if(!['clockwise','counterclockwise'].includes(direction))throw new TypeError('Unknown contour direction');if(direction==='clockwise')profile.reverse();for(const z of levels(s.top,s.bottom,s.stepDown))path.contour(profile,z);
    if(side==='center')warnings.push('Centerline contour has no cutter-radius compensation.');
  }else if(spec.strategy==='pocket'){
    if(!p)throw new TypeError('Pocket requires a planar profile');const allowance=finite(spec.allowance??0);if(allowance<0)throw new RangeError('Stock allowance cannot be negative');const radius=s.tool.diameter/2+allowance,profile=offsetPolygon(p,-radius),islands=(spec.islands||[]).map(p=>offsetPolygon(cleanProfile(p),radius));
    for(const island of islands)for(let i=0;i<island.length;i++){const a=island[i],b=island[(i+1)%island.length];if(!pointInPolygon(a,profile)||!pointInPolygon([(a[0]+b[0])/2,(a[1]+b[1])/2],profile))throw new RangeError('Island clearance crosses the pocket boundary');}
    for(let i=0;i<islands.length;i++)for(let j=i+1;j<islands.length;j++)if(islands[i].some(p=>pointInPolygon(p,islands[j]))||islands[j].some(p=>pointInPolygon(p,islands[i])))throw new RangeError('Island offsets overlap');
    const step=positive(spec.stepover??s.tool.diameter*.45,'stepover');if(step>s.tool.diameter)throw new RangeError('Stepover leaves uncut strips');const b=polygonBounds(profile),rows=Math.max(1,Math.ceil((b.max[1]-b.min[1])/step));integer(rows,1,10000,'pocket rows');
    for(const z of levels(s.top,s.bottom,s.stepDown)){for(let row=0;row<=rows;row++){const y=b.min[1]+1e-7+(b.max[1]-b.min[1]-2e-7)*row/rows,segments=subtractIntervals(scanline(profile,y),islands.flatMap(h=>scanline(h,y)));if(row%2)segments.reverse();for(let [a,c]of segments){if(row%2)[a,c]=[c,a];path.line([a,y],[c,y],z);}}
      path.contour(profile,z);for(const island of islands)path.contour([...island].reverse(),z);
    }
    warnings.push('Mitered offsets reject topology changes and narrow regions. Straight plunges require a center-cutting tool or a pre-drilled entry.');
  }else if(spec.strategy==='face'){
    const b=p?polygonBounds(p):body?meshBounds(body):spec.bounds;if(!b)throw new TypeError('Facing requires stock bounds');const r=s.tool.diameter/2,step=positive(spec.stepover??s.tool.diameter*.7,'stepover');if(step>s.tool.diameter)throw new RangeError('Stepover exceeds cutter diameter');const rows=Math.max(1,Math.ceil((b.max[1]-b.min[1])/step));integer(rows,1,10000);
    for(const z of levels(s.top,s.bottom,s.stepDown))for(let row=0;row<=rows;row++){const y=b.min[1]+(b.max[1]-b.min[1])*row/rows,a=[b.min[0]-r,y],c=[b.max[0]+r,y];path.line(...(row%2?[c,a]:[a,c]),z);}
  }else if(spec.strategy==='drill'){
    if(s.tool.type!=='drill')throw new TypeError('Drilling requires a drill tool');const centers=spec.centers||p;if(!centers?.length||centers.length>10000)throw new RangeError('Provide 1–10,000 drill centers');const peck=positive(spec.peck??s.stepDown,'peck depth'),clearance=Math.min(s.safe,s.top+positive(spec.retract??2,'retract height'));
    for(const [x,y]of centers){path.begin(x,y);let previous=s.top;for(const z of levels(s.top,s.bottom,peck)){path.add(x,y,previous===s.top?clearance:Math.min(clearance,previous+.5),'rapid');path.add(x,y,z,'plunge');path.add(x,y,clearance,'rapid');previous=z;}path.end();}
    warnings.push('Drill tip angle, breakthrough allowance, coolant, and machine canned cycles are not inferred.');
  }else if(spec.strategy==='parallel'){
    if(!body||s.tool.type!=='ball')throw new TypeError('Parallel finishing requires a mesh and a ball end mill');const b=meshBounds(body);if(s.safe<=b.max[2])throw new RangeError('Safe height must clear the complete model');const tolerance=positive(spec.tolerance??1,'sample spacing'),stepover=positive(spec.stepover??s.tool.diameter*.25,'stepover'),r=s.tool.diameter/2,bvh=new TriangleBVH(body),nx=Math.ceil(b.size[0]/tolerance)+1,ny=Math.ceil(b.size[1]/tolerance)+1;if(nx*ny>150000)throw new RangeError('Finishing height-field budget exceeded');
    const heights=new Float64Array(nx*ny).fill(-Infinity),dx=b.size[0]/Math.max(1,nx-1),dy=b.size[1]/Math.max(1,ny-1);if(dx<=0||dy<=0)throw new RangeError('Finishing requires an XY-area surface');
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const hit=bvh.intersect([b.min[0]+i*dx,b.min[1]+j*dy,s.safe],[0,0,-1]);if(hit)heights[j*nx+i]=hit.point[2];}
    const rows=Math.max(1,Math.ceil(b.size[1]/stepover));integer(rows,1,10000);let samples=0;
    for(let row=0;row<=rows;row++){const j=Math.min(ny-1,Math.round(row*(ny-1)/rows)),y=b.min[1]+j*dy;let active=false;
      for(let col=0;col<nx;col++){const i=row%2?nx-1-col:col,x=b.min[0]+i*dx;if(!Number.isFinite(heights[j*nx+i])){if(active)path.end();active=false;continue;}let z=-Infinity;
        for(let jj=Math.max(0,j-Math.ceil(r/dy));jj<=Math.min(ny-1,j+Math.ceil(r/dy));jj++)for(let ii=Math.max(0,i-Math.ceil(r/dx));ii<=Math.min(nx-1,i+Math.ceil(r/dx));ii++){if(++samples>20000000)throw new RangeError('Ball-contact sampling budget exceeded');const d2=((ii-i)*dx)**2+((jj-j)*dy)**2;if(d2<=r*r)z=Math.max(z,heights[jj*nx+ii]+Math.sqrt(r*r-d2)-r);}
        if(!active){path.begin(x,y);path.add(x,y,z,'plunge');active=true;}else path.add(x,y,z);
      }if(active)path.end();
    }
    warnings.push('Experimental sampled ball-contact finishing. Sampling can miss features; undercuts, holder collisions, and gouge-free certification are not supported.');
  }else throw new TypeError(`Unsupported manufacturing strategy: ${spec.strategy}`);
  if(!path.moves.length)throw new RangeError('Operation generated no tool motion');return {strategy:spec.strategy,settings:s,moves:path.moves,stats:pathStatistics(path.moves),warnings};
}
/** Generic 3-axis mill post. Initial Z retract is emitted before XY positioning. */
export function postProcess(operations,{program='Formalyth',workOffset=54,rapidFeed=3000}={}){
  if(!Array.isArray(operations))operations=[operations];integer(workOffset,54,59,'work offset');positive(rapidFeed);if(!operations.length)throw new RangeError('No operations to post');const out=[`(${String(program).replace(/[()\r\n]/g,' ').slice(0,80)})`,'(DRAFT - VERIFY IN AN INDEPENDENT SIMULATOR AND ON THE TARGET MACHINE)','G21 G90 G17 G94 G40 G49 G80',`G${workOffset}`];let tool=null;
  const f=x=>finite(x).toFixed(4).replace(/\.?0+$/,'')||'0';
  for(const operation of operations){const s=operation.settings;validateTool(s.tool);if(s.safe<=s.top)throw new RangeError('Unsafe posted retract');out.push(`(${operation.strategy})`,'M5',`G0 Z${f(s.safe)}`);if(tool!==s.tool.number){out.push(`T${s.tool.number} M6`);tool=s.tool.number;}out.push(`S${Math.round(positive(s.rpm))} M3`);
    for(const move of operation.moves){if(!['rapid','cut','plunge'].includes(move.kind))throw new TypeError('Unknown move kind');out.push(`${move.kind==='rapid'?'G0':'G1'} X${f(move.x)} Y${f(move.y)} Z${f(move.z)}${move.kind==='rapid'?'':` F${f(positive(move.feed))}`}`);}out.push(`G0 Z${f(s.safe)}`,'M5');
  }out.push('M30');return out.join('\n')+'\n';
}
/** Height-field stock simulation: flat/ball cutters, sampled rapid collision checks. */
export function simulateStock(operation,{bounds,resolution=96}={}){
  integer(resolution,8,256,'stock resolution');if(!bounds?.min||!bounds?.max)throw new TypeError('Stock bounds required');const min=bounds.min.map(finite),max=bounds.max.map(finite),size=v3.sub(max,min);size.forEach(positive);const tool=validateTool(operation.settings.tool),r=tool.diameter/2,nx=resolution,ny=Math.max(8,Math.min(256,Math.round(resolution*size[1]/size[0]))),dx=size[0]/nx,dy=size[1]/ny,heights=new Float64Array(nx*ny).fill(max[2]),collisions=[],moves=operation.moves;let removed=0,samples=0;
  for(let m=1;m<moves.length;m++){const a=moves[m-1],b=moves[m],distance=v3.distance(asPoint(a),asPoint(b)),steps=Math.max(1,Math.ceil(distance/(Math.min(dx,dy,r)/2)));if(steps>1000000)throw new RangeError('Motion segment exceeds simulation sample budget');let collision=false;
    for(let s=0;s<=steps;s++){const t=s/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
      const ilo=Math.max(0,Math.floor((x-r-min[0])/dx)),ihi=Math.min(nx-1,Math.floor((x+r-min[0])/dx)),jlo=Math.max(0,Math.floor((y-r-min[1])/dy)),jhi=Math.min(ny-1,Math.floor((y+r-min[1])/dy));
      for(let j=jlo;j<=jhi;j++)for(let i=ilo;i<=ihi;i++){if(++samples>40000000)throw new RangeError('Stock simulation work budget exceeded');const d2=(min[0]+(i+.5)*dx-x)**2+(min[1]+(j+.5)*dy-y)**2;if(d2>r*r)continue;const tip=z+(tool.type==='ball'?r-Math.sqrt(r*r-d2):0),index=j*nx+i;if(b.kind==='rapid'){if(tip<heights[index]-.01)collision=true;}else if(tip<heights[index]){const next=Math.max(min[2],tip);removed+=(heights[index]-next)*dx*dy;heights[index]=next;}}
    }if(collision)collisions.push(m);
  }
  return {heights,nx,ny,bounds:{min,max},removedVolume:removed,rapidCollisions:collisions,samples,limitations:'Sampled 2.5D height field, cutter only. No holder, fixture, machine, or undercut collision model.'};
}
export function stockMesh(stock){const {heights,nx,ny,bounds}=stock,{min,max}=bounds,dx=(max[0]-min[0])/nx,dy=(max[1]-min[1])/ny,p=[],indices=[];
  // Individual top cells intentionally preserve stepped stock heights; this is an open visualization mesh.
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+i*dx,y=min[1]+j*dy,z=heights[j*nx+i],n=p.length/3;p.push(x,y,z,x+dx,y,z,x+dx,y+dy,z,x,y+dy,z);indices.push(n,n+1,n+2,n,n+2,n+3);}return mesh(p,indices,{kind:'stock-height-field',open:true});}
