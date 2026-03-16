import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Send, Moon, Sun, Settings as SettingsIcon, AlertCircle, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

export default function Settings() {
    const { settings, updateSettings, loading } = useSettings();
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [remindersWebhook, setRemindersWebhook] = useState(settings.webhook_reminders || '');
    const [syncWebhook, setSyncWebhook] = useState(settings.webhook_sync || '');
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    // Sync local input state when settings load from DB
    useEffect(() => {
        setRemindersWebhook(settings.webhook_reminders || '');
        setSyncWebhook(settings.webhook_sync || '');
    }, [settings.webhook_reminders, settings.webhook_sync]);

    const handleSaveWebhooks = async () => {
        setSaving(true);
        setSaveMessage('');
        try {
            await updateSettings({
                webhook_reminders: remindersWebhook,
                webhook_sync: syncWebhook,
            });
            setSaveMessage('Webhooks guardados correctamente.');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            console.error('Error saving webhooks', error);
            setSaveMessage('Error al guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const toggleTheme = () => {
        updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' });
    };

    const handleBackup = async () => {
        try {
            const { data, error } = await supabase.from('expenses_view').select('*');
            if (error) throw error;

            if (data) {
                // Build CSV string
                const headers = ['id', 'expense', 'categoria', 'tipo_presupuesto', 'fecha', 'cuenta', 'vence_en', 'valor', 'moneda', 'status', 'comment'];
                const rows = data.map(item => headers.map(h => JSON.stringify(item[h] || '')).join(','));
                const csvContent = [headers.join(','), ...rows].join('\n');

                // Trigger download
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Copia_Seguridad_Finanzas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Error generating backup', error);
            alert('Hubo un error al generar la copia de seguridad.');
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-zinc-900 p-3 rounded-[20px] shadow-sm flex items-center justify-center dark:bg-zinc-800">
                    <SettingsIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Ajustes</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Configura tu experiencia y automatizaciones.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Appearance UI */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 flex flex-col justify-between items-start">
                    <div className="w-full mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 mb-2 dark:text-white flex items-center gap-2">Apariencia</h2>
                        <p className="text-zinc-500 text-sm font-medium dark:text-zinc-400">Cambia la interfaz a tu gusto para proteger tu vista.</p>
                    </div>

                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center gap-3 w-full p-4 rounded-2xl border-2 border-zinc-100 hover:border-teal-500 dark:border-zinc-800 dark:hover:border-teal-500 transition-colors bg-zinc-50 dark:bg-zinc-800 font-semibold"
                    >
                        {settings.theme === 'light' ? (
                            <><Moon className="w-5 h-5 text-zinc-500 dark:text-zinc-400" /> <span className="text-zinc-700 dark:text-zinc-300">Modo Oscuro</span></>
                        ) : (
                            <><Sun className="w-5 h-5 text-amber-500" /> <span className="text-zinc-700 dark:text-zinc-300">Modo Claro</span></>
                        )}
                    </button>
                </div>

                {/* Backup Data UI */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 flex flex-col justify-between items-start">
                    <div className="w-full mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 mb-2 dark:text-white flex items-center gap-2">Copias de Seguridad</h2>
                        <p className="text-zinc-500 text-sm font-medium dark:text-zinc-400">Descarga un respaldo en CSV de todos tus movimientos financieros.</p>
                    </div>

                    <button
                        onClick={handleBackup}
                        className="flex items-center justify-center gap-2 w-full p-4 rounded-2xl bg-teal-900 text-white hover:bg-teal-800 transition-colors font-bold shadow-md shadow-teal-900/20"
                    >
                        <Download className="w-5 h-5" /> Exportar Datos (CSV)
                    </button>
                </div>

                {/* Account Settings UI */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 flex flex-col justify-between items-start col-span-1 md:col-span-2 lg:col-span-1">
                    <div className="w-full mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 mb-2 dark:text-white flex items-center gap-2">Cuenta</h2>
                        <p className="text-zinc-500 text-sm font-medium dark:text-zinc-400">Administra el acceso a tu cuenta.</p>
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="flex items-center justify-center gap-2 w-full p-4 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors font-bold dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50"
                    >
                        <LogOut className="w-5 h-5" /> Cerrar Sesión
                    </button>
                </div>

                {/* Webhooks Config */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 col-span-1 md:col-span-2">
                    <h2 className="text-xl font-bold text-zinc-900 mb-2 dark:text-white flex items-center gap-2">Automatizaciones (Webhooks n8n)</h2>
                    <p className="text-zinc-500 text-sm font-medium mb-8 dark:text-zinc-400">Conecta tu información con n8n u otros servicios externos ingresando las URLs de tus Webhooks.</p>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                Notificaciones de Pagos
                            </label>
                            <p className="text-xs text-zinc-500 mb-3 dark:text-zinc-400">Webhook responsable de recibir la notificación de pagos que vencen en 3 días. (Ejecución diaria en la base de datos o por tu n8n)</p>
                            <input
                                type="text"
                                value={remindersWebhook}
                                onChange={(e) => setRemindersWebhook(e.target.value)}
                                className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-white font-mono text-sm"
                                placeholder="https://tu-n8n.com/webhook/reminders"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-teal-600" />
                                Sincronización ERP / Google Drive
                            </label>
                            <p className="text-xs text-zinc-500 mb-3 dark:text-zinc-400">Webhook responsable de recibir la información completa de cada movimiento/pago para sincronizarlo con otros sistemas.</p>
                            <input
                                type="text"
                                value={syncWebhook}
                                onChange={(e) => setSyncWebhook(e.target.value)}
                                className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-white font-mono text-sm"
                                placeholder="https://tu-n8n.com/webhook/sync"
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex items-center gap-4">
                        <button
                            onClick={handleSaveWebhooks}
                            disabled={saving}
                            className="bg-zinc-900 text-white px-8 py-3.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-md dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                            <Send className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Webhooks'}
                        </button>
                        {saveMessage && (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{saveMessage}</span>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
