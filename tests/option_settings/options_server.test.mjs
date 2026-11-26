import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,cp,mkdir,readFile,stat,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { createLaunchFixture } from './option_fixture.mjs';
const studioRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fixtureRoot=path.join(studioRoot,'tests','option_settings','fixtures');
test('loopback host serves ONE Editor, rejects unauthorized save, and commits exposed fields',async t=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'frb-option-host-'));
 const {systemRoot}=await createLaunchFixture(base),userRoot=path.join(base,'user');await cp(path.join(fixtureRoot,'webview_settings.json'),path.join(systemRoot,'webview_settings.json'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const child=spawn(process.execPath,[path.join(studioRoot,'tools','option_settings','server.mjs'),'--studio-root',studioRoot,'--system-root',systemRoot,'--user-root',userRoot],{stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 let info;
 const deadline=setTimeout(()=>child.kill(),5000);
 try{ info=await new Promise((resolve,reject)=>{
  let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.includes('\n')){
   try{resolve(JSON.parse(buffer.split('\n')[0]));}catch(e){reject(e);}
  }});child.on('exit',code=>reject(Error('Server exited '+code)));
 });}finally{clearTimeout(deadline);}
 const url=`http://127.0.0.1:${info.port}`;
 const header={'X-FRB-Option-Token':info.token};
 const html=await fetch(url+'/');assert.equal(html.status,200);
 const script=await (await fetch(url+'/editor.js')).text();assert.ok(script.includes('class GenericEditor'));
 const contract=await fetch(url+'/field_contract.mjs');assert.equal(contract.status,200);assert.match(contract.headers.get('content-type'),/javascript/);assert.match(await contract.text(),/export function matchesVisibility/);
 assert.equal((await fetch(url+'/api/options')).status,403);
 const doc=await (await fetch(url+'/api/compose?id=webview',{headers:header})).json();
 assert.deepEqual(Object.keys(doc.edited),['remember_login','new_tab_url']);
 await assert.rejects(stat(path.join(userRoot,'webview_settings.json')),{code:'ENOENT'});
 const jsonBody={edited:doc.edited,revision:doc.revision};
 const denied=await fetch(url+'/api/save?id=webview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(jsonBody)});
 assert.equal(denied.status,403);
 const saved=await fetch(url+'/api/save?id=webview',{method:'POST',headers:{...header,'Content-Type':'application/json'},body:JSON.stringify(jsonBody)});
 assert.equal(saved.status,200);
 assert.deepEqual(JSON.parse(await readFile(path.join(userRoot,'webview_settings.json'),'utf8')),doc.edited);
 const stale=await fetch(url+'/api/save?id=webview',{method:'POST',headers:{...header,'Content-Type':'application/json'},body:JSON.stringify(jsonBody)});
 assert.equal(stale.status,409);
});
