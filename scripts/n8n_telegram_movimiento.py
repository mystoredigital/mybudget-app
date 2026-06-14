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
OR_CRED = {'openRouterApi': {'id': 'GlqsWgvvC13mpS4n', 'name': 'OpenRouter account'}}

# ---- Nodo 1 (Code): preparar request (foto->visión o texto) + traer cuentas ----
preparar_code = r"""
const SR = '__SR__'; const SUPA = '__SUPA__';
const item = $input.first();
const msg = item.json.message || {};
const chatId = msg.chat && msg.chat.id;
const caption = (msg.caption || msg.text || '').trim();
const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;

const H = { apikey: SR, Authorization: 'Bearer ' + SR };
const cuentas = await this.helpers.httpRequest({ method: 'GET', url: SUPA + '/cuentas?select=id,nombre,moneda&archivada=eq.false', headers: H, json: true });
const nombres = (cuentas || []).map(c => `${c.nombre} (${c.moneda})`).join(', ');

const system = `Eres un asistente que extrae UN movimiento financiero y devuelve SOLO JSON válido con las claves:
{"tipo":"gasto"|"ingreso","concepto":"texto corto","cuenta":"el nombre que mejor coincida de esta lista o null","fecha":"YYYY-MM-DD o null","total_cop":number|null,"total_usd":number|null,"monto":number}.
Lista de cuentas: [${nombres}].
Reglas:
- Si el recibo/imagen muestra el total en VARIAS monedas, devuelve cada total por separado: total_cop (pesos colombianos COP/$) y total_usd (dólares USD/US$). Si solo aparece una, deja la otra en null.
- "monto" = el total más visible (fallback). Números sin símbolos ni separadores de miles.
- Interpreta "50 mil"=50000, "50k"=50000, "1.5 millones"=1500000.
- Para texto sin recibo, pon el valor en monto y deduce la moneda si la mencionan.
- El comercio o descripción va en concepto. Si no determinas el monto, monto:0.`;

let userContent;
if (hasPhoto && item.binary) {
  const key = Object.keys(item.binary)[0];
  const buf = await this.helpers.getBinaryDataBuffer(0, key);
  const dataUri = 'data:image/jpeg;base64,' + buf.toString('base64');
  userContent = [
    { type: 'text', text: 'Lee este recibo y extrae el movimiento. Pista del usuario: ' + (caption || '(ninguna)') },
    { type: 'image_url', image_url: { url: dataUri } },
  ];
} else {
  userContent = caption || '(sin texto)';
}

const body = {
  model: 'openai/gpt-4o-mini',
  max_tokens: 500,
  temperature: 0,
  response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
};
return [{ json: { requestBody: JSON.stringify(body), chatId, rawText: caption, hasPhoto, cuentas } }];
""".strip().replace('__SR__', SR).replace('__SUPA__', SUPA)

