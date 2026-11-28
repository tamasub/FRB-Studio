"""Scoped styles, edge buttons, round trip, and export. Offline Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,re
base=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1400,'height':1000});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def load(path):
        html=path.read_text(encoding='utf-8')
        html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+ (path.parent/m[1]).read_text(encoding='utf-8')+'</style>',html)
        html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (path.parent/m[1]).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>',html)
        page.set_content(html)
    def cell(r,c):return page.locator(f'.frb-grid-table [data-row="{r}"][data-col="{c}"]')
    def style(r,c,key):return cell(r,c).evaluate('(e,key)=>e.style[key]',key)
    def panel(scope,group,label):
        page.locator('.frb-grid-toolbar button',has_text=re.compile('^書式$')).click()
        page.get_by_role('button',name=scope,exact=True).click()
        assert page.locator('.frb-grid-styles').evaluate('(e)=>e.parentElement===document.body')
        assert page.locator('.frb-grid-styles').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}')
        g=page.locator('.frb-grid-style-group').filter(has=page.locator('.frb-grid-style-label',has_text=re.compile('^'+group+'$')))
        g.get_by_role('button',name=label,exact=True).click()
    def state():return page.evaluate('grid.getValue()')
    load(base/'experiment.html');cell(1,1).click();panel('表全体','背景色','背景色 #ffe39a');assert style(0,0,'backgroundColor')=='rgb(255, 227, 154)' and style(2,2,'backgroundColor')=='rgb(255, 227, 154)'
    cell(1,0).click();panel('選択行','背景色','背景色 #326ac1');assert style(1,2,'backgroundColor')=='rgb(50, 106, 193)' and style(2,2,'backgroundColor')=='rgb(255, 227, 154)'
    cell(1,1).click();panel('選択セル','背景色','背景色 #22864d');assert style(1,1,'backgroundColor')=='rgb(34, 134, 77)' and style(1,0,'backgroundColor')=='rgb(50, 106, 193)'
    panel('選択セル','背景色','継承');assert style(1,1,'backgroundColor')=='rgb(50, 106, 193)'
    cell(1,0).click();page.keyboard.press('Shift+ArrowRight');panel('選択セル','太字','ON');assert style(1,0,'fontWeight')=='700' and style(1,1,'fontWeight')=='700' and style(1,2,'fontWeight')==''
    cell(1,1).click();panel('選択セル','文字揃え','左');assert style(1,1,'textAlign')=='left' and style(2,1,'textAlign')=='right'
    print('PASS: table/row/cell precedence, inheritance, multi-cell selection, unaffected cells')
    table=page.locator('.frb-grid-table').bounding_box();row_edge=page.get_by_role('button',name='末尾に行を追加').bounding_box();col_edge=page.get_by_role('button',name='末尾に列を追加').bounding_box();assert row_edge['y']>=table['y']+table['height']-2 and col_edge['x']>=table['x']+table['width']-2
    old=state();page.get_by_role('button',name='末尾に行を追加').click();assert len(state()['rows'])==4 and state()['styles']['rows'][-1]=={};assert style(3,1,'backgroundColor')=='rgb(255, 227, 154)'
    page.get_by_role('button',name='末尾に列を追加').click();assert len(state()['align'])==4 and style(1,3,'backgroundColor')=='rgb(50, 106, 193)';page.keyboard.press('Control+z');page.keyboard.press('Control+z');assert state()==old
    cell(1,1).click(button='right');page.get_by_role('menuitem',name='行を下へ').click();assert state()['styles']['rows'][2]['background']=='#326ac1' and state()['styles']['cells'][2][1]['align']=='left'
    cell(2,1).click(button='right');page.get_by_role('menuitem',name='列を右へ').click();assert state()['styles']['cells'][2][2]['align']=='left';print('PASS: edge append, inherited styles, undo, style follows moved rows/columns')
    page=browser.new_page(viewport={'width':1400,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)));load(base.parent/'markdown_editor'/'experiment.html');page.locator('#table').click();original=page.evaluate('editor.getValue()');
    cell(1,1).click();panel('選択セル','文字揃え','左');raw=page.evaluate('editor.getValue()');assert '```frb-table' in raw and raw.startswith(original.split('| 項目')[0]) and raw.endswith(original.split('表の外の文章')[1]);assert style(1,1,'textAlign')=='left' and style(2,1,'textAlign')=='right';assert page.evaluate('changes')==1
    page.keyboard.press('Control+z');assert page.evaluate('editor.getValue()')==original;page.keyboard.press('Control+y');assert page.evaluate('editor.getValue()')==raw
    page.evaluate('v=>{editor.setValue(v);editor.blur()}',raw);assert style(1,1,'textAlign')=='left';assert page.evaluate('editor.getValue()')==raw
    exported=page.evaluate('editor.exportStandardMarkdown()');assert exported==original and page.evaluate('editor.getValue()')==raw
    cell(1,1).click();panel('選択セル','文字色','文字色 #d64545');assert style(1,1,'color')=='rgb(214, 69, 69)'
    before=page.evaluate('editor.getValue()');page.get_by_role('button',name='末尾に行を追加').click();page.get_by_role('button',name='末尾に列を追加').click();assert page.locator('.frb-grid-table tr').count()==5 and page.locator('.frb-grid-table th').count()==4
    page.keyboard.press('Control+z');page.keyboard.press('Control+z');assert page.evaluate('editor.getValue()')==before
    print('PASS: rich block save/reload, exact undo/redo, unaffected surrounding source, Markdown export, edge UI in host')
    page.locator('#readonly').check();assert page.get_by_role('button',name='末尾に行を追加').is_disabled();assert page.locator('.frb-grid-toolbar button',has_text=re.compile('^書式$')).is_disabled();assert page.evaluate('editor.getValue()')==before
    page.locator('#readonly').uncheck();page.evaluate('editor.setValue(\'```frb-table\\n{"version":1,"rows":[["<img src=x onerror=alert(1)>"]],"align":["left"]}\\n```\');editor.blur()');assert page.locator('.frb-grid-table img').count()==0 and cell(0,0).inner_text().startswith('<img')
    page.evaluate('editor.setValue(\'```frb-table\\n{"version":1,"rows":[["x"]],"align":["bad"]}\\n```\');editor.blur()');assert page.locator('.frb-grid-table').count()==0 and '"bad"' in page.evaluate('editor.getValue()');assert not errors,errors
    print('PASS: read-only, inert cell text, invalid rich blocks stay source');browser.close()
