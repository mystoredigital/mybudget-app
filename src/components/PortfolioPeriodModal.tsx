import React, { useEffect, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import {
    supabase, PortfolioPeriod, Currency, PortfolioPeriodStatus, PortfolioPeriodIncome,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

type Props = {
    isOpen: boolean;
    portfolioId: string;
    defaultCurrency: Currency;
    onClose: () => void;
    onSuccess: (saved?: PortfolioPeriod) => void;
    periodToEdit?: PortfolioPeriod | null;
};

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function defaultMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

type IncomeLine = {
    id?: string;       // undefined = nueva
    concept: string;
    amount: string;    // string para input
    sign: -1 | 1;
};

const blankLine = (): IncomeLine => ({ concept: '', amount: '', sign: 1 });

export default function PortfolioPeriodModal({ isOpen, portfolioId, defaultCurrency, onClose, onSuccess, periodToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [periodMonth, setPeriodMonth] = useState(defaultMonth());
    const [currency, setCurrency] = useState<Currency>(defaultCurrency);
    const [status, setStatus] = useState<PortfolioPeriodStatus>('abierto');
    const [notes, setNotes] = useState('');
    const [incomes, setIncomes] = useState<IncomeLine[]>([blankLine()]);

    useEffect(() => {
        if (!isOpen) return;
        if (periodToEdit) {
            setPeriodMonth(periodToEdit.period_month.slice(0, 10));
            setCurrency(periodToEdit.currency);
            setStatus(periodToEdit.status);
            setNotes(periodToEdit.notes || '');
            // Cargar líneas existentes
            loadIncomes(periodToEdit.id);
        } else {
            setPeriodMonth(defaultMonth());
            setCurrency(defaultCurrency);
            setStatus('abierto');
            setNotes('');
            setIncomes([blankLine()]);
        }
    }, [isOpen, periodToEdit, defaultCurrency]);

    async function loadIncomes(periodId: string) {
        const { data } = await supabase
            .from('portfolio_period_incomes')
            .select('*')
            .eq('period_id', periodId)
            .order('sort_order')
            .order('created_at');
        if (data && data.length > 0) {
            setIncomes(data.map((row: PortfolioPeriodIncome) => ({
                id: row.id,
                concept: row.concept,
                amount: String(row.amount),
                sign: row.sign,
            })));
        } else {
            setIncomes([blankLine()]);
        }
    }

    if (!isOpen) return null;

    const total = incomes.reduce((acc, line) => {
        const amt = parseFloat(line.amount) || 0;
        return acc + amt * line.sign;
    }, 0);

    const updateLine = (idx: number, patch: Partial<IncomeLine>) => {
        setIncomes(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
    };
    const addLine = () => setIncomes(prev => [...prev, blankLine()]);
    const removeLine = (idx: number) => {
        setIncomes(prev => prev.length === 1 ? [blankLine()] : prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const monthDate = periodMonth.slice(0, 7) + '-01';

        // Validar líneas: ignorar las completamente vacías; las parcialmente llenas son error
        const validLines = incomes.filter(l => l.concept.trim() && l.amount !== '');
        const invalid = incomes.filter(l => (l.concept.trim() === '' && l.amount !== '') || (l.concept.trim() !== '' && l.amount === ''));
        if (invalid.length > 0) {
            alert('Hay líneas con concepto o monto incompletos.');
            return;
        }

        setLoading(true);
        try {
            const periodPayload: any = {
                portfolio_id: portfolioId,
                user_id: user.id,
                period_month: monthDate,
                gross_income: Math.max(total, 0), // cache (para queries simples)
                currency,
                status,
                notes: notes || null,
                closed_at: status === 'cerrado' ? new Date().toISOString() : null,
            };

            let savedPeriod: PortfolioPeriod;
            if (periodToEdit) {
                const { data, error } = await supabase.from('portfolio_periods').update(periodPayload).eq('id', periodToEdit.id).select().single();
                if (error) throw error;
                savedPeriod = data as PortfolioPeriod;
            } else {
                const { data, error } = await supabase.from('portfolio_periods').insert([periodPayload]).select().single();
                if (error) throw error;
                savedPeriod = data as PortfolioPeriod;
            }

            // Sincronizar incomes: borrar todos los del periodo y reinsertar.
            // Es simple y los volúmenes son chicos (5-10 líneas).
            await supabase.from('portfolio_period_incomes').delete().eq('period_id', savedPeriod.id);
            if (validLines.length > 0) {
                const rows = validLines.map((l, i) => ({
                    period_id: savedPeriod.id,
                    user_id: user.id,
                    concept: l.concept.trim(),
                    amount: parseFloat(l.amount) || 0,
                    sign: l.sign,
                    sort_order: i,
                }));
                const { error } = await supabase.from('portfolio_period_incomes').insert(rows);
                if (error) throw error;
            }

            onSuccess(savedPeriod);
            onClose();
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!periodToEdit) return;
        if (!window.confirm('¿Eliminar este periodo? Los movimientos asociados quedarán sin periodo.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('portfolio_periods').delete().eq('id', periodToEdit.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                        {periodToEdit ? 'Editar Periodo' : 'Nuevo Periodo'}
                    </h2>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto flex-1 min-h-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Mes *</label>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={parseInt(periodMonth.slice(5, 7), 10)}
                                    onChange={(e) => {
                                        const month = String(parseInt(e.target.value, 10)).padStart(2, '0');
                                        setPeriodMonth(`${periodMonth.slice(0, 4)}-${month}-01`);
                                    }}
                                    className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100 capitalize"
                                >
                                    {MONTHS.map((m, i) => (
                                        <option key={i} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="2000"
                                    max="2099"
                                    value={periodMonth.slice(0, 4)}
                                    onChange={(e) => {
                                        const year = e.target.value.slice(0, 4);
                                        if (year.length === 4) setPeriodMonth(`${year}-${periodMonth.slice(5, 7)}-01`);
                                    }}
                                    className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100 text-center"
                                />
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                                Mes en que <strong>recibes</strong> la comisión. Los gastos operativos del mes anterior se descuentan automáticamente.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Estado</label>
                            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl">
                                <button type="button" onClick={() => setStatus('abierto')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${status === 'abierto' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>Abierto</button>
                                <button type="button" onClick={() => setStatus('cerrado')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${status === 'cerrado' ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm' : 'text-zinc-500'}`}>Cerrado</button>
                            </div>
                            <div className="mt-2">
                                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Moneda</label>
                                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-center font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                                    <option value="USD">USD</option>
                                    <option value="COP">COP</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Líneas de ingreso bruto */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ingresos del periodo</label>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Desglose del bruto: Concesionario, Operador, etc. Usa − para ajustes que reducen.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {incomes.map((line, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <div className="flex gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                        <button type="button" onClick={() => updateLine(idx, { sign: 1 })} className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${line.sign === 1 ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm' : 'text-zinc-400'}`} title="Suma">+</button>
                                        <button type="button" onClick={() => updateLine(idx, { sign: -1 })} className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${line.sign === -1 ? 'bg-white dark:bg-zinc-700 text-rose-600 shadow-sm' : 'text-zinc-400'}`} title="Resta">−</button>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Concepto (ej. Concesionario, Operador)"
                                        value={line.concept}
                                        onChange={(e) => updateLine(idx, { concept: e.target.value })}
                                        className="flex-1 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100 text-sm"
                                    />
                                    <div className="relative w-44">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-zinc-400 text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                            value={line.amount}
                                            onChange={(e) => updateLine(idx, { amount: e.target.value })}
                                            className="w-full pl-7 pr-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100 text-sm text-right"
                                        />
                                    </div>
                                    <button type="button" onClick={() => removeLine(idx)} className="w-9 h-9 rounded-xl text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 flex items-center justify-center" title="Quitar línea">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button type="button" onClick={addLine} className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Agregar línea
                        </button>

                        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Total bruto</span>
                            <span className={`text-2xl font-bold ${total >= 0 ? 'text-zinc-900 dark:text-white' : 'text-rose-600'}`}>
                                {formatCurrency(total, currency)}
                                <span className="text-xs ml-2 text-zinc-400 font-semibold">{currency}</span>
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Notas</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones del mes…" className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100 resize-none" />
                    </div>
                </form>

                <div className="flex justify-between p-6 px-8 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
                    <div>
                        {periodToEdit && (
                            <button type="button" onClick={handleDelete} className="px-5 py-3 rounded-2xl font-bold text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors flex items-center gap-2">
                                <Trash2 className="w-5 h-5" /> Eliminar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                        <button type="submit" onClick={handleSubmit} disabled={loading} className="px-8 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md shadow-teal-900/20">
                            {loading ? 'Guardando...' : (periodToEdit ? 'Guardar' : 'Crear')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
