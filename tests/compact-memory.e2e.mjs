import {test,expect} from '@playwright/test';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
const execute=promisify(execFile);

test('sample whole-browser peak private memory: 0.5.0 versus compact on a 12.8 MP page',async()=>{
  test.setTimeout(240000);const run=Date.now(),out=path.resolve('output/playwright/compact-memory-'+run),baseline=path.join(out,'baseline');await mkdir(out,{recursive:true});
  await execute('python',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',path.resolve('releases/TraceVault-0.5.0.zip'),baseline]);
  const sampler=path.join(out,'sample.ps1');await writeFile(sampler,`param([string]$taskIds,[string]$taskStop,[string]$taskReady)
$taskPids=$taskIds.Split(',') | ForEach-Object {[int]$_}
$taskPeak=0L;$taskFirst=0L;$taskCount=0
while(-not (Test-Path -LiteralPath $taskStop)) {
  $taskBytes=[long]((Get-Process -Id $taskPids -ErrorAction SilentlyContinue | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
  if($taskCount -eq 0){$taskFirst=$taskBytes;Set-Content -LiteralPath $taskReady -Value ready}
  $taskPeak=[Math]::Max($taskPeak,$taskBytes);$taskCount++;Start-Sleep -Milliseconds 100
}
[pscustomobject]@{baselinePrivateBytes=$taskFirst;peakPrivateBytes=$taskPeak;samples=$taskCount} | ConvertTo-Json -Compress
`);
  const fixture=await fixtureServer(),results=[];
  try{for(const version of ['0.5.0','0.5.1']){
    const context=await launch(path.join(out,'profile-'+version),{nativeViewport:true,extensionRoot:version==='0.5.0'?baseline:path.resolve('extension')});let sampling,stop;
    try{
      const panel=await extensionPage(context);await chooseDirectory(panel,path.join(out,'workspace-'+version));await panel.locator('#case-title').fill('Memory benchmark');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));
      const source=await context.newPage(),cdp=await context.newCDPSession(source),{windowId}=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1400,height:950}});await source.goto(fixture.url+'/long');
      await source.evaluate(()=>{document.body.innerHTML='<main>RAM benchmark: fine text 0123456789</main>';document.body.style.cssText='margin:0;width:1600px;height:8000px;background:repeating-linear-gradient(#f6f6f6 0 50px,#ddd 50px 100px);font:12px sans-serif';});await source.bringToFront();await panel.locator('#refresh-source').click();
      const browser=await context.browser().newBrowserCDPSession(),before=await browser.send('SystemInfo.getProcessInfo'),ids=before.processInfo.map(p=>p.id).join(',');stop=path.join(out,'stop-'+version);const ready=path.join(out,'ready-'+version);
      sampling=execute('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',sampler,ids,stop,ready]);await expect.poll(async()=>!!await stat(ready).catch(()=>null)).toBe(true);
      const start=performance.now();await panel.locator('#capture-full').click();await expect(panel.locator('#status')).toContainText('EVD-000001',{timeout:120000});const ms=performance.now()-start;
      await writeFile(stop,'stop');const memory=JSON.parse((await sampling).stdout),after=await browser.send('SystemInfo.getProcessInfo');
      const capture=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});
      expect(capture.pixel_width*capture.pixel_height).toBe(12800000);results.push({version,browser:context.browser().version(),...memory,captureMs:ms,cpuSeconds:after.processInfo.reduce((n,p)=>n+p.cpuTime,0)-before.processInfo.reduce((n,p)=>n+p.cpuTime,0),artifactBytes:capture.artifacts.reduce((n,a)=>n+a.byte_length,0),frames:capture.artifacts.filter(a=>a.kind==='screenshot_frame').length});await browser.detach();
    }finally{if(stop)await writeFile(stop,'stop');if(sampling)await sampling;await context.close();}
  }}finally{fixture.server.close();}
  await writeFile('output/playwright/compact-memory.json',JSON.stringify({scope:'Whole isolated browser process private bytes sampled every ~100 ms for fixed process IDs; includes site, browser, GPU and extension. One run each; not extension-only RSS, not a guaranteed upper bound.',results},null,2));console.log('COMPACT MEMORY',JSON.stringify(results));
});
