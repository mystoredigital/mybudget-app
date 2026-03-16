import React, { useEffect, useState } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle } from 'lucide-react';
import PaymentConfirmModal from '../components/PaymentConfirmModal';

export default function CalendarView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [paymentModalExpense, setPaymentModalExpense] = useState<Expense | null>(null);

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses_view')
        .select('*')
        .not('fecha', 'is', null);

      if (error) throw error;
      if (data) setExpenses(data as Expense[]);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    } finally {
      setLoading(false);
    }
  }

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start week on Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  if (loading) return <div className="animate-pulse flex p-8 text-zinc-500 font-medium">Cargando calendario...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-rose-100 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
            <CalendarIcon className="w-8 h-8 text-rose-700" />
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight">Calendario</h1>
            <p className="text-zinc-500 font-medium mt-1">Planifica tus fechas de pago y vencimiento.</p>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center bg-white p-1.5 rounded-full shadow-sm border border-zinc-200">
          <button onClick={prevMonth} className="p-3 bg-zinc-50 hover:bg-rose-50 hover:text-rose-600 rounded-full transition-colors group">
            <ChevronLeft className="w-5 h-5 text-zinc-500 group-hover:text-rose-600" />
          </button>
          <span className="font-bold text-zinc-800 w-40 text-center uppercase tracking-wide text-sm">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={nextMonth} className="p-3 bg-zinc-50 hover:bg-rose-50 hover:text-rose-600 rounded-full transition-colors group">
            <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-rose-600" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-rose-50/30">
          {weekDays.map(day => (
            <div key={day} className="p-4 text-center text-xs font-bold uppercase tracking-wider text-rose-900/60">
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 auto-rows-fr bg-zinc-50/30">
          {daysInMonth.map((day, i) => {
            const dayExpenses = expenses.filter(e => e.fecha && isSameDay(parseISO(e.fecha), day));
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={day.toString()}
                className={`min-h-[140px] p-2 sm:p-3 border-b border-r border-zinc-100 transition-colors ${!isCurrentMonth ? 'bg-zinc-50/80' : 'bg-white hover:bg-rose-50/10'
                  }`}
              >
                {/* Day Header */}
                <div className="flex justify-end mb-2">
                  <span className={`text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full transition-all ${isToday
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : !isCurrentMonth ? 'text-zinc-300' : 'text-zinc-500'
                    }`}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Events list */}
                <div className="space-y-1.5">
                  {dayExpenses.map(expense => (
                    <div
                      key={expense.id}
                      onClick={() => expense.status === 'Pendiente' ? setPaymentModalExpense(expense) : null}
                      className={`text-left p-2 rounded-xl border transition-all ${expense.status === 'Pagado'
                          ? 'bg-emerald-50/80 border-emerald-100'
                          : 'bg-white border-rose-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer group'
                        }`}
                      title={`${expense.expense} - ${formatCurrency(expense.valor, expense.moneda)}`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div className={`font-bold text-xs truncate ${expense.status === 'Pagado' ? 'text-emerald-700/80 line-through' : 'text-zinc-900 group-hover:text-rose-700 w-full'}`}>{expense.expense}</div>
                        {expense.status === 'Pendiente' && <CheckCircle className="w-3.5 h-3.5 text-zinc-300 group-hover:text-rose-400 shrink-0" />}
                      </div>
                      <div className={`mt-1 font-semibold text-[11px] ${expense.status === 'Pagado' ? 'text-emerald-600/70' : 'text-zinc-500'}`}>{formatCurrency(expense.valor, expense.moneda)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PaymentConfirmModal
        expense={paymentModalExpense}
        onClose={() => setPaymentModalExpense(null)}
        onSuccess={fetchExpenses}
      />
    </div>
  );
}
