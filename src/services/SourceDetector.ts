import type { ContentType, ProviderId } from '@/types';
import { normalizeUrl } from '@/utils/normalizeUrl';

export interface DetectedSource {
  provider: ProviderId;
  url: string;
  contentType: ContentType;
  identifier: string;
}

interface PatternConfig {
  provider: ProviderId;
  hostname: RegExp;
  regex: RegExp;
  contentType: ContentType;
  extractIdentifier: (url: URL, match: RegExpMatchArray) => string | null;
}

function cleanIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const decoded = decodeURIComponent(trimmed).trim();
    return decoded || null;
  } catch {
    return trimmed;
  }
}

const PATTERNS: PatternConfig[] = [
  {
    provider: 'instagram',
    hostname: /^(?:www\.)?instagram\.com$/i,
    regex: /^\/p\/([^/?#]+)\/?$/i,
    contentType: 'post',
    extractIdentifier: (_, match) => cleanIdentifier(match[1]),
  },
  {
    provider: 'instagram',
    hostname: /^(?:www\.)?instagram\.com$/i,
    regex: /^\/reel\/([^/?#]+)\/?$/i,
    contentType: 'reel',
    extractIdentifier: (_, match) => cleanIdentifier(match[1]),
  },
  {
    provider: 'instagram',
    hostname: /^(?:www\.)?instagram\.com$/i,
    regex: /^\/stories\/([^/?#]+)(?:\/([^/?#]+))?\/?$/i,
    contentType: 'story',
    extractIdentifier: (_, match) => cleanIdentifier(match[2] ?? match[1]),
  },
  {
    provider: 'youtube',
    hostname: /^(?:www\.|m\.)?youtube\.com$/i,
    regex: /^\/watch\/?$/i,
    contentType: 'video',
    extractIdentifier: (url) => cleanIdentifier(url.searchParams.get('v')),
  },
  {
    provider: 'youtube',
    hostname: /^(?:www\.|m\.)?youtube\.com$/i,
    regex: /^\/shorts\/([^/?#]+)\/?$/i,
    contentType: 'video',
    extractIdentifier: (_, match) => cleanIdentifier(match[1]),
  },
  {
    provider: 'youtube',
    hostname: /^youtu\.be$/i,
    regex: /^\/([^/?#]+)\/?$/i,
    contentType: 'video',
    extractIdentifier: (url) => cleanIdentifier(url.pathname.split('/')[1]),
  },
  {
    provider: 'facebook',
    hostname: /^(?:www\.|m\.)?facebook\.com$/i,
    regex: /^\/share\/([^/?#]+)\/?$/i,
    contentType: 'post',
    extractIdentifier: (_, match) => cleanIdentifier(match[1]),
  },
  {
    provider: 'facebook',
    hostname: /^(?:www\.|m\.)?facebook\.com$/i,
    regex: /^\/watch\/?$/i,
    contentType: 'video',
    extractIdentifier: (url) => cleanIdentifier(url.searchParams.get('v')),
  },
  {
    provider: 'facebook',
    hostname: /^fb\.watch$/i,
    regex: /^\/([^/?#]+)\/?$/i,
    contentType: 'post',
    extractIdentifier: (url) => cleanIdentifier(url.pathname.split('/')[1]),
  },
  {
    provider: 'tiktok',
    hostname: /^(?:www\.|m\.)?tiktok\.com$/i,
    regex: /^\/@[^/]+\/video\/([^/?#]+)\/?$/i,
    contentType: 'video',
    extractIdentifier: (_, match) => cleanIdentifier(match[1]),
  },
  {
    provider: 'tiktok',
    hostname: /^vm\.tiktok\.com$/i,
    regex: /^\/([^/?#]+)\/?$/i,
    contentType: 'video',
    extractIdentifier: (url) => cleanIdentifier(url.pathname.split('/')[1]),
  },
  {
    provider: 'tiktok',
    hostname: /^vt\.tiktok\.com$/i,
    regex: /^\/([^/?#]+)\/?$/i,
    contentType: 'video',
    extractIdentifier: (url) => cleanIdentifier(url.pathname.split('/')[1]),
  },
];

function matchPattern(url: URL): PatternConfig | null {
  for (const pattern of PATTERNS) {
    if (!pattern.hostname.test(url.hostname)) continue;

    const match = url.pathname.match(pattern.regex);
    if (match) return pattern;
  }

  return null;
}

export function detect(url: string): DetectedSource | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const pattern = matchPattern(parsed);
  if (!pattern) return null;

  const match = parsed.pathname.match(pattern.regex);
  const identifier = match ? pattern.extractIdentifier(parsed, match) : null;
  if (!identifier) return null;

  return {
    provider: pattern.provider,
    url: normalized,
    contentType: pattern.contentType,
    identifier,
  };
}

export function detectProvider(url: string): ProviderId | null {
  return detect(url)?.provider ?? null;
}

export function isSupportedSource(url: string): boolean {
  return detect(url) !== null;
}

export default detect;
