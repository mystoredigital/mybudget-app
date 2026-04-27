import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { supabase, UserPortfolio, PortfolioType, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    portfolioToEdit?: UserPortfolio | null;
};

export default function PortfolioModal({ isOpen, onClose, onSuccess, portfolioToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<PortfolioType>('simple');
    const [defaultCurrency, setDefaultCurrency] = useState<Currency>('USD');

    useEffect(() => {
        if (!isOpen) return;
        if (portfolioToEdit) {
            setName(portfolioToEdit.name);
            setDescription(portfolioToEdit.description || '');
            setType(portfolioToEdit.type);
            setDefaultCurrency(portfolioToEdit.default_currency);
        } else {
            setName('');
            setDescription('');
            setType('simple');
            setDefaultCurrency('USD');
        }
    }, [isOpen, portfolioToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        setLoading(true);
        try {
            if (portfolioToEdit) {
                const { error } = await supabase
                    .from('user_portfolios')
                    .update({ name: trimmed, description: description || null, type, default_currency: defaultCurrency })
                    .eq('id', portfolioToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('user_portfolios')
                    .insert([{ user_id: user.id, name: trimmed, description: description || null, type, default_currency: defaultCurrency }]);
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
        if (!portfolioToEdit) return;
        if (!window.confirm(`¿Eliminar el portafolio "${portfolioToEdit.name}"? Esto eliminará socios, operadores, periodos y movimientos asociados.`)) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('user_portfolios').delete().eq('id', portfolioToEdit.id);
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
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {portfolioToEdit ? 'Editar Portafolio' : 'Nuevo Portafolio'}
                    </h2>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Nombre *</label>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej. Ecuabet, Personal, Inversión Inmobiliaria"
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none transition-shadow text-zinc-900 dark:text-zinc-100"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Tipo</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setType('simple')}
                                className={`p-4 rounded-2xl border-2 text-left transition-all ${type === 'simple'
                                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                    }`}
                            >
                                <p className="font-bold text-zinc-900 dark:text-white text-sm">Simple</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">Solo agrupa gastos. Aparece como opción al crear una inversión.</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('shared')}
                                className={`p-4 rounded-2xl border-2 text-left transition-all ${type === 'shared'
                                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                    }`}
                            >
                                <p className="font-bold text-zinc-900 dark:text-white text-sm">Compartido</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">Operación con socios, ingresos brutos, distribución y dashboard mensual.</p>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Moneda por defecto</label>
                        <select
                            value={defaultCurrency}
                            onChange={(e) => setDefaultCurrency(e.target.value as Currency)}
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer text-zinc-900 dark:text-zinc-100"
                        >
                            <option value="USD">USD</option>
                            <option value="COP">COP</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Descripción</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Notas, metas, contexto del portafolio…"
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none transition-shadow text-zinc-900 dark:text-zinc-100 resize-none"
                        />
                    </div>

                    <div className="flex justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <div>
                            {portfolioToEdit && (
                                <button type="button" onClick={handleDelete} className="px-5 py-3 rounded-2xl font-bold text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors flex items-center gap-2">
                                    <Trash2 className="w-5 h-5" /> Eliminar
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" disabled={loading} className="px-8 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md shadow-teal-900/20">
                                {loading ? 'Guardando...' : (portfolioToEdit ? 'Guardar' : 'Crear')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
