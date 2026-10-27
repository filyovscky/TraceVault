import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

async function setup(label){
  const run=Date.now(),directory=path.resolve('output/playwright/session-'+label+'-workspace-'+run),profile=path.resolve('output/playwright/session-'+label+'-profile-'+run),context=await launch(profile),fixture=await fixtureServer(),panel=await extensionPage(context);
  await chooseDirectory(panel,directory);await panel.locator('#case-title').fill('Window session');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});
  return {directory,profile,context,fixture,panel};
}
const state=panel=>panel.evaluate(async()=>(await chrome.storage.local.get('navigationRecorder')).navigationRecorder);
const records=(panel,caseId)=>panel.evaluate(async caseId=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=caseId || await s.setting('activeCase');return (await s.exclusive(()=>r.loadState(root,workspace,id))).audit.filter(e=>e.action==='navigation_recorded');},caseId);
const eventSeen=(panel,predicate)=>expect.poll(async()=>(await records(panel)).some(e=>predicate(e.details.event)),{timeout:30000}).toBe(true);
async function verifyFiles(directory,rows){for(const row of rows){const a=row.details.artifact,bytes=await readFile(path.join(directory,a.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);expect(JSON.parse(bytes).event_id).toBe(row.details.event.event_id);}}

test('one-window scope, tab moves, panel closure, SPA, export and window closure',async()=>{
  test.setTimeout(150000);const q=await setup('scope');let panel=q.panel;
  try{
    const source=await q.context.newPage();await source.goto(q.fixture.url+'/tracked');
    const outside=await panel.evaluate(async url=>chrome.windows.create({url,type:'normal'}),q.fixture.url+'/OUTSIDE_SECRET');
    await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window',{timeout:30000});
    const pinnedCase=(await state(panel)).case_id,trackedId=(await state(panel)).window_id,tabId=await panel.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,source.url());
    await panel.evaluate(({id,url})=>chrome.tabs.update(id,{url}),{id:outside.tabs[0].id,url:q.fixture.url+'/OUTSIDE_SECRET_NEXT'});
    await source.evaluate(()=>history.pushState({},'', '/tracked-spa'));await eventSeen(panel,e=>e.type==='history_state' && e.url.endsWith('/tracked-spa'));
    await source.evaluate(()=>location.hash='section');await eventSeen(panel,e=>e.type==='fragment' && e.url.endsWith('#section'));
    await source.evaluate(()=>{const a=document.createElement('a');a.href='/tracked-link';a.textContent='Test link';a.id='qa-link';document.body.prepend(a);});await source.locator('#qa-link').click();await eventSeen(panel,e=>e.type==='navigation' && e.url.endsWith('/tracked-link') && e.transition_type==='link');
    await source.goBack();await eventSeen(panel,e=>e.transition_qualifiers?.includes('forward_back'));
    await source.reload();await eventSeen(panel,e=>e.transition_type==='reload');
    await source.evaluate(()=>{const a=document.createElement('a');a.href='/tracked-new-tab';a.target='_blank';a.textContent='New linked tab';a.id='qa-new-link';document.body.prepend(a);});
    const childPromise=q.context.waitForEvent('page');await source.locator('#qa-new-link').click();const child=await childPromise;await child.waitForLoadState();await eventSeen(panel,e=>e.type==='link_target' && e.url.endsWith('/tracked-new-tab'));
    await panel.evaluate(({id,windowId})=>chrome.tabs.move(id,{windowId,index:-1}),{id:tabId,windowId:outside.id});await eventSeen(panel,e=>e.type==='tab_left' && e.reason==='moved_out');
    await source.goto(q.fixture.url+'/OUTSIDE_MOVED_SECRET');
    await panel.evaluate(({id,windowId})=>chrome.tabs.move(id,{windowId,index:-1}),{id:tabId,windowId:trackedId});await eventSeen(panel,e=>e.type==='tab_entered' && e.reason==='moved_in');
    // The re-enter snapshot is legitimate; use a different secret for navigation
    // while outside, then ensure it wasn't misclassified as an in-window visit.
    const movedRows=await records(panel);expect(movedRows.some(r=>r.details.event.type==='navigation' && r.details.event.url?.includes('OUTSIDE_MOVED_SECRET'))).toBe(false);
    await source.goto(q.fixture.url+'/tracked-return');await eventSeen(panel,e=>e.url?.endsWith('/tracked-return'));
    await panel.locator('#new-case').click();await panel.locator('#case-title').fill('Different active case');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();
    await source.goto(q.fixture.url+'/pinned-original-case');await expect.poll(async()=>(await records(panel,pinnedCase)).some(r=>r.details.event.url?.endsWith('/pinned-original-case'))).toBe(true);expect(await records(panel)).toEqual([]);await panel.locator('#case-select').selectOption(pinnedCase);await expect.poll(()=>panel.locator('#case-select').inputValue()).toBe(pinnedCase);
    await panel.close();await source.goto(q.fixture.url+'/tracked-panel-closed');
    panel=await extensionPage(q.context);await eventSeen(panel,e=>e.url?.endsWith('/tracked-panel-closed'));
    for(const theme of ['light','dark']){await panel.setViewportSize({width:320,height:900});await panel.locator('#settings-toggle').click();await panel.locator('#theme').selectOption(theme);await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();await panel.locator('#session-section').scrollIntoViewIfNeeded();await expect.poll(()=>panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mkdir('docs/qa',{recursive:true});await panel.screenshot({path:`docs/qa/0.5.0-session-${theme}.png`,fullPage:true});}
    await panel.locator('#session-stop').click();await expect(panel.locator('#session-state')).toContainText('Stopped');
    const saved=await records(panel);await source.goto(q.fixture.url+'/AFTER_STOP_SECRET');
    await panel.locator('#session-export').click();await expect(panel.locator('#status')).toContainText('Session export written and verified',{timeout:30000});
    const exportPath=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return (await s.exclusive(()=>r.loadState(root,w,id))).audit.findLast(e=>e.action==='navigation_exported').details.artifact.relative_path;});
    const exported=JSON.parse(await readFile(path.join(q.directory,exportPath),'utf8'));expect(exported.events).toHaveLength(saved.length);expect(exported.events.map(e=>e.event.sequence)).toEqual(saved.map((_,i)=>i+1));await verifyFiles(q.directory,saved);
    expect(JSON.stringify(await records(panel))).not.toContain('OUTSIDE_SECRET');expect(JSON.stringify(await state(panel))).not.toContain('OUTSIDE_SECRET');expect(JSON.stringify(await records(panel))).not.toContain('AFTER_STOP_SECRET');
    await panel.locator('#session-journal').click();await expect(panel.locator('#search')).toHaveValue((await state(panel)).session_id);await panel.locator('#list .item-button').filter({hasText:'Session stopped'}).first().click();await expect(panel.locator('#details-body')).toContainText('SHA-256');
    const altered=path.join(q.directory,saved[0].details.artifact.relative_path);await writeFile(altered,Buffer.concat([await readFile(altered),Buffer.from(' ')]));await panel.locator('#session-export').click();await expect(panel.locator('#status')).toContainText('Checksum mismatch');
    await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window');const closing=(await state(panel)).window_id;await panel.evaluate(id=>chrome.windows.remove(id),closing);
    panel=await extensionPage(q.context);await expect.poll(async()=>(await state(panel)).status).toBe('stopped');expect((await records(panel)).at(-1).details.event.reason).toBe('window_closed');
  }finally{await q.context.close();q.fixture.server.close();}
});

