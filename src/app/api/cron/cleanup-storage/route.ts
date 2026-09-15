/**
 * FASE 23 — POST /api/cron/cleanup-storage
 * Barre huerfanos de raw (>2h) y processed (>24h) via Storage API.
 * Protegido por x-cron-secret igual que los demas crons.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { releaseMediaStorage } from '@/lib/storage/cleanup';

export const dynamic = 'force-dynamic';

const RAW_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PROCESSED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

type Row = { id: string; raw_path: string | null; processed_path: string | null };

async function releasedIds(
  admin: ReturnType<typeof createServerClient>,
  rows: Row[] | null,
): Promise<string[]> {
  const out: string[] = [];
  for (const row of rows ?? []) {
    try {
      const r = await releaseMediaStorage(admin, row.id);
      if (r.released) out.push(row.id);
    } catch {
      // best-effort por item
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = createServerClient();
    const now = Date.now();
    const rawCutoff = new Date(now - RAW_MAX_AGE_MS).toISOString();
    const procCutoff = new Date(now - PROCESSED_MAX_AGE_MS).toISOString();

    // Solo candidatos con paths aun sin liberar (limite 100 por pasada).
    const { data: rawRows, error: rawErr } = await admin
      .from('media_items')
      .select('id, raw_path, processed_path')
      .not('raw_path', 'is', null)
      .lt('created_at', rawCutoff)
      .limit(BATCH_LIMIT);
    if (rawErr) throw rawErr;

    const { data: procRows, error: procErr } = await admin
      .from('media_items')
      .select('id, raw_path, processed_path')
      .is('raw_path', null)
      .not('processed_path', 'is', null)
      .lt('created_at', procCutoff)
      .limit(BATCH_LIMIT);
    if (procErr) throw procErr;

    // Une sin duplicar ids.
    const seen = new Set<string>();
    const cands: Row[] = [];
    for (const r of [...((rawRows as Row[]) ?? []), ...((procRows as Row[]) ?? [])]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        cands.push(r);
      }
    }

    const released = await releasedIds(admin, cands);
    return NextResponse.json({ ok: true, found: cands.length, released: released.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'cleanup fallo' },
      { status: 500 },
    );
  }
}
