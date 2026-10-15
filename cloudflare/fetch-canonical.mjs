import{mkdirSync,existsSync}from'node:fs';
import{resolve}from'node:path';import{execFileSync}from'node:child_process';

// Build-time input only. No GitHub calls are added to the deployed website.
export async function fetchCanonical(root,repository,expectedRevision){
 if(!/^pierce403\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[a-f0-9]{40}$/.test(expectedRevision))throw Error('Invalid canonical build identity');
 const directory=resolve(root,'tmp/cloudflare-canonical');mkdirSync(resolve(root,'tmp'),{recursive:true});
 const environment={...process.env,GIT_TERMINAL_PROMPT:'0'};
 const git=(args)=>execFileSync('git',args,{cwd:directory,env:environment,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
 const url='https://github.com/'+repository+'.git';
 if(!existsSync(resolve(directory,'.git'))){
  if(existsSync(directory))throw Error('Canonical cache exists without Git metadata');
  execFileSync('git',['clone','--filter=blob:none','--depth','1','--single-branch','--branch','codex/cloudflare-static',url,directory],{env:environment,timeout:120000,stdio:'inherit'});
 }
 if(git(['remote','get-url','origin'])!==url||git(['status','--porcelain']))throw Error('Canonical build cache is not the expected clean repository');
 const deadline=Date.now()+18*60*1000;
 while(Date.now()<deadline){
  let revision,receipt;
  try{
   git(['fetch','--depth','1','origin','codex/cloudflare-static']);revision=git(['rev-parse','FETCH_HEAD']);
   receipt=JSON.parse(git(['show',revision+':.well-known/cloudflare-publication.json']));
  }catch{console.log('Canonical public artifact is not available yet.');}
  if(receipt&&!receipt.bootstrapOnly&&receipt.repository===repository&&receipt.branch==='codex/cloudflare-static'&&
     [receipt.sourceRevision,receipt.triggerRevision].includes(expectedRevision)){
   git(['checkout','--detach',revision]);
   console.log(JSON.stringify({canonicalPublicationCommit:revision,sourceRevision:receipt.sourceRevision,triggerRevision:receipt.triggerRevision,workflowRun:receipt.runId}));
   return {source:resolve(directory,'public'),publicationRevision:revision};
  }
  console.log('Waiting for the canonical validation of source '+expectedRevision+'.');
  await new Promise(resolve=>setTimeout(resolve,20000));
 }
 throw Error('Canonical validation did not publish this source revision before the native build deadline; existing production is retained.');
}
