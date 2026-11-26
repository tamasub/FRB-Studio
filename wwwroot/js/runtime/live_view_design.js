// v0.18.139-live-view-design-field-alignment-guide-exact-pixel-match
// Live View Design: independent width responsibilities.
// Editor (Header/Detail): Field.width; Grid: Field.grid.width.
// Both accept a numeric px value or FULL. Search stays at Studio standard width.
// Legacy Field.width remains a read-only fallback for Grid until Grid width is saved.

const STUDIO_STANDARD_FIELD_WIDTH_PX = 220;
const STUDIO_MIN_FIELD_WIDTH_PX = 80;
const STUDIO_MAX_FIELD_WIDTH_PX = 1200;
const STUDIO_FIELD_WIDTH_FULL = 'FULL';

let studioFieldWidthDrafts = new Map();
let studioFieldLayoutSaving = false;

function studioNormalizeFieldWidth(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(STUDIO_MIN_FIELD_WIDTH_PX, Math.min(STUDIO_MAX_FIELD_WIDTH_PX, Math.round(n)));
}

function studioNormalizeFieldWidthValue(value) {
  if (typeof value === 'string' && value.trim().toUpperCase() === STUDIO_FIELD_WIDTH_FULL) {
    return STUDIO_FIELD_WIDTH_FULL;
  }
  return studioNormalizeFieldWidth(value);
}

function studioFieldWidthIsFull(value) {
  return studioNormalizeFieldWidthValue(value) === STUDIO_FIELD_WIDTH_FULL;
}

function studioFieldTypeUsesFixedControlWidth(field) {
  const type = String(field?.type ?? '').trim().toLowerCase();
  // Combo/select keeps the Studio standard width by default, but an explicit
  // Field.width (or a Live View Design draft) may resize it just like text fields.
  // Boolean/checkbox/radio remain compact fixed operation controls.
  return ['boolean', 'checkbox', 'radio'].includes(type);
}

function studioFieldWidthKey(section, fieldName, context='editor') {
  const viewId = String((typeof mainView === 'function' ? mainView()?.id : '') ?? '');
  const sectionId = String(section?.id ?? '');
  const sectionType = String(section?.type ?? '');
  const dataPath = String(section?.dataPath ?? section?.data_path ?? '');
  return [viewId, sectionId, sectionType, dataPath, String(fieldName ?? ''), context === 'grid' ? 'grid' : 'editor'].join('::');
}

function studioFieldWidthSectionDescriptor(section) {
  if (!section) return null;
  return {
    id: String(section.id ?? ''),
    type: String(section.type ?? ''),
    dataPath: String(section.dataPath ?? section.data_path ?? ''),
    caption: String(section.caption ?? '')
  };
}

function studioFieldWidthSectionForContext(prefix, gd=null) {
  const p = String(prefix ?? '').toLowerCase();
  if (p === 'header' && typeof headerDef === 'function') return headerDef();
  if ((p === 'detail' || p === 'grid') && gd) return gd;
  if ((p === 'detail' || p === 'grid') && typeof gridDef === 'function') return gridDef();
  return null;
}

function studioDraftFieldWidth(field, context='editor', section=null) {
  if (!field?.field) return null;
  const key = studioFieldWidthKey(section, field.field, context);
  return studioNormalizeFieldWidth(studioFieldWidthDrafts.get(key)?.width);
}

function studioResolvedFieldWidth(field, context='detail', section=null) {
  const ctx = String(context ?? '').toLowerCase();
  if (ctx === 'search') return STUDIO_STANDARD_FIELD_WIDTH_PX;

  // Combo-like controls are intentionally compact operation UI.
  if ((ctx === 'header' || ctx === 'detail') && studioFieldTypeUsesFixedControlWidth(field)) {
    return STUDIO_STANDARD_FIELD_WIDTH_PX;
  }

  const target = ctx === 'grid' ? 'grid' : 'editor';
  const draft = studioDraftFieldWidth(field, target, section);
  if (draft) return draft;

  // New canonical ownership: Grid always prefers grid.width. Editor never
  // observes a Grid resize draft or Grid width when its own width is explicit.
  const explicitGrid = studioNormalizeFieldWidthValue(field?.grid?.width);
  const explicitEditor = studioNormalizeFieldWidthValue(field?.width);
  if (target === 'grid') {
    if (explicitGrid) return explicitGrid;
    if (explicitEditor) return explicitEditor; // old shared Field.width ViewDefs
  } else {
    if (explicitEditor) return explicitEditor;
    // Preserve legacy-only text/textarea Editor appearance on first migration.
    // Grid saves snapshot this into Field.width before changing grid.width.
    if (['text', 'textarea'].includes(String(field?.type ?? 'text')) && explicitGrid) {
      return explicitGrid;
    }
  }
  return STUDIO_STANDARD_FIELD_WIDTH_PX;
}

