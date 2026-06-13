import React, { useEffect, useState, useMemo } from 'react';
import { supabase, CuentaSaldo, Cuenta, Movimiento, TasaCambio } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Wallet, Landmark, CreditCard, Banknote, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Pencil, RefreshCw } from 'lucide-react';
import CuentaModal from '../components/CuentaModal';
import MovimientoModal from '../components/MovimientoModal';

const TIPO_ICON: Record<string, React.ElementType> = {
    banco: Landmark, wallet: Wallet, tarjeta: CreditCard, efectivo: Banknote,
};

const MOV_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    ingreso: { icon: ArrowDownLeft, color: 'text-emerald-600 dark:text-emerald-400', label: 'Ingreso' },
    gasto: { icon: ArrowUpRight, color: 'text-rose-600 dark:text-rose-400', label: 'Gasto' },
    traslado: { icon: ArrowLeftRight, color: 'text-blue-600 dark:text-blue-400', label: 'Traslado' },
};

export default function Cuentas() {
    const { user } = useAuth();
    const [cuentas, setCuentas] = useState<CuentaSaldo[]>([]);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [tasa, setTasa] = useState<TasaCambio | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
    const [cuentaToEdit, setCuentaToEdit] = useState<Cuenta | null>(null);
    const [movModalOpen, setMovModalOpen] = useState(false);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const [cuentasRes, movRes, catRes, tasaRes] = await Promise.all([
                    supabase.from('cuentas_saldos').select('*').order('created_at', { ascending: true }),
                    supabase.from('movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(40),
                    supabase.from('user_categories').select('name').order('name'),
                    supabase.from('tasas_cambio').select('*').eq('par', 'USD_COP').order('fecha', { ascending: false }).limit(1).maybeSingle(),
                ]);
                if (cuentasRes.data) setCuentas(cuentasRes.data as CuentaSaldo[]);
                if (movRes.data) setMovimientos(movRes.data as Movimiento[]);
                if (catRes.data) setCategorias(catRes.data.map((c: any) => c.name));
                setTasa((tasaRes.data as TasaCambio) || null);
            } catch (err) {
                console.error('Error cargando cuentas:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [refreshKey]);

    const cuentaNombre = useMemo(() => Object.fromEntries(cuentas.map(c => [c.id, c])), [cuentas]);

    const totalCOP = cuentas.filter(c => c.moneda === 'COP' && !c.archivada).reduce((a, c) => a + Number(c.saldo_actual), 0);
    const totalUSD = cuentas.filter(c => c.moneda === 'USD' && !c.archivada).reduce((a, c) => a + Number(c.saldo_actual), 0);
    const rate = tasa ? Number(tasa.valor) : null;
    const combinadoCOP = rate ? totalCOP + totalUSD * rate : null;

    const refresh = () => setRefreshKey(k => k + 1);

    const handleUpdateRate = async () => {
        if (!user) return;
        const input = window.prompt('Valor del dólar hoy (COP por 1 USD):', rate ? String(rate) : '');
        if (!input) return;
        const valor = Number(input);
        if (!(valor > 0)) { alert('Valor inválido'); return; }
        const fecha = new Date().toISOString().split('T')[0];
        const { error } = await supabase.from('tasas_cambio')
            .upsert({ user_id: user.id, fecha, par: 'USD_COP', valor, fuente: 'manual' }, { onConflict: 'user_id,fecha,par' });
        if (error) { alert('Error guardando la tasa: ' + error.message); return; }
        refresh();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white">Cuentas</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Lo que tienes de verdad, en tiempo real</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => { setCuentaToEdit(null); setCuentaModalOpen(true); }} className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-4 py-3 rounded-full font-bold shadow-sm hover:bg-zinc-50 transition-all text-sm">
                        <Plus className="w-4 h-4" /> Cuenta
                    </button>
                    <button onClick={() => setMovModalOpen(true)} className="flex items-center gap-2 bg-teal-900 dark:bg-teal-700 text-white px-5 py-3 rounded-full font-bold shadow-md shadow-teal-900/20 hover:bg-teal-800 hover:-translate-y-0.5 transition-all text-sm">
                        <Plus className="w-5 h-5" /> Movimiento
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="animate-pulse py-12 text-zinc-500 font-medium text-center">Cargando tesorería...</div>
            ) : (
                <>
                    {/* Totales + indicador dólar */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-6 text-white lg:col-span-2">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Lo que tengo</span>
                            <div className="flex flex-wrap items-end gap-x-8 gap-y-2 mt-2">
                                <div>
                                    <p className="text-3xl font-extrabold">{formatCurrency(totalCOP, 'COP')}</p>
                                    <p className="text-[10px] text-white/40 font-semibold">COP</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white/80">{formatCurrency(totalUSD, 'USD')}</p>
                                    <p className="text-[10px] text-white/40 font-semibold">USD</p>
                                </div>
                                {combinadoCOP != null && (
                                    <div className="ml-auto text-right">
                                        <p className="text-sm font-bold text-teal-300">≈ {formatCurrency(combinadoCOP, 'COP')}</p>
                                        <p className="text-[10px] text-white/40 font-semibold">total estimado</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dólar hoy</span>
                                <button onClick={handleUpdateRate} className="text-teal-600 hover:text-teal-500" title="Actualizar tasa">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>
                            {rate ? (
                                <>
                                    <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-2">{formatCurrency(rate, 'COP')}</p>
                                    <p className="text-[11px] text-zinc-400 font-semibold">por 1 USD · {tasa?.fuente === 'manual' ? 'manual' : 'auto'} · {tasa?.fecha}</p>
                                </>
                            ) : (
                                <button onClick={handleUpdateRate} className="text-sm font-semibold text-teal-600 mt-2 text-left hover:underline">Define el valor del dólar →</button>
                            )}
                        </div>
                    </div>

                    {/* Cuentas */}
                    {cuentas.length === 0 ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-10 text-center">
                            <p className="text-zinc-500 font-medium">Aún no tienes cuentas. Crea tu primer banco o wallet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {cuentas.filter(c => !c.archivada).map(c => {
                                const Icon = TIPO_ICON[c.tipo] || Wallet;
                                return (
                                    <div key={c.id} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm group">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600">
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">{c.nombre}</p>
                                                    <p className="text-[10px] text-zinc-400 font-semibold uppercase">{c.tipo} · {c.moneda}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => { setCuentaToEdit(c); setCuentaModalOpen(true); }} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-teal-600 transition-all">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-4">{formatCurrency(Number(c.saldo_actual), c.moneda)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Movimientos */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="font-bold text-zinc-900 dark:text-white">Últimos movimientos</h3>
                        </div>
                        {movimientos.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500 font-medium">Sin movimientos todavía.</div>
                        ) : (
                            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                                {movimientos.map(m => {
                                    const meta = MOV_META[m.tipo];
                                    const origen = m.cuenta_id ? cuentaNombre[m.cuenta_id]?.nombre : null;
                                    const destino = m.cuenta_destino_id ? cuentaNombre[m.cuenta_destino_id]?.nombre : null;
                                    return (
                                        <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                                            <div className={`w-9 h-9 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 ${meta.color}`}>
                                                <meta.icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate">{m.concepto}</p>
                                                <p className="text-[11px] text-zinc-400 font-medium truncate">
                                                    {m.tipo === 'traslado' ? `${origen || '?'} → ${destino || '?'}` : origen || '—'}
                                                    {m.categoria ? ` · ${m.categoria}` : ''} · {m.fecha}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={`font-bold text-sm ${meta.color}`}>
                                                    {m.tipo === 'gasto' ? '-' : m.tipo === 'ingreso' ? '+' : ''}{formatCurrency(Number(m.monto), m.moneda)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            <CuentaModal isOpen={cuentaModalOpen} onClose={() => setCuentaModalOpen(false)} onSuccess={refresh} cuentaToEdit={cuentaToEdit} />
            <MovimientoModal isOpen={movModalOpen} onClose={() => setMovModalOpen(false)} onSuccess={refresh} cuentas={cuentas} categorias={categorias} defaultRate={rate} />
        </div>
    );
}
