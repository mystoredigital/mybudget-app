import React, { useEffect, useMemo, useState } from 'react';
import {
    ClipboardList, Plus, Minus, Trash2, ChevronLeft, ChevronRight,
    Calendar as CalendarIcon, Settings2, ClipboardPaste, Save, Check,
} from 'lucide-react';
import { supabase, ReporteConcepto, ReporteItem, Currency } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { parseReporte } from '../lib/reporteParser';

const today = () => new Date().toISOString().slice(0, 10);
const fmtFecha = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const shiftDay = (iso: string, days: number) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const DEFAULT_CONCEPTOS: { nombre: string; signo: -1 | 1 }[] = [
    { nombre: 'Compensación RDS', signo: -1 },
    { nombre: 'Saldo valles de lirio', signo: 1 },
    { nombre: 'Saldo valles Forus', signo: 1 },
    { nombre: 'Saldo credil', signo: 1 },
    { nombre: 'Préstamos', signo: 1 },
    { nombre: 'Pendientes por ingresar', signo: 1 },
    { nombre: 'Saldo doradobet', signo: 1 },
    { nombre: 'Bybit', signo: 1 },
];

type HistRow = { id: string; fecha: string; moneda: Currency; total: number };

export default function ReporteDiario() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [conceptos, setConceptos] = useState<ReporteConcepto[]>([]);
    const [fecha, setFecha] = useState(today());
    const [moneda, setMoneda] = useState<Currency>('USD');
    const [montos, setMontos] = useState<Record<string, string>>({});
    const [reporteId, setReporteId] = useState<string | null>(null);
    const [historial, setHistorial] = useState<HistRow[]>([]);
    const [rawText, setRawText] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    useEffect(() => { if (user) init(); }, [user]); // eslint-disable-line
    useEffect(() => { if (user && conceptos.length) loadReporte(fecha); }, [fecha, conceptos.length]); // eslint-disable-line

    async function init() {
        if (!user) return;
        setLoading(true);
        let { data: cs } = await supabase.from('reporte_conceptos').select('*').eq('user_id', user.id).order('orden');
        if (!cs || cs.length === 0) {
            await supabase.from('reporte_conceptos').insert(
                DEFAULT_CONCEPTOS.map((c, i) => ({ user_id: user.id, nombre: c.nombre, signo: c.signo, orden: i }))
            );
            const r = await supabase.from('reporte_conceptos').select('*').eq('user_id', user.id).order('orden');
            cs = r.data || [];
        }
        setConceptos(cs as ReporteConcepto[]);
        await loadHistorial();
        setLoading(false);
    }

    async function loadHistorial() {
        if (!user) return;
        const { data: reps } = await supabase.from('reportes_diarios').select('id, fecha, moneda').eq('user_id', user.id).order('fecha', { ascending: false }).limit(60);
        const list = (reps as { id: string; fecha: string; moneda: Currency }[]) || [];
        if (list.length === 0) { setHistorial([]); return; }
        const { data: items } = await supabase.from('reporte_items').select('reporte_id, signo, monto').in('reporte_id', list.map(r => r.id));
        const totals = new Map<string, number>();
        for (const it of (items as { reporte_id: string; signo: number; monto: number }[]) || []) {
            totals.set(it.reporte_id, (totals.get(it.reporte_id) || 0) + it.signo * Number(it.monto));
        }
        setHistorial(list.map(r => ({ id: r.id, fecha: r.fecha, moneda: r.moneda, total: totals.get(r.id) || 0 })));
    }

    async function loadReporte(f: string) {
        if (!user) return;
        const { data: rep } = await supabase.from('reportes_diarios').select('*').eq('user_id', user.id).eq('fecha', f).maybeSingle();
        if (rep) {
            setReporteId(rep.id);
            setMoneda(rep.moneda);
            const { data: items } = await supabase.from('reporte_items').select('*').eq('reporte_id', rep.id);
            const m: Record<string, string> = {};
            for (const it of (items as ReporteItem[]) || []) m[it.nombre] = String(it.monto);
            setMontos(m);
        } else {
            setReporteId(null);
            setMontos({});
        }
    }

    const total = useMemo(() => {
        return conceptos.reduce((acc, c) => {
            const v = Number(montos[c.nombre]);
            return acc + (isNaN(v) ? 0 : c.signo * v);
        }, 0);
    }, [conceptos, montos]);

    const setMonto = (nombre: string, v: string) => setMontos(prev => ({ ...prev, [nombre]: v }));

    async function handleSave() {
        if (!user) return;
        setSaving(true);
        try {
            let rid = reporteId;
            if (rid) {
                await supabase.from('reportes_diarios').update({ moneda, raw_text: rawText || null, updated_at: new Date().toISOString() }).eq('id', rid);
                await supabase.from('reporte_items').delete().eq('reporte_id', rid);
            } else {
                const { data, error } = await supabase.from('reportes_diarios')
                    .insert([{ user_id: user.id, fecha, moneda, raw_text: rawText || null }])
                    .select().single();
                if (error) throw error;
                rid = data.id;
                setReporteId(rid);
            }
            const rows = conceptos.map((c, i) => ({
                reporte_id: rid, user_id: user.id, nombre: c.nombre, signo: c.signo,
                monto: Number(montos[c.nombre]) || 0, orden: i,
            }));
            const { error: ie } = await supabase.from('reporte_items').insert(rows);
            if (ie) throw ie;
            await loadHistorial();
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 1800);
        } catch (err: any) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    }

    function handleAnalizar() {
        const parsed = parseReporte(rawText, conceptos);
        if (Object.keys(parsed).length === 0) { alert('No reconocí ningún concepto. Revisa que el texto traiga líneas tipo "Saldo X: monto".'); return; }
        setMontos(prev => {
            const next = { ...prev };
            for (const [nombre, monto] of Object.entries(parsed)) next[nombre] = String(monto);
            return next;
        });
        const faltan = conceptos.filter(c => !(c.nombre in parsed)).map(c => c.nombre);
        if (faltan.length) alert(`Listo. No encontré: ${faltan.join(', ')}. Complétalos a mano si aplica.`);
    }

    async function deleteReporte(id: string) {
        if (!window.confirm('¿Borrar este reporte del día?')) return;
        await supabase.from('reportes_diarios').delete().eq('id', id);
        if (id === reporteId) { setReporteId(null); setMontos({}); }
        loadHistorial();
    }

    // ── Config de conceptos ──
    async function addConcepto() {
        if (!user) return;
        const nombre = window.prompt('Nombre del concepto (ej. Saldo Stake)');
        if (!nombre || !nombre.trim()) return;
        const { data, error } = await supabase.from('reporte_conceptos')
            .insert([{ user_id: user.id, nombre: nombre.trim(), signo: 1, orden: conceptos.length }])
            .select().single();
        if (error) { alert(error.message.includes('duplicate') ? 'Ya existe ese concepto.' : error.message); return; }
        setConceptos(prev => [...prev, data as ReporteConcepto]);
    }
    async function toggleSigno(c: ReporteConcepto) {
        const nuevo = c.signo === 1 ? -1 : 1;
        await supabase.from('reporte_conceptos').update({ signo: nuevo }).eq('id', c.id);
        setConceptos(prev => prev.map(x => x.id === c.id ? { ...x, signo: nuevo } : x));
    }
    async function renameConcepto(c: ReporteConcepto) {
        const nombre = window.prompt('Nuevo nombre', c.nombre);
        if (!nombre || !nombre.trim() || nombre.trim() === c.nombre) return;
        const { error } = await supabase.from('reporte_conceptos').update({ nombre: nombre.trim() }).eq('id', c.id);
        if (error) { alert(error.message.includes('duplicate') ? 'Ya existe ese concepto.' : error.message); return; }
        setConceptos(prev => prev.map(x => x.id === c.id ? { ...x, nombre: nombre.trim() } : x));
    }
    async function deleteConcepto(c: ReporteConcepto) {
        if (!window.confirm(`¿Quitar "${c.nombre}" de la lista? Los reportes ya guardados no se tocan.`)) return;
        await supabase.from('reporte_conceptos').delete().eq('id', c.id);
        setConceptos(prev => prev.filter(x => x.id !== c.id));
    }

    if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Cargando...</p>;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-zinc-900 dark:bg-zinc-800 p-3 rounded-[20px] shadow-sm flex items-center justify-center">
                    <ClipboardList className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                    <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 leading-tight dark:text-white">Reporte diario</h1>
                    <p className="text-zinc-500 font-medium mt-1 dark:text-zinc-400">Tus saldos del día, sumados en un total.</p>
                </div>
            </div>

            {/* Total + fecha */}
            <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-[28px] p-6 text-white shadow-lg shadow-orange-500/20">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => setFecha(shiftDay(fecha, -1))} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                        <div className="relative">
                            <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none" />
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-white/15 rounded-full pl-9 pr-3 py-2 text-sm font-bold text-white outline-none [color-scheme:dark]" />
                        </div>
                        <button onClick={() => setFecha(shiftDay(fecha, 1))} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"><ChevronRight className="w-5 h-5" /></button>
                        {fecha !== today() && <button onClick={() => setFecha(today())} className="text-xs font-bold bg-white/15 hover:bg-white/25 rounded-full px-3 py-2 transition-colors">Hoy</button>}
                    </div>
                    <div className="flex gap-1.5">
                        {(['USD', 'COP'] as Currency[]).map(m => (
                            <button key={m} onClick={() => setMoneda(m)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${moneda === m ? 'bg-white text-orange-600' : 'bg-white/15 text-white hover:bg-white/25'}`}>{m}</button>
                        ))}
                    </div>
                </div>
                <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider mt-4">Total del {fmtFecha(fecha)}</p>
                <p className="text-4xl font-extrabold mt-1 tabular-nums">{formatCurrency(total, moneda)}</p>
                {!reporteId && <p className="text-xs text-white/70 font-medium mt-1">Sin guardar — completa y dale guardar.</p>}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowImport(v => !v)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <ClipboardPaste className="w-4 h-4" /> Pegar mensaje
                </button>
                <button onClick={() => setShowConfig(v => !v)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <Settings2 className="w-4 h-4" /> Conceptos
                </button>
                <div className="flex-1" />
                <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm text-white shadow-md transition-colors disabled:opacity-50 ${justSaved ? 'bg-emerald-600' : 'bg-teal-600 hover:bg-teal-500 shadow-teal-500/20'}`}>
                    {justSaved ? <><Check className="w-4 h-4" /> Guardado</> : <><Save className="w-4 h-4" /> {saving ? 'Guardando...' : (reporteId ? 'Actualizar día' : 'Guardar día')}</>}
                </button>
            </div>

            {/* Importar */}
            {showImport && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 space-y-3">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pega el mensaje de tu asistente y lo reparto en los conceptos:</p>
                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} rows={8} placeholder={'Buenas tardes...\nCompensación RDS:95.653,08\nSaldo valles de lirio:83.209,15$\n...'} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:text-white font-mono" />
                    <div className="flex justify-end">
                        <button onClick={handleAnalizar} className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-orange-500 hover:bg-orange-600 transition-colors">Analizar y rellenar</button>
                    </div>
                </div>
            )}

            {/* Config conceptos */}
            {showConfig && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Conceptos fijos (signo + / −)</p>
                        <button onClick={addConcepto} className="flex items-center gap-1.5 text-sm font-bold text-teal-600 hover:text-teal-500"><Plus className="w-4 h-4" /> Agregar</button>
                    </div>
                    {conceptos.map(c => (
                        <div key={c.id} className="flex items-center gap-2 py-1.5">
                            <button onClick={() => toggleSigno(c)} title="Cambiar signo" className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${c.signo === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                                {c.signo === 1 ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                            </button>
                            <button onClick={() => renameConcepto(c)} className="flex-1 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:text-teal-600 truncate">{c.nombre}</button>
                            <button onClick={() => deleteConcepto(c)} className="w-7 h-7 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 flex items-center justify-center shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                </div>
            )}

            {/* Editor de montos */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {conceptos.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${c.signo === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                            {c.signo === 1 ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 min-w-0 truncate">{c.nombre}</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            value={montos[c.nombre] ?? ''}
                            onChange={e => setMonto(c.nombre, e.target.value)}
                            placeholder="0"
                            className="w-32 sm:w-40 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-orange-500 dark:text-white tabular-nums"
                        />
                    </div>
                ))}
                <div className="flex items-center justify-between px-5 py-4 bg-zinc-50/60 dark:bg-zinc-800/30">
                    <span className="font-bold text-zinc-900 dark:text-white">Total</span>
                    <span className="text-xl font-extrabold text-orange-600 dark:text-orange-400 tabular-nums">{formatCurrency(total, moneda)}</span>
                </div>
            </div>

            {/* Histórico */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="font-bold text-zinc-900 dark:text-white">Histórico</h2>
                </div>
                {historial.length === 0 ? (
                    <p className="px-5 py-8 text-center text-zinc-400 text-sm">Aún no has guardado reportes.</p>
                ) : (
                    <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                        {historial.map(h => (
                            <div key={h.id} className={`flex items-center gap-3 px-5 py-3 group cursor-pointer transition-colors ${h.fecha === fecha ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`} onClick={() => setFecha(h.fecha)}>
                                <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{fmtFecha(h.fecha)}</span>
                                <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{formatCurrency(h.total, h.moneda)}</span>
                                <button onClick={(e) => { e.stopPropagation(); deleteReporte(h.id); }} className="w-7 h-7 rounded-lg text-zinc-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
