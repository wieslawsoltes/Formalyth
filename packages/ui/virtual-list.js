import {h} from './index.js';
import {visibleRange} from './scheduling.js';
/** Bounded DOM window. Stable item IDs, keyboard focus and scroll survive updates. */
export class VirtualList {
  constructor(root,{size=28,horizontal=false,render,key=item=>item.id,role='listbox'}={}){
    this.root=root;this.size=size;this.horizontal=horizontal;this.renderItem=render;this.key=key;this.items=[];this.nodes=new Map();this.pending=null;this.disposed=false;this.stats={frames:0,created:0,mounted:0};
    root.classList.add('virtual-list');root.classList.toggle('horizontal',horizontal);root.setAttribute('role',role);root.tabIndex=0;
    this.content=h('div',{class:'virtual-content'});root.replaceChildren(this.content);
    this.abort=new AbortController();root.addEventListener('scroll',()=>this.schedule(),{signal:this.abort.signal,passive:true});
    this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(root);
  }
  setItems(items){this.items=items;this.dirty=true;const total=items.length*this.size;this.content.style[this.horizontal?'width':'height']=total+'px';this.schedule();}
  schedule(){if(this.pending===null&&!this.disposed)this.pending=requestAnimationFrame(()=>{this.pending=null;this.draw();});}
  draw(){
    if(this.disposed)return;const offset=this.horizontal?this.root.scrollLeft:this.root.scrollTop,extent=this.horizontal?this.root.clientWidth:this.root.clientHeight;
    const range=visibleRange(this.items.length,offset,extent,this.size,4),keep=new Set();this.stats.frames++;
    for(let i=range.first;i<range.last;i++){
      const item=this.items[i],key=String(this.key(item));keep.add(key);let entry=this.nodes.get(key);
      if(!entry||entry.item!==item||this.dirty){
        const node=this.renderItem(item,i);node.classList.add('virtual-item');node.style[this.horizontal?'left':'top']=(i*this.size)+'px';node.style[this.horizontal?'width':'height']=this.size+'px';
        node.dataset.key=key;node.dataset.index=i;node.setAttribute('aria-posinset',String(i+1));node.setAttribute('aria-setsize',String(this.items.length));
        if(entry)entry.node.replaceWith(node);else this.content.append(node);entry={node,item,index:i};this.nodes.set(key,entry);this.stats.created++;
      }else if(entry.index!==i){entry.node.style[this.horizontal?'left':'top']=(i*this.size)+'px';entry.index=i;}
    }
    for(const[key,entry]of this.nodes)if(!keep.has(key)){entry.node.remove();this.nodes.delete(key);}
    this.dirty=false;this.stats.mounted=this.nodes.size;this.onDraw?.();
  }
  scrollTo(index){
    if(!Number.isInteger(index)||index<0||index>=this.items.length)return;
    const start=index*this.size,axis=this.horizontal?'scrollLeft':'scrollTop',extent=this.horizontal?this.root.clientWidth:this.root.clientHeight;
    if(start<this.root[axis])this.root[axis]=start;else if(start+this.size>this.root[axis]+extent)this.root[axis]=start+this.size-extent;
    this.draw();
  }
  dispose(){this.disposed=true;this.abort.abort();this.observer.disconnect();if(this.pending!==null)cancelAnimationFrame(this.pending);this.nodes.clear();}
}
