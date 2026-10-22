import {readFile,writeFile} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8')),rows=[];
for(const location of Object.keys(lock.packages).filter(p=>p.startsWith('node_modules/'))) {
  const p=JSON.parse(await readFile(location+'/package.json','utf8'));rows.push(`| ${p.name} | ${p.version} | ${typeof p.license==='string'?p.license:JSON.stringify(p.license || 'NOT DECLARED')} | development |`);
}
await writeFile('docs/LICENSES.md','# Dependency license inventory\n\nRuntime: no third-party code. The capture engine is independently implemented. SingleFile is NOT distributed. TraceVault itself has no open-source license grant specified by its owner yet.\n\nGenerated from installed locked package metadata; inspect notices in each package when distributing development tooling. Playwright browser binaries are test tools, not included in dist/.\n\n| Package | Version | Declared license | Scope |\n|---|---|---|---|\n'+rows.sort().join('\n')+'\n');
console.log('Inventoried '+rows.length+' development packages');
