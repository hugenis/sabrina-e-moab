import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const GUESTS_FILE = path.join(DATA, 'guests.json');
const RSVPS_FILE = path.join(DATA, 'rsvps.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PHOTOS = [
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-33.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-61.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-77.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-88.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-121.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-148.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-173.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-203.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-204.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-230.jpg',
  'site-de-casamento-icasei-ensaio-sabrina-e-moab-249.jpg',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
  res.end(body);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(DATA, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Payload muito grande.');
  }
  return raw ? JSON.parse(raw) : {};
}

const guests = await readJson(GUESTS_FILE, {});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/health') {
      return send(res, 200, 'ok');
    }

    if (pathname === '/capa-aleatoria.php') {
      const photo = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
      const data = await readFile(path.join(PUBLIC, 'images', photo));
      return send(res, 200, data, 'image/jpeg', {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Disposition': 'inline',
      });
    }

    if (pathname === '/rsvp-members') {
      const id = url.searchParams.get('id') || '';
      const list = guests[id] || [];
      return send(res, 200, JSON.stringify(list), 'application/json; charset=utf-8', {
        'Cache-Control': 'no-store',
      });
    }

    if (pathname === '/rsvp-submit' && req.method === 'POST') {
      const body = await readBody(req);
      const id = String(body.id_titular || '').trim();
      if (!id) return send(res, 400, JSON.stringify({ error: 'id_titular obrigatório' }), MIME['.json']);

      const list = await readJson(RSVPS_FILE, []);
      const record = {
        ...body,
        id_titular: id,
        submitted_at: new Date().toISOString(),
        ip:
          req.headers['cf-connecting-ip'] ||
          req.headers['x-forwarded-for'] ||
          req.socket.remoteAddress ||
          '',
      };

      const index = list.findIndex((item) => item.id_titular === id);
      if (index >= 0) list[index] = record;
      else list.push(record);
      await writeJson(RSVPS_FILE, list);

      return send(res, 200, JSON.stringify({ ok: true }), MIME['.json']);
    }

    if (pathname === '/api/rsvps') {
      if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) {
        return send(res, 404, 'Not found');
      }
      const list = await readJson(RSVPS_FILE, []);
      return send(res, 200, JSON.stringify(list, null, 2), MIME['.json']);
    }

    if (pathname === '/' || pathname === '/rsvp' || pathname === '/rsvp/') {
      const html = await readFile(path.join(PUBLIC, 'index.html'));
      return send(res, 200, html, MIME['.html'], { 'Cache-Control': 'no-cache' });
    }

    const safePath = path.normalize(path.join(PUBLIC, pathname));
    if (!safePath.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');

    if (existsSync(safePath) && !safePath.endsWith(path.sep)) {
      const ext = path.extname(safePath).toLowerCase();
      const data = await readFile(safePath);
      return send(res, 200, data, MIME[ext] || 'application/octet-stream', {
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      });
    }

    return send(res, 404, 'Not found');
  } catch (error) {
    console.error(error);
    return send(res, 500, 'Erro interno');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sabrina & Moab RSVP ouvindo em :${PORT}`);
});
