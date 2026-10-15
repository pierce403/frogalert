import{readFileSync,readdirSync,existsSync,cpSync,mkdirSync,rmSync,writeFileSync,appendFileSync}from'node:fs';
import{resolve}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const root=resolve(import.meta.dirname,'..'),source=resolve(root,'public'),output=resolve(root,'dist');
const receiptPath=resolve(source,'.well-known/cloudflare-source.json');
if(!existsSync(receiptPath))throw Error('Select the validated codex/cloudflare-static production branch; source main is not a deployable artifact.');
const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
const expectedRepository="pierce403/frogalert";
if(receipt.repository!==expectedRepository||receipt.branch!=='codex/cloudflare-static'||!/^[a-f0-9]{40}$/.test(receipt.sourceRevision))throw Error('Publication identity mismatch');
for(const file of receipt.files){const bytes=readFileSync(resolve(source,file.path));if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Public artifact integrity mismatch: '+file.path);}
rmSync(output,{recursive:true,force:true});cpSync(source,output,{recursive:true});
const revision=process.env.CF_COMMIT_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid publication revision');
mkdirSync(resolve(output,'.well-known'),{recursive:true});
writeFileSync(resolve(output,'.well-known/cloudflare-build.json'),JSON.stringify({repository:expectedRepository,revision,sourceRevision:receipt.sourceRevision},null,2)+'\n');
if(!existsSync(resolve(output,'404.html')))writeFileSync(resolve(output,'404.html'),'<!doctype html><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><a href="/">Return home</a>\n');
appendFileSync(resolve(output,'_headers'),'\n/*\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n/.well-known/cloudflare-build.json\n  Cache-Control: no-store\n/.well-known/cloudflare-assets.json\n  Cache-Control: no-store\n');
const files=[];function inventory(directory,prefix=''){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())inventory(resolve(directory,entry.name),path+'/');else if(!['_headers','404.html','.well-known/cloudflare-build.json','.well-known/cloudflare-assets.json'].includes(path)){const bytes=readFileSync(resolve(directory,entry.name));files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
inventory(output);writeFileSync(resolve(output,'.well-known/cloudflare-assets.json'),JSON.stringify({repository:expectedRepository,revision,sourceRevision:receipt.sourceRevision,files},null,2)+'\n');
console.log(JSON.stringify({revision,sourceRevision:receipt.sourceRevision,files:files.length}));
