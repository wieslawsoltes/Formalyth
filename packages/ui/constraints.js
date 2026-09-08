/** Worker-backed graphical editor for one closed, dimensioned polygon sketch. */
import {h,formDialog,toast} from './index.js';
import {ConstraintSession} from '../sketch/constraints.js';
const svg=(tag,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;};
export class ConstraintEditor{
  constructor(host,{sketch,solve,onFinish,onCancel}={}){
    this.session=new ConstraintSession(sketch,{solve});this.onFinish=onFinish;this.onCancel=onCancel;this.selected=[];this.scale=5;this.busy=false;this.closed=false;this.abort=new AbortController();
    this.root=h('section',{class:'constraint-editor','aria-label':'Constraint sketch editor'});this.canvas=svg('svg',{class:'constraint-canvas',tabindex:0,'aria-label':'Sketch geometry and dimensions'});this.list=h('div',{class:'constraint-list'});this.status=h('div',{class:'constraint-status',role:'status'});
    const tool=(label,fn)=>h('button',{'aria-label':label,onclick:fn},label);
    this.toolbar=h('div',{class:'constraint-toolbar'},h('strong',{},'CONSTRAINT SKETCH'),tool('Horizontal',()=>this.add('horizontal')),tool('Vertical',()=>this.add('vertical')),tool('Dimension',()=>this.add('distance')),tool('Fix point',()=>this.add('fixed')),tool('Undo sketch',()=>this.act(()=>this.session.undo())),tool('Redo sketch',()=>this.act(()=>this.session.redo())),tool('Finish constrained sketch',()=>this.finish()),tool('Cancel sketch',()=>this.cancel()));
    this.root.append(this.toolbar,this.canvas,h('aside',{class:'constraint-panel'},h('h3',{},'Driving constraints'),h('p',{},'Select an edge, or tap two vertices. Dimensions accept named parameter expressions.'),this.list),this.status);host.append(this.root);
    const opts={signal:this.abort.signal};this.canvas.addEventListener('pointerdown',e=>this.down(e),opts);this.canvas.addEventListener('pointermove',e=>this.move(e),opts);this.canvas.addEventListener('pointerup',e=>this.up(e),opts);this.canvas.addEventListener('pointercancel',()=>{this.drag=null;this.preview=null;this.draw();},opts);
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.scale=Math.max(.25,Math.min(40,this.scale*Math.exp(-e.deltaY*.001)));this.draw();},{...opts,passive:false});
    this.root.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){this.selected=[];this.draw();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();this.act(()=>e.shiftKey?this.session.redo():this.session.undo());}},opts);
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(this.canvas);this.ready=this.act(()=>this.session.change('Initialize',()=>{}));this.draw();this.canvas.focus();
  }
  async act(fn){if(this.closed||this.busy)return null;this.busy=true;this.draw();try{const result=await fn();if(!this.closed)this.draw();return result;}catch(e){if(e.name!=='AbortError')toast(e.message,true);return null;}finally{this.busy=false;if(!this.closed)this.draw();}}
  xy(e){const r=this.canvas.getBoundingClientRect();return [Math.round((e.clientX-r.left-r.width/2)/this.scale*10)/10,-Math.round((e.clientY-r.top-r.height/2)/this.scale*10)/10];}
  screen(p){const r=this.canvas.getBoundingClientRect();return [r.width/2+p[0]*this.scale,r.height/2-p[1]*this.scale];}
  down(e){if(this.busy||e.button!==0)return;const index=e.target.getAttribute('data-point'),edge=e.target.getAttribute('data-edge');if(edge!==null){const i=Number(edge);this.selected=[i,(i+1)%this.session.data.points.length];}else if(index!==null){const i=Number(index);this.selected=this.selected.includes(i)?this.selected:this.selected.length<2?[...this.selected,i]:[i];this.drag={index:i,start:[e.clientX,e.clientY],moved:false};this.canvas.setPointerCapture(e.pointerId);}else this.selected=[];this.draw();}
  move(e){if(!this.drag||this.busy)return;if(Math.hypot(e.clientX-this.drag.start[0],e.clientY-this.drag.start[1])>3)this.drag.moved=true;if(this.drag.moved){this.preview={index:this.drag.index,point:this.xy(e)};this.draw();}}
  up(e){const drag=this.drag,preview=this.preview;this.drag=null;this.preview=null;if(drag?.moved&&preview)this.act(()=>this.session.move(drag.index,preview.point));else this.draw();}
  async add(type){
    if(this.busy)return;const count=type==='fixed'?1:2;if(this.selected.length!==count){toast(`Select ${count===1?'one vertex':'an edge or two vertices'} first`,true);return;}
    const [a,b]=this.selected,points=this.session.data.points;let constraint={type,a,...(b===undefined?{}:{b})};
    if(type==='fixed')constraint={type,a,x:points[a][0],y:points[a][1]};
    if(type==='distance'){const p=await formDialog('Driving dimension',[{name:'value',label:'Distance / named expression (mm)',value:Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]).toFixed(3)}]);if(!p)return;constraint.value=p.value;}
    await this.act(()=>this.session.add(constraint));
  }
  async edit(index){const c=this.session.data.constraints[index],keys=c.type==='fixed'?['x','y']:Object.hasOwn(c,'value')?['value']:[];if(!keys.length)return;const patch=await formDialog('Edit '+c.type,keys.map(name=>({name,label:name,value:c[name]})));if(patch)await this.act(()=>this.session.edit(index,patch));}
  draw(){
    if(this.closed)return;const r=this.canvas.getBoundingClientRect(),points=structuredClone(this.session.data.points);if(this.preview)points[this.preview.index]=this.preview.point;this.canvas.setAttribute('viewBox',`0 0 ${Math.max(1,r.width)} ${Math.max(1,r.height)}`);this.canvas.replaceChildren();
    const line=(a,b,attrs={})=>{a=this.screen(a);b=this.screen(b);this.canvas.append(svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],...attrs}));};
    const span=Math.max(r.width,r.height)/this.scale,step=this.scale<2?20:5;
    for(let x=-Math.ceil(span/step)*step;x<=span;x+=step){line([x,-span],[x,span],{class:x===0?'constraint-axis':'constraint-grid'});line([-span,x],[span,x],{class:x===0?'constraint-axis':'constraint-grid'});}
    points.forEach((p,i)=>{const j=(i+1)%points.length;line(p,points[j],{class:'constraint-edge '+(this.selected.includes(i)&&this.selected.includes(j)?'selected':''),'data-edge':i});});
    points.forEach((p,i)=>{const[x,y]=this.screen(p);this.canvas.append(svg('circle',{cx:x,cy:y,r:6,class:'constraint-point '+(this.selected.includes(i)?'selected':''),'data-point':i}),svg('text',{x:x+9,y:y-9,class:'constraint-index'},i));});
    const constraints=this.session.data.constraints||[];
    constraints.forEach((c,i)=>{if(c.type==='distance'){const a=points[c.a],b=points[c.b],p=this.screen([(a[0]+b[0])/2,(a[1]+b[1])/2]),distance=Math.hypot(a[0]-b[0],a[1]-b[1]),text=typeof c.value==='string'&&Number.isNaN(Number(c.value))?`${c.value} = ${distance.toFixed(2)}`:distance.toFixed(2);this.canvas.append(svg('text',{x:p[0]+12,y:p[1]-12,class:'constraint-dimension'},text));}});
    this.list.replaceChildren(...constraints.map((c,i)=>h('div',{class:'constraint-row'},h('button',{class:'constraint-label',disabled:this.busy,onclick:()=>this.edit(i),title:'Edit driving value'},`${i+1}. ${c.type} · ${c.a??''}${c.b===undefined?'':'–'+c.b}${c.value===undefined?'':' = '+c.value}`),h('button',{'aria-label':`Remove constraint ${i+1}`,disabled:this.busy,onclick:()=>this.act(()=>this.session.remove(i))},'×'))));
    const report=this.session.report;this.status.textContent=this.busy?'Solving in worker…':report?`${report.status} · ${report.dof} degrees of freedom · ${report.redundant} redundant equations · residual ${report.residual.toExponential(2)} · local sketch coordinates (mm)`:'Select geometry to add constraints';this.status.classList.toggle('solved',report?.status==='fully constrained');
    for(const button of this.toolbar.querySelectorAll('button'))button.disabled=this.busy&&button.textContent!=='Cancel sketch';
  }
  async finish(){if(this.busy||this.closed)return;await this.act(async()=>{await this.onFinish(structuredClone(this.session.data));this.destroy();});}
  cancel(){this.destroy();this.onCancel?.();}
  destroy(){if(this.closed)return;this.closed=true;this.session.cancel();this.abort.abort();this.observer.disconnect();this.root.remove();}
}
