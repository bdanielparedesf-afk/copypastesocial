export interface YouTubeAccount {
  provider_account_id: string;
  username: string;
  avatar_url: string | null;
}

export async function getAccount(access_token: string) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error('NO_CHANNEL');
  return { provider_account_id: ch.id, username: ch.snippet.title, avatar_url: ch.snippet.thumbnails.default.url };
}

export async function upload(_params: any) {
  if (process.env.MOCK_MODE === 'true') return { external_id: `mock_yt_${Date.now()}` };
  return { external_id: 'yt_...' };
}

export const publish = upload;

export async function getStatus(id: string) { return { status: 'SUCCESS', external_id: id }; }

export async function validateToken() { return true; }

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
}
