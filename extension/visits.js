export function pageAddress(url){try{const value=new URL(url);value.hash='';return value.href;}catch{return url;}}
export function isSessionVisit(event){
  if(!event || !/^https?:\/\//u.test(event.url || ''))return false;
  if(event.type==='history_state')return pageAddress(event.url)!==pageAddress(event.previous_url);
  return ['navigation','tab_snapshot','tab_activated','tab_entered'].includes(event.type);
}
