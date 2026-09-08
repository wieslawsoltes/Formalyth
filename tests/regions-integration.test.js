import test from 'node:test';import assert from 'node:assert/strict';
import {extrudeRegions,installRegionFeatures} from '../packages/regions/index.js';
import {massProperties,topology} from '../packages/kernel/index.js';
import {DesignDocument,FeatureEvaluator} from '../packages/document/index.js';
const rect=(a,b)=>[[a,a],[b,a],[b,b],[a,b]];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} vs ${b}`);
test('extruded hole and nested island preserve volume and closed topology',()=>{const body=extrudeRegions([rect(0,10),rect(2,8),rect(4,6)],5);near(massProperties(body).volume,340);assert.equal(topology(body).watertight,true);});
test('multiple exterior regions preserve total volume',()=>{const body=extrudeRegions([rect(0,2),rect(4,6)],3);near(massProperties(body).volume,24);assert.equal(topology(body).watertight,true);});
test('region features rebuild through parameter and dependency caches',()=>{installRegionFeatures();const d=new DesignDocument();const profile=d.addFeature('region',{loops:[rect(0,10),rect(2,8)]});d.addFeature('extrudeRegion',{depth:5},[profile]);const evaluator=new FeatureEvaluator(),r=evaluator.evaluate(d.data);assert.deepEqual(r.errors,[]);near(massProperties(r.scene[0].value).volume,320);assert.equal(evaluator.evaluate(d.data).stats.computed,0);});
