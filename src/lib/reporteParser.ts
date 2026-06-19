// Parser del mensaje diario del asistente → montos por concepto.
// Mismo criterio que usa el flujo de n8n (replicado allí en JS).

const STOPWORDS = new Set(['saldo', 'saldos', 'valles', 'valle', 'de', 'del', 'la', 'el', 'los', 'por', 'compensacion', 'compensación', 'y']);

export function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // quita acentos
        .trim();
}

// "95.653,08" → 95653.08 ; "83.209,15$" → 83209.15 ; "90$" → 90 ; "0" → 0
export function parseMonto(raw: string): number | null {
    if (!raw) return null;
    let s = raw.replace(/[^\d.,-]/g, '').trim(); // deja dígitos . , -
    if (!s || s === '-' || s === '.' || s === ',') return null;
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
        // formato europeo: . miles, , decimal
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
        s = s.replace(',', '.');
    } else if (hasDot) {
        // solo puntos: si cada grupo tras el 1° tiene 3 dígitos, son separadores
        // de miles ("14.600" → 14600, "1.234.567" → 1234567); si no, es decimal.
        const parts = s.split('.');
        if (parts.length > 1 && parts.slice(1).every(p => p.length === 3)) {
            s = parts.join('');
        }
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// Palabras distintivas de un concepto (sin stopwords)
function keywords(nombre: string): string[] {
    return normalize(nombre)
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

export type ConceptoMatch = { nombre: string; monto: number };

// Devuelve { nombreConcepto: monto } para los conceptos encontrados en el texto.
export function parseReporte(text: string, conceptos: { nombre: string }[]): Record<string, number> {
    const result: Record<string, number> = {};
    if (!text) return result;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const c of conceptos) {
        const kws = keywords(c.nombre);
        if (kws.length === 0) continue;
        // busca la línea que contenga alguna palabra distintiva del concepto
        const line = lines.find(l => {
            const nl = normalize(l);
            return kws.some(k => nl.includes(k));
        });
        if (!line) continue;
        // el valor suele ir después de ':'; si no hay ':', toma el texto completo
        const after = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
        const monto = parseMonto(after);
        if (monto != null) result[c.nombre] = monto;
    }
    return result;
}
