import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function launch(profile) {
  await mkdir(path.join(profile,'Default'),{recursive:true});
  // Only this isolated QA profile: permit native FSA writes without an unattended
  // browser permission bubble. No permission monkey-patching and no OPFS storage.
  await writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{file_system_write_guard:1,file_system_read_guard:1}}}));
  return chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`,'--auto-accept-file-system-access-permission-requests']});
}
export async function extensionPage(context) {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);return page;
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
