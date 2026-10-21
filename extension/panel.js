import {setting,openWorkspace,exclusive,readJSON,readFile,writeNew,probe} from './storage.js';
import {listCases,createCase,loadState,recover,append,casePath} from './repository.js';
import {uuid,localTime,ENTITY_TYPES,normalize,assertWebTab} from './domain.js';
import {capture,selected,inject,broadcastAnnotations,saveAnnotation,saveEntity,updateAnnotation,verifyArtifact,exportCase} from './service.js';
import {t} from './i18n.js';
const $=id=>document.getElementById(id);
let root=null,workspace=null,cases=[],activeCase=null,state={captures:{},annotations:{},entities:{},refs:{},audit:[]},tab=null,view='captures',page=0,busy=false,controller=null,pending=null,selectedId=null,viewerUrl=null;
let preferences={theme:'system',paused:false,blockedDomains:[],maxBytes:64*1024*1024,annotations:true};
const statuses={};
const sessionId=uuid();
function status(message,error=false) {$('status').textContent=message;$('status').parentElement.dataset.error=String(error);}
function errorText(e) {
  if(e.name==='AbortError') return 'Операция отменена';
  if(e.name==='QuotaExceededError') return 'Недостаточно места или превышена квота. Освободите место и повторите.';
  if(e.name==='NotAllowedError') return 'Нет доступа к рабочей папке или сайту. Восстановите соответствующее разрешение.';
  return e.message || String(e);
}
function action(id,fn) {$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>status(errorText(e),true)));}
function el(tag,text,cls) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function button(label,fn) {const b=el('button',label);b.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>status(errorText(e),true)));return b;}
function field(dl,label,value,cls) {dl.append(el('dt',label),el('dd',value ?? '—',cls));}
function link(url,label) {const a=el('a',label);if(/^https?:\/\//u.test(url||'')){a.href=url;a.target='_blank';a.rel='noreferrer noopener';}return a;}
function context() {if(!root || !workspace || !activeCase) throw new Error('Выберите рабочую папку и активное дело');return {root,workspace,caseId:activeCase};}
async function canWrite() {context();if(await root.queryPermission({mode:'readwrite'})!=='granted') throw new Error('Нет доступа к рабочей папке. Нажмите «Разрешить доступ».');}
async function refresh() {
  if(activeCase && root) {state=await loadState(root,workspace,activeCase);await broadcastAnnotations(activeCase,state,preferences.annotations);}
  renderList();await renderFolder();
}
async function renderFolder() {
  $('setup').hidden=!!root;$('workspace-state').hidden=!root;
  if(!root) return;
  const permission=await root.queryPermission({mode:'readwrite'});
  $('folder-state').textContent=`${root.name} · ${permission==='granted'?'Доступ к записи':'Требуется повторный доступ'}`;
  $('reauthorize').hidden=permission==='granted';
}
async function connect(handle,mode='workspace') {
  await exclusive(async()=>{
    const metadata=await openWorkspace(handle,mode),found=await listCases(handle,metadata);
    const recovered=await recover(handle,metadata,found);
    root=handle;workspace=metadata;cases=found;
    if(recovered)status(`Обнаружены прерванные операции: ${recovered}. Проверьте историю и файлы.`,true);
  });
  const saved=await setting('activeCase');activeCase=cases.some(c=>c.case_id===saved)?saved:cases[0]?.case_id || null;
  await setCases();await refresh();if(!cases.length)$('case-dialog').showModal();
}
async function setCases() {
  $('case-select').replaceChildren(...cases.map(c=>{const o=el('option',c.code+' · '+c.title);o.value=c.case_id;o.title=c.title;return o;}));
  if(activeCase){$('case-select').value=activeCase;await setting('activeCase',activeCase);}
}
async function currentTab() {
  const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(tabs[0]?.url?.startsWith('chrome-extension:')) {
    const stored=await setting('sourceTab');
    if(stored) return chrome.tabs.get(stored).catch(()=>null);
  }
  return tabs[0] || null;
}
async function refreshSource() {
  tab=await currentTab();
  if(tab && /^https?:/u.test(tab.url || '')) await setting('sourceTab',tab.id);
  $('source-title').textContent=tab?.title || 'Откройте HTTP/HTTPS сайт';$('source-url').textContent=tab?.url || 'Доступ к URL пока не выдан';$('source-url').title=tab?.url || '';
  let permitted=false;
  if(/^https?:/u.test(tab?.url || '')) permitted=await chrome.permissions.contains({origins:[new URL(tab.url).origin+'/*']});
  $('site-state').textContent=permitted?'Доступ к сайту выдан · восстановление аннотаций включено':'Для явного действия нажмите значок расширения на сайте; для восстановления аннотаций разрешите этот домен.';
  $('grant-site').hidden=permitted || !/^https?:/u.test(tab?.url || '');
  if(tab?.id) {
    try {await inject(tab.id);const data=await chrome.tabs.sendMessage(tab.id,{type:'TV_RENDER',annotations:Object.values(state.annotations).filter(a=>a.source_url===tab.url && !a.deleted),enabled:preferences.annotations});Object.assign(statuses,data?.statuses);}catch { /* UI explains missing permission */ }
  }
  renderList();
}
async function runCapture(kind='page',command=null) {
  await canWrite();if(busy)throw new Error('Дождитесь текущего захвата');
  const c=context(),sourceId=command?.tabId || tab?.id;if(command?.caseId)c.caseId=command.caseId;if(!sourceId)throw new Error('Не выбрана вкладка');
  const source=await chrome.tabs.get(sourceId);assertWebTab(source,preferences);if(command?.sourceUrl && source.url!==command.sourceUrl)throw new Error('Вкладка изменила URL после постановки команды в очередь');
  busy=true;controller=new AbortController();$('cancel').hidden=false;setBusy(true);
  try {
    const result=await capture({...c,tabId:sourceId,id:command?.id,imageUrl:command?.imageUrl,kind,settings:preferences,signal:controller.signal,onProgress:message=>status(t(message))});
    status(`${t(result.state)} · ${result.evidence_number} · ${result.artifacts[0].byte_length.toLocaleString('ru-RU')} байт`);
    if(c.caseId===activeCase){await refresh();showCapture(result.capture_id);}return result;
  } finally {busy=false;controller=null;$('cancel').hidden=true;setBusy(false);await refresh();}
}
function setBusy(value) {for(const id of ['capture-page','capture-screen','archive-first','pick-root','change-root'])$(id).disabled=value;}
async function beginAnnotation(actionName,command=null) {
  await canWrite();const c=context(),sourceId=command?.tabId || tab?.id;if(command?.caseId)c.caseId=command.caseId;
  let data=null;
  if(sourceId){const source=await chrome.tabs.get(sourceId);assertWebTab(source,preferences);data=await selected(sourceId);}
  const sel=data?.selection;
  if(actionName!=='manual' && !sel?.exact) throw new Error('Выделите текст на странице; поля ввода и редакторы исключены');
  if(command?.selectionText && sel.exact!==command.selectionText) throw new Error('Выделение изменилось с момента вызова меню. Выделите текст снова.');
  pending={...c,tabId:actionName==='manual'?null:sourceId,selection:actionName==='manual'?null:sel,action:actionName,captureId:null,annotationId:null,sourceUrl:data?.url};
  $('annotation-title').textContent=actionName==='entity'?'Создать Entity':actionName==='manual'?'Свободная заметка':'Сохранить фрагмент';
  $('quote-preview').textContent=pending.selection?.exact || 'Заметка без цитаты';
  $('reference-state').textContent='Только живая страница; доказательственная копия отсутствует.';
  $('archive-first').hidden=actionName==='manual';$('annotation-note').value='';$('annotation-tags').value='';$('annotation-color').value='amber';
  $('entity-fields').hidden=actionName!=='entity';$('entity-label').value=sel?.exact || '';updateDuplicates();
  $('annotation-dialog').showModal();
}
function updateDuplicates() {
  const type=$('entity-type').value,value=normalize(type,$('entity-label').value);
  const candidates=Object.values(state.entities).filter(e=>e.entity_type===type && e.normalized_value===value);
  $('duplicate-info').textContent=candidates.length?`Найдены совпадающие значения: ${candidates.length}. Совпадение не доказывает идентичность.`:'Совпадающих значений в деле нет. Статус: не подтверждено.';
  $('entity-existing').replaceChildren(Object.assign(el('option','Создать новую (неразрешённую)'),{value:''}),...candidates.map(e=>Object.assign(el('option','Связать с '+e.label+' · '+e.entity_id),{value:e.entity_id})));
}
async function saveDialog(event) {
  event.preventDefault();if(!pending)return;
  const p=pending,note=$('annotation-note').value;
  if(!p.selection?.exact && !note.trim()) throw new Error('Введите заметку');
  if(p.tabId){const current=await chrome.tabs.get(p.tabId);if(current.url!==p.sourceUrl)throw new Error('Источник изменился, откройте редактор заново');}
  const args={...p,note,color:$('annotation-color').value,type:p.action==='highlight'?'text_highlight':p.action==='note'||p.action==='manual'?'note':'quote'};
  let annotation;
  if(p.editId){await updateAnnotation(p.root,p.workspace,p.caseId,p.editId,{note,appearance:{color_token:args.color},tags:$('annotation-tags').value.split(',').map(s=>s.trim()).filter(Boolean)});}
  else {
    if(!p.annotationId){annotation=await saveAnnotation(args);p.annotationId=annotation.annotation_id;}else annotation=(await loadState(p.root,p.workspace,p.caseId)).annotations[p.annotationId];
    if($('annotation-tags').value)await updateAnnotation(p.root,p.workspace,p.caseId,annotation.annotation_id,{tags:$('annotation-tags').value.split(',').map(s=>s.trim()).filter(Boolean)});
    if(p.action==='entity')await saveEntity({...p,type:$('entity-type').value,label:$('entity-label').value,raw:p.selection.exact,annotationId:annotation.annotation_id,existingId:$('entity-existing').value || null});
  }
  $('annotation-dialog').close();pending=null;await refresh();await refreshSource();status('Записано в дело. Оригинальные HTML и PNG не изменялись.');
}
function renderList() {
  const query=$('search').value.toLocaleLowerCase('ru'),type=$('type-filter').value,filter=$('status-filter').value,domain=$('domain-filter').value.trim().toLowerCase(),date=$('date-filter').value;
  let rows=Object.values(state[view] || {});
  if(view==='annotations')rows=rows.filter(a=>!a.deleted);
  rows=rows.filter(r=>{
    if(query && !JSON.stringify(r).toLocaleLowerCase('ru').includes(query))return false;
    if(view==='captures' && ((type && r.kind!==type) || (filter && r.state!==filter)))return false;
    const url=r.source?.final_url || r.source_url || '';
    if(domain && !url.toLowerCase().includes(domain))return false;
    const at=r.times?.capture_started_at || r.created_at || r.recorded_at;
    return !date || (at && at.slice(0,10)>=date);
  }).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned) || (b.times?.capture_started_at || b.created_at || b.recorded_at || '').localeCompare(a.times?.capture_started_at || a.created_at || a.recorded_at || ''));
  const maxPage=Math.max(0,Math.ceil(rows.length/25)-1);page=Math.min(page,maxPage);$('list').replaceChildren();
  for(const row of rows.slice(page*25,page*25+25)) {
    const id=row.capture_id || row.annotation_id || row.entity_id || row.event_id,item=el('div',undefined,'item'+(selectedId===id?' selected':''));item.setAttribute('role','listitem');
    const b=button('',()=>view==='captures'?showCapture(row.capture_id):view==='annotations'?showAnnotation(row.annotation_id):view==='entities'?showEntity(row.entity_id):showAudit(row));b.className='item-button';
    let title,meta;
    if(view==='captures'){title=`${row.pinned?'Закреплено · ':''}${row.evidence_number} · ${row.source.title}`;meta=`${t(row.state)} · ${localTime(row.times.capture_started_at)}\n${row.source.final_url}`;}
    else if(view==='annotations'){title=row.selection?.exact || row.note;meta=`${t(statuses[row.annotation_id] || row.reattachment_status)} · ${localTime(row.created_at)} · ${row.tags.join(', ')}`;}
    else if(view==='entities'){title=row.label;meta=`${row.entity_type} · не подтверждено · ${row.evidence_refs.length} ист. · ${localTime(row.created_at)}`;}
    else {title=row.action;meta=localTime(row.recorded_at);}
    b.append(el('span',title,'item-title'),el('span',meta,'item-meta'));item.append(b);$('list').append(item);
  }
  if(!rows.length)$('list').append(el('p',activeCase?'Нет записей по выбранным фильтрам.':'Выберите папку и создайте дело.','empty'));
  $('page-number').textContent=`${page+1} / ${maxPage+1} · ${rows.length}`;$('previous').disabled=page===0;$('next').disabled=page===maxPage;
}
function details(title,id) {$('details').hidden=false;$('details-title').textContent=title;$('details-body').replaceChildren();selectedId=id;renderList();return $('details-body');}
function referenceDetails(container,ref) {
  if(!ref)return;
  const dl=el('dl');field(dl,'Статус ссылки',t(ref.status));field(dl,'Цитата',ref.quote);field(dl,'Reference ID',ref.reference_id);field(dl,'Capture ID',ref.capture_id);field(dl,'Artifact ID',ref.artifact_id);field(dl,'Обнаружено',localTime(ref.observed_at));field(dl,'UTC',ref.observed_at);container.append(dl);
  if(ref.source_url)container.append(link(ref.source_url,'Открыть оригинальный URL'));
  if(ref.capture_id && state.captures[ref.capture_id]) {
    const cap=state.captures[ref.capture_id],artifact=cap.artifacts.find(a=>a.artifact_id===ref.artifact_id);
    if(artifact){const d=el('dl');field(d,'Путь',artifact.relative_path);field(d,'SHA-256',artifact.sha256,'hash');container.append(d,button('Открыть сохранённый HTML',()=>openArtifact(artifact)));}
  }
}
function showCapture(id) {
  const c=state.captures[id];if(!c)return;
  const box=details(c.evidence_number,id),dl=el('dl');
  field(dl,'Название',c.source.title);field(dl,'Статус',t(c.state));field(dl,'Исходный URL',c.source.original_url);field(dl,'Конечный URL',c.source.final_url);
  for(const [key,label] of Object.entries({capture_started_at:'Начало захвата',capture_finished_at:'Конец получения данных',artifact_write_started_at:'Начало записи файла',artifact_written_at:'Файл записан',record_created_at:'Запись индекса',first_seen_at:'Первое обнаружение'})) {field(dl,label,localTime(c.times[key]));if(c.times[key])field(dl,label+' · UTC',c.times[key]);}
  field(dl,'Часы',`${c.times.clock_source} · ${c.times.timezone_id} · offset ${c.times.local_offset_minutes} мин. Независимая метка времени отсутствует.`);field(dl,'Capture ID',c.capture_id);field(dl,'Метод',c.capture_method);field(dl,'Длительность получения данных (монотонная)',c.duration_ms!=null?c.duration_ms+' мс':null);field(dl,'Предыдущая версия',c.previous_capture_id);if(c.error)field(dl,'Ошибка',c.error);if(c.viewport)field(dl,'Параметры вкладки',JSON.stringify({viewport:c.viewport,pixel_width:c.pixel_width,pixel_height:c.pixel_height,page_zoom:c.page_zoom}));box.append(dl,link(c.source.final_url,'Открыть исходный сайт'));
  for(const a of c.artifacts) {
    const d=el('dl');field(d,'Файл',a.relative_path);field(d,'Размер',a.byte_length+' байт');field(d,'SHA-256',a.sha256,'hash');field(d,'Проверка при записи',a.verification_status);box.append(d);
    const row=el('div',undefined,'actions');row.append(button('Открыть файл',()=>openArtifact(a)),button('Проверить хеш',async()=>{const result=await verifyArtifact(root,workspace,c.case_id,a);status(result.ok?'SHA-256 подтверждён повторным чтением':'Хеш НЕ совпадает. Файл изменён: '+result.actual,!result.ok);}),button('Копировать SHA-256',()=>navigator.clipboard.writeText(a.sha256)),button('Экспорт оригинала',()=>exportOriginal(a,c.case_id)));box.append(row);
  }
  const pin=button(c.pinned?'Открепить':'Закрепить',async()=>{await exclusive(()=>append(root,workspace,c.case_id,'capture_pinned','captures',{...c,pinned:!c.pinned}));await refresh();showCapture(id);});box.append(pin);
  if(c.warnings.length){box.append(el('h2','Диагностика неполноты'));const pre=el('pre',JSON.stringify(c.warnings,null,2));box.append(pre);}
  const refs=Object.values(state.refs).filter(r=>r.capture_id===id);if(refs.length)box.append(el('p',`Связанные ссылки на фрагменты: ${refs.length}`));
}
function showAnnotation(id) {
  const a=state.annotations[id];if(!a)return;const box=details('Аннотация',id);box.append(el('blockquote',a.selection?.exact || ''),el('p',a.note));const dl=el('dl');field(dl,'Создана',localTime(a.created_at));field(dl,'Изменена',localTime(a.updated_at));field(dl,'Восстановление',t(statuses[id] || a.reattachment_status));field(dl,'Метки',a.tags.join(', '));box.append(dl);referenceDetails(box,state.refs[a.reference_id]);
  const row=el('div',undefined,'actions');row.append(button('Изменить',()=>editAnnotation(a)),button(a.hidden?'Показывать':'Скрыть',async()=>{await updateAnnotation(root,workspace,a.case_id,id,{hidden:!a.hidden});await refresh();await refreshSource();showAnnotation(id);}),button('К фрагменту',async()=>{await refreshSource();if(tab?.url!==a.source_url)throw new Error('Сначала откройте исходный URL');const result=await chrome.tabs.sendMessage(tab.id,{type:'TV_SCROLL',id});status(t(result.status));}),button('Удалить аннотацию',async()=>{await updateAnnotation(root,workspace,a.case_id,id,{deleted:true});await refresh();$('details').hidden=true;}));box.append(row);
}
function editAnnotation(a) {
  pending={...context(),editId:a.annotation_id,selection:a.selection,action:'edit',tabId:null};$('annotation-title').textContent='Изменить аннотацию';$('quote-preview').textContent=a.selection?.exact || 'Без цитаты';$('reference-state').textContent='Ссылка на первоисточник остаётся прежней';$('archive-first').hidden=true;$('annotation-note').value=a.note;$('annotation-color').value=a.appearance.color_token;$('annotation-tags').value=a.tags.join(', ');$('entity-fields').hidden=true;$('annotation-dialog').showModal();
}
function showEntity(id) {
  const e=state.entities[id];if(!e)return;const box=details(e.label,id),dl=el('dl');field(dl,'Entity ID',e.entity_id);field(dl,'Тип',e.entity_type);field(dl,'Исходная строка',e.raw_value);field(dl,'Нормализованное значение',e.normalized_value);field(dl,'Проверка','Не подтверждено; confidence не оценено');field(dl,'Создана',localTime(e.created_at));box.append(dl);
  for(const ref of e.evidence_refs)referenceDetails(box,state.refs[ref]);
  box.append(el('p','Передача: «Экспорт JSON». Прямое подключение OSINTchart в этой версии отсутствует.','muted'));
}
function showAudit(event) {details('Событие журнала',event.event_id).append(el('pre',JSON.stringify(event,null,2)));}
async function openArtifact(artifact) {
  const file=await readFile(root,artifact.relative_path);if(viewerUrl)URL.revokeObjectURL(viewerUrl);
  viewerUrl=URL.createObjectURL(new Blob([await file.arrayBuffer()],{type:artifact.mime_type}));$('viewer-content').replaceChildren();
  const node=document.createElement(artifact.mime_type==='text/html'?'iframe':'img');
  if(node.tagName==='IFRAME'){node.setAttribute('sandbox','');node.setAttribute('referrerpolicy','no-referrer');node.title='Изолированный просмотр сохранённого HTML';}else node.alt='Оригинальное изображение';
  node.src=viewerUrl;$('viewer-content').append(node);$('viewer').showModal();
}
async function exportOriginal(artifact,caseId) {
  const file=await readFile(root,artifact.relative_path),path=casePath(workspace,caseId)+`exports/${uuid()}__${artifact.relative_path.split('/').at(-1)}`;
  await exclusive(async()=>{await writeNew(root,path,file,artifact.mime_type);await append(root,workspace,caseId,'original_exported',null,null,{source:artifact.relative_path,relative_path:path});});status('Копия оригинала записана: '+path);
}
async function processInbox() {
  if(!activeCase || busy || $('annotation-dialog').open)return;
  await navigator.locks.request('tracevault-inbox',{ifAvailable:true},async lock=>{
    if(!lock)return;
    const values=await chrome.storage.local.get(null),commands=Object.entries(values).filter(([key])=>key.startsWith('command:')).sort((a,b)=>a[1].created_at.localeCompare(b[1].created_at));
    for(const [key,command] of commands) {
      if($('annotation-dialog').open || busy)break;
      // A durable receipt prevents reprocessing a selection command after a crash.
      await exclusive(()=>append(root,workspace,activeCase,'command_received',null,null,{command_id:command.id,session:sessionId}));
      await chrome.storage.local.remove(key);
      try {if(['page','screen','image'].includes(command.action))await runCapture(command.action,command);else await beginAnnotation(command.action,command);}
      catch(e){status(errorText(e),true);}
    }
  });
}
action('pick-root',async()=>{const handle=await showDirectoryPicker({mode:'readwrite',id:'tracevault'});await connect(handle,$('workspace-mode').value);status('Доступ проверен записью и чтением тестового файла');});
action('change-root',async()=>{const handle=await showDirectoryPicker({mode:'readwrite',id:'tracevault'});await connect(handle);status('Рабочая папка подключена');});
action('reauthorize',async()=>{if(await root.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Доступ не предоставлен');await exclusive(()=>probe(root));await connect(root);status('Доступ к папке восстановлен и проверен');});
action('new-case',()=>{if(!root)throw new Error('Сначала выберите папку');$('case-dialog').showModal();});
$('case-form').addEventListener('submit',event=>{event.preventDefault();(async()=>{const c=await exclusive(()=>createCase(root,workspace,$('case-title').value,$('case-code').value));cases.push(c);activeCase=c.case_id;await setCases();await refresh();$('case-dialog').close();status('Дело создано');})().catch(e=>status(errorText(e),true));});
$('case-select').addEventListener('change',()=>{(async()=>{activeCase=$('case-select').value;await setting('activeCase',activeCase);await exclusive(()=>append(root,workspace,activeCase,'case_activated',null,null));page=0;$('details').hidden=true;await refresh();await refreshSource();})().catch(e=>status(errorText(e),true));});
action('refresh-source',refreshSource);
action('grant-site',async()=>{
  if(!/^https?:/u.test(tab?.url || ''))throw new Error('Нет доступного HTTP/HTTPS URL');
  const origin=new URL(tab.url).origin+'/*';
  if(!await chrome.permissions.request({origins:[origin]}))throw new Error('Разрешение не выдано');
  const registered=await chrome.scripting.getRegisteredContentScripts();const matches=[...new Set(registered.flatMap(s=>s.matches).concat(origin))];
  if(registered.length)await chrome.scripting.unregisterContentScripts({ids:registered.map(s=>s.id)});
  await chrome.scripting.registerContentScripts([{id:'tracevault-annotations',matches,js:['content.js'],runAt:'document_idle',persistAcrossSessions:true}]);await refreshSource();status('Доступ к домену выдан');
});
action('capture-page',()=>runCapture('page'));action('capture-screen',()=>runCapture('screen'));action('cancel',()=>controller?.abort());
for(const name of ['highlight','quote','note','entity'])action('selection-'+name,()=>beginAnnotation(name));action('manual-note',()=>beginAnnotation('manual'));
action('archive-first',async()=>{if(!pending)return;const p=pending;const source=await chrome.tabs.get(p.tabId);if(source.url!==p.sourceUrl)throw new Error('URL изменился');const result=await runCapture('page',{tabId:p.tabId,id:uuid()});p.captureId=result.capture_id;$('reference-state').textContent=`Связь с ${result.evidence_number} · ${result.capture_id}`;});
$('annotation-form').addEventListener('submit',e=>saveDialog(e).catch(error=>status(errorText(error),true)));
$('entity-type').replaceChildren(...ENTITY_TYPES.map(type=>Object.assign(el('option',type),{value:type})));$('entity-type').addEventListener('change',updateDuplicates);$('entity-label').addEventListener('input',updateDuplicates);
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;page=0;document.querySelectorAll('[data-view]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','page');renderList();}));
for(const id of ['search','type-filter','status-filter','domain-filter','date-filter'])$(id).addEventListener('input',()=>{page=0;renderList();});
action('previous',()=>{page--;renderList();});action('next',()=>{page++;renderList();});action('close-details',()=>{$('details').hidden=true;selectedId=null;renderList();});
action('close-viewer',()=>{$('viewer').close();$('viewer-content').replaceChildren();if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=null;});
action('export-case',async()=>{await canWrite();const path=await exportCase(root,workspace,cases.find(c=>c.case_id===activeCase));status('Экспорт записан в выбранную папку: '+path);await refresh();});
action('workspace',()=>chrome.tabs.create({url:chrome.runtime.getURL('panel.html?workspace=1')}));
action('settings-toggle',()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));});
action('shortcuts',()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
$('theme').addEventListener('change',()=>{document.documentElement.dataset.theme=$('theme').value;});
action('save-settings',async()=>{const mb=Number($('max-size').value);if(mb<1 || mb>256)throw new Error('Лимит: от 1 до 256 МБ');preferences={...preferences,theme:$('theme').value,paused:$('paused').checked,maxBytes:mb*1024*1024,blockedDomains:$('blocked-domains').value.split('\n').map(s=>s.trim().toLowerCase()).filter(Boolean)};await setting('preferences',preferences);status('Настройки сохранены');});
$('annotations-toggle').addEventListener('change',()=>{(async()=>{preferences.annotations=$('annotations-toggle').checked;await setting('preferences',preferences);await broadcastAnnotations(activeCase,state,preferences.annotations);await refreshSource();})().catch(e=>status(errorText(e),true));});
chrome.storage.onChanged.addListener(changes=>{if(Object.keys(changes).some(k=>k.startsWith('command:')))processInbox().catch(e=>status(errorText(e),true));});
chrome.tabs.onActivated.addListener(()=>refreshSource().catch(()=>{}));
chrome.tabs.onUpdated.addListener((_id,info)=>{if(info.status==='complete')refreshSource().catch(()=>{});});
async function init() {
  if(new URL(location.href).searchParams.has('workspace'))document.body.classList.add('workspace');
  preferences={...preferences,...await setting('preferences')};document.documentElement.dataset.theme=preferences.theme;$('theme').value=preferences.theme;$('paused').checked=preferences.paused;$('blocked-domains').value=preferences.blockedDomains.join('\n');$('max-size').value=preferences.maxBytes/1024/1024;$('annotations-toggle').checked=preferences.annotations;
  const handle=await setting('root');
  if(handle) {
    root=handle;
    if(await root.queryPermission({mode:'readwrite'})==='granted')await connect(root);
    else {workspace=await readJSON(root,'workspace.json').catch(()=>null);await renderFolder();status('Требуется повторный доступ к папке',true);}
  } else status('Выберите папку, затем создайте дело');
  await refreshSource();await processInbox();
}
init().catch(e=>status(errorText(e),true));
