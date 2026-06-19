import React, { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, UploadCloud, CheckCircle2, Image as ImageIcon, Calendar as CalendarIcon, Paperclip, Trash2, RotateCcw } from 'lucide-react';
import { supabase, PortfolioPeriod } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

type Props = {
    period: PortfolioPeriod | null;
    leDebo: number;            // monto sugerido (lo que se le debe)
    socioName?: string | null;
    onClose: () => void;
    onSuccess: () => void;
};

export default function PagoSocioModal({ period, leDebo, socioName, onClose, onSuccess }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
    const [monto, setMonto] = useState('0');
    const isSubmitting = useRef(false);

    const cur = period?.currency || 'USD';
    const yaPagado = period?.pago_socio_estado === 'Pagado';

    useEffect(() => {
        if (!period) return;
        setFile(null);
        setPreview(null);
        setFecha(period.pago_socio_fecha || new Date().toISOString().slice(0, 10));
        setMonto(String(period.pago_socio_monto ?? (leDebo > 0 ? leDebo.toFixed(2) : '0')));
        isSubmitting.current = false;
    }, [period, leDebo]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!period) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) { setFile(blob); setPreview(URL.createObjectURL(blob)); }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [period]);

    if (!period) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
        }
    };

    const handleConfirm = async () => {
        if (!period || !user || isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);
        try {
            let comprobantePath = period.pago_socio_comprobante_path;

            if (file) {
                const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'png';
                const fileName = `${uuidv4()}.${ext}`;
                const filePath = `${user.id}/portfolio_periods/${period.id}/${fileName}`;
                const { error: uploadError } = await supabase.storage.from('comprobantes').upload(filePath, file);
                if (uploadError) throw uploadError;
                comprobantePath = filePath;
            }

            const { error } = await supabase
                .from('portfolio_periods')
                .update({
                    pago_socio_estado: 'Pagado',
                    pago_socio_fecha: fecha,
                    pago_socio_monto: Number(monto) || 0,
                    pago_socio_comprobante_path: comprobantePath,
                })
                .eq('id', period.id);
            if (error) throw error;

            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error al registrar el pago: ' + err.message);
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    const handleReabrir = async () => {
        if (!period || !user) return;
        if (!window.confirm('¿Marcar de nuevo como pendiente? Se conserva el comprobante.')) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('portfolio_periods')
                .update({ pago_socio_estado: 'Pendiente' })
                .eq('id', period.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!period.pago_socio_comprobante_path) return;
        const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(period.pago_socio_comprobante_path, 60);
        if (error) { alert('No se pudo generar el enlace: ' + error.message); return; }
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    };

    const handleDeleteComprobante = async () => {
        if (!period.pago_socio_comprobante_path) return;
        if (!window.confirm('¿Eliminar el comprobante adjunto?')) return;
        setLoading(true);
        try {
            await supabase.storage.from('comprobantes').remove([period.pago_socio_comprobante_path]);
            const { error } = await supabase.from('portfolio_periods').update({ pago_socio_comprobante_path: null }).eq('id', period.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-24 md:pb-4 overflow-y-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[88dvh] md:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className={`flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 ${yaPagado ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : 'bg-orange-50/60 dark:bg-orange-900/10'}`}>
                    <div>
                        <h2 className={`text-xl font-bold ${yaPagado ? 'text-emerald-900 dark:text-emerald-300' : 'text-orange-900 dark:text-orange-300'}`}>Pago al socio</h2>
                        <p className={`text-sm font-medium mt-1 ${yaPagado ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-orange-700/80 dark:text-orange-400/80'}`}>
                            {yaPagado ? 'Ya registrado — puedes editarlo' : 'Marca cuando ya le pagaste y sube el comprobante'}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-6 overflow-y-auto flex-1 min-h-0">
                    {/* Resumen */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-700">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Le debo a {socioName ? <span className="font-semibold text-zinc-700 dark:text-zinc-300">{socioName}</span> : 'mi socio'}</p>
                        <p className="font-bold text-2xl text-zinc-900 dark:text-white mt-1">
                            {formatCurrency(leDebo, cur)}
                            <span className="text-xs ml-1 text-zinc-400 font-semibold">{cur}</span>
                        </p>
                    </div>

                    {/* Monto pagado + fecha */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Monto pagado</label>
                            <input
                                type="number"
                                value={monto}
                                onChange={(e) => setMonto(e.target.value)}
                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none text-zinc-800 dark:text-white font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Fecha de pago</label>
                            <div className="relative">
                                <CalendarIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-orange-500" />
                                <input
                                    type="date"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    className="w-full pl-10 pr-3 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none text-zinc-800 dark:text-zinc-200 font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Comprobante existente */}
                    {period.pago_socio_comprobante_path && !file && (
                        <div className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                            <Paperclip className="w-4 h-4 text-zinc-400 shrink-0" />
                            <button onClick={handleDownload} className="flex-1 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400 truncate">
                                Ver comprobante adjunto
                            </button>
                            <button onClick={handleDeleteComprobante} className="w-7 h-7 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 flex items-center justify-center" title="Eliminar">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Drop zone */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            {period.pago_socio_comprobante_path ? 'Reemplazar comprobante (opcional)' : 'Comprobante (opcional)'}
                        </label>
                        <div className={`border-2 border-dashed rounded-[24px] p-6 text-center transition-colors ${preview ? 'border-orange-500 bg-orange-50/30 dark:bg-orange-900/10' : 'border-zinc-200 dark:border-zinc-700 hover:border-orange-400 bg-zinc-50 dark:bg-zinc-800/30'}`}>
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

                <div className="bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex items-center gap-3 shrink-0">
                    {yaPagado && (
                        <button onClick={handleReabrir} disabled={loading} className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-bold" title="Marcar como pendiente">
                            <RotateCcw className="w-4 h-4" /> Reabrir
                        </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                    <button onClick={handleConfirm} disabled={loading} className="px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-colors flex items-center gap-2">
                        {loading ? 'Guardando...' : <><CheckCircle2 className="w-5 h-5" /> {yaPagado ? 'Guardar cambios' : 'Marcar como pagado'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
