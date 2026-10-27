import {test,expect as baseExpect} from '@playwright/test';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory,clickAction} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
const expect=baseExpect.configure({timeout:30000});

for(const installed of [false,true])test('middle-clipped URLs retain their full address in hover, capture and links'+(installed?' — installed Chrome':''),async()=>{
  test.setTimeout(600000);const run=Date.now(),directory=path.resolve('output/playwright/url-display-workspace-'+run),context=await launch(path.resolve('output/playwright/url-display-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory,{timeout:60000});await panel.locator('#case-title').fill('URL display');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    const url=fixture.url+'/search?q='+encodeURIComponent('Long search query Ω ').repeat(30)+'&source=chrome&oe=UTF-8#recognizable-end',created=context.waitForEvent('page');await panel.evaluate(async url=>{const w=await chrome.windows.getCurrent();await chrome.tabs.create({windowId:w.id,active:true,url});},url);const source=await created;await source.waitForLoadState();await source.evaluate(()=>document.title='Long search URL');await source.bringToFront();await clickAction(panel,'#refresh-source');
    await expect(panel.locator('#source-title')).toHaveText('Long search URL');await expect(panel.locator('#source-url')).toHaveText(url);
    for(const theme of ['light','dark']){
      // Exercise the shipped theme CSS directly; settings persistence is covered
      // separately and should not add FSA/annotation work to a URL layout test.
      await panel.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const width of [320]){
        await panel.setViewportSize({width,height:900});const node=panel.locator('#source-url');await node.scrollIntoViewIfNeeded();
        const dimensions=await node.evaluate(n=>{const a=n.querySelector('.url-start'),b=n.querySelector('.url-end');return {height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight),clipped:a.scrollWidth>a.clientWidth,end:b.textContent,overflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth};});
        expect(dimensions.height).toBeLessThanOrEqual(dimensions.line+1);expect(dimensions.clipped).toBe(true);expect(dimensions.end).toBe(url.slice(-18));expect(dimensions.overflow).toBe(false);
        await panel.mouse.move(1,1);await node.hover();const tooltip=await panel.locator('#ui-tooltip').evaluate(n=>{const r=n.getBoundingClientRect();return {visible:!n.hidden,text:n.textContent,inViewport:r.top>=0 && r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight};});expect(tooltip).toEqual({visible:true,text:url,inViewport:true});
        if(width===320){await mkdir('output/playwright',{recursive:true});await panel.screenshot({path:`output/playwright/url-${installed?'installed':'cft'}-${theme}.png`});}
        await panel.keyboard.press('Escape');
      }
    }
    await panel.setViewportSize({width:320,height:900});await panel.mouse.move(1,1);await panel.locator('#source-url').hover();const tip=panel.locator('#ui-tooltip');await tip.hover();await panel.mouse.wheel(0,700);await expect.poll(()=>tip.evaluate(n=>n.scrollTop)).toBeGreaterThan(0);await expect(tip).toBeVisible();await panel.keyboard.press('Escape');
    await panel.locator('#source-url').focus();await panel.keyboard.press('Shift+Tab');await panel.keyboard.press('Tab');await expect(panel.locator('#source-url')).toBeFocused();await expect(tip).toHaveText(url);await expect(tip).toBeVisible();await panel.keyboard.press('Escape');
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('EVD-000001',{timeout:30000});
    const capture=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});
    expect(capture.source.original_url).toBe(url);expect(capture.source.final_url).toBe(url);const bytes=await readFile(path.join(directory,capture.artifacts[0].relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.artifacts[0].sha256);
    await expect(panel.locator('#list [data-full-url]')).toHaveAttribute('data-full-url',url);await panel.locator('#close-details').click();await panel.locator('#list [data-full-url]').hover();await expect(tip).toHaveText(url);await panel.locator('#list .item-button').first().click();
    await expect(panel.getByRole('link',{name:'Open source site',exact:true})).toHaveAttribute('href',url);expect(await panel.locator('#details-body dd[data-full-url]').count()).toBe(2);
    await source.goto(fixture.url+'/short');await expect(panel.locator('#source-url')).toHaveText(source.url());await expect(panel.locator('#source-url')).toHaveAttribute('data-full-url',source.url());
  }finally{await context.close();fixture.server.close();}
});
