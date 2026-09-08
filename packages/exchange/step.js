/** ISO 10303-21 faceted B-rep subset. Analytic/advanced surfaces are rejected. */
import {finite, positive} from '../math/index.js';
import {mesh,weld,topology,massProperties} from '../kernel/index.js';
import {text, result, label, polygonTriangles, componentMeshes, LIMITS, checkedCount} from './common.js';
const real = x => {let s=finite(x).toPrecision(15).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))(?=e|$)/i,'$1').replace('e','E');if(!s.includes('.'))s=s.replace(/E|$/,'.E').replace(/\.E$/,' .').replace(' ','');return s;};
const string = s => `'${label(s).replace(/[^\x20-\x7e]/g,'?').replace(/'/g,"''")}'`;
export function writeSTEP(bodies,{name='Formalyth part',date=new Date().toISOString()}={}) {
  const count=bodies.reduce((n,b)=>n+(b.mesh||b.value||b).indices.length/3,0);checkedCount(count,200000,'STEP triangle count');if(!count)throw new RangeError('STEP export needs a closed solid');
  const rows=[];let next=1;const add=source=>{const id=next++;rows.push(`#${id}=${source};`);return `#${id}`;};
  const context=add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,${context})`);
  const mechanical=add(`MECHANICAL_CONTEXT('',${context},'mechanical')`),product=add(`PRODUCT('1',${string(name)},'',(${mechanical}))`),formation=add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',${product},.NOT_KNOWN.)`),design=add(`DESIGN_CONTEXT('',${context},'design')`),definition=add(`PRODUCT_DEFINITION('design','',${formation},${design})`),shape=add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  const length=add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'),angle=add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'),solidAngle=add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())'),uncertainty=add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.000001),${length},'distance_accuracy_value','Faceted geometry tolerance')`);
  const representationContext=add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${angle},${solidAngle})) REPRESENTATION_CONTEXT('','3D'))`),solids=[];
  for(const entry of bodies){const original=weld(entry.mesh||entry.value||entry);if(!topology(original).watertight)throw new TypeError('Faceted STEP requires a watertight consistently oriented mesh');
    for(let body of componentMeshes(original)){
      if(massProperties(body).signedVolume<0){body=mesh(body.positions,Array.from(body.indices));for(let i=0;i<body.indices.length;i+=3)[body.indices[i+1],body.indices[i+2]]=[body.indices[i+2],body.indices[i+1]];}
      const vertices=[];for(let i=0;i<body.positions.length;i+=3)vertices.push(add(`CARTESIAN_POINT('',(${Array.from(body.positions.slice(i,i+3),real).join(',')}))`));
      const faces=[];for(let i=0;i<body.indices.length;i+=3){const loop=add(`POLY_LOOP('',(${[0,1,2].map(k=>vertices[body.indices[i+k]]).join(',')}))`),bound=add(`FACE_OUTER_BOUND('',${loop},.T.)`);faces.push(add(`FACE('',(${bound}))`));}
      const shell=add(`CLOSED_SHELL('',(${faces.join(',')}))`);solids.push(add(`FACETED_BREP(${string(entry.name||name)},${shell})`));
    }
  }
  const representation=add(`FACETED_BREP_SHAPE_REPRESENTATION(${string(name)},(${solids.join(',')}),${representationContext})`);add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
  const output=`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Faceted solid geometry'),'2;1');\nFILE_NAME(${string(name)},${string(date)},(''),(''),'Formalyth','Formalyth','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n${rows.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
  if(output.length>LIMITS.bytes)throw new RangeError('STEP export exceeds size limit');return output;
}
function statements(source) {
  const out=[];let start=0,quoted=false,comment=false;
  for(let i=0;i<source.length;i++){
    if(comment){if(source[i]==='*'&&source[i+1]==='/'){comment=false;i++;}continue;}
    if(!quoted&&source[i]==='/'&&source[i+1]==='*'){comment=true;i++;continue;}
    if(source[i]==="'"){if(quoted&&source[i+1]==="'"){i++;continue;}quoted=!quoted;}
    if(!quoted&&source[i]===';'){out.push(source.slice(start,i).trim());start=i+1;}
  }
  if(quoted||comment||source.slice(start).trim())throw new SyntaxError('Truncated STEP syntax');return out;
}
function parseArguments(source) {
  let cursor=0,depth=0;
  const space=()=>{while(/\s/.test(source[cursor]||'!'))cursor++;};
  const value=()=>{space();if(++depth>128)throw new RangeError('STEP nesting limit');let result,c=source[cursor++];
    if(c==='('){result=[];space();if(source[cursor]!==')'){result.push(value());space();while(source[cursor]===','){cursor++;result.push(value());space();}}if(source[cursor++]!==')')throw new SyntaxError('STEP missing parenthesis');}
    else if(c==="'"){result='';let end=false;while(cursor<source.length){const ch=source[cursor++];if(ch==="'"){if(source[cursor]==="'"){result+="'";cursor++;}else{end=true;break;}}else result+=ch;}if(!end)throw new SyntaxError('STEP unterminated string');}
    else if(c==='#'){const m=/^\d+/.exec(source.slice(cursor));if(!m)throw new SyntaxError('Invalid STEP reference');cursor+=m[0].length;result={ref:Number(m[0])};}
    else if(c==='.'&&/^[A-Za-z]/.test(source[cursor]||'')){const end=source.indexOf('.',cursor);if(end<0)throw new SyntaxError('Invalid STEP enumeration');result={enum:source.slice(cursor,end)};cursor=end+1;}
    else if(c==='$'||c==='*')result=null;
    else {cursor--;const m=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?/.exec(source.slice(cursor));if(!m)throw new SyntaxError('Unsupported STEP argument');cursor+=m[0].length;result=finite(Number(m[0]));}
    depth--;return result;
  };
  const result=value();space();if(cursor!==source.length)throw new SyntaxError('Unexpected STEP argument suffix');return result;
}
function removeComments(source){let out='',quoted=false;for(let i=0;i<source.length;i++){if(source[i]==="'"){out+=source[i];if(quoted&&source[i+1]==="'"){out+=source[++i];continue;}quoted=!quoted;continue;}if(!quoted&&source[i]==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);if(end<0)throw new SyntaxError('Unterminated STEP comment');out+=' ';i=end+1;}else out+=source[i];}return out;}
export function readSTEP(data,{scale,name='Imported STEP'}={}) {
  const source=removeComments(text(data));if(!/^\s*ISO-10303-21\s*;/i.test(source)||!/END-ISO-10303-21\s*;\s*$/i.test(source))throw new SyntaxError('Invalid STEP Part 21 envelope');
  const rows=new Map();let inData=false;
  for(const s of statements(source)){if(s==='DATA'){inData=true;continue;}if(s==='ENDSEC'){inData=false;continue;}if(!inData)continue;
    const match=/^#(\d+)\s*=\s*([\s\S]+)$/.exec(s);if(!match)throw new SyntaxError('Invalid STEP data record');const id=Number(match[1]);if(!id||rows.has(id))throw new TypeError('Duplicate STEP entity ID');rows.set(id,{source:match[2]});checkedCount(rows.size,LIMITS.records,'STEP entities');
  }
  const get=(reference,type)=>{if(!reference||!Number.isInteger(reference.ref))throw new TypeError('STEP entity reference expected');const row=rows.get(reference.ref);if(!row)throw new ReferenceError(`Missing STEP entity #${reference.ref}`);
    if(!row.type){const m=/^([A-Z][A-Z_0-9]*)\s*(\([\s\S]*\))$/.exec(row.source);if(!m)throw new TypeError('Unsupported complex STEP geometry entity');row.type=m[1];row.args=parseArguments(m[2]);}
    if(type&&!type.includes(row.type))throw new TypeError(`Unsupported STEP entity ${row.type}; expected ${type.join(' or ')}`);return row;
  };
  const warnings=['Faceted B-rep geometry only. Feature history, analytic surfaces, assemblies, attributes, and PMI are not reconstructed.'];
  if(scale===undefined){const units=[];for(const row of rows.values())if(/LENGTH_UNIT\s*\(/.test(row.source)){const m=/SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/.exec(row.source);if(!m)throw new TypeError('Unsupported STEP length unit; provide an explicit millimetre scale');const factor={'$':1000,'.MILLI.':1,'.CENTI.':10,'.MICRO.':.001,'.DECI.':100,'.KILO.':1e6}[m[1]];if(factor===undefined)throw new TypeError('Unsupported STEP SI prefix');units.push(factor);}
    if(!units.length)throw new TypeError('STEP length units missing; provide an explicit scale');if(new Set(units).size!==1)throw new TypeError('Mixed STEP length contexts are unsupported');scale=units[0];}positive(scale,'STEP scale');
  const bodies=[];let totalVertices=0,totalTriangles=0;
  for(const [id,row] of rows){if(!/^FACETED_BREP\s*\(/.test(row.source))continue;const brep=get({ref:id},['FACETED_BREP']),shell=get(brep.args[1],['CLOSED_SHELL']),vertices=[],indices=[],pointIds=new Map();
    if(!Array.isArray(shell.args[1]))throw new TypeError('Invalid STEP shell faces');
    for(const faceRef of shell.args[1]){const face=get(faceRef,['FACE']),bounds=face.args[1];if(!Array.isArray(bounds)||bounds.length!==1)throw new TypeError('STEP faces with multiple bounds are unsupported');
      const bound=get(bounds[0],['FACE_OUTER_BOUND','FACE_BOUND']),loop=get(bound.args[1],['POLY_LOOP']);if(!Array.isArray(loop.args[1])||loop.args[1].length<3)throw new TypeError('Invalid STEP poly loop');let polygon=[];
      for(const ref of loop.args[1]){if(!pointIds.has(ref.ref)){const point=get(ref,['CARTESIAN_POINT']).args[1];if(!Array.isArray(point)||point.length!==3)throw new TypeError('STEP requires three-dimensional points');pointIds.set(ref.ref,vertices.length/3);vertices.push(...point.map(x=>finite(x)*scale));totalVertices++;checkedCount(totalVertices,LIMITS.vertices,'STEP vertices');}polygon.push(pointIds.get(ref.ref));}
      const orientation=bound.args[2]?.enum;if(!['T','F'].includes(orientation))throw new TypeError('Invalid STEP bound orientation');if(orientation==='F')polygon.reverse();
      const triangles=polygonTriangles(vertices,polygon);indices.push(...triangles);totalTriangles+=triangles.length/3;checkedCount(totalTriangles,LIMITS.triangles,'STEP triangles');
    }
    const value=weld(mesh(vertices,indices,{kind:'faceted-step'}));if(!topology(value).watertight)throw new TypeError('STEP shell is not a closed consistently oriented mesh');bodies.push({name:label(brep.args[0]||name),mesh:value});checkedCount(bodies.length,LIMITS.objects,'STEP solids');
  }
  // Never present a partial faceted subset of a mixed analytic model as a complete import.
  if([...rows.values()].some(row=>/^(ADVANCED_BREP_SHAPE_REPRESENTATION|ADVANCED_FACE|MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS|SHELL_BASED_SURFACE_MODEL)\s*\(/.test(row.source)))throw new TypeError('This STEP file contains advanced/analytic geometry outside the faceted B-rep subset');
  if(!bodies.length)throw new TypeError('No supported FACETED_BREP solids in STEP file');return result(bodies,[],warnings);
}
