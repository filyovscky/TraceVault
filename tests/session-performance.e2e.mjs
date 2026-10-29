import {test,expect} from '@playwright/test';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('measure session memory and CPU on 100 real browser History API changes',async()=>{
  test.setTimeout(180000);const run=Date.now(),context=await launch(path.resolve('output/playwright/session-performance-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,path.resolve('output/playwright/session-performance-workspace-'+run));await panel.locator('#case-title').fill('Performance measurement');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    const source=await context.newPage();await source.goto(fixture.url+'/performance');await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window');
    const browser=await context.browser().newBrowserCDPSession(),page=await context.newCDPSession(panel);
    async function sample(){
      await page.send('HeapProfiler.collectGarbage');const heap=await page.send('Runtime.getHeapUsage'),{processInfo}=await browser.send('SystemInfo.getProcessInfo');
      const ids=processInfo.map(p=>Number(p.id)).filter(Number.isSafeInteger);
      const memory=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress`],{encoding:'utf8'}));
      return {at:Date.now(),panelHeapBytes:heap.usedSize,processPrivateBytes:[memory].flat().reduce((n,p)=>n+p.PrivateMemorySize64,0),processWorkingSetBytes:[memory].flat().reduce((n,p)=>n+p.WorkingSet64,0),cpuSeconds:processInfo.reduce((n,p)=>n+p.cpuTime,0)};
    }
    const before=await sample();await new Promise(resolve=>setTimeout(resolve,10000));const idle=await sample();
    const start=performance.now();await source.evaluate(()=>{for(let i=0;i<100;i++)history.pushState({},'', '/performance-event-'+i);});
    await expect.poll(async()=>panel.evaluate(async()=>{const n=(await chrome.storage.local.get('navigationRecorder')).navigationRecorder;return n.pending.length===0 && Object.values(n.tabs).some(t=>t.url?.endsWith('/performance-event-99')) && n.saved>=102;}),{timeout:90000,intervals:[1000]}).toBe(true);
    await panel.locator('#session-stop').click();await expect(panel.locator('#session-state')).toContainText('Stopped');const drainedMs=performance.now()-start,after=await sample();
    const audit=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return (await s.exclusive(()=>r.loadState(root,w,id))).audit.filter(e=>e.action==='navigation_recorded');});
    expect(audit.filter(e=>e.details.event.type==='navigation' && e.details.event.navigation_method==='history_api')).toHaveLength(100);
    const result={scope:'Isolated Chrome for Testing, whole browser RSS/private bytes include source renderer, extension and browser/GPU; panel heap is V8 after explicit GC. Not an extension-only RSS measurement.',browser:context.browser().version(),before,idle,after,idleElapsedMs:idle.at-before.at,drainedMs,totalEvents:audit.length,sessionFileBytes:audit.reduce((n,e)=>n+e.details.artifact.byte_length,0),idleCpuSeconds:idle.cpuSeconds-before.cpuSeconds,workCpuSeconds:after.cpuSeconds-idle.cpuSeconds};
    await writeFile('output/playwright/session-performance.json',JSON.stringify(result,null,2));console.log('SESSION PERFORMANCE',JSON.stringify(result));
    await browser.detach();await page.detach();
  }finally{await context.close();fixture.server.close();}
});
