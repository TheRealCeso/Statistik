const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function extractCharacterTemplates() {
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
    const b64_1 = fs.readFileSync('img/legend/Stadtbezirk/GermansWithoutMigration.png').toString('base64');
    const b64_2 = fs.readFileSync('img/legend/Stadtbezirk/GermansWithMigration.png').toString('base64');

    const evalRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        async function loadImg(b64) {
          const img = new Image();
          img.src = 'data:image/png;base64,' + b64;
          await new Promise(r => img.onload = r);
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          return { img, c, ctx };
        }

        const i1 = await loadImg('${b64_1}');
        // Let's examine line 9 in i1: '22.0 bis < 28.5'
        // Let's find black pixels in y: 225..249, x: 10..140
        const chars = [];
        const y0 = 225, y1 = 250;
        let inChar = false;
        let charStart = 0;
        const colHasBlack = [];
        for (let x = 10; x < 135; x++) {
          let hasB = false;
          for (let y = y0; y < y1; y++) {
            const px = i1.ctx.getImageData(x, y, 1, 1).data;
            if (px[0] < 50 && px[1] < 50 && px[2] < 50) { hasB = true; break; }
          }
          colHasBlack[x] = hasB;
          if (hasB && !inChar) { inChar = true; charStart = x; }
          else if (!hasB && inChar) { inChar = false; chars.push({ x0: charStart, x1: x - 1, w: x - charStart }); }
        }

        return { chars };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Result:', JSON.stringify(evalRes.result.value, null, 2));
    ws.close();
  } finally {
    edge.kill();
  }
}

extractCharacterTemplates().catch(console.error);
