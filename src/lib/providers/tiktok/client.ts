export interface TikTokAccount {
  provider_account_id: string;
  username: string;
  avatar_url: string | null;
}

export async function getAccount(access_token: string) {
  const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const json = await res.json();
  if (json.error?.code) {
    throw new Error('Tu cuenta o aplicación no tiene habilitada la publicación automática.');
  }
  return { provider_account_id: json.data.user.open_id, username: json.data.user.display_name, avatar_url: json.data.user.avatar_url };
}

export async function upload() {
  if (process.env.MOCK_MODE === 'true') return { external_id: `mock_tt_${Date.now()}` };
  throw new Error('Tu cuenta o aplicación no tiene habilitada la publicación automática.');
}

export const publish = upload;

export async function getStatus() { return { status: 'SUCCESS' }; }

export async function validateToken() { return true; }

export async function revokeToken() { return true; }
