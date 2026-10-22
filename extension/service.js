import {VERSION, now, uuid, clock, assertWebTab, makeExport, normalize, sha256,locateQuote} from './domain.js';
import {writeNew, readFile, readVerifiedFile, exclusive} from './storage.js';
import {fullScreenshot,screenshot} from './screenshot.js';
import {pngToPdf} from './pdf.js';
import {append, casePath, loadState} from './repository.js';
import {snapshotDocument, buildArchive} from './capture.js';

export async function inject(tabId) {await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
export async function selected(tabId) {await inject(tabId);return chrome.tabs.sendMessage(tabId,{type:'TV_SELECTION'});}
export async function registerAnnotationSites(origins) {
  for(const origin of origins)if(!await chrome.permissions.contains({origins:[origin]}))throw new Error("Annotation restore permission missing: "+origin);
  const registered=await chrome.scripting.getRegisteredContentScripts(),matches=[...new Set(registered.flatMap(s=>s.matches).concat(origins))];
  if(registered.length)await chrome.scripting.unregisterContentScripts({ids:registered.map(s=>s.id)});
  await chrome.scripting.registerContentScripts([{id:'tracevault-annotations',matches,js:['content.js'],runAt:'document_idle',persistAcrossSessions:true}]);
}
export async function broadcastAnnotations(caseId,state,enabled,hiddenDomains=[]) {
  const values=await chrome.storage.local.get('annotationCache'),cache=values.annotationCache || {};
  cache[caseId]=Object.values(state.annotations).filter(a=>!a.deleted);
  await chrome.storage.local.set({annotationCache:cache,annotationsEnabled:enabled,hiddenAnnotationDomains:hiddenDomains});
  const tabs=await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'TV_RENDER',annotations:cache[caseId].filter(a=>a.source_url===tab.url),enabled:enabled && !hiddenDomains.some(host=>{try{return new URL(tab.url).hostname===host;}catch{return false;}})})));
}
export async function capture({root,workspace,caseId,tabId,id=uuid(),kind='page',imageUrl=null,settings={},signal,onProgress=()=>{}}) {
  return exclusive(async()=>{
    const tab=await chrome.tabs.get(tabId);assertWebTab(tab,settings);
    let state=await loadState(root,workspace,caseId);
    if(state.captures[id]) return state.captures[id];
    const sequence=Object.keys(state.captures).length+1;
    const start=now(),monotonic=performance.now();
    let record={schema_version:1,capture_id:id,evidence_number:'EVD-'+String(sequence).padStart(6,'0'),case_id:caseId,kind:kind==='page'?'webpage':kind==='image'?'image':'screenshot',capture_request:kind,source:{original_url:tab.url,final_url:tab.url,title:tab.title || tab.url,origin:new URL(tab.url).origin},times:{capture_started_at:start,first_seen_at:Object.values(state.captures).find(c=>c.source.original_url===tab.url)?.times.first_seen_at || start,...clock()},state:'queued',capture_status:'pending',collector_version:VERSION,artifacts:[],warnings:[],previous_capture_id:Object.values(state.captures).filter(c=>c.source.final_url===tab.url).at(-1)?.capture_id || null};
    const save=async(action,patch)=>{record={...record,...patch};await append(root,workspace,caseId,action,'captures',record);onProgress(record.state);};
    await save('capture_started',{state:'capturing'});
    let hidden=false;
    try {
      signal?.throwIfAborted();await inject(tabId);hidden=true;await chrome.tabs.sendMessage(tabId,{type:'TV_HIDE',hidden:true});
      await new Promise(resolve=>setTimeout(resolve,100));
      let payload,mime,ext,folder,metadata={};
      if(kind==='page') {
        const [{result:snapshot}]=await chrome.scripting.executeScript({target:{tabId},func:snapshotDocument,args:[settings.maxBytes || 64*1024*1024]});
        if(!snapshot || snapshot.error)throw new Error(snapshot?.error || "Chrome returned no DOM. The tab may be closed or discarded.");
        if(snapshot.url!==tab.url) throw new Error("URL changed while reading the DOM. Repeat the capture.");
        const archive=await buildArchive(snapshot,{signal,maxBytes:settings.maxBytes,onProgress});
        payload=archive.html;mime='text/html';ext='html';folder='captures';metadata={viewport:snapshot.viewport,user_agent:snapshot.user_agent,capture_method:'tracevault-dom-inline-v1'};
        record.warnings=archive.diagnostics;
      } else if(kind==='image') {
        if(!/^https?:\/\//u.test(imageUrl || '')) throw new Error("Image has no HTTP/HTTPS source; it may use a blob or data URL");
        const response=await fetch(imageUrl,{credentials:'include',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error("Image fetch failed: HTTP "+response.status);
        mime=(response.headers.get('content-type') || '').split(';')[0];
        const extensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','image/avif':'avif','image/bmp':'bmp','image/x-icon':'ico'};
        ext=extensions[mime];if(!ext)throw new Error("Unsupported image MIME type: "+mime);
        const reader=response.body.getReader(),chunks=[];let bytes=0;
        try {for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>(settings.maxBytes || 64*1024*1024))throw new Error("Image exceeds the size limit");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
        payload=new Blob(chunks,{type:mime});folder='attachments';metadata={capture_method:'original-image-fetch',image_source_url:imageUrl,image_final_url:response.url};
      } else if(['full','pdf'].includes(kind)) {
        let bytes=0;const limit=settings.maxBytes || 64*1024*1024;
        const full=await fullScreenshot(tab,{signal,onProgress,onFrame:async(blob,frame)=>{
          signal?.throwIfAborted();bytes+=blob.size;if(bytes>limit)throw new Error("Frames exceed the size limit");
          const artifact=await writeNew(root,casePath(workspace,caseId)+`screenshots/${id}__frame${String(frame.index).padStart(3,'0')}.png`,blob,'image/png');artifact.capture_id=id;artifact.kind='screenshot_frame';
          record.times.artifact_write_started_at ||= artifact.artifact_write_started_at;
          await save('frame_written',{artifacts:[...record.artifacts,artifact],frames:[...(record.frames || []),{...frame,artifact_id:artifact.artifact_id,sha256:artifact.sha256}]});
          return {artifact_id:artifact.artifact_id,sha256:artifact.sha256};
        }});
        if(bytes+full.blob.size>limit)throw new Error("Frames and full PNG exceed the size limit");
        payload=full.blob;mime='image/png';ext='png';folder='screenshots';metadata=full.metadata;record.warnings=full.warnings;
      } else {
        const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active.id!==tabId) throw new Error("Keep the source tab active during screenshot capture");
        const [{result:viewport}]=await chrome.scripting.executeScript({target:{tabId},func:()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,url:location.href})});
        if(viewport.url!==tab.url) throw new Error("URL changed before screenshot capture");
        const png=await screenshot(tab,signal);
        const [after]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(after.id!==tabId) throw new Error("Active tab changed during screenshot capture");
        payload=png;mime='image/png';ext='png';folder='screenshots';
        const bitmap=await createImageBitmap(payload);metadata={viewport,pixel_width:bitmap.width,pixel_height:bitmap.height,page_zoom:await chrome.tabs.getZoom(tabId),capture_method:'chrome.tabs.captureVisibleTab'};bitmap.close();
      }
      signal?.throwIfAborted();
      const final=await chrome.tabs.get(tabId);if(final.url!==tab.url) throw new Error("Page URL changed before capture completed");
      record.times.capture_finished_at=now();record.duration_ms=Math.round(performance.now()-monotonic);Object.assign(record,metadata);
      const wallElapsed=Date.parse(record.times.capture_finished_at)-Date.parse(start);
      if(wallElapsed<0 || Math.abs(wallElapsed-record.duration_ms)>2000) {
        record.warnings.push({type:'clock_anomaly',reason:"System clock changed during the operation",wall_elapsed_ms:wallElapsed,monotonic_elapsed_ms:record.duration_ms});
        await append(root,workspace,caseId,'clock_anomaly',null,null,{capture_id:id,wall_elapsed_ms:wallElapsed,monotonic_elapsed_ms:record.duration_ms});
      }
      await save('capture_writing',{state:'writing'});
      const payloadBytes=payload instanceof Blob?payload.size:new TextEncoder().encode(payload).byteLength;
      if(payloadBytes+record.artifacts.reduce((n,a)=>n+a.byte_length,0)>(settings.maxBytes || 64*1024*1024))throw new Error("Capture materials exceed the size limit");
      const path=casePath(workspace,caseId)+`${folder}/${id}.${ext}`;
      const artifact=await writeNew(root,path,payload,mime);artifact.capture_id=id;artifact.kind=kind==='page'?'single_html':kind==='image'?'original_image':['full','pdf'].includes(kind)?'full_page_png':'viewport_png';
      record.times.artifact_write_started_at ||= artifact.artifact_write_started_at;record.times.artifact_written_at=artifact.written_at;record.times.record_created_at=now();
      await save('artifact_written',{state:'verifying',artifacts:[artifact,...record.artifacts]});
      if(kind==='pdf'){
        onProgress("Converting full PNG to PDF…");
        const pdf=await writePdf(root,workspace,record,artifact,payload,settings.maxBytes || 64*1024*1024,signal);
        record.times.artifact_written_at=pdf.written_at;await save('pdf_created',{artifacts:[artifact,pdf,...record.artifacts.filter(a=>a.artifact_id!==artifact.artifact_id)]});
      }
      signal?.throwIfAborted();
      await save('capture_completed',{state:record.warnings.length?'partial':'completed',capture_status:record.warnings.length?'partial':'complete'});
      return record;
    } catch(e) {
      const patch={state:signal?.aborted?'cancelled':'failed',capture_status:'error',error:e.message};
      try {await save('capture_failed',patch);} catch { /* disk failure: pending event remains recoverable */ }
      throw e;
    } finally {if(hidden) await chrome.tabs.sendMessage(tabId,{type:'TV_HIDE',hidden:false}).catch(()=>{});}
  });
}
async function writePdf(root,workspace,record,source,png,limit,signal) {
  const used=record.artifacts.reduce((n,a)=>n+a.byte_length,0),converted=await pngToPdf(png,{captureId:record.capture_id,sourceUrl:record.source.final_url,sourceSha256:source.sha256,capturedAt:record.times.capture_started_at,signal,maxBytes:Math.max(0,limit-used)});
  signal?.throwIfAborted();const artifact=await writeNew(root,casePath(workspace,record.case_id)+`exports/${uuid()}__${record.capture_id}.pdf`,converted.blob,'application/pdf');
  return {...artifact,capture_id:record.capture_id,kind:'derived_pdf',derivation:{source_artifact_id:source.artifact_id,source_sha256:source.sha256,method:converted.method,page_count:converted.pageCount,searchable_text:false}};
}
export async function convertScreenshotToPdf(root,workspace,caseId,captureId,artifactId,settings={}) {
  return exclusive(async()=>{
    const state=await loadState(root,workspace,caseId),record=state.captures[captureId],source=record?.artifacts.find(a=>a.artifact_id===artifactId);
    if(!source || source.mime_type!=='image/png' || source.kind==='screenshot_frame')throw new Error("Select a saved PNG");
    const png=await readVerifiedFile(root,source),prior=record.artifacts.find(a=>a.kind==='derived_pdf' && a.derivation?.source_artifact_id===artifactId);
    if(prior){await readVerifiedFile(root,prior);return prior;}
    const pdf=await writePdf(root,workspace,record,source,png,settings.maxBytes || 64*1024*1024);
    await append(root,workspace,caseId,'pdf_created','captures',{...record,artifacts:[...record.artifacts,pdf]});return pdf;
  });
}
export async function saveAnnotation({root,workspace,caseId,tabId,selection,note='',type='text_highlight',color='amber',author='local',captureId=null}) {
  return exclusive(async()=>{
    const tab=tabId ? await chrome.tabs.get(tabId) : null;
    if(tab) assertWebTab(tab);
    const state=await loadState(root,workspace,caseId),existing=captureId ? state.captures[captureId] : null;
    // Do not silently attach a live quote to an older archive merely because URL matches.
    const archived=existing && ['completed','partial'].includes(existing.state) ? existing : null;
    const artifact=archived?.artifacts.find(a=>a.kind==='single_html');
    if(artifact && selection?.exact) {
      const doc=new DOMParser().parseFromString(await (await readFile(root,artifact.relative_path)).text(),'text/html');
      doc.querySelectorAll('script,style,noscript,textarea,input,[contenteditable="true"],[data-tracevault-ui]').forEach(n=>n.remove());
      if(locateQuote(doc.body.textContent,selection).status!=='attached')throw new Error("The quote is not uniquely located in the archive. Save it as live_only or repeat the capture.");
    }
    const ref={schema_version:1,reference_id:uuid(),case_id:caseId,source_url:tab?.url || archived?.source.final_url || null,capture_id:artifact ? archived.capture_id : null,artifact_id:artifact?.artifact_id || null,quote:selection?.exact || '',selection:selection || null,status:artifact?'archived':'live_only',observed_at:now(),time_context:clock(),attribution:'mentions',verification:'unconfirmed'};
    const timestamp=now(),annotation={schema_version:1,annotation_id:uuid(),case_id:caseId,source_url:ref.source_url,capture_id:ref.capture_id,reference_id:ref.reference_id,type,selection:selection || null,appearance:{color_token:color},note,tags:[],author,created_at:timestamp,updated_at:timestamp,reattachment_status:selection?'pending':'not_applicable',hidden:false,deleted:false};
    await append(root,workspace,caseId,'evidence_reference_created','refs',ref);
    await append(root,workspace,caseId,'annotation_created','annotations',annotation);
    return annotation;
  });
}
export async function updateAnnotation(root,workspace,caseId,id,patch) {
  return exclusive(async()=>{
    const state=await loadState(root,workspace,caseId),old=state.annotations[id];if(!old) throw new Error("Annotation not found");
    const next={...old,note:patch.note??old.note,tags:patch.tags??old.tags,appearance:patch.appearance??old.appearance,hidden:patch.hidden??old.hidden,deleted:patch.deleted??old.deleted,updated_at:now()};
    await append(root,workspace,caseId,'annotation_updated','annotations',next);return next;
  });
}
export async function saveEntity({root,workspace,caseId,type,label,raw,annotationId,existingId=null}) {
  if(!label.trim()) throw new Error("Enter an entity value");
  return exclusive(async()=>{
    const state=await loadState(root,workspace,caseId),annotation=state.annotations[annotationId];if(!annotation) throw new Error("A source quote or note is required");
    const ref=state.refs[annotation.reference_id],existing=existingId?state.entities[existingId]:null;
    if(existingId && !existing) throw new Error("Existing entity not found");
    const timestamp=now(),entity=existing ? {...existing,evidence_refs:[...new Set([...existing.evidence_refs,ref.reference_id])],updated_at:timestamp} : {schema_version:1,entity_id:uuid(),case_id:caseId,entity_type:type,label:label.trim(),raw_value:raw,normalized_value:normalize(type,label),verification:'unconfirmed',confidence:null,evidence_refs:[ref.reference_id],created_at:timestamp,updated_at:timestamp,status:'unresolved'};
    await append(root,workspace,caseId,existing?'entity_source_added':'entity_created','entities',entity);return entity;
  });
}
export async function verifyArtifact(root,workspace,caseId,artifact) {
  return exclusive(async()=>{
    const file=await readFile(root,artifact.relative_path),actual=await sha256(await file.arrayBuffer()),ok=actual===artifact.sha256 && file.size===artifact.byte_length;
    await append(root,workspace,caseId,'hash_verified',null,null,{artifact_id:artifact.artifact_id,expected:artifact.sha256,actual,ok});return {ok,actual};
  });
}
export async function exportCase(root,workspace,caseInfo) {
  return exclusive(async()=>{
    const state=await loadState(root,workspace,caseInfo.case_id),data=makeExport(state,caseInfo),path=casePath(workspace,caseInfo.case_id)+`exports/${uuid()}__tracevault-osintchart-export.json`;
    await writeNew(root,path,data);await append(root,workspace,caseInfo.case_id,'case_exported',null,null,{relative_path:path});return path;
  });
}
