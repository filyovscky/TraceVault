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
export async function readJSON(root,path) { return JSON.parse(await (await readFile(root,path)).text()); }
export async function exists(root,path) {
  try { await readFile(root,path); return true; } catch(e) { if (e.name === 'NotFoundError') return false; throw e; }
}
export async function writeNew(root,path,data,mime='application/json') {
  if (await root.queryPermission({mode:'readwrite'}) !== 'granted') throw new DOMException('Нет доступа к рабочей папке. Нажмите «Разрешить доступ».','NotAllowedError');
  if (await exists(root,path)) throw new Error('Файл уже существует, перезапись запрещена: '+path);
  const bytes = data instanceof Blob ? await data.arrayBuffer() : new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data,null,2));
  const before = await sha256(bytes);
  const started = now();
  const handle = await fileHandle(root,path,true), writable = await handle.createWritable();
  try { await writable.write(bytes); await writable.close(); } catch(e) { try { await writable.abort(); } catch { /* already closed */ } throw e; }
  const written = now(), stored = await handle.getFile(), after = await sha256(await stored.arrayBuffer());
  if (before !== after || stored.size !== bytes.byteLength) throw new Error('Проверка записанного файла не пройдена: '+path);
  return {artifact_id:uuid(), relative_path:path, mime_type:mime, byte_length:stored.size, sha256:after, created_at:started, artifact_write_started_at:started, written_at:written, verification_status:'verified_readback',time_context:clock()};
}
export async function probe(root) {
  const path = '.tracevault-probe-'+uuid()+'.txt', content = 'TraceVault access check '+uuid();
  await writeNew(root,path,content,'text/plain');
  await root.removeEntry(path);
}
export async function openWorkspace(root, mode='workspace') {
  await probe(root);
  let metadata;
  if (await exists(root,'workspace.json')) {
    metadata = await readJSON(root,'workspace.json');
    if (metadata.schema_version !== 1 || !['workspace','single_case'].includes(metadata.mode)) throw new Error('Неизвестная схема рабочей папки');
  } else {
    // Do not silently adopt another application's populated directory.
    const entries = []; for await (const [name] of root.entries()) entries.push(name);
    if (entries.length) throw new Error('В папке нет workspace.json и она не пуста. Выберите пустую папку или существующую рабочую область TraceVault.');
    metadata = {schema_version:1, workspace_id:uuid(), mode, created_at:now()};
    await writeNew(root,'workspace.json',metadata);
  }
  await setting('root',root);
  return metadata;
}
export const exclusive = fn => navigator.locks.request('tracevault-disk-writer',fn);