function studioApplyFieldContainerWidth(wrap, field, context='detail', section=null) {
  if (!wrap || !field) return null;
  const width = studioResolvedFieldWidth(field, context, section);
  const full = width === STUDIO_FIELD_WIDTH_FULL;

  wrap.classList.toggle('studio-field-width-full', full);
  wrap.style.width = full ? '100%' : `${width}px`;
  wrap.style.flex = full ? '1 0 100%' : `0 0 ${width}px`;
  wrap.style.maxWidth = '100%';
  wrap.style.boxSizing = 'border-box';
  wrap.dataset.studioFieldWidth = String(width);
  wrap.dataset.studioFieldWidthMode = full ? STUDIO_FIELD_WIDTH_FULL : 'FIXED';
  return width;
}

function studioFieldWidthSaveButtons() {
  return [
    document.getElementById('saveFieldWidthsBtn'),
    document.getElementById('saveDetailFieldWidthsBtn')
  ].filter(Boolean);
}

function studioRefreshFieldWidthSaveButtons() {
  const dirty = studioFieldWidthDrafts.size > 0;
  studioFieldWidthSaveButtons().forEach(button => {
    button.classList.toggle('hidden', !dirty);
    button.disabled = !dirty || studioFieldLayoutSaving;
    button.dataset.widthDirty = dirty ? 'true' : 'false';
    button.title = dirty
      ? `${studioFieldWidthDrafts.size}項目のレイアウト変更をViewDefへ保存`
      : 'レイアウトの変更はありません';
  });
}

function studioResetLiveFieldWidths() {
  studioFieldWidthDrafts = new Map();
  studioRefreshFieldWidthSaveButtons();
}

function studioSetLiveFieldWidth(field, width, section, source='live') {
  if (!field?.field || !section) return null;
  const normalized = studioNormalizeFieldWidth(width);
  if (!normalized) return null;
  const context = String(source ?? '').startsWith('grid.') ? 'grid' : 'editor';
  studioSetLiveFieldLayoutDraft(field, section, context, { width: normalized }, source);
  return normalized;
}

// One draft per Field/context: width, row break and height must merge, not replace.
function studioSetLiveFieldLayoutDraft(field, section, context, patch, source='live') {
  if (!field?.field || !section) return;
  const key = studioFieldWidthKey(section, field.field, context);
  studioFieldWidthDrafts.set(key, {
    ...studioFieldWidthDrafts.get(key),
    context,
    fieldName: String(field.field),
    section: studioFieldWidthSectionDescriptor(section),
    source: String(source),
    ...patch
  });
  studioRefreshFieldWidthSaveButtons();
}

const STUDIO_MIN_FIELD_HEIGHT_PX = 40;
const STUDIO_MAX_FIELD_HEIGHT_PX = 1600;

function studioNormalizeFieldHeight(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(STUDIO_MIN_FIELD_HEIGHT_PX, Math.min(STUDIO_MAX_FIELD_HEIGHT_PX, Math.round(n)));
}

function studioResolvedFieldLayout(field, section) {
  const draft = studioFieldWidthDrafts.get(studioFieldWidthKey(section, field.field, 'editor'));
  return {
    breakBefore: draft?.breakBefore ?? (field.layout?.breakBefore === true),
    separatorBefore: draft?.separatorBefore ?? (field.layout?.separatorBefore === true),
    height: studioNormalizeFieldHeight(draft?.height ?? field.layout?.height)
  };
}

// Layout operations are addressed to the following visible Field, never to Data.
// Metadata stays outside the DOM data-input contract and is collected with the field.
const studioLayoutFields = new WeakMap();
let studioHoveredLayoutBoundary = null;
const studioLayoutConsumedKeys = new Set();

function studioNextLayoutField(wrap) {
  let next = wrap.nextElementSibling;
  while (next?.classList.contains('studio-field-row-break') ||
         next?.classList.contains('studio-field-layout-separator')) next = next.nextElementSibling;
  // Do not cross a semantic FieldSet or a footer boundary.
  return next && studioLayoutFields.has(next) ? next : null;
}

