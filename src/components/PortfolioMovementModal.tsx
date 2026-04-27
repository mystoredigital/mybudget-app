import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
    supabase, PortfolioMovement, PortfolioMovementType, PortfolioPartner,
    PortfolioOperator, PortfolioPeriod, Currency, ExpenseStatus
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Props = {
    isOpen: boolean;
    portfolioId: string;
    defaultCurrency: Currency;
    partners: PortfolioPartner[];
    operators: PortfolioOperator[];
    periods: PortfolioPeriod[];
    selectedPeriodId?: string | null;
    onClose: () => void;
    onSuccess: () => void;
    movementToEdit?: PortfolioMovement | null;
};

const TYPE_OPTIONS: { value: PortfolioMovementType; label: string; help: string; defaultSign: -1 | 1 }[] = [
    { value: 'gasto_operativo', label: 'Gasto operativo', help: 'Gasto del portafolio. Se descuenta del bruto del MES SIGUIENTE.', defaultSign: -1 },
    { value: 'gasto_socio', label: 'Gasto de socio', help: 'Descuento individual a un socio en este periodo.', defaultSign: -1 },
    { value: 'pago_operador', label: 'Pago a operador', help: 'Pago a un operador (también es un gasto operativo).', defaultSign: -1 },
    { value: 'pago_socio', label: 'Pago a socio', help: 'Transferencia hecha a un socio. Reduce el saldo a entregar.', defaultSign: -1 },
    { value: 'ajuste', label: 'Ajuste', help: 'Corrección manual. Define el signo +/-.', defaultSign: 1 },
];

