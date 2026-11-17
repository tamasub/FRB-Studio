import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(file,'utf8');
const source = read('wwwroot/js/runtime/live_view_design.js');
const section = { id:'rows', type:'grid', dataPath:'$.rows' };
function sandbox() {
  const context = vm.createContext({
    document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    mainView(){return {id:'main'};}
  });
  vm.runInContext(source,context);
  return (expr)=>vm.runInContext(expr,context);
}

test('compact Studio removes visual Drop, character count, and left rail without losing real control IDs',()=>{
  const html = read('wwwroot/index.html');
  const css = read('wwwroot/css/studio-compact-json.css');
  for (const id of ['dataNameInput','defNameInput','loadBtn','saveBtn','jsonMetaFileName','status']) {
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`duplicate or missing ${id}`);
  }
  assert.match(html,/pagebarMain\.appendChild\(controls\)/);
  assert.doesNotMatch(html,/class="drop-file-box/);
  assert.match(html,/id="jsonMetaCharCount" hidden/);
  assert.match(html,/id="studioJsonBottomBar"/);
  assert.match(css,/\.json-studio-source-pane \{ display:none!important; \}/);
  assert.match(css,/\.studio-json-statusbar[\s\S]*position:fixed; bottom:0/);
});

test('Grid resize draft never affects the Editor and Editor draft never affects the Grid',()=>{
  const run=sandbox();
  run(`var field={field:'title',type:'text',width:310,grid:{width:125}}; var section={id:'rows',type:'grid',dataPath:'$.rows'}`);
  assert.equal(run(`studioResolvedFieldWidth(field,'grid',section)`),125);
  assert.equal(run(`studioResolvedFieldWidth(field,'detail',section)`),310);
  run(`studioSetLiveFieldWidth(field,240,section,'grid.resize')`);
  assert.equal(run(`studioResolvedFieldWidth(field,'grid',section)`),240);
  assert.equal(run(`studioResolvedFieldWidth(field,'detail',section)`),310);
  run(`studioSetLiveFieldWidth(field,430,section,'detail.resize')`);
  assert.equal(run(`studioResolvedFieldWidth(field,'grid',section)`),240);
  assert.equal(run(`studioResolvedFieldWidth(field,'detail',section)`),430);
  assert.equal(run(`studioFieldWidthDrafts.size`),2);
});

test('Grid save changes grid.width only, Editor save changes Field.width only',()=>{
  const run=sandbox();
  run(`var field={field:'title',type:'text',width:310,grid:{width:125}}`);
  run(`studioApplyWidthEntry(field,{context:'grid',width:240})`);
  assert.equal(run(`field.width`),310);
  assert.equal(run(`field.grid.width`),240);
  run(`studioApplyWidthEntry(field,{context:'editor',width:430})`);
  assert.equal(run(`field.width`),430);
  assert.equal(run(`field.grid.width`),240);
});

test('Grid save snapshots legacy Editor width before replacing old grid width',()=>{
  const run=sandbox();
  run(`var field={field:'title',type:'text',grid:{width:160}}`);
  assert.equal(run(`studioResolvedFieldWidth(field,'detail',null)`),160);
  run(`studioApplyWidthEntry(field,{context:'grid',width:300})`);
  assert.equal(run(`studioResolvedFieldWidth(field,'detail',null)`),160);
  assert.equal(run(`studioResolvedFieldWidth(field,'grid',null)`),300);
});

test('standard native window stores its own bounds independently from Launch settings',()=>{
  const form=read('NativeShell/NativeShellForm.cs');
  const store=read('NativeShell/NativeShellWindowBounds.cs');
  assert.match(store,/studio_window_bounds\.json/);
  assert.match(store,/launcher_window_bounds\.json/);
  assert.match(store,/StorePath\(bool launcher\)/);
  assert.match(form,/NativeShellWindowBounds\.TryLoad\(out var studioBounds, launcher:false\)/);
  assert.match(form,/NativeShellWindowBounds\.TryLoad\(out var bounds, launcher:true\)/);
  assert.match(form,/WindowState == FormWindowState.Normal \? Bounds : RestoreBounds, launcher:_launcherPresentation/);
  assert.match(store,/Screen\.AllScreens/);
});
