'use strict';
/*
 * D-8 sondası ÖZ-TESTİ (R07) — canlıya dokunmaz. Gerçek TLS'li SAHTE KENAR + SAHTE API (istek kimliği ara katmanı modeli) + (R07)
 * geri döngüde düz http ile dinleyen SAHTE YEREL KENAR.
 *
 * R07 (owner kararı 2026-10-06; kural sürümü R07) — DAR KABUL İSTİSNASI "İzin verilen bozuk istek reddi — katman doğrulanmadı": yalnız
 *   tanımlı TEK vektör (kimlik + yöntem + ham hedef; satır numarası değil) ve yalnız beş koşulun HEPSİ tutuyorsa (HTTP 400 · incelenmiş
 *   yanıt özellikleri · uygulamaya ulaşma kanıtı yok · yerel kenarda 403 · sonda dışı ek kanıt beyanı / sonucu uygun) durum kodu ölçütünü
 *   tek başına FAIL yapmaz; o koşumda HTTP / ret alanı PASS DEĞİL, ayrı değer OWNER-ISTISNASIYLA-UYGUN alır (owner şartı: "İstisna uygulanan
 *   HTTP 400 satırını 'HTTP/ret PASS' diye sunma."); kenar engelleme ve katman doğrulaması alanlarına hiçbir şey vermez (MR-1 … MR-10,
 *   DOC-2, GT-1 (1) (7) (14)).
 *   İncelenmiş yanıtın gövdesi bu dosyada BAĞIMSIZ kurulur (sonda yalnız bayt sayısını ve SHA-256'yı taşır).
 *
 * R06 (owner kararları 2026-10-06) — bu dosyada ölçülen yeni kurallar: (1) KANIT SINIRI: kenar engelleme ve katman doğrulaması sondayla
 *   PASS ÜRETMEZ; sağlıklı kenar ile zincirde başlığı silinmiş API reddi AYNI görünür ve ikisi de OLCULEMEYEN'dir (S1, SINIR-2, L-1,
 *   GT-1); ölçüm koşumu çıkış 0 üretmez (X-1) · (2) pozitif kontrolde 403 istisnası YOK: beklenen dışındaki doğrulanmış her yanıt FAIL
 *   (P-3, P-7, U-1) · (3) kapsam yetkisi kapısı: birleşik belge kabul edilir, dosya bütünlüğü ile içerik incelemesi beyanı AYRI
 *   kaydedilir, tarih denetimi sınır saatlerinde ölçülür (SA-9, SA-10, SA-11).
 *
 * MODEL
 *   Sahte kenar : Caddyfile şablonunun 4 izin regex'i + admin reddi; karar GERÇEK CADDY yol temizliği modeliyle (yüzde-çöz +
 *                 ./.. + // sadeleştir). Arka uca HAM yolu iletir (şablon: "YOL DÖNÜŞÜMÜ YOK").
 *   Sahte API   : istek kimliği ara katmanını ÜRÜN KAYNAĞINDAN okunan kurallarla BİREBİR uygular (bu dosya kaynağı çalışma anında
 *                 okur: request-id.middleware.ts → başlık adı + SAFE_REQUEST_ID + `normalizeRequestId(incoming) ?? randomUUID()`;
 *                 main.ts → genel önek + enableCors; app.module.ts → forRoutes('*')). Gelen kimlik kabul biçimindeyse yanıta AYNEN
 *                 yazılır; değilse ATILIR ve `randomUUID()` ile YENİSİ üretilir. Ara katman yalnız Express'in `/api$` ve `/api/*`
 *                 için ürettiği ifadelerle eşleşen HAM yolda çalışır (büyük/küçük harf duyarsız; yüzde dizisi çözülemezse çalışmaz
 *                 → 400, başlıksız); OPTIONS ön uçuşu ara katmandan ÖNCE 204 ile biter (başlıksız). Bu bir MODELDİR (kaynak
 *                 okuması); gerçek API ile izole prova DEĞİLDİR — o prova ayrı düzenekte koşuldu (paket belgesi §1.1, "Gerçek API
 *                 ile izole prova").
 *   Aracı katman kipleri: YANSITAN (isteğin kimliğini yanıta kopyalar) · DAMGALAYAN (kendi kimliğini yazar) · EZEN (API'nin başlığını
 *                 siler ya da üzerine yazar) — her biri "yalnız şu yanıtlarda" / "her yerde" girdileriyle.
 *   Zemin gerçeği: sahte uç her isteğe NE yanıt verdiğini (üreten katman, durum, kimlik, işaret) kaydeder. Kalemler sondanın sınıfını
 *                 bu kayıtla karşılaştırır: her kalem AYIRT EDİCİ GİRDİ → sondanın ÖLÇTÜĞÜ alan biçimindedir. Alan sırası her yerde
 *                 "HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol"dür (P = PASS · F = FAIL · O = OLCULEMEYEN).
 *
 * KALEMLER (kimlik: girdi → ölçülen alan)
 *   K-SRC  ürün kaynağındaki dayanaklar + sondanın iki deseni kaynakla aynı (kabul deseni metni; üretilen kimlik biçimi).
 *   K-PORT öz-test port kapısı (canlı / veritabanı / ayrılmış portlar reddedilir, dinleme başlamaz).
 *   S1     sağlıklı kenar → çıkış 3 (0 DEĞİL); P · O · O · P; kenar engelleme PASS DEĞİL — tek neden "bağımsız kanıt yok"; üç alan +
 *          pozitif kontrol AYRI; birleşik PASS yok; kayıt eki (kapsam + kanıt sınırı); katman kapsam sayısı.
 *   K-1    kalibrasyon: API pozitiflerinde İKİ davranış (aynen geri yazma 3/3 · değiştirme 3/3), başlıksız bölge temiz → VAR.
 *   L-1    "API değil" çıkarımı YOK: başlıksız düz /api satırı → OLCULEMEYEN (başlık yokluğu kanıt değil); ön uçuş / yolu belirsiz /
 *          web yolu → OLCULEMEYEN (kendi neden sınıfıyla).
 *   S1-p   ham yol · S1-c kimlik / gövde · Y-1 istek kimliği planı (hangi istekte hangi biçim; kaynak deseniyle ölçülür) · Y-2 plan
 *          kapısı (iki biçim ayrışmıyorsa istek atılmaz) · S7 kapsam.
 *   S2     bozuk kenar (AD-2, tam kapsam yetkisi kaydıyla) → çıkış 2; F · F · F · P · N-5 bir süreç = bir ad = bir kanıt.
 *   S3 / S3-b / S3-c  ipuçları değişir, alanlar S1 ile aynı · S3-dN gövdesi dolu ama başlıksız 403 → S1 ile aynı.
 *   S3-ch / S3-chF / S3-az / S3-azP  sınama / tanınmayan azaltım işareti: durum kodu ölçütü PASS kalır, kenar engelleme OLCULEMEYEN
 *          (çıkış 3); işaretli 2xx bulgu kalır.
 *   A-1    API'nin ürettiği 403 (GECERSIZ-BICIM → yeni kimlik) → durum kodu ölçütü PASS ama kenar engelleme FAIL (çıkış 2).
 *   A-2    API'nin 403'ü yalnız yolu belirsiz vektörde → yine API kanıtı.
 *   A-3    kalibrasyon EKSİK / GEÇERSİZ iken API kanıtı → kenar engelleme yine FAIL (somut kanıt silinmez).
 *   A-4    sınama işaretli 403 + başka satırda API kanıtı → FAIL korunur (işaret FAIL'i düşürmez).
 *   A-5    katman doğrulamasında desteksiz kesinlik yok: koşumun kalibrasyonu "değiştirme" davranışını HİÇ göstermediyse (0/3) ret
 *          satırındaki "yeni kimlik" kenar engellemede yine FAIL, katman doğrulamasında OLCULEMEYEN; en az bir kez gösterdiyse (1/3) FAIL.
 *   R-1    yansıtan aracı YALNIZ API önekli retlerde (ön uçuş hariç) → API kanıtı YOK; O · R-2 yansıtan her yerde → API kanıtı YOK.
 *   R-3    yansıma tek bir yanıtta (ön uçuş · web ret · web pozitifi, iki biçimde) → kalibrasyon GECERSIZ; "API değil" çıkarımı yok.
 *   M-1    damgalayan aracı (bütün ret yanıtları) → API biçimindeki yeni kimlik API kanıtı SAYILMAZ · M-2 damga + gerçek sızıntı →
 *          kanıt kullanılamaz, durum kodu ölçütü FAIL · M-3 damga tek bölgede (web ret · ön uçuş · bir web pozitifi) → kanıt
 *          kullanılamaz · M-4 API biçiminde OLMAYAN damga yalnız API önekli retlerde → yabancı kimlik.
 *   E-1    ezen aracı (başlığı siler) → kalibrasyon YOK; sızıntıda kanıt yok ama durum kodu ölçütü FAIL · E-2 ezen aracı (üzerine
 *          yazar) / canlı API kaynaktaki gibi davranmıyor → kalibrasyon GECERSIZ.
 *   SINIR-1 / SINIR-2  sondanın ÖLÇEMEDİĞİ iki durumun kaydı (güvence DEĞİL): yalnız API önekli retlere API biçiminde kimlik yazan
 *          katman → FAIL sayılır (koşumun kalibrasyonu "değiştirme" davranışını göstermiyorsa yalnız kenar engelleme FAIL, katman
 *          OLCULEMEYEN) · REGRESYON (SINIR-2): API'nin 403 yanıtından başlığı silen katman → düzeltilmiş sonda OLCULEMEYEN, çıkış 3,
 *          sağlıklı kenarla (S1) alan / neden / satır düzeyinde AYNI; eski kuralı geri getiren sonda kopyası aynı girdide yanlış PASS /
 *          çıkış 0 üretir (düzeltmesiz kodun davranışı; main baytlarıyla negatif ayna ayrıca belgededir).
 *   K-5    kısmi kalibrasyon (5/6 · 1/6 · yalnız değiştirme · yalnız aynen geri yazma) → YOK · K-10 web pozitifi ölçülemedi ·
 *   Z-1    başlıksız bölge hiç ölçülemedi → API kanıtı kullanılamaz.
 *   L-2 … L-9  403 dışı yanıtlar: durum kodu ölçütü HER birinde FAIL; kenar engelleme yalnız API kanıtı varsa FAIL.
 *   H-1    yanıt alınamayan ret vektörü → OLCULEMEYEN; doğrulanmış başka yanıt → FAIL (ayrı sınıflar).
 *   U-1 / U-2 / U-3  tekdüze 403 · sunulmayan ad (tekdüze 404 / 3xx / 401) · kardeş dallar.
 *   P-1 … P-7  pozitif kontrol ayrı kayıt, TEK KURAL (beklenen kod → uygun · yanıt yok → O · doğrulanmış başka HER yanıt, 403 DAHİL → F):
 *          token'sız 200 · öncelik · tek pozitif 403 → F · kanıtsız 5xx / 429 / sınıflanamayan kod → F · web pozitifinde 3xx / 404 ·
 *          API'nin izinli yolda ürettiği 5xx / 429, gönderilen kimlik biçiminin iki sırasında AYNI hüküm (parite) · bütün pozitifler
 *          403 (API'nin ürettiği) / tekdüze 403 → F; yanıtsız pozitif → O.
 *   G-1    kenar her şeyi geçirir (zemin gerçeği) · GT-1 bütün koşumlarda değişmezler (zemin gerçeğiyle kimlik anlamı · API olmayan
 *          yanıt API sayılmaz · hiçbir satır "API değil" sayılmaz · kenar engelleme ve katman hiçbir koşumda PASS değil · alan
 *          değerleri kümesi) · X-1 çıkış kodu eşlemesi (0 HİÇ üretilmez) · X-2 tanınmayan alan değeri de çıkış 0 vermez.
 *   N-1 … N-4 · O-1 · O-1b · S5-a…e · S6  kapılar.
 *   SA-1 … SA-11  kapsam yetkisi kapısı: kayıt yok · yalnız tünel / zorunlu kalem eksik (eksik kalemin TÜRÜ adlandırılır) · özet
 *          tutmuyor · ana makine uyuşmuyor · ad kimliği uyuşmuyor · tam kayıt · biçimsel hileler · AD-1 / telefon listesi · SA-9
 *          BİRLEŞİK BELGE (iki kalem aynı dosya → KABUL; beyan yok / tek tür / boş / özeti tutmuyor → RET) · SA-10 içerik incelemesi
 *          beyanı zorunlu, dosya bütünlüğünden AYRI alan; "sahiplik doğrulandı" anlamına gelen ifade yok · SA-11 tarih denetimi sınır
 *          saatlerinde (yerel gün UTC gününden ilerideyken geçerli tarih reddedilmez; gelecekteki tarih reddedilir; saatli biçim).
 *   O-2 · O-3 · V-1 · V-2  adsız özet ve vektör kümesi kimliği · T-1 … T-5 statik (T-5: kalkan kuralların izi kodda yok) · D-1 pinler ·
 *          DOC-1 belge ↔ kod ↔ öz-test (§1b satır biçimi koşum hücresine göre: boşken "KOŞULMADI", doluyken yalnız alan değerleri —
 *          kenar engelleme ve katman hücrelerinde PASS yok — + kısa biçimli koşum hücresi; kapanış tanımı "çıkış 0 üretmez" der).
 *   B-0 · B-G · B-1 … B-T2  belgedeki owner blokları, test ikamesi KANITLANMADAN hiç koşmaz; iki kabukta.
 *   S4 · S4-b  taşıma hataları.
 *   MR-1 … MR-10 · DOC-2  DAR KABUL İSTİSNASI (R07): MR-1 doğru vektör + bütün koşullar → dar sınıf (ad tam metinle; HTTP / ret OWNER-ISTISNASIYLA-UYGUN — PASS değil; kenar
 *          engelleme ve katman PASS DEĞİL; yerel istek ayrı kayıt, toplam 68 + 1) · MR-2 başka vektör 400 / aynı yol başka yöntem / ham yol
 *          bir karakter farklı → yok · MR-3 aynı vektör 2xx / kimlik başlığı (yeni kimlik · yansıma) → yok · MR-4 yerel karşılaştırma yok /
 *          403 değil / yanıtsız / kimlik başlıklı 403 → yok · MR-5 gövde bir bayt farklı / içerik türü farklı / yalnız genel sağlayıcı
 *          başlığı → yok · MR-6 sonda dışı ek kanıt: beyan yok → yok · "kullanılacak" → kesinleşmez · kesinleştirme GECERSIZ → yok ·
 *          GECERLI → dar sınıf (kesinleştirme istek atmaz) · MR-7 liste sırası değişince kapsam değişmez (karıştırılmış kopya + statik) ·
 *          MR-8 üç alan birbirine dönüşmez (kenar engelleme / katman / pozitif kontrol istisnasız koşumla BİREBİR aynı) · MR-9 kapılar ·
 *          MR-10 sınıf uygulanan koşumda HTTP / ret alanı hiçbir çıktıda PASS değil; satırın gerçek kodu 400 ·
 *          DOC-2 belge ↔ kod ↔ öz-test (sınıf adı, uyarı cümlesi, karar tarihi + sürüm ayrı kayıt, geçmiş koşum satırı aynen).
 *
 * ORTAM  : D8_SELFTEST_PORT  sahte kenar portu (varsayılan 8457; yasak portlar reddedilir → çıkış 4).
 *          D8_SELFTEST_LOCAL_PORT sahte YEREL kenar portu (varsayılan 8458; aynı yasak liste; sahte kenar portundan farklı olmalı).
 *          D8_SELFTEST_PROBE başka bir sonda dosyası (negatif ayna / mutasyon provası). Verilirse D-1 pin kalemi DÜŞER (beklenen).
 *          D8_SELFTEST_WINPS_EXE / D8_SELFTEST_PWSH_EXE kabuk yürütülebilirinin adı (varsayılan powershell.exe / pwsh). Kabuk
 *          başlatılamazsa ya da sürümü tutmazsa o kabuğun B-* kalemleri ÖLÇÜLEMEDİ olur ve öz-test çıkışı 2'dir (0 DEĞİL).
 * KULLANIM: node d8-selftest.js   ÇIKIŞ: 0 hepsi PASS · 1 en az bir FAIL · 2 FAIL yok ama ÖLÇÜLEMEYEN var · 4 port kapısı
 */
const { spawn, execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os'); const https = require('https'); const http = require('http'); const crypto = require('crypto');

/** Yasak portlar (canlı / veritabanı / ayrılmış): tek tek + aralıklar. 8081 = kenar şablonundaki yerel kenar girişinin varsayılanı. */
const FORBIDDEN_PORTS = [8080, 3002, 8081, 5432, 5447, 5448, 5449, 5591, 18095]; const FORBIDDEN_RANGES = [[47200, 47299], [47998, 47999]];
const FORBIDDEN_TEXT = FORBIDDEN_PORTS.join(', ') + ', ' + FORBIDDEN_RANGES.map((r) => r[0] + '–' + r[1]).join(', ');
const portOf = (raw) => (/^\d{4,5}$/.test(raw) ? Number(raw) : NaN);
const portAllowed = (p) => p >= 1024 && p <= 65535 && !FORBIDDEN_PORTS.includes(p) && !FORBIDDEN_RANGES.some((r) => p >= r[0] && p <= r[1]);
const PORT_RAW = process.env.D8_SELFTEST_PORT === undefined ? '8457' : String(process.env.D8_SELFTEST_PORT);
const PORT = portOf(PORT_RAW);
if (!portAllowed(PORT)) { console.error(`REDDEDİLDİ: D8_SELFTEST_PORT=${PORT_RAW} kullanılamaz (1024–65535; canlı / veritabanı / ayrılmış portlar ${FORBIDDEN_TEXT} yasak)`); process.exit(4); }
// Sahte YEREL kenarın portu (R07): aynı kapı; sahte kenar portuyla aynı olamaz.
const LOCAL_PORT_RAW = process.env.D8_SELFTEST_LOCAL_PORT === undefined ? '8458' : String(process.env.D8_SELFTEST_LOCAL_PORT);
const LOCAL_PORT = portOf(LOCAL_PORT_RAW);
if (!portAllowed(LOCAL_PORT) || LOCAL_PORT === PORT) { console.error(`REDDEDİLDİ: D8_SELFTEST_LOCAL_PORT=${LOCAL_PORT_RAW} kullanılamaz (1024–65535; sahte kenar portundan farklı; canlı / veritabanı / ayrılmış portlar ${FORBIDDEN_TEXT} yasak)`); process.exit(4); }
// K-PORT kaleminin alt süreçleri yalnız kapıyı ölçer: kapı geçilse bile dinleme / sonda koşumu / yeni alt süreç BAŞLAMAZ.
if (process.env.D8_SELFTEST_GATE_ONLY === '1') { console.log('KAPI GEÇİLDİ: port ' + PORT + ' · yerel ' + LOCAL_PORT); process.exit(0); }

const PKG = path.join(__dirname, '..'); const REAL_PROBE = path.join(__dirname, 'd8-staff-surface-probe.js');
const PROBE = process.env.D8_SELFTEST_PROBE ? path.resolve(process.env.D8_SELFTEST_PROBE) : REAL_PROBE;
const DOC = path.join(PKG, 'EXTACC-D8-STAFF-SURFACE-PACKAGE-R01.md');
const API_SRC = path.join(PKG, '..', '..', '..', 'apps', 'api', 'src');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
/** `randomUUID()` çıktısının biçimi (RFC 4122 sürüm 4) — bu dosyada BAĞIMSIZ yazılıdır (sondanın ifadesinden türetilmez). */
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ─── Ürün kaynağından okunan dayanaklar (sahte API bu değerlerle çalışır) ─────────────────────────────────────────────────
function sourceFacts() {
  const mw = fs.readFileSync(path.join(API_SRC, 'common', 'request-id.middleware.ts'), 'utf8');
  const main = fs.readFileSync(path.join(API_SRC, 'main.ts'), 'utf8'); const mod = fs.readFileSync(path.join(API_SRC, 'app.module.ts'), 'utf8');
  const h = /REQUEST_ID_HEADER\s*=\s*"([^"]+)"/.exec(mw); const s = /SAFE_REQUEST_ID\s*=\s*\/(.+)\/;/.exec(mw); const p = /setGlobalPrefix\(\s*"([^"]+)"\s*\)/.exec(main);
  return { header: h && h[1], safeSrc: s && s[1], safe: s ? new RegExp(s[1]) : null, prefix: p && p[1],
    // İki davranış tek satırdadır: kabul edilen değer AYNEN, edilmeyen yerine randomUUID(); ikisi de yanıt başlığına yazılır.
    writesBackOrReplaces: /typeof value === "string" && SAFE_REQUEST_ID\.test\(value\) \? value : undefined/.test(mw) && /normalizeRequestId\(incoming\)\s*\?\?\s*randomUUID\(\)/.test(mw) && /res\.setHeader\(REQUEST_ID_HEADER,\s*requestId\)/.test(mw) && /import \{ randomUUID \} from "crypto"/.test(mw),
    wildcard: /consumer\.apply\(\s*RequestIdMiddleware[^)]*\)\.forRoutes\('\*'\)/.test(mod), cors: /app\.enableCors\(/.test(main) };
}
let F; try { F = sourceFacts(); } catch (e) { console.log('OLCULEMEDI: ürün kaynağı okunamadı (' + String(e.code || e.message).slice(0, 80) + ')'); process.exit(2); }
if (!F.header || !F.safe || !F.prefix) { console.log('OLCULEMEDI: ürün kaynağında başlık adı / kabul biçimi / genel önek bulunamadı'); process.exit(2); }
// Express 4 (path-to-regexp 0.1.x) `app.use('/<önek>$')` ve `app.use('/<önek>/*')` için şu ifadeleri üretir (2026-10-05, kurulu
// paketten ölçüldü: /^\/api$\/?(?=\/|$)/i ve /^\/api\/(.*)\/?(?=\/|$)/i). Nest 10.4.20 forRoutes('*') + genel önek bu iki yolu kaydeder.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const MW_RX = [new RegExp('^\\/' + esc(F.prefix) + '$\\/?(?=\\/|$)', 'i'), new RegExp('^\\/' + esc(F.prefix) + '\\/(.*)\\/?(?=\\/|$)', 'i')];
/** Ürün kaynağı modeli: API bu isteği işleseydi istek kimliği ara katmanı çalışır mıydı? */
function apiMw(method, rawUrl) {
  if (method === 'OPTIONS') return 'CORS';                       // enableCors ön uçuşu ara katmandan ÖNCE yanıtlar
  const pn = String(rawUrl).split('?')[0];
  for (const rx of MW_RX) { const m = rx.exec(pn); if (!m) continue; try { if (m[1] !== undefined) decodeURIComponent(m[1]); } catch (e) { return 'COZME-HATASI'; } return 'CALISIR'; }
  return 'ESLESMEZ';
}
/** Express rota eşleşmesi HAM yolda yapılır (sabit segmentlerde yüzde-çözme / nokta-segment sadeleştirme yok); harf duyarsız; sondaki '/' serbest. */
function apiNatural(rawUrl) {
  const pn = String(rawUrl).split('?')[0].toLowerCase().replace(/\/$/, '');
  return /^\/api\/(auth\/me|cases|users|portal\/admin\/(create-user|disable-user|documents\/pending|messages\/clients)|portal\/(cases|documents|messages|change-password)|portal\/documents\/[^/]+)$/.test(pn) ? 401 : 404;
}

const RX = {
  web: /^\/(intake\/[^/]+|portal(\/(login|forgot-password|reset-password|cases|documents|financial-disclosures|messages|poas|profile))?|portal\/cases\/[^/]+|_next\/.+|favicon\.ico)$/,
  aget: /^\/api\/(public\/intake\/[^/]+|portal\/(cases|cases\/[^/]+|financial-disclosures|financial-disclosures\/history|financial-disclosures\/[^/]+|poas|notifications|notifications\/unread-count|documents|documents\/[^/]+\/download|messages|messages\/unread-count))$/,
  apost: /^\/api\/(public\/intake\/[^/]+|portal\/(login|forgot-password|reset-password|change-password|notifications\/[^/]+\/read|notifications\/read-all|messages|messages\/mark-read|documents\/upload))$/,
  adel: /^\/api\/portal\/documents\/[^/]+$/,
};
const ADMIN_RX = /^\/api\/portal\/admin(\/|$)/;
// Gerçek Caddy yol temizliği modeli (D8-E2): `{http.request.uri.path}` yüzde-çözülmüş yoldur ve `.`/`..`/`//` sadeleştirilir;
// sorgu atılır, tek sondaki slash korunur, geçersiz yüzde dizisi (örn. %c0%af) çözülemez → olduğu gibi kalır. İzin/admin kararı
// bu TEMİZLENMİŞ yola göre verilir; kenarın gördüğü ve arka uca ilettiği yol HAM yoldur.
function cleanPath(raw) {
  let p = String(raw).split('?')[0];
  for (let i = 0; i < 3; i++) { let d; try { d = decodeURIComponent(p); } catch (e) { break; } if (d === p) break; p = d; }
  const trailing = p.length > 1 && p.endsWith('/');
  const out = []; for (const s of p.split('/')) { if (s === '' || s === '.') continue; if (s === '..') { out.pop(); continue; } out.push(s); }
  let np = '/' + out.join('/'); if (trailing && np !== '/') np += '/'; return np;
}

// ─── Sahte kenar + sahte API ──────────────────────────────────────────────────────────────────────────────────────────────
let mode = 'ok'; let seen = []; let seq = 0; // seen: zemin gerçeği — kenarın gördüğü HAM istek + verdiği yanıt (üreten, durum, kimlik, işaret)
const JSONH = { 'content-type': 'application/json', server: 'Caddy' };
const REDIRECT_TARGET = 'https://yonlendirme-hedefi.invalid/giris?next=gizli';
const STRICT_RX = UUID4; // "canlı API kaynaktaki gibi davranmıyor" girdisi: API yalnız bu biçimi kabul eder
const MIT_HEADER = 'cf-mitigated'; // sağlayıcının azaltım işareti (sahte kenar bu başlığı yalnız aşağıdaki girdilerle gönderir)
/** AZALTIM İŞARETİ GİRDİLERİ — [kimlik, gönderilen değer (dizi = iki AYRI başlık satırı), beklenen işaret sınıfı]. Beklenen sınıf burada
 *  DEĞİŞMEZ olarak yazılıdır (sondanın ifadesinden türetilmez): tanınan sınama değeri bir listenin ÖGESİ olarak ve harf duyarsız
 *  geçiyorsa SINAMA; başlık var ama değer başka bir şeyse (içinde "challenge" geçen başka bir değer ve BOŞ değer dahil) TANINMAYAN. */
const MARKS = [
  ['tam', 'challenge', 'SINAMA'], ['bas-harf-buyuk', 'Challenge', 'SINAMA'], ['tumu-buyuk', 'CHALLENGE', 'SINAMA'], ['liste-sonda', 'block, challenge', 'SINAMA'], ['liste-basta', 'challenge,block', 'SINAMA'], ['iki-satir', ['block', 'challenge'], 'SINAMA'],
  ['baska-deger', 'block', 'TANINMAYAN'], ['alt-cizgili', 'managed_challenge', 'TANINMAYAN'], ['ekli', 'challenged', 'TANINMAYAN'], ['tireli', 'non-challenge', 'TANINMAYAN'], ['bos', '', 'TANINMAYAN'],
];
/** `markmix` kipinde işaret taşıyan ret vektörleri (sıra MARKS ile birebir; hepsi sağlıklı kenarda 403 alan düz GET'ler). */
const MARK_KEYS = ['GET /', 'GET /auth/login', 'GET /dashboard', 'GET /auth/reset-password', 'GET /api/auth/me', 'GET /api/cases', 'GET /api/users', 'GET /api/health', 'GET /robots.txt', 'GET /api', 'GET /api/'];
// ─── DAR KABUL İSTİSNASI girdileri (R07) — bu dosyada BAĞIMSIZ yazılıdır (sondanın tanımından türetilmez) ──────────────────
/** İncelenmiş hata yanıtının gövdesi. Özelliklerin DEĞERLERİ (içerik türü · 155 bayt · SHA-256) owner metninde yoktur (owner "incelenmiş hata
 *  yanıtı özellikleriyle uyum" dedi): 2026-10-06 teşhis ölçümünde incelenen yanıttan uygulayıcı tarafından sabitlenmiştir (ölçüm
 *  kısıtlı kayıttadır). Gövde: standart "400 Bad Request" sayfası, CRLF satır sonlu, tam 155 bayt.
 *  Sonda yalnız bayt sayısını ve SHA-256'yı taşır; gövdenin kendisi yalnız burada kurulur (MR-1 kalemi özetini bağımsız hesaplar). */
const EXAM_BODY = ['<html>', '<head><title>400 Bad Request</title></head>', '<body>', '<center><h1>400 Bad Request</h1></center>', '<hr><center>cloudflare</center>', '</body>', '</html>', ''].join('\r\n');
const EXAM_SHA = 'EFCA0895B4D88B27A94249F8E7AC0083EFF0A4FF3AC37C2841B3F6D7E11C1905';
/** Sınıfın adı, uyarı cümlesi, vektör kimliği ve tanımlı vektör (yöntem + HAM hedef) — owner kararının metni. */
const MR = { name: 'İzin verilen bozuk istek reddi — katman doğrulanmadı', notice: 'Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir.', id: 'D8E2-BOS-BAYT-KODLU', method: 'GET', target: '/api/portal/cases%00/admin', date: '2026-10-06', rev: 'R07' };
const MR_KEY = MR.method + ' ' + MR.target;
/** Başka bir kodlama varyantı (çözülemeyen yüzde dizisi) — "incelenmiş yanıt BAŞKA vektöre gelirse" girdisi. */
const MR_OTHER_KEY = 'GET /api/portal/admin%c0%afdocuments/pending';
/** Sahte YEREL kenar (geri döngü, düz http): kip + zemin gerçeği (gördüğü HAM istek, Host başlığı, verdiği yanıt). */
let localMode = '403'; let seenLocal = [];
function localEdge(req, res) {
  let bodyLen = 0; req.on('data', (c) => { bodyLen += c.length; });
  req.on('end', () => {
    const h = req.headers; const s = { seq: ++seq, method: req.method, url: req.url, host: h.host, cred: !!(h.authorization || h.cookie || h['x-api-key'] || h['proxy-authorization']), bodyLen, rid: h[F.header], names: Object.keys(h).sort().join(), status: null, respId: null };
    seenLocal.push(s);
    const out = (status, headers, body) => { s.status = status; s.respId = headers[F.header] === undefined ? null : headers[F.header]; res.writeHead(status, headers); res.end(body || ''); };
    switch (localMode) {
      case '403': return out(403, { server: 'Caddy' }, '');                                             // sağlıklı yerel kenar: varsayılan ret, boş gövde
      case '403id': return out(403, { server: 'Caddy', 'content-type': 'application/json', [F.header]: crypto.randomUUID() }, '{"statusCode":403,"message":"Forbidden"}'); // yerel kenar GEÇİRMİŞ, 403'ü uygulama üretmiş (kimlik başlığıyla)
      case '404': return out(404, { server: 'Caddy' }, '');
      case '200': return out(200, { server: 'Caddy', 'content-type': 'text/html' }, '<!doctype html><title>x</title>');
      case '400exam': return out(400, { 'content-type': 'text/html' }, EXAM_BODY);                      // yerel kenar da aynı 400'ü veriyor (403 değil)
      case 'drop': s.status = 0; return req.socket.destroy();                                           // yanıt yok (taşıma hatası)
      default: return out(500, {}, '');
    }
  });
}
function send(res, s, status, headers, body, producer) {
  const h = {}; for (const k of Object.keys(headers)) if (headers[k] !== undefined) h[k] = headers[k]; // gelen istekte kimlik yoksa yansıtılacak değer de yoktur
  const v = h[F.header]; s.status = status; s.producer = producer; s.respId = v === undefined ? null : v; s.echoed = v === undefined ? 'none' : (v === s.rid ? 'same' : 'other'); s.respUuid = typeof v === 'string' && UUID4.test(v);
  // Zemin gerçeği — azaltım işareti: başlık gönderilmediyse YOK; gönderildiyse girdinin BEYAN ettiği sınıf (beyansız başlık = düzenek hatası).
  s.mark = h[MIT_HEADER] === undefined ? 'YOK' : (s.markDecl || 'BEYANSIZ'); s.challenge = s.mark === 'SINAMA';
  res.writeHead(status, h); res.end(body || '');
}
/** Taşıma hatası üretir (yanıt YOK): 'drop' bağlantıyı koparır; 'hang' hiç yanıtlamaz (sonda zaman aşımına düşer). */
function noResponse(req, s, kind) { s.status = 0; s.producer = kind; s.echoed = 'none'; s.respId = null; s.respUuid = false; s.challenge = false; s.mark = null; if (kind === 'drop') req.socket.destroy(); }
/** SAHTE API — ürün ara katmanının birebir modeli. `o.strip`: zincirde API yanıtından başlığı SİLEN katman · `o.overwrite`: API'nin
 *  başlığının ÜZERİNE YAZAN katman · `o.strict`: API kaynaktakinden farklı bir kabul deseniyle çalışıyor · `o.extra`: eklenen başlık. */
function apiSend(req, res, s, status, o) {
  o = o || {}; const mw = apiMw(req.method, req.url); s.apiMw = mw;
  if (mw === 'CORS') return send(res, s, 204, { 'content-length': '0', vary: 'Origin, Access-Control-Request-Headers', server: 'Caddy' }, '', 'api');
  if (mw === 'COZME-HATASI') return send(res, s, 400, Object.assign({}, JSONH), '{"statusCode":400,"message":"Bad Request"}', 'api');
  if (mw === 'ESLESMEZ') return send(res, s, 404, Object.assign({}, JSONH), '{"statusCode":404,"message":"Not Found"}', 'api');
  const inc = req.headers[F.header]; const accept = o.strict ? STRICT_RX : F.safe;
  const h = Object.assign({ 'x-powered-by': 'Express' }, JSONH);
  h[F.header] = (typeof inc === 'string' && accept.test(inc)) ? inc : crypto.randomUUID(); // normalizeRequestId(incoming) ?? randomUUID()
  s.apiWrote = h[F.header] === inc ? 'AYNEN' : 'YENI';
  if (o.strip) delete h[F.header];
  if (o.overwrite !== undefined) h[F.header] = o.overwrite;
  if (o.extra) Object.assign(h, o.extra); // zincirde API yanıtına eklenen başlık (ör. azaltım işareti girdisi)
  return send(res, s, status, h, JSON.stringify({ statusCode: status, message: 'model' }), 'api');
}
function edge(req, res) {
  let bodyLen = 0; req.on('data', (c) => { bodyLen += c.length; });
  req.on('end', () => {
    const p = req.url; const h = req.headers; // Node req.url ham request-target'tır: './', '%2F', '?x=1' normalize edilmez
    const s = { seq: ++seq, method: req.method, url: p, cred: !!(h.authorization || h.cookie || h['x-api-key'] || h['proxy-authorization']), bodyLen, rid: h[F.header], hasRid: typeof h[F.header] === 'string' };
    s.ridOk = s.hasRid && F.safe.test(s.rid); // ürün kaynağındaki desen bu değeri KABUL eder mi (zemin gerçeği)
    seen.push(s);
    const np = cleanPath(p); // Caddy'nin karar verdiği temizlenmiş yol
    const allowed = (req.method === 'GET' && (RX.web.test(np) || RX.aget.test(np))) || (req.method === 'POST' && RX.apost.test(np)) || (req.method === 'DELETE' && RX.adel.test(np));
    const admin = ADMIN_RX.test(np); const deny = admin || !allowed; const apiish = np === '/api' || np.startsWith('/api/');
    const authLeak = deny && req.method !== 'OPTIONS' && np.startsWith('/api/auth/'); // bazı senaryolarda kenarın farklı davrandığı ret vektörleri
    const edgeSend = (status, headers, body) => send(res, s, status, headers, body, 'edge');
    const edge403 = (headers, body) => edgeSend(403, headers || { server: 'Caddy' }, body || '');
    const web200 = (extra) => send(res, s, 200, Object.assign({ 'content-type': 'text/html', server: 'Caddy' }, extra || {}), '<!doctype html><title>portal</title>', 'web');
    const upstream = (o) => (apiish ? apiSend(req, res, s, 401, o) : web200());
    const healthy = () => (deny ? edge403() : upstream());
    const k = req.method + ' ' + p; // tek bir vektörü ayırt eden girdi (yöntem + HAM yol)
    const ME = 'GET /api/auth/me'; // tek bir ret vektörü (düz /api yolu) — "bu istek API'ye ulaştı" girdilerinde kullanılır
    /** Azaltım işareti taşıyan 403: `value` gönderilen başlık değeri (dizi = iki ayrı satır), `cls` girdinin BEYAN ettiği sınıf (zemin gerçeği). */
    const mit403 = (value, cls) => { s.markDecl = cls; return edge403({ 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test', [MIT_HEADER]: value }, '<html><title>Just a moment...</title></html>'); };
    const challenge403 = () => mit403('challenge', 'SINAMA');
    const stamp = () => crypto.randomUUID(); // DAMGA: katmanın kendi kimlik değeri — API'nin ürettiği biçimle AYNI biçimde (en zor girdi)
    const reflect = { server: 'Caddy', [F.header]: s.rid }; // YANSIMA: isteğin kimliği yanıta kopyalanır
    const apiPrefixedNoPreflight = deny && apiish && req.method !== 'OPTIONS';
    /** İncelenmiş hata yanıtı (sağlayıcının 400 sayfası) ya da ondan `o` ile ayrılan bir yanıt. Zemin gerçeği `s.exam`: yanıt incelenmiş
     *  yanıtla BİREBİR aynıysa (durum 400 · içerik türü text/html · gövde tam o baytlar · kimlik başlığı yok) 'TAM', aksi 'FARKLI'. */
    const exam = (o) => { o = o || {}; const status = o.status || 400; const ct = o.ct || 'text/html'; const body = o.body === undefined ? EXAM_BODY : o.body;
      s.exam = (status === 400 && ct === 'text/html' && body === EXAM_BODY && o.id === undefined) ? 'TAM' : 'FARKLI';
      return send(res, s, status, { 'content-type': ct, server: 'cloudflare', 'cf-ray': 'test', [F.header]: o.id }, body, o.producer || 'saglayici'); };
    switch (mode) {
      case 'ok': return healthy();
      case 'waf': return deny ? edge403({ 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test' }, '<html>Sorry, you have been blocked · cloudflare · error code: 1020</html>') : upstream(); // ENGELLEME imzası (sınama işareti YOK)
      case 'bare': return deny ? edge403({}) : upstream();                                             // Server başlığı yok, boş gövde
      case 'behind': return deny ? edge403({ server: 'cloudflare', 'cf-ray': 'test' }) : upstream();    // sağlayıcı arkasında Caddy: boş gövde, imza yok
      case 'body403': return deny ? edge403(Object.assign({}, JSONH), '{"statusCode":403,"message":"Forbidden"}') : upstream(); // DOLU gövde, BAŞLIKSIZ (kenar üretir)
      // ── azaltım işareti ──
      case 'challenge': return deny ? challenge403() : upstream();                                      // SINAMA işaretli 403, bütün ret vektörlerinde
      case 'challenge1': return authLeak ? challenge403() : healthy();                                  // sınama işareti yalnız birkaç ret vektöründe
      case 'markmix': { const i = MARK_KEYS.indexOf(k); if (i < 0) return healthy(); s.markId = MARKS[i][0]; return mit403(MARKS[i][1], MARKS[i][2]); } // on bir ret vektöründe on bir ayrı işaret değeri
      case 'mitunk': return deny ? mit403('managed_challenge', 'TANINMAYAN') : upstream();              // TANINMAYAN değerli işaret, bütün ret vektörlerinde (durum kodları `waf` ile aynı)
      case 'mitempty1': return k === 'GET /dashboard' ? mit403('', 'TANINMAYAN') : healthy();           // BOŞ değerli işaret, tek bir ret vektöründe
      case 'markpos': {                                                                                 // işaret POZİTİFLERİN beklenen yanıtında (bir web 200 · bir API 401); ret vektörleri sağlıklı
        if (k === 'GET /portal/login') { s.markDecl = 'SINAMA'; return web200({ [MIT_HEADER]: 'challenge' }); }
        if (k === 'GET /api/portal/cases') { s.markDecl = 'TANINMAYAN'; return apiSend(req, res, s, 401, { extra: { [MIT_HEADER]: 'managed_challenge' } }); }
        return healthy();
      }
      case 'challengeapp403': return k === ME ? apiSend(req, res, s, 403) : (deny ? challenge403() : upstream()); // sınama işareti bütün ret vektörlerinde + BİR ret vektörünü API 403 ile yanıtlamış
      case 'markdeny200': if (k === 'GET /api/auth/capabilities') { s.markDecl = 'SINAMA'; return apiSend(req, res, s, 200, { extra: { [MIT_HEADER]: 'challenge' } }); } return healthy(); // işaretli 2xx ret vektörü
      // ── GERÇEK API DAVRANIŞI: engellenmesi gereken istek API'ye ulaşmış (API geçersiz biçimli kimliği atar, yenisini üretir) ──
      case 'app403': return authLeak ? apiSend(req, res, s, 403) : healthy();                           // API'nin ürettiği 403 (beş ret vektörü)
      case 'app403var': return k === 'GET /api/portal/%61dmin/documents/pending' ? apiSend(req, res, s, 403) : healthy(); // API'nin 403'ü yalnız yolu belirsiz (kodlama varyantı) vektörde
      case 'api5xx': return authLeak ? apiSend(req, res, s, 503) : healthy();
      case 'api429': return authLeak ? apiSend(req, res, s, 429) : healthy();
      case 'api302': return authLeak ? apiSend(req, res, s, 302) : healthy();
      case 'broken': return (deny && (np === '/api/auth/me' || admin)) ? apiSend(req, res, s, apiNatural(p)) : healthy(); // temizlenmiş yola göre sızdırır, HAM yolu iletir
      // ── YANSITAN aracı ──
      case 'reflectapinopt': return apiPrefixedNoPreflight ? edge403(reflect) : healthy();              // YALNIZ API önekli, ön uçuş OLMAYAN retlerde (başlıksız bölge temiz)
      case 'reflectapi': return (deny && apiish) ? edge403(reflect) : healthy();                        // API önekli bütün retlerde (ön uçuş dahil)
      case 'webecho': return deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: s.rid })); // kenar ve web yanıtlarında (API yanıtları değişmeden geçer)
      case 'reflectall': return deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401, { overwrite: s.rid }) : web200({ [F.header]: s.rid })); // HER yanıtta (API'nin başlığının üzerine de yazar)
      case 'reflectweb1': return k === 'GET /dashboard' ? edge403(reflect) : healthy();                 // tek bir web ret yanıtında (ön uçuş değil)
      case 'reflectpos1': return k === 'GET /portal/login' ? web200({ [F.header]: s.rid }) : healthy(); // tek bir web POZİTİFİNDE (GECERLI-BICIM gönderilen)
      case 'reflectpos2': return k === 'GET /portal/forgot-password' ? web200({ [F.header]: s.rid }) : healthy(); // tek bir web POZİTİFİNDE (GECERSIZ-BICIM gönderilen)
      case 'reflectapp403': return k === ME ? apiSend(req, res, s, 403) : (deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: s.rid }))); // yansıtan katman + API'ye ulaşan bir ret vektörü (API 403)
      // ── DAMGALAYAN aracı (kendi kimliğini yazar; yansıtmaz) ──
      case 'fark403': return deny ? edge403({ server: 'Caddy', [F.header]: stamp() }) : upstream();     // bütün ret yanıtlarında (web ve ön uçuş dahil)
      case 'stampleak': {                                                                               // başlıksız HER yanıta damga + API'ye ulaşan bir ret vektörü (API 401, değişmeden geçer)
        if (k === ME) return apiSend(req, res, s, 401);
        if (deny) return edge403({ server: 'Caddy', [F.header]: stamp() });
        return apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: stamp() });
      }
      case 'fark403web': return (deny && !/^\/api(\/|$)/i.test(np)) ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // yalnız önek DIŞI (web) ret yanıtlarında (büyük harfli önek API sayılır)
      case 'fark403opt': return (deny && apiish && req.method === 'OPTIONS') ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // yalnız API önekli ön uçuş yanıtında
      case 'stamppos1app403': return k === 'GET /portal/login' ? web200({ [F.header]: stamp() }) : (k === ME ? apiSend(req, res, s, 403) : healthy()); // damga tek bir web pozitifinde + API'nin 403'ü
      case 'fark403api': return apiPrefixedNoPreflight ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // SINIR-1: API biçiminde damga YALNIZ API önekli, ön uçuş olmayan retlerde
      case 'fark403apifix': return apiPrefixedNoPreflight ? edge403({ server: 'Caddy', [F.header]: 'kenar-0001' }) : healthy(); // aynı yerde ama API biçiminde OLMAYAN değer
      // ── EZEN aracı (API'nin başlığını siler / üzerine yazar) ──
      case 'apinoecho': return deny ? edge403() : upstream({ strip: true });                            // başlık bütün API yanıtlarından silinir
      case 'stripleak': return k === ME ? apiSend(req, res, s, 401, { strip: true }) : (deny ? edge403() : upstream({ strip: true })); // başlık silinir + API'ye ulaşan bir ret vektörü
      case 'striponly403': return k === ME ? apiSend(req, res, s, 403, { strip: true }) : healthy();    // SINIR-2: başlık YALNIZ API'nin 403 yanıtından silinir
      case 'crushapi': return k === ME ? apiSend(req, res, s, 403, { overwrite: stamp() }) : (deny ? edge403() : upstream({ overwrite: stamp() })); // API yanıtlarının başlığı üzerine katmanın kendi değeri yazılır
      case 'strictfmt': return k === ME ? apiSend(req, res, s, 403, { strict: true }) : (deny ? edge403() : upstream({ strict: true })); // API kaynaktakinden farklı kabul deseniyle çalışıyor
      // ── kısmi kalibrasyon ──
      case 'partial5': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : healthy();                         // 6 API pozitifinden biri başlıksız
      case 'partial1': return (!deny && apiish && k !== 'GET /api/portal/cases') ? upstream({ strip: true }) : healthy();          // yalnız biri başlıklı
      case 'partialvalid': return (!deny && apiish && s.ridOk) ? upstream({ strip: true }) : healthy();                          // GECERLI-BICIM gönderilen API pozitifleri başlıksız (yalnız "değiştirme" görülür)
      case 'partialinvalid': return (!deny && apiish && !s.ridOk) ? upstream({ strip: true }) : healthy();                       // GECERSIZ-BICIM gönderilen API pozitifleri başlıksız (yalnız "aynen geri yazma" görülür)
      case 'partial5leak': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 401) : healthy());
      case 'partial5app403': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 403) : healthy());
      // ── koşumun kalibrasyonu API'nin "kabul edilmeyen biçim → yeni kimlik" davranışını gösteriyor mu (değiştirme n / 3) + bir ret satırında "yeni kimlik" ──
      case 'noreplapp403': return (!deny && apiish && !s.ridOk) ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 403) : healthy());                     // GECERSIZ-BICIM gönderilen üç API pozitifi başlıksız (değiştirme 0/3) + bir ret vektörünü API 403 ile yanıtlamış
      case 'onereplapp403': return (!deny && apiish && k !== 'GET /api/portal/documents') ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 403) : healthy()); // API pozitiflerinden yalnız BİRİ başlıklı — GECERSIZ-BICIM gönderilen (değiştirme 1/3) + aynı ret vektörü
      case 'echoposstamp1': return k === ME ? edge403({ server: 'Caddy', [F.header]: stamp() }) : (deny ? edge403() : (apiish ? apiSend(req, res, s, 401, { overwrite: s.rid }) : web200())); // API pozitifleri gönderilen değeri AYNEN döndürüyor (değiştirme 0/3) + TEK bir KENAR 403'ünde API biçiminde kimlik
      case 'pos403leak': return k === 'POST /api/portal/messages' ? edge403() : (k === ME ? apiSend(req, res, s, 401) : healthy());
      case 'posdropweb': return k === 'GET /portal/login' ? noResponse(req, s, 'drop') : healthy();                              // bir web pozitifi ölçülemedi
      case 'zonedropapp403': return (!/^\/+api(\/|$)/i.test(np) || req.method === 'OPTIONS') ? noResponse(req, s, 'drop') : (k === ME ? apiSend(req, res, s, 403) : healthy()); // web yolları ve ön uçuş YANITSIZ + API'nin 403'ü
      // ── 403 dışı, API'den geldiği kanıtsız yanıtlar ──
      case 'edge5xx': return authLeak ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'edge404': return authLeak ? edgeSend(404, { server: 'cloudflare' }, '') : healthy();
      case 'rate429': return authLeak ? edgeSend(429, { server: 'cloudflare', 'retry-after': '1' }, '') : healthy();
      case 'redirect': return authLeak ? edgeSend(302, { server: 'Caddy', location: REDIRECT_TARGET }, '') : healthy();
      case 'edge600': return authLeak ? edgeSend(600, { server: 'Caddy' }, '') : healthy();                                       // hiçbir sınıfa girmeyen durum kodu
      case 'denydrop1': return k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy();                                  // TEK bir ret vektörü yanıtsız
      // ── tekdüze yanıtlar (sunulmayan ad) ve kardeşleri ──
      case 'uniform': return edge403();
      case 'uni404': return edgeSend(404, {}, '');                                                      // 68/68 başlıksız 404
      case 'uni301': return edgeSend(301, { location: REDIRECT_TARGET }, '');                           // 68/68 yönlendirme
      case 'uni401': return edgeSend(401, {}, '');                                                      // 68/68 başlıksız 401 (API pozitiflerinin beklenen kodu)
      case 'uni404stamp': return edgeSend(404, { [F.header]: stamp() }, '');                            // 68/68 404, her yanıtta katmanın KENDİ kimlik değeri
      case 'uni404reflect': return edgeSend(404, { [F.header]: s.rid }, '');                            // 68/68 404, her yanıtta isteğin kimliği YANSITILMIŞ
      case 'uni404drop': return k === 'GET /api/users' ? noResponse(req, s, 'drop') : edgeSend(404, {}, ''); // 67 × 404 + bir taşıma hatası
      case 'uni200': return edgeSend(200, {}, 'ok');                                                    // 68/68 200 (ret vektörleri REDDEDİLMEDİ)
      case 'pos404web': return (!deny && !apiish) ? edgeSend(404, {}, '') : healthy();                  // yalnız üç web pozitifi 404
      case 'pos404all': return !deny ? edgeSend(404, {}, '') : healthy();                               // dokuz pozitifin hepsi 404; ret vektörleri 403
      case 'uni404echo1': return k === ME ? apiSend(req, res, s, 404) : edgeSend(404, {}, '');          // 68/68 404 ama bir ret yanıtını API üretti
      case 'uni404one403': return k === 'GET /dashboard' ? edge403() : edgeSend(404, {}, '');           // 67 × 404 + bir ret vektörü 403 (tekdüze DEĞİL)
      // ── pozitif kontrol ──
      case 'pos200': return (!deny && req.method === 'GET' && np === '/api/portal/cases') ? apiSend(req, res, s, 200) : healthy();
      case 'pos302web': return k === 'GET /portal/login' ? edgeSend(302, { server: 'Caddy', location: REDIRECT_TARGET }, '') : healthy();
      case 'pos403web': return k === 'GET /portal/reset-password' ? edge403() : healthy();
      case 'pos403api': return k === 'POST /api/portal/messages' ? edge403() : healthy();
      case 'pos403allapi': return deny ? edge403() : (apiish ? apiSend(req, res, s, 403) : edge403());   // DOKUZ pozitifin hepsi 403: API pozitiflerinde 403'ü API üretir (kimlik başlığıyla; kalibrasyon tam), web pozitiflerinde kenar; ret vektörleri sağlıklı
      case 'pos5xxweb': return k === 'GET /portal/login' ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'pos5xxapi': return k === 'GET /api/portal/cases' ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'pos429api': return k === 'POST /api/portal/messages' ? edgeSend(429, { server: 'cloudflare', 'retry-after': '1' }, '') : healthy(); // bir API pozitifinde kanıtsız 429
      case 'pos600web': return k === 'GET /portal/forgot-password' ? edgeSend(600, { server: 'Caddy' }, '') : healthy();                        // bir web pozitifinde hiçbir sınıfa girmeyen durum kodu
      // API'nin İZİNLİ bir yolda ürettiği beklenmeyen yanıt (ara katman başlığıyla) — İKİ SIRA: sınıf içi 1. API pozitifi (GECERLI-BICIM
      // gönderilir → API kimliği AYNEN yazar) ve sınıf içi 2. API pozitifi (GECERSIZ-BICIM gönderilir → API YENİ kimlik üretir).
      case 'posapi503a': return k === 'GET /api/portal/cases' ? apiSend(req, res, s, 503) : healthy();
      case 'posapi503b': return k === 'GET /api/portal/documents' ? apiSend(req, res, s, 503) : healthy();
      case 'posapi429a': return k === 'GET /api/portal/cases' ? apiSend(req, res, s, 429) : healthy();
      case 'posapi429b': return k === 'GET /api/portal/documents' ? apiSend(req, res, s, 429) : healthy();
      // ── bulgu + ölçülemeyen birlikte (öncelik) ──
      case 'mix2xxdrop': return k === 'GET /api/auth/capabilities' ? apiSend(req, res, s, 200) : (k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy());
      case 'mix401hang': return k === ME ? apiSend(req, res, s, 401) : (k === 'GET /api/users' ? noResponse(req, s, 'hang') : healthy());
      case 'mixpos200drop': return k === 'GET /api/portal/cases' ? apiSend(req, res, s, 200) : (k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy());
      case 'passall': {                                                                                 // kenar HER ŞEYİ geçirir (zemin gerçeği senaryosu)
        if (/^\/+api(\/|$)/i.test(p.split('?')[0]) || apiish) return apiSend(req, res, s, apiNatural(p));
        return /^\/portal\/(login|forgot-password|reset-password)$/.test(np) ? web200() : send(res, s, 404, { 'content-type': 'text/html', server: 'Caddy' }, '<!doctype html><title>404</title>', 'web');
      }
      // ── DAR KABUL İSTİSNASI girdileri (R07): incelenmiş 400 yanıtı ve ondan TEK bir özelliği ayrılan yanıtlar; diğer bütün istekler sağlıklı ──
      case 'mrc': return k === MR_KEY ? exam() : healthy();                                             // tanımlı vektöre incelenmiş yanıt BİREBİR
      case 'mrcother': return k === MR_OTHER_KEY ? exam() : healthy();                                  // incelenmiş yanıt BAŞKA bir vektöre; tanımlı vektör 403
      case 'mrcany00': return /%00/.test(p) ? exam() : healthy();                                       // içinde %00 geçen HER ham yola, HER yöntemde (sonda kopyalarının girdisi)
      case 'mrc200': return k === MR_KEY ? exam({ status: 200 }) : healthy();                           // aynı gövde / içerik türü ama 2xx
      case 'mrcidnew': if (k === MR_KEY) { s.apiWrote = 'YENI'; return exam({ id: crypto.randomUUID(), producer: 'api' }); } return healthy(); // aynı yanıt + API'nin ürettiği biçimde YENİ kimlik (zemin gerçeği: API yanıtladı)
      case 'mrcidecho': return k === MR_KEY ? exam({ id: s.rid }) : healthy();                          // aynı yanıt + isteğin kimliği YANSITILMIŞ
      case 'mrcbody1': return k === MR_KEY ? exam({ body: EXAM_BODY.replace('<h1>400 Bad', '<h1>400 bad') }) : healthy(); // gövde aynı uzunlukta, TEK bayt farklı
      case 'mrcct': return k === MR_KEY ? exam({ ct: 'text/html; charset=utf-8' }) : healthy();         // gövde aynı, içerik türü farklı
      case 'mrcgeneric': return k === MR_KEY ? exam({ body: '' }) : healthy();                          // YALNIZ genel sağlayıcı başlığı (Server + iz başlığı); gövde boş
      default: return edgeSend(500, {}, '');
    }
  });
}

// ─── Kalem kaydı ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const results = [];
/** fn → { ok, obs } ya da { skip: true, obs }. İstisna = FAIL (sonda beklenen yapıyı üretmedi), ölçülemedi DEĞİL. */
function item(id, d, fn) {
  let r; try { r = fn(); } catch (e) { r = { ok: false, obs: 'KALEM DEĞERLENDİRİLEMEDİ: ' + String((e && e.message) || e).slice(0, 200) }; }
  results.push({ id, d, state: r.skip ? 'OLCULEMEDI' : (r.ok ? 'PASS' : 'FAIL'), obs: r.obs || '' });
}
function spawnP(exe, args, env) {
  return new Promise((res) => {
    let c; try { c = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return res({ code: null, log: '', spawnError: String(e.code || e.message) }); }
    let l = ''; c.stdout.on('data', (x) => { l += x; }); c.stderr.on('data', (x) => { l += x; });
    c.on('error', (e) => res({ code: null, log: l, spawnError: String(e.code || e.message) })); c.on('close', (code) => res({ code, log: l }));
  });
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const readBytes = (f) => { try { return fs.readFileSync(f); } catch (e) { return null; } };
// Alan sırası HER yerde: HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol.
const FIELDS = ['httpReject', 'edgeBlocking', 'layerVerification', 'positiveControl']; const FIELD_VALUES = ['PASS', 'FAIL', 'OLCULEMEYEN'];
/** (a) HTTP / ret alanının TEK ek değeri (R07; owner şartı 2026-10-06) — bu dosyada BAĞIMSIZ yazılıdır. Kısaltması I. */
const HX = 'OWNER-ISTISNASIYLA-UYGUN';
const ABBR = { P: 'PASS', F: 'FAIL', O: 'OLCULEMEYEN', I: HX };
const V = (S) => S.ev.nameVerdict; const rowsOf = (S, g) => S.ev.rows.filter((x) => x.group === g);
const vals = (S) => FIELDS.map((f) => V(S)[f].value);
/** Koşumun çıkış kodu ve dört alanı beklenenle aynı mı — `want` "P/O/O/P" biçimindedir (alan sırasıyla). */
const is = (S, code, want) => !!S.ev && S.code === code && S.ev.exitCode === code && vals(S).join('/') === want.split('/').map((a) => ABBR[a]).join('/');
/** Bir alandaki bir nedenin sayısı. */
const rc = (S, field, name) => V(S)[field].reasons.filter((r) => r.reason === name).reduce((a, r) => a + r.count, 0);
const reasonNames = (S, field) => V(S)[field].reasons.map((r) => `${r.reason}×${r.count}`).join(',') || '-';
/** Sonda satırı ↔ zemin gerçeği (aynı sıra; uzunluk tutmuyorsa istisna → FAIL). */
const J = (S) => { if (!S.ev || S.gt.length !== S.ev.rows.length) throw new Error(`satır ${S.ev ? S.ev.rows.length : 'yok'} ≠ kenarın gördüğü ${S.gt.length}`); return S.ev.rows.map((row, i) => ({ row, gt: S.gt[i] })); };
const layerVec = (S) => S.ev.rows.map((x) => x.layerId + '/' + x.layerWhy).join(',');
const brief = (S) => { if (!S.ev || !S.ev.nameVerdict || !S.ev.nameVerdict.httpReject) return `çıkış=${S.code} · kanıt beklenen yapıda değil`; const v = vals(S); return `çıkış=${S.code} · http=${v[0]} · kenar=${v[1]} [${reasonNames(S, 'edgeBlocking')}] · katman=${v[2]} · pozitif=${v[3]} · kalibrasyon=${S.ev.calibration ? S.ev.calibration.result : '?'}`; };
/** Zemin gerçeğinden BAĞIMSIZ türetilen kimlik anlamı: kenarın gördüğü kimlik (kaynak deseni kabul eder mi) × kenarın yazdığı yanıt değeri. */
const gtSignal = (s) => (s.status === 0 ? 'SONUC-YOK' : (s.echoed === 'none' ? 'YOK' : (s.echoed === 'same' ? (s.ridOk ? 'AYNEN-GERI-YAZMA' : 'YANSIMA') : ((!s.ridOk && s.respUuid) ? 'DEGISTIRME' : 'YABANCI-KIMLIK'))));
/** Çıkış kodu eşlemesi — bu dosyada BAĞIMSIZ yazılıdır (R06: ölçüm koşumu 0 üretmez). */
const exitOf = (v) => (v.includes('FAIL') ? 2 : 3);
/** Kenar engelleme alanının "temiz gözlem ama bağımsız kanıt yok" neden sınıfı — bu dosyada BAĞIMSIZ yazılıdır (sondanınkiyle karşılaştırılır). */
const NOEV = 'ULASMAMA-BAGIMSIZ-KANITI-YOK';
/** Başlıksız düz /api satırının katman nedeni — bu dosyada BAĞIMSIZ yazılıdır. */
const NOHDR = 'BASLIK-YOKLUGU-KANIT-DEGIL';
/** Sondanın üretebileceği katman kimlikleri — "API değil" diye bir sınıf YOKTUR. */
const LAYER_ID_SET = ['UYGULAMA-API', 'OLCULEMEYEN', 'SONUC-YOK'];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-selftest-')); const cert = path.join(dir, 'cert.pem'); const key = path.join(dir, 'key.pem');
  let srv = null; let lsrv = null; let shellVersions = 'ölçülmedi';
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, edge);
    try { fs.unlinkSync(key); } catch (e) { /* özel anahtar bellekte; dosyası kanıt dizininde bırakılmaz */ }
    await new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', r); });
    // Sahte YEREL kenar (R07): yalnız geri döngüde, düz http. Dış ad `localhost:<PORT>` iken yerel kenar `127.0.0.1:<LOCAL_PORT>`'tur —
    // sondanın yerel isteğinde Host başlığının dış adın ana makinesi olduğu bu ayrımla ölçülür (MR-1).
    lsrv = http.createServer(localEdge); await new Promise((r, j) => { lsrv.once('error', j); lsrv.listen(LOCAL_PORT, '127.0.0.1', r); });
  } catch (e) { console.log('OLCULEMEDI: sahte kenar kurulamadı (' + String((e && (e.code || e.message)) || e).slice(0, 120) + ')'); process.exit(2); }
  const ORIGIN = `https://localhost:${PORT}`; const LOCAL_ORIGIN = `http://127.0.0.1:${LOCAL_PORT}`;
  const baseEnv = {}; for (const k of Object.keys(process.env)) if (!/^(NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|D8_HTTP_TIMEOUT_MS|D8_SELFTEST_PORT|D8_SELFTEST_LOCAL_PORT|D8_SELFTEST_PROBE)$/i.test(k)) baseEnv[k] = process.env[k];
  const env = Object.assign({}, baseEnv, { NODE_EXTRA_CA_CERTS: cert });
  const run = (args, e, probe) => spawnP(process.execPath, [probe || PROBE].concat(args), e || env);

  // ── Kapsam yetkisi kaydı düzeneği (SENTETİK kayıt ve kanıt dosyaları; öz-testin geçici dizininde) ──
  const scopeDir = path.join(dir, 'kapsam'); fs.mkdirSync(scopeDir);
  const today = new Date().toISOString().slice(0, 10); const P_T = 'SAGLAYICI-HESABI-KAYDI'; const D_T = 'DNS-ZINCIRI'; const T_T = 'TUNEL-KAYDI';
  const REFUSAL = 'KOŞULMADI — kapsam yetkisi doğrulanmadı'; // bu dosyada BAĞIMSIZ yazılıdır: sondanın iletisi ve belge §1b satırı bununla karşılaştırılır
  const ACCEPT = 'kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde'; // BAĞIMSIZ yazılıdır: sondanın çıktısı ve belge §1b hücresi bununla karşılaştırılır
  const mkEv = (name, content) => { const f = path.join(scopeDir, name); fs.writeFileSync(f, content); return { file: f, sha256: sha(fs.readFileSync(f)) }; };
  const evP = mkEv('saglayici-hesabi-kaydi.txt', 'SENTETIK (oz-test): yetkili saglayici hesabindaki bolge / ozel ad kaydi\n');
  const evD = mkEv('dns-zinciri.txt', 'SENTETIK (oz-test): DNS zinciri\n'); const evT = mkEv('tunel-kaydi.txt', 'SENTETIK (oz-test): tunel kaydi\n');
  /** BİRLEŞİK BELGE: sağlayıcı hesabı kaydı ile DNS zinciri TEK dosyada (iki kalem aynı dosyayı gösterir). */
  const evC = mkEv('birlesik-sahiplik-belgesi.txt', 'SENTETIK (oz-test): BIRLESIK BELGE\n[1] yetkili saglayici hesabindaki bolge / ozel ad kaydi\n[2] DNS zinciri\n');
  const itm = (type, ev, o) => Object.assign({ type, file: ev.file, sha256: ev.sha256, date: today }, o || {});
  /** İçerik incelemesi beyanı (insan incelemesi; sentetik): kim · ne zaman · hangi kalem türleri. İnceleyenin adı kanıta / özete / çıktıya YAZILMAMALIDIR. */
  const REVIEWER = 'Sentetik-Inceleyen-D8OZTEST'; const rev = (o) => Object.assign({ reviewer: REVIEWER, date: today, itemTypes: [P_T, D_T] }, o || {});
  let recSeq = 0; const mkRec = (o) => { const f = path.join(scopeDir, `kayit-${++recSeq}.json`); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); return f; };
  const fullRec = (alias, o) => Object.assign({ record: 'EXTACC-D8-SCOPE-AUTHORIZATION', nameAlias: alias, originHost: 'localhost', items: [itm(P_T, evP), itm(D_T, evD)], review: rev() }, o || {});
  /** SAHTE SAAT (yalnız kapsam yetkisi tarih denetimi girdileri için): sondaya DOKUNULMAZ; alt sürece ön yükleme ile `Date.now` sabitlenir,
   *  yerel saat dilimi TZ ile verilir. İstek atılmayan `--phone-list` kipinde kullanılır (kapı iki kipte de aynı satırdır). */
  const clockFile = path.join(dir, 'saat-on-yukleme.js');
  fs.writeFileSync(clockFile, "'use strict';\nconst ms = Number(process.env.D8_SELFTEST_FAKE_NOW_MS);\nif (!Number.isFinite(ms)) { console.error('SAAT ON YUKLEMESI: deger yok'); process.exit(9); }\nDate.now = () => ms;\n");
  const clockEnv = (nowIso, tz) => Object.assign({}, env, { TZ: tz, D8_SELFTEST_FAKE_NOW_MS: String(Date.parse(nowIso)), NODE_OPTIONS: '--require "' + clockFile.replace(/\\/g, '/') + '"' });
  const recFor = {}; const scopeArgs = (alias) => (alias === 'AD-1' ? [] : ['--scope-record', recFor[alias] || (recFor[alias] = mkRec(fullRec(alias)))]);

  const ALL = []; // değişmez kalemlerinin (GT-1, X-1) taradığı koşumlar: paket sondasının sahte kenara karşı bütün koşumları
  /** Bir senaryo koşumu: sahte ucu kipe alır, sondayı koşturur, ham kanıtı + adsız özeti + zemin gerçeğini döndürür (hiç atmaz).
   *  AD-1 dışındaki ad kimliği için tam bir (sentetik) kapsam yetkisi kaydı verilir. `limit`: sondanın ölçemediği sınırın kaydı. */
  /** `extra`: sondaya eklenen argümanlar (R07: --local-edge / --offprobe-evidence); `local`: sahte YEREL kenarın kipi (varsayılan 403).
   *  `gtLocal`: sahte yerel kenarın zemin gerçeği (bu koşumda gördüğü istekler). */
  async function scenario(m, o) {
    o = o || {}; mode = m; seen = []; localMode = o.local || '403'; seenLocal = []; const tag = o.tag || m; const out = path.join(dir, tag + '.json'); const alias = o.alias || 'AD-1';
    const args = ['--alias', alias, '--vantage', o.vantage || 'oz-test-yerel', '--origin', ORIGIN, '--out', out].concat(scopeArgs(alias), o.extra || []);
    const r = await run(args, o.env, o.probe); const gt = seen; seen = []; const gtLocal = seenLocal; seenLocal = []; localMode = '403';
    const sumPath = out.replace(/\.json$/, '.ozet.json'); const sumBytes = readBytes(sumPath);
    let sum = null; try { sum = sumBytes ? JSON.parse(sumBytes.toString('utf8')) : null; } catch (e) { sum = null; }
    const S = { mode: m, tag, limit: o.limit || null, probe: o.probe || PROBE, code: r.code, log: r.log, out, ev: readJson(out), evBytes: readBytes(out), sumPath, sumBytes, sum, gt, gtLocal, extra: o.extra || [] };
    if (!o.noInv) ALL.push(S);
    return S;
  }
  let gateSeq = 0;
  /** Kapı denemesi: verilen argümanlarla koşar; kenarın (ve sahte yerel kenarın) gördüğü istek sayısını da döndürür. */
  async function gate(args, e) { mode = 'ok'; seen = []; seenLocal = []; const r = await run(args, e); const n = seen.length; const nl = seenLocal.length; seen = []; seenLocal = []; return { code: r.code, log: r.log, seen: n, seenLocal: nl }; }
  const gateOut = () => path.join(dir, `gate-${++gateSeq}.json`);

  const src = fs.readFileSync(PROBE, 'utf8');
  const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n}', i); return j < 0 ? '' : src.slice(i, j + 2); };
  /** Vektör listesi sondanın KAYNAK METNİNDEN (sondayı çalıştırmadan) okunur. */
  function parseVectors(text) {
    const d0 = text.indexOf('const DENY = ['); const a0 = text.indexOf('const ALLOW = [');
    const denyBlock = text.slice(d0, text.indexOf('];', d0)); const allowBlock = text.slice(a0, text.indexOf('];', a0));
    const deny = []; const allow = []; let m;
    const rxD = /^\s*\['[^']*',\s*'(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',\s*'([^']*)'/gm; while ((m = rxD.exec(denyBlock))) deny.push({ group: 'deny', method: m[1], url: m[2], expect: [403] });
    const rxA = /^\s*\['[^']*',\s*'(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',\s*'([^']*)',\s*\[([0-9,\s]+)\]\]/gm; while ((m = rxA.exec(allowBlock))) allow.push({ group: 'allow', method: m[1], url: m[2], expect: m[3].split(',').map((x) => Number(x.trim())) });
    return { deny, allow, all: deny.concat(allow), denyBlock, allowBlock };
  }
  const vectorSetIdOf = (vec) => sha(Buffer.from(vec.all.map((v) => `${v.group} ${v.method} ${v.url} ${v.expect.join(',')}`).join('\n'), 'utf8'));
  const VEC = parseVectors(src);
  // D8-E2 — izole provadan taşınan 18 kodlama/normalizasyon ham yolu (edge-allowlist-probe.js EVASION ile birebir).
  const evasionPaths = [
    '/api/portal/%61dmin/documents/pending', '/api/portal/%61dmin/create-user', '/api/portal/admin%2Fdocuments%2Fpending',
    '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending', '/api/portal/cases/../admin/documents/pending',
    '/api/portal/documents/..%2Fadmin/documents/pending', '//api/portal/admin/documents/pending',
    '/api/portal/./admin/documents/pending', '/API/portal/cases', '/api/portal/ADMIN/documents/pending',
    '/api/portal/cases/', '/api/portal/cases;x=1', '/intake/abc/../../auth/login', '/_next/../auth/login',
    '/_next/%2e%2e/auth/login', '/api/portal/cases%00/admin', '/api/portal/documents/%252e%252e/admin',
    '/api/portal/admin%c0%afdocuments/pending',
  ];
  try {
    item('K-SRC', 'ürün kaynağı okundu (kimlik protokolünün dayanağı): başlık adı x-request-id · SAFE_REQUEST_ID biçimi · gelen değer kabul biçimindeyse AYNEN yanıta yazılır, değilse atılıp randomUUID() ile yenisi üretilir · ara katman forRoutes(\'*\') · genel önek "api" · enableCors — VE sondanın iki deseni kaynakla aynı: kabul deseninin METNİ kaynaktakiyle birebir; "üretilen kimlik" deseni randomUUID() çıktılarını (200 örnek) tanır; sondanın iki gönderim biçimi kaynak deseniyle ölçüldüğünde biri kabul edilir, diğeri edilmez — biri değişirse sondanın kuralı yeniden türetilmelidir', () => {
      const acc = (/^const RID_ACCEPTED_RX = \/(.+)\/;$/m.exec(src) || [])[1]; const gen = (/^const RID_GENERATED_RX = \/(.+)\/;$/m.exec(src) || [])[1]; const genRx = gen ? new RegExp(gen) : /$^/;
      const uu = Array.from({ length: 200 }, () => crypto.randomUUID());
      const ok = F.header === 'x-request-id' && F.prefix === 'api' && F.wildcard && F.cors && F.writesBackOrReplaces && F.safe.test('d8r' + 'a'.repeat(32)) && !F.safe.test('d8r~' + 'a'.repeat(32)) && !F.safe.test('-x') && !F.safe.test('a b') && !F.safe.test('a'.repeat(129))
        && acc === F.safeSrc && uu.every((u) => genRx.test(u) && UUID4.test(u)) && !genRx.test('d8r' + 'a'.repeat(32)) && !genRx.test('kenar-0001') && !genRx.test(uu[0].toUpperCase());
      return { ok, obs: `başlık=${F.header} · biçim=/${F.safeSrc}/ · sondadaki kabul deseni kaynakla aynı=${acc === F.safeSrc} · aynen-ya-da-yeni satırları=${F.writesBackOrReplaces} · üretilen kimlik deseni 200/200=${uu.every((u) => genRx.test(u))} · forRoutes('*')=${F.wildcard} · önek=${F.prefix} · enableCors=${F.cors}` };
    });

    // K-PORT — port kapısı: bu dosya yasak portla başlatılır; kapı, sertifika / dinleme / sonda koşumundan ÖNCE durur.
    const portRuns = []; const portChild = (p, lp) => spawnP(process.execPath, [__filename], Object.assign({}, baseEnv, { D8_SELFTEST_PORT: String(p), D8_SELFTEST_GATE_ONLY: '1' }, lp === undefined ? {} : { D8_SELFTEST_LOCAL_PORT: String(lp) }));
    // Yasak liste bu kalemde BAĞIMSIZ yazılıdır (dosyanın başındaki sabitten türetilmez): tek portlar + iki aralığın uçları ve içinden birer port.
    const BAD_PORTS = [8080, 3002, 8081, 5432, 5447, 5448, 5449, 5591, 18095, 47200, 47250, 47299, 47998, 47999];
    for (const p of BAD_PORTS.concat(['80', 'abc'])) { const r = await portChild(p); portRuns.push({ p, code: r.code, rej: /REDDEDİLDİ/.test(r.log), passed: /KAPI GEÇİLDİ/.test(r.log) }); }
    // Sahte YEREL kenarın portu aynı kapıdan geçer: yasak port (8081, 8080, aralık içi), sahte kenar portuyla AYNI port, geçersiz değer → ret.
    const localRuns = []; for (const lp of [8081, 8080, 47210, 47998, PORT, '80', 'abc']) { const r = await portChild(PORT, lp); localRuns.push({ p: lp, code: r.code, rej: /REDDEDİLDİ: D8_SELFTEST_LOCAL_PORT/.test(r.log), passed: /KAPI GEÇİLDİ/.test(r.log) }); }
    const edgeOfRange = []; for (const p of [47199, 47300, 47997]) { const r = await portChild(p); edgeOfRange.push({ p, code: r.code, passed: /KAPI GEÇİLDİ/.test(r.log) }); } // aralıkların hemen DIŞI kapıdan geçer (kapı aralığı taşmıyor)
    const portOk = await portChild(PORT, LOCAL_PORT); // karşı girdi: izinli portlar kapıdan geçer (alt süreç yalnız kapıyı ölçer; dinlemez)
    item('K-PORT', 'öz-test port kapısı: D8_SELFTEST_PORT canlı / veritabanı / ayrılmış port (8080, 3002, 8081, 5432, 5447, 5448, 5449, 5591, 18095; aralıklar 47200–47299 ve 47998–47999 — uçları ve içi) ya da geçersiz (80, abc) ise çıkış 4 ve kapı geçilmez; aralıkların hemen dışındaki port (47199, 47300, 47997) kapıdan geçer; sahte YEREL kenarın portu (D8_SELFTEST_LOCAL_PORT) aynı kapıdan geçer: yasak port (8081, 8080, 47210, 47998), sahte kenar portuyla aynı port ya da geçersiz değer → çıkış 4; izinli portlar (bu koşumun iki portu) kapıdan geçer; bu koşum verilen iki portta dinliyor (yerel kenar yalnız geri döngüde)',
      () => ({ ok: FORBIDDEN_PORTS.length === 9 && FORBIDDEN_RANGES.length === 2 && portRuns.length === 16 && portRuns.every((x) => x.code === 4 && x.rej && !x.passed) && localRuns.length === 7 && localRuns.every((x) => x.code === 4 && x.rej && !x.passed) && edgeOfRange.every((x) => x.code === 0 && x.passed)
        && portOk.code === 0 && /KAPI GEÇİLDİ/.test(portOk.log) && srv.address().port === PORT && lsrv.address().port === LOCAL_PORT && lsrv.address().address === '127.0.0.1' && ![PORT, LOCAL_PORT].some((p) => BAD_PORTS.includes(p) || (p >= 47200 && p <= 47299) || (p >= 47998 && p <= 47999)),
        obs: portRuns.map((x) => `${x.p}→${x.code}`).join(' · ') + ' · yerel: ' + localRuns.map((x) => `${x.p}→${x.code}`).join(' · ') + ' · aralık dışı: ' + edgeOfRange.map((x) => `${x.p}→${x.code}`).join(' · ') + ` · ${PORT}+${LOCAL_PORT}→${portOk.code} (geçti) · dinlenen=${srv.address().port}, yerel ${lsrv.address().address}:${lsrv.address().port}` }));

    // ── Sağlıklı kenar ──
    const S1 = await scenario('ok', { tag: 's1' });
    item('S1', 'sağlıklı kenar (Server: Caddy, boş 403): çıkış 3 — 0 DEĞİL; bütün ret vektörleri 403 + kimlik başlığı yok; pozitifler beklendiği gibi; ÜÇ AYRI ALAN + pozitif kontrol: HTTP / ret PASS · kenar engelleme OLCULEMEYEN — PASS DEĞİL; TEK neden ULASMAMA-BAGIMSIZ-KANITI-YOK (gözlem temiz ama isteğin API\'ye ulaşmadığını gösteren bağımsız kanıt yok; zemin gerçeği: bütün ret yanıtlarını kenar üretti — sonda bunu ÖLÇEMEZ) · katman doğrulaması OLCULEMEYEN (59 ret satırının hiçbirinde "API değil" denmez; kapsam: API kanıtlı 0 + ölçülemeyen = ret satırı; "API değil gösterilen" sayısı YOK) · pozitif kontrol PASS; alan kümesi tam dört; birleşik PASS alanı ya da satırı yok; kenar engelleme kaydının eki: kapsam (istek profili · konum · vektör kümesi) + KANIT SINIRI ("PASS üretmez", başlık yokluğu kanıt değil, kalibrasyon ret yolunu kanıtlamaz, kesin kabul sonda dışı kanıt + owner değerlendirmesi) — ham kanıtta, adsız özette ve çıktıda aynı; ipucu caddy yalnız ipucu alanında; kanıtta yanıt başlığı DEĞERİ yok', () => {
      const d = rowsOf(S1, 'deny'); const a = rowsOf(S1, 'allow'); const v = V(S1); const cov = v.layerVerification.coverage; const sc = v.edgeBlocking.scope;
      const ok = is(S1, 3, 'P/O/O/P') && d.length === VEC.deny.length && a.length === VEC.allow.length && d.length > 0 && a.length > 0 && S1.gt.filter((s, i) => S1.ev.rows[i].group === 'deny').every((s) => s.producer === 'edge')
        && d.every((x) => x.status === 403 && x.statusExpected === true && x.outcome === 'RET-403' && x.idObs === 'YOK' && x.idSignal === 'YOK' && x.layerId === 'OLCULEMEYEN' && x.layerHint === 'caddy' && x.hints && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'Caddy' && x.hints.providerSignature === false)
        && a.every((x) => x.statusExpected === true) && Object.keys(v).sort().join() === FIELDS.slice().sort().join() && FIELDS.every((f) => FIELD_VALUES.includes(v[f].value))
        && v.httpReject.reasons.length === 0 && v.positiveControl.reasons.length === 0
        && v.edgeBlocking.reasons.length === 1 && v.edgeBlocking.reasons[0].reason === NOEV && v.edgeBlocking.reasons[0].value === 'OLCULEMEYEN' && v.edgeBlocking.reasons[0].count === 1
        && v.layerVerification.reasons.length === 1 && v.layerVerification.reasons[0].reason === 'KATMANI-DOGRULANAMAYAN-RET-SATIRI' && v.layerVerification.reasons[0].value === 'OLCULEMEYEN' && v.layerVerification.reasons[0].count === cov.unverifiable
        && Object.keys(cov).sort().join() === 'denyRows,provenApi,unverifiable,unverifiableByReason' && cov.denyRows === d.length && cov.provenApi === 0 && cov.unverifiable === d.length
        && /istek profili/.test(sc) && /konum/.test(sc) && /vektör kümesi/.test(sc) && /KANIT SINIRI/.test(sc) && /PASS ÜRETMEZ/.test(sc) && /bulunmaması bunu kanıtlamaz/.test(sc) && /kalibrasyonu ret yollarında başlığın korunacağını kanıtlamaz/.test(sc) && /sonda dışı bağımsız kanıt ve owner değerlendirmesi/.test(sc) && sc.includes(NOEV) && !/VARSAYIM/.test(sc)
        && S1.sum.nameVerdict.edgeBlocking.scope === sc && S1.log.includes(sc)
        && /^D8-HTTP-RET=PASS$/m.test(S1.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(S1.log) && /^D8-KATMAN-DOGRULAMA=OLCULEMEYEN$/m.test(S1.log) && /^D8-POZITIF-KONTROL=PASS$/m.test(S1.log) && /^D8-KAPSAM-YETKISI=KAPI-YOK-BIRINCIL-AD$/m.test(S1.log) && /^D8-DOSYA-BUTUNLUGU=UYGULANMADI$/m.test(S1.log) && /^D8-ICERIK-INCELEMESI=UYGULANMADI$/m.test(S1.log) && /^D8-CIKIS=3$/m.test(S1.log)
        && !/^KENAR ENGELLEME\s*:\s*PASS/m.test(S1.log) && !/API değil/.test(S1.log) && !/API-DEGIL/.test(S1.evBytes.toString('utf8'))
        && !/D-?8\s+PASS/i.test(S1.log) && !['pass', 'ok', 'verdict', 'layer', 'result', 'value'].some((k) => k in S1.ev) && !('value' in v) && S1.ev.rows.every((x) => !('ok' in x) && !('layer' in x) && !('echo' in x))
        && (S1.ev.hintsOnly.denyLayerHints || {}).caddy === d.length && !/"cf-ray"|test"/.test(JSON.stringify(S1.ev.rows.map((x) => x.hints)));
      return { ok, obs: brief(S1) + ` · ret 403=${d.filter((x) => x.status === 403).length}/${d.length} · katman kapsamı=${JSON.stringify(cov)} · ipucu=${JSON.stringify(S1.ev.hintsOnly.denyLayerHints)}` };
    });
    item('K-1', 'kalibrasyon (sağlıklı kenar) — API pozitiflerinde İKİ davranış da görülür: GECERLI-BICIM gönderilen 3 API pozitifinde kimlik AYNEN döndü (aynen geri yazma 3/3), GECERSIZ-BICIM gönderilen 3 API pozitifinde API değeri atıp YENİ kimlik üretti (değiştirme 3/3; zemin gerçeği: sahte API\'nin yazdığı değer); 3 web pozitifinde ve başlıksız bölgenin tamamında başlık yok → kalibrasyon VAR, API kanıtı kullanılabilir; "değiştirme" görülen API pozitifi UYGULAMA-API, "aynen geri yazma" görülen API pozitifi OLCULEMEYEN (yansıtan katman da aynısını üretir — tek başına API kanıtı değil)', () => {
      const c = S1.ev.calibration; const j = J(S1).filter((p) => p.row.group === 'allow'); const api = j.filter((p) => p.gt.producer === 'api'); const web = j.filter((p) => p.gt.producer === 'web');
      const g = api.filter((p) => p.gt.ridOk); const x = api.filter((p) => !p.gt.ridOk); const zone = S1.ev.rows.filter((r) => r.pathClass === 'ONEK-DISI' || r.method === 'OPTIONS').length;
      const ok = c.result === 'VAR' && c.apiEvidenceUsable === true && api.length === 6 && web.length === 3 && g.length === 3 && x.length === 3 && c.apiPositives === 6 && c.apiWriteBackOf === 3 && c.apiWriteBack === 3 && c.apiReplaceOf === 3 && c.apiReplace === 3
        && c.webPositives === 3 && c.webMeasured === 3 && c.zoneRows === zone && zone === 18 && c.zoneMeasured === zone && c.zoneHeaderRows === 0 && c.reflectionRows === 0 && c.foreignIdRows === 0
        && g.every((p) => p.gt.apiWrote === 'AYNEN' && p.gt.echoed === 'same' && p.row.idObs === 'AYNEN' && p.row.idSignal === 'AYNEN-GERI-YAZMA' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'AYIRT-ETMEYEN-GOZLEM')
        && x.every((p) => p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other' && p.gt.respUuid === true && p.row.idObs === 'YENI-KIMLIK' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API' && p.row.layerWhy === 'DEGISTIRME-KANITI')
        && web.every((p) => p.gt.echoed === 'none' && p.row.idObs === 'YOK' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'WEB-YOLU')
        && S1.sum.idSignalCounts.allow['AYNEN-GERI-YAZMA'] === 3 && S1.sum.idSignalCounts.allow.DEGISTIRME === 3 && S1.sum.idSignalCounts.deny.YOK === rowsOf(S1, 'deny').length;
      return { ok, obs: `aynen geri yazma ${c.apiWriteBack}/${c.apiWriteBackOf} · değiştirme ${c.apiReplace}/${c.apiReplaceOf} · web ölçülen ${c.webMeasured}/${c.webPositives} · başlıksız bölge ${c.zoneMeasured}/${c.zoneRows}, başlıklı ${c.zoneHeaderRows} · yansıma ${c.reflectionRows} · yabancı kimlik ${c.foreignIdRows} → ${c.result} (API kanıtı kullanılabilir=${c.apiEvidenceUsable})` };
    });
    item('L-1', '"API DEĞİL" ÇIKARIMI YOK — başlık yokluğu satır düzeyinde de kanıt DEĞİLDİR (sağlıklı kenar, hepsi başlıksız 403, kalibrasyon VAR): düz /api yolu (GET/POST/HEAD, sorgulu, sondaki eğik çizgili — API işleseydi ara katman kesin çalışırdı) → OLCULEMEYEN (BASLIK-YOKLUGU-KANIT-DEGIL), "API değil" DEĞİL; ön uçuş (OPTIONS /api) → OLCULEMEYEN (ON-UCUS: ara katmandan önce biter); çift eğik çizgi, çözülemeyen yüzde dizisi, nokta segmenti, noktalı virgül, büyük harfli önek, yüzde kodlu segment, traversal → OLCULEMEYEN (YOL-BELIRSIZ); web yolları ve OPTIONS / → OLCULEMEYEN (WEB-YOLU); hiçbir satırın katman kimliği "API değil" anlamı taşımaz (küme: UYGULAMA-API / OLCULEMEYEN / SONUC-YOK); kapsam: 59 ret satırının 59\'u ölçülemez (30 başlık yokluğu kanıt değil · 13 web yolu · 2 ön uçuş · 14 yolu belirsiz), API kanıtlı 0', () => {
      const d = rowsOf(S1, 'deny'); const inf = d.filter((x) => x.layerWhy === NOHDR); const cov = V(S1).layerVerification.coverage;
      const sound = inf.every((x) => x.pathClass === 'API-KESIN' && x.layerId === 'OLCULEMEYEN' && x.idObs === 'YOK' && apiMw(x.method, x.path) === 'CALISIR' && apiMw(x.method, cleanPath(x.path)) === 'CALISIR') && S1.ev.rows.every((x) => LAYER_ID_SET.includes(x.layerId)) && !Object.keys(S1.ev.layerCounts.deny).some((k) => !LAYER_ID_SET.includes(k));
      const A = 'OLCULEMEYEN/' + NOHDR; const O = 'OLCULEMEYEN/';
      const ex = [['GET', '/api/auth/me', A], ['POST', '/api/auth/login', A], ['HEAD', '/api/auth/me', A], ['GET', '/api/portal/admin/documents/pending?x=1', A], ['GET', '/api/portal/cases/', A],
        ['OPTIONS', '/api/auth/me', O + 'ON-UCUS'], ['GET', '//api/portal/admin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/admin%c0%afdocuments/pending', O + 'YOL-BELIRSIZ'],
        ['GET', '/api/portal/./admin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/cases;x=1', O + 'YOL-BELIRSIZ'], ['GET', '/API/portal/cases', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/%61dmin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/cases/../admin/documents/pending', O + 'YOL-BELIRSIZ'],
        ['OPTIONS', '/', O + 'WEB-YOLU'], ['GET', '/', O + 'WEB-YOLU'], ['GET', '/robots.txt', O + 'WEB-YOLU'], ['GET', '/_next/../auth/login', O + 'WEB-YOLU']];
      const got = ex.map(([m, p, l]) => { const x = d.find((y) => y.method === m && y.path === p); return { m, p, l, g: x ? x.layerId + '/' + x.layerWhy : 'SATIR-YOK' }; });
      const model = apiMw('OPTIONS', '/api/auth/me') === 'CORS' && apiMw('GET', '//api/portal/admin/documents/pending') === 'ESLESMEZ' && apiMw('GET', '/api/portal/admin%c0%afdocuments/pending') === 'COZME-HATASI' && apiMw('GET', '/api/auth/me') === 'CALISIR';
      const by = cov.unverifiableByReason || {};
      return { ok: inf.length === 30 && sound && model && got.every((x) => x.g === x.l) && d.length === 59 && !('shownNotApi' in cov) && cov.provenApi === 0 && cov.unverifiable === 59 && by[NOHDR] === 30 && by['WEB-YOLU'] === 13 && by['ON-UCUS'] === 2 && by['YOL-BELIRSIZ'] === 14 && Object.keys(by).length === 4,
        obs: `başlıksız düz /api satırı=${inf.length} → hepsi OLCULEMEYEN/${NOHDR} (model uyumlu=${sound}) · "API değil" sayılan satır=${S1.ev.rows.filter((x) => !LAYER_ID_SET.includes(x.layerId)).length} · ölçülemeyen=${JSON.stringify(by)} · örnek=${got.filter((x) => x.g === x.l).length}/${got.length}${got.filter((x) => x.g !== x.l).map((x) => ` [${x.m} ${x.p}: ${x.g}≠${x.l}]`).join('')}` };
    });
    item('S1-p', `HAM YOL korunur: kaynak vektör == kanıt satırı == kenarın gördüğü req.url (yöntem dahil, aynı sıra); './', '%2F', '?x=1', büyük harf, %00, çift kodlama, çift slash, unicode slash birebir`, () => {
      const rowPaths = S1.ev.rows.map((x) => ({ method: x.method, url: x.path })); const same = (a, b) => a.length === b.length && a.every((x, i) => x.method === b[i].method && x.url === b[i].url);
      const raw = ['/api/portal/./admin/documents/pending', '/api/portal%2Fadmin/documents/pending', '/api/portal/admin/documents/pending?x=1', '/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/documents/%252e%252e/admin', '//api/portal/admin/documents/pending', '/api/portal/admin%c0%afdocuments/pending'];
      return { ok: VEC.all.length === S1.ev.deny + S1.ev.allow && VEC.all.length > 0 && same(VEC.all, rowPaths) && same(rowPaths, S1.gt) && raw.every((p) => S1.gt.some((s) => s.url === p)), obs: `kenar gördü=${S1.gt.length} · kaynak=${VEC.all.length} · kanıt satırı=${rowPaths.length} · ham örnek=${raw.filter((p) => S1.gt.some((s) => s.url === p)).length}/${raw.length}` };
    });
    item('S1-c', 'KİMLİK/GÖVDE ölçümü: kenar hiçbir istekte kimlik başlığı görmedi; gövde 0 (GET/DELETE/HEAD/OPTIONS) veya 2 (POST/PUT/PATCH "{}"); kanıt measured {credentialHeaderRequests=0, nonEmptyBodyRequests=0, requestCount=deny+allow, bodies.emptyJson=POST+PUT+PATCH sayısı, bodies.empty=GET+DELETE+HEAD+OPTIONS sayısı}; design beyanı AYRI alanda; her satırda sent.headerNames/body; gönderilen başlık adları arasında yalnız istek kimliği var (kimlik bilgisi başlığı yok)', () => {
      const g = S1.gt; const credSeen = g.filter((s) => s.cred).length; const badBody = g.filter((s) => !((s.bodyLen === 0 && /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)) || (s.bodyLen === 2 && /^(POST|PUT|PATCH)$/.test(s.method)))).length;
      const M = S1.ev.measured; const nWrite = g.filter((s) => /^(POST|PUT|PATCH)$/.test(s.method)).length; const nNoBody = g.filter((s) => /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)).length; const e = S1.ev;
      const names = ['host', 'user-agent', 'content-type', 'accept', F.header].sort().join();
      const ok = credSeen === 0 && badBody === 0 && g.length === e.deny + e.allow && M.credentialHeaderRequests === 0 && M.nonEmptyBodyRequests === 0 && M.requestCount === e.deny + e.allow && !M.bodies.other && M.bodies.emptyJson === nWrite && M.bodies.empty === nNoBody && (M.bodies.empty + M.bodies.emptyJson) === M.requestCount
        && e.design && e.design.credentialsSent === false && e.design.writesAttempted === false && e.credentialsSent === undefined && e.rows.every((x) => x.sent && Array.isArray(x.sent.headerNames) && x.sent.headerNames.slice().sort().join() === names && (x.sent.body === '' || x.sent.body === '{}'))
        && e.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.credentialHeaderRequests === 0 && S1.sum.requestProfile.nonEmptyBodyRequests === 0;
      return { ok, obs: `kenar: kimlik=${credSeen} · gövde-uyumsuz=${badBody} · POST/PUT/PATCH=${nWrite} · GET/DELETE/HEAD/OPTIONS=${nNoBody} · sonda measured=${JSON.stringify(M)} · başlık adları=${e.requestProfile.headerNames.join(',')}` };
    });
    const S1b = await scenario('ok', { tag: 's1b', alias: 'AD-27' });
    item('Y-1', 'istek kimliği PLANI — hangi istekte hangi biçim (kenarın gördüğü değerler ÜRÜN KAYNAĞINDAKİ desenle ölçülür): 68 isteğin hepsinde başlık var; 59 ret vektörünün HEPSİNDE gönderilen kimlik kaynak deseniyle KABUL EDİLMEZ (GECERSIZ-BICIM); 6 API pozitifi sırayla kabul edilir / edilmez / … (3 + 3); 3 web pozitifi sırayla kabul edilir / edilmez / edilir (2 + 1); kanıttaki sent.requestIdForm kenarın gördüğü değerin kaynak deseniyle sınıfına eşit; hiçbir gönderilen değer API\'nin ürettiği biçimde değil; koşum içinde ve iki koşum arasında tekrar yok (tek kullanımlık); gönderilen değerler adsız özete girmez', () => {
      const g = S1.gt; const ids = g.map((s) => s.rid); const ids2 = S1b.gt.map((s) => s.rid); const j = J(S1);
      const deny = j.filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.row.vectorClass === 'POZITIF-API'); const web = j.filter((p) => p.row.vectorClass === 'POZITIF-WEB');
      const alt = (list) => list.every((p, i) => p.gt.ridOk === (i % 2 === 0)); const rf = S1.sum.requestProfile.requestIdForms || {};
      const ok = g.length === VEC.all.length && g.every((s) => s.hasRid) && deny.length === 59 && deny.every((p) => p.gt.ridOk === false) && api.length === 6 && alt(api) && web.length === 3 && alt(web)
        && j.every((p) => p.row.sent.requestId === p.gt.rid && p.row.sent.requestIdForm === (p.gt.ridOk ? 'GECERLI-BICIM' : 'GECERSIZ-BICIM')) && ids.every((id) => !UUID4.test(id))
        && new Set(ids).size === ids.length && ids2.length === ids.length && ids.every((id) => !ids2.includes(id)) && S1.sum.requestProfile.distinctRequestIds === new Set(ids).size && S1.sum.requestProfile.requestCount === g.length
        && JSON.stringify(rf.deny) === JSON.stringify({ 'GECERLI-BICIM': 0, 'GECERSIZ-BICIM': 59 }) && JSON.stringify(rf.allowApi) === JSON.stringify({ 'GECERLI-BICIM': 3, 'GECERSIZ-BICIM': 3 }) && JSON.stringify(rf.allowWeb) === JSON.stringify({ 'GECERLI-BICIM': 2, 'GECERSIZ-BICIM': 1 })
        && !ids.some((id) => S1.sumBytes.toString('utf8').includes(id));
      return { ok, obs: `başlıklı=${g.filter((s) => s.hasRid).length}/${g.length} · ret: kaynak deseni kabul ETMEZ=${deny.filter((p) => !p.gt.ridOk).length}/${deny.length} · API pozitifi kabul eder=${api.filter((p) => p.gt.ridOk).length}/${api.length} · web pozitifi kabul eder=${web.filter((p) => p.gt.ridOk).length}/${web.length} · tekil=${new Set(ids).size} · ikinci koşumla ortak=${ids.filter((id) => ids2.includes(id)).length}` };
    });
    // Y-2 — plan kapısı: GECERSIZ-BICIM üretimi bozulmuş sonda KOPYASI (yalnız üretim ifadesi değişti; `~` düştü → iki biçim de kabul desenine uyar).
    const y2probe = path.join(dir, 'd8-staff-surface-probe.plan.js'); const y2src = src.replace("'d8r~' + hex", () => "'d8r' + hex"); fs.writeFileSync(y2probe, y2src);
    mode = 'ok'; seen = []; const y2 = await run(['--alias', 'AD-1', '--vantage', 'oz-test-yerel', '--origin', ORIGIN, '--out', path.join(dir, 'y2.json')], env, y2probe); const y2seen = seen.length; seen = [];
    item('Y-2', 'istek kimliği PLAN KAPISI: "geçersiz biçim" üretimi bozulmuş bir sonda kopyasında (iki biçim de kaynak desenince kabul edilir → API iki değeri de aynen geri yazar; yansıtan katmanla API ayırt edilemez, kanıt kuralı anlamsızlaşır) sonda istek ATMADAN durur → çıkış 4, kenara istek yok, kanıt / özet yazılmaz; asıl sondada kapı geçilir (S1)', () => ({
      ok: y2src !== src && y2.code === 4 && y2seen === 0 && /REDDEDİLDİ: istek kimliği planı tutarsız/.test(y2.log) && !fs.existsSync(path.join(dir, 'y2.json')) && !fs.existsSync(path.join(dir, 'y2.ozet.json')) && S1.code === 3 && S1.gt.length === VEC.all.length, obs: `kopya değişti=${y2src !== src} · çıkış=${y2.code} · istek=${y2seen} · S1 çıkış=${S1.code}, istek=${S1.gt.length}` }));
    item('S7', 'D8-E1/E2 kapsamı: deny kümesinde 3 HEAD + 3 OPTIONS (üç yüzey: sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon varyantı; hepsi sağlıklı kenarda 403; HEAD/OPTIONS gövdesiz; adsız özette yöntem kapsamı sayıları (beş yöntem · HEAD n/3 · OPTIONS n/3 · varyant n/18) satırlarla uyumlu', () => {
      const d = rowsOf(S1, 'deny'); const headRows = d.filter((x) => x.method === 'HEAD'); const optRows = d.filter((x) => x.method === 'OPTIONS');
      const evRows = evasionPaths.map((p) => d.find((x) => x.path === p)); const evAll403 = evRows.every((x) => x && x.status === 403 && x.statusExpected === true && x.vectorClass === 'VARYANT');
      const hoAll403 = headRows.concat(optRows).every((x) => x.status === 403 && x.statusExpected === true); const hoNoBody = S1.gt.filter((s) => /^(HEAD|OPTIONS)$/.test(s.method)).every((s) => s.bodyLen === 0);
      const hoSurfaces = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headRows.some((x) => x.path === p) && optRows.some((x) => x.path === p));
      const c = S1.sum.coverage; const five = d.length - 3 - 3 - 18;
      const covOk = c.HEAD.of === 3 && c.HEAD.measured === 3 && c.HEAD.rejected403 === 3 && c.OPTIONS.of === 3 && c.OPTIONS.measured === 3 && c.OPTIONS.rejected403 === 3 && c.VARYANT.of === 18 && c.VARYANT.measured === 18 && c.VARYANT.rejected403 === 18 && c['BES-YONTEM'].of === five && c['BES-YONTEM'].rejected403 === five && five > 0 && JSON.stringify(c) === JSON.stringify(S1.ev.coverage);
      return { ok: headRows.length === 3 && optRows.length === 3 && hoSurfaces && hoAll403 && hoNoBody && evRows.filter(Boolean).length === 18 && evAll403 && covOk, obs: `HEAD=${headRows.length} · OPTIONS=${optRows.length} · varyant=${evRows.filter(Boolean).length}/18 · hepsi 403=${hoAll403 && evAll403} · HEAD/OPTIONS gövdesiz=${hoNoBody} · özet kapsamı=${JSON.stringify(c)}` };
    });

    // ── Bozuk kenar (ikinci ad: AD-2 — tam kapsam yetkisi kaydıyla) ──
    const s1Before = { ev: S1.evBytes ? sha(S1.evBytes) : null, sum: S1.sumBytes ? sha(S1.sumBytes) : null };
    const S2 = await scenario('broken', { tag: 's2', alias: 'AD-2' });
    item('S2', 'bozuk kenar TEMİZLENMİŞ yola göre sızdırır, HAM yolu API\'ye iletir (AD-2): çıkış 2; HTTP / ret FAIL (20 ret vektörü 403 dışı yanıt aldı) · kenar engelleme FAIL · katman doğrulaması FAIL · pozitif kontrol PASS; sızan istek = /api/auth/me (GET+HEAD+OPTIONS=3) + admin\'e normalize olan 17 = 20; API\'nin işlediği 17 yanıtta gönderilen GECERSIZ-BICIM kimlik atılıp YENİSİ üretilmiş → DEGISTIRME → UYGULAMA-API; OPTIONS 204 reddedilmedi = kenar engelleme FAIL nedeni; çift eğik çizgili istek API\'de önek dışına düşer → başlıksız 404 → API kanıtı YOK (durum kodu ölçütünde yine FAIL); başka yere normalize olanlar 403 kalır; ifPassed bulgu satırlarında dolu', () => {
      const j = J(S2).filter((p) => p.row.group === 'deny'); const leaked = j.filter((p) => p.gt.producer === 'api');
      const expectLeak = VEC.deny.filter((v) => { const np = cleanPath(v.url); return np === '/api/auth/me' || ADMIN_RX.test(np); }).length;
      const me = leaked.filter((p) => cleanPath(p.row.path) === '/api/auth/me').length; const two = (p) => p.gt.status >= 200 && p.gt.status < 300;
      const n2xx = leaked.filter(two).length; const nProven = leaked.filter((p) => !two(p) && p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other').length; const nNoHeader = leaked.filter((p) => !two(p) && p.gt.echoed === 'none').length;
      const leakedAdminForms = ['/api/portal/%61dmin/documents/pending', '/api/portal/%61dmin/create-user', '/api/portal/admin%2Fdocuments%2Fpending', '//api/portal/admin/documents/pending', '/api/portal/cases/../admin/documents/pending', '/api/portal/documents/..%2Fadmin/documents/pending', '/api/portal/documents/%252e%252e/admin', '/api/portal/./admin/documents/pending'];
      const still403Forms = ['/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/admin%c0%afdocuments/pending', '/API/portal/cases', '/api/portal/cases/', '/api/portal/cases;x=1', '/_next/../auth/login', '/_next/%2e%2e/auth/login', '/intake/abc/../../auth/login'];
      const leakedOk = leakedAdminForms.every((p) => leaked.some((q) => q.row.path === p && q.row.status !== 403)); const still403Ok = still403Forms.every((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403 && x.gt.producer === 'edge'; });
      const dbl = leaked.find((p) => p.row.path === '//api/portal/admin/documents/pending');
      const ok = is(S2, 2, 'F/F/F/P') && leaked.length === 20 && expectLeak === 20 && me === 3 && leakedOk && still403Ok
        && leaked.every((p) => p.row.status === p.gt.status && p.row.status !== 403 && p.row.statusExpected === false && typeof p.row.ifPassed === 'string' && p.row.ifPassed.length > 10)
        && leaked.filter((p) => p.gt.echoed === 'other').every((p) => p.gt.ridOk === false && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && leaked.filter((p) => p.gt.echoed === 'none').every((p) => p.row.idObs === 'YOK' && p.row.layerId === 'OLCULEMEYEN')
        && n2xx === 2 && nNoHeader === 1 && nProven === 17 && rc(S2, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 20 && rc(S2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === nProven && rc(S2, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === n2xx
        && rc(S2, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === nProven && V(S2).layerVerification.coverage.provenApi === nProven
        && dbl && dbl.gt.apiMw === 'ESLESMEZ' && dbl.row.status === 404 && S2.ev.findings.length === 20 && S2.ev.nameAlias === 'AD-2' && S2.sum.nameAlias === 'AD-2' && S2.ev.scopeAuthorization.status === 'KAYIT-KABUL-EDILDI';
      return { ok, obs: brief(S2) + ` · sızan=${leaked.length} (beklenen ${expectLeak}) · me=${me} · 2xx=${n2xx} · API kanıtlı=${nProven} · başlıksız 403 dışı=${nNoHeader} · admin'e sızan varyant=${leakedAdminForms.filter((p) => leaked.some((q) => q.row.path === p)).length}/${leakedAdminForms.length} · 403 kalan=${still403Forms.filter((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403; }).length}/${still403Forms.length}` };
    });
    item('N-5', 'BİR SÜREÇ = BİR AD = BİR KANIT: AD-2 koşumu (bozuk kenar) AD-1\'in ham kanıtını ve özetini DEĞİŞTİRMEDİ (bayt özeti aynı); iki adın alanları ayrı dosyalarda ayrı (AD-1 kenar engelleme OLCULEMEYEN · AD-2 FAIL); sonda kaynağında dosya okuma yalnız dört yerde: kendi kaynağı (SHA-256) · yalnız kapsam yetkisi işlevinde kayıt ile kaydın gösterdiği kanıt dosyası · (R07) yalnız kesinleştirme adımında, --finalize ile verilen TEK kanıt dosyası (ölçüm çağrısında okunmaz; ad / sonda baytları tutmayan kanıt reddedilir — MR-9); dizin tarama / başka dosya okuma yok', () => {
      const after = { ev: sha(fs.readFileSync(S1.out)), sum: sha(fs.readFileSync(S1.sumPath)) }; const scopeFn = fnSrc('verifyScopeAuthorization');
      const finBlock = src.slice(src.indexOf('  if (FINALIZING) {'), src.indexOf('  const t0 = new Date().toISOString(); const rows = [];'));
      const reads = (src.match(/readFileSync\(/g) || []).length; const staticOk = reads === 4 && /readFileSync\(__filename\)/.test(src) && scopeFn.split('readFileSync(').length - 1 === 2 && /readFileSync\(SCOPE_RECORD, 'utf8'\)/.test(scopeFn)
        && finBlock.length > 200 && finBlock.split('readFileSync(').length - 1 === 1 && /readFileSync\(FINALIZE\)/.test(finBlock) && !/req\(|https\.request|http\.request/.test(finBlock)
        && (src.match(/statSync\(/g) || []).length === 1 && scopeFn.split('statSync(').length - 1 === 1 && !/readdir|readFile\(|createReadStream|opendir|existsSync\((?!OUT\)|SUMMARY_OUT\))/.test(src);
      const ok = s1Before.ev !== null && s1Before.sum !== null && after.ev === s1Before.ev && after.sum === s1Before.sum && S1.ev.nameAlias === 'AD-1' && S1.sum.nameAlias === 'AD-1' && V(S1).edgeBlocking.value === 'OLCULEMEYEN' && S2.ev.nameAlias === 'AD-2' && V(S2).edgeBlocking.value === 'FAIL' && S1.out !== S2.out && staticOk;
      return { ok, obs: `AD-1 dosyaları değişmedi=${after.ev === s1Before.ev && after.sum === s1Before.sum} · AD-1 kenar=${V(S1).edgeBlocking.value} · AD-2 kenar=${V(S2).edgeBlocking.value} · readFileSync sayısı=${reads} · statik=${staticOk}` };
    });

    // ── İpucu senaryoları: ipuçları değişir, katman kimliği ve alanlar DEĞİŞMEZ ──
    const sameAsS1 = (S) => is(S, 3, 'P/O/O/P') && layerVec(S1).length > 0 && layerVec(S) === layerVec(S1) && JSON.stringify(S.ev.layerCounts) === JSON.stringify(S1.ev.layerCounts) && JSON.stringify(V(S).layerVerification.coverage) === JSON.stringify(V(S1).layerVerification.coverage) && FIELDS.every((f) => reasonNames(S, f) === reasonNames(S1, f)) && reasonNames(S, 'edgeBlocking') === NOEV + '×1';
    const S3 = await scenario('waf', { tag: 's3' });
    item('S3', 'sağlayıcı ENGELLEME taklidi (imzalı gövde + Server: cloudflare + cf-ray; azaltım işareti YOK), kimlik başlığı yok: ipucu edge-provider (gövdeli retlerde; HEAD gövdesiz → none) YALNIZ ipucu alanında; durum sınıfı RET-403; katman kimliği satır satır S1 ile AYNI, dört alan S1 ile AYNI (imza / başlık hiçbir alana girmez; sağlayıcı adlandırılmaz); adsız özette sağlayıcı adı yok', () => {
      const d = rowsOf(S3, 'deny'); const head = d.filter((x) => x.method === 'HEAD'); const body = d.filter((x) => x.method !== 'HEAD'); const h = S3.ev.hintsOnly.denyLayerHints || {};
      const ok = sameAsS1(S3) && h['edge-provider'] === body.length && h.none === head.length && body.length > 0 && head.length > 0 && d.every((x) => x.outcome === 'RET-403') && S3.gt.every((s) => s.challenge === false)
        && body.every((x) => x.layerHint === 'edge-provider' && x.hints.providerSignature && x.hints.edgeHeaderPresent && x.hints.cfMitigatedPresent === false && x.hints.serverHeaderValue === 'cloudflare' && x.hints.bodyEmpty === false)
        && head.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true)
        && !/cloudflare|caddy|edge-provider/i.test(S3.sumBytes.toString('utf8')) && !Object.keys(S3.ev.layerCounts.deny).some((k) => /caddy|provider|cloudflare|kenar|tunel/i.test(k));
      return { ok, obs: brief(S3) + ` · ipucu=${JSON.stringify(h)} · katman kimliği S1 ile aynı=${layerVec(S3) === layerVec(S1)}` };
    });
    const S3b = await scenario('bare', { tag: 's3b' });
    item('S3-b', 'boş 403 gövdesi, Server başlığı YOK: ipucu YOK (boş gövde tek başına ipucu da üretmez); katman kimliği ve dört alan S1 ile AYNI', () => {
      const d = rowsOf(S3b, 'deny'); const h = S3b.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3b) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === '' && x.hints.providerSignature === false), obs: brief(S3b) + ` · ipucu=${JSON.stringify(h)}` };
    });
    const S3c = await scenario('behind', { tag: 's3c' });
    item('S3-c', 'boş 403 gövdesi, Server: cloudflare, imza YOK: ipucu YOK; serverHeaderValue=cloudflare yalnız ipucu alanında; katman kimliği ve dört alan S1 ile AYNI', () => {
      const d = rowsOf(S3c, 'deny'); const h = S3c.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3c) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true && x.hints.cfMitigatedPresent === false), obs: brief(S3c) + ` · ipucu=${JSON.stringify(h)}` };
    });
    const S3dN = await scenario('body403', { tag: 's3dn' });
    item('S3-dN', 'gövdesi DOLU JSON ama kimlik BAŞLIKSIZ 403 (uygulama hata gövdesine benzeyen yanıtı KENAR üretir): çıkış 3; dört alan, nedenler ve katman kimliği S1 ile AYNI (dolu gövde hiçbir alana girmez; düz /api yolunda satır OLCULEMEYEN / başlık yokluğu kanıt değil); dolu gövde sayısı yalnız ipucu alanında (HEAD gövdesiz → sayılmaz; S1\'de 0)', () => {
      const d = rowsOf(S3dN, 'deny'); const body = d.filter((x) => x.method !== 'HEAD'); const head = d.filter((x) => x.method === 'HEAD'); const j = J(S3dN).filter((p) => p.row.group === 'deny');
      const ok = sameAsS1(S3dN) && j.every((p) => p.gt.producer === 'edge' && p.gt.echoed === 'none') && S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature === body.length && body.length > 0 && body.every((x) => x.hints.bodyEmpty === false && x.hints.providerSignature === false) && head.every((x) => x.hints.bodyEmpty === true)
        && S1.ev.hintsOnly.fullBody403WithoutProviderSignature === 0 && d.find((x) => x.method === 'GET' && x.path === '/api/auth/me').layerId === 'OLCULEMEYEN' && d.find((x) => x.method === 'GET' && x.path === '/api/auth/me').layerWhy === NOHDR;
      return { ok, obs: brief(S3dN) + ` · dolu gövdeli 403 (ipucu)=${S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature}/${body.length} · S1=${S1.ev.hintsOnly.fullBody403WithoutProviderSignature}` };
    });

    // ── Azaltım işareti: durum kodu eşleşir (HTTP / ret PASS) ama hedeflenen kuralın uygulandığını kanıtlamaz (kenar engelleme OLCULEMEYEN) ──
    const S3ch = await scenario('challenge', { tag: 's3ch' }); const S3ch1 = await scenario('challenge1', { tag: 's3ch1' });
    item('S3-ch', 'sınama (challenge) işaretli 403: (a) bütün ret vektörlerinde → durum kodu ölçütü ayrı kaydedilir: HTTP / ret PASS (59/59 durum 403); kenar engelleme OLCULEMEYEN, neden SINAMA-ISARETLI-403×59 — "temiz gözlem" sınıfı (ULASMAMA-BAGIMSIZ-KANITI-YOK) DEĞİL, FAIL de DEĞİL; çıkış 3; durum kodları S3 (engelleme, işaretsiz → neden yalnız ULASMAMA-BAGIMSIZ-KANITI-YOK) ile AYNI ama neden sınıfı AYRI; işaret katmana GİRMEZ (katman kimliği satır satır S1 ile aynı); adsız özette sağlayıcı / başlık adı yok · (b) işaret yalnız birkaç ret vektöründe → yine neden SINAMA-ISARETLI-403, çıkış 3; yalnız işaretli satırlar ayrı sınıf', () => {
      const d = rowsOf(S3ch, 'deny'); const j1 = J(S3ch1).filter((p) => p.row.group === 'deny'); const m1 = j1.filter((p) => p.gt.challenge); const u1 = j1.filter((p) => !p.gt.challenge); const sumTxt = S3ch.sumBytes.toString('utf8');
      const ok = is(S3ch, 3, 'P/O/O/P') && d.length > 0 && S3ch.gt.filter((s, i) => S3ch.ev.rows[i].group === 'deny').every((s) => s.challenge === true && s.status === 403)
        && d.every((x) => x.status === 403 && x.outcome === 'SINAMA-ISARETLI-403' && x.statusExpected === true && x.mitigationMark === 'SINAMA') && rc(S3ch, 'edgeBlocking', 'SINAMA-ISARETLI-403') === d.length && V(S3ch).edgeBlocking.reasons.length === 1 && V(S3ch).httpReject.reasons.length === 0
        && layerVec(S3ch) === layerVec(S1) && S3ch.sum.outcomeCounts.deny['SINAMA-ISARETLI-403'] === d.length && S3ch.sum.outcomeCounts.deny['RET-403'] === 0 && S3ch.sum.coverage.HEAD.rejected403 === 0 && S3ch.sum.coverage.VARYANT.rejected403 === 0
        && !/cloudflare|cf-mitigated|cf-ray|challenge/i.test(sumTxt) && S3ch.ev.findings.length === 0 && S3.code === 3 && reasonNames(S3, 'edgeBlocking') === NOEV + '×1' && rc(S3ch, 'edgeBlocking', NOEV) === 0 && S3ch.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()
        && is(S3ch1, 3, 'P/O/O/P') && m1.length > 0 && u1.length > 0 && m1.every((p) => p.row.outcome === 'SINAMA-ISARETLI-403') && u1.every((p) => p.row.outcome === 'RET-403') && rc(S3ch1, 'edgeBlocking', 'SINAMA-ISARETLI-403') === m1.length && rc(S3ch1, 'edgeBlocking', NOEV) === 0;
      return { ok, obs: brief(S3ch) + ` · işaretli ret satırı=${d.filter((x) => x.outcome === 'SINAMA-ISARETLI-403').length}/${d.length} · durum kodları S3 ile aynı=${S3ch.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()} (S3 kenar nedeni [${reasonNames(S3, 'edgeBlocking')}]) · katman kimliği S1 ile aynı=${layerVec(S3ch) === layerVec(S1)} · kısmi: çıkış=${S3ch1.code}, işaretli=${m1.length}/${j1.length}` };
    });
    const SMk = await scenario('markmix', { tag: 'smk' }); const SMu = await scenario('mitunk', { tag: 'smu' }); const SMe = await scenario('mitempty1', { tag: 'sme' });
    const markOf = (S, id) => J(S).find((p) => p.gt.markId === id);
    item('S3-chF', 'sınama işaretinin BİÇİMİ (aynı koşumda altı ayrı ret vektöründe altı ayrı yazım; değerler girdi tablosunda değişmez): tam değer · baş harfi büyük · tümü büyük · tek satırda liste, değer sonda · tek satırda liste, değer başta (boşluksuz) · iki AYRI başlık satırı → altısı da durum sınıfı SINAMA-ISARETLI-403 ve işaret sınıfı SINAMA (RET-403 değil); neden sayısı 6', () => {
      const want = MARKS.filter((m) => m[2] === 'SINAMA'); const got = want.map((m) => { const p = markOf(SMk, m[0]); return { id: m[0], out: p ? p.row.outcome : 'SATIR-YOK', mk: p ? p.row.mitigationMark : null, st: p ? p.row.status : null, gt: p ? p.gt.mark : null }; });
      const ok = want.length === 6 && got.every((x) => x.st === 403 && x.gt === 'SINAMA' && x.out === 'SINAMA-ISARETLI-403' && x.mk === 'SINAMA') && rc(SMk, 'edgeBlocking', 'SINAMA-ISARETLI-403') === want.length && is(SMk, 3, 'P/O/O/P') && SMk.gt.every((s) => s.mark !== 'BEYANSIZ');
      return { ok, obs: brief(SMk) + ' · ' + got.map((x) => `${x.id}→${x.out === 'SINAMA-ISARETLI-403' ? 'SINAMA' : x.out}`).join(' · ') };
    });
    item('S3-az', 'TANINMAYAN değerli azaltım işareti (başlık VAR, değer tanınan sınama değeri DEĞİL): (a) aynı koşumda beş ayrı ret vektöründe beş ayrı değer — başka bir değer · alt çizgili · ekli · tireli (üçünün içinde sınama sözcüğü geçer ama ögesi değildir) · BOŞ değer → beşi de durum sınıfı TANINMAYAN-AZALTIM-ISARETLI-403 (RET-403 değil, SINAMA da değil); işaretsiz ret satırları RET-403; işaret katmana girmez; başlığın DEĞERİ ham kanıtta / özette / çıktıda yok · (b) bütün ret vektörlerinde tanınmayan değer: durum kodları S3 (işaretsiz engelleme → neden yalnız ULASMAMA-BAGIMSIZ-KANITI-YOK) ile AYNI, HTTP / ret PASS, kenar engelleme OLCULEMEYEN ama neden sınıfı AYRI (TANINMAYAN-AZALTIM-ISARETLI-403), çıkış 3; yöntem kapsamında "reddedildi" sayılmaz · (c) TEK bir ret vektöründe BOŞ değerli işaret → neden yine işaret sınıfı ("temiz gözlem" sınıfı değil), çıkış 3 (ipucu alanı başlığın VAR olduğunu gösterir)', () => {
      const want = MARKS.filter((m) => m[2] === 'TANINMAYAN'); const got = want.map((m) => { const p = markOf(SMk, m[0]); return { id: m[0], out: p ? p.row.outcome : 'SATIR-YOK', mk: p ? p.row.mitigationMark : null, st: p ? p.row.status : null, exp: p ? p.row.statusExpected : null }; });
      const plain = J(SMk).filter((p) => p.row.group === 'deny' && !p.gt.markId); const txt = SMk.evBytes.toString('utf8') + SMk.sumBytes.toString('utf8') + SMk.log;
      const d = rowsOf(SMu, 'deny'); const e1 = J(SMe).filter((p) => p.gt.mark !== 'YOK'); const U = 'TANINMAYAN-AZALTIM-ISARETLI-403';
      const ok = want.length === 5 && got.every((x) => x.st === 403 && x.exp === true && x.out === U && x.mk === 'TANINMAYAN') && plain.length > 0 && plain.every((p) => p.gt.mark === 'YOK' && p.row.outcome === 'RET-403' && p.row.mitigationMark === 'YOK')
        && rc(SMk, 'edgeBlocking', U) === want.length && layerVec(SMk) === layerVec(S1) && SMk.ev.calibration.result === 'VAR'
        && !/managed_challenge|non-challenge|challenged/i.test(txt) && !/cloudflare|cf-mitigated|cf-ray|challenge/i.test(SMk.sumBytes.toString('utf8'))
        && is(SMu, 3, 'P/O/O/P') && d.length > 0 && d.every((x) => x.status === 403 && x.statusExpected === true && x.outcome === U) && rc(SMu, 'edgeBlocking', U) === d.length && V(SMu).edgeBlocking.reasons.length === 1 && V(SMu).httpReject.reasons.length === 0
        && SMu.sum.outcomeCounts.deny['RET-403'] === 0 && SMu.sum.outcomeCounts.deny['SINAMA-ISARETLI-403'] === 0 && SMu.sum.outcomeCounts.deny[U] === d.length && SMu.sum.coverage.HEAD.rejected403 === 0 && SMu.sum.coverage.VARYANT.rejected403 === 0 && SMu.ev.findings.length === 0
        && S3.code === 3 && reasonNames(S3, 'edgeBlocking') === NOEV + '×1' && rc(SMu, 'edgeBlocking', NOEV) === 0 && SMu.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join() && layerVec(SMu) === layerVec(S1) && SMu.gt.filter((s, i) => SMu.ev.rows[i].group === 'deny').every((s) => s.mark === 'TANINMAYAN')
        && is(SMe, 3, 'P/O/O/P') && e1.length === 1 && e1[0].row.group === 'deny' && e1[0].row.outcome === U && e1[0].row.hints.cfMitigatedPresent === true && rc(SMe, 'edgeBlocking', U) === 1 && V(SMe).edgeBlocking.reasons.length === 1;
      return { ok, obs: `karışık: ${brief(SMk)} · ` + got.map((x) => `${x.id}→${x.out === U ? 'TANINMAYAN' : x.out}`).join(' · ') + ` || hepsi: ${brief(SMu)} · durum kodları S3 ile aynı=${SMu.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()} (S3 kenar nedeni [${reasonNames(S3, 'edgeBlocking')}]) || tek boş değer: çıkış=${SMe.code}, işaretli=${e1.length}` };
    });
    const SMp = await scenario('markpos', { tag: 'smp' }); const SMd = await scenario('markdeny200', { tag: 'smd' });
    item('S3-azP', 'azaltım işareti ret-403 DIŞINDAKİ bir yanıtta — işaret kenar engelleme alanına AYRI bir ölçülemeyen nedeni yazar, bulgu adayını kaldırmaz: (a) POZİTİFLERİN beklenen yanıtında (bir web pozitifi 200 + sınama değeri · bir API pozitifi 401 + tanınmayan değer; ret vektörlerinin hepsi işaretsiz 403, kalibrasyon VAR, durum sayıları S1 ile AYNI) → kenar engelleme OLCULEMEYEN, neden AZALTIM-ISARETI-RET-403-DISINDA×2 ("temiz gözlem" sınıfı değil — S1\'in nedeninden AYRI), çıkış 3; pozitif kontrol PASS kalır (durum kodları beklenen) · (b) reddedilmeyen (200) bir ret vektörünün yanıtında sınama değeri → bulgu adayı KALIR: çıkış 2, HTTP / ret FAIL ve kenar engelleme FAIL; işaret nedeni de kayıtta', () => {
      const jp = J(SMp).filter((p) => p.gt.mark !== 'YOK'); const jd = J(SMd).filter((p) => p.gt.mark !== 'YOK'); const R = 'AZALTIM-ISARETI-RET-403-DISINDA';
      const ok = is(SMp, 3, 'P/O/O/P') && jp.length === 2 && jp.every((p) => p.row.group === 'allow' && p.row.statusExpected === true && p.row.mitigationMark === p.gt.mark) && jp.map((p) => p.gt.mark).sort().join() === 'SINAMA,TANINMAYAN'
        && rc(SMp, 'edgeBlocking', R) === 2 && V(SMp).edgeBlocking.reasons.length === 1 && SMp.ev.calibration.result === 'VAR' && rowsOf(SMp, 'deny').every((x) => x.outcome === 'RET-403')
        && layerVec(SMp) === layerVec(S1) && JSON.stringify(SMp.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts) && S1.code === 3 && reasonNames(S1, 'edgeBlocking') === NOEV + '×1' && rc(SMp, 'edgeBlocking', NOEV) === 0 && SMp.ev.findings.length === 0
        && is(SMd, 2, 'F/F/F/P') && jd.length === 1 && jd[0].row.group === 'deny' && jd[0].row.status === 200 && jd[0].row.outcome === 'REDDEDILMEDI-2XX' && jd[0].row.mitigationMark === 'SINAMA' && rc(SMd, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 1 && rc(SMd, 'edgeBlocking', R) === 1 && SMd.ev.findings.length === 1;
      return { ok, obs: `pozitifte: ${brief(SMp)} · işaretli pozitif=${jp.length} · durum sayıları S1 ile aynı=${JSON.stringify(SMp.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts)} (S1 çıkış ${S1.code}) || işaretli 2xx ret: ${brief(SMd)}` };
    });

    // ── API'YE ÖZGÜ KANIT: gerçek API davranışı (geçersiz biçim → yeni kimlik) ──
    const A1 = await scenario('app403', { tag: 'a1' });
    item('A-1', 'API\'nin ürettiği 403 (kenar geçirmiş, uygulama reddetmiş; S3-dN ile AYNI dolu gövde ve AYNI durum kodları): API gönderilen GECERSIZ-BICIM kimliği atıp YENİSİNİ üretir → o satırlar durum sınıfı RET-403 + DEGISTIRME + UYGULAMA-API; durum kodu ölçütü ayrı: HTTP / ret PASS (59/59 durum 403) — ama kenar engelleme FAIL (API\'nin 403 vermesi bunu kapatmaz: engellenmesi gereken istek API\'ye ulaşmıştır) ve katman doğrulaması FAIL; çıkış 2; "karar bekliyor" / değerlendirme çıkışı YOK; sızmayan satırların katman kimliği S1 ile aynı', () => {
      const j = J(A1).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api'); const rest = j.filter((p) => p.gt.producer !== 'api'); const s1d = rowsOf(S1, 'deny');
      const ok = is(A1, 2, 'P/F/F/P') && api.length === 5 && api.every((p) => p.gt.status === 403 && p.gt.apiWrote === 'YENI' && p.gt.ridOk === false && p.row.status === 403 && p.row.outcome === 'RET-403' && p.row.statusExpected === true && p.row.idObs === 'YENI-KIMLIK' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API')
        && rc(A1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === api.length && rc(A1, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === api.length && V(A1).httpReject.reasons.length === 0 && V(A1).edgeBlocking.reasons.length === 1
        && rest.length > 0 && rest.every((p) => p.row.layerId === s1d[j.indexOf(p)].layerId) && A1.ev.findings.length === api.length && A1.ev.calibration.result === 'VAR'
        && /^D8-HTTP-RET=PASS$/m.test(A1.log) && /^D8-KENAR-ENGELLEME=FAIL$/m.test(A1.log) && /^D8-KATMAN-DOGRULAMA=FAIL$/m.test(A1.log) && /^D8-CIKIS=2$/m.test(A1.log) && !/KARAR|DEGERLENDIRME/.test(A1.log + A1.evBytes.toString('utf8'))
        && JSON.stringify(A1.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny) && S3dN.code === 3 && V(S3dN).edgeBlocking.value === 'OLCULEMEYEN' && api.every((p) => !(A1.evBytes.toString('utf8') + A1.sumBytes.toString('utf8')).includes(p.gt.respId));
      return { ok, obs: brief(A1) + ` · API'nin ürettiği 403=${api.length} · durum sayıları S3-dN ile aynı=${JSON.stringify(A1.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny)} (S3-dN çıkış ${S3dN.code})` };
    });
    const A2 = await scenario('app403var', { tag: 'a2' });
    item('A-2', 'API\'nin 403\'ü yalnız yolu BELİRSİZ bir vektörde (kodlama varyantı kenarı aşmış, 403\'ü API üretmiş; ön uçuş değil): yol sınıfı API-BELIRSIZ olduğu halde satır UYGULAMA-API (değiştirme kanıtı yol sınıfından bağımsızdır); HTTP / ret PASS · kenar engelleme FAIL · katman doğrulaması FAIL; çıkış 2; durum sayıları S1 ile AYNI', () => {
      const j = J(A2).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api');
      const ok = is(A2, 2, 'P/F/F/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.apiWrote === 'YENI' && api[0].row.pathClass === 'API-BELIRSIZ' && api[0].row.method !== 'OPTIONS' && api[0].row.outcome === 'RET-403' && api[0].row.layerId === 'UYGULAMA-API'
        && A2.ev.calibration.result === 'VAR' && rc(A2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && V(A2).edgeBlocking.reasons.length === 1 && JSON.stringify(A2.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny) && S1.code === 3 && V(S1).edgeBlocking.value === 'OLCULEMEYEN';
      return { ok, obs: brief(A2) + ` · API'nin ürettiği 403=${api.length} · yol sınıfı=${api[0] && api[0].row.pathClass} · katman=${api[0] && api[0].row.layerId}` };
    });
    const K5a = await scenario('partial5', { tag: 'k5a' }); const A3a = await scenario('partial5app403', { tag: 'a3a' }); const A3b = await scenario('partial5leak', { tag: 'a3b' }); const A3c = await scenario('reflectapp403', { tag: 'a3c' }); const R2a = await scenario('webecho', { tag: 'r2a' });
    item('A-3', 'kalibrasyon EKSİK ya da GEÇERSİZ iken API\'ye özgü kanıt — somut olumsuz kanıt SİLİNMEZ: (a) kalibrasyon YOK (bir API pozitifi başlıksız) + bir ret vektörünü API 403 ile yanıtlamış → kenar engelleme FAIL, çıkış 2 (aynı kalibrasyon, kanıtsız: K-5a → OLCULEMEYEN, çıkış 3) · (b) kalibrasyon YOK + API\'nin 401\'i → HTTP / ret de FAIL · (c) yansıtan katman GÖRÜLMÜŞ (kalibrasyon GECERSIZ: kenar ve web yanıtları isteğin kimliğini yansıtıyor) + bir ret vektörünü API 403 ile yanıtlamış → o satır yine UYGULAMA-API (yansıtan katman "yeni kimlik" üretemez), kenar engelleme FAIL (aynı yansıtan katman, kanıtsız: R-2a → OLCULEMEYEN); üçünde de kalibrasyon nedeni kayıtta kalır ve "kapalı" (PASS) verilmez', () => {
      const one = (S) => J(S).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const a = one(A3a); const b = one(A3b); const c = one(A3c);
      const ok = is(A3a, 2, 'P/F/F/P') && A3a.ev.calibration.result === 'YOK' && A3a.ev.calibration.apiReplace === 2 && A3a.ev.calibration.apiEvidenceUsable === true && a.length === 1 && a[0].gt.status === 403 && a[0].row.layerId === 'UYGULAMA-API' && rc(A3a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A3a, 'edgeBlocking', 'KALIBRASYON-YOK') === 1
        && is(K5a, 3, 'P/O/O/P') && K5a.ev.calibration.result === 'YOK'
        && is(A3b, 2, 'F/F/F/P') && A3b.ev.calibration.result === 'YOK' && b.length === 1 && b[0].gt.status === 401 && b[0].row.layerId === 'UYGULAMA-API' && rc(A3b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1
        && is(A3c, 2, 'P/F/F/P') && A3c.ev.calibration.result === 'GECERSIZ' && A3c.ev.calibration.reflectionRows > 3 && A3c.ev.calibration.foreignIdRows === 0 && A3c.ev.calibration.apiEvidenceUsable === true && c.length === 1 && c[0].gt.status === 403 && c[0].row.idSignal === 'DEGISTIRME' && c[0].row.layerId === 'UYGULAMA-API'
        && rc(A3c, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A3c, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rowsOf(A3c, 'deny').filter((x) => x.layerId === 'UYGULAMA-API').length === 1 && is(R2a, 3, 'P/O/O/P');
      return { ok, obs: `kalibrasyon YOK + API 403: ${brief(A3a)} || YOK + API 401: ${brief(A3b)} || yansıtan katman + API 403: ${brief(A3c)} · K-5a çıkış=${K5a.code} · R-2a çıkış=${R2a.code}` };
    });

    const A4 = await scenario('challengeapp403', { tag: 'a4' });
    item('A-4', 'sınama (challenge) işaretli 403 + BAŞKA bir satırda API\'ye özgü kanıt (bütün ret vektörleri sınama işaretli 403; yalnız bir ret vektörünü API 403 ile yanıtlamış — işaretsiz, değiştirme kanıtlı): işaret kenar engelleme hükmünü yalnız DÜŞÜRÜR, bağımsız kanıtlanan ihlali SİLMEZ → kenar engelleme FAIL korunur (iki neden de kayıtta: API\'ye ulaştı ×1 · sınama işaretli ×58); HTTP / ret PASS; çıkış 2 (S3-ch: yalnız işaret → OLCULEMEYEN, çıkış 3)', () => {
      const j = J(A4).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api'); const marked = j.filter((p) => p.gt.challenge);
      const ok = is(A4, 2, 'P/F/F/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.mark === 'YOK' && api[0].row.mitigationMark === 'YOK' && api[0].row.layerId === 'UYGULAMA-API' && marked.length === j.length - 1 && marked.length > 0
        && rc(A4, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A4, 'edgeBlocking', 'SINAMA-ISARETLI-403') === marked.length && V(A4).httpReject.reasons.length === 0 && A4.ev.findings.length === 1 && S3ch.code === 3 && V(S3ch).edgeBlocking.value === 'OLCULEMEYEN';
      return { ok, obs: brief(A4) + ` · API'nin ürettiği 403=${api.length} · sınama işaretli=${marked.length} · S3-ch çıkış=${S3ch.code}` };
    });
    const UNSUP = 'YENI-KIMLIK-GOZLEMI-KALIBRASYON-DEGISTIRMEYI-GOSTERMEDI'; // bu dosyada BAĞIMSIZ yazılıdır: sondanın katman doğrulaması neden sınıfı bununla karşılaştırılır
    const A5a = await scenario('noreplapp403', { tag: 'a5a' }); const A5b = await scenario('onereplapp403', { tag: 'a5b' });
    item('A-5', 'KATMAN DOĞRULAMASI — DESTEKSİZ KESİNLİK YOK (aynı ret vektörünü API 403 ile yanıtlamış: GECERSIZ-BICIM → yeni kimlik; iki girdide de kalibrasyon YOK): (a) koşumun kendi kalibrasyonu API\'nin "kabul edilmeyen biçim → yeni kimlik" davranışını HİÇ göstermedi (GECERSIZ-BICIM gönderilen üç API pozitifi başlıksız: değiştirme 0/3) → kenar engelleme yine FAIL (somut olumsuz kanıt silinmez; bulgu adayı), çıkış 2 — AMA katman doğrulaması "API" kesinliği BİLDİRMEZ: OLCULEMEYEN + açık neden sınıfı; kapsam sayısında API kanıtlı satır 0 · (b) kalibrasyon bu davranışı EN AZ BİR kez gösterdi (değiştirme 1/3) → kenar engelleme FAIL ve katman doğrulaması FAIL (kapsamda API kanıtlı 1) · karşılaştırma: değiştirme 2/3 (A-3a) → katman FAIL. Adsız özet aynı değerleri ve nedenleri taşır', () => {
      const api = (S) => J(S).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api'); const a = api(A5a); const b = api(A5b); const ca = A5a.ev.calibration; const cb = A5b.ev.calibration; const cov = (S) => V(S).layerVerification.coverage;
      const leak = (x) => x.length === 1 && x[0].gt.status === 403 && x[0].gt.apiWrote === 'YENI' && x[0].gt.echoed === 'other' && x[0].row.idSignal === 'DEGISTIRME' && x[0].row.layerId === 'UYGULAMA-API';
      const ok = is(A5a, 2, 'P/F/O/P') && leak(a) && ca.result === 'YOK' && ca.apiReplace === 0 && ca.apiReplaceOf === 3 && ca.apiWriteBack === 3 && ca.apiEvidenceUsable === true
        && rc(A5a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A5a, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && rc(A5a, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === 0 && rc(A5a, 'layerVerification', UNSUP) === 1
        && V(A5a).layerVerification.reasons.every((r) => r.value === 'OLCULEMEYEN') && cov(A5a).provenApi === 0 && (cov(A5a).unverifiableByReason || {})[UNSUP] === 1 && cov(A5a).provenApi + cov(A5a).unverifiable === cov(A5a).denyRows
        && /^D8-KENAR-ENGELLEME=FAIL$/m.test(A5a.log) && /^D8-KATMAN-DOGRULAMA=OLCULEMEYEN$/m.test(A5a.log) && /^D8-CIKIS=2$/m.test(A5a.log) && A5a.ev.findings.length === 1 && A5a.sum.nameVerdict.layerVerification.value === 'OLCULEMEYEN' && A5a.sum.nameVerdict.layerVerification.reasons.some((r) => r.reason === UNSUP && r.count === 1)
        && is(A5b, 2, 'P/F/F/P') && leak(b) && cb.result === 'YOK' && cb.apiReplace === 1 && cb.apiReplaceOf === 3 && cb.apiWriteBack === 0 && rc(A5b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A5b, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === 1 && rc(A5b, 'layerVerification', UNSUP) === 0
        && cov(A5b).provenApi === 1 && (cov(A5b).unverifiableByReason || {})[UNSUP] === undefined && cov(A5b).provenApi + cov(A5b).unverifiable === cov(A5b).denyRows && /^D8-KATMAN-DOGRULAMA=FAIL$/m.test(A5b.log)
        && A3a.ev.calibration.apiReplace === 2 && V(A3a).layerVerification.value === 'FAIL' && JSON.stringify(A5a.ev.outcomeCounts.deny) === JSON.stringify(A5b.ev.outcomeCounts.deny);
      return { ok, obs: `değiştirme ${ca.apiReplace}/${ca.apiReplaceOf}: ${brief(A5a)} · katman nedenleri [${reasonNames(A5a, 'layerVerification')}] · kapsamda API kanıtlı=${cov(A5a).provenApi} || değiştirme ${cb.apiReplace}/${cb.apiReplaceOf}: ${brief(A5b)} · katman nedenleri [${reasonNames(A5b, 'layerVerification')}] · kapsamda API kanıtlı=${cov(A5b).provenApi} || A-3a: değiştirme ${A3a.ev.calibration.apiReplace}/3 → katman=${V(A3a).layerVerification.value}` };
    });

    // ── YANSITAN aracı: gönderilen değerin AYNEN dönmesi API kanıtı DEĞİLDİR ──
    const R1 = await scenario('reflectapinopt', { tag: 'r1' });
    item('R-1', 'YANSITAN aracı YALNIZ API önekli, ön uçuş OLMAYAN retlerde (kenar kendi 403\'lerine isteğin kimliğini kopyalıyor; web yanıtlarında ve ön uçuşta başlık YOK — başlıksız bölge temiz; API pozitifleri iki davranışı da gösteriyor): ret vektörleri GECERSIZ-BICIM taşıdığı için "aynı değer geri döndü" gözlemi YANSIMA\'dır (API o değeri atıp yenisini üretirdi) → API kanıtı YOK: UYGULAMA-API 0, kenar engelleme FAIL DEĞİL; kalibrasyon GECERSIZ; kenar engelleme OLCULEMEYEN (nedenler kalibrasyon + katmanı belirsiz kimlik başlığı — "temiz gözlem" sınıfı değil), katman doğrulaması OLCULEMEYEN; çıkış 3 (aynı durum kodlarında API üretseydi A-1: çıkış 2)', () => {
      const j = J(R1); const refl = j.filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'same'); const c = R1.ev.calibration;
      const ok = is(R1, 3, 'P/O/O/P') && refl.length > 20 && refl.every((p) => p.row.group === 'deny' && p.gt.ridOk === false && p.row.method !== 'OPTIONS' && p.row.pathClass !== 'ONEK-DISI' && p.row.status === 403 && p.row.idObs === 'AYNEN' && p.row.idSignal === 'YANSIMA' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'YANSIMA')
        && c.result === 'GECERSIZ' && c.zoneHeaderRows === 0 && c.reflectionRows === refl.length && c.foreignIdRows === 0 && c.apiWriteBack === 3 && c.apiReplace === 3 && rowsOf(R1, 'deny').every((x) => x.layerId === 'OLCULEMEYEN')
        && rc(R1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(R1, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(R1, 'edgeBlocking', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI') === refl.length && rc(R1, 'edgeBlocking', NOEV) === 0 && V(R1).layerVerification.coverage.provenApi === 0
        && R1.ev.findings.length === 0 && R1.ev.rows.map((x) => x.status).join() === S1.ev.rows.map((x) => x.status).join() && A1.code === 2 && JSON.stringify(R1.ev.outcomeCounts.deny) === JSON.stringify(A1.ev.outcomeCounts.deny);
      return { ok, obs: brief(R1) + ` · kenarın yansıttığı ret yanıtı=${refl.length} · başlıksız bölgede başlık=${c.zoneHeaderRows} · yansıma göstergesi=${c.reflectionRows} · UYGULAMA-API (ret)=${rowsOf(R1, 'deny').filter((x) => x.layerId === 'UYGULAMA-API').length} · A-1 çıkış=${A1.code}` };
    });
    const R2b = await scenario('reflectall', { tag: 'r2b' });
    item('R-2', 'YANSITAN aracı HER YERDE: (a) kenar 403\'lerinde ve web yanıtlarında (API yanıtları değişmeden geçer) → başlıksız bölgede ve ret satırlarında yansıma; kalibrasyon GECERSIZ; ret satırlarında UYGULAMA-API 0; kenar engelleme OLCULEMEYEN; çıkış 3 · (b) API yanıtlarının başlığının ÜZERİNE de yazıyor (68 yanıtın hepsinde gönderilen değer) → GECERSIZ-BICIM gönderilen API pozitiflerinde bile AYNEN döner (YANSIMA: API\'nin "değiştirme" davranışı görülmez) → hiçbir satır UYGULAMA-API değil; çıkış 3', () => {
      const ca = R2a.ev.calibration; const cb = R2b.ev.calibration; const zone = (S) => S.ev.rows.filter((x) => x.pathClass === 'ONEK-DISI' || x.method === 'OPTIONS').length;
      const ok = is(R2a, 3, 'P/O/O/P') && ca.result === 'GECERSIZ' && ca.zoneHeaderRows === zone(R2a) && ca.reflectionRows > ca.zoneHeaderRows && ca.foreignIdRows === 0 && rowsOf(R2a, 'deny').every((x) => x.idObs === 'AYNEN' && x.idSignal === 'YANSIMA' && x.layerId === 'OLCULEMEYEN') && rc(R2a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && R2a.gt.filter((s) => s.producer !== 'api').every((s) => s.echoed === 'same')
        && is(R2b, 3, 'P/O/O/P') && cb.result === 'GECERSIZ' && cb.apiReplace === 0 && cb.apiWriteBack === 3 && R2b.gt.every((s) => s.echoed === 'same') && R2b.ev.rows.length === VEC.all.length && R2b.ev.rows.every((x) => x.idObs === 'AYNEN' && x.layerId === 'OLCULEMEYEN')
        && rowsOf(R2b, 'allow').filter((x) => x.sent.requestIdForm === 'GECERSIZ-BICIM').every((x) => x.idSignal === 'YANSIMA') && rc(R2b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0;
      return { ok, obs: `kenar + web: ${brief(R2a)} · yansıma göstergesi=${ca.reflectionRows} || her yanıt: ${brief(R2b)} · değiştirme ${cb.apiReplace}/${cb.apiReplaceOf} · UYGULAMA-API=${R2b.ev.rows.filter((x) => x.layerId === 'UYGULAMA-API').length}` };
    });
    const R3a = await scenario('reflectapi', { tag: 'r3a' }); const R3b = await scenario('reflectweb1', { tag: 'r3b' }); const R3c = await scenario('reflectpos1', { tag: 'r3c' }); const R3d = await scenario('reflectpos2', { tag: 'r3d' });
    item('R-3', 'yansıma göstergesi TEK bir bölgede de kalibrasyonu geçersiz kılar (durum sayıları dördünde de S1 ile AYNI; dördünde de kenar engelleme nedeni KALIBRASYON-GECERSIZ — S1\'in "temiz gözlem" sınıfı DEĞİL; çıkış 3): (a) API önekli retlerde, ÖN UÇUŞ dahil (API ön uçuşta başlık yazamaz) · (b) tek bir WEB ret yanıtında · (c) yalnız bir web POZİTİFİNDE, GECERLI-BICIM gönderilmiş (ret yanıtlarında başlık yok) · (d) yalnız bir web pozitifinde, GECERSIZ-BICIM gönderilmiş → dördünde de kalibrasyon GECERSIZ, yabancı kimlik göstergesi 0', () => {
      const one = (S, n) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === 0 && (n === null ? c.reflectionRows > 2 : c.reflectionRows === n) && S.ev.rows.every((x) => x.layerWhy !== NOHDR) && rowsOf(S, 'deny').every((x) => x.layerId !== 'UYGULAMA-API')
        && rc(S, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(S, 'edgeBlocking', NOEV) === 0 && JSON.stringify(S.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts); };
      const pre = J(R3a).filter((p) => p.row.method === 'OPTIONS' && p.gt.echoed === 'same'); const w = J(R3b).filter((p) => p.gt.echoed === 'same' && p.gt.producer === 'edge'); const p1 = J(R3c).filter((p) => p.gt.producer === 'web' && p.gt.echoed === 'same'); const p2 = J(R3d).filter((p) => p.gt.producer === 'web' && p.gt.echoed === 'same');
      const ok = one(R3a, null) && pre.length === 2 && pre.every((p) => p.row.layerWhy === 'YANSIMA') && R3a.ev.calibration.zoneHeaderRows === 2
        && one(R3b, 1) && w.length === 1 && w[0].row.pathClass === 'ONEK-DISI' && w[0].row.method !== 'OPTIONS' && w[0].row.group === 'deny'
        && one(R3c, 1) && p1.length === 1 && p1[0].row.group === 'allow' && p1[0].gt.ridOk === true && p1[0].row.idObs === 'AYNEN' && p1[0].row.layerWhy === 'YANSIMA' && rowsOf(R3c, 'deny').every((x) => x.idObs === 'YOK') && R3c.ev.calibration.apiWriteBack === 3 && R3c.ev.calibration.apiReplace === 3
        && one(R3d, 1) && p2.length === 1 && p2[0].row.group === 'allow' && p2[0].gt.ridOk === false && p2[0].row.idSignal === 'YANSIMA' && S1.code === 3 && reasonNames(S1, 'edgeBlocking') === NOEV + '×1';
      return { ok, obs: `ön uçuş dahil: ${brief(R3a)} · ön uçuşta aynı değer=${pre.length} || tek web ret: çıkış=${R3b.code}, kalibrasyon=${R3b.ev.calibration.result} || web pozitifi (geçerli biçim): çıkış=${R3c.code}, kalibrasyon=${R3c.ev.calibration.result} || web pozitifi (geçersiz biçim): çıkış=${R3d.code}, kalibrasyon=${R3d.ev.calibration.result}` };
    });

    // ── DAMGALAYAN aracı: API biçiminde "yeni kimlik" gözlemi, damga göstergesi varken API kanıtı DEĞİLDİR ──
    const M1 = await scenario('fark403', { tag: 'm1' });
    item('M-1', 'DAMGALAYAN aracı bütün ret yanıtlarına KENDİ kimliğini yazıyor (API\'nin ürettiği biçimle AYNI biçimde; web ve ön uçuş retleri dahil): API önekli ret satırlarında gözlem API\'nin "değiştirme" davranışıyla AYNI görünür (GECERSIZ-BICIM gönderildi, API biçiminde yeni kimlik döndü) — ama başlıksız bölgede de kimlik başlığı var → yabancı kimlik göstergesi → API kanıtı KULLANILAMAZ: hiçbir satır UYGULAMA-API değil (gerçekten API\'nin ürettiği pozitif yanıtlar dahil); kalibrasyon GECERSIZ; kenar engelleme OLCULEMEYEN (FAIL değil; nedenler kalibrasyon + katmanı belirsiz kimlik başlığı); çıkış 3; yanıt başlığı DEĞERLERİ ham kanıta ve özete yazılmaz', () => {
      const j = J(M1).filter((p) => p.row.group === 'deny'); const txt = M1.evBytes.toString('utf8') + M1.sumBytes.toString('utf8'); const c = M1.ev.calibration; const zone = j.filter((p) => p.row.pathClass === 'ONEK-DISI' || p.row.method === 'OPTIONS'); const non = j.filter((p) => !zone.includes(p));
      const ok = is(M1, 3, 'P/O/O/P') && j.length > 0 && j.every((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other' && p.gt.respUuid === true && p.row.idObs === 'YENI-KIMLIK' && p.row.status === 403 && p.row.layerId === 'OLCULEMEYEN')
        && zone.length === 15 && zone.every((p) => p.row.layerWhy === 'YABANCI-KIMLIK') && non.length === 44 && non.every((p) => p.row.idSignal === 'DEGISTIRME' && p.row.layerWhy === 'KANIT-KULLANILAMAZ')
        && c.result === 'GECERSIZ' && c.foreignIdRows === zone.length && c.reflectionRows === 0 && c.apiEvidenceUsable === false && c.apiWriteBack === 3 && c.apiReplace === 3 && M1.ev.rows.every((x) => x.layerId === 'OLCULEMEYEN')
        && rc(M1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(M1, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(M1, 'edgeBlocking', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI') === j.length && M1.ev.findings.length === 0 && j.every((p) => p.gt.respId && !txt.includes(p.gt.respId));
      return { ok, obs: brief(M1) + ` · damgalı ret yanıtı=${j.filter((p) => p.gt.echoed === 'other').length}/${j.length} · başlıksız bölgede yabancı kimlik=${c.foreignIdRows} · API kanıtı kullanılabilir=${c.apiEvidenceUsable} · UYGULAMA-API=${M1.ev.rows.filter((x) => x.layerId === 'UYGULAMA-API').length}` };
    });
    const M2 = await scenario('stampleak', { tag: 'm2' });
    item('M-2', 'damgalayan aracı + GERÇEK sızıntı (bir ret vektörünü API 401 ile yanıtlamış; damga başlıksız her yanıtta): sızan satırın gözlemi damgalı satırlarla AYNI sınıftadır (API biçiminde yeni kimlik) → API\'ye özgü DEĞİL → o satır UYGULAMA-API sayılmaz, kenar engelleme FAIL verilmez (OLCULEMEYEN); ama durum kodu ölçütü bağımsızdır: HTTP / ret FAIL (403 yerine doğrulanmış 401) → çıkış 2', () => {
      const j = J(M2); const api = j.filter((p) => p.row.group === 'deny' && p.gt.producer === 'api'); const c = M2.ev.calibration;
      const ok = is(M2, 2, 'F/O/O/P') && api.length === 1 && api[0].gt.status === 401 && api[0].gt.apiWrote === 'YENI' && api[0].row.idSignal === 'DEGISTIRME' && api[0].row.layerId === 'OLCULEMEYEN' && api[0].row.layerWhy === 'KANIT-KULLANILAMAZ'
        && c.result === 'GECERSIZ' && c.foreignIdRows > 0 && c.apiEvidenceUsable === false && rc(M2, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1 && rc(M2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(M2, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1
        && M2.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API') && M2.ev.findings.length === 1;
      return { ok, obs: brief(M2) + ` · API'nin ürettiği ret yanıtı=${api.length} (katman=${api[0] && api[0].row.layerId}/${api[0] && api[0].row.layerWhy}) · yabancı kimlik göstergesi=${c.foreignIdRows}` };
    });
    const M3a = await scenario('fark403web', { tag: 'm3a' }); const M3b = await scenario('fark403opt', { tag: 'm3b' }); const M3c = await scenario('stamppos1app403', { tag: 'm3c' });
    item('M-3', 'damga göstergesi TEK bir bölgede de yeter: (a) yalnız önek dışı (web) ret yanıtlarında · (b) yalnız API önekli ön uçuş yanıtında → kalibrasyon GECERSIZ, API kanıtı kullanılamaz, başlıksız düz /api satırlarının nedeni KALIBRASYON-GECERSIZ; çıkış 3 · (c) damga yalnız bir web POZİTİFİNDE + bir ret vektörünü API 403 ile yanıtlamış (A-1\'in girdisi) → API\'nin "yeni kimlik" yanıtı API\'ye özgü sayılamaz: o satır UYGULAMA-API DEĞİL, kenar engelleme FAIL DEĞİL (OLCULEMEYEN), çıkış 3 — kanıtın desteklemediği kesinlik reddedilir (A-1: gösterge yokken aynı girdi çıkış 2)', () => {
      const one = (S, n) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === n && c.reflectionRows === 0 && c.apiEvidenceUsable === false && S.ev.rows.every((x) => x.layerId === 'OLCULEMEYEN') && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(S, 'edgeBlocking', NOEV) === 0; };
      const wa = J(M3a).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const wb = J(M3b).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const apiC = J(M3c).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = one(M3a, wa.length) && wa.length > 5 && wa.every((p) => p.row.group === 'deny' && p.row.pathClass === 'ONEK-DISI') && rowsOf(M3a, 'deny').filter((x) => x.pathClass === 'API-KESIN' && x.method !== 'OPTIONS').every((x) => x.idObs === 'YOK' && x.layerWhy === 'KALIBRASYON-GECERSIZ')
        && one(M3b, 2) && wb.length === 2 && wb.every((p) => p.row.method === 'OPTIONS')
        && one(M3c, 1) && apiC.length === 1 && apiC[0].gt.status === 403 && apiC[0].gt.apiWrote === 'YENI' && apiC[0].row.idSignal === 'DEGISTIRME' && apiC[0].row.layerWhy === 'KANIT-KULLANILAMAZ' && A1.code === 2;
      return { ok, obs: `web ret: ${brief(M3a)} · damgalı=${wa.length} || ön uçuş: çıkış=${M3b.code}, damgalı=${wb.length} || web pozitifinde damga + API 403: ${brief(M3c)} · A-1 çıkış=${A1.code}` };
    });
    const M4 = await scenario('fark403apifix', { tag: 'm4' });
    item('M-4', 'API biçiminde OLMAYAN kimlik değeri YALNIZ API önekli, ön uçuş olmayan ret yanıtlarında (başlıksız bölge temiz): API böyle bir değer üretemez → YABANCI-KIMLIK → kalibrasyon GECERSIZ, API kanıtı kullanılamaz; o satırlar UYGULAMA-API değil; kenar engelleme OLCULEMEYEN; çıkış 3 (aynı yerde API biçiminde değer: SINIR-1)', () => {
      const j = J(M4).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const c = M4.ev.calibration; const txt = M4.evBytes.toString('utf8') + M4.sumBytes.toString('utf8') + M4.log;
      const ok = is(M4, 3, 'P/O/O/P') && j.length > 20 && j.every((p) => p.gt.respUuid === false && p.row.idObs === 'BASKA-DEGER' && p.row.idSignal === 'YABANCI-KIMLIK' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'YABANCI-KIMLIK' && p.row.pathClass !== 'ONEK-DISI' && p.row.method !== 'OPTIONS')
        && c.result === 'GECERSIZ' && c.zoneHeaderRows === 0 && c.foreignIdRows === j.length && c.apiEvidenceUsable === false && rc(M4, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && !txt.includes('kenar-0001');
      return { ok, obs: brief(M4) + ` · yabancı değerli ret yanıtı=${j.length} · başlıksız bölgede başlık=${c.zoneHeaderRows} · yabancı kimlik göstergesi=${c.foreignIdRows}` };
    });

    // ── EZEN aracı (API'nin başlığını siler / üzerine yazar) · canlı API kaynaktaki gibi davranmıyor ──
    const E1a = await scenario('apinoecho', { tag: 'e1a' }); const E1b = await scenario('stripleak', { tag: 'e1b' });
    item('E-1', 'EZEN aracı API yanıtlarından kimlik başlığını SİLİYOR: (a) API pozitifleri beklenen kodu (401) verdi ama başlıksız → kalibrasyon YOK (iki davranış da görülmedi: 0/3 · 0/3); hiçbir satır UYGULAMA-API değil; durum sayıları S1 ile AYNI ama kenar engelleme nedeni KALIBRASYON-YOK (S1: yalnız "temiz gözlem" sınıfı) — iki ölçülemeyen birbirinden ayırt edilir; çıkış 3 · (b) aynı aracı + bir ret vektörünü API 401 ile yanıtlamış (başlık silinmiş) → API kanıtı YOK (kenar engelleme FAIL verilmez, OLCULEMEYEN); durum kodu ölçütü bağımsız: HTTP / ret FAIL → çıkış 2', () => {
      const c = E1a.ev.calibration; const api = J(E1b).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = is(E1a, 3, 'P/O/O/P') && c.result === 'YOK' && c.apiWriteBack === 0 && c.apiReplace === 0 && c.reflectionRows === 0 && c.foreignIdRows === 0 && E1a.ev.rows.every((x) => x.idObs === 'YOK' && x.layerId === 'OLCULEMEYEN') && rc(E1a, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && V(E1a).edgeBlocking.reasons.length === 1
        && rc(E1a, 'edgeBlocking', NOEV) === 0 && JSON.stringify(E1a.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts) && S1.code === 3 && reasonNames(S1, 'edgeBlocking') === NOEV + '×1'
        && is(E1b, 2, 'F/O/O/P') && api.length === 1 && api[0].gt.status === 401 && api[0].gt.echoed === 'none' && api[0].row.idObs === 'YOK' && api[0].row.layerId === 'OLCULEMEYEN' && rc(E1b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(E1b, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1;
      return { ok, obs: `silen: ${brief(E1a)} · aynen geri yazma ${c.apiWriteBack}/${c.apiWriteBackOf} · değiştirme ${c.apiReplace}/${c.apiReplaceOf} || silen + sızıntı: ${brief(E1b)}` };
    });
    const E2a = await scenario('crushapi', { tag: 'e2a' }); const E2b = await scenario('strictfmt', { tag: 'e2b' });
    item('E-2', 'API yanıtındaki kimlik kaynak okumasıyla AÇIKLANAMIYOR: (a) EZEN aracı API yanıtlarının başlığının ÜZERİNE kendi değerini yazıyor · (b) canlı API kaynaktakinden FARKLI bir kabul deseniyle çalışıyor (sondanın GECERLI-BICIM değerini de atıp yenisini üretiyor) → ikisinde de GECERLI-BICIM gönderilen 3 API pozitifinde değer AYNEN dönmedi (YABANCI-KIMLIK ×3) → kalibrasyon GECERSIZ, API kanıtı KULLANILAMAZ; API\'nin 403 ile yanıtladığı ret vektörü ("yeni kimlik" görünür) UYGULAMA-API sayılmaz; kenar engelleme OLCULEMEYEN; çıkış 3', () => {
      const one = (S) => { const c = S.ev.calibration; const g = rowsOf(S, 'allow').filter((x) => x.vectorClass === 'POZITIF-API' && x.sent.requestIdForm === 'GECERLI-BICIM'); const me = J(S).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
        return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === 3 && c.apiWriteBack === 0 && c.apiEvidenceUsable === false && g.length === 3 && g.every((x) => x.idObs === 'YENI-KIMLIK' && x.idSignal === 'YABANCI-KIMLIK')
          && me.length === 1 && me[0].gt.status === 403 && me[0].row.idSignal === 'DEGISTIRME' && me[0].row.layerId === 'OLCULEMEYEN' && me[0].row.layerWhy === 'KANIT-KULLANILAMAZ' && S.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API') && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0; };
      return { ok: one(E2a) && one(E2b), obs: `üzerine yazan: ${brief(E2a)} || farklı kabul deseni: ${brief(E2b)}` };
    });
    const X1 = await scenario('fark403api', { tag: 'sinir1', limit: 'SINIR-1' }); const X1b = await scenario('echoposstamp1', { tag: 'sinir1b', limit: 'SINIR-1' });
    item('SINIR-1', 'SINIRIN KAYDI (güvence DEĞİL — sondanın ayırt EDEMEDİĞİ durum; FAIL yönündeki sınır, belge §1.1): (a) YALNIZ API önekli, ön uçuş olmayan ret yanıtlarına API\'nin ürettiği biçimde KENDİ kimliğini yazan ve başka hiçbir yanıtta görünmeyen bir katman (zemin gerçeği: bu yanıtları KENAR üretti) → başlıksız bölge temiz, API pozitifleri tam (kalibrasyon VAR, değiştirme 3/3); gözlem API\'nin "değiştirme" davranışından ayırt edilemez → sonda o satırları UYGULAMA-API sayar: kenar engelleme FAIL, katman doğrulaması FAIL, çıkış 2. Hata yönü FAIL\'dir (bulgu adayı); PASS yönünde değildir. (Aynı yerde API biçiminde olmayan değer: M-4 → OLCULEMEYEN) · (b) aynı aileden, ama koşumun kendi kalibrasyonu "API kabul etmediği biçimde yeni kimlik üretir" öncülünü GÖSTERMİYOR (API pozitifleri gönderilen değeri AYNEN döndürüyor: değiştirme 0/3) + TEK bir kenar 403\'ünde API biçiminde kimlik (zemin gerçeği: KENAR üretti) → kenar engelleme yine FAIL (bulgu adayı; sınır sürer), çıkış 2 — AMA katman doğrulaması "API yanıtladı" kesinliği BİLDİRMEZ: OLCULEMEYEN + neden sınıfı, kapsamda API kanıtlı satır 0', () => {
      const j = J(X1).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const c = X1.ev.calibration; const jb = J(X1b).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const cb = X1b.ev.calibration;
      const ok = is(X1, 2, 'P/F/F/P') && j.length > 20 && j.length === J(M4).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other').length && j.every((p) => p.gt.respUuid === true && p.row.group === 'deny' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && c.result === 'VAR' && c.apiReplace === 3 && c.zoneHeaderRows === 0 && c.foreignIdRows === 0 && rc(X1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === j.length
        && rc(X1, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === j.length && V(X1).layerVerification.coverage.provenApi === j.length && M4.code === 3
        && is(X1b, 2, 'P/F/O/P') && jb.length === 1 && jb[0].gt.respUuid === true && jb[0].row.group === 'deny' && jb[0].row.idSignal === 'DEGISTIRME' && jb[0].row.layerId === 'UYGULAMA-API' && J(X1b).every((p) => p.row.group !== 'deny' || p.gt.producer === 'edge')
        && cb.result === 'GECERSIZ' && cb.apiReplace === 0 && cb.apiReplaceOf === 3 && cb.apiWriteBack === 3 && cb.reflectionRows === 3 && cb.foreignIdRows === 0 && cb.apiEvidenceUsable === true
        && rc(X1b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(X1b, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === 0 && rc(X1b, 'layerVerification', UNSUP) === 1 && V(X1b).layerVerification.coverage.provenApi === 0;
      return { ok, obs: brief(X1) + ` · kenarın ürettiği ama API sayılan ret yanıtı=${j.length} · kalibrasyon=${c.result} (değiştirme ${c.apiReplace}/${c.apiReplaceOf}) · M-4 çıkış=${M4.code} || kalibrasyon öncülü göstermiyor: ${brief(X1b)} · değiştirme ${cb.apiReplace}/${cb.apiReplaceOf} · kenarın ürettiği "yeni kimlik"li ret yanıtı=${jb.length} · katman nedenleri [${reasonNames(X1b, 'layerVerification')}]` };
    });
    const X2 = await scenario('striponly403', { tag: 'sinir2', limit: 'SINIR-2' });
    // REGRESYON — eski kuralı geri getiren sonda KOPYASI (yalnız iki ifade değişir: "başka neden yoksa kenar engelleme PASS" ve
    // "FAIL yok ve kenar engelleme PASS → çıkış 0"); aynı iki girdide koşturulur (başlığı silinen API 403'ü · sağlıklı kenar).
    const rgProbe = path.join(dir, 'd8-staff-surface-probe.eski-kural.js');
    const rgSrc = src.replace('value: E.closeNoPass(edgeClean, EDGE_NO_INDEPENDENT_EVIDENCE),', () => 'value: E.close(edgeClean),')
      .replace("return vals.includes('FAIL') ? 2 : 3;", () => "return vals.includes('FAIL') ? 2 : ((v.edgeBlocking.value === 'PASS' && v.httpReject.value === 'PASS' && v.positiveControl.value === 'PASS') ? 0 : 3);");
    const rgApplied = rgSrc !== src && rgSrc.split('value: E.close(edgeClean),').length === 2 && !rgSrc.includes("return vals.includes('FAIL') ? 2 : 3;") && !rgSrc.includes('E.closeNoPass(edgeClean');
    fs.writeFileSync(rgProbe, rgSrc);
    const RG1 = rgApplied ? await scenario('striponly403', { tag: 'rg-eski-kural-sil', probe: rgProbe, noInv: true }) : null;
    const RG2 = rgApplied ? await scenario('ok', { tag: 'rg-eski-kural-saglikli', probe: rgProbe, noInv: true }) : null;
    item('SINIR-2', 'REGRESYON + SINIRIN KAYDI (güvence DEĞİL): zincirde, YALNIZ API\'nin ürettiği 403 yanıtından kimlik başlığını silen bir katman (zemin gerçeği: bir ret vektörünü API yanıtladı — istek API\'ye ULAŞTI; pozitiflerin yanıtında başlık düşmüyor, kalibrasyon VAR) → o yanıt kenarın 403\'ünden dışarıdan ayırt edilemez. DÜZELTİLMİŞ sonda: kenar engelleme OLCULEMEYEN (tek neden ULASMAMA-BAGIMSIZ-KANITI-YOK), çıkış 3 — PASS / çıkış 0 DEĞİL; o satır "API değil" sayılmaz (OLCULEMEYEN / başlık yokluğu kanıt değil); dört alan, nedenler, satır düzeyi katman kimliği, durum sayıları, kapsam ve çıkış kodu SAĞLIKLI kenarla (S1; zemin gerçeği: hiçbir ret yanıtını API üretmedi) BİREBİR AYNI — ikisi ayırt edilemediği için ikisine de PASS verilmez. ESKİ KURAL (yalnız iki ifadesi geri alınmış sonda kopyası) aynı girdide yanlış PASS üretir: kenar engelleme PASS, çıkış 0 (istek API\'ye ulaşmışken); sağlıklı kenarda da PASS / çıkış 0 — eski kural da ikisini ayırt edemiyordu', () => {
      const api = J(X2).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api'); const s1Api = J(S1).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const same = X2.code === S1.code && vals(X2).join() === vals(S1).join() && FIELDS.every((f) => reasonNames(X2, f) === reasonNames(S1, f)) && layerVec(X2) === layerVec(S1) && JSON.stringify(X2.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts)
        && JSON.stringify(V(X2).layerVerification.coverage) === JSON.stringify(V(S1).layerVerification.coverage) && X2.ev.calibration.result === S1.ev.calibration.result && V(X2).edgeBlocking.scope === V(S1).edgeBlocking.scope;
      const fixed = is(X2, 3, 'P/O/O/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.apiWrote === 'YENI' && api[0].gt.echoed === 'none' && api[0].row.idObs === 'YOK' && api[0].row.layerId === 'OLCULEMEYEN' && api[0].row.layerWhy === NOHDR && X2.ev.calibration.result === 'VAR'
        && reasonNames(X2, 'edgeBlocking') === NOEV + '×1' && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(X2.log) && /^D8-CIKIS=3$/m.test(X2.log) && X2.ev.findings.length === 0 && s1Api.length === 0 && same;
      const oldEdge = (S) => (S && S.ev && S.ev.nameVerdict && S.ev.nameVerdict.edgeBlocking ? S.ev.nameVerdict.edgeBlocking.value : '?');
      const oldRule = rgApplied && !!RG1 && !!RG2 && RG1.code === 0 && oldEdge(RG1) === 'PASS' && /^D8-KENAR-ENGELLEME=PASS$/m.test(RG1.log) && /^D8-CIKIS=0$/m.test(RG1.log) && RG1.gt.filter((s) => s.producer === 'api' && s.status === 403).length === 1
        && RG2.code === 0 && oldEdge(RG2) === 'PASS' && RG2.gt.length === VEC.all.length && RG2.gt.filter((s) => s.producer === 'api' && s.status === 403).length === 0;
      return { ok: fixed && oldRule, obs: `sınanan sonda (${process.env.D8_SELFTEST_PROBE ? 'ALTERNATİF — paket sondası değil' : 'paket'}), başlığı silinen API 403'ü: ${brief(X2)} · API'nin yanıtladığı ret satırı (zemin gerçeği)=${api.length}, sondanın o satır için sınıfı=${api[0] ? api[0].row.layerId + '/' + api[0].row.layerWhy : '?'} · sağlıklı kenarla (S1) alan / neden / satır / çıkış AYNI=${same} (S1'de API'nin yanıtladığı ret satırı=${s1Api.length}) || eski kural kopyası (uygulandı=${rgApplied}): başlığı silinen API 403'ü → çıkış=${RG1 ? RG1.code : '?'}, kenar=${oldEdge(RG1)} · sağlıklı kenar → çıkış=${RG2 ? RG2.code : '?'}, kenar=${oldEdge(RG2)}` };
    });

    // ── Kısmi kalibrasyon · başlıksız bölge ölçülemedi ──
    const K5b = await scenario('partial1', { tag: 'k5b' }); const K5c = await scenario('partialvalid', { tag: 'k5c' }); const K5d = await scenario('partialinvalid', { tag: 'k5d' });
    item('K-5', 'KISMİ kalibrasyon (ret vektörlerinin hepsi başlıksız 403; durum sayıları S1 ile AYNI): (a) 6 API pozitifinden BİRİ başlıksız · (b) yalnız BİRİ başlıklı · (c) GECERLI-BICIM gönderilen üçü başlıksız — yalnız "değiştirme" görüldü (0/3 · 3/3) · (d) GECERSIZ-BICIM gönderilen üçü başlıksız — yalnız "aynen geri yazma" görüldü (3/3 · 0/3) → dördünde de kalibrasyon YOK (iki davranışın İKİSİ de TAM olmalı); başlıksız düz /api satırlarının nedeni KALIBRASYON-YOK; kenar engelleme OLCULEMEYEN, tek neden KALIBRASYON-YOK ("temiz gözlem" sınıfı değil); çıkış 3 (S1: 3/3 · 3/3 → kalibrasyon VAR, kenar nedeni yalnız ULASMAMA-BAGIMSIZ-KANITI-YOK)', () => {
      const one = (S, w, r) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'YOK' && c.apiWriteBack === w && c.apiReplace === r && c.reflectionRows === 0 && c.foreignIdRows === 0 && rowsOf(S, 'allow').every((x) => x.statusExpected === true)
        && S.ev.rows.every((x) => x.layerWhy !== NOHDR) && rowsOf(S, 'deny').filter((x) => x.pathClass === 'API-KESIN' && x.method !== 'OPTIONS').every((x) => x.layerWhy === 'KALIBRASYON-YOK') && rowsOf(S, 'deny').every((x) => x.status === 403 && x.layerId === 'OLCULEMEYEN') && rc(S, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && V(S).edgeBlocking.reasons.length === 1 && JSON.stringify(S.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts); };
      return { ok: one(K5a, 3, 2) && one(K5b, 1, 0) && one(K5c, 0, 3) && one(K5d, 3, 0) && S1.code === 3 && reasonNames(S1, 'edgeBlocking') === NOEV + '×1' && S1.ev.calibration.result === 'VAR' && S1.ev.calibration.apiWriteBack === 3 && S1.ev.calibration.apiReplace === 3, obs: `5/6: ${brief(K5a)} · 1/6: çıkış=${K5b.code} · yalnız değiştirme: çıkış=${K5c.code}, ${K5c.ev.calibration.apiWriteBack}/3·${K5c.ev.calibration.apiReplace}/3 · yalnız aynen: çıkış=${K5d.code}, ${K5d.ev.calibration.apiWriteBack}/3·${K5d.ev.calibration.apiReplace}/3 · S1 çıkış=${S1.code}, kenar nedeni [${reasonNames(S1, 'edgeBlocking')}]` };
    });
    const K10 = await scenario('posdropweb', { tag: 'k10' });
    item('K-10', 'bir web pozitifi ÖLÇÜLEMEDİ (bağlantı koptu; API pozitifleri tam, ret vektörlerinin hepsi başlıksız 403): başlıksız bölgenin pozitif ayağı eksik → kalibrasyon YOK (VAR değil); kenar engelleme OLCULEMEYEN (nedenler kalibrasyon + yanıtsız vektör); YANITSIZ pozitif → pozitif kontrol OLCULEMEYEN (FAIL değil: doğrulanmış bir yanıt yok); çıkış 3', () => {
      const c = K10.ev.calibration; const ok = is(K10, 3, 'P/O/O/O') && c.result === 'YOK' && c.apiWriteBack === 3 && c.apiReplace === 3 && c.webPositives === 3 && c.webMeasured === 2 && c.reflectionRows === 0 && c.foreignIdRows === 0 && K10.ev.rows.every((x) => x.layerWhy !== NOHDR)
        && rowsOf(K10, 'deny').every((x) => x.status === 403 && x.layerId === 'OLCULEMEYEN') && rc(K10, 'positiveControl', 'POZITIF-YANITSIZ') === 1 && V(K10).positiveControl.reasons.length === 1 && rc(K10, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1 && rc(K10, 'edgeBlocking', NOEV) === 0 && K10.ev.findings.length === 0;
      return { ok, obs: brief(K10) + ` · web ölçülen ${c.webMeasured}/${c.webPositives} · pozitif nedenleri [${reasonNames(K10, 'positiveControl')}]` };
    });
    const Z1 = await scenario('zonedropapp403', { tag: 'z1' });
    item('Z-1', 'başlıksız bölge HİÇ ölçülemedi (web yolları ve ön uçuş istekleri yanıtsız; damgalayan katmanın arandığı yer boş) + bir ret vektörünü API 403 ile yanıtlamış: "yeni kimlik" gözlemi var ama karşı denetimi yapılamadı → API kanıtı KULLANILAMAZ: o satır UYGULAMA-API değil, kenar engelleme FAIL değil; yanıtsız ret vektörleri → HTTP / ret OLCULEMEYEN; çıkış 3', () => {
      const c = Z1.ev.calibration; const api = J(Z1).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = is(Z1, 3, 'O/O/O/O') && c.zoneMeasured === 0 && c.zoneRows === 18 && c.foreignIdRows === 0 && c.apiEvidenceUsable === false && c.result === 'YOK' && api.length === 1 && api[0].gt.status === 403 && api[0].row.idSignal === 'DEGISTIRME' && api[0].row.layerId === 'OLCULEMEYEN' && api[0].row.layerWhy === 'KANIT-KULLANILAMAZ'
        && rc(Z1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(Z1, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 15 && Z1.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API' || x.group === 'allow') && rowsOf(Z1, 'deny').every((x) => x.layerId !== 'UYGULAMA-API');
      return { ok, obs: brief(Z1) + ` · başlıksız bölgede ölçülen ${c.zoneMeasured}/${c.zoneRows} · API kanıtı kullanılabilir=${c.apiEvidenceUsable}` };
    });

    // ── 403 dışı yanıtlar: durum kodu ölçütü HER birinde FAIL; kenar engelleme yalnız API kanıtı varsa FAIL ──
    const aff = (S, st) => J(S).filter((p) => p.row.group === 'deny' && p.gt.status === st);
    const provenNon403 = (S, st, out) => { const a = aff(S, st); return is(S, 2, 'F/F/F/P') && a.length > 0 && a.every((p) => p.gt.producer === 'api' && p.gt.apiWrote === 'YENI' && p.row.outcome === out && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === a.length && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === a.length && S.ev.findings.length === a.length; };
    const unprovenNon403 = (S, st, out) => { const a = aff(S, st); return is(S, 2, 'F/O/O/P') && a.length > 0 && a.every((p) => p.gt.producer === 'edge' && p.row.outcome === out && p.row.idObs === 'YOK' && p.row.layerId !== 'UYGULAMA-API' && p.row.statusExpected === false) && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === a.length && V(S).httpReject.reasons.length === 1 && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1 && V(S).edgeBlocking.reasons.length === 1 && S.ev.findings.length === a.length; };
    const L2 = await scenario('api5xx', { tag: 'l2' });
    item('L-2', 'API\'nin ürettiği 5xx (ret vektöründe 503; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL · katman doğrulaması FAIL; çıkış 2', () => ({ ok: provenNon403(L2, 503, 'SUNUCU-HATASI-5XX'), obs: brief(L2) + ` · API kanıtlı 503=${aff(L2, 503).length}` }));
    const L2b = await scenario('api429', { tag: 'l2b' });
    item('L-2b', 'API\'nin ürettiği 429 (hız sınırı yanıtı; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL; çıkış 2', () => ({ ok: provenNon403(L2b, 429, 'HIZ-SINIRI-429'), obs: brief(L2b) + ` · API kanıtlı 429=${aff(L2b, 429).length}` }));
    const L9 = await scenario('api302', { tag: 'l9' });
    item('L-9', 'API\'nin ürettiği 3xx (ret vektöründe 302; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL; çıkış 2 (L-5: aynı kod, kanıtsız → kenar engelleme OLCULEMEYEN)', () => ({ ok: provenNon403(L9, 302, 'YONLENDIRME-3XX'), obs: brief(L9) + ` · API kanıtlı 302=${aff(L9, 302).length}` }));
    const L3 = await scenario('edge5xx', { tag: 'l3' });
    item('L-3', 'API\'den geldiği KANITSIZ 5xx (aynı vektörlerde 502\'yi kenar üretir): beklenen 403 yerine DOĞRULANMIŞ başka bir HTTP yanıtı → durum kodu ölçütü FAIL (ölçülemeyen DEĞİL); API\'ye ulaşma kanıtı yok → kenar engelleme OLCULEMEYEN (FAIL değil); çıkış 2', () => ({ ok: unprovenNon403(L3, 502, 'SUNUCU-HATASI-5XX') && aff(L3, 502).length === aff(L2, 503).length, obs: brief(L3) + ` · kanıtsız 502=${aff(L3, 502).length}` }));
    const L4 = await scenario('edge404', { tag: 'l4' });
    item('L-4', 'kanıtsız 403 dışı 4xx (aynı vektörlerde başlıksız 404; tünel varsayılanı da, kenarı geçen istek de bu kodu verebilir): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN — PASS sayılmaz, API sızıntısı da yazılmaz; çıkış 2', () => ({ ok: unprovenNon403(L4, 404, 'DORTYUZ-403-DISI'), obs: brief(L4) + ` · kanıtsız 404=${aff(L4, 404).length}` }));
    const L5 = await scenario('redirect', { tag: 'l5' });
    item('L-5', 'yönlendirme (aynı vektörlerde 302 + Location): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; sonda yönlendirmeyi İZLEMEZ (kenar yalnız 68 istek gördü); çıkış 2; yönlendirme HEDEFİ ham kanıta, özete ve çıktıya yazılmaz', () => {
      const txt = L5.evBytes.toString('utf8') + L5.sumBytes.toString('utf8') + L5.log;
      return { ok: unprovenNon403(L5, 302, 'YONLENDIRME-3XX') && L5.gt.length === VEC.all.length && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli') && !/location/i.test(L5.evBytes.toString('utf8')), obs: brief(L5) + ` · 302=${aff(L5, 302).length} · hedef kanıtta=${txt.includes('yonlendirme-hedefi')} · kenarın gördüğü istek=${L5.gt.length}` };
    });
    const L6 = await scenario('rate429', { tag: 'l6' });
    item('L-6', 'kanıtsız 429 (hız sınırı; erişim kararı gözlenmedi): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; çıkış 2 (L-2b: aynı kod, API kanıtlı → kenar engelleme FAIL)', () => ({ ok: unprovenNon403(L6, 429, 'HIZ-SINIRI-429') && L2b.code === 2 && V(L2b).edgeBlocking.value === 'FAIL', obs: brief(L6) + ` · kanıtsız 429=${aff(L6, 429).length} · L-2b kenar=${V(L2b).edgeBlocking.value}` }));
    const L8 = await scenario('edge600', { tag: 'l8' });
    item('L-8', 'hiçbir sınıfa girmeyen durum kodu (aynı vektörlerde 600): durum sınıfı SINIFLANAMADI; yine doğrulanmış 403 dışı yanıt → durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; çıkış 2 — PASS değil', () => ({ ok: unprovenNon403(L8, 600, 'SINIFLANAMADI') && aff(L8, 600).length === aff(L3, 502).length, obs: brief(L8) + ` · 600=${aff(L8, 600).length}` }));
    const H1 = await scenario('denydrop1', { tag: 'h1' });
    item('H-1', 'yanıt ALINAMAYAN ret vektörü ayrı sınıftır (TEK bir ret vektöründe bağlantı koptu; diğer 58\'i başlıksız 403, pozitifler tam): HTTP / ret OLCULEMEYEN (neden RET-VEKTORU-YANITSIZ×1) — FAIL DEĞİL, PASS DEĞİL; kenar engelleme OLCULEMEYEN; çıkış 3. Aynı vektörlerde doğrulanmış başka yanıt (L-4: 404) → FAIL, çıkış 2: iki durum tek etikette birleşmez', () => {
      const lost = J(H1).filter((p) => p.gt.producer === 'drop');
      const ok = is(H1, 3, 'O/O/O/P') && lost.length === 1 && lost[0].row.group === 'deny' && lost[0].row.status === 0 && lost[0].row.outcome === 'SONUC-YOK' && lost[0].row.errorClass === 'BAGLANTI' && lost[0].row.layerId === 'SONUC-YOK' && rc(H1, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && V(H1).httpReject.reasons.length === 1
        && rc(H1, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1 && rc(H1, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1 && H1.ev.calibration.result === 'VAR' && H1.ev.findings.length === 0 && L4.code === 2 && V(L4).httpReject.value === 'FAIL';
      return { ok, obs: brief(H1) + ` · yanıtsız ret vektörü=${lost.length} · L-4 http=${V(L4).httpReject.value} (çıkış ${L4.code})` };
    });

    // ── Tekdüze yanıtlar ──
    const U1 = await scenario('uniform', { tag: 'u1' });
    item('U-1', 'tekdüze 403 (pozitifler dahil 68/68 istek 403): durum kodu ölçütü PASS (ret vektörlerinin hepsi 403; sayılar S1 ile AYNI) — kenar engelleme OLCULEMEYEN ("personel kapalı, portal açık" gözlemi DEĞİL: nedenler TEKDUZE-403 · pozitifler beklendiği gibi değil ×9 · kalibrasyon YOK; "temiz gözlem" sınıfı değil) ve POZİTİF KONTROL FAIL (izinli dokuz yolun dokuzunda beklenen kod yerine doğrulanmış 403 — 403 istisnası yok; neden POZITIF-BEKLENMEYEN-YANIT×9); çıkış 2 (3 DEĞİL). Çıktı bunu "ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilir" diye adlandırır', () => {
      const r = U1.ev.rows; const ok = is(U1, 2, 'P/O/O/F') && r.length === VEC.all.length && r.every((x) => x.status === 403) && rc(U1, 'edgeBlocking', 'TEKDUZE-403') === 1 && rc(U1, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === VEC.allow.length && rc(U1, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && rc(U1, 'edgeBlocking', NOEV) === 0
        && reasonNames(U1, 'positiveControl') === `POZITIF-BEKLENMEYEN-YANIT×${VEC.allow.length}` && U1.ev.findings.length === VEC.allow.length && V(U1).httpReject.reasons.length === 0 && JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny) && S1.code === 3
        && /^D8-HTTP-RET=PASS$/m.test(U1.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(U1.log) && /^D8-POZITIF-KONTROL=FAIL$/m.test(U1.log) && /^D8-CIKIS=2$/m.test(U1.log) && /ölçüt ihlali \/ bulgu adayı; nedeni ayrı değerlendirilir/.test(U1.log) && !/kusur/i.test(U1.log);
      return { ok, obs: brief(U1) + ` [pozitif: ${reasonNames(U1, 'positiveControl')}] · 403=${r.filter((x) => x.status === 403).length}/${r.length} · ret vektörü sayıları S1 ile aynı=${JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny)}` };
    });
    const U2a = await scenario('uni404', { tag: 'u2a' }); const U2b = await scenario('uni301', { tag: 'u2b' }); const U2c = await scenario('uni401', { tag: 'u2c' });
    const U2d = await scenario('uni404stamp', { tag: 'u2d' }); const U2e = await scenario('uni404reflect', { tag: 'u2e' }); const U2f = await scenario('uni404drop', { tag: 'u2f' });
    item('U-2', 'SUNULMAYAN AD (pozitifler dahil bütün istekler aynı 403 dışı kodu aldı): (a) 68/68 başlıksız 404 · (b) 68/68 301 (hedef kanıta yazılmaz) · (c) 68/68 başlıksız 401 · (d) 68/68 404, her yanıtta katmanın kendi kimliği (damga) · (e) 68/68 404, her yanıtta isteğin kimliği yansıtılmış · (f) 67 × 404 + bir taşıma hatası → altısında da durum kodu ölçütü FAIL (59 ret vektörüne doğrulanmış 403 dışı yanıt; "ölçülemedi" DEĞİL), kenar engelleme OLCULEMEYEN (FAIL değil — API\'ye ulaşma kanıtı yok; PASS değil), katman doğrulaması OLCULEMEYEN, hiçbir satır UYGULAMA-API değil; çıkış 2. Pozitif kontrol ayrı kayıttır (beklenen dışındaki doğrulanmış her pozitif yanıt — 403 dahil — ölçüt ihlali / bulgu adayıdır)', () => {
      const uni = (S, st, cal, nPos) => is(S, 2, 'F/O/O/F') && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === rowsOf(S, 'deny').filter((x) => x.status !== 0).length && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 0 && rc(S, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === nPos
        && S.ev.calibration.result === cal && S.ev.rows.length === VEC.all.length && S.ev.rows.filter((x) => x.status !== 0).every((x) => x.status === st && x.layerId !== 'UYGULAMA-API') && S.gt.filter((s) => s.status !== 0).every((s) => s.producer === 'edge' && s.status === st) && /^D8-HTTP-RET=FAIL$/m.test(S.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(S.log) && /^D8-CIKIS=2$/m.test(S.log);
      const txt = U2b.evBytes.toString('utf8') + U2b.sumBytes.toString('utf8') + U2b.log; const NA = VEC.allow.length;
      const ok = uni(U2a, 404, 'YOK', NA) && U2a.ev.rows.every((x) => x.idObs === 'YOK') && rc(U2a, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === VEC.deny.length
        && uni(U2b, 301, 'YOK', NA) && rowsOf(U2b, 'deny').every((x) => x.outcome === 'YONLENDIRME-3XX') && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli')
        && uni(U2c, 401, 'YOK', 3) && rowsOf(U2c, 'allow').filter((x) => x.statusExpected).length === 6 && U2c.ev.calibration.apiWriteBack === 0 && U2c.ev.calibration.apiReplace === 0
        && uni(U2d, 404, 'GECERSIZ', NA) && U2d.gt.every((s) => s.echoed === 'other') && U2d.ev.calibration.apiEvidenceUsable === false && rowsOf(U2d, 'deny').every((x) => x.idSignal === 'DEGISTIRME' && x.layerId === 'OLCULEMEYEN')
        && uni(U2e, 404, 'GECERSIZ', NA) && U2e.ev.rows.every((x) => x.idObs === 'AYNEN' && x.layerId === 'OLCULEMEYEN') && U2e.gt.every((s) => s.echoed === 'same')
        && uni(U2f, 404, 'YOK', NA) && rc(U2f, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && U2f.ev.rows.filter((x) => x.status === 0).length === 1 && U2f.gt.filter((s) => s.producer === 'drop').length === 1
        && U1.code === 2 && V(U1).httpReject.value === 'PASS';
      return { ok, obs: `404: ${brief(U2a)} || 301: çıkış=${U2b.code} || 401: çıkış=${U2c.code}, pozitif=${V(U2c).positiveControl.value} [${reasonNames(U2c, 'positiveControl')}] || damgalı 404: çıkış=${U2d.code}, kalibrasyon=${U2d.ev.calibration.result} || yansıtılmış 404: çıkış=${U2e.code}, kalibrasyon=${U2e.ev.calibration.result} || 404 + taşıma hatası: çıkış=${U2f.code} [${reasonNames(U2f, 'httpReject')}]` };
    });
    const U3a = await scenario('uni200', { tag: 'u3a' }); const U3b = await scenario('pos404web', { tag: 'u3b' }); const U3c = await scenario('pos404all', { tag: 'u3c' }); const U3d = await scenario('uni404echo1', { tag: 'u3d' }); const U3e = await scenario('uni404one403', { tag: 'u3e' });
    item('U-3', 'tekdüze yanıtın KARDEŞ dalları: (a) 68/68 200 → ret vektörleri hiç reddedilmedi: HTTP / ret FAIL ve kenar engelleme FAIL (2xx ×59; API kanıtı aranmaz) + pozitif kontrol FAIL (token\'sız 200 ×6) · (b) yalnız üç web pozitifi 404, ret vektörleri 403 → HTTP / ret PASS, pozitif kontrol FAIL ×3, kenar engelleme OLCULEMEYEN · (c) dokuz pozitifin hepsi 404, ret vektörleri 403 → pozitif kontrol FAIL ×9 · (d) 68/68 404 ama bir ret yanıtını API üretmiş (değiştirme kanıtı; kalibrasyon YOK — API pozitiflerinde değiştirme 0/3) → kenar engelleme FAIL (eksik kalibrasyon kanıtı silmez); katman doğrulaması OLCULEMEYEN (koşumun kalibrasyonu "değiştirme" davranışını göstermedi — A-5) · (e) 67 × 404 + bir ret vektörü 403 → HTTP / ret FAIL ×58; beşinde de çıkış 2', () => {
      const NA = VEC.allow.length; const ND = VEC.deny.length; const apiD = J(U3d).filter((p) => p.gt.producer === 'api');
      const ok = is(U3a, 2, 'F/F/O/F') && U3a.ev.rows.every((x) => x.status === 200) && rc(U3a, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === ND && rc(U3a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(U3a, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 6
        && is(U3b, 2, 'P/O/O/F') && rc(U3b, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 3 && V(U3b).positiveControl.reasons.length === 1 && rowsOf(U3b, 'deny').every((x) => x.outcome === 'RET-403') && U3b.ev.calibration.result === 'VAR' && U3b.ev.findings.length === 3 && rc(U3b, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === 3
        && is(U3c, 2, 'P/O/O/F') && rc(U3c, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === NA && rowsOf(U3c, 'deny').every((x) => x.status === 403) && rowsOf(U3c, 'allow').every((x) => x.status === 404 && x.idObs === 'YOK')
        && is(U3d, 2, 'F/F/O/F') && U3d.ev.rows.every((x) => x.status === 404) && apiD.length === 1 && apiD[0].gt.apiWrote === 'YENI' && apiD[0].row.layerId === 'UYGULAMA-API' && rc(U3d, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && U3d.ev.calibration.result === 'YOK' && U3d.ev.calibration.apiReplace === 0 && rc(U3d, 'layerVerification', UNSUP) === 1 && rc(U3d, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === NA
        && is(U3e, 2, 'F/O/O/F') && rc(U3e, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === ND - 1 && U3e.ev.rows.filter((x) => x.status === 403).length === 1 && U2a.code === 2;
      return { ok, obs: `200: ${brief(U3a)} || web pozitifleri 404: ${brief(U3b)} || bütün pozitifler 404: çıkış=${U3c.code} || 404 + bir API kanıtlı yanıt: ${brief(U3d)} || 404 + bir 403: çıkış=${U3e.code}` };
    });

    // ── Pozitif kontrol — API'ye geçmesine izin verilen yollar ayrı kayıttır ──
    const P1 = await scenario('pos200', { tag: 'p1' });
    item('P-1', 'pozitif vektörde beklenmeyen yanıt (token\'sız GET → 200): pozitif kontrol FAIL (ölçüt ihlali / bulgu adayı), çıkış 2; ret vektörlerinin hepsi 403 olduğu için HTTP / ret PASS kalır — pozitif bulgu ret alanlarına KARIŞMAZ (kenar engelleme FAIL değil; pozitifler beklendiği gibi olmadığından OLCULEMEYEN)', () => {
      const bad = rowsOf(P1, 'allow').filter((x) => !x.statusExpected); const ok = is(P1, 2, 'P/O/O/F') && bad.length === 1 && bad[0].status === 200 && rc(P1, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && rowsOf(P1, 'deny').every((x) => x.status === 403) && P1.ev.findings.length === 1 && rc(P1, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 0 && rc(P1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && V(P1).httpReject.reasons.length === 0;
      return { ok, obs: brief(P1) + ` · beklenmeyen pozitif=${bad.length}` };
    });
    const tmoEnv = Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env);
    const P2a = await scenario('mix2xxdrop', { tag: 'p2a' }); const P2b = await scenario('mix401hang', { tag: 'p2b', env: tmoEnv }); const P2c = await scenario('mixpos200drop', { tag: 'p2c' });
    item('P-2', 'ÖNCELİK — FAIL, ölçülemeyenin önündedir (çıkış 2); ölçülemeyen nedenler kayıtta kalır: (a) bir ret vektörü 200 (API üretti) + başka bir ret vektöründe bağlantı koptu → HTTP / ret FAIL ve kenar engelleme FAIL · (b) ret vektöründe API\'nin 401\'i + başka bir istek yanıtsız kaldı (zaman aşımı) → aynı · (c) pozitifte token\'sız 200 + bir ret vektöründe bağlantı koptu → pozitif kontrol FAIL, HTTP / ret OLCULEMEYEN (FAIL değil: doğrulanmış 403 dışı ret yanıtı yok); hata sınıfı (a, c) BAGLANTI · (b) ZAMAN-ASIMI; hata iletisi kanıtta yok', () => {
      const lost = (S, kind, cls) => { const j = J(S).filter((p) => p.gt.producer === kind); return j.length === 1 && j[0].row.status === 0 && j[0].row.outcome === 'SONUC-YOK' && j[0].row.errorClass === cls && j[0].row.layerId === 'SONUC-YOK' && rc(S, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && rc(S, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1 && S.sum.errorClassCounts[cls] === 1 && !('error' in j[0].row); };
      const txt = [P2a, P2b, P2c].map((S) => S.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S.sumBytes.toString('utf8')).join('');
      const ok = is(P2a, 2, 'F/F/F/P') && rc(P2a, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 1 && rc(P2a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && lost(P2a, 'drop', 'BAGLANTI')
        && is(P2b, 2, 'F/F/F/P') && rc(P2b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && lost(P2b, 'hang', 'ZAMAN-ASIMI')
        && is(P2c, 2, 'O/O/O/F') && rc(P2c, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && lost(P2c, 'drop', 'BAGLANTI') && !/ECONNRESET|socket hang up|zaman aşımı|localhost|127\.0\.0\.1/i.test(txt);
      return { ok, obs: `2xx+kopma: ${brief(P2a)} || API 401+zaman aşımı: ${brief(P2b)} || pozitif 200+kopma: ${brief(P2c)}` };
    });
    const P3a = await scenario('pos403web', { tag: 'p3a' }); const P3b = await scenario('pos403api', { tag: 'p3b' });
    item('P-3', 'TEK bir pozitif vektör 403 aldı (tekdüze değil; ret vektörlerinin hepsi 403): (a) bir web pozitifi · (b) bir API pozitifi → ikisinde de POZİTİF KONTROL FAIL (neden POZITIF-BEKLENMEYEN-YANIT×1; 403 istisnası YOK — izinli yolda beklenen kod yerine doğrulanmış başka bir HTTP yanıtı), çıkış 2 (3 DEĞİL); o satır FAIL nedeni taşıyan satırlar listesinde; çıktı "ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilir" der ("kusur" demez); kenar engelleme OLCULEMEYEN (TEKDUZE-403 nedeni yok), HTTP / ret PASS; (a)\'da kalibrasyon VAR kalır, (b)\'de o pozitif başlıksız olduğundan YOK', () => {
      const one = (S) => { const bad = rowsOf(S, 'allow').filter((x) => !x.statusExpected); return is(S, 2, 'P/O/O/F') && reasonNames(S, 'positiveControl') === 'POZITIF-BEKLENMEYEN-YANIT×1' && bad.length === 1 && bad[0].status === 403 && bad[0].outcome === 'RET-403' && rc(S, 'edgeBlocking', 'TEKDUZE-403') === 0 && rc(S, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === 1
        && rowsOf(S, 'deny').every((x) => x.status === 403) && rowsOf(S, 'allow').filter((x) => x.status === 403).length === 1 && S.ev.findings.length === 1 && /^allow /.test(S.ev.findings[0]) && V(S).httpReject.reasons.length === 0
        && /^D8-POZITIF-KONTROL=FAIL$/m.test(S.log) && /^D8-CIKIS=2$/m.test(S.log) && /ölçüt ihlali \/ bulgu adayı; nedeni ayrı değerlendirilir/.test(S.log) && !/kusur/i.test(S.log) && !/POZITIF-REDDEDILDI/.test(S.log + S.evBytes.toString('utf8')); };
      return { ok: one(P3a) && one(P3b) && P3a.ev.calibration.result === 'VAR' && V(P3a).edgeBlocking.reasons.length === 1 && P3b.ev.calibration.result === 'YOK' && P3b.ev.calibration.apiReplace === 2, obs: `web: ${brief(P3a)} [pozitif: ${reasonNames(P3a, 'positiveControl')}] || API: ${brief(P3b)} [pozitif: ${reasonNames(P3b, 'positiveControl')}]` };
    });
    const P7 = await scenario('pos403allapi', { tag: 'p7' });
    item('P-7', 'POZİTİF 403 — üç girdi, tek hüküm; yanıtsız pozitif AYRI: (a) DOKUZ pozitifin hepsi 403 ve API pozitiflerindeki 403\'ü API üretti (zemin gerçeği: altı yanıtı API yazdı, kimlik başlığıyla; kalibrasyon VAR; web pozitiflerini kenar reddetti; ret vektörleri sağlıklı) → pozitif kontrol FAIL ×9, çıkış 2 · (b) tekdüze 403 (U-1: 68 yanıtın hepsini kenar üretti; kalibrasyon YOK) → pozitif kontrol FAIL ×9, çıkış 2 · (c) tek pozitif 403 (P-3) → FAIL ×1 · (d) YANITSIZ pozitif (K-10: bağlantı koptu) → OLCULEMEYEN, çıkış 3 — FAIL değil. (a) ve (b)\'de durum kodları AYNI (68 × 403), hüküm AYNI; hüküm yanıtı hangi katmanın ürettiğine bağlı değil. Pozitifteki API kanıtı ret alanlarına karışmaz (kenar engelleme FAIL değil)', () => {
      const j = J(P7).filter((p) => p.row.group === 'allow'); const api = j.filter((p) => p.gt.producer === 'api'); const edgeP = j.filter((p) => p.gt.producer === 'edge'); const NA = VEC.allow.length;
      const ok = is(P7, 2, 'P/O/O/F') && j.length === NA && api.length === 6 && edgeP.length === 3 && j.every((p) => p.gt.status === 403 && p.row.status === 403 && p.row.statusExpected === false) && api.every((p) => p.gt.apiWrote && p.gt.echoed !== 'none')
        && reasonNames(P7, 'positiveControl') === `POZITIF-BEKLENMEYEN-YANIT×${NA}` && P7.ev.calibration.result === 'VAR' && P7.ev.calibration.apiWriteBack === 3 && P7.ev.calibration.apiReplace === 3 && P7.ev.findings.length === NA
        && rc(P7, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && V(P7).edgeBlocking.value === 'OLCULEMEYEN' && V(P7).layerVerification.coverage.provenApi === 0 && rowsOf(P7, 'deny').every((x) => x.status === 403 && x.idObs === 'YOK') && J(P7).filter((p) => p.row.group === 'deny').every((p) => p.gt.producer === 'edge')
        && is(U1, 2, 'P/O/O/F') && reasonNames(U1, 'positiveControl') === `POZITIF-BEKLENMEYEN-YANIT×${NA}` && U1.ev.calibration.result === 'YOK' && U1.gt.every((s) => s.producer === 'edge')
        && P7.ev.rows.map((x) => x.status).join() === U1.ev.rows.map((x) => x.status).join() && vals(P7).join() === vals(U1).join() && P7.code === U1.code
        && is(P3a, 2, 'P/O/O/F') && reasonNames(P3a, 'positiveControl') === 'POZITIF-BEKLENMEYEN-YANIT×1'
        && is(K10, 3, 'P/O/O/O') && reasonNames(K10, 'positiveControl') === 'POZITIF-YANITSIZ×1';
      return { ok, obs: `bütün pozitifler 403 (API üretti ${api.length}, kenar ${edgeP.length}): ${brief(P7)} [pozitif: ${reasonNames(P7, 'positiveControl')}] || tekdüze 403: çıkış=${U1.code}, pozitif=${V(U1).positiveControl.value} [${reasonNames(U1, 'positiveControl')}], kalibrasyon=${U1.ev.calibration.result} || tek pozitif 403: çıkış=${P3a.code}, pozitif=${V(P3a).positiveControl.value} || yanıtsız pozitif: çıkış=${K10.code}, pozitif=${V(K10).positiveControl.value} [${reasonNames(K10, 'positiveControl')}]` };
    });
    const P4a = await scenario('pos5xxweb', { tag: 'p4a' }); const P4b = await scenario('pos5xxapi', { tag: 'p4b' }); const P4c = await scenario('pos429api', { tag: 'p4c' }); const P4d = await scenario('pos600web', { tag: 'p4d' });
    item('P-4', 'pozitif vektörde beklenen dışındaki DOĞRULANMIŞ yanıt — API\'den geldiği KANITSIZ olsa da (yanıtı kenar üretti; kimlik başlığı yok) — ölçüt ihlalidir / bulgu adayıdır (ret vektörlerinin hepsi 403; HTTP / ret PASS kalır): (a) bir web pozitifinde 502 · (b) bir API pozitifinde 502 · (c) bir API pozitifinde 429 · (d) bir web pozitifinde hiçbir sınıfa girmeyen kod (600) → dördünde de pozitif kontrol FAIL (neden POZITIF-BEKLENMEYEN-YANIT×1; tek neden), çıkış 2 — "kanıtsız 5xx / 429 → ölçülemeyen" ayrımı YOK. Ölçülemeyen kalan TEK durum yanıt alınamamasıdır (K-10 → OLCULEMEYEN); reddedilen pozitif (403) da aynı kuralla FAIL\'dir (P-3, P-7)', () => {
      const one = (S, st, cls) => { const bad = J(S).filter((p) => p.row.group === 'allow' && !p.row.statusExpected); return is(S, 2, 'P/O/O/F') && bad.length === 1 && bad[0].gt.producer === 'edge' && bad[0].gt.status === st && bad[0].row.status === st && bad[0].row.outcome === cls && bad[0].row.idObs === 'YOK' && bad[0].row.layerId !== 'UYGULAMA-API'
        && reasonNames(S, 'positiveControl') === 'POZITIF-BEKLENMEYEN-YANIT×1' && rowsOf(S, 'deny').every((x) => x.status === 403) && V(S).httpReject.reasons.length === 0 && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && S.ev.findings.length === 1; };
      const ok = one(P4a, 502, 'SUNUCU-HATASI-5XX') && one(P4b, 502, 'SUNUCU-HATASI-5XX') && one(P4c, 429, 'HIZ-SINIRI-429') && one(P4d, 600, 'SINIFLANAMADI') && P4a.ev.calibration.result === 'VAR' && P1.code === 2
        && K10.code === 3 && V(K10).positiveControl.value === 'OLCULEMEYEN' && P3a.code === 2 && V(P3a).positiveControl.value === 'FAIL';
      return { ok, obs: `web 502: ${brief(P4a)} [${reasonNames(P4a, 'positiveControl')}] || API 502: çıkış=${P4b.code}, pozitif=${V(P4b).positiveControl.value} [${reasonNames(P4b, 'positiveControl')}] || API 429: çıkış=${P4c.code}, pozitif=${V(P4c).positiveControl.value} || web 600: çıkış=${P4d.code}, pozitif=${V(P4d).positiveControl.value} · yanıtsız (K-10) pozitif=${V(K10).positiveControl.value} · reddedildi (P-3) pozitif=${V(P3a).positiveControl.value}` };
    });
    const P6 = {}; for (const st of [503, 429]) for (const o of ['a', 'b']) P6[st + o] = await scenario('posapi' + st + o, { tag: 'p6-' + st + o });
    item('P-6', 'POZİTİF KONTROL TEK KURAL — iki sıra paritesi: API\'nin İZİNLİ bir yolda ürettiği beklenmeyen yanıt (503 · 429; ara katman kimlik başlığıyla; zemin gerçeği: iki yanıtı da API üretti), (a) GECERLI-BICIM gönderilen pozitifte (API kimliği AYNEN yazar; satır OLCULEMEYEN / ayırt etmeyen gözlem) ve (b) GECERSIZ-BICIM gönderilen pozitifte (API YENİ kimlik üretir; satır UYGULAMA-API) → iki sırada AYNI hüküm: pozitif kontrol FAIL (neden POZITIF-BEKLENMEYEN-YANIT×1), çıkış 2; dört alanın değerleri ve nedenleri iki sırada birebir aynı — pozitif kontrol gönderilen kimlik biçimine ve satırın katman kimliğine BAĞLI DEĞİL; pozitifteki API kanıtı ret alanlarına karışmaz (kenar engelleme FAIL değil, katman kapsamında API kanıtlı ret satırı 0)', () => {
      const bad = (S) => J(S).filter((p) => p.row.group === 'allow' && !p.row.statusExpected);
      const one = (S, st, form) => { const b = bad(S); const valid = form === 'GECERLI-BICIM'; return is(S, 2, 'P/O/O/F') && b.length === 1 && b[0].gt.producer === 'api' && b[0].gt.status === st && b[0].row.status === st && b[0].row.vectorClass === 'POZITIF-API' && b[0].row.sent.requestIdForm === form && b[0].gt.ridOk === valid && b[0].gt.apiWrote === (valid ? 'AYNEN' : 'YENI')
        && b[0].row.idSignal === (valid ? 'AYNEN-GERI-YAZMA' : 'DEGISTIRME') && b[0].row.layerId === (valid ? 'OLCULEMEYEN' : 'UYGULAMA-API') && reasonNames(S, 'positiveControl') === 'POZITIF-BEKLENMEYEN-YANIT×1' && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && V(S).layerVerification.coverage.provenApi === 0
        && rowsOf(S, 'deny').every((x) => x.status === 403) && S.ev.calibration.result === 'VAR' && S.ev.findings.length === 1; };
      const pair = (st) => { const a = P6[st + 'a']; const b = P6[st + 'b']; return one(a, st, 'GECERLI-BICIM') && one(b, st, 'GECERSIZ-BICIM') && a.code === b.code && vals(a).join() === vals(b).join() && FIELDS.every((f) => reasonNames(a, f) === reasonNames(b, f)); };
      const show = (st) => `${st}: geçerli biçim → çıkış=${P6[st + 'a'].code}, pozitif=${V(P6[st + 'a']).positiveControl.value} [${reasonNames(P6[st + 'a'], 'positiveControl')}] · geçersiz biçim → çıkış=${P6[st + 'b'].code}, pozitif=${V(P6[st + 'b']).positiveControl.value} [${reasonNames(P6[st + 'b'], 'positiveControl')}]`;
      return { ok: pair(503) && pair(429), obs: show(503) + ' || ' + show(429) };
    });
    const P5a = await scenario('pos302web', { tag: 'p5a' });
    item('P-5', 'WEB pozitifinde beklenmeyen yanıt (tekdüze değil; ret vektörlerinin hepsi 403, kalibrasyon VAR): (a) bir web pozitifi 302 + Location · (b) üç web pozitifi 404 (U-3b girdisi) → ikisinde de pozitif kontrol FAIL, çıkış 2 — pozitif bulgu yalnız API pozitifine özgü değildir; yönlendirme hedefi kanıta yazılmaz (P-1: API pozitifinde token\'sız 200)', () => {
      const bad = rowsOf(P5a, 'allow').filter((x) => !x.statusExpected); const bad404 = rowsOf(U3b, 'allow').filter((x) => !x.statusExpected); const txt = P5a.evBytes.toString('utf8') + P5a.sumBytes.toString('utf8') + P5a.log;
      const ok = is(P5a, 2, 'P/O/O/F') && bad.length === 1 && bad[0].status === 302 && bad[0].vectorClass === 'POZITIF-WEB' && bad[0].outcome === 'YONLENDIRME-3XX' && bad[0].idObs === 'YOK' && rc(P5a, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && V(P5a).positiveControl.reasons.length === 1
        && rowsOf(P5a, 'deny').every((x) => x.outcome === 'RET-403') && P5a.ev.calibration.result === 'VAR' && P5a.ev.findings.length === 1 && P5a.gt.length === VEC.all.length && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli')
        && U3b.code === 2 && bad404.length === 3 && bad404.every((x) => x.status === 404 && x.vectorClass === 'POZITIF-WEB' && x.outcome === 'DORTYUZ-403-DISI') && P1.code === 2;
      return { ok, obs: `302: ${brief(P5a)} · beklenmeyen web pozitifi=${bad.length} || 404: çıkış=${U3b.code}, beklenmeyen web pozitifi=${bad404.length}` };
    });
    const G1 = await scenario('passall', { tag: 'g1' });
    item('G-1', 'zemin gerçeği (kenar HER isteği arka uca geçirir): API\'nin ara katmanıyla işlediği HER ret yanıtı (GECERSIZ-BICIM → yeni kimlik) UYGULAMA-API — yol sınıfından bağımsız (ör. büyük harfli önek); API\'nin BAŞLIKSIZ ürettiği yanıtlar (ön uçuş, çift eğik çizgi, çözülemeyen yüzde dizisi) OLCULEMEYEN — hiçbiri "API değil" diye sınıflanmaz; web\'in ürettiği yanıtlar OLCULEMEYEN (WEB-YOLU); API pozitiflerinde GECERLI-BICIM → OLCULEMEYEN (ayırt etmeyen gözlem), GECERSIZ-BICIM → UYGULAMA-API', () => {
      const j = J(G1); const apiH = j.filter((p) => p.gt.producer === 'api' && p.gt.apiWrote); const apiN = j.filter((p) => p.gt.producer === 'api' && !p.gt.apiWrote); const web = j.filter((p) => p.gt.producer === 'web');
      const wrong = j.filter((p) => !LAYER_ID_SET.includes(p.row.layerId));
      const ok = is(G1, 2, 'F/F/F/P') && G1.ev.calibration.result === 'VAR' && apiH.length > 0 && apiH.filter((p) => p.row.group === 'deny').every((p) => p.gt.apiWrote === 'YENI' && p.row.layerId === 'UYGULAMA-API') && apiH.some((p) => p.row.group === 'deny' && p.row.pathClass !== 'API-KESIN')
        && apiH.filter((p) => p.row.group === 'allow').every((p) => (p.gt.apiWrote === 'AYNEN' ? p.row.layerWhy === 'AYIRT-ETMEYEN-GOZLEM' : p.row.layerId === 'UYGULAMA-API'))
        && apiN.length > 0 && apiN.some((p) => p.row.method !== 'OPTIONS' && p.gt.apiMw === 'ESLESMEZ') && apiN.some((p) => p.gt.apiMw === 'COZME-HATASI') && apiN.some((p) => p.gt.apiMw === 'CORS')
        && apiN.every((p) => p.row.layerId === 'OLCULEMEYEN') && web.length > 0 && web.every((p) => p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'WEB-YOLU') && wrong.length === 0 && apiH.length + apiN.length + web.length === j.length;
      return { ok, obs: brief(G1) + ` · API başlıklı=${apiH.length} (kesin olmayan yolda ${apiH.filter((p) => p.row.pathClass !== 'API-KESIN').length}) · API başlıksız=${apiN.length} [${apiN.map((p) => p.gt.apiMw).join(',')}] · web=${web.length} · API yanıtına "API değil" denen=${wrong.length}` };
    });

    // ── Kapılar ──
    const mk = (o) => { const a = []; if (o.alias !== null) a.push('--alias', o.alias === undefined ? 'AD-1' : o.alias); if (o.vantage !== null) a.push('--vantage', o.vantage === undefined ? 'oz-test-yerel' : o.vantage); a.push('--origin', o.origin || ORIGIN); if (o.out !== null) a.push('--out', o.out || gateOut()); return a.concat(o.extra || []); };
    const badAliases = [null, 'AD-0', 'ad-1', 'AD-01', 'AD-1x', 'AD1', 'AD-1000', 'localhost']; const n1 = [];
    for (const al of badAliases) { const out = gateOut(); const g = await gate(mk({ alias: al, out })); n1.push({ al, code: g.code, seen: g.seen, wrote: fs.existsSync(out) }); }
    item('N-1', 'ad kimliği kapısı: --alias yok ya da AD-<n> biçiminde değil (AD-0, ad-1, AD-01, AD-1x, AD1, AD-1000, ana makine adı) → çıkış 4, kenara HİÇ istek gitmez, kanıt yazılmaz; geçerli ad kimliği (AD-27, tam kapsam yetkisi kaydıyla) ham kanıta ve adsız özete AYNEN yazılır', () => ({
      ok: n1.length === 8 && n1.every((x) => x.code === 4 && x.seen === 0 && !x.wrote) && S1b.code === 3 && S1b.gt.length === VEC.all.length && S1b.ev.nameAlias === 'AD-27' && S1b.sum.nameAlias === 'AD-27' && /^D8-AD=AD-27$/m.test(S1b.log) && S1.ev.nameAlias === 'AD-1',
      obs: n1.map((x) => `${x.al === null ? '(yok)' : x.al}→${x.code}/${x.seen}`).join(' · ') + ` · AD-27 koşumu çıkış=${S1b.code}, kanıt=${S1b.ev && S1b.ev.nameAlias}` }));
    const n2a = await gate(mk({ extra: ['--origin', ORIGIN] })); const n2b = await gate(mk({ extra: ['--alias', 'AD-2'] })); const n2c = await gate(mk({ origin: 'https://' + ['sahte-ad', 'sahte-deger'].join(':') + `@localhost:${PORT}` })); // gerçek kimlik değil; "origin içinde kimlik bölümü" girdisi
    const n2d = await gate(mk({ alias: 'AD-2', extra: scopeArgs('AD-2').concat(scopeArgs('AD-2')) }));
    item('N-2', 'tek süreç = tek ad: ikinci --origin, ikinci --alias ya da ikinci --scope-record → çıkış 4, istek yok (çok adlı koşum parametresi yok); origin içinde kimlik bilgisi → çıkış 4', () => ({ ok: [n2a, n2b, n2c, n2d].every((g) => g.code === 4 && g.seen === 0), obs: `iki origin→${n2a.code}/${n2a.seen} · iki alias→${n2b.code}/${n2b.seen} · kimlikli origin→${n2c.code}/${n2c.seen} · iki kapsam kaydı→${n2d.code}/${n2d.seen}` }));
    const n3 = []; for (const va of [null, 'Canli Makine', 'x', 'a_b', `localhost:${PORT}`, 'a'.repeat(41)]) { const g = await gate(mk({ vantage: va })); n3.push({ va, code: g.code, seen: g.seen }); }
    item('N-3', 'konum etiketi kapısı: --vantage yok ya da biçime uymuyor (boşluk / büyük harf, tek karakter, alt çizgi, iki nokta, 41 karakter) → çıkış 4, istek yok; geçerli etiket ham kanıta ve özete beyan olarak yazılır', () => ({ ok: n3.length === 6 && n3.every((x) => x.code === 4 && x.seen === 0) && S1.ev.vantage === 'oz-test-yerel' && S1.sum.vantage === 'oz-test-yerel', obs: n3.map((x) => `${x.va === null ? '(yok)' : (x.va.length > 20 ? x.va.length + ' karakter' : x.va)}→${x.code}/${x.seen}`).join(' · ') }));
    const exOut = gateOut(); fs.writeFileSync(exOut, 'BASKA-ADIN-KANITI'); const n4a = await gate(mk({ out: exOut }));
    const exOut2 = gateOut(); fs.writeFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'BASKA-ADIN-OZETI'); const n4b = await gate(mk({ out: exOut2 }));
    item('N-4', 'var olan kanıt ya da özet dosyasının ÜZERİNE YAZMAZ (bir adın sonucu başka bir adın dosyasına taşınmaz): --out mevcut dosya → çıkış 4, istek yok, dosya içeriği aynı; özet yolu mevcut → çıkış 4, istek yok, ham kanıt da yazılmaz', () => ({
      ok: n4a.code === 4 && n4a.seen === 0 && fs.readFileSync(exOut, 'utf8') === 'BASKA-ADIN-KANITI' && n4b.code === 4 && n4b.seen === 0 && !fs.existsSync(exOut2) && fs.readFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'utf8') === 'BASKA-ADIN-OZETI',
      obs: `kanıt var→${n4a.code}/${n4a.seen} · özet var→${n4b.code}/${n4b.seen}` }));
    const o1out = gateOut(); const o1 = await gate(mk({ vantage: 'localhost-cikisi', out: o1out }));
    item('O-1', 'adsız özet kapısı: owner etiketi ana makine adını içeriyorsa (konum etiketi "localhost-cikisi", ad "localhost") sonda kapalı biçimde durur → çıkış 4, kenara HİÇ istek gitmez, kanıt ve özet yazılmaz', () => ({ ok: o1.code === 4 && o1.seen === 0 && !fs.existsSync(o1out) && !fs.existsSync(o1out.replace(/\.json$/, '.ozet.json')), obs: `çıkış=${o1.code} · istek=${o1.seen}` }));
    // O-1b — çok etiketli (çözülmeyen, ayrılmış .invalid) ad: ön denetim ağdan ÖNCEDİR; ağ gerektirmemesi için telefon listesi kipinde
    // ölçülür (ön denetim iki kipte de AYNI satırdır). Karşı girdi: adın hiçbir etiketini içermeyen etiket kapıdan geçer.
    const mlOrigin = 'https://portal.ornek-buro.invalid'; const o1b = [];
    for (const va of ['ornek-buro-cikisi', 'ornekburo-cikis', 'portal-ornek-buro-invalid-cikisi', 'x-portal-y', 'PORTAL.ORNEK-BURO.INVALID', 'oz-test-yerel']) { const g = await gate(['--alias', 'AD-1', '--origin', mlOrigin, '--vantage', va, '--phone-list']); o1b.push({ va, code: g.code, rej: /REDDEDİLDİ: konum etiketi/.test(g.log), list: (g.log.match(/^\s+\d\. https:\/\//gm) || []).length }); }
    item('O-1b', 'konum etiketinde adın PARÇASI (çok etiketli ad portal.ornek-buro.invalid; istek atılmaz): etiket adın bir etiketini (ornek-buro), tiresiz türevini (ornekburo), noktası tireye çevrilmiş tam adı, tek bir etiketini (portal) ya da tam adı içeriyorsa sonda durur → çıkış 4; adın hiçbir etiketini içermeyen etiket (oz-test-yerel) kapıdan geçer (çıkış 0, liste yazılır) — denetim yalnız tam dizgiyi değil etiketleri de arar', () => {
      const bad = o1b.slice(0, 5); const good = o1b[5];
      return { ok: o1b.length === 6 && bad.every((x) => x.code === 4 && x.rej && x.list === 0) && good.code === 0 && !good.rej && good.list === 5, obs: o1b.map((x) => `${x.va}→${x.code}`).join(' · ') };
    });
    const s5a = await gate(['--alias', 'AD-1', '--vantage', 'oz-test-yerel', '--origin', 'http://localhost:1', '--out', gateOut()]);
    item('S5-a', 'http origin → 4', () => ({ ok: s5a.code === 4 && s5a.seen === 0, obs: `çıkış=${s5a.code}` }));
    const s5b = await gate(mk({}), Object.assign({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, env));
    item('S5-b', 'TLS doğrulaması kapalı → 4', () => ({ ok: s5b.code === 4 && s5b.seen === 0, obs: `çıkış=${s5b.code}` }));
    const s5c = await gate(mk({ out: path.join(dir, 'yok', 'x.json') }));
    item('S5-c', 'kanıt yazılamaz (dizin yok) → 7 (ölçüm yapıldı, kanıt yazılamadı)', () => ({ ok: s5c.code === 7 && s5c.seen === VEC.all.length && !fs.existsSync(path.join(dir, 'yok')), obs: `çıkış=${s5c.code} · istek=${s5c.seen}` }));
    const s5d = await gate(mk({ out: null }));
    item('S5-d', '--out yok (ve --phone-list yok) → 4, istek yok', () => ({ ok: s5d.code === 4 && s5d.seen === 0, obs: `çıkış=${s5d.code} · istek=${s5d.seen}` }));
    const s5e = []; for (const t of ['abc', '0', '999999999', '1.5']) { const o = gateOut(); const g = await gate(mk({ out: o }), Object.assign({}, env, { D8_HTTP_TIMEOUT_MS: t })); s5e.push({ t, code: g.code, seen: g.seen, wrote: fs.existsSync(o) }); }
    item('S5-e', 'zaman aşımı ortam değeri (D8_HTTP_TIMEOUT_MS) geçersiz (sayı değil · 0 · sınır dışı · ondalık) → kapı çıkışı 4, istek yok, kanıt yok — sonda beklenmeyen biçimde (çıkış 1) durmaz; geçerli değer (1500) ile koşumlar ölçüm yapar (P-2b, S4)', () => ({
      ok: s5e.length === 4 && s5e.every((x) => x.code === 4 && x.seen === 0 && !x.wrote) && P2b.ev !== null && P2b.ev.rows.length === VEC.all.length, obs: s5e.map((x) => `${x.t}→${x.code}/${x.seen}`).join(' · ') }));
    const s6 = await gate(['--alias', 'AD-1', '--origin', ORIGIN, '--phone-list']); const s6b = await gate(mk({ extra: ['--phone-list'] }));
    item('S6', '--phone-list AYRI çağrıdır: 5 adres + telefon talimatı + "beyan" notu, ad kimliği başlıkta; kenara İSTEK ATMAZ, kanıt yazmaz; --out ile birlikte → çıkış 4; ölçüm koşumu (S1) telefon listesi YAZMAZ', () => ({
      ok: s6.code === 0 && (s6.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /beyan/i.test(s6.log) && /TELEFON — AD-1/.test(s6.log) && s6.seen === 0 && s6b.code === 4 && s6b.seen === 0 && !/TELEFON/.test(S1.log) && !/^\s+\d\. https:\/\//m.test(S1.log),
      obs: `liste çıkış=${s6.code} · adres=${(s6.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${s6.seen} · --out ile→${s6b.code} · S1 çıktısında liste=${/TELEFON/.test(S1.log)}` }));

    // ── KAPSAM YETKİSİ KAPISI (AD-1 dışındaki her ad kimliği) — sentetik kayıt / kanıt dosyalarıyla ──
    /** Kapsam yetkisi denemesi: AD-2 (ya da verilen ad) + verilen kayıt; dönen: çıkış, istek sayısı, ileti satırları, neden sınıfı, kanıt yazıldı mı. */
    const sa = async (rec, o) => { o = o || {}; const out = gateOut(); const extra = o.recordPath ? ['--scope-record', o.recordPath] : (rec === null ? [] : ['--scope-record', (typeof rec === 'string' && fs.existsSync(rec)) ? rec : mkRec(rec)]);
      const g = await gate(mk({ alias: o.alias || 'AD-2', out, extra })); const lines = g.log.split(/\r?\n/).filter(Boolean);
      const rl = /^D8-KAPSAM-YETKISI=RET neden=([A-Z-]+)(?: eksik=([A-Z,-]+))?$/m.exec(g.log) || [];
      return { code: g.code, seen: g.seen, first: lines[0] || '', why: rl[1] || null, missing: rl[2] || null, wrote: fs.existsSync(out) || fs.existsSync(out.replace(/\.json$/, '.ozet.json')), log: g.log, out }; };
    /** RET ölçütü: istek YOK, kanıt YOK, çıkış 4, ilk satır TAM olarak sabit metin, neden sınıfı beklenen; iletide ad / yol / özet değeri yok.
     *  `missing`: iletinin adlandırması beklenen EKSİK kalem türleri (virgüllü; zorunlu kalem sırasıyla). Verilmediyse iletide "eksik=" HİÇ
     *  bulunmamalıdır (eksik kalem yalnız gerçekten eksik olduğunda adlandırılır). */
    const refused = (r, why, missing) => r.code === 4 && r.seen === 0 && !r.wrote && r.first === REFUSAL && r.why === why && r.missing === (missing || null) && /eksik=/.test(r.log) === !!missing && !/localhost|kapsam[\\/]|\.txt|[0-9A-Fa-f]{64}/.test(r.log);
    const flip = (h) => (h[0] === '0' ? '1' : '0') + h.slice(1);
    const sa1 = await sa(null);
    item('SA-1', 'kapsam yetkisi kaydı YOK (AD-2, --scope-record verilmedi; origin ve diğer bütün parametreler geçerli): sonda KOŞMAZ — çıkış 4, kenara HİÇ istek gitmez, kanıt / özet yazılmaz; ileti tam olarak "KOŞULMADI — kapsam yetkisi doğrulanmadı" (+ neden sınıfı KAYIT-YOK); aynı parametrelerle AD-1 kapıya takılmaz (S1 koştu)', () => ({ ok: refused(sa1, 'KAYIT-YOK') && S1.code === 3 && S1.gt.length === VEC.all.length, obs: `çıkış=${sa1.code} · istek=${sa1.seen} · ileti="${sa1.first}" · neden=${sa1.why} · AD-1 (kayıtsız) çıkış=${S1.code}` }));
    const sa2a = await sa(fullRec('AD-2', { items: [itm(T_T, evT)] })); const sa2b = await sa(fullRec('AD-2', { items: [itm(T_T, evT), itm(P_T, evP)] })); const sa2c = await sa(fullRec('AD-2', { items: [itm(T_T, evT), itm(D_T, evD)] })); const sa2d = await sa(fullRec('AD-2', { items: [itm(P_T, evP)] }));
    const sa2e = await sa(fullRec('AD-2', { items: [itm(D_T, evD)] })); const sa2f = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(P_T, evT)] })); const sa2g = await sa(fullRec('AD-2', { items: [itm(D_T, evD), itm(D_T, evT), itm(T_T, evT)] }));
    item('SA-2', 'EKSİK KALEM ADLANDIRILIR (kanıt dosyaları var, özetleri tutuyor, ad kimliği ve ana makine doğru; yedisinde de istek yok): (a) YALNIZ TÜNEL KAYDI → RET (neden YALNIZ-TUNEL-KAYDI) ve iki zorunlu kalem türü de eksik diye yazılır · (b) tünel kaydı + sağlayıcı hesabı kaydı → RET (KALEM-EKSIK), eksik = DNS zinciri · (c) tünel kaydı + DNS zinciri → eksik = sağlayıcı hesabı kaydı · (d) yalnız sağlayıcı hesabı kaydı → eksik = DNS zinciri · (e) yalnız DNS zinciri → eksik = sağlayıcı hesabı kaydı · (f) AYNI türden iki kalem (iki sağlayıcı hesabı kaydı) → eksik = DNS zinciri (kalem sayısı değil TÜR ölçülür) · (g) iki DNS zinciri + tünel kaydı → eksik = sağlayıcı hesabı kaydı: tünel kaydı eksik kalemin yerine geçmez; iletide yalnız eksik olan tür(ler) yazılır — var olan tür, ad, yol, özet değeri yazılmaz', () => {
      const BOTH = P_T + ',' + D_T; const list = [[sa2a, 'YALNIZ-TUNEL-KAYDI', BOTH], [sa2b, 'KALEM-EKSIK', D_T], [sa2c, 'KALEM-EKSIK', P_T], [sa2d, 'KALEM-EKSIK', D_T], [sa2e, 'KALEM-EKSIK', P_T], [sa2f, 'KALEM-EKSIK', D_T], [sa2g, 'KALEM-EKSIK', P_T]];
      return { ok: list.every(([r, why, miss]) => refused(r, why, miss)) && sa1.missing === null && !/eksik=/.test(sa1.log), obs: ['yalnız tünel', 'tünel+sağlayıcı', 'tünel+DNS', 'yalnız sağlayıcı', 'yalnız DNS', 'iki sağlayıcı', 'iki DNS+tünel'].map((n, i) => `${n}→${list[i][0].code}/${list[i][0].seen} ${list[i][0].why} eksik=${list[i][0].missing}`).join(' · ') + ` · kayıt yok→${sa1.why} eksik=${sa1.missing}` };
    });
    const evChanged = mkEv('dns-zinciri-sonradan-degisti.txt', 'SENTETIK (oz-test): DNS zinciri — ilk hali\n'); const recChanged = fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evChanged)] }); fs.writeFileSync(evChanged.file, 'SENTETIK (oz-test): DNS zinciri — kayittan SONRA degistirildi\n');
    const evEmpty = { file: path.join(scopeDir, 'bos-kanit.txt'), sha256: sha(Buffer.alloc(0)) }; fs.writeFileSync(evEmpty.file, '');
    const sa3a = await sa(fullRec('AD-2', { items: [itm(P_T, evP, { sha256: flip(evP.sha256) }), itm(D_T, evD)] })); const sa3b = await sa(recChanged); const sa3c = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, { file: path.join(scopeDir, 'olmayan-dosya.txt'), sha256: evD.sha256 })] }));
    const sa3d = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evEmpty)] })); const sa3e = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evD), itm(T_T, evT, { sha256: flip(evT.sha256) })] }));
    item('SA-3', 'kanıt dosyası ÖLÇÜLÜR ("alan dolu mu" değil): (a) kayıttaki SHA-256 dosyanın özetini tutmuyor (tek onaltılık hane farklı) → RET (OZET-TUTMUYOR) · (b) dosya kayıttan SONRA değiştirilmiş → RET (OZET-TUTMUYOR) · (c) kanıt dosyası yok → RET (KANIT-DOSYASI-YOK) · (d) kanıt dosyası boş (özeti "tutuyor") → RET (KANIT-DOSYASI-BOS) · (e) iki zorunlu kalem tam ama ek tünel kaleminin özeti tutmuyor → yine RET: listelenen HER kalem ölçülür; beşinde de istek yok', () => ({
      ok: refused(sa3a, 'OZET-TUTMUYOR') && refused(sa3b, 'OZET-TUTMUYOR') && refused(sa3c, 'KANIT-DOSYASI-YOK') && refused(sa3d, 'KANIT-DOSYASI-BOS') && refused(sa3e, 'OZET-TUTMUYOR'), obs: `özet farklı→${sa3a.code}/${sa3a.seen} ${sa3a.why} · sonradan değişti→${sa3b.why} · dosya yok→${sa3c.why} · boş dosya→${sa3d.why} · ek kalem özeti→${sa3e.why}` }));
    const sa4 = []; for (const h of ['baska-ad.invalid', 'alt.localhost', 'localhost.', `localhost:${PORT}`, 'xlocalhost', '', null]) sa4.push({ h, r: await sa(fullRec('AD-2', { originHost: h })) });
    item('SA-4', 'ANA MAKİNE BAĞI: kayıttaki ana makine sondanın origin ana makinesiyle BİREBİR aynı değil (başka ad · alt alan · sondaki nokta · port ekli · önek ekli · boş · yok) → yedisinde de RET (ANA-MAKINE-UYUSMUYOR), istek yok — bir adın kaydı başka bir ada (alt alanına bile) taşınamaz', () => ({
      ok: sa4.length === 7 && sa4.every((x) => refused(x.r, 'ANA-MAKINE-UYUSMUYOR')), obs: sa4.map((x) => `${x.h === null ? '(yok)' : (x.h === '' ? '(boş)' : x.h.replace(/localhost/g, '<ad>').replace(String(PORT), '<port>'))}→${x.r.code}/${x.r.seen} ${x.r.why}`).join(' · ') }));
    const sa5a = await sa(fullRec('AD-3')); const sa5b = await sa(recFor['AD-27'] || mkRec(fullRec('AD-27'))); const sa5c = await sa(fullRec('AD-1'));
    item('SA-5', 'AD KİMLİĞİ BAĞI: kayıt başka bir ad kimliği için düzenlenmiş (AD-3 kaydı · AD-27\'nin geçerli kaydı · AD-1 yazan kayıt), sonda AD-2 ile çağrılıyor → üçünde de RET (AD-KIMLIGI-UYUSMUYOR), istek yok — bir ad kimliğinin kaydı başka bir kimlikle kullanılamaz', () => ({
      ok: refused(sa5a, 'AD-KIMLIGI-UYUSMUYOR') && refused(sa5b, 'AD-KIMLIGI-UYUSMUYOR') && refused(sa5c, 'AD-KIMLIGI-UYUSMUYOR'), obs: `AD-3 kaydı→${sa5a.code}/${sa5a.seen} ${sa5a.why} · AD-27 kaydı→${sa5b.why} · AD-1 yazan kayıt→${sa5c.why}` }));
    const SA6 = await scenario('ok', { tag: 'sa6', alias: 'AD-4' }); const recUpper = mkRec(fullRec('AD-5', { originHost: 'LOCALHOST', items: [itm(P_T, evP, { file: path.basename(evP.file) }), itm(D_T, evD, { sha256: evD.sha256.toLowerCase() }), itm(T_T, evT)] })); recFor['AD-5'] = recUpper; const SA6b = await scenario('ok', { tag: 'sa6b', alias: 'AD-5' });
    item('SA-6', 'TAM KAYIT (ad kimliği aynı · ana makine birebir · iki zorunlu kalem: sağlayıcı hesabı kaydı + DNS zinciri; her birinin dosyası var ve özeti tutuyor · tarih geçerli · içerik incelemesi beyanı tam): sonda KOŞAR — 68 istek, sağlıklı kenarda çıkış 3 (S1 ile aynı alanlar); ham kanıtta ve adsız özette kapsam yetkisi YALNIZ beş alan: durum (KAYIT-KABUL-EDILDI) · dosya bütünlüğü (OLCULDU — sondanın ölçtüğü) · içerik incelemesi (BEYAN-VAR — insan beyanı) · kalem türleri · zorunlu mu; kayıt yolu, kanıt dosyası yolu / adı, özet değeri, tarih, inceleyenin adı ve ana makine adı ne ham kanıtın kapsam alanında ne adsız özette ne çıktıda; çıktıda D8-KAPSAM-YETKISI=KAYIT-KABUL-EDILDI + public satır metni ("kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde"). Karşı biçimler de geçer: ana makine büyük harfle, kayıt dizinine göreli dosya yolu, küçük harfli özet, ek tünel kalemi (türü listeye girer)', () => {
      const noTime = (t) => t.replace(/"(startedAt|finishedAt)":\s*"[^"]*"/g, ''); // zaman alanları bugünün tarihini taşır (kanıt tarihiyle aynı gün) — ayıklanır
      const sc = SA6.ev.scopeAuthorization; const txtSum = noTime(SA6.sumBytes.toString('utf8')); const scRaw = JSON.stringify(sc); const leak = (t) => t.includes(evP.sha256) || t.toLowerCase().includes(evD.sha256.toLowerCase()) || /saglayici-hesabi-kaydi|dns-zinciri\.txt|kayit-\d+\.json|kapsam[\\/]/.test(t) || t.includes(today) || t.includes(REVIEWER);
      const ok = is(SA6, 3, 'P/O/O/P') && vals(SA6).join() === vals(S1).join() && SA6.gt.length === VEC.all.length && sc && Object.keys(sc).sort().join() === 'contentReview,fileIntegrity,itemTypes,required,status' && sc.required === true && sc.status === 'KAYIT-KABUL-EDILDI' && sc.fileIntegrity === 'OLCULDU' && sc.contentReview === 'BEYAN-VAR' && JSON.stringify(sc.itemTypes) === JSON.stringify([D_T, P_T])
        && JSON.stringify(SA6.sum.scopeAuthorization) === scRaw && !leak(txtSum) && !leak(scRaw) && !leak(SA6.log) && !leak(noTime(SA6.evBytes.toString('utf8')))
        && /^D8-KAPSAM-YETKISI=KAYIT-KABUL-EDILDI$/m.test(SA6.log) && /^D8-DOSYA-BUTUNLUGU=OLCULDU$/m.test(SA6.log) && /^D8-ICERIK-INCELEMESI=BEYAN-VAR$/m.test(SA6.log) && SA6.log.includes(ACCEPT) && /^D8-AD=AD-4$/m.test(SA6.log) && !txtSum.toLowerCase().includes('localhost') && !/eksik=/.test(SA6.log + SA6b.log)
        && is(SA6b, 3, 'P/O/O/P') && SA6b.gt.length === VEC.all.length && JSON.stringify(SA6b.ev.scopeAuthorization.itemTypes) === JSON.stringify([D_T, P_T, T_T]) && S1.ev.scopeAuthorization.status === 'KAPI-YOK-BIRINCIL-AD' && S1.ev.scopeAuthorization.required === false
        && S1.ev.scopeAuthorization.fileIntegrity === 'UYGULANMADI' && S1.ev.scopeAuthorization.contentReview === 'UYGULANMADI' && !S1.log.includes(ACCEPT);
      return { ok, obs: `tam kayıt: çıkış=${SA6.code} · istek=${SA6.gt.length} · kapsam alanı=${scRaw} · özette sızıntı=${leak(txtSum)} · çıktıda public satır metni=${SA6.log.includes(ACCEPT)} || karşı biçimler: çıkış=${SA6b.code} · türler=${SA6b.ev && JSON.stringify(SA6b.ev.scopeAuthorization.itemTypes)} · AD-1=${JSON.stringify(S1.ev.scopeAuthorization)}` };
    });
    const tomorrow2 = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const sa7 = [['gelecekteki tarih', fullRec('AD-2', { items: [itm(P_T, evP, { date: tomorrow2 }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['geçersiz tarih', fullRec('AD-2', { items: [itm(P_T, evP, { date: '2026-13-40' }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['tarih yok', fullRec('AD-2', { items: [itm(P_T, evP, { date: undefined }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'],
      ['özet 64 hane değil', fullRec('AD-2', { items: [itm(P_T, evP, { sha256: evP.sha256.slice(0, 40) }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['tanınmayan kalem türü', fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evD), itm('BEYAN', evT)] }), 'KALEM-BICIMI-GECERSIZ'], ['kalem listesi boş', fullRec('AD-2', { items: [] }), 'KALEM-BICIMI-GECERSIZ'],
      ['kayıt türü yanlış', fullRec('AD-2', { record: 'BASKA-KAYIT' }), 'KAYIT-BICIMI-GECERSIZ'], ['kayıt JSON değil', 'bu bir JSON degil', 'KAYIT-OKUNAMADI']];
    const sa7r = []; for (const [name, rec, why] of sa7) sa7r.push({ name, why, r: await sa(rec) });
    const sa7x = await sa(null, { recordPath: path.join(scopeDir, 'olmayan-kayit.json') });
    item('SA-7', 'BİÇİMSEL HİLELER kapıdan geçmez (hepsinde ad kimliği, ana makine ve inceleme beyanı DOĞRU; istek yok): gelecekteki tarih · geçersiz tarih · tarih yok · özet 64 hane değil · tanınmayan kalem türü · boş kalem listesi → KALEM-BICIMI-GECERSIZ · kayıt türü yanlış → KAYIT-BICIMI-GECERSIZ · kayıt JSON değil / kayıt dosyası yok → KAYIT-OKUNAMADI. (İki kalemin aynı dosyayı göstermesi artık ret nedeni DEĞİLDİR — SA-9.)', () => ({
      ok: sa7r.length === 8 && sa7r.every((x) => refused(x.r, x.why)) && refused(sa7x, 'KAYIT-OKUNAMADI'), obs: sa7r.map((x) => `${x.name}→${x.r.code}/${x.r.seen} ${x.r.why}`).join(' · ') + ` · kayıt dosyası yok→${sa7x.why}` }));
    const sa8a = await gate(mk({ alias: 'AD-1', extra: ['--scope-record', recFor['AD-2']] })); const sa8b = await gate(['--alias', 'AD-2', '--origin', ORIGIN, '--phone-list']); const sa8c = await gate(['--alias', 'AD-2', '--origin', ORIGIN, '--phone-list'].concat(scopeArgs('AD-2')));
    item('SA-8', 'kapının sınırları: (a) AD-1 için kapı yoktur ve kayıt VERİLMEZ — AD-1 ile --scope-record birlikte → çıkış 4, istek yok (kayıt sessizce yok sayılmaz) · (b) telefon listesi çağrısında da kapı geçerlidir: AD-2 kayıtsız → çıkış 4, ileti aynı sabit metin, adres listesi YAZILMAZ · (c) AD-2 tam kayıtla → liste yazılır (5 adres), istek yok', () => ({
      ok: sa8a.code === 4 && sa8a.seen === 0 && /REDDEDİLDİ: --scope-record yalnız AD-1 dışındaki/.test(sa8a.log) && sa8b.code === 4 && sa8b.seen === 0 && sa8b.log.split(/\r?\n/)[0] === REFUSAL && !/^\s+\d\. https:\/\//m.test(sa8b.log) && sa8c.code === 0 && sa8c.seen === 0 && (sa8c.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /TELEFON — AD-2/.test(sa8c.log),
      obs: `AD-1 + kayıt→${sa8a.code}/${sa8a.seen} · telefon listesi AD-2 kayıtsız→${sa8b.code} · AD-2 tam kayıtla→${sa8c.code}, adres=${(sa8c.log.match(/^\s+\d\. https:\/\//gm) || []).length}` }));

    // ── SA-9 … SA-11 (owner kararı 2026-10-06): birleşik belge · içerik incelemesi beyanı ile dosya bütünlüğü AYRI · tarih sınır saatleri ──
    /** Telefon listesi kipinde kapı denemesi (İSTEK ATILMAZ; kapı iki kipte de aynı satırdır): KABUL = çıkış 0 + 5 adres; RET = çıkış 4 +
     *  sabit ileti + neden sınıfı. `e`: alt sürecin ortamı (sahte saat girdileri için). */
    const saPhone = async (rec, e, alias) => { const g = await gate(['--alias', alias || 'AD-2', '--origin', ORIGIN, '--phone-list', '--scope-record', mkRec(rec)], e); const lines = g.log.split(/\r?\n/).filter(Boolean);
      const rl = /^D8-KAPSAM-YETKISI=RET neden=([A-Z-]+)(?: eksik=([A-Z,-]+))?$/m.exec(g.log) || []; const listed = (g.log.match(/^\s+\d\. https:\/\//gm) || []).length;
      return { code: g.code, seen: g.seen, first: lines[0] || '', why: rl[1] || null, missing: rl[2] || null, listed, log: g.log, wrote: false, accepted: g.code === 0 && listed === 5 && g.seen === 0 && !rl[1],
        res: (g.code === 0 && listed === 5 && !rl[1]) ? 'KABUL' : ((g.code === 4 && rl[1]) ? 'RET ' + rl[1] : 'BELIRSIZ rc=' + g.code) }; };
    const combined = (o) => fullRec('AD-2', Object.assign({ items: [itm(P_T, evC), itm(D_T, evC)] }, o || {}));
    recFor['AD-6'] = mkRec(fullRec('AD-6', { items: [itm(P_T, evC), itm(D_T, evC)] })); const SA9 = await scenario('ok', { tag: 'sa9', alias: 'AD-6' });
    const evCcopy = mkEv('birlesik-belgenin-kopyasi.txt', fs.readFileSync(evC.file)); const evCempty = { file: path.join(scopeDir, 'bos-birlesik-belge.txt'), sha256: sha(Buffer.alloc(0)) }; fs.writeFileSync(evCempty.file, '');
    const sa9b = await saPhone(fullRec('AD-2', { items: [itm(P_T, evC), itm(D_T, evCcopy)] })); const sa9c = await saPhone(combined({ review: undefined })); const sa9d = await saPhone(combined({ items: [itm(P_T, evC)] }));
    const sa9e = await saPhone(combined({ items: [itm(P_T, evC), itm(P_T, evC)] })); const sa9f = await saPhone(combined({ items: [itm(P_T, evCempty), itm(D_T, evCempty)] }));
    const sa9g = await saPhone(combined({ items: [itm(P_T, evC, { sha256: flip(evC.sha256) }), itm(D_T, evC)] })); const sa9h = await saPhone(combined({ items: [itm(P_T, evC), itm(D_T, evC, { sha256: flip(evC.sha256) })] })); const sa9i = await saPhone(combined({ items: [itm(T_T, evC)] }));
    item('SA-9', 'BİRLEŞİK SAHİPLİK BELGESİ (owner kararı: "iki kanıt türünün aynı dosyada bulunmasını tek başına ret nedeni yapma"; iki ayrı kanıt UNSURU zorunlu, iki ayrı DOSYA zorunlu değil): (a) iki zorunlu kalem AYNI dosyayı gösteriyor (sağlayıcı hesabı kaydı + DNS zinciri tek belgede); dosya var, boş değil, özeti tutuyor; iki tür ayrı kalem; ad kimliği / ana makine bağı ve inceleme beyanı tam → KABUL: sonda KOŞAR (AD-6; 68 istek; alanlar S1 ile aynı), kanıtta durum KAYIT-KABUL-EDILDI · dosya bütünlüğü OLCULDU · içerik incelemesi BEYAN-VAR · iki tür; belge adı / özeti hiçbir çıktıda yok · (b) aynı içerik iki AYRI dosyada → KABUL · (c) birleşik belge ama inceleme beyanı YOK → RET (INCELEME-BEYANI-YOK) · (d) birleşik belge ama TEK tür kalem → RET (KALEM-EKSIK, eksik = DNS zinciri) · (e) aynı türden iki kalem aynı belgeye → RET (eksik = DNS zinciri: iki UNSUR = iki TÜR) · (f) birleşik belge BOŞ → RET (KANIT-DOSYASI-BOS) · (g, h) birleşik belgenin özeti birinci / ikinci kalemde tutmuyor → RET (OZET-TUTMUYOR) · (i) birleşik belge yalnız tünel kalemiyle → RET (YALNIZ-TUNEL-KAYDI); retlerin hepsinde istek yok', () => {
      const sc = SA9.ev ? SA9.ev.scopeAuthorization : null; const txt = SA9.log + (SA9.evBytes ? SA9.evBytes.toString('utf8') : '') + (SA9.sumBytes ? SA9.sumBytes.toString('utf8') : ''); const BOTH = P_T + ',' + D_T;
      const ok = is(SA9, 3, 'P/O/O/P') && vals(SA9).join() === vals(S1).join() && SA9.gt.length === VEC.all.length && !!sc && sc.status === 'KAYIT-KABUL-EDILDI' && sc.fileIntegrity === 'OLCULDU' && sc.contentReview === 'BEYAN-VAR' && JSON.stringify(sc.itemTypes) === JSON.stringify([D_T, P_T])
        && SA9.log.includes(ACCEPT) && /^D8-AD=AD-6$/m.test(SA9.log) && !/birlesik-sahiplik-belgesi/.test(txt) && !txt.toUpperCase().includes(evC.sha256) && !txt.includes(REVIEWER)
        && sa9b.accepted && refused(sa9c, 'INCELEME-BEYANI-YOK') && refused(sa9d, 'KALEM-EKSIK', D_T) && refused(sa9e, 'KALEM-EKSIK', D_T) && refused(sa9f, 'KANIT-DOSYASI-BOS') && refused(sa9g, 'OZET-TUTMUYOR') && refused(sa9h, 'OZET-TUTMUYOR') && refused(sa9i, 'YALNIZ-TUNEL-KAYDI', BOTH);
      return { ok, obs: `aynı dosya iki kalemde → çıkış=${SA9.code}, istek=${SA9.gt.length}, kapsam alanı=${JSON.stringify(sc)} · aynı içerik iki dosyada → ${sa9b.res} · beyan yok → ${sa9c.res} · tek tür → ${sa9d.res} eksik=${sa9d.missing} · aynı tür iki kez → ${sa9e.res} eksik=${sa9e.missing} · boş belge → ${sa9f.res} · özet (1. kalem) → ${sa9g.res} · özet (2. kalem) → ${sa9h.res} · yalnız tünel → ${sa9i.res}` };
    });
    const badReviews = [['beyan alanı yok', undefined, 'INCELEME-BEYANI-YOK'], ['beyan null', null, 'INCELEME-BEYANI-YOK'], ['inceleyen boş', rev({ reviewer: '' }), 'INCELEME-BEYANI-GECERSIZ'], ['inceleyen yalnız boşluk', rev({ reviewer: '   ' }), 'INCELEME-BEYANI-GECERSIZ'],
      ['inceleyen yok', rev({ reviewer: undefined }), 'INCELEME-BEYANI-GECERSIZ'], ['inceleyen metin değil', rev({ reviewer: 123 }), 'INCELEME-BEYANI-GECERSIZ'], ['inceleme tarihi yok', rev({ date: undefined }), 'INCELEME-BEYANI-GECERSIZ'], ['inceleme tarihi biçim dışı', rev({ date: '06.10.2026' }), 'INCELEME-BEYANI-GECERSIZ'],
      ['inceleme tarihi gelecekte', rev({ date: tomorrow2 }), 'INCELEME-BEYANI-GECERSIZ'], ['incelenen kalemler yok', rev({ itemTypes: undefined }), 'INCELEME-BEYANI-GECERSIZ'], ['incelenen kalemler yalnız bir tür', rev({ itemTypes: [P_T] }), 'INCELEME-BEYANI-GECERSIZ'], ['incelenen kalemler boş liste', rev({ itemTypes: [] }), 'INCELEME-BEYANI-GECERSIZ'],
      ['incelenen kalemlerde tanınmayan tür', rev({ itemTypes: [P_T, D_T, 'BEYAN'] }), 'INCELEME-BEYANI-GECERSIZ'], ['incelenen kalemler liste değil', rev({ itemTypes: P_T + ',' + D_T }), 'INCELEME-BEYANI-GECERSIZ'], ['beyan düz metin', 'incelendi', 'INCELEME-BEYANI-GECERSIZ'], ['beyan liste', [REVIEWER, today], 'INCELEME-BEYANI-GECERSIZ'], ['beyan yalnız "true"', true, 'INCELEME-BEYANI-GECERSIZ']];
    const sa10r = []; for (const [name, rv, why] of badReviews) sa10r.push({ name, why, r: await saPhone(fullRec('AD-2', { review: rv })) });
    const sa10ok1 = await saPhone(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evD), itm(T_T, evT)], review: rev({ itemTypes: [T_T, D_T, P_T] }) })); const sa10ok2 = await saPhone(fullRec('AD-2', { review: rev({ itemTypes: [D_T, P_T] }) }));
    // TARİH girdilerinin ortak yardımcıları (SA-10'un inceleme tarihi girdileri ve SA-11). Sahte saat alt sürece ön yüklemeyle verilir
    // (sondaya dokunulmaz); yerel saat dilimi TSİ. Yerel (TSİ) günü ve UTC günü bu dosyada BAĞIMSIZ hesaplanır (Intl).
    const TZI = 'Europe/Istanbul'; const dayIn = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); const D0 = '2026-10-05'; const dRec = (date, o) => fullRec('AD-2', Object.assign({ items: [itm(P_T, evP, { date }), itm(D_T, evD, { date: addDays(D0, -1) })], review: rev({ date: addDays(D0, -1) }) }, o || {}));
    const sa10d1 = await saPhone(dRec(D0, { review: rev({ date: addDays(D0, 1) }) }), clockEnv(D0 + 'T21:00:00Z', TZI)); const sa10d2 = await saPhone(dRec(D0, { review: rev({ date: addDays(D0, 2) }) }), clockEnv(D0 + 'T21:00:00Z', TZI));
    item('SA-10', 'İÇERİK İNCELEMESİ ile DOSYA BÜTÜNLÜĞÜ AYRI KAYDEDİLİR (owner kararı: "sonda dosyanın içeriğini doğrulamıyorsa sahipliği makine doğruladı yazma"): (a) inceleyenin beyanı kayıtta ZORUNLU ayrı alandır (kim · ne zaman · hangi kalem türleri): alan yok / null → RET (INCELEME-BEYANI-YOK); inceleyen boş / yalnız boşluk / yok / metin değil · tarih yok / biçim dışı / gelecekte · incelenen kalemler yok / tek tür / boş / tanınmayan tür / liste değil · beyan düz metin / liste / "true" → RET (INCELEME-BEYANI-GECERSIZ) — on yedisinde de dosyalar var ve özetleri tutuyor (dosya bütünlüğü tam olsa da beyan yoksa KABUL yok); istek yok · (b) tam beyan (iki tür; sıra farklı; ek tünel türüyle) → KABUL · (c) kabul edilen koşumun (SA-6) kanıtında iki AYRI alan: dosya bütünlüğü OLCULDU (sondanın ölçtüğü) ve içerik incelemesi BEYAN-VAR (sondanın yalnız varlığını kaydettiği insan beyanı); AD-1\'de ikisi de UYGULANMADI · (d) kabul edilen koşumların (SA-6, SA-9) çıktısında, ham kanıtında ve adsız özetinde "doğrulandı" / DOGRULANDI yok; inceleyenin adı yok · (e) sondanın kod satırlarında DOGRULANDI durumu yok; ret iletisinde inceleyen / tarih yok · (f) inceleme tarihi sınır saatinde kalem tarihiyle AYNI kuralla ölçülür (saat sabitlenir: TSİ 00:00, yerel gün UTC gününden ileride): yerel bugün (UTC\'ye göre "yarın") → KABUL · UTC bugün + 2 gün → RET (INCELEME-BEYANI-GECERSIZ)', () => {
      const out = (S) => S.log + (S.evBytes ? S.evBytes.toString('utf8') : '') + (S.sumBytes ? S.sumBytes.toString('utf8') : ''); const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const a = sa10r.length === 17 && sa10r.every((x) => refused(x.r, x.why) && !x.r.log.includes(REVIEWER) && !x.r.log.includes(today));
      const sc = SA6.ev.scopeAuthorization; const c = sc.fileIntegrity === 'OLCULDU' && sc.contentReview === 'BEYAN-VAR' && sc.status === 'KAYIT-KABUL-EDILDI' && S1.ev.scopeAuthorization.fileIntegrity === 'UYGULANMADI' && S1.ev.scopeAuthorization.contentReview === 'UYGULANMADI';
      const d = [SA6, SA9].every((S) => !/DOGRULANDI|doğrulandı/i.test(out(S)) && !out(S).includes(REVIEWER)); const e = !/DOGRULANDI/.test(code) && /'KAYIT-KABUL-EDILDI'/.test(code) && /fileIntegrity: 'OLCULDU'/.test(code) && /contentReview: 'BEYAN-VAR'/.test(code);
      const f = sa10d1.res === 'KABUL' && sa10d2.res === 'RET INCELEME-BEYANI-GECERSIZ' && dayIn(Date.parse(D0 + 'T21:00:00Z'), TZI) === addDays(D0, 1) && dayIn(Date.parse(D0 + 'T21:00:00Z'), 'UTC') === D0;
      return { ok: a && sa10ok1.accepted && sa10ok2.accepted && c && d && e && f, obs: sa10r.map((x) => `${x.name}→${x.r.res}`).join(' · ') + ` || tam beyan (ek tünel türüyle)→${sa10ok1.res} · (sıra farklı)→${sa10ok2.res} || SA-6 kapsam alanı=${JSON.stringify(sc)} · kabul çıktılarında "doğrulandı" yok=${d} · kod satırlarında DOGRULANDI yok=${e} || inceleme tarihi (TSİ 00:00): yerel bugün→${sa10d1.res} · UTC bugün + 2→${sa10d2.res}` };
    });
    // SA-11 — TARİH DENETİMİ sınır saatlerinde (kalem tarihleri). Beklenen sınıf bu dosyada BAĞIMSIZ türetilir: "geçerli belge" = tarihi
    // yerel bugünden ileride olmayan belge (owner: reddedilmemeli); "her saat diliminde gelecekte" = tarihi UTC bugün + 2 gün ya da sonrası
    // (reddedilmeli); arada kalan tek gün (UTC bugün + 1, yerel gün UTC günüyle aynıyken) sondanın belgelediği bir günlük paydır (kabul).
    const dCases = [[D0 + 'T20:59:59Z', 0], [D0 + 'T20:59:59Z', 1], [D0 + 'T20:59:59Z', 2], [D0 + 'T21:00:00Z', 1], [D0 + 'T21:00:00Z', 2], [D0 + 'T23:59:59Z', 1], [D0 + 'T23:59:59Z', 2], [addDays(D0, 1) + 'T00:00:00Z', 1], [addDays(D0, 1) + 'T00:00:00Z', 2], [addDays(D0, 1) + 'T00:00:00Z', 3]];
    const sa11 = []; for (const [now, off] of dCases) { const ms = Date.parse(now); const date = addDays(D0, off); const local = dayIn(ms, TZI); const utc = dayIn(ms, 'UTC');
      const cls = date <= local ? 'GECERLI' : (date >= addDays(utc, 2) ? 'GELECEKTE' : 'PAY'); sa11.push({ now, date, local, utc, cls, ahead: local !== utc, r: await saPhone(dRec(date), clockEnv(now, TZI)) }); }
    const timed = [addDays(D0, 1) + 'T00:30:00+03:00', D0 + 'T21:30:00Z', addDays(D0, 1) + ' 00:30']; const sa11t = [];
    for (const now of [D0 + 'T21:30:00Z', D0 + 'T12:00:00Z']) for (const date of timed) sa11t.push({ now, date, r: await saPhone(dRec(date), clockEnv(now, TZI)) });
    const sa11real = await saPhone(dRec(addDays(D0, 2))); // karşı girdi: AYNI kayıt, saat SABİTLENMEDEN (gerçek saat) — sahte saatin gerçekten etkili olduğunu gösterir
    item('SA-11', 'TARİH DENETİMİ SINIR SAATLERİNDE (owner kararı: "tarih kontrolünün TSİ / UTC farkıyla geçerli belgeyi reddetmediğini doğrula"; saat alt süreçte sabitlenir, yerel saat dilimi TSİ = UTC+3; istek atılmaz; kalem tarihleri): (a) yerel gün UTC gününden İLERİDEYKEN (TSİ 00:00:00 · 02:59:59 = UTC 21:00:00 · 23:59:59) tarihi yerel BUGÜN olan belge (UTC\'ye göre "yarın") → KABUL — "gelecekte" diye reddedilmez · (b) yerel gün UTC günüyle aynıyken (TSİ 23:59:59 · 03:00:00) yerel bugün → KABUL · (c) her saat diliminde gelecekte olan tarih (UTC bugün + 2 gün ve sonrası) → RET (KALEM-BICIMI-GECERSIZ), dört sınır saatinde de · (d) aradaki tek gün (UTC bugün + 1; yerel gün UTC günüyle aynıyken) sondanın belgelediği bir günlük payla KABUL · (e) SAATLİ biçim (TSİ ofsetli · Z\'li · boşluklu) iki ayrı saatte de RET (KALEM-BICIMI-GECERSIZ) — biçim reddidir, saat dilimine / saate bağlı değildir; kayıt tarihi yalnız YYYY-AA-GG\'dir · (f) karşı girdi: aynı "gelecekte" kaydı saat sabitlenmeden (gerçek saat) KABUL — ret sahte saatten geliyor. (Bu kalem düzeltme öncesi sonda baytlarında da geçer: tarih kuralı bu turda değişmedi — ölçüldü, kusur yoktu.)', () => {
      const want = (x) => (x.cls === 'GELECEKTE' ? 'RET KALEM-BICIMI-GECERSIZ' : 'KABUL'); const key = sa11.filter((x) => x.ahead && x.date === x.local);
      const realToday = new Date().toISOString().slice(0, 10); const control = realToday >= addDays(D0, 1) ? sa11real.res === 'KABUL' : true;
      const ok = sa11.length === 10 && sa11.every((x) => x.r.res === want(x) && x.r.seen === 0) && key.length === 2 && key.every((x) => x.r.res === 'KABUL' && x.date === addDays(x.utc, 1)) && sa11.filter((x) => x.cls === 'GELECEKTE').length === 4 && sa11.filter((x) => x.cls === 'PAY').length === 2 && sa11.filter((x) => x.cls === 'GECERLI').length === 4
        && sa11t.length === 6 && sa11t.every((x) => x.r.res === 'RET KALEM-BICIMI-GECERSIZ') && control;
      return { ok, obs: sa11.map((x) => `[şimdi ${x.now} · TSİ günü ${x.local} · UTC günü ${x.utc} · tarih ${x.date} (${x.cls})→${x.r.res}]`).join(' ') + ` || saatli biçim: ${sa11t.map((x) => x.r.res).join(', ')} || saat sabitlenmeden aynı kayıt→${sa11real.res} (gerçek UTC günü ${realToday})` };
    });

    // ── DAR KABUL İSTİSNASI (R07; owner kararı 2026-10-06): "İzin verilen bozuk istek reddi — katman doğrulanmadı" ──
    // Girdi ailesi: sahte kenar tanımlı vektöre incelenmiş 400 yanıtını (ya da ondan TEK özelliği ayrılan bir yanıtı) verir; diğer bütün
    // istekler sağlıklıdır (58 ret vektörü kimlik başlıksız 403, pozitifler beklendiği gibi). Sahte YEREL kenar geri döngüde ayrı dinler.
    const LE = ['--local-edge', LOCAL_ORIGIN]; const OFF_NO = ['--offprobe-evidence', 'KULLANILMIYOR']; const OFF_YES = ['--offprobe-evidence', 'KULLANILACAK'];
    const RES_OK = 'GECERLI-ACIKLANAMAYAN-ARTIS-YOK'; const RES_BAD = 'GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS'; const PENDING = 'KESINLESMEDI-EK-KANIT-SONUCU-YOK'; // bu dosyada BAĞIMSIZ yazılıdır
    const W = { def: 'TANIM-TEK-VEKTORLE-ESLESMIYOR', st: 'TANIMLI-VEKTOR-HTTP-400-DEGIL', resp: 'INCELENMIS-YANIT-OZELLIKLERI-UYUSMUYOR', app: 'UYGULAMAYA-ULASMA-KANITI-VAR-YA-DA-CELISKILI', loc: 'YEREL-KENAR-403-GOZLEMI-YOK', decl: 'EK-KANIT-BEYANI-YOK', pend: 'EK-KANIT-SONUCU-YOK', bad: 'EK-KANIT-GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS' };
    const N = (S) => S.ev.malformedRejectClass; const mrRow = (S) => S.ev.rows.find((x) => x.method === MR.method && x.path === MR.target);
    const marked = (S) => S.ev.rows.filter((x) => x.acceptedClass !== null);
    const argOf = (a, k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
    /** Dar sınıfın BAĞIMSIZ beklentisi — yalnız ZEMİN GERÇEĞİNDEN ve verilen argümanlardan (sondanın kaydından DEĞİL): sahte kenar incelenmiş
     *  yanıtı BİREBİR ve yalnız tanımlı (yöntem, ham hedef) isteğine verdi · o yanıtta kimlik başlığı yok · sahte yerel kenar aynı ham hedefi,
     *  dış adın Host başlığıyla TAM bir kez gördü ve kimlik başlıksız 403 verdi · beyan "kullanılmıyor". */
    const mrExpected = (S) => {
      const tgt = S.gt.filter((s) => s.method === MR.method && s.url === MR.target); const exact = S.gt.filter((s) => s.exam === 'TAM'); const loc = S.gtLocal || [];
      return tgt.length === 1 && exact.length === 1 && exact[0] === tgt[0] && tgt[0].status === 400 && tgt[0].echoed === 'none'
        && loc.length === 1 && loc[0].method === MR.method && loc[0].url === MR.target && loc[0].host === `localhost:${PORT}` && loc[0].status === 403 && loc[0].respId === null
        && argOf(S.extra || [], '--offprobe-evidence') === 'KULLANILMIYOR';
    };
    /** İstisna UYGULANMADI ölçütü: hiçbir satır işaretli değil · kayıt durumu beklenen (UYGULANDI değil) · sayılarda dar sınıf 0 · çıktıda sınıfın
     *  adı YOK · durum satırı ve adsız özet aynı durumu taşır · (verildiyse) uygulanmama nedenleri TAM olarak beklenen. */
    const notApplied = (S, why, state) => !!S.ev && !!N(S) && N(S).state === (state || 'UYGULANMADI') && marked(S).length === 0 && N(S).appliedRows === 0 && V(S).httpReject.counts.narrowClass === 0 && !S.log.includes(MR.name)
      && new RegExp('^D8-DAR-SINIF=' + (state || 'UYGULANMADI') + '$', 'm').test(S.log) && S.sum.malformedRejectClass.state === N(S).state && (why === undefined || N(S).whyNot.join() === why);
    const mrBrief = (S) => `${brief(S)} · dar sınıf=${S.ev && N(S) ? N(S).state + ' [' + (N(S).whyNot.join(',') || '-') + ']' : '?'} · işaretli satır=${S.ev ? marked(S).length : '?'} · yerel kenarın gördüğü istek=${S.gtLocal.length}`;
    /** Kesinleştirme adımı (çevrimdışı): kenarın ve yerel kenarın gördüğü istek sayısını, yazılan kaydı ve ret nedenini döndürür. */
    const fin = async (evPath, result, o) => { o = o || {}; mode = 'ok'; seen = []; seenLocal = []; const out = o.out || gateOut(); const alias = o.alias || 'AD-1';
      const args = ['--alias', alias, '--vantage', o.vantage || 'oz-test-yerel', '--origin', o.origin || ORIGIN, '--finalize', evPath, '--out', out].concat(result === null ? [] : ['--offprobe-result', result], scopeArgs(alias), o.extra || []);
      const r = await run(args); const n = seen.length; const nl = seenLocal.length; seen = []; seenLocal = [];
      return { code: r.code, log: r.log, seen: n, seenLocal: nl, out, wrote: fs.existsSync(out), rec: readJson(out), recBytes: readBytes(out), why: (/KESİNLEŞTİRME YAPILMADI — neden=([A-Z-]+)/.exec(r.log) || [])[1] || null }; };
    const mkCopy = (name, fn) => { const f = path.join(dir, name); const t = fn(src); fs.writeFileSync(f, t); return { f, t }; };
    const isTargetLine = (l) => /^\s*\['varyant boş bayt kodlu',\s*'GET',\s*'\/api\/portal\/cases%00\/admin',/.test(l);

    const MRa = await scenario('mrc', { tag: 'mra', extra: LE.concat(OFF_NO) }); const MRa0 = await scenario('mrc', { tag: 'mra0' });
    item('MR-1', '(a) DAR SINIF UYGULANIR — tanımlı vektör (GET, ham hedef /api/portal/cases%00/admin) incelenmiş 400 yanıtını BİREBİR aldı (içerik türü text/html · gövde tam 155 bayt, SHA-256\'sı bu dosyada bağımsız hesaplanır · kimlik başlığı yok), sahte YEREL kenar aynı ham hedefe 403 verdi, beyan "sonda dışı ek kanıt kullanılmıyor": çıkış 3; HTTP / ret OWNER-ISTISNASIYLA-UYGUN (PASS DEĞİL; ayrıntı MR-10) — o satır 403 SAYILMAZ (sayılar ayrı: 403 58/59 · dar sınıf 1; durum sınıfı DORTYUZ-403-DISI kalır) · kenar engelleme OLCULEMEYEN ve katman doğrulaması OLCULEMEYEN — PASS DEĞİL, "temiz gözlem" sınıfı da DEĞİL (neden DURUM-KODU-OLCUTU-PASS-DEGIL) · pozitif kontrol PASS; yalnız O satır sınıfın TAM adını taşır ("İzin verilen bozuk istek reddi — katman doğrulanmadı"); ad ve "Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir." cümlesi çıktıda, ham kanıtta ve adsız özette; kural sürümü R07 kayıtta (karar tarihi kanıta / özete / çıktıya yazılmaz — belgede ayrı kayıtlıdır, DOC-2); beş koşul ayrı ayrı kayıtlı; YEREL İSTEK: sahte yerel kenar TAM bir istek gördü — aynı ham hedef, GET, Host = dış adın ana makinesi (yerel adres değil), kimlik bilgisi yok, gövde yok, tek kullanımlık kabul edilmeyen biçimli kimlik; iki sahte ucun ORTAK sıra sayacına göre bütün dış isteklerden SONRA geldi — kanıtta AYRI kayıt (satır listesinde değil) ve toplam istek sayısına dahil (dış 68 + yerel 1 = 69); karşı girdi: sağlıklı kenarda (S1) ve aynı girdide yerel karşılaştırma / beyan verilmeden (aşağıda MR-4) sınıf uygulanmaz', () => {
      const x = mrRow(MRa); const j = J(MRa); const tp = j.find((p) => p.row === x); const others = j.filter((p) => p.row.group === 'deny' && p.row !== x); const n = N(MRa); const v = V(MRa); const l = MRa.gtLocal; const lc = MRa.ev.localEdgeComparison; const m = MRa.ev.measured;
      const bodyOk = Buffer.byteLength(EXAM_BODY, 'latin1') === 155 && sha(Buffer.from(EXAM_BODY, 'latin1')) === EXAM_SHA;
      const names = ['host', 'user-agent', 'content-type', 'accept', F.header].sort().join();
      const ok = bodyOk && is(MRa, 3, 'I/O/O/P') && mrExpected(MRa) && tp.gt.exam === 'TAM' && tp.gt.producer === 'saglayici' && tp.gt.echoed === 'none' && others.length === 58 && others.every((p) => p.gt.producer === 'edge' && p.gt.status === 403)
        && x.status === 400 && x.outcome === 'DORTYUZ-403-DISI' && x.statusExpected === false && x.acceptedClass === MR.name && x.idObs === 'YOK' && x.layerId === 'OLCULEMEYEN' && marked(MRa).length === 1 && marked(MRa)[0] === x
        && JSON.stringify(x.examinedResponse) === JSON.stringify({ contentTypeMatch: true, bodyBytes: 155, bodySha256: EXAM_SHA, bodySha256Match: true }) && MRa.ev.rows.filter((r) => r.examinedResponse !== null).length === 1
        && n.state === 'UYGULANDI' && n.className === MR.name && n.notice === MR.notice && !('decisionDate' in n) && n.ruleRevision === MR.rev && n.vectorId === MR.id && n.appliedRows === 1 && n.whyNot.length === 0
        && Object.keys(n.conditions).length === 5 && Object.keys(n.conditions).every((k) => n.conditions[k] === true) && JSON.stringify(n.offprobeEvidence) === JSON.stringify({ declared: 'KULLANILMIYOR', result: null }) && JSON.stringify(n.localEdge) === JSON.stringify({ requested: true, status: 403, idObs: 'YOK' })
        && n.definition.method === MR.method && n.definition.rawTarget === MR.target && n.definition.examined.status === 400 && n.definition.examined.contentType === 'text/html' && n.definition.examined.bodyBytes === 155 && n.definition.examined.bodySha256 === EXAM_SHA
        && v.httpReject.reasons.length === 0 && JSON.stringify(v.httpReject.counts) === JSON.stringify({ denyRows: 59, status403: 58, narrowClass: 1, otherAnswered: 0, unanswered: 0 }) && MRa.sum.outcomeCounts.deny['RET-403'] === 58 && MRa.sum.outcomeCounts.deny['DORTYUZ-403-DISI'] === 1 && MRa.sum.coverage.VARYANT.rejected403 === 17
        && v.edgeBlocking.value === 'OLCULEMEYEN' && v.layerVerification.value === 'OLCULEMEYEN' && reasonNames(MRa, 'edgeBlocking') === 'DURUM-KODU-OLCUTU-PASS-DEGIL×1' && rc(MRa, 'edgeBlocking', NOEV) === 0 && MRa.ev.findings.length === 0
        && MRa.log.includes(MR.name) && MRa.log.includes(MR.notice) && /^D8-DAR-SINIF=UYGULANDI$/m.test(MRa.log) && /^D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN$/m.test(MRa.log) && !/^D8-HTTP-RET=PASS$/m.test(MRa.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(MRa.log) && /^D8-KATMAN-DOGRULAMA=OLCULEMEYEN$/m.test(MRa.log) && /^D8-CIKIS=3$/m.test(MRa.log)
        && MRa.sum.malformedRejectClass.className === MR.name && MRa.sum.malformedRejectClass.notice === MR.notice && MRa.sum.malformedRejectClass.state === 'UYGULANDI' && MRa.sum.malformedRejectClass.ruleRevision === MR.rev && !('decisionDate' in MRa.sum.malformedRejectClass) && !('definition' in MRa.sum.malformedRejectClass) && !MRa.sumBytes.toString('utf8').includes(MR.target)
        && l.length === 1 && l[0].method === 'GET' && l[0].url === MR.target && l[0].host === `localhost:${PORT}` && l[0].host !== `127.0.0.1:${LOCAL_PORT}` && l[0].cred === false && l[0].bodyLen === 0 && l[0].names.split(',').filter((k) => k !== 'connection').join() === names && typeof l[0].rid === 'string' && !F.safe.test(l[0].rid) && !MRa.gt.some((s) => s.rid === l[0].rid)
        && MRa.gt.length === 68 && MRa.gt.every((s, i) => s.seq < l[0].seq && (i === 0 || s.seq > MRa.gt[i - 1].seq)) && MRa.ev.rows.length === 68 && lc.requested === true && lc.status === 403 && lc.idObs === 'YOK' && lc.port === LOCAL_PORT && lc.rawTarget === MR.target && lc.method === 'GET' && lc.sent.requestId === l[0].rid && lc.sent.body === ''
        && m.requestCount === 69 && m.externalRequests === 68 && m.localEdgeRequests === 1 && m.credentialHeaderRequests === 0 && m.nonEmptyBodyRequests === 0 && MRa.sum.requestProfile.requestCount === 69 && MRa.sum.requestProfile.externalRequests === 68 && MRa.sum.requestProfile.localEdgeRequests === 1 && MRa.sum.requestProfile.distinctRequestIds === 69
        && notApplied(S1, [W.st, W.resp, W.loc, W.decl].join()) && S1.ev.measured.localEdgeRequests === 0 && S1.ev.localEdgeComparison.requested === false && S1.gtLocal.length === 0 && JSON.stringify(V(S1).httpReject.counts) === JSON.stringify({ denyRows: 59, status403: 59, narrowClass: 0, otherAnswered: 0, unanswered: 0 });
      return { ok, obs: mrBrief(MRa) + ` · satır: HTTP ${x.status}, sınıf="${x.acceptedClass}" · sayılar=${JSON.stringify(v.httpReject.counts)} · gövde 155 bayt / özet bağımsız hesapla aynı=${bodyOk} · yerel kenar: ${l.length ? l[0].method + ' ' + l[0].url + ' Host=' + l[0].host + ' → ' + l[0].status : 'istek yok'} · istek=${m.requestCount} (dış ${m.externalRequests} + yerel ${m.localEdgeRequests}) · S1: ${N(S1).state}` };
    });

    const MRb0 = await scenario('mrcany00', { tag: 'mrb0', extra: LE.concat(OFF_NO) }); const MRb1 = await scenario('mrcother', { tag: 'mrb1', extra: LE.concat(OFF_NO) });
    const cpMethod = mkCopy('d8-staff-surface-probe.yontem.js', (t) => t.split('\n').map((l) => (isTargetLine(l) ? l.replace("'GET',", "'DELETE',") : l)).join('\n'));
    const cpPath = mkCopy('d8-staff-surface-probe.yol.js', (t) => t.split('\n').map((l) => (isTargetLine(l) ? l.replace("cases%00/admin'", "cases%00/admim'") : l)).join('\n'));
    const MRb2 = await scenario('mrcany00', { tag: 'mrb2', probe: cpMethod.f, extra: LE.concat(OFF_NO), noInv: true }); const MRb3 = await scenario('mrcany00', { tag: 'mrb3', probe: cpPath.f, extra: LE.concat(OFF_NO), noInv: true });
    item('MR-2', '(b) BAŞKA İSTEĞE UYGULANMAZ — kapsam vektör kimliği + yöntem + HAM hedefle sabittir (yerel karşılaştırma ve beyan hepsinde verildi): (1) incelenmiş 400 yanıtı BAŞKA bir vektöre (başka bir kodlama varyantına) birebir geldi, tanımlı vektör 403 aldı → istisna yok: HTTP / ret FAIL (çıkış 2), o satır işaretlenmez · (2) AYNI ham yol BAŞKA yöntemle (ret listesinde o vektörün yöntemi DELETE olan sonda kopyası; sahte kenar içinde %00 geçen her ham yola incelenmiş yanıtı verir) → tanım hiçbir vektörle eşleşmez: istisna yok, HTTP / ret FAIL, yerel kenara istek ATILMAZ · (3) ham yol TEK KARAKTER farklı (…/admim; aynı girdi) → istisna yok, HTTP / ret FAIL, yerel istek yok; karşı girdi: AYNI sahte kenar kipinde paket sondası (tanımlı vektör değişmemiş) → sınıf uygulanır (çıkış 3) — yani farkı yaratan yalnız yöntem / ham yol', () => {
      const o1 = J(MRb1).find((p) => p.gt.exam === 'TAM'); const t1 = mrRow(MRb1); const r2 = MRb2.ev ? MRb2.ev.rows.find((x) => x.path === MR.target) : null; const r3 = MRb3.ev ? MRb3.ev.rows.find((x) => x.path === MR.target.replace(/admin$/, 'admim')) : null;
      const g2 = MRb2.gt.find((s) => s.exam === 'TAM'); const g3 = MRb3.gt.find((s) => s.exam === 'TAM');
      const ok = cpMethod.t !== src && cpPath.t !== src && is(MRb0, 3, 'I/O/O/P') && N(MRb0).state === 'UYGULANDI' && marked(MRb0).length === 1 && marked(MRb0)[0] === mrRow(MRb0)
        && is(MRb1, 2, 'F/O/O/P') && notApplied(MRb1, [W.st, W.resp].join()) && o1 && `${o1.row.method} ${o1.row.path}` === MR_OTHER_KEY && o1.row.status === 400 && o1.row.acceptedClass === null && o1.row.examinedResponse === null && t1.status === 403 && rc(MRb1, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1
        && N(MRb1).conditions.localEdge403Observed === true && N(MRb1).conditions.offprobeEvidenceAcceptable === true && MRb1.gtLocal.length === 1
        && is(MRb2, 2, 'F/O/O/P') && r2 && r2.method === 'DELETE' && r2.status === 400 && r2.acceptedClass === null && g2 && g2.method === 'DELETE' && g2.url === MR.target && notApplied(MRb2) && N(MRb2).whyNot[0] === W.def && MRb2.gtLocal.length === 0 && MRb2.ev.localEdgeComparison.requested === false && MRb2.ev.measured.requestCount === 68
        && is(MRb3, 2, 'F/O/O/P') && r3 && r3.method === 'GET' && r3.status === 400 && r3.acceptedClass === null && g3 && g3.url !== MR.target && g3.url.length === MR.target.length && notApplied(MRb3) && N(MRb3).whyNot[0] === W.def && MRb3.gtLocal.length === 0 && !MRb3.ev.rows.some((x) => x.path === MR.target);
      return { ok, obs: `başka vektör: ${mrBrief(MRb1)} · incelenmiş yanıtı alan=${o1 ? o1.row.method + ' ' + o1.row.path : '?'} || başka yöntem: ${mrBrief(MRb2)} · satır=${r2 ? r2.method + ' HTTP ' + r2.status : '?'} || ham yol bir karakter farklı: ${mrBrief(MRb3)} · satır=${r3 ? r3.path + ' HTTP ' + r3.status : '?'} || karşı girdi (paket sondası, aynı kip): ${mrBrief(MRb0)}` };
    });

    const MRc1 = await scenario('mrc200', { tag: 'mrc1', extra: LE.concat(OFF_NO) }); const MRc2 = await scenario('mrcidnew', { tag: 'mrc2', extra: LE.concat(OFF_NO) }); const MRc3 = await scenario('mrcidecho', { tag: 'mrc3', extra: LE.concat(OFF_NO) });
    item('MR-3', '(c) 2xx YANITI VE UYGULAMAYA ULAŞMA KANITI İSTİSNAYI GEÇERSİZ KILAR (tanımlı vektör; yerel kenar 403; beyan verildi; her girdide incelenmiş yanıttan TEK özellik ayrılır): (1) aynı gövde ve içerik türüyle 2xx (200) → istisna yok: HTTP / ret FAIL ve kenar engelleme FAIL (reddedilmedi), çıkış 2 · (2) incelenmiş yanıtın aynısı + API\'nin ürettiği biçimde YENİ kimlik başlığı (zemin gerçeği: yanıtı API yazdı) → istisna yok: satır UYGULAMA-API, HTTP / ret FAIL · kenar engelleme FAIL · katman doğrulaması FAIL, çıkış 2 · (3) incelenmiş yanıtın aynısı + isteğin kimliği YANSITILMIŞ (API kanıtı değildir ama kimlik başlığı VAR — çelişkili kanıt) → istisna yok: HTTP / ret FAIL, çıkış 2; üçünde de neden sınıfı yalnız ilgili koşul', () => {
      const x2 = mrRow(MRc2); const x3 = mrRow(MRc3);
      const ok = is(MRc1, 2, 'F/F/O/P') && notApplied(MRc1, W.st) && mrRow(MRc1).status === 200 && N(MRc1).conditions.examinedResponseMatches === true && rc(MRc1, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 1
        && is(MRc2, 2, 'F/F/F/P') && notApplied(MRc2, W.app) && x2.status === 400 && x2.idSignal === 'DEGISTIRME' && x2.layerId === 'UYGULAMA-API' && N(MRc2).conditions.examinedResponseMatches === true && rc(MRc2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1
        && is(MRc3, 2, 'F/O/O/P') && notApplied(MRc3, W.app) && x3.status === 400 && x3.idSignal === 'YANSIMA' && x3.layerId === 'OLCULEMEYEN' && N(MRc3).conditions.examinedResponseMatches === true && N(MRc3).conditions.definedVectorAndStatus400 === true
        && [MRc1, MRc2, MRc3].every((S) => S.gtLocal.length === 1 && N(S).conditions.localEdge403Observed === true && N(S).conditions.offprobeEvidenceAcceptable === true);
      return { ok, obs: `2xx: ${mrBrief(MRc1)} || yeni kimlik: ${mrBrief(MRc2)} · satır katmanı=${x2.layerId} || yansıtılmış kimlik: ${mrBrief(MRc3)} · kimlik anlamı=${x3.idSignal}` };
    });

    const MRd = []; for (const lm of ['404', '200', '400exam', '403id', 'drop']) MRd.push({ lm, S: await scenario('mrc', { tag: 'mrd-' + lm, extra: LE.concat(OFF_NO), local: lm }) });
    const MRd0 = await scenario('mrc', { tag: 'mrd-yok', extra: OFF_NO });
    item('MR-4', '(d-1) YEREL KENAR 403 GÖZLEMİ YOKSA İSTİSNA YOK (tanımlı vektör incelenmiş 400 yanıtını birebir aldı; beyan "kullanılmıyor"): yerel karşılaştırma parametresi VERİLMEDİ → yerel kenara istek gitmez, istisna yok · yerel kenar 404 / 200 / aynı 400 yanıtını verdi (403 DEĞİL) → istisna yok · yerel kenar 403 verdi ama KİMLİK BAŞLIĞIYLA (yerel kenar geçirmiş, uygulama yanıtlamış — çelişkili kanıt) → istisna yok · yerel kenar YANITSIZ (taşıma hatası; yalnız hata sınıfı yazılır) → istisna yok; hepsinde HTTP / ret FAIL, çıkış 2, tek neden sınıfı YEREL-KENAR-403-GOZLEMI-YOK; yerel istek atıldıysa toplam sayıya dahil (69) ve BİR kez (yeniden deneme yok); hiçbir beyan ve yerel karşılaştırma verilmeyen aynı girdi (R06 çağrısıyla aynı 68 istek) → istisna yok, iki neden', () => {
      const want = { 404: [404, 'YOK'], 200: [200, 'YOK'], '400exam': [400, 'YOK'], '403id': [403, 'YENI-KIMLIK'], drop: [0, 'SONUC-YOK'] };
      const each = MRd.every(({ lm, S }) => is(S, 2, 'F/O/O/P') && notApplied(S, W.loc) && S.gtLocal.length === 1 && S.gtLocal[0].url === MR.target && S.ev.localEdgeComparison.status === want[lm][0] && S.ev.localEdgeComparison.idObs === want[lm][1] && S.ev.measured.requestCount === 69 && S.gt.length === 68
        && N(S).conditions.definedVectorAndStatus400 && N(S).conditions.examinedResponseMatches && N(S).conditions.noApplicationReachEvidence && N(S).conditions.offprobeEvidenceAcceptable && !N(S).conditions.localEdge403Observed);
      const dr = MRd.find((x) => x.lm === 'drop').S; const txt = dr.evBytes.toString('utf8');
      const ok = MRd.length === 5 && each && dr.ev.localEdgeComparison.errorClass === 'BAGLANTI' && !/ECONNRESET|socket hang up/i.test(txt)
        && is(MRd0, 2, 'F/O/O/P') && notApplied(MRd0, W.loc) && MRd0.gtLocal.length === 0 && MRd0.ev.localEdgeComparison.requested === false && MRd0.ev.measured.requestCount === 68 && MRd0.ev.measured.localEdgeRequests === 0
        && is(MRa0, 2, 'F/O/O/P') && notApplied(MRa0, [W.loc, W.decl].join()) && MRa0.gtLocal.length === 0 && MRa0.gt.length === 68 && rc(MRa0, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1;
      return { ok, obs: MRd.map(({ lm, S }) => `yerel ${lm}→çıkış ${S.code}, ${S.ev ? N(S).state + ' [' + N(S).whyNot.join(',') + ']' : '?'}, yerel istek ${S.gtLocal.length}`).join(' · ') + ` || parametre yok: ${mrBrief(MRd0)} || beyan da yok: ${mrBrief(MRa0)}` };
    });

    const MRe = []; for (const em of ['mrcbody1', 'mrcct', 'mrcgeneric']) MRe.push({ em, S: await scenario(em, { tag: 'mre-' + em, extra: LE.concat(OFF_NO) }) });
    item('MR-5', '(d-2) İNCELENMİŞ YANIT ÖZELLİKLERİ BİREBİR TUTMUYORSA İSTİSNA YOK (tanımlı vektör HTTP 400; kimlik başlığı yok; yerel kenar 403; beyan verildi; üç girdide de Server başlığı ve iz başlığı sağlayıcınınkiyle AYNI): gövde aynı uzunlukta (155 bayt) ama TEK baytı farklı → özet tutmaz → istisna yok · gövde birebir aynı ama içerik türü "text/html; charset=utf-8" → istisna yok · YALNIZ genel sağlayıcı başlığı (Server + iz başlığı), gövde boş → istisna yok ("yalnız genel bir sağlayıcı başlığı yeterli değil"); hepsinde HTTP / ret FAIL, çıkış 2, tek neden sınıfı INCELENMIS-YANIT-OZELLIKLERI-UYUSMUYOR; Server başlığı / imza karara GİRMEZ (ipucu alanında aynı)', () => {
      const obs = (em) => N(MRe.find((x) => x.em === em).S).observed.examinedResponse; const b = obs('mrcbody1'); const c = obs('mrcct'); const g = obs('mrcgeneric');
      const each = MRe.every(({ S }) => is(S, 2, 'F/O/O/P') && notApplied(S, W.resp) && mrRow(S).status === 400 && mrRow(S).idObs === 'YOK' && mrRow(S).hints.serverHeaderValue === 'cloudflare' && mrRow(S).hints.edgeHeaderPresent === true && S.gtLocal.length === 1 && J(S).find((p) => p.row === mrRow(S)).gt.exam === 'FARKLI'
        && N(S).conditions.definedVectorAndStatus400 && N(S).conditions.noApplicationReachEvidence && N(S).conditions.localEdge403Observed && N(S).conditions.offprobeEvidenceAcceptable && !N(S).conditions.examinedResponseMatches);
      const ok = MRe.length === 3 && each && b.contentTypeMatch === true && b.bodyBytes === 155 && b.bodySha256Match === false && /^[0-9A-F]{64}$/.test(b.bodySha256) && b.bodySha256 !== EXAM_SHA
        && c.contentTypeMatch === false && c.bodyBytes === 155 && c.bodySha256Match === true && g.contentTypeMatch === true && g.bodyBytes === 0 && g.bodySha256Match === false
        && mrRow(MRa).hints.serverHeaderValue === 'cloudflare' && /cases%00\/admin'/.test(fnSrc('narrowClassOf')) === false && !/hints|serverHeader|layerHint|providerSignature|cloudflare|caddy/i.test(fnSrc('narrowClassOf') + fnSrc('examinedResponseOf'));
      return { ok, obs: MRe.map(({ em, S }) => `${em}→çıkış ${S.code}, ${S.ev ? N(S).state + ' [' + N(S).whyNot.join(',') + ']' : '?'}`).join(' · ') + ` · tek bayt farklı gövde: ${JSON.stringify({ ct: b.contentTypeMatch, bayt: b.bodyBytes, ozet: b.bodySha256Match })} · içerik türü farklı: ${JSON.stringify({ ct: c.contentTypeMatch, bayt: c.bodyBytes, ozet: c.bodySha256Match })} · yalnız genel başlık: ${JSON.stringify({ ct: g.contentTypeMatch, bayt: g.bodyBytes, ozet: g.bodySha256Match })}` };
    });

    const MRf1 = await scenario('mrc', { tag: 'mrf1', extra: LE }); const MRf2 = await scenario('mrc', { tag: 'mrf2', extra: LE.concat(OFF_YES) }); const MRf3 = await scenario('mrcbody1', { tag: 'mrf3', extra: LE.concat(OFF_YES) });
    const f2Before = { ev: sha(MRf2.evBytes), sum: sha(MRf2.sumBytes) }; const f3Before = sha(MRf3.evBytes);
    const finBad = await fin(MRf2.out, RES_BAD); const finOk = await fin(MRf2.out, RES_OK); const finOther = await fin(MRf3.out, RES_OK);
    item('MR-6', '(d-3) SONDA DIŞI EK KANIT (sayaç kanıtı) DURUMU GEÇERSİZ YA DA EKSİKSE İSTİSNA YOK — sonda o kanıtı ölçmez, yalnız owner beyanını kaydeder (tanımlı vektör incelenmiş yanıtı birebir aldı; yerel kenar 403): (1) beyan HİÇ verilmedi → istisna yok (EK-KANIT-BEYANI-YOK), HTTP / ret FAIL, çıkış 2 · (2) beyan "kullanılacak" → koşum anında sınıf KESİNLEŞMEZ: durum KESINLESMEDI-EK-KANIT-SONUCU-YOK, hiçbir satır işaretlenmez, HTTP / ret FAIL, çıkış 2 (diğer dört koşul tutuyor) · (3) kesinleştirme adımı, sonuç GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS → istisna yok: HTTP / ret FAIL, çıkış 2 · (4) kesinleştirme adımı, sonuç GECERLI-ACIKLANAMAYAN-ARTIS-YOK → dar sınıf UYGULANIR: HTTP / ret OWNER-ISTISNASIYLA-UYGUN (PASS DEĞİL) · kenar engelleme OLCULEMEYEN · katman OLCULEMEYEN · pozitif kontrol PASS, çıkış 3; sınıfın tam adı ve uyarı cümlesi çıktıda ve kayıtta · kesinleştirme adımı İSTEK ATMAZ (sahte kenar 0, sahte yerel kenar 0), kaynak kanıtın ve özetin baytlarını DEĞİŞTİRMEZ, ayrı kayıt yazar (kaynak kanıtın SHA-256\'sı bağımsız hesapla aynı; kayıtta ana makine adı, yerel adres ve ham yol yok) · (5) "geçerli" sonucu tek başına yetmez: yanıt özellikleri tutmayan (tek baytı farklı gövde) "kullanılacak" beyanlı koşum GECERLI ile kesinleştirilirse sınıf yine UYGULANMAZ (çıkış 2)', () => {
      const vv = (r) => (r.rec ? FIELDS.map((f) => r.rec.nameVerdict[f].value).join('/') : '?'); const c2 = N(MRf2).conditions; const txt = finOk.recBytes ? finOk.recBytes.toString('utf8') : '';
      const ok = is(MRf1, 2, 'F/O/O/P') && notApplied(MRf1, W.decl) && N(MRf1).offprobeEvidence.declared === 'BEYAN-YOK' && MRf1.gtLocal.length === 1 && N(MRf1).conditions.localEdge403Observed === true
        && is(MRf2, 2, 'F/O/O/P') && notApplied(MRf2, W.pend, PENDING) && c2.definedVectorAndStatus400 && c2.examinedResponseMatches && c2.noApplicationReachEvidence && c2.localEdge403Observed && !c2.offprobeEvidenceAcceptable && JSON.stringify(N(MRf2).offprobeEvidence) === JSON.stringify({ declared: 'KULLANILACAK', result: null }) && rc(MRf2, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1 && /kesinleşmez/.test(MRf2.log) && !mrExpected(MRf2)
        && finBad.code === 2 && finBad.seen === 0 && finBad.seenLocal === 0 && finBad.wrote && finBad.rec.record === 'EXTACC-D8-OFFPROBE-FINALIZATION' && finBad.rec.malformedRejectClass.state === 'UYGULANMADI' && finBad.rec.malformedRejectClass.whyNot.join() === W.bad && finBad.rec.malformedRejectClass.appliedRows === 0 && vv(finBad) === 'FAIL/OLCULEMEYEN/OLCULEMEYEN/PASS' && finBad.rec.exitCode === 2 && !finBad.log.includes(MR.name) && /^D8-DAR-SINIF=UYGULANMADI$/m.test(finBad.log) && /^D8-CIKIS=2$/m.test(finBad.log)
        && finOk.code === 3 && finOk.seen === 0 && finOk.seenLocal === 0 && finOk.wrote && finOk.rec.malformedRejectClass.state === 'UYGULANDI' && finOk.rec.malformedRejectClass.className === MR.name && finOk.rec.malformedRejectClass.notice === MR.notice && finOk.rec.malformedRejectClass.appliedRows === 1 && finOk.rec.malformedRejectClass.whyNot.length === 0
        && JSON.stringify(finOk.rec.malformedRejectClass.offprobeEvidence) === JSON.stringify({ declared: 'KULLANILACAK', result: RES_OK }) && vv(finOk) === HX + '/OLCULEMEYEN/OLCULEMEYEN/PASS' && finOk.rec.exitCode === 3 && finOk.rec.requestsSent === 0 && finOk.rec.nameVerdict.httpReject.counts.narrowClass === 1 && finOk.rec.nameVerdict.httpReject.counts.status403 === 58
        && finOk.log.includes(MR.name) && finOk.log.includes(MR.notice) && /^D8-KESINLESTIRME=YAPILDI$/m.test(finOk.log) && /^D8-DAR-SINIF=UYGULANDI$/m.test(finOk.log) && /^D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN$/m.test(finOk.log) && !/^D8-HTTP-RET=PASS$/m.test(finOk.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(finOk.log) && /^D8-CIKIS=3$/m.test(finOk.log) && !/^D8-CIKIS=0$/m.test(finOk.log)
        && finOk.rec.sourceEvidenceSha256 === f2Before.ev && finOk.rec.sourceNameVerdictValues === 'FAIL/OLCULEMEYEN/OLCULEMEYEN/PASS' && finOk.rec.sourceExitCode === 2 && finOk.rec.probeSha256 === sha(fs.readFileSync(PROBE)) && finOk.rec.revision === MR.rev && finOk.rec.nameAlias === 'AD-1'
        && sha(fs.readFileSync(MRf2.out)) === f2Before.ev && sha(fs.readFileSync(MRf2.sumPath)) === f2Before.sum && finOk.out !== MRf2.out && !/localhost|127\.0\.0\.1|https?:\/\//i.test(txt) && !txt.includes(MR.target) && !('rows' in finOk.rec) && !fs.existsSync(finOk.out.replace(/\.json$/, '.ozet.json'))
        && is(MRf3, 2, 'F/O/O/P') && notApplied(MRf3, [W.resp, W.pend].join()) && finOther.code === 2 && finOther.seen === 0 && finOther.rec.malformedRejectClass.state === 'UYGULANMADI' && finOther.rec.malformedRejectClass.whyNot.join() === W.resp && vv(finOther) === 'FAIL/OLCULEMEYEN/OLCULEMEYEN/PASS';
      return { ok, obs: `beyan yok: ${mrBrief(MRf1)} || kullanılacak: ${mrBrief(MRf2)} || kesinleştirme GECERSIZ: çıkış=${finBad.code}, ${finBad.rec ? finBad.rec.malformedRejectClass.state : '?'}, alanlar=${vv(finBad)}, istek=${finBad.seen}+${finBad.seenLocal} || kesinleştirme GECERLI: çıkış=${finOk.code}, ${finOk.rec ? finOk.rec.malformedRejectClass.state : '?'}, alanlar=${vv(finOk)}, istek=${finOk.seen}+${finOk.seenLocal}, kaynak kanıt değişmedi=${sha(fs.readFileSync(MRf2.out)) === f2Before.ev} || yanıtı tutmayan koşum GECERLI ile: çıkış=${finOther.code}, ${finOther.rec ? finOther.rec.malformedRejectClass.state : '?'}` };
    });

    const cpOrder = mkCopy('d8-staff-surface-probe.sira.js', (t) => { const L = t.split('\n'); const i = L.findIndex(isTargetLine); const j = L.findIndex((l) => /^\s*\['personel kök',/.test(l)); if (i < 0 || j < 0 || j >= i) return t; const moved = L.splice(i, 1)[0]; L.splice(j, 0, moved); return L.join('\n'); });
    const MRo = await scenario('mrc', { tag: 'mro', probe: cpOrder.f, extra: LE.concat(OFF_NO), noInv: true });
    item('MR-7', '(e) LİSTE SIRASI DEĞİŞİNCE KAPSAM DEĞİŞMEZ — istisna satır numarasına bağlı değildir: (1) tanımlı vektörü ret listesinin EN BAŞINA taşıyan sonda kopyası (yalnız sıra değişti; 59 + 9 vektör aynı) aynı girdide sınıfı YİNE o vektöre uygular (artık 1. satır; çıkış 3, HTTP / ret OWNER-ISTISNASIYLA-UYGUN); tanımlı vektörün ESKİ sırasına gelen başka vektör işaretlenmez; kenar istekleri kopyanın sırasıyla gördü; vektör kümesi kimliği sıraya bağlı olduğundan kopyada değişir (paket sondasında DEĞİŞMEDİ — V-1) · (2) statik: tanım tek yerde, vektör kimliği + vektör adı + yöntem + ham hedef olarak yazılı; karar işlevi ve alan işlevi satırı bu üçlüyle (ad · yöntem · ham hedef) arar; karar işlevinde sıra numarası / dizin erişimi yok; paket sondasının ret listesinde tanımla eşleşen TAM bir vektör var', () => {
      const oldIdx = VEC.deny.findIndex((v) => v.method === MR.method && v.url === MR.target); const vecO = parseVectors(cpOrder.t); const nf = fnSrc('narrowClassOf'); const vf = fnSrc('verdictsOf');
      const nfNoConst = nf.replace(/(NARROW_WHYS|NARROW_STATES|OFFPROBE_DECLARATIONS|OFFPROBE_RESULTS|match|whyNot)\[\d\]/g, '');
      const triple = 'x.name === NARROW.vectorName && x.method === NARROW.method && x.path === NARROW.rawTarget';
      const staticOk = /vectorId: 'D8E2-BOS-BAYT-KODLU', vectorName: 'varyant boş bayt kodlu', method: 'GET', rawTarget: '\/api\/portal\/cases%00\/admin',/.test(src) && (src.match(/^const NARROW = \{$/gm) || []).length === 1
        && nf.includes("x.group === 'deny' && " + triple) && vf.includes("x.group === 'deny' && " + triple) && !/\[\s*\d+\s*\]|indexOf|findIndex|\brows\[/.test(nfNoConst) && /match\.length === 1/.test(nf)
        && VEC.deny.filter((v) => v.method === MR.method && v.url === MR.target).length === 1 && VEC.denyBlock.split('\n').filter(isTargetLine).length === 1;
      const ok = cpOrder.t !== src && oldIdx > 0 && vecO.deny.length === 59 && vecO.allow.length === 9 && vecO.deny[0].url === MR.target && vecO.deny.map((v) => v.method + ' ' + v.url).sort().join('|') === VEC.deny.map((v) => v.method + ' ' + v.url).sort().join('|')
        && !!MRo.ev && MRo.code === 3 && vals(MRo).join('/') === HX + '/OLCULEMEYEN/OLCULEMEYEN/PASS' && N(MRo).state === 'UYGULANDI' && marked(MRo).length === 1 && marked(MRo)[0] === MRo.ev.rows[0] && MRo.ev.rows[0].path === MR.target && MRo.ev.rows[0].method === 'GET' && MRo.ev.rows[0].acceptedClass === MR.name
        && MRo.gt[0].url === MR.target && MRo.gt[0].exam === 'TAM' && MRo.ev.rows[oldIdx].path !== MR.target && MRo.ev.rows[oldIdx].acceptedClass === null && MRo.ev.rows[oldIdx].status === 403 && MRo.gtLocal.length === 1
        && MRo.ev.vectorSetId === vectorSetIdOf(vecO) && MRo.ev.vectorSetId !== vectorSetIdOf(VEC) && MRa.ev.vectorSetId === vectorSetIdOf(VEC) && mrRow(MRa) === MRa.ev.rows[oldIdx] && staticOk;
      return { ok, obs: `paket sondasında tanımlı vektörün sırası=${oldIdx + 1} · kopyada=${MRo.ev ? MRo.ev.rows.findIndex((x) => x.path === MR.target) + 1 : '?'} · kopya: çıkış=${MRo.code}, ${MRo.ev ? N(MRo).state : '?'}, işaretli=${MRo.ev ? marked(MRo).map((x) => x.method + ' ' + x.path).join() : '?'} · eski sıradaki satır=${MRo.ev ? MRo.ev.rows[oldIdx].method + ' ' + MRo.ev.rows[oldIdx].path + ' (sınıf ' + MRo.ev.rows[oldIdx].acceptedClass + ')' : '?'} · statik=${staticOk}` };
    });

    item('MR-8', '(f) ÜÇ SONUÇ ALANI BİRBİRİNE DÖNÜŞMEZ — dar sınıf yalnız durum kodu ölçütüne dokunur: AYNI girdide (tanımlı vektör incelenmiş 400) istisna UYGULANAN koşum ile UYGULANMAYAN koşum (yerel karşılaştırma ve beyan verilmedi) karşılaştırılır → kenar engelleme alanı (değer + nedenler + neden satırları + kayıt eki), katman doğrulaması alanı (değer + nedenler + kapsam sayısı) ve pozitif kontrol alanı BAYT DÜZEYİNDE AYNI; satır düzeyi katman kimliği, durum / kimlik / katman sayıları ve kalibrasyon aynı; değişen YALNIZ HTTP / ret alanıdır (FAIL → OWNER-ISTISNASIYLA-UYGUN; PASS değil) ve çıkış kodu (2 → 3); kenar engelleme iki koşumda da OLCULEMEYEN ve nedeni DURUM-KODU-OLCUTU-PASS-DEGIL — sağlıklı kenarın "temiz gözlem" sınıfı (ULASMAMA-BAGIMSIZ-KANITI-YOK) DEĞİL: dar sınıf koşumu temiz koşum gibi göstermez; kesinleştirme adımıyla uygulanan sınıfta da kenar engelleme ve katman alanları kesinleştirme öncesiyle aynı; istisna uygulanan hiçbir koşumda kenar engelleme / katman PASS değil', () => {
      const same = (f) => JSON.stringify(V(MRa)[f]) === JSON.stringify(V(MRa0)[f]); const st = (S, f) => JSON.stringify(S.sum.nameVerdict[f]);
      const applied = [MRa, MRb0].concat(MRo.ev ? [MRo] : []);
      const ok = N(MRa).state === 'UYGULANDI' && N(MRa0).state === 'UYGULANMADI' && same('edgeBlocking') && same('layerVerification') && same('positiveControl') && !same('httpReject') && V(MRa).httpReject.value === HX && V(MRa0).httpReject.value === 'FAIL' && MRa.code === 3 && MRa0.code === 2
        && layerVec(MRa) === layerVec(MRa0) && JSON.stringify(MRa.ev.outcomeCounts) === JSON.stringify(MRa0.ev.outcomeCounts) && JSON.stringify(MRa.ev.idSignalCounts) === JSON.stringify(MRa0.ev.idSignalCounts) && JSON.stringify(MRa.ev.layerCounts) === JSON.stringify(MRa0.ev.layerCounts) && JSON.stringify(MRa.ev.calibration) === JSON.stringify(MRa0.ev.calibration) && JSON.stringify(MRa.ev.coverage) === JSON.stringify(MRa0.ev.coverage)
        && reasonNames(MRa, 'edgeBlocking') === 'DURUM-KODU-OLCUTU-PASS-DEGIL×1' && reasonNames(S1, 'edgeBlocking') === NOEV + '×1' && V(MRa).layerVerification.coverage.provenApi === 0 && V(MRa).layerVerification.coverage.unverifiable === 59 && V(MRa).edgeBlocking.scope === V(S1).edgeBlocking.scope
        && !!finOk.rec && JSON.stringify(finOk.rec.nameVerdict.edgeBlocking) === st(MRf2, 'edgeBlocking') && JSON.stringify(finOk.rec.nameVerdict.layerVerification) === st(MRf2, 'layerVerification') && JSON.stringify(finOk.rec.nameVerdict.positiveControl) === st(MRf2, 'positiveControl') && JSON.stringify(finOk.rec.nameVerdict.httpReject) !== st(MRf2, 'httpReject')
        && applied.length === 3 && applied.every((S) => vals(S)[1] === 'OLCULEMEYEN' && vals(S)[2] === 'OLCULEMEYEN' && rc(S, 'edgeBlocking', NOEV) === 0);
      return { ok, obs: `uygulanan: ${brief(MRa)} || uygulanmayan (aynı girdi): ${brief(MRa0)} || kenar engelleme alanı aynı=${same('edgeBlocking')} · katman alanı aynı=${same('layerVerification')} · pozitif kontrol aynı=${same('positiveControl')} · HTTP / ret farklı=${!same('httpReject')} · kesinleştirme öncesi / sonrası kenar + katman aynı=${!!finOk.rec && JSON.stringify(finOk.rec.nameVerdict.edgeBlocking) === st(MRf2, 'edgeBlocking') && JSON.stringify(finOk.rec.nameVerdict.layerVerification) === st(MRf2, 'layerVerification')}` };
    });

    // MR-9 — kapılar. Geçersiz yerel adres girdileri kapı tutmasa bile yalnız geri döngüye / çözülmeyen (.invalid) bir ada gidebilecek değerlerdir.
    const badLocal = [`http://localhost:${LOCAL_PORT}`, `https://127.0.0.1:${LOCAL_PORT}`, `http://127.0.0.2:${LOCAL_PORT}`, 'http://127.0.0.1', `http://127.0.0.1:${LOCAL_PORT}/yol`, `http://127.0.0.1:${LOCAL_PORT}/`, `http://127.0.0.1:${LOCAL_PORT}?x=1`, `http://kullanici@127.0.0.1:${LOCAL_PORT}`, `http://yerel-kenar.invalid:${LOCAL_PORT}`, `http://localhost.invalid:${LOCAL_PORT}`, 'http://127.0.0.1:0', 'http://127.0.0.1:70000', `HTTP://127.0.0.1:${LOCAL_PORT}`, `http://[::1]:${LOCAL_PORT}`, `127.0.0.1:${LOCAL_PORT}`];
    const g9 = []; const tryGate = async (label, extra, base) => { const out = gateOut(); const g = await gate(mk(Object.assign({ out, extra }, base || {}))); g9.push({ label, code: g.code, seen: g.seen, seenLocal: g.seenLocal, wrote: fs.existsSync(out) || fs.existsSync(out.replace(/\.json$/, '.ozet.json')) }); };
    for (const v of badLocal) await tryGate('yerel adres ' + v.replace(String(LOCAL_PORT), '<port>'), ['--local-edge', v].concat(OFF_NO));
    await tryGate('--local-edge değersiz', OFF_NO.concat(['--local-edge'])); await tryGate('iki --local-edge', LE.concat(LE, OFF_NO));
    for (const v of ['EVET', 'kullanilmiyor', 'KULLANILMIYOR ', RES_OK, RES_BAD, 'BEYAN-YOK']) await tryGate('beyan ' + JSON.stringify(v), LE.concat(['--offprobe-evidence', v]));
    await tryGate('iki --offprobe-evidence', LE.concat(OFF_NO, OFF_YES)); await tryGate('--offprobe-result ölçüm çağrısında', LE.concat(OFF_YES, ['--offprobe-result', RES_OK]));
    await tryGate('--phone-list ile --local-edge', LE.concat(['--phone-list']), { out: null, vantage: null }); await tryGate('--phone-list ile --offprobe-evidence', OFF_NO.concat(['--phone-list']), { out: null, vantage: null });
    const fz = []; const tryFin = async (label, evPath, result, o, why) => { const r = await fin(evPath, result, o); fz.push({ label, code: r.code, seen: r.seen + r.seenLocal, wrote: r.wrote && !(o && o.out), why: r.why, want: why }); };
    const evJson = JSON.parse(MRf2.evBytes.toString('utf8')); const mkEvCopy = (name, fn) => { const o = JSON.parse(JSON.stringify(evJson)); fn(o); const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(o, null, 1)); return f; };
    const tIdx = evJson.rows.findIndex((x) => x.method === MR.method && x.path === MR.target);
    await tryFin('beyanı "kullanılmıyor" olan kanıt (sınıf koşum anında uygulanmış)', MRa.out, RES_OK, null, 'KANITTA-KESINLESTIRILECEK-BEYAN-YOK');
    await tryFin('beyansız kanıt (sağlıklı kenar)', S1.out, RES_OK, null, 'KANITTA-KESINLESTIRILECEK-BEYAN-YOK');
    await tryFin('beyansız kanıta elle "uygulandı" yazılmış', (() => { const o = JSON.parse(MRf1.evBytes.toString('utf8')); o.malformedRejectClass.state = 'UYGULANDI'; o.rows[tIdx].acceptedClass = MR.name; const f = path.join(dir, 'kanit-elle-uygulandi.json'); fs.writeFileSync(f, JSON.stringify(o)); return f; })(), RES_OK, null, 'KANITTA-KESINLESTIRILECEK-BEYAN-YOK');
    await tryFin('GEÇMİŞ KOŞUM: önceki revizyonun kanıtı (revizyon R06)', mkEvCopy('kanit-r06.json', (o) => { o.revision = 'R06'; }), RES_OK, null, 'KANIT-BU-SONDA-BAYTLARIYLA-YAZILMAMIS');
    await tryFin('GEÇMİŞ KOŞUM: başka sonda baytlarının kanıtı (pin farklı)', mkEvCopy('kanit-pin.json', (o) => { o.probeSha256 = '0'.repeat(64); }), RES_OK, null, 'KANIT-BU-SONDA-BAYTLARIYLA-YAZILMAMIS');
    await tryFin('başka vektör kümesinin kanıtı', mkEvCopy('kanit-vks.json', (o) => { o.vectorSetId = 'F'.repeat(64); }), RES_OK, null, 'KANIT-BU-SONDA-BAYTLARIYLA-YAZILMAMIS');
    await tryFin('başka ad kimliğiyle (AD-27, tam kapsam yetkisi kaydıyla)', MRf2.out, RES_OK, { alias: 'AD-27' }, 'KANIT-BU-AD-ICIN-DEGIL');
    await tryFin('başka konum etiketiyle', MRf2.out, RES_OK, { vantage: 'baska-konum' }, 'KANIT-BU-AD-ICIN-DEGIL');
    await tryFin('satırı elle değiştirilmiş kanıt (tanımlı satır 403 yapılmış)', mkEvCopy('kanit-satir.json', (o) => { o.rows[tIdx].status = 403; }), RES_OK, null, 'KANIT-KENDI-ICINDE-TUTARSIZ');
    await tryFin('satır sırası değiştirilmiş kanıt', mkEvCopy('kanit-sira.json', (o) => { const a = o.rows[0]; o.rows[0] = o.rows[tIdx]; o.rows[tIdx] = a; }), RES_OK, null, 'KANIT-SATIRLARI-VEKTOR-LISTESIYLE-AYNI-DEGIL');
    await tryFin('JSON olmayan dosya', (() => { const f = path.join(dir, 'kanit-bozuk.json'); fs.writeFileSync(f, 'JSON DEGIL'); return f; })(), RES_OK, null, 'KANIT-OKUNAMADI');
    await tryFin('olmayan dosya', path.join(dir, 'kanit-yok.json'), RES_OK, null, 'KANIT-OKUNAMADI');
    await tryFin('adsız özet dosyası (kanıt değil)', MRf2.sumPath, RES_OK, null, 'KANIT-BICIMI-GECERSIZ');
    await tryFin('başka --origin ile (başka ana makine; çözülmeyen ad — istek atılmaz)', MRf2.out, RES_OK, { origin: 'https://baska-ad.invalid' }, 'KANIT-BU-AD-ICIN-DEGIL');
    // Türetilmiş alanı elle çevrilmiş kanıtlar. Kaynak koşumlar: MRf3 (gövdesi bir bayt farklı, beyan "kullanılacak") ve MRf4 (içerik türü farklı, beyan "kullanılacak").
    const MRf4 = await scenario('mrcct', { tag: 'mrf4', extra: LE.concat(OFF_YES) });
    const mkCopyOf = (S, name, fn) => { const o = JSON.parse(S.evBytes.toString('utf8')); fn(o); const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(o, null, 1)); return p; };
    const tOf = (o) => o.rows.find((x) => x.method === MR.method && x.path === MR.target);
    await tryFin('YALNIZ türetilmiş "özet eşleşti" alanı elle çevrilmiş kanıt (gövdesi farklı koşum)', mkCopyOf(MRf3, 'kanit-ozet-eslesti.json', (o) => { tOf(o).examinedResponse.bodySha256Match = true; }), RES_OK, null, 'KANIT-KENDI-ICINDE-TUTARSIZ');
    await tryFin('"içerik türü eşleşti" alanı elle çevrilmiş kanıt (içerik türü farklı koşum)', mkCopyOf(MRf4, 'kanit-icerik-turu.json', (o) => { tOf(o).examinedResponse.contentTypeMatch = true; }), RES_OK, null, 'KANIT-KENDI-ICINDE-TUTARSIZ');
    await tryFin('ham özet + türetilmiş alan birlikte yeniden yazılmış ama koşul kaydı eski', mkCopyOf(MRf3, 'kanit-ham-ozet.json', (o) => { tOf(o).examinedResponse.bodySha256 = EXAM_SHA; tOf(o).examinedResponse.bodySha256Match = true; }), RES_OK, null, 'KANIT-KENDI-ICINDE-TUTARSIZ');
    // Karşı girdi: değiştirilmemiş MRf4 kanıtı kesinleştirilir (ret değil) ama sınıf uygulanmaz. SINIR kaydı (güvence DEĞİL): ham değerler,
    // türetilmiş alan VE koşul kaydı birlikte tutarlı yeniden yazılırsa adım bunu AYIRT EDEMEZ — yalnız koşum anında kaydedilen ham kanıt
    // SHA-256'sı ile kesinleştirme kaydındaki kaynak özetinin karşılaştırılması gösterir (sonda ölçemez; belge §1).
    const finCt = await fin(MRf4.out, RES_OK);
    const rewritten = mkCopyOf(MRf3, 'kanit-tutarli-yeniden-yazim.json', (o) => { tOf(o).examinedResponse.bodySha256 = EXAM_SHA; tOf(o).examinedResponse.bodySha256Match = true; o.malformedRejectClass.conditions.examinedResponseMatches = true; });
    const finRewrite = await fin(rewritten, RES_OK);
    const finNoRes = await fin(MRf2.out, null); const finBadRes = await fin(MRf2.out, 'KULLANILMIYOR'); const finWithLocal = await fin(MRf2.out, RES_OK, { extra: LE }); const finWithPhone = await fin(MRf2.out, RES_OK, { extra: ['--phone-list'] });
    const exFin = gateOut(); fs.writeFileSync(exFin, 'VAR-OLAN-KAYIT'); const finExists = await fin(MRf2.out, RES_OK, { out: exFin });
    item('MR-9', 'DAR SINIF KAPILARI (tanınmayan girdi sessizce "yok" sayılmaz; hepsinde çıkış 4, sahte kenara ve sahte yerel kenara HİÇ istek gitmez, kanıt yazılmaz): (1) yerel kenar adresi yalnız geri döngü + düz http + port: https · başka geri döngü adresi · portsuz · yollu · sorgulu · kimlikli · başka ad · port 0 / 70000 · büyük harfli şema · IPv6 geri döngü · şemasız · değersiz · iki kez → RET; `localhost` ADI da RET (yalnız 127.0.0.1 adresi — ad çözümlemesine bağlı olmasın); karşı girdi: http://127.0.0.1:<port> kabul edilir ve sınıf uygulanır (MR-1) · (2) beyan yalnız KULLANILMIYOR / KULLANILACAK: başka değer, küçük harf, sondaki boşluk, SONUÇ değerleri (sonuç koşum anında verilemez), iki kez → RET · (3) --offprobe-result ölçüm çağrısında, --phone-list ile yerel adres / beyan → RET · (4) kesinleştirme adımının retleri (hepsinde istek yok, kayıt yazılmaz, neden sınıfı yazılır): beyanı "kullanılmıyor" olan ya da beyansız kanıt · elle "uygulandı" yazılmış beyansız kanıt · GEÇMİŞ KOŞUMA GERİYE DÖNÜK UYGULANMAZ: önceki revizyonun (R06) ya da başka sonda baytlarının / başka vektör kümesinin kanıtı · başka ad kimliği / konum etiketi · satırı elle değiştirilmiş ya da sırası değiştirilmiş kanıt · JSON olmayan / olmayan dosya · adsız özet · sonuç verilmedi / sonuç tanınmıyor · --local-edge ya da --phone-list ile birlikte · kayıt dosyası zaten var (üzerine yazılmaz) · başka --origin (başka ana makine) · YALNIZ türetilmiş "özet eşleşti" ya da "içerik türü eşleşti" alanı elle çevrilmiş kanıt, ham özeti de yeniden yazılmış ama koşul kaydı eski kanıt → KENDİ İÇİNDE TUTARSIZ (karar ham özetle verilir; yeniden türetilen beş koşul kanıttaki kayıtla karşılaştırılır); karşı girdi: aynı kanıtların değiştirilmemiş hali kesinleştirilir ama sınıf uygulanmaz · SINIR KAYDI (güvence değil): ham değerleri, türetilmiş alanı ve koşul kaydı birlikte tutarlı yeniden yazılmış kanıt AYIRT EDİLEMEZ (sınıf uygulanır) — yalnız kaynak özetinin koşum anında kaydedilen özetle karşılaştırılması gösterir', () => {
      const gatesOk = g9.length === badLocal.length + 2 + 6 + 2 + 2 && g9.every((x) => x.code === 4 && x.seen === 0 && x.seenLocal === 0 && !x.wrote);
      const finOkAll = fz.length === 17 && fz.every((x) => x.code === 4 && x.seen === 0 && !x.wrote && x.why === x.want);
      const misc = [finNoRes, finBadRes, finWithLocal, finWithPhone].every((r) => r.code === 4 && r.seen === 0 && r.seenLocal === 0 && !r.wrote) && finExists.code === 4 && finExists.seen === 0 && fs.readFileSync(exFin, 'utf8') === 'VAR-OLAN-KAYIT';
      const ok = gatesOk && finOkAll && misc && badLocal.includes(`http://localhost:${LOCAL_PORT}`) && sha(fs.readFileSync(MRf2.out)) === f2Before.ev && sha(fs.readFileSync(MRf3.out)) === f3Before
        && finCt.code === 2 && finCt.seen === 0 && !!finCt.rec && finCt.rec.malformedRejectClass.state === 'UYGULANMADI' && finCt.rec.malformedRejectClass.whyNot.join() === W.resp
        && finRewrite.code === 3 && !!finRewrite.rec && finRewrite.rec.malformedRejectClass.state === 'UYGULANDI' && finRewrite.rec.sourceEvidenceSha256 !== f3Before && finRewrite.rec.sourceEvidenceSha256 === sha(fs.readFileSync(rewritten));
      return { ok, obs: `kapı girdisi=${g9.length} · çıkış 4 + istek 0 olan=${g9.filter((x) => x.code === 4 && x.seen === 0 && x.seenLocal === 0 && !x.wrote).length}${g9.filter((x) => !(x.code === 4 && x.seen === 0 && x.seenLocal === 0 && !x.wrote)).slice(0, 4).map((x) => ` [${x.label}→${x.code}/${x.seen}/${x.seenLocal}]`).join('')} · kesinleştirme reddi=${fz.length}, beklenen nedenle reddedilen=${fz.filter((x) => x.code === 4 && x.seen === 0 && !x.wrote && x.why === x.want).length}${fz.filter((x) => !(x.code === 4 && x.why === x.want)).slice(0, 4).map((x) => ` [${x.label}→${x.code}/${x.why}]`).join('')} · sonuçsuz / tanınmayan sonuç / yerel adresle / telefonla=${[finNoRes, finBadRes, finWithLocal, finWithPhone].map((r) => r.code).join(',')} · kayıt varken=${finExists.code} · değiştirilmemiş içerik türü farklı kanıt GECERLI ile: çıkış=${finCt.code}, ${finCt.rec ? finCt.rec.malformedRejectClass.state : '?'} · SINIR (ölçülemez): ham değerleri ve koşul kaydı birlikte tutarlı yeniden yazılmış kanıt → çıkış=${finRewrite.code}, ${finRewrite.rec ? finRewrite.rec.malformedRejectClass.state : '?'}; kaynak özeti koşumdaki kanıtın özetinden farklı=${!!finRewrite.rec && finRewrite.rec.sourceEvidenceSha256 !== f3Before}` };
    });

    item('MR-10', 'OWNER ŞARTI (2026-10-06): "İstisna uygulanan HTTP 400 satırını \'HTTP/ret PASS\' diye sunma." — dar sınıfın UYGULANDIĞI her koşumda (koşum anında uygulanan iki koşum · sırası değiştirilmiş kopya · kesinleştirme adımıyla uygulanan kayıt): HTTP / ret alanı PASS DEĞİL, ayrı değer OWNER-ISTISNASIYLA-UYGUN — ham kanıtta, adsız özette, çıktının alan satırında (D8-HTTP-RET) ve "HTTP / RET SONUCU" satırında, kesinleştirme kaydında ve çıktısında; o satırın GERÇEK HTTP kodu 400 olarak kalır (zemin gerçeği 400 = kanıt satırı 400 = çıktı satırı 400; durum sınıfı DORTYUZ-403-DISI; 403 sayısına girmez) ve sınıfın adı o satırda ayrı görünür; çıktı bu değerin owner kabul kuralına dayandığını ve 403 başarısı OLMADIĞINI açıkça söyler; kenar engelleme, katman doğrulaması ve pozitif kontrol bu değeri HİÇ almaz (üçü yalnız PASS / FAIL / OLCULEMEYEN) ve kenar / katman PASS değildir; çıkış kodu 3 (eşleme değişmedi: değer FAIL değildir); değer sınıfın uygulanmadığı hiçbir koşumun alanında ya da çıktısında geçmez; karşı girdiler: aynı girdide sınıf uygulanmayınca alan FAIL, kesinleştirme GECERSIZ ile alan FAIL, sağlıklı kenarda (59 / 59 gerçek 403) alan PASS — R06 davranışı aynen; statik: ek değer sondanın kod satırlarında TEK sabittir, alan değerleri kümesi (PASS / FAIL / OLCULEMEYEN) ve çıkış kodu işlevi değişmedi, değer yalnız "kapatıcı PASS dedi VE tam bir satır dar sınıfta" iken yazılır', () => {
      const runs = [MRa, MRb0].concat(MRo.ev ? [MRo] : []); const TXT = '403 başarısı DEĞİLDİR, owner kabul kuralına dayanır';
      const runOk = (S) => { const x = mrRow(S); const g = S.gt.find((s) => s.method === MR.method && s.url === MR.target); const v = vals(S); const rowLine = S.log.split(/\r?\n/).find((l) => /^deny /.test(l) && l.includes(' ' + MR.target + ' ')) || '';
        return v[0] === HX && v[0] !== 'PASS' && S.sum.nameVerdict.httpReject.value === HX && S.ev.nameVerdict.httpReject.value === HX && /^D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN$/m.test(S.log) && !/^D8-HTTP-RET=PASS$/m.test(S.log)
          && /^HTTP \/ RET SONUCU\s*: OWNER-ISTISNASIYLA-UYGUN — /m.test(S.log) && !/^HTTP \/ RET SONUCU\s*: PASS/m.test(S.log) && S.log.includes(TXT)
          && !!g && g.status === 400 && x.status === 400 && x.outcome === 'DORTYUZ-403-DISI' && x.statusExpected === false && x.acceptedClass === MR.name && /\s400\s+durum=DORTYUZ-403-DISI\s/.test(rowLine) && rowLine.includes('sınıf="' + MR.name + '"')
          && V(S).httpReject.counts.status403 === 58 && V(S).httpReject.counts.narrowClass === 1 && S.sum.outcomeCounts.deny['RET-403'] === 58
          && v.slice(1).every((y) => FIELD_VALUES.includes(y)) && v[1] === 'OLCULEMEYEN' && v[2] === 'OLCULEMEYEN' && v[3] === 'PASS' && S.code === 3 && S.ev.exitCode === 3 && S.sum.exitCode === 3; };
      const fr = finOk.rec; const finHttp = !!fr && fr.nameVerdict.httpReject.value === HX && fr.sourceNameVerdictValues.split('/')[0] === 'FAIL' && /^D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN$/m.test(finOk.log) && !/^D8-HTTP-RET=PASS$/m.test(finOk.log) && finOk.log.includes(TXT)
        && FIELDS.slice(1).every((f) => FIELD_VALUES.includes(fr.nameVerdict[f].value)) && fr.nameVerdict.edgeBlocking.value === 'OLCULEMEYEN' && fr.nameVerdict.layerVerification.value === 'OLCULEMEYEN' && finOk.code === 3 && !JSON.stringify(fr.nameVerdict.httpReject).includes('"PASS"');
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const staticOk = (code.match(/'OWNER-ISTISNASIYLA-UYGUN'/g) || []).length === 1 && /^const HTTP_OWNER_EXCEPTION = 'OWNER-ISTISNASIYLA-UYGUN';$/m.test(src) && /^const FIELD_VALUES = \['PASS', 'FAIL', 'OLCULEMEYEN'\];$/m.test(src)
        && /\(closedH === 'PASS' && narrow\.length === 1\) \? HTTP_OWNER_EXCEPTION : closedH/.test(fnSrc('verdictsOf')) && (fnSrc('verdictsOf').match(/HTTP_OWNER_EXCEPTION/g) || []).length === 1 && /return vals\.includes\('FAIL'\) \? 2 : 3;/.test(fnSrc('exitCodeOf')) && /if \(!strict403\) E\.flag\(/.test(fnSrc('verdictsOf'));
      const others = ALL.filter((S) => !runs.includes(S)); const leak = others.filter((S) => vals(S).includes(HX) || S.log.includes(HX) || FIELDS.some((f) => S.sum.nameVerdict[f].value === HX)).length;
      const ok = runs.length === 3 && runs.every(runOk) && finHttp && staticOk && others.length >= 100 && leak === 0 && V(MRa0).httpReject.value === 'FAIL' && finBad.rec.nameVerdict.httpReject.value === 'FAIL' && V(S1).httpReject.value === 'PASS' && /^D8-HTTP-RET=PASS$/m.test(S1.log);
      return { ok, obs: runs.map((S) => `${S.tag}: alanlar=${vals(S).join('/')}, satır HTTP ${mrRow(S).status} (zemin gerçeği ${(S.gt.find((s) => s.method === MR.method && s.url === MR.target) || {}).status}), çıkış=${S.code}`).join(' · ') + ` || kesinleştirme kaydı: http=${fr ? fr.nameVerdict.httpReject.value : '?'}, çıkış=${finOk.code} || değerin geçtiği başka koşum=${leak}/${others.length} · aynı girdi sınıfsız=${V(MRa0).httpReject.value} · sağlıklı kenar=${V(S1).httpReject.value} · statik=${staticOk}` };
    });

    // ── Bütün koşumlarda değişmezler (zemin gerçeğiyle) ve çıkış kodu eşlemesi ──
    item('GT-1', 'DEĞİŞMEZLER — paket sondasının sahte kenara karşı BÜTÜN koşumlarında (zemin gerçeğiyle): (1) dört alanın her biri yalnız PASS / FAIL / OLCULEMEYEN — R07: yalnız HTTP / ret alanı, yalnız dar sınıfın bağımsız beklendiği koşumda, PASS yerine OWNER-ISTISNASIYLA-UYGUN alır; diğer üç alan bu değeri hiç almaz ve değer başka hiçbir koşumun çıktısında geçmez · (2) her satırın kimlik anlamı, kenarın gördüğü kimlik (kaynak deseni kabul eder mi) × kenarın yazdığı yanıt değerinden BAĞIMSIZ türetilenle aynı · (3) API\'nin "değiştirme" ile üretmediği HİÇBİR yanıt UYGULAMA-API sayılmaz (SINIR-1 kaydı hariç) · (4) HİÇBİR satır "API değil" diye sınıflanmaz: katman kimliği yalnız UYGULAMA-API / OLCULEMEYEN / SONUC-YOK (başlık yokluğu kanıt değil) · (5) katman doğrulaması hiçbir koşumda PASS değil · (6) KENAR ENGELLEME HİÇBİR KOŞUMDA PASS DEĞİL; "temiz gözlem" neden sınıfı (ULASMAMA-BAGIMSIZ-KANITI-YOK) yalnız TEK BAŞINA yazılır ve o zaman: HTTP / ret PASS, pozitif kontrol PASS, kalibrasyon VAR, hiçbir yanıtta azaltım işareti yok, hiçbir ret yanıtında ve modelin "API yazamaz" dediği hiçbir yanıtta kimlik başlığı yok — bu sınıftaki koşumlar arasında zemin gerçeğinde hem "bütün ret yanıtlarını kenar üretti" hem "bir ret yanıtını API üretti" olan VAR (sonda ikisini ayırt edemez; ikisi de OLCULEMEYEN) · (7) HTTP / ret değeri ret vektörlerinin durum kodlarından bağımsız türetilenle aynı (R07: dar sınıfın zemin gerçeğinden bağımsız beklendiği TEK satır dışında) · (8) bir ret vektörü 2xx aldıysa kenar engelleme FAIL · (9) kanıtta / çıktıda "karar bekliyor" ya da "değerlendirme gerekir" yok · (10) pozitif kontrol değeri, kenarın verdiği durum kodlarından ve vektörün beklenen kodundan bağımsız türetilenle aynı (beklenen kod → uygun · yanıt yok → OLCULEMEYEN · doğrulanmış başka HER yanıt, 403 dahil → FAIL; gönderilen kimlik biçimi girmez) · (11) API\'ye ulaşma nedeni kayıttaysa kenar engelleme FAIL (kanıt silinmez) · (12) katman doğrulaması FAIL yalnız koşumun kalibrasyonu "değiştirme" davranışını en az bir kez gösterdiyse verilir; göstermediyse aynı gözlem katmanda OLCULEMEYEN\'dir (ikinci SINIR-1 kaydı dahil) · (13) hiçbir koşumun çıkış kodu 0 değil; kanıtta ve çıktıda "API değil" / API-DEGIL / DOGRULANDI yok · (14) R07 — DAR SINIF ("İzin verilen bozuk istek reddi — katman doğrulanmadı") yalnız ve yalnız zemin gerçeği + verilen argümanlar bağımsız beklentiyi veriyorsa uygulanır (sahte kenar incelenmiş 400 yanıtını birebir ve yalnız tanımlı isteğe verdi · kimlik başlığı yok · sahte yerel kenar aynı ham hedefi dış adın Host başlığıyla tam bir kez gördü ve kimlik başlıksız 403 verdi · beyan "kullanılmıyor"): o koşumlarda TAM bir satır — tanımlı (yöntem, ham hedef) satırı — sınıfın tam adını taşır ve ad çıktıda görünür; diğer BÜTÜN koşumlarda hiçbir satır işaretli değildir, durum UYGULANDI değildir ve sınıfın adı çıktıda yoktur; her satır sınıf alanını taşır', () => {
      const bad = []; let cleanEdge = 0; let cleanApi = 0; let narrowRuns = 0;
      for (const S of ALL) {
        try {
          const j = J(S); const v = vals(S); const d = j.filter((p) => p.row.group === 'deny'); const st = d.map((p) => p.gt.status);
          if (!v.every((x, i) => FIELD_VALUES.includes(x) || (i === 0 && x === HX))) bad.push(S.tag + ':alan-degeri');
          if (!j.every((p) => p.row.idSignal === gtSignal(p.gt))) bad.push(S.tag + ':kimlik-anlami');
          if (S.limit !== 'SINIR-1' && j.some((p) => p.row.layerId === 'UYGULAMA-API' && !(p.gt.producer === 'api' && p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other'))) bad.push(S.tag + ':API-olmayan-API-sayildi');
          if (j.some((p) => !LAYER_ID_SET.includes(p.row.layerId)) || Object.keys(S.ev.layerCounts.deny).concat(Object.keys(S.ev.layerCounts.allow)).some((k) => !LAYER_ID_SET.includes(k))) bad.push(S.tag + ':API-degil-sinifi');
          if (v[2] === 'PASS') bad.push(S.tag + ':katman-PASS');
          if (v[1] === 'PASS') bad.push(S.tag + ':kenar-PASS');
          // "Temiz gözlem" neden sınıfı yalnız tek başına yazılır; yazıldığında zemin gerçeğinde: hiçbir ret yanıtı kimlik başlığı taşımıyor, modelin
          // "API yazamaz" dediği hiçbir yanıtta (ön uçuş · ara katmanla eşleşmeyen / çözülemeyen yol) kimlik başlığı yok, hiçbir yanıtta azaltım işareti yok.
          const nClean = rc(S, 'edgeBlocking', NOEV);
          if (nClean > 0 && !(V(S).edgeBlocking.reasons.length === 1 && v[1] === 'OLCULEMEYEN' && v[0] === 'PASS' && v[3] === 'PASS' && S.ev.calibration.result === 'VAR' && j.every((p) => p.gt.mark === 'YOK') && d.every((p) => p.gt.echoed === 'none' && p.gt.status === 403)
            && j.every((p) => apiMw(p.gt.method, p.gt.url) === 'CALISIR' || p.gt.echoed === 'none'))) bad.push(S.tag + ':temiz-gozlem-kosulsuz');
          if (nClean > 0) { if (d.every((p) => p.gt.producer === 'edge')) cleanEdge++; else if (d.some((p) => p.gt.producer === 'api')) cleanApi++; }
          // (14) Dar sınıf: bağımsız beklenti (zemin gerçeği + argümanlar) ↔ sondanın kaydı, satırı ve çıktısı.
          const exp = mrExpected(S); const mk14 = S.ev.rows.filter((x) => x.acceptedClass !== null); if (exp) narrowRuns++;
          if ((N(S).state === 'UYGULANDI') !== exp || mk14.length !== (exp ? 1 : 0) || (exp && !(mk14[0].method === MR.method && mk14[0].path === MR.target && mk14[0].acceptedClass === MR.name && mk14[0].status === 400)) || S.ev.rows.some((x) => !('acceptedClass' in x)) || N(S).appliedRows !== (exp ? 1 : 0) || V(S).httpReject.counts.narrowClass !== (exp ? 1 : 0) || S.sum.malformedRejectClass.state !== N(S).state) bad.push(S.tag + ':dar-sinif');
          if (S.log.includes(MR.name) !== exp || /^D8-DAR-SINIF=UYGULANDI$/m.test(S.log) !== exp) bad.push(S.tag + ':dar-sinif-cikti');
          // (7) Dar sınıfın bağımsız beklendiği TEK satır durum kodu ölçütünün dışındadır; diğer her satır eski kuralla.
          const stH = d.filter((p) => !(exp && p.gt.method === MR.method && p.gt.url === MR.target)).map((p) => p.gt.status); if (stH.length !== d.length - (exp ? 1 : 0)) bad.push(S.tag + ':dar-sinif-satir-sayisi');
          const wantH = stH.some((s) => s !== 0 && s !== 403) ? 'FAIL' : (stH.some((s) => s === 0) ? 'OLCULEMEYEN' : 'PASS'); const wantHx = (exp && wantH === 'PASS') ? HX : wantH; if (v[0] !== wantHx) bad.push(S.tag + ':http-ret');
          if ((v[0] === HX) !== exp || v.slice(1).includes(HX) || S.log.includes(HX) !== exp || (exp && (v[0] === 'PASS' || S.sum.nameVerdict.httpReject.value !== HX))) bad.push(S.tag + ':owner-istisnasi-degeri');
          if (st.some((s) => s >= 200 && s < 300) && v[1] !== 'FAIL') bad.push(S.tag + ':2xx-kenar-FAIL-degil');
          const txtAll = S.log + S.evBytes.toString('utf8') + S.sumBytes.toString('utf8');
          if (/KARAR-BEKLIYOR|pendingOwnerDecision|DEGERLENDIRME|OWNER KARARI BEKL/i.test(txtAll)) bad.push(S.tag + ':karar-bekliyor');
          // (10) Pozitif kontrol — yalnız kenarın VERDİĞİ durum kodlarından ve vektörün beklenen kodundan (bu dosyanın kaynaktan okuduğu liste) bağımsız türetilir; gönderilen kimlik biçimi ve katman kimliği girmez; 403 istisnası yok.
          const al = j.map((p, i) => ({ p, exp: VEC.all[i].expect })).filter((x) => x.p.row.group === 'allow');
          const wantP = al.some((x) => x.p.gt.status !== 0 && !x.exp.includes(x.p.gt.status)) ? 'FAIL' : (al.every((x) => x.exp.includes(x.p.gt.status)) ? 'PASS' : 'OLCULEMEYEN'); if (al.length !== VEC.allow.length || v[3] !== wantP) bad.push(S.tag + ':pozitif-kontrol');
          // (11) API'ye ulaşma nedeni kayıttaysa kenar engelleme FAIL'dir (kanıt silinmez); (12) katman doğrulaması FAIL ancak koşumun kalibrasyonu "değiştirme" davranışını en az bir kez gösterdiyse verilir — göstermediyse aynı gözlem katmanda OLCULEMEYEN'dir.
          const nApi = rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI'); const shown = S.ev.calibration.apiReplace >= 1;
          if (nApi > 0 && v[1] !== 'FAIL') bad.push(S.tag + ':kanitli-ihlal-silindi');
          if ((v[2] === 'FAIL' && !shown) || (nApi > 0 && v[2] !== (shown ? 'FAIL' : 'OLCULEMEYEN'))) bad.push(S.tag + ':katman-kalibrasyon-kurali');
          // (13) çıkış 0 hiç yok; "API değil" / DOGRULANDI hiçbir çıktıda yok.
          if (S.code === 0 || S.ev.exitCode === 0 || /^D8-CIKIS=0$/m.test(S.log)) bad.push(S.tag + ':cikis-0');
          if (/API değil|API-DEGIL|DOGRULANDI|shownNotApi/.test(txtAll)) bad.push(S.tag + ':eski-ifade');
        } catch (e) { bad.push(S.tag + ':DEGERLENDIRILEMEDI'); }
      }
      return { ok: ALL.length >= 109 && bad.length === 0 && ALL.filter((S) => S.limit).length === 3 && cleanEdge >= 5 && cleanApi === 1 && narrowRuns === 2, obs: `taranan koşum=${ALL.length} · ihlal=${bad.length}${bad.length ? ' [' + bad.slice(0, 8).join(' ') + ']' : ''} · sınır kaydı=${ALL.filter((S) => S.limit).length} · "temiz gözlem" sınıfındaki koşum: bütün ret yanıtlarını kenar üretti=${cleanEdge}, bir ret yanıtını API üretti=${cleanApi} (hepsi OLCULEMEYEN) · dar sınıfın bağımsız beklendiği koşum=${narrowRuns} (diğer ${ALL.length - narrowRuns} koşumda uygulanmadı)` };
    });
    item('X-1', 'ÇIKIŞ KODU EŞLEMESİ (bütün koşumlarda; eşleme bu dosyada bağımsız yazılıdır): herhangi bir alan FAIL (pozitif kontrol dahil) → 2 · FAIL yok → 3; ÖLÇÜM KOŞUMU 0 ÜRETMEZ (sağlıklı kenar dahil — belirsizlik başarı gibi sunulmaz); sürecin çıkış kodu = ham kanıt = adsız özet = D8-CIKIS satırı; çıktıdaki dört alan satırı kanıttaki değerlerle aynı; yalnız iki kod (2, 3) gözlendi; 0, 5 (ya da başka bir kod) HİÇ üretilmedi; kanıttaki eşleme metni "FAIL yok → 3" ve "0 üretmez" der; çıkış 2 veren koşumlar arasında yalnız durum kodu ölçütü FAIL olan, yalnız kenar engelleme + katman FAIL olan, yalnız kenar engelleme FAIL olan (katman OLCULEMEYEN) ve yalnız pozitif kontrol FAIL olan ayrı ayrı var', () => {
      const bad = []; const codes = new Set(); const shapes = new Set();
      for (const S of ALL) {
        try {
          const v = vals(S); codes.add(S.code); if (S.code === 2) shapes.add(v.map((x) => (x === 'FAIL' ? 'F' : '-')).join(''));
          const line = (k) => (new RegExp('^' + k + '=(.*)$', 'm').exec(S.log) || [])[1];
          if (S.code !== exitOf(v) || S.ev.exitCode !== S.code || S.sum.exitCode !== S.code || line('D8-CIKIS') !== String(S.code)) bad.push(S.tag + ':kod');
          if (line('D8-HTTP-RET') !== v[0] || line('D8-KENAR-ENGELLEME') !== v[1] || line('D8-KATMAN-DOGRULAMA') !== v[2] || line('D8-POZITIF-KONTROL') !== v[3]) bad.push(S.tag + ':satir');
          if (JSON.stringify(FIELDS.map((f) => S.sum.nameVerdict[f].value)) !== JSON.stringify(v)) bad.push(S.tag + ':ozet');
        } catch (e) { bad.push(S.tag + ':DEGERLENDIRILEMEDI'); }
      }
      const map = String(S1.ev.exitCodeMap);
      const ok = bad.length === 0 && [...codes].sort().join() === '2,3' && S1.code === 3 && /FAIL yok → 3/.test(map) && /0 üretmez/.test(map) && !/→ 0/.test(map) && shapes.has('F---') && shapes.has('-FF-') && shapes.has('-F--') && shapes.has('---F') && shapes.has('FFF-');
      return { ok, obs: `taranan koşum=${ALL.length} · ihlal=${bad.length}${bad.length ? ' [' + bad.slice(0, 8).join(' ') + ']' : ''} · görülen çıkış kodları=${[...codes].sort().join(',')} · sağlıklı kenar (S1) çıkış=${S1.code} · çıkış 2 biçimleri (http·kenar·katman·pozitif)=${[...shapes].sort().join(' ')}` };
    });

    // X-2 — katman doğrulaması alanına tanınmayan bir değer yazan sonda KOPYASI (yalnız o ifade değişti); sağlıklı kenar.
    const x2probe = path.join(dir, 'd8-staff-surface-probe.deger.js'); const x2src = src.replace('const layerVerification = { value: L.closeNoPass(false, null),', () => "const layerVerification = { value: 'BILINMIYOR',"); fs.writeFileSync(x2probe, x2src);
    const X2r = await scenario('ok', { tag: 'x2', probe: x2probe, noInv: true });
    item('X-2', 'TANINMAYAN alan değeri de çıkış 0 vermez: bir alana (katman doğrulaması) tanınmayan bir değer yazan sonda kopyası, sağlıklı kenarda — HTTP / ret PASS, kenar engelleme OLCULEMEYEN, pozitif kontrol PASS → çıkış 3 (0 değil, 2 de değil): çıkış kodu işlevi FAIL yoksa her durumda "ölçülemeyen" verir', () => {
      const v = X2r.ev ? X2r.ev.nameVerdict : null;
      const ok = x2src !== src && X2r.code === 3 && !!v && X2r.ev.exitCode === 3 && v.httpReject.value === 'PASS' && v.edgeBlocking.value === 'OLCULEMEYEN' && v.positiveControl.value === 'PASS' && v.layerVerification.value === 'BILINMIYOR' && X2r.gt.length === VEC.all.length && /^D8-CIKIS=3$/m.test(X2r.log) && S1.code === 3;
      return { ok, obs: `kopya değişti=${x2src !== src} · çıkış=${X2r.code} · alanlar=${v ? FIELDS.map((f) => v[f].value).join('/') : '?'} · S1 çıkış=${S1.code}` };
    });

    // ── Adsız özet ve vektör kümesi kimliği ──
    const SUMMARY_KEYS = ['record', 'revision', 'nameAlias', 'vantage', 'probeSha256', 'vectorSetId', 'scopeAuthorization', 'vectorCounts', 'requestProfile', 'coverage', 'outcomeCounts', 'errorClassCounts', 'idSignalCounts', 'layerCounts', 'calibration', 'nameVerdict', 'malformedRejectClass', 'exitCodeMap', 'startedAt', 'finishedAt', 'exitCode'].sort().join();
    const longPaths = Array.from(new Set(VEC.all.map((v) => v.url.split('?')[0]).filter((p) => p.length >= 4)));
    const summaryClean = (S) => {
      const t = S.sumBytes.toString('utf8'); const low = t.toLowerCase(); const keys = []; (function walk(o) { if (o && typeof o === 'object') for (const k of Object.keys(o)) { keys.push(k); walk(o[k]); } })(S.sum);
      const d = rowsOf(S, 'deny'); const oc = S.sum.outcomeCounts.deny; const lc = S.sum.layerCounts.deny; const ic = S.sum.idSignalCounts.deny; const sum = (m) => Object.keys(m).reduce((a, k) => a + m[k], 0);
      return !low.includes('localhost') && !low.includes('127.0.0.1') && !/https?:\/\//.test(low) && longPaths.every((p) => !t.includes(p)) && !/d8probe|x=1|%2f|%61/i.test(t) && !/cloudflare|caddy|cf-ray|cf-mitigated/i.test(t)
        && sum(ic) === d.length && ic.DEGISTIRME === d.filter((x) => x.idSignal === 'DEGISTIRME').length && ic.YANSIMA === d.filter((x) => x.idSignal === 'YANSIMA').length && ic['YABANCI-KIMLIK'] === d.filter((x) => x.idSignal === 'YABANCI-KIMLIK').length
        && ic.DEGISTIRME === S.gt.filter((s, i) => S.ev.rows[i].group === 'deny' && gtSignal(s) === 'DEGISTIRME').length
        && Object.keys(S.sum).sort().join() === SUMMARY_KEYS && !keys.some((k) => /^(rows|findings|path|method|name|originHost|ifPassed|hints|layerHint|hintsOnly|error|message|location|requestId|sent|file|sha256|date|review|reviewer)$/i.test(k))
        && !/ECONN|ENOTFOUND|getaddrinfo|connect |certificate|self.signed/i.test(t) && S.sum.probeSha256 === sha(fs.readFileSync(S.probe || PROBE)) && S.sum.revision === 'R07' && S.sum.exitCode === S.code && S.sum.exitCode !== 0
        && Object.keys(S.sum.nameVerdict).sort().join() === FIELDS.slice().sort().join() && FIELDS.every((f) => S.sum.nameVerdict[f].value === V(S)[f].value && S.sum.nameVerdict[f].reasons.length === V(S)[f].reasons.length && S.sum.nameVerdict[f].reasons.every((r) => Object.keys(r).sort().join() === 'count,reason,value'))
        && JSON.stringify(S.sum.nameVerdict.layerVerification.coverage) === JSON.stringify(V(S).layerVerification.coverage) && Object.keys(S.sum.scopeAuthorization).sort().join() === 'contentReview,fileIntegrity,itemTypes,required,status' && Object.keys(S.sum.nameVerdict.layerVerification.coverage).sort().join() === 'denyRows,provenApi,unverifiable,unverifiableByReason'
        && oc['RET-403'] + oc['SINAMA-ISARETLI-403'] + oc['TANINMAYAN-AZALTIM-ISARETLI-403'] === d.filter((x) => x.status === 403).length && oc['SINAMA-ISARETLI-403'] === S.gt.filter((s, i) => S.ev.rows[i].group === 'deny' && s.challenge).length
        && sum(oc) === d.length && sum(lc) === d.length && lc['UYGULAMA-API'] === d.filter((x) => x.layerId === 'UYGULAMA-API').length && S.sum.vectorCounts.total === S.ev.rows.length && JSON.stringify(S.sum.calibration) === JSON.stringify(S.ev.calibration);
    };
    item('O-2', 'adsız özet (sağlıklı · sızıntılı [AD-2] · yönlendirmeli · API\'nin 403\'ü · tekdüze 403 · yansıtan katman · sınama işaretli · damgalayan katman + sızıntı · taşıma hatalı · kapsam yetkisi kayıtlı · birleşik belgeli · başlığı silinen API 403\'ü · (R07) dar sınıfın uygulandığı koşumlarında): ana makine adı / adres / URL yok (dar sınıf kaydı özete ham yol, yöntem ve yerel adres olmadan yazılır — yalnız vektör kimliği, durum, koşullar, nedenler); inceleyen / inceleme beyanı alanı yok (yalnız "beyan var" durumu); vektör yollarının hiçbiri yok; satır, bulgu listesi, hata metni, yönlendirme hedefi, ipucu, sağlayıcı / kenar adı, gönderilen kimlik, kanıt dosyası yolu / özeti / tarihi alanı yok; üst düzey alan kümesi sabit; sondanın SHA-256\'sı, ad kimliği, dört alan (nedenleri yalnız değer + neden + sayı), katman kapsam sayısı, çıkış kodu, durum / kimlik anlamı / katman sayıları ham kanıtla ve zemin gerçeğiyle uyumlu', () => {
      const list = [S1, S2, L5, A1, U1, R2a, S3ch, M2, P2a, P2b, SA6, SA9, X2, MRa]; const res = list.map((S) => { try { return summaryClean(S); } catch (e) { return false; } });
      return { ok: res.every(Boolean) && list.length === 14, obs: list.map((S, i) => `${S.tag}=${res[i]}`).join(' · ') };
    });
    item('O-3', 'adsız özetin SHA-256\'sı: sondanın yazdırdığı D8-OZET-SHA256 = özet dosyasının bağımsız hesaplanan SHA-256\'sı = ham kanıttaki summary.sha256; içerik değişince (S1 ↔ S2) özet de değişir; ham kanıtın özeti hiçbir yere yazılmaz', () => {
      const line = (S) => (/^D8-OZET-SHA256=([0-9A-F]{64})$/m.exec(S.log) || [])[1]; const a = sha(S1.sumBytes); const b = sha(S2.sumBytes);
      const rawHashes = [sha(S1.evBytes), sha(S2.evBytes)]; const txt = S1.log + S2.log + S1.sumBytes.toString('utf8') + S2.sumBytes.toString('utf8');
      return { ok: line(S1) === a && line(S2) === b && a !== b && S1.ev.summary.sha256 === a && S1.ev.summary.written === true && S2.ev.summary.sha256 === b && rawHashes.every((h) => !txt.toUpperCase().includes(h)), obs: `S1 satır=bağımsız: ${line(S1) === a} · S2: ${line(S2) === b} · farklı=${a !== b}` };
    });
    item('V-1', 'vektör kümesi kimliği kaynaktan BAĞIMSIZ hesapla eşleşir: sondanın kaynak metnindeki 59 + 9 vektörden ("grup yöntem hamYol beklenenKodlar" satırlarının SHA-256\'sı) bu dosyada hesaplanan değer = ham kanıt = adsız özet; kenarın gördüğü (yöntem, yol) dizisi de aynı listeyi verir; iki ad (AD-1, AD-2) aynı kimliği taşır', () => {
      const indep = vectorSetIdOf(VEC); const fromSeen = sha(Buffer.from(S1.gt.map((s, i) => `${VEC.all[i].group} ${s.method} ${s.url} ${VEC.all[i].expect.join(',')}`).join('\n'), 'utf8'));
      return { ok: VEC.deny.length === 59 && VEC.allow.length === 9 && /^[0-9A-F]{64}$/.test(indep) && S1.ev.vectorSetId === indep && S1.sum.vectorSetId === indep && fromSeen === indep && S2.sum.vectorSetId === indep && S1.sum.vectorCounts.deny === 59 && S1.sum.vectorCounts.allow === 9, obs: `bağımsız=${indep.slice(0, 16)}… · kanıt=${String(S1.ev.vectorSetId).slice(0, 16)}… · kenar dizisinden=${fromSeen.slice(0, 16)}… · ret ${VEC.deny.length} + pozitif ${VEC.allow.length}` };
    });
    const v2probe = path.join(dir, 'd8-staff-surface-probe.v2.js'); const v2src = src.replace("'/dashboard',", "'/dashboard-x',"); fs.writeFileSync(v2probe, v2src);
    const V2 = await scenario('ok', { tag: 'v2', probe: v2probe, noInv: true });
    item('V-2', 'vektör kümesi kimliği listeden TÜRER (sabit değil): tek bir ret vektörünün yolu değişen sonda kopyasında kimlik değişir ve kopyanın kaynağından bağımsız hesapla eşleşir; sondanın SHA-256 alanı da kopyanın kendi baytlarını gösterir', () => {
      const vec2 = parseVectors(v2src); const indep2 = vectorSetIdOf(vec2);
      return { ok: v2src !== src && V2.ev.vectorSetId === indep2 && V2.sum.vectorSetId === indep2 && indep2 !== vectorSetIdOf(VEC) && V2.sum.probeSha256 === sha(fs.readFileSync(v2probe)) && V2.sum.probeSha256 !== S1.sum.probeSha256, obs: `kopya=${String(V2.ev && V2.ev.vectorSetId).slice(0, 16)}… · asıl=${vectorSetIdOf(VEC).slice(0, 16)}… · farklı=${indep2 !== vectorSetIdOf(VEC)}` };
    });

    // ── Statik kalemler ──
    item('T-1', 'sonda pozitif listesinde giriş/forgot-password/intake POST/belge yükleme YOK (yalnız token olmadan guard pozitifleri)', () => ({ ok: VEC.allowBlock.length > 0 && !/api\/portal\/login'|api\/portal\/forgot-password'|public\/intake|documents\/upload/.test(VEC.allowBlock) && !VEC.allowBlock.split('\n').some((l) => /'POST'/.test(l) && !/token yok/.test(l)), obs: 'statik' }));
    const denyLines = VEC.denyBlock.split('\n').filter((l) => /^\s*\['/.test(l));
    item('T-2', 'statik: https.request seçenek nesnesiyle (URL string DEĞİL); her ret vektöründe ifPassed (FX.*) var; boş gövdeli yazma yöntemleri adında "boş gövde"; kimlik/yazma bayrakları kanıtta yalnız design{} (beyan) + measured{} (türetilmiş); kimlik gözlemi / anlamı, kalibrasyon, katman kimliği, dört alan ve çıkış kodu işlevleri ipucu alanlarını (Server başlığı, gövde, imza, layerHint) OKUMAZ; alan işlevi API kanıtını yalnız layerId üzerinden okur', () => {
      const fns = ['idObsOf', 'idSignalOf', 'inHeaderlessZone', 'calibrationOf', 'layerIdOf', 'verdictsOf', 'exitCodeOf']; const bodies = fns.map(fnSrc); const all = bodies.join('\n'); const srcNoDesign = src.replace(/design:\s*\{[^}]*\}/, '');
      const pure = bodies.every((b) => b !== '') && !/hints|serverHeader|bodyEmpty|layerHint|providerSignature|caddy|cloudflare|\.body|\.headers|server/i.test(all) && /const proven = \(x\) => x\.layerId === 'UYGULAMA-API';/.test(fnSrc('verdictsOf'));
      const ok = /https\.request\(\{\s*host:\s*HOST,\s*port:\s*PORT,\s*path,\s*method,\s*servername:\s*HOST/.test(src) && !/https\.request\(ORIGIN/.test(src) && denyLines.length === S1.ev.deny && denyLines.every((l) => /FX\.\w+\]/.test(l)) && denyLines.filter((l) => /'(POST|PUT|PATCH)'/.test(l)).every((l) => /boş gövde/.test(l))
        && !/credentialsSent:\s*(true|false)|writesAttempted:\s*(true|false)/.test(srcNoDesign) && S1.ev.credentialsSent === undefined && S1.ev.writesAttempted === undefined && typeof S1.ev.measured === 'object' && /credentialHeaderRequests:\s*rows\.filter/.test(src) && pure;
      return { ok, obs: `ret satırı=${denyLines.length} · işlev=${bodies.filter((b) => b !== '').length}/${fns.length} · işlevler ipucu okumaz=${pure}` };
    });
    item('T-3', 'statik (D8-E1/E2): deny kaynağında 3 HEAD + 3 OPTIONS yöntemi üç yüzeyde (sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon ham yolu birebir; HEAD/OPTIONS/evasion FX etiketleri bağlı', () => {
      const headLines = denyLines.filter((l) => /,\s*'HEAD',/.test(l)); const optLines = denyLines.filter((l) => /,\s*'OPTIONS',/.test(l));
      const hoSurfSrc = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headLines.some((l) => l.includes(`'${p}'`)) && optLines.some((l) => l.includes(`'${p}'`)));
      const evInSrc = evasionPaths.filter((p) => VEC.denyBlock.includes(`'${p}'`)).length;
      const fxRefs = /FX\.headPage/.test(src) && /FX\.headApi/.test(src) && /FX\.headAdmin/.test(src) && /FX\.optionsPage/.test(src) && /FX\.optionsApi/.test(src) && /FX\.optionsAdmin/.test(src) && /FX\.evasion/.test(src);
      return { ok: headLines.length === 3 && optLines.length === 3 && hoSurfSrc && evInSrc === 18 && fxRefs, obs: `HEAD=${headLines.length} · OPTIONS=${optLines.length} · varyant kaynakta=${evInSrc}/18 · yüzeyler=${hoSurfSrc} · FX=${fxRefs}` };
    });
    item('T-4', 'statik: kararlar VERİLDİ — sondada "karar bekliyor" eşlemesi / işareti, "değerlendirme gerekir" sınıfı ve çıkış 5 KALMADI (kod satırlarında API_KAYNAKLI_403, kararBekliyor, pendingOwnerDecision, DEGERLENDIRME-GEREKIR, RET_CIKIS, D8-KARAR-BEKLIYOR yok; process.exit(5) yok); çıkış kodu TEK işlevden (exitCodeOf) türer ve tek yerde çağrılır; ölçüm sonrası süreç çıkışı yalnız o değerle ya da 7 ile verilir; alan değerleri kümesi tek tanım (PASS / FAIL / OLCULEMEYEN)', () => {
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); const gone = ['API_KAYNAKLI_403', 'kararBekliyor', 'pendingOwnerDecision', 'DEGERLENDIRME-GEREKIR', 'RET_CIKIS', 'D8-KARAR-BEKLIYOR', 'KARAR BEKL'].filter((w) => code.includes(w));
      const calls = (code.match(/exitCodeOf\(/g) || []).length; const exits = (code.match(/process\.exit\(([^)]*)\)/g) || []); const fv = code.split('\n').filter((l) => /^const FIELD_VALUES\s*=/.test(l));
      const ok = gone.length === 0 && calls === 2 && fnSrc('exitCodeOf') !== '' && exits.length > 0 && exits.every((e) => /process\.exit\((4|7|exitCode)\)/.test(e)) && !/exitCode\s*=\s*5|:\s*5\s*[,}]/.test(fnSrc('exitCodeOf')) && fv.length === 1 && /\['PASS', 'FAIL', 'OLCULEMEYEN'\]/.test(fv[0]);
      return { ok, obs: `kalan eski ad=${gone.length}${gone.length ? ' [' + gone.join(',') + ']' : ''} · exitCodeOf geçişi=${calls} (tanım + tek çağrı) · process.exit biçimleri=${Array.from(new Set(exits)).join(' ')}` };
    });
    item('T-5', 'statik (R06 — kalkan kuralların izi kod satırlarında yok): "API değil" çıkarımı (API-DEGIL-CIKARIM · BASLIK-YOK-KALIBRASYON-VAR · shownNotApi) · pozitif 403 istisnası (POZITIF-REDDEDILDI-403) · aynı kanıtın iki kalemde reddi (AYNI-KANIT-IKI-KALEMDE) · "doğrulandı" durumu (DOGRULANDI) · PASS kaydının eki (KAYIT_EKI · VARSAYIMLAR); katman kimliği kümesi üç ögeli (UYGULAMA-API / OLCULEMEYEN / SONUC-YOK); çıkış kodu işlevi yalnız "FAIL → 2, aksi 3" döndürür (0 dönüşü yok); kenar engelleme ve katman doğrulaması alanları yalnız PASS ÜRETMEYEN kapatıcıyla kapanır (o kapatıcının gövdesinde PASS değeri yok), durum kodu ölçütü ve pozitif kontrol olağan kapatıcıyla; pozitif kontrol FAIL süzgecinde 403 ayrımı yok', () => {
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); const vf = fnSrc('verdictsOf'); const ef = fnSrc('exitCodeOf');
      const gone = ['API-DEGIL-CIKARIM', 'BASLIK-YOK-KALIBRASYON-VAR', 'shownNotApi', 'POZITIF-REDDEDILDI-403', 'AYNI-KANIT-IKI-KALEMDE', 'DOGRULANDI', 'KAYIT_EKI', 'VARSAYIMLAR'].filter((w) => code.includes(w));
      const closer = vf.split('\n').find((l) => l.includes('closeNoPass: (')) || ''; const closes = (vf.match(/\b[A-Z]\.close(NoPass)?\(/g) || []).sort().join(' ');
      const ok = gone.length === 0 && /^const LAYER_IDS = \['UYGULAMA-API', 'OLCULEMEYEN', 'SONUC-YOK'\];$/m.test(src)
        && ef !== '' && /return vals\.includes\('FAIL'\) \? 2 : 3;/.test(ef) && !/\? 0|: 0|return 0/.test(ef)
        && closer !== '' && !/'PASS'/.test(closer) && /return 'OLCULEMEYEN'; \}/.test(closer) && closes === 'E.closeNoPass( H.close( L.closeNoPass( P.close('
        && /P\.add\('FAIL', 'POZITIF-BEKLENMEYEN-YANIT', allow\.filter\(\(x\) => x\.status !== 0 && !x\.statusExpected\)\);/.test(vf) && !/status !== 403|status === 403/.test(fnSrc('verdictsOf').split('\n').filter((l) => /\bP\.add\(/.test(l)).join('\n'));
      return { ok, obs: `kalan eski ad=${gone.length}${gone.length ? ' [' + gone.join(',') + ']' : ''} · alan kapatıcıları=${closes} · çıkış kodu işlevinde 0 dönüşü=${/\? 0|: 0|return 0/.test(ef)} · PASS üretmeyen kapatıcıda PASS değeri=${/'PASS'/.test(closer)}` };
    });

    // ── Belge: pinler, belge ↔ kod ↔ öz-test tutarlılığı ve owner blokları ──
    const doc = fs.readFileSync(DOC, 'utf8'); const probeSha = sha(fs.readFileSync(PROBE)); const selfSha = sha(fs.readFileSync(__filename));
    const fences = []; { const rx = /```powershell\r?\n([\s\S]*?)\r?\n```/g; let m; while ((m = rx.exec(doc))) fences.push(m[1]); }
    const ENV_LIT = "'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project\\apps\\api\\.env'";
    const PROBE_LIT = "'D:\\Development\\HUKUK_YAZILIMI\\project\\project\\docs\\governance\\client-extacc-d8-staff-surface-r01\\scripts\\d8-staff-surface-probe.js'";
    const measureBlocks = fences.filter((t) => /d8-staff-surface-probe\.js/.test(t) && /--out /.test(t)); const phoneBlocks = fences.filter((t) => /d8-staff-surface-probe\.js/.test(t) && /--phone-list/.test(t));
    const blockPins = fences.map((t) => (/-cne '([0-9A-F]{64})'/.exec(t) || [])[1]); const cnt = (t, lit) => t.split(lit).length - 1;
    item('D-1', 'pinler: belge §7 sonda pini = iki owner bloğundaki pin = sondanın gerçek SHA-256\'sı (büyük harf); belge §7 öz-test pini = bu dosyanın gerçek SHA-256\'sı', () => {
      const p7 = (/`d8-staff-surface-probe\.js` `([0-9A-F]{64})`/.exec(doc) || [])[1]; const s7 = (/`d8-selftest\.js` `([0-9A-F]{64})`/.exec(doc) || [])[1];
      return { ok: p7 === probeSha && s7 === selfSha && blockPins.length === 2 && blockPins.every((p) => p === probeSha), obs: `sonda: belge ${String(p7).slice(0, 8)}… gerçek ${probeSha.slice(0, 8)}… · öz-test: belge ${String(s7).slice(0, 8)}… gerçek ${selfSha.slice(0, 8)}… · blok pinleri=${blockPins.map((p) => String(p).slice(0, 8)).join(',')}` };
    });
    item('DOC-1', 'belge ↔ kod ↔ öz-test AYNI eşlemeyi taşır: (a) belge, sondanın kanıta yazdığı çıkış kodu eşlemesi metnini AYNEN içerir; R05\'in tam eşleme metni ("… kenar engelleme PASS → 0 · diğer her durum → 3 …") belgede geçerli eşleme olarak yok (yalnız "kalktı" diye anılır) · (b) §1b ad başına tablonun başlığı sırasıyla şu sütunlardır: ad kimliği · kapsam yetkisi · HTTP / ret sonucu · kenar engelleme sonucu · katman doğrulaması · pozitif kontrol · koşum · dış ağ beyanı · (c) her satırın ilk hücresi bir ad kimliği ya da "diğer yayın adları"dır (ortak / toplam / "D-8" satırı yok); kapsam yetkisi hücresi: AD-1 için "birincil ad …", başka ad kimliği için sondanın KABUL metni ("kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde"; sondanın çıktısıyla birebir) ya da kapı metni — "DOGRULANDI" belgenin hiçbir yerinde yok · (d) satır biçimi KOŞUM HÜCRESİNE göre ölçülür — koşum hücresi BOŞ ("—") ise dört sonuç hücresi aynı "KOŞULMADI" metnidir: kapsam yetkisi doğrulanmamış satırda kapı metni ("KOŞULMADI — kapsam yetkisi doğrulanmadı"), diğerlerinde "KOŞULMADI — canlı sonda GO\'su yok"; koşum hücresi DOLU ise (gerçek bir koşumdan sonra) yalnız BİÇİM ölçülür: HTTP / ret ve pozitif kontrol hücreleri PASS / FAIL / OLCULEMEYEN (R07: HTTP / ret hücresi, dar sınıf uygulanan koşumda, PASS yerine OWNER-ISTISNASIYLA-UYGUN taşır — başka hiçbir hücre bu değeri almaz); KENAR ENGELLEME ve KATMAN DOĞRULAMASI hücreleri yalnız FAIL / OLCULEMEYEN (bu sondayla PASS üretilmez — o iki hücrede PASS yazan satır bu sondanın ölçümü olamaz); sayı, neden, "KOŞULMADI" yok; koşum hücresi tam olarak "YYYY-AA-GG · <konum etiketi> · <sonda pini kısa> · <vektör kümesi kimliği kısa>" (kısa = ilk 8 … son 4 onaltılık hane; yol, tam özet, başka sayı yok). Kapsam yetkisi doğrulanmamış satır doldurulamaz · (e) AD-1 satırı ve "diğer yayın adları" satırı VAR; "diğer yayın adları" satırının kapsam yetkisi ve dört sonuç hücresi sondanın kapsam yetkisi kapısının yazdığı sabit metinle BİREBİR aynı; o satırda ad kimliği / sayı yok · (f) §1b\'de 64 haneli özet değeri yok · (g) belgede "OWNER KARARLARI (2026-10-05)" ve "OWNER KARARLARI (2026-10-06)" bölümleri var, "BEKLEYEN OWNER KARARLARI" başlığı yok · (h) kapanış tanımı (§3) ve owner blokları bölümü (§1d) "ölçüm koşumu çıkış 0 üretmez" der; ikisinde de çıkış 0\'ı kenar engelleme PASS\'e bağlayan eski cümle yok', () => {
      const cut = (x, y) => { const i = doc.indexOf(x); if (i < 0) return ''; const j = doc.indexOf(y, i + x.length); return doc.slice(i, j < 0 ? undefined : j); };
      const s1b = cut('### 1b.', '### 1c.'); const lines = s1b.split(/\r?\n/); const head = lines.find((l) => /^\| Ad kimliği \|/.test(l)) || ''; const cells = (l) => l.split('|').slice(1, -1).map((x) => x.trim());
      const cols = ['Ad kimliği', 'Kapsam yetkisi', 'HTTP / ret sonucu', 'Kenar engelleme sonucu', 'Katman doğrulaması', 'Pozitif kontrol', 'Koşum', 'Dış ağ beyanı']; const hc = cells(head);
      const GO = "KOŞULMADI — canlı sonda GO'su yok"; const NO_RUN = '—'; const NOPASS = ['FAIL', 'OLCULEMEYEN'];
      /** Dolu koşum hücresi: tarih · beyan edilen konum etiketi (sondanın etiket biçimi) · sonda pini KISA · vektör kümesi kimliği KISA. */
      const RUN_RX = /^\d{4}-\d{2}-\d{2} · [a-z0-9][a-z0-9-]{1,39} · [0-9A-F]{8}…[0-9A-F]{4} · [0-9A-F]{8}…[0-9A-F]{4}$/;
      const hi = lines.indexOf(head); const rows = hi < 0 ? [] : lines.slice(hi + 2).filter((l) => /^\|/.test(l)).map(cells);
      const all4 = (c, t) => c.slice(2, 6).every((x) => x === t);
      /** Tek satırın biçimi — boş koşum hücresi → "KOŞULMADI"; dolu koşum hücresi → yalnız alan değerleri (kenar engelleme ve katman doğrulaması
       *  hücrelerinde PASS YOK) + kısa biçimli koşum hücresi. */
      const rowOk = (c) => {
        if (c.length !== cols.length) return false;
        const other = /^diğer yayın adları$/.test(c[0]); const primary = /^\*\*AD-1\*\*( |$)/.test(c[0]); const alias = /^\*\*AD-[1-9][0-9]{0,2}\*\*( |$)/.test(c[0]);
        if (!other && !alias) return false;
        if (other) return c[1] === REFUSAL && all4(c, REFUSAL) && c[6] === NO_RUN && !/\d/.test(c.join('|'));
        if (primary ? !/^birincil ad/.test(c[1]) : !(c[1] === ACCEPT || c[1] === REFUSAL)) return false;
        if (c[1] === REFUSAL) return all4(c, REFUSAL) && c[6] === NO_RUN;
        return c[6] === NO_RUN ? all4(c, GO) : (RUN_RX.test(c[6]) && (FIELD_VALUES.includes(c[2]) || c[2] === HX) && NOPASS.includes(c[3]) && NOPASS.includes(c[4]) && FIELD_VALUES.includes(c[5]));
      };
      const shape = rows.length >= 2 && rows.every(rowOk);
      const r1 = rows.filter((c) => /^\*\*AD-1\*\*( |$)/.test(c[0])); const r2 = rows.filter((c) => /^diğer yayın adları$/.test(c[0])); const filled = rows.filter((c) => c.length === cols.length && c[6] !== NO_RUN).length;
      const map = S1.ev.exitCodeMap; const gateText = sa1.first; const NO0 = 'ölçüm koşumu çıkış 0 üretmez';
      const s3 = cut('## 3. D-8 kapanış tanımı', '### 3b.'); const s1d = cut('### 1d.', '## 2. D-8 telefon adımı');
      const closure = s3.length > 200 && s1d.length > 200 && s3.includes(NO0) && s1d.includes(NO0) && !/\*\*0\*\* = FAIL yok/.test(s3) && !/0'da kenar/.test(s1d) && !doc.includes('FAIL yok ve kenar engelleme PASS → 0 · diğer her durum → 3');
      const ok = typeof map === 'string' && map.length > 40 && doc.includes(map) && S1.sum.exitCodeMap === map && hc.length === cols.length && cols.every((c, i) => hc[i].startsWith(c)) && shape
        && r1.length === 1 && r2.length === 1 && gateText === REFUSAL && new Set(rows.map((c) => c[0])).size === rows.length && s1b.includes(ACCEPT) && SA6.log.includes(ACCEPT) && !doc.includes('DOGRULANDI')
        && !/[0-9A-Fa-f]{64}/.test(s1b) && /### 3b\. OWNER KARARLARI \(2026-10-05\)/.test(doc) && /### 3c\. OWNER KARARLARI \(2026-10-06\)/.test(doc) && !/BEKLEYEN OWNER KARARLARI/.test(doc) && closure;
      return { ok, obs: `eşleme metni belgede=${typeof map === 'string' && doc.includes(map)} · §1b sütun=${hc.length}/${cols.length} · satır=${rows.length} (biçim=${shape}; biçimi tutmayan=${rows.filter((c) => !rowOk(c)).length}) · koşum hücresi dolu satır=${filled} · AD-1 satırı=${r1.length} · diğer adlar satırı=${r2.length}, kapı metni sondanınkiyle aynı=${gateText === REFUSAL} · kabul metni §1b'de ve sonda çıktısında=${s1b.includes(ACCEPT) && SA6.log.includes(ACCEPT)} · belgede DOGRULANDI=${doc.includes('DOGRULANDI')} · §1b'de 64 haneli değer=${/[0-9A-Fa-f]{64}/.test(s1b)} · 2026-10-06 karar bölümü=${/### 3c\. OWNER KARARLARI \(2026-10-06\)/.test(doc)} · §3 ve §1d "çıkış 0 üretmez"=${closure}` };
    });
    item('DOC-2', 'belge ↔ kod ↔ öz-test, DAR KABUL İSTİSNASI (R07): (a) sınıfın adı ve uyarı cümlesi üç yerde AYNI — bu dosyada bağımsız yazılı metin = sondanın kanıta / özete / çıktıya yazdığı metin = belgedeki metin (§1.1 ve §3d\'de birebir) · (b) belgede "### 3d." bölümü var; karar tarihini (2026-10-06) ve kural sürümünü (R07) başlığında ve gövdesinde AYRI taşır; "geçmiş koşuma geriye dönük uygulanmaz" der · (c) §1.1 ve §3d incelenmiş yanıt özelliklerini (155 bayt + SHA-256, sondadaki ve bu dosyadaki değerle aynı), vektör kimliğini ve ham hedefi taşır; beş neden sınıfı ve üç durum adı belgede sondadakiyle aynı · (d) istek sayısı ve izin kapsamı yazılı: "dış 68 + yerel kenar 1 = 69" ve "ayrı izin kalemi" (§1a) · (e) owner blokları yerel karşılaştırmayı İÇERMEZ (--local-edge / --offprobe-evidence / --finalize blokta yok) ve §1d "yerel gözlem yok → dar kabul istisnası uygulanmaz" kuralını yazar · (f) GEÇMİŞ KOŞUM AYNEN: §1b AD-1 satırı FAIL · FAIL · OLCULEMEYEN · PASS ve 2026-10-06 koşum hücresi değişmedi; belgenin başındaki koşum kaydı aynı dört değeri taşır; §1b "bu satıra uygulanmaz" der · (h) HTTP / ret alanının ek değeri OWNER-ISTISNASIYLA-UYGUN §1.1, §1b ve §3d\'de yazılı ve "PASS yazılmaz" kuralı §1b\'de; "PASS — ya da tek tanımlı satır …" anlatımı belgede yok; owner şartının cümlesi §3d\'de · (g) belgede "Sağlayıcıda erken ret kanıtlandı" yalnız "denmez / yazılmaz" bağlamında geçer; sondanın kaynağında ve çıktılarında hiç geçmez', () => {
      const cut = (x, y) => { const i = doc.indexOf(x); if (i < 0) return ''; const j = doc.indexOf(y, i + x.length); return doc.slice(i, j < 0 ? undefined : j); };
      const s11 = cut('### 1.1 ', '### 1a.'); const s1a = cut('### 1a.', '### 1b.'); const s1b = cut('### 1b.', '### 1c.'); const s1d = cut('### 1d.', '## 2. D-8 telefon adımı'); const s3d = cut('### 3d.', '## 4. '); const head = doc.slice(0, doc.indexOf('## 1. '));
      const n = N(MRa); const probeWhys = (/^const NARROW_WHYS = \[(.*)\];$/m.exec(src) || ['', ''])[1].split(',').map((x) => x.trim().replace(/'/g, '')); const probeStates = (/^const NARROW_STATES = \[(.*)\];$/m.exec(src) || ['', ''])[1].split(',').map((x) => x.trim().replace(/'/g, ''));
      const a = n.className === MR.name && n.notice === MR.notice && MRa.sum.malformedRejectClass.className === MR.name && s11.includes('"' + MR.name + '"') && s3d.includes('"' + MR.name + '"') && s11.includes(MR.notice) && s3d.includes('"' + MR.notice + '"') && src.includes("className: '" + MR.name + "'") && src.includes("notice: '" + MR.notice + "'");
      const b = s3d.length > 1500 && /^### 3d\. OWNER KARARI \(2026-10-06\) — dar kabul istisnası; kural sürümü R07$/m.test(doc) && /Karar tarihi: 2026-10-06 · Kural sürümü: R07/.test(s3d) && /geçmiş koşuma geriye dönük uygulanmaz/.test(s3d) && n.ruleRevision === MR.rev && /### 3c\. OWNER KARARLARI \(2026-10-06\)/.test(doc) && doc.indexOf('### 3d.') > doc.indexOf('### 3c.');
      const c = [s11, s3d].every((t) => t.includes(EXAM_SHA) && /155 bayt/.test(t.replace(/\*/g, '')) && t.includes('`' + MR.id + '`') && t.includes('`' + MR.target + '`')) && n.definition.examined.bodySha256 === EXAM_SHA && n.vectorId === MR.id
        && probeWhys.length === 8 && probeWhys.every((w) => s11.includes('`' + w + '`')) && probeStates.length === 3 && probeStates.every((w) => s11.includes('`' + w + '`')) && Object.keys(W).every((k) => probeWhys.includes(W[k])) && probeStates.includes(PENDING);
      const d = /dış 68 \+ yerel kenar 1 = 69/.test(s1a.replace(/\*/g, '')) && /ayrı bir izin kalemidir/.test(s1a.replace(/\*/g, '')) && /dış 68 istek \+ 1 yerel kenar isteği = 69/.test(s3d.replace(/\*/g, '')) && MRa.ev.measured.requestCount === 69;
      const e = fences.length === 2 && fences.every((t) => !/--local-edge|--offprobe-evidence|--offprobe-result|--finalize/.test(t)) && /yerel gözlem yok → dar kabul istisnası uygulanmaz/.test(s1d.replace(/\*/g, '')) && /yerel kenar karşılaştırmasını İÇERMEZ/.test(s1d.replace(/\*/g, ''));
      const row = s1b.split(/\r?\n/).find((l) => /^\| \*\*AD-1\*\* /.test(l)) || ''; const cells = row.split('|').slice(1, -1).map((x) => x.trim());
      const f = cells.length === 8 && cells.slice(2, 6).join('/') === 'FAIL/FAIL/OLCULEMEYEN/PASS' && cells[6] === '2026-10-06 · canli-ana-makine-cikisi · 4A517621…8B71 · 83AD1AB6…F0F2' && /HTTP \/ ret sonucu `FAIL` · kenar engelleme sonucu `FAIL` · katman doğrulaması `OLCULEMEYEN` · pozitif kontrol `PASS`/.test(head.replace(/\r?\n> /g, ' ')) && /bu satıra uygulanmaz/.test(s1b.replace(/\*/g, '')) && /D-8 kapanmadı/.test(head.replace(/\*/g, ''));
      const h = s11.includes('`' + HX + '`') && s1b.includes('`' + HX + '`') && s3d.includes('`' + HX + '`') && /hücresine `PASS` yazılmaz/.test(s1b.replace(/\*/g, '')) && !/ya da \(R07\) tek tanımlı satır/.test(doc.replace(/\*/g, '')) && s3d.includes("İstisna uygulanan HTTP 400 satırını 'HTTP/ret PASS' diye sunma.") && n.state === 'UYGULANDI' && V(MRa).httpReject.value === HX;
      const early = 'Sağlayıcıda erken ret kanıtlandı'; const occ = doc.split(early).length - 1; const g = occ >= 1 && doc.split(early).slice(1).every((t) => /^"\s+\**(denmez|yazılmaz)/.test(t)) && !src.includes(early) && !ALL.some((S) => (S.log + S.evBytes.toString('utf8') + S.sumBytes.toString('utf8')).includes(early));
      return { ok: a && b && c && d && e && f && g && h, obs: `ek değer belgede=${h} · ` + `ad + cümle üç yerde aynı=${a} · §3d (tarih + sürüm ayrı, geriye dönük değil)=${b} · yanıt özellikleri / tanım / neden ve durum adları=${c} · istek sayısı ve izin kalemi=${d} · bloklar yerel karşılaştırmasız + kural yazılı=${e} · AD-1 satırı ve koşum kaydı aynen=${f} [${cells.slice(2, 6).join(' · ')}] · "erken ret kanıtlandı" yalnız olumsuz bağlamda=${g} (${occ} yerde)` };
    });
    const blocksOk = fences.length === 2 && measureBlocks.length === 1 && phoneBlocks.length === 1 && measureBlocks[0] !== phoneBlocks[0];
    item('B-0', 'belgedeki owner blokları: tam İKİ powershell bloğu (bir ölçüm, bir telefon listesi); her biri tek satır ve yalnız ASCII; canlı .env yolu, sonda yolu ve pin birer kez; yalnız --alias AD-1 (başka ad için blok yok); ölçüm bloğu --vantage verir, --phone-list VERMEZ, özetin SHA-256\'sını gösterir; telefon bloğu --out VERMEZ', () => {
      const all = fences.every((t) => !/\r|\n/.test(t) && /^[\x20-\x7E]+$/.test(t) && cnt(t, ENV_LIT) === 1 && cnt(t, PROBE_LIT) === 1 && (t.match(/-cne '[0-9A-F]{64}'/g) || []).length === 1 && (t.match(/--alias AD-1(?![0-9])/g) || []).length === 1 && (t.match(/--alias/g) || []).length === 1 && !/AD-[2-9]|AD-1[0-9]/.test(t) && cnt(t, 'ReadAllLines') === 1);
      const m = measureBlocks[0] || ''; const t = phoneBlocks[0] || '';
      return { ok: blocksOk && all && /--vantage [a-z0-9-]+ /.test(m) && !/--phone-list/.test(m) && /ozet\.json/.test(m) && /Get-FileHash -Algorithm SHA256 -LiteralPath \$s/.test(m) && !/--out/.test(t) && !/--vantage/.test(t), obs: `powershell bloğu=${fences.length} · ölçüm=${measureBlocks.length} · telefon=${phoneBlocks.length} · biçim=${all}` };
    });

    // ── Owner blokları İKİ KABUKTA ──
    const shells = [{ id: 'winps51', label: 'Windows PowerShell 5.1', exe: process.env.D8_SELFTEST_WINPS_EXE || 'powershell.exe', min: 5, max: 5 }, { id: 'pwsh7', label: 'pwsh 7', exe: process.env.D8_SELFTEST_PWSH_EXE || 'pwsh', min: 7, max: 99 }];
    let psSeq = 0;
    /** Kabukta betik metni koşturur: PSModulePath (5.1'de boş), sahte kullanıcı kökü, gerçek node.exe PATH'in başında. */
    async function runPs(sh, text, userRoot) {
      const f = path.join(dir, `blk-${sh.id}-${++psSeq}.ps1`); fs.writeFileSync(f, text + '\r\n', 'ascii');
      const e = {}; for (const k of Object.keys(baseEnv)) if (!/^(PSModulePath|USERPROFILE)$/i.test(k)) e[k] = baseEnv[k];
      e.NODE_EXTRA_CA_CERTS = cert; if (userRoot) e.USERPROFILE = userRoot; if (sh.id === 'winps51') e.PSModulePath = '';
      const pk = Object.keys(e).find((k) => /^path$/i.test(k)) || 'Path'; e[pk] = path.dirname(process.execPath) + path.delimiter + (e[pk] || '');
      return spawnP(sh.exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f], e);
    }
    /** Blok metnini test için hazırlar — KAPALI BİÇİMDE: `.env` yolu (`$e='…'`), sonda yolu (`$f='…'`) ve pin YAPISAL olarak (belgedeki
     *  değer ne olursa olsun) tam birer kez bulunup değiştirilir; biri bulunamazsa ya da hazırlanan metinde sahte `.env` dosyası ve
     *  verilen sonda dışında TEK BİR mutlak yol, `.env` uzantılı bir değer ya da canlı kök adı kalırsa İSTİSNA atar ve blok HİÇ
     *  koşturulmaz. (Bu makine canlı ana makine olabilir: ikamesi yapılmamış bir blok canlı `.env` satırını okur ve canlı origin'e
     *  sonda koşturur — bu yüzden ikame "yapıldı" varsayılmaz, kanıtlanır.) */
    const prep = (text, envFile, probeFile, pin) => {
      const e = text.match(/\$e='[^']*'/g) || []; const f = text.match(/\$f='[^']*'/g) || []; const p = text.match(/-cne '[0-9A-F]{64}'/g) || [];
      if (e.length !== 1 || f.length !== 1 || p.length !== 1) throw new Error(`blok ikamesi yapılamadı ($e=${e.length} · $f=${f.length} · pin=${p.length}; her biri tam 1 olmalı)`);
      if (!path.resolve(envFile).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)) throw new Error('sahte .env dosyası öz-testin geçici dizininde değil');
      const out = text.replace(e[0], () => "$e='" + envFile + "'").replace(f[0], () => "$f='" + probeFile + "'").replace(p[0], () => "-cne '" + pin + "'");
      const abs = out.match(/(?<![A-Za-z])[A-Za-z]:[\\/][^']*/g) || []; const stray = abs.filter((a) => a !== envFile && a !== probeFile); // sürücü harfli her yol (https:// değil)
      if (stray.length || /\.env\b/i.test(out) || /HY_W4_RELEASE23/i.test(out) || !out.includes("$e='" + envFile + "'") || !out.includes("$f='" + probeFile + "'")) throw new Error(`hazırlanan blokta ikame dışı yol kaldı (mutlak yol ${stray.length} · .env ${/\.env\b/i.test(out)} · canlı kök ${/HY_W4_RELEASE23/i.test(out)})`);
      return out;
    };
    const envFile = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'ascii'); return f; };
    const envOk = envFile('env-ok.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, 'BASKA_ANAHTAR=deger']);
    const envQuoted = envFile('env-quoted.txt', ['# sahte', `  PUBLIC_PORTAL_BASE_URL = "${ORIGIN}"`]);
    const envNone = envFile('env-none.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL_ESKI=${ORIGIN}`]);
    const envTwo = envFile('env-two.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`]);
    const envHttp = envFile('env-http.txt', [`PUBLIC_PORTAL_BASE_URL=http://localhost:${PORT}`]);
    const envPath = envFile('env-path.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}/portal`]);
    const tampered = path.join(dir, 'd8-staff-surface-probe.degisti.js'); fs.writeFileSync(tampered, Buffer.concat([fs.readFileSync(PROBE), Buffer.from('\n// bir bayt degisti\n')]));
    /** Dokuz blok denemesinin metinlerini hazırlar. İkamenin KANITI yoksa (prep istisnası) HİÇBİR metin döndürmez → hiçbir blok koşmaz. */
    const prepAll = (mText, pText) => {
      try {
        return { err: null, P: { b1: [prep(mText, envOk, PROBE, probeSha), 'ok'], b2a: [prep(mText, envNone, PROBE, probeSha), 'ok'], b2b: [prep(mText, envTwo, PROBE, probeSha), 'ok'], b3a: [prep(mText, envHttp, PROBE, probeSha), 'ok'],
          b3b: [prep(mText, envPath, PROBE, probeSha), 'ok'], b4: [prep(mText, envOk, tampered, probeSha), 'ok'], b5: [prep(mText, envQuoted, PROBE, probeSha), 'broken'], bt: [prep(pText, envOk, PROBE, probeSha), 'ok'], bt2: [prep(pText, envOk, tampered, probeSha), 'ok'] } };
      } catch (e) { return { P: null, err: String((e && e.message) || e).slice(0, 200) }; }
    };
    let uSeq = 0; let blockRuns = 0;
    /** Bir blok denemesi: sahte kullanıcı kökü + kip; dönen: kabuk çıkışı, çıktı, kenarın gördüğü istek sayısı, yazılan kanıt dizinleri. */
    const blk = async (sh, text, m) => { blockRuns++; const u = path.join(dir, `u-${sh.id}-${++uSeq}`); fs.mkdirSync(u); mode = m; seen = []; const r = await runPs(sh, text, u); const n = seen.length; seen = [];
      const root = path.join(u, 'Documents', 'CLIENT-EVIDENCE-20260911'); const dirs = fs.existsSync(root) ? fs.readdirSync(root) : []; return { code: r.code, log: r.log, seen: n, root, dirs, docs: fs.existsSync(path.join(u, 'Documents')) }; };
    /** Blok serisini koşturur — YALNIZ hazırlanmış (ikamesi kanıtlanmış) metin kümesi varsa. */
    const runSeries = async (sh, PA) => { const B = {}; if (!PA || !PA.P) return B; for (const key of Object.keys(PA.P)) B[key] = await blk(sh, PA.P[key][0], PA.P[key][1]); return B; };
    const PA = blocksOk ? prepAll(measureBlocks[0], phoneBlocks[0]) : { P: null, err: 'belgeden blok çıkarılamadı (B-0)' };

    // B-G — düzeneğin kendi kapısı: ikamesi YAPILAMAYAN (belgedeki biçimden kaymış) blok metni HİÇ koşturulmaz. Kaymış metinler canlı
    // `.env` yolunu İÇERMEZ (önce var olmayan bir yola çevrilir); kapı tutmasa bile canlıya dokunacak bir metin üretilmez.
    const NOPE = 'C:\\D8-OZTEST-OLMAYAN-DIZIN'; const eLit = (t) => ((t || '').match(/\$e='[^']*'/) || [''])[0]; const fLit = (t) => ((t || '').match(/\$f='[^']*'/) || [''])[0];
    const neutral = (t) => t.replace(eLit(t), () => "$e='" + NOPE + "\\apps\\api\\x.env'"); const drift = [];
    if (blocksOk && eLit(measureBlocks[0]) && fLit(measureBlocks[0]) && eLit(phoneBlocks[0])) {
      const mB = neutral(measureBlocks[0]); const pB = neutral(phoneBlocks[0]);
      drift.push(['.env yolu tek tırnak yerine çift tırnakla', mB.replace(eLit(mB), () => '$e="' + NOPE + '\\apps\\api\\x.env"'), pB]);
      drift.push(['.env yolu değişmez dize değil (Join-Path)', mB.replace(eLit(mB), () => "$e=(Join-Path '" + NOPE + "\\apps\\api' 'x.env')"), pB]);
      drift.push(['iki $e ataması', mB.replace(eLit(mB), () => eLit(mB) + '; ' + eLit(mB)), pB]);
      drift.push(['blokta ikinci bir mutlak .env yolu', mB.replace(eLit(mB), () => eLit(mB) + "; $e2='" + NOPE + "\\baska\\y.env'"), pB]);
      drift.push(['sonda yolu çift tırnakla', mB.replace(fLit(mB), () => '$f="' + NOPE + '\\d8-staff-surface-probe.js"'), pB]);
      drift.push(['kayma yalnız telefon listesi bloğunda', mB, pB.replace(eLit(pB), () => '$e="' + NOPE + '\\apps\\api\\x.env"')]);
    }
    const bg = []; for (const [name, mT, pT] of drift) { const before = { runs: blockRuns, ps: psSeq }; mode = 'ok'; seen = []; const pa = prepAll(mT, pT); const Bx = await runSeries(shells[0], pa); bg.push({ name, refused: pa.P === null && !!pa.err, ran: blockRuns - before.runs, ps: psSeq - before.ps, seen: seen.length, keys: Object.keys(Bx).length }); seen = []; }
    item('B-G', 'blok düzeneğinin KAPISI (canlı ana makinede güvenlik): belgedeki bloğun .env yolu / sonda yolu test ikamesinin tanıdığı biçimden kayarsa (çift tırnak · değişmez dize değil · iki atama · ikinci mutlak .env yolu · sonda yolu kaymış · yalnız telefon bloğunda kayma) düzenek o blok kümesini HİÇ koşturmaz: kabuk başlatılmaz, betik dosyası yazılmaz, kenara istek gitmez; belgedeki gerçek bloklarda ise ikame KANITLIDIR — hazırlanan dokuz metnin hiçbirinde canlı kök adı, `.env` uzantılı değer ya da sahte dosyalar dışında mutlak yol yok', () => {
      const texts = PA.P ? Object.keys(PA.P).map((k) => PA.P[k][0]) : []; const absOf = (t) => t.match(/(?<![A-Za-z])[A-Za-z]:[\\/][^']*/g) || [];
      const clean = texts.length === 9 && texts.every((t) => !/HY_W4_RELEASE23/i.test(t) && !/\.env\b/i.test(t) && absOf(t).length === 2 && absOf(t).every((a) => a === PROBE || a === tampered || a.toLowerCase().startsWith(dir.toLowerCase() + path.sep)));
      const ok = blocksOk && drift.length === 6 && bg.length === 6 && bg.every((x) => x.refused && x.ran === 0 && x.ps === 0 && x.seen === 0 && x.keys === 0) && PA.P !== null && clean && drift.every((d) => !/HY_W4_RELEASE23/i.test(d[1] + d[2]));
      return { ok, obs: `kaymış blok kümesi=${bg.length} · koşturulmayan=${bg.filter((x) => x.refused && x.ran === 0 && x.ps === 0).length} · kenara giden istek=${bg.reduce((a, x) => a + x.seen, 0)} · gerçek bloklarda ikame kanıtlı=${PA.P !== null && clean}${PA.err ? ' · ' + PA.err : ''}` };
    });

    for (const sh of shells) {
      const ver = await runPs(sh, "'PSMAJOR=' + $PSVersionTable.PSVersion.Major + ' PSVER=' + $PSVersionTable.PSVersion.ToString() + ' PSEDITION=' + $PSVersionTable.PSEdition", null); const major = Number((/PSMAJOR=(\d+)/.exec(ver.log) || [])[1]);
      sh.version = `${(/PSVER=(\S+)/.exec(ver.log) || [])[1] || '?'} (${(/PSEDITION=(\S+)/.exec(ver.log) || [])[1] || '?'})`;
      const avail = !ver.spawnError && major >= sh.min && major <= sh.max; const why = `${sh.label} başlatılamadı (${ver.spawnError || 'sürüm=' + (major || '?')}) — kalem ÖLÇÜLEMEDİ, geçti sayılmaz`;
      if (!avail) sh.version = 'ÖLÇÜLEMEDİ';
      const notRun = (b) => b.seen === 0 && !b.docs && !/cikis=\d/.test(b.log) && !/D8-CIKIS=\d/.test(b.log) && b.code !== 0;
      const B = avail ? await runSeries(sh, PA) : {};
      const skipOr = (fn) => () => (!blocksOk ? { ok: false, obs: 'belgeden blok çıkarılamadı (B-0)' } : (!PA.P ? { ok: false, obs: 'blok KOŞTURULMADI — ikame kanıtlanamadı: ' + PA.err } : (!avail ? { skip: true, obs: why } : fn())));
      /** Olağan akışın ölçümü: blok çıktısındaki çıkış kodu, kanıt dizini, özet SHA'sı (bağımsız hesapla), takma ad, konum etiketi. */
      const flow = (b, expectCode) => {
        const one = b.dirs.length === 1 && /^extacc-d8-AD-1-\d{8}-\d{6}Z$/.test(b.dirs[0]); const d = one ? path.join(b.root, b.dirs[0]) : null;
        const ev = d ? readJson(path.join(d, 'd8-probe.json')) : null; const sb = d ? readBytes(path.join(d, 'd8-probe.ozet.json')) : null; const shown = (/D8 AD-1 adsiz ozet SHA256=([0-9A-F]{64})/.exec(b.log) || [])[1]; const probeLine = (/^D8-OZET-SHA256=([0-9A-F]{64})/m.exec(b.log) || [])[1];
        const vantage = (/--vantage ([a-z0-9-]+) /.exec(measureBlocks[0]) || [])[1];
        const ok = b.code === 0 && new RegExp('D8 AD-1 cikis=' + expectCode + '(\\r?\\n|$)').test(b.log) && b.seen === VEC.all.length && one && ev && sb && shown === sha(sb) && probeLine === shown && ev.nameAlias === 'AD-1' && ev.vantage === vantage && ev.exitCode === expectCode && !/TELEFON/.test(b.log) && fs.readdirSync(d).sort().join() === 'd8-probe.json,d8-probe.ozet.json';
        return { ok, obs: `kabuk sürümü (ölçülen)=${sh.version} · kabuk çıkış=${b.code} · blok "cikis=${(/D8 AD-1 cikis=(\d+)/.exec(b.log) || [])[1]}" · istek=${b.seen} · kanıt dizini=${b.dirs.length} · özet SHA blok=bağımsız: ${!!sb && shown === sha(sb)} · takma ad=${ev && ev.nameAlias} · konum=${ev && ev.vantage}` };
      };
      item(`B-1/${sh.id}`, `${sh.label} · ölçüm bloğu olağan akış (sahte .env tek satır https origin, sağlıklı sahte kenar): blok sondayı AD-1 ve konum etiketiyle koşturur; "D8 AD-1 cikis=3" (sağlıklı kenarda da 0 DEĞİL — ölçüm koşumu 0 üretmez); kullanıcı kökü altında tek kanıt dizini (ham kanıt + adsız özet); blokta gösterilen özet SHA-256'sı = dosyanın bağımsız hesaplanan SHA-256'sı = sondanın yazdırdığı; telefon listesi YAZDIRILMAZ`, skipOr(() => { const f = flow(B.b1, 3); return { ok: f.ok && !/D8 AD-1 cikis=0(\r?\n|$)/.test(B.b1.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN/m.test(B.b1.log), obs: f.obs }; }));
      item(`B-2/${sh.id}`, `${sh.label} · kapı: .env'de PUBLIC_PORTAL_BASE_URL satırı 0 ya da 2 → blok DURUR; sonda HİÇ koşmaz (kenara istek yok, kanıt dizini oluşmaz, "cikis=" satırı yok)`, skipOr(() => ({ ok: notRun(B.b2a) && notRun(B.b2b) && /satiri 1 degil/.test(B.b2a.log) && /satiri 1 degil/.test(B.b2b.log), obs: `0 satır: kabuk=${B.b2a.code} istek=${B.b2a.seen} · 2 satır: kabuk=${B.b2b.code} istek=${B.b2b.seen}` })));
      item(`B-3/${sh.id}`, `${sh.label} · kapı: değer https değil (http://…) ya da yol içeriyor (https://…/portal) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b3a) && notRun(B.b3b) && /https\/yolsuz origin degil/.test(B.b3a.log) && /https\/yolsuz origin degil/.test(B.b3b.log), obs: `http: kabuk=${B.b3a.code} istek=${B.b3a.seen} · yollu: kabuk=${B.b3b.code} istek=${B.b3b.seen}` })));
      item(`B-4/${sh.id}`, `${sh.label} · kapı: sonda dosyası pinle uyuşmuyor (bir baytı değişmiş kopya) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b4) && /SHA UYUSMUYOR/.test(B.b4.log), obs: `kabuk=${B.b4.code} istek=${B.b4.seen} · kanıt dizini=${B.b4.docs}` })));
      item(`B-5/${sh.id}`, `${sh.label} · blok sondanın çıkış kodunu AKTARIR (sabit yazmaz): tırnaklı ve boşluklu .env değeri + bozuk sahte kenar → "D8 AD-1 cikis=2"; özet yine yazılır ve SHA'sı gösterilir`, skipOr(() => flow(B.b5, 2)));
      item(`B-T/${sh.id}`, `${sh.label} · telefon listesi bloğu (AYRI çağrı): 5 adres yazdırır; kenara İSTEK ATMAZ; kanıt dizini oluşturmaz`, skipOr(() => ({ ok: B.bt.code === 0 && (B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /D8 AD-1 telefon listesi cikis=0/.test(B.bt.log) && B.bt.seen === 0 && !B.bt.docs, obs: `kabuk=${B.bt.code} · adres=${(B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${B.bt.seen} · kanıt dizini=${B.bt.docs}` })));
      item(`B-T2/${sh.id}`, `${sh.label} · telefon listesi bloğunda pin uyuşmazlığı → blok DURUR; liste yazdırılmaz`, skipOr(() => ({ ok: B.bt2.code !== 0 && /SHA UYUSMUYOR/.test(B.bt2.log) && !/^\s+\d\. https:\/\//m.test(B.bt2.log) && B.bt2.seen === 0, obs: `kabuk=${B.bt2.code} · istek=${B.bt2.seen}` })));
    }
    shellVersions = shells.map((s) => `${s.label} = ${s.version}`).join(' · ');

    // ── Taşıma hataları (son: sunucu kapatılır) ──
    const noCa = Object.assign({}, baseEnv); const S4b = await scenario('ok', { tag: 's4b', env: noCa, noInv: true });
    item('S4-b', 'doğrulanamayan sertifika (sonda sahte kenarın sertifikasına güvenmiyor): 68/68 SONUC-YOK, hata sınıfı TLS; dört alanın hepsi OLCULEMEYEN (HTTP / ret: yanıtsız ret vektörü ×59 — FAIL değil); çıkış 3; kenar hiçbir isteği işlemedi; hata İLETİSİ kanıta / özete yazılmaz', () => {
      const r = S4b.ev.rows; const txt = S4b.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4b.sumBytes.toString('utf8');
      const ok = is(S4b, 3, 'O/O/O/O') && r.length === VEC.all.length && r.every((x) => x.status === 0 && x.outcome === 'SONUC-YOK' && x.errorClass === 'TLS' && x.layerId === 'SONUC-YOK' && !('error' in x)) && S4b.gt.length === 0 && rc(S4b, 'httpReject', 'RET-VEKTORU-YANITSIZ') === VEC.deny.length && rc(S4b, 'positiveControl', 'POZITIF-YANITSIZ') === VEC.allow.length
        && S4b.ev.calibration.zoneMeasured === 0 && S4b.ev.calibration.apiEvidenceUsable === false && S4b.sum.errorClassCounts.TLS === r.length && !/self.signed|certificate|SELF_SIGNED|localhost/i.test(txt);
      return { ok, obs: brief(S4b) + ` · hata sınıfı=${JSON.stringify(S4b.sum && S4b.sum.errorClassCounts)}` };
    });
    if (srv.closeAllConnections) srv.closeAllConnections(); await new Promise((x) => srv.close(x)); srv = null;
    const S4 = await scenario('ok', { tag: 's4', env: Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env), noInv: true });
    item('S4', 'kenar kapalı: 68/68 SONUC-YOK, hata sınıfı BAGLANTI (S4-b ile ayrı sınıf); dört alanın hepsi OLCULEMEYEN; çıkış 3, bulgu yok; kanıt ve özet yine yazılır; hata iletisi yok', () => {
      const r = S4.ev.rows; const txt = S4.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4.sumBytes.toString('utf8');
      const ok = is(S4, 3, 'O/O/O/O') && S4.ev.unmeasured === S4.ev.deny + S4.ev.allow && r.every((x) => x.status === 0 && x.errorClass === 'BAGLANTI' && x.idObs === 'SONUC-YOK') && S4.ev.findings.length === 0 && S4.sum.errorClassCounts.BAGLANTI === r.length && S4.sum.errorClassCounts.TLS === 0 && !/ECONNREFUSED|connect |127\.0\.0\.1|localhost/i.test(txt);
      return { ok, obs: brief(S4) + ` · sonuç yok=${S4.ev.unmeasured} · hata sınıfı=${JSON.stringify(S4.sum && S4.sum.errorClassCounts)}` };
    });
  } catch (e) { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); if (srv) { try { srv.close(); } catch (x) { /* yok */ } } process.exit(2); }
  for (const x of results) console.log(`${x.state.padEnd(10)} ${x.id.padEnd(13)} ${x.d}\n        ${x.obs}`);
  const fail = results.filter((x) => x.state === 'FAIL'); const skip = results.filter((x) => x.state === 'OLCULEMEDI'); const pass = results.filter((x) => x.state === 'PASS');
  console.log(`\nsonda: ${process.env.D8_SELFTEST_PROBE ? 'ALTERNATİF (D8_SELFTEST_PROBE)' : 'paket'} · sonda SHA-256 ${sha(fs.readFileSync(PROBE))} · port ${PORT} · node ${process.version} · kabuk sürümleri (ölçülen): ${shellVersions}`);
  if (fail.length) console.log('FAIL: ' + fail.map((x) => x.id).join(', '));
  if (skip.length) console.log('ÖLÇÜLEMEDİ (geçti SAYILMAZ): ' + skip.map((x) => x.id).join(', '));
  console.log(`D-8 SONDA ÖZ-TESTİ: PASS ${pass.length} / ${results.length} · FAIL ${fail.length} · ÖLÇÜLEMEDİ ${skip.length}  (kanıt: ${dir})`);
  process.exit(fail.length ? 1 : (skip.length ? 2 : 0));
})();
