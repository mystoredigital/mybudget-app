import React, { useEffect, useState } from 'react';
import { supabase, Servicio, ServicioView } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Globe, ExternalLink, Pencil, Receipt, AlertTriangle } from 'lucide-react';
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

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-semibold text-zinc-900 tracking-tight leading-tight dark:text-white">Servicios</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Dominios, hosting y suscripciones contratadas</p>
                </div>
                <button onClick={() => { setToEdit(null); setModalOpen(true); }} className="flex items-center gap-2 bg-teal-900 dark:bg-teal-700 text-white px-5 py-3 rounded-full font-bold shadow-md shadow-teal-900/20 hover:bg-teal-800 hover:-translate-y-0.5 transition-all text-sm">
                    <Plus className="w-5 h-5" /> Nuevo Servicio
                </button>
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
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servicios.map(s => {
                        const sem = semaforo(s.dias_para_renovar);
                        return (
                            <div key={s.id} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-3 group">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-bold text-zinc-900 dark:text-white truncate">{s.nombre}</p>
                                        <p className="text-[11px] text-zinc-400 font-semibold">{s.categoria}{s.proveedor ? ` · ${s.proveedor}` : ''}</p>
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

                                <button onClick={() => generarPago(s)} className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-teal-700 text-white text-sm font-bold hover:bg-zinc-800 dark:hover:bg-teal-600 transition-colors">
                                    <Receipt className="w-4 h-4" /> Generar pago
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <ServicioModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setToEdit(null); }} onSuccess={refresh} servicioToEdit={toEdit} />
        </div>
    );
}
