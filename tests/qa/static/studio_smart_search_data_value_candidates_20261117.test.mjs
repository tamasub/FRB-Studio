// 2026-11-17: Native (non-combo) fields offer values from loaded data.
// A dropdown shows max 50 distinct matches, but its filter searches all matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = {console};
vm.createContext(ctx);
for (const file of [
  'wwwroot/js/responsibilities/smart_search_engine.js',
  'wwwroot/js/ui/studio_smart_search_editor.js'
]) vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
const editor=ctx.StudioSmartSearchEditor;
const textField={field:'title',caption:'タイトル',type:'text'};

test('Non-combo text, number, date fields use distinct scalar values from active grid rows',()=>{
  const rows=[
    {title:'山田',score:0,at:'2026-11-17',memo:null},
    {title:'山田',score:0,at:'2026-11-17',memo:null},
    {title:'佐藤',score:42,at:'2026-11-16',memo:{value:'not a scalar'}},
    {title:'  長い 題名',score:2,at:'2026-11-15',memo:['青','赤','青']},
  ];
  assert.deepEqual(Array.from(editor.valueChoices(textField,rows),x=>x.value),['山田','佐藤','  長い 題名']);
  assert.deepEqual(Array.from(editor.valueChoices({field:'score',type:'number'},rows),x=>x.value),['0','42','2']);
  assert.deepEqual(Array.from(editor.valueChoices({field:'at',type:'date'},rows),x=>x.value),['2026-11-17','2026-11-16','2026-11-15']);
  assert.deepEqual(Array.from(editor.valueChoices({field:'memo',type:'text'},rows),x=>x.value),['青','赤']);
  assert.equal(editor.valueChoices({field:'unknown',type:'text'},rows).length,0);
  assert.equal(editor.valueChoices(textField).length,0); // no loaded rows -> no fabricated values
  assert.equal(rows[0].title,'山田');
});

test('Nested dotted keys and a literal dotted property follow existing SmartSearch rules',()=>{
  const f={field:'owner.name',caption:'担当者',type:'text'};
  const rows=[{owner:{name:'Alice'}},{'owner.name':'Bob'},{owner:{name:'Alice'}}];
  assert.deepEqual(Array.from(editor.valueChoices(f,rows),x=>x.value),['Alice','Bob']);
  assert.equal(editor.valueContext('担当者=',[f],rows)?.field.field,'owner.name');
  assert.equal(editor.valueContext('担当者=',[f],[])?.field,undefined);
});

test('50 cap is after de-duplication and filtering, with accurate truncated warning metadata',()=>{
  const rows=Array.from({length:128},(_,i)=>({title:'候補'+String(i+1).padStart(3,'0')}));
  rows.push({title:'候補002'});
  const full=editor.valueChoices(textField,rows);
  assert.equal(full.length,128);
  const initial=editor.valueCandidatePage(full);
  assert.equal(initial.items.length,50);
  assert.equal(initial.total,128);
  assert.equal(initial.omitted,78);
  assert.equal(initial.items.at(-1).value,'候補050');
  const late=editor.valueCandidatePage(full,'候補128');
  assert.deepEqual(Array.from(late.items,x=>x.value),['候補128']);
  assert.equal(late.omitted,0);
  const broad=editor.valueCandidatePage(full,'候補1');
  assert.equal(broad.total,29);
  assert.equal(broad.omitted,0);
  assert.equal(editor.valueCandidatePage(full.slice(0,50)).omitted,0);
  assert.equal(editor.valueCandidatePage(full.slice(0,51)).omitted,1);
});

test('Select labels and Boolean options retain previous completion and search parser semantics',()=>{
  const select={field:'status',caption:'状態',type:'select',options:[{cd:'DONE',name:'完了'},{cd:'TODO',name:'未完了'}]};
  const rows=[{status:'DONE'},{status:'TODO'}];
  assert.deepEqual(Array.from(editor.valueChoices(select,rows),x=>x.label),['完了','未完了']);
  assert.equal(editor.valueChoices(select,rows)[0].value,'DONE');
  assert.deepEqual(Array.from(editor.valueChoices({field:'enabled',type:'boolean'},[{enabled:true}]),x=>x.value),['true','false']);
  assert.equal(ctx.StudioSmartSearch.evaluate({title:'  長い 題名'}, ctx.StudioSmartSearch.parse('タイトル="  長い 題名"',[textField])),true);
  assert.equal(ctx.StudioSmartSearch.evaluate({title:'候補128'},ctx.StudioSmartSearch.parse('タイトル=候補128',[textField])),true);
});

test('Integration: read currentRows, show 50 and a truncation explanation, keep filter and keyboard',()=>{
  const app=fs.readFileSync('wwwroot/app.js','utf8');
  const editorJs=fs.readFileSync('wwwroot/js/ui/studio_smart_search_editor.js','utf8');
  const css=fs.readFileSync('wwwroot/styles.css','utf8');
  const html=fs.readFileSync('wwwroot/index.html','utf8');
  assert.match(app,/getRows:\s*\(\) => Array\.isArray\(currentRows\) \? currentRows : \[\]/);
  assert.match(editorJs,/summary\.textContent=summary\.hidden/);
  assert.match(editorJs,/残り\$\{state\.omitted\}件は省略/);
  assert.match(editorJs,/候補検索で省略分も探せます/);
  assert.match(editorJs,/state\.items=page\.items/);
  assert.match(editorJs,/function valueCandidatePage\(items, query='', limit=VALUE_CANDIDATE_LIMIT\)/);
  assert.match(editorJs,/filter\.addEventListener\('input',updateCandidateFilter\)/);
  assert.match(editorJs,/if \(isConfirmKey\(event\.key\) && state\.items\.length\)/);
  assert.match(css,/studio-smart-search-candidate-summary/);
  assert.match(html,/studio-smart-search-data-values-50-20261117/);
});
