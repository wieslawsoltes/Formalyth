import test from 'node:test';import assert from 'node:assert/strict';
import {perspective,intersectsFrustum,cameraState,restoreCamera} from '../packages/renderer/projection.js';
import {OrbitCamera} from '../packages/renderer/camera.js';import {m4,v3} from '../packages/math/index.js';
import {FrameQueue,visibleRange} from '../packages/ui/scheduling.js';import {cleanPreferences,Preferences} from '../packages/ui/preferences.js';
import {fieldsFor,valuesFromFields} from '../packages/ui/fields.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const z of [false,true])test(`perspective projects near/far to the proper ${z?'WebGPU':'WebGL'} depths`,()=>{
 const m=perspective(Math.PI/3,2,1,100,z);near(m4.point(m,[0,0,-1])[2],z?0:-1);near(m4.point(m,[0,0,-100])[2],1);near(m4.point(m,[2*Math.tan(Math.PI/6),0,-1])[0],1);
});
test('perspective ray intersects the projected world point',()=>{
 const c=new OrbitCamera();c.projection='perspective';c.aspect=1.5;const p=[3,5,8],s=c.project(p,900,600),ray=c.ray(s[0],s[1],900,600),d=v3.sub(p,ray.origin);near(v3.length(v3.cross(d,ray.direction)),0);
});
test('orthographic and perspective conservative frustum tests retain intersecting bounds',()=>{
 const c=new OrbitCamera(),box={min:[-2,-2,-2],max:[2,2,2]};for(const mode of ['orthographic','perspective']){c.projection=mode;for(const z of [true,false]){assert.equal(intersectsFrustum(box,c.matrix(z),z),true);assert.equal(intersectsFrustum(box,m4.multiply(c.matrix(z),m4.translation(1e5,0,0)),z),false);assert.equal(intersectsFrustum({min:[-1e6,-1e6,-1e6],max:[1e6,1e6,1e6]},c.matrix(z),z),true);}}
});
test('saved view validation is atomic and snapshots are independent',()=>{
 const c=new OrbitCamera(),s=cameraState(c);s.target[0]=5;assert.equal(c.target[0],0);restoreCamera(c,s);assert.equal(c.target[0],5);assert.throws(()=>restoreCamera(c,{...s,scale:-1}),/Invalid/);assert.equal(c.scale,s.scale);
});
test('invalid perspective frusta fail explicitly',()=>{for(const v of [[0,1,1,2],[Math.PI,1,1,2],[1,0,1,2],[1,1,-1,2],[1,1,5,2],[NaN,1,1,2]])assert.throws(()=>perspective(...v),/Invalid/);});
test('virtualized ranges stay bounded regardless of document size',()=>{
 const r=visibleRange(500000,28*200000,560,28);assert.equal(r.first,199996);assert.equal(r.last-r.first,28);assert.equal(visibleRange(0,0,500,28).last,0);assert.equal(visibleRange(10,10000,500,28).first,10);assert.throws(()=>visibleRange(20,0,20,0),/Invalid/);
});
test('frame invalidations coalesce by component key and preserve follow-up jobs',()=>{
 let next,requests=0;const q=new FrameQueue(fn=>{requests++;next=fn;return requests;},()=>{});let value=0;q.schedule('tree',()=>value=1);q.schedule('tree',()=>value=2);q.schedule('inspector',()=>{value+=3;q.schedule('tree',()=>value=9);});assert.equal(requests,1);next();assert.equal(value,5);assert.equal(requests,2);next();assert.equal(value,9);assert.equal(q.stats.coalesced,1);q.dispose();q.schedule('none',()=>value=10);assert.equal(value,9);
});
test('preference storage is bounded, sanitized and tolerant of storage errors',()=>{
 const s=cleanPreferences({leftWidth:100000,rightWidth:-4,favorites:['a','a',42],density:'unknown'});assert.equal(s.leftWidth,440);assert.equal(s.rightWidth,240);assert.deepEqual(s.favorites,['a']);
 const p=new Preferences({getItem(){throw Error();},setItem(){throw Error();}});p.favorite('solid.box');p.record('solid.box');assert.deepEqual(p.data.favorites,['solid.box']);p.favorite('solid.box');assert.equal(p.data.favorites.length,0);
});
test('structured feature fields preserve expressions, vectors, points and advanced data',()=>{
 const fields=fieldsFor({width:'wall*2',normal:[0,0,1],centers:[[1,2],[3,4]],edges:[{normal:[1,0,0]}],plane:'XY',through:true});
 assert.deepEqual(fields.map(f=>f.type),['text','vector','points','json','select','checkbox']);
 const values=valuesFromFields(fields,{width:'wall*2',normal:[0,0,1],centers:[[1,2]],edges:'[{"id":2}]',plane:'XY',through:true});assert.equal(values.width,'wall*2');assert.deepEqual(values.edges,[{id:2}]);
});
test('saved camera metadata cannot overwrite renderer methods',()=>{
 const c=new OrbitCamera(),method=c.matrix;restoreCamera(c,{...cameraState(c),matrix:'malformed'});assert.equal(c.matrix,method);
});
