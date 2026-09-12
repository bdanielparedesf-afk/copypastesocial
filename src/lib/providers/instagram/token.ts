/**
 * FASE 9 — Gestión de tokens de Instagram en `provider_tokens`.
 *
 * - saveInstagramToken(userId, result, profile): guarda (upsert) el
 *   token long-lived en `provider_tokens` y sincroniza `social_accounts`
 *   (estos tokens SIEMPRE van encriptados con TokenService).
 * - refreshExpiringTokens({ thresholdDays = 5 }): job cron que detecta
 *   tokens a <= 5 días de expirar y los re-intercambia con
 *   `fb_exchange_token` (~60 días más). Idempotente y sin romper dev.
 */
import { createServerClient } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';
import { errorFactory } from '@/utils/errors';
import { refreshToken, type InstagramProfile, type TokenResult } from './auth';

/** Umbral del job cron: refresca si quedan 5 días o menos de vigencia. */
export const REFRESH_THRESHOLD_DAYS = 5;

export interface SaveInstagramTokenOptions {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  profile: InstagramProfile;
  scopes?: string[];
}

export interface RefreshExpiringTokensResult {
  checked: number;
  refreshed: number;
  failed: number;
  errors: string[];
}

async function getOrCreateSocialAccount(
  admin: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  profile: InstagramProfile
): Promise<string> {
  const { data: existing } = await admin
    .from('social_accounts')
    .select('id, username')
    .eq('user_id', userId)
    .eq('provider', 'instagram')
    .eq('username', profile.username)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data: inserted, error } = await admin
    .from('social_accounts')
    .insert({
      user_id: userId,
      provider: 'instagram',
      username: profile.username,
      access_token: '',
      refresh_token: null,
      expires_at: null,
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
      is_valid: true,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw errorFactory({
      provider: 'instagram',
      status: 500,
      message: `Error creando social_account: ${error?.message ?? 'sin datos'}`,
      body: error,
    });
  }
  return String(inserted.id);
}

/**
 * Guarda (upsert idempotente) el token long-lived de Instagram en
 * `provider_tokens` y sincroniza `social_accounts`.
 */
export async function saveInstagramToken(
  userId: string,
  options: SaveInstagramTokenOptions
): Promise<string> {
  const admin = createServerClient();

  const socialAccountId = await getOrCreateSocialAccount(admin, userId, options.profile);

  const encryptedAccess = tokenService.encrypt(options.accessToken);
  const encryptedRefresh = options.refreshToken
    ? tokenService.encrypt(options.refreshToken)
    : null;

  await admin.from('provider_tokens').upsert(
    {
      user_id: userId,
      social_account_id: socialAccountId,
      provider: 'instagram',
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_type: 'long-lived',
      ig_user_id: options.profile.id,
      username: options.profile.username,
      scopes: options.scopes ?? ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
      expires_at:
        options.expiresAt ??
        new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      is_valid: true,
      needs_refresh: false,
      last_refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider,username', ignoreDuplicates: false }
  );

  // Sincronizar social_accounts con el token nuevo (encriptado).
  const { error: accountError } = await admin
    .from('social_accounts')
    .update({
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: options.expiresAt,
      is_valid: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', socialAccountId);

  if (accountError) {
    throw errorFactory({
      provider: 'instagram',
      status: 500,
      message: `Error actualizando social_accounts: ${accountError.message}`,
      body: accountError,
    });
  }

  return socialAccountId;
}
/**
 * Job cron de refresh: busca tokens de Instagram con `expires_at` dentro del
 * umbral (por defecto 5 días) y `is_valid = true`, y los re-intercambia con
 * `fb_exchange_token`. Actualiza la fila en `provider_tokens` con el token
 * nuevo. Nunca borra tokens: solo marca `is_valid = false` si falla.
 */
export async function refreshExpiringTokens(
  options: { thresholdDays?: number } = {}
): Promise<RefreshExpiringTokensResult> {
  const thresholdDays = options.thresholdDays ?? REFRESH_THRESHOLD_DAYS;
  const admin = createServerClient();

  const cutoff = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from('provider_tokens')
    .select('*')
    .eq('provider', 'instagram')
    .eq('is_valid', true)
    .lte('expires_at', cutoff)
    .order('expires_at', { ascending: true });

  if (error) {
    throw errorFactory({
      provider: 'instagram',
      status: 500,
      message: `refreshExpiringTokens: ${error.message}`,
      body: error,
    });
  }

  const result: RefreshExpiringTokensResult = {
    checked: rows?.length ?? 0,
    refreshed: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows ?? []) {
    const decrypted = tokenService.decrypt(String(row.refresh_token ?? row.access_token));
    if (!decrypted) {
      result.failed += 1;
      result.errors.push(`Token ${row.id} sin refresh_token válido`);
      continue;
    }

    try {
      const refreshed: TokenResult = await refreshToken(decrypted);
      const encryptedAccess = tokenService.encrypt(refreshed.accessToken);
      const encryptedRefresh = refreshed.refreshToken
        ? tokenService.encrypt(refreshed.refreshToken)
        : encryptedAccess;

      await admin
        .from('provider_tokens')
        .update({
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          expires_at: refreshed.expiresAt ?? cutoff,
          is_valid: true,
          needs_refresh: false,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq('id', String(row.id));

      // Sincronizar también social_accounts (mismo token encriptado).
      if (row.social_account_id) {
        await admin
          .from('social_accounts')
          .update({
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: refreshed.expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', String(row.social_account_id));
      }

      result.refreshed += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(err instanceof Error ? err.message : String(err));
      await admin
        .from('provider_tokens')
        .update({ is_valid: false, needs_refresh: true })
        .eq('id', String(row.id));
    }
  }

  return result;
}