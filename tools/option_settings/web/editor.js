// ONE Generic Editor. Every option tab sends a different Studio ViewDef + JSON.
const root = document;
const qs = new URLSearchParams(location.search);
const token = qs.get('token');
root.documentElement.dataset.theme = qs.get('theme') === 'dark' ? 'dark' : 'light';
const el = id => root.getElementById(id);
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const isPlain = v => v!==null && typeof v==='object' && !Array.isArray(v);
function atPath(obj,fullPath) {
  return fullPath.split('.').reduce((value, part) => isPlain(value)&&own(value,part)?value[part]:undefined,obj);
}
function setPath(obj,fullPath,value) {
  const parts=fullPath.split('.');let at=obj;
  for (const p of parts.slice(0,-1)) { if(!own(at,p))at[p]={};at=at[p]; }
  at[parts.at(-1)]=value;
}
async function api(url,options={}) {
  const response=await fetch(url,{...options,headers:{...options.headers,'X-FRB-Option-Token':token}});
  const result=await response.json();
  if(!response.ok)throw new Error(result.message||result.error||`HTTP ${response.status}`);
  return result;
}
const fieldsFromViewDef=viewDef=>(viewDef.views?.[0]?.sections||[])
  .filter(s=>s.type==='form'&&s.dataPath==='$')
  .flatMap(s=>s.fields||[])
  .filter(field=>field.edit?.visible!==false);

