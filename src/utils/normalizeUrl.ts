export interface NormalizeUrlOptions {
  stripQuery?: boolean;
  stripHash?: boolean;
  lowercaseHost?: boolean;
}

const DEFAULT_OPTIONS: NormalizeUrlOptions = {
  stripQuery: false,
  stripHash: true,
  lowercaseHost: true,
};

export function normalizeUrl(url: string, options: NormalizeUrlOptions = {}): string | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const trimmed = url.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.hostname.includes('..')) return null;

    if (opts.lowercaseHost) {
      u.hostname = u.hostname.toLowerCase();
    }

    if (opts.stripQuery) {
      u.search = '';
    }

    if (opts.stripHash) {
      u.hash = '';
    }

    return u.toString();
  } catch {
    return null;
  }
}

export function normalizeUrlStrict(url: string): string | null {
  return normalizeUrl(url, { stripQuery: true, stripHash: true, lowercaseHost: true });
}

export default normalizeUrl;