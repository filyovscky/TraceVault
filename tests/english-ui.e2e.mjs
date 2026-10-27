import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test(`selection toolbar never reappears without a live selection${installed?' — installed Chrome':''}`,async()=>{
  const run=Date.now(),context=await launch(path.resolve('output/playwright/toolbar-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context),source=await context.newPage();await source.goto(fixture.url+'/static');
    const highlight=source.getByRole('button',{name:'Highlight',exact:true});
    const select=()=>source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('p'));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));});
    const render=(message={type:'TV_RENDER',annotations:[],enabled:true})=>panel.evaluate(async({url,message})=>{const [tab]=await chrome.tabs.query({url});return chrome.tabs.sendMessage(tab.id,message);},{url:source.url(),message});
    await select();await expect(highlight).toBeVisible();
    await source.mouse.click(600,600);await expect(highlight).not.toBeVisible();
    await render();await expect(highlight).not.toBeVisible();
    await source.evaluate(()=>document.body.append(document.createTextNode('Live streaming update')));await render();await expect(highlight).not.toBeVisible();
    await select();await expect(highlight).toBeVisible();await source.keyboard.press('Escape');await render();await expect(highlight).not.toBeVisible();
    await select();await expect(highlight).toBeVisible();await source.evaluate(()=>getSelection().removeAllRanges());await expect(highlight).not.toBeVisible();await render();await expect(highlight).not.toBeVisible();
    await select();await expect(highlight).toBeVisible();await render({type:'TV_HIDE',hidden:true});await expect(highlight).not.toBeVisible();await render({type:'TV_HIDE',hidden:false});await expect(highlight).not.toBeVisible();
    await select();await expect(highlight).toBeVisible();await source.evaluate(()=>document.dispatchEvent(new Event('scroll')));await render();await expect(highlight).not.toBeVisible();
    await select();await expect(highlight).toBeVisible();await source.setViewportSize({width:800,height:650});await render();await expect(highlight).not.toBeVisible();
    await source.screenshot({path:path.resolve(`output/playwright/0.4.5-toolbar-cleared-${installed?'installed':'cft'}.png`)});
  }finally{await context.close();fixture.server.close();}
});

