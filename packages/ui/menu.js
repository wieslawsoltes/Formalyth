import {h,icon} from './index.js';
let opened=null,sequence=0;
/** Native-DOM menu button/context popup with roving focus, typeahead and Escape. */
export class Menu {
  constructor(entries,{anchor=null,x=null,y=null,label='Commands',onError=console.error}={}){
    opened?.close(false);opened=this;this.anchor=anchor;this.restore=document.activeElement;this.abort=new AbortController();this.entries=entries;this.onError=onError;
    this.root=h('div',{class:'command-menu',role:'menu','aria-label':label,id:'command-menu-'+(++sequence)});this.buttons=[];
    for(const entry of entries){
      if(entry.separator){this.root.append(h('div',{role:'separator',class:'menu-separator'}));continue;}
      if(entry.heading){this.root.append(h('div',{class:'menu-heading',role:'presentation'},entry.heading));continue;}
      const enabled=entry.enabled!==false;
      const b=h('button',{role:entry.checked===undefined?'menuitem':'menuitemcheckbox',tabindex:-1,'aria-disabled':String(!enabled),'aria-checked':entry.checked===undefined?undefined:String(!!entry.checked),title:entry.reason||entry.label,'data-command':entry.id||'',onclick:()=>{if(!enabled)return;this.close(false);Promise.resolve().then(()=>entry.run?.()).catch(onError);}},icon(entry.icon||'cube',17),h('span',{},entry.label),entry.shortcut?h('kbd',{},entry.shortcut):entry.checked?h('span',{class:'menu-tick'},'✓'):null);
      this.buttons.push(b);this.root.append(b);
    }
    document.body.append(this.root);anchor?.setAttribute('aria-expanded','true');anchor?.setAttribute('aria-controls',this.root.id);
    const r=anchor?.getBoundingClientRect(),box=this.root.getBoundingClientRect();
    this.root.style.left=Math.max(6,Math.min(x??r?.left??6,innerWidth-box.width-6))+'px';
    this.root.style.top=Math.max(6,Math.min(y??r?.bottom??6,innerHeight-Math.min(box.height,innerHeight-12)-6))+'px';
    this.index=0;this.focus(0);this.root.addEventListener('keydown',e=>this.keydown(e),{signal:this.abort.signal});
    document.addEventListener('pointerdown',e=>{if(!this.root.contains(e.target)&&!anchor?.contains(e.target))this.close(false);},{capture:true,signal:this.abort.signal});
    window.addEventListener('resize',()=>this.close(false),{signal:this.abort.signal});
  }
  focus(i){if(!this.buttons.length)return;this.index=(i+this.buttons.length)%this.buttons.length;this.buttons.forEach((b,n)=>b.tabIndex=n===this.index?0:-1);this.buttons[this.index].focus({preventScroll:true});this.buttons[this.index].scrollIntoView({block:'nearest'});}
  keydown(e){
    e.stopPropagation();
    if(e.key==='Escape'||e.key==='ArrowLeft'){e.preventDefault();this.close();}
    else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();this.focus(this.index+(e.key==='ArrowDown'?1:-1));}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();this.focus(e.key==='Home'?0:this.buttons.length-1);}
    else if(e.key==='Tab')this.close(false);
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&e.key!==' '){
      clearTimeout(this.timer);this.typed=(this.typed||'')+e.key.toLowerCase();this.timer=setTimeout(()=>this.typed='',600);
      const i=this.buttons.findIndex(b=>b.innerText.trim().toLowerCase().startsWith(this.typed));if(i>=0)this.focus(i);
    }
  }
  close(restore=true){clearTimeout(this.timer);this.abort.abort();this.root.remove();this.anchor?.setAttribute('aria-expanded','false');if(opened===this)opened=null;if(restore&&this.restore?.isConnected)this.restore.focus();}
  static close(){opened?.close();}
}
