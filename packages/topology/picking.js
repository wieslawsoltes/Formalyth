/** Screen-space edge choice restricted to the visible hit face. No DOM dependency. */
export function nearestFaceEdge(topology,faceId,project,x,y,threshold=10){
  if(!topology.faces[faceId]||![x,y,threshold].every(Number.isFinite)||threshold<0)throw new TypeError('Invalid edge pick');
  let best=null;
  for(const id of topology.faces[faceId].edges){const edge=topology.edges[id];
    for(const segment of edge.segments){const [a,b]=segment.map(i=>project(topology.points[i])),dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
      if(length2<1e-12)continue;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length2)),distance=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
      if(distance<=threshold&&(!best||distance<best.distance))best={edge,distance};
    }
  }return best?.edge||null;
}
export function selectionSegments(topology,kind,id){
  if(kind==='edge'){const e=topology.edges[id];if(!e)throw new RangeError('Unknown selected edge');return e.segments.map(s=>s.map(i=>topology.points[i]));}
  if(kind==='face'){const f=topology.faces[id];if(!f)throw new RangeError('Unknown selected face');return f.loops.flatMap(loop=>loop.map((i,j)=>[topology.points[i],topology.points[loop[(j+1)%loop.length]]]));}
  throw new TypeError('Selection must be a face or edge');
}
