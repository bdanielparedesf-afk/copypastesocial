export const SUPPORTED_PROVIDERS = ['instagram', 'youtube', 'facebook', 'tiktok'] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}