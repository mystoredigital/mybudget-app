import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  List,
  PieChart,
  Calendar as CalendarIcon,
  LogOut,
  Settings,
  CreditCard,
  Briefcase,
  Coffee,
  CircleDashed
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/expenses', icon: List, label: 'Todos' },
    { to: '/portfolios', icon: Briefcase, label: 'Portafolios' },
    { to: '/expenses/estado', icon: CreditCard, label: 'Presupuestos' },
    { to: '/expenses/categoria', icon: PieChart, label: 'Categorías' },
    { to: '/expenses/calendar', icon: CalendarIcon, label: 'Calendario' },
    { to: '/settings', icon: Settings, label: 'Ajustes' },
  ];

  return (
    <div className="min-h-screen bg-[#f7f9f7] dark:bg-zinc-950 flex flex-col md:flex-row p-0 md:p-4 gap-0 md:gap-4 font-sans text-zinc-900 dark:text-zinc-50 transition-colors">
      {/* Floating Sidebar (Desktop) */}
      <aside className="hidden md:flex w-[280px] shrink-0 bg-white dark:bg-zinc-900 rounded-[40px] shadow-sm border border-zinc-100/50 dark:border-zinc-800 flex-col pt-8 pb-6 sticky top-4 h-[calc(100vh-32px)] transition-colors">

        <div className="px-8 mb-8 flex items-center gap-3 w-full">
          <img src="/favicon.png" alt="MyBudget Logo" className="w-10 h-10 shrink-0 object-contain" />
          <span className="font-bold text-xl tracking-tight text-teal-900 dark:text-teal-400">MyBudget</span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={() =>
                  cn(
                    "flex items-center gap-4 px-5 py-4 rounded-3xl text-[15px] font-semibold transition-all duration-200",
                    isActive
                      ? "bg-teal-900 text-white shadow-md shadow-teal-900/20 translate-x-1 dark:bg-teal-600 dark:shadow-teal-900/40"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                  )
                }
              >
                <item.icon className={cn("w-5 h-5", item.to === '/' && !location.pathname.includes('/expenses') && !location.pathname.includes('/settings') && "text-teal-400 dark:text-teal-300")} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card */}
        <div className="px-6 mt-auto">
          <div className="bg-zinc-50 rounded-[28px] p-4 flex flex-col gap-4 border border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-800 shrink-0">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <p className="font-bold text-sm text-zinc-900 truncate">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-zinc-400 truncate tracking-tight">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-[20px] text-sm font-bold text-zinc-600 bg-white hover:bg-rose-50 hover:text-rose-600 transition-colors shadow-sm border border-zinc-100"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto w-full h-screen md:h-[calc(100vh-32px)] pb-24 md:pb-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))] bg-white dark:bg-zinc-900 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="MyBudget Logo" className="w-8 h-8 shrink-0 object-contain" />
            <span className="font-bold text-lg tracking-tight text-teal-900 dark:text-teal-400">MyBudget</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-800">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="w-full mx-auto p-4 lg:px-6 2xl:px-8 2xl:max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-around p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.1)] z-50">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={() =>
                cn(
                  "flex flex-col items-center justify-center p-2 rounded-xl transition-all flex-1",
                  isActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                )
              }
            >
              <item.icon className={cn("w-5 h-5 mb-1", isActive && "fill-teal-600/20")} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
