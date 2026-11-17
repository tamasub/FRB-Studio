/**
 * FRB Studio source selection action regression: run with
 * node --test tests/test_studio_source_clear_buttons_20261117.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'wwwroot/index.html'), 'utf8');
const compactCss = fs.readFileSync(path.join(root, 'wwwroot/css/studio-compact-json.css'), 'utf8');
const pageSetup = fs.readFileSync(path.join(root, 'wwwroot/js/ui/page_setup.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'wwwroot/app.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'wwwroot/js/runtime/load_runtime.js'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is declared`);
  let braces = 0;
  let opened = false;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') { braces++; opened = true; }
    if (src[i] === '}') braces--;
    if (opened && braces === 0) return src.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function setupHarness() {
  const elements = Object.fromEntries(
    ['dataNameInput', 'defNameInput', 'clearDataNameBtn', 'clearDefNameBtn', 'openDataFolderBtn', 'openDefFolderBtn'].map(id => {
      const classes = new Set();
      return [id, {
        value: '', disabled: false,
        classList: {
          contains: name => classes.has(name),
          toggle: (name, state) => { if (state) classes.add(name); else classes.delete(name); }
        }
      }];
    })
  );
  const sandbox = {
    $: id => elements[id],
    safeJsonFileName: value => String(value || '').trim(),
    selectedJsonFolderButtonConfigs: () => [
      { inputId: 'dataNameInput', buttonId: 'openDataFolderBtn' },
      { inputId: 'defNameInput', buttonId: 'openDefFolderBtn' }
    ]
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(pageSetup, 'syncComboClearButtonStates'), sandbox);
  vm.runInContext(extractFunction(app, 'updateSelectedJsonFolderButtonStates'), sandbox);
  return { elements, sandbox };
}

test('shortcut/URL startup: programmatic filenames display × for BOTH JSON selectors without input events', () => {
  const { elements, sandbox } = setupHarness();
  elements.dataNameInput.value = '01_main/example.json';
  elements.defNameInput.value = 'rules/example.json';
  sandbox.updateSelectedJsonFolderButtonStates();
  assert.equal(elements.clearDataNameBtn.classList.contains('visible'), true);
  assert.equal(elements.clearDefNameBtn.classList.contains('visible'), true);
  assert.equal(elements.openDataFolderBtn.disabled, false);
  assert.equal(elements.openDefFolderBtn.disabled, false);
});

test('clear or whitespace-only values hide × and disable folder access', () => {
  const { elements, sandbox } = setupHarness();
  elements.dataNameInput.value = 'a.json';
  elements.defNameInput.value = 'b.json';
  sandbox.updateSelectedJsonFolderButtonStates();
  elements.dataNameInput.value = '';
  elements.defNameInput.value = '  ';
  sandbox.updateSelectedJsonFolderButtonStates();
  assert.equal(elements.clearDataNameBtn.classList.contains('visible'), false);
  assert.equal(elements.clearDefNameBtn.classList.contains('visible'), false);
  assert.equal(elements.openDataFolderBtn.disabled, true);
  assert.equal(elements.openDefFolderBtn.disabled, true);
});

test('one input can be cleared without hiding the other ×', () => {
  const { elements, sandbox } = setupHarness();
  elements.dataNameInput.value = '';
  elements.defNameInput.value = 'keep.json';
  sandbox.syncComboClearButtonStates();
  assert.equal(elements.clearDataNameBtn.classList.contains('visible'), false);
  assert.equal(elements.clearDefNameBtn.classList.contains('visible'), true);
});

test('successful load re-synchronizes folder and × buttons, including native shortcut', () => {
  assert.match(runtime, /updateFileLabels\(\);[\s\S]{0,360}updateSelectedJsonFolderButtonStates\(\)/);
  assert.match(runtime, /params\.get\('startupJson'\) === '1'/);
  assert.match(runtime, /\$\('dataNameInput'\)\.value = dataName/);
  assert.match(runtime, /\$\('defNameInput'\)\.value = resolved\.defName/);
  assert.match(pageSetup, /input\.addEventListener\('input', sync\)/);
});

test('ellipsis uses geometrically centered CSS dots instead of font glyph positioning', () => {
  assert.match(compactCss, /button\.viewdef-maintenance-button::before\s*\{/);
  assert.match(compactCss, /box-shadow:\s*-5px 0 0 currentColor,\s*5px 0 0 currentColor/);
  assert.match(compactCss, /font-size:0;\s*line-height:0/);
  const ixMaintenance = html.indexOf('id="maintainViewDefBtn"');
  const ixFolder = html.indexOf('id="openDefFolderBtn"');
  const ixClear = html.indexOf('id="clearDefNameBtn"');
  assert.ok(0 <= ixMaintenance && ixMaintenance < ixFolder && ixFolder < ixClear);
});
