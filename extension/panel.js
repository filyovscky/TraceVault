import {setting,openWorkspace,exclusive,readVerifiedFile,writeNew} from './storage.js';
import {listCases,createCase,loadState,recover,append,casePath} from './repository.js';
import {uuid,localTime,ENTITY_TYPES,normalize,assertWebTab,hostPattern,sha256,matchesDomain,recordUrls,citation,removeLegacyCaptureFilters} from './domain.js';
import {capture,selected,inject,broadcastAnnotations,saveAnnotation,saveEntity,updateAnnotation,verifyArtifact,exportCase,registerAnnotationSites,convertScreenshotToPdf} from './service.js';
import {t} from './i18n.js';
import {initControls,setActionLabel} from './icons.js';
const $=id=>document.getElementById(id);
initControls();
let root=null,workspace=null,cases=[],activeCase=null,state={captures:{},annotations:{},entities:{},refs:{},audit:[]},tab=null,view='captures',page=0,busy=false,controller=null,pending=null,selectedId=null,viewerUrl=null,dialogSaving=false;
let preferences={theme:'system',paused:false,hiddenAnnotationDomains:[],maxBytes:64*1024*1024,annotations:true};
const statuses={};
const sessionId=uuid();
let syncRevision=0,lastDeleted=null,sourceRevision=0,sourceTimer;
function status(message,error=false) {$('status').textContent=message;$('status').parentElement.dataset.error=String(error);const alert=document.querySelector('dialog[open] .dialog-error');if(alert){alert.hidden=!error;alert.textContent=error?message:'';}}
async function reportError(e){console.error('TraceVault:',e);status(errorText(e),true);if(root)try{await renderFolder();}catch{/* Keep the original error; source navigation stays independent. */}}
function errorText(e) {
  if(e.name==='AbortError') return "Operation cancelled";
  if(e.name==='QuotaExceededError') return "Insufficient space or quota exceeded. Free up space and try again.";
  if(e.name==='NotAllowedError') return "Workspace or site access is missing. Restore the corresponding permission.";
  if(e.name==='InvalidStateError') return "Chrome could not finish the file operation. Success is unconfirmed. Check the workspace files; selecting the folder again cannot repair damaged files.";
  return e.message || String(e);
}
function action(id,fn) {$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(reportError));}
function el(tag,text,cls) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function button(label,fn,text=false) {const b=el('button');if(label)setActionLabel(b,label,undefined,text);b.addEventListener('click',()=>Promise.resolve().then(fn).catch(reportError));return b;}
function field(dl,label,value,cls) {dl.append(el('dt',label),el('dd',value ?? '—',cls));}
function link(url,label) {const a=el('a',label);if(/^https?:\/\//u.test(url||'')){a.href=url;a.target='_blank';a.rel='noreferrer noopener';}return a;}
function context() {if(!root || !workspace || !activeCase) throw new Error("Choose a workspace folder and an active case");return {root,workspace,caseId:activeCase};}
async function readPreferences(){const stored=await setting('preferences');const cleaned=removeLegacyCaptureFilters(stored);if(stored && ('blockedDomains' in stored || 'allowedCaptureHosts' in stored))await setting('preferences',cleaned);preferences={...preferences,...cleaned};}
async function canWrite() {
  if(!root)throw new Error("Choose a workspace folder");
  const needsReconnect=!workspace || !activeCase,permission=await root.queryPermission({mode:'readwrite'});
  if(permission!=='granted'){
    await renderFolder();
    if(!navigator.userActivation.isActive)throw new Error("Chrome needs write access. Use Restore folder access at the top of the panel.");
    if(await root.requestPermission({mode:'readwrite'})!=='granted'){await renderFolder();throw new Error("Chrome denied write access. Use Restore folder access or select the same folder again.");}
    await connect(root);
  }else if(needsReconnect)await connect(root);
  await readPreferences();context();
}
async function refresh() {
  if(activeCase && root && await root.queryPermission({mode:'read'})==='granted') {const c=context(),fresh=await exclusive(()=>loadState(c.root,c.workspace,c.caseId));if(activeCase===c.caseId && root===c.root){state=fresh;await broadcastAnnotations(activeCase,state,preferences.annotations,preferences.hiddenAnnotationDomains);}}
  renderList();await renderFolder();
}
async function renderFolder() {
  $('setup').hidden=!!root;$('workspace-state').hidden=!root;
  if(!root) return;
  const permission=await root.queryPermission({mode:'readwrite'});
  $('folder-state').textContent=`${root.name} · ${permission==='granted'?"Read/write access":"Access required"}`;
  $('folder-state').title=$('folder-state').textContent;
  $('reauthorize').hidden=permission==='granted';
}
async function connect(handle,mode='workspace') {
  await exclusive(async()=>{
    const metadata=await openWorkspace(handle,mode),found=await listCases(handle,metadata);
    const recovered=await recover(handle,metadata,found);
    root=handle;workspace=metadata;cases=found;
    if(recovered)status(`Interrupted operations found: ${recovered}. Review the history and files.`,true);
  });
  const {activeContext}=await chrome.storage.local.get('activeContext'),saved=activeContext?.workspaceId===workspace.workspace_id?activeContext.caseId:await setting('activeCase');activeCase=cases.some(c=>c.case_id===saved)?saved:cases[0]?.case_id || null;
  await setCases();await refresh();if(!cases.length)$('case-dialog').showModal();
}
async function setCases(publish=true) {
  $('case-select').replaceChildren(...cases.map(c=>{const o=el('option',c.code+' · '+c.title);o.value=c.case_id;o.title=c.title;return o;}));
  if(activeCase){$('case-select').value=activeCase;$('case-select').title=cases.find(c=>c.case_id===activeCase)?.title || '';await setting('activeCase',activeCase);if(publish)await chrome.storage.local.set({activeCase,activeContext:{workspaceId:workspace.workspace_id,caseId:activeCase,owner:sessionId,revision:uuid()}});}
}
async function currentTab() {
  const window=await chrome.windows.getCurrent(),tabs=await chrome.tabs.query({active:true,windowId:window.id});
  if(tabs[0]?.url?.startsWith('chrome-extension:')) {
    const stored=await setting('sourceTab:'+window.id) || await setting('sourceTab');
    if(stored){const candidate=await chrome.tabs.get(stored).catch(()=>null);if(candidate?.windowId===window.id)return candidate;}
    return null;
  }
  return tabs[0] || null;
}
async function refreshSource() {
  const revision=++sourceRevision,source=await currentTab();if(revision!==sourceRevision)return;tab=source;
  $('source-title').textContent=tab?.title || "Open an HTTP/HTTPS site";$('source-url').textContent=tab?.url || "URL access has not been granted";$('source-url').title=tab?.url || '';
  if(tab && /^https?:/u.test(tab.url || ''))await setting('sourceTab:'+tab.windowId,tab.id);
  if(revision!==sourceRevision)return;
  let permitted=false;
  if(/^https?:/u.test(tab?.url || '')) permitted=await chrome.permissions.contains({origins:[hostPattern(tab.url)]});
  if(revision!==sourceRevision)return;
  $('site-state').textContent=permitted?"Annotation auto-restore is enabled":/^https?:/u.test(tab?.url || '')?"Click the TraceVault extension icon or use its shortcut to capture a new site.":"Open an HTTP/HTTPS site.";
  setActionLabel($('grant-site'),"Enable annotation restore for this site");
  $('grant-site').hidden=permitted || !/^https?:/u.test(tab?.url || '');
  $('site-annotations').hidden=!/^https?:/u.test(tab?.url || '');
  const siteHidden=/^https?:/u.test(tab?.url || '') && preferences.hiddenAnnotationDomains.includes(new URL(tab.url).hostname);
  setActionLabel($('site-annotations'),siteHidden?"Show annotations on this site":"Hide annotations on this site",siteHidden?'eye':'eye-off');
  if(activeCase && root && workspace && await root.queryPermission({mode:'read'})==='granted'){const c=context();try{const fresh=await exclusive(()=>loadState(c.root,c.workspace,c.caseId));if(revision!==sourceRevision)return;if(activeCase===c.caseId && root===c.root)state=fresh;}catch(e){await renderFolder();if(revision===sourceRevision)status(errorText(e),true);}}
  if(revision!==sourceRevision)return;
  if(source?.id) {
    try {await inject(source.id);if(revision!==sourceRevision)return;const data=await chrome.tabs.sendMessage(source.id,{type:'TV_RENDER',annotations:Object.values(state.annotations).filter(a=>a.source_url===source.url && !a.deleted),enabled:preferences.annotations && !siteHidden});if(revision===sourceRevision)Object.assign(statuses,data?.statuses);}catch { /* UI explains missing permission */ }
  }
  if(revision===sourceRevision)renderList();
}
async function runCapture(kind='page',command=null) {
  const requested=command?.tabId?await chrome.tabs.get(command.tabId):await currentTab();
  await canWrite();if(busy)throw new Error("Wait for the current capture");
  const c=context(),sourceId=requested?.id;if(command?.caseId)c.caseId=command.caseId;if(!sourceId)throw new Error("No source tab selected");
  if(!cases.some(item=>item.case_id===c.caseId))throw new Error("The queued case is missing from this workspace. Open its original folder or repeat the command.");
  const source=await chrome.tabs.get(sourceId);assertWebTab(source,preferences);if(source.url!==requested.url)throw new Error("The source changed while requesting access. Try again.");if(command?.sourceUrl && source.url!==command.sourceUrl)throw new Error("The tab URL changed after the command was queued");
  busy=true;controller=new AbortController();$('cancel').hidden=false;setBusy(true);
  try {
    const result=await capture({...c,tabId:sourceId,id:command?.id,imageUrl:command?.imageUrl,kind,settings:preferences,signal:controller.signal,onProgress:message=>status(t(message))});
    if(!['completed','partial'].includes(result.state)){status(`${t(result.state)} · ${result.error || "No verified file"}`,true);return result;}
    status(`${t(result.state)} · ${result.evidence_number} · ${result.artifacts[0].byte_length.toLocaleString('en-US')} bytes`);
    if(c.caseId===activeCase){await refresh();showCapture(result.capture_id);}return result;
  } finally {busy=false;controller=null;$('cancel').hidden=true;setBusy(false);await refresh();}
}
function setBusy(value) {for(const id of ['capture-page','capture-screen','capture-full','capture-pdf','archive-first','pick-root','change-root'])$(id).disabled=value;}
async function beginAnnotation(actionName,command=null) {
  const requested=command?.tabId?await chrome.tabs.get(command.tabId):await currentTab();await canWrite();const c=context(),sourceId=requested?.id;if(command?.caseId)c.caseId=command.caseId;
  let data=null;
  if(sourceId && actionName!=='manual'){const source=await chrome.tabs.get(sourceId);assertWebTab(source,preferences);if(source.url!==requested.url)throw new Error("The source changed while requesting access. Try again.");data=await selected(sourceId);}
  const sel=data?.selection;
  if(actionName!=='manual' && !sel?.exact) throw new Error("Select page text outside input fields and editors");
  if(command?.selectionText && sel.exact!==command.selectionText) throw new Error("The selection changed after opening the menu. Select the text again.");
  if(command?.selectionDigest && await sha256(new TextEncoder().encode(data.native_text ?? sel.exact))!==command.selectionDigest)throw new Error("The selection changed after opening the menu. Select the text again.");
  if(actionName==='highlight'){
    if(busy)throw new Error('Wait for the current operation');if(data.url!==requested.url)throw new Error('The source URL changed. Select the text again.');
    busy=true;setBusy(true);
    try{const annotation=await saveAnnotation({...c,tabId:sourceId,selection:sel,type:'text_highlight',note:''});await refresh();await refreshSource();if(c.caseId===activeCase)showAnnotation(annotation.annotation_id);status('Highlight saved. Use Edit to add an optional note.');await chrome.tabs.sendMessage(sourceId,{type:'TV_FEEDBACK',message:'Highlight saved. You can add a note in TraceVault.'}).catch(()=>{});return annotation;}
    finally{busy=false;setBusy(false);queueMicrotask(()=>processInbox().catch(reportError));}
  }
  pending={...c,tabId:actionName==='manual'?null:sourceId,selection:actionName==='manual'?null:sel,action:actionName,captureId:null,annotationId:null,sourceUrl:data?.url};
  $('annotation-title').textContent=actionName==='entity'?"Create entity":actionName==='manual'?"Free note":"Save selection";
  $('quote-preview').textContent=pending.selection?.exact || "Note without a quote";
  $('reference-state').textContent="Live page only; no archived evidence copy.";
  $('archive-first').hidden=actionName==='manual';$('annotation-note').value='';$('annotation-tags').value='';$('annotation-color').value='amber';
  $('entity-fields').hidden=actionName!=='entity';$('entity-label').value=sel?.exact || '';updateDuplicates();
  $('annotation-dialog').showModal();
}
function updateDuplicates() {
  const type=$('entity-type').value,value=normalize(type,$('entity-label').value);
  const candidates=Object.values(state.entities).filter(e=>e.entity_type===type && e.normalized_value===value);
  $('duplicate-info').textContent=candidates.length?`Matching values found: ${candidates.length}. Matching values do not prove identity.`:"No matching values in this case. Status: unconfirmed.";
  $('entity-existing').replaceChildren(Object.assign(el('option',"Create new (unconfirmed)"),{value:''}),...candidates.map(e=>Object.assign(el('option',"Link to "+e.label+' · '+e.entity_id),{value:e.entity_id})));
}
async function saveDialog(event) {
  event.preventDefault();if(!pending || dialogSaving)return;
  dialogSaving=true;const submit=$('annotation-form').querySelector('[type=submit]');submit.disabled=true;
  try{
  const p=pending,note=$('annotation-note').value;
  if(!p.selection?.exact && !note.trim()) throw new Error("Enter a note");
  if(p.tabId){const current=await chrome.tabs.get(p.tabId);if(current.url!==p.sourceUrl)throw new Error("The source changed. Open the editor again.");}
  const args={...p,note,color:$('annotation-color').value,type:p.action==='highlight'?'text_highlight':p.action==='note'||p.action==='manual'?'note':'quote'};
  let annotation;
  if(p.editId){await updateAnnotation(p.root,p.workspace,p.caseId,p.editId,{note,appearance:{color_token:args.color},tags:$('annotation-tags').value.split(',').map(s=>s.trim()).filter(Boolean)});}
  else {
    if(!p.annotationId){annotation=await saveAnnotation(args);p.annotationId=annotation.annotation_id;}else annotation=(await loadState(p.root,p.workspace,p.caseId)).annotations[p.annotationId];
    if($('annotation-tags').value)await updateAnnotation(p.root,p.workspace,p.caseId,annotation.annotation_id,{tags:$('annotation-tags').value.split(',').map(s=>s.trim()).filter(Boolean)});
    if(p.action==='entity')await saveEntity({...p,type:$('entity-type').value,label:$('entity-label').value,raw:p.selection.exact,annotationId:annotation.annotation_id,existingId:$('entity-existing').value || null});
  }
  await refresh();await refreshSource();status("Saved to case. Original HTML and PNG files are unchanged.");pending=null;$('annotation-dialog').close();
  }finally{dialogSaving=false;submit.disabled=false;}
}
function renderList() {
  $('collection-title').textContent={captures:'Materials',annotations:'Annotations',entities:'Entities',audit:'History'}[view];
  $('manual-note').hidden=view!=='annotations';
  const query=$('search').value.toLocaleLowerCase('en'),type=$('type-filter').value,filter=$('status-filter').value,domain=$('domain-filter').value.trim().toLowerCase(),date=$('date-filter').value;
  let rows=Object.values(state[view] || {});
  if(view==='annotations')rows=rows.filter(a=>!a.deleted);
  rows=rows.filter(r=>{
    if(query && !JSON.stringify(r).toLocaleLowerCase('en').includes(query))return false;
    if(view==='captures' && ((type && r.kind!==type) || (filter && r.state!==filter)))return false;
    const urls=recordUrls(r,state.refs);
    if(domain && !urls.some(url=>matchesDomain(url,domain)))return false;
    if($('current-page-only').checked && !urls.includes(tab?.url))return false;
    const at=r.times?.capture_started_at || r.created_at || r.recorded_at;
    return !date || (at && at.slice(0,10)>=date);
  }).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned) || (b.times?.capture_started_at || b.created_at || b.recorded_at || '').localeCompare(a.times?.capture_started_at || a.created_at || a.recorded_at || ''));
  const maxPage=Math.max(0,Math.ceil(rows.length/25)-1);page=Math.min(page,maxPage);$('list').replaceChildren();
  for(const row of rows.slice(page*25,page*25+25)) {
    const id=row.capture_id || row.annotation_id || row.entity_id || row.event_id,item=el('div',undefined,'item'+(selectedId===id?' selected':''));item.setAttribute('role','listitem');
    const b=button('',()=>view==='captures'?showCapture(row.capture_id):view==='annotations'?showAnnotation(row.annotation_id):view==='entities'?showEntity(row.entity_id):showAudit(row));b.className='item-button';
    let title,meta;
    if(view==='captures'){title=`${row.pinned?"Pinned · ":''}${row.evidence_number} · ${row.source.title}`;meta=`${row.kind==='webpage'?'HTML':row.capture_scope==='full_page'?"Full PNG":row.kind==='screenshot'?'PNG':"Image"} · ${t(row.state)} · ${localTime(row.times.capture_started_at)}\n${row.source.final_url}`;}
    else if(view==='annotations'){title=row.selection?.exact || row.note;meta=`${t(statuses[row.annotation_id] || row.reattachment_status)} · ${localTime(row.created_at)} · ${row.tags.join(', ')}`;}
    else if(view==='entities'){title=row.label;meta=`${row.entity_type} · unconfirmed · ${row.evidence_refs.length} sources · ${localTime(row.created_at)}`;}
    else {title=row.action;meta=localTime(row.recorded_at);}
    b.append(el('span',title,'item-title'),el('span',meta,'item-meta'));item.append(b);$('list').append(item);
  }
  if(!rows.length)$('list').append(el('p',activeCase?"No records match these filters.":"Choose a folder and create a case.",'empty'));
  $('page-number').textContent=`${page+1} / ${maxPage+1} · ${rows.length}`;$('previous').disabled=page===0;$('next').disabled=page===maxPage;
}
function details(title,id) {$('details').hidden=false;$('details-title').textContent=title;$('details-body').replaceChildren();selectedId=id;renderList();return $('details-body');}
function referenceDetails(container,ref) {
  if(!ref)return;
  const dl=el('dl');field(dl,"Reference status",t(ref.status));field(dl,"Quote",ref.quote);field(dl,'Reference ID',ref.reference_id);field(dl,'Capture ID',ref.capture_id);field(dl,'Artifact ID',ref.artifact_id);field(dl,"First seen",localTime(ref.observed_at));field(dl,'UTC',ref.observed_at);container.append(dl);
  if(ref.source_url)container.append(link(ref.source_url,"Open original URL"));
  if(ref.capture_id && state.captures[ref.capture_id]) {
    const cap=state.captures[ref.capture_id],artifact=cap.artifacts.find(a=>a.artifact_id===ref.artifact_id);
    if(artifact){const d=el('dl');field(d,"Path",artifact.relative_path);field(d,'SHA-256',artifact.sha256,'hash');container.append(d,button("Open archived HTML",()=>openArtifact(artifact)));}
  }
}
function showCapture(id) {
  const c=state.captures[id];if(!c)return;
  const box=details(c.evidence_number,id),dl=el('dl');
  field(dl,"Title",c.source.title);field(dl,"Status",t(c.state));field(dl,"Original URL",c.source.original_url);field(dl,"Final URL",c.source.final_url);
  for(const [key,label] of Object.entries({capture_started_at:"Capture started",capture_finished_at:"Acquisition finished",artifact_write_started_at:"File write started",artifact_written_at:"File written",record_created_at:"Record created",first_seen_at:"First seen"})) {field(dl,label,localTime(c.times[key]));if(c.times[key])field(dl,label+' · UTC',c.times[key]);}
  field(dl,"Clock",`${c.times.clock_source} · ${c.times.timezone_id} · offset ${c.times.local_offset_minutes} min. No independent timestamp.`);field(dl,'Capture ID',c.capture_id);field(dl,"Method",c.capture_method);field(dl,"Acquisition duration (monotonic)",c.duration_ms!=null?c.duration_ms+" ms":null);field(dl,"Previous version",c.previous_capture_id);if(c.error)field(dl,"Failed",c.error);if(c.viewport)field(dl,"Tab parameters",JSON.stringify({viewport:c.viewport,pixel_width:c.pixel_width,pixel_height:c.pixel_height,page_zoom:c.page_zoom}));box.append(dl,link(c.source.final_url,"Open source site"));
  const frames=el('details');frames.append(el('summary',`Source frames (${c.artifacts.filter(a=>a.kind==='screenshot_frame').length})`));if(c.artifacts.some(a=>a.kind==='screenshot_frame'))box.append(frames);
  for(const a of c.artifacts) {
    const parent=a.kind==='screenshot_frame'?frames:box;
    const d=el('dl');field(d,"File",a.relative_path);field(d,"Size",a.byte_length+" bytes");field(d,'SHA-256',a.sha256,'hash');field(d,"Write verification",a.verification_status);if(a.derivation)field(d,"Derived PDF",JSON.stringify(a.derivation));parent.append(d);
    const row=el('div',undefined,'actions');row.append(button(a.kind==='derived_pdf'?"Copy PDF path":"Open file",async()=>{if(a.kind==='derived_pdf'){await navigator.clipboard.writeText(a.relative_path);status("Workspace-relative PDF path copied. Open it from the workspace in your PDF viewer.");}else await openArtifact(a);}),button("Verify checksum",async()=>{const result=await verifyArtifact(root,workspace,c.case_id,a);status(result.ok?"SHA-256 verified by reading the file again":"Checksum MISMATCH. File changed: "+result.actual,!result.ok);}),button("Copy SHA-256",()=>navigator.clipboard.writeText(a.sha256)),button(a.kind==='derived_pdf'?"Export PDF":"Export original",()=>exportOriginal(a,c.case_id)));if(a.mime_type==='image/png' && a.kind!=='screenshot_frame')row.append(button("Create PDF",()=>convertPdf(c,a)));parent.append(row);
  }
  box.append(button("Copy citation",async()=>{await navigator.clipboard.writeText(citation(c));status("Citation copied: URL, UTC, Capture ID and SHA-256");}));
  const pin=button(c.pinned?"Unpin":"Pin",async()=>{await exclusive(async()=>{const fresh=await loadState(root,workspace,c.case_id);await append(root,workspace,c.case_id,'capture_pinned','captures',{...fresh.captures[id],pinned:!fresh.captures[id].pinned});});await refresh();showCapture(id);});box.append(pin);
  if(['failed','interrupted','cancelled','partial'].includes(c.state))box.append(button("Capture new version",async()=>{await refreshSource();if(tab?.url!==c.source.final_url)throw new Error("Open the source URL and click the TraceVault extension icon before retrying");await runCapture(c.capture_request || (c.kind==='webpage'?'page':c.kind==='screenshot'?'screen':'image'),{id:uuid(),tabId:tab.id,caseId:c.case_id,sourceUrl:c.source.final_url,imageUrl:c.image_source_url});}));
  if(c.warnings.length){box.append(el('h2',"Capture diagnostics"));const pre=el('pre',JSON.stringify(c.warnings,null,2));box.append(pre);}
  const refs=Object.values(state.refs).filter(r=>r.capture_id===id);if(refs.length)box.append(el('p',`Linked evidence references: ${refs.length}`));
}
function showAnnotation(id) {
  const a=state.annotations[id];if(!a)return;const box=details("Annotation",id);box.append(el('blockquote',a.selection?.exact || ''),el('p',a.note));const dl=el('dl');field(dl,"Created",localTime(a.created_at));field(dl,"Updated",localTime(a.updated_at));field(dl,"Anchor status",t(statuses[id] || a.reattachment_status));field(dl,"Tags",a.tags.join(', '));box.append(dl);referenceDetails(box,state.refs[a.reference_id]);
  const row=el('div',undefined,'actions');row.append(button("Edit",()=>editAnnotation(a)),button(a.hidden?"Show":"Hide",async()=>{await updateAnnotation(root,workspace,a.case_id,id,{hidden:!a.hidden});await refresh();await refreshSource();showAnnotation(id);}),button("Go to selection",async()=>{await refreshSource();if(tab?.url!==a.source_url)throw new Error("Open the original URL first");const result=await chrome.tabs.sendMessage(tab.id,{type:'TV_SCROLL',id});status(t(result.status));}),button("Delete annotation",async()=>{const c={...context(),caseId:a.case_id};await updateAnnotation(c.root,c.workspace,c.caseId,id,{deleted:true});lastDeleted={...c,id};$('undo-delete').hidden=false;await refresh();$('details').hidden=true;status("Annotation removed from the list. Undo is available.");}));box.append(row);
}
function editAnnotation(a) {
  pending={...context(),caseId:a.case_id,editId:a.annotation_id,selection:a.selection,action:'edit',tabId:null};$('annotation-title').textContent="Edit annotation";$('quote-preview').textContent=a.selection?.exact || "No quote";$('reference-state').textContent="The original evidence reference is preserved";$('archive-first').hidden=true;$('annotation-note').value=a.note;$('annotation-color').value=a.appearance.color_token;$('annotation-tags').value=a.tags.join(', ');$('entity-fields').hidden=true;$('annotation-dialog').showModal();
}
function showEntity(id) {
  const e=state.entities[id];if(!e)return;const box=details(e.label,id),dl=el('dl');field(dl,'Entity ID',e.entity_id);field(dl,"Type",e.entity_type);field(dl,"Original value",e.raw_value);field(dl,"Normalized value",e.normalized_value);field(dl,"Verification","Unconfirmed; confidence not assessed");field(dl,"Created",localTime(e.created_at));box.append(dl);
  for(const ref of e.evidence_refs)referenceDetails(box,state.refs[ref]);
  box.append(el('p',"Use Export case JSON to transfer data. Direct OSINTchart integration is not available in this version.",'muted'));
}
function showAudit(event) {details("History event",event.event_id).append(el('pre',JSON.stringify(event,null,2)));}
async function convertPdf(record,source){
  await canWrite();if(busy)throw new Error("Wait for the current operation");const c={...context(),caseId:record.case_id};busy=true;setBusy(true);status("Creating PDF from verified PNG…");
  try{const pdf=await convertScreenshotToPdf(c.root,c.workspace,c.caseId,record.capture_id,source.artifact_id,preferences);status("PDF written and verified: "+pdf.relative_path);if(activeCase===c.caseId){await refresh();showCapture(record.capture_id);}}finally{busy=false;setBusy(false);}
}
async function openArtifact(artifact) {
  const file=await readVerifiedFile(root,artifact);
  if(artifact.mime_type==='application/pdf')throw new Error("Open PDFs from the workspace in your PDF viewer");
 if(viewerUrl)URL.revokeObjectURL(viewerUrl);
  viewerUrl=URL.createObjectURL(new Blob([await file.arrayBuffer()],{type:artifact.mime_type}));$('viewer-content').replaceChildren();
  const node=document.createElement(artifact.mime_type==='text/html'?'iframe':'img');
  if(node.tagName==='IFRAME'){node.setAttribute('sandbox','');node.setAttribute('referrerpolicy','no-referrer');node.title="Isolated archived HTML preview";}else node.alt="Original image";
  node.src=viewerUrl;$('viewer-content').append(node);$('viewer').showModal();
}
async function exportOriginal(artifact,caseId) {
  const file=await readVerifiedFile(root,artifact),path=casePath(workspace,caseId)+`exports/${uuid()}__${artifact.relative_path.split('/').at(-1)}`;
  await exclusive(async()=>{await writeNew(root,path,file,artifact.mime_type);await append(root,workspace,caseId,'original_exported',null,null,{source:artifact.relative_path,relative_path:path});});status("Original copy written: "+path);
}
async function processInbox() {
  if(!activeCase || busy || $('annotation-dialog').open)return;
  const drained=await navigator.locks.request('tracevault-inbox:'+workspace.workspace_id,{ifAvailable:true},async lock=>{
    if(!lock)return;
    const values=await chrome.storage.local.get(null),commands=Object.entries(values).filter(([key])=>key.startsWith('command:')).sort((a,b)=>a[1].created_at.localeCompare(b[1].created_at));
    for(const [key,command] of commands) {
      if($('annotation-dialog').open || busy)break;
      if(command.workspaceId && command.workspaceId!==workspace.workspace_id)continue;
      const receiptCase=command.caseId || activeCase;
      if(!cases.some(c=>c.case_id===receiptCase)){status("This command belongs to another workspace. Repeat it in the correct case.",true);await chrome.storage.local.remove(key);continue;}
      // A durable receipt prevents reprocessing a selection command after a crash.
      const prior=await exclusive(()=>loadState(root,workspace,receiptCase));
      if(prior.audit.some(e=>e.action==='command_received' && e.details.command_id===command.id)){
        if(!prior.captures[command.id] && !prior.audit.some(e=>e.action==='command_completed' && e.details.command_id===command.id)){await exclusive(()=>append(root,workspace,receiptCase,'command_interrupted',null,null,{command_id:command.id,reason:"Interrupted before an evidence record was created. Repeat the action explicitly."}));status("Command interrupted before the evidence record. Repeat the action.",true);}
        await chrome.storage.local.remove(key);continue;
      }
      await exclusive(()=>append(root,workspace,receiptCase,'command_received',null,null,{command_id:command.id,session:sessionId}));
      try {if(['page','screen','image'].includes(command.action))await runCapture(command.action,command);else if(['delete-highlight','edit-highlight'].includes(command.action))await contextHighlight(command);else await beginAnnotation(command.action,command);await exclusive(()=>append(root,workspace,receiptCase,'command_completed',null,null,{command_id:command.id}));}
      catch(e){status(errorText(e),true);await chrome.tabs.sendMessage(command.tabId,{type:'TV_FEEDBACK',message:errorText(e),error:true}).catch(()=>{});await exclusive(()=>append(root,workspace,receiptCase,'command_failed',null,null,{command_id:command.id,error:errorText(e)}));}
      finally{await chrome.storage.local.remove(key);}
    }
    return true;
  });
  if(drained && !busy && !$('annotation-dialog').open){const values=await chrome.storage.local.get(null);if(Object.entries(values).some(([k,c])=>k.startsWith('command:') && (!c.workspaceId || c.workspaceId===workspace.workspace_id)))queueMicrotask(()=>processInbox().catch(e=>status(errorText(e),true)));}
}
async function contextHighlight(command){
  await canWrite();if(!command.annotationId)throw new Error('Right-click a visible TraceVault highlight to use this action.');
  const source=await chrome.tabs.get(command.tabId);if(source.url!==command.sourceUrl || source.url!==command.contextUrl)throw new Error('The source changed after opening the context menu.');
  const c={...context(),caseId:command.caseId},fresh=await exclusive(()=>loadState(c.root,c.workspace,c.caseId)),a=fresh.annotations[command.annotationId];
  if(!a || a.deleted || a.type!=='text_highlight' || a.source_url!==source.url)throw new Error('This highlight is no longer available in its original case.');
  if(command.action==='edit-highlight'){editAnnotation(a);return;}
  await updateAnnotation(c.root,c.workspace,c.caseId,a.annotation_id,{deleted:true});lastDeleted={...c,id:a.annotation_id};$('undo-delete').hidden=false;await refresh();await refreshSource();$('details').hidden=true;status('Highlight deleted. Undo is available.');
  await chrome.tabs.sendMessage(command.tabId,{type:'TV_FEEDBACK',message:'Highlight deleted. Undo is available in TraceVault.'}).catch(()=>{});
}
action('pick-root',async()=>{const handle=await showDirectoryPicker({mode:'readwrite',id:'tracevault'});await connect(handle,$('workspace-mode').value);status("Folder access verified by writing and reading a test file");});
action('change-root',async()=>{const handle=await showDirectoryPicker({mode:'readwrite',id:'tracevault'});await connect(handle);status("Workspace connected");});
action('reauthorize',async()=>{if(!root)throw new Error("Choose a workspace folder");if(await root.requestPermission({mode:'readwrite'})!=='granted'){await renderFolder();throw new Error("Chrome denied write access. Use Change workspace folder to select the same folder again.");}await connect(root);status("Folder access restored and verified by writing and reading");});
action('new-case',()=>{if(!root)throw new Error("Choose a folder first");$('case-dialog').showModal();});
$('case-form').addEventListener('submit',event=>{event.preventDefault();(async()=>{const c=await exclusive(()=>createCase(root,workspace,$('case-title').value,$('case-code').value));cases.push(c);activeCase=c.case_id;await setCases();await refresh();$('case-dialog').close();status("Case created");await processInbox();})().catch(reportError);});
$('case-select').addEventListener('change',()=>{(async()=>{activeCase=$('case-select').value;await setCases();await exclusive(()=>append(root,workspace,activeCase,'case_activated',null,null));page=0;$('details').hidden=true;await refresh();await refreshSource();})().catch(e=>status(errorText(e),true));});
action('refresh-source',refreshSource);
action('grant-site',async()=>{
  if(!/^https?:/u.test(tab?.url || ''))throw new Error("No HTTP/HTTPS URL available");
  const origin=hostPattern(tab.url);
  if(!await chrome.permissions.request({origins:[origin]}))throw new Error("Permission not granted");
  await registerAnnotationSites([origin]);await refreshSource();status("Site access granted");
});
action('capture-page',()=>runCapture('page'));action('capture-screen',()=>runCapture('screen'));action('capture-full',()=>runCapture('full'));action('capture-pdf',()=>runCapture('pdf'));action('cancel',()=>controller?.abort());
for(const name of ['highlight','quote','note','entity'])action('selection-'+name,()=>beginAnnotation(name));action('manual-note',()=>beginAnnotation('manual'));
action('archive-first',async()=>{if(!pending)return;const p=pending;const source=await chrome.tabs.get(p.tabId);if(source.url!==p.sourceUrl)throw new Error("URL changed");const result=await runCapture('page',{tabId:p.tabId,caseId:p.caseId,id:uuid()});if(!['completed','partial'].includes(result.state))throw new Error("Archive not verified");p.captureId=result.capture_id;$('reference-state').textContent=`Linked to ${result.evidence_number} · ${result.capture_id}`;});
$('annotation-form').addEventListener('submit',e=>saveDialog(e).catch(reportError));
$('entity-type').replaceChildren(...ENTITY_TYPES.map(type=>Object.assign(el('option',t(type)),{value:type})));$('entity-type').addEventListener('change',updateDuplicates);$('entity-label').addEventListener('input',updateDuplicates);
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('annotation-dialog').addEventListener('close',()=>processInbox().catch(e=>status(errorText(e),true)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;page=0;document.querySelectorAll('[data-view]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','page');renderList();}));
for(const id of ['search','type-filter','status-filter','domain-filter','date-filter'])$(id).addEventListener('input',()=>{page=0;renderList();});
action('previous',()=>{page--;renderList();});action('next',()=>{page++;renderList();});action('close-details',()=>{$('details').hidden=true;selectedId=null;renderList();});
action('close-viewer',()=>{$('viewer').close();});
$('viewer').addEventListener('close',()=>{$('viewer-content').replaceChildren();if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=null;});
action('export-case',async()=>{await canWrite();const path=await exportCase(root,workspace,cases.find(c=>c.case_id===activeCase));status("Export written to the workspace: "+path);await refresh();});
action('workspace',()=>chrome.tabs.create({url:chrome.runtime.getURL('panel.html?workspace=1')}));
action('settings-toggle',()=>{$('theme').value=preferences.theme;$('paused').checked=preferences.paused;$('annotations-toggle').checked=preferences.annotations;$('max-size').value=preferences.maxBytes/1024/1024;$('settings').showModal();$('settings-toggle').setAttribute('aria-expanded','true');});
$('settings').addEventListener('close',()=>{$('settings-toggle').setAttribute('aria-expanded','false');document.documentElement.dataset.theme=preferences.theme;});
action('shortcuts',()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
$('theme').addEventListener('change',()=>{document.documentElement.dataset.theme=$('theme').value;});
action('save-settings',async()=>{const mb=Number($('max-size').value);if(!Number.isFinite(mb) || mb<1 || mb>256)throw new Error("Limit: 1–256 MB");preferences={...preferences,theme:$('theme').value,paused:$('paused').checked,annotations:$('annotations-toggle').checked,maxBytes:mb*1024*1024};await setting('preferences',preferences);await broadcastAnnotations(activeCase,state,preferences.annotations,preferences.hiddenAnnotationDomains);await refreshSource();$('settings').close();status("Settings saved");});
async function toggleAnnotations(){preferences.annotations=!preferences.annotations;$('annotations-toggle').checked=preferences.annotations;await setting('preferences',preferences);await broadcastAnnotations(activeCase,state,preferences.annotations,preferences.hiddenAnnotationDomains);await refreshSource();status(preferences.annotations?'Annotations enabled':'Annotations hidden');}
action('site-annotations',async()=>{const host=new URL(tab.url).hostname;preferences.hiddenAnnotationDomains=preferences.hiddenAnnotationDomains.includes(host)?preferences.hiddenAnnotationDomains.filter(h=>h!==host):[...preferences.hiddenAnnotationDomains,host];await setting('preferences',preferences);await broadcastAnnotations(activeCase,state,preferences.annotations,preferences.hiddenAnnotationDomains);await refreshSource();});
action('undo-delete',async()=>{if(!lastDeleted)return;const c=lastDeleted;await updateAnnotation(c.root,c.workspace,c.caseId,c.id,{deleted:false});lastDeleted=null;$('undo-delete').hidden=true;await refresh();await refreshSource();status("Annotation restored in its original case");});
action('reset-filters',()=>{for(const id of ['search','type-filter','status-filter','domain-filter','date-filter'])$(id).value='';$('current-page-only').checked=false;page=0;renderList();});
$('current-page-only').addEventListener('change',()=>{page=0;renderList();});
const commandActions=[
  {id:'capture-page',label:"Save page as HTML"},
  {id:'capture-screen',label:"Capture visible area as PNG"},
  {id:'capture-full',label:"Capture full page as PNG"},
  {id:'capture-pdf',label:"Capture page as PDF (raster image)"},
  {id:'selection-highlight',label:"Highlight selected quote"},
  {id:'selection-entity',label:"Create entity from selection"},
  {id:'note',label:"Create free note",run:()=>beginAnnotation('manual')},
  {id:'search',label:"Find materials",run:()=>{$('search').focus();$('search').select();}},
  {id:'current-page',label:"Show only the current page",run:()=>{$('current-page-only').checked=true;page=0;renderList();}},
  {id:'reset-filters',label:"Reset all filters"},
  {id:'export-case',label:"Export case as JSON"},
  {id:'annotations',label:"Show or hide annotations",run:toggleAnnotations},
  {id:'settings-toggle',label:"Open settings"},
  {id:'shortcuts',label:"Configure Chrome keyboard shortcuts"}
];
function renderCommands(){
  const query=$('command-search').value.toLocaleLowerCase('en');
  const items=commandActions.filter(c=>c.label.toLocaleLowerCase('en').includes(query));
  $('command-results').replaceChildren(...items.map(command=>{const b=button(command.label,async()=>{$('command-dialog').close();if(command.run)await command.run();else $(command.id).click();},true);setActionLabel(b,command.label,$(command.id)?.dataset.icon || 'note',true);b.dataset.command=command.id;b.disabled=!!$(command.id)?.disabled || (command.id==='note' && busy);return b;}));
  if(!items.length)$('command-results').append(el('p',"No matching commands",'muted'));
}
function openCommands(){if(document.querySelector('dialog[open]'))return;renderCommands();$('command-dialog').showModal();$('command-search').focus();$('command-search').select();}
action('command-menu',openCommands);$('command-search').addEventListener('input',renderCommands);
$('command-dialog').addEventListener('keydown',e=>{
  const buttons=[...$('command-results').querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp'].includes(e.key) && buttons.length){e.preventDefault();buttons[index<0?(e.key==='ArrowDown'?0:buttons.length-1):(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
  if(e.key==='Enter' && document.activeElement===$('command-search') && buttons.length){e.preventDefault();buttons[0].click();}
});
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.ctrlKey && e.shiftKey && e.code==='Space' && !e.altKey && !e.metaKey){e.preventDefault();openCommands();return;}
  if(e.ctrlKey && e.key==='Enter' && $('annotation-dialog').open){e.preventDefault();$('annotation-form').requestSubmit();return;}
  if(e.key==='/' && !e.ctrlKey && !e.altKey && !e.metaKey && !document.querySelector('dialog[open]') && !e.target.closest('input,textarea,select,[contenteditable]')){e.preventDefault();$('search').focus();return;}
  if(e.key==='Escape' && busy && !document.querySelector('dialog[open]'))controller?.abort();
});
async function refreshShortcuts(){
  const commands=await chrome.commands.getAll();
  $('shortcut-list').replaceChildren(...commands.filter(c=>c.name!=='_execute_action' || c.shortcut).map(c=>{const line=el('p',undefined,'shortcut-line');line.append(el('span',c.description?.replace(/^TraceVault: /u,'') || 'Open TraceVault'),el('kbd',c.shortcut || "Not assigned"));return line;}));
  const labels={'capture-page':'capture-page','capture-screen':'capture-screen','add-highlight':'selection-highlight'};
  for(const c of commands)if(labels[c.name])setActionLabel($(labels[c.name]),c.shortcut?`${c.description} · ${c.shortcut}`:"Shortcut not assigned. Settings → Chrome keyboard shortcuts.");
}
action('refresh-shortcuts',refreshShortcuts);
window.addEventListener('focus',()=>refreshShortcuts().catch(()=>{}));
chrome.storage.onChanged.addListener(changes=>{
  if(Object.keys(changes).some(k=>k.startsWith('command:')))processInbox().catch(e=>status(errorText(e),true));
  const next=changes.activeContext?.newValue;
  if(next && next.owner!==sessionId && next.workspaceId===workspace?.workspace_id && next.caseId!==activeCase){
    const revision=++syncRevision;activeCase=next.caseId;page=0;$('details').hidden=true;
    (async()=>{const found=await exclusive(()=>listCases(root,workspace));if(revision!==syncRevision)return;cases=found;await setCases(false);await refresh();await refreshSource();if(pending)status("The case changed in another window. This editor will save to the original case.");})().catch(e=>status(errorText(e),true));
  }
});
function scheduleSource(){clearTimeout(sourceTimer);sourceTimer=setTimeout(()=>refreshSource().catch(e=>status(errorText(e),true)),80);}
chrome.tabs.onActivated.addListener(scheduleSource);
chrome.tabs.onUpdated.addListener((_id,info)=>{if(info.url || info.title || info.status)scheduleSource();});
chrome.tabs.onRemoved.addListener(scheduleSource);
window.addEventListener('focus',scheduleSource);
async function init() {
  if(new URL(location.href).searchParams.has('workspace'))document.body.classList.add('workspace');
  await readPreferences();document.documentElement.dataset.theme=preferences.theme;$('theme').value=preferences.theme;$('paused').checked=preferences.paused;$('max-size').value=preferences.maxBytes/1024/1024;$('annotations-toggle').checked=preferences.annotations;
  const handle=await setting('root');
  if(handle) {
    root=handle;
    if(await root.queryPermission({mode:'readwrite'})==='granted'){await connect(root);if($('status').textContent==="Initializing…")status(activeCase?"Workspace connected":"Workspace connected. Create a case");}
    else {await renderFolder();status("Chrome needs write access to the selected folder. Use Save page as HTML or Restore folder access.",true);}
  } else status("Choose a folder, then create a case");
  await refreshShortcuts();await refreshSource();await processInbox();
}
$('pick-root').disabled=true;
refreshSource().catch(()=>{});
init().catch(e=>status(errorText(e),true)).finally(()=>{$('pick-root').disabled=false;});
