export const VERSION = '0.3.1';
export const SCHEMA = 1;
export const ENTITY_TYPES = ['person', 'organization', 'phone', 'email', 'domain', 'ip_address', 'url', 'username', 'location', 'document', 'file', 'hash', 'custom'];
export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
export function matchesDomain(url, filter) {
  if(!filter.trim())return true;
  try {
    const input=filter.trim(),host=new URL(input.includes('://')?input:'https://'+input).hostname.toLowerCase().replace(/\.$/u,'');
    const actual=new URL(url).hostname.toLowerCase().replace(/\.$/u,'');
    return !!host && (actual===host || actual.endsWith('.'+host));
  }catch{return false;}
}
export function recordUrls(record, refs={}) {
  return [...new Set([record.source?.final_url,record.source_url,...(record.evidence_refs || []).map(id=>refs[id]?.source_url)].filter(Boolean))];
}
export function citation(capture, quote='') {
  const rows=[capture.source.title,capture.source.final_url,`Фиксация (UTC): ${capture.times.capture_started_at}`,`Capture ID: ${capture.capture_id}`];
  if(quote)rows.unshift(`«${quote}»`);
  if(!capture.artifacts.length)rows.push('Подтверждённые файлы отсутствуют');
  for(const artifact of capture.artifacts)rows.push(`Файл: ${artifact.relative_path}`,`SHA-256: ${artifact.sha256}`);
  return rows.join('\n');
}
export function hostPattern(url) {const u=new URL(url);if(!/^https?:$/u.test(u.protocol))throw new Error('Неподдерживаемый протокол');return `${u.protocol}//${u.hostname}/*`;}
export function clock() {
  return {timezone_id: Intl.DateTimeFormat().resolvedOptions().timeZone, local_offset_minutes: -new Date().getTimezoneOffset(), clock_source: 'system_clock'};
}
export function localTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso), offset = -d.getTimezoneOffset();
  return `${d.toLocaleString('ru-RU', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'})}.${String(d.getMilliseconds()).padStart(3,'0')} (UTC${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')})`;
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 400 || path.split('/').some(p => !p || p === '.' || p === '..' || /[\\:*?"<>|]/u.test(p) || [...p].some(c=>c.charCodeAt(0)<32) || /[. ]$/u.test(p))) throw new Error('Недопустимый относительный путь');
  return path.split('/');
}
export function assertWebTab(tab, settings = {}) {
  if (!tab || !/^https?:\/\//u.test(tab.url || '')) throw new Error('Страница не поддерживается. Откройте HTTP/HTTPS сайт и вызовите TraceVault кнопкой расширения.');
  if (tab.incognito) throw new Error('Фиксация в инкогнито отключена');
  if (settings.paused) throw new Error('Фиксация приостановлена в настройках');
  const rule=captureExclusion(tab.url,settings);
  if(rule)throw new Error(`Домен ${new URL(tab.url).hostname} исключён правилом ${rule} в настройках TraceVault. Нажмите «Разрешить фиксацию на этом сайте» в панели или измените список исключений.`);
}
export function captureExclusion(url,settings={}) {
  try{const host=new URL(url).hostname.toLowerCase().replace(/\.$/u,'');if((settings.allowedCaptureHosts || []).includes(host))return null;return (settings.blockedDomains || []).find(rule=>matchesDomain(url,rule)) || null;}catch{return null;}
}
export function captureHostList(text) {
  return [...new Set(text.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{try{const u=new URL(line.includes('://')?line:'https://'+line);if(!/^https?:$/u.test(u.protocol))throw new Error();return u.hostname.toLowerCase().replace(/\.$/u,'');}catch{throw new Error('Некорректный домен в настройках: '+line);}}))];
}
export function normalize(type, value) {
  const v = value.normalize('NFC').trim();
  if (type === 'email') { const at = v.lastIndexOf('@'); return at < 0 ? v : v.slice(0,at)+'@'+v.slice(at+1).toLowerCase(); }
  if (type === 'domain') { try { return new URL('https://'+v).hostname.toLowerCase(); } catch { return v; } }
  if (type === 'url') { try { return new URL(v).href; } catch { return v; } }
  if (type === 'hash' || type === 'ip_address') return v.toLowerCase();
  return v; // No guessed country codes, identity merging, or name case folding.
}
// Exact UTF-16 textContent offsets; no whitespace or Unicode normalization.
export function locateQuote(text, selector) {
  if (!selector?.exact) return {status: 'orphaned'};
  const hits = []; let pos = 0;
  while ((pos = text.indexOf(selector.exact, pos)) !== -1) {
    const prefix = selector.prefix || '', suffix = selector.suffix || '';
    if (text.slice(Math.max(0,pos-prefix.length),pos) === prefix && text.slice(pos+selector.exact.length,pos+selector.exact.length+suffix.length) === suffix) hits.push(pos);
    pos += Math.max(1,selector.exact.length);
    if (hits.length > 1000) break;
  }
  if (hits.length !== 1) return {status: hits.length ? 'ambiguous' : 'orphaned'};
  return {status: 'attached', start: hits[0], end: hits[0]+selector.exact.length};
}
export function makeExport(state, caseInfo) {
  const captures = Object.values(state.captures).filter(c => ['completed','partial'].includes(c.state));
  const entities = Object.values(state.entities);
  const refs = Object.values(state.refs);
  const artifacts = captures.flatMap(c => c.artifacts || []);
  const ids = new Set(artifacts.map(a=>a.artifact_id));
  for (const r of refs) if (r.artifact_id && !ids.has(r.artifact_id)) throw new Error('Ссылка на отсутствующий Artifact: '+r.reference_id);
  return {schema_version:SCHEMA, format:'tracevault-osintchart', exported_at:now(), case:caseInfo, entities, evidence:captures, evidence_refs:refs, relations:[], annotations:Object.values(state.annotations).filter(a=>!a.deleted), artifacts};
}
export function foldEvents(events) {
  const state = {captures:{}, annotations:{}, entities:{}, refs:{}, audit:[]};
  for (const e of events.sort((a,b)=>a.sequence-b.sequence)) {
    if (e.schema_version !== SCHEMA) throw new Error('Несовместимая версия журнала');
    if (e.record_type && state[e.record_type]) {
      const key = {captures:'capture_id', annotations:'annotation_id', entities:'entity_id', refs:'reference_id'}[e.record_type];
      if (!key || !e.value?.[key]) throw new Error('Некорректная запись журнала');
      state[e.record_type][e.value[key]] = e.value;
    }
    state.audit.push(e);
  }
  return state;
}