function studioSetLayoutBoundary(wrap, property, enabled) {
  const meta = studioLayoutFields.get(wrap);
  if (!meta || !wrap.isConnected) return;
  const className = property === 'breakBefore' ? 'studio-field-break-before' : 'studio-field-separator-before';
  if (wrap.classList.contains(className) === enabled) return;
  wrap.classList.toggle(className, enabled);
  studioSetLiveFieldLayoutDraft(meta.field, meta.section, 'editor', { [property]: enabled }, `${meta.context}.${property}`);
  studioSyncFieldRowBreaks(wrap.parentElement);
}

// The icon belongs to the vertical handle, not the field's input or data.
// Keeping it a child preserves :hover while the pointer moves onto the icon.
function studioRefreshBreakMouseAction(wrap) {
  const button = wrap.querySelector(':scope > .studio-field-resize-handle > .studio-break-mouse-action');
  if (!button) return;
  const next = studioNextLayoutField(wrap);
  button.hidden = !next;
  const removing = !!next?.classList.contains('studio-field-break-before');
  button.classList.toggle('studio-break-mouse-remove', removing);
  button.title = removing ? '改行を解除（Delete / Backspace）' : '改行を追加（Enter）';
  button.setAttribute('aria-label', button.title);
}

function studioInstallBreakMouseAction(handle, wrap) {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.className = 'studio-break-mouse-action';
  button.hidden = true;
  // Static SVG keeps the trash icon crisp and the same blue as the handle.
  button.innerHTML = '<span aria-hidden="true" class="studio-break-mouse-return">↵</span>' +
    '<svg class="studio-break-mouse-trash" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2h4v2M4 4l.7 10h6.6L12 4M6.5 6.5v5M9.5 6.5v5"/></svg>';
  handle.appendChild(button);
  // The icon must not start a resize or move focus away from a Data input.
  button.addEventListener('mousedown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0 || !handle.matches(':hover') ||
        document.body.classList.contains('studio-field-width-resizing') ||
        document.body.classList.contains('studio-field-height-resizing')) return;
    const next = studioNextLayoutField(wrap);
    if (next) studioSetLayoutBoundary(next, 'breakBefore', !next.classList.contains('studio-field-break-before'));
  });
  handle.addEventListener('mouseenter', () => studioRefreshBreakMouseAction(wrap));
}

function studioBindLayoutBoundary(handle, kind, wrap) {
  const boundary = { handle, kind, wrap };
  handle.addEventListener('mouseenter', () => { studioHoveredLayoutBoundary = boundary; });
  handle.addEventListener('mouseleave', () => {
    if (studioHoveredLayoutBoundary === boundary) studioHoveredLayoutBoundary = null;
  });
  if (kind === 'vertical') {
    handle.addEventListener('contextmenu', event => {
      const next = studioNextLayoutField(wrap);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      studioSetLayoutBoundary(next, 'separatorBefore', true);
    });
  }
}

function studioHandleLayoutBoundaryKey(event) {
  // A held key must not fall through to text editing after its marker disappears.
  if (event.repeat && studioLayoutConsumedKeys.has(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      !['Enter', 'Delete', 'Backspace'].includes(event.key)) return;
  const boundary = studioHoveredLayoutBoundary;
  // Exact handle hover, not merely a hovered field. Never steal input from
  // another modal, a resize drag, an IME, or a stale/detached handle.
  if (!boundary?.handle.isConnected || !boundary.handle.matches(':hover')) return;
  if (document.body.classList.contains('studio-field-width-resizing') ||
      document.body.classList.contains('studio-field-height-resizing')) return;
  const dialog = boundary.handle.closest('dialog');
  if ([...document.querySelectorAll('dialog[open]')].some(item => item !== dialog)) return;
  const next = boundary.kind === 'vertical' ? studioNextLayoutField(boundary.wrap) : boundary.wrap;
  // An active boundary owns these keys even at the end of a field group.
  // No adjacent field means no layout change, not an accidental Data apply.
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat) return;
  studioLayoutConsumedKeys.add(event.key);
  if (!next || (boundary.kind === 'horizontal' && event.key === 'Enter')) return;
  if (boundary.kind === 'horizontal') studioSetLayoutBoundary(next, 'separatorBefore', false);
  else studioSetLayoutBoundary(next, 'breakBefore', event.key === 'Enter');
}

// Capture before Studio's ordinary document-level Enter/F12 input handling.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', studioHandleLayoutBoundaryKey, true);
  window.addEventListener('keyup', event => { studioLayoutConsumedKeys.delete(event.key); }, true);
  window.addEventListener('blur', () => { studioHoveredLayoutBoundary = null; studioLayoutConsumedKeys.clear(); });
}

