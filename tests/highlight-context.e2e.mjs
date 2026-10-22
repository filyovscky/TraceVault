import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test(`context highlight saves without editor, optional note, point delete and undo${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(120000);const run=Date.now(),directory=path.resolve('output/playwright/highlight-workspace-'+run),context=await launch(path.resolve('output/playwright/highlight-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('HIGHLIGHT');await panel.locator('#case-title').fill('Direct context highlights');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    // This scenario drives the extension's workspace tab. Keep ONE inbox consumer:
    // a real native side panel would process the same queue in another document,
    // making this tab's status/editor assertions race even when disk saves succeed.
    // Only this disposable QA profile is configured; action invocation still grants
    // real activeTab. Native side-panel opening is outside this integration test.
    await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('EVD-000001',{timeout:30000});
    const read=()=>panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return s.exclusive(()=>r.loadState(root,w,id));});
    const capture=Object.values((await read()).captures)[0],originalPath=path.join(directory,capture.artifacts[0].relative_path),original=await readFile(originalPath),sourceText=await source.locator('body').innerText();
    async function rightClick(selector,select=false){await source.bringToFront();const rect=await source.evaluate(({selector,select})=>{const node=document.querySelector(selector),range=document.createRange();range.selectNodeContents(node);const s=getSelection();s.removeAllRanges();if(select)s.addRange(range);const r=range.getClientRects()[0];return {x:r.left+4,y:r.top+r.height/2};},{selector,select});await source.mouse.click(rect.x,rect.y,{button:'right'});await source.keyboard.press('Escape');}
    async function menu(action){const selectionText=await source.evaluate(()=>getSelection().toString());return panel.evaluate(async({action,selectionText})=>{const {handleContextMenu}=await import('./context-actions.js'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});return handleContextMenu({menuItemId:action,selectionText},tab);},{action,selectionText});}
    const highlightCount=()=>source.evaluate(()=>CSS.highlights.get('tracevault-amber')?.size || 0);
    await rightClick('p',true);const command=await menu('highlight');await expect(panel.locator('#status')).toContainText('Highlight saved',{timeout:20000});await expect(panel.locator('#annotation-dialog')).not.toBeVisible();await expect.poll(highlightCount).toBe(1);
    const a=Object.values((await read()).annotations)[0];expect(a.note).toBe('');expect(a.type).toBe('text_highlight');expect(a.selection.exact).toContain('Иван Иванов');
    await expect(source.getByRole('status')).toContainText('Highlight saved');await panel.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TV_HIDE',hidden:true}),command.tabId);await expect(source.getByRole('status')).not.toBeVisible();await panel.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TV_HIDE',hidden:false}),command.tabId);await expect.poll(highlightCount).toBe(1);
    await panel.evaluate(command=>chrome.storage.local.set({['command:'+command.id]:command}),command);await expect.poll(()=>panel.evaluate(async()=>Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith('command:')).length)).toBe(0);expect(Object.values((await read()).annotations)).toHaveLength(1);expect((await read()).audit.some(e=>e.action==='command_interrupted' && e.details.command_id===command.id)).toBe(false);
    await rightClick('p');await menu('edit-highlight');await expect(panel.locator('#annotation-dialog')).toBeVisible();await panel.locator('#annotation-note').fill('Optional note added later');await panel.locator('#annotation-form button[type=submit]').click();await expect(panel.locator('#annotation-dialog')).not.toBeVisible();expect((await read()).annotations[a.annotation_id].note).toBe('Optional note added later');expect((await read()).annotations[a.annotation_id].reference_id).toBe(a.reference_id);
    await rightClick('p');await menu('delete-highlight');await expect(panel.locator('#status')).toContainText('Highlight deleted');await expect.poll(highlightCount).toBe(0);expect((await read()).annotations[a.annotation_id].deleted).toBe(true);await expect(panel.locator('#undo-delete')).toBeVisible();
    await panel.locator('#undo-delete').click();await expect.poll(highlightCount).toBe(1);expect((await read()).annotations[a.annotation_id].deleted).toBe(false);
    await rightClick('h1');await menu('delete-highlight');await expect(panel.locator('#status')).toContainText('Right-click a visible TraceVault highlight');await expect.poll(highlightCount).toBe(1);expect((await read()).annotations[a.annotation_id].deleted).toBe(false);
    await source.evaluate(()=>{const p=document.querySelectorAll('p'),range=document.createRange();range.setStart(p[0].firstChild,0);range.setEnd(p[1].firstChild,p[1].firstChild.length);getSelection().removeAllRanges();getSelection().addRange(range);});await menu('highlight');await expect.poll(async()=>Object.keys((await read()).annotations).length,{timeout:20000,intervals:[500,1000]}).toBe(2);await expect(panel.locator('#annotation-dialog')).not.toBeVisible();await expect.poll(highlightCount).toBe(2);
    expect(await source.locator('body').innerText()).toBe(sourceText);expect(await readFile(originalPath)).toEqual(original);expect(createHash('sha256').update(await readFile(originalPath)).digest('hex')).toBe(capture.artifacts[0].sha256);
    await writeFile(path.resolve(`output/highlight-context-${installed?'installed':'cft'}.json`),JSON.stringify({directory,annotation:(await read()).annotations[a.annotation_id],capture,command_id:command.id},null,2));
  }finally{await context.close();fixture.server.close();}
});
