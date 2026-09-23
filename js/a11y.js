/* Darstellungseinstellungen (Schriftgröße, Kontrast, Kartenmuster)
 * Wird von allen Seiten eingebunden und legt die Einstellung im Browser des Nutzers ab.
 * Die Einstellungen setzen Attribute auf <html>; das Aussehen steuert css/style.css.
 */
(function () {
  'use strict';

  var KEY = 'statistik-augsburg-darstellung';
  var DEFAULTS = { text: 'normal', contrast: 'standard', muster: 'aus' };
  var GROUPS = [
    { key: 'text', legend: 'Schriftgröße', options: [['normal', 'Normal'], ['gross', 'Groß'], ['sehrgross', 'Sehr groß']] },
    { key: 'contrast', legend: 'Kontrast', options: [['standard', 'Standard'], ['hoch', 'Hoch']] },
    { key: 'muster', legend: 'Karten', options: [['aus', 'Nur Farbe'], ['an', 'Farbe und Muster']] },
  ];

  function read() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      for (var j in DEFAULTS) if (raw[j]) s[j] = raw[j];
    } catch (e) { /* privater Modus o. Ä.: Standardwerte verwenden */ }
    return s;
  }
  function write(s) { try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignorieren */ } }

  var state = read();

  function apply(notify) {
    var r = document.documentElement;
    r.setAttribute('data-textsize', state.text);
    r.setAttribute('data-contrast', state.contrast);
    r.setAttribute('data-muster', state.muster);
    if (notify) document.dispatchEvent(new CustomEvent('a11ychange', { detail: get() }));
  }
  function get() { var c = {}; for (var k in state) c[k] = state[k]; return c; }
  function set(key, value) { if (!(key in DEFAULTS)) return; state[key] = value; write(state); apply(true); }

  window.A11Y = { get: get, set: set };
  apply(false);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function buildPanel() {
    var host = document.querySelector('.header-actions');
    if (!host || document.getElementById('a11yBtn')) return;
    var base = (document.body.getAttribute('data-base') || '');
    var wrap = document.createElement('div');
    wrap.className = 'a11y';
    var html = '<button class="btn btn-ghost" type="button" id="a11yBtn" aria-expanded="false" aria-controls="a11yPanel" title="Schriftgröße, Kontrast und Kartendarstellung einstellen">Darstellung</button>'
      + '<div class="a11y-panel" id="a11yPanel" role="group" aria-label="Darstellung einstellen" hidden>';
    GROUPS.forEach(function (g) {
      html += '<fieldset><legend>' + esc(g.legend) + '</legend><div class="a11y-opts">';
      g.options.forEach(function (o) {
        var id = 'a11y-' + g.key + '-' + o[0];
        html += '<input type="radio" name="a11y-' + esc(g.key) + '" id="' + id + '" value="' + esc(o[0]) + '"'
          + (state[g.key] === o[0] ? ' checked' : '') + '><label for="' + id + '">' + esc(o[1]) + '</label>';
      });
      html += '</div></fieldset>';
    });
    html += '<p class="a11y-hint">Die Einstellung gilt nur auf diesem Gerät und bleibt gespeichert.</p>'
      + '<p class="a11y-link"><a href="' + base + 'barrierefreiheit.html">Erklärung zur Barrierefreiheit</a></p>'
      + '<p class="a11y-link"><a href="' + base + 'leichte-sprache.html">Diese Seite in Leichter Sprache</a></p>'
      + '</div>';
    wrap.innerHTML = html;
    host.insertBefore(wrap, host.firstChild);

    var btn = wrap.querySelector('#a11yBtn');
    var panel = wrap.querySelector('#a11yPanel');
    function open(o) { panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) { var f = panel.querySelector('input:checked'); if (f) f.focus(); } }
    btn.addEventListener('click', function () { open(panel.hidden); });
    wrap.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.name && t.name.indexOf('a11y-') === 0) set(t.name.slice(5), t.value);
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target) && !panel.hidden) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel);
  else buildPanel();
})();
