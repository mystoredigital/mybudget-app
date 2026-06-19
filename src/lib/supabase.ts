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
  cuenta_id: string | null; // v2: cuenta de la que salió el pago
  servicio_id: string | null; // v2: servicio que generó este pago
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
  partner_percent: number; // v2: % del socio para este periodo (variable)
  currency: Currency;
  status: PortfolioPeriodStatus;
  notes: string | null;
  closed_at: string | null;
  // v2: pago de liquidación al socio
  pago_socio_estado: 'Pendiente' | 'Pagado';
  pago_socio_fecha: string | null;
  pago_socio_monto: number | null;
  pago_socio_comprobante_path: string | null;
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

// ── v2: Tesorería (cuentas + movimientos + tasas) ──

export type CuentaTipo = 'banco' | 'wallet' | 'tarjeta' | 'efectivo';

export type Cuenta = {
  id: string;
  user_id: string;
  nombre: string;
  tipo: CuentaTipo;
  moneda: Currency;
  saldo_inicial: number;
  archivada: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

// Fila de la vista cuentas_saldos (cuenta + saldo calculado en vivo)
export type CuentaSaldo = Cuenta & { saldo_actual: number };

export type MovimientoTipo = 'ingreso' | 'gasto' | 'traslado';

export type Movimiento = {
  id: string;
  user_id: string;
  tipo: MovimientoTipo;
  concepto: string;
  fecha: string;
  monto: number;
  moneda: Currency;
  cuenta_id: string | null;        // origen (gasto/traslado) o destino (ingreso)
  cuenta_destino_id: string | null; // solo traslado
  tasa_usada: number | null;        // USD/COP usada si hubo cambio
  monto_destino: number | null;     // monto que llega al destino (ya descontada la comisión)
  comision: number;                 // fee del traslado, en la moneda del origen
  categoria: string | null;
  status: 'Pendiente' | 'Pagado';
  expense_id: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type TasaCambio = {
  id: string;
  user_id: string;
  fecha: string;
  par: string; // 'USD_COP'
  valor: number;
  fuente: 'api' | 'manual';
  created_at: string;
};

// ── v2: Servicios / Dominios contratados ──

export type ServicioCiclo = 'Mensual' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';

export type Servicio = {
  id: string;
  user_id: string;
  nombre: string;
  categoria: string;
  proveedor: string | null;
  cliente: string | null;
  costo: number;
  moneda: Currency;
  ciclo: ServicioCiclo;
  fecha_renovacion: string;
  auto_renueva: boolean;
  url_panel: string | null;
  notas: string | null;
  dias_alerta: number[];
  activo: boolean;
  created_at: string;
  updated_at: string;
};

// Fila de servicios_view (servicio + días para renovar)
export type ServicioView = Servicio & { dias_para_renovar: number };

// ── v2: Portafolio — líneas del periodo ──

export type PortfolioPeriodItemTipo = 'ingreso' | 'gasto_compartido' | 'descuento_socio' | 'cargo_socio';

export type PortfolioPeriodItem = {
  id: string;
  period_id: string;
  user_id: string;
  tipo: PortfolioPeriodItemTipo;
  concepto: string;
  monto: number;
  fecha: string;
  created_at: string;
};
