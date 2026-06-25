import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Types ──

export type Currency = 'COP' | 'USD';
export type ExpenseStatus = 'Pendiente' | 'Pagado' | 'Vencido';
export type Frecuencia = 'Unico' | 'Mensual' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  preferred_currency: Currency;
  plan: 'free' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  expense: string;
  categoria: string;
  status: ExpenseStatus;
  fecha: string | null;
  valor: number;
  moneda: Currency;
  cuenta: string | null;
  nombre: string | null;
  phone: string | null;
  link: string | null;
  comment: string | null;
  portafolio: string;
  frecuencia: Frecuencia;
  created_at: string;
  updated_at: string;
  vence_en?: string; // From view
};

export type ExpenseFile = {
  id: string;
  expense_id: string;
  user_id: string;
  bucket: string;
  path: string;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  created_at: string;
};

export type UserCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type PortfolioType = 'simple' | 'shared';

export type UserPortfolio = {
  id: string;
  user_id: string;
  name: string;
  type: PortfolioType;
  description: string | null;
  default_currency: Currency;
  created_at: string;
};

export type PortfolioPartner = {
  id: string;
  portfolio_id: string;
  user_id: string;
  name: string;
  share_percent: number;
  contact: string | null;
  account_info: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioOperator = {
  id: string;
  portfolio_id: string;
  user_id: string;
  name: string;
  contact: string | null;
  account_info: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioPeriodStatus = 'abierto' | 'cerrado';

export type PortfolioPeriod = {
  id: string;
  portfolio_id: string;
  user_id: string;
  period_month: string; // ISO date (first of month)
  gross_income: number;
  currency: Currency;
  status: PortfolioPeriodStatus;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioMovementType =
  | 'gasto_operativo'
  | 'gasto_socio'
  | 'pago_operador'
  | 'pago_socio'
  | 'ajuste';

export type PortfolioMovement = {
  id: string;
  portfolio_id: string;
  user_id: string;
  period_id: string | null;
  partner_id: string | null;
  operator_id: string | null;
  type: PortfolioMovementType;
  concept: string;
  amount: number;
  sign: -1 | 1;
  currency: Currency;
  fecha: string;
  status: ExpenseStatus;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioPeriodIncome = {
  id: string;
  period_id: string;
  user_id: string;
  concept: string;
  amount: number;
  sign: -1 | 1;
  sort_order: number;
  created_at: string;
};

export type PortfolioMovementFile = {
  id: string;
  movement_id: string;
  user_id: string;
  bucket: string;
  path: string;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  created_at: string;
};
