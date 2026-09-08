/** @module @formalyth/analysis — linear tetrahedral elasticity and steady conduction.
 * Units: millimetres, newtons, MPa; thermal conductivity is W/(mm K).
 * Research/engineering prototype: mesh convergence and independent validation are required.
 */
import {finite,positive,integer,v3,matrixRank} from '../math/index.js';
import {mesh,meshBounds,topology} from '../kernel/index.js';
import {TriangleBVH} from '../kernel/spatial.js';
export function validateVolumeMesh(model){
  if(!Array.isArray(model?.nodes)||!Array.isArray(model?.elements)||!model.nodes.length||!model.elements.length||model.nodes.length>12000||model.elements.length>60000)throw new RangeError('Volume mesh requires 1–12,000 nodes and 1–60,000 tetrahedra');
  model.nodes.forEach(p=>{if(!Array.isArray(p)||p.length!==3)throw new TypeError('Volume nodes must have three coordinates');p.forEach(finite);});
  model.elements.forEach(e=>{if(e.length!==4||new Set(e).size!==4)throw new TypeError('A tetrahedron requires four distinct nodes');e.forEach(i=>integer(i,0,model.nodes.length-1,'element node'));});return model;
}
export function tetraGeometry(points){
  const a=v3.sub(points[1],points[0]),b=v3.sub(points[2],points[0]),c=v3.sub(points[3],points[0]),det=v3.dot(a,v3.cross(b,c)),scale=Math.max(v3.length(a),v3.length(b),v3.length(c));
  if(Math.abs(det)<Math.max(1e-18,scale**3*1e-12))throw new RangeError('Degenerate or severely ill-conditioned tetrahedron');
  const g1=v3.scale(v3.cross(b,c),1/det),g2=v3.scale(v3.cross(c,a),1/det),g3=v3.scale(v3.cross(a,b),1/det),g0=v3.scale(v3.add(v3.add(g1,g2),g3),-1);return {volume:Math.abs(det)/6,gradients:[g0,g1,g2,g3]};
}
function sparse(size){return Array.from({length:size},()=>new Map());}
function add(matrix,i,j,value){if(Math.abs(value)>1e-30)matrix[i].set(j,(matrix[i].get(j)||0)+value);}
function multiply(matrix,x){const out=new Float64Array(x.length);for(let i=0;i<x.length;i++)for(const[j,v]of matrix[i])out[i]+=v*x[j];return out;}
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
/** Jacobi-preconditioned conjugate gradients with exact Dirichlet elimination. */
export function solveConstrained(matrix,loads,prescribed,{tolerance=1e-8,maxIterations=5000}={}){
  positive(tolerance);integer(maxIterations,1,20000);const size=loads.length;if(matrix.length!==size||size>36000)throw new RangeError('Linear system size limit');const fixed=new Map();
  for(const [index,value]of prescribed){integer(index,0,size-1,'fixed degree of freedom');finite(value);if(fixed.has(index)&&Math.abs(fixed.get(index)-value)>1e-12)throw new RangeError('Conflicting prescribed values');fixed.set(index,value);}
  const unknown=[],map=new Int32Array(size).fill(-1),solution=new Float64Array(size);for(let i=0;i<size;i++)if(fixed.has(i))solution[i]=fixed.get(i);else{map[i]=unknown.length;unknown.push(i);}
  const rhs=new Float64Array(unknown.length),diagonal=new Float64Array(unknown.length),rows=[];
  for(let i=0;i<unknown.length;i++){const row=unknown[i],columns=[],values=[];rhs[i]=finite(loads[row]);for(const [j,value]of matrix[row]){if(fixed.has(j))rhs[i]-=value*fixed.get(j);else{columns.push(map[j]);values.push(value);}if(row===j)diagonal[i]=value;}if(!(diagonal[i]>0))throw new RangeError('Unconstrained, disconnected, or singular degree of freedom');rows.push({columns:Int32Array.from(columns),values:Float64Array.from(values)});}
  const apply=x=>{const out=new Float64Array(x.length);for(let i=0;i<x.length;i++){const row=rows[i];for(let j=0;j<row.columns.length;j++)out[i]+=row.values[j]*x[row.columns[j]];}return out;};
  let x=new Float64Array(unknown.length),r=rhs.slice(),z=r.map((v,i)=>v/diagonal[i]),p=z.slice(),rz=dot(r,z),initial=Math.sqrt(dot(rhs,rhs)),residual=initial,iterations=0;
  while(residual>Math.max(1e-14,tolerance*initial)&&iterations<maxIterations){const ap=apply(p),den=dot(p,ap);if(!(den>0)||!Number.isFinite(den))throw new RangeError('Stiffness system is not positive definite; check restraints and connectivity');const alpha=rz/den;
    for(let i=0;i<x.length;i++){x[i]+=alpha*p[i];r[i]-=alpha*ap[i];}residual=Math.sqrt(dot(r,r));iterations++;if(residual<=Math.max(1e-14,tolerance*initial))break;z=r.map((v,i)=>v/diagonal[i]);const next=dot(r,z),beta=next/rz;for(let i=0;i<p.length;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  if(residual>Math.max(1e-14,tolerance*initial))throw new Error(`Iterative solve did not converge: relative residual ${residual/(initial||1)}`);
  unknown.forEach((index,i)=>solution[index]=x[i]);const internal=multiply(matrix,solution),reactions=internal.map((v,i)=>v-loads[i]);return {values:solution,reactions,iterations,residual,relativeResidual:residual/(initial||1),strainEnergy:dot(solution,internal)/2};
}
function components(model){const neighbors=model.nodes.map(()=>new Set());for(const e of model.elements)for(let i=1;i<4;i++){neighbors[e[0]].add(e[i]);neighbors[e[i]].add(e[0]);}const seen=new Set(),out=[];for(let i=0;i<neighbors.length;i++){if(seen.has(i))continue;const group=[],stack=[i];seen.add(i);while(stack.length){const j=stack.pop();group.push(j);for(const k of neighbors[j])if(!seen.has(k)){seen.add(k);stack.push(k);}}out.push(group);}return out;}
function checkRestraints(model,fixed,elastic){for(const group of components(model)){const ids=new Set(group),constraints=fixed.filter(([i])=>ids.has(Math.floor(i/(elastic?3:1))));if(!elastic){if(!constraints.length)throw new RangeError('Every thermal component needs a prescribed temperature');continue;}
    const center=group.reduce((p,i)=>v3.add(p,model.nodes[i]),[0,0,0]).map(v=>v/group.length),scale=Math.max(...group.map(i=>v3.distance(model.nodes[i],center)),1),rows=constraints.map(([i])=>{const [x,y,z]=v3.scale(v3.sub(model.nodes[Math.floor(i/3)],center),1/scale);return i%3===0?[1,0,0,0,z,-y]:i%3===1?[0,1,0,-z,0,x]:[0,0,1,y,-x,0];});if(matrixRank(rows,1e-9)<6)throw new RangeError('Restraints leave rigid-body motion in a connected component');
  }}
export function elasticityMatrix(young,poisson){positive(young,'Young modulus');finite(poisson);if(poisson<=-1||poisson>=.499)throw new RangeError('Poisson ratio must be in (-1,0.499); nearly incompressible materials are unsupported');const lambda=young*poisson/((1+poisson)*(1-2*poisson)),mu=young/(2*(1+poisson)),d=Array.from({length:6},()=>new Float64Array(6));for(let i=0;i<3;i++)for(let j=0;j<3;j++)d[i][j]=lambda+(i===j?2*mu:0);for(let i=3;i<6;i++)d[i][i]=mu;return d;}
function strainMatrix(gradients){const b=Array.from({length:6},()=>new Float64Array(12));gradients.forEach(([x,y,z],i)=>{const j=i*3;b[0][j]=x;b[1][j+1]=y;b[2][j+2]=z;b[3][j]=y;b[3][j+1]=x;b[4][j+1]=z;b[4][j+2]=y;b[5][j]=z;b[5][j+2]=x;});return b;}
export function solveElasticity(model,{young=70000,poisson=.33,loads=[],fixed=[],tolerance=1e-8,maxIterations=5000}={}){
  validateVolumeMesh(model);const material=elasticityMatrix(young,poisson),n=model.nodes.length*3,k=sparse(n),force=new Float64Array(n),prescribed=[];
  for(const load of loads){integer(load.node,0,model.nodes.length-1,'load node');if(!Array.isArray(load.force)||load.force.length!==3)throw new TypeError('Nodal force must have three components');load.force.forEach((v,i)=>force[load.node*3+i]+=finite(v));}
  for(const c of fixed){integer(c.node,0,model.nodes.length-1,'fixed node');const axes=c.axes||[0,1,2];for(const axis of axes){integer(axis,0,2,'fixed axis');prescribed.push([c.node*3+axis,Array.isArray(c.value)?finite(c.value[axis]):finite(c.value??0)]);}}
  checkRestraints(model,prescribed,true);const elements=[];
  for(const ids of model.elements){const geometry=tetraGeometry(ids.map(i=>model.nodes[i])),b=strainMatrix(geometry.gradients),db=material.map(row=>Array.from({length:12},(_,j)=>row.reduce((sum,v,i)=>sum+v*b[i][j],0))),dofs=ids.flatMap(i=>[i*3,i*3+1,i*3+2]);
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){let value=0;for(let r=0;r<6;r++)value+=b[r][i]*db[r][j];add(k,dofs[i],dofs[j],value*geometry.volume);}elements.push({ids,dofs,b,volume:geometry.volume});
  }
  const solved=solveConstrained(k,force,prescribed,{tolerance,maxIterations}),stresses=[],strains=[],vonMises=[],nodalStress=new Float64Array(model.nodes.length),weights=new Float64Array(model.nodes.length);
  for(const element of elements){const u=element.dofs.map(i=>solved.values[i]),strain=element.b.map(row=>dot(row,u)),stress=material.map(row=>dot(row,strain)),[sx,sy,sz,xy,yz,zx]=stress,vm=Math.sqrt(Math.max(0,((sx-sy)**2+(sy-sz)**2+(sz-sx)**2)/2+3*(xy*xy+yz*yz+zx*zx)));stresses.push(stress);strains.push(strain);vonMises.push(vm);for(const node of element.ids){nodalStress[node]+=vm*element.volume;weights[node]+=element.volume;}}
  for(let i=0;i<nodalStress.length;i++)nodalStress[i]/=weights[i]||1;const displacement=Array.from({length:model.nodes.length},(_,i)=>Array.from(solved.values.slice(i*3,i*3+3))),maxDisplacement=displacement.reduce((n,p)=>Math.max(n,v3.length(p)),0);
  return {...solved,displacement,stresses,strains,vonMises:Float64Array.from(vonMises),nodalStress,maxDisplacement,maxVonMises:Math.max(...vonMises),volume:elements.reduce((s,e)=>s+e.volume,0),units:{displacement:'mm',stress:'MPa',force:'N'},warnings:['Small-strain, isotropic, linear static tetrahedra only. No plasticity, contact, buckling, dynamics, or certification.','Linear tetrahedra and voxel geometry require mesh-convergence studies; displayed results are not a design safety approval.']};
}
export function solveThermal(model,{conductivity=.2,sources=[],fixed=[],tolerance=1e-8,maxIterations=5000}={}){
  validateVolumeMesh(model);positive(conductivity,'conductivity W/(mm K)');const n=model.nodes.length,k=sparse(n),load=new Float64Array(n),prescribed=fixed.map(c=>[integer(c.node,0,n-1),finite(c.temperature)]);for(const source of sources)load[integer(source.node,0,n-1)]+=finite(source.watts);checkRestraints(model,prescribed,false);const elements=[];
  for(const ids of model.elements){const g=tetraGeometry(ids.map(i=>model.nodes[i]));for(let i=0;i<4;i++)for(let j=0;j<4;j++)add(k,ids[i],ids[j],conductivity*g.volume*v3.dot(g.gradients[i],g.gradients[j]));elements.push({ids,...g});}
  const solved=solveConstrained(k,load,prescribed,{tolerance,maxIterations}),flux=elements.map(e=>v3.scale(e.ids.reduce((p,id,i)=>v3.add(p,v3.scale(e.gradients[i],solved.values[id])),[0,0,0]),-conductivity));return {...solved,temperature:solved.values,flux,minTemperature:Math.min(...solved.values),maxTemperature:Math.max(...solved.values),units:{temperature:'K or °C difference-consistent',heatFlux:'W/mm²'},warnings:['Steady isotropic conduction with nodal sources and prescribed temperatures only. No convection, radiation, transient heat, or certified thermal design.']};
}
const CELL_TETS=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]],CORNERS=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
function volumeGrid(bounds,divisions,inside){const size=v3.sub(bounds.max,bounds.min),nx=divisions[0],ny=divisions[1],nz=divisions[2];divisions.forEach(v=>integer(v,1,64));if(nx*ny*nz>10000)throw new RangeError('Volume grid exceeds 10,000 cells');size.forEach(positive);const nodes=[],elements=[],map=new Map(),node=(i,j,k)=>{const key=`${i}:${j}:${k}`;if(!map.has(key)){map.set(key,nodes.length);nodes.push([bounds.min[0]+size[0]*i/nx,bounds.min[1]+size[1]*j/ny,bounds.min[2]+size[2]*k/nz]);}return map.get(key);};
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const center=[bounds.min[0]+size[0]*(i+.5)/nx,bounds.min[1]+size[1]*(j+.5)/ny,bounds.min[2]+size[2]*(k+.5)/nz];if(inside&&!inside(center))continue;const ids=CORNERS.map(([x,y,z])=>node(i+x,j+y,k+z));for(const tet of CELL_TETS)elements.push(tet.map(id=>ids[id]));}
  return validateVolumeMesh({nodes,elements,bounds,divisions});}
