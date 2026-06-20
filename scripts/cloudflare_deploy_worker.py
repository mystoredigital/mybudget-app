import json, urllib.request, urllib.error, uuid

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

TOKEN = env('CLOUDFLARE_API_TOKEN')
ACCT = env('CLOUDFLARE_ACCOUNT_ID')
ZONE = env('CLOUDFLARE_ZONE_ID')
DOMAIN = 'mystoredigital.cloud'
SCRIPT_NAME = 'factura-email'
ADDRESS = f'facturas@{DOMAIN}'
WORKER_FILE = 'scripts/cloudflare-email-worker.js'
API = 'https://api.cloudflare.com/client/v4'

if not TOKEN or not ACCT:
    raise SystemExit('Falta CLOUDFLARE_API_TOKEN o CLOUDFLARE_ACCOUNT_ID en .env')

def call(method, path, body=None, headers=None, raw=None, ctype='application/json'):
    url = API + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'curl/8.4.0', 'Accept': 'application/json'}
    if data is not None and raw is None:
        h['Content-Type'] = ctype
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or '{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or '{}')
        except Exception: return e.code, {'raw': '<no-json>'}

def ok(res): return isinstance(res, dict) and res.get('success')
def errs(res): return res.get('errors') if isinstance(res, dict) else res

# ---- 0) Resolver zone_id ----
if not ZONE:
    st, res = call('GET', f'/zones?name={DOMAIN}')
    if ok(res) and res.get('result'):
        ZONE = res['result'][0]['id']
        print(f'ZONE {DOMAIN} -> {ZONE}')
    else:
        raise SystemExit(f'No encontré la zona {DOMAIN}: {errs(res)}')
else:
    print(f'ZONE (de .env) -> {ZONE}')

# ---- 1) Subir el Worker (módulo ESM, multipart) ----
js = open(WORKER_FILE, 'rb').read()
boundary = '----mybudget' + uuid.uuid4().hex
metadata = json.dumps({'main_module': 'worker.js', 'compatibility_date': '2024-11-01'})
def part(name, content, filename=None, ctype=None):
    head = f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
    if filename: head += f'; filename="{filename}"'
    head += '\r\n'
    if ctype: head += f'Content-Type: {ctype}\r\n'
    head += '\r\n'
    return head.encode() + content + b'\r\n'
body = b''
body += part('metadata', metadata.encode())
body += part('worker.js', js, filename='worker.js', ctype='application/javascript+module')
body += f'--{boundary}--\r\n'.encode()
st, res = call('PUT', f'/accounts/{ACCT}/workers/scripts/{SCRIPT_NAME}',
               raw=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
print('WORKER subido:', st, 'ok' if ok(res) else errs(res))

# ---- 2) Activar Email Routing + DNS ----
st, res = call('POST', f'/zones/{ZONE}/email/routing/dns', body={'name': DOMAIN})
print('Email Routing DNS:', st, 'ok' if ok(res) else errs(res))
st, res = call('POST', f'/zones/{ZONE}/email/routing/enable', body={})
print('Email Routing enable:', st, 'ok' if ok(res) else errs(res))

# ---- 3) Crear regla facturas@ -> worker (idempotente) ----
st, rules = call('GET', f'/zones/{ZONE}/email/routing/rules')
exists = False
if ok(rules):
    for r in rules.get('result', []):
        for mtch in r.get('matchers', []):
            if mtch.get('value', '').lower() == ADDRESS.lower():
                exists = True
if exists:
    print(f'REGLA ya existe para {ADDRESS} (no la duplico)')
else:
    rule = {
        'name': f'Facturas -> {SCRIPT_NAME}',
        'enabled': True,
        'matchers': [{'type': 'literal', 'field': 'to', 'value': ADDRESS}],
        'actions': [{'type': 'worker', 'value': [SCRIPT_NAME]}],
    }
    st, res = call('POST', f'/zones/{ZONE}/email/routing/rules', body=rule)
    print('REGLA creada:', st, 'ok' if ok(res) else errs(res))

print('\nLISTO. Reenvía una factura a:', ADDRESS)
