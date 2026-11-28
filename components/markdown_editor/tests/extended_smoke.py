"""Source preservation and visible interactions, offline Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,re
base=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1250,'height':950}); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    html=(base/'experiment.html').read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+ (base/m[1]).read_text(encoding='utf-8')+'</style>',html)
    html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (base/m[1]).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>',html)
    page.set_content(html)
    page.locator('#qiita').click(); assert page.evaluate('editor.getValue()===qiitaSample&&changes===0')
    # Force lines into viewport (CodeMirror normally virtualizes them).
    page.evaluate('editor.cm.setOption("viewportMargin",Infinity)')
    assert page.locator('.frb-strike').all_text_contents()==['打ち消し']
    assert 'line-through' in page.locator('.frb-strike').evaluate('(e)=>getComputedStyle(e).textDecorationLine')
    assert page.locator('.frb-strong').all_text_contents()==['太字','太字']
    assert page.locator('.frb-em').all_text_contents()==['italic type','斜体']
    assert page.locator('.frb-color-swatch').count()==5
    assert page.locator('.frb-link').all_text_contents()==['リンクテキスト','Qiita']
    assert page.locator('.frb-rule').count()==5
    assert page.locator('.frb-note-info').count()==4
    assert page.locator('.frb-note-warn').count()==4
    assert page.locator('.frb-note-alert').count()==4
    assert page.locator('.frb-table th').count()==3
    assert page.locator('.frb-table td').count()==9
    assert page.locator('.frb-table td').all_text_contents()[-2]=='A|B'
    assert page.locator('.frb-task').count()==2
    assert page.evaluate('editor.getValue()===qiitaSample && changes===0')
    print('PASS: Qiita sample, emphasis, strikethrough, color swatches, links, rules, notes, table rendering, exact original')
    page.locator('.frb-task').first.click()
    page.wait_for_function('editor.getValue()===qiitaSample.replace("- [ ] タスク1","- [x] タスク1")')
    assert page.evaluate('changes===1')
    page.evaluate('editor.focus()');page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===qiitaSample')
    page.evaluate('editor.blur()')
    page.locator('#readonly').check();assert page.locator('.frb-task').first.is_disabled()
    page.locator('#readonly').uncheck()
    print('PASS: task checkbox click, one change, undo, read-only')
    cell=page.locator('.frb-table td',has_text='80 Hz')
    cell.dblclick();field=page.locator('.frb-grid-input');field.fill('X80 Hz');field.press('Enter')
    page.wait_for_function('editor.getValue().includes("X80 Hz")')
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===qiitaSample')
    page.locator('.frb-grid-toolbar button',has_text='原文').click()
    assert page.locator('.frb-table-source').count()==5
    assert page.evaluate('editor.getValue()===qiitaSample')
    page.evaluate('editor.blur()')
    assert page.locator('.frb-table td',has_text='80 Hz').count()==1
    print('PASS: table direct cell editing, undo, explicit source access, preview restoration')
    assert page.locator('.frb-html-preview details').count()==2
    assert page.locator('.frb-html-preview details').first.evaluate('(e)=>e.open')==False
    assert page.locator('.frb-html-preview details').last.evaluate('(e)=>e.open')==True
    page.locator('.frb-html-preview summary').first.click()
    assert page.locator('.frb-html-preview details').first.evaluate('(e)=>e.open')==True
    assert page.evaluate('editor.getValue()===qiitaSample')
    assert page.locator('.frb-html-preview dl').count()==2
    assert page.locator('.frb-html-preview dl strong').inner_text()=='赤い'
    page.locator('.frb-html-preview .frb-block-edit').first.click()
    assert page.evaluate('editor.cm.getLine(editor.cm.getCursor().line).startsWith("<details>")')
    assert page.evaluate('editor.getValue()===qiitaSample')
    page.evaluate('editor.blur()')
    assert page.locator('.frb-html-preview details').first.evaluate('(e)=>e.open')==True
    print('PASS: safe details and definition list preview, toggle, source access, original unchanged')
    # Literal HTML, escaped markers and fenced syntax remain inert.
    page.evaluate('''editor.setValue('<img src=x onerror="window.injected=1">\\n3\\\\. リスト\\n\\\\*literal*\\n```mermaid\\nA[**literal**] --> B\\n```');editor.blur()''')
    assert page.locator('.frb-markdown-editor img').count()==0
    assert page.evaluate('window.injected===undefined')
    assert page.locator('.frb-strong').count()==0
    assert page.locator('.frb-em').count()==0
    assert page.locator('.frb-fenced').count()==3
    print('PASS: HTML inert, escaped syntax, Mermaid source retained')
    assert not errors,errors
    browser.close()
