/*
 * FASE 23 — Storage 1GB + Limpieza automática (pass-through, sin acumular)
 * ==========================================================================
 * Objetivo: los buckets solo son tránsito (navegador -> raw -> FFmpeg ->
 * processed -> Meta). Nada se almacena: tras publicar se borra el físico
 * (ver src/lib/storage/cleanup.ts) y este job barre huérfanos.
 *
 * 1) Reafirma límite 1GB en raw/processed (idempotente, igual que FASE 22).
 * 2) Función cleanup_old_raw_files(): borra objetos viejos vía Storage API
 *    equivalente SQL. NOTA: DELETE en storage.objects deja el archivo físico
 *    huérfano en algunos setups self-hosted; por eso el cron de la app
 *    (/api/cron/cleanup-storage) borra vía Storage API (from().remove()),
 *    que sí elimina físico + fila. Esta función queda como red de seguridad
 *    SQL para el plan free sin pg_cron.
 * 3) Intento de programar pg_cron cada hora (si la extensión existe; en
 *    Supabase Cloud se prefiere Dashboard > Database > Cron Jobs o el cron
 *    de Vercel en vercel.json).
 *
 * Aplicar en Supabase → SQL Editor (o `supabase db push`).
 */

-- 1) Límite 1GB (upsert idempotente, conserva thumbnails de FASE 22)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw',       'raw',       true, 1073741824, array['video/*','image/*','audio/*']),
  ('processed', 'processed', true, 1073741824, array['video/*','image/*'])
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = true;

-- 2) Función de limpieza (red de seguridad SQL)
create or replace function public.cleanup_old_raw_files()
returns void as $$
begin
  delete from storage.objects
  where bucket_id = 'raw'
    and created_at < now() - interval '2 hours';

  delete from storage.objects
  where bucket_id = 'processed'
    and created_at < now() - interval '24 hours';
end;
$$ language plpgsql security definer;

-- Permite invocarla desde el cliente service-role / cron
grant execute on function public.cleanup_old_raw_files() to service_role;
grant execute on function public.cleanup_old_raw_files() to authenticated;

-- 3) pg_cron cada hora (solo si la extensión está disponible; si no, usar
-- Dashboard > Database > Cron Jobs con `select public.cleanup_old_raw_files();`
-- o el cron de Vercel `POST /api/cron/cleanup-storage` en vercel.json).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-old-raw-files-hourly',
      '0 * * * *',
      'select public.cleanup_old_raw_files();'
    );
  else
    raise notice 'pg_cron no disponible: programa manual (Dashboard > Cron Jobs o Vercel).';
  end if;
exception when duplicate_object then
  raise notice 'job cleanup-old-raw-files-hourly ya existe, se conserva.';
end $$;

-- 4) Verificación de espacio actual (esperado: pocas filas, ~0 MB tras limpieza)
select bucket_id, count(*) as archivos,
  round(sum((metadata->>'size')::bigint)/1024.0/1024.0, 1) as mb
from storage.objects
where bucket_id in ('raw','processed')
group by bucket_id;
