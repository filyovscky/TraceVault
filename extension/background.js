const menus={quote:'Сохранить выделенный текст',highlight:'Подсветить выделение',entity:'Создать Entity из выделения',note:'Добавить заметку к выделению',image:'Сохранить изображение'};
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.contextMenus.removeAll();
  for(const [id,title] of Object.entries(menus)) chrome.contextMenus.create({id,title,contexts:[id==='image'?'image':'selection'],documentUrlPatterns:['http://*/*','https://*/*']});
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
});
async function enqueue(action,tab,extra={}) {
  if(!tab?.id) return;
  const {activeCase}=await chrome.storage.local.get('activeCase');
  const command={id:crypto.randomUUID(),action,tabId:tab.id,caseId:activeCase || null,sourceUrl:tab.url,created_at:new Date().toISOString(),...extra};
  await chrome.storage.local.set({['command:'+command.id]:command});
}
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  // Opening must occur in the user gesture, before any await.
  chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});
  enqueue(info.menuItemId,tab,{selectionText:info.selectionText || '',imageUrl:info.srcUrl || ''}).catch(console.error);
});
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
    chrome.storage.local.get(['annotationCache','annotationsEnabled','activeCase']).then(values=>{
      const cache=values.annotationCache || {};
      respond({annotations:(cache[values.activeCase] || []).filter(a=>a.source_url===sender.url && !a.deleted),enabled:values.annotationsEnabled!==false});
    });return true;
  }
});
