import {directory, readJSON, exists, writeNew} from './storage.js';
import {now, uuid, foldEvents, SCHEMA} from './domain.js';
export function casePath(workspace, id) { return workspace.mode === 'single_case' ? '' : `cases/${id}/`; }
export async function listCases(root, workspace) {
  if (workspace.mode === 'single_case') return await exists(root,'case.json') ? [await readJSON(root,'case.json')] : [];
  const result = [];
  try {
    const dir = await directory(root,['cases']);
    for await (const [id, handle] of dir.entries()) if (handle.kind === 'directory') {
      const value = await readJSON(root,`cases/${id}/case.json`);
      if (value.case_id !== id || value.schema_version !== 1) throw new Error('Некорректное дело: '+id);
      result.push(value);
    }
  } catch(e) { if (e.name !== 'NotFoundError') throw e; }
  return result;
}
export async function createCase(root, workspace, title, code) {
  if (!title.trim() || !code.trim()) throw new Error('Введите название и код дела');
  if (workspace.mode === 'single_case' && (await listCases(root,workspace)).length) throw new Error('В этой папке допускается только одно дело');
  const c = {schema_version:1,case_id:uuid(),title:title.trim(),code:code.trim(),created_at:now()};
  await writeNew(root,casePath(workspace,c.case_id)+'case.json',c);
  await append(root,workspace,c.case_id,'case_created',null,c);
  return c;
}
export async function loadState(root,workspace,id) {
  const events = [];
  try {
    const dir = await directory(root,(casePath(workspace,id)+'events').split('/'));
    for await (const [name, handle] of dir.entries()) if (name.endsWith('.json') && handle.kind === 'file') {
      try { events.push(JSON.parse(await (await handle.getFile()).text())); }
      catch { throw new Error('Повреждён журнал '+name+'. Сохраните резервную копию и восстановите файл. Изменения заблокированы.'); }
    }
  } catch(e) { if (e.name !== 'NotFoundError') throw e; }
  const sequences = events.map(e=>e.sequence);
  if (sequences.some(s=>!Number.isSafeInteger(s)) || new Set(sequences).size !== sequences.length) throw new Error('Некорректные последовательности журнала');
  return foldEvents(events);
}
export async function append(root,workspace,id,action,recordType,value,details={}) {
  const state = await loadState(root,workspace,id);
  const e = {schema_version:SCHEMA,event_id:uuid(),sequence:state.audit.length ? state.audit.at(-1).sequence+1 : 1,case_id:id,recorded_at:now(),action,record_type:recordType,value,details};
  await writeNew(root,casePath(workspace,id)+`events/${e.event_id}.json`,e);
  return e;
}
export async function recover(root,workspace,cases) {
  let count=0;
  for (const c of cases) {
    const state=await loadState(root,workspace,c.case_id);
    for(const capture of Object.values(state.captures)) if(!['completed','partial','failed','cancelled','interrupted'].includes(capture.state)) {
      await append(root,workspace,c.case_id,'capture_interrupted','captures',{...capture,state:'interrupted',capture_status:'error',error:'Документ расширения закрыт или Chrome завершён во время операции; файлы не объявлены завершёнными.'}); count++;
    }
  }
  return count;
}
