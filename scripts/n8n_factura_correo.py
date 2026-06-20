import json, urllib.request, urllib.error, uuid

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
CHAT = '523281213'
REST = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
STORAGE = 'https://tdwfsftgcbktekgknduj.supabase.co/storage/v1'
WEBHOOK_PATH = 'factura-correo-7c3f9a2e5b14'
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

# ---- Nodo Preparar: clasifica el correo y arma el request a OpenRouter ----
preparar = r"""
const SR='__SR__'; const REST='__REST__';
const body = ($input.first().json.body) || $input.first().json;
const subject = body.subject || '';
const from = body.from || '';
const text = (body.text || body.html || '').slice(0, 7000);
const atts = Array.isArray(body.attachments) ? body.attachments : [];
const pdf = atts.find(a => (a.mimeType||'').includes('pdf') || /\.pdf$/i.test(a.filename||''));

const H = { apikey: SR, Authorization: 'Bearer ' + SR };
const cuentas = await this.helpers.httpRequest({ method: 'GET', url: REST + '/cuentas?select=id,nombre,moneda&archivada=eq.false', headers: H, json: true });
const cats = await this.helpers.httpRequest({ method: 'GET', url: REST + '/user_categories?select=name', headers: H, json: true });
const nombres = (cuentas||[]).map(c => `${c.nombre} (${c.moneda})`).join(', ');
const catList = (cats||[]).map(c => c.name).join(', ');

const system = `Eres un asistente financiero. Lees UN correo (notificación bancaria, factura ya pagada, comprobante o cualquier cosa) y devuelves SOLO JSON válido:
{"accion":"registrar"|"ignorar","tipo":"gasto"|"ingreso","concepto":"texto corto","comercio":"comercio/proveedor o null","monto":number,"moneda":"COP"|"USD","cuenta":"nombre exacto de la lista o null","categoria":"una de la lista o null","fecha":"YYYY-MM-DD o null"}.
Cuentas del usuario: [${nombres}].
Categorías: [${catList}].
Contexto: TODO correo que llega a este buzón corresponde a una transacción que YA SE REALIZÓ (ya pagada o ya recibida). No hay pendientes.
Reglas:
- "registrar": el correo corresponde a una transacción real con un monto (pago, compra, retiro, transferencia, QR, consignación, ingreso recibido, o una factura YA PAGADA, sea en el cuerpo o en un PDF). Afecta el saldo.
- "ignorar": SOLO si NO hay una transacción con monto (confirmaciones de reenvío, verificaciones, OTP, alertas de login/seguridad, publicidad, newsletters). En ese caso monto:0 y el resto null.
- "tipo": "gasto" si sale dinero (pagaste/compra/factura de un proveedor a ti); "ingreso" si entra (recibiste/consignación/factura que TÚ emites a un cliente).
- "monto": número limpio en la moneda de la transacción, sin símbolos ni separadores de miles. Formatos: "411,500.00"=411500, "411.500,00"=411500, "$72.000"=72000.
- "cuenta": el nombre que mejor coincida de la lista (ej. "Bancolombia", "desde tu cuenta *42" → Bancolombia). Si no se sabe, null.
- "categoria": una de la lista si encaja; si no, null.
- Si hay PDF de factura, extrae el total pagado.`;

let userContent, plugins;
if (pdf && pdf.contentBase64) {
  userContent = [
    { type: 'text', text: 'Clasifica y extrae los datos. Asunto: ' + subject + '. Remitente: ' + from + '. Cuerpo:\n' + text },
    { type: 'file', file: { filename: pdf.filename || 'factura.pdf', file_data: 'data:application/pdf;base64,' + pdf.contentBase64 } },
  ];
  plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
} else {
  userContent = `Clasifica y extrae los datos.\nAsunto: ${subject}\nRemitente: ${from}\nCuerpo:\n${text}`;
}

const reqBody = { model: 'openai/gpt-4o-mini', max_tokens: 600, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] };
if (plugins) reqBody.plugins = plugins;

return [{ json: {
  requestBody: JSON.stringify(reqBody),
  subject, from, cuentas,
  pdf: pdf ? { filename: pdf.filename || 'factura.pdf', mimeType: pdf.mimeType || 'application/pdf', contentBase64: pdf.contentBase64 } : null,
} }];
""".strip().replace('__SR__', SR).replace('__REST__', REST)

