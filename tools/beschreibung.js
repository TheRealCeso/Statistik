/*
 * Wandelt die Original-Seite "Datenbeschreibung" (indicators.jsp) in ein HTML-Fragment um.
 * Die MathJax-Formeln ($$ ... $$) werden in einfache HTML-Brüche übersetzt.
 * Aufruf: node beschreibung.js  -> data/beschreibung.html
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE = 'https://statistikinteraktiv.augsburg.de/Interaktiv';
const OUT = path.join(__dirname, '..', 'data', 'beschreibung.html');

function tex2html(tex) {
  let s = tex.trim();
  if (s === '{-}' || s === '-') return '<span class="formula-none">–</span>';
  s = s.replace(/\\left\(|\\right\)|^\{|\}$/g, '');
  s = s.replace(/&ndash;/g, '–').replace(/\\ /g, ' ').replace(/\s+/g, ' ');
  const mult = s.match(/\)?\s*\*\s*100\s*$/) ? ' × 100' : '';
  s = s.replace(/\*\s*100\s*$/, '').trim();
  const parts = s.split('\\over');
  const clean = t => t.replace(/[{}]/g, '').replace(/\\sum\s*\(?/, '∑ (').replace(/\*/g, '×').replace(/\s+/g, ' ').trim();
  if (parts.length === 2) {
    return `<span class="formula"><span class="frac"><span class="num">${clean(parts[0])}</span><span class="den">${clean(parts[1])}</span></span>${mult}</span>`;
  }
  return `<span class="formula">${clean(s)}${mult}</span>`;
}

(async () => {
  const html = await (await fetch(BASE + '/JSP/indicators.jsp?scrollToIndicators=False')).text();
  const $ = cheerio.load(html);
  $('script').remove();
  const out = [];
  $('#indicatorsMain').children().each((i, el) => {
    const $el = $(el);
    if ($el.is('p.indiDescriptionHeader')) {
      const t = $el.text().trim();
      out.push(t === 'Datendefinitionen' || t === 'Beschreibung der Indikatoren' || t === 'Allgemeine Informationen' ? `<h2>${t}</h2>` : `<h3>${t}</h3>`);
    } else if ($el.is('div')) {
      let inner = $el.html();
      if (!inner || !inner.trim() || /^\s*(<p[^>]*>\s*<\/p>\s*)+$/.test(inner)) return;
      // Formeln
      inner = inner.replace(/<p>\$\$([\s\S]*?)\$\$<\/p>/g, (m, tex) => `<p class="formula-p">${tex2html(tex)}</p>`);
      inner = inner.replace(/<p class="indiHeader">([^<]*)<\/p>/g, (m, t) => t.trim() ? `<h4>${t}</h4>` : '');
      inner = inner.replace(/(&nbsp;)+/g, ' ');
      // Zeilenumbrüche in Absätze verwandeln
      const blocks = inner.split(/<br>\s*<br>/).map(b => b.replace(/<br>\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
      out.push('<div class="desc-block">' + blocks.map(b => (/^<(h4|p)/.test(b) ? b : `<p>${b}</p>`)).join('') + '</div>');
    }
  });
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('geschrieben', OUT, out.length, 'Blöcke');
})();
