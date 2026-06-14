-- ============================================================
-- Migration 008 (v2, Fase 1): Cuentas + Movimientos + Tasas
-- ============================================================
-- Capa "Real" del rediseño: tesorería con saldo en vivo.
--   cuentas       → bancos/wallets/tarjetas con moneda y saldo.
--   movimientos   → ledger unificado (ingreso/gasto/traslado).
--                   Traslados NO afectan el neto; solo gastos lo reducen.
--   tasas_cambio  → USD/COP diario (indicador; cron n8n lo alimenta).
--   expenses.cuenta_id → puente: al pagar un gasto del presupuesto
--                        se descuenta de una cuenta.
--
-- Aditiva y no rompe v1 (todas las columnas nuevas son nullable).
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1) CUENTAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'banco'
    CHECK (tipo IN ('banco','wallet','tarjeta','efectivo')),
  moneda text NOT NULL DEFAULT 'COP' CHECK (moneda IN ('COP','USD')),
  saldo_inicial numeric(16,2) NOT NULL DEFAULT 0,
  archivada boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nombre)
);

ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own cuentas" ON public.cuentas;
CREATE POLICY "Users manage their own cuentas" ON public.cuentas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_cuentas_updated_at ON public.cuentas;
CREATE TRIGGER update_cuentas_updated_at BEFORE UPDATE ON public.cuentas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2) MOVIMIENTOS (ledger unificado)
-- ------------------------------------------------------------
-- tipo='ingreso'  → entra a cuenta_id.
-- tipo='gasto'    → sale de cuenta_id.
-- tipo='traslado' → sale de cuenta_id, entra a cuenta_destino_id.
--                   Si las monedas difieren: tasa_usada + monto_destino.
-- monto va siempre en la moneda de la cuenta origen (>= 0).
-- status='Pendiente' no afecta saldo hasta marcarse 'Pagado'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','gasto','traslado')),
  concepto text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  monto numeric(16,2) NOT NULL CHECK (monto >= 0),
  moneda text NOT NULL DEFAULT 'COP' CHECK (moneda IN ('COP','USD')),
  cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
  cuenta_destino_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
  tasa_usada numeric(16,4),
  monto_destino numeric(16,2),
  categoria text,
  status text NOT NULL DEFAULT 'Pagado' CHECK (status IN ('Pendiente','Pagado')),
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Coherencia por tipo:
  CONSTRAINT mov_traslado_destino CHECK (
    (tipo = 'traslado' AND cuenta_destino_id IS NOT NULL)
    OR (tipo <> 'traslado' AND cuenta_destino_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_movimientos_user_fecha ON public.movimientos(user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta ON public.movimientos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta_destino ON public.movimientos(cuenta_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_expense ON public.movimientos(expense_id);

ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own movimientos" ON public.movimientos;
CREATE POLICY "Users manage their own movimientos" ON public.movimientos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_movimientos_updated_at ON public.movimientos;
CREATE TRIGGER update_movimientos_updated_at BEFORE UPDATE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 3) TASAS DE CAMBIO (USD/COP diario)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasas_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT current_date,
  par text NOT NULL DEFAULT 'USD_COP',
  valor numeric(16,4) NOT NULL CHECK (valor > 0),
  fuente text NOT NULL DEFAULT 'api' CHECK (fuente IN ('api','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fecha, par)
);

ALTER TABLE public.tasas_cambio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own tasas" ON public.tasas_cambio;
CREATE POLICY "Users manage their own tasas" ON public.tasas_cambio FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4) PUENTE: expenses.cuenta_id
-- ------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 5) VISTA: saldo en vivo por cuenta
-- ------------------------------------------------------------
-- saldo_actual = saldo_inicial
--   + ingresos a la cuenta
--   + traslados entrantes (monto_destino, o monto si misma moneda)
--   - gastos de la cuenta
--   - traslados salientes
-- Solo cuenta movimientos 'Pagado'.
DROP VIEW IF EXISTS public.cuentas_saldos;
CREATE VIEW public.cuentas_saldos
WITH (security_invoker = true) AS
SELECT
  c.*,
  c.saldo_inicial + COALESCE((
    SELECT SUM(CASE
      WHEN m.tipo = 'ingreso'  AND m.cuenta_id = c.id         THEN m.monto
      WHEN m.tipo = 'gasto'    AND m.cuenta_id = c.id         THEN -m.monto
      WHEN m.tipo = 'traslado' AND m.cuenta_id = c.id         THEN -m.monto
      WHEN m.tipo = 'traslado' AND m.cuenta_destino_id = c.id THEN COALESCE(m.monto_destino, m.monto)
      ELSE 0
    END)
    FROM public.movimientos m
    WHERE m.status = 'Pagado'
      AND (m.cuenta_id = c.id OR m.cuenta_destino_id = c.id)
  ), 0) AS saldo_actual
FROM public.cuentas c;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('cuentas','movimientos','tasas_cambio')
 ORDER BY table_name;
-- Esperado: 3 filas.
