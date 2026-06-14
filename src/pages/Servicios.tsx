import React, { useEffect, useState } from 'react';
import { supabase, Servicio, ServicioView } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Globe, ExternalLink, Pencil, Receipt, AlertTriangle, LayoutGrid, Rows3 } from 'lucide-react';
import { addMonths, addYears } from 'date-fns';
import ServicioModal from '../components/ServicioModal';

const CICLO_MESES: Record<string, number> = { Mensual: 1, Bimestral: 2, Trimestral: 3, Semestral: 6 };

function nextRenovacion(fecha: string, ciclo: string): string {
    const d = new Date(fecha + 'T12:00:00');
    const next = ciclo === 'Anual' ? addYears(d, 1) : addMonths(d, CICLO_MESES[ciclo] || 1);
    return next.toISOString().split('T')[0];
}

function semaforo(dias: number) {
    if (dias < 0) return { label: `Vencido hace ${Math.abs(dias)} d`, cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
    if (dias === 0) return { label: 'Renueva hoy', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
    if (dias <= 15) return { label: `Renueva en ${dias} d`, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { label: `Renueva en ${dias} d`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
}

export default function Servicios() {
    const { user } = useAuth();
    const [servicios, setServicios] = useState<ServicioView[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [toEdit, setToEdit] = useState<Servicio | null>(null);
    const [vista, setVista] = useState<'grid' | 'lista'>('lista');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const { data } = await supabase.from('servicios_view').select('*').eq('activo', true).order('fecha_renovacion', { ascending: true });
            setServicios((data as ServicioView[]) || []);
            setLoading(false);
        }
        fetchData();
    }, [refreshKey]);

    const refresh = () => setRefreshKey(k => k + 1);

    const generarPago = async (s: ServicioView) => {
        if (!user) return;
        // Evitar duplicar el pago de este ciclo
        const { data: existing } = await supabase.from('expenses').select('id')
            .eq('servicio_id', s.id).eq('fecha', s.fecha_renovacion).eq('status', 'Pendiente').maybeSingle();
        if (existing) { alert('Ya existe un pago pendiente para esta renovación.'); return; }

        const { error } = await supabase.from('expenses').insert([{
            user_id: user.id,
            expense: s.nombre,
            categoria: 'Servicios',
            status: 'Pendiente',
            fecha: s.fecha_renovacion,
            valor: s.costo,
            moneda: s.moneda,
            link: s.url_panel,
            comment: `Servicio (${s.proveedor || '—'}) · Cliente: ${s.cliente || '—'}`,
            portafolio: 'Personal',
            frecuencia: 'Unico',
            servicio_id: s.id,
        }]);
        if (error) { alert('Error generando el pago: ' + error.message); return; }

        if (s.auto_renueva) {
            await supabase.from('servicios').update({ fecha_renovacion: nextRenovacion(s.fecha_renovacion, s.ciclo) }).eq('id', s.id);
        }
        alert('Pago Pendiente creado en el presupuesto.');
        refresh();
    };

    const proximos = servicios.filter(s => s.dias_para_renovar <= 30);

    // Agrupar por categoría conservando el orden por fecha de renovación.
    // (servicios ya viene ordenado asc, así que cada grupo queda en ese orden
    //  y las categorías aparecen según su servicio más próximo a renovar.)
    const grupos = servicios.reduce<Record<string, ServicioView[]>>((acc, s) => {
        (acc[s.categoria] = acc[s.categoria] || []).push(s);
        return acc;
    }, {});

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white">Servicios</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Dominios, hosting y suscripciones contratadas</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full p-1">
                        <button onClick={() => setVista('grid')} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${vista === 'grid' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-700'}`} title="Grilla">
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button onClick={() => setVista('lista')} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${vista === 'lista' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-700'}`} title="Lista">
                            <Rows3 className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={() => { setToEdit(null); setModalOpen(true); }} className="flex items-center gap-2 bg-teal-900 dark:bg-teal-700 text-white px-5 py-3 rounded-full font-bold shadow-md shadow-teal-900/20 hover:bg-teal-800 hover:-translate-y-0.5 transition-all text-sm">
                        <Plus className="w-5 h-5" /> Nuevo Servicio
                    </button>
                </div>
            </div>

            {proximos.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {proximos.length} servicio{proximos.length > 1 ? 's' : ''} renueva{proximos.length > 1 ? 'n' : ''} en los próximos 30 días.
                    </p>
                </div>
            )}

            {loading ? (
                <div className="animate-pulse py-12 text-zinc-500 font-medium text-center">Cargando servicios...</div>
            ) : servicios.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-10 text-center">
                    <Globe className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500 font-medium">Aún no tienes servicios. Agrega tu primer dominio o suscripción.</p>
                </div>
            ) : vista === 'grid' ? (
                <div className="space-y-6">
                    {Object.keys(grupos).map((categoria) => {
                        const items = grupos[categoria];
                        return (
                        <div key={categoria}>
                            <div className="flex items-center gap-2 mb-3">
                                <Globe className="w-4 h-4 text-teal-500" />
                                <h2 className="font-bold text-zinc-900 dark:text-white">{categoria}</h2>
                                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-300 px-2 py-0.5 rounded-full">{items.length}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                                {items.map(s => {
                                    const sem = semaforo(s.dias_para_renovar);
                                    return (
                                        <div key={s.id} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-3 h-full group">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-zinc-900 dark:text-white truncate">{s.nombre}</p>
                                                    <p className="text-[11px] text-zinc-400 font-semibold truncate">{s.proveedor || s.cliente || '—'}</p>
                                                </div>
                                                <button onClick={() => { setToEdit(s); setModalOpen(true); }} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-teal-600 transition-all shrink-0">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <span className={`self-start text-[11px] font-bold px-2.5 py-1 rounded-full ${sem.cls}`}>{sem.label}</span>

                                            <div className="flex items-end justify-between mt-1">
                                                <div>
                                                    <p className="text-lg font-extrabold text-zinc-900 dark:text-white">{formatCurrency(s.costo, s.moneda)}</p>
                                                    <p className="text-[11px] text-zinc-400 font-medium">{s.ciclo} · {s.cliente || 'sin cliente'}</p>
                                                </div>
                                                {s.url_panel && (
                                                    <a href={s.url_panel} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" title="Abrir panel">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>

                                            <button onClick={() => generarPago(s)} className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-teal-700 text-white text-sm font-bold hover:bg-zinc-800 dark:hover:bg-teal-600 transition-colors">
                                                <Receipt className="w-4 h-4" /> Generar pago
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[640px]">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 font-bold border-b border-zinc-100 dark:border-zinc-800 text-[10px] uppercase tracking-wider">
                            <tr>
                                <th className="px-5 py-3">Servicio</th>
                                <th className="px-4 py-3">Categoría</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3">Ciclo</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center w-[120px]">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                            {servicios.map(s => {
                                const sem = semaforo(s.dias_para_renovar);
                                return (
                                    <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors group">
                                        <td className="px-5 py-3">
                                            <p className="font-bold text-zinc-900 dark:text-white text-[13px] truncate">{s.nombre}</p>
                                            <p className="text-[11px] text-zinc-400 font-medium truncate">{s.proveedor || s.cliente || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap">{s.categoria}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${sem.cls}`}>{sem.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-[12px] whitespace-nowrap">{s.ciclo}</td>
                                        <td className="px-4 py-3 text-right font-bold text-zinc-900 dark:text-white whitespace-nowrap">{formatCurrency(s.costo, s.moneda)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => generarPago(s)} className="w-7 h-7 rounded-lg inline-flex items-center justify-center bg-zinc-900 dark:bg-teal-700 text-white hover:bg-zinc-800 transition-colors" title="Generar pago"><Receipt className="w-3.5 h-3.5" /></button>
                                                {s.url_panel ? (
                                                    <a href={s.url_panel} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Abrir panel"><ExternalLink className="w-4 h-4" /></a>
                                                ) : <span className="w-7 h-7 inline-block" />}
                                                <button onClick={() => { setToEdit(s); setModalOpen(true); }} className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-zinc-300 hover:text-teal-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Editar"><Pencil className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <ServicioModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setToEdit(null); }} onSuccess={refresh} servicioToEdit={toEdit} />
        </div>
    );
}
