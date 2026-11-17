import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fieldJs = read('wwwroot/js/renderers/field_controls.js');
const detailJs = read('wwwroot/js/renderers/grid_detail.js');
const dataJs = read('wwwroot/js/core/data_utils.js');
const snippet = (source, start, end) => {
  const from = source.indexOf(start), until = source.indexOf(end, from);
  assert.ok(from !== -1 && until > from, `source section missing: ${start}`);
  return source.slice(from, until);
};

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {};
    this.children = []; this.parentNode = null; this.listeners = {};
    this.disabled = false; this.checked = false; this.indeterminate = false;
    this.className = ''; this.textContent = '';
  }
  appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  dispatchEvent(event) { (this.listeners[event.type] ?? []).forEach(fn => fn(event)); return true; }
  matches(selector) { return selector.startsWith('.') && this.className.split(/\s+/).includes(selector.slice(1)); }
  closest(selector) {
    for (let el = this; el; el = el.parentNode) if (el.matches(selector)) return el;
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  click() {
    if (this.disabled) return;
    if (this.type === 'checkbox') {
      this.indeterminate = false;
      this.checked = !this.checked;
    }
    this.dispatchEvent({ type: this.type === 'checkbox' ? 'change' : 'click' });
  }
}

const createSandbox = () => {
  const context = {
    document: { createElement: tag => new FakeElement(tag) },
    Event: class { constructor(type, options={}) { this.type = type; this.bubbles = Boolean(options.bubbles); } },
    HTMLSelectElement: class {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(snippet(fieldJs, 'function convertValue(', 'function formatNumber('), context);
  vm.runInContext(snippet(fieldJs, 'function studioSetBooleanCheckboxState(', 'function createTextLikeControlElement('), context);
  vm.runInContext(snippet(detailJs, 'function getControlValue(', 'function isControlReadonly('), context);
  vm.runInContext(snippet(dataJs, 'function getByPath(', 'function cloneData('), context);
  return context;
};

function mount(ctx, originalValue, readonly=false) {
  const wrapper = new FakeElement('div');
  const checkbox = ctx.createBooleanCheckboxControlElement({ value: originalValue });
  checkbox.disabled = readonly;
  ctx.studioAppendBooleanCheckboxShell(wrapper, checkbox);
  return { wrapper, checkbox, reset: wrapper.querySelector('.studio-boolean-reset') };
}

test('ViewDef maintenance opts all six boolean settings into direct checkbox; other fields keep their editors', () => {
  const data = JSON.parse(read('defs/common/view_def_maint_fields_v0_2.json'));
  const fields = data.views[0].sections.find(s => s.id === 'fields').fields;
  const bools = fields.filter(f => f.type === 'boolean');
  assert.deepEqual(bools.map(f => f.field), [
    'grid.visible', 'edit.visible', 'edit.readonly',
    'search.visible', 'search.applyOnLoad', 'validation.required',
  ]);
  assert.ok(bools.every(f => f.edit?.control === 'boolean-checkbox'));
  assert.ok(fields.filter(f => f.type !== 'boolean').every(f => f.edit?.control !== 'boolean-checkbox'));
  assert.match(fieldJs, /registerFieldControl\('boolean-checkbox', createBooleanCheckboxControlElement\)/);
  assert.match(fieldJs, /registerFieldControl\('boolean', createBooleanControlElement\)/);
});

test('tri-state ViewDef checkbox toggles true/false in one click and resets to null explicitly', () => {
  const ctx = createSandbox();
  const { wrapper, checkbox, reset } = mount(ctx, null);
  assert.equal(ctx.getControlValue(checkbox), '');
  assert.equal(checkbox.indeterminate, true);
  assert.equal(checkbox.getAttribute('aria-checked'), 'mixed');
  assert.equal(wrapper.querySelector('.studio-boolean-value').textContent, '未設定');
  assert.equal(reset.disabled, true);
  checkbox.click();
  assert.equal(ctx.getControlValue(checkbox), 'true');
  assert.equal(checkbox.indeterminate, false);
  assert.equal(reset.disabled, false);
  checkbox.click();
  assert.equal(ctx.getControlValue(checkbox), 'false');
  reset.click();
  assert.equal(ctx.getControlValue(checkbox), '');
  assert.equal(checkbox.indeterminate, true);
  assert.equal(ctx.convertValue('boolean', ctx.getControlValue(checkbox)), null);
});

test('false and true are distinct; readonly cannot change; paste/reset keep the rendered state synchronized', () => {
  const ctx = createSandbox();
  const { wrapper, checkbox, reset } = mount(ctx, false);
  assert.equal(ctx.getControlValue(checkbox), 'false');
  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.indeterminate, false);
  checkbox.click();
  assert.equal(ctx.getControlValue(checkbox), 'true');
  ctx.setControlValue(checkbox, null);
  assert.equal(ctx.getControlValue(checkbox), '');
  assert.equal(wrapper.querySelector('.studio-boolean-value').textContent, '未設定');
  ctx.setControlValue(checkbox, true);
  assert.equal(ctx.getControlValue(checkbox), 'true');
  checkbox.disabled = true;
  ctx.studioSetBooleanCheckboxState(checkbox, 'true');
  assert.equal(reset.disabled, true);
  reset.click(); checkbox.click();
  assert.equal(ctx.getControlValue(checkbox), 'true');
  assert.equal(ctx.convertValue('boolean', 'false'), false);
  assert.equal(ctx.convertValue('boolean', 'true'), true);
});

test('null remains null and absent optional booleans stay absent when untouched', () => {
  const ctx = createSandbox();
  const row = { edit: {} };
  const { checkbox } = mount(ctx, undefined);
  const raw = ctx.getControlValue(checkbox);
  assert.equal(raw, '');
  assert.equal(ctx.shouldSkipAbsentBlankWrite(row, 'edit.visible', raw), true);
  assert.equal(ctx.hasOwnByPath(row, 'edit.visible'), false);
  assert.equal(ctx.convertValue('boolean', raw), null);
  ctx.setControlValue(checkbox, false);
  assert.equal(ctx.shouldSkipAbsentBlankWrite(row, 'edit.visible', ctx.getControlValue(checkbox)), false);
  ctx.setByPath(row, 'edit.visible', ctx.convertValue('boolean', ctx.getControlValue(checkbox)));
  assert.equal(row.edit.visible, false);
});

test('checkbox styles override legacy full-width input styles and HTML cache version is updated', () => {
  const css = read('wwwroot/styles.css');
  const index = read('wwwroot/index.html');
  assert.match(css, /\.studio-boolean-shell \.studio-boolean-checkbox/);
  assert.match(css, /\.studio-boolean-reset/);
  assert.match(index, /field_controls\.js[^"\n]*boolCheckbox=20261117/);
  assert.match(index, /grid_detail\.js[^"\n]*boolCheckbox=20261117/);
  assert.match(index, /styles\.css[^"\n]*boolCheckbox=20261117/);
});
