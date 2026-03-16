import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarRange, CheckCircle } from 'lucide-react';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import ExpenseModal from '../components/ExpenseModal';

export default function ExpensesByMonth() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses_view')
        .select('*')
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

  // Group by month
  const grouped = expenses.reduce((acc, curr) => {
    let dateStr = 'Sin fecha';
    let displayStr = 'Sin fecha';
    if (curr.fecha) {
      const pDate = parseISO(curr.fecha);
      dateStr = format(pDate, 'yyyy-MM');
      displayStr = format(pDate, 'MMMM yyyy', { locale: es });
    }

    if (!acc[dateStr]) {
      acc[dateStr] = { items: [], total: 0, displayName: displayStr.charAt(0).toUpperCase() + displayStr.slice(1) };
    }
    acc[dateStr].items.push(curr);
    acc[dateStr].total += Number(curr.valor); // Assuming COP as primary representation
    return acc;
  }, {} as Record<string, { items: Expense[], total: number, displayName: string }>);

  // Sorting descending by key (Year-Month) naturally
  const sortedMonths = Object.keys(grouped).sort().reverse();

  if (loading) return <div className="animate-pulse flex p-8 text-zinc-500 font-medium">Cronometrando inversiones...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-sky-100 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
          <CalendarRange className="w-8 h-8 text-sky-700" />
        </div>
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight">Timeline Mensual</h1>
          <p className="text-zinc-500 font-medium mt-1">Tu flujo de caja organizado por meses e historia.</p>
        </div>
      </div>

      <div className="space-y-8">
        {sortedMonths.map((monthKey) => {
          const data = grouped[monthKey];
          return (
            <div key={monthKey} className="bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden">
              <div className="p-6 px-10 border-b border-zinc-50 flex justify-between items-center bg-zinc-50/50">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-zinc-900">{data.displayName}</h2>
                  <span className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full">{data.items.length} inversiones</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Inversión Mensual</p>
                  <span className="font-bold text-2xl tracking-tight text-zinc-900">{formatCurrency(data.total, 'COP')}</span>
                </div>
              </div>
              <div className="divide-y divide-zinc-50">
                {data.items.map(expense => (
                  <div key={expense.id} onClick={() => openExpenseModal(expense)} className="p-5 px-10 flex justify-between items-center hover:bg-sky-50/30 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-6">
                      <div className="w-2 h-2 rounded-full bg-zinc-200 group-hover:bg-sky-500 transition-colors hidden sm:block"></div>
                      <div>
                        <p className="font-bold text-lg text-zinc-900 group-hover:text-sky-700 transition-colors">{expense.expense}</p>
                        <div className="flex gap-2 items-center mt-1">
                          <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">{expense.categoria}</span>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{expense.frecuencia}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-5">
                      <div>
                        <p className="font-bold text-lg text-zinc-900">{formatCurrency(expense.valor, expense.moneda)}</p>
                        <span className={`text-[11px] font-bold mt-1 px-3 py-1 rounded-full inline-block ${expense.status === 'Pagado' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {expense.status}
                        </span>
                      </div>
                      {expense.status === 'Pendiente' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPaymentModalExpense(expense); }}
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-zinc-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 text-zinc-400 transition-colors shadow-sm shrink-0"
                          title="Marcar como pagado"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      ) : (
                        <div className="w-10 flex justify-end"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {sortedMonths.length === 0 && (
          <div className="text-center text-zinc-500 font-medium py-16 bg-white rounded-[32px] border border-zinc-100">
            No has registrado ninguna inversión todavía en ninguna fecha.
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
