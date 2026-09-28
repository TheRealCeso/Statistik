const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

async function ocrAllLegends() {
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

      function cropChar(ctx, x0, y0, x1, y1) {
        let minX = x1, maxX = x0, minY = y1, maxY = y0;
        let found = false;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (isBlack(ctx, x, y)) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) return null;
        const w = maxX - minX + 1, h = maxY - minY + 1;
        const grid = [];
        for (let y = minY; y <= maxY; y++) {
          const row = [];
          for (let x = minX; x <= maxX; x++) {
            row.push(isBlack(ctx, x, y));
          }
          grid.push(row);
        }
        return { w, h, grid, minX, maxX, minY, maxY };
      }

      function segmentLine(ctx, y0, y1) {
        const chars = [];
        let inChar = false;
        let startX = 0;
        for (let x = 12; x < 135; x++) {
          let hasB = false;
          for (let y = y0; y <= y1; y++) {
            if (isBlack(ctx, x, y)) { hasB = true; break; }
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

      // Train digit templates from known ground truth
      const templates = {};
      function addTemplate(char, cObj) {
        if (!templates[char]) templates[char] = [];
        templates[char].push(cObj);
      }

      const img1 = await loadCanvas(b64Map['GermansWithoutMigration']);
      const img2 = await loadCanvas(b64Map['GermansWithMigration']);

      function train(img, row, expectedTokens) {
        const y0 = row * 25, y1 = y0 + 24;
        const segs = segmentLine(img.ctx, y0, y1);
        for (let i = 0; i < Math.min(segs.length, expectedTokens.length); i++) {
          if (expectedTokens[i]) addTemplate(expectedTokens[i], segs[i]);
        }
      }

      // GermansWithoutMigration ground truth:
      train(img1, 9, ['2', '2', '.', '0', 'b', 'i', 's', '<', '2', '8', '.', '5']);
      train(img1, 8, ['2', '8', '.', '5', 'b', 'i', 's', '<', '3', '5', '.', '0']);
      train(img1, 7, ['3', '5', '.', '0', 'b', 'i', 's', '<', '4', '1', '.', '5']);
      train(img1, 6, ['4', '1', '.', '5', 'b', 'i', 's', '<', '4', '8', '.', '0']);
      train(img1, 5, ['4', '8', '.', '0', 'b', 'i', 's', '<', '5', '4', '.', '5']);
      train(img1, 4, ['5', '4', '.', '5', 'b', 'i', 's', '<', '6', '1', '.', '0']);
      train(img1, 3, ['6', '1', '.', '0', 'b', 'i', 's', '<', '6', '7', '.', '5']);
      train(img1, 2, ['6', '7', '.', '5', 'b', 'i', 's', '<', '7', '4', '.', '0']);
      train(img1, 1, ['7', '4', '.', '0', 'b', 'i', 's', '<', '8', '0', '.', '5']);
      train(img1, 0, ['8', '0', '.', '5', 'b', 'i', 's', '≤', '8', '7', '.', '0']);
      // GermansWithMigration:
      train(img2, 9, ['9', '.', '0', 'b', 'i', 's', '<', '1', '3', '.', '1']);

      function matchChar(cObj) {
        let bestChar = '?';
        let bestScore = -Infinity;

        for (const [ch, tList] of Object.entries(templates)) {
          for (const t of tList) {
            if (Math.abs(t.w - cObj.w) > 1 || Math.abs(t.h - cObj.h) > 1) continue;
            // Compare overlapping bounding boxes
            let matches = 0, total = 0;
            const maxW = Math.max(t.w, cObj.w), maxH = Math.max(t.h, cObj.h);
            for (let y = 0; y < maxH; y++) {
              for (let x = 0; x < maxW; x++) {
                const b1 = (t.grid[y] && t.grid[y][x]) || 0;
                const b2 = (cObj.grid[y] && cObj.grid[y][x]) || 0;
                if (b1 === b2) matches++;
                total++;
              }
            }
            const score = matches / total;
            if (score > bestScore) {
              bestScore = score;
              bestChar = ch;
            }
          }
        }
        return bestScore > 0.85 ? bestChar : '?';
      }

      function readLine(ctx, y0, y1) {
        const segs = segmentLine(ctx, y0, y1);
        return segs.map(s => matchChar(s)).join('');
      }

      // Test reading all 51 images
      const results = {};
      for (const [name, b64] of Object.entries(b64Map)) {
        const img = await loadCanvas(b64);
        const rows = [];
        for (let r = 0; r < 10; r++) {
          const str = readLine(img.ctx, r * 25, r * 25 + 24);
          rows.push(str);
        }
        results[name] = rows;
      }
      return results;
    })()`;

    const evalRes = await send('Runtime.evaluate', {
      expression: script,
      awaitPromise: true,
      returnByValue: true
    });

    fs.writeFileSync('scratch_ocr_results.json', JSON.stringify(evalRes.result.value, null, 2));
    console.log('Saved scratch_ocr_results.json. Sample:');
    const sample = evalRes.result.value;
    console.log('Foreigners:', sample.Foreigners);
    console.log('Verheiratet:', sample.Verheiratet);
    console.log('Durchschnittsalter:', sample.Durchschnittsalter);

    ws.close();
  } finally {
    edge.kill();
  }
}

ocrAllLegends().catch(console.error);
