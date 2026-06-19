-- ============================================================
-- Migration 013 (v2, Fase 3): Pendientes al socio (se suman)
-- ============================================================
-- Contraparte de 'descuento_socio': montos que se SUMAN a lo que
-- se le debe al socio (p.ej. saldos pendientes de otros meses).
--
-- Solo amplía el CHECK de tipo para aceptar 'cargo_socio'.
-- Idempotente.
-- ============================================================

ALTER TABLE public.portfolio_period_items
  DROP CONSTRAINT IF EXISTS portfolio_period_items_tipo_check;

ALTER TABLE public.portfolio_period_items
  ADD CONSTRAINT portfolio_period_items_tipo_check
  CHECK (tipo IN ('ingreso','gasto_compartido','descuento_socio','cargo_socio'));

SELECT conname FROM pg_constraint WHERE conname = 'portfolio_period_items_tipo_check';
-- Esperado: 1 fila.