test('failed writes stay pending, retry is idempotent and restart never resumes',async()=>{
  test.setTimeout(120000);const q=await setup('recovery');let context=q.context,panel=q.panel;
  try{
    const source=await context.newPage();await source.goto(q.fixture.url+'/recovery-initial');await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window');
    await panel.evaluate(async()=>{const s=await import('./storage.js'),n=(await chrome.storage.local.get('navigationRecorder')).navigationRecorder;window.__qaTarget=await s.setting('session-target:'+n.session_id);await s.setting('session-target:'+n.session_id,null);});
    await source.goto(q.fixture.url+'/failed-write');await expect.poll(async()=>(await state(panel)).status,{timeout:30000}).toBe('save_error');await expect(panel.locator('#session-state')).toContainText('pending');
    await source.goto(q.fixture.url+'/PAUSED_SECRET');
    await panel.evaluate(async()=>{const s=await import('./storage.js'),n=(await chrome.storage.local.get('navigationRecorder')).navigationRecorder;await s.setting('session-target:'+n.session_id,window.__qaTarget);});
    await panel.locator('#session-retry').click();await expect(panel.locator('#session-retry')).not.toBeVisible({timeout:30000});const rows=await records(panel);await verifyFiles(q.directory,rows);expect(rows.at(-1).details.event.reason).toBe('save_error');expect(rows.some(r=>r.details.event.url?.endsWith('/failed-write'))).toBe(true);expect(JSON.stringify(rows)).not.toContain('PAUSED_SECRET');expect(new Set(rows.map(r=>r.details.event.event_id)).size).toBe(rows.length);
    await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window');await panel.locator('#settings-toggle').click();await panel.locator('#paused').check();await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();await expect(panel.locator('#session-state')).toContainText('Stopped');await expect(panel.locator('#session-start')).toBeDisabled();await panel.locator('#settings-toggle').click();await panel.locator('#paused').uncheck();await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();
    await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window');await context.close();
    context=await launch(q.profile);panel=await extensionPage(context);await expect.poll(async()=>(await state(panel)).status,{timeout:30000}).toBe('stopped');const after=await records(panel);expect(after.at(-1).details.event.reason).toBe('browser_or_extension_restarted');await verifyFiles(q.directory,after);
  }finally{await context.close();q.fixture.server.close();}
});

for(const installed of [false,true])test('session worker writes verified local events without a panel writer'+(installed?' — installed Chrome':''),async()=>{
  test.setTimeout(90000);const run=Date.now(),directory=path.resolve('output/playwright/session-probe-workspace-'+run),context=await launch(path.resolve('output/playwright/session-probe-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-title').fill('Session API');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});
    const source=await context.newPage();await source.goto(fixture.url+'/session-initial');await source.bringToFront();await expect(panel.locator('#session-start')).toBeEnabled();await panel.locator('#session-start').click();await expect(panel.locator('#session-state')).toContainText('Recording this window',{timeout:30000});
    await source.goto(fixture.url+'/session-next');
    const read=()=>panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return (await s.exclusive(()=>r.loadState(root,workspace,id))).audit.filter(e=>e.action==='navigation_recorded');});
    await expect.poll(async()=>(await read()).some(e=>e.details.event.url===fixture.url+'/session-next'),{timeout:30000}).toBe(true);
    await panel.locator('#session-stop').click();await expect(panel.locator('#session-state')).toContainText('Stopped',{timeout:30000});const records=await read();expect(records.at(-1).details.event.type).toBe('session_stopped');
    for(const record of records){const a=record.details.artifact,bytes=await readFile(path.join(directory,a.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);expect(JSON.parse(bytes).event_id).toBe(record.details.event.event_id);}
  }finally{await context.close();fixture.server.close();}
});
