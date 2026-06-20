import React, { useEffect, useState } from 'react';
import { supabase, Contacto } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Trash2, Cloud } from 'lucide-react';

const NC_WEBHOOK = 'https://n8n.mystoredigital.cloud/webhook/guardar-contacto-3b8e1d';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    contactoToEdit?: Contacto | null;
};

export default function ContactoModal({ isOpen, onClose, onSuccess, contactoToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [f, setF] = useState({ nombre: '', empresa: '', telefono: '', email: '', notas: '', fecha_nacimiento: '' });

    useEffect(() => {
        if (!isOpen) return;
        setF({
            nombre: contactoToEdit?.nombre || '',
            empresa: contactoToEdit?.empresa || '',
            telefono: contactoToEdit?.telefono || '',
            email: contactoToEdit?.email || '',
            notas: contactoToEdit?.notas || '',
            fecha_nacimiento: contactoToEdit?.fecha_nacimiento || '',
        });
    }, [isOpen, contactoToEdit]);

    if (!isOpen) return null;
    const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));
    const input = "w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium";
    const label = "block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2";
    const esNextcloud = contactoToEdit?.origen === 'nextcloud';

    const handleSubmit = async () => {
        if (!user) return;
        if (!f.nombre.trim()) { alert('Ponle un nombre'); return; }
        setLoading(true);
        try {
            const payload = {
                user_id: user.id, nombre: f.nombre.trim(),
                empresa: f.empresa.trim() || null, telefono: f.telefono.trim() || null,
                email: f.email.trim() || null, notas: f.notas.trim() || null,
                fecha_nacimiento: f.fecha_nacimiento || null,
            };
            const { error } = contactoToEdit
                ? await supabase.from('contactos').update(payload).eq('id', contactoToEdit.id)
                : await supabase.from('contactos').insert([{ ...payload, origen: 'manual' }]);
            if (error) throw error;
            onSuccess(); onClose();
        } catch (err: any) {
            alert('Error guardando: ' + err.message);
        } finally { setLoading(false); }
    };

    const handleNextcloud = async () => {
        if (!user) return;
        if (!f.nombre.trim()) { alert('Ponle un nombre'); return; }
        setLoading(true);
        try {
            const res = await fetch(NC_WEBHOOK, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: contactoToEdit?.id || undefined,
                    nombre: f.nombre.trim(), empresa: f.empresa.trim(), telefono: f.telefono.trim(),
                    email: f.email.trim(), notas: f.notas.trim(), fecha_nacimiento: f.fecha_nacimiento || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.ok === false) throw new Error(data.error || 'No se pudo guardar en Nextcloud');
            onSuccess(); onClose();
        } catch (err: any) {
            alert('Error guardando en Nextcloud: ' + err.message);
        } finally { setLoading(false); }
    };

    const handleDelete = async () => {
        if (!contactoToEdit) return;
        if (!window.confirm('¿Borrar este contacto? Los pagos asociados quedan sin destinatario.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('contactos').delete().eq('id', contactoToEdit.id);
            if (error) throw error;
            onSuccess(); onClose();
        } catch (err: any) { alert('Error: ' + err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-24 md:pb-4 overflow-y-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-md max-h-[88dvh] md:max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 bg-teal-50/50 dark:bg-zinc-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-teal-900 dark:text-teal-300">{contactoToEdit ? 'Editar contacto' : 'Nuevo contacto'}</h2>
                        <p className="text-teal-700/80 dark:text-zinc-400 text-sm font-medium mt-1">Personas a las que les pagas o te pagan</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-teal-100 dark:hover:bg-zinc-700 flex items-center justify-center text-teal-700 dark:text-zinc-300 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-8 space-y-5">
                    {esNextcloud && (
                        <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-2.5">
                            Este contacto viene de Nextcloud. Si lo editas aquí, el próximo sync puede sobrescribir tus cambios.
                        </div>
                    )}
                    <div><label className={label}>Nombre</label><input value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Wilmer, Tatiana Ortiz" className={input} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={label}>Empresa</label><input value={f.empresa} onChange={e => set('empresa', e.target.value)} className={input} /></div>
                        <div><label className={label}>Teléfono</label><input value={f.telefono} onChange={e => set('telefono', e.target.value)} className={input} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={label}>Email</label><input value={f.email} onChange={e => set('email', e.target.value)} className={input} /></div>
                        <div><label className={label}>Cumpleaños</label><input type="date" value={f.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} className={input} /></div>
                    </div>
                    <div><label className={label}>Notas</label><input value={f.notas} onChange={e => set('notas', e.target.value)} className={input} /></div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex items-center gap-3">
                    {contactoToEdit && (
                        <button onClick={handleDelete} disabled={loading} className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50" title="Borrar"><Trash2 className="w-5 h-5" /></button>
                    )}
                    <div className="flex-1" />
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                    <button onClick={handleNextcloud} disabled={loading} title="Guardar también en Nextcloud" className="px-4 py-2.5 rounded-xl font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors flex items-center gap-2"><Cloud className="w-4 h-4" /> Nextcloud</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-colors">{loading ? 'Guardando...' : (contactoToEdit ? 'Guardar' : 'Crear')}</button>
                </div>
            </div>
        </div>
    );
}
