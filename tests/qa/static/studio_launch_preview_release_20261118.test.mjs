import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../../NativeShell/NativeShellForm.cs', import.meta.url), 'utf8');

test('explicit Launch-owned Studio pop-out uses a private, ACKed release command', () => {
  assert.match(source, /private const string LaunchReleaseCommand = "@FRB_LAUNCH_RELEASE@"/);
  assert.match(source, /path == LaunchReleaseCommand/);
  assert.match(source, /_launchReleasedFromOwner = true;/);
  assert.match(source, /await writer.WriteLineAsync\(result\)/);
});

test('a released Studio will survive Launch owner exit without dirty-data disposal', () => {
  assert.match(source, /if \(_launchReleasedFromOwner\) return;/);
  assert.match(source, /if \(!_launchReleasedFromOwner\)/);
  assert.match(source, /if \(_launchReleasedFromOwner \|\| _launchOwnerExitHandling/);
  assert.doesNotMatch(source, /\.Kill\(/);
});
