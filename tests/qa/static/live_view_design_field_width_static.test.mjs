// v0.18.136 Live View Design / Field.width + FULL + width tip + combo resize + dialog top-layer tip fix
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

test('ViewDef schema exposes independent Editor width and Grid width with numeric px/FULL', () => {
  const schema = JSON.parse(read('data/json/00_rules/frb_view_def_schema_v0_9.json'));
  const fieldWidth = schema?.$defs?.field?.properties?.width;
  const gridWidth = schema?.$defs?.gridOptions?.properties?.width;
  assert.ok(Array.isArray(fieldWidth?.oneOf));
  assert.ok(fieldWidth.oneOf.some(rule => rule?.type === 'number'));
  assert.ok(fieldWidth.oneOf.some(rule => rule?.type === 'string' && rule?.enum?.includes('FULL')));
  assert.match(String(fieldWidth?.description ?? ''), /Field共通|正本/);
  assert.match(String(fieldWidth?.description ?? ''), /FULL/);
  assert.match(String(gridWidth?.description ?? ''), /Grid専用|列幅正本/);
  assert.ok(gridWidth.oneOf.some(rule => rule.type === 'string' && rule.enum?.includes('FULL')));
});

test('ViewDef maintenance exposes editable and independent Editor/Grid width inputs', () => {
  const def = JSON.parse(read('defs/common/view_def_maint_fields_v0_2.json'));
  const fields = def.views[0].sections.find(section => section.id === 'fields').fields;
  const canonical = fields.find(field => field.field === 'width');
  const legacy = fields.find(field => field.field === 'grid.width');
  assert.ok(canonical);
  assert.match(canonical.caption, /FULL/);
  assert.equal(canonical.type, 'text');
  assert.equal(canonical.edit?.readonly, false);
  assert.match(String(canonical.edit?.placeholder ?? ''), /FULL/);
  assert.equal(legacy.caption, 'Grid列幅(px/FULL)');
  assert.equal(legacy.edit?.readonly, false);
  assert.equal(legacy.type, 'text');
});

test('ViewDef maintenance projection normalizes numeric text and FULL for canonical width', () => {
  const js = read('wwwroot/js/services/viewdef_maintenance_projection.js');
  assert.match(js, /text\.toUpperCase\(\) === 'FULL'/);
  assert.match(js, /field\.width = 'FULL'/);
  assert.match(js, /Number\.isFinite\(numeric\).*field\.width = numeric/s);
  assert.match(js, /delete field\.width/);
});

