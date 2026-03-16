import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { FolderGit2, CheckCircle } from 'lucide-react';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import ExpenseModal from '../components/ExpenseModal';
import { format, endOfMonth } from 'date-fns';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function ExpensesByCategory() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        .order('fecha', { ascending: false });

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

  // Group by category
  const grouped = expenses.reduce((acc, curr) => {
    if (!acc[curr.categoria]) {
      acc[curr.categoria] = { items: [], total: 0 };
    }
    acc[curr.categoria].items.push(curr);
    acc[curr.categoria].total += Number(curr.valor); // Assuming primary currency for folder sum
    return acc;
  }, {} as Record<string, { items: Expense[], total: number }>);

  if (loading) return <div className="animate-pulse flex p-8 text-zinc-500 font-medium">Clasificando inversiones...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-100 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
            <FolderGit2 className="w-8 h-8 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight">Por Categoría</h1>
            <p className="text-zinc-500 font-medium mt-1">Descubre dónde se fuga o se invierte tu dinero.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={displayMonth}
            onChange={(e) => setDisplayMonth(Number(e.target.value))}
            className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm outline-none"
          >
            {monthNames.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={displayYear}
            onChange={(e) => setDisplayYear(Number(e.target.value))}
            className="bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-700 py-3 px-5 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm outline-none"
          >
            {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(grouped).map(([category, data]) => {
          const catData = data as { items: Expense[], total: number };
          return (
            <div key={category} className="bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden flex flex-col">
              <div className="p-6 px-8 border-b border-indigo-50/50 flex justify-between items-center bg-indigo-50/30">
                <h2 className="text-xl font-bold text-indigo-900">{category}</h2>
                <span className="font-bold text-indigo-700 text-right">{formatCurrency(catData.total, 'COP')} <span className="text-xs ml-1 text-indigo-500/80">COP</span></span>
              </div>
              <div className="divide-y divide-zinc-50 flex-1 overflow-y-auto max-h-[400px]">
                {catData.items.map(expense => (
                  <div key={expense.id} onClick={() => openExpenseModal(expense)} className="p-5 px-8 flex justify-between items-center hover:bg-zinc-50/50 transition-colors group cursor-pointer">
                    <div>
                      <p className="font-bold text-zinc-900 text-base group-hover:text-indigo-700 transition-colors">{expense.expense}</p>
                      <p className="text-xs font-semibold text-zinc-400 mt-1 uppercase tracking-wider">{expense.fecha || 'Sin fecha'}</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-base text-zinc-900 whitespace-nowrap">{formatCurrency(expense.valor, expense.moneda)} <span className="text-xs ml-0.5 text-zinc-400">{expense.moneda || 'COP'}</span></p>
                        <span className={`text-[10px] font-bold mt-1 px-2 py-0.5 rounded-full inline-block ${expense.status === 'Pagado' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {expense.status}
                        </span>
                      </div>
                      {expense.status === 'Pendiente' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-zinc-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 text-zinc-400 transition-colors shadow-sm shrink-0"
                          title="Marcar como pagado"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {Object.keys(grouped).length === 0 && (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center font-medium text-zinc-500 py-16 bg-white rounded-[32px] border border-zinc-100">
            No se encontraron categorías o inversiones.
          </div>
        )}
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
