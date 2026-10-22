import {enqueue,handleContextMenu} from './context-actions.js';
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
