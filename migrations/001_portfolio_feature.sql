-- ============================================================
-- Migration 001: Portfolio feature
-- ============================================================
-- Apply this in Supabase SQL Editor on top of the existing schema.
-- It is idempotent: safe to re-run.
-- ============================================================

-- 1) expenses.tipo_presupuesto → expenses.portafolio
ALTER TABLE public.expenses RENAME COLUMN tipo_presupuesto TO portafolio;

-- 2) user_budget_types → user_portfolios + new fields
ALTER TABLE public.user_budget_types RENAME TO user_portfolios;

ALTER TABLE public.user_portfolios
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'simple'
    CHECK (type IN ('simple', 'shared'));

ALTER TABLE public.user_portfolios
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.user_portfolios
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'USD'
    CHECK (default_currency IN ('COP', 'USD'));

-- Rename existing RLS policy (best-effort; ignore if it doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_portfolios'
      AND policyname = 'Users can manage their own budget types'
  ) THEN
    ALTER POLICY "Users can manage their own budget types"
      ON public.user_portfolios RENAME TO "Users can manage their own portfolios";
  END IF;
END $$;

-- 3) Recreate the recurring trigger function with renamed column
CREATE OR REPLACE FUNCTION public.create_next_recurring_expense()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Pagado'
     AND OLD.status = 'Pendiente'
     AND NEW.frecuencia <> 'Unico'
     AND NEW.fecha IS NOT NULL THEN
    INSERT INTO public.expenses (
      user_id, expense, categoria, status, fecha, valor, moneda,
      cuenta, nombre, phone, link, comment, portafolio, frecuencia
    ) VALUES (
      NEW.user_id, NEW.expense, NEW.categoria, 'Pendiente',
      CASE
        WHEN NEW.frecuencia = 'Mensual'    THEN NEW.fecha + INTERVAL '1 month'
        WHEN NEW.frecuencia = 'Bimestral'  THEN NEW.fecha + INTERVAL '2 months'
        WHEN NEW.frecuencia = 'Trimestral' THEN NEW.fecha + INTERVAL '3 months'
        WHEN NEW.frecuencia = 'Semestral'  THEN NEW.fecha + INTERVAL '6 months'
        WHEN NEW.frecuencia = 'Anual'      THEN NEW.fecha + INTERVAL '1 year'
        ELSE NEW.fecha
      END,
      NEW.valor, NEW.moneda, NEW.cuenta, NEW.nombre, NEW.phone, NEW.link,
      NEW.comment, NEW.portafolio, NEW.frecuencia
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Recreate expenses_view (column rename invalidates the view)
DROP VIEW IF EXISTS public.expenses_view;
CREATE OR REPLACE VIEW public.expenses_view AS
SELECT
  *,
  CASE
    WHEN status = 'Pagado'  THEN 'Pagado'
    WHEN fecha IS NULL      THEN 'Sin fecha'
    WHEN status = 'Pendiente' THEN
      CASE
        WHEN (fecha - current_date) < 0 THEN 'Vencido hace ' || abs(fecha - current_date) || ' días'
        WHEN (fecha - current_date) = 0 THEN 'Vence hoy'
        ELSE 'Vence en ' || (fecha - current_date) || ' días'
      END
  END AS vence_en
FROM public.expenses;

-- ============================================================
-- 5) PORTFOLIO_PARTNERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.user_portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  share_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (share_percent >= 0 AND share_percent <= 100),
  contact text,
  account_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own partners" ON public.portfolio_partners;
CREATE POLICY "Users can manage their own partners"
  ON public.portfolio_partners FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_portfolio_partners_updated_at ON public.portfolio_partners;
CREATE TRIGGER update_portfolio_partners_updated_at
  BEFORE UPDATE ON public.portfolio_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6) PORTFOLIO_OPERATORS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.user_portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text,
  account_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own operators" ON public.portfolio_operators;
CREATE POLICY "Users can manage their own operators"
  ON public.portfolio_operators FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_portfolio_operators_updated_at ON public.portfolio_operators;
CREATE TRIGGER update_portfolio_operators_updated_at
  BEFORE UPDATE ON public.portfolio_operators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7) PORTFOLIO_PERIODS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.user_portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  gross_income numeric(14,2) NOT NULL DEFAULT 0 CHECK (gross_income >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('COP', 'USD')),
  status text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'cerrado')),
  notes text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, period_month)
);

ALTER TABLE public.portfolio_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own periods" ON public.portfolio_periods;
CREATE POLICY "Users can manage their own periods"
  ON public.portfolio_periods FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_portfolio_periods_updated_at ON public.portfolio_periods;
CREATE TRIGGER update_portfolio_periods_updated_at
  BEFORE UPDATE ON public.portfolio_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8) PORTFOLIO_MOVEMENTS
-- ============================================================
-- Movement types:
--   'gasto_operativo' : portfolio-level expense; deducted from NEXT month gross.
--   'gasto_socio'     : individual deduction tied to a specific partner in a period.
--   'pago_operador'   : payment made to an operator (also a portfolio-level expense).
--   'pago_socio'      : payout to a partner (reduces their balance to deliver).
--   'ajuste'          : manual adjustment (signed via 'sign' column).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.user_portfolios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.portfolio_periods(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.portfolio_partners(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES public.portfolio_operators(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'gasto_operativo', 'gasto_socio', 'pago_operador', 'pago_socio', 'ajuste'
  )),
  concept text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  sign smallint NOT NULL DEFAULT -1 CHECK (sign IN (-1, 1)),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('COP', 'USD')),
  fecha date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Pagado', 'Vencido')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_movements_portfolio
  ON public.portfolio_movements(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_movements_period
  ON public.portfolio_movements(period_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_movements_partner
  ON public.portfolio_movements(partner_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_movements_fecha
  ON public.portfolio_movements(fecha);

ALTER TABLE public.portfolio_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own movements" ON public.portfolio_movements;
CREATE POLICY "Users can manage their own movements"
  ON public.portfolio_movements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_portfolio_movements_updated_at ON public.portfolio_movements;
CREATE TRIGGER update_portfolio_movements_updated_at
  BEFORE UPDATE ON public.portfolio_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9) PORTFOLIO_MOVEMENT_FILES (optional attachments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_movement_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES public.portfolio_movements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'comprobantes',
  path text NOT NULL,
  filename text,
  mime_type text,
  size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_movement_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own movement files" ON public.portfolio_movement_files;
CREATE POLICY "Users can manage their own movement files"
  ON public.portfolio_movement_files FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
