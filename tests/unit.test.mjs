import {compareText} from '../extension/compare.js';
import {isSessionVisit,pageAddress} from '../extension/visits.js';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {freezeSessionEvent,parseSessionEvent,sameSessionEvent} from '../extension/session-format.js';
import {planTiles} from '../extension/screenshot.js';
import {resourceCredentials} from '../extension/capture.js';
import {casePath,listCases,createCase} from '../extension/repository.js';
import {sha256,safePath,normalize,locateQuote,foldEvents,makeExport,assertWebTab,localTime,hostPattern,matchesDomain,recordUrls,citation,removeLegacyCaptureFilters} from '../extension/domain.js';

test('shipped UI, manifest and runtime messages are English; archived content is external data',async()=>{for(const file of (await readdir('extension')).filter(f=>/\.(js|html|json)$/u.test(f)))assert.doesNotMatch(await readFile('extension/'+file,'utf8'),/[А-Яа-яЁё]/u,file);});
test('SHA-256 uses bytes and matches NIST abc vector',async()=>assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));

test('session recovery ignores JSON object order only; frozen payload and event identity remain exact',()=>{
  const value={schema_version:1,event_id:'11111111-1111-4111-8111-111111111111',session_id:'22222222-2222-4222-8222-222222222222',case_id:'33333333-3333-4333-8333-333333333333',sequence:3,type:'navigation',observed_at:'2026-10-27T12:00:00.000Z',url:'https://example.org/?full=1&end=2',time_context:{timezone_id:'Europe/Moscow',clock_source:'system_clock'},transition_qualifiers:['forward_back','client_redirect'],title:'Unicode Ω 😀'};
  const text=freezeSessionEvent(value),reordered=Object.fromEntries(Object.entries(value).reverse());reordered.time_context=Object.fromEntries(Object.entries(value.time_context).reverse());assert.notEqual(JSON.stringify(reordered,null,2),text);assert.ok(sameSessionEvent(value,reordered));assert.equal(freezeSessionEvent(text),text);assert.deepEqual(parseSessionEvent(text),value);
  for(const changed of [{...value,title:'different'},{...value,sequence:4},{...value,url:value.url+'x'},{...value,transition_qualifiers:[...value.transition_qualifiers].reverse()},{...value,title:null}])assert.equal(sameSessionEvent(value,changed),false);
  assert.throws(()=>parseSessionEvent('{partial'));assert.throws(()=>parseSessionEvent(JSON.stringify({...value,event_id:'../escape'})));assert.throws(()=>parseSessionEvent(JSON.stringify({...value,observed_at:'not a date'})));
});
test('missing workspace metadata blocks case paths, listing and creation before any disk access',async()=>{
  const root=new Proxy({},{get(){throw new Error('Unexpected disk access');}});
  for(const workspace of [null,undefined,{}, {mode:'invalid'}]){
    assert.throws(()=>casePath(workspace,'case'),/Workspace is not connected/u);
    await assert.rejects(listCases(root,workspace),/Workspace is not connected/u);
    await assert.rejects(createCase(root,workspace,'Case title','CASE-001'),/Workspace is not connected/u);
  }
});
test('resource credentials keep source authentication and omit cross-origin cookies',()=>{
  assert.equal(resourceCredentials('https://site.test/private.png','https://site.test/page'),'include');
  for(const url of ['https://fonts.googleapis.com/css2?family=Inter','https://cdn.site.test/font.woff2','http://site.test/image','https://site.test:8443/image'])assert.equal(resourceCredentials(url,'https://site.test/page'),'omit');
  assert.equal(resourceCredentials('bad url','https://site.test'),'omit');
});
test('full screenshot tiles cover both axes, clamp final overlap and reject oversized allocations',()=>{const p=planTiles(1500,2400,800,600,1.25);assert.equal(p.width,1875);assert.equal(p.height,3000);assert.equal(p.tiles.length,10);assert.deepEqual(p.tiles.at(-1),{x:700,y:1800});assert.equal(planTiles(800,600,800,600).tiles.length,1);assert.throws(()=>planTiles(10000,10000,800,600));assert.throws(()=>planTiles(500,500,0,600));assert.throws(()=>planTiles(100,100000,800,600,0.1));});
test('portable paths reject traversal and Windows reserved characters',()=>{for(const bad of ['../a','/a','a\\b','C:/a','a//b','a/../x','a.','a/'])assert.throws(()=>safePath(bad));assert.deepEqual(safePath('cases/abc/captures/1.html'),['cases','abc','captures','1.html']);});
test('conservative normalization preserves email local part and phone context',()=>{assert.equal(normalize('email','User.Name@EXAMPLE.COM'),'User.Name@example.com');assert.equal(normalize('phone','8 (900) 123-45-67'),'8 (900) 123-45-67');assert.equal(normalize('domain','ПРИМЕР.РФ'),'xn--e1afmkfd.xn--p1ai');assert.equal(normalize('person','Иван Иванов'),'Иван Иванов');});
test('anchor finds exact context and does not guess duplicate or missing quotes',()=>{assert.equal(locateQuote('ab name cd',{exact:'name',prefix:'ab ',suffix:' cd'}).status,'attached');assert.equal(locateQuote('name name',{exact:'name'}).status,'ambiguous');assert.equal(locateQuote('another',{exact:'name'}).status,'orphaned');assert.equal(locateQuote('😀 Иван',{exact:'Иван',prefix:'😀 '}).start,3);});
test('event replay is ordered, schema-gated and records immutable versions',()=>{const a={schema_version:1,sequence:1,record_type:'captures',value:{capture_id:'x',state:'capturing'}},b={...a,sequence:2,value:{capture_id:'x',state:'completed'}};assert.equal(foldEvents([b,a]).captures.x.state,'completed');assert.throws(()=>foldEvents([{...a,schema_version:9}]));assert.equal(a.value.state,'capturing');});
test('export shares captures and keeps all separate evidence references',()=>{const s={captures:{a:{capture_id:'a',state:'completed',artifacts:[{artifact_id:'file'}]}},annotations:{},entities:{a:{entity_id:'1'},b:{entity_id:'2'},c:{entity_id:'3'}},refs:{}};for(let i=0;i<5;i++)s.refs[i]={reference_id:String(i),artifact_id:'file',capture_id:'a'};const out=makeExport(s,{case_id:'case'});assert.equal(out.entities.length,3);assert.equal(out.evidence.length,1);assert.equal(out.evidence_refs.length,5);assert.equal(out.relations.length,0);s.refs[0].artifact_id='bad';assert.throws(()=>makeExport(s,{}));});
test('closed pages, incognito and pause are rejected; legacy domain settings never block capture',()=>{for(const tab of [{url:'chrome://settings'},{url:'https://x',incognito:true}])assert.throws(()=>assertWebTab(tab));assert.throws(()=>assertWebTab({url:'https://x'},{paused:true}));for(const url of ['https://a.bank.test','https://mail.google.com','https://gmail.com'])assert.doesNotThrow(()=>assertWebTab({url},{blockedDomains:['bank.test','google.com','gmail.com']}));});
test('migration removes obsolete domain rules and preserves other preferences without mutating the input',()=>{
  const settings={theme:'dark',paused:false,maxBytes:123,hiddenAnnotationDomains:['example.org'],blockedDomains:['google.com'],allowedCaptureHosts:['mail.google.com']};assert.deepEqual(removeLegacyCaptureFilters(settings),{theme:'dark',paused:false,maxBytes:123,hiddenAnnotationDomains:['example.org']});assert.deepEqual(settings.blockedDomains,['google.com']);assert.deepEqual(removeLegacyCaptureFilters(),{});
});
test('display time includes milliseconds and explicit UTC offset',()=>assert.match(localTime('2026-10-22T11:42:17.384Z'),/\.384 \(UTC[+-]\d{2}:\d{2}\)/u));
test('host permissions do not include unsupported port components',()=>assert.equal(hostPattern('http://localhost:8123/test'),'http://localhost/*'));
test('domain filter matches hosts, subdomains and IDNA; never query strings or suffix lookalikes',()=>{
  assert.equal(matchesDomain('https://a.example.org/x','example.org'),true);assert.equal(matchesDomain('https://example.org.evil.test/','example.org'),false);assert.equal(matchesDomain('https://evil.test/?url=example.org','example.org'),false);assert.equal(matchesDomain('https://xn--e1afmkfd.xn--p1ai/x','пример.рф'),true);assert.equal(matchesDomain('https://example.org/','https://example.org/path'),true);
});
test('entity filters resolve source URLs through immutable reference IDs',()=>assert.deepEqual(recordUrls({evidence_refs:['r','missing']},{r:{source_url:'https://example.org'}}),['https://example.org']));
test('citation includes original full URL, UTC and complete checksums without inventing artifacts',()=>{
  const record={source:{title:'Источник',final_url:'https://example.org/?token=important'},capture_id:'capture',times:{capture_started_at:'2026-10-22T11:42:17.384Z'},artifacts:[{relative_path:'captures/a.html',sha256:'a'.repeat(64)}]};const result=citation(record,'Точная цитата');assert.ok(result.includes(record.source.final_url));assert.ok(result.includes('a'.repeat(64)));assert.ok(result.includes('Точная цитата'));assert.ok(result.includes('.384Z'));assert.match(citation({...record,artifacts:[]}),/No verified files/u);
});

