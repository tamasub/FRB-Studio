// Production Studio does not need a defs/launch shadow. Launch passes an
// absolute, trusted canonical ViewDef path via its own ChangeSet config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readSnapshot} from '../../tools/change_core/storage.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const CLI=path.join(root,'tools/change_core/cli.mjs');
const viewRef='launch/frb_launch_maintenance_view_def_v0_1.json';

test('trusted external Launch ViewDef supports SHA-checked dry_run/commit',async(t)=>{
 const dir=await mkdtemp(path.join(tmpdir(),'launch-viewdef-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'frb_launch_data.json'),config=path.join(dir,'trusted.json'),def=path.join(dir,'frb_launch_maintenance_view_def_v0_1.json');
 await writeFile(file,JSON.stringify({pages:[{page_id:'work',title:'Work'}],items:[]},null,2));
 await writeFile(def,JSON.stringify({views:[{id:'items_view',sections:[{id:'items',type:'grid',dataPath:'$.items',keyField:'item_id'}]}]}));
 await writeFile(config,JSON.stringify({schema_version:'studio_change_core_config_v0_1',documents:{approved_launch_config:{path:file,view_def:viewRef,view_def_path:def,view_id:'items_view',section_ids:['items']}}}));
 const base=await readSnapshot(file);
 const req={schema_version:'studio_changeset_v0_1',request_id:'launch-owned',mode:'dry_run',document_ref:'approved_launch_config',base_sha256:base.sha256,view_def:viewRef,view_id:'items_view',operations:[{operation:'add',section_id:'items',records:[{title:'Launch-owned'}]}]};
 function call(){const r=spawnSync(process.execPath,[CLI,'--config',config],{input:JSON.stringify(req),encoding:'utf8'});return {exit:r.status,out:JSON.parse(r.stdout)}}
 const preview=call();assert.equal(preview.exit,0);assert.equal(preview.out.status,'PREVIEW');assert.equal((await readSnapshot(file)).sha256,base.sha256);
 req.mode='commit';const committed=call();assert.equal(committed.exit,0);assert.equal(committed.out.status,'COMMITTED');
 const persisted=JSON.parse(await readFile(file,'utf8'));assert.equal(persisted.items[0].title,'Launch-owned');
});

test('untrusted request cannot redirect a trusted Launch ViewDef path',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'launch-viewdef-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'doc.json'),config=path.join(dir,'trusted.json'),def=path.join(dir,'frb_launch_maintenance_view_def_v0_1.json');
 await writeFile(file,'{"items":[]}');await writeFile(def,'{"views":[]}');
 await writeFile(config,JSON.stringify({schema_version:'studio_change_core_config_v0_1',documents:{approved_launch_config:{path:file,view_def:viewRef,view_def_path:def,view_id:'items_view',section_ids:['items']}}}));
 const snap=await readSnapshot(file);
 const req={schema_version:'studio_changeset_v0_1',request_id:'redirect',mode:'dry_run',document_ref:'approved_launch_config',base_sha256:snap.sha256,view_def:'launch/other.json',view_id:'items_view',operations:[{operation:'add',section_id:'items',records:[{title:'ignored'}]}]};
 const r=spawnSync(process.execPath,[CLI,'--config',config],{input:JSON.stringify(req),encoding:'utf8'});const out=JSON.parse(r.stdout);
 assert.equal(r.status,1);assert.equal(out.errors[0].code,'VIEW_MISMATCH');
});
