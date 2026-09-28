const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('Fehlgeschlagene Textabfragen können erneut geladen werden', async () => {
  let attempts = 0;
  const context = vm.createContext({ fetch: async () => { if (++attempts === 1) throw Error('offline'); return { ok: true, text: async () => 'OK' }; } });
  vm.runInContext(source.slice(source.indexOf('  const cache ='), source.indexOf('  function h(')), context);
  await assert.rejects(context.getText('test'));
  assert.equal(await context.getText('test'), 'OK');
  assert.equal(attempts, 2);
});

for (const [name, end] of [['renderSelect','bindMapHover'], ['renderDetail','renderZeitreihe'], ['renderZeitreihe',null], ['renderVergleich',null]]) {
  for (const fail of [false,true]) test(`${name}: veraltete ${fail ? 'Fehler' : 'Antworten'} überschreiben keine neue Ansicht`, async () => {
    let resolve, reject;
    const pending = new Promise((yes,no) => { resolve=yes; reject=no; });
    const target = { innerHTML: '' };
    const context = vm.createContext({ renderVersion: 1, state: {area:'Stadtbezirk',id:'01',year:2025},
      A:{areas:{Stadtbezirk:[]},menu:{},years:[2025],headerLinks:{}},
      $:()=>target, tabs:()=>[], resolveTab:()=>({tab:{label:'Test'},page:'Test'}),
      h:(s,...v)=>s.reduce((out,p,i)=>out+p+(v[i]??''),''),esc:String,href:()=>'',mapSvg:()=>'',
      bindTabs:()=>{},bindMapHover:()=>{},setFooter:()=>{},bindSide:()=>{},sideHtml:()=>'',
      tabsHtml:()=>'',areaOf:()=>({id:'01',name:'Test'}),typeSingular:()=>'',areaLabel:()=>'',themeKeyFor:()=>'',
      getJSON:()=>pending });
    const start = source.indexOf(`  async function ${name}(`);
    const stop = name === 'renderZeitreihe' ? source.indexOf('  // ------------------------------------------------------------------ Ansicht: Innerstädtischer',start)
      : name === 'renderVergleich' ? source.indexOf('  // ------------------------------------------------------------------ Modale',start)
      : source.indexOf(`  ${end==='renderZeitreihe'?'async ':''}function ${end}(`,start);
    vm.runInContext(source.slice(start,stop),context);
    const work=context[name]();
    context.renderVersion=2; target.innerHTML='Neue Ansicht';
    if(fail)reject(Error('offline'));else resolve({});
    await work;
    assert.equal(target.innerHTML,'Neue Ansicht');
  });
}

test('Server: ungültige URLs, Verzeichnisgrenze und ETag-Vorrang', async () => {
  const server=spawn(process.execPath,[path.join(root,'serve.js'),'0'],{windowsHide:true});
  try {
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Serverstart fehlgeschlagen')),5000);
      server.once('error',reject);
      server.stdout.on('data',data=>{const m=String(data).match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
    });
    const request=(url,headers={})=>new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port,path:url,headers},res=>{res.resume();res.on('end',()=>resolve(res));}).on('error',reject);
    });
    assert.equal((await request('/%ZZ')).statusCode,400);
    assert.equal((await request('/%00')).statusCode,400);
    assert.equal((await request('/..%2f'+path.basename(root)+'-other/file')).statusCode,403);
    const initial=await request('/index.html');
    assert.equal(initial.statusCode,200);
    assert.equal((await request('/index.html',{'If-None-Match':initial.headers.etag})).statusCode,304);
    assert.equal((await request('/index.html',{'If-None-Match':'"old-version"','If-Modified-Since':initial.headers['last-modified']})).statusCode,200);
  } finally {server.kill();}
});
