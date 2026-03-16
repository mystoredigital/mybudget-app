import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { ArrowUpRight, DollarSign, Clock, CheckCircle, Plus, TrendingDown, AlertTriangle } from 'lucide-react';
import ExpenseModal from '../components/ExpenseModal';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import { format, endOfMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const currentDate = new Date();
  const [displayMonth, setDisplayMonth] = useState(currentDate.getMonth());
  const [displayYear, setDisplayYear] = useState(currentDate.getFullYear());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function fetchData() {
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
        if (data) setAllExpenses(data as Expense[]);
      } catch (err) {
        console.error('Error fetching dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [refreshKey, displayMonth, displayYear]);

  // Calculations
  const pendientes = allExpenses.filter(e => e.status === 'Pendiente');
  const pagados = allExpenses.filter(e => e.status === 'Pagado');

  const pendienteCOP = pendientes.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0);
  const pendienteUSD = pendientes.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0);
  const pagadoCOP = pagados.filter(e => (e.moneda || 'COP') === 'COP').reduce((a, c) => a + Number(c.valor), 0);
  const pagadoUSD = pagados.filter(e => e.moneda === 'USD').reduce((a, c) => a + Number(c.valor), 0);
  const totalCOP = pendienteCOP + pagadoCOP;
  const totalUSD = pendienteUSD + pagadoUSD;

  const vencidos = pendientes.filter(e => e.vence_en?.startsWith('Venci') || e.vence_en?.startsWith('Vence hoy'));
  const proximos = pendientes.filter(e => !e.vence_en?.startsWith('Venci') && !e.vence_en?.startsWith('Vence hoy'));

  const progressPercent = allExpenses.length > 0 ? Math.round((pagados.length / allExpenses.length) * 100) : 0;

  const openExpenseModal = (expense?: Expense) => {
    setExpenseToEdit(expense || null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white">Dashboard</h1>
          <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Resumen de {monthNames[displayMonth]} {displayYear}</p>
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
          <button onClick={() => openExpenseModal()} className="flex items-center gap-2 bg-teal-900 text-white px-5 py-3 rounded-full font-bold shadow-md shadow-teal-900/20 hover:bg-teal-800 hover:-translate-y-0.5 transition-all text-sm shrink-0 dark:bg-teal-700 dark:shadow-teal-700/20">
            <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nueva Inversión</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse py-12 text-zinc-500 font-medium text-center">Cargando datos del mes...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Pendiente */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center dark:bg-amber-900/30">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pendiente</span>
              </div>
              <p className="text-xl font-extrabold text-zinc-900 dark:text-white">{formatCurrency(pendienteCOP, 'COP')}</p>
              <p className="text-[10px] text-zinc-400 font-semibold">COP</p>
              {pendienteUSD > 0 && <p className="text-sm font-bold text-zinc-500 mt-1">{formatCurrency(pendienteUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
              <p className="text-xs text-amber-600 font-semibold mt-2">{pendientes.length} movimientos</p>
            </div>

            {/* Pagado */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center dark:bg-emerald-900/30">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pagado</span>
              </div>
              <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(pagadoCOP, 'COP')}</p>
              <p className="text-[10px] text-zinc-400 font-semibold">COP</p>
              {pagadoUSD > 0 && <p className="text-sm font-bold text-zinc-500 mt-1">{formatCurrency(pagadoUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
              <p className="text-xs text-emerald-600 font-semibold mt-2">{pagados.length} movimientos</p>
            </div>

            {/* Total Mes */}
            <div className="bg-zinc-900 rounded-2xl p-5 text-white shadow-sm dark:bg-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white/80" />
                </div>
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Total Mes</span>
              </div>
              <p className="text-xl font-extrabold">{formatCurrency(totalCOP, 'COP')}</p>
              <p className="text-[10px] text-white/40 font-semibold">COP</p>
              {totalUSD > 0 && <p className="text-sm font-bold text-white/70 mt-1">{formatCurrency(totalUSD, 'USD')} <span className="text-[10px]">USD</span></p>}
              <p className="text-xs text-white/50 font-semibold mt-2">{allExpenses.length} total</p>
            </div>

            {/* Progreso */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center dark:bg-teal-900/30">
                  <TrendingDown className="w-4 h-4 text-teal-600" />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Progreso</span>
              </div>
              <p className="text-xl font-extrabold text-zinc-900 dark:text-white">{progressPercent}%</p>
              <div className="w-full bg-zinc-100 rounded-full h-2 mt-3 dark:bg-zinc-800">
                <div className="bg-teal-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="text-xs text-teal-600 font-semibold mt-2">{pagados.length} de {allExpenses.length}</p>
            </div>

            {/* Vencidos */}
            <div className={`rounded-2xl p-5 border shadow-sm ${vencidos.length > 0 ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800' : 'bg-white border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${vencidos.length > 0 ? 'bg-rose-100 dark:bg-rose-900/40' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                  <AlertTriangle className={`w-4 h-4 ${vencidos.length > 0 ? 'text-rose-600' : 'text-zinc-400'}`} />
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Vencidos</span>
              </div>
              <p className={`text-xl font-extrabold ${vencidos.length > 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-white'}`}>{vencidos.length}</p>
              <p className="text-xs text-zinc-500 font-semibold mt-2">
                {vencidos.length > 0 ? 'Requieren atención' : 'Al día ✓'}
              </p>
            </div>
          </div>

          {/* Pending Payments Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-zinc-900 dark:text-white">Pagos Pendientes del Mes</h3>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full dark:bg-amber-900/30">{pendientes.length}</span>
              </div>
              <button onClick={() => navigate('/expenses/estado')} className="text-teal-700 dark:text-teal-400 font-semibold text-sm hover:underline">
                Ver Presupuesto →
              </button>
            </div>

            {/* Mobile View - Pending */}
            <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
              {pendientes.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-medium">
                  🎉 Todo al día este mes. ¡Sin pendientes!
                </div>
              ) : (
                pendientes.map(expense => {
                  const isOverdue = expense.vence_en?.startsWith('Venci') || expense.vence_en?.startsWith('Vence hoy');
                  const venceColor = isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400';

                  return (
                    <div
                      key={expense.id}
                      onClick={() => openExpenseModal(expense)}
                      className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer flex flex-col gap-3 group"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{expense.expense}</h4>
                          {expense.cuenta && <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 truncate">{expense.cuenta}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{formatCurrency(expense.valor, expense.moneda)}</span>
                          <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[120px]">
                          {expense.categoria}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] font-bold ${venceColor}`}>
                            {expense.vence_en || 'Pendiente'}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                            className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/30 text-zinc-400 transition-colors shadow-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop View - Pending */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-400 font-bold border-b border-zinc-100 text-[10px] uppercase tracking-wider dark:bg-zinc-800/50 dark:border-zinc-800">
                  <tr>
                    <th className="px-5 py-3">Inversión</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3 text-center w-[60px]">✓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                  {pendientes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-zinc-500 font-medium">
                        🎉 Todo al día este mes. ¡Sin pendientes!
                      </td>
                    </tr>
                  ) : (
                    pendientes.map(expense => {
                      const isOverdue = expense.vence_en?.startsWith('Venci') || expense.vence_en?.startsWith('Vence hoy');
                      const venceColor = isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400';

                      return (
                        <tr
                          key={expense.id}
                          onClick={() => openExpenseModal(expense)}
                          className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-3">
                            <p className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors text-[13px]">{expense.expense}</p>
                            {expense.cuenta && <p className="text-[11px] text-zinc-400 mt-0.5">{expense.cuenta}</p>}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{formatCurrency(expense.valor, expense.moneda)}</span>
                            <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[11px] font-semibold">{expense.categoria}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold ${venceColor}`}>
                              {expense.vence_en || 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                              className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/30 text-zinc-400 transition-colors shadow-sm"
                              title="Marcar como pagado"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recently Paid */}
          {pagados.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-zinc-900 dark:text-white">Pagados este Mes</h3>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-900/30">{pagados.length}</span>
                </div>
              </div>

              {/* Mobile View - Paid */}
              <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {pagados.map(expense => (
                  <div
                    key={expense.id}
                    onClick={() => openExpenseModal(expense)}
                    className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer flex flex-col gap-3 group"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{expense.expense}</h4>
                        {expense.cuenta && <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 truncate">{expense.cuenta}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{formatCurrency(expense.valor, expense.moneda)}</span>
                        <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[120px]">
                        {expense.categoria}
                      </span>
                      <span className="text-emerald-500 dark:text-emerald-400 font-bold text-[11px]">
                        {expense.fecha} ✓
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View - Paid */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-400 font-bold border-b border-zinc-100 text-[10px] uppercase tracking-wider dark:bg-zinc-800/50 dark:border-zinc-800">
                    <tr>
                      <th className="px-5 py-3">Inversión</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                    {pagados.map(expense => (
                      <tr
                        key={expense.id}
                        onClick={() => openExpenseModal(expense)}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors text-[13px]">{expense.expense}</p>
                          {expense.cuenta && <p className="text-[11px] text-zinc-400 mt-0.5">{expense.cuenta}</p>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{formatCurrency(expense.valor, expense.moneda)}</span>
                          <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{expense.moneda || 'COP'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[11px] font-semibold">{expense.categoria}</span>
                        </td>
                        <td className="px-4 py-3 text-emerald-500 font-bold text-[11px]">
                          {expense.fecha} ✓
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
        expenseToEdit={expenseToEdit}
      />

      <PaymentConfirmModal
        expense={paymentModalExpense}
        onClose={() => setPaymentModalExpense(null)}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
    </div>
  );
}
