import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, LayoutDashboard, ListOrdered, Users, UserCog, CalendarRange } from 'lucide-react';
import { cn } from '../lib/utils';
import {
    supabase, UserPortfolio, PortfolioPartner, PortfolioOperator,
    PortfolioPeriod, PortfolioMovement, PortfolioPeriodIncome, PortfolioMovementFile,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PortfolioModal from '../components/PortfolioModal';
import DashboardTab from '../components/portfolio/DashboardTab';
import MovementsTab from '../components/portfolio/MovementsTab';
import PartnersTab from '../components/portfolio/PartnersTab';
import OperatorsTab from '../components/portfolio/OperatorsTab';
import PeriodsTab from '../components/portfolio/PeriodsTab';

type TabKey = 'dashboard' | 'movements' | 'partners' | 'operators' | 'periods';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'movements', label: 'Movimientos', icon: ListOrdered },
    { key: 'partners', label: 'Socios', icon: Users },
    { key: 'operators', label: 'Operadores', icon: UserCog },
    { key: 'periods', label: 'Periodos', icon: CalendarRange },
];

export default function PortfolioDetail() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [portfolio, setPortfolio] = useState<UserPortfolio | null>(null);
    const [partners, setPartners] = useState<PortfolioPartner[]>([]);
    const [operators, setOperators] = useState<PortfolioOperator[]>([]);
    const [periods, setPeriods] = useState<PortfolioPeriod[]>([]);
    const [periodIncomes, setPeriodIncomes] = useState<PortfolioPeriodIncome[]>([]);
    const [movements, setMovements] = useState<PortfolioMovement[]>([]);
    const [movementFiles, setMovementFiles] = useState<PortfolioMovementFile[]>([]);
    const [tab, setTab] = useState<TabKey>('dashboard');
    const [editOpen, setEditOpen] = useState(false);

    useEffect(() => {
        if (id && user) loadAll();
    }, [id, user]);

    async function loadAll() {
        if (!id || !user) return;
        setLoading(true);
        const [p, pa, op, pe, mv] = await Promise.all([
            supabase.from('user_portfolios').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
            supabase.from('portfolio_partners').select('*').eq('portfolio_id', id).order('name'),
            supabase.from('portfolio_operators').select('*').eq('portfolio_id', id).order('name'),
            supabase.from('portfolio_periods').select('*').eq('portfolio_id', id).order('period_month', { ascending: false }),
            supabase.from('portfolio_movements').select('*').eq('portfolio_id', id).order('fecha', { ascending: false }),
        ]);
        if (p.data) setPortfolio(p.data);
        if (pa.data) setPartners(pa.data);
        if (op.data) setOperators(op.data);
        if (pe.data) setPeriods(pe.data);
        if (mv.data) setMovements(mv.data);

        // Cargar líneas de ingreso de TODOS los periodos del portafolio.
        if (pe.data && pe.data.length > 0) {
            const periodIds = pe.data.map((x: PortfolioPeriod) => x.id);
            const { data: incomes } = await supabase
                .from('portfolio_period_incomes')
                .select('*')
                .in('period_id', periodIds)
                .order('sort_order');
            if (incomes) setPeriodIncomes(incomes);
        } else {
            setPeriodIncomes([]);
        }

        // Cargar archivos adjuntos de TODOS los movimientos del portafolio.
        if (mv.data && mv.data.length > 0) {
            const movementIds = mv.data.map((x: PortfolioMovement) => x.id);
            const { data: files } = await supabase
                .from('portfolio_movement_files')
                .select('*')
                .in('movement_id', movementIds);
            if (files) setMovementFiles(files);
        } else {
            setMovementFiles([]);
        }

        setLoading(false);
    }

    if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>;
    if (!portfolio) return (
        <div className="space-y-4">
            <Link to="/portfolios" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-sm font-semibold">
                <ArrowLeft className="w-4 h-4" /> Volver
            </Link>
            <p className="text-zinc-500">Portafolio no encontrado.</p>
        </div>
    );

    const isShared = portfolio.type === 'shared';

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                    <Link to="/portfolios" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-sm font-semibold mb-3">
                        <ArrowLeft className="w-4 h-4" /> Portafolios
                    </Link>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{portfolio.name}</h1>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${isShared ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                            {isShared ? 'Compartido' : 'Simple'}
                        </span>
                        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">· {portfolio.default_currency}</span>
                    </div>
                    {portfolio.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl">{portfolio.description}</p>
                    )}
                </div>
                <button
                    onClick={() => setEditOpen(true)}
                    className="px-5 py-3 rounded-2xl font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                    <Pencil className="w-4 h-4" /> Editar
                </button>
            </div>

            {!isShared && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300">
                    Este es un portafolio <strong>simple</strong> — solo agrupa gastos personales. No tiene socios ni distribución. Para activar todas las pestañas, edítalo y cambia el tipo a <strong>Compartido</strong>.
                </div>
            )}

            {/* Tabs */}
            {isShared && (
                <>
                    <div className="border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-1 -mb-px">
                        {TABS.map(t => {
                            const isActive = tab === t.key;
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key)}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors',
                                        isActive
                                            ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                            : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                                    )}
                                >
                                    <t.icon className="w-4 h-4" />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {tab === 'dashboard' && (
                        <DashboardTab
                            defaultCurrency={portfolio.default_currency}
                            partners={partners}
                            periods={periods}
                            periodIncomes={periodIncomes}
                            movements={movements}
                        />
                    )}
                    {tab === 'movements' && (
                        <MovementsTab
                            portfolioId={portfolio.id}
                            defaultCurrency={portfolio.default_currency}
                            movements={movements}
                            movementFiles={movementFiles}
                            partners={partners}
                            operators={operators}
                            periods={periods}
                            onChange={loadAll}
                        />
                    )}
                    {tab === 'partners' && (
                        <PartnersTab portfolioId={portfolio.id} partners={partners} onChange={loadAll} />
                    )}
                    {tab === 'operators' && (
                        <OperatorsTab portfolioId={portfolio.id} operators={operators} onChange={loadAll} />
                    )}
                    {tab === 'periods' && (
                        <PeriodsTab portfolioId={portfolio.id} defaultCurrency={portfolio.default_currency} periods={periods} onChange={loadAll} />
                    )}
                </>
            )}

            <PortfolioModal
                isOpen={editOpen}
                portfolioToEdit={portfolio}
                onClose={() => setEditOpen(false)}
                onSuccess={() => {
                    loadAll();
                    // Si lo borraron desde el modal, regresa a la lista
                    setTimeout(async () => {
                        if (id && user) {
                            const { data } = await supabase.from('user_portfolios').select('id').eq('id', id).maybeSingle();
                            if (!data) navigate('/portfolios');
                        }
                    }, 100);
                }}
            />
        </div>
    );
}
