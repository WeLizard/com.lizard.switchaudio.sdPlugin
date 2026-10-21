import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const manifest=read('manifest.json'),pkg=read('plugin/package.json');
const id='com.lizard.switchaudio.sdPlugin';
const output=path.join(root,'dist'),bundle=path.join(output,'AudioSwitch-1.4.0-StreamDock'),stage=path.join(bundle,id);
function check(name){
    if(typeof name!=='string'||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error('Unsafe package path: '+name);
    const resolved=path.join(root,name);
    if(!fs.existsSync(resolved))throw new Error('Missing required package file: '+name);
    return resolved;
}
if(manifest.Version!==pkg.version)throw new Error('Manifest/package versions differ');
for(const name of ['plugin/AudioSwitch.exe','plugin/main.js','plugin/settings.js','property.js','plugin/node_modules/ws/package.json','plugin/node_modules/ws/LICENSE','Install-StreamDock.ps1','Install-StreamDock.bat'])check(name);
if(fs.readFileSync(check('plugin/AudioSwitch.exe')).subarray(0,2).toString()!=='MZ')throw new Error('Helper is not a Windows executable');
if(read('plugin/node_modules/ws/package.json').version!==pkg.dependencies.ws)throw new Error('Installed ws differs from pinned dependency');
if(process.platform==='win32'){
    const version=JSON.parse(execFileSync(check('plugin/AudioSwitch.exe'),['version'],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,''));
    if(version.version!==manifest.Version)throw new Error('Helper is stale');
    const test=JSON.parse(execFileSync(check('plugin/AudioSwitch.exe'),['selftest'],{encoding:'utf8',windowsHide:true}));
    if(!test.success)throw new Error('Native self-test failed');
}
const images=[manifest.Icon,manifest.CategoryIcon];
for(const action of manifest.Actions){
    if(action.PropertyInspectorPath)check(action.PropertyInspectorPath);
    images.push(action.Icon,...action.States.map(s=>s.Image));
}
for(const name of images){if(!fs.existsSync(path.join(root,name)))check(name+'.svg');}
check(manifest.CodePath);check(manifest.CodePathWin);
fs.rmSync(bundle,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
const rootFiles=fs.readdirSync(root).filter(n=>/^(property.*\.(html|js)|manifest\.json|en\.json|ru\.json|zh\.json|LICENSE)$/.test(n));
for(const name of rootFiles)fs.copyFileSync(check(name),path.join(stage,name));
fs.cpSync(path.join(root,'images'),path.join(stage,'images'),{recursive:true});
fs.mkdirSync(path.join(stage,'plugin'),{recursive:true});
for(const name of ['main.js','settings.js','package.json','package-lock.json','AudioSwitch.exe'])fs.copyFileSync(check('plugin/'+name),path.join(stage,'plugin',name));
fs.cpSync(check('plugin/node_modules/ws'),path.join(stage,'plugin/node_modules/ws'),{recursive:true});
for(const name of ['Install-StreamDock.ps1','Install-StreamDock.bat','README_ru.md','README.md','CHANGELOG.md'])fs.copyFileSync(check(name),path.join(bundle,name));
const hashes=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else hashes.push(createHash('sha256').update(fs.readFileSync(full)).digest('hex')+'  '+path.relative(bundle,full).replaceAll('\\','/'));}}
walk(bundle);fs.writeFileSync(path.join(bundle,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
// A real ZIP (store method), without another packaging dependency or a shell command.
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data){let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function zip(directory,destination){
    const files=[];function collect(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())collect(full);else files.push(full);}}collect(directory);
    const chunks=[],central=[];let offset=0;
    for(const file of files){const name=Buffer.from(path.relative(directory,file).replaceAll('\\','/'));const data=fs.readFileSync(file),crc=crc32(data);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);chunks.push(local,name,data);
        const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);central.push(record,name);offset+=local.length+name.length+data.length;}
    const directoryData=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directoryData.length,12);end.writeUInt32LE(offset,16);fs.writeFileSync(destination,Buffer.concat([...chunks,directoryData,end]));
}
zip(bundle,path.join(output,'AudioSwitch-1.4.0-StreamDock.zip'));
console.log('Package validated: '+hashes.length+' files. Mandatory helper, inspectors, icons, dependencies and checksums included.');
