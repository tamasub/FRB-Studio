// A small loopback-only host for the ONE generic ViewDef editor. No external network binding.
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { optionsCatalog,composeOptions,saveOptions } from './options_core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(here, '../../components/generic_editor');
// Keep the existing browser URLs; only the physical asset ownership changes.
const staticFiles = new Map([
  ['/', path.join(here, 'web', 'index.html')],
  ['/index.html', path.join(here, 'web', 'index.html')],
  ...['editor.js','editor.css','field_contract.mjs'].map(name => ['/'+name, path.join(editorRoot, name)]),
]);
const opts = {};
for (let i=2;i<process.argv.length;i+=2) {
  const key=process.argv[i],value=process.argv[i+1];
  if (!['--studio-root','--system-root','--user-root'].includes(key) || !value) throw new Error('Bad argument: '+key);
  opts[key.slice(2).replace(/-/g,'')] = path.resolve(value);
}
const coreArgs={studioRoot:opts.studioroot,systemRoot:opts.systemroot,userRoot:opts.userroot};
if (!Object.values(coreArgs).every(Boolean)) throw new Error('Usage: server.mjs --studio-root <dir> --system-root <dir> --user-root <dir>');
const token=randomBytes(24).toString('hex');
const json=(res,status,body)=>{
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':bytes.length});
  res.end(bytes);
};
const sendError=(res,error)=>json(res,error?.code==='STALE_REVISION'?409:400,{error:error?.code||'ERROR',message:String(error?.message||error)});
const server=http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'");
  try {
    const u=new URL(req.url,'http://localhost');
    // Host checks protect against DNS rebinding; a per-session token protects
    // every JSON API against local cross-origin websites and other processes.
    const host=String(req.headers.host||'').split(':')[0].toLowerCase();
    if (!['127.0.0.1','localhost'].includes(host)) return json(res,403,{error:'HOST_DENIED'});
    if (req.method==='GET' && staticFiles.has(u.pathname)) {
      const asset=staticFiles.get(u.pathname);
      const name=path.basename(asset);
      const content=await readFile(asset);
      const kind=(/\.m?js$/.test(name))?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
      res.writeHead(200,{'Content-Type':kind+'; charset=utf-8','Cache-Control':'no-store'});res.end(content);return;
    }
    if (req.headers['x-frb-option-token']!==token) return json(res,403,{error:'TOKEN_DENIED'});
    if (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return json(res,403,{error:'ORIGIN_DENIED'});
    if (req.method==='GET' && u.pathname==='/api/options') return json(res,200,await optionsCatalog(coreArgs));
    if (req.method==='GET' && u.pathname==='/api/compose') {
      const {id,caption,viewDef,edited,revision}=await composeOptions({...coreArgs,id:u.searchParams.get('id')});
      return json(res,200,{id,caption,viewDef,edited,revision});
    }
    if (req.method==='POST' && u.pathname==='/api/save') {
      if (!String(req.headers['content-type']||'').startsWith('application/json')) return json(res,415,{error:'CONTENT_TYPE'});
      let raw='';
      for await (const chunk of req) {
        raw+=chunk.toString('utf8');
        if (Buffer.byteLength(raw)>256*1024) return json(res,413,{error:'TOO_LARGE'});
      }
      const body=JSON.parse(raw);
      const {id,caption,viewDef,edited,revision}=await saveOptions({...coreArgs,id:u.searchParams.get('id')},body);
      return json(res,200,{id,caption,viewDef,edited,revision});
    }
    json(res,404,{error:'NOT_FOUND'});
  }catch(err){sendError(res,err);}
});
server.listen(0,'127.0.0.1',()=>{
  process.stdout.write(JSON.stringify({port:server.address().port,token})+'\n');
});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
