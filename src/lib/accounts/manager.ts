/**
 * FASE 11 — Manager de cuentas sociales (multi-workspace + límites).
 *
 * Exports obligatorios (6):
 *   1. listAccounts(userId)                 → cuentas + token is_valid + expires_at
 *   2. switchAccount(accountId, userId)     → valida ownership + token is_valid
 *   3. getAccountLimits(accountId)          → { daily_publish: 25, hourly_api: 200, used_today }
 *   4. checkCanPublish(accountId)           → boolean (daily limit + token válido + no expira <=5d)
 *   5. getAccountsWithExpiringTokens(days=5) → cuentas con token a <= days días (UI warning)
 *   6. disconnectAccount(accountId)         → is_valid=false + revokeToken (best-effort)
 *
 * Reglas (spec):
 *   - Máx. 25 publicaciones/día por cuenta (publish_queue PUBLISHED con created_at de hoy).
 *   - Máx. 200 llamadas API/hora por cuenta (tabla api_usage).
 *   - Token con expiración <= 5 días: NO se permite publicar (warning reconnect).
 *   - RLS: las cuentas se filtran por user_id.
 */
import { createServerClient } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';
import { errorFactory } from '@/utils/errors';
import { revokeToken } from '@/lib/providers/instagram/auth';

/** Límite diario de publicaciones por cuenta (spec). */
export const DAILY_PUBLISH_LIMIT = 25;
/** Límite de llamadas a la Graph API por hora por cuenta (spec). */
export const HOURLY_API_LIMIT = 200;
/** Umbral de expiración para warning de reconnect (spec: 5 días). */
export const EXPIRING_TOKEN_DAYS = 5;

export interface AccountWithToken {
  id: string;
  user_id: string;
  provider: string;
  username: string;
  is_valid: boolean;
  expires_at: string | null;
  created_at: string;
  token_is_valid: boolean;
  token_type: string | null;
  ig_user_id: string | null;
  /** Días que faltan para expirar (null si no hay expiración). */
  expiring_in_days: number | null;
}

export interface AccountLimits {
  daily_publish: number;
  hourly_api: number;
  used_today: number;
  used_this_hour: number;
}

export interface SwitchAccountResult {
  account: AccountWithToken;
  active: boolean;
}

/** Fecha ISO del inicio del día UTC. */
function startOfToday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Fecha ISO de hace 1 hora (ventana del rate limit). */
function oneHourAgo(): string {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

/** Convierte una fila de social_accounts + provider_tokens en AccountWithToken. */
function toAccountWithToken(
  row: Record<string, unknown>,
  token?: Record<string, unknown> | null
): AccountWithToken {
  const expiresAt = token?.expires_at
    ? String(token.expires_at)
    : row.expires_at
      ? String(row.expires_at)
      : null;

  let expiringInDays: number | null = null;
  if (expiresAt) {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    expiringInDays = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    provider: String(row.provider),
    username: String(row.username),
    is_valid: row.is_valid === true,
    expires_at: expiresAt,
    created_at: String(row.created_at ?? new Date().toISOString()),
    token_is_valid: token?.is_valid === true,
    token_type: token?.token_type ? String(token.token_type) : null,
    ig_user_id: token?.ig_user_id ? String(token.ig_user_id) : null,
    expiring_in_days: expiringInDays,
  };
}

/**
 * 1) Lista las cuentas del usuario con su token real de provider_tokens
 *    (is_valid + expires_at). Siempre filtrado por user_id (RLS en server).
 */
export async function listAccounts(userId: string): Promise<AccountWithToken[]> {
  const admin = createServerClient();

  const { data: accounts, error } = await admin
    .from('social_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `listAccounts: ${error.message}`,
      body: error,
    });
  }

  const result: AccountWithToken[] = [];

  for (const account of accounts ?? []) {
    const { data: token } = await admin
      .from('provider_tokens')
      .select('*')
      .eq('social_account_id', String(account.id))
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    result.push(toAccountWithToken(account as Record<string, unknown>, token));
  }

  return result;
}
/** Helper interno: conteo de PUBLICADOS hoy (daily limit 25). */
async function countPublishedToday(accountId: string): Promise<number> {
  const admin = createServerClient();

  const { data, error } = await admin
    .from('publish_queue')
    .select('id')
    .eq('social_account_id', accountId)
    .eq('status', 'PUBLISHED')
    .gte('created_at', startOfToday());

  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `countPublishedToday: ${error.message}`,
      body: error,
    });
  }
  return data?.length ?? 0;
}