test('route classification keeps visits and excludes technical state/title/anchor noise',()=>{
  assert.equal(pageAddress('https://example.org/a?q=1#x'),'https://example.org/a?q=1');
  for(const type of ['navigation','tab_snapshot','tab_activated','tab_entered'])assert.equal(isSessionVisit({type,url:'https://example.org/a'}),true);
  for(const type of ['page_title','fragment','tab_left','session_started','link_target'])assert.equal(isSessionVisit({type,url:'https://example.org/a'}),false);
  assert.equal(isSessionVisit({type:'history_state',url:'https://example.org/a#new',previous_url:'https://example.org/a#old'}),false);
  assert.equal(isSessionVisit({type:'history_state',url:'https://example.org/b',previous_url:'https://example.org/a'}),true);
});
test('bounded text comparison preserves exact changed lines and discloses coarse fallback',()=>{
  assert.equal(compareText('same','same').same,true);
  assert.deepEqual(compareText('a\nx\nb','a\ny\nb').rows,[{kind:'removed',text:'x'},{kind:'added',text:'y'}]);
  assert.deepEqual(compareText('','Ω\n😀').rows,[{kind:'added',text:'Ω'},{kind:'added',text:'😀'}]);
  assert.deepEqual(compareText('one\ntwo','one').rows,[{kind:'removed',text:'two'}]);
  assert.equal(compareText('a\nsame\nb','c\nsame\nd',1).method,'changed_region');
  assert.throws(()=>compareText(Array(12002).fill('line').join('\n'),''),/12000/u);
});
