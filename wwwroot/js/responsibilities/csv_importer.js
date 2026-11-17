// ViewDef-driven CSV replacement (all rows or selected groups) for a declared Grid array.
// Parsing and mapping are independent of the Studio DOM, making them testable.
(function (root) {
  'use strict';

  function normalizedHeader(value) {
    return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s\u3000_\-()（）:：.・]/g, '');
  }

  function separatorForCsv(text) {
    let quoted = false;
    const counts = { ',': 0, '\t': 0, ';': 0 };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && (char === '\n' || char === '\r')) break;
      else if (!quoted && Object.hasOwn(counts, char)) counts[char]++;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
      ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  }

  function parse(text) {
    const source = String(text ?? '').replace(/^\ufeff/, '');
    const separator = separatorForCsv(source);
    const records = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    let closedQuote = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (inQuotes) {
        if (c === '"') {
          if (source[i + 1] === '"') { cell += '"'; i++; }
          else { inQuotes = false; closedQuote = true; }
        } else cell += c;
        continue;
      }
      if (c === '"' && !closedQuote && !cell) { inQuotes = true; continue; }
      if (c === separator) {
        row.push(cell); cell = ''; closedQuote = false; continue;
      }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && source[i + 1] === '\n') i++;
        row.push(cell);
        if (row.some(value => String(value).trim() !== '')) records.push(row);
        row = []; cell = ''; closedQuote = false; continue;
      }
      if (closedQuote && (c === ' ' || c === '\t')) continue;
      if (closedQuote || c === '"') throw new Error(`CSVの引用符が不正です（${records.length + 1}行目）`);
      cell += c;
    }
    if (inQuotes) throw new Error('CSVの引用符が閉じられていません');
    row.push(cell);
    if (row.some(value => String(value).trim() !== '')) records.push(row);
    return records;
  }

  function buildRows(text, definition) {
    if (!definition || !['replace_all', 'replace_groups'].includes(definition.mode)) {
      throw new Error('CSV取込はreplace_allまたはreplace_groupsを宣言したGridでのみ使用できます');
    }
    const records = parse(text);
    if (records.length < 2) throw new Error('CSVにヘッダー行とデータ行が必要です');
    const headers = records[0].map(normalizedHeader);
    const aliases = definition.columns || {};
    const sourceFields = {};
    for (const [fieldName, names] of Object.entries(aliases)) {
      const accepted = [fieldName, ...(Array.isArray(names) ? names : [])].map(normalizedHeader);
      const columnIndex = headers.findIndex(h => accepted.includes(h));
      if (columnIndex >= 0) sourceFields[fieldName] = columnIndex;
    }
    const requiredField = String(definition.requiredField || 'value');
    if (!Object.hasOwn(sourceFields, requiredField)) {
      throw new Error(`CSVヘッダーに「${requiredField}」（メールアドレスなど）に対応する列がありません`);
    }
    // A group replacement must not silently take its group value from defaults.
    // The CSV itself authorizes exactly which groups may be replaced.
    const groupField = String(definition.groupField || '').trim();
    if (definition.mode === 'replace_groups' &&
        (!groupField || !Object.hasOwn(sourceFields, groupField))) {
      throw new Error(`replace_groupsではCSVにグループ列「${groupField || '(未設定)'}」が必要です`);
    }
    const idField = String(definition.idField || '').trim();
    const orderField = String(definition.orderField || '').trim();
    const orderStep = Math.max(1, Number(definition.orderStep) || 10);
    const prefix = String(definition.idPrefix || 'csv_import_');
    const defaults = definition.defaults && typeof definition.defaults === 'object' ? definition.defaults : {};
    const maxRows = Math.max(1, Number(definition.maxRows) || 10000);
    const output = [];
    for (let recordIndex = 1; recordIndex < records.length; recordIndex++) {
      const record = records[recordIndex];
      if (record.every(v => String(v).trim() === '')) continue;
      const row = { ...defaults };
      for (const [field, index] of Object.entries(sourceFields)) row[field] = String(record[index] ?? '').trim();
      if (!row[requiredField]) throw new Error(`CSV ${recordIndex + 1}行目: ${requiredField}が空です。データは変更していません`);
      if (definition.mode === 'replace_groups' && !row[groupField]) {
        throw new Error(`CSV ${recordIndex + 1}行目: ${groupField}が空です。データは変更していません`);
      }
      // Missing names remain usable; the address itself becomes the display label.
      if (Object.hasOwn(aliases, 'title') && !row.title) row.title = row[requiredField];
      const descriptionFallback = String(definition.descriptionFallbackField || '');
      if (descriptionFallback && !row.description) row.description = String(row[descriptionFallback] ?? '');
      if (idField) row[idField] = `${prefix}${String(output.length + 1).padStart(6, '0')}`;
      if (orderField) row[orderField] = (output.length + 1) * orderStep;
      output.push(row);
      if (output.length > maxRows) throw new Error(`CSVの件数が上限（${maxRows}件）を超えています`);
    }
    if (output.length === 0) throw new Error('取り込み可能なデータ行がありません。既存データは変更していません');
    return output;
  }

  // Pure, non-mutating merge. Replaced groups are determined ONLY by CSV rows.
  // Untouched groups, their IDs and their original positions are preserved.
  function replaceGroups(existingRows, importedRows, definition) {
    if (!definition || definition.mode !== 'replace_groups') {
      throw new Error('replaceGroupsにはreplace_groups定義が必要です');
    }
    if (!Array.isArray(existingRows) || !Array.isArray(importedRows) || !importedRows.length) {
      throw new Error('置換するGrid配列とCSVデータを確認してください');
    }
    const groupField = String(definition.groupField || '').trim();
    if (!groupField) throw new Error('replace_groupsのgroupFieldが未設定です');
    const idField = String(definition.idField || '').trim();
    const idPrefix = String(definition.idPrefix || 'csv_import_');
    const groups = new Map();
    for (const row of importedRows) {
      const key = String(row?.[groupField] ?? '').trim();
      if (!key) throw new Error(`CSVの${groupField}が空です。既存データは変更していません`);
      if (!groups.has(key)) groups.set(key, { group: key, before: 0, after: 0 });
      groups.get(key).after++;
    }
    const retainedIds = new Set();
    const retained = [];
    for (const row of existingRows) {
      if (groups.has(String(row?.[groupField] ?? '').trim())) {
        groups.get(String(row[groupField]).trim()).before++;
      } else {
        retained.push(row);
        if (idField && row && row[idField] != null && String(row[idField])) {
          retainedIds.add(String(row[idField]));
        }
      }
    }
    // New IDs must not collide with IDs belonging to untouched groups.
    // CSV-generated IDs are intentionally regenerated, as in replace_all.
    let sequence = 0;
    const newRows = importedRows.map(row => {
      const copy = { ...row };
      if (idField) {
        let proposed;
        do {
          sequence++;
          proposed = `${idPrefix}${String(sequence).padStart(6, '0')}`;
        } while (retainedIds.has(proposed));
        copy[idField] = proposed;
        retainedIds.add(proposed);
      }
      return copy;
    });
    // Keep unaffected rows in place, inserting each replaced group's CSV rows
    // at its first original position. New groups are appended in CSV order.
    const byGroup = new Map([...groups.keys()].map(key => [key, []]));
    for (const row of newRows) byGroup.get(String(row[groupField]).trim()).push(row);
    const emitted = new Set();
    const rows = [];
    for (const existing of existingRows) {
      const key = String(existing?.[groupField] ?? '').trim();
      if (!groups.has(key)) {
        rows.push(existing);
      } else if (!emitted.has(key)) {
        rows.push(...byGroup.get(key));
        emitted.add(key);
      }
    }
    for (const [key, replacements] of byGroup) {
      if (!emitted.has(key)) rows.push(...replacements);
    }
    return {
      rows,
      groups: [...groups.values()],
      replacedCount: existingRows.length - retained.length,
      importedCount: newRows.length
    };
  }

  function decode(bytes) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer);
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buffer);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('shift_jis', { fatal: true }).decode(buffer); }
  }

  const CsvGridImporter = { parse, buildRows, replaceGroups, decode };
  root.CsvGridImporter = CsvGridImporter;
  if (typeof module !== 'undefined' && module.exports) module.exports = CsvGridImporter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
