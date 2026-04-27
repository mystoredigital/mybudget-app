-- ============================================================
-- MyBudget - Full Database Schema
-- ============================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Helper: updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. PROFILES table (auto-created on signup)
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  preferred_currency text NOT NULL DEFAULT 'COP' CHECK (preferred_currency IN ('COP','USD')),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. EXPENSES table
-- ============================================================
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense text NOT NULL,
  categoria text NOT NULL,  -- Dynamic: loaded from user_categories table
  status text NOT NULL CHECK (status IN ('Pendiente','Pagado','Vencido')),
  fecha date,
  valor numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  moneda text NOT NULL DEFAULT 'COP' CHECK (moneda IN ('COP','USD')),
  cuenta text,
  nombre text,
  phone text,
  link text,
  comment text,
  portafolio text NOT NULL DEFAULT 'Personal',  -- Dynamic: loaded from user_portfolios table (only 'simple' type)
  frecuencia text NOT NULL DEFAULT 'Unico' CHECK (frecuencia IN ('Unico', 'Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. EXPENSE FILES table
CREATE TABLE expense_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'comprobantes',
  path text NOT NULL,
  filename text,
  mime_type text,
  size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. View for calculated "vence_en"
CREATE OR REPLACE VIEW expenses_view AS
SELECT
  *,
  CASE
    WHEN status = 'Pagado' THEN 'Pagado'
    WHEN fecha IS NULL THEN 'Sin fecha'
    WHEN status = 'Pendiente' THEN
      CASE
        WHEN (fecha - current_date) < 0 THEN 'Vencido hace ' || abs(fecha - current_date) || ' días'
        WHEN (fecha - current_date) = 0 THEN 'Vence hoy'
        ELSE 'Vence en ' || (fecha - current_date) || ' días'
      END
  END as vence_en
FROM expenses;

-- 7. RLS for expenses / expense_files
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own expenses"
ON expenses FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own expense files"
ON expense_files FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8. Storage: comprobantes (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes', 'comprobantes', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Users can upload their own comprobantes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own comprobantes" ON storage.objects FOR SELECT USING (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own comprobantes" ON storage.objects FOR UPDATE USING (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own comprobantes" ON storage.objects FOR DELETE USING (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 9. Storage: avatars (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 10. Trigger for updated_at on expenses
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 11. Trigger to auto-create next recurring payment
CREATE OR REPLACE FUNCTION create_next_recurring_expense()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Pagado' AND OLD.status = 'Pendiente' AND NEW.frecuencia != 'Unico' AND NEW.fecha IS NOT NULL THEN
    INSERT INTO expenses (
      user_id, expense, categoria, status, fecha, valor, moneda, cuenta, nombre, phone, link, comment, portafolio, frecuencia
    ) VALUES (
      NEW.user_id, NEW.expense, NEW.categoria, 'Pendiente',
      CASE
        WHEN NEW.frecuencia = 'Mensual' THEN NEW.fecha + INTERVAL '1 month'
        WHEN NEW.frecuencia = 'Bimestral' THEN NEW.fecha + INTERVAL '2 months'
        WHEN NEW.frecuencia = 'Trimestral' THEN NEW.fecha + INTERVAL '3 months'
        WHEN NEW.frecuencia = 'Semestral' THEN NEW.fecha + INTERVAL '6 months'
        WHEN NEW.frecuencia = 'Anual' THEN NEW.fecha + INTERVAL '1 year'
        ELSE NEW.fecha
      END,
      NEW.valor, NEW.moneda, NEW.cuenta, NEW.nombre, NEW.phone, NEW.link, NEW.comment, NEW.portafolio, NEW.frecuencia
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_next_recurring_expense
AFTER UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION create_next_recurring_expense();

-- ============================================================
-- 12. USER CATEGORIES table (dynamic, per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own categories"
  ON public.user_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 13. USER PORTFOLIOS table (dynamic, per-user)
--     Replaces the old user_budget_types.
--     type='simple'  → just a tag for grouping personal expenses.
--     type='shared'  → has partners, operators, periods, movements.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'simple' CHECK (type IN ('simple', 'shared')),
  description text,
  default_currency text NOT NULL DEFAULT 'USD' CHECK (default_currency IN ('COP','USD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.user_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own portfolios"
  ON public.user_portfolios FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 14. Auto-seed default categories & portfolios on new user signup
CREATE OR REPLACE FUNCTION public.seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_categories (user_id, name) VALUES
    (NEW.id, 'Home'), (NEW.id, 'Food'), (NEW.id, 'Entertainment'),
    (NEW.id, 'Salud'), (NEW.id, 'Servicios'), (NEW.id, 'Creditos'),
    (NEW.id, 'Tarjeta de Credito'), (NEW.id, 'Colegio'),
    (NEW.id, 'Business'), (NEW.id, 'Car')
  ON CONFLICT (user_id, name) DO NOTHING;

  INSERT INTO public.user_portfolios (user_id, name, type) VALUES
    (NEW.id, 'Personal', 'simple'),
    (NEW.id, 'Suscripciones', 'simple'),
    (NEW.id, 'Negocios', 'simple')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_seed_defaults
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_defaults();

-- ============================================================
-- 15. PORTFOLIO_PARTNERS (only for shared portfolios)
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

CREATE POLICY "Users can manage their own partners"
  ON public.portfolio_partners FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_partners_updated_at
  BEFORE UPDATE ON public.portfolio_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 16. PORTFOLIO_OPERATORS
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

CREATE POLICY "Users can manage their own operators"
  ON public.portfolio_operators FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_operators_updated_at
  BEFORE UPDATE ON public.portfolio_operators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 17. PORTFOLIO_PERIODS (monthly closure of a shared portfolio)
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

CREATE POLICY "Users can manage their own periods"
  ON public.portfolio_periods FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_periods_updated_at
  BEFORE UPDATE ON public.portfolio_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 18. PORTFOLIO_MOVEMENTS
--   gasto_operativo : portfolio-level expense; deducted from NEXT month gross.
--   gasto_socio     : individual deduction tied to a partner (in a period).
--   pago_operador   : payment made to an operator (also a portfolio-level expense).
--   pago_socio      : payout to a partner (reduces their balance to deliver).
--   ajuste          : manual adjustment, sign explicit.
-- amount is always positive; 'sign' is -1 (debit) or +1 (credit).
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

CREATE POLICY "Users can manage their own movements"
  ON public.portfolio_movements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_movements_updated_at
  BEFORE UPDATE ON public.portfolio_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 18b. PORTFOLIO_PERIOD_INCOMES (breakdown of gross income)
--   Each period has multiple income line items (Concesionario, Operador, etc.).
--   periods.gross_income is the cached sum of these (kept up-to-date by the app).
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

CREATE POLICY "Users can manage their own period incomes"
  ON public.portfolio_period_incomes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 19. PORTFOLIO_MOVEMENT_FILES (optional attachments)
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

CREATE POLICY "Users can manage their own movement files"
  ON public.portfolio_movement_files FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
