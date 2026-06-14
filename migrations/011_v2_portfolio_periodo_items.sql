-- ============================================================
-- Migration 011 (v2, Fase 3): Portafolio — liquidación mensual
-- ============================================================
-- Rehace el portafolio en torno al periodo (mes):
--   comisión total − gastos compartidos = neto → reparto por socio (% variable)
--   parte del socio − descuentos = lo que se le debe entregar.
--
-- partner_percent: % del socio para ESE periodo (variable mes a mes).
-- portfolio_period_items: líneas del periodo, un solo lugar para
--   ingresos, gastos compartidos y descuentos al socio.
--
-- No toca las tablas viejas (portfolio_movements/operators quedan
-- deprecadas pero intactas). Idempotente.
-- ============================================================

ALTER TABLE public.portfolio_periods
  ADD COLUMN IF NOT EXISTS partner_percent numeric(5,2) NOT NULL DEFAULT 50
  CHECK (partner_percent >= 0 AND partner_percent <= 100);

CREATE TABLE IF NOT EXISTS public.portfolio_period_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.portfolio_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','gasto_compartido','descuento_socio')),
  concepto text NOT NULL,
  monto numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  fecha date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_period_items_period ON public.portfolio_period_items(period_id);

ALTER TABLE public.portfolio_period_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own period items" ON public.portfolio_period_items;
CREATE POLICY "Users manage their own period items" ON public.portfolio_period_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'portfolio_period_items';
-- Esperado: 1 fila.
