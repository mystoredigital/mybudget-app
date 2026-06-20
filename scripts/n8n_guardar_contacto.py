"""Crea en n8n el webhook 'guardar-contacto': recibe JSON con los datos
de un contacto, crea la vCard en Nextcloud (CardDAV PUT) y hace upsert
en la tabla contactos. Lo usan la app (botón) y el bot de Telegram.
Corre desde la IP de n8n (sin el throttle del IP local)."""
import json, urllib.request, urllib.error

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

BASE = env('N8N_BASE_URL'); KEY = env('N8N_API_KEY'); SR = env('SUPABASE_SERVICE_ROLE_KEY')
NC_URL = (env('NEXTCLOUD_URL') or '').rstrip('/'); NC_USER = env('NEXTCLOUD_USER'); NC_PASS = env('NEXTCLOUD_PASS')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
REST = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'
WEBHOOK_PATH = 'guardar-contacto-3b8e1d'

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

code = r"""
const NC_URL='__NCURL__'; const NC_USER='__NCUSER__'; const NC_PASS='__NCPASS__';
const SR='__SR__'; const REST='__REST__'; const UID='__UID__';
const auth='Basic '+Buffer.from(NC_USER+':'+NC_PASS).toString('base64');
const DAV={Authorization:auth};
const SHJ={apikey:SR,Authorization:'Bearer '+SR,'Content-Type':'application/json'};
const b=($input.first().json.body)||$input.first().json;
const reply=(o)=>[{json:o}];
const nombre=(b.nombre||'').toString().trim();
if(!nombre) return reply({ok:false,error:'nombre requerido'});

// 1) Elegir libreta (la default 'contacts' si existe, si no la primera)
const home=NC_URL+'/remote.php/dav/addressbooks/users/'+NC_USER+'/';
const pf='<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/></d:prop></d:propfind>';
let book=null;
try{
  const xml=await this.helpers.httpRequest({method:'PROPFIND',url:home,headers:{...DAV,'Content-Type':'application/xml','Depth':'1'},body:pf,json:false});
  for(const bl of String(xml).split(/<[a-z0-9]*:?response>/i).slice(1)){
    if(/addressbook/i.test(bl)){ const m=bl.match(/<[a-z0-9]*:?href>([^<]+)<\/[a-z0-9]*:?href>/i);
      if(m){ if(/\/contacts\/?$/i.test(m[1])){book=m[1];break;} if(!book)book=m[1]; } }
  }
}catch(e){}
if(!book) book='/remote.php/dav/addressbooks/users/'+NC_USER+'/contacts/';
const bookUrl=book.startsWith('http')?book:NC_URL+book;

// 2) Construir vCard
const uid=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():('mb-'+Date.now());
const esc=s=>String(s||'').replace(/([,;\\])/g,'\\$1').replace(/\r?\n/g,'\\n');
const lines=['BEGIN:VCARD','VERSION:3.0','UID:'+uid,'FN:'+esc(nombre),'N:'+esc(nombre)+';;;;'];
if(b.telefono) lines.push('TEL;TYPE=CELL:'+esc(b.telefono));
if(b.email) lines.push('EMAIL;TYPE=INTERNET:'+esc(b.email));
if(b.empresa) lines.push('ORG:'+esc(b.empresa));
if(b.notas) lines.push('NOTE:'+esc(b.notas));
if(b.fecha_nacimiento){ const m=String(b.fecha_nacimiento).match(/^(\d{4})-(\d{2})-(\d{2})/); if(m){ lines.push(m[1]==='1900'?('BDAY:--'+m[2]+m[3]):('BDAY:'+m[1]+'-'+m[2]+'-'+m[3])); } }
const vcard=lines.join('\r\n')+'\r\nEND:VCARD\r\n';

// 3) PUT en Nextcloud
await this.helpers.httpRequest({method:'PUT',url:bookUrl+uid+'.vcf',headers:{...DAV,'Content-Type':'text/vcard; charset=utf-8'},body:vcard});

// 4) Upsert en contactos
const c={nombre,email:b.email||null,telefono:b.telefono||null,empresa:b.empresa||null,notas:b.notas||null,fecha_nacimiento:b.fecha_nacimiento||null};
if(b.id){ await this.helpers.httpRequest({method:'PATCH',url:REST+'/contactos?id=eq.'+b.id,headers:{...SHJ,Prefer:'return=minimal'},body:{...c,origen:'nextcloud',nc_uid:uid},json:true}); }
else { await this.helpers.httpRequest({method:'POST',url:REST+'/contactos',headers:{...SHJ,Prefer:'return=minimal'},body:{...c,user_id:UID,origen:'nextcloud',nc_uid:uid},json:true}); }

return reply({ok:true,nc_uid:uid,nombre});
""".strip().replace('__NCURL__', NC_URL).replace('__NCUSER__', NC_USER).replace('__NCPASS__', NC_PASS).replace('__SR__', SR).replace('__REST__', REST).replace('__UID__', UID)

wf = {
    'name': 'MyBudget - Guardar contacto en Nextcloud',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'wh', 'name': 'Webhook', 'type': 'n8n-nodes-base.webhook', 'typeVersion': 2,
         'position': [260, 300], 'webhookId': WEBHOOK_PATH,
         'parameters': {'httpMethod': 'POST', 'path': WEBHOOK_PATH, 'responseMode': 'lastNode',
                        'options': {'allowedOrigins': '*'}}},
        {'id': 'code', 'name': 'Crear en Nextcloud', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [520, 300], 'parameters': {'jsCode': code}},
    ],
    'connections': {'Webhook': {'main': [[{'node': 'Crear en Nextcloud', 'type': 'main', 'index': 0}]]}},
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
print('WEBHOOK:', BASE + '/webhook/' + WEBHOOK_PATH)
