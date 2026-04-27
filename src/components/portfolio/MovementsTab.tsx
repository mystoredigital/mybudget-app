import React, { useMemo, useState } from 'react';
import { Plus, Pencil, CheckCircle2, Paperclip } from 'lucide-react';
import {
    PortfolioMovement, PortfolioMovementType, PortfolioPartner, PortfolioOperator,
    PortfolioPeriod, Currency, PortfolioMovementFile,
} from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import PortfolioMovementModal from '../PortfolioMovementModal';
import PortfolioPaymentConfirmModal from '../PortfolioPaymentConfirmModal';

type Props = {
    portfolioId: string;
    defaultCurrency: Currency;
    movements: PortfolioMovement[];
    movementFiles: PortfolioMovementFile[];
    partners: PortfolioPartner[];
    operators: PortfolioOperator[];
    periods: PortfolioPeriod[];
    onChange: () => void;
};

const TYPE_LABELS: Record<PortfolioMovementType, string> = {
    gasto_operativo: 'Gasto operativo',
    gasto_socio: 'Gasto de socio',
    pago_operador: 'Pago a operador',
    pago_socio: 'Pago a socio',
    ajuste: 'Ajuste',
};

const TYPE_COLORS: Record<PortfolioMovementType, string> = {
    gasto_operativo: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    gasto_socio: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    pago_operador: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    pago_socio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ajuste: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export default function MovementsTab({
    portfolioId, defaultCurrency, movements, movementFiles, partners, operators, periods, onChange,
}: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PortfolioMovement | null>(null);
    const [confirmingPayment, setConfirmingPayment] = useState<PortfolioMovement | null>(null);
    const [filterPeriodId, setFilterPeriodId] = useState<string>('');
    const [filterType, setFilterType] = useState<PortfolioMovementType | ''>('');

    const partnerById = useMemo(() => Object.fromEntries(partners.map(p => [p.id, p])), [partners]);
    const operatorById = useMemo(() => Object.fromEntries(operators.map(o => [o.id, o])), [operators]);
    const filesByMovement = useMemo(() => {
        const map: Record<string, number> = {};
        for (const f of movementFiles) {
            map[f.movement_id] = (map[f.movement_id] || 0) + 1;
        }
        return map;
    }, [movementFiles]);

    const filtered = useMemo(() => {
        return movements.filter(m => {
            if (filterPeriodId && m.period_id !== filterPeriodId) return false;
            if (filterType && m.type !== filterType) return false;
            return true;
        });
    }, [movements, filterPeriodId, filterType]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex flex-wrap gap-2">
                    <select value={filterPeriodId} onChange={(e) => setFilterPeriodId(e.target.value)} className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-700 dark:text-zinc-300">
                        <option value="">Todos los periodos</option>
                        {periods.map(p => (
                            <option key={p.id} value={p.id}>{formatMonth(p.period_month)}</option>
                        ))}
                    </select>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-700 dark:text-zinc-300">
                        <option value="">Todos los tipos</option>
                        {Object.entries(TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Movimiento
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800">
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Sin movimientos para los filtros activos.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <table className="w-full">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                            <tr className="text-left text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Concepto</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Asignado a</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filtered.map(m => {
                                const isCredit = m.sign === 1;
                                const partner = m.partner_id ? partnerById[m.partner_id] : null;
                                const operator = m.operator_id ? operatorById[m.operator_id] : null;
                                const filesCount = filesByMovement[m.id] || 0;
                                return (
                                    <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{m.fecha}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-zinc-900 dark:text-white">{m.concept}</p>
                                                {filesCount > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 rounded-md" title={`${filesCount} comprobante(s)`}>
                                                        <Paperclip className="w-3 h-3" /> {filesCount}
                                                    </span>
                                                )}
                                            </div>
                                            {m.comment && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{m.comment}</p>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${TYPE_COLORS[m.type]}`}>
                                                {TYPE_LABELS[m.type]}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                                            {partner?.name || operator?.name || '—'}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold whitespace-nowrap ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {isCredit ? '+' : '−'} {formatCurrency(Number(m.amount), m.currency)}
                                            <span className="text-[10px] ml-1 text-zinc-400 font-semibold">{m.currency}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${m.status === 'Pagado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                                {m.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 justify-end">
                                                {m.status === 'Pendiente' && (
                                                    <button onClick={() => setConfirmingPayment(m)} className="px-3 h-9 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-500 transition-colors flex items-center gap-1.5 shadow-sm shadow-teal-500/20" title="Confirmar pago">
                                                        <CheckCircle2 className="w-4 h-4" /> Confirmar
                                                    </button>
                                                )}
                                                {m.status === 'Pagado' && filesCount === 0 && (
                                                    <button onClick={() => setConfirmingPayment(m)} className="px-3 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-500 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5" title="Subir comprobante">
                                                        <Paperclip className="w-4 h-4" /> Comprobante
                                                    </button>
                                                )}
                                                {m.status === 'Pagado' && filesCount > 0 && (
                                                    <button onClick={() => setConfirmingPayment(m)} className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 flex items-center justify-center" title="Ver comprobantes">
                                                        <Paperclip className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => { setEditing(m); setModalOpen(true); }} className="w-9 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 flex items-center justify-center" title="Editar">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <PortfolioMovementModal
                isOpen={modalOpen}
                portfolioId={portfolioId}
                defaultCurrency={defaultCurrency}
                partners={partners}
                operators={operators}
                periods={periods}
                selectedPeriodId={filterPeriodId || null}
                onClose={() => setModalOpen(false)}
                onSuccess={onChange}
                movementToEdit={editing}
            />

            <PortfolioPaymentConfirmModal
                movement={confirmingPayment}
                partner={confirmingPayment?.partner_id ? partnerById[confirmingPayment.partner_id] : null}
                operator={confirmingPayment?.operator_id ? operatorById[confirmingPayment.operator_id] : null}
                onClose={() => setConfirmingPayment(null)}
                onSuccess={onChange}
            />
        </div>
    );
}

function formatMonth(iso: string): string {
    const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
