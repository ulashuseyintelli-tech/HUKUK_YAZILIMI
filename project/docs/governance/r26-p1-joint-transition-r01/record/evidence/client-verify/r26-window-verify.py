"""R26 PENCERE A — CLIENT BAĞIMSIZ DOĞRULAYICI (salt okuma).
Aşama kapısının (r26p1-stage-gate.ps1) betiğini KULLANMAZ; kendi tarifiyle ölçer ve kapı JSON'uyla karşılaştırır.
Ölçer: başlatıcı üçlüsü + değişmeyen bin dosyaları · API dist ve WEB .next tam ağaç digest (Ordinal; relpath NUL
BÜYÜK-sha LF) · BUILD_ID · next.config.js · .env sha (İÇERİK OKUNMAZ, yalnız bayt sha) · görevler (etkin/durum) ·
:8080/:3002 dinleyici sahibinin kökü. HTTP/DB/yazma YOK (yalnız -o ile verilen kanıt JSON'u yazılır).
Kullanım: python r26-window-verify.py <S0|S1|S2|S3> [--gate <gate.json>] [--running] -o <cikti.json>
"""
import argparse, hashlib, json, os, subprocess, sys, datetime

ROOT = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE23/project'
BIN = 'C:/Ops/hukuk/bin'
TUPLES = {
    'P1-ONCESI': ('CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3', '691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627'),
    'P1-SONRASI': ('DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C', '27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB'),
}
WEB_LAUNCHER = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0'
ENV_PIN = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
APPS = {
    'R25B': {'api': '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E', 'web': 'F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1',
             'bid': 'dOiGPj2M0Abls0kCibY4r', 'cfg': '4AD4915C0A741AF609CCD241DFE08EF2C76A17E2175E3BD1FB7AE925128EF750'},
    'R26': {'api': 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0', 'web': 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326',
            'bid': '5waeMoFGGMTLAYmn9oJvW', 'cfg': 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'},
}
STAGES = {'S0': ('P1-ONCESI', 'R25B'), 'S1': ('P1-ONCESI', 'R26'), 'S2': ('P1-SONRASI', 'R26'), 'S3': ('P1-SONRASI', 'R25B')}
GATE_SHA = '214465BBF85400B73BF7928036B1B3BF79D439249321A2C30C14C976A2155200'


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest().upper()


def tree(root, web=False):
    m = {}
    for dp, dn, fn in os.walk(root):
        for f in fn:
            rel = os.path.relpath(os.path.join(dp, f), root).replace('\\', '/')
            if web and (rel.startswith('cache/') or rel == 'trace'):
                continue
            m[rel] = sha(os.path.join(dp, f))
    keys = sorted(m, key=lambda s: s.encode('utf-16-be'))
    return hashlib.sha256(''.join(k + '\0' + m[k] + '\n' for k in keys).encode('utf-8')).hexdigest().upper(), len(m)


def ps(cmd):
    r = subprocess.run(['powershell.exe', '-NoProfile', '-Command', cmd], capture_output=True, text=True, timeout=120)
    return r.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=list(STAGES))
    ap.add_argument('--gate')
    ap.add_argument('--running', action='store_true')
    ap.add_argument('-o', required=True)
    a = ap.parse_args()
    if os.path.exists(a.o):
        sys.exit('cikti zaten var: ' + a.o)
    tname, aname = STAGES[a.stage]
    exp_api_l, exp_host = TUPLES[tname]
    app = APPS[aname]
    rows = []
    def chk(i, ok, actual, expected):
        rows.append({'id': i, 'ok': bool(ok), 'actual': actual, 'expected': expected})
    chk('B-1 start-api.ps1', sha(BIN + '/start-api.ps1') == exp_api_l, sha(BIN + '/start-api.ps1'), exp_api_l)
    chk('B-2 hukuk-task-host.exe', sha(BIN + '/hukuk-task-host.exe') == exp_host, sha(BIN + '/hukuk-task-host.exe'), exp_host)
    chk('B-3 start-web.ps1', sha(BIN + '/start-web.ps1') == WEB_LAUNCHER, sha(BIN + '/start-web.ps1'), WEB_LAUNCHER)
    for f in ('db-readiness.js', 'pwsh-file-manifest.json'):
        rows.append({'id': 'B-sabit ' + f, 'ok': None, 'actual': sha(BIN + '/' + f), 'expected': 'kapi JSON ile karsilastirilir'})
    ad, an = tree(ROOT + '/apps/api/dist/apps/api/src')
    chk('U-1 API dist', ad == app['api'], f'{ad} ({an} dosya)', app['api'])
    wd, wn = tree(ROOT + '/apps/web/.next', web=True)
    chk('U-2 WEB .next', wd == app['web'], f'{wd} ({wn} dosya)', app['web'])
    bid = open(ROOT + '/apps/web/.next/BUILD_ID').read().strip()
    chk('U-3 BUILD_ID', bid == app['bid'], bid, app['bid'])
    cf = sha(ROOT + '/apps/web/next.config.js')
    chk('U-4 next.config.js', cf == app['cfg'], cf, app['cfg'])
    es = sha(ROOT + '/apps/api/.env')
    chk('E-1 .env sha (icerik okunmadi)', es == ENV_PIN, es, ENV_PIN)
    tasks = ps("Get-ScheduledTask -TaskName 'HukukPlatform-API','HukukPlatform-Web' | ForEach-Object { $_.TaskName + '|' + $_.State + '|' + (($_.Actions|ForEach-Object{$_.Execute+' '+$_.Arguments}) -join ';') }")
    tlines = [l for l in tasks.splitlines() if l.strip()]
    tok = len(tlines) == 2 and all('|Disabled|' not in l for l in tlines) and all('hukuk-task-host.exe' in l for l in tlines)
    if a.running:
        tok = tok and all('|Running|' in l for l in tlines)
    chk('G-1 gorevler (etkin' + (', Running' if a.running else '') + ')', tok, tlines, 'iki gorev etkin; eylem hukuk-task-host.exe api/web')
    lis = ps("foreach($p in 8080,3002){ $c=@(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); $cl=''; if($c.Count -eq 1){ $cl=(Get-CimInstance Win32_Process -Filter ('ProcessId='+$c[0])).CommandLine }; '{0}|{1}|{2}' -f $p,$c.Count,($cl -match 'HY_W4_RELEASE23') }")
    llines = [l for l in lis.splitlines() if l.strip()]
    lok = all(l.split('|')[1] == '1' and l.split('|')[2] == 'True' for l in llines) if a.running else True
    chk('L-1 dinleyiciler (tek, kok RELEASE23)' if a.running else 'L-1 dinleyiciler (bilgi)', lok, llines, '8080 ve 3002 tek dinleyici, kok RELEASE23' if a.running else 'bilgi')
    gate_cmp = None
    if a.gate:
        g = json.load(open(a.gate, encoding='utf-8-sig'))
        gate_cmp = {'gateFileSha256': sha(a.gate), 'gateVerdict': g.get('verdict'), 'gateStage': g.get('stage'), 'gateScriptSha256': g.get('scriptSha256'),
                    'stageMatch': g.get('stage') == a.stage, 'scriptPinMatch': g.get('scriptSha256') == GATE_SHA, 'gateTuple': g.get('tuple'), 'gateApp': g.get('app')}
        # kapının ölçtüğü sabit dosyaları kendi ölçümümle karşılaştır
        gmap = {c.get('id'): c for c in g.get('checks', [])}
        for r in rows:
            if r['id'].startswith('B-sabit'):
                name = r['id'].split(' ', 1)[1]
                gc = next((c for c in g.get('checks', []) if name in str(c.get('id', ''))), None)
                r['expected'] = gc.get('expected') if gc else 'KAPIDA YOK'
                r['ok'] = bool(gc) and r['actual'] == gc.get('expected')
        gate_cmp['gateChecks'] = len(gmap)
        gate_cmp['gateFailed'] = [c.get('id') for c in g.get('checks', []) if not c.get('ok')]
    fails = [r['id'] for r in rows if r['ok'] is False]
    ok = not fails and (gate_cmp is None or (gate_cmp['gateVerdict'] == 'PASS' and gate_cmp['stageMatch'] and gate_cmp['scriptPinMatch'] and not gate_cmp['gateFailed']))
    out = {'record': 'R26-WINDOW-A-CLIENT-VERIFY', 'stage': a.stage, 'expectTuple': tname, 'expectApp': aname, 'tsUtc': datetime.datetime.utcnow().isoformat() + 'Z',
           'verdict': 'PASS' if ok else 'FAIL', 'failed': fails, 'gate': gate_cmp, 'rows': rows, 'envContentRead': False}
    os.makedirs(os.path.dirname(os.path.abspath(a.o)), exist_ok=True)
    json.dump(out, open(a.o, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f"{a.stage} ({tname}/{aname}) CLIENT dogrulama: {out['verdict']} · basarisiz={fails}" + (f" · kapi={gate_cmp['gateVerdict']} asama={gate_cmp['gateStage']} pin={gate_cmp['scriptPinMatch']} kapi-basarisiz={gate_cmp['gateFailed']}" if gate_cmp else ''))
    print('cikti sha256=' + sha(a.o))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
