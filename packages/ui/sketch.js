import {h, icon, toast} from './index.js';
import {classifyRegions} from '../regions/classify.js';
const svgElement=(name,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
/** Closed multi-loop XY editor; exact region validation is applied before committing. */
export class RegionEditor {
  constructor(host,{loops=[],onFinish,onCancel}={}) {
    this.loops=structuredClone(loops);this.onFinish=onFinish;this.onCancel=onCancel;this.scale=4;this.snap=1;this.mode='rectangle';this.pending=[];this.selected=null;this.history=[];this.abort=new AbortController();
    this.root=h('section',{class:'sketch-editor','aria-label':'Closed-region sketch editor'});this.svg=svgElement('svg',{class:'sketch-canvas',tabindex:0,'aria-label':'Draw closed XY sketch boundaries'});
    this.status=h('div',{class:'sketch-status'});
    const toolbar=h('div',{class:'sketch-help',style:'display:flex;gap:4px;flex-wrap:wrap;right:15px'},...['select','rectangle','circle','polygon'].map(mode=>h('button',{'data-sketch-tool':mode,onclick:()=>{this.mode=mode;this.pending=[];this.draw();}},icon(mode==='select'?'move':mode,16),mode)),h('button',{onclick:()=>this.undo()},'Undo'),h('button',{onclick:()=>this.remove()},'Delete loop'),h('button',{class:'primary',onclick:()=>this.finish()},icon('check',16),'Finish sketch'),h('button',{onclick:()=>this.cancel()},'Cancel'));
    this.root.append(this.svg,toolbar,this.status);host.append(this.root);
    const opts={signal:this.abort.signal};
    this.svg.addEventListener('pointerdown',e=>this.down(e),opts);this.svg.addEventListener('pointermove',e=>this.move(e),opts);this.svg.addEventListener('pointerup',()=>this.drag=null,opts);this.svg.addEventListener('pointercancel',()=>this.drag=null,opts);
    this.svg.addEventListener('wheel',e=>{e.preventDefault();this.scale=Math.max(.25,Math.min(30,this.scale*Math.exp(-e.deltaY*.001)));this.draw();},{...opts,passive:false});
    this.root.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='Enter'&&this.mode==='polygon'){e.preventDefault();this.closePolygon();}if(e.key==='Escape'){this.pending=[];this.draw();}if(e.key==='Delete'){e.preventDefault();this.remove();}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();e.stopPropagation();this.undo();}},opts);
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(this.root);this.draw();this.svg.focus();
  }
  coords(e){const r=this.svg.getBoundingClientRect();return [Math.round((e.clientX-r.left-r.width/2)/this.scale/this.snap)*this.snap,-Math.round((e.clientY-r.top-r.height/2)/this.scale/this.snap)*this.snap];}
  screen(p){return [this.root.clientWidth/2+p[0]*this.scale,this.root.clientHeight/2-p[1]*this.scale];}
  remember(){this.history.push(structuredClone(this.loops));if(this.history.length>50)this.history.shift();}
  undo(){const loops=this.history.pop();if(loops)this.loops=loops;this.pending=[];this.selected=null;this.draw();}
  remove(){if(this.selected!==null){this.remember();this.loops.splice(this.selected,1);this.selected=null;this.draw();}}
  down(e){if(e.button!==0)return;this.svg.focus();const p=this.coords(e);
    if(this.mode==='select'){const i=e.target.getAttribute('data-loop'),v=e.target.getAttribute('data-vertex');this.selected=i===null?null:Number(i);if(i!==null&&v!==null){this.remember();this.drag=[Number(i),Number(v)];this.svg.setPointerCapture(e.pointerId);}this.draw();return;}
    if(this.mode==='polygon'){if(this.pending.length>2&&Math.hypot(p[0]-this.pending[0][0],p[1]-this.pending[0][1])<7/this.scale)this.closePolygon();else if(!this.pending.length||Math.hypot(p[0]-this.pending.at(-1)[0],p[1]-this.pending.at(-1)[1])>0)this.pending.push(p);this.draw();return;}
    if(!this.pending.length){this.pending=[p];this.draw();return;}
    const a=this.pending[0];this.pending=[];let loop;
    if(this.mode==='rectangle'){if(p[0]===a[0]||p[1]===a[1])return;loop=[a,[p[0],a[1]],p,[a[0],p[1]]];}
    else {const radius=Math.hypot(p[0]-a[0],p[1]-a[1]);if(!radius)return;loop=Array.from({length:64},(_,i)=>[a[0]+radius*Math.cos(i*Math.PI/32),a[1]+radius*Math.sin(i*Math.PI/32)]);}
    this.remember();this.loops.push(loop);this.draw();
  }
  closePolygon(){if(this.pending.length<3)return;this.remember();this.loops.push(this.pending);this.pending=[];this.draw();}
  move(e){this.cursor=this.coords(e);if(this.drag){this.loops[this.drag[0]][this.drag[1]]=this.cursor;this.draw();}else if(this.pending.length)this.draw();}
  draw(){const w=this.root.clientWidth,hg=this.root.clientHeight;this.svg.setAttribute('viewBox',`0 0 ${w} ${hg}`);this.svg.replaceChildren();
    const line=(a,b,cls)=>{a=this.screen(a);b=this.screen(b);this.svg.append(svgElement('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:cls}));};
    const step=this.scale<2?20:5;
    for(let x=-Math.ceil(w/this.scale/step)*step;x<w/this.scale;x+=step)line([x,-hg/this.scale],[x,hg/this.scale],'sketch-grid');
    for(let y=-Math.ceil(hg/this.scale/step)*step;y<hg/this.scale;y+=step)line([-w/this.scale,y],[w/this.scale,y],'sketch-grid');
    line([-w/this.scale,0],[w/this.scale,0],'sketch-axis-x');line([0,-hg/this.scale],[0,hg/this.scale],'sketch-axis-y');
    this.loops.forEach((loop,i)=>{this.svg.append(svgElement('polygon',{points:loop.map(p=>this.screen(p).join(',')).join(' '),class:`sketch-entity ${this.selected===i?'selected':''}`,'data-loop':i}));if(this.mode==='select')loop.forEach((p,j)=>{const s=this.screen(p);this.svg.append(svgElement('circle',{cx:s[0],cy:s[1],r:4,class:'sketch-point','data-loop':i,'data-vertex':j}));});});
    if(this.pending.length&&this.cursor){let points=[...this.pending,this.cursor];if(this.mode==='rectangle'){const a=this.pending[0],b=this.cursor;points=[a,[b[0],a[1]],b,[a[0],b[1]],a];}if(this.mode==='circle'){const a=this.pending[0],r=Math.hypot(a[0]-this.cursor[0],a[1]-this.cursor[1]);points=Array.from({length:65},(_,i)=>[a[0]+r*Math.cos(i*Math.PI/32),a[1]+r*Math.sin(i*Math.PI/32)]);}this.svg.append(svgElement('polyline',{points:points.map(p=>this.screen(p).join(',')).join(' '),class:'sketch-preview'}));}
    this.status.textContent=`XY · ${this.mode} · ${this.loops.length} closed boundaries · 1 mm snap · wheel to zoom · Enter closes polygon · nested boundaries become holes/islands`;
    for(const b of this.root.querySelectorAll('[data-sketch-tool]'))b.classList.toggle('primary',b.dataset.sketchTool===this.mode);
  }
  async finish(){try{if(this.pending.length)throw new Error('Complete the active boundary or press Escape first');const r=classifyRegions(this.loops);await this.onFinish(r.loops);this.destroy();}catch(e){toast(e.message,true);}}
  cancel(){this.destroy();this.onCancel?.();}
  destroy(){this.abort.abort();this.observer.disconnect();this.root.remove();}
}