// Markers are layout-only, never Fields or Data inputs. Real Fields stay direct
// children so existing alignment guides and editor selectors work.
function studioSyncFieldRowBreaks(container) {
  if (!container) return;
  for (const marker of container.querySelectorAll(':scope > .studio-field-row-break, :scope > .studio-field-layout-separator')) marker.remove();
  const grid = container.classList.contains('detail-fieldset-grid');
  let previous = null;
  for (const child of [...container.children]) {
    if (child.classList.contains('studio-field-separator-before')) {
      const marker = document.createElement('div');
      marker.className = 'studio-field-layout-separator';
      marker.setAttribute('aria-hidden', 'true');
      marker.title = 'Delete / Backspace で境界線を削除';
      studioBindLayoutBoundary(marker, 'horizontal', child);
      container.insertBefore(marker, child);
    } else if (!grid && child.classList.contains('studio-field-break-before') &&
        previous?.classList.contains('field') &&
        !previous.classList.contains('studio-field-width-full')) {
      const marker = document.createElement('div');
      marker.className = 'studio-field-row-break';
      marker.setAttribute('aria-hidden', 'true');
      container.insertBefore(marker, child);
    }
    previous = child;
  }
  for (const child of container.children) {
    if (studioLayoutFields.has(child)) studioRefreshBreakMouseAction(child);
  }
}

function studioApplyFieldHeight(control, height) {
  control.classList.add('studio-layout-fixed-height');
  control.style.setProperty('--studio-field-height', `${height}px`);
}

function studioInstallFieldLayoutControls(wrap, field, context='detail', section=null) {
  if (!wrap || !field?.field || !section || !['header', 'detail'].includes(context)) return;
  const layout = studioResolvedFieldLayout(field, section);
  const footer = context === 'detail' && typeof isDetailFooterField === 'function' && isDetailFooterField(field);
  if (!footer) {
    wrap.classList.add('studio-live-layout-field');
    studioLayoutFields.set(wrap, { field, section, context });
    wrap.classList.toggle('studio-field-break-before', layout.breakBefore);
    wrap.classList.toggle('studio-field-separator-before', layout.separatorBefore);
    // Reuse the existing resize handle. Fixed-width controls (radio/boolean,
    // chat etc.) still need a boundary, but must not gain width-resize behavior.
    let handle = wrap.querySelector(':scope > .studio-field-resize-handle');
    if (!handle) {
      handle = document.createElement('span');
      handle.className = 'studio-field-resize-handle studio-layout-only-handle';
      handle.setAttribute('aria-hidden', 'true');
      wrap.appendChild(handle);
    }
    handle.title = (handle.classList.contains('studio-layout-only-handle') ? '' : 'ドラッグ：幅調整 / ') +
      'Enter：改行 / Delete・Backspace：改行解除 / 右クリック：境界線挿入';
    studioBindLayoutBoundary(handle, 'vertical', wrap);
    studioInstallBreakMouseAction(handle, wrap);
  }

  // Reading View and raw textarea share the same explicit outer control height.
  // Do not reinterpret the legacy edit.height minimum-height contract.
  const control = wrap.querySelector(':scope > textarea, :scope > .markdown-textarea-display');
  if (!control) return;
  if (layout.height) studioApplyFieldHeight(control, layout.height);
  wrap.classList.add('studio-live-height-field');
  control.classList.add('studio-live-height-control');
  const handle = document.createElement('span');
  handle.className = 'studio-field-height-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.title = '上下にドラッグして高さを調整';
  wrap.appendChild(handle);
  handle.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = control.getBoundingClientRect().height;
    let moved = false;
    let height = studioNormalizeFieldHeight(startHeight);
    document.body.classList.add('studio-field-height-resizing');
    studioShowFieldHeightTip(height, event.clientX, event.clientY, wrap);
    const onMove = e => {
      if (Math.abs(e.clientY - startY) < 1 && !moved) return;
      moved = true;
      height = studioNormalizeFieldHeight(Math.max(1, startHeight + e.clientY - startY));
      studioApplyFieldHeight(control, height);
      studioShowFieldHeightTip(height, e.clientX, e.clientY, wrap);
    };
    const finish = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', finish);
      document.body.classList.remove('studio-field-height-resizing');
      studioHideFieldWidthTip();
      if (moved) studioSetLiveFieldLayoutDraft(field, section, 'editor', { height }, `${context}.height`);
    };
    const onUp = e => { onMove(e); finish(); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('blur', finish, { once: true });
  });
}

