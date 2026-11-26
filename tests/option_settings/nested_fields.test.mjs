import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {composeOptions,saveOptions} from '../../tools/option_settings/options_core.mjs';
import {fieldsFromViewDef,matchesVisibility} from '../../tools/option_settings/web/field_contract.mjs';
import {createLaunchFixture} from './option_fixture.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const number=field=>({field,type:'number',edit:{min:0,max:3600,step:1}});
const cond={all:[{field:'enabled',equals:true},{field:'update_mode',equals:'auto'}]};
async function fixture(t){
 const base=await mkdtemp(path.join(os.tmpdir(),'frb-nested-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const {systemRoot,defs}=await createLaunchFixture(base);
 const system=path.join(systemRoot,'file_index_options.json');await cp(path.join(here,'fixtures','file_index_options.json'),system);
 const file=path.join(defs,'file_index_view_def.json');const view=JSON.parse(await readFile(file,'utf8'));
 view.views[0].sections[0].fields.push(number('auto_update.startup_delay_seconds'));
 view.views[0].sections.push({type:'form',dataPath:'$.auto_update',fields:[{...number('check_interval_minutes'),visibleWhen:cond}]});
 await writeFile(file,JSON.stringify(view));
 return {args:{studioRoot:path.resolve(here,'../..'),systemRoot,userRoot:path.join(base,'user'),id:'file_index'},file,view,system};
}
test('dotted fields and nested forms share canonical leaf ownership, save nested JSON and preserve internal siblings',async t=>{
 const {args,system}=await fixture(t);const original=await readFile(system);
 const before=await composeOptions(args);
 assert.deepEqual(before.edited.auto_update,{startup_delay_seconds:90,check_interval_minutes:30});
 await assert.rejects(stat(before.userFile),{code:'ENOENT'});
 before.edited.auto_update={startup_delay_seconds:300,check_interval_minutes:0};before.edited.enabled=false;
 const after=await saveOptions(args,{edited:before.edited,revision:before.revision});
 assert.deepEqual(JSON.parse(await readFile(after.userFile,'utf8')).auto_update,{startup_delay_seconds:300,check_interval_minutes:0});
 assert.deepEqual(after.effective.auto_update,{startup_delay_seconds:300,check_interval_minutes:0,max_scan_workers:99});
 assert.deepEqual(after.edited.auto_update,before.edited.auto_update);
 assert.deepEqual(await readFile(system),original);
});
test('nested fields reject duplicate canonical paths, invalid paths, missing fields and unpublished siblings',async t=>{
 const {args,file,view}=await fixture(t);const before=await composeOptions(args);
 for(const patch of [{...before.edited,auto_update:{startup_delay_seconds:300}},{...before.edited,auto_update:{...before.edited.auto_update,max_scan_workers:2}},{...before.edited,auto_update:{...before.edited.auto_update,check_interval_minutes:-1}}]){
  await assert.rejects(saveOptions(args,{edited:patch,revision:before.revision}),{code:'VALIDATION_FAILED'});
 }
 view.views[0].sections[1].fields.push(number('startup_delay_seconds'));
 await writeFile(file,JSON.stringify(view));await assert.rejects(composeOptions(args),{code:'BAD_VIEWDEF'});
 view.views[0].sections[1].fields.pop();view.views[0].sections[1].dataPath='$.constructor';
 await writeFile(file,JSON.stringify(view));await assert.rejects(composeOptions(args),{code:'BAD_VIEWDEF'});
});
test('AND visibility: both conditions, legacy aliases, nested root references, numeric zero, missing reference',()=>{
 for(const enabled of [true,false])for(const update_mode of ['auto','manual']){
  const values={enabled,update_mode};assert.equal(matchesVisibility(cond,k=>values[k]),enabled&&update_mode==='auto');
 }
 assert.equal(matchesVisibility({field:'enabled',equals:true},()=> 'true'),true);
 assert.equal(matchesVisibility({source_field:'mode',values:['embedded']},()=> 'embedded'),true);
 assert.equal(matchesVisibility({field:'$.auto_update.check_interval_minutes',equals:0},k=>k==='auto_update.check_interval_minutes'?0:undefined),true);
 assert.equal(matchesVisibility({field:'missing',equals:false},()=>undefined),false);
 assert.equal(matchesVisibility({all:[]},()=>true),false);
 assert.deepEqual(fieldsFromViewDef({views:[{sections:[{type:'form',dataPath:'$.a.b',fields:[number('c')]}]}]}).map(f=>f.field),['a.b.c']);
});
