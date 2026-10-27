import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {launch,extensionPage,chooseDirectory,invokeExtension,clickAction} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test(`default all-site access: HTML, PNG and CORS across origins without action invocation${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(120000);const requests=[],publicServer=http.createServer((req,res)=>{requests.push({url:req.url,origin:req.headers.origin,cookie:req.headers.cookie});res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type',req.url==='/asset.svg'?'image/svg+xml':'text/css');res.end(req.url==='/asset.svg'?'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>':'body{--cors-proof:42;background-image:url("/asset.svg")}');});
  await new Promise(resolve=>publicServer.listen(0,'127.0.0.1',resolve));
  const fixture=await fixtureServer(),run=Date.now(),directory=path.resolve('output/playwright/cors-workspace-'+run),context=await launch(path.resolve('output/playwright/cors-profile-'+run),{installed});
  try{
    const panel=await extensionPage(context),errors=[];panel.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('CORS');await panel.locator('#case-title').fill('CORS and access');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    const source=await context.newPage(),sourceErrors=[];source.on('pageerror',e=>sourceErrors.push(e.message));await source.goto(fixture.url+'/public-resources');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url());
    await panel.evaluate(()=>{window.__permissionRequests=[];chrome.permissions.request=options=>{window.__permissionRequests.push(options);throw new Error('Unexpected runtime site permission request');};});
    await expect(panel.locator('#site-state')).toHaveText('Site access enabled');await expect(panel.locator('#grant-site')).not.toBeVisible();
    const publicUrl=`http://localhost:${publicServer.address().port}`;
    await source.evaluate(url=>{document.querySelectorAll('link,style').forEach(n=>n.remove());const link=document.createElement('link');link.rel='stylesheet';link.href=url+'/public.css';document.head.append(link);},publicUrl);
    await clickAction(panel,'#refresh-source');await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});
    expect(record.warnings).toEqual([]);const bytes=await readFile(path.join(directory,record.artifacts[0].relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.artifacts[0].sha256);expect(bytes.toString()).toContain('--cors-proof:42');expect(bytes.toString()).toContain('data:image/svg+xml;base64,');
    expect(requests.some(r=>r.url==='/public.css')).toBe(true);expect(errors.filter(e=>/CORS|Cannot access contents/u.test(e))).toEqual([]);
    // A new origin revokes activeTab, and this test never invokes the action at all.
    await source.goto(fixture.url.replace('127.0.0.1','localhost')+'/second-site');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url());await expect(panel.locator('#site-state')).toHaveText('Site access enabled');
    await clickAction(panel,'#capture-screen');await expect(panel.locator('#status')).toContainText('Saved · EVD-000002',{timeout:30000});
    const screen=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures).find(c=>c.evidence_number==='EVD-000002');});
    expect(screen.kind).toBe('screenshot');expect(screen.source.final_url).toBe(source.url());const png=await readFile(path.join(directory,screen.artifacts[0].relative_path));expect(createHash('sha256').update(png).digest('hex')).toBe(screen.artifacts[0].sha256);expect(png.subarray(1,4).toString()).toBe('PNG');expect(await panel.evaluate(()=>window.__permissionRequests)).toEqual([]);expect(errors).toEqual([]);
    await source.goto(fixture.url+'/icon.svg');await expect.poll(()=>source.evaluate(()=>document.contentType)).toBe('image/svg+xml');expect(sourceErrors).toEqual([]);
  }finally{await context.close();fixture.server.close();publicServer.close();}
});

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
    const panel=await extensionPage(context);await panel.evaluate(async()=>{const s=await import('./storage.js');await s.setting('preferences',{theme:'dark',blockedDomains:['127.0.0.1','google.com'],allowedCaptureHosts:['gmail.com']});});await panel.reload();await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('ACCESS');await panel.locator('#case-title').fill('Folder recovery');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created',{timeout:30000});
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
    await expect(panel.locator('#capture-page')).toBeDisabled();await panel.locator('#reauthorize').click();await expect(panel.locator('#reauthorize')).not.toBeVisible();
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
