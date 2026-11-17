import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const importer = require(path.join(root, 'wwwroot/js/responsibilities/csv_importer.js'));
const viewdef = JSON.parse(readFileSync(path.join(root, 'defs/launch_xxxx/frb_launch_maintenance_view_def_v0_1.json'),'utf8'));
const definition = viewdef.views.find(view => view.id === 'launch_choices_view').toolbar.csvImport;
const incoming = csv => importer.buildRows(csv, definition);
const mk = (id, group_id, title) => ({choice_id:id, group_id, title, value:title, sort_order:10});

// One group can be scattered through the original Grid; untouched row order
// and object references must survive a selective replacement.
test('replace_groups replaces only groups explicitly in CSV and keeps other groups intact', () => {
  assert.equal(definition.mode, 'replace_groups');
  assert.equal(definition.groupField, 'group_id');
  const old = [mk('import_mail_000001','絵文字','😀'),mk('s1','sales','old a'),mk('e2','絵文字','😁'),mk('s2','sales','old b'),mk('other','support','old c')];
  const before = JSON.stringify(old);
  const parsed = incoming('group_id,title,value\nsales,new one,one@example.com\nsales,new two,two@example.com\n');
  const result = importer.replaceGroups(old, parsed, definition);
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.groups, [{group:'sales',before:2,after:2}]);
  assert.deepEqual(result.rows.map(row=>row.title), ['😀','new one','new two','😁','old c']);
  assert.strictEqual(result.rows[0], old[0]);
  assert.strictEqual(result.rows[3], old[2]);
  assert.strictEqual(result.rows[4], old[4]);
  assert.equal(result.rows[1].choice_id, 'import_mail_000002');
  assert.equal(result.rows[2].choice_id, 'import_mail_000003');
  assert.equal(JSON.stringify(old), before);
});

test('two groups replaced, groups not present in existing data appended; all IDs stay unique', () => {
  const old = [mk('import_mail_000001','keep','k'),mk('sales_old','sales','s'),mk('se_old','se','d')];
  const parsed = incoming('group_id,value\nsales,a@a.example\nnew_group,b@b.example\nse,c@c.example');
  const result = importer.replaceGroups(old, parsed, definition);
  assert.deepEqual(result.groups.map(g=>[g.group,g.before,g.after]), [['sales',1,1],['new_group',0,1],['se',1,1]]);
  assert.deepEqual(result.rows.map(r=>r.group_id), ['keep','sales','se','new_group']);
  const ids=result.rows.map(r=>r.choice_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'import_mail_000001');
});

test('import rejects missing or empty group id before any merge is possible', () => {
  assert.throws(()=>incoming('value\na@example.com'), /グループ列/);
  assert.throws(()=>incoming('group_id,value\n,a@example.com'), /group_idが空/);
  assert.throws(()=>incoming('group_id,value\n  ,a@example.com'), /group_idが空/);
  assert.throws(()=>incoming('group_id,value\nsales,'), /valueが空/);
  assert.throws(()=>incoming('group_id,value\n"sales,x@example.com'), /引用符/);
  const old=[mk('id','other','unchanged')];
  assert.throws(()=>importer.replaceGroups(old,[{group_id:'', value:'a'}],definition), /group_idが空/);
  assert.equal(old.length,1);
});

test('replace_all remains independently available and does not require a group column', () => {
  const all={...definition, mode:'replace_all'};
  const rows=importer.buildRows('value\nx@example.com',all);
  assert.equal(rows.length,1);
  assert.equal(rows[0].group_id,'');
});

test('UI confirms preview with group counts and auto-applies only after confirmation', () => {
  const code=readFileSync(path.join(root,'wwwroot/js/runtime/related_grid_view.js'),'utf8');
  assert.match(code,/definition\.mode === 'replace_groups'/);
  assert.match(code,/CsvGridImporter\.replaceGroups\(previousRows, importedRows, definition\)/);
  assert.match(code,/merged\.groups\.slice/);
  const region=code.slice(code.indexOf('const importedRows = CsvGridImporter.buildRows'));
  assert.ok(region.indexOf('CsvGridImporter.replaceGroups') < region.indexOf('window.confirm'));
  assert.ok(region.indexOf('window.confirm') < region.indexOf('setByPath(sourceData, relatedGridChildRuntime.dataPath, updatedRows)'));
  assert.match(region,/queueRelatedGridAutoApply\(\)/);
  assert.match(region,/setByPath\(sourceData, relatedGridChildRuntime.dataPath, previousRows\)/);
});
