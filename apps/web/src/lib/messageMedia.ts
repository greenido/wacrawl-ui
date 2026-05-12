export type MediaPreviewKind = 'image' | 'video' | 'audio' | 'other';

const extensionKinds: Record<string, MediaPreviewKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  heif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
  '3gp': 'video',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  wav: 'audio',
};

/** WhatsApp / crawler archives sometimes store keys or hashes as message text — hide those from the UI. */
export function isLikelyOpaqueMediaHandle(text: string): boolean {
  const t = text.trim();
  if (t.length < 20 || /\s/.test(t)) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(t);
}

export function friendlyMediaLabel(mediaType: string | null | undefined): string {
  if (!mediaType) return 'Media';
  const m = mediaType.toLowerCase();
  if (m.includes('image') || m.includes('photo')) return 'Photo';
  if (m.includes('video')) return 'Video';
  if (m.includes('sticker')) return 'Sticker';
  if (m.includes('audio') || m.includes('voice') || m === 'ptt') return 'Voice message';
  if (m.includes('document')) return 'Document';
  if (m.includes('gif')) return 'GIF';
  return 'Media';
}

export function resolveMediaPreviewKind(mediaType: string | null | undefined, mediaPath: string | null | undefined): MediaPreviewKind | null {
  if (!mediaPath || !mediaPath.trim()) return null;
  const type = (mediaType ?? '').toLowerCase();
  if (type.includes('image') || type.includes('photo') || type.includes('sticker')) return 'image';
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('voice') || type === 'ptt') return 'audio';

  const extension = mediaPath.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  return extension ? extensionKinds[extension] ?? 'other' : 'other';
}

export function chatPreviewLine(text: string | null | undefined, lastMessageMediaType: string | null | undefined): string {
  const raw = text?.trim() ?? '';
  if (raw && isLikelyOpaqueMediaHandle(raw)) {
    return friendlyMediaLabel(lastMessageMediaType);
  }
  if (!raw && lastMessageMediaType) {
    return friendlyMediaLabel(lastMessageMediaType);
  }
  return raw || friendlyMediaLabel(lastMessageMediaType) || 'No preview';
}

/** Search snippets sometimes join chat name with opaque keys — replace token-by-token. */
export function humanizeMixedSnippet(snippet: string, mediaType: string | null | undefined): string {
  const s = snippet.trim();
  if (!s) return '';
  const sep = ' - ';
  if (!s.includes(sep)) {
    return isLikelyOpaqueMediaHandle(s) ? friendlyMediaLabel(mediaType) : s;
  }
  return s
    .split(sep)
    .map((part) => {
      const p = part.trim();
      return isLikelyOpaqueMediaHandle(p) ? friendlyMediaLabel(mediaType) : part;
    })
    .join(sep);
}
