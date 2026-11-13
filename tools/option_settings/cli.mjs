// Runtime adapter for a consumer that does not need the GUI.
// Example: node cli.mjs --id webview --studio-root ... --system-root ... --user-root ...
import { composeOptions } from './options_core.mjs';
const args={};
for (let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  if (!['--studio-root','--system-root','--user-root','--id'].includes(key)||!value) {
    process.stderr.write('Unexpected argument: '+key+'\n');process.exit(2);
  }
  args[key.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
}
try {
  const {effective} = await composeOptions(args);
  process.stdout.write(JSON.stringify(effective)+'\n');
}catch(err){process.stderr.write((err.code||'ERROR')+': '+err.message+'\n');process.exitCode=1;}
