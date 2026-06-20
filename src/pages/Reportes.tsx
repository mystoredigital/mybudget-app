import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, Scale, Hash,
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase, Expense, Movimiento, UserPortfolio, UserCategory, Contacto, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtMonthKey = (k: string) => { const [y, m] = k.split('-'); return `${monthNames[Number(m) - 1]} ${String(y).slice(2)}`; };
const monthInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

type Row = {
    fecha: string;
    mes: string;        // YYYY-MM
    concepto: string;
    categoria: string;
    monto: number;
    moneda: Currency;
    tipo: 'gasto' | 'ingreso';
    fuente: 'presupuesto' | 'cuenta';
    estado: string;
    portafolio: string | null;
    contactoId: string | null;
};

const PIE_COLORS = ['#0d9488', '#f97316', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#eab308'];

export default function Reportes() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [portafolios, setPortafolios] = useState<string[]>([]);
    const [contactos, setContactos] = useState<Contacto[]>([]);

    // Filtros
    const now = new Date();
    const [desde, setDesde] = useState(monthInput(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
    const [hasta, setHasta] = useState(monthInput(now));
    const [categoria, setCategoria] = useState('Todas');
    const [portafolio, setPortafolio] = useState('Todos');
    const [tipo, setTipo] = useState<'Todos' | 'gasto' | 'ingreso'>('Todos');
    const [estado, setEstado] = useState('Todos');
    const [fuente, setFuente] = useState<'Ambos' | 'presupuesto' | 'cuenta'>('Ambos');
    const [moneda, setMoneda] = useState<Currency>('COP');
    const [contacto, setContacto] = useState('Todos');

    useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

    async function load() {
        if (!user) return;
        setLoading(true);
        const [exp, mov, cats, ports, conts] = await Promise.all([
            supabase.from('expenses').select('id, expense, categoria, valor, moneda, status, fecha, portafolio, contacto_id').eq('user_id', user.id),
            supabase.from('movimientos').select('id, tipo, concepto, monto, moneda, categoria, fecha, expense_id, contacto_id').eq('user_id', user.id),
            supabase.from('user_categories').select('name').eq('user_id', user.id).order('name'),
            supabase.from('user_portfolios').select('name').eq('user_id', user.id).order('name'),
            supabase.from('contactos').select('*').eq('user_id', user.id).order('nombre'),
        ]);

        const movs = (mov.data as (Movimiento & { expense_id: string | null; contacto_id: string | null })[]) || [];
        const paidExpenseIds = new Set(movs.filter(m => m.expense_id).map(m => m.expense_id));

        const out: Row[] = [];
        // Movimientos (dinero real): gasto / ingreso, excluye traslados
        for (const m of movs) {
            if (m.tipo !== 'gasto' && m.tipo !== 'ingreso') continue;
            if (!m.fecha) continue;
            out.push({
                fecha: m.fecha, mes: m.fecha.slice(0, 7), concepto: m.concepto || '(sin concepto)',
                categoria: m.categoria || 'Sin categoría', monto: Number(m.monto) || 0, moneda: m.moneda,
                tipo: m.tipo, fuente: 'cuenta', estado: 'Pagado', portafolio: null, contactoId: m.contacto_id || null,
            });
        }
        // Expenses del presupuesto que NO tienen movimiento asociado (evita doble conteo)
        for (const e of (exp.data as Expense[]) || []) {
            if (paidExpenseIds.has(e.id)) continue;
            if (!e.fecha) continue;
            out.push({
                fecha: e.fecha, mes: e.fecha.slice(0, 7), concepto: e.expense || '(sin concepto)',
                categoria: e.categoria || 'Sin categoría', monto: Number(e.valor) || 0, moneda: e.moneda,
                tipo: 'gasto', fuente: 'presupuesto', estado: e.status, portafolio: e.portafolio || null, contactoId: e.contacto_id || null,
            });
        }

        setRows(out);
        setCategorias((cats.data || []).map((c: UserCategory) => c.name));
        setPortafolios(((ports.data as UserPortfolio[]) || []).map(p => p.name));
        setContactos((conts.data as Contacto[]) || []);
        setLoading(false);
    }

    const filtered = useMemo(() => rows.filter(r => {
        if (r.moneda !== moneda) return false;
        if (r.mes < desde || r.mes > hasta) return false;
        if (categoria !== 'Todas' && r.categoria !== categoria) return false;
        if (tipo !== 'Todos' && r.tipo !== tipo) return false;
        if (fuente !== 'Ambos' && r.fuente !== fuente) return false;
        if (estado !== 'Todos' && r.estado !== estado) return false;
        if (portafolio !== 'Todos') { if (r.fuente !== 'presupuesto' || r.portafolio !== portafolio) return false; }
        if (contacto !== 'Todos') { if (contacto === '__none__' ? r.contactoId !== null : r.contactoId !== contacto) return false; }
        return true;
    }), [rows, moneda, desde, hasta, categoria, tipo, fuente, estado, portafolio, contacto]);

    const kpis = useMemo(() => {
        let gasto = 0, ingreso = 0;
        for (const r of filtered) { if (r.tipo === 'gasto') gasto += r.monto; else ingreso += r.monto; }
        return { gasto, ingreso, neto: ingreso - gasto, count: filtered.length };
    }, [filtered]);

    const porCategoria = useMemo(() => {
        const map = new Map<string, { monto: number; count: number }>();
        for (const r of filtered) {
            if (r.tipo !== 'gasto') continue;
            const cur = map.get(r.categoria) || { monto: 0, count: 0 };
            cur.monto += r.monto; cur.count += 1; map.set(r.categoria, cur);
        }
        const arr = [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.monto - a.monto);
        const total = arr.reduce((a, c) => a + c.monto, 0) || 1;
        return arr.map(x => ({ ...x, pct: (x.monto / total) * 100 }));
    }, [filtered]);

    const porMes = useMemo(() => {
        const map = new Map<string, { gasto: number; ingreso: number }>();
        for (const r of filtered) {
            const cur = map.get(r.mes) || { gasto: 0, ingreso: 0 };
            if (r.tipo === 'gasto') cur.gasto += r.monto; else cur.ingreso += r.monto;
            map.set(r.mes, cur);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mes, v]) => ({ mes: fmtMonthKey(mes), Gastos: Math.round(v.gasto), Ingresos: Math.round(v.ingreso) }));
    }, [filtered]);

    const fmt = (n: number) => formatCurrency(n, moneda);
    const sel = "px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-teal-500";

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-800 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
                    <BarChart3 className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Reportes</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Gastos e ingresos con filtros y gráficos.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Desde</span>
                        <input type="month" value={desde} onChange={e => setDesde(e.target.value)} className={sel} />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Hasta</span>
                        <input type="month" value={hasta} onChange={e => setHasta(e.target.value)} className={sel} />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Categoría</span>
                        <select value={categoria} onChange={e => setCategoria(e.target.value)} className={sel}>
                            <option>Todas</option>
                            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="Sin categoría">Sin categoría</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Portafolio</span>
                        <select value={portafolio} onChange={e => setPortafolio(e.target.value)} className={sel}>
                            <option>Todos</option>
                            {portafolios.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Tipo</span>
                        <select value={tipo} onChange={e => setTipo(e.target.value as any)} className={sel}>
                            <option value="Todos">Todos</option>
                            <option value="gasto">Gastos</option>
                            <option value="ingreso">Ingresos</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Estado</span>
                        <select value={estado} onChange={e => setEstado(e.target.value)} className={sel}>
                            <option>Todos</option>
                            <option>Pagado</option>
                            <option>Pendiente</option>
                            <option>Vencido</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Fuente</span>
                        <select value={fuente} onChange={e => setFuente(e.target.value as any)} className={sel}>
                            <option value="Ambos">Ambos</option>
                            <option value="presupuesto">Presupuesto</option>
                            <option value="cuenta">Cuentas</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Persona</span>
                        <select value={contacto} onChange={e => setContacto(e.target.value)} className={sel}>
                            <option value="Todos">Todas</option>
                            {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            <option value="__none__">Sin destinatario</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">Moneda</span>
                        <div className="flex gap-1.5">
                            {(['COP', 'USD'] as Currency[]).map(m => (
                                <button key={m} onClick={() => setMoneda(m)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${moneda === m ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500'}`}>{m}</button>
                            ))}
                        </div>
                    </label>
                </div>
            </div>

            {loading ? (
                <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>
            ) : filtered.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-12 text-center">
                    <p className="text-zinc-500 font-medium">No hay datos con esos filtros.</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Kpi icon={TrendingDown} color="rose" label="Gastos" value={fmt(kpis.gasto)} />
                        <Kpi icon={TrendingUp} color="emerald" label="Ingresos" value={fmt(kpis.ingreso)} />
                        <Kpi icon={Scale} color={kpis.neto >= 0 ? 'teal' : 'orange'} label="Neto" value={fmt(kpis.neto)} />
                        <Kpi icon={Hash} color="zinc" label="Transacciones" value={String(kpis.count)} />
                    </div>

                    {/* Gráficos */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 shadow-sm">
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Gastos por categoría</h3>
                            {porCategoria.length === 0 ? <p className="text-zinc-400 text-sm py-10 text-center">Sin gastos</p> : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie data={porCategoria} dataKey="monto" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
                                            {porCategoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v: any) => fmt(Number(v))} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 shadow-sm">
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Por mes</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={porMes}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Intl.NumberFormat('en', { notation: 'compact' }).format(v)} />
                                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                                    <Legend />
                                    <Bar dataKey="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tabla por categoría */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <h3 className="font-bold text-zinc-900 dark:text-white">Detalle por categoría (gastos)</h3>
                            <span className="text-sm font-bold text-zinc-500">{fmt(kpis.gasto)}</span>
                        </div>
                        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                            {porCategoria.map((c, i) => (
                                <div key={c.name} className="flex items-center gap-3 px-5 py-3">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                    <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{c.name} <span className="text-zinc-400 font-normal">· {c.count}</span></span>
                                    <span className="text-xs text-zinc-400 w-12 text-right">{c.pct.toFixed(0)}%</span>
                                    <span className="text-sm font-bold text-zinc-900 dark:text-white w-32 text-right tabular-nums">{fmt(c.monto)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const COLORS: Record<string, string> = {
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    teal: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const Kpi: React.FC<{ icon: React.ElementType; color: string; label: string; value: string }> = ({ icon: Icon, color, label, value }) => (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 shadow-sm">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${COLORS[color]}`}><Icon className="w-5 h-5" /></div>
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-0.5 tabular-nums">{value}</p>
    </div>
);