test('English icon UI: hover/focus, grouped settings, real save, annotation and preference persistence',async()=>{
  test.setTimeout(120000);const run=Date.now(),directory=path.resolve('output/playwright/english-workspace-'+run),context=await launch(path.resolve('output/playwright/english-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));await panel.setViewportSize({width:320,height:900});await expect(panel.locator('html')).toHaveAttribute('lang','en');
    await panel.locator('#settings-toggle').hover();await expect(panel.locator('#ui-tooltip')).toHaveText('Settings');await expect(panel.locator('#ui-tooltip')).toBeVisible();
    await panel.locator('#workspace').focus();await panel.keyboard.press('Tab');await expect(panel.locator('#settings-toggle')).toBeFocused();await expect(panel.locator('#ui-tooltip')).toHaveText('Settings');
    const tooltip=await panel.locator('#ui-tooltip').boundingBox();expect(tooltip.x).toBeGreaterThanOrEqual(0);expect(tooltip.x+tooltip.width).toBeLessThanOrEqual(320);
    await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('EN-UI');await panel.locator('#case-title').fill('Русское имя дела сохраняется');await panel.getByRole('button',{name:'Create case',exact:true}).click();await expect(panel.locator('#status')).toHaveText('Case created');
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await expect(panel.locator('#source-url')).toHaveText(source.url());
    await panel.locator('#capture-pdf').hover();await expect(panel.locator('#ui-tooltip')).toContainText('PDF');await expect(panel.locator('#ui-tooltip')).toBeVisible();await panel.screenshot({path:path.resolve('output/playwright/0.4-tooltip-320.png')});
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});
    expect(await panel.locator('button:not(.item-button):not(#command-results button)').evaluateAll(buttons=>buttons.filter(b=>!b.querySelector('svg') || !b.getAttribute('aria-label')).map(b=>b.id))).toEqual([]);
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});const bytes=await readFile(path.join(directory,record.artifacts[0].relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.artifacts[0].sha256);expect(bytes.toString()).toContain('Публичный тестовый материал');
    await panel.locator('#close-details').click();await panel.locator('#settings-toggle').click();await expect(panel.locator('#settings')).toBeVisible();await expect(panel.locator('#settings legend')).toHaveText(['Appearance','Capture','Annotations','Keyboard shortcuts','Storage']);await expect(panel.locator('#shortcut-list')).not.toContainText('_execute_action');
    await panel.locator('#save-settings').hover();await expect(panel.locator('#settings #ui-tooltip')).toHaveText('Save settings');await expect(panel.locator('#settings #ui-tooltip')).toBeVisible();await panel.screenshot({path:path.resolve('output/playwright/0.4-settings-tooltip-320.png')});
    await panel.locator('#max-size').fill('0');await panel.locator('#save-settings').click();await expect(panel.locator('#settings [role=alert]')).toHaveText('Limit: 1–256 MB');await expect(panel.locator('#settings')).toBeVisible();
    await panel.locator('#max-size').fill('32');await panel.locator('#theme').selectOption('dark');await panel.locator('#paused').check();await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toHaveText('Capture is paused in settings');
    await panel.locator('#settings-toggle').click();await panel.locator('#paused').uncheck();await panel.locator('#save-settings').click();await panel.reload();await expect(panel.locator('#case-select')).toContainText('Русское имя дела сохраняется');await expect(panel.locator('html')).toHaveAttribute('data-theme','dark');await panel.locator('#settings-toggle').click();await expect(panel.locator('#max-size')).toHaveValue('32');await panel.screenshot({path:path.resolve('output/playwright/0.4-settings-dark-320.png')});await panel.keyboard.press('Escape');
    await source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('p'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
    await expect(source.locator('[data-tracevault-ui] button')).toHaveCount(4);for(const name of ['Highlight','Quote','Note','Entity'])await expect(source.getByRole('button',{name,exact:true})).toBeVisible();await source.getByRole('button',{name:'Note',exact:true}).click();await expect(panel.locator('#annotation-dialog')).toBeVisible();await panel.locator('#annotation-note').fill('Примечание без перевода');await panel.getByRole('button',{name:'Save to case',exact:true}).click();await expect(panel.locator('#annotation-dialog')).not.toBeVisible();await panel.locator('[data-view=annotations]').click();await expect(panel.locator('#collection-title')).toHaveText('Highlights & notes');await expect(panel.locator('#list')).toContainText('Генеральный директор');
    const highlights=()=>source.evaluate(()=>CSS.highlights.get('tracevault-amber')?.size || 0);await expect.poll(highlights).toBe(1);await panel.locator('#settings-toggle').click();await panel.locator('#annotations-toggle').uncheck();await expect.poll(highlights).toBe(1);await panel.locator('#save-settings').click();await expect.poll(highlights).toBe(0);await panel.locator('#settings-toggle').click();await panel.locator('#annotations-toggle').check();await panel.keyboard.press('Escape');await expect.poll(highlights).toBe(0);await panel.locator('#settings-toggle').click();await expect(panel.locator('#annotations-toggle')).not.toBeChecked();await panel.locator('#annotations-toggle').check();await panel.locator('#save-settings').click();await expect.poll(highlights).toBe(1);
    // Independent section filters and truthful empty states for the same real disk records.
    await expect(panel.locator('[data-view=annotations] .button-text')).toHaveText('Highlights');
    await panel.locator('#filter-options').evaluate(d=>d.open=true);
    await panel.locator('#annotation-type-filter').selectOption('text_highlight');
    await expect(panel.locator('#list')).toContainText('No matching records');
    await expect(panel.locator('#filter-count')).toHaveText(' · 1 active');
    await panel.locator('[data-view=captures]').click();await expect(panel.locator('#list')).toContainText('EVD-000001');
    await expect(panel.locator('#annotation-type-label')).not.toBeVisible();
    await panel.locator('#search').fill('missing-material');await expect(panel.locator('#list')).toContainText('No matching records');
    await panel.locator('[data-view=annotations]').click();await expect(panel.locator('#search')).toHaveValue('');await expect(panel.locator('#annotation-type-filter')).toHaveValue('text_highlight');
    await panel.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(panel.locator('#list')).toContainText('Генеральный директор');await expect(panel.locator('#reset-filters')).toBeDisabled();
    await panel.locator('[data-view=captures]').click();await expect(panel.locator('#search')).toHaveValue('missing-material');await panel.locator('#reset-filters').click();
    await panel.locator('[data-view=entities]').click();await expect(panel.locator('#list')).toContainText('No entities yet');await expect(panel.getByRole('button',{name:'Clear filters',exact:true})).toHaveCount(0);
    await panel.locator('[data-view=annotations]').click();await panel.locator('#filter-options').evaluate(d=>d.open=false);
    for(const theme of ['dark','light']){
      await panel.locator('#settings-toggle').click();await panel.locator('#theme').selectOption(theme);await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();
      for(const width of [320,420]){await panel.setViewportSize({width,height:900});await panel.locator('#collection').scrollIntoViewIfNeeded();await panel.screenshot({path:path.resolve(`output/playwright/0.4.2-${theme}-${width}.png`)});expect(await panel.evaluate(()=>document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth)).toBe(true);}
    }
  }finally{await context.close();fixture.server.close();}
});
