import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, Users, Tag, Pencil, Check, CheckCircle2, Clock, HandCoins } from 'lucide-react';
import { supabase, UserPortfolio, PortfolioPeriod, PortfolioPeriodItem, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import PortfolioModal from '../components/PortfolioModal';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtMonth = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${monthNames[d.getMonth()]} ${d.getFullYear()}`; };

type Consolidado = {
    portfolioId: string;
    name: string;
    mes: string | null;       // period_month ISO
    leDebo: number;
    estado: 'Pendiente' | 'Pagado';
    currency: Currency;
};

export default function PortfoliosList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [portfolios, setPortfolios] = useState<UserPortfolio[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<UserPortfolio | null>(null);
    const [consolidado, setConsolidado] = useState<Consolidado[]>([]);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [gastosPorPortafolio, setGastosPorPortafolio] = useState<Record<string, { count: number; totals: Partial<Record<Currency, number>> }>>({});

    useEffect(() => {
        if (user) load();
    }, [user]);

    async function load() {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('user_portfolios')
            .select('*')
            .eq('user_id', user.id)
            .order('type', { ascending: false }) // shared antes que simple
            .order('name');
        if (!error && data) {
            setPortfolios(data);
            await Promise.all([
                loadConsolidado(data as UserPortfolio[]),
                loadGastosSimples(),
            ]);
        }
        setLoading(false);
    }

    async function loadGastosSimples() {
        if (!user) return;
        const { data } = await supabase
            .from('expenses')
            .select('valor, moneda, portafolio')
            .eq('user_id', user.id);
        const map: Record<string, { count: number; totals: Partial<Record<Currency, number>> }> = {};
        for (const e of (data as { valor: number; moneda: Currency; portafolio: string | null }[]) || []) {
            const key = e.portafolio || 'Personal';
            if (!map[key]) map[key] = { count: 0, totals: {} };
            map[key].count += 1;
            map[key].totals[e.moneda] = (map[key].totals[e.moneda] || 0) + Number(e.valor || 0);
        }
        setGastosPorPortafolio(map);
    }

    async function loadConsolidado(all: UserPortfolio[]) {
        if (!user) return;
        const sharedList = all.filter(p => p.type === 'shared');
        if (sharedList.length === 0) { setConsolidado([]); return; }

        // Último periodo (mes) de cada portafolio compartido
        const { data: periods } = await supabase
            .from('portfolio_periods')
            .select('*')
            .eq('user_id', user.id)
            .order('period_month', { ascending: false });

        const latestByPortfolio = new Map<string, PortfolioPeriod>();
        for (const p of (periods as PortfolioPeriod[]) || []) {
            if (!latestByPortfolio.has(p.portfolio_id)) latestByPortfolio.set(p.portfolio_id, p);
        }

        const periodIds = [...latestByPortfolio.values()].map(p => p.id);
        let itemsByPeriod = new Map<string, PortfolioPeriodItem[]>();
        if (periodIds.length) {
            const { data: items } = await supabase
                .from('portfolio_period_items')
                .select('*')
                .in('period_id', periodIds);
            for (const it of (items as PortfolioPeriodItem[]) || []) {
                const arr = itemsByPeriod.get(it.period_id) || [];
                arr.push(it);
                itemsByPeriod.set(it.period_id, arr);
            }
        }

        const rows: Consolidado[] = sharedList.map(p => {
            const per = latestByPortfolio.get(p.id) || null;
            const items = per ? (itemsByPeriod.get(per.id) || []) : [];
            const sum = (t: string) => items.filter(i => i.tipo === t).reduce((a, c) => a + Number(c.monto), 0);
            const neto = sum('ingreso') - sum('gasto_compartido');
            const pct = per?.partner_percent ?? 50;
            const leDebo = neto * (pct / 100) + sum('cargo_socio') - sum('descuento_socio');
            return {
                portfolioId: p.id,
                name: p.name,
                mes: per?.period_month || null,
                leDebo: per ? leDebo : 0,
                estado: (per?.pago_socio_estado as 'Pendiente' | 'Pagado') || 'Pendiente',
                currency: p.default_currency,
            };
        });

        setConsolidado(rows);
        // Por defecto marca los que tienen un saldo pendiente (>0 y sin pagar)
        setChecked(new Set(rows.filter(r => r.mes && r.leDebo > 0 && r.estado !== 'Pagado').map(r => r.portfolioId)));
    }

    const toggleCheck = (id: string) => setChecked(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const shared = portfolios.filter(p => p.type === 'shared');
    const simple = portfolios.filter(p => p.type === 'simple');

    const seleccionados = consolidado.filter(r => checked.has(r.portfolioId));
    const totalSeleccionado = seleccionados.reduce((a, r) => a + r.leDebo, 0);
    const monedasSel = new Set(seleccionados.map(r => r.currency));
    const monedaTotal: Currency = monedasSel.size === 1 ? (Array.from(monedasSel)[0] as Currency) : 'USD';
    const monedasMixtas = monedasSel.size > 1;

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-900 p-3 rounded-[20px] shadow-sm flex items-center justify-center dark:bg-zinc-800">
                        <Briefcase className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Portafolios</h1>
                        <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Tus inversiones y negocios agrupados.</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Portafolio
                </button>
            </div>

            {/* Consolidado — Le debo a socios */}
            {!loading && consolidado.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <HandCoins className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Le debo a socios</h2>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium hidden sm:inline">— marca los que quieras sumar</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-50 dark:border-zinc-800/60">
                                    <th className="w-12 py-3 pl-6"></th>
                                    <th className="py-3 font-bold">Portafolio</th>
                                    <th className="py-3 font-bold">Mes</th>
                                    <th className="py-3 font-bold">Estado</th>
                                    <th className="py-3 pr-6 font-bold text-right">Le debo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                                {consolidado.map(r => {
                                    const isChecked = checked.has(r.portfolioId);
                                    const pagado = r.estado === 'Pagado';
                                    return (
                                        <tr
                                            key={r.portfolioId}
                                            onClick={() => toggleCheck(r.portfolioId)}
                                            className={`cursor-pointer transition-colors ${isChecked ? 'bg-teal-50/50 dark:bg-teal-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}
                                        >
                                            <td className="py-3 pl-6">
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isChecked ? 'bg-teal-600 border-teal-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                                    {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                                </div>
                                            </td>
                                            <td className="py-3 font-bold text-zinc-900 dark:text-white">{r.name}</td>
                                            <td className="py-3 text-zinc-500 dark:text-zinc-400">{r.mes ? fmtMonth(r.mes) : '—'}</td>
                                            <td className="py-3">
                                                {!r.mes ? (
                                                    <span className="text-zinc-400 text-xs">sin mes</span>
                                                ) : pagado ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Pagado</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-semibold text-xs"><Clock className="w-3.5 h-3.5" /> Pendiente</span>
                                                )}
                                            </td>
                                            <td className={`py-3 pr-6 text-right font-bold tabular-nums ${pagado ? 'text-zinc-400 line-through' : 'text-zinc-900 dark:text-white'}`}>
                                                {formatCurrency(r.leDebo, r.currency)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30">
                                    <td className="py-4 pl-6" colSpan={2}>
                                        <span className="font-bold text-zinc-900 dark:text-white">Total seleccionado</span>
                                        <span className="text-zinc-400 font-medium text-xs ml-2">({seleccionados.length})</span>
                                    </td>
                                    <td colSpan={2} className="py-4 text-xs text-zinc-400">
                                        {monedasMixtas && <span className="text-orange-500 font-semibold">Monedas mixtas — total en {monedaTotal}</span>}
                                    </td>
                                    <td className="py-4 pr-6 text-right text-lg font-extrabold text-teal-700 dark:text-teal-400 tabular-nums">
                                        {formatCurrency(totalSeleccionado, monedaTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {loading ? (
                <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>
            ) : portfolios.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-12 text-center border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <Briefcase className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">No tienes portafolios aún.</p>
                    <button
                        onClick={() => { setEditing(null); setModalOpen(true); }}
                        className="mt-4 px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors inline-flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Crear el primero
                    </button>
                </div>
            ) : (
                <>
                    {shared.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Compartidos</h2>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">— con socios y distribución</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {shared.map(p => (
                                    <PortfolioCard key={p.id} p={p} onOpen={() => navigate(`/portfolios/${p.id}`)} onEdit={() => { setEditing(p); setModalOpen(true); }} />
                                ))}
                            </div>
                        </section>
                    )}

                    {simple.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Tag className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Simples</h2>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">— solo agrupan gastos</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {simple.map(p => (
                                    <PortfolioCard key={p.id} p={p} onOpen={() => { setEditing(p); setModalOpen(true); }} onEdit={() => { setEditing(p); setModalOpen(true); }} simple gastos={gastosPorPortafolio[p.name]} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            <PortfolioModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={load}
                portfolioToEdit={editing}
            />
        </div>
    );
}