function studioShowFieldHeightTip(height, clientX, clientY, sourceElement) {
  const tip = studioEnsureFieldWidthTip(sourceElement);
  tip.textContent = `${height}px`;
  tip.style.left = `${Math.round(clientX) + 14}px`;
  tip.style.top = `${Math.round(clientY) + 14}px`;
  tip.classList.remove('hidden');
}

function studioFindRawTargetView(defObj, currentViewId='') {
  if (Array.isArray(defObj?.views) && defObj.views.length) {
    return defObj.views.find(view => String(view?.id ?? '') === String(currentViewId ?? '')) ?? defObj.views[0];
  }
  return defObj;
}

function studioFindRawTargetSection(view, descriptor) {
  const sections = Array.isArray(view?.sections) ? view.sections : [];
  if (!sections.length || !descriptor) return null;

  if (descriptor.id) {
    const byId = sections.find(section => String(section?.id ?? '') === descriptor.id);
    if (byId) return byId;
  }
  if (descriptor.dataPath) {
    const byPath = sections.find(section =>
      String(section?.type ?? '') === descriptor.type &&
      String(section?.dataPath ?? section?.data_path ?? '') === descriptor.dataPath
    );
    if (byPath) return byPath;
  }
  if (descriptor.caption) {
    const byCaption = sections.find(section =>
      String(section?.type ?? '') === descriptor.type &&
      String(section?.caption ?? '') === descriptor.caption
    );
    if (byCaption) return byCaption;
  }
  return sections.find(section => String(section?.type ?? '') === descriptor.type) ?? null;
}

function studioViewDefApiPath(rawName) {
  const name = String(rawName ?? '').trim().replace(/^defs\//, '').replace(/\\/g, '/');
  if (!name || name.startsWith('overlay/') || name.startsWith('studio_overlays/')) return '';
  if (name.split('/').some(part => !part || part === '.' || part === '..')) return '';
  return '/api/defs/' + name.split('/').map(part => encodeURIComponent(part)).join('/');
}

// Grid-only width save must never change the existing Editor appearance. For
// legacy ViewDefs without Field.width, capture the old editor fallback first.
function studioApplyWidthEntry(field, entry) {
  if (entry.context === 'grid') {
    if (!field.grid || typeof field.grid !== 'object') field.grid = {};
    if (field.width == null || field.width === '') {
      const legacyEditorWidth = studioNormalizeFieldWidthValue(field.grid.width);
      if (legacyEditorWidth && ['text', 'textarea'].includes(String(field.type ?? 'text'))) {
        field.width = legacyEditorWidth;
      }
    }
    field.grid.width = entry.width;
  } else {
    if (entry.width !== undefined) field.width = entry.width;
    if (entry.breakBefore !== undefined || entry.separatorBefore !== undefined || entry.height !== undefined) {
      if (!field.layout || typeof field.layout !== 'object' || Array.isArray(field.layout)) field.layout = {};
      if (entry.breakBefore !== undefined) field.layout.breakBefore = entry.breakBefore;
      if (entry.separatorBefore !== undefined) field.layout.separatorBefore = entry.separatorBefore;
      if (entry.height !== undefined) field.layout.height = entry.height;
    }
  }
}

function studioApplySavedWidthsToCurrentResolvedView(entries=studioFieldWidthDrafts) {
  if (!entries.size || typeof mainView !== 'function') return;
  const currentView = mainView();
  entries.forEach(entry => {
    const section = studioFindRawTargetSection(currentView, entry.section);
    const field = section?.fields?.find(item => String(item?.field ?? '') === entry.fieldName);
    if (!field) return;
    studioApplyWidthEntry(field, entry);
  });
}

async function saveStudioLiveFieldWidths() {
  if (!studioFieldWidthDrafts.size) return true;
  if (studioFieldLayoutSaving) return false;
  const liveDrafts = studioFieldWidthDrafts;
  const entries = new Map(liveDrafts);
  const currentViewId = String((typeof mainView === 'function' ? mainView()?.id : '') ?? '');

  const rawName = String(
    (typeof lastLoadedDefName !== 'undefined' && lastLoadedDefName)
      ? lastLoadedDefName
      : (document.getElementById('defNameInput')?.value ?? '')
  ).trim();
  const apiPath = studioViewDefApiPath(rawName);
  if (!apiPath) {
    const message = '現在のViewDefは直接保存できません。Coreのdefs配下ViewDefを選択してください。';
    if (typeof setStatus === 'function') setStatus(message, { kind: 'warn', title: 'レイアウト保存' });
    return false;
  }

  studioFieldLayoutSaving = true;
  studioRefreshFieldWidthSaveButtons();
  try {
    const read = await fetch(apiPath, { cache: 'no-store' });
    if (!read.ok) throw new Error(`ViewDef読込に失敗しました (${read.status})`);
    const rawDef = await read.json();

    const rawView = studioFindRawTargetView(rawDef, currentViewId);
    const notFound = [];

    entries.forEach(entry => {
      const section = studioFindRawTargetSection(rawView, entry.section);
      const field = section?.fields?.find(item => String(item?.field ?? '') === entry.fieldName);
      if (!field) {
        notFound.push(`${entry.section?.id || entry.section?.caption || entry.section?.type}:${entry.fieldName}`);
        return;
      }

      studioApplyWidthEntry(field, entry);
    });

    if (notFound.length) {
      throw new Error(`ViewDef内の保存対象Fieldを解決できません: ${notFound.join(', ')}`);
    }

    const write = await fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rawDef)
    });
    if (!write.ok) {
      const text = await write.text().catch(() => '');
      throw new Error(`ViewDefレイアウトの保存に失敗しました (${write.status}) ${text}`);
    }

    const count = entries.size;
    if (studioFieldWidthDrafts === liveDrafts) {
      studioApplySavedWidthsToCurrentResolvedView(entries);
      // A layout edit made while the request was in flight remains dirty.
      for (const [key, entry] of entries) {
        if (liveDrafts.get(key) === entry) liveDrafts.delete(key);
      }
    }

    // The live controls already reflect the saved layout. Re-rendering here
    // would discard unapplied Header/Detail text edits and conditional drafts.

    if (typeof invalidateDefinitionTargetViewDefCache === 'function') {
      invalidateDefinitionTargetViewDefCache(rawName);
    }
    if (typeof setStatus === 'function') {
      setStatus(`レイアウトをViewDefへ保存しました: ${count}項目`, { kind: 'success', title: 'Live View Design', toast: false });
    }
    return true;
  } finally {
    studioFieldLayoutSaving = false;
    studioRefreshFieldWidthSaveButtons();
  }
}