test('Search UI uses fixed Studio standard width rather than stretching to Section width', () => {
  const css = read('wwwroot/styles.css');
  assert.match(css, /--studio-standard-field-width:\s*220px/);
  assert.match(css, /#searchSection #searchForm\.search-grid > \.field/);
  assert.match(css, /flex:\s*0 0 var\(--studio-standard-field-width\)\s*!important/);
  assert.match(css, /width:\s*var\(--studio-standard-field-width\)\s*!important/);
});

test('Field controls apply common width and FULL can consume the available Header/Detail row', () => {
  const js = read('wwwroot/js/renderers/field_controls.js');
  assert.match(js, /studioApplyFieldContainerWidth/);
  assert.match(js, /studioInstallFieldResizeHandle/);
  const live = read('wwwroot/js/runtime/live_view_design.js');
  const css = read('wwwroot/styles.css');
  assert.match(live, /STUDIO_FIELD_WIDTH_FULL = 'FULL'/);
  assert.match(live, /ctx === 'search'.*STUDIO_STANDARD_FIELD_WIDTH_PX/s);
  assert.match(live, /if \(explicitEditor\) return explicitEditor/);
  assert.match(live, /wrap\.style\.width = full \? '100%' :/);
  assert.match(live, /wrap\.style\.flex = full \? '1 0 100%'/);
  assert.match(css, /\.field\.studio-field-width-full/);
});


test('Chat fields also honor canonical Field.width/FULL instead of bypassing the common resolver', () => {
  const js = read('wwwroot/js/renderers/field_controls.js');
  assert.match(js, /field\.type === 'chat'[\s\S]*createChatInput/);
  assert.match(js, /field\.type === 'chat'[\s\S]*studioApplyFieldContainerWidth\(chatWrap, field, prefix, widthSection\)/);
});

test('Grid supports FULL columns as remaining-width columns while fixed fields stay fixed', () => {
  const js = read('wwwroot/js/renderers/grid_detail.js');
  assert.match(js, /studioResolvedFieldWidth\(field, 'grid', gd\)/);
  assert.match(js, /fullCount = resolvedWidths\.filter/);
  assert.match(js, /table\.style\.width = fullCount > 0 \? '100%'/);
  assert.match(js, /fixedTotalWidth \+ \(fullCount \* standardWidth\)/);
  assert.match(js, /col\.dataset\.studioFieldWidthMode = full \? fullToken : 'FIXED'/);
  assert.match(js, /studioInstallGridColumnResizeHandle/);
});

test('Dragging a FULL field intentionally changes it to a numeric live draft without auto-save', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  assert.match(live, /Direct resize is an explicit choice to leave FULL/);
  assert.match(live, /wrap\.classList\.remove\('studio-field-width-full'\)/);
  assert.match(live, /col\.dataset\.studioFieldWidthMode = 'FIXED'/);
  assert.match(live, /studioSetLiveFieldWidth\(field, width, section/);
});

test('Width changes are explicitly saved to independent Grid.width and Editor Field.width', () => {
  const html = read('wwwroot/index.html');
  const live = read('wwwroot/js/runtime/live_view_design.js');
  assert.match(html, /id="saveFieldWidthsBtn"[^>]*hidden/);
  assert.match(html, /id="saveDetailFieldWidthsBtn"[^>]*hidden/);
  assert.match(live, /studioFieldWidthDrafts/);
  assert.match(live, /field\.width = entry\.width/);
  assert.match(live, /field\.grid\.width = entry\.width/);
  assert.doesNotMatch(live, /delete field\.grid\.width/);
  assert.match(live, /fetch\(apiPath,\s*\{\s*method: 'POST'/s);
});

test('Loading another document clears uncommitted live width drafts', () => {
  const js = read('wwwroot/js/runtime/load_runtime.js');
  assert.match(js, /studioResetLiveFieldWidths/);
});

test('Live resize shows the current px width as a realtime pointer tip for Field and Grid resizing', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  const css = read('wwwroot/styles.css');
  assert.match(live, /function studioShowFieldWidthTip\(width, clientX, clientY, sourceElement=null\)/);
  assert.match(live, /tip\.textContent = `\$\{normalized\}px`/);
  assert.match(live, /studioShowFieldWidthTip\(startWidth, event\.clientX, event\.clientY, wrap\)/);
  assert.match(live, /studioShowFieldWidthTip\(startWidth, event\.clientX, event\.clientY, th\)/);
  assert.ok((live.match(/studioShowFieldWidthTip\(width, moveEvent\.clientX, moveEvent\.clientY, (?:wrap|th)\)/g) ?? []).length >= 2);
  assert.ok((live.match(/studioHideFieldWidthTip\(\)/g) ?? []).length >= 3);
  assert.match(css, /\.studio-field-width-tip\s*\{/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /pointer-events:\s*none/);
});

test('Editor resize Tip is mounted in the same modal dialog Top Layer so it stays visible above Detail', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  assert.match(live, /function studioFieldWidthTipHost\(sourceElement=null\)/);
  assert.match(live, /source\?\.closest\?\.\('dialog\[open\]'\)/);
  assert.match(live, /if \(dialog\) return dialog/);
  assert.match(live, /host\.appendChild\(studioFieldWidthTip\)/);
});

test('Combo/select keeps standard width by default but supports explicit and Live View Design width changes outside Search', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  assert.match(live, /return \['boolean', 'checkbox', 'radio'\]\.includes\(type\)/);
  assert.match(live, /\['text', 'textarea', 'number', 'date', 'datetime', 'select'\]\.includes/);
  assert.doesNotMatch(live, /return \['select', 'boolean', 'checkbox', 'radio'\]\.includes\(type\)/);
  assert.match(live, /if \(ctx === 'search'\) return STUDIO_STANDARD_FIELD_WIDTH_PX/);
});


// 2026-11-26: explicit Editor row breaks and fixed multiline height.
import vm from 'node:vm';
function layoutRuntime(raw) {
  const resolved = structuredClone(raw);
  let saved = null;
  const context = vm.createContext({
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    mainView: () => resolved.views[0],
    lastLoadedDefName: 'sample.json',
    // Re-rendering would drop unsaved Header/Detail edits. It is not needed.
    renderHeader() { throw Error('unexpected Header redraw'); },
    renderGrid() { throw Error('unexpected Grid redraw'); },
    renderDetailForRow() { throw Error('unexpected Detail redraw'); },
    fetch: async (url, options) => {
      assert.equal(url, '/api/defs/sample.json');
      if (options.method === 'POST') { saved = JSON.parse(options.body); return { ok: true }; }
      return { ok: true, json: async () => structuredClone(saved ?? raw) };
    }
  });
  vm.runInContext(read('wwwroot/js/runtime/live_view_design.js'), context);
  return { context, resolved, getSaved: () => saved };
}

test('Layout schema separates fixed multiline height and explicit row break from legacy width and edit.height', () => {
  const schema = JSON.parse(read('data/json/00_rules/frb_view_def_schema_v0_9.json'));
  const layout = schema.$defs.field.properties.layout.properties;
  assert.equal(layout.breakBefore.type, 'boolean');
  assert.equal(layout.height.minimum, 40);
  assert.equal(layout.height.maximum, 1600);
  assert.equal(schema.$defs.editOptions.properties.height.minimum, 0);
});

test('Editor width, break and height drafts merge and save together; Grid width, edit.height and layout placement remain independent', async () => {
  const raw = { views: [{ id: 'v', sections: [{ id: 'g', type: 'grid', fields: [{ field: 'text', type: 'textarea', width: 220, grid: { width: 100 }, edit: { height: 90 }, layout: { placement: 'detailBody' } }] }] }] };
  const { context: c, resolved, getSaved } = layoutRuntime(raw);
  const sec = resolved.views[0].sections[0];
  const field = sec.fields[0];
  assert.equal(c.studioResolvedFieldLayout(field, sec).height, null);
  c.studioSetLiveFieldWidth(field, 310, sec, 'detail.resize');
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { breakBefore: true });
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { height: 160 });
  c.studioSetLiveFieldWidth(field, 140, sec, 'grid.resize');
  assert.equal(c.studioResolvedFieldWidth(field, 'detail', sec), 310);
  assert.equal(c.studioResolvedFieldWidth(field, 'grid', sec), 140);
  assert.equal(c.studioResolvedFieldLayout(field, sec).breakBefore, true);
  assert.equal(c.studioResolvedFieldLayout(field, sec).height, 160);
  assert.equal(await c.saveStudioLiveFieldWidths(), true);
  const saved = getSaved().views[0].sections[0].fields[0];
  assert.equal(saved.width, 310);
  assert.equal(saved.grid.width, 140);
  assert.equal(saved.edit.height, 90);
  assert.deepEqual(saved.layout, { placement: 'detailBody', breakBefore: true, height: 160 });
  assert.equal(c.studioResolvedFieldLayout(field, sec).height, 160);
  assert.equal(c.studioResolvedFieldLayout(field, sec).breakBefore, true);
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { breakBefore: false });
  await c.saveStudioLiveFieldWidths();
  assert.equal(getSaved().views[0].sections[0].fields[0].layout.breakBefore, false);
  assert.equal(getSaved().views[0].sections[0].fields[0].layout.height, 160);
});

