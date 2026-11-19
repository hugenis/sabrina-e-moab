import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.join(ROOT, 'public', 'images');

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

const cache = new Map();
const MAX_CACHE = 80;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashIndex(value, length) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function pickPhoto(id) {
  const key = String(id || '');
  return PHOTOS[hashIndex(key || 'sabrina-e-moab', PHOTOS.length)];
}

function fitName(name) {
  const clean = String(name || 'Convidado(a) Especial').trim();
  if (clean.length <= 26) return { text: clean, size: 66 };
  if (clean.length <= 34) return { text: clean, size: 54 };
  if (clean.length <= 44) return { text: clean, size: 46 };
  return { text: `${clean.slice(0, 41)}…`, size: 38 };
}

export async function renderLocationOg({ id, name }) {
  const safeId = String(id || '');
  const safeName = String(name || 'Convidado(a) Especial');
  const cacheKey = `${safeId}:${safeName}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const photo = pickPhoto(safeId);
  const photoPath = path.join(IMAGES, photo);
  const nameLine = fitName(safeName);

  const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#200207" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#400513" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#6b0f24" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#b89025"/>
      <stop offset="45%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#d4af37"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#wine)"/>
  <rect x="26" y="26" width="1148" height="578" rx="22" fill="none" stroke="url(#gold)" stroke-width="2" opacity="0.85"/>

  <g font-family="DejaVu Sans, Arial, sans-serif" text-anchor="middle">
    <text x="600" y="104" fill="#f3d27a" font-size="20" letter-spacing="6">LOCALIZAÇÃO DO CASAMENTO</text>
    <text x="600" y="188" fill="#fff8e7" font-family="DejaVu Serif, Georgia, serif" font-size="66" font-weight="bold">Sabrina &amp; Moab</text>
    <text x="600" y="238" fill="#e9c97a" font-size="22" letter-spacing="3">28 DE NOVEMBRO DE 2026</text>
    <line x1="420" y1="278" x2="780" y2="278" stroke="url(#gold)" stroke-width="2" opacity="0.75"/>
    <text x="600" y="346" fill="#f6e3b0" font-size="28">Olá,</text>
    <text x="600" y="424" fill="#ffffff" font-family="DejaVu Serif, Georgia, serif" font-size="${nameLine.size}" font-weight="bold">${escapeXml(nameLine.text)}</text>
    <text x="600" y="482" fill="#f3d9a2" font-size="22">Cerimônia · Paróquia Nossa Senhora da Esperança</text>
    <text x="600" y="514" fill="#e7c9a0" font-size="19">Recepção · Chácara Florestal — Estrada Florestal, 650 · Parelheiros</text>
    <text x="600" y="550" fill="#e7c9a0" font-size="16">São Paulo/SP · 28 de novembro de 2026</text>
    <text x="600" y="590" fill="#d9b56a" font-size="16" letter-spacing="2">sabrina-e-moab.hugenis.com</text>
  </g>
</svg>`;

  const base = await sharp(photoPath)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.55, saturation: 0.9 })
    .blur(1.2)
    .toBuffer();

  const output = await sharp(base)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(cacheKey, output);
  return output;
}
