import fs from 'node:fs';
import path from 'node:path';

export type Rng = () => number;

export type DemoMediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

const IMAGE_COUNT = 24;
const STICKER_COUNT = 6;
const DOCUMENT_COUNT = 3;

/**
 * One second of a solid colour, VP8, small enough to live in the source:
 * ffmpeg -f lavfi -i "color=c=0x0ea5a4:s=64x64:d=1:r=4" -map_metadata -1 -fflags +bitexact
 *   -pix_fmt yuv420p -c:v libvpx -b:v 8k -g 4 -auto-alt-ref 0 -an -f webm clip.webm
 * WebM rather than MP4 because stock Chromium, which runs the smoke tests, has no H.264.
 */
const CLIP_WEBM_BASE64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIjEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZU'
  + 'rmtTrIHGTbuMU6uEElTDZ1OsggEiTbuMU6uEHFO7a1OsggIN7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRM'
  + 'YXZmV0GETGF2ZkSJiECPQAAAAAAAFlSua9euAQAAAAAAAE7XgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+OD'
  + 'hA7msoDgkLCBQLqBQJqBAlWwhFW5gQFV7oEA7AEAAAAAAAACAAASVMNn0HNzzWPAi2PFiAAAAAAAAAABZ8iYRaOHRU5DT0RFUkSH'
  + 'i0xhdmMgbGlidnB4Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMS4wMDAwMDAwMDAAH0O2dUCQ54EAo8OBAACAkAMAnQEqQABAAABH'
  + 'CIWFiIWEiAICAnWqA/gCBuhKMBVkQe7MTgD+7L2P/UGfIM+QZ+ql//A/f4H7/A/f/gTwo5aBAPoA0QEAARAQABgAGFgv9AAIjoAA'
  + 'o5aBAfQA0QEAARAQABgAGFgv9AAIjoAAo5aBAu4A0QEAARAQABgAGFgv9AAIjoAAHFO7a5G7j7OBALeK94EB8YIBd/CBAw==';

const SKIES: Array<[string, string, string]> = [
  ['#fde68a', '#fb7185', '#7c2d12'],
  ['#bae6fd', '#38bdf8', '#14532d'],
  ['#c4b5fd', '#f0abfc', '#312e81'],
  ['#99f6e4', '#2dd4bf', '#134e4a'],
  ['#fed7aa', '#f97316', '#451a03'],
  ['#e2e8f0', '#94a3b8', '#1e293b'],
];

/** A little landscape: nothing in it can be anybody's real photo. */
function landscapeSvg(rng: Rng, index: number): string {
  const [top, bottom, ground] = SKIES[index % SKIES.length];
  const hill = (base: number) => {
    const peak = Math.round(base - 40 - rng() * 90);
    const x = Math.round(80 + rng() * 240);
    return `M0 ${base} Q${x} ${peak} 400 ${Math.round(base - rng() * 50)} L400 400 L0 400 Z`;
  };
  const sunX = Math.round(60 + rng() * 280);
  const sunY = Math.round(60 + rng() * 110);
  const sunRadius = Math.round(18 + rng() * 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunRadius}" fill="#ffffff" opacity="0.8"/>
  <path d="${hill(300)}" fill="${ground}" opacity="0.55"/>
  <path d="${hill(350)}" fill="${ground}"/>
</svg>
`;
}

function stickerSvg(index: number): string {
  const [, fill, shade] = SKIES[index % SKIES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="90" fill="${fill}"/>
  <circle cx="70" cy="82" r="11" fill="${shade}"/>
  <circle cx="130" cy="82" r="11" fill="${shade}"/>
  <path d="M60 125 Q100 165 140 125" stroke="${shade}" stroke-width="9" fill="none" stroke-linecap="round"/>
</svg>
`;
}

/** Half a second of a soft tone, as 8-bit mono PCM. */
function toneWav(): Buffer {
  const rate = 8000;
  const samples = rate / 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples, 40);

  const body = Buffer.alloc(samples);
  for (let i = 0; i < samples; i += 1) {
    const fade = 1 - i / samples;
    body[i] = Math.round(128 + 60 * fade * Math.sin((2 * Math.PI * 440 * i) / rate));
  }
  return Buffer.concat([header, body]);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Paths are relative to the media root, the way a WaCrawl archive stores them. */
export function demoMediaPath(type: DemoMediaType, rng: Rng): string {
  switch (type) {
    case 'image': return `images/photo-${pad(Math.floor(rng() * IMAGE_COUNT))}.svg`;
    case 'sticker': return `stickers/sticker-${pad(Math.floor(rng() * STICKER_COUNT))}.svg`;
    case 'video': return 'videos/clip.webm';
    case 'audio': return 'audio/voice-note.wav';
    case 'document': return `documents/notes-${pad(Math.floor(rng() * DOCUMENT_COUNT))}.txt`;
  }
}

/** Real, tiny files behind every media row, so the media grid has something to show. */
export function writeDemoMedia(mediaRoot: string, rng: Rng): void {
  const write = (relative: string, contents: string | Buffer) => {
    const target = path.join(mediaRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  for (let i = 0; i < IMAGE_COUNT; i += 1) write(`images/photo-${pad(i)}.svg`, landscapeSvg(rng, i));
  for (let i = 0; i < STICKER_COUNT; i += 1) write(`stickers/sticker-${pad(i)}.svg`, stickerSvg(i));
  for (let i = 0; i < DOCUMENT_COUNT; i += 1) write(`documents/notes-${pad(i)}.txt`, `Demo attachment ${i + 1}. Synthetic, like everything else here.\n`);
  write('videos/clip.webm', Buffer.from(CLIP_WEBM_BASE64, 'base64'));
  write('audio/voice-note.wav', toneWav());
}
