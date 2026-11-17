import type { YearInReview } from '../api/client';

/**
 * The Year in Review as a shareable PNG, drawn straight onto a canvas.
 *
 * A canvas rather than a DOM screenshot: nothing is fetched or inlined, it
 * works under a strict CSP, the layout is the same on every screen, and hiding
 * names means drawing different strings rather than re-rendering the page.
 */

export interface ShareCardOptions {
  /** Replace contact and group names with "Contact 1", "Group 1", … */
  hideNames: boolean;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COLORS = {
  backgroundTop: '#052e16',
  backgroundBottom: '#0f172a',
  tile: 'rgba(255, 255, 255, 0.07)',
  text: '#f8fafc',
  muted: '#94a3b8',
  brand: '#22c55e',
  received: '#64748b',
};

/**
 * Placeholders numbered per kind in the order the chats are ranked, so the
 * shape of the year survives while nobody in it can be identified.
 */
export function placeholderNames(chats: Array<{ jid: string; kind?: string }>): Map<string, string> {
  const names = new Map<string, string>();
  let contacts = 0;
  let groups = 0;
  for (const chat of chats) {
    if (names.has(chat.jid)) continue;
    const isGroup = chat.kind === 'group' || chat.jid.endsWith('@g.us');
    names.set(chat.jid, isGroup ? `Group ${(groups += 1)}` : `Contact ${(contacts += 1)}`);
  }
  return names;
}

const numberFormat = new Intl.NumberFormat('en-US');
const format = (value: number) => numberFormat.format(value);

function formatChange(ratio: number | null | undefined): string {
  if (ratio == null) return '—';
  if (ratio >= 3) return `${(ratio + 1).toFixed(ratio >= 10 ? 0 : 1)}×`;
  return `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`;
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 400): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** Shorten with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = COLORS.tile;
  roundRect(ctx, x, y, w, h, 24);
  ctx.fill();
}

function stat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, value: string): void {
  tile(ctx, x, y, w, 132);
  ctx.fillStyle = COLORS.muted;
  setFont(ctx, 24, 500);
  ctx.fillText(label, x + 28, y + 46);
  ctx.fillStyle = COLORS.text;
  setFont(ctx, 46, 700);
  ctx.fillText(fit(ctx, value, w - 56), x + 28, y + 104);
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = COLORS.muted;
  setFont(ctx, 22, 600);
  ctx.fillText(text.toUpperCase(), x, y);
}

function monthlyBars(ctx: CanvasRenderingContext2D, review: YearInReview, x: number, y: number, w: number, h: number): void {
  const byMonth = new Map(review.monthlyVolume.map((point) => [Number(point.month.slice(5, 7)), point]));
  const max = Math.max(1, ...review.monthlyVolume.map((point) => point.sent + point.received));
  const slot = w / 12;
  const barWidth = slot * 0.62;
  const chartHeight = h - 34;

  for (let month = 1; month <= 12; month += 1) {
    const point = byMonth.get(month);
    const sent = point?.sent ?? 0;
    const received = point?.received ?? 0;
    const bx = x + (month - 1) * slot + (slot - barWidth) / 2;
    const receivedHeight = (received / max) * chartHeight;
    const sentHeight = (sent / max) * chartHeight;
    const base = y + chartHeight;

    ctx.fillStyle = COLORS.received;
    ctx.fillRect(bx, base - receivedHeight, barWidth, receivedHeight);
    ctx.fillStyle = COLORS.brand;
    ctx.fillRect(bx, base - receivedHeight - sentHeight, barWidth, sentHeight);

    ctx.fillStyle = COLORS.muted;
    setFont(ctx, 20, 500);
    ctx.textAlign = 'center';
    ctx.fillText(MONTHS[month - 1], bx + barWidth / 2, y + h);
    ctx.textAlign = 'left';
  }
}

function legend(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  setFont(ctx, 20, 500);
  for (const [label, color] of [['You', COLORS.brand], ['Them', COLORS.received]] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 14, 16, 16);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(label, x + 24, y);
    x += 24 + ctx.measureText(label).width + 28;
  }
}

