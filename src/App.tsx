import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ExpensesTable from './pages/ExpensesTable';
import ExpensesByStatus from './pages/ExpensesByStatus';
import ExpensesByCategory from './pages/ExpensesByCategory';
import ExpensesByMonth from './pages/ExpensesByMonth';
import CalendarView from './pages/CalendarView';
import FoodExpenses from './pages/FoodExpenses';
import Settings from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] dark:bg-zinc-900">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="expenses" element={<ExpensesTable />} />
              <Route path="expenses/estado" element={<ExpensesByStatus />} />
              <Route path="expenses/categoria" element={<ExpensesByCategory />} />
              <Route path="expenses/mes" element={<ExpensesByMonth />} />
              <Route path="expenses/food" element={<FoodExpenses />} />
              <Route path="expenses/calendar" element={<CalendarView />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
