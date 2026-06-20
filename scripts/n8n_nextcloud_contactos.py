"""Crea en n8n el workflow que sincroniza Contactos desde Nextcloud (CardDAV).
Corre desde la IP de n8n (evita el anti-fuerza-bruta del IP local).
Disparadores: webhook (run manual) + cron diario 05:00.
Secretos van embebidos en el Code node (leídos de .env); el archivo
commiteado NO contiene secretos (los lee de .env en tiempo de creación)."""
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
WEBHOOK_PATH = 'nextcloud-sync-9f2a1c'

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
const DAV={Authorization:auth,'Content-Type':'application/xml; charset=utf-8'};
const SH={apikey:SR,Authorization:'Bearer '+SR};
const SHJ={...SH,'Content-Type':'application/json'};

const unescapeXml=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

// 1) Listar libretas de direcciones
const home=NC_URL+'/remote.php/dav/addressbooks/users/'+NC_USER+'/';
const pfBody='<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/></d:prop></d:propfind>';
const homeXml=await this.helpers.httpRequest({method:'PROPFIND',url:home,headers:{...DAV,Depth:'1'},body:pfBody,json:false});
const books=[];
for(const block of String(homeXml).split(/<[a-z0-9]*:?response>/i).slice(1)){
  if(/addressbook/i.test(block)){
    const m=block.match(/<[a-z0-9]*:?href>([^<]+)<\/[a-z0-9]*:?href>/i);
    if(m && !/\/$/.test(m[1])===false) books.push(m[1]);
  }
}
// dedup
const abs=[...new Set(books)];

const vprop=(vcard,name)=>{
  const uf=vcard.replace(/\r?\n[ \t]/g,'');
  for(const line of uf.split(/\r?\n/)){
    const i=line.indexOf(':'); if(i<0) continue;
    const pn=line.slice(0,i).split(';')[0].trim().toUpperCase();
    if(pn===name) return line.slice(i+1).trim().replace(/\\,/g,',').replace(/\\n/gi,' ').replace(/\\;/g,';');
  }
  return null;
};

let nuevos=0, actualizados=0, leidos=0;
const rep='<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop></c:addressbook-query>';
for(const href of abs){
  const url=href.startsWith('http')?href:NC_URL+href;
  let xml;
  try{ xml=await this.helpers.httpRequest({method:'REPORT',url,headers:{...DAV,Depth:'1'},body:rep,json:false}); }catch(e){ continue; }
  const re=/<[a-z0-9]*:?address-data[^>]*>([\s\S]*?)<\/[a-z0-9]*:?address-data>/gi;
  let m;
  while((m=re.exec(String(xml)))!==null){
    const vcard=unescapeXml(m[1]).trim();
    if(!/BEGIN:VCARD/i.test(vcard)) continue;
    leidos++;
    let fn=vprop(vcard,'FN'); const uid=vprop(vcard,'UID');
    if(!uid) continue;
    if(!fn){ const n=vprop(vcard,'N'); if(n){ const p=n.split(';').filter(Boolean); fn=[p[1],p[0]].filter(Boolean).join(' ').trim()||n; } }
    const c={nombre:fn||'(sin nombre)',email:vprop(vcard,'EMAIL'),telefono:vprop(vcard,'TEL'),empresa:vprop(vcard,'ORG'),notas:vprop(vcard,'NOTE')};
    const ex=await this.helpers.httpRequest({method:'GET',url:REST+'/contactos?select=id&user_id=eq.'+UID+'&nc_uid=eq.'+encodeURIComponent(uid),headers:SH,json:true});
    if(Array.isArray(ex)&&ex[0]){
      await this.helpers.httpRequest({method:'PATCH',url:REST+'/contactos?id=eq.'+ex[0].id,headers:{...SHJ,Prefer:'return=minimal'},body:c,json:true});
      actualizados++;
    }else{
      await this.helpers.httpRequest({method:'POST',url:REST+'/contactos',headers:{...SHJ,Prefer:'return=minimal'},body:{...c,user_id:UID,origen:'nextcloud',nc_uid:uid},json:true});
      nuevos++;
    }
  }
}
return [{json:{libretas:abs.length, leidos, nuevos, actualizados}}];
""".strip().replace('__NCURL__', NC_URL).replace('__NCUSER__', NC_USER).replace('__NCPASS__', NC_PASS).replace('__SR__', SR).replace('__REST__', REST).replace('__UID__', UID)

wf = {
    'name': 'MyBudget - Sync Contactos Nextcloud',
    'settings': {'executionOrder': 'v1'},
    'nodes': [
        {'id': 'wh', 'name': 'Run manual (webhook)', 'type': 'n8n-nodes-base.webhook', 'typeVersion': 2,
         'position': [240, 240], 'webhookId': WEBHOOK_PATH,
         'parameters': {'httpMethod': 'POST', 'path': WEBHOOK_PATH, 'responseMode': 'lastNode', 'options': {}}},
        {'id': 'cron', 'name': 'Diario 05:00', 'type': 'n8n-nodes-base.scheduleTrigger', 'typeVersion': 1.2,
         'position': [240, 420], 'parameters': {'rule': {'interval': [{'triggerAtHour': 5}]}}},
        {'id': 'code', 'name': 'Sync CardDAV', 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
         'position': [520, 320], 'parameters': {'jsCode': code}},
    ],
    'connections': {
        'Run manual (webhook)': {'main': [[{'node': 'Sync CardDAV', 'type': 'main', 'index': 0}]]},
        'Diario 05:00': {'main': [[{'node': 'Sync CardDAV', 'type': 'main', 'index': 0}]]},
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
print('WEBHOOK:', BASE + '/webhook/' + WEBHOOK_PATH)