function studioInstallFieldWidthSaveButtons() {
  studioFieldWidthSaveButtons().forEach(button => {
    if (button.dataset.liveWidthInstalled === '1') return;
    button.dataset.liveWidthInstalled = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      try {
        await saveStudioLiveFieldWidths();
      } catch (error) {
        console.error('Live View Design width save failed:', error);
        if (typeof setStatus === 'function') {
          setStatus(`レイアウトを保存できません: ${error.message}`, { kind: 'error', title: 'レイアウト保存' });
        }
      }
    });
  });
  studioRefreshFieldWidthSaveButtons();
}


let studioFieldWidthTip = null;

function studioFieldWidthTipHost(sourceElement=null) {
  // A modal <dialog> is rendered in the browser Top Layer.
  // A Tip appended to document.body can therefore sit *behind* the open Detail dialog
  // even with a very large z-index. Keep the Tip in the same Top Layer when the
  // resize source lives inside a modal dialog.
  const source = sourceElement instanceof Element ? sourceElement : null;
  const dialog = source?.closest?.('dialog[open]');
  if (dialog) return dialog;
  return document.body;
}

function studioEnsureFieldWidthTip(sourceElement=null) {
  const host = studioFieldWidthTipHost(sourceElement);
  if (!studioFieldWidthTip?.isConnected) {
    const tip = document.createElement('div');
    tip.className = 'studio-field-width-tip hidden';
    tip.setAttribute('role', 'status');
    tip.setAttribute('aria-live', 'polite');
    studioFieldWidthTip = tip;
  }
  if (studioFieldWidthTip.parentElement !== host) {
    host.appendChild(studioFieldWidthTip);
  }
  return studioFieldWidthTip;
}

function studioShowFieldWidthTip(width, clientX, clientY, sourceElement=null) {
  const normalized = studioNormalizeFieldWidth(width);
  if (!normalized) return;
  const tip = studioEnsureFieldWidthTip(sourceElement);
  tip.textContent = `${normalized}px`;
  tip.style.left = `${Math.round(clientX) + 14}px`;
  tip.style.top = `${Math.round(clientY) + 14}px`;
  tip.classList.remove('hidden');
}

function studioHideFieldWidthTip() {
  if (!studioFieldWidthTip) return;
  studioFieldWidthTip.classList.add('hidden');
}
const STUDIO_FIELD_ALIGNMENT_GUIDE_TOLERANCE_PX = 1;

let studioFieldAlignmentGuide = null;
let studioFieldAlignmentSource = null;
let studioFieldAlignmentTarget = null;

