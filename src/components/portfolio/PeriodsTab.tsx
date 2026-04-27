import React, { useState } from 'react';
import { Plus, Pencil, CalendarRange } from 'lucide-react';
import { PortfolioPeriod, Currency } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import PortfolioPeriodModal from '../PortfolioPeriodModal';

type Props = {
    portfolioId: string;
    defaultCurrency: Currency;
    periods: PortfolioPeriod[];
    onChange: () => void;
};

export default function PeriodsTab({ portfolioId, defaultCurrency, periods, onChange }: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PortfolioPeriod | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{periods.length} {periods.length === 1 ? 'periodo' : 'periodos'}</p>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Periodo
                </button>
            </div>

            {periods.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800">
                    <CalendarRange className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Sin periodos creados. Cada periodo representa el cierre mensual de la operación.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <table className="w-full">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                            <tr className="text-left text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                <th className="px-6 py-4">Mes</th>
                                <th className="px-6 py-4">Bruto</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">Notas</th>
                                <th className="px-6 py-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {periods.map(p => (
                                <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white capitalize">{formatMonth(p.period_month)}</td>
                                    <td className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                                        {formatCurrency(Number(p.gross_income), p.currency)}
                                        <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{p.currency}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${p.status === 'cerrado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                            {p.status === 'cerrado' ? 'Cerrado' : 'Abierto'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400 max-w-xs truncate">{p.notes || '—'}</td>
                                    <td className="px-6 py-4">
                                        <button onClick={() => { setEditing(p); setModalOpen(true); }} className="w-9 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 flex items-center justify-center" title="Editar">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <PortfolioPeriodModal
                isOpen={modalOpen}
                portfolioId={portfolioId}
                defaultCurrency={defaultCurrency}
                onClose={() => setModalOpen(false)}
                onSuccess={onChange}
                periodToEdit={editing}
            />
        </div>
    );
}

function formatMonth(iso: string): string {
    const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
