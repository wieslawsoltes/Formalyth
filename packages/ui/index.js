/** Small native-DOM UI toolkit: commands, accessible dialogs, safe text and SVG icons. */
export function h(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'checked') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.flat(Infinity).filter(v => v !== null && v !== undefined).map(v => v instanceof Node ? v : document.createTextNode(String(v))));
  return node;
}
const paths = {
 cube:'M12 2 3 7v10l9 5 9-5V7Z M3 7l9 5 9-5 M12 12v10',
 sketch:'M4 20h16M5 16l1-5L16 1l5 5-10 10Z M14 3l5 5',
 extrude:'M4 13l8 4 8-4v6l-8 4-8-4Z M12 17V7 M8 9l4-4 4 4',
 circle:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
 rectangle:'M3 5h18v14H3Z',
 curve:'M2 19C8-16 16 40 22 5 M2 19l5-9m15-5-5 9',
 move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',
 cut:'M4 4h10v10H4ZM10 10h10v10H10Z M4 4l16 16',
 pattern:'M2 2h7v7H2ZM15 2h7v7h-7ZM2 15h7v7H2ZM15 15h7v7h-7Z',
 gear:'M9 2h6l1 4 4 1 2 5-3 3v5l-5 2-4-3-5 1-3-5 2-4-1-5 5-1Z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
 save:'M4 2h13l4 4v16H3V2Z M7 2v7h10V2 M7 22v-8h10v8',
 open:'M2 5h8l3 3h9l-3 12H2Z M2 10h18',
 new:'M5 2h10l4 4v16H5Z M12 9v8M8 13h8',
 undo:'M8 4 2 10l6 6 M3 10h11a7 7 0 0 1 7 7',
 redo:'M16 4l6 6-6 6 M21 10H10a7 7 0 0 0-7 7',
 layers:'m12 2-10 6 10 6 10-6Z M2 12l10 6 10-6 M2 17l10 6 10-6',
 mill:'M9 2h6v8l-2 4h-2l-2-4Z M2 17h6l4 4 4-4h6 M12 14v7',
 inspect:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z M15 15l7 7',
 measure:'M2 17 17 2l5 5L7 22Z M6 13l3 3M10 9l3 3M14 5l3 3',
 parameters:'M3 5h18M3 12h18M3 19h18 M8 2v6M16 9v6M10 16v6',
 play:'M6 3 21 12 6 21Z',
 stop:'M5 5h14v14H5Z',
 export:'M12 16V2 M7 7l5-5 5 5 M3 13v9h18v-9',
 check:'M3 12l6 6L21 4',
 close:'M5 5l14 14M5 19 19 5',
 theme:'M12 2a10 10 0 1 0 10 10A8 8 0 0 1 12 2Z',
 sheet:'M3 5h8v14h10V5 M3 5v14h8 M7 10l10 4',
 joint:'M3 3h7v7H3ZM14 14h7v7h-7ZM7 10v7h7',
 circuit:'M2 5h5l2 4 3-8 3 8 2-4h5 M2 5v14h20V5 M8 16v6 M16 14v10',
 stress:'M3 3h18v18H3ZM3 3l18 18M3 21 21 3M3 12h18M12 3v18',
 drawing:'M2 3h20v18H2ZM2 17h20M16 17v4 M5 6h7v7H5Z',
 fit:'M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6',
 eye:'M2 12c6-10 14-10 20 0-6 10-14 10-20 0Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 help:'M8 8a4 4 0 1 1 6 3l-2 2v2 M12 18v2'
};
export function icon(name = 'cube', size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
  const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d', paths[name] || paths.cube); svg.append(path); return svg;
}
export class Commands {
  constructor() { this.items = new Map(); }
  add(id, label, image, group, run) { if (this.items.has(id)) throw new Error(`Duplicate command ${id}`); this.items.set(id,{id,label,icon:image,group,run}); }
  async execute(id, ...args) { const command = this.items.get(id); if (!command) throw new ReferenceError(`Unknown command ${id}`); return command.run(...args); }
  search(text = '') { const q = text.toLowerCase(); return [...this.items.values()].filter(c => `${c.label} ${c.id} ${c.group}`.toLowerCase().includes(q)); }
}
export function toast(message, error = false) {
  let root = document.querySelector('#toasts'); if (!root) { root = h('div',{id:'toasts','aria-live':'polite'}); document.body.append(root); }
  const item = h('div',{class:`toast ${error ? 'error' : ''}`},h('span',{},error ? '!' : '✓'),h('span',{},message)); root.append(item); setTimeout(() => item.remove(),error ? 8000 : 4500);
}
export function download(data, name, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], {type:mime});
  const url = URL.createObjectURL(blob), a = h('a',{href:url,download:name}); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function formDialog(title, fields, {description = '', confirm = 'Apply', validate = value => value} = {}) {
  return new Promise(resolve => {
    let result = null;
    const dialog = h('dialog'), form = h('form'), inputs = new Map(), error = h('p',{class:'form-error',role:'alert'});
    const body = h('div',{class:'dialog-fields'});
    for (const field of fields) {
      const type = field.type || 'text'; let input;
      if (type === 'select') input = h('select',{name:field.name},...(field.options || []).map(o => h('option',{value:typeof o === 'object' ? o.value : o},typeof o === 'object' ? o.label : o)));
      else if (type === 'textarea') input = h('textarea',{name:field.name,rows:field.rows || 7});
      else input = h('input',{name:field.name,type,step:type === 'number' ? 'any' : undefined,min:field.min,max:field.max,required:field.required});
      if (type === 'checkbox') input.checked = !!field.value; else if (field.value !== undefined) input.value = field.value;
      inputs.set(field.name,{input,type});
      body.append(h('label',{class:`form-field ${type === 'checkbox' ? 'check-field' : ''}`},h('span',{},field.label || field.name),input,field.hint ? h('small',{},field.hint) : null));
    }
    form.append(h('div',{class:'dialog-heading'},h('h2',{},title)),description ? h('p',{class:'dialog-description'},description) : [],body,error,h('div',{class:'dialog-footer'},h('button',{type:'button',onclick:()=>dialog.close()},'Cancel'),h('button',{type:'submit',class:'primary'},confirm)));
    form.addEventListener('submit',event=>{event.preventDefault();try {
      const values = Object.fromEntries([...inputs].map(([name,{input,type}]) => [name,type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value]));
      for (const [name,{type,input}] of inputs) if (type === 'number' && (input.value.trim()==='' || !Number.isFinite(values[name]))) throw new TypeError(`${name} must be a finite number`);
      result=validate(values); dialog.close();
    } catch(e){error.textContent=e.message;}});
    dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});dialog.append(form);document.body.append(dialog);dialog.showModal();body.querySelector('input,select,textarea')?.focus();
  });
}
export function report(title, content, actions = []) {
  const dialog=h('dialog',{class:'wide'}),body=h('div',{class:'report-content'});
  body.append(content instanceof Node ? content : h('pre',{},typeof content === 'string' ? content : JSON.stringify(content,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,2)));
  dialog.append(h('div',{class:'dialog-heading'},h('h2',{},title),h('button',{class:'icon-button','aria-label':'Close',onclick:()=>dialog.close()},icon('close'))),body,h('div',{class:'dialog-footer'},...actions.map(a=>h('button',{onclick:()=>a.run()},a.label)),h('button',{onclick:()=>dialog.close()},'Close')));
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();return dialog;
}
export function jsonValue(value) { return JSON.parse(JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v)); }
