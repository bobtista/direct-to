// Static file server for the trainer.
//
// Replaces `python3 -m http.server` so that a server already running on the
// port is reported clearly instead of dumping a socket traceback, and so the
// module MIME types are always right (browsers refuse `type="module"` scripts
// served as anything but JavaScript).

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const START_PORT = Number(process.env.PORT) || 8765;
const MAX_TRIES = 20;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  // Keep requests inside the project directory.
  const path = join(ROOT, normalize(rel));
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = statSync(path);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(301, { Location: rel + '/' }).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(path).pipe(res);
});

/** Is something already serving this project on that port? */
async function alreadyOurs(port) {
  try {
    const r = await fetch(`http://localhost:${port}/index.html`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok && (await r.text()).includes('GNS 430W Trainer');
  } catch {
    return false;
  }
}

let port = START_PORT;

server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') throw err;

  if (port === START_PORT && (await alreadyOurs(port))) {
    console.log(`The trainer is already running: http://localhost:${port}`);
    console.log('Reload the page to pick up any changes, or `npm stop` to shut it down.');
    process.exit(0);
  }

  if (port - START_PORT >= MAX_TRIES) {
    console.error(`No free port between ${START_PORT} and ${port}.`);
    process.exit(1);
  }
  server.listen(++port);
});

server.on('listening', () => {
  console.log(`Trainer at http://localhost:${port}`);
  if (port !== START_PORT) console.log(`(${START_PORT} was busy, so this is on ${port})`);
});

server.listen(port);