test('Loading another document discards layout drafts; existing default heights are not silently converted to fixed heights', () => {
  const raw = { views: [{ id: 'v', sections: [{ id: 'g', type: 'grid', fields: [{ field: 'text', type: 'textarea', edit: { height: 90 } }] }] }] };
  const { context: c, resolved } = layoutRuntime(raw);
  const sec = resolved.views[0].sections[0];
  const field = sec.fields[0];
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { breakBefore: true, height: 170 });
  c.studioResetLiveFieldWidths();
  assert.equal(c.studioResolvedFieldLayout(field, sec).height, null);
  assert.equal(c.studioResolvedFieldLayout(field, sec).breakBefore, false);
  assert.equal(c.studioNormalizeFieldHeight(3), 40);
  assert.equal(c.studioNormalizeFieldHeight(1900), 1600);
  assert.equal(c.studioNormalizeFieldHeight(''), null);
});

test('Header and Detail use layout controls; Search and Grid do not; group placement retains the existing grid', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  const controls = read('wwwroot/js/renderers/field_controls.js');
  const detail = read('wwwroot/js/runtime/detail_save.js');
  const css = read('wwwroot/styles.css');
  assert.match(live, /!\['header', 'detail'\]\.includes\(context\)/);
  assert.match(live, /:scope > textarea, :scope > \.markdown-textarea-display/);
  assert.match(controls, /studioInstallFieldLayoutControls\(wrap, field, prefix, widthSection\)/);
  assert.match(controls, /studioSyncFieldRowBreaks\(form\)/);
  assert.match(detail, /studioSyncFieldRowBreaks\(grid\)/);
  assert.match(detail, /studioSyncFieldRowBreaks\(form\)/);
  assert.match(css, /\.detail-fieldset-grid > \.studio-field-break-before \{ grid-column-start: 1; \}/);
  assert.match(css, /height: var\(--studio-field-height\) !important/);
});

