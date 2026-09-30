'use strict';
/*
 * EXTACC D-6 — QR OKUNABİLİRLİK DENEMESİ (canlı veri YOK, token YOK). Owner bloğu `-Mode QrTest` ile çağırır.
 * extacc-qr-test.js yalnız `/portal/login` kabul eder; D-6 belgeler sayfası (`/portal/documents`) için bu türev kullanılır.
 * Yalnız `<beklenen origin>/portal/documents` adresinin QR'ını yerel konsola çizer; owner telefonla okutup portal belgeler
 * (girişsiz → giriş) sayfasının açıldığını görür (giriş YAPILMAZ). ÇIKIŞ: 0 gösterildi · 4 adres/konsol reddi.
 */
const DISPLAY = require('../../client-extacc-intake-chain-r01/scripts/extacc-display');

(async () => {
  let u; try { u = new URL(String(process.env.EXA_QRTEST_URL || '')); } catch (e) { u = null; }
  if (!u || u.protocol !== 'https:' || u.pathname !== '/portal/documents' || u.search || u.hash || u.username || u.password) {
    console.error('REDDEDİLDİ: EXA_QRTEST_URL yalnız https://<host>/portal/documents olabilir'); process.exit(4);
  }
  let con; try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok (${e.message})`); process.exit(4); }
  const qr = DISPLAY.renderQr(u.href);
  await DISPLAY.show(con, ['QR DENEMESİ (D-6) — canlı veri YOK. Telefonla okutun: portal BELGELER/giriş sayfası açılmalı (giriş YAPMAYIN).', '', ...qr.lines, '', u.href, '']);
  DISPLAY.close(con);
  console.log(`QR denemesi gösterildi · modül=${qr.modules}`);
})();
