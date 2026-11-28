// FRB Studio Family / Option Settings v0.1
// ViewDef is the single source of truth for the USER-owned fields.
// Compose must NOT write. Save owns ONLY the User config file.
import { readFile, mkdir, rename, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathParts as contractPathParts, fieldsFromViewDef } from '../../components/generic_editor/field_contract.mjs';

// Launch owns its ViewDefs and registry. Studio supplies only the shared engine.
const launchRootFrom = systemRoot => path.resolve(systemRoot, '..');
const registryFileFrom = systemRoot => path.join(launchRootFrom(systemRoot), 'defs', 'launch', 'options', 'options_registry.json');
const MISSING = 'missing';
const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const sha = content => createHash('sha256').update(content).digest('hex');

export class OptionSettingsError extends Error {
  constructor(message, code='INVALID_OPTION_SETTINGS') { super(message); this.code = code; }
}

async function jsonFile(file, { absent=null }={}) {
  let bytes;
  try { bytes = await readFile(file); }
  catch (err) {
    if (err.code === 'ENOENT') return { data: absent, revision: MISSING };
    throw err;
  }
  try {
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
    return { data: JSON.parse(text), revision: sha(bytes) };
  } catch (err) {
    throw new OptionSettingsError(`JSON読み込みエラー: ${file} (${err.message})`, 'INVALID_JSON');
  }
}

function pathParts(field) {
  try { return contractPathParts(field); }
  catch (err) { throw new OptionSettingsError(err.message,'BAD_VIEWDEF'); }
}
function getPath(obj, parts) {
  let at = obj;
  for (const part of parts) {
    if (!isObject(at) || !own(at, part)) return { found:false };
    at = at[part];
  }
  return { found:true, value:at };
}
function setPath(obj, parts, value) {
  let at = obj;
  for (const p of parts.slice(0,-1)) {
    if (!own(at,p)) at[p] = {};
    if (!isObject(at[p])) throw new OptionSettingsError(`設定値の構造が不正: ${parts.join('.')}`);
    at = at[p];
  }
  at[parts.at(-1)] = clone(value);
}
function leaves(obj, prefix='') {
  if (!isObject(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k,v]) => leaves(v, prefix ? prefix+'.'+k : k));
}
function isInformationField(field) {
  return field.type === 'textarea' && field.readonly === true && field.edit?.readonly === true && typeof field.defaultValue === 'string';
}
function viewDefFields(viewDef) {
  let fields;
  try { fields=fieldsFromViewDef(viewDef); }
  catch (err) { throw new OptionSettingsError(err.message,'BAD_VIEWDEF'); }
  const names = new Set();
  for (const field of fields) {
    pathParts(field.field);
    if (names.has(field.field)) throw new OptionSettingsError(`重複Field: ${field.field}`, 'BAD_VIEWDEF');
    names.add(field.field);
    if (!['boolean','text','select','number','stringArray'].includes(field.type) && !isInformationField(field)) {
      throw new OptionSettingsError(`未対応のField Type: ${field.field}/${field.type}`, 'UNSUPPORTED_VIEWDEF_FIELD');
    }
  }
  // Explicit and predictable ownership: do not accept ambiguous parent + child fields.
  for (const name of names) {
    if ([...names].some(other => other !== name && other.startsWith(name+'.'))) {
      throw new OptionSettingsError(`親子Fieldが重複: ${name}`, 'BAD_VIEWDEF');
    }
  }
  return fields.filter(f => !isInformationField(f));
}
function checkValue(field, value, systemValue) {
  const fail = reason => { throw new OptionSettingsError(`${field.field}: ${reason}`, 'VALIDATION_FAILED'); };
  if (field.type === 'boolean' && typeof value !== 'boolean') fail('真偽値を指定してください');
  if (field.type === 'text' && typeof value !== 'string') fail('文字列を指定してください');
  if (field.type === 'select') {
    if (typeof value !== 'string') fail('選択値を指定してください');
    const options=(field.options??[]).map(o=>typeof o==='string'?o:String(o.value??''));
    if (!options.includes(value)) fail('許可されていない選択値です');
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('数値を指定してください');
    if (Number.isFinite(field.edit?.min) && value < field.edit.min) fail('最小値未満です');
    if (Number.isFinite(field.edit?.max) && value > field.edit.max) fail('最大値超過です');
    if (Number.isInteger(field.edit?.step) && Number.isInteger(systemValue) && !Number.isInteger(value)) fail('整数を指定してください');
  }
  if (field.type === 'stringArray' && (!Array.isArray(value) || !value.every(v=>typeof v==='string'))) fail('文字列配列を指定してください');
  // Existing system types remain the authoritative type contract, even if a
  // ViewDef accidentally labels the field differently.
  if (typeof systemValue !== typeof value || Array.isArray(systemValue) !== Array.isArray(value)) {
    fail('System標準値と型が一致しません');
  }
}
function mergeSystemWithUser(system, user, fields) {
  const effective = clone(system);
  for (const field of fields) {
    const parts = pathParts(field.field);
    const replacement = getPath(user, parts);
    if (replacement.found) setPath(effective,parts,replacement.value);
  }
  return effective;
}

