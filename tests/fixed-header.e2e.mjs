import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {launch,extensionPage,chooseDirectory,invokeExtension} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

async function state(panel){return panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return s.exclusive(()=>r.loadState(root,w,id));});}
async function presentation(source){return source.evaluate(()=>({scroll:{x:scrollX,y:scrollY},header:{position:getComputedStyle(document.querySelector('header')).position,opacity:getComputedStyle(document.querySelector('header')).opacity,transition:document.querySelector('header').style.getPropertyValue('transition-property')},footer:{opacity:document.querySelector('footer').style.getPropertyValue('opacity'),priority:document.querySelector('footer').style.getPropertyPriority('opacity'),transition:document.querySelector('footer').style.transition},sticky:{position:getComputedStyle(document.querySelector('.sticky')).position,top:getComputedStyle(document.querySelector('.sticky')).top,inline:document.querySelector('.sticky').getAttribute('style')},text:document.body.innerText}));}
async function pixels(panel,artifact){return panel.evaluate(async a=>{const s=await import('./storage.js'),b=await createImageBitmap(await s.readVerifiedFile(await s.setting('root'),a)),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);b.close();const rows=ctx.getImageData(10,0,1,c.height).data;let blue=0,purple=0,yellow=0;const errors=[];for(let y=0;y<c.height;y++){const rgb=[...rows.slice(y*4,y*4+3)],expected=y<80?[37,71,201]:y>=c.height-32?[129,59,181]:y>=400 && y<440?[228,170,19]:Math.floor(y/100)%2?[35,113,79]:[191,52,42];if(String(rgb)==='37,71,201')blue++;if(String(rgb)==='129,59,181')purple++;if(String(rgb)==='228,170,19')yellow++;if(String(rgb)!==String(expected) && errors.length<6)errors.push({y,rgb,expected});}const badge=[...ctx.getImageData(c.width-15,110,1,1).data].slice(0,3);return {width:c.width,height:c.height,blue,purple,yellow,errors,badge};},artifact);}

for(const installed of [false,true])test(`fixed header once, full seam coverage and restored presentation${installed?' — installed Chrome':''}`,async()=>{
  test.setTimeout(150000);const run=Date.now(),out=path.resolve('output/fixed-header-'+run),context=await launch(path.join(out,'profile'),{installed,nativeViewport:true}),fixture=await fixtureServer();await mkdir(out,{recursive:true});
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,path.join(out,'workspace'));await panel.locator('#case-code').fill('FIXED');await panel.locator('#case-title').fill('Fixed header regression');await panel.locator('#case-form button[type=submit]').click();await expect(panel.locator('#status')).toHaveText('Case created');
    const source=await context.newPage(),cdp=await context.newCDPSession(source),{windowId}=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:1400,height:950}});
    await panel.locator('#settings-toggle').click();await panel.locator('#screenshot-storage').selectOption('source_frames');await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();
    const results=[];
    for(const fixturePath of ['/fixed-wide','/fixed-short']){
      await source.goto(fixture.url+fixturePath);await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await source.evaluate(()=>scrollTo(111,177));const before=await presentation(source);
      await panel.locator('#capture-full').click();await expect(panel.locator('#status')).toContainText('EVD-00000'+(results.length+1),{timeout:90000});const records=Object.values((await state(panel)).captures),record=records.at(-1),artifact=record.artifacts.find(a=>a.kind==='full_page_png');expect(record.state).toBe('partial');expect(record.capture_method).toBe('tracevault-scroll-stitch-v2');expect(record.screenshot_adjustments.fixed_roots).toBe(3);expect(record.screenshot_adjustments.sticky_in_flow).toBe(1);expect(record.screenshot_adjustments.covered_fixed_descendants).toBe(1);expect(record.screenshot_adjustments.local_fixed_excluded).toBe(fixturePath.includes('short')?0:1);
      const result=await pixels(panel,artifact);expect(result.errors).toEqual([]);expect(result.blue).toBe(80);expect(result.purple).toBe(32);expect(result.yellow).toBe(40);expect(result.badge).toEqual([18,195,195]);expect(record.screenshot_adjustments.fixed_overlays).toHaveLength(3);for(let id=0;id<3;id++)expect(record.frames.filter(f=>f.presentation.fixed_visible.includes(id))).toHaveLength(1);
      const after=await presentation(source);expect(after).toEqual(before);expect(await source.locator('header').evaluate(n=>n.style.color)).toBe('rgb(255, 0, 255)');
      for(const a of record.artifacts){const bytes=await readFile(path.join(out,'workspace',a.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);}
      const reconstructed=await panel.evaluate(async record=>{
        const s=await import('./storage.js'),root=await s.setting('root'),canvas=document.createElement('canvas');canvas.width=record.pixel_width;canvas.height=record.pixel_height;const ctx=canvas.getContext('2d',{alpha:false}),bitmaps=[];ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        try{for(const frame of record.frames){const a=record.artifacts.find(a=>a.artifact_id===frame.artifact_id),b=await createImageBitmap(await s.readVerifiedFile(root,a));bitmaps.push(b);const r=frame.stitch_rect;ctx.drawImage(b,r.source.x,r.source.y,r.source.width,r.source.height,r.destination.x,r.destination.y,r.destination.width,r.destination.height);}
          for(const patch of record.screenshot_adjustments.fixed_overlays){const b=bitmaps[patch.frame_index],a=patch.source,d=patch.destination;ctx.drawImage(b,a.x,a.y,a.width,a.height,d.x,d.y,d.width,d.height);}
          const {sha256}=await import('./domain.js'),actual=await sha256(ctx.getImageData(0,0,canvas.width,canvas.height).data),b=await createImageBitmap(await s.readVerifiedFile(root,record.artifacts.find(a=>a.kind==='full_page_png')));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(b,0,0);b.close();return actual===await sha256(ctx.getImageData(0,0,canvas.width,canvas.height).data);
        }finally{bitmaps.forEach(b=>b.close());}
      },record);expect(reconstructed).toBe(true);
      await writeFile(path.join(out,fixturePath.slice(1)+'.png'),await readFile(path.join(out,'workspace',artifact.relative_path)));results.push({fixture:fixturePath,pixels:result,record});
      await panel.locator('#close-details').click();
    }
    await writeFile(path.resolve(`output/fixed-header-${installed?'installed':'cft'}-latest.json`),JSON.stringify({directory:out,results},null,2));
    // Real cancellation/size failure must restore styles, priorities and scroll.
    await source.goto(fixture.url+'/fixed-wide');await source.bringToFront();await invokeExtension(context,source,new URL(panel.url()).host);await source.evaluate(()=>scrollTo(111,177));const before=await presentation(source);
    for(const mode of ['cancel','size']){
      const error=await panel.evaluate(async mode=>{const s=await import('./storage.js'),svc=await import('./service.js'),root=await s.setting('root'),workspace=await s.readJSON(root,'workspace.json'),caseId=await s.setting('activeCase'),[tab]=await chrome.tabs.query({active:true,currentWindow:true}),controller=new AbortController();try{await svc.capture({root,workspace,caseId,tabId:tab.id,kind:'full',signal:controller.signal,settings:mode==='size'?{maxBytes:100}:{},onProgress:message=>{if(mode==='cancel' && message.includes('frame 2/'))controller.abort();}});return 'BAD';}catch(e){return {name:e.name,message:e.message};}},mode);
      if(mode==='cancel')expect(error.name).toBe('AbortError');else expect(error.message).toContain('limit');expect(await presentation(source)).toEqual(before);
    }
  }finally{await context.close();fixture.server.close();}
});
