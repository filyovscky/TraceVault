import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
test('FSA retry recovers an empty new file, caps attempts and never rewrites nonempty or existing files',async()=>{
  const run=Date.now(),directory=path.resolve('output/playwright/storage-boundaries-workspace-'+run),context=await launch(path.resolve('output/playwright/storage-boundaries-profile-'+run));
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);
    const result=await panel.evaluate(async()=>{
      const s=await import('./storage.js'),root=await s.setting('root'),original=FileSystemFileHandle.prototype.createWritable,attempts={},errors={};
      FileSystemFileHandle.prototype.createWritable=async function(options){
        const name=this.name;attempts[name]=(attempts[name] || 0)+1;
        if(name==='quota.json')throw new DOMException('Injected quota failure','QuotaExceededError');
        const stream=await original.call(this,options),close=stream.close.bind(stream),abort=stream.abort.bind(stream);
        if(name==='retry.json' && attempts[name]<3 || name==='always.json')stream.close=async()=>{await abort();throw new DOMException('Injected empty close failure','InvalidStateError');};
        if(name==='nonempty.json')stream.close=async()=>{await close();throw new DOMException('Injected error after real commit','InvalidStateError');};
        return stream;
      };
      try{
        const artifact=await s.writeNew(root,'retry.json','verified retry');
        for(const name of ['quota.json','always.json','nonempty.json'])try{await s.writeNew(root,name,'preserved contents');}catch(e){errors[name]=e.name;}
        try{await s.writeNew(root,'nonempty.json','MUST NOT REPLACE');}catch(e){errors.existing=e.message;}
        const denied=new Proxy(root,{get:(target,key)=>key==='queryPermission'?async()=>'denied':typeof target[key]==='function'?target[key].bind(target):target[key]});
        try{await s.writeNew(denied,'denied.json','MUST NOT WRITE');}catch(e){errors.denied=e.name;}
        return {artifact,attempts,errors};
      }finally{FileSystemFileHandle.prototype.createWritable=original;}
    });
    expect(result.attempts).toEqual({'retry.json':3,'quota.json':1,'always.json':3,'nonempty.json':1});expect(result.errors).toMatchObject({'quota.json':'QuotaExceededError','always.json':'InvalidStateError','nonempty.json':'InvalidStateError',denied:'NotAllowedError'});expect(result.errors.existing).toContain('перезапись запрещена');
    const retry=await readFile(path.join(directory,'retry.json'));expect(retry.toString()).toBe('verified retry');expect(createHash('sha256').update(retry).digest('hex')).toBe(result.artifact.sha256);expect(await readFile(path.join(directory,'nonempty.json'),'utf8')).toBe('preserved contents');await expect(readFile(path.join(directory,'denied.json'))).rejects.toThrow();
  }finally{await context.close();}
});
