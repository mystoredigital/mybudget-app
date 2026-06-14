import React, { useState, useEffect } from 'react';
import { supabase, Servicio, ServicioCiclo, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Trash2 } from 'lucide-react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    servicioToEdit?: Servicio | null;
};

const CATEGORIAS = ['Dominio', 'Hosting', 'SaaS / Suscripción', 'Licencia', 'Certificado SSL', 'Otro'];
const CICLOS: ServicioCiclo[] = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'];

export default function ServicioModal({ isOpen, onClose, onSuccess, servicioToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [f, setF] = useState({
        nombre: '', categoria: 'Dominio', proveedor: '', cliente: '',
        costo: '0', moneda: 'USD' as Currency, ciclo: 'Anual' as ServicioCiclo,
        fecha_renovacion: new Date().toISOString().split('T')[0],
        auto_renueva: true, url_panel: '', notas: '', dias_alerta: '30,15,7',
    });

    useEffect(() => {
        if (!isOpen) return;
        if (servicioToEdit) {
            setF({
                nombre: servicioToEdit.nombre,
                categoria: servicioToEdit.categoria,
                proveedor: servicioToEdit.proveedor || '',
                cliente: servicioToEdit.cliente || '',
                costo: String(servicioToEdit.costo),
                moneda: servicioToEdit.moneda,
                ciclo: servicioToEdit.ciclo,
                fecha_renovacion: servicioToEdit.fecha_renovacion,
                auto_renueva: servicioToEdit.auto_renueva,
                url_panel: servicioToEdit.url_panel || '',
                notas: servicioToEdit.notas || '',
                dias_alerta: (servicioToEdit.dias_alerta || []).join(','),
            });
        } else {
            setF({
                nombre: '', categoria: 'Dominio', proveedor: '', cliente: '',
                costo: '0', moneda: 'USD', ciclo: 'Anual',
                fecha_renovacion: new Date().toISOString().split('T')[0],
                auto_renueva: true, url_panel: '', notas: '', dias_alerta: '30,15,7',
            });
        }
    }, [isOpen, servicioToEdit]);

    if (!isOpen) return null;
    const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));
    const input = "w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium";
    const label = "block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2";

    const handleSubmit = async () => {
        if (!user) return;
        if (!f.nombre.trim()) { alert('Ponle nombre al servicio'); return; }
        setLoading(true);
        try {
            const dias = f.dias_alerta.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
            const payload = {
                user_id: user.id,
                nombre: f.nombre.trim(),
                categoria: f.categoria,
                proveedor: f.proveedor.trim() || null,
                cliente: f.cliente.trim() || null,
                costo: Number(f.costo) || 0,
                moneda: f.moneda,
                ciclo: f.ciclo,
                fecha_renovacion: f.fecha_renovacion,
                auto_renueva: f.auto_renueva,
                url_panel: f.url_panel.trim() || null,
                notas: f.notas.trim() || null,
                dias_alerta: dias.length ? dias : [30, 15, 7],
            };
            const { error } = servicioToEdit
                ? await supabase.from('servicios').update(payload).eq('id', servicioToEdit.id)
                : await supabase.from('servicios').insert([payload]);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error guardando el servicio: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!servicioToEdit) return;
        if (!window.confirm('¿Borrar este servicio? Los pagos ya generados se conservan.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('servicios').delete().eq('id', servicioToEdit.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error borrando el servicio: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 bg-teal-50/50 dark:bg-zinc-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-teal-900 dark:text-teal-300">{servicioToEdit ? 'Editar Servicio' : 'Nuevo Servicio'}</h2>
                        <p className="text-teal-700/80 dark:text-zinc-400 text-sm font-medium mt-1">Dominio, hosting, suscripción o licencia</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-teal-100 dark:hover:bg-zinc-700 flex items-center justify-center text-teal-700 dark:text-zinc-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5 overflow-y-auto">
                    <div>
                        <label className={label}>Nombre</label>
                        <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. midominio.com, Hosting cliente X" className={input} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={label}>Categoría</label>
                            <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)} className={input}>
                                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={label}>Proveedor</label>
                            <input value={f.proveedor} onChange={(e) => set('proveedor', e.target.value)} placeholder="Hostinger, Cloudflare..." className={input} />
                        </div>
                    </div>

                    <div>
                        <label className={label}>Cliente <span className="text-zinc-400 font-normal">(¿de quién es?)</span></label>
                        <input value={f.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nombre del cliente o 'Mío'" className={input} />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className={label}>Costo</label>
                            <input type="number" value={f.costo} onChange={(e) => set('costo', e.target.value)} className={input} />
                        </div>
                        <div>
                            <label className={label}>Moneda</label>
                            <select value={f.moneda} onChange={(e) => set('moneda', e.target.value as Currency)} className={input}>
                                <option value="USD">USD</option>
                                <option value="COP">COP</option>
                            </select>
                        </div>
                        <div>
                            <label className={label}>Ciclo</label>
                            <select value={f.ciclo} onChange={(e) => set('ciclo', e.target.value as ServicioCiclo)} className={input}>
                                {CICLOS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={label}>Próxima renovación</label>
                            <input type="date" value={f.fecha_renovacion} onChange={(e) => set('fecha_renovacion', e.target.value)} className={input} />
                        </div>
                        <div>
                            <label className={label}>Alertas (días antes)</label>
                            <input value={f.dias_alerta} onChange={(e) => set('dias_alerta', e.target.value)} placeholder="30,15,7" className={input} />
                        </div>
                    </div>

                    <div>
                        <label className={label}>URL del panel <span className="text-zinc-400 font-normal">(opcional)</span></label>
                        <input value={f.url_panel} onChange={(e) => set('url_panel', e.target.value)} placeholder="https://..." className={input} />
                    </div>

                    <div>
                        <label className={label}>Notas <span className="text-zinc-400 font-normal">(opcional)</span></label>
                        <input value={f.notas} onChange={(e) => set('notas', e.target.value)} className={input} />
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={f.auto_renueva} onChange={(e) => set('auto_renueva', e.target.checked)} className="w-5 h-5 rounded accent-teal-600" />
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Se renueva automáticamente (al generar el pago, avanza la fecha al siguiente ciclo)</span>
                    </label>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex items-center gap-3">
                    {servicioToEdit && (
                        <button onClick={handleDelete} disabled={loading} className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50" title="Borrar servicio">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-colors">
                        {loading ? 'Guardando...' : (servicioToEdit ? 'Guardar' : 'Crear servicio')}
                    </button>
                </div>
            </div>
        </div>
    );
}
