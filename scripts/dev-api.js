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

const routes = {
  '/api/auth/signup': '../api/auth/signup.js',
  '/api/auth/signin': '../api/auth/signin.js',
  '/api/auth/me': '../api/auth/me.js',
  '/api/auth/signout': '../api/auth/signout.js',
  '/api/assistant/plan': '../api/assistant/plan.js',
  '/api/community/post': '../api/community/post.js',
  '/api/community/reply': '../api/community/reply.js',
  '/api/community/like': '../api/community/like.js',
  '/api/admin/announcement': '../api/admin/announcement.js',
  '/api/admin/service': '../api/admin/service.js',
};

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
  const handlerPath = routes[pathname];
  if (!handlerPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const handler = require(path.resolve(__dirname, handlerPath));
    await handler(req, createResponse(res));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Saathi local API listening on http://localhost:${PORT}`);
});