export async function optionsCatalog({ studioRoot, systemRoot, userRoot }) {
  const { data:registry } = await jsonFile(registryFileFrom(systemRoot));
  if (!Array.isArray(registry?.options)) throw new OptionSettingsError(`Launch側Options Registryがありません、または不正です: ${registryFileFrom(systemRoot)}`, 'BAD_REGISTRY');
  return registry.options.map(({id,caption})=>({id,caption}));
}
export async function composeOptions({ studioRoot, systemRoot, userRoot, id }) {
  const { data:registry } = await jsonFile(registryFileFrom(systemRoot));
  if (!Array.isArray(registry?.options)) throw new OptionSettingsError(`Launch側Options Registryがありません、または不正です: ${registryFileFrom(systemRoot)}`, 'BAD_REGISTRY');
  const option = registry.options.find(e=>e.id===id);
  if (!option) throw new OptionSettingsError(`未登録の設定: ${id}`, 'UNKNOWN_OPTION');
  if (!/^[a-z][a-z_0-9]*$/.test(option.id) || !/^[a-z_]+\.json$/.test(option.dataFile)) {
    throw new OptionSettingsError('Options Registryのパスが不正', 'BAD_REGISTRY');
  }
  const launchRoot = launchRootFrom(systemRoot);
  const viewDefPath = path.resolve(launchRoot, option.viewDef);
  if (!viewDefPath.startsWith(launchRoot + path.sep)) {
    throw new OptionSettingsError('ViewDefはLaunch領域外を参照できません', 'BAD_REGISTRY');
  }
  const [viewDefRead,systemRead,userRead]=await Promise.all([
    jsonFile(viewDefPath), jsonFile(path.join(systemRoot,option.dataFile)),
    jsonFile(path.join(userRoot,option.dataFile),{absent:{}})
  ]);
  const {data:viewDef}=viewDefRead,{data:system}=systemRead,{data:user}=userRead;
  if (!isObject(system) || !isObject(user)) throw new OptionSettingsError('System/User設定はオブジェクトである必要があります');
  const fields=viewDefFields(viewDef);
  const edited = {}, currentUser = {};
  // Runtime must not accidentally apply old/unknown user fields.
  for (const field of fields) {
    const parts=pathParts(field.field),base=getPath(system,parts),override=getPath(user,parts);
    if (!base.found) throw new OptionSettingsError(`System標準値がありません: ${field.field}`, 'MISSING_DEFAULT');
    checkValue(field,base.value,base.value);
    if (override.found) {
      checkValue(field,override.value,base.value);
      setPath(currentUser,parts,override.value);
    }
    setPath(edited,parts,override.found?override.value:base.value);
  }
  return {
    id:option.id, caption:option.caption, viewDef, edited,
    effective: mergeSystemWithUser(system,currentUser,fields),
    user:currentUser, revision:userRead.revision,
    userFile:path.join(userRoot,option.dataFile), dataFile:option.dataFile
  };
}

// A successful Save means the User explicitly owns ALL displayed values, including
// unchanged System defaults. Unknown fields and hidden system fields are rejected.
export async function saveOptions(args, { edited, revision }) {
  const composed=await composeOptions(args);
  const fieldList=viewDefFields(composed.viewDef);
  if (!isObject(edited)) throw new OptionSettingsError('編集結果はJSONオブジェクトである必要があります', 'VALIDATION_FAILED');
  const keys = leaves(edited).sort();
  const expected = fieldList.map(f=>f.field).sort();
  if (JSON.stringify(keys)!==JSON.stringify(expected)) {
    throw new OptionSettingsError('編集可能項目以外の追加、または編集項目の欠落があります', 'VALIDATION_FAILED');
  }
  const result={};
  for (const field of fieldList) {
    const parts=pathParts(field.field), value=getPath(edited,parts).value;
    const base=getPath(composed.effective,parts).value;
    checkValue(field,value,base);
    if (field.field==='new_tab_url') {
      try {
        const url=new URL(value);
        if (!['http:','https:'].includes(url.protocol) || !url.hostname || /\s/.test(value)) throw new Error();
      } catch { throw new OptionSettingsError('new_tab_url: 有効なhttp(s) URLを指定してください','VALIDATION_FAILED'); }
    }
    if (field.field==='index_folders' && value.some(v=>!v.trim())) throw new OptionSettingsError('index_folders: 空行は指定できません','VALIDATION_FAILED');
    if (field.field==='extensions' && (!value.length || value.some(v=>!/^\.[\w]+$/.test(v)))) throw new OptionSettingsError('extensions: .json などの拡張子を指定してください','VALIDATION_FAILED');
    setPath(result,parts,value);
  }
  const userFile = composed.userFile;
  // Lock before reading revision: concurrent editors cannot overwrite each other.
  await mkdir(path.dirname(userFile),{recursive:true});
  const lockFile=userFile+'.lock';
  let handle;
  try { handle=await open(lockFile,'wx'); }
  catch (err) {
    if (err.code==='EEXIST') throw new OptionSettingsError('他の保存処理が実行中です','LOCKED');
    throw err;
  }
  let tmpFile;
  try {
    const current=await jsonFile(userFile,{absent:{}});
    if (revision !== current.revision) throw new OptionSettingsError('User設定が外部で更新されました。再読み込みしてください','STALE_REVISION');
    const content=JSON.stringify(result,null,2)+'\n';
    tmpFile=userFile+'.tmp-'+randomUUID();
    const tmp=await open(tmpFile,'wx');
    try { await tmp.writeFile(content,'utf8'); await tmp.sync(); }
    finally { await tmp.close(); }
    await rename(tmpFile,userFile);
    tmpFile=null;
  } finally {
    if (tmpFile) await rm(tmpFile,{force:true}).catch(()=>{});
    await handle.close();
    await rm(lockFile,{force:true});
  }
  return composeOptions(args);
}
