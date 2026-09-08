/** Small, versioned UI preferences; never stores model geometry or credentials. */
export function cleanPreferences(input={}){
  const ids=value=>Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.length<100))].slice(0,30):[];
  return {version:1,leftWidth:Math.max(190,Math.min(440,Number(input.leftWidth)||250)),rightWidth:Math.max(240,Math.min(480,Number(input.rightWidth)||286)),
    density:input.density==='comfortable'?'comfortable':'compact',favorites:ids(input.favorites),recent:ids(input.recent),collapsed:ids(input.collapsed??['features']),showGrid:input.showGrid!==false};
}
export class Preferences {
  constructor(storage=globalThis.localStorage){this.storage=storage;try{this.data=cleanPreferences(JSON.parse(storage.getItem('formalyth-ui-v1')||'{}'));}catch{this.data=cleanPreferences();}}
  update(patch){this.data=cleanPreferences({...this.data,...patch});try{this.storage.setItem('formalyth-ui-v1',JSON.stringify(this.data));}catch{}return this.data;}
  record(id){this.update({recent:[id,...this.data.recent.filter(x=>x!==id)]});}
  favorite(id){this.update({favorites:this.data.favorites.includes(id)?this.data.favorites.filter(x=>x!==id):[...this.data.favorites,id]});}
}
