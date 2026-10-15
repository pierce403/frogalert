import {readdir,readFile,lstat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const configuration=JSON.parse(await readFile(resolve(root,'cloudflare/site-config.json'),'utf8'));
const artifact=resolve(process.argv[2]||'');
if(!process.argv[2]||artifact===root||!artifact.startsWith(root+'/'))throw Error('Explicit repository-local public artifact required');
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sourceRevision))throw Error('Invalid source revision');
const files=[];
async function inventory(directory){
 for(const name of (await readdir(directory)).sort()){
  const path=resolve(directory,name);const item=await lstat(path);
  if(item.isSymbolicLink())throw Error('Public artifacts must not contain symlinks');
  if(item.isDirectory())await inventory(path);
  else if(item.isFile()){
   const publicPath=relative(artifact,path).replaceAll('\\','/');
   if(publicPath.split('/').some(part=>['..','.git'].includes(part)))throw Error('Unsafe artifact path');
   if(item.size>25*1024*1024)throw Error('Large asset requires the separate streaming contract: '+publicPath);
   const bytes=await readFile(path);files.push({path:publicPath,bytes,sha256:createHash('sha256').update(bytes).digest('hex')});
  }else throw Error('Unsupported artifact entry');
 }
}
await inventory(artifact);
for(const required of configuration.requiredFiles)if(!files.some(file=>file.path===required))throw Error('Required public artifact missing: '+required);
if(!files.length||files.length>5000)throw Error('Unexpected public artifact inventory');
const receipt={repository:configuration.repository,sourceRevision,branch:configuration.branch,
 workflow:process.env.GITHUB_WORKFLOW_REF||null,runId:process.env.GITHUB_RUN_ID||null,
 runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
 files:files.map(({path,bytes,sha256})=>({path,bytes:bytes.length,sha256}))};
if(process.argv.includes('--validate-only')){console.log(JSON.stringify({repository:configuration.repository,files:files.length,sourceRevision,validated:true}));process.exit(0);}
if(process.env.GITHUB_REPOSITORY!==configuration.repository||!process.env.GH_TOKEN)throw Error('Publishing requires the repository CI token');
const [owner,repo]=configuration.repository.split('/');
async function api(path,method='GET',data){
 const response=await fetch('https://api.github.com/repos/'+owner+'/'+repo+'/'+path,{method,
  headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},
  ...(data?{body:JSON.stringify(data)}:{})});
 if(!response.ok){const error=new Error('GitHub publication request failed: '+method+' '+path+' '+response.status);error.status=response.status;throw error;}
 return response.json();
}
async function currentSource(){if((await api('git/ref/heads/main')).object.sha!==sourceRevision)throw Error('Source main moved; refusing stale artifact publication');}
await currentSource();
let parent=null;
try{parent=(await api('git/ref/heads/'+configuration.branch)).object.sha;}catch(error){if(error.status!==404)throw error;}
if(parent){
 const previous=await api('contents/.well-known/cloudflare-publication.json?ref='+encodeURIComponent(configuration.branch));
 const owned=JSON.parse(Buffer.from(previous.content,'base64').toString('utf8'));
 if(owned.repository!==configuration.repository||owned.branch!==configuration.branch)throw Error('Publishing branch ownership marker mismatch');
}
const tree=[];
async function blob(path,bytes){const result=await api('git/blobs','POST',{encoding:'base64',content:bytes.toString('base64')});tree.push({path,mode:'100644',type:'blob',sha:result.sha});}
for(const file of files)await blob('public/'+file.path,file.bytes);
const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
await blob('public/.well-known/cloudflare-source.json',receiptBytes);
await blob('.well-known/cloudflare-publication.json',receiptBytes);
for(const path of ['cloudflare/package.json','cloudflare/package-lock.json','cloudflare/build-site.mjs','wrangler.jsonc'])await blob(path,await readFile(resolve(root,path)));
await blob('AGENTS.md',Buffer.from('# Generated static publication branch\n\nThis branch contains validated public output only. Edit source on main. Native\nCloudflare Git builds own deployment; credentials remain in Cloudflare. Never\nreplace source history or add private files, credentials, or runtime data here.\n'));
const result=await api('git/trees','POST',{tree});
if(parent&&(await api('git/commits/'+parent)).tree.sha===result.sha){console.log('Validated public output is already published.');process.exit(0);}
const commit=await api('git/commits','POST',{message:'Publish validated static output for '+sourceRevision,tree:result.sha,parents:parent?[parent]:[]});
await currentSource();
if(parent)await api('git/refs/heads/'+configuration.branch,'PATCH',{sha:commit.sha,force:false});
else await api('git/refs','POST',{ref:'refs/heads/'+configuration.branch,sha:commit.sha});
console.log(JSON.stringify({repository:configuration.repository,sourceRevision,publicationCommit:commit.sha,files:files.length}));