function studioEnsureFieldAlignmentGuide(sourceElement=null) {
  // A modal <dialog> is rendered in the browser Top Layer. A guide appended to
  // document.body is therefore hidden behind the open Detail dialog even when it
  // has a huge z-index. Keep the guide in the same Top Layer as the resize source,
  // exactly like the live width Tip.
  const host = studioFieldWidthTipHost(sourceElement);
  if (!studioFieldAlignmentGuide?.isConnected) {
    const guide = document.createElement('div');
    guide.className = 'studio-field-alignment-guide hidden';
    guide.setAttribute('aria-hidden', 'true');
    studioFieldAlignmentGuide = guide;
  }
  if (studioFieldAlignmentGuide.parentElement !== host) {
    host.appendChild(studioFieldAlignmentGuide);
  }
  return studioFieldAlignmentGuide;
}

function studioClearFieldAlignmentClasses() {
  studioFieldAlignmentSource?.classList.remove('studio-field-alignment-source');
  studioFieldAlignmentTarget?.classList.remove('studio-field-alignment-target');
  studioFieldAlignmentSource = null;
  studioFieldAlignmentTarget = null;
}

function studioHideFieldAlignmentGuide() {
  studioClearFieldAlignmentClasses();
  if (!studioFieldAlignmentGuide) return;
  studioFieldAlignmentGuide.classList.add('hidden');
}

function studioFieldAlignmentContainer(sourceWrap) {
  return sourceWrap?.closest('#detailForm, #headerForm, .detail-grid, .form-grid') ?? sourceWrap?.parentElement ?? null;
}

function studioFindFieldAlignmentMatch(sourceWrap) {
  const container = studioFieldAlignmentContainer(sourceWrap);
  if (!container) return null;

  const sourceRect = sourceWrap.getBoundingClientRect();
  const sourceX = sourceRect.right;
  let best = null;

  const candidates = [...container.querySelectorAll(':scope > .field, :scope > .standard-search-field')];
  for (const candidate of candidates) {
    if (candidate === sourceWrap || !candidate.isConnected) continue;
    if (candidate.classList.contains('studio-field-width-full')) continue;

    const style = getComputedStyle(candidate);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const rect = candidate.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const verticalGap = rect.bottom < sourceRect.top
      ? sourceRect.top - rect.bottom
      : sourceRect.bottom < rect.top
        ? rect.top - sourceRect.bottom
        : 0;

    const edges = [
      { edge: 'left', x: rect.left },
      { edge: 'right', x: rect.right }
    ];

	for (const edge of edges) {
	  const distance = Math.abs(sourceX - edge.x);

	  if (distance > STUDIO_FIELD_ALIGNMENT_GUIDE_TOLERANCE_PX) continue;

	  const score = (distance * 10000) + verticalGap;

	  if (!best || score < best.score) {
	    best = {
	      sourceRect,
	      target: candidate,
	      targetRect: rect,
	      x: edge.x,
	      edge: edge.edge,
	      score
	    };
	  }
	}

  }

  return best;
}

function studioUpdateFieldAlignmentGuide(sourceWrap) {
  const match = studioFindFieldAlignmentMatch(sourceWrap);
  if (!match) {
    studioHideFieldAlignmentGuide();
    return;
  }

  const guide = studioEnsureFieldAlignmentGuide(sourceWrap);
  const top = Math.min(match.sourceRect.top, match.targetRect.top) - 5;
  const bottom = Math.max(match.sourceRect.bottom, match.targetRect.bottom) + 5;

  studioClearFieldAlignmentClasses();
  studioFieldAlignmentSource = sourceWrap;
  studioFieldAlignmentTarget = match.target;
  sourceWrap.classList.add('studio-field-alignment-source');
  match.target.classList.add('studio-field-alignment-target');

  guide.style.left = `${Math.round(match.x)}px`;
  guide.style.top = `${Math.max(0, Math.round(top))}px`;
  guide.style.height = `${Math.max(12, Math.round(bottom - Math.max(0, top)))}px`;
  guide.dataset.alignmentEdge = match.edge;
  guide.classList.remove('hidden');
}