class GenericEditor {
  constructor(){this.id=null;this.original=null;this.revision=null;this.dirty=false;this.inputs=new Map();}
  status(text,bad=false) { el('status').textContent=text; el('status').classList.toggle('error',bad); }
  async open(id) {
    if(this.dirty && !confirm('未保存の編集内容を破棄して設定を切り替えますか？'))return;
    try{
      this.status('読み込み中…');
      const doc=await api(`/api/compose?id=${encodeURIComponent(id)}`);
      this.id=id;this.original=doc.edited;this.revision=doc.revision;this.dirty=false;
      this.inputs.clear();el('fields').replaceChildren();el('form-title').textContent=doc.caption+'の設定';
      const fields=fieldsFromViewDef(doc.viewDef);
      for(const field of fields)this.buildField(field,atPath(doc.edited,field.field));
      this.refreshConditionalVisibility();
      el('option-buttons').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
      const hasUser=Object.keys(doc.edited).some(()=>true) && doc.revision!=='missing';
      el('ownership').textContent=hasUser?'User設定あり／保存で再確定':'System標準値を表示中（まだUser保存なし）';
      this.status('設定を読み込みました');
    }catch(error){this.status(error.message,true);}
  }
  // Shared Studio ViewDef contract: visibleWhen is presentation only.
  // The field's value stays in the edit model while temporarily hidden,
  // so switching index_mode does not discard previously entered folders.
  refreshConditionalVisibility() {
    for (const {field, input, wrap} of this.inputs.values()) {
      const cond=field.visibleWhen ?? field.visible_when;
      if (!cond || typeof cond!=='object' || Array.isArray(cond)) continue;
      const source=String(cond.field ?? cond.sourceField ?? cond.source_field ?? '').trim();
      if (!source) continue;
      const actual=this.inputs.has(source)
        ? this.inputs.get(source).input.value
        : atPath(this.original,source);
      let visible=true;
      if (Array.isArray(cond.in)) visible=cond.in.map(String).includes(String(actual??''));
      else if (Array.isArray(cond.values)) visible=cond.values.map(String).includes(String(actual??''));
      else if (cond.equals!=null) visible=String(actual??'')===String(cond.equals);
      else if (cond.value!=null) visible=String(actual??'')===String(cond.value);
      wrap.hidden=!visible;
    }
  }
  buildField(field,value) {
    const wrap=root.createElement('div');wrap.className='field';
    // Existing Studio ViewDef: a readonly textarea with defaultValue is informational.
    // It is NEVER part of editable data, dirty tracking, or the User JSON.
    if(field.type==='textarea' && field.readonly===true && field.edit?.readonly===true && typeof field.defaultValue==='string') {
      wrap.classList.add('field-help');
      const helpLabel=root.createElement('label');helpLabel.textContent=field.caption||'ヘルプ';
      const text=root.createElement('textarea');text.readOnly=true;text.value=field.defaultValue;
      text.setAttribute('aria-label',helpLabel.textContent);text.rows=Math.max(3,text.value.split('\n').length);
      wrap.append(helpLabel,text);
      // General presentation rule: informational textarea following a select
      // is toggled by an adjacent ? button, without adding ViewDef schema keys.
      const previous=el('fields').lastElementChild;
      const select=previous?.querySelector('select');
      if(select) {
        const row=root.createElement('div');row.className='field-control-row';
        select.replaceWith(row);row.appendChild(select);
        const help=root.createElement('button');help.type='button';help.className='field-help-toggle';
        help.textContent='?';help.title=helpLabel.textContent;help.setAttribute('aria-label',helpLabel.textContent);
        help.setAttribute('aria-expanded','false');
        row.appendChild(help);wrap.hidden=true;
        help.addEventListener('click',()=>{wrap.hidden=!wrap.hidden;help.setAttribute('aria-expanded',String(!wrap.hidden));});
      }
      el('fields').appendChild(wrap);
      return;
    }
    const label=root.createElement('label');label.textContent=field.caption||field.field;
    let input;
    if(field.type==='boolean') {
      input=root.createElement('select');
      for(const [val,caption] of [['true','有効'],['false','無効']]){
        const item=root.createElement('option');item.value=val;item.textContent=caption;input.appendChild(item);
      }
      input.value=String(value);
    } else if(field.type==='select') {
      input=root.createElement('select');
      for(const opt of field.options||[]){const item=root.createElement('option');item.value=typeof opt==='string'?opt:String(opt.value);item.textContent=typeof opt==='string'?opt:String(opt.label||opt.value);input.appendChild(item);}
      input.value=String(value);
    } else if(field.type==='stringArray') {
      input=root.createElement('textarea');input.value=(value||[]).join('\n');
    } else {
      input=root.createElement('input');input.type=field.type==='number'?'number':'text';
      if(field.type==='number')for(const k of ['min','max','step']) if(field.edit?.[k]!=null)input[k]=String(field.edit[k]);
      input.value=String(value??'');
    }
    input.id='field_'+field.field.replace(/\W/g,'_');label.htmlFor=input.id;
    input.addEventListener('input',()=>{this.dirty=true;this.status('未保存の変更があります');this.refreshConditionalVisibility();});
    input.addEventListener('change',()=>this.refreshConditionalVisibility());
    this.inputs.set(field.field,{input,field,wrap});wrap.append(label,input);el('fields').appendChild(wrap);
  }
  gather() {
    const edited={};
    for(const [fieldName,{input,field}] of this.inputs){
      if(!input.checkValidity())throw new Error(`${field.caption||field.field}: 入力値を確認してください`);
      let value=input.value;
      if(field.type==='boolean')value=value==='true';
      else if(field.type==='number') {if(!value.trim())throw new Error(`${field.caption||field.field}: 数値が必要です`);value=Number(value);}
      else if(field.type==='stringArray')value=value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
      setPath(edited,fieldName,value);
    }
    return edited;
  }
  async save() {
    if(!this.id)return;
    try {
      const edited=this.gather();
      const doc=await api(`/api/save?id=${encodeURIComponent(this.id)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edited,revision:this.revision})});
      this.revision=doc.revision;this.original=doc.edited;this.dirty=false;
      el('ownership').textContent='User設定として保存済み';this.status('保存しました。設定値はUser責任で保持されます。');
    }catch(err){this.status(err.message,true);}
  }
}
const editor=new GenericEditor();
el('save').addEventListener('click',()=>editor.save());
el('reset').addEventListener('click',()=>editor.id&&editor.open(editor.id));
window.addEventListener('beforeunload',event=>{if(editor.dirty){event.preventDefault();event.returnValue='';}});
(async()=>{
  try{
    if(!token)throw new Error('起動トークンがありません');
    const catalog=await api('/api/options');
    for(const option of catalog){
      const button=root.createElement('button');button.type='button';button.textContent=option.caption;button.dataset.id=option.id;
      button.addEventListener('click',()=>editor.open(option.id));el('option-buttons').appendChild(button);
    }
    if(catalog.length)await editor.open(catalog[0].id);
  }catch(error){editor.status(error.message,true);}
})();