test('Separator declaration is independent of explicit break and height; save and remove preserve other layout values', async () => {
  const schema = JSON.parse(read('data/json/00_rules/frb_view_def_schema_v0_9.json'));
  assert.equal(schema.$defs.field.properties.layout.properties.separatorBefore.type, 'boolean');
  const raw = { views: [{ id: 'v', sections: [{ id: 'g', type: 'grid', fields: [{ field: 'body', type: 'textarea', layout: { breakBefore: true, height: 180 } }] }] }] };
  const { context: c, resolved, getSaved } = layoutRuntime(raw);
  const sec = resolved.views[0].sections[0], field = sec.fields[0];
  assert.equal(c.studioResolvedFieldLayout(field, sec).separatorBefore, false);
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { separatorBefore: true });
  c.studioSetLiveFieldWidth(field, 350, sec, 'detail.resize');
  assert.equal(await c.saveStudioLiveFieldWidths(), true);
  assert.deepEqual(getSaved().views[0].sections[0].fields[0].layout, { breakBefore: true, height: 180, separatorBefore: true });
  c.studioSetLiveFieldLayoutDraft(field, sec, 'editor', { separatorBefore: false });
  assert.equal(await c.saveStudioLiveFieldWidths(), true);
  assert.deepEqual(getSaved().views[0].sections[0].fields[0].layout, { breakBefore: true, height: 180, separatorBefore: false });
  assert.equal(getSaved().views[0].sections[0].fields[0].width, 350);
});

test('Layout keyboard owns only the exact hovered boundary; ignores IME, modifiers, stale markers and foreign dialogs; consumes held keys', () => {
  const { context: c } = layoutRuntime({ views: [] });
  const actions = [], dialogs = [];
  c.document.body = { classList: { contains: () => false } };
  c.document.querySelectorAll = () => dialogs;
  c.studioNextLayoutField = () => 'following field';
  c.studioSetLayoutBoundary = (...args) => actions.push(args);
  c.handle = { isConnected: true, matches: () => true, closest: () => null };
  const activate = kind => vm.runInContext(`studioHoveredLayoutBoundary = {handle, kind: '${kind}', wrap: 'source'}`, c);
  const press = (key, extra={}) => {
    let prevented = false, stopped = false;
    c.studioHandleLayoutBoundaryKey({key, preventDefault(){prevented=true}, stopImmediatePropagation(){stopped=true}, ...extra});
    return prevented && stopped;
  };
  assert.equal(press('Enter'), false);
  activate('vertical');
  assert.equal(press('Enter', {isComposing:true}), false);
  assert.equal(press('Enter', {shiftKey:true}), false);
  c.handle.matches = () => false;
  assert.equal(press('Backspace'), false);
  c.handle.matches = () => true;
  dialogs.push({}); assert.equal(press('Enter'), false); dialogs.pop();
  assert.equal(press('Enter'), true);
  assert.deepEqual(actions.pop(), ['following field', 'breakBefore', true]);
  assert.equal(press('Backspace'), true);
  assert.deepEqual(actions.pop(), ['following field', 'breakBefore', false]);
  activate('horizontal');
  assert.equal(press('Delete'), true);
  assert.deepEqual(actions.pop(), ['source', 'separatorBefore', false]);
  c.handle.isConnected = false;
  assert.equal(press('Delete', {repeat:true}), true);
  assert.equal(press('Enter'), false);
  assert.equal(actions.length, 0);
});

