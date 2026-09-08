/** Text DXF geometry subset. No binary drawings, proxy objects, or external references. */
import {finite, positive, integer, TAU, v3} from '../math/index.js';
import {nurbs, cleanProfile} from '../kernel/index.js';
import {text, result, label, LIMITS, checkedCount} from './common.js';
const UNITS = new Map([[1,25.4],[2,304.8],[4,1],[5,10],[6,1000],[7,1e6],[8,.0000254],[9,.0254],[10,914.4],[11,1e-7],[12,1e-6],[13,.001],[14,100],[15,10000],[16,100000]]);
const number = value => { if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/.test(String(value))) throw new SyntaxError('Invalid DXF number'); return finite(Number(value)); };
function records(source) {
  const lines=text(source).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/); while(lines.length && !lines.at(-1).trim())lines.pop();
  if(lines.length%2)throw new SyntaxError('Truncated DXF group pair'); checkedCount(lines.length/2,LIMITS.records,'DXF group count');
  const pairs=[];for(let i=0;i<lines.length;i+=2){const code=number(lines[i].trim());integer(code,0,1071,'DXF group code');pairs.push([code,lines[i+1].trim()]);}return pairs;
}
function entity(type,pairs) {
  const values=new Map();for(const [code,value] of pairs){if(!values.has(code))values.set(code,[]);values.get(code).push(value);}
  const raw=(code,defaultValue)=>values.get(code)?.[0]??defaultValue;
  const n=(code,defaultValue=0)=>number(raw(code,defaultValue));
  const p=(code=10)=>[n(code),n(code+10),n(code+20)];
  return {type,pairs,values,raw,n,p,name:label(`${raw(8,'0')} · ${type}`)};
}
function basis(normal) {
  if(v3.length(normal)<1e-12)throw new RangeError('DXF extrusion normal is zero');
  const z=v3.normalize(normal),x=v3.normalize(v3.cross(Math.abs(z[0])<1/64&&Math.abs(z[1])<1/64?[0,1,0]:[0,0,1],z)),y=v3.cross(z,x);
  return p=>v3.add(v3.add(v3.scale(x,p[0]),v3.scale(y,p[1])),v3.scale(z,p[2]));
}
function normalOf(e){return [e.n(210,0),e.n(220,0),e.n(230,1)];}
function bulgePoints(a,b,bulge,angularStep) {
  if(Math.abs(bulge)<1e-12)return [[a[0],a[1]]];
  const dx=b[0]-a[0],dy=b[1]-a[1],chord=Math.hypot(dx,dy);positive(chord,'bulge chord');
  const angle=4*Math.atan(bulge),offset=chord*(1-bulge*bulge)/(4*bulge),center=[(a[0]+b[0])/2-dy/chord*offset,(a[1]+b[1])/2+dx/chord*offset];
  const radius=Math.hypot(a[0]-center[0],a[1]-center[1]),start=Math.atan2(a[1]-center[1],a[0]-center[0]),steps=Math.max(1,Math.ceil(Math.abs(angle)/angularStep));
  return Array.from({length:steps},(_,i)=>[center[0]+radius*Math.cos(start+angle*i/steps),center[1]+radius*Math.sin(start+angle*i/steps)]);
}
function vertices(e,code=10) {
  const out=[];let p=null;
  for(const [c,v] of e.pairs){if(c===code){p=[number(v),0,0,0];out.push(p);}else if(p&&c===code+10)p[1]=number(v);else if(p&&c===code+20)p[2]=number(v);else if(p&&c===42)p[3]=number(v);}
  checkedCount(out.length,8192,'DXF curve vertices');return out;
}
function sampleArc(e,ellipse,step) {
  const center=e.p(),normal=normalOf(e);let evaluate,start,end;
  if(ellipse){const major=e.p(11),length=positive(v3.length(major),'ellipse major radius'),ratio=positive(e.n(40),'ellipse ratio');if(ratio>1)throw new RangeError('Ellipse ratio must not exceed 1');
    const minor=v3.scale(v3.normalize(v3.cross(normal,major)),length*ratio);if(v3.length(minor)<1e-12)throw new RangeError('Ellipse axis and normal are parallel');
    evaluate=a=>v3.add(center,v3.add(v3.scale(major,Math.cos(a)),v3.scale(minor,Math.sin(a))));start=e.n(41,0);end=e.n(42,TAU);
  }else{const radius=positive(e.n(40),'circle radius'),toWorld=basis(normal);start=e.type==='CIRCLE'?0:e.n(50)*Math.PI/180;end=e.type==='CIRCLE'?TAU:e.n(51)*Math.PI/180;
    evaluate=a=>toWorld([center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a),center[2]]);
  }
  let angle=end-start;while(angle<=0)angle+=TAU;if(angle>TAU+1e-7)throw new RangeError('DXF arc exceeds one turn');
  const closed=Math.abs(angle-TAU)<1e-7,steps=Math.max(4,Math.ceil(angle/step));return {points:Array.from({length:steps+(closed?0:1)},(_,i)=>evaluate(start+angle*i/steps)),closed};
}
/** Returns mesh-free curves and planar XY profiles; other planes remain 3D curves. */
export function readDXF(data,{scale,angularStep=Math.PI/32,strict=true}={}) {
  positive(angularStep);if(angularStep<Math.PI/4096)throw new RangeError('DXF curve sampling exceeds budget');
  const pairs=records(data),entities=[],warnings=[];let section='',units=0,ended=false;
  for(let i=0;i<pairs.length;i++){
    const [code,value]=pairs[i];
    if(code===0&&value==='SECTION'){if(pairs[++i]?.[0]!==2)throw new SyntaxError('Missing DXF section name');section=pairs[i][1];continue;}
    if(code===0&&value==='ENDSEC'){section='';continue;}
    if(code===0&&value==='EOF'){ended=true;break;}
    if(section==='HEADER'&&code===9&&value==='$INSUNITS'){if(pairs[i+1]?.[0]!==70)throw new SyntaxError('Invalid drawing units');units=number(pairs[++i][1]);}
    if(section==='ENTITIES'&&code===0){const body=[];while(i+1<pairs.length&&pairs[i+1][0]!==0)body.push(pairs[++i]);entities.push(entity(value,body));}
  }
  if(!ended)throw new SyntaxError('DXF is missing EOF');
  if(scale===undefined){if(!units){scale=1;warnings.push('DXF units are unspecified; interpreted as millimetres.');}else if(!UNITS.has(units))throw new RangeError(`Unsupported DXF unit code ${units}; specify an explicit scale`);else scale=UNITS.get(units);}positive(scale,'DXF scale');
  const curves=[];let sampled=0;
  const add=(e,value)=>{sampled+=value.points.length;checkedCount(sampled,LIMITS.vertices,'DXF sampled vertices');curves.push({...value,name:e.name,layer:label(e.raw(8,'0')),points:value.points.map(p=>p.map(x=>x*scale))});};
  const unsupported=e=>{if(strict)throw new TypeError(`Unsupported DXF entity: ${e.type}. No partial import was applied.`);warnings.push(`Skipped ${e.type} entities.`);};
  for(let i=0;i<entities.length;i++){
    const e=entities[i];if(e.n(39,0)!==0)warnings.push('Entity thickness is not imported; only centreline geometry is retained.');
    if(e.type==='LINE')add(e,{points:[e.p(),e.p(11)],closed:false});
    else if(['CIRCLE','ARC','ELLIPSE'].includes(e.type))add(e,sampleArc(e,e.type==='ELLIPSE',angularStep));
    else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE'){
      const closed=(e.n(70)&1)!==0,toWorld=basis(normalOf(e));let verts,is3d=false;
      if(e.type==='LWPOLYLINE'){verts=vertices(e);if(e.n(90,verts.length)!==verts.length)throw new RangeError('Polyline vertex count mismatch');}
      else {const flags=e.n(70);if(flags&80){unsupported(e);while(entities[i+1]&&entities[i+1].type!=='SEQEND')i++;if(entities[i+1])i++;continue;}is3d=!!(flags&8);verts=[];while(entities[i+1]?.type==='VERTEX'){const v=entities[++i];verts.push([...v.p(),v.n(42,0)]);}if(entities[++i]?.type!=='SEQEND')throw new SyntaxError('Unterminated POLYLINE');}
      if(verts.length<2)throw new RangeError('Polyline needs at least two vertices');const points=[];
      if(is3d){if(verts.some(v=>v[3]))throw new TypeError('Bulges in 3D polylines are unsupported');points.push(...verts.map(p=>p.slice(0,3)));}
      else {const elevation=e.type==='LWPOLYLINE'?e.n(38):e.n(30);for(let j=0;j<verts.length-(closed?0:1);j++)for(const p of bulgePoints(verts[j],verts[(j+1)%verts.length],verts[j][3],angularStep))points.push(toWorld([...p,elevation]));if(!closed)points.push(toWorld([verts.at(-1)[0],verts.at(-1)[1],elevation]));}
      if(e.n(43)||e.values.has(40)||e.values.has(41))warnings.push('Polyline width is not imported; centreline geometry is retained.');add(e,{points,closed});
    }else if(e.type==='SPLINE'){
      const degree=e.n(71),points=vertices(e).map(p=>p.slice(0,3)),knots=(e.values.get(40)||[]).map(number),weights=e.values.has(41)?e.values.get(41).map(number):null;
      if(!points.length)throw new TypeError('Fit-point-only DXF splines are unsupported');if(e.n(72,knots.length)!==knots.length||e.n(73,points.length)!==points.length)throw new RangeError('Spline count mismatch');
      const closed=!!(e.n(70)&1),steps=Math.max(32,Math.min(4096,points.length*16)),low=knots[degree],high=knots[points.length];
      const sampled=Array.from({length:steps+1},(_,i)=>nurbs(points,degree,knots,weights,low+(high-low)*i/steps));if(closed&&v3.distance(sampled[0],sampled.at(-1))<1e-7)sampled.pop();add(e,{points:sampled,closed});
    }else if(['POINT','TEXT','MTEXT','DIMENSION','HATCH','LEADER','MLEADER','VIEWPORT'].includes(e.type))warnings.push(`${e.type} annotations are not imported.`);
    else unsupported(e);
  }
  // Join chains only where endpoints have degree two. Ambiguous junctions remain separate.
  const joined=joinCurves(curves),profiles=[],open=[];
  for(const curve of joined){if(curve.closed&&curve.points.every(p=>Math.abs(p[2]-curve.points[0][2])<1e-7)){
    try{profiles.push({name:curve.name,points:cleanProfile(curve.points.map(p=>p.slice(0,2))),plane:'XY',z:curve.points[0][2]});}catch(error){warnings.push(`Closed curve retained as wire: ${error.message}`);open.push(curve);}
  }else open.push(curve);}
  if(!profiles.length&&!open.length)throw new TypeError('No supported DXF geometry');
  warnings.push('Curves are sampled to polylines. Layers and geometry are retained; annotations, line styles, and history are not.');return result([],profiles,warnings,open);
}
export function joinCurves(curves,tolerance=1e-7) {
  positive(tolerance);const ends=new Map(),used=new Set(),out=[],key=p=>p.map(x=>Math.round(x/tolerance)).join(',');
  curves.forEach((c,i)=>{if(c.closed)return;for(const p of [c.points[0],c.points.at(-1)]){const k=`${c.layer||''}:${key(p)}`;if(!ends.has(k))ends.set(k,[]);ends.get(k).push(i);}});
  curves.forEach((c,i)=>{if(used.has(i))return;used.add(i);if(c.closed){out.push(c);return;}const points=c.points.map(p=>[...p]);let changed=true;
    while(changed){changed=false;for(const front of [false,true]){const p=front?points[0]:points.at(-1),neighbors=ends.get(`${c.layer||''}:${key(p)}`)||[];if(neighbors.length!==2)continue;const next=neighbors.find(j=>!used.has(j));if(next===undefined)continue;let q=curves[next].points.map(p=>[...p]);if(front){if(key(q.at(-1))!==key(p))q.reverse();points.unshift(...q.slice(0,-1));}else{if(key(q[0])!==key(p))q.reverse();points.push(...q.slice(1));}used.add(next);changed=true;}}
    const closed=points.length>2&&v3.distance(points[0],points.at(-1))<=tolerance*2;if(closed)points.pop();out.push({...c,points,closed});
  });return out;
}
export function writeDXF(curves,{name='Formalyth drawing'}={}) {
  checkedCount(curves.length,LIMITS.objects*100,'DXF curves');const out=[];let count=0;const pair=(code,value)=>out.push(String(code),String(value));
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,4);pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');
  for(const curve of curves){const points=curve.points;if(!Array.isArray(points)||points.length<2)throw new TypeError('DXF curve requires points');count+=points.length;checkedCount(count,LIMITS.vertices,'DXF vertices');const layer=label(curve.layer||name).replace(/[<>/\\":;?*|=]/g,'_');
    const z=points[0][2]??0,planar=points.every(p=>Math.abs((p[2]??0)-z)<1e-9);
    if(planar){pair(0,'LWPOLYLINE');pair(100,'AcDbEntity');pair(8,layer);pair(100,'AcDbPolyline');pair(90,points.length);pair(70,curve.closed?1:0);pair(38,finite(z));for(const p of points){pair(10,finite(p[0]));pair(20,finite(p[1]));}}
    else for(let i=0;i<points.length-(curve.closed?0:1);i++){pair(0,'LINE');pair(100,'AcDbEntity');pair(8,layer);pair(100,'AcDbLine');const a=points[i],b=points[(i+1)%points.length];for(let k=0;k<3;k++){pair(10+k*10,finite(a[k]??0));pair(11+k*10,finite(b[k]??0));}}
  }
  pair(0,'ENDSEC');pair(0,'EOF');return out.join('\n')+'\n';
}
