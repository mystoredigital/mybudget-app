import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2, TrendingUp, TrendingDown, Users, Wallet, CheckCircle2, Clock, PlusCircle } from 'lucide-react';
import {
    supabase, UserPortfolio, PortfolioPartner, PortfolioPeriod,
    PortfolioPeriodItem, PortfolioPeriodItemTipo,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import PortfolioModal from '../components/PortfolioModal';
import PagoSocioModal from '../components/PagoSocioModal';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtMonth = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${monthNames[d.getMonth()]} ${d.getFullYear()}`; };

const SECCIONES: { tipo: PortfolioPeriodItemTipo; titulo: string; hint: string }[] = [
    { tipo: 'ingreso', titulo: 'Comisión / Ingresos', hint: 'Lo que entró este mes' },
    { tipo: 'gasto_compartido', titulo: 'Gastos compartidos', hint: 'Se restan antes de repartir' },
    { tipo: 'cargo_socio', titulo: 'Pendientes al socio', hint: 'Se le suman a su parte (otros meses)' },
    { tipo: 'descuento_socio', titulo: 'Descuentos al socio', hint: 'Pagos/gastos que le bajan a su parte' },
];

export default function PortfolioDetail() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [portfolio, setPortfolio] = useState<UserPortfolio | null>(null);
    const [partner, setPartner] = useState<PortfolioPartner | null>(null);
    const [periods, setPeriods] = useState<PortfolioPeriod[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [items, setItems] = useState<PortfolioPeriodItem[]>([]);
    const [editOpen, setEditOpen] = useState(false);
    const [pagoOpen, setPagoOpen] = useState(false);
    const [partnerName, setPartnerName] = useState('');

    const cur = portfolio?.default_currency || 'USD';
    const selected = periods.find(p => p.id === selectedId) || null;

    useEffect(() => { if (id && user) loadAll(); }, [id, user]); // eslint-disable-line
    useEffect(() => { if (selectedId) loadItems(selectedId); else setItems([]); }, [selectedId]); // eslint-disable-line

    async function loadAll() {
        if (!id || !user) return;
        setLoading(true);
        const [p, pa, pe] = await Promise.all([
            supabase.from('user_portfolios').select('*').eq('id', id).maybeSingle(),
            supabase.from('portfolio_partners').select('*').eq('portfolio_id', id).order('created_at').limit(1).maybeSingle(),
            supabase.from('portfolio_periods').select('*').eq('portfolio_id', id).order('period_month', { ascending: false }),
        ]);
        if (p.data) setPortfolio(p.data);
        setPartner(pa.data || null);
        setPartnerName(pa.data?.name || '');
        const peData = (pe.data as PortfolioPeriod[]) || [];
        setPeriods(peData);
        setSelectedId(prev => prev && peData.some(x => x.id === prev) ? prev : (peData[0]?.id || ''));
        setLoading(false);
    }

    async function loadPeriodsKeepSelection() {
        if (!id) return;
        const { data } = await supabase.from('portfolio_periods').select('*').eq('portfolio_id', id).order('period_month', { ascending: false });
        if (data) setPeriods(data as PortfolioPeriod[]);
    }

    async function loadItems(periodId: string) {
        const { data } = await supabase.from('portfolio_period_items').select('*').eq('period_id', periodId).order('fecha', { ascending: true });
        setItems((data as PortfolioPeriodItem[]) || []);
    }

    async function createPeriod() {
        if (!id || !user) return;
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const { data, error } = await supabase.from('portfolio_periods')
            .insert([{ portfolio_id: id, user_id: user.id, period_month: ym, currency: cur, partner_percent: 50 }])
            .select().single();
        if (error) { alert(error.message.includes('duplicate') ? 'Ya existe ese mes.' : error.message); return; }
        await loadAll();
        if (data) setSelectedId(data.id);
    }

    async function updatePercent(v: number) {
        if (!selected) return;
        await supabase.from('portfolio_periods').update({ partner_percent: v }).eq('id', selected.id);
        setPeriods(prev => prev.map(p => p.id === selected.id ? { ...p, partner_percent: v } : p));
    }

    async function savePartner() {
        if (!id || !user) return;
        const name = partnerName.trim();
        if (!name) return;
        if (partner) {
            await supabase.from('portfolio_partners').update({ name }).eq('id', partner.id);
        } else {
            await supabase.from('portfolio_partners').insert([{ portfolio_id: id, user_id: user.id, name, share_percent: 50 }]);
        }
        loadAll();
    }

    async function addItem(tipo: PortfolioPeriodItemTipo, concepto: string, monto: number) {
        if (!selectedId || !user) return;
        const { error } = await supabase.from('portfolio_period_items')
            .insert([{ period_id: selectedId, user_id: user.id, tipo, concepto: concepto || SECCIONES.find(s => s.tipo === tipo)!.titulo, monto, fecha: new Date().toISOString().split('T')[0] }]);
        if (error) { alert(error.message); return; }
        loadItems(selectedId);
    }

    async function deleteItem(itemId: string) {
        await supabase.from('portfolio_period_items').delete().eq('id', itemId);
        loadItems(selectedId);
    }

    if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>;
    if (!portfolio) return (
        <div className="space-y-4">
            <Link to="/portfolios" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-sm font-semibold"><ArrowLeft className="w-4 h-4" /> Volver</Link>
            <p className="text-zinc-500">Portafolio no encontrado.</p>
        </div>
    );

    const sum = (t: PortfolioPeriodItemTipo) => items.filter(i => i.tipo === t).reduce((a, c) => a + Number(c.monto), 0);
    const ingresos = sum('ingreso');
    const gastosComp = sum('gasto_compartido');
    const descuentos = sum('descuento_socio');
    const cargos = sum('cargo_socio');
    const neto = ingresos - gastosComp;
    const pct = selected?.partner_percent ?? 50;
    const parteSocio = neto * (pct / 100);
    const miParte = neto - parteSocio;
    const leDebo = parteSocio + cargos - descuentos;
    const pagado = selected?.pago_socio_estado === 'Pagado';

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                    <Link to="/portfolios" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-sm font-semibold mb-3"><ArrowLeft className="w-4 h-4" /> Portafolios</Link>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{portfolio.name}</h1>
                    {portfolio.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl">{portfolio.description}</p>}
                </div>
                <button onClick={() => setEditOpen(true)} className="px-5 py-3 rounded-2xl font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"><Pencil className="w-4 h-4" /> Editar</button>
            </div>

            {/* Selector de mes + socio */}
            <div className="flex flex-wrap items-center gap-3">
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm font-bold text-zinc-700 dark:text-zinc-200 py-3 px-5 outline-none focus:ring-2 focus:ring-teal-500">
                    {periods.length === 0 && <option value="">Sin meses</option>}
                    {periods.map(p => <option key={p.id} value={p.id}>{fmtMonth(p.period_month)}</option>)}
                </select>
                <button onClick={createPeriod} className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-4 py-3 rounded-full font-bold text-sm hover:bg-zinc-50"><Plus className="w-4 h-4" /> Mes actual</button>
                <div className="flex items-center gap-2 ml-auto">
                    <Users className="w-4 h-4 text-zinc-400" />
                    <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} onBlur={savePartner} placeholder="Nombre del socio" className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200 py-2.5 px-4 outline-none focus:ring-2 focus:ring-teal-500 w-44" />
                </div>
            </div>

            {!selected ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-10 text-center">
                    <p className="text-zinc-500 font-medium">Crea el mes para empezar a liquidar.</p>
                </div>
            ) : (
                <>
                    {/* Resumen de liquidación */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Mi escenario */}
                        <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-6 text-white lg:col-span-2">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Mi parte ({fmtMonth(selected.period_month)})</span>
                            <p className="text-3xl font-extrabold mt-1">{formatCurrency(miParte, cur)}</p>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
                                <span className="text-white/70">Comisión: <b className="text-white">{formatCurrency(ingresos, cur)}</b></span>
                                <span className="text-white/70">− Gastos comp.: <b className="text-white">{formatCurrency(gastosComp, cur)}</b></span>
                                <span className="text-white/70">= Neto: <b className="text-emerald-300">{formatCurrency(neto, cur)}</b></span>
                            </div>
                        </div>
                        {/* Socio */}
                        <div className={`rounded-2xl p-6 border flex flex-col ${pagado ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/40' : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Le debo al socio</span>
                                <div className="flex items-center gap-1">
                                    <input type="number" value={pct} onChange={(e) => updatePercent(Number(e.target.value))} className="w-14 text-right bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500" />
                                    <span className="text-zinc-400 font-bold text-sm">%</span>
                                </div>
                            </div>
                            <p className={`text-3xl font-extrabold mt-1 ${pagado ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-400'}`}>{formatCurrency(leDebo, cur)}</p>
                            <div className="text-xs text-zinc-400 font-medium mt-2 space-y-0.5">
                                <p>Parte del socio: {formatCurrency(parteSocio, cur)}</p>
                                {cargos > 0 && <p>+ Pendientes: {formatCurrency(cargos, cur)}</p>}
                                <p>− Descuentos: {formatCurrency(descuentos, cur)}</p>
                            </div>

                            {/* Estado del pago al socio */}
                            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                {pagado ? (
                                    <button onClick={() => setPagoOpen(true)} className="w-full flex items-center gap-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2.5 font-bold text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors">
                                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                                        <span className="flex-1 text-left">
                                            Pagado{selected.pago_socio_fecha ? ` · ${selected.pago_socio_fecha}` : ''}
                                            {selected.pago_socio_monto != null && Math.abs(Number(selected.pago_socio_monto) - leDebo) > 0.01 && (
                                                <span className="block text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/70">Entregado: {formatCurrency(Number(selected.pago_socio_monto), cur)}</span>
                                            )}
                                        </span>
                                        <Pencil className="w-3.5 h-3.5 opacity-60" />
                                    </button>
                                ) : (
                                    <button onClick={() => setPagoOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 font-bold text-sm shadow-md shadow-orange-500/20 transition-colors">
                                        <Clock className="w-4 h-4" /> Pendiente · Marcar pagado
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Secciones de items */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        {SECCIONES.map(sec => (
                            <ItemSection
                                key={sec.tipo}
                                titulo={sec.titulo}
                                hint={sec.hint}
                                tipo={sec.tipo}
                                cur={cur}
                                items={items.filter(i => i.tipo === sec.tipo)}
                                onAdd={addItem}
                                onDelete={deleteItem}
                            />
                        ))}
                    </div>
                </>
            )}

            {pagoOpen && (
                <PagoSocioModal
                    period={selected}
                    leDebo={leDebo}
                    socioName={partner?.name || partnerName}
                    onClose={() => setPagoOpen(false)}
                    onSuccess={() => { if (selectedId) loadPeriodsKeepSelection(); }}
                />
            )}

            <PortfolioModal isOpen={editOpen} portfolioToEdit={portfolio} onClose={() => setEditOpen(false)}
                onSuccess={() => {
                    loadAll();
                    setTimeout(async () => {
                        if (id) { const { data } = await supabase.from('user_portfolios').select('id').eq('id', id).maybeSingle(); if (!data) navigate('/portfolios'); }
                    }, 100);
                }}
            />
        </div>
    );
}

type ItemSectionProps = {
    titulo: string; hint: string; tipo: PortfolioPeriodItemTipo; cur: 'COP' | 'USD';
    items: PortfolioPeriodItem[];
    onAdd: (tipo: PortfolioPeriodItemTipo, concepto: string, monto: number) => void;
    onDelete: (id: string) => void;
};

const ItemSection: React.FC<ItemSectionProps> = ({ titulo, hint, tipo, cur, items, onAdd, onDelete }) => {
    const [concepto, setConcepto] = useState('');
    const [monto, setMonto] = useState('');
    const total = items.reduce((a, c) => a + Number(c.monto), 0);
    const isIngreso = tipo === 'ingreso';
    const Icon = isIngreso ? TrendingUp
        : tipo === 'descuento_socio' ? Wallet
        : tipo === 'cargo_socio' ? PlusCircle
        : TrendingDown;
    const iconColor = isIngreso ? 'text-emerald-500'
        : tipo === 'descuento_socio' ? 'text-blue-500'
        : tipo === 'cargo_socio' ? 'text-amber-500'
        : 'text-rose-500';

    const add = () => {
        const m = Number(monto);
        if (!(m > 0)) { alert('Monto inválido'); return; }
        onAdd(tipo, concepto.trim(), m);
        setConcepto(''); setMonto('');
    };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${iconColor}`} />
                        <h3 className="font-bold text-zinc-900 dark:text-white text-sm">{titulo}</h3>
                    </div>
                    <span className="font-bold text-sm text-zinc-700 dark:text-zinc-200">{formatCurrency(total, cur)}</span>
                </div>
                <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{hint}</p>
            </div>

            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50 flex-1">
                {items.length === 0 ? (
                    <p className="px-5 py-6 text-center text-zinc-400 text-sm">Sin registros</p>
                ) : items.map(i => (
                    <div key={i.id} className="flex items-center gap-2 px-5 py-2.5 group">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{i.concepto}</p>
                            <p className="text-[10px] text-zinc-400">{i.fecha}</p>
                        </div>
                        <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 shrink-0">{formatCurrency(Number(i.monto), cur)}</span>
                        <button onClick={() => onDelete(i.id)} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                ))}
            </div>

            <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" className="flex-1 min-w-0 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500 dark:text-white" />
                <input value={monto} onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} type="number" placeholder="0" className="w-20 px-2 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500 dark:text-white" />
                <button onClick={add} className="w-9 h-9 shrink-0 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            </div>
        </div>
    );
}
