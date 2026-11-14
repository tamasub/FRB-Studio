import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=new URL('../../NativeShell/NativeLaunchOptions.cs',import.meta.url);
test('Studio binds Launch-owned ViewDef to canonical AppData UserData with explicit Launch home',async()=>{
  const text=await readFile(source,'utf8');
  assert.match(text,/--launch-home=/);
  assert.match(text,/LocalApplicationData/);
  assert.match(text,/"FRBLaunch", "UserData", "frb_launch_data\.json"/);
  assert.match(text,/"defs", "launch", "frb_launch_maintenance_view_def_v0_1\.json"/);
  assert.match(text,/--open-json must be the canonical Launch UserData JSON/);
  assert.match(text,/AppData Launch editing requires --launch-home/);
});
