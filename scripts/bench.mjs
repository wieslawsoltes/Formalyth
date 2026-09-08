import {workbenchBench} from './workbench-bench.mjs';
import {roundedEnclosureProject} from '../packages/workbench/examples.js';
import fs from 'node:fs/promises';import os from 'node:os';
import {Engine} from '../packages/tasks/engine.js';
import {DesignDocument} from '../packages/document/index.js';
import {bearingProject} from '../packages/workbench/index.js';
const runs=[];
function sample(name,fn,count=5){const ms=[];let result;for(let i=0;i<count;i++){const start=performance.now();result=fn();ms.push(performance.now()-start);}const sorted=[...ms].sort((a,b)=>a-b);runs.push({name,milliseconds:ms,median:sorted[Math.floor(sorted.length/2)]});return result;}
const data=bearingProject().data.model,engine=new Engine();
sample('bearing-cold-build',()=>new Engine().evaluate({document:data}),3);
engine.evaluate({document:data});const warm=sample('bearing-unchanged-build',()=>engine.evaluate({document:data}));
if(warm.changes.length||warm.stats.computed)throw new Error('Warm build unexpectedly recomputed geometry');
const document=new DesignDocument();for(let i=0;i<200;i++)document.addFeature('box',{width:10,depth:10,height:10});
const many=new Engine();sample('200-boxes-cold',()=>new Engine().evaluate({document:document.data}),3);many.evaluate({document:document.data});const delta=sample('200-boxes-unchanged',()=>many.evaluate({document:document.data}));
const enclosure=roundedEnclosureProject().data.model,enclosureEngine=new Engine();sample('rounded-enclosure-cold',()=>new Engine().evaluate({document:enclosure}),3);enclosureEngine.evaluate({document:enclosure});const enclosureWarm=sample('rounded-enclosure-unchanged',()=>enclosureEngine.evaluate({document:enclosure}));if(enclosureWarm.errors.length||enclosureWarm.changes.length||enclosureWarm.stats.computed)throw new Error('Enclosure regression');
const workbench=workbenchBench(sample);
const report={workbench,node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,runs,cache:{bearing:{computed:warm.stats.computed,reused:warm.stats.reused,transferredOutputs:warm.changes.length},many:{computed:delta.stats.computed,reused:delta.stats.reused,transferredOutputs:delta.changes.length}},note:'CPU execution samples, not interactive FPS or hardware-GPU benchmarks.'};
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
