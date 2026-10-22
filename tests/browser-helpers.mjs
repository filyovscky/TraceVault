import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
export async function launch(profile,{installed=false,headed=false,nativeViewport=false,extensionRoot=path.resolve('extension')}={}) {
  await mkdir(path.join(profile,'Default'),{recursive:true});
  // Only this isolated QA profile: permit native FSA writes without an unattended
  // browser permission bubble. No permission monkey-patching and no OPFS storage.
  const prefPath=path.join(profile,'Default','Preferences');let prefs={};
  try{prefs=JSON.parse(await readFile(prefPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  prefs.profile ||= {};prefs.profile.default_content_setting_values ||= {};
  Object.assign(prefs.profile.default_content_setting_values,{file_system_write_guard:1,file_system_read_guard:1});
  await writeFile(prefPath,JSON.stringify(prefs));
  const options=installed?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{channel:'chromium'};
  const context=await chromium.launchPersistentContext(profile,{...options,...(nativeViewport?{viewport:null}:{}),headless:!headed,ignoreDefaultArgs:installed?['--disable-extensions']:[],args:installed?['--enable-unsafe-extension-debugging']:[`--disable-extensions-except=${extensionRoot}`,`--load-extension=${extensionRoot}`,'--enable-unsafe-extension-debugging']});
  if(installed){const cdp=await context.browser().newBrowserCDPSession();const loaded=await cdp.send('Extensions.loadUnpacked',{path:extensionRoot});context.extensionId=loaded.id;await cdp.detach();}
  return context;
}
export async function invokeExtension(context,page,id) {
  const browserCDP=await context.browser().newBrowserCDPSession();
  const {targetInfos}=await browserCDP.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
  const target=targetInfos.find(t=>t.url===page.url());
  if(!target)throw new Error('Tab target missing: '+JSON.stringify(targetInfos));
  await browserCDP.send('Extensions.triggerAction',{id,targetId:target.targetId});await browserCDP.detach();
}
export async function extensionPage(context) {
  const worker=context.extensionId ? null : context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:20000});
  const page=await context.newPage();await page.goto(`chrome-extension://${context.extensionId || new URL(worker.url()).host}/panel.html`);return page;
}
// CDP supplies a REAL disk directory via browser drag-and-drop. Only picker selection
// is automated; storage, handles, permissions, writes and readback are native FSA.
// This does not test the operating system picker UI itself.
export async function chooseDirectory(page,directory) {
  await mkdir(directory,{recursive:true});
  await page.evaluate(()=>{
    window.addEventListener('dragover',e=>e.preventDefault());
    window.addEventListener('drop',async e=>{e.preventDefault();window.__qaDirectory=await e.dataTransfer.items[0].getAsFileSystemHandle();});
  });
  const cdp=await page.context().newCDPSession(page);
  for(const type of ['dragEnter','drop'])await cdp.send('Input.dispatchDragEvent',{type,x:100,y:150,data:{items:[],files:[directory],dragOperationsMask:1}});
  await expect.poll(()=>page.evaluate(()=>window.__qaDirectory?.kind)).toBe('directory');
  await page.evaluate(()=>{window.showDirectoryPicker=async()=>{await window.__qaDirectory.requestPermission({mode:'readwrite'});return window.__qaDirectory;};});
  await page.locator('#pick-root').click();
  await expect(page.locator('#folder-state')).toContainText('Доступ к записи');
}
