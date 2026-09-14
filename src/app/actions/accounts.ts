'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';
import type { SocialAccount, ProviderId } from '@/types';

export interface SocialAccountView {
  id: string;
  provider: ProviderId;
  username: string;
  isValid: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export async function listSocialAccounts(): Promise<SocialAccountView[]> {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, provider, username, is_valid, expires_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider as ProviderId,
    username: row.username,
    isValid: row.is_valid,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function revokeAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      return { success: false, error: 'Cuenta no encontrada' };
    }

    const account: SocialAccount = {
      id: data.id,
      userId: data.user_id,
      provider: data.provider as ProviderId,
      username: data.username,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      scopes: data.scopes ?? [],
      isValid: data.is_valid,
    };

    await tokenService.revoke(account);

    revalidatePath('/accounts');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al revocar cuenta',
    };
  }
}

export function getOAuthUrl(provider: ProviderId): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  switch (provider) {
    case 'facebook': {
      const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=facebook&scope=pages_manage_posts,pages_read_engagement,pages_show_list`;
    }
    case 'instagram': {
      const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=instagram&scope=instagram_basic,instagram_content_publish,pages_show_list`;
    }
    case 'youtube': {
      const redirectUri = `${baseUrl}/api/auth/youtube/callback`;
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=youtube&response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/youtube.upload`;
    }
    case 'tiktok': {
      const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
      return `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&state=tiktok&scope=user.info.basic,video.publish&response_type=code`;
    }
    default:
      return '#';
  }
}