function studioInstallFieldResizeHandle(wrap, field, context='detail', section=null) {
  if (!wrap || !field || !section) return;
  if (context === 'search' || studioFieldTypeUsesFixedControlWidth(field)) return;
  if (!['text', 'textarea', 'number', 'date', 'datetime', 'select'].includes(String(field.type ?? 'text'))) return;
  if (wrap.querySelector(':scope > .studio-field-resize-handle')) return;

  wrap.classList.add('studio-live-width-field');
  const handle = document.createElement('span');
  handle.className = 'studio-field-resize-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.title = 'ドラッグして項目幅を調整';
  handle.tabIndex = -1;
  wrap.appendChild(handle);

  handle.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = wrap.getBoundingClientRect().width;
    document.body.classList.add('studio-field-width-resizing');
    studioShowFieldWidthTip(startWidth, event.clientX, event.clientY, wrap);

    let moved = false;
    const onMove = moveEvent => {
      const delta = moveEvent.clientX - startX;
      if (Math.abs(delta) < 1) return;
      moved = true;
      const width = studioNormalizeFieldWidth(startWidth + delta);
      if (!width) return;
      // Direct resize is an explicit choice to leave FULL and use a concrete px width.
      wrap.classList.remove('studio-field-width-full');
      wrap.style.width = `${width}px`;
      wrap.style.flex = `0 0 ${width}px`;
      wrap.dataset.studioFieldWidth = String(width);
      wrap.dataset.studioFieldWidthMode = 'FIXED';
      studioSyncFieldRowBreaks(wrap.parentElement);
      studioShowFieldWidthTip(width, moveEvent.clientX, moveEvent.clientY, wrap);
      studioUpdateFieldAlignmentGuide(wrap);
    };

    const onUp = upEvent => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('studio-field-width-resizing');
      studioHideFieldWidthTip();
      studioHideFieldAlignmentGuide();
      if (!moved) return;
      const width = studioNormalizeFieldWidth(startWidth + (upEvent.clientX - startX));
      if (!width) return;
      wrap.style.width = `${width}px`;
      wrap.style.flex = `0 0 ${width}px`;
      wrap.dataset.studioFieldWidth = String(width);
      studioSetLiveFieldWidth(field, width, section, `${context}.resize`);
      studioSyncFieldRowBreaks(wrap.parentElement);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

function studioInstallGridColumnResizeHandle(th, field, section, table, col, visibleFields) {
  if (!th || !field || !section || !table || !col) return;
  th.dataset.field = String(field.field ?? '');
  th.classList.add('studio-live-width-column');

  const handle = document.createElement('span');
  handle.className = 'grid-column-resize-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.title = 'ドラッグして項目幅を調整';
  th.appendChild(handle);

  const recalcTableWidth = () => {
    const cols = [...table.querySelectorAll('col')];
    const fullCount = cols.filter(item => item.dataset.studioFieldWidthMode === STUDIO_FIELD_WIDTH_FULL).length;
    const fixedTotal = cols.reduce((sum, item) => {
      if (item.dataset.studioFieldWidthMode === STUDIO_FIELD_WIDTH_FULL) return sum;
      return sum + (studioNormalizeFieldWidth(item.style.width) ?? STUDIO_STANDARD_FIELD_WIDTH_PX);
    }, 0);
    if (fullCount > 0) {
      table.style.width = '100%';
      table.style.minWidth = `${fixedTotal + (fullCount * STUDIO_STANDARD_FIELD_WIDTH_PX)}px`;
      return;
    }
    table.style.width = `${fixedTotal}px`;
    table.style.minWidth = `${fixedTotal}px`;
  };

  handle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;
    document.body.classList.add('studio-field-width-resizing');
    studioShowFieldWidthTip(startWidth, event.clientX, event.clientY, th);

    let moved = false;
    const onMove = moveEvent => {
      const delta = moveEvent.clientX - startX;
      if (Math.abs(delta) < 1) return;
      moved = true;
      const width = studioNormalizeFieldWidth(startWidth + delta);
      if (!width) return;
      // Dragging a FULL column intentionally converts that live draft to a fixed px width.
      col.dataset.studioFieldWidthMode = 'FIXED';
      col.style.width = `${width}px`;
      th.style.width = `${width}px`;
      th.style.maxWidth = `${width}px`;
      recalcTableWidth();
      studioShowFieldWidthTip(width, moveEvent.clientX, moveEvent.clientY, th);
    };

    const onUp = upEvent => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('studio-field-width-resizing');
      studioHideFieldWidthTip();

      if (!moved) return;
      const width = studioNormalizeFieldWidth(startWidth + (upEvent.clientX - startX));
      if (!width) return;
      col.dataset.studioFieldWidthMode = 'FIXED';
      col.style.width = `${width}px`;
      th.style.width = `${width}px`;
      th.style.maxWidth = `${width}px`;
      studioSetLiveFieldWidth(field, width, section, 'grid.resize');
      recalcTableWidth();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', studioInstallFieldWidthSaveButtons, { once: true });
} else {
  studioInstallFieldWidthSaveButtons();
}
