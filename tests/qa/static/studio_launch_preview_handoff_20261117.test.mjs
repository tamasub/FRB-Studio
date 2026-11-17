// Launch-owned Studio session contract. Pure static test: Windows native
// integration still requires rebuilding NativeShell and running on Win11.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const opts = read('../../../NativeShell/NativeLaunchOptions.cs');
const form = read('../../../NativeShell/NativeShellForm.cs');
const dispatch = read('../../../NativeShell/NativeCommandDispatcher.cs');
const program = read('../../../NativeShell/Program.cs');
const bridge = read('../../../wwwroot/js/core/native_host_bridge.js');
const jsonGuard = read('../../../wwwroot/js/runtime/json_unsaved_guard.js');
const markdown = read('../../../wwwroot/mdViewer.html');

test('Launch-only startup flags suppress native splash and bounds restore', () => {
  assert.match(opts, /--launch-preview-pipe=/);
  assert.match(opts, /--launch-preview/);
  assert.match(program, /launchPreview: launchOptions.LaunchPreview/);
  assert.match(form, /&& !_launchPreview/);
  assert.match(form, /if \(_launchPreview\) return; \/\/ Outer Launch splitter owns all embedded geometry/);
});

test('private pipe asynchronously asks page for unsaved confirmation', () => {
  assert.match(form, /new NamedPipeServerStream\(_launchPreviewPipe/);
  assert.match(form, /await RouteLaunchPreviewSwitchAsync\(requestedPath\)/);
  assert.match(form, /FrbJsonObjectUnsavedGuard\.confirmNavigationAway/);
  assert.match(form, /confirmMarkdownNavigationAway\(\)/);
  // The shared helper returns OK/CANCEL for both document switch and Quit.
  assert.match(form, /return await guard\.Task \? "OK" : "CANCEL"/);
  assert.match(form, /if \(leave != "OK"\) return leave/);
  assert.match(form, /SwitchLaunchPreviewDocument\(full, options\.LaunchViewDefPath\)/);
});

test('saving grants switch with file and stale page writes are rejected', () => {
  assert.match(dispatch, /internal void SwitchLaunchPreviewDocument\(string path, string launchViewDefPath = null\)/);
  assert.match(dispatch, /_documentGrants\.Remove\(_startupDocumentId\)/);
  assert.match(dispatch, /STALE_STARTUP_DOCUMENT/);
  assert.match(bridge, /startupDocumentId = String\(response\.result\?\.document_id/);
  assert.match(bridge, /document_id: startupDocumentId/);
});

test('same-file reselect reloads and avoids second beforeunload prompt', () => {
  assert.match(form, /&launchSwitch=/);
  assert.match(form, /CoreWebView2\.Navigate/);
  assert.match(jsonGuard, /__frbLaunchPreviewSwitchApproved/);
  assert.match(markdown, /__frbLaunchPreviewSwitchApproved/);
});


test('menu-settings reuses the existing native process with validated context', () => {
  assert.match(form, /class LaunchPreviewSwitchRequest/);
  assert.match(form, /Deserialize<LaunchPreviewSwitchRequest>\(request\)/);
  assert.match(form, /NativeLaunchOptions\.Parse\(startup\.ToArray\(\)\)/);
  assert.match(form, /var page = options\.InitialPage/);
  assert.match(form, /_presentationReceived = false/);
  assert.match(form, /Text = "FRB Studio \/ Native Shell"/);
  assert.match(form, /_dispatcher\.SwitchLaunchPreviewDocument\(full, options\.LaunchViewDefPath\)/);
  assert.match(opts, /--launch-view-def must point to the Launch-owned canonical ViewDef/);
  assert.match(opts, /--open-json must be the canonical Launch UserData JSON/);
  assert.match(dispatch, /_launchViewDefPath = launchViewDefPath/);
  assert.match(dispatch, /_launchViewDefSha = null/);
  assert.match(form, /if \(leave != "OK"\) return leave/);
});
