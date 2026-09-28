const http = require('http');
const { spawn } = require('child_process');

async function checkLoadPageJson() {
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
    await send('Page.navigate', { url: 'https://statistikinteraktiv.augsburg.de/Interaktiv/JSP/main.jsp?mode=Vergleich&area=Stadtbezirk&id=01&detailView=true' });
    await new Promise(r => setTimeout(r, 4000));

    const postRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        const r = await fetch('InnerComparison/innerComparisonLoadPage_Familienstand.jsp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'changeFamilienstand=Verheiratet'
        });
        const text = await r.text();
        return text;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Post answer:', postRes.result.value);
    ws.close();
  } finally {
    edge.kill();
  }
}

checkLoadPageJson().catch(console.error);