export function drawYearReviewCard(canvas: HTMLCanvasElement, review: YearInReview, options: ShareCardOptions): void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, COLORS.backgroundTop);
  gradient.addColorStop(1, COLORS.backgroundBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = 'alphabetic';

  const inner = WIDTH - PAD * 2;

  // Heading
  ctx.fillStyle = COLORS.brand;
  setFont(ctx, 128, 800);
  ctx.fillText(String(review.year), PAD, 196);
  const yearWidth = ctx.measureText(String(review.year)).width;
  ctx.fillStyle = COLORS.text;
  setFont(ctx, 44, 600);
  ctx.fillText('in review', PAD + yearWidth + 24, 196);

  // Totals
  const gap = 24;
  const statWidth = (inner - gap) / 2;
  let y = 244;
  stat(ctx, PAD, y, statWidth, 'Messages', format(review.totals.messages));
  stat(ctx, PAD + statWidth + gap, y, statWidth, 'Chats', format(review.totals.chats));
  y += 132 + gap;
  stat(ctx, PAD, y, statWidth, 'Active days', `${review.totals.activeDays} of 365`);
  stat(ctx, PAD + statWidth + gap, y, statWidth, 'Longest streak', `${review.longestStreakDays} days`);

  // Highlights
  y += 132 + gap;
  const thirdWidth = (inner - gap * 2) / 3;
  const busiestDay = review.busiestDay
    ? `${Number(review.busiestDay.date.slice(8, 10))} ${MONTH_NAMES[Number(review.busiestDay.date.slice(5, 7)) - 1].slice(0, 3)}`
    : '—';
  const busiestMonth = review.busiestMonth ? MONTH_NAMES[Number(review.busiestMonth.month.slice(5, 7)) - 1] : '—';
  stat(ctx, PAD, y, thirdWidth, 'Busiest day', busiestDay);
  stat(ctx, PAD + thirdWidth + gap, y, thirdWidth, 'Busiest month', busiestMonth);
  stat(ctx, PAD + (thirdWidth + gap) * 2, y, thirdWidth, 'Vs last year', formatChange(review.previousYear?.changeRatio));

  // Month by month
  y += 132 + 56;
  sectionTitle(ctx, 'Month by month', PAD, y);
  legend(ctx, PAD + inner - 190, y);
  monthlyBars(ctx, review, PAD, y + 24, inner, 180);

  // Top chats, and emoji (plus words when names are shown)
  y += 24 + 180 + 56;
  const columnWidth = (inner - gap * 2) / 2;
  sectionTitle(ctx, 'Top chats', PAD, y);
  const placeholders = placeholderNames(review.topChats);
  review.topChats.slice(0, 5).forEach((chat, index) => {
    const rowY = y + 52 + index * 46;
    const name = options.hideNames ? placeholders.get(chat.jid) ?? `Contact ${index + 1}` : chat.name;
    const count = format(chat.messageCount);
    setFont(ctx, 26, 500);
    const countWidth = ctx.measureText(count).width;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(count, PAD + columnWidth - countWidth, rowY);
    setFont(ctx, 30, 600);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(fit(ctx, `${index + 1}. ${name}`, columnWidth - countWidth - 24), PAD, rowY);
  });

  const right = PAD + columnWidth + gap * 2;
  sectionTitle(ctx, 'Top emoji', right, y);
  setFont(ctx, 48, 400);
  ctx.fillStyle = COLORS.text;
  let emojiX = right;
  for (const item of review.topEmojis.slice(0, 6)) {
    const width = ctx.measureText(item.emoji).width + 18;
    if (emojiX + width > PAD + inner) break;
    ctx.fillText(item.emoji, emojiX, y + 70);
    emojiX += width;
  }

  // Frequent words often are names, so they go with the names.
  if (!options.hideNames && review.topWords.length > 0) {
    sectionTitle(ctx, 'Top words', right, y + 132);
    setFont(ctx, 28, 600);
    ctx.fillStyle = COLORS.brand;
    let wordY = y + 178;
    let line = '';
    for (const word of review.topWords.slice(0, 10).map((term) => term.text)) {
      const next = line ? `${line} · ${word}` : word;
      if (ctx.measureText(next).width > columnWidth - gap) {
        ctx.fillText(line, right, wordY);
        wordY += 40;
        line = word;
        if (wordY > y + 260) break;
      } else {
        line = next;
      }
    }
    if (line && wordY <= y + 260) ctx.fillText(line, right, wordY);
  }

  // Footer
  ctx.fillStyle = COLORS.muted;
  setFont(ctx, 22, 500);
  ctx.fillText('Made with WaCrawl Dashboard · from a local archive', PAD, HEIGHT - 40);
}

export function yearReviewPng(review: YearInReview, options: ShareCardOptions): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawYearReviewCard(canvas, review, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/png');
  });
}
