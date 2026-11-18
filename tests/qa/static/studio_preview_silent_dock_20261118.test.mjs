import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../../NativeShell/NativeShellForm.cs', import.meta.url), 'utf8');

test('Launch-owned Studio alone starts with an invisible main window', () => {
  assert.match(source, /_useStartupSplash = sharedEnvironment == null && !deferInitialNavigation && !_launchPreview/);
  assert.match(source, /if \(_useStartupSplash \|\| _launchPreview\)\s*\{[^}]*Opacity = 0;[^}]*ShowInTaskbar = false;/s);
  assert.match(source, /private const string LaunchDockedCommand = "@FRB_LAUNCH_DOCKED@";/);
});

test('revealing is gated by private ACK and native SetParent; no focus steal', () => {
  const docked = source.match(/private string RevealLaunchPreviewAfterDock\(\)\s*\{([\s\S]*?)\n        \}/);
  assert.ok(docked);
  assert.match(docked[1], /_launchPreviewOwnerPid\.HasValue/);
  assert.match(docked[1], /WindowStyleChild/);
  assert.match(docked[1], /GetParent\(Handle\)/);
  assert.match(docked[1], /Opacity = 1;/);
  const statements = docked[1].replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(statements, /ShowInTaskbar = true|Activate\(/);
  assert.match(source, /path == LaunchDockedCommand\s*\? RevealLaunchPreviewAfterDock\(\)/);
});

test('lost handoff and independent pop-out never strand an invisible Studio', () => {
  assert.match(source, /_launchDockTimeout = new Timer \{ Interval = 45000 \}/);
  assert.match(source, /if \(!docked\) ShowInTaskbar = true;/);
  assert.match(source, /_launchReleasedFromOwner = true;\s*_launchDockTimeout\?\.Stop\(\);\s*\/\/ Pop-out[^\n]*\n\s*Opacity = 1;/);
  assert.match(source, /if \(_launchPreview\) RevealUndockedLaunchPreview\(\);/);
});
