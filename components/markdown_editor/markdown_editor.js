/* FRB Markdown Editor experimental v0.4. Browser-only; no app or persistence dependency. */
(function (global) {
  'use strict';
  const pos = (line, ch) => ({line, ch});
  const normalized = s => s.replace(/\r\n|\r/g, '\n');
  function fenceInfo(lines) {
    const map = new Map(); let open = null;
    for (let i = 0; i < lines.length; i++) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
      if (!open && m && !(m[1][0] === '`' && m[2].includes('`'))) {
        open = {start:i, end:lines.length-1, closed:false, char:m[1][0], length:m[1].length};
        map.set(i, {block:open, fence:true});
      } else if (open) {
        const close = m && m[1][0] === open.char && m[1].length >= open.length && !m[2].trim();
        map.set(i, {block:open, fence:Boolean(close)});
        if (close) {open.end = i; open.closed = true; open = null;}
      }
    }
    return map;
  }
  const escaped = (s,i) => {let n=0; while(i>0 && s[--i]==='\\') n++; return n%2===1;};
  // Limited, source-position based syntax. Never render user HTML as HTML.
  function inlineTokens(s, start) {
    const out=[];
    const re= /(?<code>`+)(?<codeBody>[^`\n]+?)\k<code>(?!`)|(?<link>\[(?<label>[^\]\n]+)\]\((?<url>[^\s()]+)(?:[ \t]+"(?<title>[^"\n]*)")?\))|(?<strong>\*\*|__)(?!\s)(?<strongBody>.+?)(?<!\s)\k<strong>|(?<strike>~~)(?!\s)(?<strikeBody>[^~\n]+?)(?<!\s)~~|(?<em>\*|_)(?!\s)(?<emBody>[^*_\n]+?)(?<!\s)\k<em>/g;
    re.lastIndex=start;
    for(let m;(m=re.exec(s));){
      const g=m.groups, from=m.index,to=from+m[0].length;
      if(escaped(s,from))continue;
      if(g.link){out.push({from,to,bodyFrom:from+1,bodyTo:from+1+g.label.length,cls:'link',url:g.url,title:g.title});continue;}
      const delim=g.code||g.strong||g.strike||g.em;
      if(escaped(s,to-delim.length))continue;
      if(delim[0]==='_'&&/[\p{L}\p{N}]/u.test(s[from-1]||''))continue;
      const body=g.codeBody||g.strongBody||g.strikeBody||g.emBody;
      if(!g.code&&(!body||/^\s|\s$/.test(body)))continue;
      out.push({from,to,bodyFrom:from+delim.length,bodyTo:to-delim.length,cls:g.code?'code':g.strong?'strong':g.strike?'strike':'em',color:g.code&&/^(?:#[\da-f]{3,8}|(?:rgba?|hsla?)\([^\n]+\))$/i.test(body)&&CSS.supports('color',body)?body:null});
    }
    return out;
  }
  const horizontalRule=s=>/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s);
  function matchingTicks(s,start,n){
    for(let i=start;i<s.length;i++){if(s[i]!=='`'||escaped(s,i))continue;let k=1;while(s[i+k]==='`')k++;if(k===n)return true;i+=k-1;}return false;
  }
  function tableCells(s){
    const parts=[];let start=0, ticks=0;
    for(let i=0;i<s.length;i++){
      if(s[i]==='`'&&!escaped(s,i)){let n=1;while(s[i+n]==='`')n++;if(!ticks&&matchingTicks(s,i+n,n))ticks=n;else if(ticks===n)ticks=0;i+=n-1;continue;}
      if(s[i]==='|'&&!ticks&&!escaped(s,i)){parts.push({raw:s.slice(start,i),start,end:i});start=i+1;}
    }
    if(!parts.length)return null;
    parts.push({raw:s.slice(start),start,end:s.length});
    if(!parts[0].raw.trim())parts.shift();if(parts.length&&!parts.at(-1).raw.trim())parts.pop();
    return parts.map(c=>({...c,text:c.raw.trim().replace(/\\\|/g,'|'),contentStart:c.start+(c.raw.match(/^\s*/)?.[0].length||0)}));
  }
  function tableInfo(lines,fences){
    const result=new Map();
    for(let i=0;i<lines.length-1;i++){
      if(fences.has(i)||fences.has(i+1))continue;
      const head=tableCells(lines[i]), sep=tableCells(lines[i+1]);
      if(!head||!sep||!head.length||head.length!==sep.length||!sep.every(c=>/^:?-{3,}:?$/.test(c.text)))continue;
      const rows=[head];let end=i+1;
      while(end+1<lines.length&&!fences.has(end+1)){const row=tableCells(lines[end+1]);if(!row||row.length!==head.length)break;rows.push(row);end++;}
      const block={start:i,end,rows,align:sep.map(c=>c.text.endsWith(':')?(c.text.startsWith(':')?'center':'right'):'left')};
      for(let n=i;n<=end;n++)result.set(n,block);i=end;
    }
    for(let i=0;i<lines.length;i++){
      const f=fences.get(i);if(!f?.fence||f.block.start!==i||!f.block.closed||lines[i]!=='```frb-table')continue;
      const end=f.block.end;if(lines[end]!=='```')continue;
      let model;try{model=JSON.parse(lines.slice(i+1,end).join('\n'));}catch{continue;}
      if(!validRichTable(model))continue;
      const block={start:i,end,model,rich:true};for(let n=i;n<=end;n++)result.set(n,block);i=end;
    }
    return result;
  }
  function validRichTable(m){
    const align=a=>['left','center','right'].includes(a),obj=o=>o&&typeof o==='object'&&!Array.isArray(o);
    const style=o=>obj(o)&&Object.entries(o).every(([k,v])=>k==='align'?align(v):['bold','italic','strike'].includes(k)?typeof v==='boolean':['color','background'].includes(k)&&typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v));
    if(!obj(m)||m.version!==1||Object.keys(m).some(k=>!['version','rows','align','styles'].includes(k))||!Array.isArray(m.rows)||!m.rows.length||!Array.isArray(m.align)||!m.align.length||!m.align.every(align)||!m.rows.every(r=>Array.isArray(r)&&r.length===m.align.length&&r.every(v=>typeof v==='string')))return false;
    const st=m.styles;if(st===undefined)return true;
    return obj(st)&&Object.keys(st).every(k=>['table','rows','cells'].includes(k))&&style(st.table)&&Array.isArray(st.rows)&&st.rows.length===m.rows.length&&st.rows.every(style)&&Array.isArray(st.cells)&&st.cells.length===m.rows.length&&st.cells.every(r=>Array.isArray(r)&&r.length===m.align.length&&r.every(style));
  }
  function richSource(model){return '```frb-table\n'+JSON.stringify({version:1,...model},null,2)+'\n```';}
  function standardTable(model){
    const escapeCell=v=>{const text=String(v).replace(/\r\n?|\n/g,' ');let out='';for(let i=0;i<text.length;i++)out+=(text[i]==='|'&&!escaped(text,i)?'\\':'')+text[i];return out;};
    const fmt=(r,c)=>({align:model.align[c],...model.styles?.table,...model.styles?.rows?.[r],...model.styles?.cells?.[r]?.[c]});
    const row=(values,r)=>'| '+values.map((v,c)=>{let text=escapeCell(v);const f=fmt(r,c);if(text.trim()){if(f.strike)text='~~'+text+'~~';if(f.italic)text='*'+text+'*';if(f.bold)text='**'+text+'**';}return text;}).join(' | ')+' |';
    // Preserve a column alignment if all cells agree; otherwise use the imported base alignment.
    const align=model.align.map((a,c)=>{const first=fmt(0,c).align;return model.rows.every((_,r)=>fmt(r,c).align===first)?first:a;});
    return [row(model.rows[0],0),'| '+align.map(a=>a==='center'?':---:':a==='right'?'---:':':---').join(' | ')+' |',...model.rows.slice(1).map((r,i)=>row(r,i+1))].join('\n');
  }
  function noteInfo(lines,fences){const map=new Map();let open=null;
    for(let i=0;i<lines.length;i++){if(fences.has(i))continue;const m=/^\s*:::note(?:\s+(info|warn|alert))?\s*$/.exec(lines[i]);
      if(!open&&m){open={start:i,kind:m[1]||'info'};map.set(i,{block:open,boundary:true});}
      else if(open){const close=/^\s*:::\s*$/.test(lines[i]);map.set(i,{block:open,boundary:close});if(close){open.end=i;open=null;}}
    }
    for(const [i,n] of map)if(n.block.end===undefined)map.delete(i);return map;
  }
  // Opt-in recognition of two exact Qiita HTML forms. All content stays inert.
  function htmlBlocks(lines,fences){
    const map=new Map();
    for(let i=0;i<lines.length;i++){
      if(fences.has(i))continue;
      const detail=/^\s*<details( open)?>\s*<summary>([^<>]*)<\/summary>\s*$/.exec(lines[i]);
      const dl=/^\s*<dl>\s*$/.test(lines[i]);if(!detail&&!dl)continue;
      let end=i+1;while(end<lines.length&&!(!fences.has(end)&&(detail?/^\s*<\/details>\s*$/:/^\s*<\/dl>\s*$/).test(lines[end])))end++;
      if(end===lines.length)continue;
      const inner=lines.slice(i+1,end);let items=[];
      if(dl){
        items=inner.map(l=>/^\s*<(dt|dd)>(.*?)<\/\1>\s*$/.exec(l));
        if(items.some(x=>!x)||!items.length||items[0][1]!=='dt')continue;
      }else if(inner.some(l=>/<\/?details\b/i.test(l)))continue;
      const block={start:i,end,kind:detail?'details':'dl',summary:detail?.[2],open:Boolean(detail?.[1]),inner,items};
      for(let j=i;j<=end;j++)map.set(j,block);i=end;
    }
    return map;
  }
  function appendSafeInline(parent,text){
    // Only literal strong tags receive presentation; everything else is text.
    let last=0;for(const m of text.matchAll(/<strong>([^<>]*)<\/strong>/g)){
      parent.append(document.createTextNode(text.slice(last,m.index)));const b=document.createElement('strong');b.textContent=m[1];parent.append(b);last=m.index+m[0].length;
    }parent.append(document.createTextNode(text.slice(last)));
  }
  class MarkdownEditor {
    constructor(options={}) {
      this.options={...options}; this._raw=''; this._mode='live-preview'; this._events=new Map();
      this._marks=[]; this._classes=[]; this._grids=[]; this._readonly=Boolean(options.readOnly); this._enabled=true;
      this._detailsState=new Map();this._theme=options.theme||'light'; this._lastKey=null; this._dirtyPaint=true; this._silent=false;
      if (options.value!==undefined) this.setValue(options.value);
    }
    mount(container) {
      if (this.cm) throw new Error('Already mounted');
      if (!container || container.nodeType!==1) throw new TypeError('HTMLElement required');
      if (!global.CodeMirror) throw new Error('CodeMirror is not loaded');
      this.root=document.createElement('div'); this.root.className='frb-markdown-editor'; container.append(this.root);
      this.cm=global.CodeMirror(this.root,{value:normalized(this._raw),mode:null,lineWrapping:true,
        inputStyle:'textarea',indentUnit:2,tabSize:4,smartIndent:false,dragDrop:false,
        extraKeys:{Tab:cm=>{if(cm.getOption('readOnly'))return global.CodeMirror.Pass;cm.replaceSelection('    ','end','+input');}},readOnly:this._readonly||!this._enabled});
      this.cm.getInputField().setAttribute('aria-label',this.options.label||'Markdown 編集');
      this.cm.on('changes',()=>{this._dirtyPaint=true;this._paint();if(!this._silent)this._emit('change',this.getValue());});
      this.cm.on('cursorActivity',()=>this._paint());
      this.cm.on('focus',()=>{this._paint();this._emit('focus');});
      this.cm.on('blur',()=>{if(!this._gridFocusIntent)this._paint();this._emit('blur');});
      // Never change decoration during IME composition; refresh after commitment.
      this._compositionStart=()=>{this._composing=true;};
      this._compositionEnd=()=>{this._composing=false;this._dirtyPaint=true;this._paint();};
      this.root.addEventListener('compositionstart',this._compositionStart,true);
      this.root.addEventListener('compositionend',this._compositionEnd,true);
      this.setTheme(this._theme);this.setEnabled(this._enabled);this._paint();return this;
    }
    getValue() {
      if (!this.cm) return this._raw;
      const s=this.cm.getValue('\n');
      if(s===normalized(this._raw)) return this._raw;
      // Preserve uniform CRLF or CR on edits; mixed endings normalize to LF on edits.
      const ends=this._raw.match(/\r\n|\r|\n/g)||[];
      return ends.length && ends.every(x=>x===ends[0]) && ends[0]!=='\n' ? s.replace(/\n/g,ends[0]):s;
    }
    exportStandardMarkdown(){
      const raw=this.getValue(),lines=normalized(raw).split('\n'),tables=tableInfo(lines,fenceInfo(lines));let result=[];
      if(![...tables.values()].some(t=>t.rich))return raw;
      for(let i=0;i<lines.length;i++){const t=tables.get(i);if(t?.rich&&t.start===i){result.push(standardTable(t.model));i=t.end;}else result.push(lines[i]);}
      const eol=raw.match(/\r\n|\r|\n/g)||[];const out=result.join('\n');return eol.length&&eol.every(x=>x===eol[0])&&eol[0]!=='\n'?out.replace(/\n/g,eol[0]):out;
    }
    setValue(value) {
      if(typeof value!=='string') throw new TypeError('Markdown value must be string');
      this._raw=value;this._detailsState.clear(); if(!this.cm)return;
      this._silent=true;
      try {this.cm.setValue(normalized(value));this.cm.clearHistory();this._dirtyPaint=true;this._paint();}
      finally {this._silent=false;}
    }
    setReadOnly(value){this._readonly=Boolean(value);this._applyState();}
    setEnabled(value){this._enabled=Boolean(value);this._applyState();}
    _applyState(){if(!this.cm)return;this.cm.setOption('readOnly',!this._enabled?'nocursor':this._readonly);this.root.classList.toggle('frb-disabled',!this._enabled);this._dirtyPaint=true;this._paint();}
    focus(){if(this._enabled)this.cm?.focus();}
    blur(){this.cm?.getInputField().blur();}
    resize(){this.cm?.refresh();}
    setTheme(theme){this._theme=theme;if(this.root)this.root.dataset.theme=theme;}
    setMode(mode){if(!['source','live-preview'].includes(mode))throw new Error('Unknown mode');this._mode=mode;this._dirtyPaint=true;this._paint();}
    on(event,handler){if(!this._events.has(event))this._events.set(event,new Set());this._events.get(event).add(handler);return ()=>this.off(event,handler);}
    off(event,handler){this._events.get(event)?.delete(handler);}
    _emit(event,value){for(const fn of this._events.get(event)||[])fn(value);}
    destroy(){if(this.cm){this._raw=this.getValue();this.blur();this.root.removeEventListener('compositionstart',this._compositionStart,true);this.root.removeEventListener('compositionend',this._compositionEnd,true);this._clearPaint();this.root.remove();this.cm=null;this.root=null;}this._events.clear();this._lastKey=null;this._dirtyPaint=true;}
    _clearPaint(){for(const grid of this._grids)grid.closeMenu();this._grids=[];for(const mark of this._marks)mark.clear();for(const [handle,cls] of this._classes)this.cm.removeLineClass(handle,'text',cls);this._marks=[];this._classes=[];}
    _line(i,cls){const name='frb-'+cls;const h=this.cm.addLineClass(i,'text',name);this._classes.push([h,name]);}
    _mark(i,a,b,options){if(a>=b)return;this._marks.push(this.cm.markText(pos(i,a),pos(i,b),options));}
    _syntax(i,a,b,active,replacement){
      if(active){this._mark(i,a,b,{className:'frb-syntax'});return;}
      const opt={collapsed:true,clearOnEnter:true};
      if(replacement){const span=document.createElement('span');span.className='frb-marker';span.textContent=replacement;opt.replacedWith=span;}
      this._mark(i,a,b,opt);
    }
    _task(i,ch,checked,active){
      if(active){this._mark(i,ch,ch+3,{className:'frb-syntax'});return;}
      const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.className='frb-task';input.disabled=this._readonly||!this._enabled;input.setAttribute('aria-label','タスクの完了状態');
      input.addEventListener('mousedown',e=>e.stopPropagation());
      input.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(this._readonly||!this._enabled)return;const raw=this.cm.getLine(i).slice(ch,ch+3);if(!/^\[[ xX]\]$/.test(raw))return;this.cm.replaceRange(raw[1]===' '?'[x]':'[ ]',pos(i,ch),pos(i,ch+3),'+input');});
      this._mark(i,ch,ch+3,{replacedWith:input,clearOnEnter:true});
    }
    _htmlPreview(block,lines){
      const wrap=document.createElement('span');wrap.className='frb-html-preview';
      const edit=document.createElement('button');edit.type='button';edit.className='frb-block-edit';edit.textContent='原文';edit.disabled=!this._enabled;wrap.append(edit);
      const enter=e=>{e.preventDefault();e.stopPropagation();if(!this._enabled)return;this.cm.operation(()=>{this.cm.setCursor(pos(block.start,0));this.cm.focus();this._dirtyPaint=true;});this._paint();};
      edit.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});edit.addEventListener('click',enter);
      if(block.kind==='details'){
        const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=block.summary;details.append(summary);wrap.append(details);
        const key=JSON.stringify([block.start,lines.slice(block.start,block.end+1)]);details.open=this._detailsState.get(key)??block.open;
        summary.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});
        summary.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!this._enabled)return;details.open=!details.open;this._detailsState.set(key,details.open);this.cm.refresh();});
        // Show text and fenced code without evaluating any embedded HTML.
        let pre=null;for(const line of block.inner){
          if(/^ {0,3}(`{3,}|~{3,})/.test(line)){if(pre){pre=null;}else{pre=document.createElement('pre');pre.className='frb-detail-code';details.append(pre);}continue;}
          if(pre){pre.textContent+=(pre.textContent?'\n':'')+line;continue;}
          const div=document.createElement('div');div.textContent=line||' ';details.append(div);
        }
      }else{
        const dl=document.createElement('dl');for(const item of block.items){const node=document.createElement(item[1]);appendSafeInline(node,item[2]);dl.append(node);}wrap.append(dl);
      }
      this._marks.push(this.cm.markText(pos(block.start,0),pos(block.end,lines[block.end].length),{replacedWith:wrap,clearOnEnter:true}));
    }
    // Adapter only: raw cell Markdown is the value; the grid never parses Markdown.
    _tableModel(block){if(block.rich){const {version,...model}=block.model;return model;}return {rows:block.rows.map(row=>row.map(c=>c.raw.trim())),align:block.align.slice()};}
    _tableSerialize(block,lines,next){
      if(block.rich||next.styles)return richSource(next);
      const old=this._tableModel(block), width=next.align.length;
      const safe=v=>{const s=String(v).replace(/\r\n?|\n/g,' ');let out='',ticks=0;for(let i=0;i<s.length;i++){if(s[i]==='`'&&!escaped(s,i)){let n=1;while(s[i+n]==='`')n++;if(!ticks&&matchingTicks(s,i+n,n))ticks=n;else if(ticks===n)ticks=0;out+=s.slice(i,i+n);i+=n-1;continue;}out+=(s[i]==='|'&&!ticks&&!escaped(s,i)?'\\':'')+s[i];}return out;};
      const rowText=row=>'| '+row.map(safe).join(' | ')+' |';
      const result=[];
      for(let r=0;r<next.rows.length;r++){
        const srcLine=block.start+(r?r+1:0),row=next.rows[r];
        if(width===old.align.length&&r<old.rows.length){
          const cells=block.rows[r];let text=lines[srcLine];
          for(let c=width-1;c>=0;c--){if(row[c]===old.rows[r][c])continue;const cell=cells[c];const before=cell.raw.match(/^\s*/)[0];let tail=cell.raw.slice(before.length).match(/\s*$/)[0];const content=safe(row[c]);if(!tail&&lines[srcLine][cell.end]==='|'&&/\\+$/.test(content)&&content.match(/\\+$/)[0].length%2)tail=' ';text=text.slice(0,cell.start)+before+content+tail+text.slice(cell.end);}
          result.push(text);
        }else result.push(rowText(row));
        if(r===0){const same=JSON.stringify(old.align)===JSON.stringify(next.align);result.push(same?lines[block.start+1]:'| '+next.align.map(a=>a==='center'?':---:':a==='right'?'---:':'---').join(' | ')+' |');}
      }
      return result.join('\n');
    }
    _tablePreview(block,lines){
      const wrap=document.createElement('span');wrap.className='frb-table-wrap frb-table-interactive';
      const cm=this.cm, original=lines.slice(block.start,block.end+1).join('\n');
      const pending=this._pendingTable?.start===block.start?this._pendingTable:null;
      const current=()=>cm.getRange(pos(block.start,0),pos(block.end,lines[block.end].length))===original;
      const source=p=>{if(!this._enabled||!current())return;const r=p[0],c=p[1],cell=block.rows?.[r]?.[c];this._gridFocusIntent=false;cm.operation(()=>{cm.setCursor(pos(block.rich?block.start+1:block.start+(r?r+1:0),cell?.contentStart||0));cm.focus();this._dirtyPaint=true;});this._paint();};
      const grid=new global.FRBTableEditor({model:this._tableModel(block),selection:pending?.selection,displayValue:v=>v.replace(/\\\|/g,'|'),readOnly:this._readonly,disabled:!this._enabled,
        onChange:(model,selection,restore)=>{if(!current()||this._readonly||!this._enabled)return;const text=this._tableSerialize(block,lines,model);if(text===original)return;this._pendingTable={start:block.start,selection,restore};cm.replaceRange(text,pos(block.start,0),pos(block.end,lines[block.end].length),'frb-table');},
        onSource:source,onUndo:(redo,selection)=>{if(this._readonly||!this._enabled)return;this._pendingTable={start:block.start,selection,restore:true};redo?cm.redo():cm.undo();this._pendingTable=null;},onExit:()=>{cm.focus();},onFocus:()=>{this._gridFocusIntent=true;queueMicrotask(()=>{this._gridFocusIntent=false;});}});
      grid.mount(wrap);this._grids.push(grid);
      this._marks.push(cm.markText(pos(block.start,0),pos(block.end,lines[block.end].length),{replacedWith:wrap,clearOnEnter:true}));
      if(pending){this._pendingTable=null;if(pending.restore){queueMicrotask(()=>{if(grid.root.isConnected)grid.focus();});}}
    }
    _paint(){
      if(!this.cm||this._painting||this._composing)return;
      const cm=this.cm;if(!this._dirtyPaint&&this.root.querySelector('.frb-grid:focus-within'))return;const active=new Set();
      if(cm.hasFocus())for(const sel of cm.listSelections())for(let i=Math.min(sel.anchor.line,sel.head.line);i<=Math.max(sel.anchor.line,sel.head.line);i++)active.add(i);
      const key=this._mode+':'+[...active].join(',');
      if(!this._dirtyPaint&&key===this._lastKey)return;
      this._painting=true;this._lastKey=key;this._dirtyPaint=false;
      try{cm.operation(()=>{
        this._clearPaint();if(this._mode==='source')return;
        const lines=cm.getValue('\n').split('\n'),fences=fenceInfo(lines),tables=tableInfo(lines,fences),notes=noteInfo(lines,fences),html=htmlBlocks(lines,fences),blocks=new Set();
        const activeHtml=new Set([...active].map(i=>html.get(i)).filter(Boolean));
        const activeTables=new Set([...active].map(i=>tables.get(i)).filter(Boolean));
        for(const i of active){const f=fences.get(i);if(f)blocks.add(f.block);}
        for(let i=0;i<lines.length;i++){
          const s=lines[i],a=active.has(i),f=fences.get(i);
          const h=html.get(i);if(h&&!activeHtml.has(h)){if(i===h.start)this._htmlPreview(h,lines);continue;}
          const table=tables.get(i);
          if(table?.rich){if(!activeTables.has(table)){if(i===table.start)this._tablePreview(table,lines);}else this._line(i,'table-source');continue;}
          if(f){this._line(i,'fenced');if(f.fence){this._line(i,'fence');if(!blocks.has(f.block))this._mark(i,0,s.length,{className:'frb-invisible-fence'});else this._mark(i,0,s.length,{className:'frb-syntax'});}continue;}
          if(h){this._line(i,'table-source');continue;}
          if(table){if(!activeTables.has(table)){if(i===table.start)this._tablePreview(table,lines);}else this._line(i,'table-source');continue;}
          const note=notes.get(i);
          if(note){this._line(i,'note-'+note.block.kind);if(note.boundary){this._line(i,'note-boundary');if(a)this._mark(i,0,s.length,{className:'frb-syntax'});else if(i===note.block.start)this._syntax(i,0,s.length,false,({info:'ℹ Info',warn:'⚠ Warn',alert:'! Alert'})[note.block.kind]);else this._mark(i,0,s.length,{className:'frb-invisible-fence'});continue;}}
          if(horizontalRule(s)){this._line(i,'rule');if(!a)this._mark(i,0,s.length,{className:'frb-invisible-fence'});else this._mark(i,0,s.length,{className:'frb-syntax'});continue;}
          let start=0;let m=/^( {0,3})(#{1,6})([ \t]+)(?=\S)/.exec(s);
          if(m){this._line(i,'heading-'+m[2].length);this._syntax(i,m[1].length,m[0].length,a);start=m[0].length;}
          else if((m=/^(\s*)(>)([ \t]?)/.exec(s))){this._line(i,'quote');this._syntax(i,m[1].length,m[1].length+1,a,'│');start=m[0].length;}
          else if((m=/^(\s*)([-+*]|\d{1,9}[.)])([ \t]+)(?=\S)/.exec(s))){
            start=m[0].length;const task=/^\[([ xX])\](?:[ \t]+|$)/.exec(s.slice(start));
            if(task){this._syntax(i,m[1].length,m[1].length+m[2].length,a);this._task(i,start,task[1]!==' ',a);start+=task[0].length;}
            else if(m[2].length===1)this._syntax(i,m[1].length,m[1].length+1,a,'•');
            else this._mark(i,m[1].length,m[1].length+m[2].length,{className:'frb-marker'});
          }
          for(const t of inlineTokens(s,start)){
            this._mark(i,t.bodyFrom,t.bodyTo,{className:'frb-'+t.cls,...(t.url?{title:t.url}: {})});
            this._syntax(i,t.from,t.bodyFrom,a);this._syntax(i,t.bodyTo,t.to,a);
            if(t.color&&!a){const swatch=document.createElement('span');swatch.className='frb-color-swatch';swatch.style.backgroundColor=t.color;swatch.title=t.color;this._marks.push(cm.setBookmark(pos(i,t.to),{widget:swatch,insertLeft:true}));}
          }
        }
      });}finally{this._painting=false;}
    }
  }
  global.FRBMarkdownEditor=MarkdownEditor;
})(window);
