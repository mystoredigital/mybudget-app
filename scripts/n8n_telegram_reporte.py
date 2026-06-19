import json, urllib.request, urllib.error

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
TOKEN = env('TG_REPORTE_BOT_TOKEN')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
SUPA = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
MONEDA = 'USD'

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

# ---- 1) Crear credencial Telegram para el bot nuevo (si no existe ya por nombre) ----
CRED_NAME = 'Telegram Reporte Diario'
cred_id = None
# La API pública no lista credenciales; intentamos crear y, si choca, el usuario reusa.
st, res = api('POST', '/credentials', {
    'name': CRED_NAME,
    'type': 'telegramApi',
    'data': {'accessToken': TOKEN, 'baseUrl': 'https://api.telegram.org'},
})
if st in (200, 201) and isinstance(res, dict):
    cred_id = res.get('id')
    print(f'CREDENCIAL creada -> {cred_id}')
else:
    print(f'No se pudo crear credencial ({st}): {res}')

if not cred_id:
    raise SystemExit('Sin credencial no puedo seguir.')

TG = {'telegramApi': {'id': cred_id, 'name': CRED_NAME}}

# ---- 2) Code: parsear el mensaje, guardar reporte del día, responder ----
code = r"""
const SR='__SR__'; const SUPA='__SUPA__'; const UID='__UID__'; const MONEDA='__MON__';
const item=$input.first();
const msg=item.json.message||{};
const chatId=msg.chat&&msg.chat.id;
const text=(msg.text||msg.caption||'').trim();
const reply=(m)=>[{json:{chatId,message:m}}];
if(!text) return reply('Mándame el reporte de saldos (varias líneas tipo "Saldo X: monto").');

const H={apikey:SR,Authorization:'Bearer '+SR};
const HJ={...H,'Content-Type':'application/json'};

const STOP=new Set(['saldo','saldos','valles','valle','de','del','la','el','los','por','compensacion','y']);
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const parseMonto=raw=>{if(!raw)return null;let s=String(raw).replace(/[^\d.,-]/g,'').trim();if(!s||s==='-'||s==='.'||s===',')return null;const hd=s.includes('.'),hc=s.includes(',');if(hd&&hc){s=s.replace(/\./g,'').replace(',','.');}else if(hc){s=s.replace(',','.');}else if(hd){const p=s.split('.');if(p.length>1&&p.slice(1).every(x=>x.length===3))s=p.join('');}const n=parseFloat(s);return isNaN(n)?null:n;};
const kw=n=>norm(n).split(/\s+/).filter(w=>w.length>1&&!STOP.has(w));

const conceptos=await this.helpers.httpRequest({method:'GET',url:SUPA+'/reporte_conceptos?select=nombre,signo,orden,activo&user_id=eq.'+UID+'&activo=is.true&order=orden',headers:H,json:true});
if(!conceptos||!conceptos.length) return reply('No tienes conceptos configurados. Abre la app → Reporte diario para crearlos.');

const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
const items=[];let matched=0;
for(const c of conceptos){const ks=kw(c.nombre);let monto=0;let found=false;
  if(ks.length){const line=lines.find(l=>{const nl=norm(l);return ks.some(k=>nl.includes(k));});
    if(line){const after=line.includes(':')?line.slice(line.indexOf(':')+1):line;const mm=parseMonto(after);if(mm!=null){monto=mm;found=true;matched++;}}}
  items.push({nombre:c.nombre,signo:Number(c.signo),monto,orden:c.orden,found});
}
if(matched===0) return reply('🤔 No reconocí ningún concepto. Manda líneas tipo:\nSaldo valles de lirio: 83.209,15');

const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
let rid=null;
const ex=await this.helpers.httpRequest({method:'GET',url:SUPA+'/reportes_diarios?select=id&user_id=eq.'+UID+'&fecha=eq.'+today,headers:H,json:true});
if(Array.isArray(ex)&&ex[0]){rid=ex[0].id;
  await this.helpers.httpRequest({method:'PATCH',url:SUPA+'/reportes_diarios?id=eq.'+rid,headers:{...HJ,Prefer:'return=minimal'},body:{moneda:MONEDA,raw_text:text},json:true});
  await this.helpers.httpRequest({method:'DELETE',url:SUPA+'/reporte_items?reporte_id=eq.'+rid,headers:{...H,Prefer:'return=minimal'},json:true});
}else{
  const ins=await this.helpers.httpRequest({method:'POST',url:SUPA+'/reportes_diarios',headers:{...HJ,Prefer:'return=representation'},body:{user_id:UID,fecha:today,moneda:MONEDA,raw_text:text},json:true});
  rid=Array.isArray(ins)?ins[0].id:ins.id;
}
const rows=items.map(it=>({reporte_id:rid,user_id:UID,nombre:it.nombre,signo:it.signo,monto:it.monto,orden:it.orden}));
await this.helpers.httpRequest({method:'POST',url:SUPA+'/reporte_items',headers:{...HJ,Prefer:'return=minimal'},body:rows,json:true});

const total=items.reduce((a,it)=>a+it.signo*it.monto,0);
const fmt=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:MONEDA,minimumFractionDigits:2}).format(n);
const detail=items.map(it=>`${it.signo===1?'➕':'➖'} ${it.nombre}: ${it.found?fmt(it.monto):'—'}`).join('\n');
const faltan=items.filter(it=>!it.found).map(it=>it.nombre);
let m=`🧾 *Reporte diario guardado* (${today})\n\n${detail}\n\n*TOTAL: ${fmt(total)}*`;
if(faltan.length) m+=`\n\n⚠️ Sin dato (en 0): ${faltan.join(', ')}`;
return reply(m);
""".strip().replace('__SR__', SR).replace('__SUPA__', SUPA).replace('__UID__', UID).replace('__MON__', MONEDA)

wf = {
    'name': 'MyBudget - Reporte diario por Telegram',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'trg', 'name': 'Recibir Telegram', 'type': 'n8n-nodes-base.telegramTrigger', 'typeVersion': 1.1,
         'position': [240, 300], 'parameters': {'updates': ['message'], 'additionalFields': {}}, 'credentials': TG},
        {'id': 'code', 'name': 'Guardar reporte', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [480, 300], 'parameters': {'jsCode': code}},
        {'id': 'rep', 'name': 'Responder Telegram', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [720, 300], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}',
             'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Recibir Telegram': {'main': [[{'node': 'Guardar reporte', 'type': 'main', 'index': 0}]]},
        'Guardar reporte': {'main': [[{'node': 'Responder Telegram', 'type': 'main', 'index': 0}]]},
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
