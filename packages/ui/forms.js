import {h,icon} from './index.js';
/** Reusable modal or modeless tool forms with validated, cancellable preview. */
let formPresentation='modal';
export function setFormPresentation(value){if(!['modal','docked'].includes(value))throw new TypeError('Invalid form presentation');formPresentation=value;}
export function formDialog(title, fields, {description = '', confirm = 'Apply', validate = value => value, preview=null, commit=null, onCancel=null, docked=formPresentation==='docked'} = {}) {
  return new Promise(resolve => {
    let result=null,revision=0,timer=null,closed=false,busy=false;
    const dialog=h('dialog',{class:docked?'tool-dialog':'','aria-label':title,'data-tool-panel':docked?'true':undefined}),form=h('form'),inputs=new Map(),error=h('p',{class:'form-error',role:'alert'}),status=h('p',{class:'tool-preview-status','aria-live':'polite'},preview?'Previewing changes…':'');
    const body=h('div',{class:'dialog-fields'}),advanced=h('details',{class:'advanced-fields'},h('summary',{},'Advanced parameters'));
    function inputField(field){
      const type=field.type||'text';let input,read;
      if(type==='select')input=h('select',{name:field.name},...(field.options||[]).map(o=>h('option',{value:typeof o==='object'?o.value:o},typeof o==='object'?o.label:o)));
      else if(type==='vector'||type==='points'){
        const rows=type==='vector'?[structuredClone(field.value)]:structuredClone(field.value),table=h('div',{class:'coordinate-table'});
        const render=()=>{table.replaceChildren();rows.forEach((row,i)=>table.append(h('div',{class:'coordinate-row'},...row.map((v,j)=>h('label',{},h('small',{},['X','Y','Z','W'][j]),h('input',{type:'text',value:v,'aria-label':`${field.label} ${i+1} ${j+1}`,oninput:e=>{rows[i][j]=e.target.value;}}))),type==='points'?h('button',{type:'button',title:'Remove point',onclick:()=>{rows.splice(i,1);render();form.dispatchEvent(new Event('input'));}},'−'):null)));};render();
        input=h('div',{class:'coordinate-editor'},table,type==='points'?h('button',{type:'button',onclick:()=>{if(rows.length>=128)return;rows.push(Array(rows[0]?.length||3).fill(0));render();form.dispatchEvent(new Event('input'));}},'Add point'):null);
        read=()=>{const convert=v=>typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):v;return type==='vector'?rows[0].map(convert):rows.map(r=>r.map(convert));};
      }else if(type==='textarea'||type==='json')input=h('textarea',{name:field.name,rows:field.rows||7,spellcheck:'false'});
      else input=h('input',{name:field.name,type,step:type==='number'?'any':undefined,min:field.min,max:field.max,required:field.required});
      if(type==='checkbox')input.checked=!!field.value;
      else if(!read&&field.value!==undefined)input.value=type==='json'?JSON.stringify(field.value,null,2):field.value;
      read ||=()=>type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;
      inputs.set(field.name,{input,type,read});
      const control=field.unit?h('div',{class:'unit-field'},input,h('span',{class:'field-unit'},field.unit)):input;
      const node=h('label',{class:`form-field ${type==='checkbox'?'check-field':''}`},h('span',{},field.label||field.name),control,field.hint?h('small',{},field.hint):null);
      (field.advanced?advanced:body).append(node);
    }
    for(const field of fields)inputField(field);if(advanced.childNodes.length>1)body.append(advanced);
    const submit=h('button',{type:'submit',class:'primary'},confirm),cancel=h('button',{type:'button',onclick:()=>dialog.close()},'Cancel');
    form.append(h('div',{class:'dialog-heading'},h('h2',{},title),h('button',{type:'button',class:'icon-button','aria-label':'Close tool',onclick:()=>{if(!busy)dialog.close();}},icon('close',16))),description?h('p',{class:'dialog-description'},description):[],body,status,error,h('div',{class:'dialog-footer'},cancel,submit));
    const read=()=>{
      const values=Object.fromEntries([...inputs].map(([name,{read}])=>[name,read()]));
      for(const[name,{type,input}]of inputs)if(type==='number'&&(input.value.trim()===''||!Number.isFinite(values[name])))throw new TypeError(`${name} must be a finite number`);
      return validate(values);
    };
    const changed=()=>{
      if(!preview||closed||busy)return;const token=++revision;clearTimeout(timer);status.textContent='Updating preview…';
      timer=setTimeout(async()=>{try{const values=read();await preview(values);if(token!==revision||closed)return;error.textContent='';status.textContent='Live preview · not applied';}catch(e){if(token!==revision||closed)return;error.textContent=e.message;status.textContent='Invalid preview · model unchanged';}},160);
    };
    form.addEventListener('input',changed);form.addEventListener('change',changed);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;clearTimeout(timer);revision++;busy=true;submit.disabled=true;cancel.disabled=true;
      try{const values=read();if(commit)await commit(values);if(closed)return;result=values;dialog.close();}
      catch(e){if(!closed){error.textContent=e.message;status.textContent='Not applied';}}
      finally{busy=false;submit.disabled=false;cancel.disabled=false;}
    });
    const escape=e=>{if(e.key==='Escape'&&!busy&&document.querySelectorAll('dialog[open]')[document.querySelectorAll('dialog[open]').length-1]===dialog){e.preventDefault();e.stopPropagation();dialog.close();}};
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});document.addEventListener('keydown',escape,true);
    dialog.addEventListener('close',()=>{closed=true;revision++;clearTimeout(timer);document.removeEventListener('keydown',escape,true);if(result===null)onCancel?.();dialog.remove();resolve(result);},{once:true});
    dialog.append(form);document.body.append(dialog);if(docked)dialog.show();else dialog.showModal();body.querySelector('input,select,textarea')?.focus();changed();
  });
}
