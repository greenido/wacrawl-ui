import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatBytes(value: number | null | undefined): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'No messages yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/**
 * Compact duration for reply latencies, which span seconds to weeks — always
 * one unit, so a column of them stays scannable.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)}d`;
  return `${Math.round(seconds / (7 * 86_400))}w`;
}

export function isLidIdentifier(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase().endsWith('@lid') ?? false;
}

export function displayNameOrUnknown(name: string | null | undefined, fallbackId?: string | null): string {
  if (name && !isLidIdentifier(name)) return name;
  if (fallbackId && !isLidIdentifier(fallbackId)) return fallbackId;
  return 'Unknown';
}
