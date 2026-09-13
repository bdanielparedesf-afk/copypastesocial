/**
 * FASE 7 — DELETE /api/content/[id]
 * Elimina un media_item de la librería verificando que pertenece al usuario.
 *
 * FASE 20: Auth 401 si no hay usuario.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDbClient, resolveUserId } from '@/lib/supabase/api';

const IdSchema = z.string().uuid('ID inválido');

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const parsed = IdSchema.safeParse(params.id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const db = getDbClient();
    const userId = await resolveUserId();
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: owned, error: selectError } = await db
      .from('media_items')
      .select('id, sources!inner(user_id)')
      .eq('id', parsed.data)
      .eq('sources.user_id', userId)
      .limit(1);

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!owned || owned.length === 0) {
      return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 });
    }

    const { error } = await db
      .from('media_items')
      .delete()
      .eq('id', parsed.data);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
