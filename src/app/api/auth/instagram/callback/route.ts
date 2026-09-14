import { NextRequest, NextResponse } from 'next/server';
import { GET as canonicalGET } from '@/app/api/auth/callback/facebook/route';

export const dynamic = 'force-dynamic';

/**
 * Compat: ruta antigua /api/auth/instagram/callback.
 * Instagram usa el MISMO Login de Meta, por lo que la URI canónica es
 * /api/auth/callback/facebook y el provider se distingue por `state`.
 * Se delega al handler canónico (misma redirect_uri del init).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return canonicalGET(request);
}

