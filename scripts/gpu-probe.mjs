/** Small isolated software-driver probe, followed by the real application. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {inflateSync} from 'node:zlib';
import {serve} from './serve.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const common=['--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=800,600'];
const configs=[
 {name:'swiftshader-software-compositor',args:['--headless=new','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-compositing']},
 {name:'swiftshader-no-raster',args:['--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--disable-gpu-rasterization']},
 {name:'graphite-swiftshader',args:['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-features=SkiaGraphite','--skia-graphite-backend=dawn-vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader']},
 {name:'swiftshader-vulkan-headed',args:['--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']},
 {name:'mesa-vulkan-headed',mesa:true,args:['--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=native','--disable-vulkan-surface']},
 {name:'mesa-gl-vulkan',mesa:true,args:['--headless=new','--use-gl=angle','--use-angle=gl','--enable-features=Vulkan','--use-vulkan=native','--disable-vulkan-surface']},
 {name:'graphite-mesa',mesa:true,args:['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-features=SkiaGraphite','--skia-graphite-backend=dawn-vulkan','--use-vulkan=native']},
 {name:'swiftshader-gl-basic',args:['--headless=new','--use-gl=angle','--use-angle=swiftshader']}
];
function pixel(png,x,y){
 let p=8,w,h,type,idats=[];
 while(p<png.length){const n=png.readUInt32BE(p),kind=png.toString('ascii',p+4,p+8),data=png.subarray(p+8,p+8+n);if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);type=data[9];if(data[8]!==8||data[12]!==0)throw Error('Unsupported PNG');}if(kind==='IDAT')idats.push(data);p+=n+12;}
 const bpp=type===6?4:type===2?3:0;if(!bpp||x>=w||y>=h)throw Error('Unsupported PNG color or coordinate');
 const raw=inflateSync(Buffer.concat(idats)),stride=w*bpp;let prev=Buffer.alloc(stride),off=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let row=0;row<=y;row++){const filter=raw[off++],now=Buffer.from(raw.subarray(off,off+stride));off+=stride;for(let i=0;i<stride;i++){const a=i>=bpp?now[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;now[i]=(now[i]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}prev=now;}
 return [...prev.subarray(x*bpp,x*bpp+3)];
}
const html=`<!doctype html><style>html,body{margin:0;background:white}canvas{display:inline-block;width:128px;height:128px}</style><canvas id="gpu" width="128" height="128"></canvas><canvas id="gl" width="128" height="128"></canvas>`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
await fs.mkdir('reports',{recursive:true});const icd=(await fs.readdir('/usr/share/vulkan/icd.d').catch(()=>[])).find(n=>n.startsWith('lvp_icd'));
const appServer=await serve({port:0});const appURL=`http://127.0.0.1:${appServer.address().port}/`;
const results=[];
for(const config of configs){
 let child,ws,log='',result={name:config.name,args:config.args,mesa:!!config.mesa};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formalyth-gpu-'));
 try{
  const env={...process.env};if(config.mesa&&icd){env.VK_ICD_FILENAMES=env.VK_DRIVER_FILES='/usr/share/vulkan/icd.d/'+icd;env.LIBGL_ALWAYS_SOFTWARE='1';}
  child=spawn('/usr/bin/google-chrome',[...common,...config.args,'--remote-debugging-port=0',`--user-data-dir=${dir}`,'about:blank'],{env,stdio:['ignore','ignore','pipe']});child.stderr.on('data',d=>log=(log+d).slice(-20000));
  let port;for(let i=0;i<100&&!port;i++){try{port=Number((await fs.readFile(path.join(dir,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}if(!port)await delay(100);}if(!port)throw Error('No debugging endpoint');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=event=>{const msg=JSON.parse(event.data),p=pending.get(msg.id);if(p){clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url});await delay(700);
  result.browser=await evaluate(`(async()=>{
   const result={errors:[],agent:navigator.userAgent};const canvas=document.querySelector('#gpu');if(!canvas)throw Error('Probe page unavailable');
   const adapter=await navigator.gpu?.requestAdapter();if(!adapter)return {error:'No WebGPU adapter'};
   result.adapter={vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,description:adapter.info?.description};
   const device=await adapter.requestDevice();window.probeDevice=device;device.addEventListener('uncapturederror',e=>result.errors.push(e.error.message));device.lost.then(x=>result.errors.push('Lost: '+x.message));
   const context=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();result.format=format;
   context.configure({device,format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
   const texture=context.getCurrentTexture(),encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:texture.createView(),loadOp:'clear',storeOp:'store',clearValue:[1,0,0,1]}]});pass.end();
   const buffer=device.createBuffer({size:512*128,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:512},{width:128,height:128});device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);result.gpuPixel=[...new Uint8Array(buffer.getMappedRange()).slice(0,4)];buffer.unmap();buffer.destroy();
   const gl=document.querySelector('#gl').getContext('webgl2',{preserveDrawingBuffer:true});result.glAvailable=!!gl;if(gl){gl.clearColor(0,1,0,1);gl.clear(gl.COLOR_BUFFER_BIT);const p=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);result.glPixel=[...p];result.glError=gl.getError();const ext=gl.getExtension('WEBGL_debug_renderer_info');result.glRenderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}
   await new Promise(r=>setTimeout(r,500));window.probeResult=result;return result;
  })()`);
  const png=Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');await fs.writeFile(`reports/gpu-${config.name}.png`,png);result.screenshotGPU=pixel(png,50,50);result.screenshotGL=pixel(png,180,50);
  const r=result.browser,p=r.gpuPixel;result.passed=!!p&&p[3]===255&&(r.format==='bgra8unorm'?p[2]===255:p[0]===255)&&r.glPixel?.[1]===255&&result.screenshotGPU[0]>240&&result.screenshotGPU[1]<15&&result.screenshotGL[1]>240&&!r.errors.length;
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:appURL});let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=await evaluate('!!window.formalyth?.ready');}catch{}if(!ready)await delay(100);}
  result.app=await evaluate(`(async()=>{const f=window.formalyth;if(!f)return {error:document.body.innerText.slice(0,600)};try{f.renderer.draw();await f.renderer.device?.queue.onSubmittedWorkDone();}catch(e){f.graphicsErrors.push(e.message);}return {backend:f.renderer.backend,ready:f.renderer.ready,graphicsErrors:f.graphicsErrors,scene:f.workbench.scene.length,items:f.renderer.items.size};})()`);
  await fs.writeFile(`reports/app-${config.name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  result.passed=result.passed&&result.app.backend==='WebGPU'&&result.app.ready&&result.app.items>0&&!result.app.graphicsErrors.length;
 }catch(error){result.error=error.stack;result.passed=false;}
 finally{ws?.close();child?.kill('SIGKILL');await delay(100);await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});await fs.writeFile(`reports/gpu-${config.name}.log`,log);results.push(result);console.log(JSON.stringify(result));await fs.writeFile('reports/gpu-probe.json',JSON.stringify(results,null,2));}
 if(result.passed){await fs.writeFile('reports/gpu-config.json',JSON.stringify(config,null,2));break;}
}
server.closeAllConnections();await new Promise(r=>server.close(r));appServer.closeAllConnections();await new Promise(r=>appServer.close(r));if(!results.some(r=>r.passed))process.exitCode=1;
