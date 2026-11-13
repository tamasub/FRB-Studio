import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const read=rel=>readFile(new URL(rel,root),'utf8');
test('Studio NativeShell only reads/writes canonical ViewDef on an explicitly bound Launch session',async()=>{
 const [options,program,form,dispatcher,bridge,config]=await Promise.all([
  read('NativeShell/NativeLaunchOptions.cs'),read('NativeShell/Program.cs'),read('NativeShell/NativeShellForm.cs'),
  read('NativeShell/NativeCommandDispatcher.cs'),read('wwwroot/js/core/native_host_bridge.js'),read('NativeShell/native_shell.config.json')]);
 assert.match(options,/--launch-view-def=/);
 assert.match(options,/frb_launch_data\.json/);
 assert.match(options,/frb_launch_maintenance_view_def_v0_1\.json/);
 assert.match(program,/launchViewDefPath: launchOptions\.LaunchViewDefPath/);
 assert.match(form,/_launchViewDefPath/);
 assert.match(dispatcher,/ReadLaunchViewDef/);
 assert.match(dispatcher,/WriteLaunchViewDef/);
 assert.match(bridge,/launchViewDef/);
 assert.match(bridge,/startupViewDef\.read/);
 assert.match(bridge,/startupViewDef\.write/);
 const allowed=JSON.parse(config).allowed_commands;
 assert.ok(allowed.includes('startupViewDef.read') && allowed.includes('startupViewDef.write'));
});
