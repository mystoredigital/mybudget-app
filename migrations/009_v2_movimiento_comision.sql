-- ============================================================
-- Migration 009 (v2): comisión en movimientos
-- ============================================================
-- En un traslado a veces sale 1000 pero llega menos: la diferencia
-- es la comisión/fee (red, exchange). Se guarda explícita para poder
-- reportar cuánto se pierde en fees. Va en la moneda del origen.
--
-- El saldo ya lo refleja vía monto_destino (origen pierde `monto`,
-- destino recibe `monto_destino` = monto - comisión [convertido]).
-- Idempotente.
-- ============================================================

ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS comision numeric(16,2) NOT NULL DEFAULT 0
  CHECK (comision >= 0);

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'movimientos' AND column_name = 'comision';
-- Esperado: 1 fila.
