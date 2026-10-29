// Read-only text comparison. No archive nodes are inserted into the UI.
export function archivedText(html){
  const doc=new DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'+html,'text/html');
  doc.querySelectorAll('script,style,template,noscript,svg,canvas,iframe,[hidden],[aria-hidden="true"]').forEach(n=>n.remove());
  const blocks=new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','NAV','LI','TR','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE','BR','DT','DD']);
  const out=[];
  function walk(node){if(node.nodeType===3){out.push(node.nodeValue);return;}if(blocks.has(node.nodeName))out.push('\n');for(const child of node.childNodes)walk(child);if(blocks.has(node.nodeName))out.push('\n');}
  walk(doc.body);
  return out.join('').split('\n').map(line=>line.replace(/\s+/gu,' ').trim()).filter(Boolean).join('\n');
}
export function compareText(before,after,maxCells=1000000){
  const a=before?before.split('\n'):[],b=after?after.split('\n'):[];
  if(a.length+b.length>12000)throw new Error('Text comparison supports up to 12000 lines across both versions. Open larger originals separately.');
  let start=0,endA=a.length,endB=b.length;
  while(start<endA && start<endB && a[start]===b[start])start++;
  while(endA>start && endB>start && a[endA-1]===b[endB-1]){endA--;endB--;}
  const left=a.slice(start,endA),right=b.slice(start,endB),rows=[];
  const add=(kind,text)=>rows.push({kind,text});
  if(!left.length && !right.length)return {same:true,method:'line_lcs',rows:[]};
  if((left.length+1)*(right.length+1)>maxCells){left.forEach(line=>add('removed',line));right.forEach(line=>add('added',line));return {same:false,method:'changed_region',rows};}
  const width=right.length+1,table=new Uint32Array((left.length+1)*width);
  for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)table[i*width+j]=left[i]===right[j]?1+table[(i+1)*width+j+1]:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
  let i=0,j=0;
  while(i<left.length || j<right.length){
    if(i<left.length && j<right.length && left[i]===right[j]){add('equal',left[i]);i++;j++;}
    else if(j<right.length && (i===left.length || table[i*width+j+1]>table[(i+1)*width+j]))add('added',right[j++]);
    else add('removed',left[i++]);
  }
  return {same:false,method:'line_lcs',rows};
}
