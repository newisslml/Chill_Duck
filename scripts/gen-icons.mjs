// Genera los PNG de la PWA a partir de app/public/icons/icon.svg:  npm run icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = new URL('../app/public/icons/', import.meta.url);
const svg = await readFile(new URL('icon.svg', dir), 'utf8');

// Versión "maskable": Android recorta el ícono en círculo, así que el pato se achica al 72%.
const maskable = svg.replace('<g id="duck">', '<g id="duck" transform="translate(256 256) scale(0.72) translate(-256 -256)">');

const outputs = [
  ['apple-touch-icon.png', svg, 180],
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', maskable, 512],
];

for (const [name, source, size] of outputs) {
  await sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(fileURLToPath(new URL(name, dir)));
  console.log(`✓ ${name} (${size}px)`);
}
