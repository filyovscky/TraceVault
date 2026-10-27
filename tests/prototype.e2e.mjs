import {test,expect} from '@playwright/test';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

for(const {installed,mode} of [{installed:false,mode:'workspace'},{installed:true,mode:'workspace'},{installed:false,mode:'single_case'}])test(`nonempty folder creates a separate workspace: ${mode}${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(120000);const run=Date.now(),parent=path.resolve('output/playwright/populated-parent-'+run),context=await launch(path.resolve('output/playwright/populated-profile-'+run),{installed}),fixture=await fixtureServer();
  await mkdir(parent,{recursive:true});const original=Buffer.from('Existing files must stay unchanged');await writeFile(path.join(parent,'keep.txt'),original);
  try{
    const panel=await extensionPage(context);await panel.setViewportSize({width:360,height:900});
    if(mode==='single_case'){await panel.locator('.setup-options summary').click();await panel.locator('#workspace-mode').selectOption(mode);}
    await chooseDirectory(panel,parent);await expect(panel.locator('#case-dialog')).toBeVisible();await expect(panel.locator('#case-target')).toContainText(path.basename(parent)+' / TraceVault');await expect(panel.locator('#status')).toContainText('Created workspace:');
    expect((await readdir(parent)).sort()).toEqual(['TraceVault','keep.txt']);const firstRoot=path.join(parent,'TraceVault'),metadata=JSON.parse(await readFile(path.join(firstRoot,'workspace.json'),'utf8'));expect(metadata.mode).toBe(mode);
    await panel.screenshot({path:path.resolve(`output/playwright/0.4.8-subfolder-${installed?'installed':mode}.png`)});
    await panel.locator('#case-title').fill('Saved in a child folder');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});await expect(panel.locator('#workspace-hint')).toContainText('Ready');
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url());await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});const artifact=path.join(firstRoot,record.artifacts[0].relative_path),bytes=await readFile(artifact);expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.artifacts[0].sha256);
    await panel.reload();await expect(panel.locator('#case-select')).toContainText('CASE-001');expect((await readdir(parent)).sort()).toEqual(['TraceVault','keep.txt']);
    // A directory and a file can both occupy candidate names. Neither is reused.
    await writeFile(path.join(parent,'TraceVault-2'),original);await chooseDirectory(panel,parent,{button:'change-root'});await expect(panel.locator('#case-dialog')).toBeVisible();await expect(panel.locator('#case-target')).toContainText(path.basename(parent)+' / TraceVault-3');expect(JSON.parse(await readFile(path.join(parent,'TraceVault-3','workspace.json'),'utf8')).mode).toBe(mode);
    await panel.locator('#case-dialog [data-close-dialog]').click();await chooseDirectory(panel,firstRoot,{button:'change-root'});await expect(panel.locator('#case-select')).toContainText('CASE-001');await expect(panel.locator('#case-dialog')).not.toBeVisible();
    expect((await readdir(parent)).sort()).toEqual(['TraceVault','TraceVault-2','TraceVault-3','keep.txt']);expect(await readFile(path.join(parent,'keep.txt'))).toEqual(original);expect(await readFile(path.join(parent,'TraceVault-2'))).toEqual(original);expect(await readFile(artifact)).toEqual(bytes);expect(await panel.evaluate(async()=>{const s=await import('./storage.js');return (await s.setting('root')).name;})).toBe('TraceVault');
    expect(await panel.evaluate(()=>document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth)).toBe(true);
  }finally{await context.close();fixture.server.close();}
});

for(const installed of [false,true])test(`guided setup blocks disconnected case creation and duplicate submit${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(150000);const run=Date.now(),directory=path.resolve('output/playwright/setup-workspace-'+run),context=await launch(path.resolve('output/playwright/setup-profile-'+run),{installed}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await panel.setViewportSize({width:360,height:900});
    await expect(panel.locator('#pick-root')).toBeEnabled();await expect(panel.locator('#step-folder')).toHaveAttribute('aria-current','step');await expect(panel.locator('#capture-page')).toBeDisabled();await expect(panel.locator('#new-case')).toBeDisabled();
    await panel.screenshot({path:path.resolve(`output/playwright/0.4.6-setup-folder-${installed?'installed':'cft'}.png`)});
    await chooseDirectory(panel,directory);await expect(panel.locator('#case-dialog')).toBeVisible();await expect(panel.locator('#step-case')).toHaveAttribute('aria-current','step');await expect(panel.locator('#case-target')).toContainText(path.basename(directory));await expect(panel.locator('#case-code')).toHaveValue('');
    await panel.locator('#case-dialog [data-close-dialog]').click();await expect(panel.locator('#capture-page')).toBeDisabled();await expect(panel.locator('#workspace-hint')).toContainText('Create a case');
    await panel.locator('#new-case').click();await panel.locator('#case-title').fill('Guided investigation');await panel.evaluate(()=>document.documentElement.dataset.theme='dark');await panel.screenshot({path:path.resolve(`output/playwright/0.4.6-setup-case-${installed?'installed':'cft'}.png`)});
    // Two real form submissions in the same task must produce one verified case.
    await panel.locator('#case-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});await expect(panel.locator('#case-select')).toContainText('CASE-001');await expect(panel.locator('#setup-progress')).not.toBeVisible();await expect(panel.locator('#workspace-hint')).toContainText('Ready · Guided investigation');await expect(panel.locator('#capture-page')).toBeEnabled();
    expect(await readdir(path.join(directory,'cases'))).toHaveLength(1);
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await expect(panel.locator('#source-url')).toHaveText(source.url());await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Saved · EVD-000001',{timeout:30000});
    const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures)[0];});const bytes=await readFile(path.join(directory,record.artifacts[0].relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.artifacts[0].sha256);
    await panel.locator('#close-details').click();await panel.evaluate(()=>{document.querySelector('main').scrollTop=0;});await panel.screenshot({path:path.resolve(`output/playwright/0.4.6-setup-ready-${installed?'installed':'cft'}.png`)});
    // A malformed candidate must not replace the connected/persisted workspace.
    await panel.evaluate(async()=>{const s=await import('./storage.js'),root=await s.setting('root'),bad=await root.getDirectoryHandle('broken-candidate',{create:true});await s.writeNew(bad,'workspace.json','null');window.showDirectoryPicker=async()=>bad;});
    await panel.locator('#change-root').click();await expect(panel.locator('#status')).toContainText('Invalid workspace.json');await expect(panel.locator('#case-select')).toContainText('CASE-001');expect(await panel.evaluate(async()=>{const s=await import('./storage.js');return (await s.setting('root')).name;})).toBe(path.basename(directory));
    // Fault injection models expired folder permission; it never fakes a successful disk write.
    await panel.addInitScript(()=>{window.__qaSetupPermission='denied';const query=FileSystemDirectoryHandle.prototype.queryPermission;FileSystemDirectoryHandle.prototype.queryPermission=function(options){return window.__qaSetupPermission?Promise.resolve(window.__qaSetupPermission):query.call(this,options);};});await panel.reload();
    await expect(panel.locator('#reauthorize')).toBeVisible();await expect(panel.locator('#new-case')).toBeDisabled();await expect(panel.locator('#capture-page')).toBeDisabled();
    await panel.screenshot({path:path.resolve(`output/playwright/0.4.6-setup-access-${installed?'installed':'cft'}.png`)});
    await panel.evaluate(()=>{document.getElementById('case-title').value='Must not be created';document.getElementById('case-code').value='BLOCKED';document.getElementById('case-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await expect(panel.locator('#status')).toContainText('Connect a workspace folder');expect(await readdir(path.join(directory,'cases'))).toHaveLength(1);
    await panel.evaluate(()=>{window.__qaSetupPermission=null;});await panel.locator('#reauthorize').click();await expect(panel.locator('#case-select')).toContainText('CASE-001');await expect(panel.locator('#capture-page')).toBeEnabled();expect(await readdir(path.join(directory,'cases'))).toHaveLength(1);
    await panel.locator('#new-case').click();await expect(panel.locator('#case-code')).toHaveValue('');await panel.locator('#case-code').fill('   ');await panel.locator('#case-title').fill('Second investigation');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});await expect(panel.locator('#case-select')).toContainText('CASE-002');await expect(panel.locator('#workspace-hint')).toContainText('Ready · Second investigation');expect(await readdir(path.join(directory,'cases'))).toHaveLength(2);expect(await readFile(path.join(directory,record.artifacts[0].relative_path))).toEqual(bytes);
    await panel.locator('#new-case').click();await panel.locator('#case-code').fill('INV-CUSTOM');await panel.locator('#case-title').fill('Manual numbering');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible({timeout:30000});await expect(panel.locator('#case-select')).toContainText('INV-CUSTOM');
    const storedCases=await Promise.all((await readdir(path.join(directory,'cases'))).map(async id=>JSON.parse(await readFile(path.join(directory,'cases',id,'case.json'),'utf8'))));expect(storedCases.map(c=>c.code).sort()).toEqual(['CASE-001','CASE-002','INV-CUSTOM']);
    expect(await panel.evaluate(()=>document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth)).toBe(true);
  }finally{await context.close();fixture.server.close();}
});
test('prototype: native FSA disk write and persisted handle (CDP-selected directory)',async()=>{
  const run=Date.now(),directory=path.resolve('output/playwright/prototype-workspace-'+run);await mkdir(directory,{recursive:true});
  const context=await launch(path.resolve('output/playwright/prototype-profile-'+run));
  try {
    const page=await extensionPage(context);page.on('pageerror',e=>console.log('PAGE ERROR',e.message));await chooseDirectory(page,directory);
    await page.locator('#case-code').fill('API-001');await page.locator('#case-title').fill('Прототип API');await page.locator('#case-form button[type=submit]').click();
    await expect(page.locator('#status')).toHaveText('Case created');
    expect(JSON.parse(await readFile(path.join(directory,'workspace.json'),'utf8')).schema_version).toBe(1);
    const entries=await readdir(path.join(directory,'cases'));expect(entries.length).toBeGreaterThan(0);
    const capabilities=await page.evaluate(async()=>({directoryPicker:typeof showDirectoryPicker,chrome:navigator.userAgent,permission:await (await (await import('./storage.js')).setting('root')).queryPermission({mode:'readwrite'})}));
    console.log('PROTOTYPE',JSON.stringify(capabilities));
    await page.reload();await expect(page.locator('#case-select')).toContainText('API-001');await expect(page.locator('#folder-state')).toContainText('Read/write access');
  } finally {await context.close();}
});
