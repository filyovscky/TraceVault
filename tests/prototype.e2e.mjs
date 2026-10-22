import {test,expect} from '@playwright/test';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
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
