/* Kleiner statischer Webserver für die lokale Nutzung: node serve.js [port] */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (p.startsWith('/Interaktiv/')) {
        const remoteUrl = 'https://statistikinteraktiv.augsburg.de' + encodeURI(p);
        fetch(remoteUrl)
          .then(async r => {
            if (!r.ok) throw new Error('Remote HTTP ' + r.status);
            const buf = Buffer.from(await r.arrayBuffer());
            try {
              fs.mkdirSync(path.dirname(file), { recursive: true });
              fs.writeFileSync(file, buf);
            } catch (e) { /* ignore write errors */ }
            const ctype = r.headers.get('content-type') || types[path.extname(file).toLowerCase()] || 'application/octet-stream';
            res.writeHead(200, {
              'Content-Type': ctype,
              'Content-Length': buf.length,
              'Cache-Control': 'public, max-age=86400',
            });
            res.end(buf);
          })
          .catch(() => {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Nicht gefunden: ' + p);
          });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Nicht gefunden: ' + p);
    }
    // ETag und Last-Modified, damit der Browser geänderte Dateien zuverlässig neu lädt
    const etag = '"' + st.size.toString(16) + '-' + st.mtimeMs.toString(16) + '"';
    const lastMod = st.mtime.toUTCString();
    if (req.headers['if-none-match'] === etag || req.headers['if-modified-since'] === lastMod) {
      res.writeHead(304, { ETag: etag, 'Last-Modified': lastMod, 'Cache-Control': 'no-cache' });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Last-Modified': lastMod,
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log('Statistik Augsburg interaktiv läuft auf http://localhost:' + port));
