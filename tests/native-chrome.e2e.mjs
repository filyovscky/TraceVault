import {test,expect} from '@playwright/test';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';
test('installed Chrome 155: capture APIs, panel config, light/dark and 32 HiDPI layouts',async()=>{
  const run=Date.now(),profile=path.resolve('output/playwright/native-profile-'+run),context=await launch(profile,{installed:true}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,path.resolve('output/playwright/native-workspace-'+run));await panel.locator('#case-code').fill('CHROME-155');await panel.locator('#case-title').fill('Проверка установленного Chrome');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Дело создано');
    const source=await context.newPage();await source.goto(fixture.url+'/static');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await panel.locator('#refresh-source').click();await panel.locator('#capture-page').click();await expect(panel.locator('#status')).toContainText('Сохранено · EVD-000001',{timeout:25000});
    const options=await panel.evaluate(()=>chrome.sidePanel.getOptions({}));expect(options.path).toBe('panel.html');expect(options.enabled).toBe(true);
    const contexts=await panel.evaluate(()=>chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}));expect(contexts.length).toBe(1);
    const browserCDP=await context.browser().newBrowserCDPSession(),targets=await browserCDP.send('Target.getTargets',{filter:[{}]});
    console.log('NATIVE CHROME',await browserCDP.send('Browser.getVersion'),'TARGETS',targets.targetInfos.map(t=>({type:t.type,url:t.url})));
    await writeFile(path.resolve('output/playwright/native-targets.json'),JSON.stringify(targets,null,2));
    const own=await context.newCDPSession(panel),{targetInfo}=await own.send('Target.getTargetInfo');await own.detach();
    const side=targets.targetInfos.find(t=>t.type==='page' && t.url===panel.url() && t.targetId!==targetInfo.targetId);expect(side).toBeTruthy();
    const {sessionId}=await browserCDP.send('Target.attachToTarget',{targetId:side.targetId,flatten:false});let messageId=0;
    async function sideCommand(method,params={}) {
      const id=++messageId;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{browserCDP.off('Target.receivedMessageFromTarget',listener);reject(new Error('Side Panel CDP timeout: '+method));},10000);
        function listener(event) {if(event.sessionId!==sessionId)return;const msg=JSON.parse(event.message);if(msg.id!==id)return;clearTimeout(timer);browserCDP.off('Target.receivedMessageFromTarget',listener);if(msg.error)reject(new Error(msg.error.message));else resolve(msg.result);}
        browserCDP.on('Target.receivedMessageFromTarget',listener);browserCDP.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
      });
    }
    await sideCommand('Runtime.runIfWaitingForDebugger');
    const actual=await sideCommand('Runtime.evaluate',{expression:'({width:innerWidth,url:location.href,picker:typeof showDirectoryPicker,html:document.querySelector("header strong").textContent})',returnByValue:true});expect(actual.result.value.html).toBe('TraceVault');expect(actual.result.value.picker).toBe('function');
    await expect.poll(async()=>{const result=await sideCommand('Runtime.evaluate',{expression:'document.getElementById("folder-state").textContent',returnByValue:true});return result.result.value;},{timeout:15000}).toContain('Доступ к записи');
    await expect.poll(async()=>{const result=await sideCommand('Runtime.evaluate',{expression:'document.getElementById("status").textContent',returnByValue:true});return result.result.value;}).toBe('Рабочая папка подключена');
    await source.goto(fixture.url.replace('127.0.0.1','localhost')+'/side-panel-navigation');
    await expect.poll(async()=>{const result=await sideCommand('Runtime.evaluate',{expression:'document.getElementById("source-url").textContent',returnByValue:true});return result.result.value;}).toBe(source.url());
    await source.evaluate(()=>{history.pushState({},'','/side-panel-spa');document.title='Side Panel SPA';});
    await expect.poll(async()=>{const result=await sideCommand('Runtime.evaluate',{expression:'[document.getElementById("source-title").textContent,document.getElementById("source-url").textContent]',returnByValue:true});return result.result.value;}).toEqual(['Side Panel SPA',fixture.url.replace('127.0.0.1','localhost')+'/side-panel-spa']);
    const sidePng=await sideCommand('Page.captureScreenshot',{format:'png'});await writeFile(path.resolve('output/playwright/native-side-panel.png'),Buffer.from(sidePng.data,'base64'));await browserCDP.send('Target.detachFromTarget',{sessionId});
    const cdp=await context.newCDPSession(panel),layouts=[];
    await panel.locator('#close-details').click();
    for(const theme of ['light','dark'])for(const width of [320,360,420,520])for(const dpr of [1,1.25,1.5,2]){
      await panel.setViewportSize({width,height:1000});
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:dpr,mobile:false});
      await panel.locator('#settings-toggle').click();await panel.locator('#theme').selectOption(theme);await panel.locator('#settings-toggle').click();
      const metrics=await panel.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:Math.max(document.documentElement.scrollHeight,innerHeight),dpr:devicePixelRatio}));expect(metrics.width).toBe(width);expect(metrics.scroll).toBeLessThanOrEqual(width);expect(metrics.dpr).toBe(dpr);
      const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.height,scale:1}}),png=Buffer.from(screenshot.data,'base64');expect(png.readUInt32BE(16)).toBe(Math.round(width*dpr));
      await writeFile(path.resolve(`output/playwright/native-${theme}-${width}-${dpr}.png`),png);layouts.push({theme,...metrics,pixel_width:png.readUInt32BE(16)});
    }
    await writeFile(path.resolve('output/playwright/native-layouts.json'),JSON.stringify({browser:await browserCDP.send('Browser.getVersion'),layouts},null,2));await cdp.detach();await browserCDP.detach();
  }finally{await context.close();fixture.server.close();}
});
