import type { LinkCategory } from '../types.js';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

const TRAILING_PUNCT_RE = /[.,;:!?)}\]]+$/;

const DOMAIN_CATEGORIES: Record<string, LinkCategory> = {
  'youtube.com': 'video',
  'youtu.be': 'video',
  'vimeo.com': 'video',
  'dailymotion.com': 'video',
  'twitch.tv': 'video',
  'tiktok.com': 'video',
  'vm.tiktok.com': 'video',

  'twitter.com': 'social',
  'x.com': 'social',
  'facebook.com': 'social',
  'fb.com': 'social',
  'instagram.com': 'social',
  'linkedin.com': 'social',
  'reddit.com': 'social',
  'threads.net': 'social',
  'mastodon.social': 'social',
  'bsky.app': 'social',
  'pinterest.com': 'social',
  'snapchat.com': 'social',
  'tumblr.com': 'social',
  'wa.me': 'social',

  'cnn.com': 'news',
  'bbc.com': 'news',
  'bbc.co.uk': 'news',
  'nytimes.com': 'news',
  'theguardian.com': 'news',
  'reuters.com': 'news',
  'apnews.com': 'news',
  'washingtonpost.com': 'news',
  'aljazeera.com': 'news',
  'news.google.com': 'news',
  'news.yahoo.com': 'news',
  'techcrunch.com': 'news',
  'theverge.com': 'news',
  'arstechnica.com': 'news',
  'wired.com': 'news',
  'medium.com': 'news',
  'substack.com': 'news',
  'bloomberg.com': 'news',
  'cnbc.com': 'news',
  'foxnews.com': 'news',
  'nbcnews.com': 'news',
  'ynet.co.il': 'news',
  'haaretz.com': 'news',

  'amazon.com': 'shopping',
  'amazon.co.uk': 'shopping',
  'amazon.de': 'shopping',
  'ebay.com': 'shopping',
  'etsy.com': 'shopping',
  'aliexpress.com': 'shopping',
  'walmart.com': 'shopping',
  'target.com': 'shopping',
  'shopify.com': 'shopping',
  'wish.com': 'shopping',

  'spotify.com': 'music',
  'open.spotify.com': 'music',
  'soundcloud.com': 'music',
  'music.apple.com': 'music',
  'music.youtube.com': 'music',
  'deezer.com': 'music',
  'bandcamp.com': 'music',

  'github.com': 'dev',
  'gitlab.com': 'dev',
  'stackoverflow.com': 'dev',
  'npmjs.com': 'dev',
  'pypi.org': 'dev',
  'dev.to': 'dev',
  'codepen.io': 'dev',
  'jsfiddle.net': 'dev',
  'codesandbox.io': 'dev',
  'hackernews.com': 'dev',
  'news.ycombinator.com': 'dev',

  'wikipedia.org': 'reference',
  'en.wikipedia.org': 'reference',
  'docs.google.com': 'reference',
  'drive.google.com': 'reference',
  'maps.google.com': 'reference',
  'translate.google.com': 'reference',
  'google.com': 'reference',
  'bing.com': 'reference',
  'duckduckgo.com': 'reference',
};

export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(URL_RE);
  if (!matches) return [];
  return matches.map((url) => url.replace(TRAILING_PUNCT_RE, ''));
}

export function parseDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function categorizeDomain(domain: string): LinkCategory {
  if (DOMAIN_CATEGORIES[domain]) return DOMAIN_CATEGORIES[domain];

  for (const [known, category] of Object.entries(DOMAIN_CATEGORIES)) {
    if (domain.endsWith(`.${known}`)) return category;
  }

  return 'other';
}
