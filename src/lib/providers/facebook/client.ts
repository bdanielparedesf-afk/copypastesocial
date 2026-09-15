export interface FacebookAccount {
  provider_account_id: string;
  username: string;
  avatar_url: string | null;
}

export async function getAccount(access_token: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${access_token}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { provider_account_id: data.id, username: data.name, avatar_url: data.picture?.data?.url };
}

export async function upload(_params: any) {
  if (process.env.MOCK_MODE === 'true') return { external_id: `mock_fb_${Date.now()}` };
  // Honestidad: no hay implementación real de publish a Facebook todavía.
  // Devolver un id falso marcaría el job como completado sin publicar nada.
  throw new Error('PUBLICACION_A_FACEBOOK_NO_IMPLEMENTADA_AUN');
}

export async function publish(params: any) { return upload(params); }

export async function getStatus(id: string) { return { status: 'SUCCESS', external_id: id }; }

export async function validateToken(_token: string) { return true; }

export async function revokeToken(_token: string) {
  await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${_token}`, { method: 'DELETE' });
}
