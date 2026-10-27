import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory,clickAction} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test('Focus: real case, menu actions, capture, collections and responsive layout'+(installed?' — installed Chrome':''),async()=>{
  test.setTimeout(180000);const run=Date.now(),directory=path.resolve('output/playwright/focus-workspace-'+run),context=await launch(path.resolve('output/playwright/focus-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context),errors=[];panel.on('pageerror',e=>errors.push(e.message));await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));await panel.setViewportSize({width:360,height:900});
    await chooseDirectory(panel,directory,{timeout:30000});await panel.locator('#case-title').fill('Domain research');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});await expect(panel.locator('#case-select')).toContainText('Domain research');
    await expect(panel.locator('nav .button-text')).toHaveText(['Materials','Highlights','History']);await expect(panel.locator('#capture-page .button-text')).toHaveText('Save page');await expect(panel.locator('#selection-highlight')).not.toBeVisible();
    await panel.locator('#more-actions').click();await expect(panel.locator('#case-actions')).toBeVisible();await panel.locator('#new-case').focus();await panel.keyboard.press('Escape');await expect(panel.locator('#case-actions')).not.toBeVisible();await expect(panel.locator('#more-actions')).toBeFocused();
    await panel.locator('#more-actions').click();await panel.locator('.brand').click();await expect(panel.locator('#case-actions')).not.toBeVisible();
    await clickAction(panel,'[data-view=entities]');await expect(panel.locator('#collection-title')).toHaveText('Entities');await expect(panel.locator('#list')).toContainText('No entities yet');await expect(panel.locator('#case-actions')).not.toBeVisible();
    await panel.locator('nav [data-view=captures]').click();
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url(),{timeout:30000});
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});await expect(panel.locator('#details')).toBeVisible();await expect(panel.locator('.collection-body')).not.toBeVisible();
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});
    const original=await readFile(path.join(directory,record.artifacts[0].relative_path));expect(createHash('sha256').update(original).digest('hex')).toBe(record.artifacts[0].sha256);
    await panel.keyboard.press('/');await expect(panel.locator('#search')).toBeFocused();await expect(panel.locator('#details')).not.toBeVisible();await panel.locator('#list .item-button').first().click();await expect(panel.locator('#details')).toBeVisible();
    await panel.locator('nav [data-view=captures]').click();await expect(panel.locator('.collection-body')).toBeVisible();await expect(panel.locator('nav [data-view=captures] .view-count')).toHaveText('1');
    await clickAction(panel,'#capture-screen');await expect(panel.locator('#status')).toContainText('Saved · EVD-000002',{timeout:30000});await expect(panel.locator('#capture-actions')).not.toBeVisible();await panel.locator('#close-details').click();
    await source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('p'));getSelection().removeAllRanges();getSelection().addRange(range);});await clickAction(panel,'#selection-highlight');await expect(panel.locator('#status')).toContainText('Highlight saved',{timeout:30000});await panel.locator('nav [data-view=annotations]').click();await expect(panel.locator('nav [data-view=annotations] .view-count')).toHaveText('1');await expect(panel.locator('#list')).toContainText('Генеральный директор');
    await clickAction(panel,'#export-case');await expect(panel.locator('#status')).toContainText('Export written',{timeout:30000});await expect(panel.locator('#case-actions')).not.toBeVisible();
    await panel.locator('nav [data-view=captures]').click();await panel.locator('#settings-toggle').click();await panel.locator('#theme').selectOption('dark');await panel.locator('#save-settings').click();
    for(const theme of ['dark','light']){
      await panel.locator('#settings-toggle').click();await panel.locator('#theme').selectOption(theme);await panel.locator('#save-settings').click();
      for(const width of [320,360,420,520]){
        await panel.setViewportSize({width,height:900});await panel.locator('main').evaluate(n=>n.scrollTop=0);
        expect(await panel.evaluate(()=>document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth)).toBe(true);
        await panel.screenshot({path:path.resolve(`output/playwright/focus-${installed?'installed':'cft'}-${theme}-${width}.png`)});
        await panel.locator('#more-actions').click();const bounds=await panel.locator('#case-actions').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);if(width===320)await panel.screenshot({path:path.resolve(`output/playwright/focus-${installed?'installed':'cft'}-${theme}-menu-320.png`)});await panel.keyboard.press('Escape');
      }
    }
    await panel.reload();await expect(panel.locator('#case-select')).toContainText('Domain research');await expect(panel.locator('#list .item')).toHaveCount(2);await expect(panel.locator('#capture-page .button-text')).toHaveText('Save page');expect(await readFile(path.join(directory,record.artifacts[0].relative_path))).toEqual(original);expect(errors).toEqual([]);
  }finally{await context.close();fixture.server.close();}
});
