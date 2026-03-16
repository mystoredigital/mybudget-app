-- ============================================================
-- MyBuget - Full Database Schema
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
  cuenta text,
  nombre text,
  phone text,
  link text,
  comment text,
  tipo_presupuesto text NOT NULL DEFAULT 'Personal',  -- Dynamic: loaded from user_budget_types table
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
-- INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes', 'comprobantes', false);
-- CREATE POLICY "Users can upload their own comprobantes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can view their own comprobantes" ON storage.objects FOR SELECT USING (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can delete their own comprobantes" ON storage.objects FOR DELETE USING (bucket_id = 'comprobantes' AND auth.uid()::text = (storage.foldername(name))[1]);

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
      user_id, expense, categoria, status, fecha, valor, cuenta, nombre, phone, link, comment, tipo_presupuesto, frecuencia
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
      NEW.valor, NEW.cuenta, NEW.nombre, NEW.phone, NEW.link, NEW.comment, NEW.tipo_presupuesto, NEW.frecuencia
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
-- 13. USER BUDGET TYPES table (dynamic, per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_budget_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.user_budget_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own budget types"
  ON public.user_budget_types FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 14. Auto-seed default categories & types on new user signup
CREATE OR REPLACE FUNCTION public.seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_categories (user_id, name) VALUES
    (NEW.id, 'Home'), (NEW.id, 'Food'), (NEW.id, 'Entertainment'),
    (NEW.id, 'Salud'), (NEW.id, 'Servicios'), (NEW.id, 'Creditos'),
    (NEW.id, 'Tarjeta de Credito'), (NEW.id, 'Colegio'),
    (NEW.id, 'Business'), (NEW.id, 'Car')
  ON CONFLICT (user_id, name) DO NOTHING;

  INSERT INTO public.user_budget_types (user_id, name) VALUES
    (NEW.id, 'Personal'), (NEW.id, 'Suscripciones'), (NEW.id, 'Negocios')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_seed_defaults
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_defaults();
