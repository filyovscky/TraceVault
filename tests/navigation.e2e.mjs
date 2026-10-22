import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test(`current page follows navigation, SPA and tab switches without workspace access${installed?' — installed Chrome':''}`,async()=>{
  const run=Date.now(),context=await launch(path.resolve('output/playwright/navigation-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context),a=await context.newPage();await a.goto(fixture.url+'/first');await a.bringToFront();
    await expect(panel.locator('#source-url')).toHaveText(a.url());await expect(panel.locator('#source-title')).toContainText('/first');
    await a.evaluate(()=>{history.pushState({},'','/spa');document.title='SPA latest';});await expect(panel.locator('#source-url')).toHaveText(fixture.url+'/spa');await expect(panel.locator('#source-title')).toHaveText('SPA latest');
    const b=await context.newPage();await b.goto(fixture.url+'/second');await b.bringToFront();await expect(panel.locator('#source-url')).toHaveText(b.url());
    await a.bringToFront();await expect(panel.locator('#source-url')).toHaveText(a.url());
    await a.goto(fixture.url.replace('127.0.0.1','localhost')+'/cross-origin');await expect(panel.locator('#source-url')).toHaveText(a.url());await expect(panel.locator('#source-title')).toContainText('/cross-origin');
    await a.evaluate(()=>{for(let i=0;i<10;i++){history.pushState({},'','/rapid-'+i);document.title='Latest '+i;}});await expect(panel.locator('#source-url')).toHaveText(new URL('/rapid-9',a.url()).href);await expect(panel.locator('#source-title')).toHaveText('Latest 9');
    await a.close();await b.bringToFront();await expect(panel.locator('#source-url')).toHaveText(b.url());
  }finally{await context.close();fixture.server.close();}
});

test('legacy exclusions disappear; expired folder access reconnects on save and writes verified files',async()=>{
  test.setTimeout(90000);const run=Date.now(),directory=path.resolve('output/playwright/access-workspace-'+run),context=await launch(path.resolve('output/playwright/access-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await panel.evaluate(async()=>{const s=await import('./storage.js');await s.setting('preferences',{theme:'dark',blockedDomains:['127.0.0.1','google.com'],allowedCaptureHosts:['gmail.com']});});await panel.reload();await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('ACCESS');await panel.locator('#case-title').fill('Folder recovery');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const id=await panel.evaluate(async()=>{const s=await import('./storage.js');return s.setting('activeCase');});const preferences=await panel.evaluate(async()=>{const s=await import('./storage.js');return s.setting('preferences');});expect(preferences).toEqual({theme:'dark'});await expect(panel.locator('#blocked-domains,#allowed-capture-hosts,#capture-exclusion')).toHaveCount(0);
    const source=await context.newPage();await source.goto(fixture.url+'/before');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);
    // Fault injection models permission expiration, not the native permission bubble.
    // The grant branch calls the original browser API; all file I/O stays native.
    await panel.addInitScript(()=>{
      window.__qaPermission='prompt';window.__qaRequests=[];
      const query=FileSystemDirectoryHandle.prototype.queryPermission,request=FileSystemDirectoryHandle.prototype.requestPermission;
      FileSystemDirectoryHandle.prototype.queryPermission=function(options){return window.__qaPermission?Promise.resolve(window.__qaPermission):query.call(this,options);};
      FileSystemDirectoryHandle.prototype.requestPermission=async function(options){window.__qaRequests.push(navigator.userActivation.isActive);if(window.__qaPermission==='denied')return 'denied';window.__qaPermission=null;return request.call(this,options);};
    });await panel.reload();await expect(panel.locator('#reauthorize')).toBeVisible();
    await source.goto(fixture.url+'/after');await expect(panel.locator('#source-url')).toHaveText(source.url());await expect(panel.locator('#source-title')).toContainText('/after');await invokeExtension(context,source,new URL(panel.url()).host);
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});expect(await panel.evaluate(()=>window.__qaRequests)).toEqual([true]);expect(await panel.evaluate(async()=>{const s=await import('./storage.js');return s.setting('activeCase');})).toBe(id);
    await panel.evaluate(()=>{window.__qaPermission='denied';});await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Chrome denied write access');await expect(panel.locator('#reauthorize')).toBeVisible();await expect(panel.locator('#list .item')).toHaveCount(1);
    await source.evaluate(()=>{history.pushState({},'','/denied-spa');document.title='Navigation while denied';});await expect(panel.locator('#source-title')).toHaveText('Navigation while denied');await expect(panel.locator('#source-url')).toHaveText(fixture.url+'/denied-spa');
    await panel.evaluate(()=>{window.__qaPermission='prompt';});await panel.locator('#reauthorize').click();await expect(panel.locator('#status')).toContainText('verified by writing and reading');await expect(panel.locator('#reauthorize')).toBeHidden();
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000002',{timeout:30000});
    const records=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures);});expect(records).toHaveLength(2);expect(records[1].source.final_url).toBe(fixture.url+'/denied-spa');
    for(const record of records){const artifact=record.artifacts[0],bytes=await readFile(path.join(directory,artifact.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256);}
    await panel.setViewportSize({width:360,height:900});await panel.screenshot({path:path.resolve('output/playwright/access-restored.png')});
  }finally{await context.close();fixture.server.close();}
});
