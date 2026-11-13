import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,readFile,stat,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { composeOptions, saveOptions,OptionSettingsError } from '../../tools/option_settings/options_core.mjs';
import { createLaunchFixture } from './option_fixture.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const studioRoot=path.resolve(here,'../..');
async function fixture(t){
  const base=await mkdtemp(path.join(os.tmpdir(),'frb-option-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const {systemRoot}=await createLaunchFixture(base);const userRoot=path.join(base,'user');
  for(const file of ['webview_settings.json','file_index_options.json']){
    await cp(path.join(here,'fixtures',file),path.join(systemRoot,file));
  }
  return {studioRoot,systemRoot,userRoot};
}
async function json(pathname){return JSON.parse(await readFile(pathname,'utf8'));}
test('compose is read-only, does not materialize a User file, and hides System fields',async t=>{
 const a=await fixture(t);const original=await readFile(path.join(a.systemRoot,'webview_settings.json'));
 const composed=await composeOptions({...a,id:'webview'});
 assert.equal(composed.revision,'missing');
 assert.deepEqual(Object.keys(composed.edited),['remember_login','new_tab_url']);
 assert.equal(composed.edited.remember_login,true);
 assert.equal(composed.effective.default_zoom_percent,80);
 await assert.rejects(stat(composed.userFile),{code:'ENOENT'});
 assert.deepEqual(await readFile(path.join(a.systemRoot,'webview_settings.json')),original);
});
test('Save approves all displayed values, even if equal to System defaults',async t=>{
 const a=await fixture(t),before=await composeOptions({...a,id:'webview'});
 const after=await saveOptions({...a,id:'webview'},{edited:before.edited,revision:before.revision});
 assert.equal(after.revision==='missing',false);
 assert.deepEqual(await json(after.userFile),before.edited);
 assert.equal(Object.keys(await json(after.userFile)).length,2);
 assert.equal(after.effective.bookmark_preview_delay_ms,650);
});
test('saving changed permitted values never rewrites System defaults or hidden fields',async t=>{
 const a=await fixture(t);const p=path.join(a.systemRoot,'file_index_options.json'),original=await readFile(p);
 const composed=await composeOptions({...a,id:'file_index'});
 composed.edited.search_limit=200;composed.edited.enabled=false;
 const after=await saveOptions({...a,id:'file_index'},{edited:composed.edited,revision:composed.revision});
 const saved=await json(after.userFile);
 assert.equal(saved.search_limit,200);assert.equal(saved.enabled,false);
 for(const name of ['exclude_name_contains','exclude_directory_globs','scan_error_policy','index_target']){
   assert.equal(Object.hasOwn(saved,name),false);
   assert.deepEqual(after.effective[name],(JSON.parse(original.toString()))[name]);
 }
 assert.deepEqual(await readFile(p),original);
});
test('User override of a hidden key is NOT reflected into the composed configuration',async t=>{
 const a=await fixture(t);await mkdir(a.userRoot);
 await writeFile(path.join(a.userRoot,'file_index_options.json'),JSON.stringify({search_limit:150,index_target:'folders',scan_error_policy:'fail_root'}));
 const view=await composeOptions({...a,id:'file_index'});
 assert.equal(view.edited.search_limit,150);
 assert.equal(view.effective.index_target,'both');
 assert.equal(view.effective.scan_error_policy,'preserve_cached');
 const saved=await saveOptions({...a,id:'file_index'},{edited:view.edited,revision:view.revision});
 const final=await json(saved.userFile);
 assert.equal(Object.hasOwn(final,'index_target'),false);
 assert.equal(Object.hasOwn(final,'scan_error_policy'),false);
});
test('reject hidden additions, incomplete values, wrong types, and invalid URLs without writing',async t=>{
 const a=await fixture(t),before=await composeOptions({...a,id:'webview'});
 for(const edited of [
   {...before.edited,mode:'external'},
   {new_tab_url:'https://example.com'},
   {...before.edited,remember_login:'true'},
   {...before.edited,new_tab_url:'javascript:alert(1)'}
 ]){
  await assert.rejects(saveOptions({...a,id:'webview'},{edited,revision:before.revision}),OptionSettingsError);
 }
 await assert.rejects(stat(before.userFile),{code:'ENOENT'});
});
test('reject stale revision, never overwrite user-edited file',async t=>{
 const a=await fixture(t),before=await composeOptions({...a,id:'webview'});
 await saveOptions({...a,id:'webview'},{edited:before.edited,revision:before.revision});
 const original=await readFile(path.join(a.userRoot,'webview_settings.json'));
 await assert.rejects(saveOptions({...a,id:'webview'},{edited:{...before.edited,new_tab_url:'https://example.com/'},revision:before.revision}),e=>e.code==='STALE_REVISION');
 assert.deepEqual(await readFile(path.join(a.userRoot,'webview_settings.json')),original);
});
test('new published ViewDef Field inherits System value until user Save',async t=>{
 const a=await fixture(t);
 const viewDefFile=path.join(path.dirname(a.systemRoot),'defs','launch','options','webview_view_def.json');
 const view=await json(viewDefFile);
 view.views[0].sections[0].fields.push({field:'keep_tabs_on_home',caption:'ホームでもタブを保持',type:'boolean',edit:{visible:true}});
 await writeFile(viewDefFile,JSON.stringify(view));
 const first=await composeOptions({...a,id:'webview'});
 assert.equal(first.edited.keep_tabs_on_home,true);
 await assert.rejects(stat(first.userFile),{code:'ENOENT'});
 const second=await saveOptions({...a,id:'webview'},{edited:first.edited,revision:first.revision});
 assert.equal((await json(second.userFile)).keep_tabs_on_home,true);
});

test('readonly ViewDef help is shown only as ViewDef metadata, never saved or user-owned',async t=>{
 const a=await fixture(t);
 const composed=await composeOptions({...a,id:'file_index'});
 const fields=composed.viewDef.views[0].sections[0].fields;
 const help=fields.find(f=>f.field==='_index_mode_help');
 assert.equal(help.type,'textarea');assert.equal(help.readonly,true);
 assert.ok(help.defaultValue.includes('登録フォルダー'));
 assert.ok(!Object.hasOwn(composed.edited,'_index_mode_help'));
 const saved=await saveOptions({...a,id:'file_index'},{edited:composed.edited,revision:composed.revision});
 assert.ok(!Object.hasOwn(await json(saved.userFile),'_index_mode_help'));
 assert.deepEqual(saved.effective._index_mode_help, (await json(path.join(a.systemRoot,'file_index_options.json')))._index_mode_help);
});

test('Launch owns registry / ViewDef and can change presentation without changing Studio',async t=>{
 const a=await fixture(t);
 const target=path.join(path.dirname(a.systemRoot),'defs','launch','options','file_index_view_def.json');
 const doc=await json(target);
 doc.views[0].sections[0].fields.find(f=>f.field==='index_mode').options[0].label='設定画面の表示名';
 await writeFile(target,JSON.stringify(doc));
 const composed=await composeOptions({...a,id:'file_index'});
 assert.equal(composed.viewDef.views[0].sections[0].fields.find(f=>f.field==='index_mode').options[0].label,'設定画面の表示名');
 assert.equal(composed.edited.index_mode,'registered');
});
