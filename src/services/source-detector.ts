import type { SocialSourceProvider, SourceContentType, SourceDetectionResult } from '@/types/source';

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function normalizeSourceUrl(url: string): string {
  let normalized = url.trim();
  normalized = ensureProtocol(normalized);

  try {
    const parsed = new URL(normalized);

    const searchParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!key.toLowerCase().startsWith('utm_')) {
        searchParams.set(key, value);
      }
    }

    parsed.search = searchParams.toString();
    parsed.hash = '';
    normalized = parsed.toString();
  } catch {
    const stripped = url.replace(/[#?].*$/, '').trim();
    normalized = ensureProtocol(stripped);
  }

  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

function detectProviderAndType(url: string): { provider: SocialSourceProvider; contentType: SourceContentType; identifier: string } | null {
  const normalized = ensureProtocol(url);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname || '/';

  if (hostname.startsWith('instagram.com')) {
    const postMatch = path.match(/^\/p\/([^/?#]+)/);
    if (postMatch) {
      return { provider: 'instagram', contentType: 'post', identifier: postMatch[1] };
    }

    const reelMatch = path.match(/^\/reel\/([^/?#]+)/);
    if (reelMatch) {
      return { provider: 'instagram', contentType: 'reel', identifier: reelMatch[1] };
    }

    const storiesMatch = path.match(/^\/stories\/([^/?#]+)/);
    if (storiesMatch) {
      return { provider: 'instagram', contentType: 'profile', identifier: storiesMatch[1] };
    }

    const profileMatch = path.match(/^\/([^\/?#]+)/);
    if (profileMatch) {
      const segment = profileMatch[1];
      if (segment !== 'p' && segment !== 'reel' && segment !== 'stories') {
        return { provider: 'instagram', contentType: 'profile', identifier: segment };
      }
    }
  }

  if (hostname.startsWith('youtube.com')) {
    if (path.match(/^\/watch/)) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return { provider: 'youtube', contentType: 'video', identifier: videoId };
      }
    }

    const shortsMatch = path.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      return { provider: 'youtube', contentType: 'short', identifier: shortsMatch[1] };
    }

    const atMatch = path.match(/^\/@([^/?#]+)/);
    if (atMatch) {
      return { provider: 'youtube', contentType: 'profile', identifier: atMatch[1] };
    }

    const channelMatch = path.match(/^\/channel\/([^/?#]+)/);
    if (channelMatch) {
      return { provider: 'youtube', contentType: 'profile', identifier: channelMatch[1] };
    }
  }

  if (hostname === 'youtu.be') {
    const match = path.match(/^\/([^/?#]+)/);
    if (match) {
      return { provider: 'youtube', contentType: 'video', identifier: match[1] };
    }
  }

  if (hostname.startsWith('facebook.com')) {
    const shareMatch = path.match(/^\/share\/([^/?#]+)/);
    if (shareMatch) {
      return { provider: 'facebook', contentType: 'post', identifier: shareMatch[1] };
    }

    const videosMatch = path.match(/^\/[^/]+\/videos\/([^/?#]+)/);
    if (videosMatch) {
      return { provider: 'facebook', contentType: 'video', identifier: videosMatch[1] };
    }

    if (path.match(/^\/watch/)) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return { provider: 'facebook', contentType: 'video', identifier: videoId };
      }
      const segments = path.split('/').filter(Boolean);
      if (segments.length >= 2) {
        return { provider: 'facebook', contentType: 'video', identifier: segments[1] };
      }
    }
  }

  if (hostname.startsWith('fb.watch')) {
    const match = path.match(/^\/([^/?#]+)/);
    if (match) {
      return { provider: 'facebook', contentType: 'video', identifier: match[1] };
    }
  }

  return null;
}

export function detectSource(url: string): SourceDetectionResult {
  const originalUrl = url.trim();
  const normalized = normalizeSourceUrl(originalUrl);

  const detected = detectProviderAndType(normalized);

  if (detected) {
    return {
      provider: detected.provider,
      url: normalized,
      contentType: detected.contentType,
      identifier: detected.identifier,
      originalUrl,
    };
  }

  return {
    provider: 'unsupported',
    url: normalized,
    contentType: 'profile',
    identifier: '',
    originalUrl,
  };
}
