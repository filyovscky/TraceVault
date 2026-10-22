import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
test('metadata scale: 2000 synthetic failed captures, pagination, Unicode search and async disk index',async()=>{
  const run=Date.now(),directory=path.resolve('output/playwright/scale-workspace-'+run),context=await launch(path.resolve('output/playwright/scale-profile-'+run));
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('SYNTHETIC');await panel.locator('#case-title').fill('Искусственная нагрузка метаданных');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const id=await panel.evaluate(async()=>(await import('./storage.js')).setting('activeCase'));
    const held=panel.evaluate(()=>navigator.locks.request('tracevault-disk-writer',()=>new Promise(resolve=>{window.__qaRelease=resolve;})));
    await expect.poll(()=>panel.evaluate(()=>typeof window.__qaRelease)).toBe('function');
    const dir=path.join(directory,'cases',id,'events');
    for(let start=0;start<2000;start+=32)await Promise.all(Array.from({length:Math.min(32,2000-start)},async(_,offset)=>{
      const i=start+offset,eventId=randomUUID(),captureId=randomUUID(),at=new Date(1792627200000+i).toISOString();
      await writeFile(path.join(dir,eventId+'.json'),JSON.stringify({schema_version:1,event_id:eventId,sequence:i+2,case_id:id,recorded_at:at,action:'synthetic_failure_for_load_test',record_type:'captures',details:{synthetic:true},value:{schema_version:1,capture_id:captureId,evidence_number:'EVD-'+String(i+1).padStart(6,'0'),case_id:id,kind:'webpage',source:{original_url:'https://example.org/synthetic/'+i,final_url:'https://example.org/synthetic/'+i,title:'Искусственный материал '+i,origin:'https://example.org'},times:{capture_started_at:at,timezone_id:'Europe/Moscow',local_offset_minutes:180,clock_source:'system_clock'},state:'failed',capture_status:'error',error:'Искусственная запись теста; реальный захват не выполнялся',collector_version:'0.1.0',artifacts:[],warnings:[]}}));
    }));
    await panel.evaluate(()=>window.__qaRelease());await held;
    const metrics=await panel.evaluate(async id=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');let ticks=0;const timer=setInterval(()=>ticks++,5),start=performance.now();const state=await s.exclusive(()=>r.loadState(root,workspace,id));clearInterval(timer);return {count:Object.keys(state.captures).length,ms:performance.now()-start,ticks};},id);
    expect(metrics.count).toBe(2000);expect(metrics.ticks).toBeGreaterThan(0);console.log('SCALE',metrics);
    await panel.locator('#refresh-source').click();await expect(panel.locator('#page-number')).toContainText('2000',{timeout:20000});expect(await panel.locator('#list .item').count()).toBe(25);
    await panel.locator('#search').fill('Искусственный материал 1999');await expect(panel.locator('#list .item')).toHaveCount(1);await panel.locator('#list .item-button').click();await expect(panel.locator('#details-body')).toContainText('Искусственная запись теста');
  }finally{await context.close();}
});
