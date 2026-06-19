-- ============================================================
-- Migration 012 (v2, Fase 3): Pago de liquidación al socio
-- ============================================================
-- "Le debo al socio" pasa de ser un número calculado a un pago
-- que se puede marcar como realizado, con fecha, monto y comprobante,
-- igual que un movimiento/pago normal.
--
--   pago_socio_estado: 'Pendiente' (naranja) | 'Pagado' (chulo verde)
--   pago_socio_fecha:  cuándo se le pagó
--   pago_socio_monto:  cuánto se le entregó (por defecto = lo que se le debía)
--   pago_socio_comprobante_path: ruta en el bucket 'comprobantes'
--
-- Todo vive en el periodo (un pago de liquidación por mes). Idempotente.
-- ============================================================

ALTER TABLE public.portfolio_periods
  ADD COLUMN IF NOT EXISTS pago_socio_estado text NOT NULL DEFAULT 'Pendiente'
    CHECK (pago_socio_estado IN ('Pendiente','Pagado')),
  ADD COLUMN IF NOT EXISTS pago_socio_fecha date,
  ADD COLUMN IF NOT EXISTS pago_socio_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS pago_socio_comprobante_path text;

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'portfolio_periods'
   AND column_name LIKE 'pago_socio%'
 ORDER BY column_name;
-- Esperado: 4 filas (pago_socio_comprobante_path, pago_socio_estado, pago_socio_fecha, pago_socio_monto).
