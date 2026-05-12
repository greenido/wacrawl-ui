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

export function isLidIdentifier(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase().endsWith('@lid') ?? false;
}

export function displayNameOrUnknown(name: string | null | undefined, fallbackId?: string | null): string {
  if (name && !isLidIdentifier(name)) return name;
  if (fallbackId && !isLidIdentifier(fallbackId)) return fallbackId;
  return 'Unknown';
}
