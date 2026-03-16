import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { Coffee, ArrowUpRight, Search } from 'lucide-react';
import ExpenseModal from '../components/ExpenseModal';

export default function FoodExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
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
        .eq('categoria', 'Food')
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

  const total = expenses.reduce((acc, curr) => acc + Number(curr.valor), 0);

  if (loading) return <div className="animate-pulse flex p-8 text-zinc-500 font-medium">Buscando datos de comida...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-400 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
            <Coffee className="w-8 h-8 text-amber-900" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight">Inversiones en Comida</h1>
            <p className="text-zinc-500 font-medium mt-1">Supermercados, restaurantes y deliveies.</p>
          </div>
        </div>

        <div className="relative w-full md:w-auto">
          <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar hamburguesas..."
            className="pl-12 pr-6 py-3 bg-white rounded-full text-sm font-medium w-full md:w-[260px] border border-zinc-100 shadow-sm focus:ring-2 focus:ring-amber-400 outline-none transition-shadow"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Total Card */}
        <div className="col-span-1 lg:col-span-1 bg-amber-900 rounded-[32px] p-8 text-white relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Coffee className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <span className="bg-amber-800/80 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-amber-100 mb-4 inline-block">Métricas</span>
            <h2 className="text-amber-100/80 font-medium text-sm mt-4">Total Invertido en Comida</h2>
            <span className="text-4xl font-bold mt-1 block">{formatCurrency(total, 'COP')}</span>
          </div>
        </div>

        {/* List Section */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden flex flex-col">
          <div className="p-6 px-8 border-b border-zinc-50 flex justify-between items-center bg-zinc-50/50">
            <h2 className="text-lg font-bold text-zinc-900">Historial Reciente</h2>
            <span className="text-sm font-semibold text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">{expenses.length} registros</span>
          </div>
          <div className="divide-y divide-zinc-50/80 overflow-y-auto max-h-[500px]">
            {expenses.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 font-medium">No se encontraron inversiones en comida.</div>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} onClick={() => openExpenseModal(expense)} className="p-6 px-8 flex justify-between items-center hover:bg-amber-50/30 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                      <Coffee className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 text-lg group-hover:text-amber-700 transition-colors">{expense.expense}</p>
                      <p className="text-sm font-medium text-zinc-500 mt-1">{expense.fecha || 'Sin fecha'} • {expense.cuenta || 'Efectivo'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl text-zinc-900">{formatCurrency(expense.valor, expense.moneda)}</p>
                    <span className={`text-xs font-bold mt-1 px-3 py-1 rounded-full inline-block ${expense.status === 'Pagado' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {expense.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchExpenses}
        expenseToEdit={expenseToEdit}
      />
    </div>
  );
}
