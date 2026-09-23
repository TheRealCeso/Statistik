/*
 * Führt alle noch offenen Scrape-Schritte nacheinander aus und wartet,
 * bis der Original-Server erreichbar ist. Bereits vorhandene Dateien werden übersprungen.
 * Aufruf: node run-all.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const BASE = 'https://statistikinteraktiv.augsburg.de/Interaktiv/';
const STEPS = [
  ['scrape.js', 'detail', '--par=3'],
  ['scrape.js', 'select', '--par=2'],
  ['scrape.js', 'zeitreihe', '--par=3'],
  ['scrape.js', 'vergleich', '--par=3'],
  ['scrape.js', 'adress'],
  ['scrape.js', 'adressfix'],
  ['scrape.js', 'images', '--what=core,maps,legends'],
  ['scrape.js', 'images', '--what=vergleich'],
  ['scrape.js', 'images', '--what=pyramids'],
  ['colors.js'],
];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function online() {
  try { const r = await fetch(BASE, { signal: AbortSignal.timeout(15000) }); return r.status === 200; } catch (e) { return false; }
}
async function waitOnline() {
  let n = 0;
  while (!(await online())) { if (n++ % 10 === 0) log('Server nicht erreichbar, warte …'); await sleep(60000); }
}
(async () => {
  for (const step of STEPS) {
    for (let attempt = 1; attempt <= 20; attempt++) {
      await waitOnline();
      log('Starte', step.join(' '), '(Versuch ' + attempt + ')');
      const r = spawnSync(process.execPath, step, { cwd: __dirname, stdio: 'inherit' });
      if (r.status === 0) break;
      log('Schritt fehlgeschlagen, neuer Versuch in 60 s');
      await sleep(60000);
    }
  }
  log('Alle Schritte abgeschlossen');
})();
