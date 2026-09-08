/** Field metadata shared by the feature property editor and creation tools. */
export const choices={axis:['X','Y','Z'],plane:['XY','XZ','YZ'],shape:['rectangle','circle','ellipse'],extent:['oneSide','symmetric','twoSide'],operation:['new','union','subtract','intersect'],direction:['inward','outward','symmetric'],side:['negative','positive']};
const labels={width:'Width',depth:'Depth / distance',height:'Height',radius:'Radius',rx:'X radius / rotation',ry:'Y radius / rotation',rz:'Z rotation',majorRadius:'Major radius',minorRadius:'Minor radius',topRadius:'Top radius',x:'X distance',y:'Y distance',z:'Z distance',scale:'Uniform scale',segments:'Arc segments',steps:'Sampling steps',samples:'Samples',iterations:'Iterations',strength:'Strength',cellSize:'Reduction cell size',thickness:'Wall thickness',cutDepth:'Pocket depth',centers:'Hole centers',through:'Through all',count:'Quantity',angle:'Angle',circular:'Circular pattern',offset:'Start offset',secondDepth:'Second-side distance',extent:'Distance mode',operation:'Operation',normal:'Plane normal',origin:'Plane origin',rotation:'Plane rotation',distance:'Distance',grid:'Control points',tolerance:'Tolerance'};
const advanced=new Set(['segments','steps','samples','iterations','tolerance','constraints','frame','edges','faces','openings','overrides','weights','knotsU','knotsV']);
export const scalar=value=>typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value;
export function labelFor(name){return labels[name]||name.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());}
export function fieldsFor(params){
  return Object.entries(params).map(([name,value])=>{
    let type='text',options,unit;
    if(typeof value==='boolean')type='checkbox';
    else if(choices[name]&&typeof value==='string'&&choices[name].includes(value)){type='select';options=choices[name];}
    else if(Array.isArray(value)&&value.length>0&&value.length<=4&&value.every(v=>['string','number'].includes(typeof v)))type='vector';
    else if(Array.isArray(value)&&value.length<=128&&value.length>0&&value.every(v=>Array.isArray(v)&&[2,3].includes(v.length)&&v.every(x=>['string','number'].includes(typeof x))))type='points';
    else if(value!==null&&typeof value==='object')type='json';
    if(/(angle|rotation|^r[xyz]$|twist)/i.test(name))unit='°';
    else if(/(width|height|depth|radius|thickness|offset|distance|^x$|^y$|^z$|pitch|cellSize)/i.test(name))unit='mm';
    return {name,label:labelFor(name),value:structuredClone(value),type,options,unit,advanced:advanced.has(name)||type==='json'};
  });
}
export function valuesFromFields(fields,values){
  const result={};for(const field of fields){const value=values[field.name];result[field.name]=field.type==='json'&&typeof value==='string'?JSON.parse(value):field.type==='vector'||field.type==='points'?value:scalar(value);}return result;
}
