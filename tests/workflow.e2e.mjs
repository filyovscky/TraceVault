import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('P0: three archives, PNG, original image, immutable references, offline, restart, recovery',async()=>{
  const run=Date.now(),profile=path.resolve(`output/playwright/workflow-profile-${run}`),directory=path.resolve(`output/playwright/workflow-workspace-${run}`);
  const fixture=await fixtureServer();let context=await launch(profile);
  try {
    let panel=await extensionPage(context);const errors=[];panel.on('pageerror',e=>errors.push(e.message));
    await chooseDirectory(panel,directory);await panel.locator('#case-code').fill('INV-QA');await panel.locator('#case-title').fill('Проверка реального диска');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Дело создано');
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();
    const id=new URL(panel.url()).host;await invokeExtension(context,source,id);
    const sourceTab=await panel.evaluate(async()=>(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
    const current=await panel.evaluate(async()=>{const s=await import('./storage.js');return s.setting('activeCase');});
    await panel.evaluate(async tabId=>(await import('./storage.js')).setting('sourceTab',tabId),sourceTab);
    // Real production orchestration: chrome.scripting + resource engine + FSA + readback.
    const records=[];
    for(const route of ['/static','/article','/complex']) {
      await source.goto(fixture.url+route);await source.bringToFront();await invokeExtension(context,source,id);
      records.push(await panel.evaluate(async({tabId,caseId})=>{const s=await import('./storage.js'),svc=await import('./service.js');const root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return svc.capture({root,workspace,caseId,tabId});},{tabId:sourceTab,caseId:current}));
    }
    console.log('CAPTURE STATUSES',records.map(c=>({state:c.state,warnings:c.warnings})));
    expect(records[0].state).toBe('completed');expect(records[2].state).toBe('partial');
    const html=await readFile(path.join(directory,records[0].artifacts[0].relative_path),'utf8');
    expect(html).toContain('Раскрытый текст');expect(html).toContain('data:image/svg+xml;base64,');expect(html).not.toContain('DO-NOT-ARCHIVE');expect(html).not.toContain('<script');
    for(const record of records) {
      const artifact=record.artifacts[0],bytes=await readFile(path.join(directory,artifact.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256);
      expect(new Date(record.times.artifact_written_at)>=new Date(record.times.capture_started_at)).toBe(true);
    }
    const screenshot=await panel.evaluate(async({tabId,caseId})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return svc.capture({root,workspace,caseId,tabId,kind:'screen'});},{tabId:sourceTab,caseId:current});
    const png=await readFile(path.join(directory,screenshot.artifacts[0].relative_path));expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(screenshot.pixel_width).toBeGreaterThan(0);
    const image=await panel.evaluate(async({tabId,caseId,url})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return svc.capture({root,workspace,caseId,tabId,kind:'image',imageUrl:url});},{tabId:sourceTab,caseId:current,url:fixture.url+'/icon.svg'});expect(image.artifacts[0].mime_type).toBe('image/svg+xml');
    const selections=await source.evaluate(()=>{const node=[...document.querySelectorAll('p')][0].firstChild,start=node.textContent.indexOf('Иван Иванов'),range=new Range();range.setStart(node,start);range.setEnd(node,start+'Иван Иванов'.length);getSelection().removeAllRanges();getSelection().addRange(range);return getSelection().toString();});expect(selections).toBe('Иван Иванов');
    const annotation=await panel.evaluate(async({tabId,caseId,captureId})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),{selection}=await svc.selected(tabId);return svc.saveAnnotation({root,workspace,caseId,tabId,selection,captureId,note:'Проверить утверждение источника'});},{tabId:sourceTab,caseId:current,captureId:records[2].capture_id});
    const entity=await panel.evaluate(async({caseId,annotationId})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return svc.saveEntity({root,workspace,caseId,type:'person',label:'Иван Иванов',raw:'Иван Иванов',annotationId});},{caseId:current,annotationId:annotation.annotation_id});expect(entity.verification).toBe('unconfirmed');
    await panel.reload();await expect(panel.locator('#case-select')).toContainText('INV-QA');
    await source.bringToFront();
    const highlightSize=async()=>source.evaluate(()=>CSS.highlights.get('tracevault-amber')?.size || 0);
    await panel.evaluate(async({caseId,tabId})=>{const s=await import('./storage.js'),r=await import('./repository.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),state=await r.loadState(root,workspace,caseId);await svc.broadcastAnnotations(caseId,state,true);return chrome.tabs.sendMessage(tabId,{type:'TV_RENDER',annotations:Object.values(state.annotations),enabled:true});},{caseId:current,tabId:sourceTab});
    await expect.poll(highlightSize).toBe(1);
    const textBefore=await source.locator('body').textContent();
    await panel.evaluate(async tabId=>chrome.tabs.sendMessage(tabId,{type:'TV_RENDER',annotations:[],enabled:false}),sourceTab);await expect.poll(highlightSize).toBe(0);expect(await source.locator('body').textContent()).toBe(textBefore);
    await panel.evaluate(async({caseId,annotationId})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');await svc.updateAnnotation(root,workspace,caseId,annotationId,{note:'Комментарий изменён',appearance:{color_token:'green'}});},{caseId:current,annotationId:annotation.annotation_id});
    const exportPath=await panel.evaluate(async caseId=>{const s=await import('./storage.js'),r=await import('./repository.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),cases=await r.listCases(root,workspace);return svc.exportCase(root,workspace,cases.find(c=>c.case_id===caseId));},current);
    const exported=JSON.parse(await readFile(path.join(directory,exportPath),'utf8'));expect(exported.entities.length).toBe(1);expect(exported.evidence_refs[0].capture_id).toBe(records[2].capture_id);
    const ajv=new Ajv({allowUnionTypes:true});for(const name of ['Capture','Annotation','EntityDraft','EvidenceReference','OSINTchartExport'])ajv.addSchema(JSON.parse(await readFile(`schemas/${name}.schema.json`,'utf8')));const validate=ajv.getSchema('OSINTchartExport.schema.json');expect(validate(exported),JSON.stringify(validate.errors)).toBe(true);
    for(const rec of [records[0],screenshot])expect(createHash('sha256').update(await readFile(path.join(directory,rec.artifacts[0].relative_path))).digest('hex')).toBe(rec.artifacts[0].sha256);
    // Corruption must be detected, not silently accepted.
    await writeFile(path.join(directory,records[0].artifacts[0].relative_path),html+'corruption');
    const verification=await panel.evaluate(async({caseId,artifact})=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return svc.verifyArtifact(root,workspace,caseId,artifact);},{caseId:current,artifact:records[0].artifacts[0]});expect(verification.ok).toBe(false);
    // Offline opening outside extension: script cannot run, no fetches required.
    const offline=await context.newPage(),requests=[];offline.on('request',r=>{if(/^https?:/u.test(r.url()))requests.push(r.url());});await context.setOffline(true);await offline.goto('file:///'+path.join(directory,records[1].artifacts[0].relative_path).replaceAll('\\','/'));await expect(offline.locator('h1')).toHaveText('Публичный тестовый материал');expect(await offline.evaluate(()=>window.siteScriptRan)).toBeUndefined();expect(requests).toEqual([]);await context.setOffline(false);
    // A pending event is durable before abrupt document/process loss.
    const interruptedId=await panel.evaluate(async({caseId,record})=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),id=crypto.randomUUID();await s.exclusive(()=>r.append(root,workspace,caseId,'capture_started','captures',{...record,capture_id:id,evidence_number:'EVD-000006',state:'writing',capture_status:'pending',source:{...record.source,title:'Прерванная операция QA'},artifacts:[]}));return id;},{caseId:current,record:records[2]});
    expect(errors).toEqual([]);await context.close();context=await launch(profile);panel=await extensionPage(context);await expect(panel.locator('#case-select')).toContainText('INV-QA');
    const recovered=await panel.evaluate(async caseId=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json');return r.loadState(root,workspace,caseId);},current);expect(recovered.captures[interruptedId].state).toBe('interrupted');expect(recovered.entities[entity.entity_id].evidence_refs).toEqual(entity.evidence_refs);
    await panel.locator('#settings-toggle').click();
    for(const theme of ['light','dark'])for(const width of [320,360,420,520]) {
      await panel.setViewportSize({width,height:1000});await panel.locator('#theme').selectOption(theme);await panel.locator('#settings-toggle').click();
      await panel.screenshot({path:path.resolve(`output/playwright/${theme}-${width}.png`),fullPage:true});
      expect(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.locator('#settings-toggle').click();
    }
    console.log('WORKFLOW DIRECTORY',directory,'FILES',await readdir(path.join(directory,'cases',current,'captures')));
  } finally {await context.close();fixture.server.close();}
});
