(() => {
  if(globalThis.__tracevaultLoaded) return;
  globalThis.__tracevaultLoaded=true;
  let enabled=true,hidden=false,annotations=[],lastSelection=null,host=null,revision=0;
  const colorMap={amber:'#e7bb5466',green:'#62b58b66',violet:'#a58bd266'};
  const style=document.createElement('style');style.dataset.tracevaultUi='';style.textContent='::highlight(tracevault-amber){background:#e7bb5466}::highlight(tracevault-green){background:#62b58b66}::highlight(tracevault-violet){background:#a58bd266}';document.documentElement.append(style);
  function model() {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('script,style,noscript,textarea,input,[contenteditable="true"],[data-tracevault-ui]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
    const nodes=[];let text='',n;
    while((n=walker.nextNode())) {nodes.push({node:n,start:text.length,end:text.length+n.textContent.length});text+=n.textContent;if(text.length>5_000_000) break;}
    return {nodes,text};
  }
  function selection() {
    const s=getSelection();
    if(s?.anchorNode?.parentElement?.closest('input,textarea,[contenteditable]')) return null;
    if(!s?.rangeCount || s.isCollapsed || s.anchorNode?.parentElement?.closest('[data-tracevault-ui]')) return lastSelection;
    const range=s.getRangeAt(0), m=model();
    const a=m.nodes.find(x=>x.node===range.startContainer),b=m.nodes.find(x=>x.node===range.endContainer);
    if(!a || !b) return null;
    const start=a.start+range.startOffset,end=b.start+range.endOffset,exact=m.text.slice(start,end);
    if(!exact.trim() || exact.length>100_000) return null;
    lastSelection={exact,prefix:m.text.slice(Math.max(0,start-48),start),suffix:m.text.slice(end,end+48),start_offset:start,end_offset:end,dom_hint:range.startContainer.parentElement.tagName.toLowerCase(),normalization:'textContent UTF-16 v1',anchor_version:1};
    return lastSelection;
  }
  function locate(m,sel) {
    if(!sel?.exact) return {status:'orphaned'};
    const hits=[];let p=0;
    while((p=m.text.indexOf(sel.exact,p))>=0) {
      if(m.text.slice(Math.max(0,p-(sel.prefix||'').length),p)===(sel.prefix||'') && m.text.slice(p+sel.exact.length,p+sel.exact.length+(sel.suffix||'').length)===(sel.suffix||'')) hits.push(p);
      p+=sel.exact.length;if(hits.length>1000) break;
    }
    if(hits.length!==1) return {status:hits.length?'ambiguous':'orphaned'};
    const start=hits[0],end=start+sel.exact.length,a=m.nodes.find(x=>x.start<=start && x.end>start),b=m.nodes.find(x=>x.start<end && x.end>=end);
    if(!a || !b) return {status:'orphaned'};
    const range=new Range();range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);return {status:'attached',range};
  }
  function clear() {if(globalThis.CSS?.highlights) for(const color of Object.keys(colorMap)) CSS.highlights.delete('tracevault-'+color);}
  function render() {
    clear();const m=model(),groups={amber:[],green:[],violet:[]},statuses={};
    for(const a of annotations) {const result=locate(m,a.selection);statuses[a.annotation_id]=result.status;if(enabled && !hidden && !a.hidden && result.range) groups[a.appearance?.color_token || 'amber']?.push(result.range);}
    if(globalThis.CSS?.highlights && enabled && !hidden) for(const [color,ranges] of Object.entries(groups)) CSS.highlights.set('tracevault-'+color,new Highlight(...ranges));
    if(host) host.hidden=hidden || !enabled;
    return statuses;
  }
  function toolbar() {
    if(!enabled || hidden) return;
    const s=getSelection();if(!s?.rangeCount || s.isCollapsed || s.anchorNode?.parentElement?.closest('input,textarea,[contenteditable]') || !selection()) {if(host) host.hidden=true;return;}
    const rect=s.getRangeAt(0).getBoundingClientRect();
    if(!host) {
      host=document.createElement('div');host.dataset.tracevaultUi='';host.style.cssText='position:fixed;z-index:2147483647;';const shadow=host.attachShadow({mode:'open'});
      const css=document.createElement('style');css.textContent=':host{font:13px system-ui}div{display:flex;gap:2px;padding:4px;background:#18181b;color:#fafafa;border:1px solid #71717a;border-radius:4px}button{font:inherit;color:inherit;background:transparent;border:0;padding:6px;cursor:pointer}button:hover,button:focus-visible{background:#3f3f46;outline:1px solid #a1a1aa}';shadow.append(css);
      const row=document.createElement('div');
      for(const [action,label] of [['highlight','Выделить'],['quote','Цитата'],['note','Заметка'],['entity','Entity']]) {
        const btn=document.createElement('button');btn.textContent=label;btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',()=>{chrome.runtime.sendMessage({type:'TV_ACTION',action}).catch(()=>{});host.hidden=true;});row.append(btn);
      }
      shadow.append(row);document.documentElement.append(host);
    }
    host.style.left=Math.max(8,Math.min(rect.left,innerWidth-290))+'px';host.style.top=Math.min(innerHeight-44,rect.bottom+8)+'px';host.hidden=false;
  }
  document.addEventListener('pointerup',e=>{if(e.composedPath().includes(host)) return;setTimeout(toolbar,0);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && host) host.hidden=true;});
  let timer;
  const observer=new MutationObserver(records=>{
    if(!records.some(r=>!r.target.parentElement?.closest('[data-tracevault-ui]'))) return;
    clearTimeout(timer);timer=setTimeout(()=>{revision++;render();},600);
  });observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message.type==='TV_SELECTION') {respond({selection:selection(),url:location.href,title:document.title,revision});return;}
    if(message.type==='TV_RENDER') {annotations=message.annotations || [];enabled=message.enabled!==false;respond({statuses:render()});return;}
    if(message.type==='TV_HIDE') {hidden=message.hidden;render();respond({ok:true});return;}
    if(message.type==='TV_SCROLL') {const a=annotations.find(a=>a.annotation_id===message.id),r=locate(model(),a?.selection);if(r.range) {const el=r.range.startContainer.parentElement;el.scrollIntoView({block:'center'});}respond({status:r.status});}
  });
  chrome.runtime.sendMessage({type:'TV_ANNOTATIONS'}).then(data=>{annotations=data?.annotations || [];enabled=data?.enabled!==false;render();}).catch(()=>{});
})();
