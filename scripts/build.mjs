import fs from 'node:fs/promises';import path from 'node:path';
const out=path.resolve('_site');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','app','packages','docs','LICENSE','README.md'])await fs.cp(name,path.join(out,name),{recursive:true});
await fs.writeFile(path.join(out,'.nojekyll'),'');await fs.writeFile(path.join(out,'build-info.json'),JSON.stringify({name:'Formalyth',version:'0.6.0',commit:process.env.GITHUB_SHA||'local-uncommitted',builtAt:new Date().toISOString(),experimental:true},null,2));console.log('Static site ready in _site/');