export function tetraMeshBox(bounds,{divisions=[4,4,4]}={}){return volumeGrid(bounds,divisions);}
export function voxelTetrahedralize(body,{resolution=10}={}){
  integer(resolution,2,24);if(!topology(body).watertight)throw new TypeError('Volume meshing requires a watertight mesh');const bounds=meshBounds(body),cell=Math.max(...bounds.size)/resolution,divisions=bounds.size.map(s=>Math.max(1,Math.ceil(s/cell))),bvh=new TriangleBVH(body),direction=v3.normalize([1,.003171,.002357]),epsilon=Math.max(1e-7,cell*1e-6);
  const inside=point=>{let origin=point,count=0;while(count<1024){const hit=bvh.intersect(origin,direction);if(!hit)return count%2===1;count++;origin=v3.add(hit.point,v3.scale(direction,epsilon));}throw new RangeError('Volume parity query exceeded intersection budget');};
  const model=volumeGrid(bounds,divisions,inside);model.approximation='Voxel occupancy sampled at cell centres, then six tetrahedra per occupied cell; not a surface-conforming mesh.';return model;
}
export function boundaryFaces(model){const faces=new Map();model.elements.forEach((e,element)=>{for(let opposite=0;opposite<4;opposite++){let ids=e.filter((_,i)=>i!==opposite);const[a,b,c]=ids.map(i=>model.nodes[i]),normal=v3.cross(v3.sub(b,a),v3.sub(c,a));if(v3.dot(normal,v3.sub(model.nodes[e[opposite]],a))>0)[ids[1],ids[2]]=[ids[2],ids[1]];const key=[...ids].sort((a,b)=>a-b).join(':');if(faces.has(key))faces.get(key).count++;else faces.set(key,{ids,element,count:1});}});for(const f of faces.values())if(f.count>2)throw new RangeError('Non-manifold volume faces');return [...faces.values()].filter(f=>f.count===1);}
export function surfaceLoad(model,axis,coordinate,force,{tolerance=1e-6}={}){integer(axis,0,2);force.forEach(finite);const weights=new Map();let area=0;for(const face of boundaryFaces(model)){const p=face.ids.map(i=>model.nodes[i]);if(!p.every(p=>Math.abs(p[axis]-coordinate)<=tolerance))continue;const a=v3.length(v3.cross(v3.sub(p[1],p[0]),v3.sub(p[2],p[0])))/2;area+=a;for(const i of face.ids)weights.set(i,(weights.get(i)||0)+a/3);}if(!area)throw new RangeError('No volume boundary faces at the selected plane');return [...weights].map(([node,weight])=>({node,force:force.map(x=>x*weight/area)}));}
export function planeConstraints(model,axis,coordinate,{axes=[0,1,2],value=0,tolerance=1e-6}={}){integer(axis,0,2);const result=[];model.nodes.forEach((p,node)=>{if(Math.abs(p[axis]-coordinate)<=tolerance)result.push({node,axes,value});});if(!result.length)throw new RangeError('No nodes on the selected restraint plane');return result;}
export function deformationMesh(model,result,{scale=1}={}){finite(scale);const positions=model.nodes.flatMap((p,i)=>p.map((x,j)=>x+(result.displacement?.[i]?.[j]||0)*scale)),faces=boundaryFaces(model);return mesh(positions,faces.flatMap(f=>f.ids),{kind:'analysis-boundary'});}
