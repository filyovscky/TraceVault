import {test,expect} from '@playwright/test';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
test('native FSA sequential creation writes 200 verified files without an empty file',async()=>{
  test.setTimeout(120000);const run=Date.now(),context=await launch(path.resolve('output/playwright/storage-stress-profile-'+run));
  try{
    const panel=await extensionPage(context);panel.on('console',msg=>{if(msg.type()==='error')console.log(msg.text());});await chooseDirectory(panel,path.resolve('output/playwright/storage-stress-workspace-'+run));
    const result=await panel.evaluate(async()=>{const s=await import('./storage.js'),root=await s.setting('root'),failures=[];for(let i=0;i<200;i++){try{await s.writeNew(root,`stress/${i}.json`,{index:i,payload:'tracevault'.repeat(200)});}catch(e){failures.push({index:i,name:e.name,message:e.message,stack:e.stack});}}return failures;});console.log('FSA STRESS',result);expect(result).toEqual([]);
  }finally{await context.close();}
});
