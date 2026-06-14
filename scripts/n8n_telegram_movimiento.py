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
OPENAI = {'openAiApi': {'id': 'RQ5DZ90hgR4xqHtR', 'name': 'OpenAi account'}}

prompt_code = r"""
const text = ($('Recibir Telegram').first().json.message.text) || '';
const cuentas = $input.all().map(i => i.json);
const nombres = cuentas.map(c => `${c.nombre} (${c.moneda})`).join(', ');
const system = `Eres un asistente que extrae UN movimiento financiero de un mensaje en español.
Devuelve SOLO un JSON con estas claves:
- tipo: "gasto" o "ingreso" (si no es claro, "gasto"; si el mensaje NO es un movimiento, null)
- monto: número sin separadores. Interpreta "50 mil"=50000, "50k"=50000, "1.5 millones"=1500000.
- concepto: texto corto de qué fue.
- cuenta: el nombre que mejor coincida de esta lista: [${nombres}]. Si no se menciona, null.`;
const body = {
  model: 'gpt-4o-mini',
  messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
  response_format: { type: 'json_object' },
  temperature: 0,
};
return [{ json: { requestBody: JSON.stringify(body) } }];
""".strip()

procesar_code = r"""
const SR = '__SR__';
const SUPA = '__SUPA__';
const UID = '__UID__';
const chatId = $('Recibir Telegram').first().json.message.chat.id;
const cuentas = $('Cuentas').all().map(i => i.json);
const reply = (m) => [{ json: { chatId, message: m } }];

let parsed = {};
try { parsed = JSON.parse($input.first().json.choices[0].message.content); } catch (e) {}

const tipo = parsed.tipo === 'ingreso' ? 'ingreso' : 'gasto';
const monto = Number(parsed.monto);
if (!(monto > 0)) return reply('🤔 No entendí el monto.\nEj: _gasto 50 mil en mercado con Bancolombia_');

let cuenta = null;
if (parsed.cuenta) {
  const q = String(parsed.cuenta).toLowerCase();
  cuenta = cuentas.find(c => c.nombre.toLowerCase() === q)
        || cuentas.find(c => c.nombre.toLowerCase().includes(q) || q.includes(c.nombre.toLowerCase()));
}
if (!cuenta) {
  const lista = cuentas.map(c => `• ${c.nombre} (${c.moneda})`).join('\n') || '(no tienes cuentas)';
  return reply('🏦 ¿De qué cuenta salió/entró? No la identifiqué.\nTus cuentas:\n' + lista);
}

const concepto = parsed.concepto || (tipo === 'gasto' ? 'Gasto' : 'Ingreso');
const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const payload = { user_id: UID, tipo, concepto, monto, moneda: cuenta.moneda, cuenta_id: cuenta.id, status: 'Pagado', fecha };

const H = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };
await this.helpers.httpRequest({ method: 'POST', url: SUPA + '/movimientos', headers: { ...H, Prefer: 'return=minimal' }, body: payload, json: true });
const saldoRes = await this.helpers.httpRequest({ method: 'GET', url: SUPA + '/cuentas_saldos?select=saldo_actual&id=eq.' + cuenta.id, headers: H, json: true });
const saldo = Array.isArray(saldoRes) && saldoRes[0] ? Number(saldoRes[0].saldo_actual) : null;

const fmt = (n, m) => new Intl.NumberFormat(m === 'COP' ? 'es-CO' : 'en-US', { style: 'currency', currency: m, minimumFractionDigits: m === 'COP' ? 0 : 2 }).format(n);
const emoji = tipo === 'gasto' ? '💸' : '💰';
let msg = `${emoji} *${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado*\n\n*${concepto}*\n${fmt(monto, cuenta.moneda)} · ${cuenta.nombre}`;
if (saldo != null) msg += `\n\n💼 Nuevo saldo: *${fmt(saldo, cuenta.moneda)}*`;
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
        {'id': 'prm', 'name': 'Construir prompt', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [560, 304], 'parameters': {'jsCode': prompt_code}},
        {'id': 'ia', 'name': 'OpenAI parse', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
         'position': [784, 304], 'parameters': {
             'method': 'POST', 'url': 'https://api.openai.com/v1/chat/completions',
             'authentication': 'predefinedCredentialType', 'nodeCredentialType': 'openAiApi',
             'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json.requestBody }}',
             'options': {'response': {'response': {'responseFormat': 'json'}}, 'timeout': 60000}},
         'credentials': OPENAI},
        {'id': 'prc', 'name': 'Procesar e insertar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [1008, 304], 'parameters': {'jsCode': procesar_code}},
        {'id': 'rep', 'name': 'Responder Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [1232, 304], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Recibir Telegram': {'main': [[{'node': 'Cuentas', 'type': 'main', 'index': 0}]]},
        'Cuentas': {'main': [[{'node': 'Construir prompt', 'type': 'main', 'index': 0}]]},
        'Construir prompt': {'main': [[{'node': 'OpenAI parse', 'type': 'main', 'index': 0}]]},
        'OpenAI parse': {'main': [[{'node': 'Procesar e insertar', 'type': 'main', 'index': 0}]]},
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
