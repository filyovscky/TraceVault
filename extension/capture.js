// Independent implementation. No SingleFile code is included.
export function snapshotDocument() {
  const warnings=[];
  function snapshot(doc, depth=0) {
    const clone=doc.documentElement.cloneNode(true), source=[doc.documentElement,...doc.documentElement.querySelectorAll('*')], target=[clone,...clone.querySelectorAll('*')];
    for(let i=0;i<source.length;i++) {
      const a=source[i], b=target[i];
      if(a.hasAttribute('data-tracevault-ui')) { b.remove(); continue; }
      if(a instanceof HTMLInputElement) { b.removeAttribute('value'); b.removeAttribute('checked'); }
      if(a instanceof HTMLTextAreaElement) b.textContent='';
      if(a.isContentEditable) { warnings.push({type:'editable',reason:'Visible editable text retained; input field values excluded'}); }
      if(a instanceof HTMLImageElement && a.currentSrc) { b.setAttribute('src',a.currentSrc); b.removeAttribute('srcset'); b.removeAttribute('sizes'); b.removeAttribute('loading'); }
      if(a.tagName === 'CANVAS') {
        try {const img=doc.createElement('img'); img.src=a.toDataURL('image/png'); img.width=a.width;img.height=a.height; b.replaceWith(img);}
        catch {warnings.push({type:'canvas',reason:'Canvas tainted/unavailable'});}
      }
      if(a.shadowRoot) {
        const t=doc.createElement('template');t.setAttribute('shadowrootmode','open');t.innerHTML=a.shadowRoot.innerHTML;b.prepend(t);
        warnings.push({type:'shadow_dom',reason:'Open shadow DOM copied; adopted styles/form state not guaranteed'});
      }
      if(a.tagName === 'IFRAME') {
        try {
          if(depth>=3 || !a.contentDocument?.documentElement) throw new Error('Frame inaccessible');
          const frame=snapshot(a.contentDocument,depth+1); b.setAttribute('srcdoc',frame.html); b.setAttribute('data-tv-base',a.contentDocument.baseURI);b.removeAttribute('src');
        } catch { b.removeAttribute('src');b.removeAttribute('srcdoc'); warnings.push({type:'iframe',url:a.src,reason:'Cross-origin or unavailable iframe'}); }
      }
      if(a.tagName === 'VIDEO' || a.tagName === 'AUDIO') warnings.push({type:'media',url:a.currentSrc,reason:'Playback is not archived; available poster only'});
    }
    // CSSOM may contain runtime rules absent from style/link text.
    const originalSheets=[...doc.styleSheets];
    originalSheets.forEach(sheet=>{
      if(!sheet.ownerNode) {warnings.push({type:'css',reason:'Adopted stylesheet unavailable'});return;}
      try {
        const index=source.indexOf(sheet.ownerNode), node=target[index];
        if(!node) return;
        const style=doc.createElement('style');style.textContent=[...sheet.cssRules].map(r=>r.cssText).join('\n');
        style.setAttribute('data-tv-base',sheet.href || doc.baseURI);node.replaceWith(style);
      } catch { /* external link handled by extension fetch */ }
    });
    return {html:'<!doctype html>\n'+clone.outerHTML,base:doc.baseURI};
  }
  return {...snapshot(document),warnings,url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scroll_x:scrollX,scroll_y:scrollY},user_agent:navigator.userAgent};
}

