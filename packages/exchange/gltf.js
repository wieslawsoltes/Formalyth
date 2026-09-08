/** glTF 2.0 / GLB static triangle interchange. Embedded buffers only; no network fetches. */
import {mesh, transform, triangleAt} from '../kernel/index.js';
import {m4,v3,bounds,finite,clamp} from '../math/index.js';
import {bytes,text,checkedCount,LIMITS,result,label} from './common.js';
const COMPONENTS={5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
const DIMENSIONS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function decodeBase64(uri) {
  const match=/^data:(?:application\/octet-stream|application\/gltf-buffer);base64,([A-Za-z0-9+/=\s]+)$/.exec(uri || '');if(!match)throw new TypeError('Only embedded base64 glTF buffers are supported; external resources are never fetched');
  const source=atob(match[1]),out=new Uint8Array(source.length);if(out.length>LIMITS.bytes)throw new RangeError('glTF buffer budget exceeded');for(let i=0;i<out.length;i++)out[i]=source.charCodeAt(i);return out;
}
function encodeBase64(data){let out='';for(let i=0;i<data.length;i+=32768)out+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(out);}
function quaternionMatrix(q=[0,0,0,1]){
  if(q.length!==4)throw new RangeError('Invalid glTF quaternion');const n=Math.hypot(...q.map(x=>finite(x)));if(n<1e-12)throw new RangeError('Zero glTF quaternion');const[x,y,z,w]=q.map(x=>x/n),out=m4.identity();
  out[0]=1-2*(y*y+z*z);out[1]=2*(x*y+z*w);out[2]=2*(x*z-y*w);out[4]=2*(x*y-z*w);out[5]=1-2*(x*x+z*z);out[6]=2*(y*z+x*w);out[8]=2*(x*z+y*w);out[9]=2*(y*z-x*w);out[10]=1-2*(x*x+y*y);return out;
}
function nodeMatrix(node){if(node.matrix){if(node.matrix.length!==16||node.matrix.some(x=>!Number.isFinite(x)))throw new TypeError('Invalid glTF matrix');return new Float64Array(node.matrix);}const t=node.translation||[0,0,0],s=node.scale||[1,1,1];if(t.length!==3||s.length!==3||[...t,...s].some(x=>!Number.isFinite(x)))throw new TypeError('Invalid glTF transform');return m4.multiply(m4.translation(...t),m4.multiply(quaternionMatrix(node.rotation),m4.scaling(...s)));}
function unpack(data) {
  const source=bytes(data);if(source.length>=12&&new DataView(source.buffer,source.byteOffset,12).getUint32(0,true)===0x46546c67){
    const view=new DataView(source.buffer,source.byteOffset,source.byteLength);if(view.getUint32(4,true)!==2||view.getUint32(8,true)!==source.length)throw new TypeError('Invalid GLB header or length');
    let offset=12,json=null,bin=null,chunk=0;
    while(offset<source.length){if(offset+8>source.length)throw new RangeError('Truncated GLB chunk');const size=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(size%4||offset+size>source.length)throw new RangeError('Invalid GLB chunk bounds');const value=source.subarray(offset,offset+size);
      if(chunk++===0&&type!==0x4e4f534a)throw new TypeError('GLB JSON must be the first chunk');if(type===0x4e4f534a){if(json)throw new TypeError('Duplicate GLB JSON chunk');json=JSON.parse(new TextDecoder().decode(value).trim());}else if(type===0x004e4942){if(bin)throw new TypeError('Duplicate GLB binary chunk');bin=value;}offset+=size;
    }if(!json)throw new TypeError('Missing GLB JSON');return {json,bin};
  }
  return {json:JSON.parse(text(data)),bin:null};
}
export function readGLTF(data,{name='glTF model'}={}) {
  const {json:g,bin}=unpack(data),warnings=[];if(g.asset?.version!=='2.0')throw new TypeError('Only glTF 2.0 is supported');
  const unsupported=(g.extensionsRequired||[]).filter(x=>x!=='KHR_mesh_quantization');if(unsupported.length)throw new TypeError(`Required glTF extensions are unsupported: ${unsupported.join(', ')}`);
  if(g.skins?.length)throw new TypeError('Skinned glTF meshes require baking before import');if(g.animations?.length)warnings.push('Animation channels were not imported; the default static node transforms were used.');
  if(g.images?.length||g.textures?.length)warnings.push('Textures are not imported or fetched. Base material colors are retained.');
  const buffers=(g.buffers||[]).map((b,i)=>{checkedCount(b.byteLength,LIMITS.bytes,'glTF buffer length');const data=b.uri?decodeBase64(b.uri):i===0&&bin?bin:null;if(!data||data.length<b.byteLength)throw new RangeError('Missing or truncated glTF buffer');return data.subarray(0,b.byteLength);});
  if(buffers.reduce((n,b)=>n+b.length,0)>LIMITS.bytes)throw new RangeError('Combined glTF buffers exceed 100 MB');
  const accessors=new Map();
  const readAccessor=index=>{
    if(accessors.has(index))return accessors.get(index);checkedCount(index,(g.accessors?.length||0)-1,'accessor index');const a=g.accessors[index],count=checkedCount(a.count,LIMITS.triangles*3,'accessor count'),components=DIMENSIONS[a.type],type=COMPONENTS[a.componentType];
    if(!components||!type)throw new TypeError('Unsupported glTF accessor layout');if(count*components>LIMITS.vertices*4)throw new RangeError('Accessor value budget exceeded');const out=new Float64Array(count*components);
    const readFrom=(viewIndex,byteOffset,n,componentType,width,strideAllowed)=>{
      checkedCount(viewIndex,(g.bufferViews?.length||0)-1,'buffer view index');const bv=g.bufferViews[viewIndex],buffer=buffers[bv.buffer];if(!buffer)throw new ReferenceError('glTF buffer view references a missing buffer');const [size,method,maximum]=COMPONENTS[componentType] || [];if(!size)throw new TypeError('Unsupported glTF component type');
      const start=checkedCount(bv.byteOffset||0,buffer.length,'buffer view offset'),length=checkedCount(bv.byteLength,buffer.length-start,'buffer view length'),offset=checkedCount(byteOffset||0,length,'accessor offset'),stride=strideAllowed?(bv.byteStride||size*width):size*width;
      if(stride<size*width||stride%size||(start+offset)%size||offset+(n?stride*(n-1)+size*width:0)>length)throw new RangeError('glTF accessor exceeds its buffer view or is misaligned');
      const view=new DataView(buffer.buffer,buffer.byteOffset+start+offset,length-offset),values=new Float64Array(n*width);
      for(let i=0;i<n;i++)for(let j=0;j<width;j++)values[i*width+j]=finite(view[method](i*stride+j*size,true),'glTF value');return values;
    };
    if(a.bufferView!==undefined)out.set(readFrom(a.bufferView,a.byteOffset,count,a.componentType,components,true));else if(a.byteOffset)throw new TypeError('Accessor byteOffset requires a buffer view');
    if(a.sparse){const s=a.sparse,n=checkedCount(s.count,count,'sparse accessor count');if(![5121,5123,5125].includes(s.indices.componentType))throw new TypeError('Invalid sparse index type');const ids=readFrom(s.indices.bufferView,s.indices.byteOffset,n,s.indices.componentType,1,false),values=readFrom(s.values.bufferView,s.values.byteOffset,n,a.componentType,components,false);let previous=-1;
      for(let i=0;i<n;i++){const target=checkedCount(ids[i],count-1,'sparse index');if(target<=previous)throw new TypeError('Sparse indices must be increasing');previous=target;out.set(values.subarray(i*components,(i+1)*components),target*components);}
    }
    if(a.normalized&&a.componentType!==5126){const maximum=type[2];for(let i=0;i<out.length;i++)out[i]=Math.max(-1,out[i]/maximum);}
    const value={values:out,descriptor:a};accessors.set(index,value);return value;
  };
  const bodies=[],convert=m4.multiply(m4.scaling(1000),m4.rotation([1,0,0],Math.PI/2)),nodes=g.nodes||[],active=new Set();let visited=0,totalVertices=0,totalTriangles=0;
  const addMesh=(meshIndex,matrix,nodeName)=>{
    checkedCount(meshIndex,(g.meshes?.length||0)-1,'mesh index');const source=g.meshes[meshIndex];
    for(const [pi,p] of (source.primitives||[]).entries()){
      if(p.targets?.length)throw new TypeError('Morph targets require baking before glTF import');const mode=p.mode??4;if(![4,5,6].includes(mode)){warnings.push('Non-triangle glTF primitives were skipped.');continue;}
      const pos=readAccessor(p.attributes?.POSITION);if(pos.descriptor.type!=='VEC3')throw new TypeError('POSITION must be VEC3');checkedCount(pos.values.length/3,LIMITS.vertices,'glTF vertices');
      let indices;if(p.indices===undefined)indices=Array.from({length:pos.values.length/3},(_,i)=>i);else{const a=readAccessor(p.indices);if(a.descriptor.type!=='SCALAR'||![5121,5123,5125].includes(a.descriptor.componentType)||a.descriptor.normalized)throw new TypeError('Invalid glTF index accessor');indices=Array.from(a.values);}
      const triangles=[];if(mode===4){if(indices.length%3)throw new RangeError('Triangle index count is not divisible by three');for(const i of indices)triangles.push(i);}else for(let i=2;i<indices.length;i++){const t=mode===6?[indices[0],indices[i-1],indices[i]]:i%2?[indices[i-1],indices[i-2],indices[i]]:[indices[i-2],indices[i-1],indices[i]];if(new Set(t).size===3)triangles.push(...t);}
      if(!triangles.length)continue;totalVertices+=pos.values.length/3;totalTriangles+=triangles.length/3;checkedCount(totalVertices,LIMITS.vertices,'instanced glTF vertices');checkedCount(totalTriangles,LIMITS.triangles,'instanced glTF triangles');const material=g.materials?.[p.material],color=material?.pbrMetallicRoughness?.baseColorFactor || [.45,.62,.71,1];
      bodies.push({name:label(nodeName||source.name||`${name} ${meshIndex+1}.${pi+1}`),mesh:transform(mesh(pos.values,triangles,{format:'gltf'}),m4.multiply(convert,matrix)),color:'#'+color.slice(0,3).map(x=>Math.round(clamp(finite(x),0,1)*255).toString(16).padStart(2,'0')).join('')});checkedCount(bodies.length,LIMITS.objects,'glTF objects');
    }
  };
  const visit=(index,parent,depth=0)=>{checkedCount(index,nodes.length-1,'node index');if(depth>128||++visited>10000)throw new RangeError('glTF scene graph budget exceeded');if(active.has(index))throw new TypeError('Cyclic glTF node graph');active.add(index);const node=nodes[index],matrix=m4.multiply(parent,nodeMatrix(node));if(node.skin!==undefined)throw new TypeError('Skinned node is unsupported');if(node.mesh!==undefined)addMesh(node.mesh,matrix,node.name);for(const child of node.children||[])visit(child,matrix,depth+1);active.delete(index);};
  if(nodes.length){const children=new Set(nodes.flatMap(n=>n.children||[]));let roots;if(g.scenes?.length){const scene=checkedCount(g.scene??0,g.scenes.length-1,'scene index');roots=g.scenes[scene].nodes||[];}else roots=nodes.map((_,i)=>i).filter(i=>!children.has(i));if(!roots.length)throw new TypeError('No root nodes in glTF scene');for(const i of roots)visit(i,m4.identity());}
  else for(let i=0;i<(g.meshes?.length||0);i++)addMesh(i,m4.identity());
  if(!bodies.length)throw new RangeError('glTF contains no supported triangle geometry');return result(bodies,[],warnings);
}
function pack(bodies) {
  if(!Array.isArray(bodies))bodies=[{name:'Formalyth',mesh:bodies}];if(!bodies.length)throw new RangeError('No bodies to export');const g={asset:{version:'2.0',generator:'Formalyth'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]},chunks=[];let offset=0;
  const addBuffer=(data,target)=>{const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength),index=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});chunks.push(bytes);offset+=bytes.length;return index;};
  for(const entry of bodies){const b=entry.mesh||entry.value;if(!b.indices.length)continue;checkedCount(b.indices.length/3,LIMITS.triangles,'glTF triangles');const count=b.indices.length;if(offset+count*24>LIMITS.bytes)throw new RangeError('glTF export exceeds size budget');const positions=new Float32Array(count*3),normals=new Float32Array(count*3);
    for(let i=0;i<count/3;i++){const tri=triangleAt(b,i),normal=v3.normalize(v3.cross(v3.sub(tri[1],tri[0]),v3.sub(tri[2],tri[0])));for(let j=0;j<3;j++){const[x,y,z]=tri[j];positions.set([x/1000,z/1000,-y/1000],(i*3+j)*3);normals.set([normal[0],normal[2],-normal[1]],(i*3+j)*3);}}
    for(const x of positions)if(!Number.isFinite(x))throw new RangeError('Coordinate exceeds glTF float32 range');const box=bounds(positions),pa=g.accessors.length;g.accessors.push({bufferView:addBuffer(positions,34962),componentType:5126,count,type:'VEC3',min:box.min,max:box.max});const na=g.accessors.length;g.accessors.push({bufferView:addBuffer(normals,34962),componentType:5126,count,type:'VEC3'});
    const color=/^#[a-f\d]{6}$/i.test(entry.color||'')?entry.color:'#729db3',material=g.materials.length;g.materials.push({name:label(entry.material||'Display material'),pbrMetallicRoughness:{baseColorFactor:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).concat(1),metallicFactor:0.25,roughnessFactor:0.45},doubleSided:false});
    const mi=g.meshes.length;g.meshes.push({name:label(entry.name),primitives:[{attributes:{POSITION:pa,NORMAL:na},mode:4,material}]});g.scenes[0].nodes.push(g.nodes.length);g.nodes.push({name:label(entry.name),mesh:mi});
  }
  if(!offset)throw new RangeError('No triangles to export');if(offset>LIMITS.bytes)throw new RangeError('glTF export exceeds 100 MB');g.buffers[0].byteLength=offset;const binary=new Uint8Array(offset);let cursor=0;for(const c of chunks){binary.set(c,cursor);cursor+=c.length;}return {g,binary};
}
export function writeGLTF(bodies){const{g,binary}=pack(bodies);g.buffers[0].uri='data:application/octet-stream;base64,'+encodeBase64(binary);return JSON.stringify(g);}
export function writeGLB(bodies){const{g,binary}=pack(bodies),json=new TextEncoder().encode(JSON.stringify(g)),jsonSize=(json.length+3)&~3,binSize=(binary.length+3)&~3,total=12+8+jsonSize+8+binSize,buffer=new ArrayBuffer(total),view=new DataView(buffer),out=new Uint8Array(buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);view.setUint32(12,jsonSize,true);view.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonSize);out.set(json,20);view.setUint32(20+jsonSize,binSize,true);view.setUint32(24+jsonSize,0x004e4942,true);out.set(binary,28+jsonSize);return buffer;}
