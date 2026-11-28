"""Standalone table + Markdown integration: offline Chromium, local assets inlined."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,re
base=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1400,'height':900});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def load(path):
        html=path.read_text(encoding="utf-8")
        html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:"<style>"+(path.parent/m[1]).read_text(encoding="utf-8")+"</style>",html)
        html=re.sub(r'<script src="([^"]+)"></script>',lambda m:"<script>"+(path.parent/m[1]).read_text(encoding="utf-8").replace("</script","<\\/script")+"</script>",html)
        page.set_content(html)
    def cell(r,c):return page.locator(f'.frb-grid-table [data-row="{r}"][data-col="{c}"]')
    def paste(text):page.evaluate('''text=>{const data=new DataTransfer();data.setData('text/plain',text);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}''',text)
    def copy():return page.evaluate('''()=>{const data=new DataTransfer();document.activeElement.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain');}''')
    load(base/'experiment.html');cell(1,1).dblclick();page.locator('.frb-grid-input').fill('100 Hz');page.locator('.frb-grid-input').press('Enter');assert page.evaluate('grid.getValue().rows[1][1]')=='100 Hz'
    page.keyboard.press('Control+z');assert page.evaluate('grid.getValue().rows[1][1]')=='80 Hz';print('PASS: standalone, no Markdown or CodeMirror, edit and external undo')
    page=browser.new_page(viewport={'width':1400,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));load(base.parent/'markdown_editor'/'experiment.html');page.locator('#table').click();original=page.evaluate('editor.getValue()');
    assert page.locator('.frb-grid-table td').count()==9
    cell(1,0).click();page.keyboard.press('Shift+ArrowRight');page.keyboard.press('Shift+ArrowDown');assert page.locator('.frb-grid-selected').count()==4
    assert copy()=='周波数\t80 Hz\r\nロッド\t86ML';assert page.evaluate('editor.getValue()')==original
    paste('A\tB\r\nC\tD');page.wait_for_function('editor.getValue().includes("| A | B | 中域 |")');assert page.evaluate('changes')==1
    assert page.evaluate('editor.getValue().split("\\n").slice(-3).join("\\n")')==original.split('\n')[-3]+'\n'+original.split('\n')[-2]+'\n'+original.split('\n')[-1]
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');page.keyboard.press('Control+y');page.wait_for_function('editor.getValue().includes("| A | B | 中域 |")');page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');print('PASS: range selection, TSV copy/paste, atomic undo/redo, surrounding document')
    cell(1,1).dblclick();page.locator('.frb-grid-input').fill('A|B');page.locator('.frb-grid-input').press('Tab');page.wait_for_function('editor.getValue().includes("A\\\\|B")');assert cell(1,1).inner_text()=='A|B';assert cell(1,2).evaluate('(e)=>e.classList.contains("frb-grid-active")');page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');
    cell(1,1).dblclick();page.locator('.frb-grid-input').fill('cancel');page.keyboard.press('Escape');assert page.evaluate('editor.getValue()')==original;print('PASS: pipe escape, Tab, Escape cancellation')
    cell(1,1).click(button='right');page.get_by_role('menuitem',name='下に行を追加').click();assert page.locator('.frb-grid-table tr').count()==5
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');cell(1,1).click(button='right');page.get_by_role('menuitem',name='右に列を追加').click();assert page.locator('.frb-grid-table th').count()==4
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');cell(1,1).click(button='right');page.get_by_role('menuitem',name='中央揃え').click();assert cell(1,1).evaluate('(e)=>e.style.textAlign')=='center';page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');
    cell(1,0).click(button='right');page.get_by_role('menuitem',name='行を下へ').click();assert cell(2,0).inner_text()=='周波数';page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');
    cell(1,0).click();page.keyboard.press('Shift+ArrowRight');page.keyboard.press('Delete');assert cell(1,0).inner_text()=='' and cell(1,1).inner_text()=='';page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');print('PASS: right-click, insert rows/cols, alignment, move, clear')
    cell(3,2).click();paste('X\tY\nZ\tW');assert page.locator('.frb-grid-table tr').count()==5 and page.locator('.frb-grid-table th').count()==4;page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');print('PASS: TSV paste expands rows and columns')
    # Mouse range and structural deletion (header and last column retained).
    a=cell(1,0).bounding_box();b=cell(2,1).bounding_box();page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down();page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=5);page.mouse.up();assert page.locator('.frb-grid-selected').count()==4
    cell(1,0).click(button='right');page.get_by_role('menuitem',name='行を削除').click();assert page.locator('.frb-grid-table tr').count()==2;page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample')
    cell(1,1).click();cell(1,1).click(button='right');page.get_by_role('menuitem',name='列を削除').click();assert page.locator('.frb-grid-table th').count()==2;page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===tableSample');print('PASS: mouse range, row and column deletion')
    page.locator('#readonly').check();cell(1,1).dblclick();assert page.locator('.frb-grid-input').count()==0;page.keyboard.press('Delete');paste('bad');assert page.evaluate('editor.getValue()')==original;page.locator('#readonly').uncheck();print('PASS: read-only grid')
    cell(1,1).dblclick();page.locator('.frb-grid-input').fill('外部確定');page.locator('#theme').click();assert page.evaluate('editor.getValue().includes("外部確定")');print('PASS: blur commits')
    assert not errors,errors;browser.close()
