// Original, dependency-free 24 px stroke icons. Never render source/user HTML.
const paths={
  command:'M9 7V4a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v16a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7',
  panels:'M3 4h18v16H3zM14 4v16',
  settings:'m10 3-.6 2.2-2 .8-2-.8-2 3.5L5 10v2l-1.6 1.3 2 3.5 2-.8 2 .8.6 2.2h4l.6-2.2 2-.8 2 .8 2-3.5L19 12v-2l1.6-1.3-2-3.5-2 .8-2-.8L14 3zM15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  folder:'M3 7V5h6l2 2h10v13H3zM3 10h18',
  key:'M14 9a5 5 0 1 1-3-4 5 5 0 0 1 3 4zM13 12l8 8m-2-2 2-2m-5-1 2-2',
  plus:'M12 5v14M5 12h14',refresh:'M20 10a8 8 0 1 0-1 7M20 4v6h-6',
  shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',
  html:'M14 3H5v18h14V8zM14 3v5h5M10 11l-3 3 3 3m4-6 3 3-3 3',
  camera:'M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  scan:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 7h8v10H8zM10 11l2 2 2-2m-2-3v5',
  pdf:'M14 3H5v18h14V8zM14 3v5h5',stop:'M6 6h12v12H6z',record:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  highlight:'m14 3 7 7-10 10-7-7zM8 17l-4 4H2m9-15 7 7',
  quote:'M10 6H4v7h4c0 3-2 5-4 5m16-12h-6v7h4c0 3-2 5-4 5',
  note:'M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8m-8 4h5',
  entity:'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0m14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0M12 7v5m-7 4v-4h14v4',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  'eye-off':'M3 3l18 18M9 5c1-.3 2-.4 3-.4 6 0 10 7.4 10 7.4a20 20 0 0 1-4 4M6 6a22 22 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1m-6-8a3 3 0 0 0 4 4',
  check:'m5 12 4 4L19 6',keyboard:'M2 5h20v14H2zM6 9h.1m4 0h.1m4 0h.1m4 0h.1M6 13h.1m4 0h.1m4 0h.1m4 0h.1M8 16h8',
  export:'M12 15V3m-4 4 4-4 4 4M4 13v8h16v-8',archive:'M3 4h18v5H3zM5 9v12h14V9m-10 4h6',
  history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',reset:'M4 4l16 16M4 4h16l-6 7m-4 3v6l4-2v-1',
  left:'m15 5-7 7 7 7',right:'m9 5 7 7-7 7',close:'M6 6l12 12M6 18 18 6',undo:'M4 5v6h6m-6 0c7-8 16-4 16 4v4',
  'archive-link':'M3 4h12v5H3zM5 9v12h5m4-6 3-3a3 3 0 0 1 4 4l-2 2m-3-3-3 3a3 3 0 0 0 4 4l2-2',
  copy:'M8 8h12v13H8zM16 8V3H3v13h5',verify:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',
  pin:'m8 3 8 0-1 7 4 4H5l4-4zm4 11v7',edit:'m15 3 6 6-12 12H3v-6zM12 6l6 6',trash:'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  target:'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6m12-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0'
};
const labelIcons={'Open archived HTML':'html','Copy PDF path':'copy','Open file':'archive','Verify checksum':'verify','Copy SHA-256':'copy','Export PDF':'export','Export original':'export','Create PDF':'pdf','Copy citation':'quote',Pin:'pin',Unpin:'pin','Capture new version':'refresh',Edit:'edit',Show:'eye',Hide:'eye-off','Go to selection':'target','Delete annotation':'trash'};
export function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'icon'}))svg.setAttribute(key,value);
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name] || paths.right);svg.append(path);
  if(name==='pdf'){const text=document.createElementNS(svg.namespaceURI,'text');for(const [k,v]of Object.entries({x:'6.5',y:'17',fill:'currentColor',stroke:'none','font-size':'6','font-family':'sans-serif','font-weight':'bold'}))text.setAttribute(k,v);text.textContent='PDF';svg.append(text);}
  return svg;
}
export function setActionLabel(button,label,name=button.dataset.icon || labelIcons[label] || 'right',text=false){
  button.dataset.icon=name;button.dataset.tooltip=label;button.setAttribute('aria-label',label);button.removeAttribute('title');button.classList.toggle('icon-button',!text);button.replaceChildren(icon(name));
  if(text){const span=document.createElement('span');span.className='button-text';span.textContent=label;button.append(span);}
  return button;
}
export function initControls(){
  document.querySelectorAll('button[data-icon]').forEach(b=>setActionLabel(b,b.textContent.trim(),undefined,b.hasAttribute('data-show-label')));
  document.querySelectorAll('dialog').forEach(dialog=>{const error=document.createElement('p');error.className='dialog-error';error.setAttribute('role','alert');error.hidden=true;const host=dialog.querySelector('form') || dialog,actions=host.querySelector('.dialog-actions');if(actions)actions.before(error);else host.append(error);dialog.addEventListener('close',()=>{error.textContent='';error.hidden=true;});});
  const tip=document.getElementById('ui-tooltip');let owner;
  function hide(){tip.hidden=true;owner?.removeAttribute('aria-describedby');owner=null;}
  function show(button){
    if(!button?.dataset.tooltip)return;hide();owner=button;
    (button.closest('dialog') || document.body).append(tip);tip.classList.toggle('url-tooltip',button.hasAttribute('data-full-url'));tip.textContent=button.dataset.tooltip+(button.disabled?' (unavailable)':'');tip.hidden=false;button.setAttribute('aria-describedby',tip.id);
    const rect=button.getBoundingClientRect(),width=tip.offsetWidth,height=tip.offsetHeight;
    tip.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left+(rect.width-width)/2))+'px';
    const gap=button.hasAttribute('data-full-url')?-1:6;tip.style.top=(rect.bottom+height+8<=innerHeight?rect.bottom+gap:Math.max(8,rect.top-height-gap))+'px';
  }
  document.addEventListener('pointerover',e=>{const b=e.target.closest('[data-full-url],button');if(b && !b.contains(e.relatedTarget))show(b);});
  document.addEventListener('pointerout',e=>{if(owner && !owner.contains(e.relatedTarget) && !tip.contains(e.relatedTarget) && document.activeElement!==owner)hide();});
  document.addEventListener('focusin',e=>{if(e.target.matches('button:focus-visible,[data-full-url]:focus-visible'))show(e.target);});
  document.addEventListener('focusout',hide);document.addEventListener('pointerdown',e=>{if(!tip.contains(e.target))hide();});document.addEventListener('scroll',e=>{if(e.target!==tip)hide();},true);window.addEventListener('resize',hide);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',hide));
  return {refreshTooltip(node){if(owner && !owner.isConnected)hide();else if(owner===node)show(node);},hideTooltip:hide};
}
