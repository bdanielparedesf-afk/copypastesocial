import * as instagram from './instagram/client';
import * as facebook from './facebook/client';
import * as tiktok from './tiktok/client';
import * as youtube from './youtube/client';

export const providers = { instagram, facebook, tiktok, youtube } as const;

export function getProvider(name: string) {
  const p = providers[name as keyof typeof providers];
  if (!p) throw new Error(`UNSUPPORTED_PROVIDER: ${name}`);
  return p;
}
