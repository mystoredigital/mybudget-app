import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, Users, Tag, Pencil } from 'lucide-react';
import { supabase, UserPortfolio } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PortfolioModal from '../components/PortfolioModal';

export default function PortfoliosList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [portfolios, setPortfolios] = useState<UserPortfolio[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<UserPortfolio | null>(null);

    useEffect(() => {
        if (user) load();
    }, [user]);

    async function load() {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('user_portfolios')
            .select('*')
            .eq('user_id', user.id)
            .order('type', { ascending: false }) // shared antes que simple
            .order('name');
        if (!error && data) setPortfolios(data);
        setLoading(false);
    }

    const shared = portfolios.filter(p => p.type === 'shared');
    const simple = portfolios.filter(p => p.type === 'simple');

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-zinc-900 p-3 rounded-[20px] shadow-sm flex items-center justify-center dark:bg-zinc-800">
                        <Briefcase className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Portafolios</h1>
                        <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Tus inversiones y negocios agrupados.</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors flex items-center gap-2 shadow-md shadow-teal-900/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Portafolio
                </button>
            </div>

            {loading ? (
                <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>
            ) : portfolios.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-12 text-center border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <Briefcase className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">No tienes portafolios aún.</p>
                    <button
                        onClick={() => { setEditing(null); setModalOpen(true); }}
                        className="mt-4 px-5 py-3 rounded-2xl font-bold text-white bg-teal-900 hover:bg-teal-800 dark:bg-teal-600 transition-colors inline-flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Crear el primero
                    </button>
                </div>
            ) : (
                <>
                    {shared.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Compartidos</h2>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">— con socios y distribución</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {shared.map(p => (
                                    <PortfolioCard key={p.id} p={p} onOpen={() => navigate(`/portfolios/${p.id}`)} onEdit={() => { setEditing(p); setModalOpen(true); }} />
                                ))}
                            </div>
                        </section>
                    )}

                    {simple.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Tag className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Simples</h2>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">— solo agrupan gastos</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {simple.map(p => (
                                    <PortfolioCard key={p.id} p={p} onOpen={() => { setEditing(p); setModalOpen(true); }} onEdit={() => { setEditing(p); setModalOpen(true); }} simple />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            <PortfolioModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={load}
                portfolioToEdit={editing}
            />
        </div>
    );
}

type CardProps = { p: UserPortfolio; onOpen: () => void; onEdit: () => void; simple?: boolean };

const PortfolioCard: React.FC<CardProps> = ({ p, onOpen, onEdit, simple }) => {
    return (
        <div className="bg-white dark:bg-zinc-900 rounded-[28px] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group cursor-pointer relative" onClick={onOpen}>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Editar"
            >
                <Pencil className="w-4 h-4" />
            </button>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${simple ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'}`}>
                {simple ? <Tag className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            </div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white">{p.name}</h3>
            <p className="text-xs uppercase tracking-wide font-semibold text-zinc-400 dark:text-zinc-500 mt-1">{p.type === 'shared' ? 'Compartido' : 'Simple'} · {p.default_currency}</p>
            {p.description && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3 line-clamp-3 leading-relaxed">{p.description}</p>
            )}
        </div>
    );
};
