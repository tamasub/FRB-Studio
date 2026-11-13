// Synthetic ViewDef fixtures for isolated Studio-Family tests.
// Production ViewDefs belong ONLY to FRB Launch/defs/launch/options.
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';

const field=(field,type,extra={})=>({field,caption:field,type,edit:{visible:true},...extra});
const viewDef=fields=>({views:[{id:'test',sections:[{type:'form',dataPath:'$',fields}]}]});
const definitions={
  webview:viewDef([field('remember_login','boolean'),field('new_tab_url','text')]),
  file_index:viewDef([
    field('enabled','boolean'),
    field('index_mode','select',{options:[
      {value:'registered',label:'登録フォルダー（標準）'},
      {value:'configured',label:'指定フォルダーのみ'},
      {value:'off',label:'索引を使用しない'}
    ]}),
    field('_index_mode_help','textarea',{readonly:true,edit:{visible:true,readonly:true},defaultValue:'登録フォルダーを使用する\n指定フォルダーのみ\n索引を使わない'}),
    field('index_folders','stringArray',{visibleWhen:{field:'index_mode',equals:'configured'}}),
    field('extensions','stringArray'),
    field('search_limit','number',{edit:{visible:true,min:1,max:500,step:1}}),
    field('update_mode','select',{options:['manual','auto']})
  ])
};
export async function createLaunchFixture(base) {
  const systemRoot=path.join(base,'launch','config');
  const defs=path.join(base,'launch','defs','launch','options');
  await mkdir(systemRoot,{recursive:true});await mkdir(defs,{recursive:true});
  const options=Object.entries(definitions).map(([id,view])=>({
    id,caption:id==='webview'?'ブラウザー':'ファイル検索',
    dataFile:id==='webview'?'webview_settings.json':'file_index_options.json',
    viewDef:`defs/launch/options/${id}_view_def.json`
  }));
  await writeFile(path.join(defs,'options_registry.json'),JSON.stringify({version:1,options}));
  for (const [id,view] of Object.entries(definitions))
    await writeFile(path.join(defs,`${id}_view_def.json`),JSON.stringify(view));
  return {systemRoot,defs};
}
