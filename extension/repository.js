import {directory, readJSON, exists, writeNew} from './storage.js';
import {now, uuid, foldEvents, SCHEMA,clock} from './domain.js';
function workspaceMode(workspace){
  if(!workspace || !['workspace','single_case'].includes(workspace.mode))throw new Error('Workspace is not connected. Choose or reconnect a workspace folder first.');
  return workspace.mode;
}
export function casePath(workspace, id) { return workspaceMode(workspace) === 'single_case' ? '' : `cases/${id}/`; }
export async function listCases(root, workspace) {
  if (workspaceMode(workspace) === 'single_case') return await exists(root,'case.json') ? [await readJSON(root,'case.json')] : [];
  const result = [];
  try {
    const dir = await directory(root,['cases']);
    for await (const [id, handle] of dir.entries()) if (handle.kind === 'directory') {
      const value = await readJSON(root,`cases/${id}/case.json`);
      if (value.case_id !== id || value.schema_version !== 1) throw new Error("Invalid case: "+id);
      result.push(value);
    }
  } catch(e) { if (e.name !== 'NotFoundError') throw e; }
  return result;
}
export async function createCase(root, workspace, title, code) {
  const mode=workspaceMode(workspace);
  if (!title.trim() || !code.trim()) throw new Error("Enter a case title and code");
  if (mode === 'single_case' && (await listCases(root,workspace)).length) throw new Error("This folder supports only one case");
  const c = {schema_version:1,case_id:uuid(),title:title.trim(),code:code.trim(),created_at:now()};
  await writeNew(root,casePath(workspace,c.case_id)+'case.json',c);
  await append(root,workspace,c.case_id,'case_created',null,c);
  return c;
}
// Rebuildable in-memory index. Every replay still enumerates real disk files and
// checks size/mtime; cache is discarded on restart and never becomes primary data.
const eventCache=new Map();
export async function loadState(root,workspace,id) {
  const caseInfo=await readJSON(root,casePath(workspace,id)+'case.json');
  if(caseInfo.schema_version!==1 || caseInfo.case_id!==id)throw new Error("Case missing from this workspace or incompatible schema");
  const events = [];
  try {
    const dir = await directory(root,(casePath(workspace,id)+'events').split('/'));
    const handles=[];
    for await (const [name, handle] of dir.entries()) if (name.endsWith('.json') && handle.kind === 'file')handles.push({name,handle});
    for(let offset=0;offset<handles.length;offset+=32) {
      const batch=await Promise.all(handles.slice(offset,offset+32).map(async({name,handle})=>{
        const file=await handle.getFile(),key=workspace.workspace_id+'/'+id+'/'+name,cached=eventCache.get(key);
        if(cached && cached.size===file.size && cached.modified===file.lastModified)return cached.event;
        let event;
        try {event=JSON.parse(await file.text());}
        catch { throw new Error("Damaged journal "+name+". Back up the folder and restore the file. Changes are blocked."); }
        eventCache.set(key,{size:file.size,modified:file.lastModified,event});return event;
      }));events.push(...batch);
    }
  } catch(e) { if (e.name !== 'NotFoundError') throw e; }
  const sequences = events.map(e=>e.sequence);
  if (sequences.some(s=>!Number.isSafeInteger(s)) || new Set(sequences).size !== sequences.length) throw new Error("Invalid journal sequences");
  if(sequences.sort((a,b)=>a-b).some((s,i)=>s!==i+1))throw new Error("Journal sequence is broken; an event may be missing. Changes are blocked.");
  return structuredClone(foldEvents(events));
}
export async function append(root,workspace,id,action,recordType,value,details={}) {
  const state = await loadState(root,workspace,id);
  const e = {schema_version:SCHEMA,event_id:uuid(),sequence:state.audit.length ? state.audit.at(-1).sequence+1 : 1,case_id:id,recorded_at:now(),time_context:clock(),action,record_type:recordType,value,details};
  await writeNew(root,casePath(workspace,id)+`events/${e.event_id}.json`,e);
  return e;
}
export async function recover(root,workspace,cases) {
  let count=0;
  for (const c of cases) {
    const state=await loadState(root,workspace,c.case_id);
    for(const capture of Object.values(state.captures)) if(!['completed','partial','failed','cancelled','interrupted'].includes(capture.state)) {
      await append(root,workspace,c.case_id,'capture_interrupted','captures',{...capture,state:'interrupted',capture_status:'error',error:"Extension document or Chrome closed during the operation; files are not marked complete."}); count++;
    }
  }
  return count;
}
