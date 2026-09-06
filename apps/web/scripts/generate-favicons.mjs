import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  });
  return resvg.render().asPng();
}

const sizes = [16, 32, 180, 512];

for (const size of sizes) {
  const png = renderPng(size);
  const filename = size === 180 ? 'apple-touch-icon.png' : `favicon-${size}x${size}.png`;
  writeFileSync(join(publicDir, filename), png);
}

const ico = await pngToIco([
  renderPng(16),
  renderPng(32),
  renderPng(48),
]);

writeFileSync(join(publicDir, 'favicon.ico'), ico);

console.log('Generated favicon assets in apps/web/public');
