import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const options = read('../../../NativeShell/NativeLaunchOptions.cs');
const program = read('../../../NativeShell/Program.cs');
const form = read('../../../NativeShell/NativeShellForm.cs');

test('owner PID is accepted only for a Launch preview with a private pipe', () => {
  assert.match(options, /--launch-preview-owner-pid=/);
  assert.match(options, /options.LaunchPreviewOwnerPid.HasValue && \(!options.LaunchPreview \|\| options.LaunchPreviewPipe == null\)/);
  assert.match(program, /launchPreviewOwnerPid: launchOptions.LaunchPreviewOwnerPid/);
});
test('owner process HANDLE is waited; no global process enumeration', () => {
  assert.match(form, /using \(var owner = Process.GetProcessById\(_launchPreviewOwnerPid.Value\)\)/);
  assert.match(form, /owner.WaitForExit\(\)/);
  assert.match(form, /ownerExited = true/);
  assert.doesNotMatch(form, /Process.GetProcessesByName/);
  assert.doesNotMatch(form, /\.Kill\(/);
});
test('abnormal owner exit uses independent UI context and preserves dirty/unknown', () => {
  assert.match(form, /_launchOwnerUiContext = System.Threading.SynchronizationContext.Current/);
  assert.match(form, /ui.Post\(_ =>/);
  assert.match(form, /ExposeOrphanedLaunchStudio\(\)/);
  assert.match(form, /SetParent\(window, IntPtr.Zero\)/);
  assert.match(form, /ProbeLaunchPreviewDirtyAsync\(\)/);
  assert.match(form, /if \(dirty == false && !IsDisposed && !Disposing\)/);
  assert.match(form, /"DIRTY_PRESERVED" : "UNKNOWN_PRESERVED"/);
  assert.doesNotMatch(form, /if \(!ownerExited \|\| IsDisposed \|\| Disposing \|\| !IsHandleCreated\) return/);
});
test('owner exit records a trace and does not prompt for 90 seconds', () => {
  assert.match(form, /launch_owner_watch\.log/);
  assert.match(form, /OWNER_EXIT_DETECTED/);
  assert.match(form, /Task.Delay\(2500\)/);
  const block = form.split('private async Task OnLaunchOwnerExitedAsync()')[1].split('private async Task<string> SwitchLaunchPreviewDocumentAsync')[0];
  assert.doesNotMatch(block, /ConfirmLaunchPreviewLeaveAsync/);
});
test('normal Launch Quit ACKs first and closes only on accepted guard', () => {
  assert.match(form, /private const string LaunchCloseCommand = "@FRB_LAUNCH_CLOSE@"/);
  assert.match(form, /await writer.WriteLineAsync\(result\)/);
  assert.match(form, /if \(requestedPath == LaunchCloseCommand && result == "OK" && !IsDisposed\)/);
  assert.match(form, /\? await ConfirmLaunchPreviewLeaveAsync\(\)/);
});
