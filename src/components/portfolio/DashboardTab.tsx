import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Users } from 'lucide-react';
import {
    PortfolioPartner, PortfolioPeriod, PortfolioMovement, Currency, PortfolioPeriodIncome,
} from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

type Props = {
    defaultCurrency: Currency;
    partners: PortfolioPartner[];
    periods: PortfolioPeriod[];
    periodIncomes: PortfolioPeriodIncome[];
    movements: PortfolioMovement[];
};

// First and last day (ISO yyyy-mm-dd) of the month previous to `monthIso` (yyyy-mm-01).
function previousMonthBounds(monthIso: string): { start: string; end: string } {
    const [y, m] = monthIso.slice(0, 7).split('-').map(Number);
    const prevMonthIdx = m - 2; // 0-indexed previous month
    const prevYear = prevMonthIdx < 0 ? y - 1 : y;
    const normalized = (prevMonthIdx + 12) % 12;
    const start = new Date(prevYear, normalized, 1);
    const end = new Date(prevYear, normalized + 1, 0);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { start: fmt(start), end: fmt(end) };
}

function formatMonth(iso: string): string {
    const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

export default function DashboardTab({ defaultCurrency, partners, periods, periodIncomes, movements }: Props) {
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => periods[0]?.id || '');

    const selectedPeriod = useMemo(
        () => periods.find(p => p.id === selectedPeriodId) || null,
        [periods, selectedPeriodId]
    );

    const calc = useMemo(() => {
        if (!selectedPeriod) return null;

        const currency = selectedPeriod.currency;
        // Desglose del bruto: si hay líneas de ingreso, usar la suma; si no, usar el campo legacy
        const myIncomes = periodIncomes.filter(i => i.period_id === selectedPeriod.id);
        const sumIncomes = myIncomes.reduce((acc, i) => acc + Number(i.amount) * i.sign, 0);
        const gross = myIncomes.length > 0 ? sumIncomes : Number(selectedPeriod.gross_income) || 0;

        // 1) Descontables: gasto_operativo + pago_operador con fecha en el MES ANTERIOR
        const { start, end } = previousMonthBounds(selectedPeriod.period_month);
        const prevOperatives = movements.filter(m =>
            (m.type === 'gasto_operativo' || m.type === 'pago_operador') &&
            m.fecha >= start && m.fecha <= end
        );
        // sign=-1 → effect negativo. Lo que se descuenta = -Σ(amount*sign) = +Σ(amount) si todos sign=-1
        const effectPrevOperatives = prevOperatives.reduce((acc, m) => acc + Number(m.amount) * m.sign, 0);
        const deductible = Math.abs(effectPrevOperatives);

        const netDistributable = gross + effectPrevOperatives; // suma con su signo

        // 2) Por socio: usando period_id del periodo seleccionado
        const totalShare = partners.reduce((acc, p) => acc + Number(p.share_percent), 0) || 0;
        const perPartner = partners.map(partner => {
            const sharePct = Number(partner.share_percent);
            const grossShare = netDistributable * (sharePct / 100);

            const partnerDeductions = movements.filter(m =>
                m.type === 'gasto_socio' && m.partner_id === partner.id && m.period_id === selectedPeriod.id
            );
            const effectDeductions = partnerDeductions.reduce((acc, m) => acc + Number(m.amount) * m.sign, 0);

            const partnerPayments = movements.filter(m =>
                m.type === 'pago_socio' && m.partner_id === partner.id && m.period_id === selectedPeriod.id && m.status === 'Pagado'
            );
            const effectPayments = partnerPayments.reduce((acc, m) => acc + Number(m.amount) * m.sign, 0);

            const balance = grossShare + effectDeductions + effectPayments;

            return {
                partner,
                sharePct,
                grossShare,
                deductionsAmount: Math.abs(effectDeductions),
                deductionsCount: partnerDeductions.length,
                paidAmount: Math.abs(effectPayments),
                paidCount: partnerPayments.length,
                balance,
            };
        });

        return { currency, gross, deductible, netDistributable, perPartner, prevOperatives, totalShare, incomes: myIncomes };
    }, [selectedPeriod, partners, movements, periodIncomes]);

    if (periods.length === 0) {
        return (
            <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800">
                <Wallet className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">Crea un periodo en la pestaña <strong>Periodos</strong> para empezar a ver el dashboard.</p>
            </div>
        );
    }

    if (!selectedPeriod || !calc) return null;

    return (
        <div className="space-y-6">
            {/* Selector de mes */}
            <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Periodo:</label>
                <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-white capitalize"
                >
                    {periods.map(p => (
                        <option key={p.id} value={p.id}>
                            {formatMonth(p.period_month)} {p.status === 'cerrado' ? '· Cerrado' : ''}
                        </option>
                    ))}
                </select>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${selectedPeriod.status === 'cerrado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {selectedPeriod.status === 'cerrado' ? 'Cerrado' : 'Abierto'}
                </span>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-2xl bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Bruto del mes</p>
                    </div>
                    <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                        {formatCurrency(calc.gross, calc.currency)}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 font-semibold">{calc.currency}</p>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 flex items-center justify-center">
                            <TrendingDown className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Descuentos mes anterior</p>
                    </div>
                    <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                        − {formatCurrency(calc.deductible, calc.currency)}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 font-semibold">{calc.prevOperatives.length} mov. operativos</p>
                </div>

                <div className="bg-gradient-to-br from-teal-900 to-teal-700 dark:from-teal-700 dark:to-teal-600 rounded-[28px] p-6 shadow-md text-white">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                            <Wallet className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-white/70 uppercase tracking-wide">Neto a distribuir</p>
                    </div>
                    <p className="text-3xl font-bold">{formatCurrency(calc.netDistributable, calc.currency)}</p>
                    <p className="text-xs text-white/60 mt-1 font-semibold">{calc.currency}</p>
                </div>
            </div>

            {/* Desglose del bruto */}
            {calc.incomes.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <h3 className="font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-teal-500" />
                        Desglose del bruto
                    </h3>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {calc.incomes.map(i => (
                            <div key={i.id} className="py-3 flex justify-between items-center">
                                <p className="font-semibold text-zinc-900 dark:text-white text-sm">{i.concept}</p>
                                <p className={`font-bold whitespace-nowrap ${i.sign === 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {i.sign === 1 ? '+' : '−'} {formatCurrency(Number(i.amount), i.sign === 1 ? calc.currency : calc.currency)}
                                </p>
                            </div>
                        ))}
                        <div className="py-3 flex justify-between items-center">
                            <p className="font-bold text-zinc-700 dark:text-zinc-300 text-sm uppercase tracking-wide">Total</p>
                            <p className="font-bold text-lg text-zinc-900 dark:text-white">{formatCurrency(calc.gross, calc.currency)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de descontables del mes anterior */}
            {calc.prevOperatives.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <h3 className="font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-rose-500" />
                        Descontables — Mes Anterior
                    </h3>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {calc.prevOperatives.map(m => (
                            <div key={m.id} className="py-3 flex justify-between items-center">
                                <div className="min-w-0">
                                    <p className="font-semibold text-zinc-900 dark:text-white text-sm">{m.concept}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.fecha}</p>
                                </div>
                                <p className="font-bold text-rose-600 whitespace-nowrap">
                                    − {formatCurrency(Number(m.amount), m.currency)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabla por socio */}
            <div className="bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-bold text-zinc-900 dark:text-white">Distribución por Socio</h3>
                    {Math.abs(calc.totalShare - 100) > 0.01 && partners.length > 0 && (
                        <span className="ml-2 text-xs font-bold text-amber-600">⚠ % no suma 100 ({calc.totalShare.toFixed(2)}%)</span>
                    )}
                </div>
                {partners.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Agrega socios en la pestaña <strong>Socios</strong> para calcular la distribución.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                <tr className="text-left text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    <th className="px-6 py-3">Socio</th>
                                    <th className="px-6 py-3 text-right">%</th>
                                    <th className="px-6 py-3 text-right">Parte bruta</th>
                                    <th className="px-6 py-3 text-right">Descuentos</th>
                                    <th className="px-6 py-3 text-right">Pagado</th>
                                    <th className="px-6 py-3 text-right">Saldo a entregar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {calc.perPartner.map(row => (
                                    <tr key={row.partner.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">{row.partner.name}</td>
                                        <td className="px-6 py-4 text-right text-sm font-semibold text-teal-600 dark:text-teal-400">
                                            {row.sharePct.toFixed(2)}%
                                        </td>
                                        <td className="px-6 py-4 text-right font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                            {formatCurrency(row.grossShare, calc.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            {row.deductionsAmount > 0 ? (
                                                <span className="text-rose-600 font-semibold">− {formatCurrency(row.deductionsAmount, calc.currency)}</span>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                            )}
                                            {row.deductionsCount > 0 && (
                                                <p className="text-[11px] text-zinc-400 font-medium">{row.deductionsCount} mov.</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            {row.paidAmount > 0 ? (
                                                <span className="text-blue-600 font-semibold">− {formatCurrency(row.paidAmount, calc.currency)}</span>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                            )}
                                            {row.paidCount > 0 && (
                                                <p className="text-[11px] text-zinc-400 font-medium">{row.paidCount} pago(s)</p>
                                            )}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold text-lg whitespace-nowrap ${row.balance > 0 ? 'text-emerald-600' : row.balance < 0 ? 'text-rose-600' : 'text-zinc-500'}`}>
                                            {formatCurrency(row.balance, calc.currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-zinc-50 dark:bg-zinc-800/50">
                                <tr className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                    <td className="px-6 py-3" colSpan={2}>Total</td>
                                    <td className="px-6 py-3 text-right whitespace-nowrap">
                                        {formatCurrency(calc.perPartner.reduce((a, r) => a + r.grossShare, 0), calc.currency)}
                                    </td>
                                    <td className="px-6 py-3 text-right text-rose-600 whitespace-nowrap">
                                        − {formatCurrency(calc.perPartner.reduce((a, r) => a + r.deductionsAmount, 0), calc.currency)}
                                    </td>
                                    <td className="px-6 py-3 text-right text-blue-600 whitespace-nowrap">
                                        − {formatCurrency(calc.perPartner.reduce((a, r) => a + r.paidAmount, 0), calc.currency)}
                                    </td>
                                    <td className="px-6 py-3 text-right text-emerald-600 whitespace-nowrap">
                                        {formatCurrency(calc.perPartner.reduce((a, r) => a + r.balance, 0), calc.currency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
