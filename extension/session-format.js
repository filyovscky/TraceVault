const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
export function parseSessionEvent(text){
  const value=JSON.parse(text);
  if(!value || value.schema_version!==1 || !['event_id','session_id','case_id'].every(k=>typeof value[k]==='string' && uuid.test(value[k])) || !Number.isSafeInteger(value.sequence) || value.sequence<1 || typeof value.type!=='string' || !value.type || typeof value.observed_at!=='string' || !Number.isFinite(Date.parse(value.observed_at)))throw new Error('Invalid session event format');
  return value;
}
export function freezeSessionEvent(value){const text=typeof value==='string'?value:JSON.stringify(value,null,2);parseSessionEvent(text);return text;}
function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));return value;}
// JSON meaning, not a cryptographic canonicalization standard. Arrays/types and
// exact Unicode strings matter; only object-key order/formatting are ignored.
export function sameSessionEvent(a,b){return JSON.stringify(ordered(JSON.parse(freezeSessionEvent(a))))===JSON.stringify(ordered(JSON.parse(freezeSessionEvent(b))));}
