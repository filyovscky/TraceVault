import {cp, mkdir, readFile} from 'node:fs/promises';
const manifest = JSON.parse(await readFile('extension/manifest.json','utf8'));
if (manifest.manifest_version !== 3) throw new Error('MV3 required');
await mkdir('dist',{recursive:true});
await cp('extension','dist',{recursive:true});
console.log('Built dist/ TraceVault '+manifest.version);
