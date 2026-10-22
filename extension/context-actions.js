import {sha256} from './domain.js';
export async function enqueue(action,tab,extra={}) {
  if(!tab?.id)return;
  const {activeCase,activeContext}=await chrome.storage.local.get(['activeCase','activeContext']);
  const {selectionText,...details}=extra;
  const command={id:crypto.randomUUID(),action,tabId:tab.id,caseId:activeCase || null,workspaceId:activeContext?.workspaceId || null,sourceUrl:tab.url,created_at:new Date().toISOString(),selectionDigest:selectionText?await sha256(new TextEncoder().encode(selectionText)):null,...details};
  await chrome.storage.local.set({['command:'+command.id]:command});return command;
}
export function handleContextMenu(info,tab){
  // Keep opening inside Chrome's synchronous menu gesture, before any await.
  chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});
  return (async()=>{
    if(['delete-highlight','edit-highlight'].includes(info.menuItemId)){
      const hit=await chrome.tabs.sendMessage(tab.id,{type:'TV_CONTEXT_HIGHLIGHT'}).catch(()=>null);
      return enqueue(info.menuItemId,tab,{annotationId:hit?.annotation_id || null,...(hit?.case_id?{caseId:hit.case_id}:{}),contextUrl:hit?.source_url || null});
    }
    return enqueue(info.menuItemId,tab,{selectionText:info.selectionText || '',imageUrl:info.srcUrl || ''});
  })();
}
