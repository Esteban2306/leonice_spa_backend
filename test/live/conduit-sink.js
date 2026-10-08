const http = require('http');
const fs = require('fs');
const LOG = process.argv[2];
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), method: req.method, url: req.url, body: body ? JSON.parse(body) : null }) + '\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: 'sink-' + Date.now() }));
  });
}).listen(4199, () => console.log('conduit sink on :4199'));
