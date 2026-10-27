import {setting,exclusive,writeNew,exists,readFile,readJSON,readVerifiedFile} from './storage.js';
import {append,appendLoaded,loadState,casePath} from './repository.js';
import {uuid,now,clock,sha256,VERSION} from './domain.js';

const KEY='navigationRecorder';
const web=url=>/^https?:\/\//u.test(url || '');
let chain=Promise.resolve();
export function serializeRecorder(task){const result=chain.then(()=>navigator.locks.request('tracevault-navigation-recorder',task));chain=result.catch(()=>{});return result;}
async function epoch(){const saved=await chrome.storage.session.get('navigationEpoch');if(saved.navigationEpoch)return saved.navigationEpoch;const id=uuid();await chrome.storage.session.set({navigationEpoch:id});return id;}
export async function recorderState(){return (await chrome.storage.local.get(KEY))[KEY] || null;}
async function put(state){await chrome.storage.local.set({[KEY]:state});}
function event(state,type,data={}){return {schema_version:1,event_id:uuid(),session_id:state.session_id,case_id:state.case_id,window_id:state.window_id,sequence:state.next_sequence++,type,observed_at:now(),time_context:clock(),...data};}
async function target(state){const saved=await setting('session-target:'+state.session_id);if(!saved?.root || saved.workspace?.workspace_id!==state.workspace_id || saved.caseId!==state.case_id)throw new Error('The original session workspace is unavailable. Reconnect its folder before retrying.');return saved;}
async function artifactFor(root,path,value){
  if(!await exists(root,path))return writeNew(root,path,value);
  const file=await readFile(root,path),expected=new TextEncoder().encode(JSON.stringify(value,null,2)),hash=await sha256(await file.arrayBuffer());
  if(file.size!==expected.byteLength || hash!==await sha256(expected))throw new Error('Session event already exists with different bytes: '+path);
  return {artifact_id:value.event_id,relative_path:path,mime_type:'application/json',byte_length:file.size,sha256:hash,verification_status:'verified_readback',recovered_existing:true};
}
async function flush(state){
  if(!state.pending.length)return;
  const saved=await target(state);
  await exclusive(async()=>{
    while(state.pending.length){
      const value=state.pending[0],current=await loadState(saved.root,saved.workspace,saved.caseId);
      const prior=current.audit.find(e=>e.action==='navigation_recorded' && e.details?.event?.event_id===value.event_id);
      if(prior)await readVerifiedFile(saved.root,prior.details.artifact);
      else{
        const path=casePath(saved.workspace,saved.caseId)+`sessions/${state.session_id}/${String(value.sequence).padStart(6,'0')}-${value.event_id}.json`,artifact=await artifactFor(saved.root,path,value);
        await appendLoaded(saved.root,saved.workspace,saved.caseId,current,'navigation_recorded',null,null,{session_id:state.session_id,event:value,artifact});
      }
      state.pending.shift();state.saved++;await put(state);
    }
  });
}
async function fail(state,error){
  if(state.status==='recording' || state.status==='starting')state.pending.push(event(state,'session_stopped',{reason:'save_error',error:error.message}));
  state.status='save_error';state.error=error.message;state.tabs={};await put(state);
}
async function commit(state,values){
  state.pending.push(...values);
  try{await put(state);await flush(state);}catch(e){await fail(state,e);throw e;}
}
async function finish(state,reason){
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
  const state=await recorderState();if(!state)return;
  if(['starting','stopping'].includes(state.status)){
    try{await finish(state,'interrupted');}catch{/* Retry is exposed by the UI. */}
  }else {
    const active=await current();if(!active)return;
    const window=await chrome.windows.get(active.window_id).catch(()=>null);
    if(!window){try{await finish(active,'window_closed');}catch{/* Retry is exposed by the UI. */}return;}
    if(active.pending.length)try{await flush(active);}catch(e){await fail(active,e);}
  }
}
export async function startRecorder({sessionId,windowId}){
  if((await setting('preferences'))?.paused)throw new Error('Capture is paused. Resume it in Settings before recording a session.');
  await initializeRecorder();const previous=await recorderState();
  if(previous && (previous.status==='recording' || previous.pending.length))throw new Error('Stop the current session or save its pending events first.');
  const window=await chrome.windows.get(windowId);if(window.incognito || window.type!=='normal')throw new Error('Choose a normal, non-incognito Chrome window.');
  const saved=await setting('session-target:'+sessionId);if(!saved?.root || !saved.workspace || !saved.caseId)throw new Error('Choose a connected case before starting a session.');
  const metadata=await readJSON(saved.root,'workspace.json');if(metadata.workspace_id!==saved.workspace.workspace_id)throw new Error('The session workspace changed. Reconnect it and try again.');
  await loadState(saved.root,saved.workspace,saved.caseId);
  const state={session_id:sessionId,window_id:windowId,case_id:saved.caseId,workspace_id:saved.workspace.workspace_id,case_label:saved.caseLabel,status:'starting',epoch:await epoch(),started_at:now(),next_sequence:1,saved:0,pending:[],tabs:{},error:null};
  await commit(state,[event(state,'session_started',{case_label:state.case_label,collector_version:VERSION,scope:'one_window',content_archived:false})]);
  state.status='recording';await put(state);
  for(const tab of await chrome.tabs.query({windowId})){
    if(tab.incognito)continue;
    state.tabs[tab.id]={url:web(tab.url)?tab.url:null,title:web(tab.url)?tab.title || '':null};
    if(web(tab.url))await commit(state,[event(state,'tab_snapshot',{tab_id:tab.id,url:tab.url,title:tab.title || ''})]);
  }
  await put(state);return state;
}
export async function stopRecorder(){const state=await current();if(!state)throw new Error('No browsing session is recording.');return finish(state,'user_stopped');}
export async function retryRecorder(){const state=await recorderState();if(!state)return null;await flush(state);if(state.status==='save_error'){state.status='stopped';state.error=null;await put(state);}return state;}
async function scopedTab(state,tabId){const tab=await chrome.tabs.get(tabId).catch(()=>null);return tab?.windowId===state.window_id && !tab.incognito?tab:null;}
export async function recordNavigation(kind,details){
  if(details.frameId!==0)return;
  const state=await current();if(!state || details.observedWindowId!==state.window_id)return;
  const tab=await scopedTab(state,details.tabId);if(!tab || !web(details.url))return;
  const previous=state.tabs[tab.id] || {},value=event(state,kind,{observed_at:details.observedAt,tab_id:tab.id,url:details.url,previous_url:previous.url || null,title:tab.url===details.url && tab.status==='complete'?tab.title || '':'',browser_timestamp:details.timeStamp,document_id:details.documentId || null,transition_type:details.transitionType || null,transition_qualifiers:details.transitionQualifiers || []});
  state.tabs[tab.id]={url:details.url,title:value.title};await commit(state,[value]);
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
export async function recordTitle(tabId){
  const state=await current();if(!state)return;const tab=await scopedTab(state,tabId);if(!tab || !web(tab.url))return;
  const previous=state.tabs[tabId];if(!previous || previous.url!==tab.url || previous.title===tab.title)return;
  previous.title=tab.title || '';await commit(state,[event(state,'page_title',{tab_id:tabId,url:tab.url,title:previous.title})]);
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
