/*
 * FASE 22 — Límites de Storage a 1GB (videos de hasta ~10 min)
 * ==================================================================
 * Supabase aplica el límite real por objeto desde `storage.buckets`.
 * El código solo puede CREAR el bucket; si ya existe, el límite viejo
 * (500MB) sigue mandando y el PUT directo falla con 413 aunque el
 * validador de la app lo permita. Por eso esta migración hace UPSERT:
 * crea los buckets si faltan y eleva `file_size_limit` a 1GB si ya existen.
 *
 *   raw       → 1073741824 (1GB, originales, nunca se borran)
 *   processed → 1073741824 (1GB, resultado FFmpeg 9:16)
 *   thumbnails→   52428800 (50MB,  webp, no necesita 1GB)
 *
 * Aplicar en Supabase → SQL Editor (o `supabase db push`).
 * Verificación incluida al final del archivo.
 */

-- Buckets de video a 1GB (crea si falta, eleva límite si existe).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw',       'raw',       true, 1073741824, array['video/*','image/*','audio/*']),
  ('processed', 'processed', true, 1073741824, array['video/*','image/*'])
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = true;

-- Thumbnails: 50MB es más que suficiente (un .webp pesa KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('thumbnails', 'thumbnails', true, 52428800, array['image/*'])
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = true;

-- Verificación (esperado: raw 1024.0 | processed 1024.0 | thumbnails 50.0)
select id,
  round((file_size_limit / 1024.0 / 1024.0), 1) as limite_mb,
  public,
  allowed_mime_types
from storage.buckets
where id in ('raw', 'processed', 'thumbnails')
order by id;
