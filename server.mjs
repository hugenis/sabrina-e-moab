import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLocationOg } from './og-image.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const GUESTS_FILE = path.join(DATA, 'guests.json');
const RSVPS_FILE = path.join(DATA, 'rsvps.json');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SHEET_ID = process.env.SHEET_ID || '1HQufSz1X0g4_JQBqynAOHfIpcNKtD3EE3G9ADBjz848';
const SHEET_GID_GUESTS = process.env.SHEET_GID_GUESTS || '0';
const SHEET_GID_MEMBERS = process.env.SHEET_GID_MEMBERS || '1192521466';
const N8N_BASE = (process.env.N8N_WEBHOOK_BASE || 'https://n8n.servidorn8nafixcode.xyz/webhook').replace(/\/+$/, '');
const SHEET_TTL_MS = 60_000;

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

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra });
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

async function readRawBody(req, limit = 1_000_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('Payload muito grande.');
  }
  return raw;
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

/* ------------------------------------------------------------------ */
/* Google Sheets (leitura pública via export CSV)                      */
/* ------------------------------------------------------------------ */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function toObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((key, index) => {
      obj[key] = row[index] !== undefined ? String(row[index]).trim() : '';
    });
    return obj;
  });
}

async function fetchSheetTab(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
  return toObjects(parseCsv(await res.text()));
}

let sheetCache = { at: 0, guestsById: new Map(), membersById: new Map() };

