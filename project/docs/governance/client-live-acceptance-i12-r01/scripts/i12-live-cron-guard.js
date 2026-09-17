/*
 * İ12 — AYLIK CRON ÇAKIŞMA KORUMASI (salt-okuma; pencere açılmadan ÖNCE)
 *
 * NEDEN: `CLIENT_STATEMENT_MONTHLY_DELIVERY=true` iken `ClientStatementMonthlyDeliveryService.onModuleInit`
 * GLOBAL aylık cron'u kaydeder: `CLIENT_STATEMENT_MONTHLY_CRON = '0 3 1 * *'` @ `Europe/Istanbul`
 * (her ayın 1'i, 03:00). §7.9 penceresi bu ateşleme anını KAPSARSA:
 *   • Sentetik hedef tenant GLOBAL koşuda süpürülür → aynı-dönem teslim/ledger TÜKENİR →
 *     G7'nin "ilk tetik +1, ikinci tetik +0 (dedupe)" ölçümü GEÇERSİZ/YANILTICI olur.
 *   • Pencere, İ12 ile ilgisi olmayan bir üretim işiyle iç içe geçer → gözlemler atfedilemez.
 * NOT (abartma YOK): env pini (`SMTP_HOST`/`SMTP_PORT`) GERÇEK tenant'ların ekstre postasını YAKALAMAZ —
 * ekstre teslimi `office.service.getFullSmtpSettings` ile tenant'ın KENDİ Office satırından okunur ve
 * **env'e geri düşüş YOKTUR**. Pencere yalnız HEDEF tenant'ın Office satırını sink'e alır. Ayrıca bu cron
 * İ12 tarafından AÇILMAZ; canlıda bayrak ZATEN açıktır. Buradaki koruma ÖLÇÜM BÜTÜNLÜĞÜ içindir.
 *
 * ÇIKIŞ: 0 = çakışma YOK (pencere açılabilir) · 5 = ÇAKIŞIR (REDDET; owner pencereyi kaydırır) · 2 = girdi hatası.
 * KULLANIM: [I12_WINDOW_MINUTES=120] [I12_NOW_ISO=<test için sabit an>] [I12_ENV_FILE=<.env>]
 *           node i12-live-cron-guard.js
 * `I12_ENV_FILE` verilirse YALNIZ `CLIENT_STATEMENT_MONTHLY_DELIVERY` anahtarının değeri okunur/raporlanır;
 * dosyanın başka hiçbir satırı okunmaz/yazdırılmaz (sır sızıntısı yok).
 */
'use strict';
const fs = require('fs');

const TZ = 'Europe/Istanbul';
const CRON_DAY = 1, CRON_HOUR = 3, CRON_MIN = 0; // '0 3 1 * *'

/** Bir anın verilen saat diliminde okunan takvim parçaları. */
function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const o = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  if (o.hour === 24) o.hour = 0; // bazı ortamlarda 24:00 döner
  return o;
}

/** Yerel duvar-saatini (tz) UTC ana çevirir — DST/ofset değişimlerinde de doğru (iteratif düzeltme). */
function zonedToUtc(y, mo, d, h, mi, tz) {
  const want = Date.UTC(y, mo - 1, d, h, mi, 0);
  let ts = want;
  for (let i = 0; i < 3; i++) {
    const p = tzParts(new Date(ts), tz);
    const seenAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
    ts = want - (seenAsUtc - ts);
  }
  return new Date(ts);
}

/** `now`dan SONRAKİ ilk aylık ateşleme anı (UTC Date). */
function nextMonthlyFire(now, tz = TZ) {
  const p = tzParts(now, tz);
  let y = p.year, mo = p.month;
  let fire = zonedToUtc(y, mo, CRON_DAY, CRON_HOUR, CRON_MIN, tz);
  if (fire.getTime() <= now.getTime()) {
    mo += 1; if (mo > 12) { mo = 1; y += 1; }
    fire = zonedToUtc(y, mo, CRON_DAY, CRON_HOUR, CRON_MIN, tz);
  }
  return fire;
}

/** Pencere [now, now+windowMinutes] ateşlemeyi kapsıyor mu? */
function windowOverlapsFire(now, windowMinutes, tz = TZ) {
  const fire = nextMonthlyFire(now, tz);
  const end = new Date(now.getTime() + windowMinutes * 60000);
  return { fire, end, overlaps: fire.getTime() <= end.getTime() };
}

function readFlag(envFile) {
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*CLIENT_STATEMENT_MONTHLY_DELIVERY\s*=\s*(.*)$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
    return null;
  } catch (e) { return undefined; }
}

if (require.main === module) {
  const windowMinutes = Number(process.env.I12_WINDOW_MINUTES || 120);
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) { console.error('REDDEDİLDİ: I12_WINDOW_MINUTES pozitif sayı olmalı.'); process.exit(2); }
  const now = process.env.I12_NOW_ISO ? new Date(process.env.I12_NOW_ISO) : new Date();
  if (Number.isNaN(now.getTime())) { console.error('REDDEDİLDİ: I12_NOW_ISO çözümlenemedi.'); process.exit(2); }

  const { fire, end, overlaps } = windowOverlapsFire(now, windowMinutes);
  const out = {
    record: 'I12-CRON-GUARD', cron: '0 3 1 * *', timeZone: TZ,
    now: now.toISOString(), windowMinutes, windowEnd: end.toISOString(),
    nextMonthlyFire: fire.toISOString(),
    minutesToFire: Math.round((fire.getTime() - now.getTime()) / 60000),
    overlaps,
    monthlyFlag: process.env.I12_ENV_FILE ? readFlag(process.env.I12_ENV_FILE) : null,
    note: overlaps
      ? 'ÇAKIŞIYOR — pencere GLOBAL aylık cron ateşlemesini kapsıyor. Sentetik tenant süpürülür ve G7 dedupe ölçümü GEÇERSİZ olur. Pencereyi ateşlemeden SONRAYA kaydırın.'
      : 'Çakışma YOK — pencere aylık cron ateşlemesini kapsamıyor.',
  };
  console.log(JSON.stringify(out, null, 1));
  process.exit(overlaps ? 5 : 0);
}

module.exports = { nextMonthlyFire, windowOverlapsFire, tzParts, zonedToUtc, TZ };
