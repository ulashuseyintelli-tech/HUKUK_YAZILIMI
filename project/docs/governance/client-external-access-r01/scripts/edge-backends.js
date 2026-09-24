'use strict';
// IZOLE DOGRULAMA — iki sahte arka uc. Canli API/Web'e DOKUNMAZ; canli portlar (8080/3002) KULLANILMAZ.
// Her istek icin hangi servise ulasildigi, arka ucun GORDUGU ham yol ve yontem kaydedilir.
const http = require('http');

function mk(name, port) {
  const srv = http.createServer((req, res) => {
    let body = 0;
    req.on('data', (c) => { body += c.length; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        service: name,
        methodSeen: req.method,
        rawUrlSeen: req.url,              // arka ucun gordugu HAM yol (kodlama korunur mu?)
        xff: req.headers['x-forwarded-for'] || null,
        bodyBytes: body,
      }));
    });
  });
  srv.listen(port, '127.0.0.1', () => console.log(`${name} dinliyor 127.0.0.1:${port}`));
  return srv;
}

mk('WEB', Number(process.argv[2] || 8192));
mk('API', Number(process.argv[3] || 8191));