export default function PortfolioMovementModal({
    isOpen, portfolioId, defaultCurrency, partners, operators, periods,
    selectedPeriodId, onClose, onSuccess, movementToEdit,
}: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [type, setType] = useState<PortfolioMovementType>('gasto_operativo');
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [sign, setSign] = useState<-1 | 1>(-1);
    const [currency, setCurrency] = useState<Currency>(defaultCurrency);
    const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
    const [periodId, setPeriodId] = useState<string>('');
    const [partnerId, setPartnerId] = useState<string>('');
    const [operatorId, setOperatorId] = useState<string>('');
    const [status, setStatus] = useState<ExpenseStatus>('Pendiente');
    const [comment, setComment] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (movementToEdit) {
            setType(movementToEdit.type);
            setConcept(movementToEdit.concept);
            setAmount(String(movementToEdit.amount));
            setSign(movementToEdit.sign);
            setCurrency(movementToEdit.currency);
            setFecha(movementToEdit.fecha);
            setPeriodId(movementToEdit.period_id || '');
            setPartnerId(movementToEdit.partner_id || '');
            setOperatorId(movementToEdit.operator_id || '');
            setStatus(movementToEdit.status);
            setComment(movementToEdit.comment || '');
        } else {
            setType('gasto_operativo');
            setConcept('');
            setAmount('');
            setSign(-1);
            setCurrency(defaultCurrency);
            setFecha(new Date().toISOString().slice(0, 10));
            setPeriodId(selectedPeriodId || '');
            setPartnerId('');
            setOperatorId('');
            setStatus('Pendiente');
            setComment('');
        }
    }, [isOpen, movementToEdit, defaultCurrency, selectedPeriodId]);

    if (!isOpen) return null;

    const onTypeChange = (next: PortfolioMovementType) => {
        setType(next);
        const opt = TYPE_OPTIONS.find(o => o.value === next);
        if (opt) setSign(opt.defaultSign);
        // limpiar refs cuando no aplican
        if (next !== 'gasto_socio' && next !== 'pago_socio') setPartnerId('');
        if (next !== 'pago_operador') setOperatorId('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const trimmedConcept = concept.trim();
        if (!trimmedConcept) return;
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt < 0) {
            alert('Monto inválido');
            return;
        }

        setLoading(true);
        try {
            const payload: any = {
                portfolio_id: portfolioId,
                user_id: user.id,
                period_id: periodId || null,
                partner_id: partnerId || null,
                operator_id: operatorId || null,
                type,
                concept: trimmedConcept,
                amount: amt,
                sign,
                currency,
                fecha,
                status,
                comment: comment || null,
            };
            if (movementToEdit) {
                const { error } = await supabase.from('portfolio_movements').update(payload).eq('id', movementToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('portfolio_movements').insert([payload]);
                if (error) throw error;
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!movementToEdit) return;
        if (!window.confirm('¿Eliminar este movimiento?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('portfolio_movements').delete().eq('id', movementToEdit.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const showPartner = type === 'gasto_socio' || type === 'pago_socio';
    const showOperator = type === 'pago_operador';
    const currentTypeOpt = TYPE_OPTIONS.find(o => o.value === type);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                        {movementToEdit ? 'Editar Movimiento' : 'Nuevo Movimiento'}
                    </h2>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto flex-1 min-h-0">
                    {/* Tipo */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Tipo de movimiento</label>
                        <select value={type} onChange={(e) => onTypeChange(e.target.value as PortfolioMovementType)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100">
                            {TYPE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        {currentTypeOpt && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">{currentTypeOpt.help}</p>}
                    </div>

                    {/* Concept + Amount */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Concepto *</label>
                            <input required type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Pago contadora, Arriendo oficina" className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Monto *</label>
                                <div className="relative">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-semibold text-zinc-500">$</span>
                                    <input required type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full pl-9 pr-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" />
                                </div>
                            </div>
                            <div className="w-28">
                                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Moneda</label>
                                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-full px-3 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-center font-semibold text-zinc-900 dark:text-zinc-100">
                                    <option value="USD">USD</option>
                                    <option value="COP">COP</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Sign (sólo para ajuste) */}
                    {type === 'ajuste' && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Signo</label>
                            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl">
                                <button type="button" onClick={() => setSign(1)} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${sign === 1 ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm' : 'text-zinc-500'}`}>+ Suma</button>
                                <button type="button" onClick={() => setSign(-1)} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${sign === -1 ? 'bg-white dark:bg-zinc-700 text-rose-600 shadow-sm' : 'text-zinc-500'}`}>− Resta</button>
                            </div>
                        </div>
                    )}

                    {/* Periodo + Fecha */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Periodo</label>
                            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100">
                                <option value="">— Sin periodo —</option>
                                {periods.map(p => (
                                    <option key={p.id} value={p.id}>{formatMonth(p.period_month)}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">Para gastos operativos puede dejarse vacío; el dashboard usa la fecha.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Fecha *</label>
                            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" />
                        </div>
                    </div>

                    {/* Partner / Operator */}
                    {showPartner && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Socio *</label>
                            <select required value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100">
                                <option value="">— Selecciona socio —</option>
                                {partners.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.share_percent}%)</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {showOperator && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Operador *</label>
                            <select required value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100">
                                <option value="">— Selecciona operador —</option>
                                {operators.map(o => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Status + Comment */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Estado</label>
                            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl">
                                <button type="button" onClick={() => setStatus('Pendiente')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${status === 'Pendiente' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>Pendiente</button>
                                <button type="button" onClick={() => setStatus('Pagado')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${status === 'Pagado' ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm' : 'text-zinc-500'}`}>Pagado</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Comentario</label>
                            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" />
                        </div>
                    </div>
                </form>

                <div className="flex justify-between p-6 px-8 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
                    <div>
                        {movementToEdit && (
                            <button type="button" onClick={handleDelete} className="px-5 py-3 rounded-2xl font-bold text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors flex items-center gap-2">
                                <Trash2 className="w-5 h-5" /> Eliminar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                        <button type="submit" onClick={handleSubmit} disabled={loading} className="px-8 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md shadow-teal-900/20">
                            {loading ? 'Guardando...' : (movementToEdit ? 'Guardar' : 'Crear')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatMonth(iso: string): string {
    const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
