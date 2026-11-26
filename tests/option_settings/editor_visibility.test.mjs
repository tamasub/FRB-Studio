// Lightweight DOM contract test (not a browser/Qt end-to-end test).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fieldsFromViewDef,matchesVisibility} from '../../tools/option_settings/web/field_contract.mjs';
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.hidden=false;this.value='';this.events={};this.classList={toggle(){},add(){}};}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 appendChild(node){this.append(node);return node;}
 replaceChildren(){this.children=[];}
 get lastElementChild(){return this.children.at(-1);}
 querySelector(tag){for(const child of this.children){if(child.tag===tag)return child;const inner=child.querySelector(tag);if(inner)return inner;}return null;}
 querySelectorAll(){return [];}
 setAttribute(){}
 replaceWith(node){const p=this.parent;p.children[p.children.indexOf(this)]=node;node.parent=p;}
 addEventListener(name,fn){this.events[name]=fn;}
 checkValidity(){return true;}
}
test('GenericEditor builds nested fields, toggles help and preserves hidden values in gather',async()=>{
 const nodes=new Map();const document={documentElement:new Element('html'),getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(tag){return new Element(tag);}};
 const src=await readFile(new URL('../../tools/option_settings/web/editor.js',import.meta.url),'utf8');
 // Execute the actual editor class with the shared contract and minimal DOM.
 const code=src.slice(src.indexOf('const root = document;'),src.indexOf('const editor=new GenericEditor();'))+'\nglobalThis.instance=new GenericEditor();';
 const ctx={document,URLSearchParams,location:{search:''},fieldsFromViewDef,matchesVisibility};vm.createContext(ctx);vm.runInContext(code,ctx);
 const e=ctx.instance;const enabled={field:'enabled',equals:true};const auto={field:'update_mode',equals:'auto'};
 const view={views:[{sections:[{type:'form',dataPath:'$',fields:[{field:'enabled',type:'boolean'},{field:'update_mode',type:'select',options:['auto','manual'],visibleWhen:enabled},{field:'help',type:'textarea',readonly:true,edit:{readonly:true},defaultValue:'help',visibleWhen:enabled}]},{type:'form',dataPath:'$.auto_update',fields:[{field:'startup_delay_seconds',type:'number',visibleWhen:{all:[enabled,auto]}},{field:'check_interval_minutes',type:'number',visibleWhen:{all:[enabled,auto]}}]}]}]};
 e.original={enabled:true,update_mode:'auto',auto_update:{startup_delay_seconds:300,check_interval_minutes:30}};
 for(const f of fieldsFromViewDef(view))e.buildField(f,f.field.split('.').reduce((v,k)=>v?.[k],e.original));
 const at=k=>e.inputs.get(k);const delay=at('auto_update.startup_delay_seconds'),interval=at('auto_update.check_interval_minutes');
 e.refreshConditionalVisibility();assert.equal(delay.input.value,'300');assert.equal(interval.input.value,'30');assert.equal(delay.wrap.hidden,false);
 e.helpFields[0].button.events.click();assert.equal(e.helpFields[0].wrap.hidden,false);
 interval.input.value='0';at('update_mode').input.value='manual';e.refreshConditionalVisibility();assert.equal(delay.wrap.hidden,true);assert.equal(interval.wrap.hidden,true);
 at('enabled').input.value='false';e.refreshConditionalVisibility();assert.equal([...e.inputs.values()].filter(x=>!x.wrap.hidden).length,1);assert.equal(e.helpFields[0].wrap.hidden,true);
 const saved=JSON.parse(JSON.stringify(e.gather()));assert.deepEqual(saved,{enabled:false,update_mode:'manual',auto_update:{startup_delay_seconds:300,check_interval_minutes:0}});
 at('enabled').input.value='true';at('update_mode').input.value='auto';e.refreshConditionalVisibility();assert.equal(interval.wrap.hidden,false);assert.equal(interval.input.value,'0');
});
