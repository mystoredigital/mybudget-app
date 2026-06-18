import React, { useState, useEffect, useMemo } from 'react';
import { supabase, CuentaSaldo, MovimientoTipo, Movimiento } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { X, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Trash2 } from 'lucide-react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    cuentas: CuentaSaldo[];
    categorias: string[];
    defaultRate: number | null; // tasa USD_COP del día (COP por 1 USD)
    initialTipo?: MovimientoTipo;
    movToEdit?: Movimiento | null;
};

const TIPOS: { value: MovimientoTipo; label: string; icon: React.ElementType; active: string; btn: string }[] = [
    { value: 'ingreso', label: 'Ingreso', icon: ArrowDownLeft, active: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', btn: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' },
    { value: 'gasto', label: 'Gasto', icon: ArrowUpRight, active: 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', btn: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20' },
    { value: 'traslado', label: 'Traslado', icon: ArrowLeftRight, active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', btn: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20' },
];

export default function MovimientoModal({ isOpen, onClose, onSuccess, cuentas, categorias, defaultRate, initialTipo, movToEdit }: Props) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [tipo, setTipo] = useState<MovimientoTipo>('gasto');
    const [cuentaId, setCuentaId] = useState('');
    const [cuentaDestinoId, setCuentaDestinoId] = useState('');
    const [concepto, setConcepto] = useState('');
    const [categoria, setCategoria] = useState('');
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [tasa, setTasa] = useState('');
    const [comision, setComision] = useState('');

    const activas = useMemo(() => cuentas.filter(c => !c.archivada), [cuentas]);

    useEffect(() => {
        if (!isOpen) return;
        if (movToEdit) {
            setTipo(movToEdit.tipo);
            setCuentaId(movToEdit.cuenta_id || '');
            setCuentaDestinoId(movToEdit.cuenta_destino_id || '');
            setConcepto(movToEdit.concepto || '');
            setCategoria(movToEdit.categoria || '');
            setMonto(String(movToEdit.monto));
            setFecha(movToEdit.fecha);
            setTasa(movToEdit.tasa_usada ? String(movToEdit.tasa_usada) : (defaultRate ? String(defaultRate) : ''));
            setComision(movToEdit.comision ? String(movToEdit.comision) : '');
        } else {
            setTipo(initialTipo || 'gasto');
            setCuentaId(activas[0]?.id || '');
            setCuentaDestinoId('');
            setConcepto('');
            setCategoria('');
            setMonto('');
            setFecha(new Date().toISOString().split('T')[0]);
            setTasa(defaultRate ? String(defaultRate) : '');
            setComision('');
        }
    }, [isOpen, movToEdit]); // eslint-disable-line react-hooks/exhaustive-deps

    const cuentaOrigen = activas.find(c => c.id === cuentaId);
    const cuentaDestino = activas.find(c => c.id === cuentaDestinoId);

    // ¿El traslado cruza monedas?
    const cruzaMoneda = tipo === 'traslado' && cuentaOrigen && cuentaDestino && cuentaOrigen.moneda !== cuentaDestino.moneda;

    // Monto que llega al destino: se descuenta la comisión (en moneda origen)
    // y luego se convierte si las monedas difieren.
    const montoDestino = useMemo(() => {
        if (tipo !== 'traslado' || !cuentaOrigen || !cuentaDestino) return null;
        const neto = Math.max(0, (Number(monto) || 0) - (Number(comision) || 0));
        if (!cruzaMoneda) return neto;
        const t = Number(tasa) || 0;
        if (!t) return null;
        // tasa = COP por 1 USD
        if (cuentaOrigen.moneda === 'USD' && cuentaDestino.moneda === 'COP') return neto * t;
        if (cuentaOrigen.moneda === 'COP' && cuentaDestino.moneda === 'USD') return neto / t;
        return neto;
    }, [tipo, cruzaMoneda, cuentaOrigen, cuentaDestino, monto, tasa, comision]);

    if (!isOpen) return null;

    const TIPO_LABEL: Record<MovimientoTipo, string> = { ingreso: 'Ingreso', gasto: 'Gasto', traslado: 'Traslado' };

    const handleSubmit = async () => {
        if (!user) return;
        if (!cuentaId) { alert('Elige una cuenta'); return; }
        if (!(Number(monto) > 0)) { alert('El monto debe ser mayor a 0'); return; }
        if (tipo === 'traslado') {
            if (!cuentaDestinoId) { alert('Elige la cuenta destino'); return; }
            if (cuentaDestinoId === cuentaId) { alert('Origen y destino no pueden ser la misma cuenta'); return; }
            if (cruzaMoneda && !(Number(tasa) > 0)) { alert('Ingresa la tasa de cambio usada'); return; }
        }

        setLoading(true);
        try {
            // Concepto opcional: si va vacío, una etiqueta sensata.
            const conceptoFinal = concepto.trim() ||
                (tipo === 'gasto' && categoria ? categoria : TIPO_LABEL[tipo]);
            // moneda del movimiento = moneda de la cuenta de origen (o destino en ingreso)
            const monedaMov = cuentaOrigen!.moneda;
            const payload = {
                user_id: user.id,
                tipo,
                concepto: conceptoFinal,
                fecha,
                monto: Number(monto),
                moneda: monedaMov,
                cuenta_id: cuentaId,
                cuenta_destino_id: tipo === 'traslado' ? cuentaDestinoId : null,
                tasa_usada: tipo === 'traslado' && cruzaMoneda ? Number(tasa) : null,
                monto_destino: tipo === 'traslado' ? montoDestino : null,
                comision: tipo === 'traslado' ? (Number(comision) || 0) : 0,
                categoria: tipo === 'gasto' ? (categoria || null) : null,
                status: 'Pagado',
            };
            const { error } = movToEdit
                ? await supabase.from('movimientos').update(payload).eq('id', movToEdit.id)
                : await supabase.from('movimientos').insert([payload]);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error registrando el movimiento: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!movToEdit) return;
        if (!window.confirm('¿Borrar este movimiento? El saldo se recalcula.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('movimientos').delete().eq('id', movToEdit.id);
            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            alert('Error borrando el movimiento: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const activeBtn = TIPOS.find(t => t.value === tipo)!.btn;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-24 md:pb-4 overflow-y-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[88dvh] md:max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{movToEdit ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5 overflow-y-auto">
                    {/* Tipo */}
                    <div className="grid grid-cols-3 gap-2">
                        {TIPOS.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => setTipo(t.value)}
                                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-colors ${tipo === t.value ? t.active : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'}`}
                            >
                                <t.icon className="w-5 h-5" />
                                <span className="text-[11px] font-bold">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Cuenta origen / destino-de-ingreso */}
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            {tipo === 'ingreso' ? 'Cuenta que recibe' : tipo === 'gasto' ? 'Cuenta de la que sale' : 'Cuenta origen'}
                        </label>
                        <select
                            value={cuentaId}
                            onChange={(e) => setCuentaId(e.target.value)}
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                        >
                            {activas.length === 0 && <option value="">Crea una cuenta primero</option>}
                            {activas.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                        </select>
                    </div>

                    {tipo === 'traslado' && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Cuenta destino</label>
                            <select
                                value={cuentaDestinoId}
                                onChange={(e) => setCuentaDestinoId(e.target.value)}
                                className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                            >
                                <option value="">Selecciona...</option>
                                {activas.filter(c => c.id !== cuentaId).map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Concepto <span className="text-zinc-400 font-normal">(opcional)</span></label>
                        <input
                            value={concepto}
                            onChange={(e) => setConcepto(e.target.value)}
                            placeholder={tipo === 'traslado' ? 'Ej. Paso de wallet a Bancolombia' : tipo === 'ingreso' ? 'Ej. Comisión del mes' : 'Ej. Mercado'}
                            className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                        />
                    </div>

                    {tipo === 'gasto' && categorias.length > 0 && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Categoría (opcional)</label>
                            <select
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                            >
                                <option value="">Sin categoría</option>
                                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                                Monto {cuentaOrigen ? `(${cuentaOrigen.moneda})` : ''}
                            </label>
                            <input
                                type="number"
                                value={monto}
                                onChange={(e) => setMonto(e.target.value)}
                                className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Fecha</label>
                            <input
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none text-zinc-800 dark:text-white font-medium"
                            />
                        </div>
                    </div>

                    {/* Comisión + cambio en traslados */}
                    {tipo === 'traslado' && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                                    Comisión / fee {cuentaOrigen ? `(${cuentaOrigen.moneda})` : ''} <span className="font-normal text-blue-500">— si pasas 1000 y llegan menos</span>
                                </label>
                                <input
                                    type="number"
                                    value={comision}
                                    onChange={(e) => setComision(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-zinc-800 dark:text-white font-medium"
                                />
                            </div>
                            {cruzaMoneda && (
                                <div>
                                    <label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                                        Tasa usada ({cuentaOrigen!.moneda} → {cuentaDestino!.moneda}, COP por 1 USD — lo que te pagan)
                                    </label>
                                    <input
                                        type="number"
                                        value={tasa}
                                        onChange={(e) => setTasa(e.target.value)}
                                        placeholder={defaultRate ? `Sugerida: ${defaultRate}` : 'Ingresa la tasa'}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-zinc-800 dark:text-white font-medium"
                                    />
                                </div>
                            )}
                            {montoDestino != null && cuentaDestino && (
                                <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold">
                                    Llega a {cuentaDestino.nombre}: {formatCurrency(montoDestino, cuentaDestino.moneda)}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 p-6 px-8 flex items-center gap-3">
                    {movToEdit && (
                        <button onClick={handleDelete} disabled={loading} className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50" title="Borrar movimiento">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} disabled={loading || activas.length === 0} className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-md disabled:opacity-50 transition-colors ${activeBtn}`}>
                        {loading ? 'Guardando...' : (movToEdit ? 'Guardar' : 'Registrar')}
                    </button>
                </div>
            </div>
        </div>
    );
}
