/** Planar polygon utilities shared by CAM, slicing, and sheet nesting. */
import {finite,positive,integer} from '../math/index.js';
import {cleanProfile,area2} from '../kernel/index.js';
export function polygonBounds(p){return {min:[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1]))],max:[Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]};}
export function pointInPolygon(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
/** Miter offset of a simple polygon. Topology-changing offsets are rejected. */
export function offsetPolygon(points,distance,{miterLimit=20}={}){
  const p=cleanProfile(points);finite(distance);positive(miterLimit);if(Math.abs(distance)<1e-10)return p;
  const lines=p.map((a,i)=>{const b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);return {p:[a[0]+dy/length*distance,a[1]-dx/length*distance],d:[dx/length,dy/length]};});
  const out=lines.map((b,i)=>{const a=lines[(i+p.length-1)%p.length],cross=a.d[0]*b.d[1]-a.d[1]*b.d[0];if(Math.abs(cross)<1e-10)throw new RangeError('Offset contains parallel/reversing adjacent edges');const delta=[b.p[0]-a.p[0],b.p[1]-a.p[1]],t=(delta[0]*b.d[1]-delta[1]*b.d[0])/cross,q=[a.p[0]+a.d[0]*t,a.p[1]+a.d[1]*t];if(Math.hypot(q[0]-p[i][0],q[1]-p[i][1])>Math.abs(distance)*miterLimit)throw new RangeError('Offset miter limit exceeded');return q;});
  if(area2(out)<=1e-8)throw new RangeError('Offset collapsed the polygon');const result=cleanProfile(out);
  if(distance<0){for(let i=0;i<result.length;i++){const q=result[i],next=result[(i+1)%result.length];for(const point of [q,[(q[0]+next[0])/2,(q[1]+next[1])/2]]){if(!pointInPolygon(point,p))throw new RangeError('Inward offset crossed the profile');let closest=Infinity;for(let j=0;j<p.length;j++)closest=Math.min(closest,segmentDistance(point,p[j],p[(j+1)%p.length]));if(closest+1e-6<Math.abs(distance))throw new RangeError('Inward offset crossed a narrow feature');}}}
  return result;
}
export function scanline(polygon,y){const hits=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);if(hits.length%2)throw new RangeError('Unbalanced polygon scanline');return Array.from({length:hits.length/2},(_,i)=>[hits[i*2],hits[i*2+1]]);}
export function subtractIntervals(intervals,holes){let out=intervals;for(const [lo,hi]of holes){const next=[];for(const [a,b]of out){if(hi<=a||lo>=b)next.push([a,b]);else{if(lo>a)next.push([a,Math.min(lo,b)]);if(hi<b)next.push([Math.max(hi,a),b]);}}out=next;}return out.filter(([a,b])=>b-a>1e-8);}
export function hatch(polygons,spacing,{angle=0,margin=1e-7}={}){
  positive(spacing);finite(angle);const c=Math.cos(angle),s=Math.sin(angle),rotate=p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c],unrotate=p=>[p[0]*c-p[1]*s,p[0]*s+p[1]*c],loops=polygons.map(p=>p.map(rotate)),all=loops.flat();if(!all.length)return [];
  const bounds=polygonBounds(all),height=bounds.max[1]-bounds.min[1],count=Math.max(1,Math.ceil(height/spacing));integer(count,1,10000,'hatch rows');const lines=[];
  for(let row=0;row<count;row++){const y=bounds.min[1]+(row+.5)*height/count,hits=loops.flatMap(p=>scanline(p,y).flat()).sort((a,b)=>a-b);if(hits.length%2)throw new RangeError('Invalid nested loops');for(let i=0;i<hits.length;i+=2)if(hits[i+1]-hits[i]>margin*2){let a=unrotate([hits[i]+margin,y]),b=unrotate([hits[i+1]-margin,y]);if(row%2)[a,b]=[b,a];lines.push([a,b]);}}
  return lines;
}
/** Greedy rectangle-envelope nesting, with optional quarter-turn rotation. */
export function nestRectangles(parts,{width=300,height=200,spacing=3,margin=5,rotate=true,maxSheets=10}={}){
  positive(width);positive(height);finite(spacing);finite(margin);if(spacing<0||margin<0||2*margin>=Math.min(width,height))throw new RangeError('Invalid nesting clearance');integer(maxSheets,1,100);if(parts.length>1000)throw new RangeError('Nesting part limit exceeded');
  const sorted=parts.map((p,i)=>({...p,id:p.id??String(i),width:positive(p.width),height:positive(p.height)})).sort((a,b)=>b.width*b.height-a.width*a.height),sheets=[],placements=[];
  for(const part of sorted){let best=null;for(let sheet=0;sheet<Math.min(maxSheets,sheets.length+1);sheet++){const placed=sheets[sheet]||[],xs=[margin,...placed.map(p=>p.x+p.width+spacing)],ys=[margin,...placed.map(p=>p.y+p.height+spacing)];for(const rotation of rotate?[0,90]:[0]){const w=rotation?part.height:part.width,h=rotation?part.width:part.height;for(const y of ys)for(const x of xs){if(x+w>width-margin+1e-9||y+h>height-margin+1e-9)continue;if(placed.some(p=>x<p.x+p.width+spacing-1e-9&&x+w+spacing>p.x+1e-9&&y<p.y+p.height+spacing-1e-9&&y+h+spacing>p.y+1e-9))continue;const score=sheet*width*height*100+y*width+x;if(!best||score<best.score)best={id:part.id,sheet,x,y,width:w,height:h,rotation,score};}}}
    if(!best)throw new RangeError(`Part ${part.id} cannot fit within ${maxSheets} sheets`);delete best.score;if(!sheets[best.sheet])sheets[best.sheet]=[];sheets[best.sheet].push(best);placements.push(best);
  }
  return {placements,sheets:sheets.length,width,height,utilization:placements.reduce((n,p)=>n+p.width*p.height,0)/(Math.max(1,sheets.length)*width*height),method:'greedy rectangular envelopes; not polygon nesting or an optimum guarantee'};
}