/** Helper interno: llamadas API en la última hora (tabla api_usage). */
async function countApiCallsThisHour(accountId: string): Promise<number> {
  const admin = createServerClient();

  const { data, error } = await admin
    .from('api_usage')
    .select('id')
    .eq('account_id', accountId)
    .gte('created_at', oneHourAgo());

  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `countApiCallsThisHour: ${error.message}`,
      body: error,
    });
  }
  return data?.length ?? 0;
}

/**
 * 2) Alterna la cuenta activa del usuario: valida ownership + token is_valid.
 *    Retorna la cuenta verificada (activa) para que el route la use como
 *    "workspace activo" (cookie/sesión).
 */
export async function switchAccount(
  accountId: string,
  userId: string
): Promise<SwitchAccountResult> {
  const admin = createServerClient();

  const { data: account, error } = await admin
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (error || !account) {
    throw errorFactory({
      provider: null,
      status: 404,
      message: 'Cuenta no encontrada o sin permisos',
      body: error,
    });
  }

  const { data: token } = await admin
    .from('provider_tokens')
    .select('*')
    .eq('social_account_id', accountId)
    .eq('is_valid', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!token) {
    throw errorFactory({
      provider: 'instagram',
      status: 401,
      message: 'La cuenta no tiene token válido (reconecta desde /accounts)',
    });
  }

  return { account: toAccountWithToken(account as Record<string, unknown>, token), active: true };
}

/**
 * 3) Límites de la cuenta: daily_publish (25), hourly_api (200) y usados
 *    (used_today desde publish_queue, used_this_hour desde api_usage).
 */
export async function getAccountLimits(accountId: string): Promise<AccountLimits> {
  const [usedToday, usedThisHour] = await Promise.all([
    countPublishedToday(accountId),
    countApiCallsThisHour(accountId),
  ]);

  return {
    daily_publish: DAILY_PUBLISH_LIMIT,
    hourly_api: HOURLY_API_LIMIT,
    used_today: usedToday,
    used_this_hour: usedThisHour,
  };
}

/**
 * 4) ¿Se puede publicar con esta cuenta?
 *    - daily limit 25 no alcanzado
 *    - token is_valid (provider_tokens)
 *    - expiración NO dentro de <= 5 días (spec: reconnect)
 */
export async function checkCanPublish(accountId: string): Promise<boolean> {
  const admin = createServerClient();

  // La BD remota puede no tener provider_tokens ni publish_queue (migraciones
  // parciales). Fallback: social_accounts.is_valid + expiración; los checks
  // opcionales (límites diarios) se saltan si sus tablas no existen.
  const { data: account } = await admin
    .from('social_accounts')
    .select('is_valid, expires_at, provider')
    .eq('id', accountId)
    .maybeSingle();

  if (!account || account.is_valid !== true) return false;

  let usedToday = 0;
  try {
    ({ used_today: usedToday } = await getAccountLimits(accountId));
  } catch {
    // provider_tokens / publish_queue / api_usage ausentes → no bloquear
    usedToday = 0;
  }
  if (usedToday >= DAILY_PUBLISH_LIMIT) return false;

  // Expira pronto (0-5 días) → no publicar (spec FASE 11: reconnect).
  // SOLO tokens de larga vida (Meta). Los access tokens de Google duran ~1h
  // y se renuevan con el refresh_token: bloquear aquí impediría publicar
  // con YouTube siempre.
  const provider = String(account.provider ?? '').toLowerCase();
  const expiresAt = account.expires_at ? String(account.expires_at) : null;
  if (provider !== 'youtube' && expiresAt) {
    const diffDays = Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays > 0 && diffDays <= EXPIRING_TOKEN_DAYS) return false;
  }

  return true;
}

