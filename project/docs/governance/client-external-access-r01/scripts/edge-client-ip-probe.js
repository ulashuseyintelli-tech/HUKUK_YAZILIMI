'use strict';
// IZOLE ISTEMCI-IP PROVASI — Cloudflare → cloudflared → Caddy → API zincirinde uygulamanin
// hangi IP'yi kullandigini ve hiz sinirinin ayrisip ayrismadigini olcer.
//
// SINIR: Cloudflare kenarinin `CF-Connecting-IP` basligini istemciden gelse bile kendi
// degeriyle EZDIGI, saglayici belgesine dayanir; bu provada OLCULMEZ. Burada olculen,
// kenardan (Caddy) itibaren zincirin davranisidir: Caddy'ye ULASAN basliklarin urun
// tarafinda nasil sonuclandigi.
const http = require('http');

const EDGE_PORT = Number(process.argv[2] || 8085);
// Opsiyonel: PUBLIC_INTAKE_TRUSTED_PROXY_IPS BOS olan ikinci arka ucun portu (I-7 icin).
const STRICT_PORT = Number(process.argv[3] || 0);

function normalize(v) {
  const s = String(v || '').trim();
  return s.startsWith('::ffff:') ? s.slice('::ffff:'.length) : s;
}

function direct(port, headers) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/api/public/intake/TKN123', headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    });
    r.on('error', (e) => resolve({ error: e.message }));
    r.end();
  });
}

function req(headers) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port: EDGE_PORT, method: 'GET', path: '/api/public/intake/TKN123',
        headers: Object.assign({ host: 'form.tellihukuk.com' }, headers) },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ status: res.statusCode }); } });
      },
    );
    r.on('error', (e) => resolve({ error: e.message }));
    r.end();
  });
}

const rows = [];
function check(id, desc, ok, gozlem) { rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem }); }

(async () => {
  // I-1: tunel basligi varsa urun GERCEK istemci adresini kullanir
  const a = await req({ 'cf-connecting-ip': '203.0.113.9' });
  check('I-1', 'tunel basligi varsa urun gercek istemci adresini cozer',
    a.resolvedClientIp === '203.0.113.9' && a.xff === '203.0.113.9',
    `xff=${a.xff} resolved=${a.resolvedClientIp} peer=${a.peer}`);

  // I-2: istemcinin GONDERDIGI sahte XFF kenarda atilir, urun onu GORMEZ
  const b = await req({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' });
  check('I-2', 'istemcinin sahte X-Forwarded-For degeri urune ULASMAZ',
    b.xff === '203.0.113.9' && b.resolvedClientIp === '203.0.113.9'
      && !String(b.xff).includes('9.9.9.9') && !String(b.xff).includes('8.8.8.8'),
    `gonderilen="9.9.9.9, 8.8.8.8" urunun gordugu="${b.xff}" resolved=${b.resolvedClientIp}`);

  // I-3: iki FARKLI istemci -> hiz siniri anahtari FARKLI (tek proxy IP'sinde toplanmaz)
  const c1 = await req({ 'cf-connecting-ip': '203.0.113.10' });
  const c2 = await req({ 'cf-connecting-ip': '198.51.100.20' });
  check('I-3', 'farkli istemciler AYRI hiz siniri sayacina duser',
    c1.rateLimitIpHash !== c2.rateLimitIpHash && c1.resolvedClientIp === '203.0.113.10' && c2.resolvedClientIp === '198.51.100.20',
    `${c1.resolvedClientIp}->${String(c1.rateLimitIpHash).slice(0, 12)} · ${c2.resolvedClientIp}->${String(c2.rateLimitIpHash).slice(0, 12)}`);

  // I-4: AYNI istemcinin iki istegi AYNI sayaca duser (sinir gercekten uygulanabilir)
  const d1 = await req({ 'cf-connecting-ip': '203.0.113.10' });
  check('I-4', 'ayni istemcinin istekleri AYNI sayaca duser',
    d1.rateLimitIpHash === c1.rateLimitIpHash,
    `hash esit=${d1.rateLimitIpHash === c1.rateLimitIpHash}`);

  // I-5: istemci sahte CF-Connecting-IP ile BASKA bir kimlige burunemez mi?
  // Kenardan sonraki zincirde bu baslik tek kaynaktir; saglayicinin ezmesi belgeye dayanir.
  // Burada olculen: baslik CIFT gonderildiginde urun TEK ve ILK degeri gorur, liste olusmaz.
  const e = await req({ 'cf-connecting-ip': '203.0.113.9', 'X-Forwarded-For': '203.0.113.9, 1.1.1.1' });
  check('I-5', 'baslik listeye cevrilemez; urun tek deger gorur',
    String(e.xff).split(',').length === 1 && e.resolvedClientIp === '203.0.113.9',
    `urunun gordugu xff="${e.xff}"`);

  // I-6: tunel basligi YOKSA kenar KENDI gordugu es adresi yazar; istemcinin gonderdigi
  // deger kullanilmaz. NOT: kenarin gordugu es adres ile arka ucun gordugu es adres FARKLI
  // hop'lardir (provada Caddy konteyner agi arkasindadir); esitlik BEKLENMEZ.
  const f = await req({ 'x-forwarded-for': '9.9.9.9' });
  const tekDeger = String(f.xff || '').split(',').length === 1;
  check('I-6', 'tunel basligi yoksa sahte deger kullanilmaz, kenar tek deger yazar',
    !String(f.xff).includes('9.9.9.9') && tekDeger && f.resolvedClientIp !== '9.9.9.9',
    `gonderilen=9.9.9.9 · kenarin yazdigi=${f.xff} · urunun cozdugu=${f.resolvedClientIp}`);

  // I-7: guven siniri — peer allowlist'te DEGILSE urun XFF'i HIC dikkate almaz.
  // Bu kontrol kenar zincirinin DISINDADIR: allowlist'i BOS olan ikinci arka uca dogrudan
  // istek atilir (argv[3] ile port verilir), Caddy uzerinden gecmez.
  if (STRICT_PORT) {
    const g = await direct(STRICT_PORT, { 'x-forwarded-for': '7.7.7.7' });
    check('I-7', "peer allowlist'te degilse urun XFF'i yok sayar, es adresi kullanir",
      g.resolvedClientIp !== '7.7.7.7' && g.resolvedClientIp === normalize(g.peer),
      `xff=7.7.7.7 peer=${g.peer} resolved=${g.resolvedClientIp}`);
  } else {
    check('I-7', "peer allowlist'te degilse urun XFF'i yok sayar", false, 'OLCULEMEDI: allowlist-bos arka uc portu verilmedi');
  }

  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(JSON.stringify({ toplam: rows.length, pass: rows.length - fail, fail, rows }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})();
