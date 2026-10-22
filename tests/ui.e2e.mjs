import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('UI actions save real files; ambiguous/orphaned anchors; safe preview; source case remains pinned',async()=>{
  const fixture=await fixtureServer(),directory=path.resolve('output/playwright/ui-workspace-'+Date.now()),context=await launch(path.resolve('output/playwright/ui-profile-'+Date.now()));
  try {
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('UI-001');await panel.locator('#case-title').fill('Verification интерфейса');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);
    await panel.locator('#refresh-source').click();await expect(panel.locator('#source-url')).toContainText('/static');
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:25000});
    await expect(panel.locator('#details')).toBeVisible();await expect(panel.locator('.hash').first()).toHaveText(/^[a-f0-9]{64}$/u);
    await panel.getByRole('button',{name:'Open file',exact:true}).click();await expect(panel.locator('#viewer')).toBeVisible();await expect(panel.frameLocator('#viewer iframe').locator('h1')).toHaveText('Публичный тестовый материал');await panel.locator('#close-viewer').click();
    await source.evaluate(()=>{const n=document.querySelector('p').firstChild,s=n.textContent.indexOf('Иван Иванов'),r=new Range();r.setStart(n,s);r.setEnd(n,s+'Иван Иванов'.length);getSelection().removeAllRanges();getSelection().addRange(r);});
    await panel.locator('#selection-entity').click();await expect(panel.locator('#annotation-dialog')).toBeVisible();await expect(panel.locator('#reference-state')).toContainText('Live page only');
    await panel.locator('#entity-type').selectOption('person');await panel.locator('#archive-first').click();await expect(panel.locator('#reference-state')).toContainText('EVD-000002',{timeout:25000});
    await panel.locator('#annotation-note').fill('Упоминание в источнике');await panel.locator('#annotation-form button[type=submit]').click();await expect(panel.locator('#annotation-dialog')).not.toBeVisible();
    await panel.locator('[data-view=entities]').click();await expect(panel.locator('#list')).toContainText('Иван Иванов');await panel.locator('#list .item-button').click();
    await expect(panel.locator('#details-body')).toContainText('Archived');
    await panel.locator('#export-case').click();await expect(panel.locator('#status')).toContainText('Export written');
    const state=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return r.loadState(root,workspace,id);});
    const cap=Object.values(state.captures).find(c=>c.evidence_number==='EVD-000002'),ref=Object.values(state.refs)[0];expect(ref.capture_id).toBe(cap.capture_id);
    expect(await readFile(path.join(directory,cap.artifacts[0].relative_path),'utf8')).toContain('Иван Иванов');
    await source.evaluate(()=>{document.querySelector('p').textContent='Текст изменился полностью';});
    await panel.locator('#refresh-source').click();await panel.locator('[data-view=annotations]').click();await expect(panel.locator('#list')).toContainText('Text not found');
    await panel.locator('#manual-note').click();await panel.locator('#annotation-note').fill('Free note без страницы');await panel.locator('#annotation-form button[type=submit]').click();await expect(panel.locator('#list')).toContainText('Free note без страницы');
    // Original HTML cannot be mutated by annotation editing.
    const before=await readFile(path.join(directory,cap.artifacts[0].relative_path),'utf8');
    await panel.locator('#list .item-button').filter({hasText:'Free note без страницы'}).click();await panel.getByRole('button',{name:'Edit',exact:true}).click();await panel.locator('#annotation-note').fill('Изменённая заметка');await panel.locator('#annotation-form button[type=submit]').click();expect(await readFile(path.join(directory,cap.artifacts[0].relative_path),'utf8')).toBe(before);
    await expect(panel.locator('#annotation-dialog')).not.toBeVisible();
    await source.evaluate(()=>{document.querySelector('p').textContent='Генеральный директор Иван Иванов назначен на должность.';const n=document.querySelector('p').firstChild,s=n.textContent.indexOf('Иван Иванов'),r=new Range();r.setStart(n,s);r.setEnd(n,s+'Иван Иванов'.length);getSelection().removeAllRanges();getSelection().addRange(r);});
    await panel.evaluate(async()=>{const s=await import('./service.js'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});await s.selected(tab.id);});
    await source.locator('input[type=password]').fill('QA-SECRET-NOT-FOR-STORAGE');
    await panel.locator('#selection-entity').click();await expect(panel.locator('#status')).toContainText('Select page text');await expect(panel.locator('#annotation-dialog')).not.toBeVisible();
    expect(await panel.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null)))).not.toContain('QA-SECRET-NOT-FOR-STORAGE');
  }finally{await context.close();fixture.server.close();}
});
