/**
 * FASE 9 — GET/POST /api/auth/instagram
 *
 * Inicia el flujo OAuth real de Instagram (Facebook Login). Devuelve la URL
 * del diálogo con state y los scopes de IG (instagram_basic +
 * instagram_content_publish + pages_show_list + business_management).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/providers/instagram/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function buildState(provider: string): string {
  return Buffer.from(JSON.stringify({ provider, ts: Date.now() })).toString('base64url');
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl?.origin ?? DEFAULT_ORIGIN;

  const state = buildState('instagram');
  const redirectUri = `${origin}/api/auth/instagram/callback`;

  const url = getAuthUrl({ redirectUri, state });

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };