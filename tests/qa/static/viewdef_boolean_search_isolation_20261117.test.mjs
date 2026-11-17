import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const uiSource = read('wwwroot/js/services/search_ui_controller.js');
const searchSource = read('wwwroot/js/responsibilities/search_filter.js');
const projectionSource = read('wwwroot/js/services/viewdef_maintenance_projection.js');

function makeRawControlContext() {
  const start = uiSource.indexOf('  function rawControl(');
  const end = uiSource.indexOf('  function captureValues(', start);
  assert.ok(start !== -1 && end > start);
  const context = { console };
  vm.createContext(context);
  vm.runInContext(uiSource.slice(start, end), context);
  vm.runInContext(searchSource, context);
  vm.runInContext(projectionSource, context);
  return context;
}

function simulateControlFactory({ field, prefix }) {
  // Match the actual FieldControlRegistry selection for the relevant field.
  // A checkbox's HTML input.value is 'on' even when indeterminate.
  if (field?.edit?.control === 'boolean-checkbox') {
    return { tagName: 'INPUT', type: 'checkbox', value: 'on', dataset: {} };
  }
  return { tagName: 'SELECT', value: '', dataset: {} };
}

test('ViewDef boolean edit controls stay out of the Search UI: the search criterion is blank by default', () => {
  const context = makeRawControlContext();
  const fields = json('defs/common/view_def_maint_fields_v0_2.json').views[0].sections.find(s => s.id === 'fields').fields;
  const booleanSearchFields = fields.filter(field => field.type === 'boolean' && field.search?.visible);
  assert.ok(booleanSearchFields.length >= 3);
  for (const field of booleanSearchFields) {
    assert.equal(field.edit?.control, 'boolean-checkbox');
    const input = context.rawControl(field, '', simulateControlFactory, {
      currentOperator: 'equals', capability: { value_family: 'boolean' }
    });
    assert.equal(input.tagName, 'SELECT', `search for ${field.field} must not be checkbox`);
    assert.equal(input.value, '', `search for ${field.field} must default to blank`);
    const criteria = context.SearchFilter.criteriaFromInputs([input], fields);
    assert.equal(criteria.length, 0, `search for ${field.field} must not filter rows by default`);
  }
});

test('ViewDef field rows survive unselected boolean searches (regression: all rows vanished)', () => {
  const context = makeRawControlContext();
  const target = json('defs/rules/studio_work_incident_view_def_v0_5.json');
  const maint = json('defs/common/view_def_maint_fields_v0_2.json');
  const projected = context.buildViewDefMaintenanceDocument(target);
  const configured = context.configureViewDefMaintenanceViewDef(maint, target);
  const fields = configured.views[0].sections.find(s => s.id === 'fields').fields;
  const ref = context.viewDefMaintenancePreferredDefaultSectionRef(context.viewDefMaintenanceSectionCatalog(target));
  const rows = projected.__studio_viewdef_maintenance_fields.filter(row => row.__maintenance_section_ref === ref);
  assert.ok(rows.length > 0, 'fixture must have real ViewDef field rows');
  const checks = fields.filter(field => field.type === 'boolean' && field.search?.visible)
    .map(field => context.rawControl(field, '', simulateControlFactory, {
      currentOperator: 'equals', capability: { value_family: 'boolean' }
    }));
  const criteria = context.SearchFilter.criteriaFromInputs(checks, fields);
  assert.equal(criteria.length, 0);
  assert.equal(context.SearchFilter.apply(rows, criteria).length, rows.length);
  const selected = checks[0];
  selected.value = 'true';
  assert.ok(context.SearchFilter.apply(rows, context.SearchFilter.criteriaFromInputs(checks, fields)).length < rows.length,
    'explicit selection continues to filter normally');
});

test('search JS uses a fresh cache key so WebView2 cannot keep the old checkbox search renderer', () => {
  assert.match(read('wwwroot/index.html'), /search_ui_controller\.js\?v=[^"']*boolSearchIsolation=20261117/);
});
