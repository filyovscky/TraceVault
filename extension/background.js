import {enqueue,handleContextMenu} from './context-actions.js';
import {serializeRecorder,initializeRecorder,startRecorder,stopRecorder,retryRecorder,recordNavigation,recordTabEntered,recordTabLeft,recordTitle,recordLinkTarget,recordWindowClosed} from './session-recorder.js';
const recorderReady=serializeRecorder(initializeRecorder);
const recorderTask=task=>recorderReady.then(()=>serializeRecorder(task));
const observe=task=>{recorderTask(task).catch(e=>console.warn('TraceVault session:',e.message));};
// Resolve membership before waiting for disk. A navigation from an outside
// window must not become eligible just because its tab is moved in later.
const moves=new Map();
function navigation(kind,d){
  if(d.frameId!==0)return;
  const revision=moves.get(d.tabId),observedAt=new Date().toISOString();
  chrome.tabs.get(d.tabId).then(tab=>{
    if(!tab.incognito && moves.get(d.tabId)===revision)observe(()=>recordNavigation(kind,{...d,observedWindowId:tab.windowId,observedAt}));
  }).catch(()=>{});
}
chrome.webNavigation.onCommitted.addListener(d=>navigation('navigation',d));
chrome.webNavigation.onHistoryStateUpdated.addListener(d=>navigation('history_state',d));
chrome.webNavigation.onReferenceFragmentUpdated.addListener(d=>navigation('fragment',d));
chrome.webNavigation.onCreatedNavigationTarget.addListener(d=>observe(()=>recordLinkTarget(d)));
chrome.tabs.onCreated.addListener(tab=>observe(()=>recordTabEntered(tab.id,tab.windowId,'created')));
chrome.tabs.onAttached.addListener((id,info)=>{moves.set(id,(moves.get(id)||0)+1);observe(()=>recordTabEntered(id,info.newWindowId,'moved_in'));});
chrome.tabs.onDetached.addListener((id,info)=>{moves.set(id,(moves.get(id)||0)+1);observe(()=>recordTabLeft(id,info.oldWindowId,'moved_out'));});
chrome.tabs.onRemoved.addListener((id,info)=>{moves.delete(id);if(!info.isWindowClosing)observe(()=>recordTabLeft(id,info.windowId,'closed'));});
chrome.tabs.onUpdated.addListener((id,info)=>{if(info.title)observe(()=>recordTitle(id));});
chrome.windows.onRemoved.addListener(id=>observe(()=>recordWindowClosed(id)));
const menus={quote:"Save selected text",highlight:"Highlight selection",entity:"Create entity from selection",note:"Add note to selection",image:"Save image",'edit-highlight':'Edit highlight note','delete-highlight':'Delete highlight here'};
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.contextMenus.removeAll();
  for(const [id,title] of Object.entries(menus)) chrome.contextMenus.create({id,title,contexts:id.endsWith('-highlight')?['all']:[id==='image'?'image':'selection'],documentUrlPatterns:['http://*/*','https://*/*']});
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false});
  // 0.4.3 and earlier registered per-site restore scripts. The manifest now
  // restores annotations on all HTTP(S) pages, including after browser restart.
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:['tracevault-annotations']});
  if(registered.length)await chrome.scripting.unregisterContentScripts({ids:['tracevault-annotations']});
});
// A real action invocation grants activeTab, unlike a click inside an already
// open side panel. Keep opening in this synchronous user-gesture handler.
chrome.action.onClicked.addListener(tab=>{chrome.sidePanel.open({tabId:tab.id}).catch(console.error);});
chrome.contextMenus.onClicked.addListener((info,tab)=>handleContextMenu(info,tab).catch(console.error));
chrome.commands.onCommand.addListener(async(command,tab)=>{
  if(command==='open-panel') {await chrome.sidePanel.open({tabId:tab.id});return;}
  chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});
  await enqueue({'capture-page':'page','capture-screen':'screen','add-highlight':'highlight'}[command],tab);
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(['TV_SESSION_START','TV_SESSION_STOP','TV_SESSION_RETRY'].includes(message?.type)){
    if(sender.url?.split(/[?#]/u)[0]!==chrome.runtime.getURL('panel.html')){respond({error:'Session controls are available only in TraceVault.'});return;}
    const task=message.type==='TV_SESSION_START'?()=>startRecorder(message):message.type==='TV_SESSION_STOP'?stopRecorder:retryRecorder;
    recorderTask(task).then(state=>respond({ok:true,state}),e=>respond({error:e.message}));return true;
  }
  if(message?.type==='TV_ACTION' && sender.tab && ['quote','highlight','entity','note'].includes(message.action)) {
    chrome.sidePanel.open({tabId:sender.tab.id}).catch(()=>{});
    enqueue(message.action,sender.tab).then(()=>respond({ok:true}),e=>respond({error:e.message}));return true;
  }
  if(message?.type==='TV_ANNOTATIONS' && sender.tab) {
    chrome.storage.local.get(['annotationCache','annotationsEnabled','activeCase','hiddenAnnotationDomains']).then(values=>{
      const cache=values.annotationCache || {};
      const siteHidden=(values.hiddenAnnotationDomains || []).includes(new URL(sender.url).hostname);
      respond({annotations:(cache[values.activeCase] || []).filter(a=>a.source_url===sender.url && !a.deleted),enabled:values.annotationsEnabled!==false && !siteHidden});
    });return true;
  }
});
