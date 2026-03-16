import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { CheckCircle, Clock, CreditCard, TrendingDown, Briefcase, User, Zap, CalendarDays, Calendar, AlertTriangle } from 'lucide-react';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import ExpenseModal from '../components/ExpenseModal';
import { format, endOfMonth } from 'date-fns';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function calcTotals(items: Expense[]) {
  const pendientes = items.filter(e => e.status === 'Pendiente');
  const pagados = items.filter(e => e.status === 'Pagado');
  const vencidos = items.filter(e => e.status === 'Vencido');
  return {
    pendientes,
    pagados,
    vencidos,
    totalCOP: items.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0),
    totalUSD: items.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0),
    pendienteCOP: pendientes.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0),
    pendienteUSD: pendientes.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0),
    pagadoCOP: pagados.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0),
    pagadoUSD: pagados.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0),
    vencidoCOP: vencidos.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0),
    vencidoUSD: vencidos.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0),
    count: items.length,
    pendienteCount: pendientes.length,
    pagadoCount: pagados.length,
    vencidoCount: vencidos.length,
  };
}

// Frequency labels for subs grouping
const freqLabels: Record<string, string> = {
  Mensual: 'Mensuales',
  Bimestral: 'Bimestrales',
  Trimestral: 'Trimestrales',
  Semestral: 'Semestrales',
  Anual: 'Anuales',
  Unico: 'Pago Único',
};

const freqOrder = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Unico'];