type CardProps = {
    p: UserPortfolio; onOpen: () => void; onEdit: () => void; simple?: boolean;
    gastos?: { count: number; totals: Partial<Record<Currency, number>> };
};

const PortfolioCard: React.FC<CardProps> = ({ p, onOpen, onEdit, simple, gastos }) => {
    const monedas = gastos ? (Object.keys(gastos.totals) as Currency[]) : [];
    return (
        <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group cursor-pointer relative" onClick={onOpen}>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Editar"
            >
                <Pencil className="w-4 h-4" />
            </button>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${simple ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'}`}>
                {simple ? <Tag className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            </div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white">{p.name}</h3>
            <p className="text-xs uppercase tracking-wide font-semibold text-zinc-400 dark:text-zinc-500 mt-1">{p.type === 'shared' ? 'Compartido' : 'Simple'} · {p.default_currency}</p>
            {p.description && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3 line-clamp-3 leading-relaxed">{p.description}</p>
            )}
            {simple && (
                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    {monedas.length === 0 ? (
                        <p className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">Sin gastos aún</p>
                    ) : (
                        <>
                            <p className="text-[11px] uppercase tracking-wide font-semibold text-zinc-400 dark:text-zinc-500">Gastos acumulados ({gastos!.count})</p>
                            <div className="mt-1 space-y-0.5">
                                {monedas.map(m => (
                                    <p key={m} className="text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums">{formatCurrency(gastos!.totals[m]!, m)}</p>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
