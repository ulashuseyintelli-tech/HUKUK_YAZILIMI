'use strict';
/*
 * EXTACC D-5 — QR OKUNABİLİRLİK DENEMESİ (canlı veri YOK, token YOK, HTTP isteği YOK). Owner bloğu `-Mode QrTest` ile çağırır.
 * extacc-qr-test.js yalnız `/portal/login` kabul eder. D-5 koşumunun 1. konsol ekranı `/portal/forgot-password` QR'ını çizer; okunabilirlik
 * denemesi de AYNI yolla yapılır (bu türev). Owner telefonla okutup "şifremi unuttum" sayfasının açıldığını görür (form GÖNDERİLMEZ).
 *
 * GİRDİ (ortam): D5_QRTEST_URL      çizilecek adres — TAM olarak `<beklenen origin>/portal/forgot-password`
 *                D5_EXPECT_BASE_URL beklenen dış origin (owner bloğu canlı yapılandırmadan okur; bu dosyada alan adı literali YOKTUR)
 *
 * KAPILAR (konsol açılmadan ÖNCE; hiçbir dosya/DB/ağ yazması yok — sıra sabittir):
 *   1. TLS doğrulaması kapalıysa (NODE_TLS_REJECT_UNAUTHORIZED=0) koşulmaz                                   → çıkış 1
 *   2. beklenen origin https şemalı, YOLSUZ, userinfo/sorgu/fragment içermeyen bir origin olmalı             → çıkış 4
 *      (kural h5-url-live-run.js `expectedOriginOf` ile AYNI; eşitlik d5-qr-selftest.js E-1'de ölçülür)
 *   3. adres ayrıştırılabilir, https, userinfo YOK, sorgu YOK, fragment YOK                                  → çıkış 4
 *   4. adresin origin'i beklenen origin ile birebir aynı                                                     → çıkış 4
 *   5. yol TAM `/portal/forgot-password` (başka her yol, sondaki `/`, büyük harf, kodlanmış varyant RET)     → çıkış 4
 *   6. ham metin kanonik biçimde: `<origin>/portal/forgot-password` ile bayt bayt aynı                       → çıkış 4
 *      (URL ayrıştırıcısının sessizce düzelttiği `\`, `./`, `../`, boş `?`/`#`, boşluk, büyük harf burada yakalanır)
 * GÖSTERİM: extacc-display ile YALNIZ yerel konsola (CONOUT$); konsol yoksa çıkış 4.
 * ÇIKIŞ   : 0 gösterildi · 1 TLS doğrulaması kapalı / beklenmeyen hata · 4 adres ya da konsol reddi.
 */
const DISPLAY = require('../../client-extacc-intake-chain-r01/scripts/extacc-display');

const QR_PATH = '/portal/forgot-password';

/** Beklenen origin kuralı — h5-url-live-run.js `expectedOriginOf` ile aynı (https, yolsuz, userinfo/sorgu/fragment yok). */
function expectedOriginOf(v) {
  let u; try { u = new URL(String(v || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return u.origin;
}

const reject = (code, reason, why) => ({ ok: false, code, reason, why, href: null, origin: null });

/** Saf doğrulama: yalnız verilen ortam nesnesini okur; konsol/dosya/ağ KULLANMAZ. Ret mesajları adresi YAZMAZ. */
function validateQrTarget(env) {
  const e = env || {};
  if (e.NODE_TLS_REJECT_UNAUTHORIZED === '0') return reject(1, 'tls', 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz');
  const origin = expectedOriginOf(e.D5_EXPECT_BASE_URL);
  if (!origin) return reject(4, 'beklenen-origin', 'D5_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı');
  const raw = typeof e.D5_QRTEST_URL === 'string' ? e.D5_QRTEST_URL : '';
  if (!raw) return reject(4, 'adres-yok', 'D5_QRTEST_URL tanımlı değil');
  let u; try { u = new URL(raw); } catch (err) { u = null; }
  if (!u) return reject(4, 'ayristirma', 'D5_QRTEST_URL ayrıştırılamadı');
  if (u.protocol !== 'https:') return reject(4, 'sema', 'D5_QRTEST_URL https:// şemalı olmalı');
  if (u.username || u.password || raw.includes('@')) return reject(4, 'userinfo', 'D5_QRTEST_URL kullanıcı bilgisi (userinfo) içeremez');
  if (u.search || raw.includes('?')) return reject(4, 'sorgu', 'D5_QRTEST_URL sorgu (?) içeremez');
  if (u.hash || raw.includes('#')) return reject(4, 'fragment', 'D5_QRTEST_URL fragment (#) içeremez');
  if (u.origin !== origin) return reject(4, 'origin', 'D5_QRTEST_URL origin\'i beklenen origin ile eşleşmiyor');
  if (u.pathname !== QR_PATH) return reject(4, 'yol', `D5_QRTEST_URL yolu yalnız ${QR_PATH} olabilir`);
  if (raw !== origin + QR_PATH) return reject(4, 'kanonik', `D5_QRTEST_URL kanonik biçimde değil (yalnız <beklenen origin>${QR_PATH})`);
  return { ok: true, code: 0, reason: null, why: null, href: origin + QR_PATH, origin };
}

/** Kapılar → konsol → QR. `display` yalnız öz-test için değiştirilebilir (varsayılan: extacc-display). Çıkış kodunu DÖNDÜRÜR. */
async function main(env, display) {
  const v = validateQrTarget(env);
  if (!v.ok) { console.error(`REDDEDİLDİ (${v.reason}): ${v.why} — konsol açılmadı, hiçbir yazma yapılmadı`); return v.code; }
  const D = display || DISPLAY;
  let con; try { con = D.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok (${String((e && e.message) || e).slice(0, 120)})`); return 4; }
  try {
    const qr = D.renderQr(v.href);
    await D.show(con, ['QR DENEMESİ (D-5) — canlı veri YOK. Telefonla okutun: "şifremi unuttum" sayfası açılmalı (formu GÖNDERMEYİN).', '', ...qr.lines, '', v.href, '']);
    console.log(`QR denemesi gösterildi · modül=${qr.modules} · yol=${QR_PATH}`);
  } finally { D.close(con); }
  return 0;
}

if (require.main === module) {
  main(process.env).then((code) => process.exit(code), (e) => { console.error(`DURDU: beklenmeyen hata (${String((e && e.message) || e).slice(0, 120)})`); process.exit(1); });
}
module.exports = { QR_PATH, expectedOriginOf, validateQrTarget, main };
