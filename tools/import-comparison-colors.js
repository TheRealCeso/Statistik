/* Ergänzt fehlende Farbzuordnungen direkt aus den Originalkarten.
 * Aufruf: node --use-system-ca tools/import-comparison-colors.js [Gebietstyp]
 * Bilder werden nur im Speicher gelesen; die Anwendung nutzt weiterhin SVG.
 */
const fs = require('fs');
const path = require('path');
const { decodeGif, sampleColor } = require('./colors');
const root = path.join(__dirname, '..', 'data', 'vergleich');
const origin = 'https://statistikinteraktiv.augsburg.de';

async function run() {
  const jobs = [];
  const documents = [];
  for (const type of fs.readdirSync(root)) {
    if (process.argv[2] && process.argv[2] !== type) continue;
    for (const name of fs.readdirSync(path.join(root, type))) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(root, type, name);
      const source = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(source);
      const indent = source.match(/\n([ \t]+)"/)?.[1];
      const doc = { file, data, indent, newline: source.endsWith('\n'), changed: false, pending: 0 };
      documents.push(doc);
      for (const theme of Object.values(data.themes)) {
        for (const [key, metric] of Object.entries(theme.merkmale || {})) {
          if (!metric.areas?.length || !metric.img || !data.icCoords?.length || metric.mapUnavailable || Object.keys(metric.colors || {}).length) continue;
          jobs.push({ doc, metric, key });
          doc.pending++;
        }
      }
    }
  }
  let next = 0, done = 0, failed = 0;
  console.log(`${jobs.length} Originalkarten werden eingelesen.`);
  async function worker() {
    while (next < jobs.length) {
      const { doc, metric, key } = jobs[next++];
      try {
        let image;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(new URL(metric.img, origin), { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            image = decodeGif(Buffer.from(await response.arrayBuffer()));
            break;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
        const colors = {};
        for (const polygon of doc.data.icCoords) {
          const color = sampleColor(image, polygon.coords);
          if (color) colors[polygon.id] = color;
        }
        // Der Server liefert auch Hinweistexte als GIF mit HTTP 200.
        // Deren dunkelblaue Schrift darf nicht als Gebietsfarbe gelten.
        if (Object.values(colors).length && Object.values(colors).every(color => color === '#25435A')) {
          metric.mapUnavailable = true;
        } else {
          if (!Object.keys(colors).length) throw new Error('Keine Gebietsfarben gefunden');
          metric.colors = colors;
        }
        doc.changed = true;
      } catch (error) {
        failed++;
        console.error(doc.data.type, doc.data.year, key, error.message);
      }
      doc.pending--;
      if (!doc.pending && doc.changed) fs.writeFileSync(doc.file, JSON.stringify(doc.data, null, doc.indent) + (doc.newline ? '\n' : ''));
      done++;
      if (done % 100 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} Karten, ${failed} Fehler`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`${documents.filter(doc => doc.changed).length} Jahresdateien aktualisiert.`);
  if (failed) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
