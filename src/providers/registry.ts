import { InstagramProvider } from './instagram/index';
import { YoutubeProvider } from './youtube/index';
import { FacebookProvider } from './facebook/index';
import { TikTokProvider } from './tiktok/index';
import type { BaseProvider } from './index';

export const providers: BaseProvider[] = [
  new InstagramProvider(),
  new YoutubeProvider(),
  new FacebookProvider(),
  new TikTokProvider(),
];

export function getProvider(id: string): BaseProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function getProviderForHostname(hostname: string): BaseProvider | undefined {
  return providers.find((p) => p.canHandle(hostname));
}

export function getProviderForUrl(url: string): BaseProvider | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return getProviderForHostname(hostname);
  } catch {
    return undefined;
  }
}