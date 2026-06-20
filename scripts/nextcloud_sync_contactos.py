"""Sincroniza contactos de Nextcloud (CardDAV) → tabla contactos (1 vía).
Lee NEXTCLOUD_URL/USER/PASS y SUPABASE_SERVICE_ROLE_KEY de .env.
Idempotente: empareja por nc_uid (inserta nuevos, actualiza existentes)."""
import json, base64, urllib.request, urllib.error, re
import xml.etree.ElementTree as ET

def env(k):
    for line in open('.env', encoding='utf-8'):
        if line.startswith(k + '='):
            return line.split('=', 1)[1].strip()
    return None

NC_URL = (env('NEXTCLOUD_URL') or '').rstrip('/')
NC_USER = env('NEXTCLOUD_USER')
NC_PASS = env('NEXTCLOUD_PASS')
SR = env('SUPABASE_SERVICE_ROLE_KEY')
UID = '2600227a-e1d2-4995-aa23-0ec46958002a'
REST = 'https://tdwfsftgcbktekgknduj.supabase.co/rest/v1'

AUTH = 'Basic ' + base64.b64encode(f'{NC_USER}:{NC_PASS}'.encode()).decode()

def dav(method, url, body=None, depth='1'):
    headers = {'Authorization': AUTH, 'Depth': depth, 'Content-Type': 'application/xml; charset=utf-8', 'User-Agent': 'curl/8.4.0'}
    req = urllib.request.Request(url, data=(body.encode() if body else None), method=method, headers=headers)
    with urllib.request.urlopen(req) as r:
        return r.read().decode('utf-8', 'replace')

def supa(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {'apikey': SR, 'Authorization': 'Bearer ' + SR, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0', 'Prefer': 'return=representation'}
    req = urllib.request.Request(REST + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or '[]')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

DAVNS = '{DAV:}'
CARDNS = '{urn:ietf:params:xml:ns:carddav}'

def find_addressbooks():
    home = f'{NC_URL}/remote.php/dav/addressbooks/users/{NC_USER}/'
    xml = dav('PROPFIND', home, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>', depth='1')
    root = ET.fromstring(xml)
    books = []
    for resp in root.findall(f'{DAVNS}response'):
        href = resp.find(f'{DAVNS}href').text
        rtype = resp.find(f'.//{DAVNS}resourcetype')
        is_ab = rtype is not None and rtype.find(f'{CARDNS}addressbook') is not None
        if is_ab:
            books.append(href)
    return books

def fetch_vcards(book_href):
    url = NC_URL + book_href if book_href.startswith('/') else book_href
    body = '<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><c:address-data/></d:prop></c:addressbook-query>'
    xml = dav('REPORT', url, body, depth='1')
    root = ET.fromstring(xml)
    out = []
    for resp in root.findall(f'{DAVNS}response'):
        etag_el = resp.find(f'.//{DAVNS}getetag')
        data_el = resp.find(f'.//{CARDNS}address-data')
        if data_el is not None and data_el.text:
            out.append((etag_el.text if etag_el is not None else None, data_el.text))
    return out

def unfold(vcard):
    return re.sub(r'\r?\n[ \t]', '', vcard)

def prop(vcard, name):
    # devuelve el valor de la primera línea cuyo nombre de propiedad == name
    for line in unfold(vcard).split('\n'):
        if ':' not in line:
            continue
        head, val = line.split(':', 1)
        pname = head.split(';')[0].strip().upper()
        if pname == name:
            return val.strip().replace('\\,', ',').replace('\\n', ' ').replace('\\;', ';')
    return None

def parse_vcard(vcard):
    fn = prop(vcard, 'FN')
    uid = prop(vcard, 'UID')
    if not fn or not uid:
        # nombre desde N si no hay FN
        n = prop(vcard, 'N')
        if n and not fn:
            parts = [p for p in n.split(';') if p]
            fn = ' '.join(reversed(parts[:2])).strip() or n
    return {
        'nc_uid': uid,
        'nombre': fn or '(sin nombre)',
        'email': prop(vcard, 'EMAIL'),
        'telefono': prop(vcard, 'TEL'),
        'empresa': prop(vcard, 'ORG'),
        'notas': prop(vcard, 'NOTE'),
    }

def main():
    if not NC_USER:
        raise SystemExit('Falta NEXTCLOUD_USER en .env')
    books = find_addressbooks()
    print('Libretas encontradas:', books)
    total_new = total_upd = 0
    for b in books:
        cards = fetch_vcards(b)
        print(f'  {b}: {len(cards)} contactos')
        for etag, vcard in cards:
            c = parse_vcard(vcard)
            if not c['nc_uid']:
                continue
            # ¿existe?
            st, ex = supa('GET', f"/contactos?select=id&user_id=eq.{UID}&nc_uid=eq.{urllib.parse.quote(c['nc_uid'])}")
            payload = {**c, 'origen': 'nextcloud', 'nc_etag': etag, 'user_id': UID, 'updated_at': '__now__'}
            payload = {k: v for k, v in payload.items() if v != '__now__'}
            if isinstance(ex, list) and ex:
                supa('PATCH', f"/contactos?id=eq.{ex[0]['id']}", {k: payload[k] for k in ('nombre', 'email', 'telefono', 'empresa', 'notas', 'nc_etag')})
                total_upd += 1
            else:
                supa('POST', '/contactos', payload)
                total_new += 1
    print(f'\nLISTO. Nuevos: {total_new} · Actualizados: {total_upd}')

if __name__ == '__main__':
    import urllib.parse
    main()
