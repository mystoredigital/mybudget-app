import React, { useState } from 'react';
import { Plus, Pencil, Users } from 'lucide-react';
import { PortfolioPartner } from '../../lib/supabase';
import PortfolioPartnerModal from '../PortfolioPartnerModal';

type Props = {
    portfolioId: string;
    partners: PortfolioPartner[];
    onChange: () => void;
};

export default function PartnersTab({ portfolioId, partners, onChange }: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PortfolioPartner | null>(null);

    const totalShare = partners.reduce((acc, p) => acc + Number(p.share_percent), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        {partners.length} {partners.length === 1 ? 'socio' : 'socios'} ·
                        <span className={`ml-1 font-bold ${Math.abs(totalShare - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {totalShare.toFixed(2)}% asignado
                        </span>
                    </p>
                    {Math.abs(totalShare - 100) > 0.01 && partners.length > 0 && (
                        <p className="text-xs text-amber-600 mt-1">⚠ Los porcentajes no suman 100%.</p>
                    )}
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Socio
                </button>
            </div>

            {partners.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-12 text-center border border-zinc-100 dark:border-zinc-800">
                    <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Aún no hay socios. Agrégalos para empezar a calcular distribución.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {partners.map(p => (
                        <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-[24px] p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-zinc-900 dark:text-white">{p.name}</h3>
                                <p className="text-sm text-teal-600 dark:text-teal-400 font-bold mt-0.5">{Number(p.share_percent).toFixed(2)}%</p>
                                {p.contact && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 truncate">{p.contact}</p>}
                                {p.account_info && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-3 whitespace-pre-line">{p.account_info}</p>}
                            </div>
                            <button onClick={() => { setEditing(p); setModalOpen(true); }} className="w-9 h-9 shrink-0 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 flex items-center justify-center" title="Editar">
                                <Pencil className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <PortfolioPartnerModal
                isOpen={modalOpen}
                portfolioId={portfolioId}
                onClose={() => setModalOpen(false)}
                onSuccess={onChange}
                partnerToEdit={editing}
            />
        </div>
    );
}