async function loadSheet() {
  if (Date.now() - sheetCache.at < SHEET_TTL_MS) return sheetCache;

  try {
    const [guestRows, memberRows] = await Promise.all([
      fetchSheetTab(SHEET_GID_GUESTS),
      fetchSheetTab(SHEET_GID_MEMBERS),
    ]);

    const guestsById = new Map();
    for (const row of guestRows) {
      const id = String(row.ID || '').trim();
      if (!id) continue;
      guestsById.set(id, {
        id,
        nome: String(row.Nome_Completo || '').trim(),
        whatsapp: String(row.WhatsApp || '').trim(),
        status: String(row.Status_Presenca || '').trim(),
        recado: String(row.Recado_Aos_Noivos || '').trim(),
      });
    }

    const membersById = new Map();
    for (const row of memberRows) {
      const titular = String(row.ID_Titular || '').trim();
      if (!titular) continue;
      if (!membersById.has(titular)) membersById.set(titular, []);
      membersById.get(titular).push({
        id_acompanhante: String(row.ID_Acompanhante || '').trim(),
        nome: String(row.Nome_Membro || '').trim(),
        parentesco: String(row.Parentesco_Tipo || '').trim(),
        status: String(row.Status_Presenca || '').trim(),
      });
    }

    sheetCache = { at: Date.now(), guestsById, membersById };
    return sheetCache;
  } catch (error) {
    console.error('Falha ao ler Google Sheets:', error.message);
    return sheetCache;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* ------------------------------------------------------------------ */
/* N8N proxy (RSVP -> Google Sheets + WhatsApp)                        */
/* ------------------------------------------------------------------ */

async function proxyToN8n(pathAndQuery, init = {}, timeoutMs = 12_000) {
  const response = await fetch(`${N8N_BASE}${pathAndQuery}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
    text,
  };
}

/* ------------------------------------------------------------------ */

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
      try {
        const proxied = await proxyToN8n(
          `/rsvp-members${url.search ? url.search : ''}`,
          { method: 'GET' }
        );
        if (proxied.status >= 200 && proxied.status < 300) {
          return send(res, proxied.status, proxied.text, proxied.contentType, {
            'Cache-Control': 'no-store',
          });
        }
      } catch (error) {
        console.error('N8N rsvp-members indisponível:', error.message);
      }

      const sheet = await loadSheet();
      let members = sheet.membersById.get(id) || [];
      if (members.length === 0) {
        const guest = sheet.guestsById.get(id);
        if (guest) {
          members = [
            {
              id_acompanhante: `${id}-01`,
              nome: guest.nome,
              parentesco: 'Titular',
              status: guest.status === '1' ? 'Confirmado' : guest.status === '0' ? 'Recusado' : 'Pendente',
            },
          ];
        }
      }
      return send(res, 200, JSON.stringify(members), MIME['.json'], { 'Cache-Control': 'no-store' });
    }

    if (pathname === '/rsvp-submit' && req.method === 'POST') {
      const raw = await readRawBody(req);
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      try {
        const proxied = await proxyToN8n('/rsvp-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw || '{}',
        });
        if (proxied.status >= 200 && proxied.status < 300 && payload?.id_titular) {
          const list = await readJson(RSVPS_FILE, []);
          const record = {
            ...payload,
            submitted_at: new Date().toISOString(),
            ip:
              req.headers['cf-connecting-ip'] ||
              req.headers['x-forwarded-for'] ||
              req.socket.remoteAddress ||
              '',
          };
          const index = list.findIndex((item) => item.id_titular === record.id_titular);
          if (index >= 0) list[index] = record;
          else list.push(record);
          await writeJson(RSVPS_FILE, list);
        }
        return send(res, proxied.status, proxied.text, proxied.contentType);
      } catch (error) {
        console.error('N8N rsvp-submit indisponível:', error.message);
        if (payload?.id_titular) {
          const list = await readJson(RSVPS_FILE, []);
          list.push({ ...payload, submitted_at: new Date().toISOString(), offline: true });
          await writeJson(RSVPS_FILE, list);
        }
        return send(
          res,
          502,
          JSON.stringify({ ok: false, message: 'Não foi possível registrar agora. Tente novamente.' }),
          MIME['.json']
        );
      }
    }

    if (pathname === '/og-localizacao.jpg' || pathname === '/og-localizacao.png') {
      const id = (url.searchParams.get('id') || '').trim();
      const sheet = await loadSheet();
      const guest = id ? sheet.guestsById.get(id) : null;
      const name = guest?.nome || 'Convidado(a) Especial';
      const image = await renderLocationOg({ id, name });
      return send(res, 200, image, 'image/jpeg', {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Content-Disposition': 'inline',
      });
    }

    if (pathname === '/localizacao') {
      const id = (url.searchParams.get('id') || '').trim();
      const sheet = await loadSheet();
      const guest = id ? sheet.guestsById.get(id) : null;
      const name = guest?.nome || 'Convidado(a) Especial';
      const html = await readFile(path.join(PUBLIC, 'localizacao.html'), 'utf8');
      const ogTitle = `Olá, ${name}! Localização do casamento | Sabrina & Moab`;
      const ogDescription = `Confira os endereços da cerimônia (Paróquia Nossa Senhora da Esperança) e da recepção (Chácara Florestal). Sabrina & Moab — 28 de novembro de 2026.`;
      const ogImage = `https://sabrina-e-moab.hugenis.com/og-localizacao.jpg${id ? `?id=${encodeURIComponent(id)}` : ''}`;
      const ogUrl = `https://sabrina-e-moab.hugenis.com/localizacao${id ? `?id=${encodeURIComponent(id)}` : ''}`;
      const rendered = html
        .replaceAll('{{NOME}}', escapeHtml(name))
        .replaceAll('{{ID}}', escapeHtml(id))
        .replaceAll('{{RSVP_URL}}', escapeHtml(`/rsvp${id ? `?id=${encodeURIComponent(id)}` : ''}`))
        .replaceAll('{{OG_TITLE}}', escapeHtml(ogTitle))
        .replaceAll('{{OG_DESC}}', escapeHtml(ogDescription))
        .replaceAll('{{OG_IMAGE}}', escapeHtml(ogImage))
        .replaceAll('{{OG_URL}}', escapeHtml(ogUrl));
      return send(res, 200, rendered, MIME['.html'], { 'Cache-Control': 'no-cache' });
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
