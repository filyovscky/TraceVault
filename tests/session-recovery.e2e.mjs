import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('probe Chrome storage JSON representation without changing event data',async()=>{
  const context=await launch(path.resolve('output/playwright/session-order-profile-'+Date.now()));
  try{
    const panel=await extensionPage(context),result=await panel.evaluate(async()=>{
      const value={schema_version:1,event_id:'test-event',session_id:'test-session',case_id:'test-case',window_id:12,sequence:3,type:'navigation',observed_at:'2026-10-27T12:00:00.000Z',time_context:{timezone_id:'Europe/Moscow',local_offset_minutes:180,clock_source:'system_clock'},tab_id:34,url:'https://example.org/?q=exact&end=1',previous_url:null,title:'Example',browser_timestamp:1793102400000,document_id:'document',transition_type:'link',transition_qualifiers:[]};
      await chrome.storage.local.set({qaSessionEvent:value});const restored=(await chrome.storage.local.get('qaSessionEvent')).qaSessionEvent;return {value,restored,original:JSON.stringify(value,null,2),after:JSON.stringify(restored,null,2),keys:Object.keys(restored)};
    });
    expect(result.restored).toEqual(result.value);console.log('STORAGE JSON ORDER',JSON.stringify({bytesEqual:result.original===result.after,keys:result.keys}));
  }finally{await context.close();}
});

