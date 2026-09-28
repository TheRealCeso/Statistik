const http = require('http');
const { spawn } = require('child_process');

async function inspectLegendPng() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new',
    '--remote-debugging-port=9333',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1200));
    const list = await new Promise((res, rej) => http.get('http://127.0.0.1:9333/json/list', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej));

    const page = list.find(x => x.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let id = 1;
    const send = (m, p = {}) => new Promise((res, rej) => {
      const cid = id++;
      const h = e => {
        const d = JSON.parse(e.data);
        if (d.id === cid) {
          ws.removeEventListener('message', h);
          if (d.error) rej(d.error);
          else res(d.result);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: cid, method: m, params: p }));
    });

    await send('Page.enable');
    const fs = require('fs');
    const b64 = fs.readFileSync('img/legend/Stadtbezirk/GermansWithoutMigration.png').toString('base64');

    const evalRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${b64}';
        await new Promise(r => img.onload = r);

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const swatches = [];
        let lastHex = null;
        let startY = 0;
        for (let y = 0; y < 270; y++) {
          const px = ctx.getImageData(4, y, 1, 1).data;
          const hex = '#' + [px[0], px[1], px[2]].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
          if (hex !== lastHex) {
            if (lastHex && lastHex !== '#FFFFFF' && lastHex !== '#F0F6FA') {
              swatches.push({ hex: lastHex, startY, endY: y - 1, h: y - startY });
            }
            lastHex = hex;
            startY = y;
          }
        }
        return swatches;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Swatches:', JSON.stringify(evalRes.result.value, null, 2));
    ws.close();
  } finally {
    edge.kill();
  }
}

inspectLegendPng().catch(console.error);
