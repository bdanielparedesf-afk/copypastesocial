/** FASE 12 - Manejo de estado OAuth para flujos de autorización. */

export interface OAuthState {
  state: string;
  provider: string;
  code_verifier: string;
  redirect_uri: string;
  created_at: string | undefined;
  expires_at: string;
}

const states = new Map<string, OAuthState>();

export function createOAuthState(data: Omit<OAuthState, 'created_at' | 'expires_at'> & { expires_at: string }): OAuthState {
  const state: OAuthState = {
    ...data,
    created_at: new Date().toISOString(),
  };
  states.set(data.state, state);
  return state;
}

export function getOAuthState(state: string): OAuthState | null {
  const result = states.get(state);
  if (!result) return null;
  // Check expiration
  if (new Date(result.expires_at) < new Date()) {
    states.delete(state);
    return null;
  }
  return result;
}

export function deleteOAuthState(state: string): boolean {
  return states.delete(state);
}

/** Class wrapper for OAuthStateManager (used by API routes). */
export class OAuthStateManager {
  async saveOAuthState(data: Omit<OAuthState, 'created_at'>): Promise<OAuthState> {
    const state: OAuthState = {
      ...data,
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
    };
    states.set(data.state, state);
    return state;
  }

  async getOAuthState(state: string): Promise<OAuthState | null> {
    return getOAuthState(state);
  }

  async deleteOAuthState(state: string): Promise<boolean> {
    return deleteOAuthState(state);
  }
}
