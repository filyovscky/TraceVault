// Interactive native-keyboard acceptance harness. Uses an isolated profile and
// real FSA directory. Send the requested keys to its uniquely titled window.
import {expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory} from '../tests/browser-helpers.mjs';
import {fixtureServer} from '../tests/fixture-server.mjs';
import {createHash} from 'node:crypto';
const run=Date.now(),out=path.resolve('output/keyboard-'+run);
await mkdir(out,{recursive:true});
const context=await launch(path.join(out,'profile'),{installed:true,headed:true}),fixture=await fixtureServer();
const results={run,steps:[]};
let sideCommand;
async function phase(key){await writeFile(path.resolve('output/keyboard-phase.json'),JSON.stringify({directory:out,key,results},null,2));console.log('PRESS',key);}
try{
  const panel=await extensionPage(context);await chooseDirectory(panel,path.join(out,'workspace'));await panel.locator('#case-code').fill('KEYS-002');await panel.locator('#case-title').fill('Native keyboard QA');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Дело создано');
  const source=await context.newPage();await source.goto(fixture.url+'/static');await source.evaluate(()=>document.title='TraceVault Native Keyboard QA');await source.bringToFront();
  await phase('Ctrl+Shift+3');
  await expect.poll(()=>panel.evaluate(async()=>(await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})).length),{timeout:120000}).toBe(1);results.steps.push('native open-panel: PASS');
  // Extension debugging can leave the new native target paused. Resume it and
  // inspect it explicitly: Playwright context.pages() omits native Side Panels.
  const browserCDP=await context.browser().newBrowserCDPSession(),targets=await browserCDP.send('Target.getTargets',{filter:[{}]}),own=await context.newCDPSession(panel),{targetInfo}=await own.send('Target.getTargetInfo');await own.detach();
  const side=targets.targetInfos.find(t=>t.type==='page' && t.url===panel.url() && t.targetId!==targetInfo.targetId);
  const {sessionId}=await browserCDP.send('Target.attachToTarget',{targetId:side.targetId,flatten:false});let messageId=0;
  sideCommand=(method,params={})=>new Promise((resolve,reject)=>{const id=++messageId,timer=setTimeout(()=>{browserCDP.off('Target.receivedMessageFromTarget',listener);reject(new Error('Native target timeout: '+method));},10000);function listener(event){if(event.sessionId!==sessionId)return;const msg=JSON.parse(event.message);if(msg.id!==id)return;clearTimeout(timer);browserCDP.off('Target.receivedMessageFromTarget',listener);if(msg.error)reject(new Error(msg.error.message));else resolve(msg.result);}browserCDP.on('Target.receivedMessageFromTarget',listener);browserCDP.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  await sideCommand('Runtime.runIfWaitingForDebugger');
  async function state(){return panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return s.exclusive(()=>r.loadState(root,w,id));});}
  for(const [key,kind] of [['Ctrl+Shift+1','webpage'],['Ctrl+Shift+2','screenshot']]){
    await source.bringToFront();await phase(key);
    await expect.poll(async()=>Object.values((await state()).captures).filter(c=>c.kind===kind && ['complete','partial'].includes(c.capture_status)).length,{timeout:120000}).toBe(1);
    const record=Object.values((await state()).captures).find(c=>c.kind===kind);
    for(const artifact of record.artifacts){const bytes=await readFile(path.join(out,'workspace',artifact.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256);}
    results.steps.push('native '+kind+' + disk SHA-256: PASS');
  }
  await source.bringToFront();await source.locator('p').first().click();await source.evaluate(()=>{const n=document.querySelector('p'),range=document.createRange();range.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(range);});await phase('Ctrl+Shift+4');
  let editor;
  await expect.poll(async()=>{for(const p of context.pages())if(p.url()===panel.url() && await p.locator('#annotation-dialog').evaluate(n=>n.open).catch(()=>false)){editor=p;return true;}const native=await sideCommand('Runtime.evaluate',{expression:'document.getElementById("annotation-dialog").open',returnByValue:true});if(native.result.value){editor='side';return true;}return false;},{timeout:120000}).toBe(true);
  if(editor==='side'){const quote=await sideCommand('Runtime.evaluate',{expression:'document.getElementById("quote-preview").textContent',returnByValue:true});expect(quote.result.value).toContain('Иван Иванов');await sideCommand('Runtime.evaluate',{expression:'document.getElementById("annotation-form").requestSubmit()'});}else{await expect(editor.locator('#quote-preview')).toContainText('Иван Иванов');await editor.locator('#annotation-form button[type=submit]').click();}
  await expect.poll(async()=>Object.values((await state()).annotations).filter(a=>a.type==='text_highlight' && a.selection.exact.includes('Иван Иванов')).length,{timeout:30000}).toBe(1);
  results.steps.push('native highlight editor + disk annotation: PASS');
  await phase('DONE');await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}catch(error){results.error=error.message;await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));throw error;}finally{await context.close();fixture.server.close();}
