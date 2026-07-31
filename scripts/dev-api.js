const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.SAATHI_API_PORT || 8788);
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

// Same table production uses, so a route cannot work here and 404 when
// deployed. See api/[...route].js for why the handlers live under server/.
const { ROUTES } = require('../api/index.js');

function createResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  return res;
}

loadEnv();

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
  const load = ROUTES[pathname.replace(/^\/api\//, '').replace(/\/+$/, '')];
  if (!load) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    await load()(req, createResponse(res));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Saathi local API listening on http://localhost:${PORT}`);
});
