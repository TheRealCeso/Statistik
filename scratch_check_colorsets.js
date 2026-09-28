const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function testAllColors() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new',
    '--remote-debugging-port=9333',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));
  const list = await new Promise(res => http.get('http://127.0.0.1:9333/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 1;
  const send = (m, p={}) => new Promise(res => {
    const cid = id++;
    const h = e => { const d = JSON.parse(e.data); if (d.id === cid) { ws.removeEventListener('message', h); res(d.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: cid, method: m, params: p }));
  });
  await send('Page.enable');
  const files = fs.readdirSync('img/legend/Stadtbezirk');
  const colorSets = new Set();
  for (const f of files) {
    const b64 = fs.readFileSync('img/legend/Stadtbezirk/' + f).toString('base64');
    const res = await send('Runtime.evaluate', {
      expression: `(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${b64}';
        await new Promise(r => img.onload = r);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const cols = [];
        for (let row = 0; row < 10; row++) {
          const px = ctx.getImageData(4, row * 25 + 12, 1, 1).data;
          cols.push('#' + [px[0], px[1], px[2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase());
        }
        return cols.join(',');
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    colorSets.add(res.result.value);
  }
  console.log('Unique color sets across all 51 images:', Array.from(colorSets));
  ws.close();
  edge.kill();
}
testAllColors().catch(console.error);
