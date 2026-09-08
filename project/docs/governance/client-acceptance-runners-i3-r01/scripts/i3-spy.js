/*
 * İ3 — DISPATCHER ÇAĞRI SPY'I (YALNIZ İZOLE TEST ORTAMI)
 *
 * NEDEN: "sağlayıcıya çağrı yok" iddiası, SMTP bağlantısının açılmamasıyla ÖLÇÜLEMEZ —
 * bir dispatcher (ör. mock) çağrılabilir ama hiç TCP açmayabilir. Bu yüzden ürünün
 * publication servisinin kullandığı **gerçek `dispatcher.send` çağrı noktası**
 * (`client-financial-disclosure-publication.service.ts:213`) sayılır.
 *
 * ÜRÜN KODU DEĞİŞTİRİLMEZ. Bu dosya `node --require` ile YÜKLENİR ve derlenmiş `dist`
 * sınıflarının `send` metotlarını çalışma zamanında sarmalar. Repodaki hiçbir ürün dosyası
 * değişmez; sarmalama yalnız bu prova sürecinin belleğinde yaşar.
 *
 * KULLANIM (yalnız disposable prova):
 *   I3_SPY_FILE=<yol> node --require ./i3-spy.js <dist>/main.js
 *   I3_SPY_BYPASS_ALLOWLIST=1 ...   → §35.10 allowlist kontrolünü ETKİSİZLEŞTİRİR
 *                                     (kabulün kırıldığını göstermek için; NEGATİF PROVA)
 *
 * Sayaç dosyası JSON'dur ve her çağrıda güncellenir:
 *   { dispatcherSend: <n>, byProvider: { <providerName>: <n> }, allowlistBypassed: <bool> }
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SPY_FILE = process.env.I3_SPY_FILE;
if (!SPY_FILE) {
  console.error('[i3-spy] I3_SPY_FILE tanimli degil — spy YUKLENMEDI (sayac uretilmez)');
  module.exports = {};
} else {
  const DIST = process.env.I3_DIST_ROOT
    || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/dist/apps/api/src';
  const FD = path.join(DIST, 'modules/client-financial-disclosure');

  // CALISMA ZAMANI TANIKLIGI — bu nesne API surecinin KENDI icinden yazilir.
  // `instanceToken` ve etkin tasima ayarlari burada yapilandirma dosyasindan DEGIL,
  // surecin gercekten aldigi ortamdan okunur; kosucu ikisini karsilastirarak dosyanin
  // calisan ornegi temsil ettigini dogrular. `null` degerler kosucuda "eslesti" SAYILMAZ.
  const state = {
    dispatcherSend: 0,
    byProvider: {},
    allowlistBypassed: false,
    wrapped: [],
    // ── calisan ornegin kimligi ve ETKIN ayarlari ──
    instanceToken: process.env.I3_INSTANCE_TOKEN || null,
    pid: process.pid,
    emailProvider: process.env.EMAIL_PROVIDER || null,
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: process.env.SMTP_PORT || null,
    // teshis: cwd'de `.env` var mi (starter zaten tasima anahtarlarini golgeleyeni reddeder)
    dotenvInCwd: (() => {
      try { return fs.existsSync(path.join(process.cwd(), '.env')); } catch (e) { return null; }
    })(),
  };
  const flush = () => {
    try { fs.writeFileSync(SPY_FILE, JSON.stringify(state), 'utf8'); }
    catch (e) { /* sayac yazilamazsa cagiran OKUYAMADI olarak raporlar */ }
  };

  /** Bir dispatcher sınıfının `send` metodunu sarmalar; davranışı DEĞİŞTİRMEZ. */
  const wrapDispatcher = (file, className) => {
    try {
      const mod = require(path.join(FD, file));
      const Cls = mod[className];
      if (!Cls || !Cls.prototype || typeof Cls.prototype.send !== 'function') return false;
      const original = Cls.prototype.send;
      Cls.prototype.send = function spiedSend(...args) {
        state.dispatcherSend += 1;
        const p = this && this.providerName ? String(this.providerName) : 'bilinmeyen';
        state.byProvider[p] = (state.byProvider[p] || 0) + 1;
        flush();
        return original.apply(this, args); // davranis AYNEN korunur
      };
      state.wrapped.push(className);
      return true;
    } catch (e) {
      console.error(`[i3-spy] ${className} sarmalanamadi: ${e && e.message}`);
      return false;
    }
  };

  wrapDispatcher('client-financial-disclosure-email-dispatcher.js',
    'ClientFinancialDisclosureEmailDispatcher');
  wrapDispatcher('unconfigured-disclosure-dispatcher.js',
    'UnconfiguredDisclosureNotificationDispatcher');

  // ── NEGATİF PROVA: §35.10 allowlist kontrolünü etkisizleştir ──
  // Amaç: allowlist kapısı kaldırıldığında "gerçek send çağrısı sıfır" kabulünün KIRILDIĞINI
  // göstermek. Yalnız izole prova ortamında ve YALNIZ açık bayrakla çalışır.
  if (process.env.I3_SPY_BYPASS_ALLOWLIST === '1') {
    try {
      const contract = require(path.join(FD, 'client-financial-disclosure-publication.contract.js'));
      const orig = contract.isClientFinancialDisclosureApprovedProvider;
      if (typeof orig === 'function') {
        contract.isClientFinancialDisclosureApprovedProvider = function bypassed() { return true; };
        state.allowlistBypassed = true;
      }
    } catch (e) {
      console.error(`[i3-spy] allowlist bypass kurulamadi: ${e && e.message}`);
    }
  }

  flush();
  console.log(`[i3-spy] hazir · sarmalanan=${state.wrapped.join(',') || 'YOK'}`
    + ` · allowlistBypassed=${state.allowlistBypassed} · sayac=${SPY_FILE}`);
}
