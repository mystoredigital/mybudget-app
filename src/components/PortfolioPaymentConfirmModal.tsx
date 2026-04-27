import React, { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, UploadCloud, CheckCircle2, Image as ImageIcon, Calendar as CalendarIcon, Paperclip, Trash2 } from 'lucide-react';
import {
    supabase, PortfolioMovement, PortfolioMovementFile, PortfolioPartner, PortfolioOperator,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

type Props = {
    movement: PortfolioMovement | null;
    partner?: PortfolioPartner | null;
    operator?: PortfolioOperator | null;
    onClose: () => void;
    onSuccess: () => void;
};

export default function PortfolioPaymentConfirmModal({ movement, partner, operator, onClose, onSuccess }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [existingFiles, setExistingFiles] = useState<PortfolioMovementFile[]>([]);
    const isSubmitting = useRef(false);

    useEffect(() => {
        if (!movement) return;
        setFile(null);
        setPreview(null);
        setPaymentDate(movement.fecha || new Date().toISOString().slice(0, 10));
        isSubmitting.current = false;
        loadExistingFiles(movement.id);
    }, [movement]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!movement) return;
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
    }, [movement]);

    if (!movement) return null;

    async function loadExistingFiles(movementId: string) {
        const { data } = await supabase
            .from('portfolio_movement_files')
            .select('*')
            .eq('movement_id', movementId)
            .order('created_at', { ascending: false });
        if (data) setExistingFiles(data);
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
        }
    };

    const handleConfirm = async () => {
        if (!movement || isSubmitting.current) return;
        if (!user) return;
        isSubmitting.current = true;
        setLoading(true);
        try {
            // 1. Subir comprobante si hay
            if (file) {
                const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
                const fileName = `${uuidv4()}.${ext}`;
                const filePath = `${user.id}/portfolio_movements/${movement.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('comprobantes')
                    .upload(filePath, file);
                if (uploadError) throw uploadError;

                const { error: dbError } = await supabase.from('portfolio_movement_files').insert([{
                    movement_id: movement.id,
                    user_id: user.id,
                    bucket: 'comprobantes',
                    path: filePath,
                    filename: file.name || 'clipboard_image.png',
                    mime_type: file.type,
                    size: file.size,
                }]);
                if (dbError) throw dbError;
            }

            // 2. Marcar como Pagado y actualizar fecha
            const { error: updateError } = await supabase
                .from('portfolio_movements')
                .update({ status: 'Pagado', fecha: paymentDate })
                .eq('id', movement.id);
            if (updateError) throw updateError;

            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error al confirmar pago: ' + err.message);
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    const handleDownload = async (f: PortfolioMovementFile) => {
        const { data, error } = await supabase.storage.from(f.bucket).createSignedUrl(f.path, 60);
        if (error) {
            alert('No se pudo generar el enlace: ' + error.message);
            return;
        }
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    };

    const handleDeleteExisting = async (f: PortfolioMovementFile) => {
        if (!window.confirm(`¿Eliminar el comprobante "${f.filename}"?`)) return;
        await supabase.storage.from(f.bucket).remove([f.path]);
        await supabase.from('portfolio_movement_files').delete().eq('id', f.id);
        setExistingFiles(prev => prev.filter(x => x.id !== f.id));
    };

    const recipient = partner?.name || operator?.name;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 bg-teal-50/50 dark:bg-teal-900/10">
                    <div>
                        <h2 className="text-xl font-bold text-teal-900 dark:text-teal-300">Confirmar Pago</h2>
                        <p className="text-teal-700/80 dark:text-teal-400/80 text-sm font-medium mt-1">Marca como pagado y sube el comprobante</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-teal-100 dark:hover:bg-teal-900/30 flex items-center justify-center text-teal-700 dark:text-teal-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-6 overflow-y-auto flex-1 min-h-0">
                    {/* Resumen */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-700">
                        <p className="font-bold text-zinc-900 dark:text-white">{movement.concept}</p>
                        {recipient && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Para: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{recipient}</span></p>}
                        <p className="font-bold text-2xl text-zinc-900 dark:text-white mt-2">
                            {formatCurrency(Number(movement.amount), movement.currency)}
                            <span className="text-xs ml-1 text-zinc-400 font-semibold">{movement.currency}</span>
                        </p>
                    </div>

                    {/* Comprobantes existentes */}
                    {existingFiles.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Comprobantes adjuntos ({existingFiles.length})</p>
                            <div className="space-y-2">
                                {existingFiles.map(f => (
                                    <div key={f.id} className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                                        <Paperclip className="w-4 h-4 text-zinc-400 shrink-0" />
                                        <button onClick={() => handleDownload(f)} className="flex-1 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 truncate">
                                            {f.filename || 'archivo'}
                                        </button>
                                        <button onClick={() => handleDeleteExisting(f)} className="w-7 h-7 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 flex items-center justify-center" title="Eliminar">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fecha de pago */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Fecha de Pago</label>
                        <div className="relative">
                            <CalendarIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400" />
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                className="w-full pl-12 pr-5 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-zinc-200 font-medium"
                            />
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Nuevo comprobante (opcional)</label>
                        <div className={`border-2 border-dashed rounded-[24px] p-6 text-center transition-colors ${preview ? 'border-teal-500 bg-teal-50/30 dark:bg-teal-900/10' : 'border-zinc-200 dark:border-zinc-700 hover:border-teal-400 bg-zinc-50 dark:bg-zinc-800/30'}`}>
                            {preview ? (
                                <div className="relative inline-block">
                                    <img src={preview} alt="Comprobante preview" className="max-h-48 rounded-xl shadow-sm border border-zinc-100" />
                                    <button onClick={() => { setFile(null); setPreview(null); }} className="absolute -top-3 -right-3 bg-rose-500 text-white p-1.5 rounded-full shadow-md hover:bg-rose-600 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="w-12 h-12 bg-white dark:bg-zinc-800 rounded-full shadow-sm border border-zinc-100 dark:border-zinc-700 flex items-center justify-center mx-auto text-zinc-400">
                                        <ImageIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">Pega una imagen o arrastra el archivo</p>
                                        <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">o selecciona un archivo de tu equipo</p>
                                    </div>
                                    <label className="inline-block px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer shadow-sm transition-colors mt-2">
                                        <UploadCloud className="w-4 h-4 inline-block mr-2" />
                                        Examinar archivo
                                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                    <button onClick={handleConfirm} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-colors flex items-center gap-2">
                        {loading ? 'Procesando...' : <><CheckCircle2 className="w-5 h-5" /> Confirmar Pago</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
