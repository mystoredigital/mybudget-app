import json, urllib.request, urllib.error

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
BANCO = 'ef16a7f6-3ad9-4424-b231-2c5e6773420d'   # Bancolombia (COP)
CHAT = '523281213'
REST = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
STORAGE = 'https://tdwfsftgcbktekgknduj.supabase.co/storage/v1'
WEBHOOK_PATH = 'factura-correo-7c3f9a2e5b14'   # difícil de adivinar (hace de secreto)
TG = {'telegramApi': {'id': 'SNuF3zPIkSDlK9RO', 'name': 'Telegram account'}}
OR_CRED = {'openRouterApi': {'id': 'GlqsWgvvC13mpS4n', 'name': 'OpenRouter account'}}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + '/api/v1' + path, data=data, method=method,
        headers={'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or '{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or '{}')
        except Exception: return e.code, '<err>'

# ---- Nodo Preparar: arma el request a OpenRouter (PDF o texto) ----
preparar = r"""
const body = ($input.first().json.body) || $input.first().json;
const subject = body.subject || '';
const from = body.from || '';
const text = (body.text || body.html || '').slice(0, 6000);
const atts = Array.isArray(body.attachments) ? body.attachments : [];
const pdf = atts.find(a => (a.mimeType||'').includes('pdf') || /\.pdf$/i.test(a.filename||''));

const system = `Eres un asistente que extrae los datos de UNA factura de peaje o parqueadero y devuelve SOLO JSON válido:
{"tipo":"peaje"|"parqueadero"|"otro","concepto":"texto corto","lugar":"estación/parqueadero o ciudad","fecha":"YYYY-MM-DD o null","monto":number,"placa":"texto o null"}.
Reglas:
- "monto" = total a pagar en pesos colombianos (COP), número sin símbolos ni separadores de miles.
- Interpreta formato 12.345,67 = 12345.67 y 14.600 = 14600.
- Si es peaje pon tipo "peaje"; si es parqueadero "parqueadero"; si no, "otro".
- concepto corto, ej: "Peaje Los Patios" o "Parqueadero CC Jardín".`;

let userContent, plugins;
if (pdf && pdf.contentBase64) {
  userContent = [
    { type: 'text', text: 'Extrae los datos de esta factura. Asunto del correo: ' + subject + '. Remitente: ' + from },
    { type: 'file', file: { filename: pdf.filename || 'factura.pdf', file_data: 'data:application/pdf;base64,' + pdf.contentBase64 } },
  ];
  plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
} else {
  userContent = `Extrae los datos de esta factura.\nAsunto: ${subject}\nRemitente: ${from}\nCuerpo:\n${text}`;
}

const reqBody = {
  model: 'openai/gpt-4o-mini',
  max_tokens: 500, temperature: 0,
  response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
};
if (plugins) reqBody.plugins = plugins;

return [{ json: {
  requestBody: JSON.stringify(reqBody),
  subject, from,
  pdf: pdf ? { filename: pdf.filename || 'factura.pdf', mimeType: pdf.mimeType || 'application/pdf', contentBase64: pdf.contentBase64 } : null,
} }];
""".strip()

# ---- Nodo Insertar: parsea IA, registra gasto, sube PDF, arma aviso ----
insertar = r"""
const SR='__SR__'; const REST='__REST__'; const STORAGE='__STORAGE__'; const UID='__UID__'; const BANCO='__BANCO__'; const CHAT='__CHAT__';
const prep = $('Preparar').first().json;
const reply = (m) => [{ json: { chatId: CHAT, message: m } }];
const H = { apikey: SR, Authorization: 'Bearer ' + SR };
const HJ = { ...H, 'Content-Type': 'application/json' };

let parsed = {};
try { parsed = JSON.parse($input.first().json.choices[0].message.content); } catch (e) {}

const tipo = parsed.tipo || 'otro';
let monto = Number(parsed.monto);
const lugar = (parsed.lugar || '').toString().trim();
let concepto = (parsed.concepto || '').toString().trim();
if (!concepto) concepto = tipo === 'peaje' ? 'Peaje' : tipo === 'parqueadero' ? 'Parqueadero' : 'Factura';
const fecha = (parsed.fecha && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha)) ? parsed.fecha : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

// Sube el PDF (si hay) a comprobantes y devuelve {path, url firmada}
const subirPDF = async (mid) => {
  const p = prep.pdf;
  const path = UID + '/facturas/' + fecha.slice(0, 7) + '/' + (mid || 'sinmov') + '_' + (p.filename || 'factura.pdf').replace(/[^\w.\-]/g, '_');
  const buf = Buffer.from(p.contentBase64, 'base64');
  await this.helpers.httpRequest({ method: 'POST', url: STORAGE + '/object/comprobantes/' + encodeURI(path), headers: { ...H, 'Content-Type': p.mimeType, 'x-upsert': 'true' }, body: buf });
  const signed = await this.helpers.httpRequest({ method: 'POST', url: STORAGE + '/object/sign/comprobantes/' + encodeURI(path), headers: HJ, body: { expiresIn: 604800 }, json: true });
  return { path, url: 'https://tdwfsftgcbktekgknduj.supabase.co/storage/v1' + (signed.signedURL || signed.signedUrl || '') };
};

if (!(monto > 0)) {
  // Sin monto fiable: guardamos el PDF (si hay) y avisamos para revisar a mano.
  let link = '';
  if (prep.pdf) { try { const r = await subirPDF(null); link = '\n\n📎 [Ver factura](' + r.url + ')'; } catch (e) {} }
  return reply('🧾 Llegó una factura ('+concepto+') pero no pude leer el monto. Revísala en el correo.' + link);
}

// 1) Registrar el gasto Pagado en Bancolombia
const ins = await this.helpers.httpRequest({
  method: 'POST', url: REST + '/movimientos',
  headers: { ...HJ, Prefer: 'return=representation' },
  body: { user_id: UID, tipo: 'gasto', concepto, monto, moneda: 'COP', cuenta_id: BANCO, categoria: 'Transporte', status: 'Pagado', fecha, comment: lugar ? ('Factura email · ' + lugar) : 'Factura email' },
  json: true,
});
const movId = Array.isArray(ins) ? ins[0].id : ins.id;

// 2) Subir el PDF a comprobantes y guardar la ruta en el movimiento
let pdfUrl = '';
if (prep.pdf) {
  try {
    const r = await subirPDF(movId);
    pdfUrl = r.url;
    await this.helpers.httpRequest({ method: 'PATCH', url: REST + '/movimientos?id=eq.' + movId, headers: { ...HJ, Prefer: 'return=minimal' }, body: { comment: (lugar ? ('Factura email · ' + lugar) : 'Factura email') + ' · comprobante:' + r.path }, json: true });
  } catch (e) {}
}

// 3) Nuevo saldo y aviso
let saldoTxt = '';
try {
  const s = await this.helpers.httpRequest({ method: 'GET', url: REST + '/cuentas_saldos?select=saldo_actual&id=eq.' + BANCO, headers: H, json: true });
  if (Array.isArray(s) && s[0]) saldoTxt = '\n\n💼 Nuevo saldo Bancolombia: *' + fmt(Number(s[0].saldo_actual)) + '*';
} catch (e) {}

const icon = tipo === 'peaje' ? '🛣️' : tipo === 'parqueadero' ? '🅿️' : '🧾';
let m = icon + ' *' + (tipo === 'peaje' ? 'Peaje' : tipo === 'parqueadero' ? 'Parqueadero' : 'Factura') + ' registrado*\n\n*' + concepto + '*\n' + fmt(monto) + ' · Bancolombia · ' + fecha;
if (lugar) m += '\n📍 ' + lugar;
m += saldoTxt;
if (pdfUrl) m += '\n\n📎 [Ver factura](' + pdfUrl + ')';
return reply(m);
""".strip().replace('__SR__', SR).replace('__REST__', REST).replace('__STORAGE__', STORAGE).replace('__UID__', UID).replace('__BANCO__', BANCO).replace('__CHAT__', CHAT)

wf = {
    'name': 'MyBudget - Facturas peaje/parqueadero por correo',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'wh', 'name': 'Webhook correo', 'type': 'n8n-nodes-base.webhook', 'typeVersion': 2,
         'position': [240, 300], 'webhookId': WEBHOOK_PATH,
         'parameters': {'httpMethod': 'POST', 'path': WEBHOOK_PATH, 'responseMode': 'onReceived', 'options': {}}},
        {'id': 'prep', 'name': 'Preparar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [460, 300], 'parameters': {'jsCode': preparar}},
        {'id': 'ia', 'name': 'OpenRouter', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
         'position': [680, 300], 'parameters': {
             'method': 'POST', 'url': 'https://openrouter.ai/api/v1/chat/completions',
             'authentication': 'predefinedCredentialType', 'nodeCredentialType': 'openRouterApi',
             'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json.requestBody }}',
             'options': {'response': {'response': {'responseFormat': 'json'}}, 'timeout': 120000}},
         'credentials': OR_CRED},
        {'id': 'ins', 'name': 'Registrar y avisar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [900, 300], 'parameters': {'jsCode': insertar}},
        {'id': 'tg', 'name': 'Avisar Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [1120, 300], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Webhook correo': {'main': [[{'node': 'Preparar', 'type': 'main', 'index': 0}]]},
        'Preparar': {'main': [[{'node': 'OpenRouter', 'type': 'main', 'index': 0}]]},
        'OpenRouter': {'main': [[{'node': 'Registrar y avisar', 'type': 'main', 'index': 0}]]},
        'Registrar y avisar': {'main': [[{'node': 'Avisar Telegram', 'type': 'main', 'index': 0}]]},
    },
}

_, lst = api('GET', '/workflows')
existing = {w['name']: w['id'] for w in (lst.get('data', []) if isinstance(lst, dict) else [])}
wid = existing.get(wf['name'])
if wid:
    st, res = api('PUT', f'/workflows/{wid}', wf); print(f'WORKFLOW actualizado -> {wid} ({st})')
    if st != 200: print(res)
else:
    st, res = api('POST', '/workflows', wf); wid = res.get('id') if isinstance(res, dict) else None
    print(f'WORKFLOW creado -> {wid} ({st})')
    if not wid: print(res)
if wid:
    ast, ares = api('POST', f'/workflows/{wid}/activate'); print(f'activar -> {ast}')
    if ast != 200: print(ares)
print('WEBHOOK URL:', BASE + '/webhook/' + WEBHOOK_PATH)
