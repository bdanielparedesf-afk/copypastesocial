export type Platform = 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'unknown';

export function detectPlatform(url: string) {
  const u = url.trim().toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { platform: 'youtube' as const, originalUrl: url };
  if (u.includes('instagram.com')) return { platform: 'instagram' as const, originalUrl: url };
  if (u.includes('tiktok.com') || u.includes('vm.tiktok.com') || u.includes('vt.tiktok.com')) return { platform: 'tiktok' as const, originalUrl: url };
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com') || u.includes('/share/')) return { platform: 'facebook' as const, originalUrl: url };
  return { platform: 'unknown' as const, originalUrl: url };
}

/**
 * Returns true if the URL is a PROFILE URL (not a single video/post).
 * Profile URLs don't contain /reel/, /video/, /watch, /p/, /shorts/, /share/ patterns.
 */
export function isProfileUrl(url: string): boolean {
  const profilePatterns = /\/(reel|video|watch|p|shorts|share|videos)\//i;
  return !profilePatterns.test(url);
}

/**
 * Extracts a YouTube video ID from various URL formats.
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu.be\/|shorts\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts a TikTok video ID from various URL formats.
 */
export function extractTikTokId(url: string): string | null {
  // tiktok.com/@user/video/123456789
  const videoMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  if (videoMatch) return videoMatch[1];

  // vm.tiktok.com/ZM123/ or vt.tiktok.com/ZM123/
  const shortMatch = url.match(/v[mt]\.tiktok\.com\/([a-zA-Z0-9]+)/);
  if (shortMatch) return shortMatch[1];

  return null;
}

/**
 * Extracts an Instagram post/reel ID.
 */
export function extractInstagramId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts a Facebook video/post identifier.
 */
export function extractFacebookId(url: string): string | null {
  // /share/19P6MutGu3/
  const shareMatch = url.match(/\/share\/([^/?#]+)/);
  if (shareMatch) return shareMatch[1];

  // /watch/?v=123456
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return watchMatch[1];

  // /videos/123456/
  const videosMatch = url.match(/\/videos\/([^/?#]+)/);
  if (videosMatch) return videosMatch[1];

  // fb.watch/xxxxx
  const fbWatchMatch = url.match(/fb\.watch\/([^/?#]+)/);
  if (fbWatchMatch) return fbWatchMatch[1];

  return null;
}

/**
 * Returns the embed URL for any supported video URL.
 * This is purely client-side, no API calls needed.
 */
export function getEmbedUrl(url: string): string | null {
  const { platform } = detectPlatform(url);

  switch (platform) {
    case 'youtube': {
      const id = extractYouTubeId(url);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    case 'instagram': {
      const id = extractInstagramId(url);
      if (id) return `https://www.instagram.com/p/${id}/embed/?utm_source=ig_embed`;
      return null;
    }
    case 'tiktok': {
      const id = extractTikTokId(url);
      if (id) return `https://www.tiktok.com/embed/${id}`;
      return null;
    }
    case 'facebook': {
      // Facebook always works with the plugins/video.php embed
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    }
    default:
      return null;
  }
}

/**
 * Extracts username/handle from a profile URL.
 */
export function extractProfileUsername(url: string): string | null {
  const { platform } = detectPlatform(url);

  switch (platform) {
    case 'youtube': {
      const match = url.match(/youtube\.com\/@([^/?#]+)/);
      return match ? match[1] : null;
    }
    case 'instagram': {
      const match = url.match(/instagram\.com\/([^/?#]+)/);
      return match && !['p', 'reel', 'stories'].includes(match[1]) ? match[1] : null;
    }
    case 'tiktok': {
      const match = url.match(/tiktok\.com\/@([^/?#]+)/);
      return match ? match[1] : null;
    }
    case 'facebook': {
      const match = url.match(/facebook\.com\/([^/?#]+)/);
      return match && !['watch', 'videos', 'share', 'reel'].includes(match[1]) ? match[1] : null;
    }
    default:
      return null;
  }
}