for(const installed of [false,true])test('real navigation recovery: legacy JSON, frozen bytes, empty/truncated files and content conflict'+(installed?' — installed Chrome':''),async()=>{
  test.setTimeout(240000);const run=Date.now(),directory=path.resolve('output/playwright/session-recovery-workspace-'+run),context=await launch(path.resolve('output/playwright/session-recovery-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory,{timeout:30000});await panel.locator('#case-title').fill('Session recovery');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});
    const source=await context.newPage();await source.goto(fixture.url+'/recovery-before');await source.bringToFront();
    const getState=()=>panel.evaluate(async()=>(await chrome.storage.local.get('navigationRecorder')).navigationRecorder);
    const audit=()=>panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return (await s.exclusive(()=>r.loadState(root,w,id))).audit;});
    for(const mode of ['legacy','frozen','empty','truncated','conflict']){
      await source.goto(fixture.url+'/before-'+mode);await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url(),{timeout:30000});await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window',{timeout:30000});await expect.poll(async()=>(await getState()).saved).toBe(2);
      const id=new URL(panel.url()).host,worker=context.serviceWorkers().find(w=>new URL(w.url()).host===id) || await context.waitForEvent('serviceworker',{predicate:w=>new URL(w.url()).host===id});
      await worker.evaluate(mode=>{
        globalThis.__qaRestoreFs?.();const directoryOpen=FileSystemDirectoryHandle.prototype.getFileHandle,create=FileSystemFileHandle.prototype.createWritable;let armed=true;
        globalThis.__qaRestoreFs=()=>{FileSystemDirectoryHandle.prototype.getFileHandle=directoryOpen;FileSystemFileHandle.prototype.createWritable=create;};
        FileSystemDirectoryHandle.prototype.getFileHandle=async function(name,options){if(armed && ['legacy','frozen','conflict'].includes(mode) && this.name==='events' && options?.create){armed=false;throw new DOMException('Injected interruption before audit publication','NotReadableError');}return directoryOpen.call(this,name,options);};
        FileSystemFileHandle.prototype.createWritable=async function(options){const stream=await create.call(this,options);if(armed && ['empty','truncated'].includes(mode) && this.name.startsWith('000003-')){armed=false;if(mode==='empty'){await stream.abort();throw new DOMException('Injected empty interrupted event','NotReadableError');}const write=stream.write.bind(stream);stream.write=async value=>{const bytes=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value;await write(bytes.slice(0,12));};}return stream;};
      },mode);
      await source.goto(fixture.url+'/observed-'+mode);await expect.poll(async()=>(await getState()).status,{timeout:30000}).toBe('save_error');await worker.evaluate(()=>globalThis.__qaRestoreFs());
      const pending=await getState(),text=pending.pending[0];expect(typeof text).toBe('string');const value=JSON.parse(text),file=`cases/${pending.case_id}/sessions/${pending.session_id}/${String(value.sequence).padStart(6,'0')}-${value.event_id}.json`,original=await readFile(path.join(directory,file)),hash=createHash('sha256').update(original).digest('hex');expect(value.url).toBe(fixture.url+'/observed-'+mode);expect(value.sequence).toBe(3);expect((await audit()).some(e=>e.details?.event?.event_id===value.event_id)).toBe(false);
      if(mode==='legacy'){
        await panel.evaluate(async()=>{const key='navigationRecorder',s=(await chrome.storage.local.get(key))[key];s.pending=s.pending.map(v=>typeof v==='string'?JSON.parse(v):v);await chrome.storage.local.set({[key]:s});});
        const legacy=await getState();expect(typeof legacy.pending[0]).toBe('object');expect(Buffer.from(JSON.stringify(legacy.pending[0],null,2)).equals(original)).toBe(false);
      }else if(mode==='frozen')expect(Buffer.from(text).equals(original)).toBe(true);
      else if(mode==='empty')expect(original.length).toBe(0);
      else if(mode==='truncated')expect(()=>JSON.parse(original)).toThrow();
      else if(mode==='conflict'){
        // Change only the browser recovery draft. The real disk file is untouched.
        await panel.evaluate(async()=>{const key='navigationRecorder',s=(await chrome.storage.local.get(key))[key],v=JSON.parse(s.pending[0]);v.title='Conflicting draft title';s.pending[0]=JSON.stringify(v,null,2);await chrome.storage.local.set({[key]:s});});
      }
      await panel.locator('#session-retry').click();
      if(mode==='conflict'){
        await expect(panel.locator('#status')).toContainText('different event data',{timeout:30000});expect((await getState()).status).toBe('save_error');expect((await audit()).some(e=>e.details?.event?.event_id===value.event_id)).toBe(false);expect(createHash('sha256').update(await readFile(path.join(directory,file))).digest('hex')).toBe(hash);break;
      }
      await expect.poll(async()=>(await getState()).status,{timeout:30000}).toBe('stopped');const rows=(await audit()).filter(e=>e.action==='navigation_recorded' && e.details.session_id===pending.session_id);expect(rows.filter(e=>e.details.event.event_id===value.event_id)).toHaveLength(1);const receipt=rows.find(e=>e.details.event.event_id===value.event_id);expect(receipt.details.event.url).toBe(source.url());
      if(mode==='legacy')expect(receipt.details.artifact.existing_representation).toBe('equivalent_json');if(mode==='frozen')expect(receipt.details.artifact.existing_representation).toBe('exact_payload');
      if(['empty','truncated'].includes(mode)){expect(receipt.details.artifact.relative_path).not.toBe(file);expect(receipt.details.artifact.session_recovery.preserved_files[0].sha256).toBe(hash);}
      expect(createHash('sha256').update(await readFile(path.join(directory,file))).digest('hex')).toBe(hash);
      for(const row of rows){const a=row.details.artifact,bytes=await readFile(path.join(directory,a.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);expect(JSON.parse(bytes).session_id).toBe(pending.session_id);}
      const before=rows.length;
      if(mode==='frozen'){
        // Simulate interruption after the audit committed but before the browser
        // removed its pending draft. Retry must verify the receipt, not duplicate it.
        await panel.evaluate(async text=>{const key='navigationRecorder',s=(await chrome.storage.local.get(key))[key];s.pending=[text];s.saved--;s.status='save_error';await chrome.storage.local.set({[key]:s});},text);
      }
      await panel.evaluate(()=>chrome.runtime.sendMessage({type:'TV_SESSION_RETRY'}));expect((await getState()).pending).toHaveLength(0);expect((await audit()).filter(e=>e.action==='navigation_recorded' && e.details.session_id===pending.session_id)).toHaveLength(before);
    }
  }finally{await context.close();fixture.server.close();}
});
