const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DEV_HOST = 'mrgnt-dev.web.app';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const isDynamicPage = urlPath === '/evento.html' || urlPath === '/noticia.html' || urlPath === '/artista.html';

  if (req.url.startsWith('/api/') || isDynamicPage) {
    const options = {
      hostname: DEV_HOST,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: DEV_HOST },
    };
    const proxy = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', (err) => {
      res.writeHead(502);
      res.end('Bad Gateway: ' + err.message);
    });
    req.pipe(proxy);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

  // Strip query strings
  filePath = filePath.split('?')[0];

  // Try adding .html for extensionless paths
  if (!path.extname(filePath) && !fs.existsSync(filePath)) {
    const htmlPath = filePath + '.html';
    if (fs.existsSync(htmlPath)) filePath = htmlPath;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Local dev  →  http://localhost:${PORT}`);
  console.log(`API proxy  →  https://${DEV_HOST}`);
});
