import json, urllib.request, urllib.error

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
SUPA = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
TG = {'telegramApi': {'id': 'SNuF3zPIkSDlK9RO', 'name': 'Telegram account'}}

# Parser + insert SIN IA (gratis, sin cuotas). Lee text o caption (fotos).
procesar_code = r"""
const SR = '__SR__';
const SUPA = '__SUPA__';
const UID = '__UID__';
const m = $('Recibir Telegram').first().json.message;
const chatId = m.chat.id;
const text = (m.text || m.caption || '').trim();
const cuentas = $('Cuentas').all().map(i => i.json);
const reply = (msg) => [{ json: { chatId, message: msg } }];
const listaCuentas = () => cuentas.map(c => `• ${c.nombre} (${c.moneda})`).join('\n') || '(no tienes cuentas)';

if (!text) {
  return reply('📸 Recibí tu mensaje pero sin texto. Escríbeme el movimiento, por ej.:\n_gasto 50 mil mercado Bancolombia_');
}
const low = text.toLowerCase();

// tipo
let tipo = 'gasto';
if (/\b(ingreso|ingres|entr[oó]|recib|consign|abono|me pagaron)/.test(low)) tipo = 'ingreso';

// monto (formato Colombia: punto = miles, coma = decimal; soporta mil/k/millones)
const num = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
let monto = NaN;
let mMill = low.match(/([\d.,]+)\s*(millones|mill[oó]n)/);
let mMil = low.match(/([\d.,]+)\s*(mil|k)\b/);
if (mMill) monto = num(mMill[1]) * 1000000;
else if (mMil) monto = num(mMil[1]) * 1000;
else { const mN = low.match(/\$?\s*([\d][\d.,]*)/); if (mN) monto = num(mN[1]); }
if (!(monto > 0)) {
  return reply('🤔 No vi el monto. Ej:\n_gasto 50 mil mercado Bancolombia_\no _ingreso 200000 comisión wallet usdt_');
}

// cuenta: la que aparezca mencionada
let cuenta = cuentas.find(c => low.includes(c.nombre.toLowerCase()));
if (!cuenta) {
  return reply('🏦 ¿De qué cuenta? Menciona una de las tuyas:\n' + listaCuentas());
}

// concepto: limpiar tipo, montos, nombre de cuenta y conectores
let concepto = text
  .replace(new RegExp(cuenta.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '')
  .replace(/\b(gasto|ingreso|gast[ée]|pagu[ée]|compr[ée]|consign[ée]|recib[íi])\b/ig, '')
  .replace(/\$?\s*[\d.,]+\s*(millones|mill[oó]n|mil|k)?/ig, '')
  .replace(/\b(en|de|del|con|por|a la|al|para|la|el)\b/ig, ' ')
  .replace(/\s+/g, ' ').trim();
if (!concepto) concepto = tipo === 'gasto' ? 'Gasto' : 'Ingreso';

const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const payload = { user_id: UID, tipo, concepto, monto, moneda: cuenta.moneda, cuenta_id: cuenta.id, status: 'Pagado', fecha };
const H = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };
await this.helpers.httpRequest({ method: 'POST', url: SUPA + '/movimientos', headers: { ...H, Prefer: 'return=minimal' }, body: payload, json: true });
const saldoRes = await this.helpers.httpRequest({ method: 'GET', url: SUPA + '/cuentas_saldos?select=saldo_actual&id=eq.' + cuenta.id, headers: H, json: true });
const saldo = Array.isArray(saldoRes) && saldoRes[0] ? Number(saldoRes[0].saldo_actual) : null;

const fmt = (n, c) => new Intl.NumberFormat(c === 'COP' ? 'es-CO' : 'en-US', { style: 'currency', currency: c, minimumFractionDigits: c === 'COP' ? 0 : 2 }).format(n);
const emoji = tipo === 'gasto' ? '💸' : '💰';
let msg = `${emoji} *${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado*\n\n*${concepto}*\n${fmt(monto, cuenta.moneda)} · ${cuenta.nombre}`;
if (saldo != null) msg += `\n\n💼 Nuevo saldo ${cuenta.nombre}: *${fmt(saldo, cuenta.moneda)}*`;
return reply(msg);
""".strip().replace('__SR__', SR).replace('__SUPA__', SUPA).replace('__UID__', UID)

wf = {
    'name': 'MyBudget - Registrar movimiento por Telegram',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'trg', 'name': 'Recibir Telegram', 'type': 'n8n-nodes-base.telegramTrigger', 'typeVersion': 1.1,
         'position': [112, 304], 'parameters': {'updates': ['message']}, 'credentials': TG},
        {'id': 'cue', 'name': 'Cuentas', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.4,
         'position': [336, 304], 'parameters': {
             'url': SUPA + '/cuentas?select=id,nombre,moneda&archivada=eq.false',
             'sendHeaders': True,
             'headerParameters': {'parameters': [{'name': 'apikey', 'value': SR}, {'name': 'Authorization', 'value': 'Bearer ' + SR}]},
             'options': {}}},
        {'id': 'prc', 'name': 'Procesar e insertar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [560, 304], 'parameters': {'jsCode': procesar_code}},
        {'id': 'rep', 'name': 'Responder Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [784, 304], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Recibir Telegram': {'main': [[{'node': 'Cuentas', 'type': 'main', 'index': 0}]]},
        'Cuentas': {'main': [[{'node': 'Procesar e insertar', 'type': 'main', 'index': 0}]]},
        'Procesar e insertar': {'main': [[{'node': 'Responder Telegram', 'type': 'main', 'index': 0}]]},
    },
}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + '/api/v1' + path, data=data, method=method,
        headers={'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

_, lst = api('GET', '/workflows')
existing = {w['name']: w['id'] for w in (lst.get('data', []) if isinstance(lst, dict) else [])}
wid = existing.get(wf['name'])
if wid:
    st, res = api('PUT', f'/workflows/{wid}', wf); print(f'ACTUALIZADO -> {wid} ({st})')
else:
    st, res = api('POST', '/workflows', wf); wid = res.get('id') if isinstance(res, dict) else None; print(f'CREADO -> {wid} ({st})')
    if not wid: print(res)
if wid:
    ast, _ = api('POST', f'/workflows/{wid}/activate'); print(f'activar -> {ast}')
