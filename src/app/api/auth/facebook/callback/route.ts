import { NextRequest, NextResponse } from 'next/server';
import { GET as canonicalGET } from '@/app/api/auth/callback/facebook/route';

export const dynamic = 'force-dynamic';

/**
 * Compat: ruta antigua /api/auth/facebook/callback.
 * La URI canónica registrada en Meta es /api/auth/callback/facebook.
 * Delega al handler canónico (mismo intercambio de code + scopes).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return canonicalGET(request);
}

