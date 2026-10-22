import {cp, mkdir, readFile,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
const manifest = JSON.parse(await readFile('extension/manifest.json','utf8'));
if (manifest.manifest_version !== 3) throw new Error('MV3 required');
const workspace=await realpath('.'),target=path.join(workspace,'dist');
try {const actual=await realpath(target);if(actual!==target || !actual.startsWith(workspace+path.sep))throw new Error('Unsafe build target');await rm(target,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir('dist',{recursive:true});
await cp('extension','dist',{recursive:true});
console.log('Built dist/ TraceVault '+manifest.version);
