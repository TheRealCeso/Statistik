// Browserprüfung: Alle Diagrammbeschriftungen müssen innerhalb der SVG-Fläche liegen.
// Aufruf unter Windows: node tools/test-chart-layout.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const functions = app.slice(app.indexOf('  function axisTicks('), app.indexOf('  // ------------------------------------------------------------------ Diagramm-Ableitung'));
const nice = app.slice(app.indexOf('  function nice('), app.indexOf('  // Aktuelle Darstellungseinstellung'));
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/vergleich/Stadtbezirk/2025.json')));
const items = data.themes.Migration.merkmale.GermansWithMigration.areas.map(a => ({ label: a.name, value: 30 }));

async function run() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-layout-'));
  const browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--remote-debugging-port=0', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const finish = value => { clearTimeout(timer); clearInterval(poll); resolve(value); };
      const timer = setTimeout(() => { clearInterval(poll); reject(new Error('Browserstart: Zeitlimit')); }, 15000);
      const poll = setInterval(() => {
        const file = path.join(profile, 'DevToolsActivePort');
        if (fs.existsSync(file)) {
          const [port, endpointPath] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
          if (port && endpointPath) finish(`ws://127.0.0.1:${port}${endpointPath}`);
        }
      }, 100);
      let output = '';
      browser.on('error', reject);
      browser.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) finish(match[1]);
      });
    });
    const port = new URL(endpoint).port;
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
    let serial = 0;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const listener = event => {
        const result = JSON.parse(event.data);
        if (result.id !== id) return;
        ws.removeEventListener('message', listener);
        if (result.error) reject(new Error(result.error.message)); else resolve(result.result);
      };
      ws.addEventListener('message', listener);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const expression = `(() => {
      document.head.innerHTML = '<style>' + ${JSON.stringify(css)} + '</style>';
      const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const fmt = (v, d = 0) => v.toLocaleString('de-DE', {minimumFractionDigits:d,maximumFractionDigits:d});
      const legendHtml = () => '';
      const DASHES = ['', '7 3'], COLOR_AREA = '#01604B';
      ${nice}
      ${functions}
      const long = 'Haunstetten West & 12 Siebenbrunn – besonders lange Gebietsbezeichnung';
      const cases = [
        chartAreaBars({items:${JSON.stringify(items)}, city:25, title:'Deutsche mit Migrationshintergrund', xLabel:'Stadtbezirk', yLabel:'Personen in %'}),
        chartAreaBars({items:[{label:long,value:-1234567},{label:long,value:9999999}], city:0,xLabel:'Gebiet'}),
        chartBars({groups:[{label:long,values:[-9999999]},{label:long,values:[12345678]}],series:[{label:'Personen',color:'#01604B'}],xLabel:'Gebiete'}),
        chartLines({x:[1999,2025],series:[{label:'Personen',color:'#01604B',values:[-9999999,12345678]}]}),
        chartPie({slices:[{label:'A',value:12345678,color:'#01604B'},{label:'B',value:7654321,color:'#ccc'}],title:long})
      ];
      // Der konkrete Vergleich muss auch ohne nachträgliche SVG-Anpassung
      // genug Platz für Haunstetten West & 12 Siebenbrunn bieten.
      const fit = fitChartSvg;
      fitChartSvg = markup => markup;
      cases.push(chartAreaBars({items:${JSON.stringify(items)},city:25,xLabel:'Stadtbezirk',yLabel:'Personen in %'}));
      fitChartSvg = fit;
      let checked = 0;
      for (const width of [320, 768, 1280]) for (const size of ['normal','sehrgross']) {
        document.documentElement.dataset.textsize = size;
        document.body.innerHTML = '<main style="width:'+width+'px">'+cases.join('')+'</main>';
        for (const svg of document.querySelectorAll('main .chart > svg')) {
          const frame = svg.getBoundingClientRect();
          for (const text of svg.querySelectorAll('text')) {
            const b = text.getBoundingClientRect();
            if (b.left < frame.left-0.5 || b.right > frame.right+0.5 || b.top < frame.top-0.5 || b.bottom > frame.bottom+0.5) throw new Error('Abgeschnitten: '+text.textContent+' bei '+width+'/'+size);
            checked++;
          }
          const footer = svg.querySelector('[data-chart-footer]');
          if (footer) {
            const top = footer.getBoundingClientRect().top;
            for (const label of svg.querySelectorAll('text[transform]')) if (label.getBoundingClientRect().bottom > top) throw new Error('Achsentitel überlappt Beschriftung');
          }
        }
      }
      return {checked, charts:cases.length, widths:[320,768,1280]};
    })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    console.log('Diagrammlayout geprüft:', result.result.value);
    const modalMarkup = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<body>([\s\S]*?)<\/body>/)[1];
    const animation = app.slice(app.indexOf('  async function openVergleichAnimation('), app.indexOf('  async function openDatenbeschreibung('));
    const modalFunctions = app.slice(app.indexOf('  let animTimer = null;'), app.indexOf('  function openPyramidAnimation('));
    const legends = app.slice(app.indexOf('  const VG_LEGENDS ='), app.indexOf('  function themeKeyFor('));
    for (const [width, height] of [[945,733],[1366,768],[390,844],[320,568],[800,360]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const tested = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
        document.body.innerHTML = ${JSON.stringify(modalMarkup)};
        document.documentElement.dataset.textsize = 'normal';
        const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
        const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
        const h = (s,...v) => s.reduce((out,part,i)=>out+part+(v[i]??''),'');
        const areaLabel = () => "'Stadtteile'", state = {year:2009}, A = {years:Array.from({length:27},(_,i)=>1999+i)};
        const getJSON = async () => ({themes:{Migration:{merkmale:{GermansWithoutMigration:{areas:[{id:'1'}],colors:{'1':'#f59182'}}}}},icCoords:[{}]});
        const colorClasses = () => [], a11y = () => ({muster:'aus'});
        const mapSvg = () => '<svg viewBox="0 0 300 430" preserveAspectRatio="xMidYMid meet"><path d="M20 20L280 200L150 420Z" fill="#f59182"/></svg>';
        let tick;
        const setInterval = (fn,ms) => {if(ms!==1000)throw Error('Zeitabstand');tick=fn;return 1;};
        const clearInterval = () => {tick=null;};
        ${legends}
        ${modalFunctions}
        ${animation}
        await openVergleichAnimation('Stadtteil','Migration','GermansWithoutMigration',{label:'Migrationshintergrund'},null,{radios:[{value:'GermansWithoutMigration',label:'Deutsche ohne Migrationshintergrund'}]});
        const checkYear = y => {if($('#animYear').textContent!==String(y))throw Error('Falsches Jahr '+$('#animYear').textContent);};
        checkYear(2009);
        $('#animStart').click(); checkYear(1999);
        for(let y=2000;y<=2025;y++){tick();checkYear(y);} tick();checkYear(1999);
        $('#animStop').click();if(tick)throw Error('Stop fehlgeschlagen');
        $('#animReset').click();checkYear(2009);
        if($('.anim-comparison img'))throw Error('Bild statt Code');
        const body=$('#modalBody');
        if(body.scrollHeight>body.clientHeight+1 || body.scrollWidth>body.clientWidth+1)throw Error('Modal scrollt bei '+innerWidth+'x'+innerHeight);
        for(const node of $$('.anim-controls button, #animMap svg, .vg-scale, .modal-close')){
          const r=node.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1)throw Error('Außerhalb Bildschirm: '+node.className);
        }
        $('#animStart').click();closeModal();if(tick)throw Error('Timer läuft nach Schließen');
        return 'OK';
      })()` });
      if (tested.exceptionDetails) throw new Error(tested.exceptionDetails.exception?.description || tested.exceptionDetails.text);
    }
    console.log('Animation geprüft: 27 Jahre, Start/Stop/Reset/Schließen, 5 Bildschirmgrößen ohne Scrollen.');
  } finally {
    if (ws) ws.close();
    browser.kill();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
