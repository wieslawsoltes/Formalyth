/** Named dimensions are resolved only in numeric fields, never as executable code. */
import {expression,solveSketch} from '../solver/index.js';
export function resolveSketch(sketch,parameters={}){
  if(!Array.isArray(sketch?.points)||!Array.isArray(sketch.constraints||[])||!Array.isArray(sketch.circles||[]))throw new TypeError('Invalid constraint sketch');
  const data=structuredClone(sketch);data.points=data.points.map(p=>p.map(x=>expression(x,parameters)));
  data.circles=(data.circles||[]).map(c=>({...c,radius:expression(c.radius,parameters)}));
  data.constraints=(data.constraints||[]).map(c=>{const result={...c};for(const key of ['value','weight','x','y'])if(Object.hasOwn(c,key))result[key]=expression(c[key],parameters);return result;});
  return data;
}
export function evaluateSketch(sketch,parameters={},options={}){return solveSketch(resolveSketch(sketch,parameters),options);}
/** Atomic async editing session. Inject worker-backed solving in browser editors. */
export class ConstraintSession{
  constructor(sketch,{solve=data=>evaluateSketch(data),historyLimit=40}={}){
    if(!Number.isInteger(historyLimit)||historyLimit<0||historyLimit>200)throw new RangeError('Invalid sketch history limit');
    this.data=structuredClone(sketch);this.solve=solve;this.historyLimit=historyLimit;this.past=[];this.future=[];this.sequence=0;this.report=null;
  }
  async change(label,mutate){
    const sequence=++this.sequence,before=structuredClone(this.data),draft=structuredClone(before);mutate(draft);
    const report=await this.solve(draft);if(sequence!==this.sequence)throw new DOMException('Superseded sketch edit','AbortError');
    if(!report.converged)throw new RangeError(`Constraints are inconsistent (residual ${report.residual.toPrecision(3)})`);
    const next={...draft,points:report.sketch.points};
    if(JSON.stringify(next)!==JSON.stringify(before)){this.past.push(before);if(this.past.length>this.historyLimit)this.past.shift();this.future=[];}
    this.data=next;this.report=report;return report;
  }
  add(constraint){return this.change('Add constraint',data=>(data.constraints??=[]).push(structuredClone(constraint)));}
  remove(index){return this.change('Remove constraint',data=>{if(!Number.isInteger(index)||index<0||index>=data.constraints.length)throw new RangeError('Constraint index out of range');data.constraints.splice(index,1);});}
  edit(index,patch){return this.change('Edit constraint',data=>{if(!data.constraints[index])throw new RangeError('Constraint index out of range');data.constraints[index]={...data.constraints[index],...structuredClone(patch)};});}
  move(index,point){return this.change('Move point',data=>{if(!data.points[index]||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new TypeError('Invalid sketch point');data.points[index]=[...point];});}
  async restore(from,to){
    const snapshot=from.at(-1);if(!snapshot)return false;const sequence=++this.sequence,report=await this.solve(snapshot);
    if(sequence!==this.sequence)throw new DOMException('Superseded sketch history','AbortError');if(!report.converged)throw new RangeError('Sketch history no longer satisfies parameter values');
    from.pop();to.push(structuredClone(this.data));this.data=structuredClone(snapshot);this.report=report;return true;
  }
  undo(){return this.restore(this.past,this.future);}
  redo(){return this.restore(this.future,this.past);}
  cancel(){this.sequence++;}
}
