/**
 * Lumon Archival Server — zero-dependency reference API
 * Usage: node server/sync-server.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 3847;
const DATA_DIR = path.join(__dirname, 'data');
const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const lastWrite = new Map();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function filePath(code) {
  return path.join(DATA_DIR, `${code}.json`);
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const match = req.url.match(/^\/api\/sync\/([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})$/);
  if (!match) {
    send(res, 404, { error: 'Not found' });
    return;
  }

  const code = match[1];
  if (!CODE_RE.test(code)) {
    send(res, 400, { error: 'Invalid archival hash format' });
    return;
  }

  const fp = filePath(code);

  if (req.method === 'GET') {
    if (!fs.existsSync(fp)) {
      send(res, 404, { error: 'Record not found' });
      return;
    }
    const record = JSON.parse(fs.readFileSync(fp, 'utf8'));
    send(res, 200, record);
    return;
  }

  if (req.method === 'PUT') {
    try {
      const now = Date.now();
      const prev = lastWrite.get(code) || 0;
      if (now - prev < 1000) {
        send(res, 429, { error: 'Rate limited' });
        return;
      }
      lastWrite.set(code, now);

      const body = await readBody(req);
      if (!body.ciphertext || !body.iv || !body.contentHash) {
        send(res, 400, { error: 'Missing required fields' });
        return;
      }

      const record = {
        ciphertext: body.ciphertext,
        iv: body.iv,
        contentHash: body.contentHash,
        updatedAt: body.updatedAt || new Date().toISOString(),
      };

      fs.writeFileSync(fp, JSON.stringify(record, null, 2));
      send(res, 200, { ok: true, updatedAt: record.updatedAt });
    } catch (err) {
      send(res, 400, { error: err.message });
    }
    return;
  }

  send(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Lumon archival server listening on http://localhost:${PORT}`);
  console.log(`API base URL for terminal: http://localhost:${PORT}/api`);
});