export async function buildArchive(snapshot, {signal, maxBytes=64*1024*1024, onProgress=()=>{}}={}) {
  const diagnostics=[...snapshot.warnings], cache=new Map();let total=0;
  const warn=(type,url,reason)=>diagnostics.push({type,url,reason});
  const absolute=(url,base)=> {try {return new URL(url,base).href;} catch {return '';}};
  const check=()=>{signal?.throwIfAborted();if(total>maxBytes) throw new Error('Превышен лимит размера захвата');};
  async function fetchResource(url,kind) {
    check();
    if(!/^https?:/u.test(url)) { if(url.startsWith('data:')) return {data:url};warn(kind,url,'Unsupported protocol or inaccessible blob');return null; }
    if(cache.has(url)) return cache.get(url);
    const promise=(async()=>{
      try {
        const timeout=AbortSignal.timeout(12000), combined=signal ? AbortSignal.any([signal,timeout]) : timeout;
        const response=await fetch(url,{credentials:'include',signal:combined,redirect:'follow',referrerPolicy:'no-referrer'});
        if(!response.ok) throw new Error('HTTP '+response.status);
        if(Number(response.headers.get('content-length'))>maxBytes-total) throw new Error('Resource exceeds operation limit');
        const reader=response.body.getReader(),chunks=[];
        try {
          for(;;) {const {done,value}=await reader.read();if(done) break;total+=value.byteLength;check();chunks.push(value);}
        } finally {await reader.cancel().catch(()=>{});}
        const type=(response.headers.get('content-type')||'application/octet-stream').split(';')[0];
        const blob=new Blob(chunks,{type});
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
        onProgress(`Ресурсы: ${cache.size}, ${Math.round(total/1024)} КБ`);
        return {data,text:()=>blob.text(),base:response.url};
      } catch(e) {if(signal?.aborted) throw e; warn(kind,url,e.message);return null;}
    })();cache.set(url,promise);return promise;
  }
  async function css(text,base,depth=0,ancestry=[]) {
    if(depth>8) {warn('css',base,'CSS import depth exceeded');return '';}
    // Import styles recursively before replacing url() resources.
    const imports=[...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*([^;]*);/giu)];
    for(const m of imports) {
      const url=absolute(m[1],base);
      if(ancestry.includes(url)) {text=text.replace(m[0],'');warn('css',url,'Cyclic import');continue;}
      const r=await fetchResource(url,'css');
      const content=r?.text ? await css(await r.text(),r.base,depth+1,[...ancestry,url]) : '';
      const media=m[2].trim();text=text.replace(m[0],media ? `@media ${media}{${content}}` : content);
    }
    if(/@import/iu.test(text)) {warn('css',base,'Unsupported import syntax removed');text=text.replace(/@import[^;]*;/giu,'');}
    const matches=[...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/giu)];
    for(const m of matches) {
      const value=m[1]??m[2]??m[3];if(value.startsWith('#') || value.startsWith('data:')) continue;
      const r=await fetchResource(absolute(value,base),'css_resource');text=text.replace(m[0],`url("${r?.data || 'data:,'}")`);
    }
    return text;
  }
  async function process(html,base,depth=0) {
    check();
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,object,embed,applet,portal,base,link[rel~="preload"],link[rel~="prefetch"],link[rel~="preconnect"],link[rel~="dns-prefetch"],meta[http-equiv], [data-tracevault-ui]').forEach(n=>n.remove());
    for(const link of [...doc.querySelectorAll('link')]) {
      if(link.rel.toLowerCase().split(/\s/u).includes('stylesheet')) {
        const r=await fetchResource(absolute(link.getAttribute('href'),base),'stylesheet'), style=doc.createElement('style');
        style.textContent=r?.text ? await css(await r.text(),r.base) : '';link.replaceWith(style);
      } else link.remove();
    }
    // Walk template contents as well as ordinary DOM.
    const roots=[doc];
    for(let index=0;index<roots.length;index++) {
      const root=roots[index];root.querySelectorAll('template').forEach(t=>roots.push(t.content));
      for(const el of [...root.querySelectorAll('*')]) {
        if(el.tagName === 'SCRIPT' || el.hasAttribute('data-tracevault-ui')) {el.remove();continue;}
        for(const attr of [...el.attributes]) if(/^on/iu.test(attr.name) || ['nonce','integrity','crossorigin','ping','srcset','imagesrcset','autofocus','action','formaction','manifest'].includes(attr.name)) el.removeAttribute(attr.name);
        if(el.matches('input')) {el.removeAttribute('value');el.removeAttribute('checked');}
        if(el.matches('textarea')) el.textContent='';
        if(el.matches('style')) el.textContent=await css(el.textContent,el.getAttribute('data-tv-base') || base);
        if(el.hasAttribute('style')) el.setAttribute('style',await css(el.getAttribute('style'),base));
        if(el.tagName === 'IFRAME') {
          if(el.hasAttribute('srcdoc') && depth<3) el.setAttribute('srcdoc',await process(el.getAttribute('srcdoc'),el.getAttribute('data-tv-base')||base,depth+1));
          el.removeAttribute('src');el.setAttribute('sandbox','');
        } else {
          for(const attr of ['src','poster','background']) if(el.hasAttribute(attr)) {
            const url=absolute(el.getAttribute(attr),base);
            if(el.matches('video,audio,source,track')) {el.removeAttribute(attr);continue;}
            const r=await fetchResource(url,attr); if(r?.data) el.setAttribute(attr,r.data);else el.removeAttribute(attr);
          }
        }
        for(const attr of ['href','xlink:href']) if(el.hasAttribute(attr)) {
          const raw=el.getAttribute(attr);
          if(raw.startsWith('#')) continue;
          if(el.localName === 'a') {
            const url=absolute(raw,base);if(/^https?:/u.test(url)) {el.setAttribute(attr,url);el.setAttribute('rel','noreferrer noopener');el.setAttribute('target','_blank');}else el.removeAttribute(attr);
          } else {const r=await fetchResource(absolute(raw,base),'svg');if(r?.data) el.setAttribute(attr,r.data);else el.removeAttribute(attr);}
        }
        el.removeAttribute('data-tv-base');
      }
    }
    const charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');
    const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline' data:; frame-src about:; form-action 'none'; base-uri 'none'; script-src 'none'";
    doc.head.prepend(charset,csp);
    return '<!doctype html>\n'+doc.documentElement.outerHTML;
  }
  const html=await process(snapshot.html,snapshot.base);
  if(new TextEncoder().encode(html).byteLength>maxBytes) throw new Error('Итоговый HTML превышает лимит размера');
  return {html,diagnostics,total_resource_bytes:total};
}
