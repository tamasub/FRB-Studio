"""Optional headless Chromium smoke test (Python Playwright). No network required."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os
import re
base=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1200,'height':850})
    errors=[]; page.on('pageerror',lambda error: errors.append(str(error)))
    # Inline local assets for the browser harness; the shipped HTML keeps them separate.
    html=(base/'experiment.html').read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+ (base/m[1]).read_text(encoding='utf-8')+'</style>',html)
    html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (base/m[1]).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>',html)
    page.set_content(html)
    page.wait_for_selector('.frb-heading-1')
    assert page.evaluate('editor.getValue()===sample')
    assert page.locator('.frb-strong').first.inner_text()=='世界のために公開する。'
    assert page.locator('.frb-invisible-fence').count()==2
    assert page.locator('.frb-heading-1').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>20
    assert page.locator('.frb-fenced').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')!='rgba(0, 0, 0, 0)'
    # Actual mouse interaction and movement, not only programmatic cursor.
    page.locator('.frb-strong').first.click()
    assert page.evaluate('editor.cm.getCursor().line===5 && editor.getValue()===sample && changes===0')
    page.evaluate('editor.focus();editor.cm.setCursor({line:5,ch:12})')
    assert page.locator('.frb-syntax').count()==2
    assert page.locator('.frb-strong').first.inner_text()=='世界のために公開する。'
    page.evaluate('editor.cm.setCursor({line:18,ch:5})')
    assert page.locator('.frb-invisible-fence').count()==0
    assert page.locator('.frb-fence .frb-syntax').count()==2
    assert page.evaluate('editor.getValue()===sample && changes===0')
    print('PASS: preview, decorations, caret movement, fenced block, exact source')
    page.locator('#source').click()
    assert page.locator('.frb-heading-1').count()==0
    assert page.evaluate('editor.getValue()===sample && changes===0')
    page.locator('#live').click()
    assert page.locator('.frb-heading-1').count()==1
    page.evaluate('editor.cm.setCursor({line:4,ch:0})')
    page.keyboard.insert_text('追加')
    page.wait_for_function('editor.getValue().includes("追加普通")')
    assert page.evaluate('changes===1 && document.querySelector("#raw").value===editor.getValue()')
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===sample')
    page.keyboard.press('Control+y');page.wait_for_function('editor.getValue().includes("追加普通")')
    page.keyboard.press('Control+z');page.wait_for_function('editor.getValue()===sample')
    page.keyboard.press('Control+a')
    assert page.evaluate('editor.cm.getSelection()===sample')
    page.keyboard.press('ArrowRight')
    assert page.evaluate('editor.getValue()===sample')
    print('PASS: source mode, user input, change event, Undo/Redo, multiline selection')
    page.evaluate('editor.setValue("# abc\\r\\n**def**\\r\\n")')
    assert page.evaluate('editor.getValue()==="# abc\\r\\n**def**\\r\\n"')
    page.evaluate('editor.focus();editor.cm.setCursor({line:1,ch:3})');page.keyboard.insert_text('X')
    page.wait_for_function('editor.getValue().includes("X")')
    assert page.evaluate('editor.getValue().split("\\r\\n").length===3')
    page.locator('#readonly').check(); before=page.evaluate('editor.getValue()')
    page.evaluate('editor.focus()');page.keyboard.insert_text('BLOCKED');page.keyboard.press('Tab');page.wait_for_timeout(150)
    assert page.evaluate('editor.getValue()')==before
    page.locator('#readonly').uncheck()
    assert page.evaluate('''() => {const host=document.createElement('div');document.body.append(host);const other=new FRBMarkdownEditor({value:'別の値'});other.mount(host);const a=editor.getValue();let n=0;other.on('change',()=>n++);other.setValue('更新');const ok=other.getValue()==='更新' && editor.getValue()===a && n===0;other.destroy();const gone=host.children.length===0;host.remove();return ok&&gone;}''')
    print('PASS: CRLF, read-only, silent setValue, instance isolation, destroy')
    page.evaluate('editor.setValue(sample);changes=0;sync();editor.blur()')
    if os.environ.get('SCREENSHOT_PATH'): page.screenshot(path=os.environ['SCREENSHOT_PATH'])
    assert not errors,errors
    browser.close()
