import { NextRequest, NextResponse } from 'next/server';
import { youtubeProvider } from '@/providers/youtube/provider';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { source } = body as { source?: string };

    if (!source) {
      return NextResponse.json({ error: 'source es requerido' }, { status: 400 });
    }

    // Importar videos usando el proveedor
    const result = await youtubeProvider.importMedia(source, session.user.id);

    return NextResponse.json({
      success: true,
      count: result.count,
      items: result.items,
    });
  } catch (e) {
    console.error('[YouTube Import] Error:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Error al importar videos' },
      { status: 500 }
    );
  }
}
