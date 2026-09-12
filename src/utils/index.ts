import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { JsonObject, JsonValue } from '@/types';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.hostname.includes('..')) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export { normalizeUrlStrict } from './normalizeUrl';

export function toJsonSafe(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map(toJsonSafe) as JsonValue[];
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = toJsonSafe(val);
    }
    return result;
  }
  return null;
}

export function toJsonObject(value: unknown): JsonObject {
  const result = toJsonSafe(value);
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return result as JsonObject;
  }
  return {};
}

// NOTE: ffmpeg.ts uses Node.js modules (child_process, fs) and is server-only.
// Import directly from '@/utils/ffmpeg' in server code.
// Do NOT re-export here to avoid pulling Node.js modules into client bundles.