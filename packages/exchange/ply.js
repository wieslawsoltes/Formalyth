import {mesh} from '../kernel/index.js';
import {bytes,checkedCount,LIMITS,polygonTriangles,scaled,result,label} from './common.js';
const TYPES={char:[1,'getInt8'],int8:[1,'getInt8'],uchar:[1,'getUint8'],uint8:[1,'getUint8'],short:[2,'getInt16'],int16:[2,'getInt16'],ushort:[2,'getUint16'],uint16:[2,'getUint16'],int:[4,'getInt32'],int32:[4,'getInt32'],uint:[4,'getUint32'],uint32:[4,'getUint32'],float:[4,'getFloat32'],float32:[4,'getFloat32'],double:[8,'getFloat64'],float64:[8,'getFloat64']};
/** ASCII, little-endian, and big-endian polygon PLY. Unknown properties are safely skipped. */
export function readPLY(data,{scale=1,name='PLY mesh'}={}) {
  const source=bytes(data);let end=-1;
  for(let i=0;i<Math.min(source.length,65536);i++)if((i===0||source[i-1]===10)&&source[i]===101){const marker=new TextDecoder().decode(source.subarray(i,i+12));if(marker.startsWith('end_header\n')){end=i+11;break;}if(marker.startsWith('end_header\r\n')){end=i+12;break;}}
  if(end<0)throw new TypeError('PLY header is missing or exceeds 64 KiB');
  const header=new TextDecoder().decode(source.subarray(0,end)).trim().split(/\r?\n/);if(header[0]!=='ply')throw new TypeError('Invalid PLY signature');
  const format=header[1]?.trim().split(/\s+/);if(format?.[0]!=='format'||format[2]!=='1.0'||!['ascii','binary_little_endian','binary_big_endian'].includes(format[1]))throw new TypeError('Unsupported PLY encoding');
  const elements=[];let element;const warnings=[];
  for(const line of header.slice(2)){const t=line.trim().split(/\s+/);if(t[0]==='element'){element={name:t[1],count:checkedCount(Number(t[2]),LIMITS.vertices+LIMITS.triangles,'PLY element count'),properties:[]};elements.push(element);}else if(t[0]==='property'){
    if(!element)throw new TypeError('PLY property precedes element');const list=t[1]==='list',property=list?{name:t[4],countType:t[2],type:t[3]}:{name:t[2],type:t[1]};
    if(!TYPES[property.type]||(list&&!TYPES[property.countType]))throw new TypeError('Unsupported PLY scalar type');element.properties.push(property);
  }}
  if(elements.reduce((s,e)=>s+e.count,0)>LIMITS.vertices+LIMITS.triangles)throw new RangeError('PLY element budget exceeded');
  const view=new DataView(source.buffer,source.byteOffset,source.byteLength),ascii=format[1]==='ascii';let cursor=end,token=0;
  const tokens=ascii?new TextDecoder().decode(source.subarray(end)).trim().split(/\s+/):null;
  const read=type=>{const[size,method]=TYPES[type];let value;if(ascii){if(token>=tokens.length)throw new RangeError('Truncated PLY data');value=Number(tokens[token++]);}else{if(cursor+size>source.length)throw new RangeError('Truncated binary PLY');value=view[method](cursor,format[1]==='binary_little_endian');cursor+=size;}if(!Number.isFinite(value))throw new TypeError('Invalid PLY number');return value;};
  const positions=[],faces=[];
  for(const e of elements){for(let i=0;i<e.count;i++){const record=Object.create(null);for(const p of e.properties){if(p.countType){const n=checkedCount(read(p.countType),LIMITS.polygon,'PLY list length'),values=[];for(let j=0;j<n;j++)values.push(read(p.type));record[p.name]=values;}else record[p.name]=read(p.type);}
    if(e.name==='vertex'){if(!['x','y','z'].every(k=>Number.isFinite(record[k])))throw new TypeError('PLY vertex lacks X, Y, or Z');positions.push(record.x,record.y,record.z);checkedCount(positions.length/3,LIMITS.vertices,'PLY vertices');}
    else if(e.name==='face'){const ids=record.vertex_indices || record.vertex_index;if(!Array.isArray(ids))throw new TypeError('PLY face lacks vertex indices');faces.push(ids);checkedCount(faces.length,LIMITS.triangles,'PLY faces');}
  }if(!['vertex','face'].includes(e.name)||e.properties.some(p=>!['x','y','z','vertex_index','vertex_indices'].includes(p.name)))warnings.push('PLY auxiliary elements and properties were skipped. Only polygon geometry is retained.');}
  const indices=[];for(const ids of faces){indices.push(...polygonTriangles(positions,ids));checkedCount(indices.length/3,LIMITS.triangles,'PLY triangles');}if(!indices.length)throw new RangeError('PLY contains no polygon faces');
  return result([{name:label(name),mesh:scaled(mesh(positions,indices,{format:'ply'}),scale)}],[],warnings.concat('PLY carries no standard length unit. The selected import scale was applied.'));
}
export function writePLY(body,{binary=false}={}) {
  const header=`ply\nformat ${binary?'binary_little_endian':'ascii'} 1.0\ncomment Formalyth coordinates in millimeters\nelement vertex ${body.positions.length/3}\nproperty double x\nproperty double y\nproperty double z\nelement face ${body.indices.length/3}\nproperty list uchar uint vertex_indices\nend_header\n`;
  if(!binary){const lines=[header.trimEnd()];for(let i=0;i<body.positions.length;i+=3)lines.push(`${body.positions[i]} ${body.positions[i+1]} ${body.positions[i+2]}`);for(let i=0;i<body.indices.length;i+=3)lines.push(`3 ${body.indices[i]} ${body.indices[i+1]} ${body.indices[i+2]}`);return lines.join('\n')+'\n';}
  const prefix=new TextEncoder().encode(header),buffer=new ArrayBuffer(prefix.length+body.positions.length*8+body.indices.length/3*13),view=new DataView(buffer);new Uint8Array(buffer).set(prefix);let offset=prefix.length;
  for(const x of body.positions){view.setFloat64(offset,x,true);offset+=8;}for(let i=0;i<body.indices.length;i+=3){view.setUint8(offset++,3);for(let j=0;j<3;j++){view.setUint32(offset,body.indices[i+j],true);offset+=4;}}return buffer;
}
