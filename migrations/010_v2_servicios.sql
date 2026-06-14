-- ============================================================
-- Migration 010 (v2, Fase 2): Servicios / Dominios contratados
-- ============================================================
-- Servicios que el usuario paga (dominios, hosting, SaaS, licencias).
-- Control de COSTO; 'cliente' = a quién pertenece (texto por ahora;
-- en Fase 4 se enlazará a contactos de Nextcloud).
-- Al renovar genera un gasto Pendiente en el presupuesto (expenses)
-- y n8n alerta con dias_alerta de anticipación.
--
-- Aditiva. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'Dominio',
  proveedor text,                  -- dónde está contratado (Hostinger, Cloudflare...)
  cliente text,                    -- para quién es el servicio
  costo numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  moneda text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('COP','USD')),
  ciclo text NOT NULL DEFAULT 'Anual'
    CHECK (ciclo IN ('Mensual','Bimestral','Trimestral','Semestral','Anual')),
  fecha_renovacion date NOT NULL,
  auto_renueva boolean NOT NULL DEFAULT true,
  url_panel text,
  notas text,
  dias_alerta int[] NOT NULL DEFAULT '{30,15,7}',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicios_user ON public.servicios(user_id);
CREATE INDEX IF NOT EXISTS idx_servicios_renovacion ON public.servicios(fecha_renovacion);

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own servicios" ON public.servicios;
CREATE POLICY "Users manage their own servicios" ON public.servicios FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_servicios_updated_at ON public.servicios;
CREATE TRIGGER update_servicios_updated_at BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Puente: gasto generado por un servicio
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios(id) ON DELETE SET NULL;

-- Vista con días para renovar (timezone Bogota), para semáforo y n8n.
DROP VIEW IF EXISTS public.servicios_view;
CREATE VIEW public.servicios_view
WITH (security_invoker = true) AS
SELECT
  s.*,
  (s.fecha_renovacion - (now() AT TIME ZONE 'America/Bogota')::date) AS dias_para_renovar
FROM public.servicios s;

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'servicios';
-- Esperado: 1 fila.
