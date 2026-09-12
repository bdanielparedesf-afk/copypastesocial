/*
 * FASE 2 - AUDITORÍA REAL
 *
 * Hace que user_id sea nullable en audits para permitir auditorías
 * sin usuario autenticado (FASE 2 no incluye auth).
 * En fases posteriores se restringirá con RLS.
 */
alter table public.audits alter column user_id drop not null;