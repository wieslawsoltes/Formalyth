import {mesh} from '../kernel/index.js';
import {bytes,text,checkedCount,LIMITS,coordinates,polygonTriangles,compactMesh,scaled,result,label} from './common.js';
/** Static polygon OBJ. Object/group boundaries are preserved; material files are not fetched. */
export function readOBJ(data,{scale=1,name='OBJ mesh'}={}) {
  const positions=[],groups=[],warnings=[];let totalTriangles=0,current={name,indices:[]};groups.push(current);
  for(const line of text(data).split(/\r?\n/)){
    const tokens=line.split('#')[0].trim().split(/\s+/),kind=tokens.shift();if(!kind || kind.startsWith('#'))continue;
    if(kind==='v'){const p=coordinates(tokens);if(tokens.length===4){const w=Number(tokens[3]);if(!Number.isFinite(w)||w===0)throw new RangeError('Invalid OBJ homogeneous coordinate');p.forEach((x,i)=>p[i]=x/w);}positions.push(...p);checkedCount(positions.length/3,LIMITS.vertices,'OBJ vertices');}
    else if(kind==='f'){
      const ids=tokens.map(token=>{const v=Number(token.split('/')[0]);if(!Number.isInteger(v)||v===0)throw new TypeError('Invalid OBJ face index');const i=v<0?positions.length/3+v:v-1;return checkedCount(i,positions.length/3-1,'OBJ vertex index');});
      const triangles=polygonTriangles(positions,ids);totalTriangles+=triangles.length/3;checkedCount(totalTriangles,LIMITS.triangles,'OBJ triangles');current.indices.push(...triangles);
    }else if(kind==='o'||kind==='g'){const next=label(tokens.join(' '));if(!current.indices.length)current.name=next;else{current={name:next,indices:[]};groups.push(current);checkedCount(groups.length,LIMITS.objects,'OBJ objects');}}
    else if(['vt','vn','s','usemtl','mtllib'].includes(kind))warnings.push('OBJ UVs, smoothing groups, and material-library references are not retained. No external files are fetched.');
    else if(['l','p','curv','surf'].includes(kind))throw new TypeError(`OBJ ${kind} geometry is unsupported; polygon faces are required`);
  }
  const bodies=groups.filter(g=>g.indices.length).map(g=>({name:g.name,mesh:scaled(compactMesh(positions,g.indices,{format:'obj'}),scale)}));if(!bodies.length)throw new RangeError('OBJ contains no polygon faces');
  warnings.push('OBJ carries no standard length unit. The selected import scale was applied.');return result(bodies,[],warnings);
}
export function writeOBJ(bodies) {
  if(!Array.isArray(bodies))bodies=[{name:'Formalyth',mesh:bodies}];let offset=1;const lines=['# Formalyth static mesh export','# Coordinates in millimeters'];
  for(const entry of bodies){const b=entry.mesh || entry.value;lines.push(`o ${label(entry.name)}`);for(let i=0;i<b.positions.length;i+=3)lines.push(`v ${b.positions[i]} ${b.positions[i+1]} ${b.positions[i+2]}`);for(let i=0;i<b.indices.length;i+=3)lines.push(`f ${b.indices[i]+offset} ${b.indices[i+1]+offset} ${b.indices[i+2]+offset}`);offset+=b.positions.length/3;}return lines.join('\n')+'\n';
}
