/** @module @formalyth/exchange — bounded, local-only geometry interchange. */
import {readSTL,writeSTL} from './stl.js';
import {readOBJ,writeOBJ} from './obj.js';
import {readPLY,writePLY} from './ply.js';
import {readGLTF,writeGLTF,writeGLB} from './gltf.js';
import {readDXF,writeDXF} from './dxf.js';
import {readSTEP,writeSTEP} from './step.js';
import {merge} from '../kernel/index.js';
export {readSTL,writeSTL,readOBJ,writeOBJ,readPLY,writePLY,readGLTF,writeGLTF,writeGLB,readDXF,writeDXF,readSTEP,writeSTEP};
export const formats=Object.freeze({stl:{name:'STL triangle mesh',import:true,export:true},obj:{name:'OBJ polygon mesh',import:true,export:true},ply:{name:'PLY polygon mesh',import:true,export:true},gltf:{name:'glTF 2.0 embedded static scene',import:true,export:true},glb:{name:'GLB 2.0 static scene',import:true,export:true},dxf:{name:'Text DXF curves',import:true,export:true},step:{name:'STEP faceted B-rep subset',import:true,export:true}});
export function importGeometry(data,extension,options={}) {
  const ext=extension.toLowerCase().replace(/^\./,'');const read={stl:readSTL,obj:readOBJ,ply:readPLY,gltf:readGLTF,glb:readGLTF,dxf:readDXF,step:readSTEP,stp:readSTEP}[ext];if(!read)throw new TypeError(`Unsupported geometry format: ${ext}`);return read(data,options);
}
export function exportGeometry(entries,extension,options={}) {
  const ext=extension.toLowerCase().replace(/^\./,'');
  if(ext==='dxf')return writeDXF(entries,options);
  const bodies=entries.map(entry=>({name:entry.name,color:entry.color,mesh:entry.mesh||entry.value||entry}));
  if(!bodies.length)throw new RangeError('Select geometry to export');
  switch(ext){case 'stl':return writeSTL(merge(bodies.map(b=>b.mesh)),options);case 'ply':return writePLY(merge(bodies.map(b=>b.mesh)),options);case 'obj':return writeOBJ(bodies,options);case 'gltf':return writeGLTF(bodies,options);case 'glb':return writeGLB(bodies,options);case 'step':case 'stp':return writeSTEP(bodies,options);default:throw new TypeError(`Unsupported export format: ${ext}`);}
}
