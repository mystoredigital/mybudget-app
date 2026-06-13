import React, { useState, useEffect } from 'react';
import { supabase, Cuenta, CuentaTipo, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Landmark, Wallet, CreditCard, Banknote } from 'lucide-react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    cuentaToEdit?: Cuenta | null;
};

const TIPOS: { value: CuentaTipo; label: string; icon: React.ElementType }[] = [
    { value: 'banco', label: 'Banco', icon: Landmark },
    { value: 'wallet', label: 'Wallet', icon: Wallet },
    { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
    { value: 'efectivo', label: 'Efectivo', icon: Banknote },
];

export default function CuentaModal({ isOpen, onClose, onSuccess, cuentaToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [nombre, setNombre] = useState('');
    const [tipo, setTipo] = useState<CuentaTipo>('banco');
    const [moneda, setMoneda] = useState<Currency>('COP');
    const [saldoInicial, setSaldoInicial] = useState('0');
    const [notas, setNotas] = useState('');

    useEffect(() => {
        if (isOpen) {
            setNombre(cuentaToEdit?.nombre || '');
            setTipo(cuentaToEdit?.tipo || 'banco');
            setMoneda(cuentaToEdit?.moneda || 'COP');
            setSaldoInicial(cuentaToEdit ? String(cuentaToEdit.saldo_inicial) : '0');
            setNotas(cuentaToEdit?.notas || '');
        }
    }, [isOpen, cuentaToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!nombre.trim()) { alert('Ponle un nombre a la cuenta'); return; }
        setLoading(true);
        try {
            if (!user) throw new Error('Usuario no autenticado');
            const payload = {
                user_id: user.id,
                nombre: nombre.trim(),
                tipo,
                moneda,
                saldo_inicial: Number(saldoInicial) || 0,
                notas: notas.trim() || null,
            };
            const { error } = cuentaToEdit
                ? await supabase.from('cuentas').update(payload).eq('id', cuentaToEdit.id)
                : await supabase.from('cuentas').insert([payload]);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error guardando la cuenta: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 bg-teal-50/50 dark:bg-zinc-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-teal-900 dark:text-teal-300">{cuentaToEdit ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
                        <p className="text-teal-700/80 dark:text-zinc-400 text-sm font-medium mt-1">Banco, wallet o tarjeta donde tienes tu dinero</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-teal-100 dark:hover:bg-zinc-700 flex items-center justify-center text-teal-700 dark:text-zinc-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Nombre</label>
                        <input
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Ej. Bancolombia, Wallet USDT, Tarjeta Bybit"
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Tipo</label>
                        <div className="grid grid-cols-4 gap-2">
                            {TIPOS.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => setTipo(t.value)}
                                    className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-colors ${tipo === t.value ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'}`}
                                >
                                    <t.icon className="w-5 h-5" />
                                    <span className="text-[11px] font-bold">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Moneda</label>
                            <div className="flex gap-2">
                                {(['COP', 'USD'] as Currency[]).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setMoneda(m)}
                                        className={`flex-1 py-3 rounded-2xl border-2 font-bold text-sm transition-colors ${moneda === m ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Saldo inicial</label>
                            <input
                                type="number"
                                value={saldoInicial}
                                onChange={(e) => setSaldoInicial(e.target.value)}
                                className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Notas (opcional)</label>
                        <input
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                        />
                    </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-colors">
                        {loading ? 'Guardando...' : (cuentaToEdit ? 'Guardar' : 'Crear cuenta')}
                    </button>
                </div>
            </div>
        </div>
    );
}
