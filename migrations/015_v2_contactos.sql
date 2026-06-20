-- ============================================================
-- Migration 015 (v2, Fase 4): Contactos (destinatario de pagos)
-- ============================================================
-- Módulo de contactos. El "destinatario" de gastos y movimientos
-- apunta a un contacto. Pensado para sincronizar 1 vía desde
-- Nextcloud (CardDAV): nc_uid/nc_etag identifican la vCard origen.
--
--   origen: 'manual' | 'nextcloud'
--   nc_uid: UID de la vCard en Nextcloud (para no duplicar en el sync)
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,
  telefono text,
  empresa text,
  notas text,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'nextcloud')),
  nc_uid text,
  nc_etag text,
  avatar_url text,
  archivado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un contacto de Nextcloud por usuario (evita duplicados en el sync)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contactos_user_ncuid
  ON public.contactos(user_id, nc_uid) WHERE nc_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_user ON public.contactos(user_id);

ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own contactos" ON public.contactos;
CREATE POLICY "own contactos" ON public.contactos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Destinatario en gastos y movimientos
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL;
ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL;

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'contactos';
-- Esperado: 1 fila.
