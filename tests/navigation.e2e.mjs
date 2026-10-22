import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const installed of [false,true])test(`public cross-origin CSS archives without credentialed CORS; missing site access has a real recovery path${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(120000);const requests=[],publicServer=http.createServer((req,res)=>{requests.push({url:req.url,origin:req.headers.origin,cookie:req.headers.cookie});res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type',req.url==='/asset.svg'?'image/svg+xml':'text/css');res.end(req.url==='/asset.svg'?'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>':'body{--cors-proof:42;background-image:url("/asset.svg")}');});
  await new Promise(resolve=>publicServer.listen(0,'127.0.0.1',resolve));
  const fixture=await fixtureServer(),run=Date.now(),directory=path.resolve('output/playwright/cors-workspace-'+run),context=await launch(path.resolve('output/playwright/cors-profile-'+run),{installed});
  try{
    const panel=await extensionPage(context),errors=[];panel.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('CORS');await panel.locator('#case-title').fill('CORS and access');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    const source=await context.newPage();await source.goto(fixture.url+'/public-resources');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url());
    const denied=await panel.evaluate(async()=>{const {inject}=await import('./service.js'),[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});try{await inject(tab.id);return null;}catch(e){return {name:e.name,message:e.message};}});expect(denied.name).toBe('SiteAccessError');expect(denied.message).toContain('shield');
    // Only the denial branch is injected: never pretend that host permission was granted.
    await panel.evaluate(()=>{window.__permissionRequests=[];window.__permissionRequest=chrome.permissions.request.bind(chrome.permissions);chrome.permissions.request=options=>{window.__permissionRequests.push({options,gesture:navigator.userActivation.isActive});return Promise.resolve(false);};});
    await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Site access was not granted');expect(await panel.evaluate(()=>window.__permissionRequests)).toEqual([{options:{origins:['http://127.0.0.1/*']},gesture:true}]);
    expect(await panel.locator('#list .item').count()).toBe(0);expect(errors).toEqual([]);await panel.evaluate(()=>{chrome.permissions.request=window.__permissionRequest;});
    await invokeExtension(context,source,new URL(panel.url()).host);await panel.locator('#refresh-source').click();await expect(panel.locator('#site-state')).toContainText('Temporary site access is enabled');
    const publicUrl=`http://localhost:${publicServer.address().port}`;
    await source.evaluate(url=>{document.querySelectorAll('link,style').forEach(n=>n.remove());const link=document.createElement('link');link.rel='stylesheet';link.href=url+'/public.css';document.head.append(link);},publicUrl);
    await panel.locator('#refresh-source').click();await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});
    expect(record.warnings).toEqual([]);const bytes=await readFile(path.join(directory,record.artifacts[0].relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.artifacts[0].sha256);expect(bytes.toString()).toContain('--cors-proof:42');expect(bytes.toString()).toContain('data:image/svg+xml;base64,');
    expect(requests.some(r=>r.origin?.startsWith('chrome-extension://') && r.url==='/public.css')).toBe(true);expect(errors.filter(e=>/CORS|Cannot access contents/u.test(e))).toEqual([]);
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
