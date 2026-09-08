import test from 'node:test';import assert from 'node:assert/strict';
import {tetraMeshBox,solveElasticity,solveThermal,surfaceLoad,planeConstraints,tetraGeometry,voxelTetrahedralize,deformationMesh} from '../packages/analysis/index.js';
import {box,topology,massProperties} from '../packages/kernel/index.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const model=tetraMeshBox({min:[0,0,0],max:[10,2,2]},{divisions:[4,2,2]});
test('tetra gradients partition unity and reproduce coordinates',()=>{const p=[[0,0,0],[2,0,0],[0,3,0],[0,0,4]],g=tetraGeometry(p);near(g.volume,4);for(let j=0;j<3;j++)near(g.gradients.reduce((s,p)=>s+p[j],0),0);for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(g.gradients.reduce((s,g,k)=>s+p[k][i]*g[j],0),i===j?1:0);});
test('linear tetra elasticity reproduces exact uniaxial bar solution and equilibrium',()=>{
  const young=1000,force=20,r=solveElasticity(model,{young,poisson:0,fixed:planeConstraints(model,0,0),loads:surfaceLoad(model,0,10,[force,0,0])});
  model.nodes.forEach((p,i)=>{near(r.displacement[i][0],force*p[0]/(young*4),1e-8);near(r.displacement[i][1],0,1e-8);near(r.displacement[i][2],0,1e-8);});near(r.maxVonMises,5,1e-6);near(r.maxDisplacement,.05,1e-8);near(r.reactions.filter((_,i)=>i%3===0).reduce((a,b)=>a+b,0),-20,1e-6);assert.ok(r.relativeResidual<1e-8);
});
test('prescribed affine strain patch yields uniform stress',()=>{const mesh=tetraMeshBox({min:[0,0,0],max:[2,2,2]},{divisions:[2,2,2]}),fixed=mesh.nodes.map((p,node)=>({node,value:[p[0]*.001,0,0]})),r=solveElasticity(mesh,{young:1000,poisson:0,fixed});for(const stress of r.stresses){near(stress[0],1);for(let i=1;i<6;i++)near(stress[i],0);}near(r.strainEnergy,.004);});
test('unrestrained elastic components and invalid material are rejected',()=>{assert.throws(()=>solveElasticity(model,{fixed:[]}),/rigid-body/);assert.throws(()=>solveElasticity(model,{poisson:.5}),/Poisson/);assert.throws(()=>solveElasticity(model,{fixed:[{node:0}]}),/rigid-body/);});
test('steady tetra conduction reproduces linear temperature and heat balance',()=>{const fixed=model.nodes.flatMap((p,node)=>p[0]===0?[{node,temperature:0}]:p[0]===10?[{node,temperature:100}]:[]),r=solveThermal(model,{conductivity:.2,fixed});model.nodes.forEach((p,i)=>near(r.temperature[i],p[0]*10,1e-7));for(const q of r.flux){near(q[0],-2,1e-7);near(q[1],0,1e-7);near(q[2],0,1e-7);}near(r.reactions.reduce((a,b)=>a+b,0),0,1e-7);});
test('voxel meshing and boundary extraction preserve an aligned box',()=>{const m=voxelTetrahedralize(box(10,10,10),{resolution:3});assert.equal(m.elements.length,162);const body=deformationMesh(m,{displacement:[]});assert.equal(topology(body).watertight,true);near(massProperties(body).volume,1000,1e-6);});
