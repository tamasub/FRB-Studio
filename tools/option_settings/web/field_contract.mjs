// Shared declaration contract for Option Composer and Generic Editor.
// Object paths only; no array indexes, evaluation, or prototype traversal.
export function pathParts(field) {
  const s=String(field??'');
  if (!/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/.test(s) ||
      s.split('.').some(p=>['__proto__','prototype','constructor'].includes(p))) {
    throw new Error(`対応していないViewDef Field: ${s}`);
  }
  return s.split('.');
}
export function fieldsFromViewDef(viewDef) {
  if (!Array.isArray(viewDef?.views) || viewDef.views.length!==1) throw new Error('ViewDefは単一Viewで指定してください');
  const forms=(viewDef.views[0].sections??[]).filter(s=>s.type==='form');
  if (!forms.length) throw new Error('FormのViewDefが必要です');
  return forms.flatMap(s=>{
    const base=s.dataPath;
    if (typeof base!=='string' || (base!=='$' && !base.startsWith('$.'))) throw new Error(`対応していないForm dataPath: ${base}`);
    const prefix=base==='$'?'':pathParts(base.slice(2)).join('.')+'.';
    return (s.fields??[]).filter(f=>f?.edit?.visible!==false).map(f=>({...f,field:prefix+pathParts(f.field).join('.')}));
  });
}
// Conditions always reference root-relative paths. Existing single-condition
// declarations (field/equals, in, aliases) remain compatible.
export function matchesVisibility(condition, read) {
  if (condition==null) return true;
  if (typeof condition!=='object' || Array.isArray(condition)) return false;
  if (Object.hasOwn(condition,'all')) {
    return Array.isArray(condition.all) && condition.all.length>0 && condition.all.every(c=>matchesVisibility(c,read));
  }
  const source=condition.field??condition.sourceField??condition.source_field;
  if (typeof source!=='string' || !source.trim()) return false;
  let key;
  try { key=pathParts(source.startsWith('$.')?source.slice(2):source).join('.'); } catch { return false; }
  const actual=read(key);
  if (actual===undefined) return false;
  if (Array.isArray(condition.in)) return condition.in.map(String).includes(String(actual??''));
  if (Array.isArray(condition.values)) return condition.values.map(String).includes(String(actual??''));
  if (condition.equals!=null) return String(actual??'')===String(condition.equals);
  if (condition.value!=null) return String(actual??'')===String(condition.value);
  return false;
}
