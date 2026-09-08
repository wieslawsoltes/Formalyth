import {mesh, triangleAt, weld} from '../kernel/index.js';
import {v3, positive} from '../math/index.js';
import {bytes,text,checkedCount,LIMITS,scaled,result,label} from './common.js';
/** Binary and ASCII triangle STL. Units are supplied explicitly by the caller. */
export function readSTL(data,{scale=1,name='STL mesh'}={}) {
  positive(scale);const source=bytes(data),view=new DataView(source.buffer,source.byteOffset,source.byteLength);let body;
  const count=source.length>=84?view.getUint32(80,true):0;
  if(source.length>=84 && 84+count*50===source.length){
    checkedCount(count,Math.floor(LIMITS.vertices/3),'STL facets');const positions=new Float64Array(count*9),indices=new Uint32Array(count*3);
    for(let i=0;i<count;i++){const start=84+i*50;for(let j=0;j<9;j++)positions[i*9+j]=view.getFloat32(start+12+j*4,true)*scale;indices.set([i*3,i*3+1,i*3+2],i*3);}body=mesh(positions,indices,{format:'stl',encoding:'binary'});
  }else{
    const sourceText=text(data);if(!/^\s*solid(?:\s|$)/i.test(sourceText))throw new TypeError('Invalid or truncated STL file');
    const num='[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?',vertex=`vertex\\s+(${num})\\s+(${num})\\s+(${num})`;
    const facets=new RegExp(`facet\\s+normal\\s+${num}\\s+${num}\\s+${num}\\s+outer\\s+loop\\s+${vertex}\\s+${vertex}\\s+${vertex}\\s+endloop\\s+endfacet`,'gi');
    const positions=[],indices=[];let match,n=0;
    while((match=facets.exec(sourceText))){checkedCount(++n,Math.floor(LIMITS.vertices/3),'STL facets');for(let j=1;j<=9;j++)positions.push(Number(match[j])*scale);indices.push(n*3-3,n*3-2,n*3-1);}
    if(!n || n!==(sourceText.match(/\bfacet\s+normal\b/gi)||[]).length || !/\bendsolid(?:\s|$)/i.test(sourceText))throw new TypeError('Malformed ASCII STL facets');
    body=mesh(positions,indices,{format:'stl',encoding:'ascii'});
  }
  if(!body.indices.length)throw new RangeError('STL contains no triangles');
  return result([{name:label(name),mesh:weld(body)}],[],['STL carries no units, parameters, materials, or assembly history. The selected import scale was applied.']);
}
export function writeSTL(body,{binary=true,name='Formalyth'}={}) {
  const count=body.indices.length/3;checkedCount(count,LIMITS.triangles,'STL facets');if(!count)throw new RangeError('Cannot export an empty mesh');
  if(binary){if(84+count*50>LIMITS.bytes)throw new RangeError('STL export exceeds size limit');const buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer),header=new TextEncoder().encode(`Formalyth | millimeters | ${label(name)}`);new Uint8Array(buffer).set(header.subarray(0,80));view.setUint32(80,count,true);
    for(let i=0;i<count;i++){const[a,b,c]=triangleAt(body,i),normal=v3.normalize(v3.cross(v3.sub(b,a),v3.sub(c,a))),values=[...normal,...a,...b,...c],offset=84+i*50;values.forEach((x,j)=>{if(!Number.isFinite(Math.fround(x)))throw new RangeError('Coordinate exceeds STL float32 range');view.setFloat32(offset+j*4,x,true);});view.setUint16(offset+48,0,true);}return buffer;
  }
  const lines=[`solid ${label(name)}`];for(let i=0;i<count;i++){const[a,b,c]=triangleAt(body,i),n=v3.normalize(v3.cross(v3.sub(b,a),v3.sub(c,a)));lines.push(`  facet normal ${n.join(' ')}`,'    outer loop',... [a,b,c].map(p=>`      vertex ${p.join(' ')}`),'    endloop','  endfacet');}lines.push(`endsolid ${label(name)}`);return lines.join('\n')+'\n';
}
