const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function extractAllMinMax() {
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
    const files = fs.readdirSync('img/legend/Stadtbezirk');
    const b64Map = {};
    for (const f of files) {
      b64Map[f.replace('.png', '')] = fs.readFileSync('img/legend/Stadtbezirk/' + f).toString('base64');
    }

    const script = `(async () => {
      const b64Map = ${JSON.stringify(b64Map)};

      async function loadCanvas(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await new Promise(r => img.onload = r);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { c, ctx, w: img.width, h: img.height };
      }

      function isBlack(ctx, x, y) {
        const p = ctx.getImageData(x, y, 1, 1).data;
        return (p[0] < 80 && p[1] < 80 && p[2] < 80) ? 1 : 0;
      }

      function getLineTokens(ctx, y0, y1) {
        // Group columns of black pixels into character slices
        const slices = [];
        let inChar = false;
        let startX = 0;
        for (let x = 12; x < 138; x++) {
          let hasB = false;
          for (let y = y0; y <= y1; y++) {
            if (isBlack(ctx, x, y)) { hasB = true; break; }
          }
          if (hasB && !inChar) { inChar = true; startX = x; }
          else if (!hasB && inChar) {
            inChar = false;
            slices.push({ x0: startX, x1: x - 1, w: x - startX, gap: 0 });
          }
        }
        for (let i = 1; i < slices.length; i++) {
          slices[i].gap = slices[i].x0 - slices[i-1].x1;
        }
        return slices;
      }

      // Check bottom text (e.g. at y=260..280)
      function getBottomText(ctx) {
        // Just check if it's 'Personen in %' or other
        let blackCount = 0;
        for (let y = 255; y < 290; y++) {
          for (let x = 0; x < 140; x++) {
            if (isBlack(ctx, x, y)) blackCount++;
          }
        }
        return blackCount > 0;
      }

      const info = {};
      for (const [name, b64] of Object.entries(b64Map)) {
        const img = await loadCanvas(b64);
        const row0 = getLineTokens(img.ctx, 0, 24);
        const row9 = getLineTokens(img.ctx, 225, 249);
        info[name] = {
          row0Slices: row0.length,
          row9Slices: row9.length,
          hasBottomText: getBottomText(img.ctx)
        };
      }
      return info;
    })()`;

    const evalRes = await send('Runtime.evaluate', {
      expression: script,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Result sample:', Object.entries(evalRes.result.value).slice(0, 10));
    ws.close();
  } finally {
    edge.kill();
  }
}

extractAllMinMax().catch(console.error);
