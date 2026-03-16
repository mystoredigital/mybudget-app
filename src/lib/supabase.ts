import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Types ──

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  preferred_currency: 'COP' | 'USD';
  plan: 'free' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  expense: string;
  categoria: string;
  status: 'Pendiente' | 'Pagado' | 'Vencido';
  fecha: string | null;
  valor: number;
  moneda: 'COP' | 'USD';
  cuenta: string | null;
  nombre: string | null;
  phone: string | null;
  link: string | null;
  comment: string | null;
  tipo_presupuesto: string;
  frecuencia: 'Unico' | 'Mensual' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';
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

export type UserBudgetType = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};
