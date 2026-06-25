import React, { useEffect, useMemo, useState } from 'react';
import { supabase, CuentaSaldo, Cuenta, Movimiento, TasaCambio, Currency } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Search, ListFilter } from 'lucide-react';
import MovimientoModal from '../components/MovimientoModal';

const MOV_META: Record<string, { icon: React.ElementType; color: string }> = {
    ingreso: { icon: ArrowDownLeft, color: 'text-emerald-600 dark:text-emerald-400' },
    gasto: { icon: ArrowUpRight, color: 'text-rose-600 dark:text-rose-400' },
    traslado: { icon: ArrowLeftRight, color: 'text-blue-600 dark:text-blue-400' },
};

const monthInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function Movimientos() {
    const { user } = useAuth();
    const [cuentas, setCuentas] = useState<CuentaSaldo[]>([]);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [tasa, setTasa] = useState<TasaCambio | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [movModalOpen, setMovModalOpen] = useState(false);
    const [movToEdit, setMovToEdit] = useState<Movimiento | null>(null);

    // Filtros
    const now = new Date();
    const [desde, setDesde] = useState(monthInput(now));
    const [hasta, setHasta] = useState(monthInput(now));
    const [cuentaF, setCuentaF] = useState('Todas');
    const [tipoF, setTipoF] = useState('Todos');
    const [catF, setCatF] = useState('Todas');
    const [q, setQ] = useState('');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const [cu, mv, ca, ta] = await Promise.all([
                supabase.from('cuentas_saldos').select('*').order('created_at', { ascending: true }),
                supabase.from('movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
                supabase.from('user_categories').select('name').order('name'),
                supabase.from('tasas_cambio').select('*').eq('par', 'USD_COP').order('fecha', { ascending: false }).limit(1).maybeSingle(),
            ]);
            if (cu.data) setCuentas(cu.data as CuentaSaldo[]);
            if (mv.data) setMovimientos(mv.data as Movimiento[]);
            if (ca.data) setCategorias(ca.data.map((c: any) => c.name));
            setTasa((ta.data as TasaCambio) || null);
            setLoading(false);
        }
        fetchData();
    }, [refreshKey]);

    const cuentaById = useMemo(() => Object.fromEntries(cuentas.map(c => [c.id, c])), [cuentas]);
    const refresh = () => setRefreshKey(k => k + 1);
    const rate = tasa ? Number(tasa.valor) : null;

    const filtered = useMemo(() => movimientos.filter(m => {
        const mes = (m.fecha || '').slice(0, 7);
        if (mes < desde || mes > hasta) return false;
        if (cuentaF !== 'Todas' && m.cuenta_id !== cuentaF && m.cuenta_destino_id !== cuentaF) return false;
        if (tipoF !== 'Todos' && m.tipo !== tipoF) return false;
        if (catF !== 'Todas') { if (catF === '__none__' ? m.categoria : m.categoria !== catF) return false; }
        if (q.trim()) { const s = q.trim().toLowerCase(); if (!(m.concepto || '').toLowerCase().includes(s) && !(m.categoria || '').toLowerCase().includes(s)) return false; }
        return true;
    }), [movimientos, desde, hasta, cuentaF, tipoF, catF, q]);

    const totales = useMemo(() => {
        const t: Record<Currency, { ing: number; gas: number }> = { COP: { ing: 0, gas: 0 }, USD: { ing: 0, gas: 0 } };
        for (const m of filtered) {
            if (m.tipo === 'ingreso') t[m.moneda].ing += Number(m.monto);
            else if (m.tipo === 'gasto') t[m.moneda].gas += Number(m.monto);
        }
        return t;
    }, [filtered]);

    const sel = "px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-teal-500";

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white">Movimientos</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Todo el detalle de tus cuentas, filtrable.</p>
                </div>
                <button onClick={() => { setMovToEdit(null); setMovModalOpen(true); }} className="flex items-center gap-2 bg-teal-900 dark:bg-teal-700 text-white px-5 py-3 rounded-full font-bold shadow-md shadow-teal-900/20 hover:bg-teal-800 transition-all text-sm">
                    <Plus className="w-5 h-5" /> Movimiento
                </button>
            </div>

            {/* Filtros */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-zinc-400 uppercase">Desde</span><input type="month" value={desde} onChange={e => setDesde(e.target.value)} className={sel} /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-zinc-400 uppercase">Hasta</span><input type="month" value={hasta} onChange={e => setHasta(e.target.value)} className={sel} /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-zinc-400 uppercase">Cuenta</span>
                        <select value={cuentaF} onChange={e => setCuentaF(e.target.value)} className={sel}>
                            <option value="Todas">Todas</option>
                            {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-zinc-400 uppercase">Tipo</span>
                        <select value={tipoF} onChange={e => setTipoF(e.target.value)} className={sel}>
                            <option value="Todos">Todos</option><option value="ingreso">Ingresos</option><option value="gasto">Gastos</option><option value="traslado">Traslados</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-zinc-400 uppercase">Categoría</span>
                        <select value={catF} onChange={e => setCatF(e.target.value)} className={sel}>
                            <option value="Todas">Todas</option>
                            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__none__">Sin categoría</option>
                        </select>
                    </label>
                </div>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por concepto o categoría..." className="w-full pl-9 pr-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500 dark:text-white" />
                </div>
            </div>

            {/* Resumen del periodo filtrado */}
            <div className="flex flex-wrap gap-3">
                <span className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-200"><ListFilter className="w-4 h-4 text-zinc-400" /> {filtered.length} movimientos</span>
                {(['COP', 'USD'] as Currency[]).map(m => (totales[m].ing || totales[m].gas) ? (
                    <span key={m} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-bold">
                        <span className="text-zinc-400 mr-2">{m}</span>
                        <span className="text-emerald-600">+{formatCurrency(totales[m].ing, m)}</span>
                        <span className="text-zinc-300 mx-1">·</span>
                        <span className="text-rose-600">-{formatCurrency(totales[m].gas, m)}</span>
                    </span>
                ) : null)}
            </div>

            {/* Lista */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-zinc-500">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 font-medium">No hay movimientos con esos filtros.</div>
                ) : (
                    <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                        {filtered.map(m => {
                            const meta = MOV_META[m.tipo];
                            const origen = m.cuenta_id ? cuentaById[m.cuenta_id]?.nombre : null;
                            const destino = m.cuenta_destino_id ? cuentaById[m.cuenta_destino_id]?.nombre : null;
                            return (
                                <div key={m.id} onClick={() => { setMovToEdit(m); setMovModalOpen(true); }} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer">
                                    <div className={`w-9 h-9 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 ${meta.color}`}><meta.icon className="w-4 h-4" /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate">{m.concepto}</p>
                                        <p className="text-[11px] text-zinc-400 font-medium truncate">
                                            {m.tipo === 'traslado' ? `${origen || '?'} → ${destino || '?'}` : origen || '—'}
                                            {m.categoria ? ` · ${m.categoria}` : ''} · {m.fecha}
                                        </p>
                                    </div>
                                    <span className={`font-bold text-sm shrink-0 ${meta.color}`}>
                                        {m.tipo === 'gasto' ? '-' : m.tipo === 'ingreso' ? '+' : ''}{formatCurrency(Number(m.monto), m.moneda)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <MovimientoModal isOpen={movModalOpen} onClose={() => { setMovModalOpen(false); setMovToEdit(null); }} onSuccess={refresh} cuentas={cuentas} categorias={categorias} defaultRate={rate} movToEdit={movToEdit} />
        </div>
    );
}
