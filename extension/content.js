(() => {
  if(!document.body || !(document.documentElement instanceof HTMLElement))return;
  if(globalThis.__tracevaultLoaded) return;
  globalThis.__tracevaultLoaded=true;
  let enabled=true,hidden=false,annotations=[],lastSelection=null,lastSelectionText=null,host=null,revision=0,lastContext=null,feedbackHost=null,feedbackTimer,feedbackExpires=0;
  const colorMap={amber:'#e7bb5466',green:'#62b58b66',violet:'#a58bd266'};
  const style=document.createElement('style');style.dataset.tracevaultUi='';style.textContent='::highlight(tracevault-amber){background:#e7bb5466}::highlight(tracevault-green){background:#62b58b66}::highlight(tracevault-violet){background:#a58bd266}';document.documentElement.append(style);
  function model() {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('script,style,noscript,textarea,input,[contenteditable="true"],[data-tracevault-ui]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
    const nodes=[];let text='',n;
    while((n=walker.nextNode())) {nodes.push({node:n,start:text.length,end:text.length+n.textContent.length});text+=n.textContent;if(text.length>5_000_000) break;}
    return {nodes,text};
  }
  function selection() {
    if(document.activeElement?.closest('input,textarea,[contenteditable]'))return null;
    const s=getSelection();
    if(s?.anchorNode?.parentElement?.closest('input,textarea,[contenteditable]')) return null;
    if(!s?.rangeCount || s.isCollapsed || s.anchorNode?.parentElement?.closest('[data-tracevault-ui]')) return lastSelection && locate(model(),lastSelection).status==='attached' ? lastSelection : null;
    const range=s.getRangeAt(0), m=model();
    function boundary(container,offset) {
      const text=m.nodes.find(x=>x.node===container);
      if(text)return text.start+offset;
      if(container.nodeType!==Node.ELEMENT_NODE)return null;
      // Select-all and whole-paragraph ranges can have ELEMENT boundaries.
      // Map those DOM positions onto the same filtered UTF-16 text model.
      const point=document.createRange();point.setStart(container,offset);point.collapse(true);
      return m.nodes.find(x=>point.comparePoint(x.node,0)>=0)?.start ?? m.text.length;
    }
    const start=boundary(range.startContainer,range.startOffset),end=boundary(range.endContainer,range.endOffset);
    if(start===null || end===null || end<start)return null;
    const exact=m.text.slice(start,end);
    if(!exact.trim() || exact.length>100_000) return null;
    lastSelectionText=s.toString();lastSelection={exact,prefix:m.text.slice(Math.max(0,start-48),start),suffix:m.text.slice(end,end+48),start_offset:start,end_offset:end,dom_hint:range.startContainer.parentElement.tagName.toLowerCase(),normalization:'textContent UTF-16 v1',anchor_version:1};
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
    clear();if(host)host.hidden=hidden || !enabled;
    if(feedbackHost)feedbackHost.hidden=hidden || Date.now()>=feedbackExpires;
    if(!annotations.length)return {};
    const m=model(),groups={amber:[],green:[],violet:[]},statuses={};
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
      const css=document.createElement('style');css.textContent=':host{font:13px system-ui}div{display:flex;gap:4px;padding:4px;background:#f6f6f6;color:#222;border:1px solid #b5b5b5;border-radius:4px}button{display:grid;place-items:center;color:inherit;background:transparent;border:0;border-radius:3px;width:36px;height:36px;padding:8px;cursor:pointer}svg{width:18px;height:18px;pointer-events:none}button:hover,button:focus-visible{background:#e0e0e0;outline:2px solid #705dcf}@media(prefers-color-scheme:dark){div{background:#262626;color:#dadada;border-color:#666}button:hover,button:focus-visible{background:#363636;outline-color:#a88bfa}}';shadow.append(css);
      const row=document.createElement('div');
      const paths={highlight:'m14 3 7 7-10 10-7-7zM8 17l-4 4H2m9-15 7 7',quote:'M10 6H4v7h4c0 3-2 5-4 5m16-12h-6v7h4c0 3-2 5-4 5',note:'M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8m-8 4h5',entity:'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0m14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0M12 7v5m-7 4v-4h14v4'};
      for(const [action,label] of [['highlight',"Highlight"],['quote',"Quote"],['note',"Note"],['entity','Entity']]) {
        const btn=document.createElement('button');btn.title=label;btn.setAttribute('aria-label',label);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[action]);svg.append(path);btn.append(svg);btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',()=>{chrome.runtime.sendMessage({type:'TV_ACTION',action}).catch(()=>{});host.hidden=true;});row.append(btn);
      }
      shadow.append(row);document.documentElement.append(host);
    }
    host.style.left=Math.max(8,Math.min(rect.left,innerWidth-176))+'px';host.style.top=Math.min(innerHeight-52,rect.bottom+8)+'px';host.hidden=false;
  }
  document.addEventListener('pointerup',e=>{if(e.composedPath().includes(host)) return;setTimeout(toolbar,0);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && host) host.hidden=true;});
  document.addEventListener('contextmenu',e=>{
    selection();lastContext=null;if(!enabled || hidden)return;const m=model();
    for(const a of [...annotations].reverse()){
      if(a.deleted || a.hidden || a.type!=='text_highlight' || a.source_url!==location.href)continue;
      const match=locate(m,a.selection);if(!match.range)continue;
      if([...match.range.getClientRects()].some(r=>e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom)){lastContext={annotation_id:a.annotation_id,case_id:a.case_id,source_url:location.href};break;}
    }
  },true);
  function feedback(message,error){
    if(!feedbackHost){feedbackHost=document.createElement('div');feedbackHost.dataset.tracevaultUi='';feedbackHost.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)';const shadow=feedbackHost.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent='p{margin:0;padding:10px 12px;border:1px solid #777;border-radius:4px;background:#262626;color:#fff;font:13px/1.5 system-ui;overflow-wrap:anywhere}p[data-error=true]{border-color:#e2857d}';const p=document.createElement('p');p.setAttribute('role','status');p.setAttribute('aria-live','polite');shadow.append(style,p);document.documentElement.append(feedbackHost);}
    const p=feedbackHost.shadowRoot.querySelector('p');p.textContent=message;p.dataset.error=String(!!error);feedbackExpires=Date.now()+5000;feedbackHost.hidden=hidden;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{feedbackHost.hidden=true;},5000);
  }
  let timer;
  const observer=new MutationObserver(records=>{
    if(!records.some(r=>!r.target.parentElement?.closest('[data-tracevault-ui]'))) return;
    clearTimeout(timer);timer=setTimeout(()=>{revision++;render();},600);
  });observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message.type==='TV_SELECTION') {const current=selection();respond({selection:current,native_text:lastSelectionText,url:location.href,title:document.title,revision});return;}
    if(message.type==='TV_CONTEXT_HIGHLIGHT'){respond(lastContext?.source_url===location.href?lastContext:null);return;}
    if(message.type==='TV_FEEDBACK'){feedback(message.message,message.error);respond({ok:true});return;}
    if(message.type==='TV_RENDER') {annotations=message.annotations || [];enabled=message.enabled!==false;respond({statuses:render()});return;}
    if(message.type==='TV_HIDE') {hidden=message.hidden;render();respond({ok:true});return;}
    if(message.type==='TV_SCROLL') {const a=annotations.find(a=>a.annotation_id===message.id),r=locate(model(),a?.selection);if(r.range) {const el=r.range.startContainer.parentElement;el.scrollIntoView({block:'center'});}respond({status:r.status});}
  });
  chrome.runtime.sendMessage({type:'TV_ANNOTATIONS'}).then(data=>{annotations=data?.annotations || [];enabled=data?.enabled!==false;render();}).catch(()=>{});
})();
