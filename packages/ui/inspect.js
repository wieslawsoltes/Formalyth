/** Bounded, lazy native-DOM data inspection. Large numerical buffers stay collapsed. */
export function describe(value){
  if(value===null)return 'null';
  if(ArrayBuffer.isView(value))return `${value.constructor.name} (${value.length??value.byteLength})`;
  if(Array.isArray(value))return `Array (${value.length})`;
  if(typeof value==='object')return value instanceof Map?`Map (${value.size})`:value.constructor?.name||'Object';
  return String(value).slice(0,2000);
}
export function inspectData(value,h,{pageSize=64,maxDepth=12}={}){
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)throw new RangeError('Invalid inspector page size');
  const ancestors=new Set();
  const render=(key,value,depth,seen)=>{
    const compound=value!==null&&typeof value==='object';
    if(!compound)return h('div',{class:'data-value'},h('span',{class:'data-key'},key),h('code',{},describe(value)));
    if(seen.has(value))return h('div',{class:'data-value'},h('span',{class:'data-key'},key),'[circular reference]');
    const node=h('details',{class:'data-node'},h('summary',{},h('span',{class:'data-key'},key),describe(value)));
    let loaded=false;node.addEventListener('toggle',()=>{
      if(!node.open||loaded)return;loaded=true;
      if(depth>=maxDepth){node.append(h('p',{},'Nested data limit reached. Export the record to inspect all values.'));return;}
      const path=new Set(seen);path.add(value);
      const array=Array.isArray(value)||ArrayBuffer.isView(value),map=value instanceof Map;
      const keys=array?null:map?[...value.keys()]:Object.keys(value),length=array?value.length??0:keys.length;
      const content=h('div',{class:'data-children'});node.append(content);let start=0;
      const more=h('button',{type:'button',class:'data-more'},'Show next values');
      const page=()=>{more.remove();const end=Math.min(start+pageSize,length);for(let i=start;i<end;i++){const key=array?i:keys[i],v=map?value.get(key):value[key];content.append(render(String(key),v,depth+1,path));}start=end;if(start<length){more.textContent=`Show ${Math.min(pageSize,length-start)} more (${length-start} remaining)`;content.append(more);}};
      more.addEventListener('click',page);page();
    });return node;
  };
  const root=render('Result',value,0,ancestors);root.open=true;return root;
}
