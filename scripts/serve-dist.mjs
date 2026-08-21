#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST_DIR = 'dist/monosai/browser';
const BASE_PATH = '/monosai/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * A minimal static server for `dist/monosai/browser`, mounted under
 * `/monosai/` exactly as GitHub Pages serves it.
 *
 * Needed because `ng serve` disables the service worker in development
 * (`isDevMode()`), so offline reload, the update prompt, and installability
 * cannot be exercised against it. This serves the real production build with
 * correct MIME types and a `404.html` fallback for the pre-service-worker
 * first visit, matching the deploy workflow.
 */
async function requestListener(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(BASE_PATH)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found outside /monosai/');
    return;
  }

  const relative = decodeURIComponent(url.pathname.slice(BASE_PATH.length));
  const candidate = normalize(join(DIST_DIR, relative || 'index.html'));
  if (!candidate.startsWith(normalize(DIST_DIR))) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const resolved = (await stat(candidate).catch(() => null))?.isDirectory()
    ? join(candidate, 'index.html')
    : candidate;

  const info = await stat(resolved).catch(() => null);
  if (info === null) {
    const fallback = join(DIST_DIR, '404.html');
    const fallbackInfo = await stat(fallback).catch(() => null);
    if (fallbackInfo === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(fallback).pipe(res);
    return;
  }

  res.writeHead(200, {
    'content-type': MIME_TYPES[extname(resolved)] ?? 'application/octet-stream',
    'content-length': info.size,
  });
  createReadStream(resolved).pipe(res);
}

/** Starts the static server on `port`. Callers are responsible for closing it. */
export async function startServer(port) {
  const server = createServer((req, res) => {
    void requestListener(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  return server;
}

async function main() {
  const indexExists = (await stat(join(DIST_DIR, 'index.html')).catch(() => null)) !== null;
  if (!indexExists) {
    process.stderr.write(`${DIST_DIR}/index.html not found; run npm run build:pages first\n`);
    process.exitCode = 1;
    return;
  }
  const port = Number(process.env.PORT ?? 4300);
  await startServer(port);
  process.stdout.write(`serving ${DIST_DIR} at http://localhost:${String(port)}${BASE_PATH}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
