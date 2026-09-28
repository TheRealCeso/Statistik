const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function testOCR() {
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

    const ocrScript = `(async () => {
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

      // Read a character at (x0, y0, w, h) as a binary string
      function getCharGrid(ctx, x0, y0, x1, y1) {
        let grid = '';
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            grid += (p[0] < 50 && p[1] < 50 && p[2] < 50) ? '1' : '0';
          }
        }
        return grid;
      }

      // Crop leading/trailing empty rows/cols
      function cropChar(ctx, x0, y0, x1, y1) {
        let minX = x1, maxX = x0, minY = y1, maxY = y0;
        let found = false;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            if (p[0] < 50 && p[1] < 50 && p[2] < 50) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) return null;
        let bits = '';
        const w = maxX - minX + 1, h = maxY - minY + 1;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            bits += (p[0] < 50 && p[1] < 50 && p[2] < 50) ? '1' : '0';
          }
        }
        return { w, h, bits };
      }

      // Segment line into characters
      function segmentLine(ctx, y0, y1) {
        const chars = [];
        let inChar = false;
        let startX = 0;
        for (let x = 15; x < 135; x++) {
          let hasB = false;
          for (let y = y0; y <= y1; y++) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            if (p[0] < 50 && p[1] < 50 && p[2] < 50) { hasB = true; break; }
          }
          if (hasB && !inChar) { inChar = true; startX = x; }
          else if (!hasB && inChar) {
            inChar = false;
            const c = cropChar(ctx, startX, y0, x - 1, y1);
            if (c) chars.push(c);
          }
        }
        return chars;
      }

      // We have ground truth for GermansWithoutMigration:
      // Line 0: 80.5 bis <= 87.0
      // Line 1: 74.0 bis < 80.5
      // Line 2: 67.5 bis < 74.0
      // Line 3: 61.0 bis < 67.5
      // Line 4: 54.5 bis < 61.0
      // Line 5: 48.0 bis < 54.5
      // Line 6: 41.5 bis < 48.0
      // Line 7: 35.0 bis < 41.5
      // Line 8: 28.5 bis < 35.0
      // Line 9: 22.0 bis < 28.5
      // And GermansWithMigration:
      // Line 9: 9.0 bis < 13.1
      // Line 8: 13.1 bis < 17.2

      const img1 = await loadCanvas(b64Map['GermansWithoutMigration']);
      const img2 = await loadCanvas(b64Map['GermansWithMigration']);

      // Let's build a template dictionary: key = bits, value = char
      const dict = {};

      function learn(img, lineIdx, charList) {
        const y0 = lineIdx * 25, y1 = y0 + 24;
        const segs = segmentLine(img.ctx, y0, y1);
        // charList is array of expected tokens or characters
        // Note: 'bis' might be segmented as 'b', 'i', 's'
        let tokenIdx = 0;
        for (let i = 0; i < segs.length && tokenIdx < charList.length; i++) {
          const expected = charList[tokenIdx++];
          dict[segs[i].w + 'x' + segs[i].h + ':' + segs[i].bits] = expected;
        }
      }

      // Line 9: ['2', '2', '.', '0', 'b', 'i', 's', '<', '2', '8', '.', '5']
      learn(img1, 9, ['2', '2', '.', '0', 'b', 'i', 's', '<', '2', '8', '.', '5']);
      // Line 8: ['2', '8', '.', '5', 'b', 'i', 's', '<', '3', '5', '.', '0']
      learn(img1, 8, ['2', '8', '.', '5', 'b', 'i', 's', '<', '3', '5', '.', '0']);
      // Line 7: ['3', '5', '.', '0', 'b', 'i', 's', '<', '4', '1', '.', '5']
      learn(img1, 7, ['3', '5', '.', '0', 'b', 'i', 's', '<', '4', '1', '.', '5']);
      // Line 6: ['4', '1', '.', '5', 'b', 'i', 's', '<', '4', '8', '.', '0']
      learn(img1, 6, ['4', '1', '.', '5', 'b', 'i', 's', '<', '4', '8', '.', '0']);
      // Line 5: ['4', '8', '.', '0', 'b', 'i', 's', '<', '5', '4', '.', '5']
      learn(img1, 5, ['4', '8', '.', '0', 'b', 'i', 's', '<', '5', '4', '.', '5']);
      // Line 4: ['5', '4', '.', '5', 'b', 'i', 's', '<', '6', '1', '.', '0']
      learn(img1, 4, ['5', '4', '.', '5', 'b', 'i', 's', '<', '6', '1', '.', '0']);
      // Line 3: ['6', '1', '.', '0', 'b', 'i', 's', '<', '6', '7', '.', '5']
      learn(img1, 3, ['6', '1', '.', '0', 'b', 'i', 's', '<', '6', '7', '.', '5']);
      // Line 2: ['6', '7', '.', '5', 'b', 'i', 's', '<', '7', '4', '.', '0']
      learn(img1, 2, ['6', '7', '.', '5', 'b', 'i', 's', '<', '7', '4', '.', '0']);
      // Line 1: ['7', '4', '.', '0', 'b', 'i', 's', '<', '8', '0', '.', '5']
      learn(img1, 1, ['7', '4', '.', '0', 'b', 'i', 's', '<', '8', '0', '.', '5']);
      // Line 0: ['8', '0', '.', '5', 'b', 'i', 's', '≤', '8', '7', '.', '0']
      learn(img1, 0, ['8', '0', '.', '5', 'b', 'i', 's', '≤', '8', '7', '.', '0']);

      // From img2: Line 9 is 9.0 bis < 13.1
      learn(img2, 9, ['9', '.', '0', 'b', 'i', 's', '<', '1', '3', '.', '1']);

      // Now OCR a whole image and extract swatch colors
      function ocrImage(img) {
        const lines = [];
        for (let row = 0; row < 10; row++) {
          const y0 = row * 25, y1 = y0 + 24;
          // Swatch color at (x=4, y=y0+12)
          const px = img.ctx.getImageData(4, y0 + 12, 1, 1).data;
          const color = '#' + [px[0], px[1], px[2]].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();

          const segs = segmentLine(img.ctx, y0, y1);
          let str = '';
          for (const s of segs) {
            const key = s.w + 'x' + s.h + ':' + s.bits;
            if (dict[key]) str += dict[key];
            else str += '?[' + s.w + 'x' + s.h + ']';
          }
          lines.push({ row, color, text: str });
        }
        return lines;
      }

      // Test on GermansWithMigration
      const testRes = ocrImage(img2);
      return { dictSize: Object.keys(dict).length, testRes };
    })()`;

    const evalRes = await send('Runtime.evaluate', {
      expression: ocrScript,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Result:', JSON.stringify(evalRes.result.value, null, 2));
    ws.close();
  } finally {
    edge.kill();
  }
}

testOCR().catch(console.error);
