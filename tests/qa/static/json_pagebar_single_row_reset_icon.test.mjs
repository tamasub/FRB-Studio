import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const shellJs = fs.readFileSync('wwwroot/js/ui/frb_studio_shell.js', 'utf8');
const compactCss = fs.readFileSync('wwwroot/css/studio-compact-json.css', 'utf8');
const guardJs = fs.readFileSync('wwwroot/js/runtime/json_unsaved_guard.js', 'utf8');

function createShell(pageId) {
  const navigations = [];
  let dialogCount = 0;
  const eventNames = [];
  class FakeEl {
    constructor(tag) {
      this.tag = tag;
      this.attributes = {};
      this.listeners = {};
      this.classList = { add() {} };
      this.style = { setProperty() {} };
      this.innerHTML = '';
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    getBoundingClientRect() { return { height: 50 }; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    querySelector(selector) {
      const match = selector.match(/^\[([^\]]+)\]$/);
      if (!match || !['data-frb-reset', 'data-frb-home'].includes(match[1])) return null;
      if (!this.innerHTML.includes(` ${match[1]}>`) && !this.innerHTML.includes(` ${match[1]} `)) return null;
      return {
        click: () => void (this.events?.[match[1]]?.()),
        addEventListener: (_type, fn) => (this.events ??= {})[match[1]] = fn
      };
    }
    prepend() {}
  }
  const body = new FakeEl('body');
  const doc = {
    body,
    documentElement: { style: { setProperty() {} } },
    createElement: tag => new FakeEl(tag),
    querySelector: () => null,
    addEventListener: () => {},
    dispatchEvent: event => { eventNames.push(event.type); return true; }
  };
  const context = {
    window: { addEventListener: () => {}, confirm: () => { dialogCount++; return true; } },
    document: doc,
    location: { pathname: '/index.html', href: 'http://localhost/index.html', assign: to => navigations.push(to) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; this.defaultPrevented = false; } },
    requestAnimationFrame: () => {},
    fetch: async () => { throw new Error('fetch not available in static test'); },
    console
  };
  vm.runInNewContext(shellJs, context);
  const elements = [];
  doc.createElement = tag => { const e = new FakeEl(tag); elements.push(e); return e; };
  context.window.FrbStudioShell.mount({ pageId, pageTitle: 'JSON Object Studio', icon: '{}', resetConfirmMessage: 'リセットしますか？' });
  const pagebar = elements.find(e => e.tag === 'section');
  const shell = elements.find(e => e.tag === 'header');
  return { html: pagebar.innerHTML, pagebar, shell, navigations, eventNames, get dialogCount() { return dialogCount; } };
}

test('JSON Object Studio: old Home/Reset buttons gone, blue icon becomes keyboard-accessible Reset', () => {
  const actual = createShell('json-object');
  assert.doesNotMatch(actual.html, /data-frb-home/);
  assert.doesNotMatch(actual.html, /この画面の初期状態へ戻す<\/button>/);
  assert.match(actual.html, /<button[^>]+class="frb-page-icon frb-pagebar-reset-icon frb-icon-json"[^>]+data-frb-reset[^>]+aria-label="この画面の初期状態へ戻す"/);
  assert.match(actual.html, /type="button"/);
  // The shortcut trigger now lives in the navy top bar, not the pagebar.
  assert.doesNotMatch(actual.html, /data-frb-shortcuts-trigger/);
  assert.match(actual.shell.innerHTML, /data-frb-shortcuts-trigger/);
  assert.match(guardJs, /#loadBtn, #maintainViewDefBtn, \[data-frb-home\], \[data-frb-reset\]/);
  actual.pagebar.events['data-frb-reset']();
  assert.deepEqual(actual.eventNames, ['frb-studio:reset-request']);
  assert.equal(actual.dialogCount, 1);
  assert.deepEqual(actual.navigations, ['index.html']);
});

test('Other pages keep existing separate Home and Reset buttons', () => {
  const actual = createShell('markdown');
  assert.match(actual.html, /data-frb-home/);
  assert.match(actual.html, /data-frb-reset/);
  assert.doesNotMatch(actual.html, /frb-pagebar-reset-icon/);
});

test('JSON pagebar does not wrap above 740px; smaller viewports retain responsive fallback', () => {
  assert.match(compactCss, /@media \(min-width:741px\) \{[\s\S]*?\.frb-pagebar \{[\s\S]*?flex-wrap:nowrap/);
  assert.match(compactCss, /\.frb-pagebar-main \{[\s\S]*?flex-wrap:nowrap/);
  assert.match(compactCss, /@media \(max-width:740px\)/);
});


test('top-bar white shortcut icon matches the colored navigation tile size', () => {
  const css = compactCss.match(/body\.frb-page-json-object:not\(\[data-studio-shell="minimal"\]\) \.frb-shell-shortcut-trigger \{([^}]*)\}/)?.[1] || '';
  assert.match(css, /min-width:\s*20px/);
  assert.match(css, /width:\s*20px/);
  assert.match(css, /height:\s*20px/);
  assert.match(css, /min-height:\s*20px/);
});

test('compact font flag also scopes editor typography and preserves regular mode', () => {
  const settings = JSON.parse(fs.readFileSync('wwwroot/config/app_settings.json', 'utf8'));
  assert.equal(settings.ui.json_object_compact_font_enabled, true);
  assert.match(shellJs, /classList\.toggle\('frb-json-compact-range-font', compactMainFontEnabled\)/);
  for (const selector of ['#detailDialog #detailTitle', '#detailDialog .field label', '#detailDialog .field :is(input,select,textarea)', '#detailDialog .detail-footer button']) {
    assert.ok(compactCss.includes(`.frb-json-compact-range-font:not([data-studio-shell="minimal"]) ${selector}`), `${selector} is under the compact font flag`);
  }
  assert.doesNotMatch(compactCss, /body\.frb-page-markdown\.frb-json-compact-range-font/);
});
