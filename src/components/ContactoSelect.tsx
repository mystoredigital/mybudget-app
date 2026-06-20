import React, { useEffect, useRef, useState } from 'react';
import { supabase, Contacto } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, X, Plus, Search, Check } from 'lucide-react';

type Props = {
    value: string | null;                 // contacto_id
    onChange: (id: string | null) => void;
    label?: string;
};

export default function ContactoSelect({ value, onChange, label = 'Destinatario' }: Props) {
    const { user } = useAuth();
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => { load(); }, [user]); // eslint-disable-line
    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    async function load() {
        if (!user) return;
        const { data } = await supabase.from('contactos').select('*').eq('user_id', user.id).eq('archivado', false).order('nombre');
        if (data) setContactos(data as Contacto[]);
    }

    const selected = contactos.find(c => c.id === value) || null;
    const q = query.trim().toLowerCase();
    const filtered = q
        ? contactos.filter(c => c.nombre.toLowerCase().includes(q) || (c.empresa || '').toLowerCase().includes(q) || (c.telefono || '').includes(q))
        : contactos;
    const exactMatch = contactos.some(c => c.nombre.toLowerCase() === q);

    async function crear(nombre: string) {
        if (!user || !nombre.trim() || creating) return;
        setCreating(true);
        const { data, error } = await supabase.from('contactos')
            .insert([{ user_id: user.id, nombre: nombre.trim(), origen: 'manual' }])
            .select().single();
        setCreating(false);
        if (error) { alert(error.message); return; }
        const c = data as Contacto;
        setContactos(prev => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        onChange(c.id);
        setOpen(false); setQuery('');
    }

    const input = "w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl outline-none text-zinc-800 dark:text-white font-medium flex items-center gap-2";

    return (
        <div ref={ref} className="relative">
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{label} <span className="text-zinc-400 font-normal">(opcional)</span></label>
            <button type="button" onClick={() => setOpen(o => !o)} className={input + ' justify-between'}>
                <span className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className={`truncate ${selected ? '' : 'text-zinc-400 font-normal'}`}>{selected ? selected.nombre : 'Sin destinatario'}</span>
                </span>
                {selected && (
                    <span onClick={(e) => { e.stopPropagation(); onChange(null); }} className="text-zinc-400 hover:text-rose-500 shrink-0"><X className="w-4 h-4" /></span>
                )}
            </button>

            {open && (
                <div className="absolute z-50 mt-2 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar o crear..." className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500 dark:text-white" />
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                        {filtered.map(c => (
                            <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); setQuery(''); }} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                <span className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 flex items-center justify-center text-xs font-bold shrink-0">{c.nombre.charAt(0).toUpperCase()}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{c.nombre}</span>
                                    {(c.empresa || c.telefono) && <span className="block text-[11px] text-zinc-400 truncate">{c.empresa || c.telefono}</span>}
                                </span>
                                {c.origen === 'nextcloud' && <span className="text-[9px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded shrink-0">NC</span>}
                                {value === c.id && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                            </button>
                        ))}
                        {filtered.length === 0 && !q && <p className="px-3 py-4 text-center text-sm text-zinc-400">Sin contactos aún</p>}
                    </div>
                    {q && !exactMatch && (
                        <button type="button" onClick={() => crear(query)} disabled={creating} className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-zinc-100 dark:border-zinc-800 text-teal-600 dark:text-teal-400 font-bold text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50">
                            <Plus className="w-4 h-4" /> Crear «{query.trim()}»
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
