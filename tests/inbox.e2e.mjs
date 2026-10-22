import {test,expect} from '@playwright/test';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
test('persistent command inbox drains new arrivals, deduplicates deliveries and diagnoses pre-capture interruption',async()=>{
  const run=Date.now(),context=await launch(path.resolve('output/playwright/inbox-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,path.resolve('output/playwright/inbox-workspace-'+run));await panel.locator('#case-code').fill('QUEUE');await panel.locator('#case-title').fill('Очередь команд');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Дело создано');
    const source=await context.newPage();await source.goto(fixture.url+'/slow');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);
    const command=await panel.evaluate(async()=>{const s=await import('./storage.js'),caseId=await s.setting('activeCase'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});return {id:crypto.randomUUID(),action:'page',tabId:tab.id,caseId,sourceUrl:tab.url,created_at:new Date().toISOString()};});
    const read=()=>panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return s.exclusive(()=>r.loadState(root,workspace,id));});
    await panel.evaluate(command=>chrome.storage.local.set({['command:'+command.id]:command}),command);
    // The second command arrives while the first resource fetch is still in flight.
    const next={...command,id:crypto.randomUUID(),created_at:new Date(Date.now()+1).toISOString()};
    await panel.evaluate(command=>chrome.storage.local.set({['command:'+command.id]:command}),next);
    await expect.poll(async()=>Object.values((await read()).captures).filter(c=>c.state==='completed').length,{timeout:30000}).toBe(2);
    await panel.evaluate(command=>chrome.storage.local.set({['command:'+command.id]:command}),command);
    await expect.poll(()=>panel.evaluate(async()=>Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith('command:')).length)).toBe(0);
    expect(Object.keys((await read()).captures).length).toBe(2);
    const stale={...command,id:crypto.randomUUID()};
    await panel.evaluate(async cmd=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');await s.exclusive(()=>r.append(root,workspace,cmd.caseId,'command_received',null,null,{command_id:cmd.id,session:'prior-session'}));await chrome.storage.local.set({['command:'+cmd.id]:cmd});},stale);
    await expect.poll(async()=>(await read()).audit.some(e=>e.action==='command_interrupted' && e.details.command_id===stale.id),{timeout:10000}).toBe(true);expect(Object.keys((await read()).captures).length).toBe(2);
  }finally{await context.close();fixture.server.close();}
});
