import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory,invokeExtension,clickAction} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
// Deliberately changes an FSA file after Chromium has read it. Playwright trace
// attachment streaming can then fail at context.close with a byte-count error.
// Keep the native writes/assertions and screenshots; omit tracing this scenario.
test.use({trace:'off'});

test('0.2 usability: real shortcut assignments, command palette, clipboard citation, filters, undo and tamper rejection',async()=>{
  test.setTimeout(120000);
  const run=Date.now(),directory=path.resolve('output/playwright/usability-workspace-'+run),context=await launch(path.resolve('output/playwright/usability-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('UX-002');await panel.locator('#case-title').fill('Удобство и целостность');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created',{timeout:30000});
    const commands=await panel.evaluate(()=>chrome.commands.getAll());
    for(const [name,key] of Object.entries({'capture-page':'Ctrl+Shift+1','capture-screen':'Ctrl+Shift+2','open-panel':'Ctrl+Shift+3','add-highlight':'Ctrl+Shift+4'}))expect(commands.find(c=>c.name===name)?.shortcut).toBe(key);
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await clickAction(panel,'#refresh-source');await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:25000});
    await source.goto(fixture.url+'/article');await clickAction(panel,'#refresh-source');await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000002',{timeout:25000});
    console.log('USABILITY two native captures: PASS');await panel.locator('#close-details').click();
    await panel.locator('#filter-options').evaluate(d=>d.open=true);await panel.locator('#current-page-only').check();await expect(panel.locator('#list .item')).toHaveCount(1);await expect(panel.locator('#list')).toContainText('EVD-000002');await panel.locator('#reset-filters').click();await expect(panel.locator('#list .item')).toHaveCount(2);
    await panel.locator('#filter-options').evaluate(n=>n.open=true);await panel.locator('#domain-filter').fill('evil.test');await expect(panel.locator('#list .item')).toHaveCount(0);await panel.locator('#domain-filter').fill('127.0.0.1');await expect(panel.locator('#list .item')).toHaveCount(2);await panel.locator('#reset-filters').click();
    await panel.locator('#list .item-button').first().click();await panel.bringToFront();await context.grantPermissions(['clipboard-read','clipboard-write']);await panel.getByRole('button',{name:'Copy citation',exact:true}).click();await expect(panel.locator('#status')).toContainText('Citation copied');
    const clip=await panel.evaluate(()=>navigator.clipboard.readText());expect(clip).toContain('/article');expect(clip).toMatch(/SHA-256: [a-f0-9]{64}/u);expect(clip).toContain('Capture ID:');
    await panel.getByRole('button',{name:'Open file',exact:true}).click();await expect(panel.locator('#viewer')).toBeVisible();await panel.keyboard.press('Escape');await expect(panel.locator('#viewer-content')).toBeEmpty();
    await source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('p'));const s=getSelection();s.removeAllRanges();s.addRange(range);});await clickAction(panel,'#selection-highlight');await expect(panel.locator('#status')).toContainText('Highlight saved');await expect(panel.locator('#annotation-dialog')).not.toBeVisible();await expect(panel.locator('#details-body')).toContainText(await source.locator('p').first().textContent());await panel.getByRole('button',{name:'Delete annotation',exact:true}).click();
    console.log('USABILITY whole-paragraph selection, filters, clipboard and viewer: PASS');
    await panel.keyboard.press('Control+Shift+Space');await expect(panel.locator('#command-dialog')).toBeVisible();await panel.locator('#command-search').fill('free note');await panel.locator('#command-search').press('ArrowDown');await panel.keyboard.press('Enter');await expect(panel.locator('#annotation-dialog')).toBeVisible();
    await panel.locator('#annotation-note').fill('Note / с клавиатуры');await panel.locator('#annotation-note').press('Control+Enter');await expect(panel.locator('#annotation-dialog')).not.toBeVisible({timeout:25000});
    await panel.locator('[data-view=annotations]').click();await panel.locator('#list .item-button').click();await panel.getByRole('button',{name:'Delete annotation',exact:true}).click();await expect(panel.locator('#list .item')).toHaveCount(0);await panel.locator('#undo-delete').click();await expect(panel.locator('#list')).toContainText('Note / с клавиатуры');
    console.log('USABILITY palette, keyboard save and restore: PASS');
    await panel.locator('[data-view=captures]').click();await panel.locator('#list .item-button').first().click();
    const capture=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,workspace,id))).captures).find(c=>c.evidence_number==='EVD-000002');});
    const target=path.join(directory,capture.artifacts[0].relative_path),original=await readFile(target);await writeFile(target,Buffer.concat([original,Buffer.from('\nTAMPERED')]));
    await panel.getByRole('button',{name:'Open file',exact:true}).click();await expect(panel.locator('#status')).toContainText('Checksum mismatch');await expect(panel.locator('#viewer')).not.toBeVisible();
    await panel.getByRole('button',{name:'Export original',exact:true}).click();await expect(panel.locator('#status')).toContainText('Checksum mismatch');
    expect(await readdir(path.join(directory,'cases',capture.case_id))).not.toContain('exports');
    console.log('USABILITY tamper blocked: PASS');
    await panel.locator('#close-details').click();await clickAction(panel,'#refresh-source');await panel.setViewportSize({width:360,height:1000});await clickAction(panel,'#command-menu');await panel.locator('#command-search').fill('');await panel.screenshot({path:path.resolve('output/playwright/0.2-command-palette.png')});await panel.keyboard.press('Escape');await panel.locator('header strong').click();await panel.keyboard.press('/');await expect(panel.locator('#search')).toBeFocused();
    console.log('USABILITY screenshot and search focus: PASS');
  }catch(error){console.error('USABILITY FAILURE',error);throw error;}finally{await context.close();fixture.server.close();}
});

test('0.2 multi-document: active case stays synchronized and stale refresh cannot switch it back',async()=>{
  const run=Date.now(),context=await launch(path.resolve('output/playwright/sync-profile-'+run));
  try{
    const first=await extensionPage(context);await chooseDirectory(first,path.resolve('output/playwright/sync-workspace-'+run));await first.locator('#case-code').fill('FIRST');await first.locator('#case-title').fill('Первое дело');await first.locator('#case-form button[type=submit]').click();await expect(first.locator('#status')).toHaveText('Case created',{timeout:30000});const a=await first.locator('#case-select').inputValue();
    const second=await extensionPage(context);await expect(second.locator('#case-select')).toHaveValue(a);
    await clickAction(first,'#new-case');await first.locator('#case-code').fill('SECOND');await first.locator('#case-title').fill('Второе дело');await first.locator('#case-form button[type=submit]').click();await expect(first.locator('#case-select')).not.toHaveValue(a);const b=await first.locator('#case-select').inputValue();await expect(second.locator('#case-select')).toHaveValue(b);
    await second.locator('#case-select').selectOption(a);await expect(first.locator('#case-select')).toHaveValue(a);await clickAction(first,'#refresh-source');await clickAction(second,'#refresh-source');
    expect(await second.evaluate(async()=>(await chrome.storage.local.get('activeCase')).activeCase)).toBe(a);
  }finally{await context.close();}
});
