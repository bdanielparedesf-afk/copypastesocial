import { config } from '@/config';
import { AppError, errorFactory } from '@/utils/errors';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from './crypto';
import type { SocialAccount, ProviderId } from '@/types';

export interface TokenServiceDeps {
  fetch?: typeof fetch;
}

/**
 * Representación genérica de las respuestas JSON devueltas por los
 * endpoints de refresh token de Meta, Google y TikTok. Sólo nos
 * interesan `access_token`, `refresh_token` y `expires_in`.
 */
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

export class TokenService {
  private readonly fetchImpl: typeof fetch;

    constructor(deps: TokenServiceDeps = {}) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
  }

  private get key(): string {
    const key = config.encryption.key;
    if (!key) {
      throw new AppError({
        code: 'UNKNOWN',
        message: 'ENCRYPTION_KEY no está configurado',
        statusCode: 500,
        isRetryable: false,
      });
    }
    return key;
  }

  encrypt(text: string): string {
    if (!text) return '';
    return encrypt(text, this.key);
  }

  decrypt(encrypted: string): string {
    if (!encrypted) return '';
    return decrypt(encrypted, this.key);
  }

  async refresh(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AppError({
        code: 'AUTH_REQUIRED',
        message: 'No hay refresh token disponible',
        statusCode: 401,
        provider: account.provider,
        isRetryable: false,
      });
    }

    const decryptedRefresh = this.decrypt(account.refreshToken);

    switch (account.provider) {
      case 'instagram':
      case 'facebook':
        return this.refreshMeta(account, decryptedRefresh);
      case 'youtube':
        return this.refreshGoogle(account, decryptedRefresh);
      case 'tiktok':
        return this.refreshTikTok(account, decryptedRefresh);
      default:
        throw new AppError({
          code: 'UNSUPPORTED',
          message: `Provider ${account.provider} no soporta refresh`,
          statusCode: 400,
          provider: account.provider,
          isRetryable: false,
        });
    }
  }

  private async refreshMeta(account: SocialAccount, refreshToken: string): Promise<SocialAccount> {
    const cfg = config.providers.facebook;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cfg.appId ?? '',
      client_secret: cfg.appSecret ?? '',
      refresh_token: refreshToken,
    });

    const res = await this.fetchImpl(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await this.parseJson(res);

    if (!res.ok || !data.access_token) {
      throw errorFactory({
        provider: account.provider,
        status: res.status,
        message: (data as { error_description?: string })?.error_description ?? (data as { error?: { message?: string } })?.error?.message,
        body: data,
      });
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

    return this.updateAccount(account, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
    });
  }

  private async refreshGoogle(account: SocialAccount, refreshToken: string): Promise<SocialAccount> {
    const cfg = config.providers.youtube;
    const body = new URLSearchParams({
      client_id: cfg.clientId ?? '',
      client_secret: cfg.clientSecret ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await this.parseJson(res);

    if (!res.ok || !data.access_token) {
      throw errorFactory({
        provider: account.provider,
        status: res.status,
        message: (data as { error_description?: string })?.error_description,
        body: data,
      });
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

    return this.updateAccount(account, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
    });
  }

  private async refreshTikTok(account: SocialAccount, refreshToken: string): Promise<SocialAccount> {
    const cfg = config.providers.tiktok;
    const res = await this.fetchImpl(`${cfg.baseUrl}/v2/oauth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`,
      },
      body: JSON.stringify({
        client_key: cfg.clientKey,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await this.parseJson(res);

    if (!res.ok || !data.access_token) {
      throw errorFactory({
        provider: account.provider,
        status: res.status,
        message: (data as { message?: string })?.message,
        body: data,
      });
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

    return this.updateAccount(account, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
    });
  }

  private async updateAccount(
    account: SocialAccount,
    updates: { accessToken: string; refreshToken: string; expiresAt: string | null }
  ): Promise<SocialAccount> {
    const { data, error } = await supabase
      .from('social_accounts')
      .update({
        access_token: this.encrypt(updates.accessToken),
        refresh_token: this.encrypt(updates.refreshToken),
        expires_at: updates.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError({
        code: 'UNKNOWN',
        message: error?.message ?? 'No se pudo actualizar la cuenta',
        statusCode: 500,
        provider: account.provider,
        isRetryable: false,
      });
    }

    return this.toSocialAccount(data);
  }

  async validate(account: SocialAccount): Promise<boolean> {
    try {
      const accessToken = this.decrypt(account.accessToken);
      switch (account.provider) {
        case 'instagram':
        case 'facebook': {
          const cfg = config.providers.facebook;
          const res = await this.fetchImpl(
            `${cfg.graphApiUrl}/${cfg.graphApiVersion}/me?access_token=${encodeURIComponent(accessToken)}&fields=id`
          );
          return res.ok;
        }
        case 'youtube': {
          const cfg = config.providers.youtube;
          const res = await this.fetchImpl(
            `${cfg.baseUrl}/channels?part=id&mine=true&key=${cfg.apiKey ?? ''}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          return res.ok;
        }
        case 'tiktok': {
          const res = await this.fetchImpl(`${config.providers.tiktok.baseUrl}/v2/user/info`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          return res.ok;
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  async revoke(account: SocialAccount): Promise<void> {
    const accessToken = this.decrypt(account.accessToken);

    switch (account.provider) {
      case 'instagram':
      case 'facebook': {
        const cfg = config.providers.facebook;
        await this.fetchImpl(
          `${cfg.graphApiUrl}/${cfg.graphApiVersion}/permissions?access_token=${encodeURIComponent(accessToken)}`,
          { method: 'DELETE' }
        );
        break;
      }
      case 'youtube': {
        await this.fetchImpl(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
          { method: 'POST' }
        );
        break;
      }
      case 'tiktok': {
        // TikTok no tiene endpoint de revoke estandar; marcamos isValid=false
        break;
      }
    }

    const { error } = await supabase
      .from('social_accounts')
      .update({ is_valid: false, updated_at: new Date().toISOString() })
      .eq('id', account.id);

    if (error) {
      throw new AppError({
        code: 'UNKNOWN',
        message: error.message,
        statusCode: 500,
        provider: account.provider,
        isRetryable: false,
      });
    }
  }

    private async parseJson(res: Response): Promise<TokenResponse> {
    const text = await res.text();
    if (!text) return {} as TokenResponse;
    try {
      return JSON.parse(text) as TokenResponse;
    } catch {
      return {};
    }
  }

  private toSocialAccount(row: Record<string, unknown>): SocialAccount {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      provider: row.provider as ProviderId,
      username: String(row.username),
      accessToken: row.access_token ? this.decrypt(String(row.access_token)) : '',
      refreshToken: row.refresh_token ? this.decrypt(String(row.refresh_token)) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      isValid: Boolean(row.is_valid),
    };
  }
}

export const tokenService = new TokenService();