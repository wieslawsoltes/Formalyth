import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../packages/tasks/engine.js';
import {roundedEnclosureProject} from '../packages/workbench/examples.js';
import {box,transform,meshBounds,massProperties} from '../packages/kernel/index.js';
import {m4} from '../packages/math/index.js';
import {sliceMesh} from '../packages/manufacturing/additive.js';
const engine=new Engine(),built=engine.evaluate({document:roundedEnclosureProject().data.model});
assert.deepEqual(built.errors,[]);
const enclosure=built.changes.at(-1).value;

test('rounded enclosure slices without a microscopic extra cap layer',()=>{
  for(const [layerHeight,expected] of [[.4,70],[.35,80]]){
    const slice=sliceMesh(enclosure,{layerHeight,lineWidth:.45,shells:2,solidLayers:2});
    assert.equal(slice.layers.length,expected);
    assert.ok(slice.layers.every(layer=>layer.height>layerHeight*.99));
    assert.equal(slice.layers.at(-1).contours.length,2);
    assert.ok(slice.layers.at(-1).paths.length>2);
    assert.equal(slice.layers.at(-1).z,meshBounds(enclosure).max[2]);
  }
});
test('slicing keeps genuine fractional final layers and their exact top',()=>{
  for(const height of [3.07,3.00001]){
    const slice=sliceMesh(box(12,10,height),{layerHeight:.3});
    assert.equal(slice.layers.length,11);
    assert.ok(Math.abs(slice.layers.at(-1).height-(height-3))<1e-12);
    assert.equal(slice.layers.at(-1).z,height);
  }
});
test('layer-count rounding tolerates translated coordinate ULP noise',()=>{
  const body=transform(box(12,10,3),m4.translation(0,0,1000000.1));
  const slice=sliceMesh(body,{layerHeight:.3});
  assert.equal(slice.layers.length,10);
  assert.ok(slice.layers.every(layer=>layer.height>.299999));
});
test('hollow enclosure reaches drawing and static mesh interchange engines',()=>{
  const drawing=engine.dispatch('draw',{bodies:[enclosure],options:{title:'Rounded enclosure'}});
  assert.equal(drawing.views.length,4);assert.ok(drawing.svg.includes('<svg'));
  const binary=engine.dispatch('export',{entries:[{name:'Enclosure',value:enclosure}],extension:'glb'});
  const restored=engine.dispatch('import',{data:binary,extension:'glb'});
  assert.equal(restored.bodies.length,1);
  assert.ok(Math.abs(massProperties(restored.bodies[0].mesh).volume-massProperties(enclosure).volume)<.05);
});
