import {safePath, sha256, now, uuid,clock} from './domain.js';
let dbPromise;
function db() {
  return dbPromise ||= new Promise((resolve,reject)=>{
    const req = indexedDB.open('tracevault-handles',1);
    req.onupgradeneeded = ()=>req.result.createObjectStore('settings');
    req.onsuccess = ()=>resolve(req.result); req.onerror = ()=>reject(req.error);
  });
}
export async function setting(key, value) {
  const database = await db();
  return new Promise((resolve,reject)=>{
    const tx = database.transaction('settings', value === undefined ? 'readonly' : 'readwrite');
    const req = value === undefined ? tx.objectStore('settings').get(key) : tx.objectStore('settings').put(value,key);
    let result; req.onsuccess = ()=>{result = req.result;}; tx.oncomplete = ()=>resolve(result); tx.onerror = ()=>reject(tx.error);
  });
}
export async function directory(root, parts, create = false) {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part,{create});
  return dir;
}
export async function fileHandle(root, path, create = false) {
  const parts = safePath(path), name = parts.pop();
  return (await directory(root,parts,create)).getFileHandle(name,{create});
}
export async function readFile(root,path) { return (await fileHandle(root,path)).getFile(); }
export async function readVerifiedFile(root,artifact) {
  const file=await readFile(root,artifact.relative_path),bytes=await file.arrayBuffer();
  if(file.size!==artifact.byte_length || await sha256(bytes)!==artifact.sha256)throw new Error("Checksum mismatch: file changed. Original preview and export blocked. "+artifact.relative_path);
  // Return an immutable snapshot: the file may change on disk after this check.
  return new Blob([bytes],{type:artifact.mime_type});
}
export async function readJSON(root,path) { return JSON.parse(await (await readFile(root,path)).text()); }
export async function exists(root,path) {
  try { await readFile(root,path); return true; } catch(e) { if (e.name === 'NotFoundError') return false; throw e; }
}
export async function writeNew(root,path,data,mime='application/json') {
  if (await root.queryPermission({mode:'readwrite'}) !== 'granted') throw new DOMException("Workspace access missing. Use Restore folder access.",'NotAllowedError');
  if (await exists(root,path)) throw new Error("File already exists; overwriting is forbidden: "+path);
  const bytes = data instanceof Blob ? await data.arrayBuffer() : new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data,null,2));
  const before = await sha256(bytes);
  const started = now();
  let handle=await fileHandle(root,path,true),retries=0;
  for(;;){
    let writable,stage='createWritable';
    try {writable=await handle.createWritable();stage='write';await writable.write(bytes);stage='close';await writable.close();break;}
    catch(e){
      try {await writable?.abort();}catch{/* The browser may already have closed the stream. */}
      // Windows/Chromium can reject close() with InvalidStateError and leave the
      // fresh destination empty. Never overwrite any previously saved bytes, or
      // retry a permission/quota failure. Only this call's same empty entry may retry.
      const retryable=e.name==='InvalidStateError' && retries<2;
      if(!retryable){console.error('TraceVault disk write:',path,stage,e);throw e;}
      const current=await fileHandle(root,path),file=await current.getFile();
      if(file.size!==0 || !await current.isSameEntry(handle)){console.error('TraceVault disk write:',path,stage,e);throw e;}
      retries++;console.warn('TraceVault: retrying fresh empty file',path,stage,retries,e.name);
      await new Promise(resolve=>setTimeout(resolve,50*retries));
      if(await root.queryPermission({mode:'readwrite'})!=='granted')throw new DOMException("Workspace access missing. Use Restore folder access.",'NotAllowedError');
      handle=current;
    }
  }
  const written = now(), stored = await handle.getFile(), after = await sha256(await stored.arrayBuffer());
  if (before !== after || stored.size !== bytes.byteLength) throw new Error("Written file verification failed: "+path);
  return {artifact_id:uuid(), relative_path:path, mime_type:mime, byte_length:stored.size, sha256:after, created_at:started, artifact_write_started_at:started, written_at:written, verification_status:'verified_readback',time_context:clock()};
}
export async function probe(root) {
  const path = '.tracevault-probe-'+uuid()+'.txt', content = 'TraceVault access check '+uuid();
  await writeNew(root,path,content,'text/plain');
  await root.removeEntry(path);
}
export async function openWorkspace(root, mode='workspace',{persist=true}={}) {
  if(!['workspace','single_case'].includes(mode))throw new Error('Unknown workspace layout');
  await probe(root);
  let metadata;
  if (await exists(root,'workspace.json')) {
    metadata = await readJSON(root,'workspace.json');
    if (!metadata || metadata.schema_version !== 1 || !['workspace','single_case'].includes(metadata.mode)) throw new Error("Invalid workspace.json. Choose another folder or restore its metadata from a backup.");
  } else {
    // Do not silently adopt another application's populated directory.
    const entries = []; for await (const [name] of root.entries()) entries.push(name);
    if (entries.length) throw new Error("Folder is not empty and has no workspace.json. Choose an empty folder or an existing TraceVault workspace.");
    metadata = {schema_version:1, workspace_id:uuid(), mode, created_at:now()};
    await writeNew(root,'workspace.json',metadata);
  }
  if(persist)await setting('root',root);
  return metadata;
}
export const exclusive = fn => navigator.locks.request('tracevault-disk-writer',fn);
