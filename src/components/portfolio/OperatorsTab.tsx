import React, { useState } from 'react';
import { Plus, Pencil, UserCog } from 'lucide-react';
import { PortfolioOperator } from '../../lib/supabase';
import PortfolioOperatorModal from '../PortfolioOperatorModal';

type Props = {
    portfolioId: string;
    operators: PortfolioOperator[];
    onChange: () => void;
};

export default function OperatorsTab({ portfolioId, operators, onChange }: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PortfolioOperator | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{operators.length} {operators.length === 1 ? 'operador' : 'operadores'}</p>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Operador
                </button>
            </div>

            {operators.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800">
                    <UserCog className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Sin operadores. Agrega quienes ejecutan la operación.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {operators.map(o => (
                        <div key={o.id} className="bg-white dark:bg-zinc-900 rounded-[24px] p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-zinc-900 dark:text-white">{o.name}</h3>
                                {o.contact && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 truncate">{o.contact}</p>}
                                {o.account_info && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-3 whitespace-pre-line">{o.account_info}</p>}
                            </div>
                            <button onClick={() => { setEditing(o); setModalOpen(true); }} className="w-9 h-9 shrink-0 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 flex items-center justify-center" title="Editar">
                                <Pencil className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <PortfolioOperatorModal
                isOpen={modalOpen}
                portfolioId={portfolioId}
                onClose={() => setModalOpen(false)}
                onSuccess={onChange}
                operatorToEdit={editing}
            />
        </div>
    );
}
