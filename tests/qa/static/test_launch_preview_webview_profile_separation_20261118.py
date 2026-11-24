"""Portable static regression for NativeShell WebView2 profile isolation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_launch_owned_profile_cannot_lock_standalone_profile():
    source = (ROOT / 'NativeShell' / 'NativeShellForm.cs').read_text(encoding='utf-8')
    assert 'ResolveWebView2ProfileName(_launchPreview, _launchPreviewPipe)' in source
    assert 'CoreWebView2Environment.CreateAsync(null, userDataFolder)' in source
    assert '_launchReleasedFromOwner = true;' in source