# ---- Nodo Registrar: según accion, guarda movimiento o factura ----
insertar = r"""
const SR='__SR__'; const REST='__REST__'; const STORAGE='__STORAGE__'; const UID='__UID__'; const CHAT='__CHAT__';
const prep = $('Preparar').first().json;
const cuentas = prep.cuentas || [];
const reply = (m) => [{ json: { chatId: CHAT, message: m } }];
const H = { apikey: SR, Authorization: 'Bearer ' + SR };
const HJ = { ...H, 'Content-Type': 'application/json' };

let p = {};
try { p = JSON.parse($input.first().json.choices[0].message.content); } catch (e) {}

const accion = p.accion || 'ignorar';
let monto = Number(p.monto);
if (accion !== 'registrar' || !(monto > 0)) return [];  // no financiero → silencio

const tipo = p.tipo === 'ingreso' ? 'ingreso' : 'gasto';
let concepto = (p.concepto || '').toString().trim() || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
const comercio = (p.comercio || '').toString().trim();
const fecha = (p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) ? p.fecha : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const categoria = p.categoria || null;

// Resolver cuenta y moneda
let cuenta = null;
if (p.cuenta) { const q = String(p.cuenta).toLowerCase(); cuenta = cuentas.find(c => c.nombre.toLowerCase() === q) || cuentas.find(c => c.nombre.toLowerCase().includes(q) || q.includes(c.nombre.toLowerCase())); }
let moneda = p.moneda === 'USD' ? 'USD' : p.moneda === 'COP' ? 'COP' : null;
if (!cuenta) {
  if (moneda === 'USD') cuenta = cuentas.find(c => c.moneda === 'USD');
  else cuenta = cuentas.find(c => c.nombre.toLowerCase().includes('bancolombia')) || cuentas.find(c => c.moneda === 'COP');
}
if (!moneda) moneda = cuenta ? cuenta.moneda : 'COP';

const fmt = (n, c) => new Intl.NumberFormat(c === 'COP' ? 'es-CO' : 'en-US', { style: 'currency', currency: c, minimumFractionDigits: c === 'COP' ? 0 : 2 }).format(n);

const subirPDF = async (folder, refId) => {
  const f = prep.pdf;
  const path = UID + '/' + folder + '/' + fecha.slice(0, 7) + '/' + (refId || 'ref') + '_' + (f.filename || 'factura.pdf').replace(/[^\w.\-]/g, '_');
  await this.helpers.httpRequest({ method: 'POST', url: STORAGE + '/object/comprobantes/' + encodeURI(path), headers: { ...H, 'Content-Type': f.mimeType, 'x-upsert': 'true' }, body: Buffer.from(f.contentBase64, 'base64') });
  const signed = await this.helpers.httpRequest({ method: 'POST', url: STORAGE + '/object/sign/comprobantes/' + encodeURI(path), headers: HJ, body: { expiresIn: 604800 }, json: true });
  return { path, url: 'https://tdwfsftgcbktekgknduj.supabase.co/storage/v1' + (signed.signedURL || signed.signedUrl || '') };
};

// ── Todo correo ya fue pagado/recibido → movimientos (Pagado) ──
const ins = await this.helpers.httpRequest({
  method: 'POST', url: REST + '/movimientos', headers: { ...HJ, Prefer: 'return=representation' },
  body: { user_id: UID, tipo, concepto, monto, moneda, cuenta_id: cuenta ? cuenta.id : null, categoria, status: 'Pagado', fecha, comment: comercio ? ('Correo · ' + comercio) : 'Correo' },
  json: true,
});
const movId = Array.isArray(ins) ? ins[0].id : ins.id;
let pdfUrl = '';
if (prep.pdf) {
  try {
    const r = await subirPDF('movimientos', movId);
    pdfUrl = r.url;
    await this.helpers.httpRequest({ method: 'PATCH', url: REST + '/movimientos?id=eq.' + movId, headers: { ...HJ, Prefer: 'return=minimal' }, body: { comment: (comercio ? ('Correo · ' + comercio) : 'Correo') + ' · comprobante:' + r.path }, json: true });
  } catch (e) {}
}
let saldoTxt = '';
if (cuenta) {
  try {
    const s = await this.helpers.httpRequest({ method: 'GET', url: REST + '/cuentas_saldos?select=saldo_actual&id=eq.' + cuenta.id, headers: H, json: true });
    if (Array.isArray(s) && s[0]) saldoTxt = '\n\n💼 Nuevo saldo ' + cuenta.nombre + ': *' + fmt(Number(s[0].saldo_actual), cuenta.moneda) + '*';
  } catch (e) {}
}
const emoji = tipo === 'ingreso' ? '💰' : '💸';
let m = emoji + ' *' + (tipo === 'ingreso' ? 'Ingreso' : 'Gasto') + ' registrado*\n\n*' + concepto + '*\n' + fmt(monto, moneda) + (cuenta ? (' · ' + cuenta.nombre) : '') + ' · ' + fecha + (comercio ? ('\n📍 ' + comercio) : '') + saldoTxt + (pdfUrl ? ('\n\n📎 [Ver](' + pdfUrl + ')') : '');
return reply(m);
""".strip().replace('__SR__', SR).replace('__REST__', REST).replace('__STORAGE__', STORAGE).replace('__UID__', UID).replace('__CHAT__', CHAT)

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
