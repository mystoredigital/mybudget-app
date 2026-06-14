import json, os, urllib.request

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL')
KEY = env('N8N_API_KEY')
SR = env('SUPABASE_SERVICE_ROLE_KEY')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
SUPA = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
TG_CRED = {'telegramApi': {'id': 'SNuF3zPIkSDlK9RO', 'name': 'Telegram account'}}
CHAT = '523281213'
SETTINGS = {'executionOrder': 'v1'}

def supa_headers(extra=None):
    p = [{'name': 'apikey', 'value': SR}, {'name': 'Authorization', 'value': 'Bearer ' + SR}]
    if extra:
        p += extra
    return {'parameters': p}

# ---------- Workflow A: Tasa de cambio diaria ----------
build_code = """
const j = $input.first().json;
const valor = Number(j.rates && j.rates.COP ? j.rates.COP : 0);
const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
return [{ json: { user_id: '%s', fecha, par: 'USD_COP', valor, fuente: 'api' } }];
""".strip() % UID

wf_tasa = {
    'name': 'MyBudget - Tasa de cambio diaria (USD/COP)',
    'settings': SETTINGS,
    'nodes': [
        {'id': 'sched', 'name': 'Schedule', 'type': 'n8n-nodes-base.scheduleTrigger', 'typeVersion': 1.3,
         'position': [112, 304], 'parameters': {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 6 * * *'}]}}},
        {'id': 'trm', 'name': 'FX open.er-api.com', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.4,
         'position': [336, 304], 'parameters': {
             'url': 'https://open.er-api.com/v6/latest/USD',
             'options': {}}},
        {'id': 'build', 'name': 'Construir payload', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [560, 304], 'parameters': {'jsCode': build_code}},
        {'id': 'upsert', 'name': 'Upsert tasas_cambio', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.4,
         'position': [784, 304], 'parameters': {
             'method': 'POST',
             'url': SUPA + '/tasas_cambio?on_conflict=user_id,fecha,par',
             'sendHeaders': True,
             'headerParameters': supa_headers([
                 {'name': 'Content-Type', 'value': 'application/json'},
                 {'name': 'Prefer', 'value': 'resolution=merge-duplicates,return=minimal'}]),
             'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify($json) }}',
             'options': {}}},
    ],
    'connections': {
        'Schedule': {'main': [[{'node': 'FX open.er-api.com', 'type': 'main', 'index': 0}]]},
        'FX open.er-api.com': {'main': [[{'node': 'Construir payload', 'type': 'main', 'index': 0}]]},
        'Construir payload': {'main': [[{'node': 'Upsert tasas_cambio', 'type': 'main', 'index': 0}]]},
    },
}

# ---------- Workflow B: Alerta de servicios ----------
filter_code = r"""
const items = $input.all().filter(i => i.json && i.json.id);
const alerts = items.filter(i => {
  const d = Number(i.json.dias_para_renovar);
  const da = i.json.dias_alerta || [];
  return da.includes(d) || d <= 0;
});
if (alerts.length === 0) return [];
let message = '🔔 *Servicios / Dominios por renovar*\n\n';
for (const it of alerts) {
  const s = it.json;
  const d = Number(s.dias_para_renovar);
  const estado = d < 0 ? `🔴 Vencido hace ${Math.abs(d)} día(s)` : (d === 0 ? '🔴 Renueva HOY' : `🟡 Renueva en ${d} día(s)`);
  const valor = Number(s.costo).toLocaleString('es-CO');
  message += `${estado}\n🌐 *${s.nombre}*\n   ${valor} ${s.moneda} · ${s.ciclo}\n   ${s.proveedor || '—'}${s.cliente ? ' · Cliente: ' + s.cliente : ''}\n   Renueva: ${s.fecha_renovacion}\n\n`;
}
return [{ json: { message } }];
""".strip()

wf_serv = {
    'name': 'MyBudget - Alerta de Servicios/Dominios (30/15/7)',
    'settings': SETTINGS,
    'nodes': [
        {'id': 'sched', 'name': 'Schedule', 'type': 'n8n-nodes-base.scheduleTrigger', 'typeVersion': 1.3,
         'position': [112, 304], 'parameters': {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 8 * * *'}]}}},
        {'id': 'serv', 'name': 'Consultar servicios_view', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.4,
         'position': [336, 304], 'parameters': {
             'url': SUPA + '/servicios_view?select=*&activo=eq.true&order=fecha_renovacion.asc',
             'sendHeaders': True, 'headerParameters': supa_headers(), 'options': {}}},
        {'id': 'filt', 'name': 'Filtrar alertas', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [560, 304], 'parameters': {'jsCode': filter_code}},
        {'id': 'tg', 'name': 'Enviar Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [784, 304], 'parameters': {'chatId': CHAT, 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG_CRED},
    ],
    'connections': {
        'Schedule': {'main': [[{'node': 'Consultar servicios_view', 'type': 'main', 'index': 0}]]},
        'Consultar servicios_view': {'main': [[{'node': 'Filtrar alertas', 'type': 'main', 'index': 0}]]},
        'Filtrar alertas': {'main': [[{'node': 'Enviar Telegram', 'type': 'main', 'index': 0}]]},
    },
}

def api(method, path, body=None):
    url = BASE + '/api/v1' + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json',
                                          'User-Agent': 'curl/8.4.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Mapa nombre -> id de los workflows existentes (para upsert)
_, lst = api('GET', '/workflows')
existing = {w['name']: w['id'] for w in (lst.get('data', []) if isinstance(lst, dict) else [])}

for wf in (wf_tasa, wf_serv):
    wid = existing.get(wf['name'])
    if wid:
        st, res = api('PUT', f'/workflows/{wid}', wf)
        print(f'ACTUALIZADO {wf["name"]} -> {wid} ({st})')
    else:
        st, res = api('POST', '/workflows', wf)
        wid = res.get('id') if isinstance(res, dict) else None
        print(f'CREADO {wf["name"]} -> {wid} ({st})')
    if wid:
        ast, _ = api('POST', f'/workflows/{wid}/activate')
        print(f'  activar -> {ast}')
