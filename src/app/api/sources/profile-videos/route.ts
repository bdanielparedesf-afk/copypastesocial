/**
 * API Route: POST /api/sources/profile-videos
 *
 * Retorna la lista de videos/reels/posts de un perfil social dado.
 * Acepta cualquier link de perfil de Instagram, YouTube, Facebook o TikTok.
 *
 * Body: { url: string, platform: string }
 * Response: { videos: VideoItem[] } o { error: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMockEnabled, mockMediaItems } from '@/providers/mock';
import { extractProfileUsername, detectPlatform } from '@/lib/platform-detector';
import { YoutubeSourceProvider } from '@/providers/youtube';
import { FacebookSourceProvider } from '@/providers/facebook';

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface VideoItem {
  id: string;
  url: string;
  thumbnail: string | null;
  title: string;
  duration?: string;
  views?: string;
  /** URL directa del archivo MP4 (cuando la plataforma la expone). */
  directUrl?: string | null;
}

/* ------------------------------------------------------------------ */
/* Validación del body                                                 */
/* ------------------------------------------------------------------ */

const BodySchema = z.object({
  url: z.string().min(1, 'La URL es obligatoria'),
  platform: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers de formateo                                                 */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(viewCount: number | null | undefined): string | undefined {
  if (!viewCount || viewCount <= 0) return undefined;
  if (viewCount >= 1_000_000) return `${(viewCount / 1_000_000).toFixed(1)}M`;
  if (viewCount >= 1_000) return `${(viewCount / 1_000).toFixed(1)}K`;
  return viewCount.toString();
}

/* ------------------------------------------------------------------ */
/* Instagram — fetching de videos de perfil público                   */
/* ------------------------------------------------------------------ */

interface InstagramEdgeNode {
  id: string;
  shortcode: string;
  display_url: string;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  video_url?: string;
  video_view_count?: number;
  video_duration?: number;
  is_video?: boolean;
  taken_at_timestamp?: number;
  thumbnail_src?: string;
  edge_media_to_comment?: { count?: number };
  accessibility_caption?: string;
  dimensions?: { height?: number; width?: number };
}

async function fetchInstagramProfileVideos(profileUrl: string): Promise<VideoItem[]> {
  const username = extractProfileUsername(profileUrl);
  if (!username) return [];

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/',
  };

  // Estrategia 1: Endpoint JSON (?__a=1)
  try {
    const endpoints = [
      `https://www.instagram.com/${username}/?__a=1&__d=dis`,
      `https://www.instagram.com/${username}/?__a=1`,
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        headers: { ...headers, 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        const user = data?.graphql?.user ?? data?.data?.user;
        if (user) {
          const videos = parseInstagramUser(user, username);
          if (videos.length > 0) return videos;
        }
      }
    }
  } catch { /* siguiente estrategia */ }

  // Estrategia 2: Scraping del HTML de la página del perfil
  try {
    const res = await fetch(`https://www.instagram.com/${username}/`, { headers });
    if (res.ok) {
      const html = await res.text();

      // Buscar _sharedData en el HTML
      const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});<\/script>/);
      if (sharedDataMatch) {
        const sharedData = JSON.parse(sharedDataMatch[1]);
        const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
        if (user) {
          const videos = parseInstagramUser(user, username);
          if (videos.length > 0) return videos;
        }
      }

      // Buscar additional_data en el HTML (formato más reciente)
      const additionalDataMatch = html.match(/window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\s*\)/);
      if (additionalDataMatch) {
        const additionalData = JSON.parse(additionalDataMatch[1]);
        const user = additionalData?.graphql?.user ?? additionalData?.data?.user;
        if (user) {
          const videos = parseInstagramUser(user, username);
          if (videos.length > 0) return videos;
        }
      }

      // Buscar el ID del usuario en el HTML para hacer otra petición
      const userIdMatch = html.match(/"profilePage_([0-9]+)"/) ?? html.match(/"user_id":"([0-9]+)"/);
      if (userIdMatch) {
        const userId = userIdMatch[1];
        const videos = await fetchInstagramByUserId(userId, username, headers);
        if (videos.length > 0) return videos;
      }
    }
  } catch { /* fallback vacío */ }

  return [];
}

function parseInstagramUser(user: Record<string, unknown>, username: string): VideoItem[] {
  const timeline = (user as Record<string, unknown>).edge_owner_to_timeline_media as { edges?: Array<{ node?: InstagramEdgeNode }> } | undefined;
  const reel = (user as Record<string, unknown>).edge_felix_video_timeline as { edges?: Array<{ node?: InstagramEdgeNode }> } | undefined;

  const timelineEdges = timeline?.edges ?? [];
  const reelEdges = reel?.edges ?? [];
  const allEdges = [...timelineEdges, ...reelEdges];

  const seenShortcodes = new Set<string>();
  const videos: VideoItem[] = [];

  for (const edge of allEdges) {
    const node = edge.node;
    if (!node || seenShortcodes.has(node.shortcode)) continue;
    seenShortcodes.add(node.shortcode);

    const captionEdges = node.edge_media_to_caption?.edges;
    const caption = captionEdges?.[0]?.node?.text ?? null;
    const views = node.video_view_count ?? null;
    const duration = node.video_duration ?? null;
    const thumbnail = node.thumbnail_src ?? node.display_url ?? null;

    videos.push({
      id: node.shortcode,
      url: `https://www.instagram.com/p/${node.shortcode}/`,
      thumbnail,
      title: caption ? (caption.length > 80 ? caption.substring(0, 80) + '…' : caption) : `Post de ${username}`,
      duration: node.is_video && duration ? formatDuration(duration) : undefined,
      views: views ? formatViews(views) : undefined,
      directUrl: node.is_video ? (node.video_url ?? null) : null,
    });
  }

  return videos;
}

