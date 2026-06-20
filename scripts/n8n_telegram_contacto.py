"""Bot de Telegram para guardar contactos en Nextcloud.
Mensaje libre -> OpenRouter estructura -> crea vCard en Nextcloud (CardDAV)
+ upsert en contactos -> responde. Corre en la IP de n8n."""
import json, urllib.request, urllib.error

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
NC_URL = (env('NEXTCLOUD_URL') or '').rstrip('/'); NC_USER = env('NEXTCLOUD_USER'); NC_PASS = env('NEXTCLOUD_PASS')
TOKEN = env('TG_CONTACTO_BOT_TOKEN')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
REST = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
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

# Credencial del bot nuevo
st, res = api('POST', '/credentials', {'name': 'Telegram Contactos', 'type': 'telegramApi', 'data': {'accessToken': TOKEN, 'baseUrl': 'https://api.telegram.org'}})
cred_id = res.get('id') if isinstance(res, dict) else None
print('CREDENCIAL:', cred_id, st)
if not cred_id:
    raise SystemExit(f'No se creó la credencial: {res}')
TG = {'telegramApi': {'id': cred_id, 'name': 'Telegram Contactos'}}

preparar = r"""
const item=$input.first(); const msg=item.json.message||{};
const chatId=msg.chat&&msg.chat.id;
const text=(msg.text||msg.caption||'').trim();
const system=`Extrae los datos de UN contacto del mensaje y devuelve SOLO JSON válido:
{"accion":"guardar"|"ignorar","nombre":"","telefono":"","email":"","empresa":"","notas":"","fecha_nacimiento":"YYYY-MM-DD o null"}.
- "ignorar" si el mensaje no contiene un contacto (saludos, comandos, etc.).
- nombre es obligatorio si accion="guardar".
- fecha_nacimiento: si dan día/mes sin año, usa 1900 (ej "cumple 12 de mayo" -> "1900-05-12"). Devuelve siempre formato YYYY-MM-DD o null.
- telefono solo dígitos/+, sin espacios.`;
const body={model:'openai/gpt-4o-mini',max_tokens:300,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:text||'(vacío)'}]};
return [{json:{requestBody:JSON.stringify(body),chatId}}];
""".strip()

