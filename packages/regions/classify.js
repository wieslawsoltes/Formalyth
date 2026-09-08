/** Polygon-region classification. Explicitly rejects touching and crossing boundaries. */
export function signedArea(points) {
  const [ox, oy] = points[0]; let sum=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=(a[0]-ox)*(b[1]-oy)-(b[0]-ox)*(a[1]-oy);}
  return sum/2;
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function sign(a,b,c,e){const t=turn(a,b,c),limit=e*distance(a,b);return Math.abs(t)<=limit?0:Math.sign(t);}
function intersects(a,b,c,d,e){
  if(Math.max(a[0],b[0])+e<Math.min(c[0],d[0])||Math.max(c[0],d[0])+e<Math.min(a[0],b[0])||Math.max(a[1],b[1])+e<Math.min(c[1],d[1])||Math.max(c[1],d[1])+e<Math.min(a[1],b[1]))return false;
  return sign(a,b,c,e)*sign(a,b,d,e)<=0&&sign(c,d,a,e)*sign(c,d,b,e)<=0;
}
function contains(loop,p){let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function classifyRegions(input,{epsilon=1e-7,maxVertices=4096}={}){
  if(!Array.isArray(input)||!input.length||input.length>128||!Number.isFinite(epsilon)||epsilon<=0||!Number.isInteger(maxVertices)||maxVertices<3||maxVertices>100000)throw new RangeError('Invalid region input or limits');
  let total=0;
  const loops=input.map(raw=>{
    if(!Array.isArray(raw)||raw.length<3)throw new TypeError('Each boundary requires at least three points');
    const points=raw.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new TypeError('Expected finite XY boundary points');return [...p];});
    if(points.length>3&&distance(points[0],points.at(-1))<=epsilon)points.pop();
    total+=points.length;if(total>maxVertices)throw new RangeError('Region vertex budget exceeded');
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
      if(distance(a,b)<=epsilon)throw new RangeError('Degenerate boundary edge');
      if(sign(a,b,c,epsilon)===0&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)throw new RangeError('Overlapping adjacent boundary edges');
      for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&intersects(a,b,points[j],points[(j+1)%points.length],epsilon))throw new RangeError('Self-intersecting boundary');
    }
    if(Math.abs(signedArea(points))<=epsilon*epsilon)throw new RangeError('Zero-area boundary');return points;
  });
  for(let i=0;i<loops.length;i++)for(let j=i+1;j<loops.length;j++)for(let a=0;a<loops[i].length;a++)for(let b=0;b<loops[j].length;b++)if(intersects(loops[i][a],loops[i][(a+1)%loops[i].length],loops[j][b],loops[j][(b+1)%loops[j].length],epsilon))throw new RangeError('Region boundaries touch or cross');
  const areas=loops.map(p=>Math.abs(signedArea(p))),parents=loops.map((p,i)=>{
    let parent=-1;for(let j=0;j<loops.length;j++)if(j!==i&&areas[j]>areas[i]&&contains(loops[j],p[0])&&(parent<0||areas[j]<areas[parent]))parent=j;return parent;
  });
  const depths=parents.map((parent)=>{let depth=0;while(parent>=0){if(++depth>loops.length)throw new RangeError('Invalid nesting');parent=parents[parent];}return depth;});
  const oriented=loops.map((p,i)=>(signedArea(p)>0)===(depths[i]%2===0)?p:[...p].reverse());
  const regions=oriented.flatMap((outer,i)=>depths[i]%2?[]:[{outer,holes:oriented.filter((_,j)=>parents[j]===i),source:i,depth:depths[i]}]);
  return {loops:oriented,regions,parents,depths,area:areas.reduce((sum,a,i)=>sum+(depths[i]%2?-a:a),0)};
}
