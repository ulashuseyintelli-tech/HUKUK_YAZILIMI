'use strict';
/*
 * EXTACC — QR OKUNABİLİRLİK DENEMESİ (canlı veri YOK, token YOK). Owner bloğu `-Mode QrTest` ile çağırır.
 * Yalnız `<beklenen origin>/portal/login` adresinin QR'ını yerel konsola çizer; owner telefonla okutup portal giriş
 * sayfasının açıldığını görür (giriş YAPILMAZ). Amaç: canlı koşumdan ÖNCE QR'ın bu konsol + bu telefonla okunduğunu
 * doğrulamak (yerelde QR çözücü olmadığı için tek pratik kanıt budur).
 * ÇIKIŞ: 0 gösterildi · 4 adres/konsol reddi.
 */
const DISPLAY = require('./extacc-display');

(async () => {
  let u; try { u = new URL(String(process.env.EXA_QRTEST_URL || '')); } catch (e) { u = null; }
  if (!u || u.protocol !== 'https:' || u.pathname !== '/portal/login' || u.search || u.hash || u.username || u.password) {
    console.error('REDDEDİLDİ: EXA_QRTEST_URL yalnız https://<host>/portal/login olabilir'); process.exit(4);
  }
  let con; try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok (${e.message})`); process.exit(4); }
  const qr = DISPLAY.renderQr(u.href);
  await DISPLAY.show(con, ['QR DENEMESİ — canlı veri YOK. Telefonla okutun: portal GİRİŞ sayfası açılmalı (giriş YAPMAYIN).', '', ...qr.lines, '', u.href, '']);
  DISPLAY.close(con);
  console.log(`QR denemesi gösterildi · modül=${qr.modules}`);
})();