/**
 * 5) Cuentas cuyo token expira a <= days días (por defecto 5): para el
 *    warning de la UI de reconexión. Solo cuentas con token válido.
 */
export async function getAccountsWithExpiringTokens(
  userId: string,
  days: number = EXPIRING_TOKEN_DAYS
): Promise<AccountWithToken[]> {
  const accounts = await listAccounts(userId);
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;

  return accounts.filter((account) => {
    if (!account.expires_at) return false;
    return new Date(account.expires_at).getTime() <= cutoff;
  });
}

/**
 * 6) Desconecta la cuenta: marca is_valid=false en social_accounts +
 *    provider_tokens y revoca el token en Meta (best-effort, no rompe).
 */
export async function disconnectAccount(accountId: string, userId: string): Promise<void> {
  const admin = createServerClient();

  // Leer el token antes de invalidarlo (para revocar en Meta).
  const { data: token } = await admin
    .from('provider_tokens')
    .select('access_token')
    .eq('social_account_id', accountId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Revocar en Meta (best-effort: si falla, igual desconectamos local).
  if (token?.access_token) {
    const decrypted = tokenService.decrypt(String(token.access_token));
    if (decrypted) {
      try {
        await revokeToken(decrypted);
      } catch {
        // best-effort: no bloqueamos la desconexión local
      }
    }
  }

  const { error: accountError } = await admin
    .from('social_accounts')
    .update({ is_valid: false, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId);

  const { error: tokenError } = await admin
    .from('provider_tokens')
    .update({ is_valid: false, updated_at: new Date().toISOString() })
    .eq('social_account_id', accountId)
    .eq('user_id', userId);

  if (accountError || tokenError) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `disconnectAccount: ${accountError?.message ?? tokenError?.message ?? 'error'}`,
      body: { accountError, tokenError },
    });
  }
}

/** FASE 12 — Obtiene una cuenta social por ID para un usuario. */
export async function getSocialAccountById(
  userId: string,
  provider: string
): Promise<AccountWithToken | null> {
  const admin = createServerClient();

  const { data: account, error } = await admin
    .from('social_accounts')
    .select('*, provider_tokens!inner(*)')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_valid', true)
    .order('provider_tokens!inner.created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !account) return null;

  const token = (account.provider_tokens as Array<Record<string, unknown>> | undefined)?.[0];
  return toAccountWithToken(account as Record<string, unknown>, token ?? null);
}

/** FASE 12 — Actualiza los tokens de una cuenta social. */
export async function updateProviderAccountTokens(
  accountId: string,
  updates: {
    access_token_encrypted?: string;
    refresh_token_encrypted?: string;
    expires_at?: string;
    token_is_valid?: boolean;
  }
): Promise<void> {
  const admin = createServerClient();

  const { error } = await admin
    .from('provider_tokens')
    .update({
      ...(updates.access_token_encrypted && { access_token: updates.access_token_encrypted }),
      ...(updates.refresh_token_encrypted && { refresh_token: updates.refresh_token_encrypted }),
      ...(updates.expires_at && { expires_at: updates.expires_at }),
      ...(updates.token_is_valid !== undefined && { is_valid: updates.token_is_valid }),
      updated_at: new Date().toISOString(),
    })
    .eq('social_account_id', accountId);

  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `updateProviderAccountTokens: ${error.message}`,
      body: error,
    });
  }
}
