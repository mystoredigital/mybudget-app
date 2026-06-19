-- ============================================================
-- Migration 014 (v2): Reporte diario de saldos
-- ============================================================
-- Registro diario de saldos de varias plataformas/valles.
--   reporte_conceptos: catálogo fijo de conceptos con su signo
--     (+1 suma / -1 resta) y orden. Editable por el usuario.
--   reportes_diarios: una "foto" por día (unique por user+fecha).
--   reporte_items: líneas del reporte (nombre+signo+monto), copia
--     del catálogo al momento de guardar (conserva el histórico).
--
-- Total del día = sum(signo * monto). Se calcula en la app.
-- Los conceptos por defecto los siembra la app en el primer uso.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reporte_conceptos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  signo smallint NOT NULL DEFAULT 1 CHECK (signo IN (-1, 1)),
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.reportes_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT current_date,
  moneda text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('COP', 'USD')),
  notas text,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fecha)
);

CREATE TABLE IF NOT EXISTS public.reporte_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes_diarios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  signo smallint NOT NULL DEFAULT 1 CHECK (signo IN (-1, 1)),
  monto numeric(16,2) NOT NULL DEFAULT 0,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporte_items_reporte ON public.reporte_items(reporte_id);
CREATE INDEX IF NOT EXISTS idx_reportes_diarios_user_fecha ON public.reportes_diarios(user_id, fecha DESC);

ALTER TABLE public.reporte_conceptos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own reporte_conceptos" ON public.reporte_conceptos;
CREATE POLICY "own reporte_conceptos" ON public.reporte_conceptos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own reportes_diarios" ON public.reportes_diarios;
CREATE POLICY "own reportes_diarios" ON public.reportes_diarios FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own reporte_items" ON public.reporte_items;
CREATE POLICY "own reporte_items" ON public.reporte_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN ('reporte_conceptos','reportes_diarios','reporte_items')
 ORDER BY table_name;
-- Esperado: 3 filas.
