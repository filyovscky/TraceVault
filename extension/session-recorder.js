import {setting,exclusive,writeNew,exists,readFile,readJSON,readVerifiedFile} from './storage.js';
import {append,appendLoaded,loadState,casePath} from './repository.js';
import {uuid,now,clock,sha256,VERSION} from './domain.js';
import {freezeSessionEvent,parseSessionEvent,sameSessionEvent} from './session-format.js';
import {pageAddress} from './visits.js';

const KEY='navigationRecorder';
const web=url=>/^https?:\/\//u.test(url || '');
let chain=Promise.resolve();
let ingressSession=null;
export const recorderIngress=()=>ingressSession;
export function serializeRecorder(task){const result=chain.then(()=>navigator.locks.request('tracevault-navigation-recorder',task));chain=result.catch(()=>{});return result;}
async function epoch(){const saved=await chrome.storage.session.get('navigationEpoch');if(saved.navigationEpoch)return saved.navigationEpoch;const id=uuid();await chrome.storage.session.set({navigationEpoch:id});return id;}
export async function recorderState(){return (await chrome.storage.local.get(KEY))[KEY] || null;}
function freezePending(state){let changed=false;for(let i=0;i<state.pending.length;i++)if(typeof state.pending[i]!=='string'){state.pending[i]=freezeSessionEvent(state.pending[i]);changed=true;}return changed;}
async function put(state){freezePending(state);await chrome.storage.local.set({[KEY]:state});}
function event(state,type,data={}){return {schema_version:1,event_id:uuid(),session_id:state.session_id,case_id:state.case_id,window_id:state.window_id,sequence:state.next_sequence++,type,observed_at:now(),time_context:clock(),...data};}
async function target(state){const saved=await setting('session-target:'+state.session_id);if(!saved?.root || saved.workspace?.workspace_id!==state.workspace_id || saved.caseId!==state.case_id)throw new Error('The original session workspace is unavailable. Reconnect its folder before retrying.');return saved;}
async function artifactFor(root,path,text,value){
  const expected=new TextEncoder().encode(text),expectedHash=await sha256(expected),preserved=[];
  // Only files without a committed audit receipt reach here. Never repair a
  // committed artifact this way, and never overwrite even an empty old file.
  for(let attempt=0;attempt<=8;attempt++){
    const candidate=attempt?path.replace(/\.json$/u,`__retry-${attempt}.json`):path;
    if(!await exists(root,candidate)){
      const artifact=await writeNew(root,candidate,text);
      return preserved.length?{...artifact,session_recovery:{reason:'uncommitted_invalid_file',preserved_files:preserved}}:artifact;
    }
    const file=await readFile(root,candidate);if(file.size>Math.max(expected.byteLength*4,1024*1024))throw new Error('Existing session event is unexpectedly large. Original preserved: '+candidate);
    const bytes=await file.arrayBuffer(),hash=await sha256(bytes);let actual;
    try{actual=parseSessionEvent(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch {preserved.push({relative_path:candidate,byte_length:bytes.byteLength,sha256:hash,status:'uncommitted_invalid_json',detected_at:now()});continue;}
    if(!sameSessionEvent(actual,value))throw new Error('Session event contains different event data. Original preserved; review required: '+candidate);
    return {artifact_id:value.event_id,relative_path:candidate,mime_type:'application/json',byte_length:bytes.byteLength,sha256:hash,verification_status:'verified_readback',recovered_existing:true,existing_representation:hash===expectedHash?'exact_payload':'equivalent_json',recovery_checked_at:now(),...(preserved.length?{session_recovery:{reason:'uncommitted_invalid_file',preserved_files:preserved}}:{})};
  }
  throw new Error('Too many interrupted session files. Originals preserved; review required: '+path);
}
async function flush(state){
  if(!state.pending.length)return;
  if(freezePending(state))await put(state);
  const saved=await target(state);
  await exclusive(async()=>{
    while(state.pending.length){
      const text=state.pending[0],value=parseSessionEvent(text),current=await loadState(saved.root,saved.workspace,saved.caseId);
      if(value.case_id!==state.case_id || value.session_id!==state.session_id)throw new Error('Pending event does not belong to the original session/case');
      const prior=current.audit.find(e=>e.action==='navigation_recorded' && e.details?.event?.event_id===value.event_id);
      if(prior){const file=await readVerifiedFile(saved.root,prior.details.artifact);if(!sameSessionEvent(parseSessionEvent(await file.text()),value) || !sameSessionEvent(prior.details.event,value))throw new Error('Committed session event conflicts with pending data. Original preserved.');}
      else{
        const path=casePath(saved.workspace,saved.caseId)+`sessions/${state.session_id}/${String(value.sequence).padStart(6,'0')}-${value.event_id}.json`,artifact=await artifactFor(saved.root,path,text,value);
        await appendLoaded(saved.root,saved.workspace,saved.caseId,current,'navigation_recorded',null,null,{session_id:state.session_id,event:value,artifact});
      }
      state.pending.shift();state.saved++;await put(state);
    }
  });
}
async function fail(state,error){
  if(ingressSession===state.session_id)ingressSession=null;
  if(state.status==='recording' || state.status==='starting')state.pending.push(event(state,'session_stopped',{reason:'save_error',error:error.message}));
  state.status='save_error';state.error=error.message;state.tabs={};await put(state);
}
async function commit(state,values){
  state.pending.push(...values);
  try{await put(state);await flush(state);}catch(e){await fail(state,e);throw e;}
}
async function finish(state,reason){
  if(ingressSession===state.session_id)ingressSession=null;
  state.status='stopping';state.tabs={};await commit(state,[event(state,'session_stopped',{reason})]);state.status='stopped';state.error=null;await put(state);return state;
}
async function current(){
  const state=await recorderState();if(!state)return null;
  if(['recording','starting','stopping'].includes(state.status) && state.epoch!==await epoch()){
    try{await finish(state,'browser_or_extension_restarted');}catch{/* Pending records remain explicit. */}
    return null;
  }
  return state.status==='recording'?state:null;
}
export async function initializeRecorder(){
  const state=await recorderState();if(!state){ingressSession=null;return;}
  if(['starting','stopping'].includes(state.status)){
    try{await finish(state,'interrupted');}catch{/* Retry is exposed by the UI. */}
  }else {
    const active=await current();if(!active){ingressSession=null;return;}
    const window=await chrome.windows.get(active.window_id).catch(()=>null);
    if(!window){try{await finish(active,'window_closed');}catch{/* Retry is exposed by the UI. */}return;}
    if(active.pending.length)try{await flush(active);}catch(e){await fail(active,e);}
    if(active.status==='recording')ingressSession=active.session_id;
  }
}
export async function startRecorder({sessionId,windowId,sourceTabId}){
  if((await setting('preferences'))?.paused)throw new Error('Capture is paused. Resume it in Settings before recording a session.');
  await initializeRecorder();const previous=await recorderState();
  if(previous && (previous.status==='recording' || previous.pending.length))throw new Error('Stop the current session or save its pending events first.');
  const window=await chrome.windows.get(windowId);if(window.incognito || window.type!=='normal')throw new Error('Choose a normal, non-incognito Chrome window.');
  const [active]=await chrome.tabs.query({windowId,active:true});let initial=active;
  // A workspace tab may refer to the source already shown in its Current page
  // section. Never enumerate or initialize the other tabs in the window.
  if(active?.url?.startsWith(chrome.runtime.getURL('')) && Number.isInteger(sourceTabId))initial=await chrome.tabs.get(sourceTabId).catch(()=>null);
  if(initial?.windowId!==windowId || initial?.incognito || !web(initial?.url))initial=null;
  const saved=await setting('session-target:'+sessionId);if(!saved?.root || !saved.workspace || !saved.caseId)throw new Error('Choose a connected case before starting a session.');
  const metadata=await readJSON(saved.root,'workspace.json');if(metadata.workspace_id!==saved.workspace.workspace_id)throw new Error('The session workspace changed. Reconnect it and try again.');
  await loadState(saved.root,saved.workspace,saved.caseId);
  const state={session_id:sessionId,window_id:windowId,case_id:saved.caseId,workspace_id:saved.workspace.workspace_id,case_label:saved.caseLabel,status:'starting',epoch:await epoch(),started_at:now(),next_sequence:1,saved:0,pending:[],tabs:{},active_tab_id:initial?.id || null,error:null};
  await commit(state,[event(state,'session_started',{case_label:state.case_label,collector_version:VERSION,scope:'one_window',content_archived:false})]);
  state.status='recording';await put(state);ingressSession=state.session_id;
  if(initial){
    state.tabs[initial.id]={url:initial.url,title:initial.title || ''};
    await commit(state,[event(state,'tab_snapshot',{tab_id:initial.id,url:initial.url,title:initial.title || ''})]);
  }
  await put(state);return state;
}
export async function stopRecorder(){const state=await current();if(!state)throw new Error('No browsing session is recording.');return finish(state,'user_stopped');}
export async function retryRecorder(){const state=await recorderState();if(!state)return null;try{await flush(state);if(state.status==='save_error'){state.status='stopped';state.error=null;await put(state);}return state;}catch(e){await fail(state,e);throw e;}}
async function scopedTab(state,tabId){const tab=await chrome.tabs.get(tabId).catch(()=>null);return tab?.windowId===state.window_id && !tab.incognito?tab:null;}
export async function recordTabActivated(tabId,windowId,receivedSession){
  const state=await current();if(!state || state.session_id!==receivedSession || windowId!==state.window_id)return;
  const tab=await scopedTab(state,tabId);if(!tab || !tab.active || !web(tab.url))return;
  if(state.active_tab_id===tabId && pageAddress(state.tabs[tabId]?.url)===pageAddress(tab.url))return;
  state.active_tab_id=tabId;state.tabs[tabId]={url:tab.url,title:tab.title || ''};
  await commit(state,[event(state,'tab_activated',{tab_id:tabId,url:tab.url,title:tab.title || ''})]);
}
export async function recordNavigation(kind,details){
  if(details.frameId!==0 || kind==='fragment')return;
  const state=await current();if(!state || details.receivedSession!==state.session_id || details.observedWindowId!==state.window_id)return;
  const tab=await scopedTab(state,details.tabId);if(!tab || !web(details.url))return;
  const previous=state.tabs[tab.id] || {};
  // History API is also how SPA links navigate. Keep a changed page address,
  // but do not journal same-address state replacement or anchor movement.
  if(kind==='history_state' && pageAddress(previous.url)===pageAddress(details.url))return;
  const value=event(state,'navigation',{observed_at:details.observedAt,tab_id:tab.id,url:details.url,previous_url:previous.url || null,title:tab.url===details.url && tab.status==='complete'?tab.title || '':'',navigation_method:kind==='history_state'?'history_api':'document',browser_timestamp:details.timeStamp,document_id:details.documentId || null,transition_type:details.transitionType || null,transition_qualifiers:details.transitionQualifiers || []});
  state.tabs[tab.id]={url:details.url,title:value.title};if(tab.active)state.active_tab_id=tab.id;await commit(state,[value]);
}
export async function recordTabEntered(tabId,windowId,reason){
  const state=await current();if(!state || windowId!==state.window_id)return;
  const tab=await scopedTab(state,tabId);if(!tab)return;
  state.tabs[tab.id]={url:web(tab.url)?tab.url:null,title:web(tab.url)?tab.title || '':null};
  if(web(tab.url))await commit(state,[event(state,'tab_entered',{tab_id:tab.id,url:tab.url,title:tab.title || '',reason})]);else await put(state);
}
export async function recordTabLeft(tabId,windowId,reason){
  const state=await current();if(!state || windowId!==state.window_id)return;
  const previous=state.tabs[tabId];delete state.tabs[tabId];
  if(previous?.url)await commit(state,[event(state,'tab_left',{tab_id:tabId,url:previous.url,title:previous.title || '',reason})]);else await put(state);
}
export async function recordLinkTarget(details){
  const state=await current();if(!state)return;
  const tab=await scopedTab(state,details.tabId);if(!tab || !web(details.url))return;
  const source=await scopedTab(state,details.sourceTabId);if(!source || !web(source.url))return;
  await commit(state,[event(state,'link_target',{tab_id:tab.id,url:details.url,source_tab_id:source.id,source_url:source.url,source_frame_id:details.sourceFrameId,browser_timestamp:details.timeStamp})]);
}
export async function recordWindowClosed(windowId){const state=await current();if(state?.window_id===windowId)await finish(state,'window_closed');}
export async function exportSession(root,workspace,caseId,sessionId){
  return exclusive(async()=>{
    const state=await loadState(root,workspace,caseId),records=state.audit.filter(e=>e.action==='navigation_recorded' && e.details.session_id===sessionId).sort((a,b)=>a.details.event.sequence-b.details.event.sequence);
    if(!records.length)throw new Error('No saved session events in this case.');
    const events=[];for(const record of records){const bytes=await readVerifiedFile(root,record.details.artifact);events.push({event:JSON.parse(await bytes.text()),artifact:record.details.artifact});}
    const artifact=await writeNew(root,casePath(workspace,caseId)+`exports/${uuid()}__session.json`,{schema_version:1,format:'tracevault-navigation-session',session_id:sessionId,exported_at:now(),events});
    await append(root,workspace,caseId,'navigation_exported',null,null,{session_id:sessionId,artifact});return artifact;
  });
}
