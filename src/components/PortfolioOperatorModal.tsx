import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { supabase, PortfolioOperator } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Props = {
    isOpen: boolean;
    portfolioId: string;
    onClose: () => void;
    onSuccess: () => void;
    operatorToEdit?: PortfolioOperator | null;
};

export default function PortfolioOperatorModal({ isOpen, portfolioId, onClose, onSuccess, operatorToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [contact, setContact] = useState('');
    const [accountInfo, setAccountInfo] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (operatorToEdit) {
            setName(operatorToEdit.name);
            setContact(operatorToEdit.contact || '');
            setAccountInfo(operatorToEdit.account_info || '');
        } else {
            setName('');
            setContact('');
            setAccountInfo('');
        }
    }, [isOpen, operatorToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        setLoading(true);
        try {
            const payload = {
                portfolio_id: portfolioId,
                user_id: user.id,
                name: trimmed,
                contact: contact || null,
                account_info: accountInfo || null,
            };
            if (operatorToEdit) {
                const { error } = await supabase.from('portfolio_operators').update(payload).eq('id', operatorToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('portfolio_operators').insert([payload]);
                if (error) throw error;
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!operatorToEdit) return;
        if (!window.confirm(`¿Eliminar al operador "${operatorToEdit.name}"?`)) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('portfolio_operators').delete().eq('id', operatorToEdit.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                        {operatorToEdit ? 'Editar Operador' : 'Nuevo Operador'}
                    </h2>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Nombre *</label>
                        <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Juan operador, Renato facturas" className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" autoFocus />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Contacto</label>
                        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email, teléfono…" className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Cuenta para pagos</label>
                        <textarea value={accountInfo} onChange={(e) => setAccountInfo(e.target.value)} rows={3} placeholder="Banco, número de cuenta, titular, CI…" className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-900 dark:text-zinc-100 resize-none" />
                    </div>

                    <div className="flex justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <div>
                            {operatorToEdit && (
                                <button type="button" onClick={handleDelete} className="px-5 py-3 rounded-2xl font-bold text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors flex items-center gap-2">
                                    <Trash2 className="w-5 h-5" /> Eliminar
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                            <button type="submit" disabled={loading} className="px-8 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md shadow-teal-900/20">
                                {loading ? 'Guardando...' : (operatorToEdit ? 'Guardar' : 'Crear')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
