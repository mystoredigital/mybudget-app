-- ============================================================
-- Migration 002: Breakdown of gross income per period
-- ============================================================
-- The "gross_income" of a period is no longer a single number; it is
-- the sum of multiple line items (e.g. Concesionario, Operador,
-- Inversión Mes Anterior) so the user can keep the breakdown they had
-- in Notion. The portfolio_periods.gross_income column is kept as a
-- cache (auto-updated by the app on save) for backwards compatibility.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.portfolio_period_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.portfolio_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  sign smallint NOT NULL DEFAULT 1 CHECK (sign IN (-1, 1)),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_period_incomes_period
  ON public.portfolio_period_incomes(period_id);

ALTER TABLE public.portfolio_period_incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own period incomes" ON public.portfolio_period_incomes;
CREATE POLICY "Users can manage their own period incomes"
  ON public.portfolio_period_incomes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
