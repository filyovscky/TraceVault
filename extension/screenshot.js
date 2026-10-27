import {now} from './domain.js';
import {captureLayout} from './capture-layout.js';
import {smallerPNG} from './png.js';
export const MAX_PIXELS=24_000_000;
export function planTiles(width,height,vw,vh,dpr=1) {
  if(![width,height,vw,vh,dpr].every(n=>Number.isFinite(n) && n>0))throw new Error("Invalid page dimensions");
  const pw=Math.ceil(width*dpr),ph=Math.ceil(height*dpr);
  if(pw>30000 || ph>30000 || pw*ph>MAX_PIXELS)throw new Error("Full page exceeds the limit: 24 million pixels or a 30000 px side");
  const axis=(extent,viewport)=>{const end=Math.max(0,extent-viewport),positions=[];for(let n=0;n<end;n+=Math.max(1,viewport-2))positions.push(n);positions.push(end);return positions;};
  // Two CSS pixels overlap compensates for rounded CSS viewport dimensions
  // and fractional zoom without resampling captured pixels or leaving gaps.
  const tiles=[];for(const y of axis(height,vh))for(const x of axis(width,vw))tiles.push({x,y});
  if(tiles.length>64)throw new Error("Full page requires more than 64 frames");
  return {tiles,width:pw,height:ph};
}
export async function pageGeometry(tabId,position=null) {
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},func:async position=>{
    if(position){window.scrollTo({left:position.x,top:position.y,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
    const d=document.scrollingElement;
    return {url:location.href,width:d.scrollWidth,height:d.scrollHeight,vw:innerWidth,vh:innerHeight,cw:d.clientWidth,ch:d.clientHeight,dpr:devicePixelRatio,x:scrollX,y:scrollY};
  },args:[position]});
  if(!result)throw new Error("Could not measure the page");return result;
}
export async function screenshot(tab,signal) {
  const assertActive=async()=>{const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==tab.id || (await chrome.tabs.get(tab.id)).url!==tab.url)throw new Error("Tab or URL changed during screenshot capture");};
  await assertActive();const {lastScreenshotAt=0}=await chrome.storage.session.get('lastScreenshotAt');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,600-(Date.now()-lastScreenshotAt))));signal?.throwIfAborted();await assertActive();
  await chrome.storage.session.set({lastScreenshotAt:Date.now()});
  const url=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});await assertActive();signal?.throwIfAborted();return (await fetch(url)).blob();
}
export async function fullScreenshot(tab,{signal,onFrame,onProgress=()=>{},compact=true,maxBytes}) {
  const original=await pageGeometry(tab.id),plan=planTiles(original.width,original.height,original.cw,original.ch,original.dpr),frames=[];
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:compact});if(!ctx)throw new Error("Canvas is unavailable");
  let sx,sy,adjustments,result,failure,overlayPixels=0;const token=crypto.randomUUID(),overlays=[];
  const consistent=g=>{if(g.url!==original.url || ['width','height','vw','vh','cw','ch','dpr'].some(k=>Math.abs(g[k]-original[k])>0.01))throw new Error("Page geometry, zoom or URL changed. Full-page capture stopped.");};
  try{
    adjustments=await captureLayout(tab.id,'prepare',{token});consistent(await pageGeometry(tab.id));
    for(const [index,tile] of plan.tiles.entries()){
      signal?.throwIfAborted();onProgress(`Full capture: frame ${index+1}/${plan.tiles.length}`);
      const before=await pageGeometry(tab.id,tile);consistent(before);
      if(Math.abs(before.x-tile.x)>1 || Math.abs(before.y-tile.y)>1)throw new Error("The site restricted scrolling (scroll-snap or nested container). Full-page capture stopped.");
      const presentation=await captureLayout(tab.id,'frame',{token,x:before.x,y:before.y,maxX:Math.max(0,original.width-original.cw),maxY:Math.max(0,original.height-original.ch)});
      const started=now(),blob=await screenshot(tab,signal),after=await pageGeometry(tab.id);consistent(after);
      await captureLayout(tab.id,'inspect',{token});
      if(Math.abs(after.x-before.x)>0.1 || Math.abs(after.y-before.y)>0.1)throw new Error("Scroll position changed during a frame");
      const bitmap=await createImageBitmap(blob);
      try{
        const measuredX=bitmap.width/original.vw,measuredY=bitmap.height/original.vh;
        if(Math.abs(measuredX-measuredY)>0.01 || Math.abs(bitmap.width-original.vw*original.dpr)>2 || Math.abs(bitmap.height-original.vh*original.dpr)>2)throw new Error("Chrome screenshot size does not match the page viewport/DPR. Disable viewport emulation and retry.");
        // innerWidth/innerHeight are rounded CSS integers. Dividing the bitmap
        // by them accumulates errors on long pages at fractional zoom. Use DPR
        // for document coordinates and preserve each captured pixel 1:1.
        const rx=original.dpr,ry=original.dpr;
        if(sx!==undefined && (Math.abs(sx-rx)>0.001 || Math.abs(sy-ry)>0.001))throw new Error("Frame dimensions changed");sx=rx;sy=ry;
        // Native screenshot ratios, including page zoom, determine actual pixels.
        if(index===0){const actual=planTiles(original.width,original.height,original.vw,original.vh,Math.max(sx,sy));canvas.width=Math.ceil(original.width*sx);canvas.height=Math.ceil(original.height*sy);if(canvas.width*canvas.height>MAX_PIXELS || actual.width>30000)throw new Error("Screenshot exceeds the pixel limit");ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}
        const x=Math.round(before.x*sx),y=Math.round(before.y*sy),w=Math.min(bitmap.width,Math.round(original.cw*sx),canvas.width-x),h=Math.min(bitmap.height,Math.round(original.ch*sy),canvas.height-y);
        ctx.drawImage(bitmap,0,0,w,h,x,y,w,h);
        // Retain original screenshot pixels around the one visible occurrence.
        // Final overlapping tiles must not erase a header already captured once.
        for(const rect of presentation.visible){
          const px=Math.max(0,Math.floor((rect.left-8)*sx)),py=Math.max(0,Math.floor((rect.top-8)*sy)),right=Math.min(w,Math.ceil((rect.right+8)*sx)),bottom=Math.min(h,Math.ceil((rect.bottom+8)*sy));
          const pw=right-px,ph=bottom-py;if(pw<=0 || ph<=0)continue;
          overlayPixels+=pw*ph;if(overlayPixels>MAX_PIXELS)throw new Error('Fixed overlay area exceeds the full-page capture limit');
          overlays.push({bitmap:await createImageBitmap(bitmap,px,py,pw,ph),fixed_id:rect.id,frame_index:index,source:{x:px,y:py,width:pw,height:ph},destination:{x:x+px,y:y+py,width:pw,height:ph}});
        }
        const frame={index,scroll_x:before.x,scroll_y:before.y,pixel_x:x,pixel_y:y,pixel_width:bitmap.width,pixel_height:bitmap.height,capture_started_at:started,capture_finished_at:now(),stitch_rect:{source:{x:0,y:0,width:w,height:h},destination:{x,y,width:w,height:h}},presentation:{method:'fixed-once-sticky-flow-v1',fixed_visible:presentation.visible.map(r=>r.id),fixed_hidden:presentation.hidden,sticky_in_flow:presentation.sticky_in_flow}};
        Object.assign(frame,await onFrame(blob,frame));frames.push(frame);
      }finally{bitmap.close();}
    }
    signal?.throwIfAborted();consistent(await pageGeometry(tab.id));
    for(const overlay of overlays){ctx.drawImage(overlay.bitmap,overlay.destination.x,overlay.destination.y);overlay.bitmap.close();}
    const optimized=compact?await smallerPNG(canvas,{opaque:true,signal,maxBytes}):null;
    const blob=optimized?.blob || await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error("Could not assemble the full PNG");
    result={blob,metadata:{capture_scope:'full_page',viewport:{width:original.vw,height:original.vh,dpr:original.dpr},document_size:{width:original.width,height:original.height},pixel_width:canvas.width,pixel_height:canvas.height,frames,original_scroll:{x:original.x,y:original.y},page_zoom:await chrome.tabs.getZoom(tab.id),capture_method:'tracevault-scroll-stitch-v2',screenshot_adjustments:{...adjustments,fixed_overlays:overlays.map(({bitmap:_,...data})=>data)}},warnings:[{type:'sequential_capture',reason:"Full capture is sequential; hidden, virtualized and unloaded content is not guaranteed."},...(adjustments.fixed_roots || adjustments.sticky_in_flow?[{type:'layout_normalized',reason:`Viewport-fixed elements shown once: ${adjustments.fixed_roots}; sticky elements captured in natural flow: ${adjustments.sticky_in_flow}. Temporary presentation changes are described in capture metadata.`}]:[]),...(adjustments.scan_limited?[{type:'layout_scan_limited',reason:'Only the first 20000 document elements were inspected for fixed/sticky presentation.'}]:[])]};
    if(optimized)result.metadata.image_encoding=optimized.encoding;
  }catch(e){failure=e;}finally{
    for(const overlay of overlays)overlay.bitmap.close();
    canvas.width=canvas.height=1;
    let cleanupError;
    try{const restored=await captureLayout(tab.id,'restore',{token});if(result)result.metadata.screenshot_adjustments.restoration=restored;}catch(e){cleanupError=e;}
    try{if((await chrome.tabs.get(tab.id).catch(()=>null))?.url===original.url)await pageGeometry(tab.id,{x:original.x,y:original.y});}catch(e){cleanupError ||= e;}
    if(cleanupError && !failure)failure=new Error('Could not restore full-page presentation. Refresh the source tab. '+cleanupError.message);
  }
  if(failure)throw failure;return result;
}
