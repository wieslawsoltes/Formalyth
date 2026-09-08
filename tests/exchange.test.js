import test from 'node:test';
import assert from 'node:assert/strict';
import {box, cylinder, transform, merge, massProperties, topology, area2} from '../packages/kernel/index.js';
import {m4} from '../packages/math/index.js';
import * as x from '../packages/exchange/index.js';
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const body=transform(box(10,20,30),m4.translation(17,-32,54));
for(const format of ['stl','obj','ply','gltf','glb','step'])test(`${format}: geometry, units and orientation round trip`,()=>{
  const output=x.exportGeometry([{name:'A test part',value:body}],format),result=x.importGeometry(output,format);
  assert.equal(result.bodies.length,1);const actual=result.bodies[0].mesh,p=massProperties(actual),expected=massProperties(body);
  near(p.signedVolume,expected.signedVolume,.01);p.centroid.forEach((c,i)=>near(c,expected.centroid[i],1e-4));assert.equal(topology(actual).watertight,true);
});
test('ASCII STL and binary STL with misleading solid header',()=>{
  const ascii=x.writeSTL(body,{binary:false});near(massProperties(x.readSTL(ascii).bodies[0].mesh).volume,6000);
  const binary=x.writeSTL(body);new Uint8Array(binary).set(new TextEncoder().encode('solid misleading'));near(massProperties(x.readSTL(binary).bodies[0].mesh).volume,6000);
  assert.throws(()=>x.readSTL(binary.slice(0,-1)));assert.throws(()=>x.readSTL(ascii.replace('endfacet','malformed')));
});
test('STL explicit unit conversion',()=>near(massProperties(x.readSTL(x.writeSTL(box(1,1,1)),{scale:25.4}).bodies[0].mesh).volume,25.4**3));
test('OBJ concave faces, negative indices, groups and inline comments',()=>{
  const input='o corner\nv 0 0 0\nv 4 0 0\nv 4 1 0\nv 1 1 0\nv 1 4 0\nv 0 4 0\nf -6 -5 -4 -3 -2 -1 # planar concave polygon\n';
  const result=x.readOBJ(input);near(massProperties(result.bodies[0].mesh).area,7);assert.equal(result.bodies[0].mesh.indices.length/3,4);
  assert.throws(()=>x.readOBJ('v 0 0 0\nf 1 2 3'),/index/);assert.throws(()=>x.readOBJ('v 0 0 0\nl 1 1'),/unsupported/);
});
test('PLY ascii, binary little endian and independent big endian fixture',()=>{
  for(const binary of [false,true])near(massProperties(x.readPLY(x.writePLY(body,{binary})).bodies[0].mesh).volume,6000);
  const header=new TextEncoder().encode('ply\nformat binary_big_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n'),bytes=new Uint8Array(header.length+36+13);bytes.set(header);const view=new DataView(bytes.buffer,header.length);
  [0,0,0,2,0,0,0,3,0].forEach((v,i)=>view.setFloat32(i*4,v,false));view.setUint8(36,3);[0,1,2].forEach((v,i)=>view.setInt32(37+i*4,v,false));near(massProperties(x.readPLY(bytes).bodies[0].mesh).area,3);assert.throws(()=>x.readPLY(bytes.slice(0,-1)),/Truncated/);
});
test('glTF external resources, required extensions, skins and truncated GLB fail',()=>{
  const data=JSON.parse(x.writeGLTF([{mesh:body}]));data.buffers[0].uri='https://example.invalid/model.bin';assert.throws(()=>x.readGLTF(JSON.stringify(data)),/external|embedded|data URI/i);
  data.extensionsRequired=['KHR_draco_mesh_compression'];assert.throws(()=>x.readGLTF(JSON.stringify(data)),/extension/i);
  assert.throws(()=>x.readGLTF(x.writeGLB([{mesh:body}]).slice(0,-4)),/GLB/);
});
test('glTF node translations use meters and Y-up',()=>{
  const data=JSON.parse(x.writeGLTF([{mesh:box(10,20,30)}]));data.nodes[0].translation=[1,2,3];const p=massProperties(x.readGLTF(JSON.stringify(data)).bodies[0].mesh);near(p.centroid[0],1000,1e-4);near(p.centroid[1],-3000,1e-4);near(p.centroid[2],2015,1e-4);
});
test('STEP split compounds, real syntax, escaping and unsupported advanced surfaces',()=>{
  const compound=merge([box(2,3,4),transform(box(2,3,4),m4.translation(10,0,0))]),text=x.writeSTEP([{name:"Bob's solid",mesh:compound}]);assert.ok(text.includes("Bob''s solid"));const result=x.readSTEP(text);assert.equal(result.bodies.length,2);near(result.bodies.reduce((n,b)=>n+massProperties(b.mesh).volume,0),48);
  assert.throws(()=>x.readSTEP(text.replace('FACETED_BREP(', 'MANIFOLD_SOLID_BREP(')),/advanced/);assert.throws(()=>x.readSTEP(text.replace(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/,'SI_UNIT(.NANO.,.METRE.)')),/prefix/);
  assert.throws(()=>x.writeSTEP([{mesh:{positions:new Float64Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])}}]),/watertight/);
});
const dxf=entities=>'0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+entities+'0\nENDSEC\n0\nEOF\n';
test('DXF closed profiles preserve mm and elevation',()=>{
  const output=x.writeDXF([{points:[[0,0,5],[4,0,5],[4,3,5],[0,3,5]],closed:true}]),r=x.readDXF(output);assert.equal(r.profiles.length,1);near(area2(r.profiles[0].points),12);near(r.profiles[0].z,5);
});
test('DXF line chains join without crossing ambiguous branches',()=>{
  const lines=[[0,0,2,0],[2,0,2,3],[2,3,0,3],[0,3,0,0]].map(([a,b,c,d])=>`0\nLINE\n10\n${a}\n20\n${b}\n11\n${c}\n21\n${d}\n`).join('');const r=x.readDXF(dxf(lines));assert.equal(r.profiles.length,1);near(area2(r.profiles[0].points),6);
});
test('DXF bulge, OCS, spline, unit scales and strict unsupported rejection',()=>{
  const bulge=dxf('0\nLWPOLYLINE\n90\n2\n70\n1\n10\n-1\n20\n0\n42\n1\n10\n1\n20\n0\n42\n1\n');near(area2(x.readDXF(bulge).profiles[0].points),Math.PI,.01);
  const circle=dxf('0\nCIRCLE\n10\n0\n20\n0\n30\n2\n40\n3\n210\n0\n220\n1\n230\n0\n');const r=x.readDXF(circle);assert.equal(r.curves.length,1);for(const p of r.curves[0].points)near(p[1],2);
  const inch=dxf('0\nCIRCLE\n40\n1\n').replace('$INSUNITS\n70\n4','$INSUNITS\n70\n1');near(Math.max(...x.readDXF(inch).profiles[0].points.map(p=>p[0])),25.4);
  assert.throws(()=>x.readDXF(dxf('0\nINSERT\n2\nunknown\n')),/Unsupported/);assert.throws(()=>x.readDXF(circle.slice(0,-6)),/EOF|Truncated/);
});
