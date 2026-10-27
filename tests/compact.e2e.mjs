import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,extensionPage,chooseDirectory} from './browser-helpers.mjs';
import {fixtureServer} from './fixture-server.mjs';

test('strip PNG: exact text/color/alpha pixels, size fallback, abort and limit',async()=>{
  test.setTimeout(90000);const context=await launch(path.resolve('output/playwright/png-codec-profile-'+Date.now()));
  try{
    const panel=await extensionPage(context),results=await panel.evaluate(async()=>{
      const {encodePNG,smallerPNG}=await import('./png.js'),{sha256}=await import('./domain.js'),rows=[];
      for(const kind of ['text','gradient','noise','alpha']){
        const c=document.createElement('canvas');c.width=801;c.height=1101;const x=c.getContext('2d');
        if(kind==='alpha'){x.fillStyle='#7539b780';x.fillRect(0,0,600,900);x.clearRect(0,0,20,20);}
        else if(kind==='noise'){const d=x.createImageData(c.width,c.height);let seed=17;for(let i=0;i<d.data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d.data[i+j]=seed>>>24;}d.data[i+3]=255;}x.putImageData(d,0,0);}
        else {const g=x.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,'#c04068');g.addColorStop(1,'#305897');x.fillStyle=kind==='gradient'?g:'#f6f6f6';x.fillRect(0,0,c.width,c.height);x.fillStyle='#202020';x.font='11px sans-serif';for(let y=15;y<c.height;y+=18)x.fillText('Fine text 0123456789 @example.com • Unicode Ω 漢字',10,y);}
        const original=await sha256(x.getImageData(0,0,c.width,c.height).data),direct=await encodePNG(c,{opaque:kind!=='alpha'}),bitmap=await createImageBitmap(direct.blob),check=document.createElement('canvas');check.width=bitmap.width;check.height=bitmap.height;check.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
        const optimized=await smallerPNG(c,{opaque:kind!=='alpha'});rows.push({kind,equal:original===await sha256(check.getContext('2d').getImageData(0,0,c.width,c.height).data),...optimized.encoding,peak:direct.peakStripBytes});c.width=c.height=check.width=check.height=1;
      }
      const c=document.createElement('canvas');c.width=100;c.height=100;const controller=new AbortController();controller.abort();let abort,limit;
      try{await encodePNG(c,{signal:controller.signal});}catch(e){abort=e.name;}
      try{await encodePNG(c,{maxBytes:10});}catch(e){limit=e.message;}
      return {rows,abort,limit};
    });
    for(const r of results.rows){expect(r.equal,r.kind).toBe(true);expect(r.saved_png_bytes).toBeLessThanOrEqual(r.source_png_bytes);expect(r.peak).toBeLessThan(2*1024*1024);}
    expect(results.abort).toBe('AbortError');expect(results.limit).toContain('size limit');await writeFile('output/playwright/png-codec.json',JSON.stringify(results,null,2));console.log('PNG CODEC',JSON.stringify(results));
  }finally{await context.close();}
});

async function diskBytes(dir){let total=0;for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);total+=entry.isDirectory()?await diskBytes(p):(await stat(p)).size;}return total;}
for(const installed of [false,true])test('compact/source-frame captures preserve identical pixels and old files'+(installed?' — installed Chrome':''),async()=>{
  test.setTimeout(180000);const run=Date.now(),directory=path.resolve('output/playwright/compact-workspace-'+run),context=await launch(path.resolve('output/playwright/compact-profile-'+run),{installed,nativeViewport:true}),fixture=await fixtureServer();
  try{
    const panel=await extensionPage(context);await chooseDirectory(panel,directory);await panel.locator('#case-title').fill('Compact captures');await panel.locator('#create-case').click();await expect(panel.locator('#case-dialog')).not.toBeVisible();await panel.evaluate(()=>chrome.sidePanel.setOptions({enabled:false}));
    const source=await context.newPage();await source.goto(fixture.url+'/fixed-wide');await source.bringToFront();await source.evaluate(()=>scrollTo(0,177));
    const captures=[];let previousBytes=await diskBytes(directory);
    for(const storage of ['source_frames','compact']){
      await panel.locator('#settings-toggle').click();await panel.locator('#screenshot-storage').selectOption(storage);await panel.locator('#save-settings').click();await expect(panel.locator('#settings')).not.toBeVisible();
      await panel.locator('#capture-full').click();await expect(panel.locator('#status')).toContainText('EVD-00000'+(captures.length+1),{timeout:90000});
      const record=await panel.evaluate(async()=>{const s=await import('./storage.js'),r=await import('./repository.js'),root=await s.setting('root'),w=await s.readJSON(root,'workspace.json'),id=await s.setting('activeCase');return Object.values((await s.exclusive(()=>r.loadState(root,w,id))).captures).at(-1);});
      const png=record.artifacts.find(a=>a.kind==='full_page_png');expect(record.frame_storage).toBe(storage==='compact'?'not_retained':'source_frames');expect(record.artifacts.filter(a=>a.kind==='screenshot_frame').length).toBe(storage==='compact'?0:record.frames.length);if(storage==='compact'){expect(record.artifacts).toHaveLength(1);expect(record.frames.every(f=>f.retained===false && !f.artifact_id)).toBe(true);expect(record.image_encoding.lossless).toBe(true);}
      const pixels=await panel.evaluate(async a=>{const s=await import('./storage.js'),{sha256}=await import('./domain.js'),b=await createImageBitmap(await s.readVerifiedFile(await s.setting('root'),a)),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);b.close();const hash=await sha256(x.getImageData(0,0,c.width,c.height).data);c.width=c.height=1;return hash;},png);
      for(const a of record.artifacts){const bytes=await readFile(path.join(directory,a.relative_path));expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256);}
      const currentBytes=await diskBytes(directory);captures.push({storage,pixels,record,totalWorkspaceBytesAdded:currentBytes-previousBytes,artifactBytes:record.artifacts.reduce((n,a)=>n+a.byte_length,0)});previousBytes=currentBytes;
    }
    expect(captures[0].pixels).toBe(captures[1].pixels);expect(captures[1].artifactBytes).toBeLessThan(captures[0].artifactBytes);expect(captures[1].totalWorkspaceBytesAdded).toBeLessThan(captures[0].totalWorkspaceBytesAdded);
    for(const a of captures[0].record.artifacts)expect(createHash('sha256').update(await readFile(path.join(directory,a.relative_path))).digest('hex')).toBe(a.sha256);
    await panel.getByRole('button',{name:'Create PDF',exact:true}).click();await expect(panel.locator('#status')).toContainText('PDF written and verified',{timeout:30000});
    await panel.reload();await expect(panel.locator('#case-select')).toHaveValue(captures[1].record.case_id);await panel.locator('#settings-toggle').click();await expect(panel.locator('#screenshot-storage')).toHaveValue('compact');await panel.setViewportSize({width:320,height:900});await mkdir('docs/qa',{recursive:true});await panel.screenshot({path:`docs/qa/0.5.1-storage-settings-${installed?'installed':'cft'}.png`});
    await writeFile(`output/playwright/compact-${installed?'installed':'cft'}.json`,JSON.stringify({directory,captures},null,2));console.log('COMPACT',captures.map(({record:r,...c})=>({...c,pngBytes:r.artifacts[0].byte_length,frames:r.frames.length,encoding:r.image_encoding})));
  }finally{await context.close();fixture.server.close();}
});
