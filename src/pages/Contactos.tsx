import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Users, Search, Pencil, Phone, Mail, Building2 } from 'lucide-react';
import { supabase, Contacto } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ContactoModal from '../components/ContactoModal';

export default function Contactos() {
    const { user } = useAuth();
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Contacto | null>(null);

    useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

    async function load() {
        if (!user) return;
        setLoading(true);
        const { data } = await supabase.from('contactos').select('*').eq('user_id', user.id).eq('archivado', false).order('nombre');
        if (data) setContactos(data as Contacto[]);
        setLoading(false);
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return contactos;
        return contactos.filter(c => c.nombre.toLowerCase().includes(s) || (c.empresa || '').toLowerCase().includes(s) || (c.telefono || '').includes(s) || (c.email || '').toLowerCase().includes(s));
    }, [contactos, q]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-800 p-3 rounded-[20px] shadow-sm flex items-center justify-center"><Users className="w-8 h-8 text-white" /></div>
                    <div>
                        <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Contactos</h1>
                        <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Personas a las que les pagas o te pagan.</p>
                    </div>
                </div>
                <button onClick={() => { setEditing(null); setModalOpen(true); }} className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"><Plus className="w-5 h-5" /> Nuevo contacto</button>
            </div>

            <div className="relative max-w-md">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar contacto..." className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 dark:text-white font-medium" />
            </div>

            {loading ? (
                <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>
            ) : filtered.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">{q ? 'Sin resultados.' : 'No tienes contactos aún.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(c => (
                        <button key={c.id} onClick={() => { setEditing(c); setModalOpen(true); }} className="group text-left bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                            <span className="w-11 h-11 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold shrink-0">{c.nombre.charAt(0).toUpperCase()}</span>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">{c.nombre}{c.origen === 'nextcloud' && <span className="text-[9px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">NC</span>}</p>
                                <p className="text-xs text-zinc-400 truncate flex items-center gap-2">
                                    {c.empresa && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.empresa}</span>}
                                    {c.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefono}</span>}
                                    {!c.empresa && !c.telefono && c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                                </p>
                            </div>
                            <Pencil className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                    ))}
                </div>
            )}

            <ContactoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={load} contactoToEdit={editing} />
        </div>
    );
}