export default function ExpensesByStatus() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currentDate = new Date();
  const [displayMonth, setDisplayMonth] = useState(currentDate.getMonth());
  const [displayYear, setDisplayYear] = useState(currentDate.getFullYear());

  useEffect(() => {
    fetchExpenses();
  }, [displayMonth, displayYear]);

  async function fetchExpenses() {
    try {
      setLoading(true);
      const start = format(new Date(displayYear, displayMonth, 1), 'yyyy-MM-dd');
      const end = format(endOfMonth(new Date(displayYear, displayMonth, 1)), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('expenses_view')
        .select('*')
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: true });

      if (error) throw error;
      if (data) setExpenses(data as Expense[]);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    } finally {
      setLoading(false);
    }
  }

  const openExpenseModal = (expense?: Expense) => {
    setExpenseToEdit(expense || null);
    setIsModalOpen(true);
  };

  // Group by tipo_presupuesto
  const grouped: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    const tipo = e.tipo_presupuesto || 'Personal';
    if (!grouped[tipo]) grouped[tipo] = [];
    grouped[tipo].push(e);
  });

  const orderedTypes = ['Personal', 'Suscripciones', 'Negocios'];
  const allTypes = [...orderedTypes.filter(t => grouped[t]), ...Object.keys(grouped).filter(t => !orderedTypes.includes(t))];

  const grand = calcTotals(expenses);

  // Config
  type SectionConfig = { label: string; bgCard: string; bgBadge: string; textColor: string; icon: React.ElementType };
  const typeConfig: Record<string, SectionConfig> = {
    Personal: { label: 'Personal', bgCard: 'bg-teal-50 dark:bg-teal-900/20', bgBadge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400', textColor: 'text-teal-700 dark:text-teal-400', icon: User },
    Suscripciones: { label: 'Suscripciones', bgCard: 'bg-violet-50 dark:bg-violet-900/20', bgBadge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400', textColor: 'text-violet-700 dark:text-violet-400', icon: Zap },
    Negocios: { label: 'Negocios', bgCard: 'bg-amber-50 dark:bg-amber-900/20', bgBadge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', textColor: 'text-amber-700 dark:text-amber-400', icon: Briefcase },
  };

  const renderRowDesktop = (expense: Expense) => {
    const isPagado = expense.status === 'Pagado';
    const isVencido = expense.status === 'Vencido';
    const isOverdue = expense.vence_en?.startsWith('Vencido hace') || expense.vence_en?.startsWith('Vence hoy');

    let statusBg = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
    let venceColor = 'text-amber-600';

    if (isPagado) {
      statusBg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
      venceColor = 'text-emerald-500';
    } else if (isVencido) {
      statusBg = 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400';
      venceColor = 'text-zinc-400';
    } else if (isOverdue) {
      statusBg = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400';
      venceColor = 'text-rose-600';
    }

    return (
      <tr
        key={expense.id}
        onClick={() => openExpenseModal(expense)}
        className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group ${isVencido ? 'opacity-60' : ''}`}
      >
        <td className="px-4 py-3">
          <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusBg}`}>
            {expense.status}
          </span>
        </td>
        <td className="px-4 py-3">
          <p className={`font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors leading-tight text-[13px] ${isVencido ? 'line-through' : ''}`}>{expense.expense}</p>
          {expense.cuenta && <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{expense.cuenta}</p>}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <span className={`font-bold text-zinc-900 dark:text-zinc-100 text-[13px] ${isVencido ? 'line-through' : ''}`}>{formatCurrency(expense.valor, expense.moneda)}</span>
          <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
        </td>
        <td className="px-4 py-3">
          <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[11px] font-semibold">
            {expense.categoria}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-medium text-[13px]">
          {expense.fecha || '—'}
        </td>
        <td className="px-4 py-3">
          <span className={`text-[11px] font-bold ${venceColor}`}>
            {isVencido ? 'Vencido (duplicado)' : expense.vence_en || (isPagado ? 'Pagado' : 'Pendiente')}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          {expense.status === 'Pendiente' ? (
            <button
              onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
              className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/30 text-zinc-400 transition-colors"
              title="Marcar como pagado"
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          ) : isVencido ? (
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-400 mx-auto" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
          )}
        </td>
      </tr>
    );
  };

  const renderCardMobile = (expense: Expense) => {
    const isPagado = expense.status === 'Pagado';
    const isVencido = expense.status === 'Vencido';
    const isOverdue = expense.vence_en?.startsWith('Vencido hace') || expense.vence_en?.startsWith('Vence hoy');

    let statusBg = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
    let statusText = 'Pendiente';
    let venceColor = 'text-amber-600';

    if (isPagado) {
      statusBg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
      statusText = 'Pagado';
      venceColor = 'text-emerald-600 dark:text-emerald-400';
    } else if (isVencido) {
      statusBg = 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400';
      statusText = 'Vencido';
      venceColor = 'text-zinc-400';
    } else if (isOverdue) {
      statusBg = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400';
      venceColor = 'text-rose-600 dark:text-rose-400';
    }

    return (
      <div
        key={expense.id}
        onClick={() => openExpenseModal(expense)}
        className={`p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer flex flex-col gap-3 group ${isVencido ? 'opacity-60' : ''}`}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors ${isVencido ? 'line-through' : ''}`}>{expense.expense}</h4>
            {expense.cuenta && <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 truncate">{expense.cuenta}</p>}
          </div>
          <div className="text-right shrink-0">
            <span className={`font-bold text-zinc-900 dark:text-zinc-100 text-sm ${isVencido ? 'line-through' : ''}`}>{formatCurrency(expense.valor, expense.moneda)}</span>
            <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${statusBg}`}>
              {statusText}
            </span>
            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[100px]">
              {expense.categoria}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-bold ${venceColor}`}>
              {isVencido ? 'Vencido (dup.)' : expense.vence_en || (isPagado ? 'Pagado' : 'Pendiente')}
            </span>
            {expense.status === 'Pendiente' && (
              <button
                onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/30 text-zinc-400 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderTable = (items: Expense[]) => {
    const sorted = [...items.filter(e => e.status === 'Pendiente'), ...items.filter(e => e.status === 'Pagado'), ...items.filter(e => e.status === 'Vencido')];
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">

        {/* Mobile View */}
        <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {sorted.map(renderCardMobile)}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-400 font-bold border-b border-zinc-100 text-[10px] uppercase tracking-wider dark:bg-zinc-800/50 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 w-[100px]">Estado</th>
                <th className="px-4 py-3">Inversión</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-center w-[60px]">✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {sorted.map(renderRowDesktop)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSummaryBar = (t: ReturnType<typeof calcTotals>, label: string, bgCard: string, textColor: string, bgBadge: string, Icon: React.ElementType, subtitle?: string) => (
    <div className={`rounded-2xl p-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${bgCard} border border-zinc-100 dark:border-zinc-800`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bgBadge}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2 className={`text-lg font-bold ${textColor}`}>{label}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{subtitle || `${t.count} movimientos · ${t.pendienteCount} pendientes · ${t.pagadoCount} pagados`}</p>
        </div>
      </div>
      <div className="flex items-center gap-6 text-right">
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pendiente</p>
          <p className="text-sm font-extrabold text-zinc-900 dark:text-white">{formatCurrency(t.pendienteCOP, 'COP')} <span className="text-[10px] text-zinc-400">COP</span></p>
          {t.pendienteUSD > 0 && <p className="text-xs font-bold text-zinc-500">{formatCurrency(t.pendienteUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
        </div>
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pagado</p>
          <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(t.pagadoCOP, 'COP')} <span className="text-[10px] text-zinc-400">COP</span></p>
          {t.pagadoUSD > 0 && <p className="text-xs font-bold text-zinc-500">{formatCurrency(t.pagadoUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
        </div>
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total</p>
          <p className="text-sm font-extrabold text-zinc-900 dark:text-white">{formatCurrency(t.totalCOP, 'COP')} <span className="text-[10px] text-zinc-400">COP</span></p>
          {t.totalUSD > 0 && <p className="text-xs font-bold text-zinc-500">{formatCurrency(t.totalUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
        </div>
      </div>
    </div>
  );

  // Render a type section - for Suscripciones, sub-group by frequency
  const renderTypeSection = (tipo: string) => {
    const items = grouped[tipo];
    const cfg = typeConfig[tipo] || { label: tipo, bgCard: 'bg-zinc-50 dark:bg-zinc-900/20', bgBadge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', textColor: 'text-zinc-700 dark:text-zinc-400', icon: CreditCard };
    const Icon = cfg.icon;
    const t = calcTotals(items);

    if (tipo === 'Suscripciones') {
      // Sub-group by frequency
      const byFreq: Record<string, Expense[]> = {};
      items.forEach(e => {
        const f = e.frecuencia || 'Unico';
        if (!byFreq[f]) byFreq[f] = [];
        byFreq[f].push(e);
      });

      const orderedFreqs = freqOrder.filter(f => byFreq[f]);

      return (
        <div key={tipo} className="space-y-3">
          {/* Main suscripciones header */}
          {renderSummaryBar(t, cfg.label, cfg.bgCard, cfg.textColor, cfg.bgBadge, Icon)}

          {/* Sub-sections by frequency */}
          {orderedFreqs.map(freq => {
            const freqItems = byFreq[freq];
            const ft = calcTotals(freqItems);
            const freqLabel = freqLabels[freq] || freq;
            const freqIcon = freq === 'Anual' ? Calendar : CalendarDays;

            return (
              <div key={freq} className="ml-4 space-y-2">
                {/* Frequency sub-header */}
                <div className="flex items-center justify-between bg-violet-50/50 dark:bg-violet-900/10 rounded-xl px-4 py-2.5 border border-violet-100/50 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    {React.createElement(freqIcon, { className: "w-3.5 h-3.5 text-violet-500" })}
                    <span className="text-sm font-bold text-violet-700 dark:text-violet-400">{freqLabel}</span>
                    <span className="text-[10px] text-zinc-400 font-medium">({ft.count})</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold mr-1">Pend:</span>
                      <span className="text-xs font-extrabold text-zinc-900 dark:text-white">{formatCurrency(ft.pendienteCOP, 'COP')}</span>
                      {ft.pendienteUSD > 0 && <span className="text-xs font-bold text-zinc-500 ml-1">/ {formatCurrency(ft.pendienteUSD, 'USD')} USD</span>}
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold mr-1">Total:</span>
                      <span className="text-xs font-extrabold text-zinc-900 dark:text-white">{formatCurrency(ft.totalCOP, 'COP')}</span>
                      {ft.totalUSD > 0 && <span className="text-xs font-bold text-zinc-500 ml-1">/ {formatCurrency(ft.totalUSD, 'USD')} USD</span>}
                    </div>
                  </div>
                </div>
                {renderTable(freqItems)}
              </div>
            );
          })}
        </div>
      );
    }

    // Normal type section (Personal, Negocios, etc)
    return (
      <div key={tipo} className="space-y-3">
        {renderSummaryBar(t, cfg.label, cfg.bgCard, cfg.textColor, cfg.bgBadge, Icon)}
        {renderTable(items)}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-zinc-900 p-3 rounded-[20px] shadow-sm flex items-center justify-center dark:bg-zinc-800">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Presupuesto</h1>
            <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Control completo de tus pagos del mes.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={displayMonth}
            onChange={(e) => setDisplayMonth(Number(e.target.value))}
            className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
          >
            {monthNames.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={displayYear}
            onChange={(e) => setDisplayYear(Number(e.target.value))}
            className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
          >
            {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-zinc-500 font-medium">Cargando presupuesto...</div>
      ) : (
        <>
          {allTypes.map(tipo => renderTypeSection(tipo))}

          {/* Grand Total */}
          {allTypes.length > 0 && (
            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-5 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-white/80" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Resumen Total del Mes</h3>
                  <p className="text-xs text-white/60 font-medium">{monthNames[displayMonth]} {displayYear} · {grand.count} movimientos</p>
                </div>
              </div>
              <div className="flex items-center gap-8 text-right">
                <div>
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Pendiente</p>
                  <p className="text-lg font-extrabold text-amber-400">{formatCurrency(grand.pendienteCOP, 'COP')} <span className="text-xs text-white/40">COP</span></p>
                  {grand.pendienteUSD > 0 && <p className="text-sm font-bold text-amber-300/80">{formatCurrency(grand.pendienteUSD, 'USD')} <span className="text-xs text-white/40">USD</span></p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Pagado</p>
                  <p className="text-lg font-extrabold text-emerald-400">{formatCurrency(grand.pagadoCOP, 'COP')} <span className="text-xs text-white/40">COP</span></p>
                  {grand.pagadoUSD > 0 && <p className="text-sm font-bold text-emerald-300/80">{formatCurrency(grand.pagadoUSD, 'USD')} <span className="text-xs text-white/40">USD</span></p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Total Mes</p>
                  <p className="text-lg font-extrabold">{formatCurrency(grand.totalCOP, 'COP')} <span className="text-xs text-white/40">COP</span></p>
                  {grand.totalUSD > 0 && <p className="text-sm font-bold text-white/70">{formatCurrency(grand.totalUSD, 'USD')} <span className="text-xs text-white/40">USD</span></p>}
                </div>
              </div>
            </div>
          )}

          {allTypes.length === 0 && (
            <div className="text-center py-16 text-zinc-500 font-medium bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              No hay movimientos este mes.
            </div>
          )}
        </>
      )}

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchExpenses}
        expenseToEdit={expenseToEdit}
      />

      <PaymentConfirmModal
        expense={paymentModalExpense}
        onClose={() => setPaymentModalExpense(null)}
        onSuccess={fetchExpenses}
      />
    </div>
  );
}
