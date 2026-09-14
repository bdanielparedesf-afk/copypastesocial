/**
 * POST /api/publish/batch — Publicación en lote (modo automático).
 *
 * Body:
 * {
 *   items: Array<{ media_id: uuid, caption?: string }>  // máx 50
 *   social_account_ids: uuid[]                          // 1..8
 *   mode: 'stagger' | 'immediate'                       // default 'stagger'
 *   stagger_minutes?: number                            // default 60 (mín efectivo 60)
 * }
 *
 * - stagger: por cada cuenta genera slots SCHEDULED con separación de 60min
 *   respetando el límite diario de 25/día UTC (al agotar salta al día
 *   siguiente 00:00 UTC). El cron /api/cron/publish-scheduled los publica.
 * - immediate: encola PENDING y dispara el procesado en background
 *   (fire-and-forget); los que superen el límite diario quedan en `skipped`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { listAccounts } from '@/lib/accounts';
import { enqueuePost, processPost } from '@/lib/publishing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAILY_LIMIT = 25;

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        media_id: z.string().uuid('media_id debe ser UUID'),
        caption: z.string().max(2200, 'caption máx. 2200 chars').optional().default(''),
      })
    )
    .min(1, 'items es requerido')
    .max(50, 'Máximo 50 items por lote'),
  social_account_ids: z.array(z.string().uuid()).min(1, 'Selecciona al menos una cuenta').max(8),
  mode: z.enum(['stagger', 'immediate']).default('stagger'),
  stagger_minutes: z.number().int().min(15).max(1440).optional().default(60),
});

/** Clave de día UTC (YYYY-MM-DD). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Genera `count` slots separados `intervalMs`, empezando en `startAt`,
 * sin exceder DAILY_LIMIT por día UTC (considera `usedToday` ya consumido).
 */
function buildSlots(count: number, startAt: Date, intervalMs: number, usedToday: number): Date[] {
  const slots: Date[] = [];
  let cursor = new Date(startAt);
  let currentKey = dayKey(cursor);
  let placedToday = Math.max(0, usedToday);

  for (let i = 0; i < count; i++) {
    if (placedToday >= DAILY_LIMIT) {
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      currentKey = dayKey(cursor);
      placedToday = 0;
    }
    if (dayKey(cursor) !== currentKey) {
      currentKey = dayKey(cursor);
      placedToday = 0;
    }
    slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + intervalMs);
    if (dayKey(cursor) !== currentKey) {
      currentKey = dayKey(cursor);
      placedToday = 0;
    }
    placedToday += 1;
  }
  return slots;
}

interface SkippedItem {
  media_id: string;
  social_account_id: string;
  reason: string;
}

interface CreatedItem {
  media_id: string;
  social_account_id: string;
  queue_id: string;
  scheduled_at: string | null;
}

export async function POST(request: NextRequest) {
  const admin = createServerClient();

  // Single-owner: nunca 401 (la app no tiene login propio).
  const user = { id: await getUserIdAllowDev(request) };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Body inválido' },
      { status: 400 }
    );
  }

  const { items, social_account_ids, mode, stagger_minutes } = parsed.data;

  try {
    // 1) Cuentas válidas del usuario
    const accounts = await listAccounts(user.id);
    const chosen = accounts.filter((a) => social_account_ids.includes(a.id) && a.is_valid);
    if (chosen.length === 0) {
      return NextResponse.json(
        { error: 'Ninguna de las cuentas seleccionadas es válida' },
        { status: 400 }
      );
    }

    // 2) Media READY + ownership (sources.user_id)
    const mediaIds = items.map((i) => i.media_id);
    const { data: medias, error: mediaError } = await admin
      .from('media_items')
      .select('id, status, sources!inner(user_id)')
      .in('id', mediaIds);

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }

    const readyMedia = new Set<string>();
    for (const m of medias ?? []) {
      const sources = m.sources as unknown;
      const owner = Array.isArray(sources)
        ? (sources[0] as { user_id?: string } | undefined)?.user_id
        : (sources as { user_id?: string } | undefined)?.user_id;
      if (owner === user.id && (m.status ?? 'PENDING') === 'READY') {
        readyMedia.add(m.id);
      }
    }

    const validItems = items.filter((i) => readyMedia.has(i.media_id));
    const invalidCount = items.length - validItems.length;
    if (validItems.length === 0) {
      return NextResponse.json(
        { error: 'Ningún video está READY (proceso FFmpeg pendiente o fallido)' },
        { status: 400 }
      );
    }

    // 3) Uso diario por cuenta (PUBLISHED hoy, igual que /api/accounts)
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const usedTodayByAccount = new Map<string, number>();
    for (const account of chosen) {
      const { count } = await admin
        .from('publish_queue')
        .select('id', { count: 'exact', head: true })
        .eq('social_account_id', account.id)
        .eq('status', 'PUBLISHED')
        .gte('created_at', startOfToday.toISOString());
      usedTodayByAccount.set(account.id, count ?? 0);
    }

    // 4) Encolar por cuenta × item
    const intervalMs = Math.max(60, stagger_minutes) * 60_000;
    const created: CreatedItem[] = [];
    const skipped: SkippedItem[] = [];

    for (const account of chosen) {
      const usedToday = usedTodayByAccount.get(account.id) ?? 0;
      const slots =
        mode === 'stagger'
          ? buildSlots(validItems.length, new Date(), intervalMs, usedToday)
          : validItems.map(() => null);

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const slot = slots[i];
        const scheduledAt = slot ? slot.toISOString() : null;
        try {
          const queueItem = await enqueuePost({
            userId: user.id,
            socialAccountId: account.id,
            mediaId: item.media_id,
            caption: item.caption,
            scheduledAt,
          });
          created.push({
            media_id: item.media_id,
            social_account_id: account.id,
            queue_id: queueItem.id,
            scheduled_at: scheduledAt,
          });
        } catch (err) {
          skipped.push({
            media_id: item.media_id,
            social_account_id: account.id,
            reason: err instanceof Error ? err.message : 'Error al encolar',
          });
        }
      }
    }

    // 5) Modo inmediato: procesar en background (no bloquea la respuesta).
    //    En producción el cron /api/cron/publish-scheduled cubre la cola.
    if (mode === 'immediate' && created.length > 0) {
      const ids = created.map((c) => c.queue_id);
      void (async () => {
        for (const queueId of ids) {
          try {
            await processPost(queueId);
          } catch {
            // processPost ya marca FAILED en la cola
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      })();
    }

    const scheduleHorizonDays =
      mode === 'stagger' ? Math.ceil(validItems.length / Math.floor(1440 / Math.max(60, stagger_minutes))) : 0;

    return NextResponse.json({
      success: true,
      mode,
      created,
      skipped,
      invalidCount,
      perAccount: chosen.map((a) => ({
        id: a.id,
        username: a.username,
        provider: a.provider,
        count: created.filter((c) => c.social_account_id === a.id).length,
      })),
      schedule_horizon_days: scheduleHorizonDays,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar el lote' },
      { status: 500 }
    );
  }
}

