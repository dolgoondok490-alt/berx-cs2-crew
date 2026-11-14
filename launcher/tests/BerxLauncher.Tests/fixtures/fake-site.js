// Хуурамч BERX сайт: agent-ийн heartbeat/poll/result. args: <port> <outFile>
const http = require('http'), fs = require('fs');
const [port, out] = process.argv.slice(2);
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    if (req.url.endsWith('/heartbeat')) fs.appendFileSync(out, b + '\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(req.url.endsWith('/poll') ? '{"commands":[],"teams":null,"teamsVersion":null}' : '{"ok":true}');
  });
}).listen(+port, '127.0.0.1');