test('No permanent break marker; horizontal separator is full row in flex and FieldSet grids', () => {
  const live = read('wwwroot/js/runtime/live_view_design.js');
  const css = read('wwwroot/styles.css');
  assert.doesNotMatch(live, /studio-field-break-toggle/);
  assert.doesNotMatch(css, /studio-field-break-toggle/);
  assert.match(live, /window\.addEventListener\('keydown', studioHandleLayoutBoundaryKey, true\)/);
  assert.match(live, /handle\.addEventListener\('contextmenu'/);
  assert.match(css, /\.detail-fieldset-grid > \.studio-field-layout-separator \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.studio-field-layout-separator:hover::before/);
});

test('Hover-only mouse action toggles the following explicit break without resizing or touching the separator', () => {
  const { context: c } = layoutRuntime({ views: [] });
  const actions = [], events = {}, handleEvents = {}, classes = new Set();
  const button = {
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute() {}, addEventListener(name, fn) { events[name] = fn; }
  };
  const handle = { appendChild(child) { assert.equal(child, button); }, addEventListener(name, fn) { handleEvents[name] = fn; }, matches() { return true; } };
  const wrap = { querySelector() { return button; } };
  let broken = false, hasNext = true, resizing = false;
  const next = { classList: { contains(name) { assert.equal(name, 'studio-field-break-before'); return broken; } } };
  c.document.createElement = tag => { assert.equal(tag, 'button'); return button; };
  c.document.body = { classList: { contains: () => resizing } };
  c.studioNextLayoutField = () => hasNext ? next : null;
  c.studioSetLayoutBoundary = (...args) => { actions.push(args); broken = args[2]; };
  c.studioInstallBreakMouseAction(handle, wrap);
  assert.equal(button.type, 'button'); assert.equal(button.tabIndex, -1); assert.equal(button.hidden, true);
  handleEvents.mouseenter(); assert.equal(button.hidden, false); assert.match(button.title, /Enter/);
  let prevented = 0, stopped = 0;
  const event = { button: 0, preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
  events.mousedown(event); assert.equal(actions.length, 0);
  events.click(event); assert.deepEqual(actions.pop(), [next, 'breakBefore', true]);
  c.studioRefreshBreakMouseAction(wrap); assert.equal(classes.has('studio-break-mouse-remove'), true); assert.match(button.title, /Delete/);
  events.click(event); assert.deepEqual(actions.pop(), [next, 'breakBefore', false]);
  c.studioRefreshBreakMouseAction(wrap); assert.equal(classes.has('studio-break-mouse-remove'), false);
  resizing = true; events.click(event); resizing = false;
  handle.matches = () => false; events.click(event); handle.matches = () => true;
  hasNext = false; handleEvents.mouseenter(); assert.equal(button.hidden, true); events.click(event);
  events.contextmenu(event); assert.equal(actions.length, 0); assert.equal(prevented, stopped);
  const css = read('wwwroot/styles.css');
  assert.match(css, /\.studio-field-resize-handle > \.studio-break-mouse-action \{[^}]*visibility: hidden; pointer-events: none/s);
  assert.match(css, /\.studio-field-resize-handle:hover > \.studio-break-mouse-action:not\(\[hidden\]\) \{[^}]*visibility: visible; pointer-events: auto/s);
  assert.match(css, /\.studio-break-mouse-remove > \.studio-break-mouse-trash \{ display: block; \}/);
});
