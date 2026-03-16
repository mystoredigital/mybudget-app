import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { Plus, Search, Filter, CheckCircle, FileText } from 'lucide-react';
import ExpenseModal from '../components/ExpenseModal';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import { format, endOfMonth } from 'date-fns';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function ExpensesTable() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  // Filters
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

  const filteredExpenses = expenses.filter(exp =>
    exp.expense.toLowerCase().includes(search.toLowerCase()) ||
    exp.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    exp.cuenta?.toLowerCase().includes(search.toLowerCase()) ||
    exp.comment?.toLowerCase().includes(search.toLowerCase())
  );

  const openExpenseModal = (expense?: Expense) => {
    setExpenseToEdit(expense || null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-teal-800 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
            <FileText className="w-8 h-8 text-teal-50" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight">Todos los Movimientos</h1>
            <p className="text-zinc-500 font-medium mt-1">Directorio maestro de tus finanzas.</p>
          </div>
        </div>
        <button
          onClick={() => openExpenseModal()}
          className="bg-teal-900 text-white px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-teal-800 transition-all shadow-md shadow-teal-900/20"
        >
          <Plus className="w-5 h-5" />
          Agregar Movimiento
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden">
        {/* Actions Bar */}
        <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-zinc-50/50">
          <div className="relative w-full sm:w-[350px]">
            <Search className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar movimientos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-3 bg-white rounded-full text-sm font-medium border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm transition-shadow"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={displayMonth}
              onChange={(e) => setDisplayMonth(Number(e.target.value))}
              className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm outline-none"
            >
              {monthNames.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select
              value={displayYear}
              onChange={(e) => setDisplayYear(Number(e.target.value))}
              className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-zinc-700 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-colors shadow-sm">
              <Filter className="w-4 h-4" />
              Filtrar
            </button>
          </div>
        </div>

        <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <div className="p-8 text-center text-zinc-500 font-medium">Buscando base de datos...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 font-medium">No se encontraron movimientos.</div>
          ) : (
            filteredExpenses.map((expense) => {
              const isOverdue = expense.vence_en?.startsWith('Venci') || expense.vence_en?.startsWith('Vence hoy');
              const isPagado = expense.status === 'Pagado';

              let statusBg = 'bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400';
              let statusDot = 'bg-amber-500';
              let expiryColor = 'text-amber-600 dark:text-amber-400';

              if (isPagado) {
                statusBg = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400';
                statusDot = 'bg-emerald-500';
                expiryColor = 'text-emerald-500';
              } else if (isOverdue) {
                statusBg = 'bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400';
                statusDot = 'bg-rose-500';
                expiryColor = 'text-rose-600 dark:text-rose-400';
              }

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
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${statusBg}`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-1 ${statusDot}`}></div>
                        {expense.status}
                      </span>
                      <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[100px]">
                        {expense.categoria}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-bold ${expiryColor}`}>
                        {expense.vence_en || (isPagado ? 'Pagado' : 'Pendiente')}
                      </span>
                      {expense.status === 'Pendiente' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                          className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200 dark:hover:bg-teal-900/30 text-zinc-400 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-zinc-400 font-bold border-b border-zinc-100 text-xs uppercase tracking-wider dark:bg-zinc-900 dark:border-zinc-800">
              <tr>
                <th className="px-8 py-5">Estado</th>
                <th className="px-6 py-5">Detalle / Inversión</th>
                <th className="px-6 py-5">Clasificación</th>
                <th className="px-6 py-5">Fecha / Vencimiento</th>
                <th className="px-6 py-5 text-right">Valor</th>
                <th className="px-8 py-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-zinc-500 font-medium">Buscando base de datos...</td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-zinc-500 font-medium">No se encontraron movimientos.</td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isOverdue = expense.vence_en?.startsWith('Venci') || expense.vence_en?.startsWith('Vence hoy');
                  const isPagado = expense.status === 'Pagado';

                  let statusBg = 'bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400';
                  let statusDot = 'bg-amber-500';
                  let expiryColor = 'text-amber-600 dark:text-amber-400';

                  if (isPagado) {
                    statusBg = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400';
                    statusDot = 'bg-emerald-500';
                    expiryColor = 'text-emerald-500';
                  } else if (isOverdue) {
                    statusBg = 'bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400';
                    statusDot = 'bg-rose-500';
                    expiryColor = 'text-rose-600 dark:text-rose-400';
                  }

                  return (
                    <tr key={expense.id} onClick={() => openExpenseModal(expense)} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors group cursor-pointer">
                      <td className="px-8 py-5">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${statusBg}`}>
                          <div className={`w-1.5 h-1.5 rounded-full mr-2 ${statusDot}`}></div>
                          {expense.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">{expense.expense}</p>
                        <p className="text-xs text-zinc-400 font-medium mt-1">{expense.cuenta || 'Sin Cuenta'}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide border border-zinc-200/50 dark:border-zinc-700">
                          {expense.categoria}
                        </span>
                        <p className="text-xs text-zinc-400 font-medium mt-1 uppercase">{expense.tipo_presupuesto}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-zinc-600 dark:text-zinc-400 font-medium">{expense.fecha || 'Sin fecha'}</p>
                        <p className={`text-xs font-bold mt-1 ${expiryColor}`}>{expense.vence_en || 'Pendiente'}</p>
                      </td>
                      <td className="px-6 py-5 font-bold text-zinc-900 dark:text-zinc-100 text-base text-right whitespace-nowrap">
                        {formatCurrency(expense.valor, expense.moneda)} <span className="text-xs ml-1 text-zinc-400 dark:text-zinc-500">{expense.moneda || 'COP'}</span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {expense.status === 'Pendiente' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                            className="w-10 h-10 rounded-full inline-flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200 dark:hover:bg-teal-900/30 text-zinc-400 transition-colors shadow-sm"
                            title="Marcar como pagado"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        ) : (
                          <span className="text-emerald-500 font-medium text-sm flex items-center justify-end gap-1"><CheckCircle className="w-4 h-4" /> Listo</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