# ---- Nodo 3 (Code): parsear IA, resolver cuenta, insertar, responder ----
insertar_code = r"""
const SR = '__SR__'; const SUPA = '__SUPA__'; const UID = '__UID__';
const prep = $('Preparar').first().json;
const chatId = prep.chatId;
const cuentas = prep.cuentas || [];
const rawText = (prep.rawText || '').toLowerCase();
const reply = (m) => [{ json: { chatId, message: m } }];
const listaCuentas = () => cuentas.map(c => `• ${c.nombre} (${c.moneda})`).join('\n') || '(no tienes cuentas)';

let parsed = {};
try { parsed = JSON.parse($input.first().json.choices[0].message.content); } catch (e) {}

let tipo = parsed.tipo === 'ingreso' ? 'ingreso' : 'gasto';
let concepto = (parsed.concepto || '').trim();
let cuentaName = parsed.cuenta;

// Resolver cuenta PRIMERO (para saber la moneda y elegir el total correcto)
let cuenta = null;
if (cuentaName) {
  const q = String(cuentaName).toLowerCase();
  cuenta = cuentas.find(c => c.nombre.toLowerCase() === q) || cuentas.find(c => c.nombre.toLowerCase().includes(q) || q.includes(c.nombre.toLowerCase()));
}
if (!cuenta && rawText) cuenta = cuentas.find(c => rawText.includes(c.nombre.toLowerCase()));

// Elegir el monto en la MONEDA de la cuenta (el recibo puede traer COP y USD)
const totCop = Number(parsed.total_cop);
const totUsd = Number(parsed.total_usd);
let monto = NaN;
if (cuenta) {
  if (cuenta.moneda === 'USD' && totUsd > 0) monto = totUsd;
  else if (cuenta.moneda === 'COP' && totCop > 0) monto = totCop;
}
if (!(monto > 0)) monto = Number(parsed.monto);  // fallback al total más visible

// Fallback por regex sobre el texto si la IA no dio monto
if (!(monto > 0) && rawText) {
  if (/\b(ingreso|entr[oó]|recib|consign|abono)/.test(rawText)) tipo = 'ingreso';
  const num = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
  let mMill = rawText.match(/([\d.,]+)\s*(millones|mill[oó]n)/);
  let mMil = rawText.match(/([\d.,]+)\s*(mil|k)\b/);
  if (mMill) monto = num(mMill[1]) * 1000000;
  else if (mMil) monto = num(mMil[1]) * 1000;
  else { const mN = rawText.match(/\$?\s*([\d][\d.,]*)/); if (mN) monto = num(mN[1]); }
}
if (!(monto > 0)) {
  return reply('🤔 No logré sacar el monto. Escríbelo claro, ej:\n_gasto 50 mil mercado Bancolombia_\no manda la foto del recibo donde se vea el total.');
}
if (!cuenta) {
  return reply('🏦 Detecté ' + monto + ' pero no la cuenta. Dime de cuál:\n' + listaCuentas());
}

if (!concepto) concepto = tipo === 'gasto' ? 'Gasto' : 'Ingreso';
const fecha = (parsed.fecha && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha)) ? parsed.fecha : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const payload = { user_id: UID, tipo, concepto, monto, moneda: cuenta.moneda, cuenta_id: cuenta.id, status: 'Pagado', fecha };
const H = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };
await this.helpers.httpRequest({ method: 'POST', url: SUPA + '/movimientos', headers: { ...H, Prefer: 'return=minimal' }, body: payload, json: true });
const saldoRes = await this.helpers.httpRequest({ method: 'GET', url: SUPA + '/cuentas_saldos?select=saldo_actual&id=eq.' + cuenta.id, headers: H, json: true });
const saldo = Array.isArray(saldoRes) && saldoRes[0] ? Number(saldoRes[0].saldo_actual) : null;

const fmt = (n, c) => new Intl.NumberFormat(c === 'COP' ? 'es-CO' : 'en-US', { style: 'currency', currency: c, minimumFractionDigits: c === 'COP' ? 0 : 2 }).format(n);
const emoji = tipo === 'gasto' ? '💸' : '💰';
const lente = prep.hasPhoto ? '📸 (leído de la foto)\n' : '';
let m = `${emoji} *${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado*\n${lente}\n*${concepto}*\n${fmt(monto, cuenta.moneda)} · ${cuenta.nombre} · ${fecha}`;
if (saldo != null) m += `\n\n💼 Nuevo saldo ${cuenta.nombre}: *${fmt(saldo, cuenta.moneda)}*`;
return reply(m);
""".strip().replace('__SR__', SR).replace('__SUPA__', SUPA).replace('__UID__', UID)

wf = {
    'name': 'MyBudget - Registrar movimiento por Telegram',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'trg', 'name': 'Recibir Telegram', 'type': 'n8n-nodes-base.telegramTrigger', 'typeVersion': 1.1,
         'position': [112, 304], 'parameters': {'updates': ['message'], 'additionalFields': {'download': True, 'imageSize': 'large'}}, 'credentials': TG},
        {'id': 'prep', 'name': 'Preparar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [336, 304], 'parameters': {'jsCode': preparar_code}},
        {'id': 'ia', 'name': 'OpenRouter (visión)', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
         'position': [560, 304], 'parameters': {
             'method': 'POST', 'url': 'https://openrouter.ai/api/v1/chat/completions',
             'authentication': 'predefinedCredentialType', 'nodeCredentialType': 'openRouterApi',
             'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json.requestBody }}',
             'options': {'response': {'response': {'responseFormat': 'json'}}, 'timeout': 60000}},
         'credentials': OR_CRED},
        {'id': 'ins', 'name': 'Insertar y responder', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [784, 304], 'parameters': {'jsCode': insertar_code}},
        {'id': 'rep', 'name': 'Responder Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [1008, 304], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Recibir Telegram': {'main': [[{'node': 'Preparar', 'type': 'main', 'index': 0}]]},
        'Preparar': {'main': [[{'node': 'OpenRouter (visión)', 'type': 'main', 'index': 0}]]},
        'OpenRouter (visión)': {'main': [[{'node': 'Insertar y responder', 'type': 'main', 'index': 0}]]},
        'Insertar y responder': {'main': [[{'node': 'Responder Telegram', 'type': 'main', 'index': 0}]]},
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
    if st != 200: print(res)
else:
    st, res = api('POST', '/workflows', wf); wid = res.get('id') if isinstance(res, dict) else None; print(f'CREADO -> {wid} ({st})')
    if not wid: print(res)
if wid:
    ast, _ = api('POST', f'/workflows/{wid}/activate'); print(f'activar -> {ast}')
