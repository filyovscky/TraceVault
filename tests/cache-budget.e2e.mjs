import {test,expect} from '@playwright/test';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('journal cache stays bounded while replay preserves every event and detects corruption',async()=>{
  test.setTimeout(90000);const run=Date.now(),directory=path.resolve('output/playwright/cache-budget-workspace-'+run),context=await launch(path.resolve('output/playwright/cache-budget-profile-'+run));
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-title').fill('Synthetic cache load');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    const id=await panel.evaluate(async()=>(await import('./storage.js')).setting('activeCase')),held=panel.evaluate(()=>navigator.locks.request('tracevault-disk-writer',()=>new Promise(resolve=>{window.__qaRelease=resolve;})));await expect.poll(()=>panel.evaluate(()=>typeof window.__qaRelease)).toBe('function');
    const files=[];for(let i=0;i<60;i++){const eventId=randomUUID(),file=path.join(directory,'cases',id,'events',eventId+'.json');files.push(file);await writeFile(file,JSON.stringify({schema_version:1,event_id:eventId,sequence:i+2,case_id:id,recorded_at:new Date().toISOString(),action:'synthetic_cache_load_only',record_type:null,value:null,details:{synthetic:true,payload:'cache-test-'.repeat(10000)}}));}
    await panel.evaluate(()=>window.__qaRelease());await held;
    const load=()=>panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase'),state=await s.exclusive(()=>r.loadState(root,w,id));return {count:state.audit.length,cache:r.journalCacheStats()};});
    for(let i=0;i<2;i++){const result=await load();expect(result.count).toBe(61);expect(result.cache.sourceBytes).toBeLessThanOrEqual(4*1024*1024);expect(result.cache.entries).toBeLessThan(60);expect(result.cache.sourceBytes).toBeGreaterThan(3*1024*1024);}
    await writeFile(files[59],'{damaged journal');await expect(load()).rejects.toThrow('Damaged journal');
  }finally{await context.close();}
});

test('annotation cache keeps one case and restores the earlier highlight from disk',async()=>{
  const run=Date.now(),context=await launch(path.resolve('output/playwright/annotation-cache-profile-'+run)),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,path.resolve('output/playwright/annotation-cache-workspace-'+run));await panel.locator('#case-title').fill('First case');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();const first=await panel.locator('#case-select').inputValue();
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('p'));getSelection().removeAllRanges();getSelection().addRange(range);});await panel.locator('#selection-highlight').click();await expect(panel.locator('#status')).toContainText('Highlight saved');
    const count=()=>source.evaluate(()=>CSS.highlights.get('tracevault-amber')?.size || 0),keys=()=>panel.evaluate(async()=>Object.keys((await chrome.storage.local.get('annotationCache')).annotationCache));await expect.poll(count).toBe(1);
    await panel.locator('#new-case').click();await panel.locator('#case-title').fill('Second case');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();const second=await panel.locator('#case-select').inputValue();await expect.poll(keys).toEqual([second]);await expect.poll(count).toBe(0);
    await panel.locator('#case-select').selectOption(first);await expect.poll(keys).toEqual([first]);await expect.poll(count).toBe(1);await source.reload();await expect.poll(count).toBe(1);
  }finally{await context.close();fixture.server.close();}
});
