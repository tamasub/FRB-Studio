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

    def test_data_buttons_in_caption_not_file_name_input(self):
        section = self.bar.split('DATA JSON', 1)[1].split('画面定義JSON', 1)[0]
        self.assertLess(section.index('openDataFolderBtn'), section.index('clearDataNameBtn'))
        self.assertLess(section.index('clearDataNameBtn'), section.index('combo-input-wrap'))
        self.assertLess(section.index('combo-input-wrap'), section.index('dataNameInput'))

    def test_viewdef_ellipsis_left_of_folder_button(self):
        section = self.bar.split('画面定義JSON', 1)[1]
        pos = [section.index(name) for name in ('maintainViewDefBtn','openDefFolderBtn','clearDefNameBtn','defNameInput')]
        self.assertEqual(pos, sorted(pos))
        self.assertIn('combo-header-actions', section)

    def test_icon_and_title_original_scale(self):
        self.assertRegex(CSS, r'\.frb-page-title\s*\{\s*font-size:16px')
        self.assertIn('width:24px; height:24px;',CSS)

    def test_filename_fields_wider_and_gap_added(self):
        self.assertIn('margin-left:20px', CSS)
        self.assertIn('flex:0 1 190px', CSS)
        self.assertIn('flex-basis:215px', CSS)
        self.assertIn('max-width:225px', CSS)
        self.assertIn('max-width:740px', CSS)

    def test_existing_both_modes_and_selectors_remain(self):
        self.assertIn('data-studio-shell="minimal"', CSS)
        self.assertIn('button.combo-clear-button.visible', CSS)
        self.assertIn('button.combo-folder-button:disabled', CSS)
        self.assertIn("pagebarMain.appendChild(controls)", HTML)
        self.assertIn('id="dataNameList"',HTML)
        self.assertIn('id="defNameList"',HTML)


if __name__ == '__main__':
    unittest.main()