guardar = r"""
const NC_URL='__NCURL__'; const NC_USER='__NCUSER__'; const NC_PASS='__NCPASS__';
const SR='__SR__'; const REST='__REST__'; const UID='__UID__';
const prep=$('Preparar').first().json; const chatId=prep.chatId;
const reply=(m)=>[{json:{chatId,message:m}}];
const auth='Basic '+Buffer.from(NC_USER+':'+NC_PASS).toString('base64');
const DAV={Authorization:auth};
const SHJ={apikey:SR,Authorization:'Bearer '+SR,'Content-Type':'application/json'};

let p={}; try{ p=JSON.parse($input.first().json.choices[0].message.content); }catch(e){}
const nombre=(p.nombre||'').toString().trim();
if(p.accion!=='guardar' || !nombre) return reply('🤔 No encontré un contacto. Mándame algo como:\n*Juan Pérez, 3001234567, juan@mail.com, cumple 12/05*');

// libreta
const home=NC_URL+'/remote.php/dav/addressbooks/users/'+NC_USER+'/';
const pf='<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/></d:prop></d:propfind>';
let book=null;
try{ const xml=await this.helpers.httpRequest({method:'PROPFIND',url:home,headers:{...DAV,'Content-Type':'application/xml','Depth':'1'},body:pf,json:false});
  for(const bl of String(xml).split(/<[a-z0-9]*:?response>/i).slice(1)){ if(/addressbook/i.test(bl)){ const m=bl.match(/<[a-z0-9]*:?href>([^<]+)<\/[a-z0-9]*:?href>/i); if(m){ if(/\/contacts\/?$/i.test(m[1])){book=m[1];break;} if(!book)book=m[1]; } } }
}catch(e){}
if(!book) book='/remote.php/dav/addressbooks/users/'+NC_USER+'/contacts/';
const bookUrl=book.startsWith('http')?book:NC_URL+book;

const uid=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():('mb-'+Date.now());
const esc=s=>String(s||'').replace(/([,;\\])/g,'\\$1').replace(/\r?\n/g,'\\n');
const lines=['BEGIN:VCARD','VERSION:3.0','UID:'+uid,'FN:'+esc(nombre),'N:'+esc(nombre)+';;;;'];
if(p.telefono) lines.push('TEL;TYPE=CELL:'+esc(p.telefono));
if(p.email) lines.push('EMAIL;TYPE=INTERNET:'+esc(p.email));
if(p.empresa) lines.push('ORG:'+esc(p.empresa));
if(p.notas) lines.push('NOTE:'+esc(p.notas));
if(p.fecha_nacimiento){ const m=String(p.fecha_nacimiento).match(/^(\d{4})-(\d{2})-(\d{2})/); if(m){ lines.push(m[1]==='1900'?('BDAY:--'+m[2]+m[3]):('BDAY:'+m[1]+'-'+m[2]+'-'+m[3])); } }
const vcard=lines.join('\r\n')+'\r\nEND:VCARD\r\n';

try{ await this.helpers.httpRequest({method:'PUT',url:bookUrl+uid+'.vcf',headers:{...DAV,'Content-Type':'text/vcard; charset=utf-8'},body:vcard}); }
catch(e){ return reply('⚠️ No pude guardar en Nextcloud: '+(e.message||e)); }

const c={nombre,email:p.email||null,telefono:p.telefono||null,empresa:p.empresa||null,notas:p.notas||null,fecha_nacimiento:p.fecha_nacimiento||null};
await this.helpers.httpRequest({method:'POST',url:REST+'/contactos',headers:{...SHJ,Prefer:'return=minimal'},body:{...c,user_id:UID,origen:'nextcloud',nc_uid:uid},json:true});

let m='✅ *Contacto guardado en Nextcloud*\n\n*'+nombre+'*';
if(p.telefono) m+='\n📱 '+p.telefono;
if(p.email) m+='\n✉️ '+p.email;
if(p.empresa) m+='\n🏢 '+p.empresa;
if(p.fecha_nacimiento) m+='\n🎂 '+p.fecha_nacimiento;
return reply(m);
""".strip().replace('__NCURL__', NC_URL).replace('__NCUSER__', NC_USER).replace('__NCPASS__', NC_PASS).replace('__SR__', SR).replace('__REST__', REST).replace('__UID__', UID)

wf = {
    'name': 'MyBudget - Guardar contacto por Telegram',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'trg', 'name': 'Recibir Telegram', 'type': 'n8n-nodes-base.telegramTrigger', 'typeVersion': 1.1,
         'position': [240, 300], 'parameters': {'updates': ['message'], 'additionalFields': {}}, 'credentials': TG},
        {'id': 'prep', 'name': 'Preparar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [460, 300], 'parameters': {'jsCode': preparar}},
        {'id': 'ia', 'name': 'OpenRouter', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2,
         'position': [680, 300], 'parameters': {
             'method': 'POST', 'url': 'https://openrouter.ai/api/v1/chat/completions',
             'authentication': 'predefinedCredentialType', 'nodeCredentialType': 'openRouterApi',
             'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json.requestBody }}',
             'options': {'response': {'response': {'responseFormat': 'json'}}, 'timeout': 60000}},
         'credentials': OR_CRED},
        {'id': 'save', 'name': 'Guardar', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [900, 300], 'parameters': {'jsCode': guardar}},
        {'id': 'rep', 'name': 'Responder', 'type': 'n8n-nodes-base.telegram', 'typeVersion': 1.2,
         'position': [1120, 300], 'parameters': {'chatId': '={{ $json.chatId }}', 'text': '={{ $json.message }}', 'additionalFields': {'parse_mode': 'Markdown'}}, 'credentials': TG},
    ],
    'connections': {
        'Recibir Telegram': {'main': [[{'node': 'Preparar', 'type': 'main', 'index': 0}]]},
        'Preparar': {'main': [[{'node': 'OpenRouter', 'type': 'main', 'index': 0}]]},
        'OpenRouter': {'main': [[{'node': 'Guardar', 'type': 'main', 'index': 0}]]},
        'Guardar': {'main': [[{'node': 'Responder', 'type': 'main', 'index': 0}]]},
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
    ast, _ = api('POST', f'/workflows/{wid}/activate'); print(f'activar -> {ast}')
