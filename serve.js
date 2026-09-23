/* Kleiner statischer Webserver für die lokale Nutzung: node serve.js [port] */
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
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Nicht gefunden: ' + p); }
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
