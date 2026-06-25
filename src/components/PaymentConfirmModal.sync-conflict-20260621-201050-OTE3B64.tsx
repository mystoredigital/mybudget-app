import React, { useState, useEffect, useRef } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { X, UploadCloud, CheckCircle2, Image as ImageIcon, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatCurrency } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { addMonths, addYears } from 'date-fns';

type PaymentConfirmModalProps = {
    expense: Expense | null;
    onClose: () => void;
    onSuccess: () => void;
};

export default function PaymentConfirmModal({ expense, onClose, onSuccess }: PaymentConfirmModalProps) {
    const { user } = useAuth();
    const { settings } = useSettings();
    const [loading, setLoading] = useState(false);
    const [loadingOverdue, setLoadingOverdue] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const isSubmitting = useRef(false);

    useEffect(() => {
        // Reset state when opened
        if (expense) {
            setFile(null);
            setPreview(null);
            setPaymentDate(new Date().toISOString().split('T')[0]);
            isSubmitting.current = false;
        }
    }, [expense]);

    useEffect(() => {
        // Escuchar el evento de pegar (Clipboard) globalmente cuando el modal está abierto
        const handlePaste = (e: ClipboardEvent) => {
            if (!expense) return;
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        setFile(blob);
                        setPreview(URL.createObjectURL(blob));
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [expense]);

    if (!expense) return null;

    // Check if expense is overdue
    const isOverdue = expense.vence_en?.startsWith('Vencido hace') || expense.vence_en?.startsWith('Vence hoy');
    const isExpiredPastMonth = expense.fecha
        ? new Date(expense.fecha + 'T12:00:00') < new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        : false;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
        }
    };

    const handleConfirm = async () => {
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);
        try {
            if (!user) throw new Error('Usuario no autenticado');

            // 1. Subir archivo si existe
            let comprobanteKey = null;
            if (file) {
                const fileExt = file.name ? file.name.split('.').pop() : 'png';
                const fileName = `${uuidv4()}.${fileExt}`;
                const filePath = `${user.id}/${expense.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('comprobantes')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // Registrar en tabla expense_files
                const { error: dbError } = await supabase.from('expense_files').insert([{
                    expense_id: expense.id,
                    user_id: user.id,
                    bucket: 'comprobantes',
                    path: filePath,
                    filename: file.name || 'clipboard_image.png',
                    mime_type: file.type,
                    size: file.size
                }]);

                if (dbError) throw dbError;
                comprobanteKey = true;
            }

            // 2. Actualizar estado del pago a 'Pagado'
            const { data: updatedData, error: updateError } = await supabase
                .from('expenses')
                .update({
                    status: 'Pagado',
                    fecha: paymentDate
                })
                .eq('id', expense.id)
                .select()
                .single();

            if (updateError) throw updateError;

            // Trigger sync webhook if configured
            if (settings.webhook_sync) {
                try {
                    const res = await fetch(settings.webhook_sync, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedData),
                        signal: AbortSignal.timeout(5000),
                    });
                    if (!res.ok) {
                        console.error(`Webhook de sync respondió ${res.status} ${res.statusText}`);
                    }
                } catch (webhookError) {
                    console.error('No se pudo enviar al webhook de sync:', webhookError);
                }
            }

            // 3. Auto-renovar: crear próximo movimiento si frecuencia != 'Unico'
            if (expense.frecuencia && expense.frecuencia !== 'Unico') {
                const originalDate = expense.fecha ? new Date(expense.fecha + 'T12:00:00') : new Date();
                let nextDate: Date;

                switch (expense.frecuencia) {
                    case 'Mensual':
                        nextDate = addMonths(originalDate, 1);
                        break;
                    case 'Bimestral':
                        nextDate = addMonths(originalDate, 2);
                        break;
                    case 'Trimestral':
                        nextDate = addMonths(originalDate, 3);
                        break;
                    case 'Semestral':
                        nextDate = addMonths(originalDate, 6);
                        break;
                    case 'Anual':
                        nextDate = addYears(originalDate, 1);
                        break;
                    default:
                        nextDate = addMonths(originalDate, 1);
                }

                const nextDateStr = nextDate.toISOString().split('T')[0];

                // Check if a pending renewal already exists
                const { data: existing } = await supabase
                    .from('expenses')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('expense', expense.expense)
                    .eq('fecha', nextDateStr)
                    .eq('status', 'Pendiente')
                    .maybeSingle();

                if (!existing) {
                    await supabase.from('expenses').insert([{
                        user_id: user.id,
                        expense: expense.expense,
                        categoria: expense.categoria,
                        status: 'Pendiente',
                        fecha: nextDateStr,
                        valor: expense.valor,
                        moneda: expense.moneda || 'COP',
                        portafolio: expense.portafolio || 'Personal',
                        frecuencia: expense.frecuencia,
                        cuenta: expense.cuenta || '',
                        nombre: expense.nombre || '',
                    }]);
                }
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error confirmando pago: ' + err.message);
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    // ── Handle "Marcar Vencido" ──
    // Marks the current overdue expense as 'Vencido' and creates
    // a new expense for the next month with DOUBLE the value
    const handleMarkOverdue = async () => {
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoadingOverdue(true);
        try {
            if (!user) throw new Error('Usuario no autenticado');

            // 1. Mark current expense as 'Vencido' so it stops appearing in n8n notifications
            const { data: updatedData, error: updateError } = await supabase
                .from('expenses')
                .update({
                    status: 'Vencido',
                    comment: (expense.comment ? expense.comment + ' | ' : '') + 'Marcado como vencido - duplicado al siguiente mes con valor doble'
                })
                .eq('id', expense.id)
                .select()
                .single();

            if (updateError) throw updateError;

            // 2. Create new expense for next month with DOUBLE value
            const originalDate = expense.fecha ? new Date(expense.fecha + 'T12:00:00') : new Date();
            const nextMonth = addMonths(originalDate, 1);
            const nextDateStr = nextMonth.toISOString().split('T')[0];
            const doubleValue = Number(expense.valor) * 2;

            // Check if a duplicate already exists to avoid creating multiple
            const { data: existing } = await supabase
                .from('expenses')
                .select('id')
                .eq('user_id', user.id)
                .eq('expense', expense.expense)
                .eq('fecha', nextDateStr)
                .eq('status', 'Pendiente')
                .maybeSingle();

            if (!existing) {
                const { error: insertError } = await supabase.from('expenses').insert([{
                    user_id: user.id,
                    expense: expense.expense,
                    categoria: expense.categoria,
                    status: 'Pendiente',
                    fecha: nextDateStr,
                    valor: doubleValue,
                    moneda: expense.moneda || 'COP',
                    portafolio: expense.portafolio || 'Personal',
                    frecuencia: expense.frecuencia || 'Unico',
                    cuenta: expense.cuenta || '',
                    nombre: expense.nombre || '',
                    comment: `Pago vencido de ${expense.fecha || 'mes anterior'} (${formatCurrency(expense.valor, expense.moneda)}) + cuota actual`,
                }]);
                if (insertError) throw insertError;
            }

            // 3. Notify webhook that overdue was processed
            if (settings.webhook_sync) {
                try {
                    const res = await fetch(settings.webhook_sync, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...updatedData,
                            _action: 'overdue_rolled_over',
                            _new_value: doubleValue,
                            _new_date: nextDateStr,
                        }),
                        signal: AbortSignal.timeout(5000),
                    });
                    if (!res.ok) {
                        console.error(`Webhook de sync respondió ${res.status} ${res.statusText}`);
                    }
                } catch (webhookError) {
                    console.error('No se pudo enviar al webhook de sync:', webhookError);
                }
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error marcando como vencido: ' + err.message);
        } finally {
            setLoadingOverdue(false);
            isSubmitting.current = false;
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 bg-teal-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-teal-900">Confirmar Pago</h2>
                        <p className="text-teal-700/80 text-sm font-medium mt-1">Sube el comprobante de esta transacción</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-teal-100 flex items-center justify-center text-teal-700 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6 overflow-y-auto flex-1 min-h-0">

                    {/* Resumen de la Inversión */}
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100 flex justify-between items-center">
                        <div>
                            <p className="font-bold text-zinc-900">{expense.expense}</p>
                            <p className="text-zinc-500 text-sm font-medium mt-1">Vence: {expense.fecha || 'Sin fecha'}</p>
                        </div>
                        <p className="font-bold text-xl text-zinc-900">{formatCurrency(expense.valor, expense.moneda)}</p>
                    </div>

                    {/* Link de pago */}
                    {expense.link && (
                        <a
                            href={expense.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 w-full px-5 py-3.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-2xl transition-colors group"
                        >
                            <span className="w-9 h-9 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center shrink-0 transition-colors">
                                <span className="text-lg">🔗</span>
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-blue-800 text-sm">Ir a la página de pago</p>
                                <p className="text-blue-600/70 text-xs truncate mt-0.5">{expense.link}</p>
                            </div>
                            <span className="text-blue-400 text-lg shrink-0">→</span>
                        </a>
                    )}

                    {/* Overdue Warning Banner */}
                    {isOverdue && (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                                <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
                            </div>
                            <div>
                                <p className="font-bold text-rose-800 text-sm">Pago Vencido</p>
                                <p className="text-rose-600 text-xs mt-1 leading-relaxed">
                                    Este pago está vencido ({expense.vence_en}). Puedes marcarlo como <strong>Vencido</strong> para trasladarlo al siguiente mes con el valor duplicado (${formatCurrency(expense.valor * 2, expense.moneda)}).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Selector de Fecha de Pago */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-2">Fecha de Pago de la Transacción</label>
                        <div className="relative">
                            <CalendarIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-teal-600" />
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="w-full pl-12 pr-5 py-3 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 font-medium"
                            />
                        </div>
                        {expense.frecuencia && expense.frecuencia !== 'Unico' && (
                            <p className="text-xs text-teal-600 mt-2 font-medium">Se auto-programará el pago siguiente conservando el mismo día de la fecha de vencimiento original ({expense.fecha || paymentDate}).</p>
                        )}
                    </div>

                    {/* Área de Drop / Paste */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-2">Comprobante (Opcional)</label>
                        <div className={`border-2 border-dashed rounded-[24px] p-6 text-center transition-colors ${preview ? 'border-teal-500 bg-teal-50/30' : 'border-zinc-200 hover:border-teal-400 bg-zinc-50'}`}>

                            {preview ? (
                                <div className="relative inline-block">
                                    <img src={preview} alt="Comprobante preview" className="max-h-48 rounded-xl shadow-sm border border-zinc-100" />
                                    <button onClick={() => { setFile(null); setPreview(null); }} className="absolute -top-3 -right-3 bg-rose-500 text-white p-1.5 rounded-full shadow-md hover:bg-rose-600 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                                        <ImageIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-600 font-medium text-sm">Pega una imagen de tu portapapeles</p>
                                        <p className="text-zinc-400 text-xs mt-1">o selecciona un archivo de tu equipo</p>
                                    </div>
                                    <label className="inline-block px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer shadow-sm transition-colors mt-2">
                                        <UploadCloud className="w-4 h-4 inline-block mr-2" />
                                        Examinar archivo
                                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="bg-zinc-50 border-t border-zinc-100 p-6 px-8 flex flex-col gap-3 shrink-0">
                    {/* Overdue button - only shown when payment is overdue */}
                    {isOverdue && (
                        <button
                            onClick={handleMarkOverdue}
                            disabled={loadingOverdue || loading}
                            className="w-full px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-md shadow-rose-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                            {loadingOverdue ? 'Procesando...' : (
                                <>
                                    <AlertTriangle className="w-5 h-5" />
                                    Marcar Vencido — Duplicar al Siguiente Mes ({formatCurrency(expense.valor * 2, expense.moneda)})
                                </>
                            )}
                        </button>
                    )}
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 hover:bg-zinc-200 transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleConfirm} disabled={loading || loadingOverdue} className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-colors flex items-center gap-2">
                            {loading ? 'Procesando...' : <><CheckCircle2 className="w-5 h-5" /> Confirmar Pago</>}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
