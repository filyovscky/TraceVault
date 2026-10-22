// Self-contained injected function: state/DOM references stay in the isolated
// world of this document. No page text, DOM structure or source files change.
async function layoutInPage(operation,options) {
  const key='__tracevaultCaptureLayout',previous=globalThis[key];
  if(operation==='prepare') {
    if(previous)throw new Error('Another full-page presentation session is active');
    const state={token:options.token,patches:[],fixed:[],sticky:0,covered:0,localFixed:0,scanned:0,limited:false};
    const restore=()=>{
      clearTimeout(state.timer);let restored=0,preserved=0;
      for(const p of [...state.patches].reverse()){
        if(p.applied===null)continue;
        if(p.node.style.getPropertyValue(p.name)===p.applied && p.node.style.getPropertyPriority(p.name)==='important'){
          if(p.original)p.node.style.setProperty(p.name,p.original,p.priority);else p.node.style.removeProperty(p.name);restored++;
        }else preserved++;
        if(!p.hadStyle && p.node.getAttribute('style')==='')p.node.removeAttribute('style');
      }
      if(globalThis[key]===state)delete globalThis[key];return {restored_properties:restored,preserved_site_changes:preserved};
    };
    state.restore=restore;
    state.set=(node,name,value)=>{
      let p=state.patches.find(p=>p.node===node && p.name===name);
      if(!p){p={node,name,original:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name),hadStyle:node.hasAttribute('style')};state.patches.push(p);}
      node.style.setProperty(name,value,'important');p.applied=node.style.getPropertyValue(name);
    };
    state.unset=(node,name)=>{
      const p=state.patches.find(p=>p.node===node && p.name===name);if(!p)return;
      if(node.style.getPropertyValue(name)===p.applied && node.style.getPropertyPriority(name)==='important'){
        if(p.original)node.style.setProperty(name,p.original,p.priority);else node.style.removeProperty(name);
        // Keep tracking original restoration, but no temporary value is active.
        p.applied=null;
      }
    };
    state.renew=()=>{clearTimeout(state.timer);state.timer=setTimeout(restore,30000);};globalThis[key]=state;
    try{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT),candidates=[],styles=new Map();let node;
      while((node=walker.nextNode()) && state.scanned<20000){state.scanned++;const css=getComputedStyle(node);styles.set(node,css);if(['fixed','sticky'].includes(css.position) && css.display!=='none' && css.visibility==='visible' && Number(css.opacity)>0 && !node.closest('[data-tracevault-ui]'))candidates.push({node,position:css.position});}
      state.limited=!!node;
      const viewportFixed=[];
      for(const item of candidates.filter(c=>c.position==='fixed')){
        let local=false;
        for(let ancestor=item.node.parentElement;ancestor;ancestor=ancestor.parentElement){
          const css=styles.get(ancestor) || getComputedStyle(ancestor);
          if(css.transform!=='none' || css.perspective!=='none' || css.filter!=='none' || css.backdropFilter!=='none' || /(?:layout|paint|strict|content)/u.test(css.contain) || /(?:transform|perspective|filter)/u.test(css.willChange) || css.contentVisibility==='auto'){local=true;break;}
        }
        if(local)state.localFixed++;else viewportFixed.push(item.node);
      }
      const roots=viewportFixed.filter(n=>!viewportFixed.some(parent=>parent!==n && parent.contains(n)));state.covered=viewportFixed.length-roots.length;
      for(const item of candidates.filter(c=>c.position==='sticky'))if(!roots.some(root=>root.contains(item.node))){
        for(const [name,value]of Object.entries({position:'relative',top:'auto',bottom:'auto',left:'auto',right:'auto'}))state.set(item.node,name,value);state.sticky++;
      }
      for(const node of roots){
        const r=node.getBoundingClientRect();if(!r.width || !r.height)continue;
        // Edge anchoring is based on visible viewport geometry. Full-width top
        // headers belong at the start; compact bottom/right controls at the end.
        const bottom=r.top>=innerHeight/2 && r.height<innerHeight/2,right=r.left>=innerWidth/2 && r.width<innerWidth/2;
        state.fixed.push({node,bottom,right});state.set(node,'transition-property','none');state.set(node,'animation-play-state','paused');
      }
      if(state.fixed.length>256)throw new Error('Too many viewport-fixed elements for full-page capture');
      state.renew();return {method:'fixed-once-sticky-flow-v1',fixed_roots:state.fixed.length,sticky_in_flow:state.sticky,covered_fixed_descendants:state.covered,local_fixed_excluded:state.localFixed,scanned_elements:state.scanned,scan_limited:state.limited};
    }catch(e){restore();throw e;}
  }
  if(!previous || previous.token!==options.token){if(operation==='restore')return {session_absent:true};throw new Error('Full-page presentation session expired or the document changed');}
  if(operation==='restore')return previous.restore();
  if(operation==='inspect'){previous.renew();return {active:true};}
  if(operation!=='frame')throw new Error('Unknown capture presentation operation');
  previous.renew();const visible=[];let hidden=0;
  for(const [id,entry]of previous.fixed.entries()){
    if(!entry.node.isConnected)throw new Error('A fixed element was removed during full-page capture');
    const show=Math.abs(options.x-(entry.right?options.maxX:0))<1 && Math.abs(options.y-(entry.bottom?options.maxY:0))<1;
    if(show){previous.unset(entry.node,'opacity');const r=entry.node.getBoundingClientRect();visible.push({id,left:r.left,top:r.top,right:r.right,bottom:r.bottom});}
    else {previous.set(entry.node,'opacity','0');hidden++;}
  }
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return {visible,hidden,sticky_in_flow:previous.sticky};
}
export async function captureLayout(tabId,operation,options){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},func:layoutInPage,args:[operation,options]});
  if(!result)throw new Error('Could not control full-page presentation');return result;
}
