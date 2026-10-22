import {test,expect} from '@playwright/test';
import {cp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
test('persistent domain access: registered content script restores highlights after navigation and browser restart',async()=>{
  const run=Date.now(),fixture=await fixtureServer(),profile=path.resolve('output/playwright/reattach-profile-'+run),extensionRoot=path.resolve('output/playwright/reattach-extension-'+run);
  await cp('extension',extensionRoot,{recursive:true});const manifest=JSON.parse(await readFile(path.join(extensionRoot,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];await writeFile(path.join(extensionRoot,'manifest.json'),JSON.stringify(manifest));
  // Dedicated QA packaging grants one loopback origin on installation. All JS is
  // byte-identical to production. This tests granted-access behavior, not the prompt.
  let context=await launch(profile,{extensionRoot});
  try{
    let panel=await extensionPage(context);await chooseDirectory(panel,path.resolve('output/playwright/reattach-workspace-'+run));await panel.locator('#case-code').fill('ANCHOR');await panel.locator('#case-title').fill('Anchor status аннотаций');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    let source=await context.newPage();await source.goto(fixture.url+'/static');
    await source.evaluate(()=>{const n=document.querySelector('p').firstChild,s=n.textContent.indexOf('Иван Иванов'),r=new Range();r.setStart(n,s);r.setEnd(n,s+'Иван Иванов'.length);getSelection().removeAllRanges();getSelection().addRange(r);});
    const annotationId=await panel.evaluate(async()=>{const s=await import('./storage.js'),svc=await import('./service.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),caseId=await s.setting('activeCase'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true}),{selection}=await svc.selected(tab.id),a=await svc.saveAnnotation({root,workspace,caseId,tabId:tab.id,selection});await svc.registerAnnotationSites(['http://127.0.0.1/*']);await svc.broadcastAnnotations(caseId,await r.loadState(root,workspace,caseId),true);return a.annotation_id;});
    const highlight=()=>source.evaluate(()=>CSS.highlights.get('tracevault-amber')?.size || 0);
    await expect.poll(highlight).toBe(1);await source.reload();await expect.poll(highlight).toBe(1);
    await panel.locator('#settings-toggle').click();await panel.locator('#site-annotations').click();await expect.poll(highlight).toBe(0);await source.reload();await expect.poll(highlight).toBe(0);await panel.locator('#site-annotations').click();await expect.poll(highlight).toBe(1);
    await context.close();context=await launch(profile,{extensionRoot});panel=await extensionPage(context);await expect(panel.locator('#case-select')).toContainText('ANCHOR');source=await context.newPage();await source.goto(fixture.url+'/static');await expect.poll(highlight).toBe(1);
    await source.evaluate(()=>{document.body.innerHTML='<p>name name</p>';});
    const tabId=await panel.evaluate(async()=>(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
    const result=await panel.evaluate(async({tabId,annotationId})=>chrome.tabs.sendMessage(tabId,{type:'TV_RENDER',annotations:[{annotation_id:annotationId,selection:{exact:'name',prefix:'',suffix:''},appearance:{color_token:'amber'}}],enabled:true}),{tabId,annotationId});expect(result.statuses[annotationId]).toBe('ambiguous');expect(await highlight()).toBe(0);
  }finally{await context.close();fixture.server.close();}
});