async function fetchInstagramByUserId(
  userId: string,
  username: string,
  headers: Record<string, string>
): Promise<VideoItem[]> {
  try {
    // Usar la GraphQL API no oficial de Instagram
    const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=003056d32c2554def87228bc3fd9668a&variables=${encodeURIComponent(JSON.stringify({ id: userId, first: 50 }))}`;

    const res = await fetch(graphqlUrl, {
      headers: {
        ...headers,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const user = data?.data?.user;
    if (!user) return [];

    return parseInstagramUser(user as Record<string, unknown>, username);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* YouTube — fetching de videos de canal                              */
/* ------------------------------------------------------------------ */

async function fetchYouTubeProfileVideos(profileUrl: string): Promise<VideoItem[]> {
  const provider = new YoutubeSourceProvider();
  const items = await provider.fetchMetadata(profileUrl);

  return items.map((item): VideoItem => ({
    id: item.externalId ?? item.url,
    url: item.url,
    thumbnail: item.thumbnailUrl,
    title: item.title ?? 'Video sin título',
    duration: item.duration ? formatDuration(item.duration) : undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Facebook — fetching de videos de página                            */
/* ------------------------------------------------------------------ */

async function fetchFacebookProfileVideos(profileUrl: string): Promise<VideoItem[]> {
  const provider = new FacebookSourceProvider();
  const items = await provider.fetchMetadata(profileUrl);

  return items.map((item): VideoItem => ({
    id: item.externalId ?? item.url,
    url: item.url,
    thumbnail: item.thumbnailUrl,
    title: item.title ?? 'Video sin título',
  }));
}

/* ------------------------------------------------------------------ */
/* TikTok — fetching de videos de perfil                              */
/* ------------------------------------------------------------------ */

async function fetchTikTokProfileVideos(profileUrl: string): Promise<VideoItem[]> {
  const username = extractProfileUsername(profileUrl);
  if (!username) return [];

  try {
    const endpoint = `https://www.tiktok.com/@${username}`;
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const dataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.+?)<\/script>/);
    if (!dataMatch) return [];

    const parsed = JSON.parse(dataMatch[1]);
    const userDetail = parsed?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
    const itemList = userDetail?.itemList ?? userDetail?.items ?? [];

    if (!Array.isArray(itemList) || itemList.length === 0) return [];

    return itemList.slice(0, 50).map((item: Record<string, unknown>): VideoItem => {
      const desc = (item.desc as string) ?? (item.description as string) ?? '';
      const stats = item.stats as Record<string, number> | undefined;
      const video = item.video as Record<string, string> | undefined;
      const playAddr = video?.playAddr ?? video?.playAddrH264 ?? null;
      const directUrl = playAddr
        ? (playAddr.startsWith('//') ? `https:${playAddr}` : playAddr)
        : null;
      return {
        id: (item.id as string) ?? '',
        url: `https://www.tiktok.com/@${username}/video/${item.id}`,
        thumbnail: ((item.cover as string) ?? video?.cover) ?? null,
        title: desc.length > 80 ? desc.substring(0, 80) + '…' : (desc || `Video de ${username}`),
        views: stats?.playCount ? formatViews(stats.playCount) : undefined,
        directUrl,
      };
    }).filter((v: VideoItem) => v.id);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Mock fallback                                                       */
/* ------------------------------------------------------------------ */

function getMockVideos(url: string, platform: string): VideoItem[] {
  const username = extractProfileUsername(url) ?? 'usuario';
  const items = mockMediaItems(
    platform as 'instagram' | 'youtube' | 'facebook',
    username,
    'profile',
    'video'
  );

  return items.map((item) => ({
    id: item.externalId ?? '',
    url: item.url,
    thumbnail: item.thumbnailUrl,
    title: item.title ?? 'Video de ejemplo',
    duration: item.duration ? formatDuration(item.duration) : undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Handler POST                                                        */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { url, platform: bodyPlatform } = parsed.data;
  const platform = bodyPlatform ?? detectPlatform(url).platform;

  // Mock mode para desarrollo
  if (isMockEnabled()) {
    const videos = getMockVideos(url, platform);
    return NextResponse.json({ videos });
  }

  try {
    let videos: VideoItem[] = [];

    switch (platform) {
      case 'instagram':
        videos = await fetchInstagramProfileVideos(url);
        break;
      case 'youtube':
        videos = await fetchYouTubeProfileVideos(url);
        break;
      case 'facebook':
        videos = await fetchFacebookProfileVideos(url);
        break;
      case 'tiktok':
        videos = await fetchTikTokProfileVideos(url);
        break;
      default:
        videos = await fetchInstagramProfileVideos(url);
        if (videos.length === 0) {
          videos = await fetchYouTubeProfileVideos(url);
        }
        break;
    }

    return NextResponse.json({ videos });
  } catch (error) {
    return NextResponse.json(
      {
        videos: [],
        error: error instanceof Error ? error.message : 'Error al obtener videos del perfil',
      },
      { status: 200 }
    );
  }
}