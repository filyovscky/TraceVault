import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
test('failure boundaries: size, cancellation, denied adapter, duplicates, case switch and corrupted journal',async()=>{
  const run=Date.now(),directory=path.resolve('output/playwright/failure-workspace-'+run),context=await launch(path.resolve('output/playwright/failure-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('FAIL-001');await panel.locator('#case-title').fill('Ошибки и конкурентность');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const source=await context.newPage();await source.goto(fixture.url+'/slow');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);
    const result=await panel.evaluate(async()=>{
      const s=await import('./storage.js'),r=await import('./repository.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),caseId=await s.setting('activeCase'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
      const args={root,workspace,caseId,tabId:tab.id},errors={};
      try{await svc.capture({...args,settings:{maxBytes:200}});}catch(e){errors.size=e.message;}
      const controller=new AbortController();controller.abort();try{await svc.capture({...args,signal:controller.signal});}catch(e){errors.cancel=e.name;}
      // Fault injection at storage boundary, not a claim of browser permission UI QA.
      const denied=new Proxy(root,{get:(target,key)=>key==='queryPermission'?async()=> 'denied':typeof target[key]==='function'?target[key].bind(target):target[key]});
      try{await s.writeNew(denied,'denied.txt','Must not be written');}catch(e){errors.denied=e.name;}
      const nextCase=await s.exclusive(()=>r.createCase(root,workspace,'Второе дело','FAIL-002')),id=crypto.randomUUID();
      const promise=svc.capture({...args,id});
      await s.setting('activeCase',nextCase.case_id);await chrome.storage.local.set({activeCase:nextCase.case_id});
      const cap=await promise,duplicate=await svc.capture({...args,id}),version=await svc.capture({...args});
      const state=await r.loadState(root,workspace,caseId);
      const other=await r.loadState(root,workspace,nextCase.case_id);
      // Real, invalid JSON on disk must block replay.
      const file=await s.fileHandle(root,r.casePath(workspace,caseId)+'events/'+crypto.randomUUID()+'.json',true),writer=await file.createWritable();await writer.write('{bad json');await writer.close();
      try{await r.loadState(root,workspace,caseId);}catch(e){errors.journal=e.message;}
      return {errors,cap,duplicate,version,states:Object.values(state.captures).map(c=>c.state),otherCount:Object.keys(other.captures).length};
    });
    expect(result.errors.size).toContain('limit');expect(result.errors.cancel).toBe('AbortError');expect(result.errors.denied).toBe('NotAllowedError');expect(result.errors.journal).toContain('Damaged journal');
    expect(result.states).toEqual(['failed','cancelled','completed','completed']);expect(result.cap.capture_id).toBe(result.duplicate.capture_id);expect(result.cap.case_id).toBe(result.version.case_id);expect(result.version.previous_capture_id).toBe(result.cap.capture_id);expect(result.otherCount).toBe(0);
    expect(await readdir(directory)).not.toContain('denied.txt');
  }finally{await context.close();fixture.server.close();}
});

test('single-case folder mode survives reconnect and refuses a second case',async()=>{
  const run=Date.now(),directory=path.resolve('output/playwright/single-workspace-'+run),context=await launch(path.resolve('output/playwright/single-profile-'+run));
  try{
    const panel=await extensionPage(context);await panel.locator('#workspace-mode').selectOption('single_case');await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('SINGLE');await panel.locator('#case-title').fill('Одна папка');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    expect(await readdir(directory)).toContain('case.json');expect(await readdir(directory)).not.toContain('cases');await panel.reload();await expect(panel.locator('#case-select')).toContainText('SINGLE');
    await panel.locator('#new-case').click();await panel.locator('#case-code').fill('EXTRA');await panel.locator('#case-title').fill('Недопустимое дело');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toContainText('only one case');
  }finally{await context.close();}
});
