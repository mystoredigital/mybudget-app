import React, { useEffect, useState } from 'react';
import { supabase, Expense, CuentaSaldo, TasaCambio, ServicioView, PortfolioPeriod, PortfolioPeriodItem } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { Plus, Clock, CheckCircle, AlertTriangle, Globe, Wallet, Users, ArrowRight, TrendingUp } from 'lucide-react';
import ExpenseModal from '../components/ExpenseModal';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaSaldo[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<Expense[]>([]);
  const [servicios, setServicios] = useState<ServicioView[]>([]);
  const [socio, setSocio] = useState<{ nombre: string; leDebo: number; cur: string; mes: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [cuentasRes, tasaRes, pendRes, servRes, periodRes] = await Promise.all([
          supabase.from('cuentas_saldos').select('*'),
          supabase.from('tasas_cambio').select('*').eq('par', 'USD_COP').order('fecha', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('expenses_view').select('*').eq('status', 'Pendiente').order('fecha', { ascending: true }).limit(40),
          supabase.from('servicios_view').select('*').eq('activo', true).lte('dias_para_renovar', 30).order('fecha_renovacion', { ascending: true }),
          supabase.from('portfolio_periods').select('*').order('period_month', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (cuentasRes.data) setCuentas(cuentasRes.data as CuentaSaldo[]);
        setRate(tasaRes.data ? Number((tasaRes.data as TasaCambio).valor) : null);
        if (pendRes.data) setPendientes(pendRes.data as Expense[]);
        if (servRes.data) setServicios(servRes.data as ServicioView[]);

        // Socio: liquidación del periodo más reciente
        const period = periodRes.data as PortfolioPeriod | null;
        if (period) {
          const [{ data: its }, { data: part }] = await Promise.all([
            supabase.from('portfolio_period_items').select('*').eq('period_id', period.id),
            supabase.from('portfolio_partners').select('name').eq('portfolio_id', period.portfolio_id).limit(1).maybeSingle(),
          ]);
          const items = (its as PortfolioPeriodItem[]) || [];
          const s = (t: string) => items.filter(i => i.tipo === t).reduce((a, c) => a + Number(c.monto), 0);
          const neto = s('ingreso') - s('gasto_compartido');
          const leDebo = neto * (Number(period.partner_percent) / 100) - s('descuento_socio');
          setSocio({ nombre: (part as any)?.name || 'Socio', leDebo, cur: period.currency, mes: period.period_month });
        } else {
          setSocio(null);
        }
      } catch (err) {
        console.error('Error cargando panel:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [refreshKey]);

  const totalCOP = cuentas.filter(c => c.moneda === 'COP' && !c.archivada).reduce((a, c) => a + Number(c.saldo_actual), 0);
  const totalUSD = cuentas.filter(c => c.moneda === 'USD' && !c.archivada).reduce((a, c) => a + Number(c.saldo_actual), 0);
  const combinado = rate ? totalCOP + totalUSD * rate : null;

  const isOverdue = (e: Expense) => e.vence_en?.startsWith('Venci') || e.vence_en?.startsWith('Vence hoy');
  const vencidos = pendientes.filter(isOverdue);
  const nombre = user?.email?.split('@')[0] || '';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white capitalize">Hola, {nombre} 👋</h1>
          <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Tu panel de control financiero</p>
        </div>
        <button onClick={() => { setExpenseToEdit(null); setIsModalOpen(true); }} className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-800 text-white px-5 py-3 rounded-full font-bold shadow-md hover:-translate-y-0.5 transition-all text-sm shrink-0">
          <Plus className="w-5 h-5" /> Nuevo Gasto
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse py-12 text-zinc-500 font-medium text-center">Cargando tu panel...</div>
      ) : (
        <>
          {/* Hero: Lo que tengo (degradado naranja) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-3xl p-7 text-white shadow-lg shadow-orange-500/20 bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/10" />
              <div className="absolute right-16 bottom-0 w-32 h-32 rounded-full bg-white/5" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-white/70" />
                  <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Lo que tengo</span>
                </div>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-2 mt-3">
                  <div>
                    <p className="text-4xl font-extrabold tracking-tight">{formatCurrency(totalCOP, 'COP')}</p>
                    <p className="text-[11px] text-white/60 font-semibold mt-0.5">COP</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white/90">{formatCurrency(totalUSD, 'USD')}</p>
                    <p className="text-[11px] text-white/60 font-semibold mt-0.5">USD</p>
                  </div>
                  {combinado != null && (
                    <div className="ml-auto text-right">
                      <p className="text-sm font-bold">≈ {formatCurrency(combinado, 'COP')}</p>
                      <p className="text-[11px] text-white/60 font-semibold">total · dólar {rate}</p>
                    </div>
                  )}
                </div>
                <button onClick={() => navigate('/cuentas')} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full transition-colors">
                  Ver cuentas <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Socio */}
            <div onClick={() => navigate('/portfolios')} className="rounded-3xl p-6 border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-500" />
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Le debo al socio</span>
              </div>
              {socio ? (
                <div className="mt-2">
                  <p className="text-3xl font-extrabold text-teal-700 dark:text-teal-400">{formatCurrency(socio.leDebo, socio.cur as any)}</p>
                  <p className="text-[11px] text-zinc-400 font-semibold mt-1">{socio.nombre} · último periodo</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-400 font-medium mt-2">Sin portafolios activos</p>
              )}
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatChip icon={Clock} color="amber" label="Pagos pendientes" value={String(pendientes.length)} hint="próximos" />
            <StatChip icon={AlertTriangle} color="rose" label="Vencidos" value={String(vencidos.length)} hint={vencidos.length ? 'requieren atención' : 'al día ✓'} />
            <StatChip icon={Globe} color="blue" label="Servicios" value={String(servicios.length)} hint="renuevan en 30 días" onClick={() => navigate('/servicios')} />
            <StatChip icon={TrendingUp} color="emerald" label="Dólar hoy" value={rate ? formatCurrency(rate, 'COP') : '—'} hint="COP / USD" onClick={() => navigate('/cuentas')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Próximos pagos */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-zinc-900 dark:text-white">Próximos pagos</h3>
                </div>
                <button onClick={() => navigate('/expenses/estado')} className="text-teal-700 dark:text-teal-400 font-semibold text-sm hover:underline">Ver todo →</button>
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50 max-h-[420px] overflow-y-auto">
                {pendientes.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 font-medium">🎉 Sin pagos pendientes.</div>
                ) : pendientes.slice(0, 10).map(e => {
                  const over = isOverdue(e);
                  return (
                    <div key={e.id} onClick={() => { setExpenseToEdit(e); setIsModalOpen(true); }} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer group">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-teal-600">{e.expense}</p>
                        <p className={`text-[11px] font-bold ${over ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{e.vence_en || 'Pendiente'} · {e.categoria}</p>
                      </div>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm shrink-0">{formatCurrency(e.valor, e.moneda)}</span>
                      <button onClick={(ev) => { ev.stopPropagation(); setPaymentModalExpense(e); }} className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 hover:text-emerald-600 text-zinc-400 transition-colors shrink-0" title="Pagar">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Servicios próximos a renovar */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <h3 className="font-bold text-zinc-900 dark:text-white">Renuevan pronto</h3>
                </div>
                <button onClick={() => navigate('/servicios')} className="text-teal-700 dark:text-teal-400 font-semibold text-sm hover:underline">Ver todo →</button>
              </div>
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50 max-h-[420px] overflow-y-auto">
                {servicios.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 font-medium">Nada renueva en 30 días.</div>
                ) : servicios.map(s => {
                  const d = s.dias_para_renovar;
                  const cls = d <= 0 ? 'text-rose-600 dark:text-rose-400' : d <= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
                  return (
                    <div key={s.id} onClick={() => navigate('/servicios')} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate">{s.nombre}</p>
                        <p className={`text-[11px] font-bold ${cls}`}>{d < 0 ? `Vencido hace ${Math.abs(d)} d` : d === 0 ? 'Renueva hoy' : `Renueva en ${d} d`} · {s.cliente || s.categoria}</p>
                      </div>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm shrink-0">{formatCurrency(s.costo, s.moneda)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <ExpenseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => setRefreshKey(p => p + 1)} expenseToEdit={expenseToEdit} />
      <PaymentConfirmModal expense={paymentModalExpense} onClose={() => setPaymentModalExpense(null)} onSuccess={() => setRefreshKey(p => p + 1)} />
    </div>
  );
}

function StatChip({ icon: Icon, color, label, value, hint, onClick }: {
  icon: React.ElementType; color: string; label: string; value: string; hint: string; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30',
  };
  return (
    <div onClick={onClick} className={`bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colors[color]}`}><Icon className="w-4 h-4" /></div>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-zinc-900 dark:text-white">{value}</p>
      <p className="text-xs text-zinc-400 font-semibold mt-1">{hint}</p>
    </div>
  );
}
