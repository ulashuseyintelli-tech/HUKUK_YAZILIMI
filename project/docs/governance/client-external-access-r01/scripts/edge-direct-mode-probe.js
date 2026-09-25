'use strict';
// DOGRUDAN MOD (Yol A) NEGATIF TESTI — istemci basligiyla kimlik uydurulabiliyor mu?
//
// Zincir: istemci → Caddy (dogrudan) → API. API tarafi taklit DEGIL: express + trust proxy=1
// + CANLI dist'ten `resolvePublicIntakeClientIp` + hiz siniri anahtarinin kendisi.
//
// argv: [2]=dogrudan profil portu  [3]=tunel profili portu (mutasyon karsilastirmasi icin)
const http = require('http');

const DIRECT_PORT = Number(process.argv[2] || 8090);
const TUNNEL_PORT = Number(process.argv[3] || 0);

function req(port, headers) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: '/api/public/intake/TKN123',
        headers: Object.assign({ host: 'form.example.invalid' }, headers) },
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
  // Taban: hicbir baslik gonderilmeden urunun cozdugu adres = gercek es adres.
  const base = await req(DIRECT_PORT, {});
  const gercek = base.resolvedClientIp;
  const gercekHash = base.rateLimitIpHash;

  check('D-0', 'baslik yokken urun es adresi cozer (taban)',
    Boolean(gercek) && gercek !== 'unknown',
    `cozulen=${gercek}`);

  // D-1: SAHTE CF-Connecting-IP — dogrudan modda bu baslik bir ISTEMCI girdisidir.
  const a = await req(DIRECT_PORT, { 'cf-connecting-ip': '203.0.113.99' });
  check('D-1', 'sahte CF-Connecting-IP kimlik DEGISTIREMEZ',
    a.resolvedClientIp === gercek && a.rateLimitIpHash === gercekHash
      && String(a.xff) !== '203.0.113.99',
    `gonderilen=203.0.113.99 · urunun cozdugu=${a.resolvedClientIp} · sayac ${a.rateLimitIpHash === gercekHash ? 'DEGISMEDI' : 'DEGISTI'}`);

  // D-2: sahte X-Forwarded-For
  const b = await req(DIRECT_PORT, { 'x-forwarded-for': '198.51.100.77, 9.9.9.9' });
  check('D-2', 'sahte X-Forwarded-For kimlik DEGISTIREMEZ',
    b.resolvedClientIp === gercek && b.rateLimitIpHash === gercekHash,
    `gonderilen="198.51.100.77, 9.9.9.9" · urunun gordugu xff=${b.xff} · cozulen=${b.resolvedClientIp}`);

  // D-3: ikisi birden + her istekte FARKLI deger (hiz siniri kacisi denemesi)
  const c1 = await req(DIRECT_PORT, { 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.1' });
  const c2 = await req(DIRECT_PORT, { 'cf-connecting-ip': '203.0.113.2', 'x-forwarded-for': '203.0.113.2' });
  const c3 = await req(DIRECT_PORT, { 'cf-connecting-ip': '203.0.113.3', 'x-forwarded-for': '203.0.113.3' });
  const hepsiAyni = c1.rateLimitIpHash === gercekHash && c2.rateLimitIpHash === gercekHash && c3.rateLimitIpHash === gercekHash;
  check('D-3', 'her istekte farkli sahte baslik hiz siniri sayacini BOLEMEZ',
    hepsiAyni,
    `uc farkli sahte deger -> sayac ${hepsiAyni ? 'AYNI kaldi (kacis YOK)' : 'BOLUNDU (KACIS VAR)'}`);

  // D-4: CF-Connecting-IP arka uca hic iletilmiyor
  check('D-4', 'CF-Connecting-IP basligi arka uca ILETILMEZ',
    a.cfConnectingIp === null || a.cfConnectingIp === undefined,
    `arka ucun gordugu cf-connecting-ip=${a.cfConnectingIp === null || a.cfConnectingIp === undefined ? 'YOK' : a.cfConnectingIp}`);

  // D-5: arka uca giden XFF TEK degerdir (liste enjeksiyonu yok)
  check('D-5', 'arka uca giden X-Forwarded-For TEK deger',
    String(b.xff || '').split(',').length === 1,
    `xff="${b.xff}"`);

  // M-1: MUTASYON — tunel profili dogrudan modda kullanilirsa ne olur?
  if (TUNNEL_PORT) {
    const m1 = await req(TUNNEL_PORT, { 'cf-connecting-ip': '203.0.113.1' });
    const m2 = await req(TUNNEL_PORT, { 'cf-connecting-ip': '203.0.113.2' });
    const kacis = m1.rateLimitIpHash !== m2.rateLimitIpHash;
    check('M-1', 'MUTASYON: tunel profili dogrudan modda KACISA acik (beklenen: kacis VAR)',
      kacis,
      `iki sahte deger -> sayac ${kacis ? 'BOLUNDU — kusur gercek' : 'ayni kaldi'} · cozulen=${m1.resolvedClientIp}/${m2.resolvedClientIp}`);
  }

  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(JSON.stringify({ toplam: rows.length, pass: rows.length - fail, fail, rows }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})();
