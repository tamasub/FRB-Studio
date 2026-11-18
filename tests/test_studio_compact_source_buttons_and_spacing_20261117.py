"""Regression checks for compact JSON Object Studio pagebar, November 17 2026.
Run: python -m unittest discover -s tests -p 'test_studio_compact_source_buttons_and_spacing_20261117.py' -v
"""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'wwwroot' / 'index.html').read_text(encoding='utf-8-sig')
CSS = (ROOT / 'wwwroot' / 'css' / 'studio-compact-json.css').read_text(encoding='utf-8-sig')
PROFILE_JS = (ROOT / 'wwwroot' / 'js' / 'ui' / 'studio_presentation_profile.js').read_text(encoding='utf-8-sig')


class HtmlIdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])


class CompactSourceBarTests(unittest.TestCase):
    def setUp(self):
        self.bar = HTML.split('id="studioCompactSourceBar"', 1)[1].split('id="dataFile"', 1)[0]

    def test_original_controls_have_one_dom_id(self):
        parser = HtmlIdParser()
        parser.feed(HTML)
        for control in (
            'studioCompactSourceBar', 'dataNameInput', 'defNameInput',
            'openDataFolderBtn', 'clearDataNameBtn',
            'maintainViewDefBtn', 'openDefFolderBtn', 'clearDefNameBtn',
            'loadBtn', 'saveBtn',
        ):
            with self.subTest(control=control):
                self.assertEqual(1, parser.ids.count(control))

    def test_data_buttons_are_inside_input_at_right(self):
        section = self.bar.split('DATA JSON', 1)[1].split('画面定義JSON', 1)[0]
        pos = [section.index(name) for name in (
            'combo-input-wrap', 'dataNameInput', 'class="combo-input-actions"',
            'openDataFolderBtn', 'clearDataNameBtn'
        )]
        self.assertEqual(pos, sorted(pos))

    def test_viewdef_ellipsis_and_folder_buttons_are_inside_input(self):
        section = self.bar.split('画面定義JSON', 1)[1]
        pos = [section.index(name) for name in (
            'combo-input-wrap', 'defNameInput', 'class="combo-input-actions"',
            'maintainViewDefBtn', 'openDefFolderBtn', 'clearDefNameBtn'
        )]
        self.assertEqual(pos, sorted(pos))

    def test_path_fields_share_one_parent_with_two_rows(self):
        self.assertIn('class="loader-panel studio-path-layout"', self.bar)
        self.assertIn('class="studio-path-fields"', self.bar)
        self.assertEqual(self.bar.count('class="combo-field combo-field-inline has-clear"'), 2)
        self.assertIn('class="studio-source-actions"', self.bar)

    def test_icon_and_title_original_scale(self):
        self.assertRegex(CSS, r'\.frb-page-title\s*\{\s*font-size:16px')
        self.assertIn('width:24px; height:24px;',CSS)

    def test_layout_is_compact_at_native_shell_width(self):
        # The original <=980px fallback pushed Read/Save and Output into
        # separate rows, making the topbar ~150px tall at 852px.
        self.assertIn('grid-template-areas:"paths actions output"', CSS)
        self.assertIn('grid-template-rows:80px', CSS)
        self.assertIn('grid-template-columns:minmax(0, 1fr) 126px 194px', CSS)
        self.assertIn('grid-area:paths', CSS)
        self.assertIn('grid-area:actions', CSS)
        self.assertIn('grid-area:output', CSS)
        self.assertNotIn('grid-template-areas:\n      "paths"\n      "actions"\n      "output"', CSS)

    def test_two_paths_have_a_shared_rounded_border(self):
        path_rule = CSS.split('/* 2026-11-18 / source field container:', 1)[1]
        self.assertIn('.studio-path-fields {', path_rule)
        self.assertIn('border:1px solid #e0e3e4', path_rule)
        self.assertIn('border-radius:11px', path_rule)
        self.assertIn('grid-template-rows:28px 28px', path_rule)

    def test_other_actions_remain_on_the_right_and_side_by_side(self):
        self.assertIn('grid-template-areas:"paths actions output"', CSS)
        actions_rule = CSS.split('.studio-source-actions {', 1)[1].split('}', 1)[0]
        self.assertIn('display:flex', actions_rule)
        self.assertIn('flex-direction:row', actions_rule)
        output_rule = CSS.split('> .studio-output-dock .markdown-export-control {', 1)[1].split('}', 1)[0]
        self.assertIn('display:flex', output_rule)
        self.assertIn('flex-direction:row', output_rule)

    def test_presentation_profile_does_not_extract_save_button_from_actions(self):
        self.assertIn("original.querySelector('.studio-source-actions')", PROFILE_JS)
        self.assertIn('if (sourceActions) sourceActions.append(save)', PROFILE_JS)
        self.assertIn("if (save && config.savePlacement === 'heading')", PROFILE_JS)
        self.assertIn("else if (save && config.savePlacement === 'footer')", PROFILE_JS)

    def test_existing_both_modes_and_selectors_remain(self):
        self.assertIn('data-studio-shell="minimal"', CSS)
        self.assertIn('button.combo-clear-button.visible', CSS)
        self.assertIn('button.combo-folder-button:disabled', CSS)
        self.assertIn("pagebarMain.appendChild(controls)", HTML)
        self.assertIn('id="dataNameList"',HTML)
        self.assertIn('id="defNameList"',HTML)


if __name__ == '__main__':
    unittest.main()
