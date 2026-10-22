import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
test('public safe sites: three independent standalone HTML files',async()=>{
  test.setTimeout(120000);
  const run=Date.now(),directory=path.resolve('output/playwright/public-workspace-'+run),context=await launch(path.resolve('output/playwright/public-profile-'+run));
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('PUBLIC-QA');await panel.locator('#case-title').fill('Публичные безопасные тестовые фиксации');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const source=await context.newPage(),records=[];
    for(const url of ['https://example.com/','https://example.org/','https://example.net/']){
      await source.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);
      const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),caseId=await s.setting('activeCase'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});return svc.capture({root,workspace,caseId,tabId:tab.id});});
      expect(record.state).toBe('completed');expect(await readFile(path.join(directory,record.artifacts[0].relative_path),'utf8')).toContain('Example Domain');records.push(record);
    }
    await writeFile(path.resolve('output/playwright/public-captures.json'),JSON.stringify({directory,records},null,2));console.log('PUBLIC CAPTURES',directory);
  }finally{await context.close();}
});
