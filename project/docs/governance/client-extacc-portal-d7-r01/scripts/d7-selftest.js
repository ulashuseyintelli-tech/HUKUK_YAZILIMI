'use strict';
/*
 * EXTACC D-7 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, E-POSTA GÖNDERMEZ. Disposable PostgreSQL (127.0.0.1:<5432 dışı port>/<ad>_test; R03) + sahte portal
 * API (d7-fake-portal-api.js; 8200) + gerçek TLS'li sahte dış sunucu (8459). "Telefon" bir istemci taklididir: giriş bilgisini
 * koşucunun gösterimsiz test dosyasından (D7_TEST_DISPLAY_SINK; yalnız disposable DB'de) alır, dış uçtan giriş yapar, mesaj
 * sayfasını/listesini açar, mark-read çağırır (web sayfası gibi), bir mesaj gönderir ve 2. personel yanıtını bekler.
 *
 * KULLANIM: node d7-selftest.js   (D7T_DB_URL → 127.0.0.1:<5432 DIŞI port>/<ad>_test ŞART — R03: port sabit değil, kendi tek kullanımlık
 *           konteyneriniz; `hukuk_db` ve 5432 REDDEDİLİR; %TEMP%\d67-test-pg.url artık OKUNMAZ)
 *           D7T_LIB_ROOT = bağımlılıkları kurulu, canlı OLMAYAN bir checkout'un proje kökü (Prisma istemcisi + bcrypt buradan yüklenir).
 *           Verilmezse bu betiğin bulunduğu checkout'un proje kökü denenir. Canlı yayın ağacı REDDEDİLİR; modül yoksa test başlamaz (çıkış 2).
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek mesaj/bildirim/guard davranışı canlı koşumda ölçülür.
 * R03     : Z15 (kurulum ile makbuz arası: ikinci / birinci ek dosya yazması ya da kurulumun kendisi hata verir — arıza disposable DB'ye
 *           senaryonun runId'sine bağlı geçici BEFORE INSERT tetikleyicisiyle verilir, koşucuda test kancası YOK; makbuz VAR → Run kendi kapanışını
 *           koşar, kullanıcılar pasif, dosyalar CLOSED; Recover makbuzu bulur; kanıtta `setup`) · Z16 (Run kapanışında personel oturumu reddi:
 *           401 → tek yeniden giriş + tek yeniden deneme → çıkış 0; 403 → döngü yok; 404 → yeniden giriş yok; yeniden giriş 429 → yeniden deneme
 *           yok; açık portal hesabında koşucu oturumunun 200'ü "ürün bulgusu" DEĞİL; gerçek ürün bulgusu korunur) · Z17/Z18 (Recover adımı ve
 *           kurtarma nedeni birim ölçümü) · C-1 (kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler) · T-9/T-10 (statik: yeniden giriş
 *           yalnız Run'da ve DB'ye yazmaz; makbuz ek dosya yazmalarından ÖNCE).
 * R03-c   : (owner talimatı: kapanış / Recover doğruluğu) Z19-a hesap HTTP ölçümleri sırasında yeniden açılırsa (P7-C2 PASS, P7-C5 FAIL; sahte API
 *           `reopen: afterDisable` + guard bayat) 200 "ürün bulgusu" YAZMAZ, portal satırı st2 değerleriyle "yeniden AÇILDI" der · Z19-b makbuz dosyası
 *           gösterimden sonra YAZILAMAZ hale gelir (yolu klasör olur; uçtan uca, kapatma 500 → çıkış 6): adım uygulanamayan Recover komutunu ÖNERMEZ,
 *           kanıttaki `receipt` yolunu yazar; o nesneden yazılan dosyayla Recover GERÇEKTEN koşar (kimlik bağı OK, kapanış → çıkış 3). Değişen: Z16-e
 *           (dayanak "P7-C2 PASS + P7-C5 PASS"), Z18 (ii) (P7-C5 FAIL'de ürün bulgusu satırı YOK) + (v) birim: setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI
 *           ve makbuz dosyası durumları; C-1 (ürün bulgusu yalnız P7-C2 + P7-C5 PASS iken). `runScenario` çıkış sonrası kanca (`afterExit`) alır.
 *           Z15-d (7c taraması): portal hesabı YOKKEN P7-C1 günlük satırı "kapatıldı" demez (Run + Recover günlükleri).
 * R03-d   : (R03-c bağımsız doğrulaması; D-6 R03-d ile aynı ilke) Z19-a DEĞİŞTİ — R03-c'nin "adayı DEĞİL" beklentisi YANLIŞTI: sahte API yeniden açmada
 *           sürümü ürün gibi artırır; guard kusur taklidi + yeniden açma → 200 "ÜRÜN BULGUSU ADAYI — eski oturum sürüm reddine rağmen erişti" + AYRI
 *           "yeniden AÇILDI … (Recover kapatabilir)" satırı · Z20-a guard NORMAL + yeniden açma → eski oturum 401 (P7-C4 PASS), bulgu yok · Z20-b sürüm
 *           verilme değerine GERİ döner (afterDisableRevert) → 200 "adayı DEĞİL" · Z20-c sınıflama + kurtarma nedeni birim · Z20-d BAYAT makbuz
 *           önerilmez (m7) + makbuzDiskte klasörde false (m6) + BOM'lu makbuz kullanılabilir · Z18 (v) / Z19-b DEĞİŞTİ — kanıttaki recovery.makbuzJson'dan
 *           yeni dosya yazan TEK komut WinPS 5.1 VE PS 7 ile GERÇEKTEN koşulur; iki dosya (5.1 BOM'lu) koşucunun Recover kapısından geçer ve Recover
 *           kimlik bağı OK ile koşar (m4) · C-1 DEĞİŞTİ — ürün bulgusu ADAYI (P7-C5 FAIL + sessionVersion ADAY) kabul; Run kanıtında makbuz varsa
 *           recovery.makbuzJson = JSON.stringify(receipt, null, 1); bayat makbuzda Recover komutu önerilmez.
 * R03-e   : (R03-d iki bağımsız doğrulaması, B1; D-6 R03-e ile aynı ilke) koşucu oturumunun HER 200'ü tek sınıflamadan (sessionClass200): Z21-a karar tablosunun
 *           tüm hücreleri (birim; sınıf + hücre + metin; "ürün bulgusu değil" yalnız T5, "DEĞİL" sınıfı yok) · Z21-b token claim'i (birim) · Z21-c..j uçtan uca
 *           tablo varyantları, her biri guard kusur taklidi (bayat → beklenen sınıf ve metin) ve guard normal (401 → P7-C4 PASS, productFinding YOK)
 *           ikizleriyle: T2 açıkken "Şifre Değiştir" (sürüm +1) + kapatma 403 · T1 satır silme · T3 ürün dışı kapatma (sürüm artmadan pasif) · TI ürün dışı
 *           yeniden açma · Z21-k claim ≠ s1 (ikisi kanıtta, claim esas) · Z21-l claim okunamaz → s1 · T-11 statik (tek sınıflama çağrısı; "hâlâ AÇIK" /
 *           koşulsuz SAYILMADI yok). DEĞİŞEN: Z16-b, Z16-c, Z16-d, Z16-f (T5: "ürün bulgusu SAYILMADI (T5)" + ölçülen kapatma metni "kapatma YAPILMADI (2xx
 *           kapatma çağrısı yok)"; "hâlâ" yok) · Z18 (i) · Z19-a (T2 ADAY + hücre; ürün bulgusu metni açık-erişim satırını içermez) · Z20-b (sürüm geri dönüşü
 *           → TA AYRISTIRILAMADI; "DEĞİL" yok) · Z20-c (kurtarma nedeni birimi sınıflara göre; Recover modunda "(Recover kapatabilir)" yazılmaz) · C-1 (ürün
 *           bulgusu: BULGU sınıfı + P7-C2/C5 PASS ya da ADAY sınıfı — P7-C2 FAIL dalında da). Sahte API portal token'ı JWT biçiminde.
 * R03-f   : (R03-e iki bağımsız doğrulamasının MINOR bulguları; D-6 R03-f ile aynı ilke) YENİ: Z22-a/b (F5) token claim'i GEÇERSİZ (sahte API portalToken badClaim)
 *           — guard kusur taklidi → ADAY/TG + "guard her isteği reddeder — portal-auth.guard.ts:42-45"; guard normal → 401, P7-C4 PASS, productFinding YOK · Z22-c (F1)
 *           P7-C1 günlük satırı "kapatıldı" demez; açıklama ölçülene inmiş (2xx / zaten kapalı / DB kapalı görüldü — DB kapanışı P7-C2 / P7-C5'te), gözlemde
 *           `dayanak=` (Z1 sonrası tek Recover: "hesap zaten kapalıydı") · Z22-d (F2) Recover metni `disableCalls`'a bağlı (birim + uçtan uca; hiçbir kanıtta "Recover
 *           kapatabilir" yok) · Z22-e (F3) kısmi durum metinleri (yalnız bayrak yeniden açıldıysa "erişim bayrağı yeniden açıldı (hesap pasif …)"; pasif + bayrak açık →
 *           "portal kapanışı TAMAMLANMADI …"; hiçbir kanıtta "portal hesabı açık" yok) · T-12 statik. DEĞİŞEN: Z16-b, Z16-c, Z16-d, Z16-f, Z18 (T5 metni "hesap aktif
 *           kaldı …"; "DB'de portal hesabı AKTİF (…)"; Recover metni) · Z19-a, Z20-a, Z20-b, Z20-c, Z21-c, Z21-d, Z21-g, Z21-h, Z21-j (F2/F3 metinleri) · Z21-a (F4/F5:
 *           yeni sıra B → T1 → TG → T3 → T0 …; TI yalnız a = b = c, a = c ≠ b → T2; 13 hücre) · Z21-i (F4: sahte API afterDisableNoBump artık T2 ADAY) · T-11 (çağrı
 *           4 bağımsız değişkenli).
 * R03-g   : (R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur; D-6 R03-g ile aynı ilke) YENİ: Z23-a (G3) token JWT olarak OKUNAMADI (sahte API portalToken
 *           opaque) + guard kusur taklidi + kapatma 403 (a = b = c, iki uç aktif — R03-f'de T5 "ürün bulgusu değil") → ADAY/TJ · Z23-b (G3) ikizi guard NORMAL: sahte
 *           API artık ürün gibi JWT olmayan token'ı DB'den önce reddeder → dış zincir 401, kapanışta P7-C4L/D 401 PASS, productFinding YOK · Z23-c (G1)
 *           recoverOpenAccessText + Recover modunda kurtarma nedeni (birim) · Z23-d (G1) uçtan uca iki Recover (Z16-b makbuzu): kapatma 403 → "bu Recover kapatamadı"
 *           korunur; kapatma 201 + P7-C2 PASS + dış giriş ölçümünden sonra yeniden açma (sahte API reopenOn extLogin) → "Recover kapattı (kapatma çağrısı 2xx, P7-C2
 *           PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — açık erişim KAPANMADI; …", "kapatamadı" YOK. DEĞİŞEN: Z21-a (G3/G4/G5: TJ hücresi;
 *           sıra girdileri B-TG, T1-TG, B-TJ, T1-TJ; T2 a = c ≠ b dalında b > c → ALTINDA notu; 33 girdi, 14 hücre) · Z21-l (G3: opaque token + guard kusur taklidi →
 *           T2 değil TJ; sahte API opaque token ürün davranışı değildir — ürün guard'ı JWT olmayan token'ı :36'da DB'den önce reddeder) · T-11 (çağrı 5 bağımsız
 *           değişkenli; Run TJ girdisini claimDurum OKUNAMADI'dan kurar).
 * R04     : (owner talimatı madde 5 — "R04-recover-girdi"; D-6 R04 ile aynı ilke) YENİ: T-13 (birim + statik; STATİK bölümde, disposable DB / sahte API senaryosu
 *           GEREKTİRMEZ) ret ölçütlerinde (P7-C3L/D · P7-C4L/D) 503 / 429 dışındaki 5xx gözlemi "ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak
 *           sınıflanmadı)"; verdict ve çıkış kodu değişmedi (koşum sonucu paket belgesi §14.9'da).
 * R04-b   : (aşama 2; D-6 R04-b (a) ile aynı ilke) DEĞİŞEN: Z18 (v) (kanıtta makbuz varken adım `-Mode Recover -RunEvidenceDir '<kanıt dizini>'`; diskteki makbuzun
 *           durumu yalnız bilgi — güncelken de `-ReceiptFile` önerilmez; kanıtta makbuz yokken dosya okunabiliyorsa `-ReceiptFile <makbuz>`) · Z19-b (elle TEK
 *           komut KALDIRILDI; yerine GERÇEK koşucu kanıtının kopyasından kurulan tamamlanmış Run kanıt dizininde bloğun çıkarma fonksiyonları — AST ile;
 *           Write-Manifest + Test-RunEvidenceSource + New-RecoverInputFromRun — Windows PowerShell 5.1 VE PowerShell 7'de koşulur; kardeş dizindeki makbuzla
 *           GERÇEK Recover kimlik bağı OK ile koşar ve makbuz baytları Recover'dan sonra AYNI — D-7 Recover makbuza yazmaz) · Z20-d (BAYAT makbuz: aynı seçenek
 *           + durum bilgisi) · C-1 (hiçbir kanıtta elle komut yok; kanıtta makbuz metni olan her Run adımı -RunEvidenceDir seçeneğini gösterir). YENİ: T-14
 *           (statik: koşucuda elle komut / `receiptFromEvidenceCommand` yok; Recover makbuz dosyasına yazmaz; blok aynı seçeneği gösterir). Elle komutu iki
 *           kabukta koşan eski ölçüm kaldırıldı: komut artık hiçbir çıktıda yok; makbuzu bloğun yazdığı yol blok öz-testi RG-1'de (sahte koşucu kanıtı) ve
 *           burada (gerçek koşucu kanıtı) ölçülür.
 * R05     : (2026-10-08; owner kararı "D-7 dar düzeltme" — kapsam ihlalinde dur) YENİ: Z24-a … Z24-f (kapsam dışı üç ölçütün HER BİRİNDE FAIL ve ÖLÇÜLEMEYEN yolu;
 *           sahte API `scope` düğmesi yalnız o denemeye uygulanır): durduran ölçütün verdict'i değişmez, sonraki ölçütler ÖLÇÜLEMEYEN (PASS / FAIL değil), sonraki
 *           işlevsel çağrı 0 (dış: başka mesaj POST'u, unread-count, mark-read yok; yerel: personel mesaj uçları yok), giriş bilgisi gösterilmedi, telefon
 *           beklenmedi, kapanış ölçütlerinin tamamı PASS; FAIL yolunda çıkış 2, ÖLÇÜLEMEYEN yolunda çıkış 3 (FAIL sayısı 0) · Z24-g / Z24-h (durdurma + kapatma
 *           500: çıkış 6; durduran ölçütün satırı kanıtta FAIL / ÖLÇÜLEMEYEN olarak DURUR — kapanış başarısızlığı gizlenmez, ihlal de gizlenmez) · Z24-i
 *           (hatasız akış korunur: Z1 koşumunda üç ölçüt kapıda PASS, `scopeStop` yok, gösterim yapıldı) · T-15 (statik: üç durdurma noktası kendi dosyasıyla
 *           mesajdan ÖNCE; kapı listesi; durdurma istisna fırlatmaz). DEĞİŞEN: Z3 (eski baytlar ihlalden sonra akışı sürdürüp gösterim yapıyordu — artık D7-4N'de
 *           durur) · Z4-a (müvekkil mesajı 500 iken kapsam denemesi de 500 → D7-4N FAIL → durur; koşucu hiç mesaj yazmadığı için P7-MSG-KEPT ÖLÇÜLEMEYEN).
 * R06     : (2026-10-09; owner kararı "300 saniyelik gözlem penceresi") DEĞİŞEN: P-1 (canlı inceleme süresi 300000 ms açıkça ölçülür). YENİ: P-VIEW (statik +
 *           ekran): canlı `D7_VIEW_MS` = 300000 ve tek bekleme; giriş bekleme 20 dk aynı; koşucu konsoldan girdi OKUMAZ; owner ekranı numaralı telefon
 *           adımlarını, GÖZLEM A (mesaj listesi) ile GÖZLEM B'yi (ikinci yanıt) AYRI adımlar olarak ve süreyi gösterir — Z1 koşumunun gösterim dosyasında.
 */
const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, process.env.D7_T_RUN_OVERRIDE ? path.basename(process.env.D7_T_RUN_OVERRIDE) : 'd7-portal-messages-live-run.js');
const FAKE = path.join(HERE, 'd7-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd7-owner-live-block.ps1');
// KÜTÜPHANE KÖKÜ (Prisma istemcisi + bcrypt): canlı yayın ağacı VARSAYILMAZ. D7T_LIB_ROOT verilirse o; verilmezse bu betiğin bulunduğu
// checkout'un proje kökü (betik konumundan göreli). Kök canlı yayın ağacının altındaysa test KOŞMAZ — ret, kökte hiçbir dosya yoklanmadan /
// yüklenmeden ÖNCE, yalnız yol karşılaştırmasıyla yapılır; kök bağlantı (junction/symlink) üzerinden canlı ağaca çözülüyorsa da KOŞMAZ.
// Modül bulunamazsa açık hatayla DURUR; sessizce canlı ağaca DÜŞMEZ. Canlı ağaç yolu burada literal DEĞİLDİR: owner bloğunun `$Rel` sabitinden
// okunur (blok yalnız METİN olarak okunur, çalıştırılmaz); okunamazsa ret denetimi yapılamayacağı için test başlamaz.
const maskUser = (s) => { const u = process.env.USERNAME || ''; const t = String(s).replace(/([\\/]Users[\\/])[^\\/]+/gi, '$1<kullanici>'); return u.length >= 3 ? t.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<kullanici>') : t; };
const libStop = (msg) => { console.log(`OLCULEMEDI: ${msg} — test BAŞLAMADI`); process.exit(2); };
const LIVE_TREE = (() => {
  let m = null; try { m = fs.readFileSync(WRAPPER, 'utf8').match(/^\$Rel\s*=\s*'([A-Za-z]:\\[^'\r\n]+)'/m); } catch (e) { m = null; }
  if (!m) return null; const p = path.resolve(m[1]); return path.basename(p).toLowerCase() === 'project' ? path.dirname(p) : p;
})();
const underLive = (p) => (path.resolve(p).toLowerCase() + path.sep).startsWith(LIVE_TREE.toLowerCase() + path.sep);
const realOf = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return null; } };
const LIB_SRC = process.env.D7T_LIB_ROOT ? 'D7T_LIB_ROOT' : 'betik konumu: checkout proje kökü';
const REL = path.resolve(process.env.D7T_LIB_ROOT || path.join(HERE, '..', '..', '..', '..'));
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const LIB_HINT = 'D7T_LIB_ROOT ile bağımlılıkları kurulu, canlı OLMAYAN bir checkout proje kökü verin';
if (!LIVE_TREE) libStop('canlı yayın ağacı yolu owner bloğundan ($Rel) okunamadı; kütüphane kökü ret denetimi yapılamıyor');
if (underLive(REL)) libStop(`kütüphane kökü canlı yayın ağacının altında: ${maskUser(REL)} (${LIB_SRC}) — izole test canlı ağaçtan modül YÜKLEMEZ (kökte hiçbir dosya yoklanmadı/yüklenmedi); ${LIB_HINT}`);
if (!fs.existsSync(REL)) libStop(`kütüphane kökü yok: ${maskUser(REL)} (${LIB_SRC}); ${LIB_HINT} (canlı yayın ağacına DÜŞÜLMEZ)`);
const libMissing = [['@prisma/client', PRISMA_ROOT], ['bcrypt', BCRYPT]].filter(([, p]) => !fs.existsSync(path.join(p, 'package.json'))).map(([n]) => n);
if (libMissing.length) libStop(`kütüphane kökünde modül bulunamadı: ${libMissing.join(', ')} · kök=${maskUser(REL)} (${LIB_SRC}); ${LIB_HINT} (canlı yayın ağacına DÜŞÜLMEZ)`);
if ([REL, PRISMA_ROOT, BCRYPT].map(realOf).some((p) => !p || underLive(p))) libStop(`kütüphane kökü bağlantı üzerinden canlı yayın ağacına çözülüyor ya da gerçek yolu okunamadı: ${maskUser(REL)} (${LIB_SRC}) — modül YÜKLENMEDİ; ${LIB_HINT}`);
console.log(`kütüphane kökü: ${maskUser(REL)} (kaynak: ${LIB_SRC}; canlı yayın ağacı DEĞİL; Prisma istemcisi + bcrypt buradan yüklenir)`);
const API_PORT = 8200; const EXT_PORT = 8459;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
const R27_CAND_DIST = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'; // canlı ön koşul: R27 dist (D-5 ile aynı)

let P2DIR = null; const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// R03: disposable DB kendi tek kullanımlık konteynerinden gelir (port sabit DEĞİL). Kapı: yalnız 127.0.0.1 · port var ve 5432 DEĞİL · veritabanı
// adı `_test` ile biter ve `hukuk_db` DEĞİL. Koşucuya beklenen DB adı bu addan verilir (D7_EXPECT_DB).
let DB_NAME = null;
function dbUrl() {
  const u = process.env.D7T_DB_URL || ''; let p; try { p = new URL(u); } catch (e) { return null; }
  let name = ''; try { name = decodeURIComponent(p.pathname.replace(/^\//, '')); } catch (e) { return null; }
  if (p.hostname !== '127.0.0.1' || !p.port || p.port === '5432' || !/^[a-z0-9_]+_test$/.test(name) || name === 'hukuk_db') return null;
  DB_NAME = name; return u;
}
async function ctl(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
let DBURL; let certFile; let prisma; const artifacts = []; const secretsSeen = new Set(); const sinks = new Set();

function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method, headers, ca: fs.readFileSync(certFile), timeout: 10000 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
const H = { 'user-agent': PHONE_UA, 'content-type': 'application/json' };
async function waitSinkCreds(sink, ms) {
  const t0 = Date.now();
  for (;;) {
    if (fs.existsSync(sink)) { const t = fs.readFileSync(sink, 'utf8'); const e = t.match(/E-posta : (\S+)/); const p = t.match(/Parola  : (D7p![A-Za-z0-9_-]+)/); if (e && p) return { email: e[1], password: p[1] }; }
    if (Date.now() - t0 > ms) return null; await sleep(200);
  }
}
/** Telefon taklidi: sayfa → giriş → liste → mark-read (web sayfası gibi) → (ops.) mesaj gönder → 2. personel yanıtını bekle. */
async function phoneFlow(runId, sink, opts = {}) {
  const out = {}; const creds = await waitSinkCreds(sink, 12000); out.creds = !!creds; if (!creds) return out;
  out.page = (await httpsReq('GET', `${EXT}/portal/messages`, H)).status;
  const login = await httpsReq('POST', `${EXT}/api/portal/login`, H, JSON.stringify({ email: creds.email, password: creds.password }));
  out.login = login.status; out.token = login.body && login.body.token; if (!out.token) return out;
  const A = Object.assign({ authorization: `Bearer ${out.token}` }, H);
  const l = await httpsReq('GET', `${EXT}/api/portal/messages`, A); out.list = l.status; out.count = Array.isArray(l.body) ? l.body.length : null;
  const want = [`D7-${runId}`, `D7-${runId}-CASE`, `D7-${runId}-OFFICE-1`];
  out.sawThree = Array.isArray(l.body) && want.every((c) => l.body.some((m) => m && m.content === c));
  out.markRead = (await httpsReq('POST', `${EXT}/api/portal/messages/mark-read`, A, '{}')).status;
  if (!opts.noSend) { const content = 'PHONE-' + crypto.randomBytes(8).toString('hex'); secretsSeen.add(content); out.sent = (await httpsReq('POST', `${EXT}/api/portal/messages`, A, JSON.stringify({ content }))).status; }
  const t0 = Date.now(); out.sawOffice2 = false;
  while (Date.now() - t0 < 12000) { const r = await httpsReq('GET', `${EXT}/api/portal/messages`, A); if (Array.isArray(r.body) && r.body.some((m) => m && m.content === `D7-${runId}-OFFICE-2`)) { out.sawOffice2 = true; break; } await sleep(300); }
  if (out.sawOffice2) { const u = await httpsReq('GET', `${EXT}/api/portal/messages/unread-count`, A); out.unreadAfterOffice2 = u.body && u.body.count; }
  return out;
}

function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.D7_RUNID) || hex8(); const pw = 'D7T!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-D7-20000101-R${String(10 + Math.floor(Math.random() * 89))}`;
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`); const sink = path.join(dir, `${name}-display.sink`); sinks.add(sink);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: go, D7_RUNID: runId, D7_EXPECT_DB: DB_NAME,
      D7_EXPECT_TENANT_SLUG: `ah-${runId}`, D7_API_BASE: API, D7_EXPECT_API: API, D7_EXPECT_BASE_URL: EXT,
      D7_LIVE_LOGIN_PW: pw, D7_RECEIPT: receipt, D7_EVID_FILE: evid, D7_DISPLAY: 'none', D7_TEST_DISPLAY_SINK: sink,
      D7_WAIT_MS: '15000', D7_POLL_MS: '300', D7_VIEW_MS: '1500', D7_HTTP_TIMEOUT_MS: '5000', D7_CALL_TIMEOUT_MS: '5000', D7_LATE_CREATE_MS: '6000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; const phoneRes = []; let hookDone = Promise.resolve();
    const onData = (c) => {
      log += c;
      if (!fired && /OK\s+P7-DISP/.test(log) && hooks.onDisplay) { fired = true; hookDone = hooks.onDisplay(runId, sink).then((r) => phoneRes.push(r), (e) => phoneRes.push({ error: String(e.message || e) })); }
    };
    ch.stdout.on('data', onData); ch.stderr.on('data', onData);
    ch.on('close', async (code) => {
      await hookDone;
      if (hooks.afterExit) await hooks.afterExit();   // R03-c: koşucu çıktıktan SONRA, makbuz okunmadan ÖNCE (ör. testin kurduğu klasörü kaldırmak)
      fs.writeFileSync(path.join(dir, `${name}.log`), log, 'utf8'); artifacts.push(path.join(dir, `${name}.log`), receipt, evid);
      const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((s) => secretsSeen.add(s));
      const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
      const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
      const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
      const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
      const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
      const pu = rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: rc.clientId }, select: { isActive: true, tokenVersion: true, loginCount: true } }) : null;
      const cl = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { hasPortalAccess: true } }) : null;
      const msgs = rc ? await prisma.portalMessage.findMany({ where: { clientId: rc.clientId }, select: { senderType: true, isRead: true, caseId: true, content: true } }) : [];
      const notes = rc ? await prisma.portalNotification.count({ where: { clientId: rc.clientId } }) : 0;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      resolve({ runId, code, log, ev, v, o, tenant, receipt, rc, pu, cl, msgs, notes, activeUsers, activeCases, phone: phoneRes, calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext') });
    });
  });
}
async function recover(prev, dir, name, sc, envOver) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
  const pw = 'D7R!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    D7_MODE: 'recover', D7_RECOVER_CONFIRM: '1', D7_RUNID: prev.runId, D7_EXPECT_DB: DB_NAME, D7_API_BASE: API, D7_EXPECT_API: API,
    D7_EXPECT_BASE_URL: EXT, D7_LIVE_LOGIN_PW: pw, D7_RECEIPT: prev.receipt, D7_EVID_FILE: evid, D7_DISPLAY: 'none', D7_HTTP_TIMEOUT_MS: '5000', D7_CALL_TIMEOUT_MS: '5000',
    D7_POLL_MS: '300', D7_LATE_CREATE_MS: '6000' }, envOver || {});
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const pu = await prisma.clientPortalUser.findUnique({ where: { clientId: prev.rc.clientId }, select: { isActive: true, tokenVersion: true } });
  const cl = await prisma.client.findUnique({ where: { id: prev.rc.clientId }, select: { hasPortalAccess: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((x) => secretsSeen.add(x));
  const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  const msgs = await prisma.portalMessage.count({ where: { clientId: prev.rc.clientId } });
  return { code, pu, cl, ev, v, o, msgs, calls: await ctl('GET', '/__calls'), activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const FLOW = ['P7-00', 'P7-01', 'P7-02', 'P7-03L', 'P7-04D', 'D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-4P', 'D7-3', 'D7-3N', 'D7-3U', 'D7-3G', 'D7-3F', 'P7-DISP', 'P7-WAIT', 'D7-3B'];
const CLOSE = ['P7-C1', 'P7-C2', 'P7-C2V', 'P7-C3L', 'P7-C3D', 'P7-C4L', 'P7-C4D', 'P7-C5', 'U-CLOSE', 'P7-MSG-KEPT', 'P7-D9'];
const closedAll = (z) => CLOSE.every((id) => z.v(id) === 'PASS');
// R05 — kapsam durdurması ölçümü. `id` durduran ölçüt; `verdict` beklenen verdict'i (FAIL / UNMEASURED). Döner: { ok, obs } — her alt koşul ayrı adlandırılır.
const SCOPE_ORDER = ['D7-4N', 'D7-4S', 'D7-4U'];
const SCOPE_REST = ['D7-4P', 'D7-3', 'D7-3N', 'D7-3U', 'D7-3G', 'D7-3F'];
function scopeStopState(z, id, verdict, dir, name) {
  const i = SCOPE_ORDER.indexOf(id); const before = SCOPE_ORDER.slice(0, i); const after = SCOPE_ORDER.slice(i + 1).concat(SCOPE_REST);
  const ev = z.ev || {}; const ss = ev.scopeStop || {};
  const extPost = z.ext.filter((c) => c.method === 'POST' && c.path === '/api/portal/messages').length;
  const extRead = z.ext.filter((c) => /\/api\/portal\/messages\/(unread-count|mark-read)/.test(c.path)).length;
  const staffMsg = z.calls.filter((c) => /\/api\/portal\/admin\/messages\//.test(c.path)).length;
  let sinkCreds = false; try { sinkCreds = /Parola|E-posta/.test(fs.readFileSync(path.join(dir, `${name}-display.sink`), 'utf8')); } catch (e) { sinkCreds = false; }
  const c = {
    durduran: z.v(id) === verdict,
    onceki: ['D7-1', 'D7-2', ...before].every((x) => z.v(x) === 'PASS'),
    sonraki: after.every((x) => z.v(x) === 'UNMEASURED' && z.o(x).includes(`kapsam dışı ölçüt ${id}=`)),
    telefon: ['P7-DISP', 'P7-WAIT', 'D7-3B'].every((x) => z.v(x) === 'UNMEASURED'),
    kanit: ss.olcut === id && ss.verdict === verdict && JSON.stringify(ss.kosulmayan) === JSON.stringify(after) && typeof ev.stopped === 'string' && ev.stopped.includes(`kapsam dışı ölçüt ${id}=${verdict === 'FAIL' ? 'FAIL' : 'ÖLÇÜLEMEYEN'}`),
    cagri: extPost === 2 + i && extRead === 0 && staffMsg === 0,
    gosterim: ev.displayed === false && z.phone.length === 0 && !sinkCreds,
    kapanis: closedAll(z) && z.v('U-ISO') === 'PASS' && !!z.pu && z.pu.isActive === false && !!z.cl && z.cl.hasPortalAccess === false && z.activeUsers === 0 && z.activeCases === 0,
    passYok: [id, ...after, 'P7-DISP', 'P7-WAIT', 'D7-3B'].every((x) => z.v(x) !== 'PASS'),
  };
  const bad = Object.keys(c).filter((k) => !c[k]);
  return { ok: bad.length === 0, c, obs: `çıkış=${z.code} · ${id}=${z.v(id)} (${z.o(id)}) · tutmayan=${bad.join(',') || 'yok'} · dış mesaj POST=${extPost} · dış sayaç/okundu=${extRead} · yerel personel mesaj ucu=${staffMsg} · FAIL=${ev.fail} · ÖLÇÜLEMEYEN=${ev.unmeasured}` };
}
const adminExt = (z) => z.ext.filter((c) => /\/api\/portal\/admin/.test(c.path)).length;
const fullPhone = (runId, sink) => phoneFlow(runId, sink);
const shouldNot = { onDisplay: async () => ({ displayedButShouldNot: true }) };
/**
 * R03 (a) — KURULUM ARIZASI: disposable DB'ye YALNIZ verilen değere (bu senaryonun runId'sinden türeyen dosya no / slug) bağlı geçici bir
 * BEFORE INSERT tetikleyicisi kurulur; koşucuya test kancası EKLENMEZ (koşucu canlıdakiyle aynı kodu koşar). Tetikleyici senaryodan sonra kaldırılır.
 */
async function withInsertFault(table, column, value, fn) {
  if (!/^[A-Za-z]+$/.test(table) || !/^[A-Za-z]+$/.test(column) || !/^[A-Za-z0-9-]+$/.test(value)) throw new Error('tetikleyici girdisi biçimsiz');
  const name = `d7t_fault_${crypto.randomBytes(4).toString('hex')}`;
  await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION d7t_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF to_jsonb(NEW)->>TG_ARGV[0] = TG_ARGV[1] THEN RAISE EXCEPTION \'D7T kasitli yazma hatasi (%)\', TG_ARGV[1]; END IF; RETURN NEW; END $f$');
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION d7t_fail_insert('${column}', '${value}')`);
  try { return await fn(); } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "${table}"`); }
}

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (D7T_DB_URL → 127.0.0.1:<5432 dışı port>/<ad>_test; hukuk_db değil) yok — test BAŞLAMADI'); process.exit(2); }
  console.log(`disposable DB: 127.0.0.1:${new URL(DBURL).port}/${DB_NAME}`);
  const dir = P2DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'd7-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { D7F_DB_URL: DBURL, D7F_PRISMA_ROOT: PRISMA_ROOT, D7F_BCRYPT: BCRYPT,
    D7F_API_PORT: String(API_PORT), D7F_EXT_PORT: String(EXT_PORT), D7F_CERT: certFile, D7F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı'); fake.kill(); process.exit(2); }
  try {
    // ---- Z1 NORMAL: mesaj akışı + telefon (giriş, liste, mark-read, mesaj gönderimi, 2. yanıt) + kapanış + kalıntı
    const z1 = await runScenario('z1-normal', dir, {}, {}, { onDisplay: fullPhone });
    const all = [...FLOW, ...CLOSE, 'U-ISO'];
    check('Z1-a', 'normal akış: çıkış 0; D-7 + kapanış ölçütlerinin tamamı PASS', z1.code === 0 && all.every((id) => z1.v(id) === 'PASS'), `çıkış=${z1.code} · PASS olmayan=${all.filter((id) => z1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = z1.phone[0] || {};
    check('Z1-b', 'telefon: mesaj sayfası 200, giriş 201, liste 200 ve bu koşumun 3 mesajı görüldü, mark-read 2xx, mesaj gönderimi 201, 2. personel yanıtı listede görüldü',
      ph.page === 200 && ph.login === 201 && ph.list === 200 && ph.sawThree === true && ph.markRead >= 200 && ph.markRead < 300 && ph.sent === 201 && ph.sawOffice2 === true,
      `sayfa=${ph.page} giriş=${ph.login} liste=${ph.list}/${ph.count} üç=${ph.sawThree} mark=${ph.markRead} gönder=${ph.sent} yanıt2=${ph.sawOffice2} unread2=${ph.unreadAfterOffice2}`);
    const res = z1.ev && z1.ev.messageResidue;
    check('Z1-c', 'kalıntı: DB\'de 5 mesaj (koşucu 4: müvekkil ×2, personel ×2 · telefon 1) + 2 bildirim; kanıt "saklandı … SİLİNMEDİ" der, silindi DEMEZ; deleted=false',
      z1.msgs.length === 5 && z1.msgs.filter((m) => m.senderType === 'OFFICE').length === 2 && z1.notes === 2 && !!res && res.portalMessages === 5 && res.runnerWritten === 4 && res.phoneSent === 1 && res.portalNotifications === 2 && res.deleted === false
        && /saklandı: 5 mesaj/.test(z1.o('P7-MSG-KEPT')) && /SİLİNMEDİ/.test(z1.o('P7-MSG-KEPT')) && !/silindi/i.test(z1.o('P7-MSG-KEPT')),
      `mesaj=${z1.msgs.length} bildirim=${z1.notes} · kalıntı=${JSON.stringify(res)}`);
    check('Z1-d', 'koşucu: yasak uç 0; admin uçları YALNIZ yerel (dış sunucuda admin çağrısı 0; externalAdminCalled=false); personel POST ×3 (yanıt 1, yabancı, yanıt 2) + GET ×1 yerel; disable-user çağrıldı',
      !z1.calls.some((c) => c.forbidden) && z1.ev.forbiddenEndpointCalled === false && z1.ev.externalAdminCalled === false && adminExt(z1) === 0
        && z1.calls.filter((c) => c.method === 'POST' && /^\/api\/portal\/admin\/messages\//.test(c.path)).length === 3 && z1.calls.filter((c) => c.method === 'GET' && /^\/api\/portal\/admin\/messages\/[^/]+$/.test(c.path) && !/clients$/.test(c.path)).length === 1
        && z1.calls.some((c) => c.path === '/api/portal/admin/disable-user'), `yasak=${z1.calls.filter((c) => c.forbidden).length} dışAdmin=${adminExt(z1)}`);
    check('Z1-e', 'DB: portal pasif · sürüm ≥ 1 · erişim kapalı · personel pasif · dosya kapalı (aynı tenant 2. müvekkil dosyası dahil) · yabancı tenant müvekkilinde mesaj yok · yabancı/aynı-tenant-başka-müvekkil caseId satırı yok',
      !!z1.pu && z1.pu.isActive === false && z1.pu.tokenVersion >= 1 && z1.cl.hasPortalAccess === false && z1.activeUsers === 0 && z1.activeCases === 0
        && (await prisma.portalMessage.count({ where: { clientId: z1.rc.foreignClientId } })) === 0 && (await prisma.portalMessage.count({ where: { caseId: z1.rc.foreignCaseId } })) === 0
        && typeof z1.rc.sameTenantOtherCaseId === 'string' && (await prisma.portalMessage.count({ where: { caseId: z1.rc.sameTenantOtherCaseId } })) === 0,
      `portal=${JSON.stringify(z1.pu)} kullanıcı=${z1.activeUsers} dosya=${z1.activeCases}`);
    const after = ph.token ? await httpsReq('GET', `${EXT}/api/portal/messages`, { authorization: `Bearer ${ph.token}` }) : { status: null };
    check('Z1-f', 'kapanıştan sonra TELEFONUN oturumu mesaj ucunda dış 401; D7-4N gözlemi 400 + satır yok; telefon gözlemi (office2ReadByPhone) kanıtta yalnız boolean',
      after.status === 401 && /HTTP 400/.test(z1.o('D7-4N')) && /satırı=0/.test(z1.o('D7-4N')) && z1.ev.phoneObservation && typeof z1.ev.phoneObservation.office2ReadByPhone === 'boolean', `HTTP ${after.status} · D7-4N=${z1.o('D7-4N')} · tel=${JSON.stringify(z1.ev.phoneObservation)}`);
    // İnceleme düzeltmeleri: D7-3G gövde biçimi ürün sözleşmesi ({client,messages}) ve tüm koşum mesajları listede (3/3: müvekkil ×2 + personel 1);
    // D7-4S aynı tenant başka müvekkil dosyası 400 + satır yok; D7-3B DB satırı ölçütte; P7-MSG-KEPT gerçek sayım (yerinde=4/4); makbuzda runnerMessageIds (4).
    check('Z1-g', 'D7-3G gözlemi "gövde={client,messages} · listede=3/3"; D7-4S "HTTP 400 · satırı=0"; D7-3B "satır=true"; P7-MSG-KEPT "yerinde=4/4"; makbuz runnerMessageIds 4 id',
      /gövde=\{client,messages\} · listede=3\/3/.test(z1.o('D7-3G')) && z1.v('D7-4S') === 'PASS' && /HTTP 400 · başka müvekkil caseId satırı=0/.test(z1.o('D7-4S')) && /satır=true/.test(z1.o('D7-3B'))
        && /yerinde=4\/4 · saklandı: 5 mesaj \(koşucu 4 · telefon 1\)/.test(z1.o('P7-MSG-KEPT')) && Array.isArray(z1.rc.runnerMessageIds) && z1.rc.runnerMessageIds.length === 4,
      `3G=${z1.o('D7-3G')} · 4S=${z1.o('D7-4S')} · 3B=${z1.o('D7-3B')} · KEPT=${z1.o('P7-MSG-KEPT')} · ids=${(z1.rc.runnerMessageIds || []).length}`);

    // ---- Z2 KUSUR TAKLİDİ: liste başka müvekkilin mesajını da döndürüyor → D7-2 FAIL, çıkış 2; tuzak içerik kanıta girmez
    const z2 = await runScenario('z2-list-leak', dir, { list: 'leak' }, {});
    check('Z2', 'liste sızıntısı: D7-2 FAIL (yabancı≥1), gösterim YOK, kapanış PASS, çıkış 2', z2.code === 2 && z2.v('D7-2') === 'FAIL' && /yabancı=1/.test(z2.o('D7-2')) && z2.ev.displayed === false && closedAll(z2), `çıkış=${z2.code} · D7-2=${z2.o('D7-2')}`);

    // ---- Z3 KUSUR TAKLİDİ: kapsam dışı caseId kabul ediliyor → R05: koşucu İLK ihlalde (D7-4N FAIL: 201 + satır) DURUR; çıkış 2
    const z3 = await runScenario('z3-foreign-accept', dir, { send: 'foreignAccept' }, {}, shouldNot);
    const z3s = scopeStopState(z3, 'D7-4N', 'FAIL', dir, 'z3-foreign-accept');
    check('Z3', 'kapsam dışı caseId kabul (R05; önceki baytlar akışı sürdürüp gösterim + telefon yapıyordu): D7-4N FAIL (HTTP 201, satır yazıldı) → koşucu DURDU: D7-4S, D7-4U ve kalan mesaj / yanıt / okundu ölçütleri ÖLÇÜLEMEYEN (denenmedi), gösterim YOK, telefon YOK, kapanış PASS, çıkış 2; yabancı caseId satırı DB\'de 1, aynı-tenant-başka-müvekkil caseId satırı 0 (deneme yapılmadı); kabul edilen satır koşucunun sayılır: kalıntı 2 (koşucu 2), makbuzda 2 id',
      z3.code === 2 && z3s.ok && /HTTP 201/.test(z3.o('D7-4N')) && z3.ev.fail === 1
        && (await prisma.portalMessage.count({ where: { caseId: z3.rc.foreignCaseId } })) === 1 && (await prisma.portalMessage.count({ where: { caseId: z3.rc.sameTenantOtherCaseId } })) === 0
        && z3.ev.messageResidue.runnerWritten === 2 && z3.msgs.length === 2 && (z3.rc.runnerMessageIds || []).length === 2, `${z3s.obs} · kalıntı=${z3.msgs.length} · makbuz id=${(z3.rc.runnerMessageIds || []).length}`);

    // ---- Z24 (R05) KAPSAM İHLALİNDE DUR: üç ölçütün HER BİRİNDE FAIL ve ÖLÇÜLEMEYEN yolu; sonraki işlevsel çağrı / gösterim YOK; kapanış ÇALIŞIR
    const z24 = [
      ['Z24-a', 'D7-4N', 'FAIL', { scope: 'N:accept' }, {}, 'yabancı tenant dosyası KABUL (201 + satır)'],
      ['Z24-b', 'D7-4N', 'UNMEASURED', { scope: 'N:429' }, {}, 'yabancı tenant dosyası denemesi HTTP 429'],
      ['Z24-c', 'D7-4S', 'FAIL', { scope: 'S:accept' }, {}, 'aynı tenantta başka müvekkilin dosyası KABUL (201 + satır)'],
      ['Z24-d', 'D7-4S', 'UNMEASURED', { scope: 'S:503' }, {}, 'aynı tenantta başka müvekkilin dosyası denemesi HTTP 503'],
      ['Z24-e', 'D7-4U', 'FAIL', { scope: 'U:accept' }, {}, 'bulunmayan kimlik KABUL (201 + dosyasız satır)'],
      ['Z24-f', 'D7-4U', 'UNMEASURED', { scope: 'U:hang' }, { D7_HTTP_TIMEOUT_MS: '1500' }, 'bulunmayan kimlik denemesi YANITSIZ (zaman aşımı)'],
    ];
    for (const [zid, sid, verdict, sc, over, what] of z24) {
      const nm = `${zid.toLowerCase()}-scope`; const z = await runScenario(nm, dir, sc, over, shouldNot); const st = scopeStopState(z, sid, verdict, dir, nm);
      const isFail = verdict === 'FAIL'; const want = isFail ? 2 : 3;
      const written = isFail ? 2 : 1;   // D7-1 + (FAIL yolunda) ürünün kabul ettiği satır
      check(zid, `R05 ${sid} ${isFail ? 'FAIL' : 'ÖLÇÜLEMEYEN'} (${what}): durduran ölçütün verdict'i ${isFail ? 'FAIL (ÖLÇÜLEMEYEN\'e çevrilmedi)' : 'ÖLÇÜLEMEYEN (FAIL üretilmedi: FAIL sayısı 0)'}; önceki ölçütler PASS; sonraki kapsam / mesaj / yanıt / okundu ölçütleri ve gösterim / telefon / 2. yanıt ÖLÇÜLEMEYEN (hiçbiri PASS değil); durdurmadan sonra dış mesaj POST'u, unread-count, mark-read ve yerel personel mesaj ucu çağrısı 0; giriş bilgisi gösterilmedi; kapanış ölçütlerinin tamamı PASS (portal pasif, erişim kapalı, aktif personel 0, açık dosya 0); çıkış ${want}; koşucunun yazdığı satır ${written}`,
        z.code === want && st.ok && (isFail ? z.ev.fail === 1 : z.ev.fail === 0) && z.msgs.length === written && (z.rc.runnerMessageIds || []).length === written && z.ev.messageResidue.runnerWritten === written,
        `${st.obs} · satır=${z.msgs.length} · makbuz id=${(z.rc.runnerMessageIds || []).length}`);
    }
    // Z24-g / Z24-h: durdurma + KAPANIŞ BAŞARISIZ (kapatma 500) → çıkış 6; durduran ölçütün satırı kanıtta DURUR (ihlal de, kapanış başarısızlığı da gizlenmez)
    const z24g = await runScenario('z24g-scope-fail-disable-fail', dir, { scope: 'S:accept', disable: 'fail' }, {}, shouldNot);
    const z24h = await runScenario('z24h-scope-unm-disable-fail', dir, { scope: 'N:503', disable: 'fail' }, {}, shouldNot);
    const noFlow = (z) => z.calls.filter((c) => /\/api\/portal\/admin\/messages\//.test(c.path)).length === 0 && z.ev.displayed === false && z.phone.length === 0;
    check('Z24-g', 'R05 D7-4S FAIL + kapatma 500: çıkış 6 (2 değil — kapanış başarısızlığı öne geçer); D7-4S kanıtta FAIL olarak DURUR (FAIL sayısı ≥ 2: ihlal + kapanış); P7-C2 FAIL, P7-D9 FAIL; kurtarma notu VAR; portal hesabı DB\'de AKTİF (kapanmadı — gizlenmedi); personel / dosya kapanışı yine çalıştı (U-CLOSE PASS); sonraki işlevsel çağrı ve gösterim yok',
      z24g.code === 6 && z24g.v('D7-4S') === 'FAIL' && !!z24g.ev.scopeStop && z24g.ev.scopeStop.olcut === 'D7-4S' && z24g.v('P7-C2') === 'FAIL' && z24g.v('P7-D9') === 'FAIL' && z24g.ev.fail >= 2 && z24g.ev.recovery.gerekli === true
        && z24g.pu.isActive === true && z24g.v('U-CLOSE') === 'PASS' && z24g.activeUsers === 0 && noFlow(z24g), `çıkış=${z24g.code} · D7-4S=${z24g.v('D7-4S')} · P7-C2=${z24g.v('P7-C2')} · P7-D9=${z24g.v('P7-D9')} · FAIL=${z24g.ev.fail} · portal aktif=${z24g.pu.isActive}`);
    check('Z24-h', 'R05 D7-4N ÖLÇÜLEMEYEN + kapatma 500: çıkış 6; D7-4N kanıtta ÖLÇÜLEMEYEN olarak DURUR (FAIL\'e çevrilmedi); P7-C2 FAIL, P7-D9 FAIL; kurtarma notu VAR; sonraki işlevsel çağrı ve gösterim yok',
      z24h.code === 6 && z24h.v('D7-4N') === 'UNMEASURED' && !!z24h.ev.scopeStop && z24h.ev.scopeStop.verdict === 'UNMEASURED' && z24h.v('P7-C2') === 'FAIL' && z24h.v('P7-D9') === 'FAIL' && z24h.ev.recovery.gerekli === true && noFlow(z24h),
      `çıkış=${z24h.code} · D7-4N=${z24h.v('D7-4N')} · P7-C2=${z24h.v('P7-C2')} · FAIL=${z24h.ev.fail}`);
    // Z24-i: HATASIZ AKIŞ KORUNUR (Z1 koşumu): üç ölçüt kapıda PASS, durdurma kaydı yok, gösterim yapıldı
    check('Z24-i', 'R05 hatasız akış korunur (Z1 koşumu): gösterim kapısı listesi üç kapsam ölçütünü içerir ve hepsi PASS; kanıtta `scopeStop` YOK; `stopped` boş; gösterim yapıldı; çıkış 0',
      z1.code === 0 && JSON.stringify(z1.ev.displayGate) === JSON.stringify(['P7-03L', 'P7-04D', 'D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-3', 'D7-3U'].map((x) => `${x}=PASS`)) && !('scopeStop' in z1.ev) && !z1.ev.stopped && z1.ev.displayed === true,
      `çıkış=${z1.code} · kapı=${(z1.ev.displayGate || []).join(',')} · scopeStop=${'scopeStop' in z1.ev}`);

    // ---- Z4 send 500 → 2/6 kuralı: kapanış PASS ise 2; kapanış doğrulanamazsa 6
    const z4a = await runScenario('z4a-send-500', dir, { send: 'fail' }, {});
    check('Z4-a', 'müvekkil mesajı 500: D7-1/D7-2 FAIL; R05: kapsam denemesi de 500 → D7-4N FAIL → koşucu DURDU (personel yanıtı gönderilmedi); gösterim YOK, telefon BEKLENMEDİ; koşucu hiç mesaj yazmadı → P7-MSG-KEPT ÖLÇÜLEMEYEN (boş doğrulama PASS sayılmaz), diğer kapanış ölçütleri PASS → çıkış 2',
      z4a.code === 2 && z4a.v('D7-1') === 'FAIL' && z4a.v('D7-2') === 'FAIL' && z4a.ev.displayed === false && z4a.v('P7-WAIT') === 'UNMEASURED' && z4a.v('D7-4N') === 'FAIL' && !!z4a.ev.scopeStop && z4a.ev.scopeStop.olcut === 'D7-4N'
        && CLOSE.filter((id) => id !== 'P7-MSG-KEPT').every((id) => z4a.v(id) === 'PASS') && z4a.v('P7-MSG-KEPT') === 'UNMEASURED' && z4a.msgs.length === 0, `çıkış=${z4a.code} · kapı=${(z4a.ev.displayGate || []).join(',')} · KEPT=${z4a.v('P7-MSG-KEPT')}`);
    const z4b = await runScenario('z4b-send-500-disable-fail', dir, { send: 'fail', disable: 'fail' }, {});
    check('Z4-b', 'müvekkil mesajı 500 + kapatma 500: portal kapanışı doğrulanamadı → çıkış 6 (2 değil), kurtarma notu', z4b.code === 6 && z4b.v('P7-C2') === 'FAIL' && z4b.ev.recovery.gerekli, `çıkış=${z4b.code}`);

    // ---- Z5 YARIM KALMA: kapatma 500 → 6; Recover (düzelmiş) → DB kapalı, C4 ÖLÇÜLEMEYEN → 3 (0 DEĞİL); kalıntı raporlanır
    const z5 = await runScenario('z5-half', dir, { disable: 'fail' }, {}, { onDisplay: fullPhone });
    check('Z5-a', 'kapatma 500: akış PASS ama P7-C2 FAIL, P7-D9 FAIL, çıkış 6, kurtarma notu; mesajlar yerinde (5)', z5.code === 6 && z5.v('D7-3B') === 'PASS' && z5.v('P7-C2') === 'FAIL' && z5.v('P7-D9') === 'FAIL' && z5.ev.recovery.gerekli && z5.msgs.length === 5, `çıkış=${z5.code}`);
    const r5 = await recover(z5, dir, 'z5-recover', {});
    check('Z5-b', 'Recover: disable çağrıldı, DB kapalı (pasif + erişim kapalı), yeni giriş 401, C4 ÖLÇÜLEMEYEN → çıkış 3 (0 değil); P7-MSG-KEPT makbuzdaki 4 koşucu id ile GERÇEK sayım PASS "yerinde=4/4 · saklandı: 5 mesaj (koşucu 4 · telefon 1)"; kabul ölçütleri koşulmadı',
      r5.code === 3 && r5.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r5.pu.isActive === false && r5.cl.hasPortalAccess === false && r5.v('P7-C3L') === 'PASS' && r5.v('P7-C4L') === 'UNMEASURED'
        && r5.v('P7-MSG-KEPT') === 'PASS' && /yerinde=4\/4 · saklandı: 5 mesaj \(koşucu 4 · telefon 1\)/.test(r5.o('P7-MSG-KEPT')) && r5.v('D7-1') == null && r5.activeUsers === 0,
      `çıkış=${r5.code} · kalıntı=${r5.o('P7-MSG-KEPT')}`);

    // ---- Z6 KUSUR TAKLİDİ: mark-read okundu işaretlemiyor → D7-3U FAIL, gösterim yok, çıkış 2
    const z6 = await runScenario('z6-markread-noop', dir, { markRead: 'noop' }, {});
    check('Z6', 'mark-read etkisiz: D7-3U FAIL (unread 1 → 1, DB isRead=false), kapı → gösterim YOK, çıkış 2', z6.code === 2 && z6.v('D7-3U') === 'FAIL' && /unread 1 → mark-read HTTP 201 → unread 1/.test(z6.o('D7-3U')) && z6.ev.displayed === false, `çıkış=${z6.code} · 3U=${z6.o('D7-3U')}`);
    // ---- Z7 bildirim satırı üretilmiyor → D7-3N FAIL (kapı dışı: akış devam eder), çıkış 2
    const z7 = await runScenario('z7-no-notify', dir, { reply: 'noNotify' }, {}, { onDisplay: fullPhone });
    check('Z7', 'personel yanıtı bildirim üretmiyor: D7-3N FAIL (bildirim 0→0), gösterim yapıldı, telefon PASS, çıkış 2', z7.code === 2 && z7.v('D7-3N') === 'FAIL' && /bildirim 0→0/.test(z7.o('D7-3N')) && z7.v('P7-WAIT') === 'PASS' && z7.notes === 0, `çıkış=${z7.code} · 3N=${z7.o('D7-3N')}`);
    // ---- Z8 KUSUR TAKLİDİ: guard kapalı hesabın oturumunu geçiriyor → C4 200 → ÜRÜN BULGUSU, çıkış 6
    const z8 = await runScenario('z8-guard-stale', dir, { guard: 'stale' }, {}, { onDisplay: fullPhone });
    check('Z8', 'kapanış sonrası mevcut oturum mesaj ucunda 200: P7-C4L/C4D FAIL, productFinding, P7-D9 FAIL, çıkış 6', z8.code === 6 && z8.v('P7-C4L') === 'FAIL' && z8.v('P7-C4D') === 'FAIL' && /ÜRÜN BULGUSU/.test(z8.ev.productFinding || '') && z8.v('P7-D9') === 'FAIL', `çıkış=${z8.code} · bulgu=${z8.ev.productFinding}`);

    // ---- Z14 YANITSIZ ÇAĞRILAR: ÖLÇÜLEMEYEN, FAIL DEĞİL (inceleme düzeltmesi)
    // Z14-a personel yanıtı yanıtsız (zaman aşımı; satır yazılmaz) → D7-3/D7-3N/D7-3U/D7-3F ÖLÇÜLEMEYEN (bildirim 0→0 FAIL DEĞİL), gösterim yok, çıkış 3
    const z14a = await runScenario('z14a-reply-hang', dir, { reply: 'hang' }, { D7_CALL_TIMEOUT_MS: '1500', D7_HTTP_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z14-a', 'personel yanıtı yanıtsız: D7-3, D7-3N (bildirim 0→0), D7-3U, D7-3F ÖLÇÜLEMEYEN (FAIL yok); D7-1/2/4N/4S/4U/4P/3G PASS; gösterim yok; kapanış PASS; çıkış 3',
      z14a.code === 3 && ['D7-3', 'D7-3N', 'D7-3U', 'D7-3F'].every((id) => z14a.v(id) === 'UNMEASURED') && /bildirim 0→0/.test(z14a.o('D7-3N')) && /personel yanıtı/.test(z14a.o('D7-3U'))
        && ['D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-4P', 'D7-3G'].every((id) => z14a.v(id) === 'PASS') && z14a.ev.fail === 0 && z14a.ev.displayed === false && z14a.phone.length === 0 && closedAll(z14a),
      `çıkış=${z14a.code} · 3N=${z14a.v('D7-3N')} · 3U=${z14a.v('D7-3U')} · FAIL=${z14a.ev.fail}`);
    // Z14-b unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN ("ilk unread-count"), D7-3/3N PASS, gösterim yok (kapı), çıkış 3
    const z14b = await runScenario('z14b-unread-hang', dir, { unread: 'hang' }, { D7_HTTP_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z14-b', 'unread-count yanıtsız: D7-3U ÖLÇÜLEMEYEN (ilk unread-count; FAIL değil), D7-3/D7-3N/D7-3G PASS, gösterim yok, kapanış PASS, çıkış 3',
      z14b.code === 3 && z14b.v('D7-3U') === 'UNMEASURED' && /ilk unread-count/.test(z14b.o('D7-3U')) && ['D7-3', 'D7-3N', 'D7-3G'].every((id) => z14b.v(id) === 'PASS') && z14b.ev.fail === 0 && z14b.ev.displayed === false && closedAll(z14b),
      `çıkış=${z14b.code} · 3U=${z14b.o('D7-3U')}`);

    // ---- Z9 KAPILAR — yazma yok
    const gates = [
      ['Z9-a', 'D7_LIVE_CONFIRM yoksa çıkış 3', { D7_LIVE_CONFIRM: '' }, 3],
      ['Z9-b', 'D-5 GO biçimi D-7 için reddedilir çıkış 3', { D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R01' }, 3],
      ['Z9-c', 'D7_DISPLAY=none canlı DB adıyla çıkış 4', { D7_EXPECT_DB: 'hukuk_db' }, 4],
      ['Z9-d', 'TLS doğrulaması kapalıysa çıkış 1', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 1],
      ['Z9-e', 'slug beyanı runId ile eşleşmiyorsa çıkış 4', { D7_EXPECT_TENANT_SLUG: 'ah-deadbeef' }, 4],
      ['Z9-f', 'http origin reddedilir çıkış 4', { D7_EXPECT_BASE_URL: 'http://localhost:8459' }, 4],
    ];
    for (const [id, desc, over, exp] of gates) { const z = await runScenario(id.toLowerCase(), dir, {}, over); check(id, `${desc}; tenant YOK`, z.code === exp && !z.tenant, `çıkış=${z.code}`); }

    // ---- Z10 create-user 500 → hesap yok, gösterim yok, mesaj ölçümü yok, P7-C1 ÖLÇÜLEMEYEN, çıkış 6
    const z10 = await runScenario('z10-create-fail', dir, { create: 'fail' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z10', 'create-user 500: gösterim yok, mesaj uçları çağrılmadı, P7-C1 ÖLÇÜLEMEYEN, P7-MSG-KEPT boş-doğrulama PASS DEĞİL → ÖLÇÜLEMEYEN "koşucu mesaj yazmadı … saklandı: 0 mesaj", çıkış 6, kurtarma notu',
      z10.code === 6 && z10.ev.displayed === false && z10.phone.length === 0 && !z10.calls.some((c) => /\/messages/.test(c.path)) && z10.v('P7-C1') === 'UNMEASURED'
        && z10.v('P7-MSG-KEPT') === 'UNMEASURED' && /koşucu mesaj yazmadı/.test(z10.o('P7-MSG-KEPT')) && /saklandı: 0 mesaj/.test(z10.o('P7-MSG-KEPT')) && z10.ev.recovery.gerekli, `çıkış=${z10.code} · KEPT=${z10.o('P7-MSG-KEPT')}`);
    // Z10-r: makbuzda koşucu mesaj id listesi YOK → Recover'da P7-MSG-KEPT sabit-koşullu PASS değil, ÖLÇÜLEMEYEN + rapor (oluşturma belirsiz → geç oluşma beklenir → 6)
    const r10 = await recover(z10, dir, 'z10-recover', {});
    check('Z10-r', 'Recover (makbuzda runnerMessageIds yok): P7-MSG-KEPT ÖLÇÜLEMEYEN "makbuzda koşucu mesaj id listesi yok … saklandı: 0 mesaj"; PASS değil; çıkış 0 DEĞİL',
      r10.v('P7-MSG-KEPT') === 'UNMEASURED' && /makbuzda koşucu mesaj id listesi yok/.test(r10.o('P7-MSG-KEPT')) && /saklandı: 0 mesaj/.test(r10.o('P7-MSG-KEPT')) && r10.code !== 0, `çıkış=${r10.code} · KEPT=${r10.o('P7-MSG-KEPT')}`);
    // ---- Z10-b geç oluşma: create yanıtsız (late) → hesap sonradan görülür ve kapatılır
    // create çağrısı zaman aşımı (1,5 sn) sahte API'nin geç yazımından (3 sn) ÖNCE dolar → hesap ilk sorguda yok, kapanış bekleyip görür.
    const z10b = await runScenario('z10b-create-late', dir, { create: 'late' }, { D7_CALL_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z10-b', 'create-user yanıtsız (geç oluşma): P7-01 ÖLÇÜLEMEYEN, gösterim yok, kapanış geç hesabı görüp KAPATIR (P7-C1 PASS, "GÖRÜLDÜ"), portal pasif', z10b.v('P7-01') === 'UNMEASURED' && z10b.ev.displayed === false && z10b.v('P7-C1') === 'PASS' && /GÖRÜLDÜ/.test(z10b.o('P7-C1')) && !!z10b.pu && z10b.pu.isActive === false, `çıkış=${z10b.code} · C1=${z10b.o('P7-C1')}`);

    // ---- Z11 KONSOLSUZ conout → yazmadan 4
    const rid11 = hex8(); const pw11 = 'D7T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw11);
    const env11 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R99', D7_RUNID: rid11, D7_EXPECT_DB: DB_NAME,
      D7_EXPECT_TENANT_SLUG: `ah-${rid11}`, D7_API_BASE: API, D7_EXPECT_API: API, D7_EXPECT_BASE_URL: EXT, D7_LIVE_LOGIN_PW: pw11,
      D7_RECEIPT: path.join(dir, 'z11-receipt.json'), D7_EVID_FILE: path.join(dir, 'z11-evidence.json'), D7_DISPLAY: 'conout', D7_TEST_DISPLAY_SINK: path.join(dir, 'z11.sink') });
    const r11 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env11, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'z11.log'), r11.log, 'utf8'); artifacts.push(path.join(dir, 'z11.log'));
    check('Z11', 'konsolsuz süreçte D7_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK, sink YOK', r11.code === 4 && /yerel konsol yok/.test(r11.log) && !(await prisma.tenant.findFirst({ where: { slug: `ah-${rid11}` } })) && !fs.existsSync(path.join(dir, 'z11-receipt.json')) && !fs.existsSync(path.join(dir, 'z11.sink')), `çıkış=${r11.code}`);

    // ---- Z12 MAKBUZ YAZILAMIYOR → API çağrısı yok, çıkış 1
    const z12 = await runScenario('z12-receipt-fail', dir, {}, { D7_RECEIPT: path.join(dir, 'yok', 'alt', 'r.json') });
    check('Z12', 'makbuz yazılamazsa login/create-user/mesaj 0, kurulum kapatıldı, çıkış 1', z12.code === 1 && !z12.calls.some((c) => /auth\/login|create-user|messages/.test(c.path)) && z12.activeUsers === 0, `çıkış=${z12.code}`);

    // ---- Z13 TELEFON GİRİŞİ YOK: P7-WAIT + D7-3B ÖLÇÜLEMEYEN, kapanış PASS (koşucu oturumu var → C4 ölçülür), çıkış 3
    const z13 = await runScenario('z13-no-phone', dir, {}, { D7_WAIT_MS: '2000' });
    check('Z13', 'telefon girişi yok: P7-WAIT/D7-3B ÖLÇÜLEMEYEN, kapanış tamamı PASS (C4 koşucu oturumuyla), kalıntı 3 mesaj + 1 bildirim (yerinde=3/3), çıkış 3',
      z13.code === 3 && z13.v('P7-WAIT') === 'UNMEASURED' && z13.v('D7-3B') === 'UNMEASURED' && closedAll(z13) && z13.msgs.length === 3 && z13.notes === 1 && /yerinde=3\/3/.test(z13.o('P7-MSG-KEPT')), `çıkış=${z13.code} · PASS olmayan=${CLOSE.filter((id) => z13.v(id) !== 'PASS').join(',') || 'yok'}`);

    // ==== R03 (a) — KURULUM İLE MAKBUZ ARASI: ek dosya yazması hata verir (disposable DB tetikleyicisi; koşucuda test kancası YOK)
    const EX0 = require(RUN);   // birim ölçümleri için (yalnız dışa açık saf fonksiyonlar; koşucu akışı require ile ÇALIŞMAZ)
    const tenantState = async (slug) => { const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } }); if (!t) return null;
      return { users: await prisma.user.count({ where: { tenantId: t.id } }), activeUsers: await prisma.user.count({ where: { tenantId: t.id, isActive: true } }),
        cases: await prisma.case.count({ where: { tenantId: t.id } }), activeCases: await prisma.case.count({ where: { tenantId: t.id, status: 'ACTIVE' } }) }; };
    const setupOf = (z) => ((z.ev || {}).setup || {});
    const rid15a = hex8();
    const z15a = await withInsertFault('Case', 'fileNumber', `I3-${rid15a}-s`, () => runScenario('z15a-setup-second-case-fail', dir, {}, { D7_RUNID: rid15a }, shouldNot));
    const t15a = await tenantState(`ah-${rid15a}`); const f15a = await tenantState(`ah-${rid15a}-x`); const s15a = setupOf(z15a);
    check('Z15-a', 'kurulum tamam + makbuz yazıldı + İKİNCİ ek dosya yazması (aynı tenant `-s`) hata verir: makbuz dosyası VAR (setupComplete=false, foreignCaseId var, sameTenantOtherCaseId yok); Run kendi kapanışını KOŞTU (closure.ok, nothingToClose YOK; P7-C1/U-CLOSE/P7-D9 PASS; portal hesabı yok); hedef tenantta kullanıcıların TAMAMI pasif, dosyalar CLOSED; yabancı tenanttaki ek dosya (`-xf`) CLOSED; API çağrısı 0; kanıtta setup.asama=ek-dosya-ayni-tenant, durum=YARIM_MAKBUZ_VAR, makbuzDosyasi=true, fatal arızayı adlandırır; P7-MSG-KEPT kapanışı ölçülenden yazar; çıkış 1 (önceki baytlarda makbuz yoktu → kapanış koşmadı → kullanıcılar AKTİF)',
      z15a.code === 1 && !!z15a.rc && z15a.rc.record === 'EXTACC-D7-SETUP-RECEIPT' && z15a.rc.setupComplete === false && typeof z15a.rc.foreignCaseId === 'string' && !z15a.rc.sameTenantOtherCaseId
        && !!z15a.ev && !!z15a.ev.closure && z15a.ev.closure.ok === true && !z15a.ev.closure.nothingToClose && !!z15a.ev.portalClose && z15a.ev.portalClose.ok === true && !z15a.ev.portalClose.nothingCreated
        && ['P7-C1', 'U-CLOSE', 'P7-D9'].every((id) => z15a.v(id) === 'PASS') && !!t15a && t15a.users > 0 && t15a.activeUsers === 0 && t15a.activeCases === 0 && !!f15a && f15a.cases === 1 && f15a.activeCases === 0
        && z15a.calls.length === 0 && s15a.asama === 'ek-dosya-ayni-tenant' && s15a.durum === 'YARIM_MAKBUZ_VAR' && s15a.makbuzDosyasi === true
        && JSON.stringify(s15a.tamamlanan) === JSON.stringify(['izolasyon-sayimi', 'kurulum', 'makbuz', 'ek-dosya-yabanci']) && /D7T kasitli yazma hatasi/.test(z15a.ev.fatal || '')
        && z15a.v('P7-MSG-KEPT') === 'UNMEASURED' && /kapanış, ölçülen: personel pasif \+ dosyalar CLOSED \(U-CLOSE PASS\); portal hesabı YOK/.test(z15a.o('P7-MSG-KEPT')) && z15a.ev.recovery && z15a.ev.recovery.gerekli === false,
      `çıkış=${z15a.code} · makbuz=${!!z15a.rc} setupComplete=${z15a.rc && z15a.rc.setupComplete} · closure=${JSON.stringify((z15a.ev || {}).closure || null).slice(0, 120)} · hedef=${JSON.stringify(t15a)} yabancı=${JSON.stringify(f15a)} · setup=${JSON.stringify(s15a)} · API=${z15a.calls.length}`);
    const r15 = z15a.rc ? await recover(z15a, dir, 'z15r-recover-half-setup', {}) : null;
    check('Z15-r', 'yarım kurulumun makbuzuyla Recover makbuzu BULUR ve koşar (çıkış 4 değil): kimlik bağı geçer, portal hesabı yok (P7-C1 PASS, disable-user çağrılmaz), U-CLOSE PASS, kullanıcılar pasif; kanıtta setupEvidence.setupComplete=false ("Run kurulumu YARIM"); mesaj id listesi yok → P7-MSG-KEPT ÖLÇÜLEMEYEN → çıkış 3',
      !!r15 && r15.code === 3 && r15.v('P7-C1') === 'PASS' && r15.v('U-CLOSE') === 'PASS' && r15.activeUsers === 0 && !r15.calls.some((c) => c.path === '/api/portal/admin/disable-user')
        && !!r15.ev && !!r15.ev.setupEvidence && r15.ev.setupEvidence.setupComplete === false && /YARIM/.test(r15.ev.setupEvidence.not || '') && r15.v('P7-MSG-KEPT') === 'UNMEASURED',
      r15 ? `çıkış=${r15.code} · C1=${r15.v('P7-C1')} · U-CLOSE=${r15.v('U-CLOSE')} · setupEvidence=${JSON.stringify((r15.ev || {}).setupEvidence || null)}` : 'makbuz YOK — Recover koşulamadı');
    const rid15b = hex8();
    const z15b = await withInsertFault('Case', 'fileNumber', `I3-${rid15b}-xf`, () => runScenario('z15b-setup-first-case-fail', dir, {}, { D7_RUNID: rid15b }, shouldNot));
    const t15b = await tenantState(`ah-${rid15b}`); const f15b = await tenantState(`ah-${rid15b}-x`); const s15b = setupOf(z15b);
    check('Z15-b', 'BİRİNCİ ek dosya yazması (yabancı tenant `-xf`) hata verir: makbuz VAR (foreignCaseId yok, setupComplete=false); Run kapanışı koştu (U-CLOSE PASS); hedef tenant kullanıcıları pasif, dosyalar CLOSED; yabancı tenantta dosya yok; setup.asama=ek-dosya-yabanci, durum=YARIM_MAKBUZ_VAR; API çağrısı 0; çıkış 1',
      z15b.code === 1 && !!z15b.rc && z15b.rc.setupComplete === false && !z15b.rc.foreignCaseId && z15b.v('U-CLOSE') === 'PASS' && !!t15b && t15b.activeUsers === 0 && t15b.activeCases === 0 && !!f15b && f15b.cases === 0
        && s15b.asama === 'ek-dosya-yabanci' && s15b.durum === 'YARIM_MAKBUZ_VAR' && z15b.calls.length === 0,
      `çıkış=${z15b.code} · makbuz=${!!z15b.rc} · hedef=${JSON.stringify(t15b)} yabancı=${JSON.stringify(f15b)} · setup=${JSON.stringify(s15b)}`);
    const rid15c = hex8();
    const z15c = await withInsertFault('Tenant', 'slug', `ah-${rid15c}-x`, () => runScenario('z15c-setup-tx-fail', dir, {}, { D7_RUNID: rid15c }, shouldNot));
    const s15c = setupOf(z15c);
    check('Z15-c', 'kurulumun KENDİSİ hata verir (tek işlem; yabancı tenant yazması reddedilir → geri alınır): makbuz YOK; setup.asama=kurulum, durum=KURULUM_HATASI, makbuzDosyasi=false; makbuzsuz durumda sentetik tenant slug sayısı DB\'den ÖLÇÜLDÜ = 0/0 (geri alındı) ve DB\'de tenant yok; kapanış "kapatılacak bir şey yok"; API çağrısı 0; kurtarma gerekmez; çıkış 1',
      z15c.code === 1 && !z15c.rc && !z15c.tenant && s15c.asama === 'kurulum' && s15c.durum === 'KURULUM_HATASI' && s15c.makbuzDosyasi === false
        && !!s15c.sentetikTenantDB && s15c.sentetikTenantDB.hedef === 0 && s15c.sentetikTenantDB.yabanci === 0 && !!z15c.ev && z15c.ev.closure && z15c.ev.closure.nothingToClose === true
        && z15c.calls.length === 0 && z15c.ev.recovery && z15c.ev.recovery.gerekli === false && /D7T kasitli yazma hatasi/.test(z15c.ev.fatal || ''),
      `çıkış=${z15c.code} · makbuz=${!!z15c.rc} · tenant=${!!z15c.tenant} · setup=${JSON.stringify(s15c)}`);
    // R03-c (7c): portal hesabı YOKKEN P7-C1 satırı kapatma İDDİA ETMEZ (Run ve Recover günlükleri; satır açıklaması kanıta değil günlüğe yazılır)
    const c1Line = (t) => (String(t || '').split(/\r?\n/).find((l) => /\bP7-C1\b/.test(l)) || '');
    const l15a = c1Line(z15a.log); let l15r = ''; try { l15r = c1Line(fs.readFileSync(path.join(dir, 'z15r-recover-half-setup.log'), 'utf8')); } catch (e) { l15r = ''; }
    check('Z15-d', 'portal hesabı YOKKEN (Z15-a Run ve Z15-r Recover günlükleri; P7-C1 PASS, disable-user çağrısı 0) satır açıklaması kapatma İDDİA ETMEZ: "portal hesabı YOK (DB\'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" YOK (önceki baytlar "portal erişimi yetkili uçla kapatıldı" yazıyordu)',
      /portal hesabı YOK \(DB'de ölçüldü\) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI/.test(l15a) && !/kapatıldı/.test(l15a) && /portal hesabı YOK \(DB'de ölçüldü\)/.test(l15r) && !/kapatıldı/.test(l15r)
        && z15a.v('P7-C1') === 'PASS' && z15a.calls.length === 0 && !!r15 && r15.v('P7-C1') === 'PASS' && !r15.calls.some((c) => c.path === '/api/portal/admin/disable-user'),
      `Run: ${l15a.trim().slice(0, 150)} · Recover: ${l15r.trim().slice(0, 150)}`);

    // ==== R03 (b) — Run'ın KENDİ kapanışında personel oturumu reddi: yalnız 401/403'te BİR KEZ yeniden giriş + TEK yeniden deneme
    const DIS = '/api/portal/admin/disable-user'; const LOGIN = '/api/auth/login';
    const nCalls = (cl, p) => cl.filter((c) => c.path === p).length;
    const nedenOf = (z) => ((z.ev && z.ev.recovery && z.ev.recovery.neden) || []);
    const pcOf = (z) => ((z.ev || {}).portalClose || {});
    const openLineOf = (z) => nedenOf(z).find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    // R03-e: DEĞİŞTİ — kapatma yapılmadı + sürüm verilme sürümüne eşit = tablo T5: 200 "ürün bulgusu SAYILMADI (T5) — kapatma DB'ye yansımadı …"; kapatma metni
    // ölçülenle ("kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB'de AÇIK (… sürüm a→a)"; "hâlâ" YOK); portal satırı "…: açık erişim kapatılmalıdır (Recover
    // kapatabilir)" + oturum satırına atıf; oturum satırı AYRI ("PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI (T5: …)").
    // R03-f (F2): Recover metni `disableCalls`'a bağlı — son kapatma çağrısı 401/403 → RC_REJ(kod); diğer durumlar → RC_GEN. "(Recover kapatabilir)" YOK.
    const RC_GEN = 'Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)';
    const RC_REJ = (k) => `Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run'da kapatma HTTP ${k} ile reddedildi — Recover'ın kapatabildiği ÖLÇÜLMEDİ (personel yetkisi düzelmeden Recover da reddedilebilir)`;
    // R03-f (F3): HTTP ölçümlerinden sonra AKTİF hesabın açık-erişim satırı (acikErisim) biçimi
    const acikAktif = (z, rec) => { const t = pcOf(z).acikErisim || ''; return /^portal hesabı AKTİF \(HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır; /.test(t) && t.endsWith(`; ${rec}`) && !/Recover kapatabilir|portal hesabı açık/.test(t); };
    // R03-f: DEĞİŞTİ — ölçülen kapatma metni "DB'de portal hesabı AKTİF (…)" (F3) + Recover metni `disableCalls`'a bağlı (F2); "(Recover kapatabilir)" YOK.
    const portalOpenLine = (z, rec) => { const l = openLineOf(z); return /P7-C2=FAIL/.test(l) && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm (\d+)→\1\): açık erişim kapatılmalıdır; /.test(l)
      && l.includes(`: açık erişim kapatılmalıdır; ${rec}; koşucu oturumunun erişmesi AYRI satırdadır (ürün bulgusu SAYILMADI)`) && !/hâlâ|Recover kapatabilir|DB'de AÇIK/.test(l) && acikAktif(z, rec); };
    // R03-f (F3): DEĞİŞTİ — T5 metni "hesap aktif kaldı …; guard hasPortalAccess okumaz; 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)";
    // "kapatma DB'ye yansımadı" YOK (kapatma çağrısı hiç 2xx dönmemiş olabilir).
    const noFalseFinding = (z) => !!z.ev && !z.ev.productFinding && !pcOf(z).productFinding && !nedenOf(z).some((n) => /ÜRÜN BULGUSU|Recover düzeltemez|DB'ye yansımadı/.test(n)) && !/ÜRÜN BULGUSU/.test(z.o('P7-D9'))
      && (pcOf(z).sessionVersion || {}).sinif === 'SAYILMADI' && (pcOf(z).sessionVersion || {}).hucre === 'T5'
      && ['P7-C4L', 'P7-C4D'].every((id) => z.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — hesap aktif kaldı \(isActive=true — HTTP ölçümlerinden önce ve sonra\) ve sürüm verilme sürümüyle aynı \(\d+\); guard hasPortalAccess okumaz \(ölçülen true→true\); 200 beklenir — ürün bulgusu değil \(satır kimliği ve tenant yaşam döngüsü ölçülmedi/.test(z.o(id))
        && /· kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm (\d+)→\1\)/.test(z.o(id)) && !/\(ürün bulgusu\)|hâlâ|DB'ye yansımadı/.test(z.o(id)))
      && nedenOf(z).some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI \(T5: hesap aktif kaldı \(isActive=true/.test(n));
    const sum16 = (z) => `çıkış=${z.code} · disable=${nCalls(z.calls, DIS)} · giriş=${nCalls(z.calls, LOGIN)} · staffReauth=${JSON.stringify(pcOf(z).staffReauth || null)} · C2=${z.v('P7-C2')} · bulgu=${JSON.stringify((z.ev || {}).productFinding || null)} · C4L=${z.o('P7-C4L').slice(0, 90)} · neden=${nedenOf(z).join(' | ').slice(0, 260)}`;
    const z16a = await runScenario('z16a-staff-token-expired-on-close', dir, { staffAuth: 'expireOnDisable' }, {}, { onDisplay: fullPhone });
    const sr16a = pcOf(z16a).staffReauth || {};
    check('Z16-a', 'personel token\'ı kapanış anında geçersiz (ilk disable-user 401): koşucu BİR KEZ yeniden giriş yapar (aynı sentetik personel), kapatmayı BİR KEZ yeniden dener (201) → portal kapandı, kapanış ölçütlerinin TAMAMI PASS, çıkış 0 (6 DEĞİL); disable-user 2 çağrı, personel girişi 2 (koşum başı + yenileme); kanıtta staffReauth 401 → giriş 201 → yeniden deneme 201; P7-C1 gözleminde "YENİLENDİ"; calledEndpoints\'te kapanış girişi; personel pasif (önceki baytlarda tek 401 → yeniden giriş yok → portal AÇIK → çıkış 6)',
      z16a.code === 0 && closedAll(z16a) && !!z16a.pu && z16a.pu.isActive === false && z16a.cl.hasPortalAccess === false && nCalls(z16a.calls, DIS) === 2 && nCalls(z16a.calls, LOGIN) === 2
        && sr16a.neden === 'disable-user HTTP 401' && sr16a.giris === 'HTTP 201' && sr16a.yenidenDeneme === 'HTTP 201' && /YENİLENDİ/.test(z16a.o('P7-C1'))
        && (z16a.ev.calledEndpoints || []).some((c) => /auth\/login \(kapanış/.test(c)) && z16a.activeUsers === 0, sum16(z16a));
    const z16b = await runScenario('z16b-staff-forbidden-on-close', dir, { disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    const sr16b = pcOf(z16b).staffReauth || {};
    check('Z16-b', 'kapatma ucu her çağrıda 403: yeniden giriş BİR KEZ, yeniden deneme BİR KEZ, sonra DURUR (döngü yok) → disable-user tam 2, personel girişi tam 2; staffReauth 403 → 201 → 403; portal AÇIK kaldı (P7-C2 FAIL), çıkış 6; R03-f: koşucu oturumunun 200\'ü tablo T5 — "ürün bulgusu SAYILMADI (T5) — hesap aktif kaldı (isActive=true …) ve sürüm verilme sürümüyle aynı; guard hasPortalAccess okumaz …; 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)" ("kapatma DB\'ye yansımadı" YOK) + "· kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (… sürüm a→a)" ("hâlâ" YOK; productFinding YOK); kurtarma nedeninde portal satırı (ölçülen kapatma metni + "açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … Run\'da kapatma HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ …"; "(Recover kapatabilir)" YOK) + AYRI oturum satırı + personel reddi satırı; acikErisim "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; <aynı Recover metni>"; U-CLOSE PASS',
      z16b.code === 6 && nCalls(z16b.calls, DIS) === 2 && nCalls(z16b.calls, LOGIN) === 2 && sr16b.neden === 'disable-user HTTP 403' && sr16b.giris === 'HTTP 201' && sr16b.yenidenDeneme === 'HTTP 403'
        && z16b.v('P7-C2') === 'FAIL' && z16b.v('U-CLOSE') === 'PASS' && !!z16b.pu && z16b.pu.isActive === true && noFalseFinding(z16b) && portalOpenLine(z16b, RC_REJ(403))
        && nedenOf(z16b).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 403\)/.test(n)), sum16(z16b));
    const z16c = await runScenario('z16c-disable-notfound', dir, { disable: 'notFound' }, {}, { onDisplay: fullPhone });
    check('Z16-c', 'kapatma ucu 404 (kimlik dışı 4xx): yeniden giriş YOK, yeniden deneme YOK → disable-user 1, personel girişi 1, staffReauth yok; P7-C2 FAIL, çıkış 6; "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı — R03-f: 404 kimlik reddi değil → "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)"; "DB\'de portal hesabı AKTİF (…)"; T5 metni "hesap aktif kaldı …"',
      z16c.code === 6 && nCalls(z16c.calls, DIS) === 1 && nCalls(z16c.calls, LOGIN) === 1 && !pcOf(z16c).staffReauth && z16c.v('P7-C2') === 'FAIL' && noFalseFinding(z16c) && portalOpenLine(z16c, RC_GEN), sum16(z16c));
    const z16d = await runScenario('z16d-relogin-ratelimited', dir, { staffAuth: 'expireOnDisable', relogin: 'rateLimit' }, {}, { onDisplay: fullPhone });
    const sr16d = pcOf(z16d).staffReauth || {};
    check('Z16-d', 'kapanışta token geçersiz (401) ve YENİDEN GİRİŞ hız sınırına takılıyor (429): yeniden deneme YAPILMAZ (disable-user 1, personel girişi 2), staffReauth 401 → 429 → yapılmadı; portal AÇIK (P7-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı + "tek yeniden giriş: HTTP 429; tek yeniden deneme: yapılmadı" — R03-f: son kapatma çağrısı 401 → "Run\'da kapatma HTTP 401 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ …"; çıkış 6',
      z16d.code === 6 && nCalls(z16d.calls, DIS) === 1 && nCalls(z16d.calls, LOGIN) === 2 && sr16d.neden === 'disable-user HTTP 401' && sr16d.giris === 'HTTP 429' && !sr16d.yenidenDeneme && z16d.v('P7-C2') === 'FAIL'
        && !!z16d.pu && z16d.pu.isActive === true && noFalseFinding(z16d) && portalOpenLine(z16d, RC_REJ(401))
        && nedenOf(z16d).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 401\); tek yeniden giriş: HTTP 429; tek yeniden deneme: yapılmadı/.test(n)), sum16(z16d));
    const l8 = nedenOf(z8);
    check('Z16-e', 'GERÇEK ürün bulgusu korunur (Z8 koşumu, guard bayat): DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken (P7-C2/C2V/C5 PASS) koşucu oturumu 200 → productFinding YAZILIR ve dayanağını adlandırır (R03-c: "(P7-C2 PASS + P7-C5 PASS)"); P7-C4L/D gözlemi "… (P7-C2 PASS + P7-C5 PASS) MEVCUT OTURUM KAPANMADI (ürün bulgusu)"; kurtarma nedeni ÜRÜN BULGUSU satırını aynı dayanak + "Recover düzeltemez" ile yazar, "PORTAL ERİŞİMİ kapandığı doğrulanmadı" YAZMAZ; süre iddiası ("token 7 gün") YOK; çıkış 6',
      z8.code === 6 && ['P7-C2', 'P7-C2V', 'P7-C5'].every((id) => z8.v(id) === 'PASS') && /\(P7-C2 PASS \+ P7-C5 PASS\)/.test((z8.ev && z8.ev.productFinding) || '')
        && ['P7-C4L', 'P7-C4D'].every((id) => /HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)/.test(z8.o(id)))
        && l8.some((n) => /ÜRÜN BULGUSU — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\)/.test(n) && /Recover düzeltemez/.test(n)) && !l8.some((n) => /PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) && !l8.some((n) => /7 gün/.test(n)),
      `çıkış=${z8.code} · bulgu=${JSON.stringify((z8.ev || {}).productFinding || null)} · neden=${l8.join(' | ').slice(0, 220)}`);
    check('Z16-f', 'kapatma ucu iki kez 500 (Z5 koşumu; en çok iki adım, yeniden giriş YOK): disable-user 2, personel girişi 1, staffReauth yok; portal AÇIK (P7-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı iki 500 çağrısıyla — R03-f: 5xx → "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)"',
      z5.code === 6 && nCalls(z5.calls, DIS) === 2 && nCalls(z5.calls, LOGIN) === 1 && !pcOf(z5).staffReauth && z5.v('P7-C2') === 'FAIL' && noFalseFinding(z5) && portalOpenLine(z5, RC_GEN) && /kapatma çağrıları: HTTP 500 · HTTP 500/.test(openLineOf(z5)), sum16(z5));

    // ==== R03 (c) — birim: Recover çıkış 3 adımı kanıttaki verdict'lerden · kurtarma nedeni ölçülenden · kapanış özeti ölçülenden
    const rsf = typeof EX0.recoverStepText === 'function' ? EX0.recoverStepText : null; const raf = typeof EX0.recoveryAdvice === 'function' ? EX0.recoveryAdvice : null;
    const tAbs = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: true, accountAbsent: true }, results: [{ id: 'P7-C1', verdict: 'PASS' }, { id: 'P7-MSG-KEPT', verdict: 'UNMEASURED' }, { id: 'U-CLOSE', verdict: 'PASS' }] })) : '';
    const tCl = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: false }, results: [{ id: 'P7-C2', verdict: 'PASS' }, { id: 'P7-C5', verdict: 'PASS' }, { id: 'P7-C4L', verdict: 'UNMEASURED' }, { id: 'P7-C4D', verdict: 'UNMEASURED' }] })) : '';
    const a5 = (r5.ev && r5.ev.recovery && r5.ev.recovery.adim) || '';
    const srcRun0 = fs.readFileSync(RUN, 'utf8');
    check('Z17', 'Recover çıkış 3 adımı kanıttaki verdict\'lerden kurulur: portal hesabı YOKKEN metin "PASS" İDDİA ETMEZ ("P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı YOK …)"); DB kapalı ölçülmüşken "P7-C2=PASS · P7-C5=PASS" + ÖLÇÜLEMEYEN satırlar adıyla; Z5 Recover kanıtında (çıkış 3) adım "ÖNERİ (yetki DEĞİL): Recover TEKRARLANMAZ" ile başlar ve kanıttaki P7-C2/C5 verdict\'ini yazar; koşucu kaynağında sabit "TEKRARLANMAZ: DB kapalı" YOK',
      !!rsf && /P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ \(portal hesabı YOK/.test(tAbs) && !/PASS/.test(tAbs) && /^ÖNERİ \(yetki DEĞİL\)/.test(tAbs) && /P7-C2=PASS · P7-C5=PASS/.test(tCl) && /ÖLÇÜLEMEYEN satırlar \(P7-C4L,P7-C4D\)/.test(tCl)
        && r5.code === 3 && /^ÖNERİ \(yetki DEĞİL\): Recover TEKRARLANMAZ/.test(a5) && a5.includes(`P7-C2=${r5.v('P7-C2')} · P7-C5=${r5.v('P7-C5')}`) && !srcRun0.includes('TEKRARLANMAZ: DB kapalı'),
      `fonksiyon=${!!rsf} · hesap yok=${tAbs.slice(0, 150)} · Z5 Recover adımı=${a5.slice(0, 160)}`);
    const R7 = (pairs) => pairs.map(([id, verdict]) => ({ id, verdict }));
    const u1 = raf ? raf({ closure: { ok: true }, results: R7([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL'], ['P7-C2V', 'FAIL'], ['P7-C5', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, sessionWhileOpen: true, after: { isActive: true, hasPortalAccess: true }, disableCalls: ['HTTP 404'] } }, 'r.json', 'run') : {};
    // R03-c: (ii) girdisine HTTP ölçümlerinden sonraki DB değeri (afterMeasure: AÇIK) eklendi; beklenti değişti — P7-C5 FAIL iken ürün bulgusu satırı YOK.
    const u2 = raf ? raf({ closure: { ok: true }, results: R7([['P7-C1', 'PASS'], ['P7-C2', 'PASS'], ['P7-C2V', 'PASS'], ['P7-C5', 'FAIL'], ['P7-C4L', 'FAIL'], ['P7-C4D', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, productFinding: 'ÜRÜN BULGUSU: x', after: { isActive: false, hasPortalAccess: false }, afterMeasure: { isActive: true, hasPortalAccess: true }, sessionDuringChange: true } }, 'r.json', 'run') : {};
    const u3 = raf ? raf({ closure: { ok: true, nothingToClose: true }, portalClose: { ok: true, nothingCreated: true }, results: [], setup: { asama: 'kurulum', sentetikTenantDB: { hedef: 1, yabanci: 0 } } }, null, 'run') : {};
    const u4 = raf ? raf({ closure: { ok: false }, results: R7([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, after: { isActive: true, hasPortalAccess: true } } }, 'r.json', 'recover') : {};
    // R03-c (v): makbuz bellekte VAR ama dosyası yazılamadı (setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI; makbuzDiskte=false) → uygulanamayan komut ÖNERİLMEZ
    const rfs = typeof EX0.receiptFileState === 'function' ? EX0.receiptFileState : null;
    const memR7 = { record: EX0.RECEIPT_RECORD, runId: 'abcdef12', tenantId: 't', tenantSlug: 'ah-abcdef12', clientId: 'k', elevUserId: 'u', elevEmail: 'e@ornek.invalid', setupComplete: false };
    const r18 = path.join(dir, 'z18v'); fs.mkdirSync(r18); const okP7 = path.join(r18, 'var.json'); fs.writeFileSync(okP7, JSON.stringify(memR7, null, 1));
    const badP7 = path.join(r18, 'bozuk.json'); fs.writeFileSync(badP7, '{"record":"BASKA"}'); const dirP7 = path.join(r18, 'klasor.json'); fs.mkdirSync(dirP7); const goneP7 = path.join(r18, 'yok.json');
    const halfOut = (p) => ({ receipt: memR7, receiptWriteError: 'EACCES: izin yok', setup: { asama: 'makbuz', durum: 'YARIM_MAKBUZ_DOSYASI_YAZILAMADI', makbuzDosyasi: false }, closure: { ok: false }, portalClose: { ok: true, accountAbsent: true }, results: R7([['P7-C1', 'PASS'], ['U-CLOSE', 'FAIL']]), _p: p });
    const u5 = raf ? raf(halfOut(goneP7), goneP7, 'run') : {}; const u5d = raf ? raf(halfOut(dirP7), dirP7, 'run') : {}; const u6 = raf ? raf(Object.assign(halfOut(okP7), { receiptWriteError: undefined, setup: { durum: 'TAMAM' } }), okP7, 'run') : {};
    const st18 = rfs ? [rfs(okP7, memR7), rfs(goneP7, memR7), rfs(dirP7, memR7), rfs(badP7, memR7), rfs(null, memR7)] : [];
    const noCmd7 = (a) => !String(a.adim || '').includes('-ReceiptFile <makbuz>');
    // R04-b (aşama 2): kanıtta makbuz metni varken adım owner bloğunun Run sonu ekranıyla AYNI seçeneği gösterir — `-Mode Recover -RunEvidenceDir '<kanıt dizini>'`;
    // elle komut (Get-Content … | Set-Content …), Run kanıt dizininin içindeki '…-setup-receipt-kanittan.json' yolu ve `-ReceiptFile <makbuz>` / `-ReceiptFile '<yol>'`
    // önerisi YOK. Diskteki makbuz dosyasının durumu "(durumu: …)" içinde yalnız bilgi olarak yazılır.
    const psq7 = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const rgOpt7 = (a, evDirTxt) => { const t = String(a.adim || '');
      return t.startsWith('ÖNERİ (yetki DEĞİL): çıkış kodu Recover yetkisi değildir; önce kanıt incelenir. Recover yalnız AYRI owner onayıyla başlatılır — owner bloğunun şu seçeneğiyle: ')
        && t.includes(`\`-Mode Recover -RunEvidenceDir ${evDirTxt}\``) && t.includes('Run kanıt dizininin DIŞINDA kardeş bir dizine yazar; doğrulama tutmazsa Recover BAŞLAMAZ') && t.includes('Run kanıt dizinine dosya YAZILMAZ')
        && t.includes('`-ReceiptFile` ile VERİLMEZ') && !/Set-Content|Get-Content|setup-receipt-kanittan|-ReceiptFile <makbuz>|-ReceiptFile '/.test(t) && typeof a.makbuzJson === 'string'; };
    const durumOf7 = (a) => (String(a.adim || '').match(/kanıt dizinindeki makbuz dosyası \(durumu: (.*)\) `-ReceiptFile` ile VERİLMEZ/) || [])[1] || '';
    const PH7 = '\'<bu koşumun kanıt dizini>\'';
    // R04-b: kanıtta makbuz YOK ama makbuz dosyası okunabilir (koşucunun kendi Run'ında oluşmaz; bloğun aynı durumdaki dalı) → `-ReceiptFile <makbuz>`
    const u7 = raf ? raf({ closure: { ok: false }, portalClose: { ok: true, accountAbsent: true }, results: R7([['P7-C1', 'PASS'], ['U-CLOSE', 'FAIL']]) }, okP7, 'run') : {};
    const v5 = rgOpt7(u5, PH7) && durumOf7(u5) === 'YOK (dosya yok (ENOENT) · makbuz yazma hatası: EACCES: izin yok · setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI)' && u5.makbuzDiskte === false && u5.makbuzDurumu === 'YOK'
      && rgOpt7(u5d, PH7) && /^OKUNAMIYOR \(dosya okunamadı \(EISDIR\)/.test(durumOf7(u5d)) && u5d.makbuzDurumu === 'OKUNAMADI'
      && rgOpt7(u6, PH7) && durumOf7(u6) === 'VAR — koşucunun bellekteki son makbuzuyla EŞİT' && u6.makbuzDurumu === 'KULLANILABILIR' && u6.makbuzGuncel === true
      && String(u7.adim || '').includes('(owner bloğu `-Mode Recover -ReceiptFile <makbuz>`)') && !/-RunEvidenceDir|Set-Content/.test(u7.adim || '') && u7.makbuzJson === undefined && u7.makbuzDurumu === 'KULLANILABILIR'
      && !/-RunEvidenceDir|-ReceiptFile|Set-Content/.test(u3.adim || '') && u3.makbuzJson === undefined && !/-RunEvidenceDir/.test(u4.adim || '')
      && st18.map((x) => x.durum).join(',') === 'KULLANILABILIR,YOK,OKUNAMADI,OKUNAMADI,YOL_YOK';
    const n1 = u1.neden || []; const n2 = u2.neden || []; const n3 = u3.neden || [];
    const tag = typeof EX0.closureTag === 'function' ? [EX0.closureTag({ closure: { ok: true }, portalClose: { portalDbClosed: true } }), EX0.closureTag({ closure: { ok: false }, portalClose: { portalDbClosed: false } })] : ['', ''];
    check('Z18', 'kurtarma nedeni ve adım (birim): (i) portal DB\'de AÇIK → "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P7-C1=FAIL,P7-C2=FAIL,P7-C2V=FAIL,P7-C5=FAIL) — DB\'de portal hesabı AKTİF (isActive=true hasPortalAccess=true)" (R03-f (F3) metni; R03-e: "hâlâ" YOK; oturum sınıfı girdide yokken "SAYILMADI" YAZILMAZ — eski `sessionWhileOpen` alanı yok sayılır); Run adımı "ÖNERİ (yetki DEĞİL)" + "AYRI owner onayıyla"; (ii) R03-c: kanıtta ürün bulgusu metni olsa da P7-C5 FAIL (HTTP sonrası DB AÇIK) → ürün bulgusu / "Recover düzeltemez" satırı YOK; "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P7-C5=FAIL)" satırı HTTP ölçümlerinden SONRAKİ değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır" ("hâlâ AÇIK" yok); (iii) makbuz yok + sentetik tenant DB\'de VAR → "KURULUM: makbuz YOK … VAR (hedef=1 · yabancı=0)" + adımda "makbuz YOK: Recover bu kanıtla başlatılamaz"; (iv) Recover adımı "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR", "BİR KEZ" yok; kapanış özeti ölçülenden (U-CLOSE PASS ↔ DOĞRULANMADI); (v) R04-b (bloğun Run sonu ekranıyla AYNI yön): kanıtta makbuz VAR → "… AYRI owner onayıyla başlatılır — owner bloğunun şu seçeneğiyle: `-Mode Recover -RunEvidenceDir \'<bu koşumun kanıt dizini>\'`" + "Run kanıt dizininin DIŞINDA kardeş bir dizine yazar; doğrulama tutmazsa Recover BAŞLAMAZ" + "Run kanıt dizinine dosya YAZILMAZ" + diskteki makbuzun durumu yalnız BİLGİ ("durumu: YOK (dosya yok (ENOENT) · makbuz yazma hatası: … · setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI)" / "OKUNAMIYOR (… EISDIR …)" / "VAR — … EŞİT") + "`-ReceiptFile` ile VERİLMEZ"; elle komut (Get-Content / Set-Content), "…-setup-receipt-kanittan.json" yolu, `-ReceiptFile <makbuz>` ve `-ReceiptFile \'<yol>\'` HİÇBİR dalda YOK (makbuz güncelken de); kanıtta makbuz YOK + dosya okunabilir → `-Mode Recover -ReceiptFile <makbuz>` (bloğun aynı dalı; makbuzJson yok); kanıtta makbuz YOK + dosya yok → "makbuz YOK … (K-7)" (seçenek / komut yok); Recover adımı seçenek göstermez; receiptFileState var/yok/klasör/bozuk/yol yok',
      !!raf && n1.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P7-C1=FAIL,P7-C2=FAIL,P7-C2V=FAIL,P7-C5=FAIL\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true\)/.test(n) && !/hâlâ|SAYILMADI|DB'de AÇIK/.test(n)) && /^ÖNERİ \(yetki DEĞİL\)/.test(u1.adim || '') && /AYRI owner onayıyla/.test(u1.adim || '')
        && !n2.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && n2.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P7-C5=FAIL\) — kapatmadan sonra DB'de kapalı ölçüldü \(P7-C2=PASS\) ama hesap ölçüm sırasında yeniden AÇILDI \(P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener \(sonuç Recover kanıtında ölçülür\)/.test(n) && !/hâlâ AÇIK|Recover kapatabilir/.test(n))
        && n3.some((n) => /^KURULUM: makbuz YOK \(kurulum aşaması=kurulum\) ama sentetik tenant slug'ı DB'de VAR \(hedef=1 · yabancı=0\)/.test(n)) && /makbuz YOK: Recover bu kanıtla başlatılamaz/.test(u3.adim || '')
        && /İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(u4.adim || '') && !/BİR KEZ/.test(u4.adim || '') && /U-CLOSE PASS\); portal DB'de pasif ölçüldü \(P7-C2 PASS\)$/.test(tag[0]) && /DOĞRULANMADI.*DOĞRULANMADI/.test(tag[1])
        && !!rfs && v5,
      `fonksiyon=${!!raf} · (i) ${n1.map((n) => n.slice(0, 60)).join(' | ')} · (ii) ${n2.map((n) => n.slice(0, 160)).join(' | ')} · (iii) ${n3.map((n) => n.slice(0, 60)).join(' | ')} · (iv) ${(u4.adim || '').slice(0, 80)} · özet=${tag.join(' / ')} · (v) durumlar=${st18.map((x) => x.durum).join(',')} yok: seçenek=${rgOpt7(u5, PH7)} durum=[${durumOf7(u5)}] · klasör=[${durumOf7(u5d).slice(0, 60)}] · var: seçenek=${rgOpt7(u6, PH7)} durum=[${durumOf7(u6)}] · yalnız dosya=${String(u7.adim || '').slice(110, 190)} · adım=${String(u5.adim || '').slice(0, 420)}`);

    // ==== R03-c — (a) ürün bulgusu yalnız P7-C2 PASS + P7-C5 PASS; (b) makbuz dosyası yazılamaz hale gelirse uygulanamayan Recover komutu önerilmez
    // R03-d (M1): Z19-a DEĞİŞTİ — R03-c beklentisi ("ürün bulgusu adayı DEĞİL") YANLIŞTI. Ürün (HY_WT_R27): guard eski oturumu sürüm farkıyla isActive'ten
    // BAĞIMSIZ reddeder; yeniden açma sürümü ARTIRIR. Sahte API artık yeniden açmada sürümü ürün gibi artırır (verilen + 2: kapatma +1, yeniden açma +1).
    const z19a = await runScenario('z19a-reopen-during-measure', dir, { guard: 'stale', reopen: 'afterDisable' }, {}, { onDisplay: fullPhone });
    const n19a = nedenOf(z19a); const line19a = n19a.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    const cand19a = n19a.find((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI/.test(n)) || ''; const sv19a = pcOf(z19a).sessionVersion || {};
    // R03-e: Z19-a DEĞİŞTİ — aynı koşum artık tablo T2 (verilme b < HTTP öncesi a = b+1 < sonrası c = b+2): "ÜRÜN BULGUSU ADAYI (T2)"; ürün bulgusu metni
    // açık-erişim / yeniden açılma metnini İÇERMEZ (o AYRI satırda ve portalClose.acikErisim'de); P7-C4 gözlemi iki DB ölçümünü yazar.
    check('Z19-a', 'R03-e (R03-d\'den değişti): guard KUSUR taklidi + hesap HTTP ölçümleri SIRASINDA yeniden açıldı (sahte API reopen afterDisable; yeniden açma sürümü ürün gibi ARTIRIR): P7-C2 PASS, P7-C5 FAIL; koşucu oturumu 200 → tablo T2: P7-C4L/D FAIL + "ÜRÜN BULGUSU ADAYI (T2) — eski oturum sürüm reddine rağmen erişti (oturumun verildiği sürüm b, HTTP öncesi DB sürümü b+1, sonrası b+2 …)" + "· DB: HTTP öncesi isActive=false hasPortalAccess=false … → sonrası isActive=true hasPortalAccess=true …"; productFinding "ÜRÜN BULGUSU ADAYI (T2): … mesaj ucuna … Recover düzeltemez" ("yeniden AÇILDI" / "(Recover kapatabilir)" İÇERMEZ); sessionVersion ADAY/T2 (kaynak claim); R03-f: acikErisim AYRI "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)" (kapatma 2xx döndü; "(Recover kapatabilir)" YOK); kurtarma nedeninde AYRI aday satırı VE portal satırı "yeniden AÇILDI (P7-C5 FAIL …): açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (…); … AYRI satırdadır (ÜRÜN BULGUSU ADAYI)" ("Recover düzeltemez" YOK); "adayı DEĞİL" / "SAYILMADI" HİÇBİR yerde YOK; DB\'de hesap AÇIK ve sürüm = ölçüm sonrası; çıkış 6',
      z19a.code === 6 && z19a.v('P7-C2') === 'PASS' && z19a.v('P7-C5') === 'FAIL' && !!z19a.ev && sv19a.sinif === 'ADAY' && sv19a.hucre === 'T2' && Number.isInteger(sv19a.verilen) && sv19a.httpOncesi === sv19a.verilen + 1 && sv19a.olcumSonrasi === sv19a.verilen + 2 && sv19a.verilenKaynak === 'claim'
        && /^ÜRÜN BULGUSU ADAYI \(T2\): eski portal oturumu sürüm reddine rağmen mesaj ucuna erişti \(oturumun verildiği sürüm \d+, HTTP öncesi DB sürümü \d+, sonrası \d+ — ürün yazıcıları yalnız artırdığından istek anında da farklıydı/.test(z19a.ev.productFinding || '') && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(z19a.ev.productFinding || '') && !/yeniden AÇILDI|Recover kapatabilir|açık erişim/.test(z19a.ev.productFinding || '')
        && ['P7-C4L', 'P7-C4D'].every((id) => z19a.v(id) === 'FAIL' && /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm \d+, HTTP öncesi DB sürümü \d+, sonrası \d+/.test(z19a.o(id)) && /· DB: HTTP öncesi isActive=false hasPortalAccess=false sürüm=\d+ → sonrası isActive=true hasPortalAccess=true sürüm=\d+$/.test(z19a.o(id)))
        && acikAktif(z19a, RC_GEN)
        && /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI \(T2\)/.test(cand19a) && /oturum reddi ürün tarafıdır, Recover düzeltemez/.test(cand19a) && !/Recover kapatabilir/.test(cand19a) && cand19a !== line19a && /AYRI satırdadır \(ÜRÜN BULGUSU ADAYI\)/.test(line19a)
        && /\(P7-C5=FAIL\)/.test(line19a) && line19a.includes(`hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}`) && !/Recover düzeltemez|Recover kapatabilir/.test(line19a)
        && /ÜRÜN BULGUSU ADAYI/.test(z19a.o('P7-D9')) && ![...n19a, z19a.o('P7-C4L'), z19a.o('P7-C4D'), z19a.ev.productFinding || ''].some((t) => /adayı DEĞİL|SAYILMADI/.test(t))
        && !!z19a.pu && z19a.pu.isActive === true && !!z19a.cl && z19a.cl.hasPortalAccess === true && z19a.pu.tokenVersion === sv19a.olcumSonrasi,
      `çıkış=${z19a.code} · C2=${z19a.v('P7-C2')} C5=${z19a.v('P7-C5')} · sınıf=${JSON.stringify(sv19a)} · bulgu=${String((z19a.ev || {}).productFinding || '').slice(0, 160)} · C4L=${z19a.o('P7-C4L').slice(0, 200)} · aday satırı=${cand19a.slice(0, 160)} · portal satırı=${line19a.slice(0, 260)} · DB sonra=${JSON.stringify(z19a.pu)}/${JSON.stringify(z19a.cl)}`);

    // Gösterimden sonra makbuz yolu KLASÖR olur (koşucunun sonraki makbuz yazımı — 2. personel yanıtındaki runnerMessageIds — EISDIR ile başarısız olur);
    // kapatma 500 → çıkış 6. Klasör, koşucu çıktıktan sonra (afterExit) kaldırılır.
    // R04-b (aşama 2): R03-d'nin "adımın verdiği TEK komut iki kabukta koşulur" ölçümü KALDIRILDI — komut artık hiçbir çıktıda yok (yeni makbuzu Run kanıt dizininin
    // İÇİNE yazdırıyordu). Yerine GERÇEK KOŞUCU KANITIYLA ÇIKARMA: bu Run'ın kanıt dosyasının KOPYASINDAN tamamlanmış bir Run kanıt dizini kurulur (blok Run sonunda
    // ne yazıyorsa: owner-block.json + goref-consumed.json + GO defteri satırı; SHA256-MANIFEST.txt bloğun KENDİ Write-Manifest fonksiyonuyla yazılır) ve bloğun
    // çıkarma fonksiyonları (AST ile yüklenir; bloğun akışı ÇALIŞMAZ) Windows PowerShell 5.1 VE PowerShell 7'de koşulur: Test-RunEvidenceSource (kaynak doğrulama) +
    // New-RecoverInputFromRun (kardeş dizine yazım + geri okuma + kayıt). Kardeş dizindeki makbuzla koşucunun Recover'ı GERÇEKTEN koşar. Öz-testin Run kanıt dosyası
    // DEĞİŞTİRİLMEZ (kopya ayrı alt dizinde). Blok öz-testi RG-1 aynı yolu sahte koşucu kanıtıyla ölçer; burada kaynak GERÇEK koşucunun yazdığı kanıttır.
    const psExe = (sh) => (sh === 'ps51' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh');
    const extractWithBlock = (sh, tag, evFile, evObj) => {
      const res = { sh, rc: null, out: '', sib: 0 };
      try {
        const up = path.join(dir, `${tag}-${sh}`); fs.mkdirSync(up); const runDir = path.join(up, `extacc-d7-live-${evObj.runId}-20000101-000000`); fs.mkdirSync(runDir);
        const evBytes = fs.readFileSync(evFile); fs.writeFileSync(path.join(runDir, 'd7-evidence.json'), evBytes);
        const goSha = sha256(`${tag}-go-${evObj.runId}-${sh}`).toUpperCase();
        fs.writeFileSync(path.join(runDir, 'owner-block.json'), JSON.stringify({ record: 'EXTACC-D7-OWNER-BLOCK', revision: 'R01', mode: 'Run', runId: evObj.runId }), 'utf8');
        fs.writeFileSync(path.join(runDir, 'goref-consumed.json'), JSON.stringify({ record: 'EXTACC-D7-GOREF-CONSUMED', runId: evObj.runId, goRefSha256: goSha, literalWritten: false, exitCode: evObj.exitCode }), 'utf8');
        const ledger = path.join(up, 'go-defteri.txt'); fs.writeFileSync(ledger, `${goSha}  runId=${evObj.runId}  2000-01-01T00:00:00.0000000Z\r\n`, 'ascii');
        const cmd = ['$ErrorActionPreference = \'Stop\'', '$tok = $null; $perr = $null', `$ast = [Management.Automation.Language.Parser]::ParseFile(${psq7(WRAPPER)}, [ref]$tok, [ref]$perr)`,
          'if ($perr.Count -gt 0) { Write-Output \'Z19B-AYRISTIRMA-HATASI\'; exit 3 }',
          'foreach ($f in @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false))) { . ([scriptblock]::Create($f.Extent.Text)) }',
          `$GoLedger = ${psq7(ledger)}`,
          `try { Write-Manifest ${psq7(runDir)} 6>$null; $s = Test-RunEvidenceSource ${psq7(runDir)} 6>$null; $p = New-RecoverInputFromRun ${psq7(runDir)} 6>$null; Write-Output ('Z19B-TAMAM manifestDosya=' + $s.manifestCount + ' bayt=' + $s.bytes.Length); exit 0 }`,
          'catch { Write-Output (\'Z19B-DUR \' + $_.Exception.Message); exit 5 }'].join('\n');
        const env = Object.assign({}, process.env); for (const k of Object.keys(env)) if (k.toLowerCase() === 'psmodulepath') delete env[k];   // WinPS 5.1: devralınan PS 7 modül yolu yerleşik cmdlet'leri bozabilir
        const r = spawnSync(psExe(sh), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')], { env, encoding: 'utf8', timeout: 120000, windowsHide: true });
        // Gözlem metni: stdout (işaret satırı); stderr yalnız çıkış 0 değilken eklenir (WinPS 5.1 -EncodedCommand ile ilerleme akışını CLIXML olarak stderr'e yazar — gürültü).
        res.rc = r.status; res.out = maskUser(`${r.stdout || ''}${r.status === 0 ? '' : ' ' + String(r.stderr || '').replace(/#< CLIXML[\s\S]*$/, '')}${r.error ? ' ' + r.error.message : ''}`.replace(/\s+/g, ' ').trim().slice(0, 300));
        const leaf = path.basename(runDir); const sibs = fs.readdirSync(up).filter((n) => n.startsWith(`${leaf}.recover-girdi-`)); res.sib = sibs.length;
        res.sibName = sibs.length === 1 && /^extacc-d7-live-[0-9a-f]{8}-\d{8}-\d{6}\.recover-girdi-\d{8}T\d{6}Z$/.test(sibs[0]);
        const runFiles = fs.readdirSync(runDir, { withFileTypes: true });
        res.runDirOk = runFiles.map((e) => `${e.isDirectory() ? 'D' : 'F'}:${e.name}`).sort().join(',') === 'F:SHA256-MANIFEST.txt,F:d7-evidence.json,F:goref-consumed.json,F:owner-block.json' && fs.readFileSync(path.join(runDir, 'd7-evidence.json')).equals(evBytes);
        res.srcSame = fs.readFileSync(evFile).equals(evBytes);
        if (sibs.length === 1) {
          const rp = path.join(up, sibs[0], 'd7-setup-receipt-kanittan.json'); const kp = path.join(up, sibs[0], 'RECOVER-GIRDI-KAYDI.json'); res.receipt = rp;
          const nb = fs.existsSync(rp) ? fs.readFileSync(rp) : null; const exp = Buffer.from(String((evObj.recovery || {}).makbuzJson || ''), 'utf8'); res.bytes = nb;
          res.same = !!nb && exp.length > 100 && nb.equals(exp); res.bom = !!nb && nb[0] === 0xEF && nb[1] === 0xBB && nb[2] === 0xBF; res.noCr = !!nb && !nb.includes(13);
          let k = null; try { k = JSON.parse(fs.readFileSync(kp, 'utf8')); } catch (e) { k = null; }
          res.kayit = !!k && k.record === 'EXTACC-D7-RECOVER-INPUT' && k.runId === evObj.runId && k.kaynakKanitSha256 === sha256(evBytes).toUpperCase() && !!nb && k.makbuzSha256 === sha256(nb).toUpperCase() && k.makbuzBayt === nb.length && k.kaynakKayitTuru === 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN';
          const g = nb && typeof EX0.readReceiptForRecover === 'function' ? EX0.readReceiptForRecover(rp) : null; res.gate = !!g && g.ok;
          artifacts.push(rp, kp);
        }
      } catch (e) { res.out = `${res.out} · düzenek hatası: ${maskUser(String(e && e.message).slice(0, 160))}`; }
      res.ok = res.rc === 0 && /Z19B-TAMAM manifestDosya=3 bayt=\d+/.test(res.out) && res.sib === 1 && res.sibName === true && res.runDirOk === true && res.srcSame === true && res.same === true && res.bom === false && res.noCr === true && res.kayit === true && res.gate === true;
      return res;
    };
    const shTxt = (x) => (x ? `rc=${x.rc} kardeş=${x.sib} ad=${x.sibName} Run dizini değişmedi=${x.runDirOk} baytlar=makbuzJson:${x.same} BOM=${x.bom} CR yok=${x.noCr} kayıt=${x.kayit} koşucu kapısı=${x.gate} [${x.out}]` : '-');
    const rp19 = path.join(dir, 'z19b-receipt-unwritable-receipt.json');
    const z19b = await runScenario('z19b-receipt-unwritable', dir, { disable: 'fail' }, {}, {
      onDisplay: async (rid, sink) => { try { fs.unlinkSync(rp19); fs.mkdirSync(rp19); } catch (e) { /* ölçüm aşağıda */ } return fullPhone(rid, sink); },
      afterExit: async () => { try { fs.rmdirSync(rp19); } catch (e) { /* ölçüm aşağıda */ } } });
    const rec19 = (z19b.ev && z19b.ev.recovery) || {}; const ev19r = (z19b.ev && z19b.ev.receipt) || null;
    const evFile19 = path.join(dir, 'z19b-receipt-unwritable-evidence.json'); const sh19 = {}; const r19 = {}; const keep19 = {};
    for (const sh of ['ps51', 'ps7']) {
      sh19[sh] = z19b.ev ? extractWithBlock(sh, 'z19b-run-kaniti', evFile19, z19b.ev) : { ok: false, out: 'Run kanıtı yok' };
      if (sh19[sh].receipt && sh19[sh].bytes) {
        r19[sh] = await recover({ runId: z19b.runId, receipt: sh19[sh].receipt, rc: ev19r, tenant: z19b.tenant }, dir, `z19b-recover-${sh}`, {});
        keep19[sh] = fs.readFileSync(sh19[sh].receipt).equals(sh19[sh].bytes);   // D-7 Recover makbuz dosyasına YAZMAZ: baytlar Recover'dan ÖNCE = SONRA
      }
    }
    const rec19Ok = (r) => !!r && r.code === 3 && !!r.ev && r.ev.record === 'EXTACC-D7-RECOVER' && ((r.ev.portalClose || {}).identity === 'OK') && !!r.pu && r.pu.isActive === false && r.cl.hasPortalAccess === false && r.v('P7-C3L') === 'PASS' && r.v('P7-MSG-KEPT') === 'PASS' && r.activeUsers === 0;
    check('Z19-b', 'makbuz dosyası gösterimden sonra YAZILAMAZ hale geldi (uçtan uca; yol klasör; kapatma 500 → portal AÇIK, çıkış 6): kanıtta receiptWriteError (EISDIR), makbuzDurumu=OKUNAMADI, `recovery.makbuzJson` = JSON.stringify(receipt, null, 1) (runnerMessageIds dahil); R04-b: adım bloğun seçeneğini SOMUT kanıt diziniyle gösterir (`-Mode Recover -RunEvidenceDir \'<bu kanıtın dizini>\'`; durum bilgisi "OKUNAMIYOR (dosya okunamadı (EISDIR) …)"), elle komut / `-ReceiptFile` önerisi YOK; GERÇEK KOŞUCU KANITIYLA ÇIKARMA (bu kanıtın kopyasından kurulan tamamlanmış Run kanıt dizini; manifest bloğun Write-Manifest\'iyle; bloğun fonksiyonları AST ile) Windows PowerShell 5.1 VE PowerShell 7\'de: kaynak doğrulama (Test-RunEvidenceSource) geçer (manifestte 3 dosya), New-RecoverInputFromRun makbuzu Run dizininin KARDEŞİNE yazar (tek kardeş dizin, adı <Run dizini>.recover-girdi-<UTC>), dosyanın baytları kanıttaki makbuzJson\'un UTF-8 baytlarına BİREBİR eşit (BOM yok, CR yok), RECOVER-GIRDI-KAYDI.json kaynak kanıt sha256 + makbuz sha256 / bayt + runId + kayıt türünü taşır, Run kanıt dizini (dört dosya, alt dizin yok) ve öz-testin kanıt dosyası DEĞİŞMEDİ; koşucunun Recover okuma kapısı (readReceiptForRecover) iki dosyada ok; her dosyayla Recover GERÇEKTEN koşar: kayıt EXTACC-D7-RECOVER, kimlik bağı OK, portal pasif + erişim kapalı, yeni giriş 401, P7-MSG-KEPT makbuzdaki koşucu id\'leriyle PASS, personel pasif, çıkış 3 (ilk Recover disable-user çağırdı); makbuz dosyasının baytları Recover\'dan ÖNCE = SONRA (D-7 Recover makbuza yazmaz → RECOVER-GIRDI-KAYDI.json\'daki makbuzSha256 Recover\'dan sonra da tutar)',
      z19b.code === 6 && !!z19b.ev && z19b.ev.displayed === true && /EISDIR/.test(z19b.ev.receiptWriteError || '') && rec19.gerekli === true && rec19.makbuzDurumu === 'OKUNAMADI'
        && rgOpt7(rec19, psq7(dir)) && /^OKUNAMIYOR \(dosya okunamadı \(EISDIR\)/.test(durumOf7(rec19))
        && !!ev19r && ev19r.record === EX0.RECEIPT_RECORD && Array.isArray(ev19r.runnerMessageIds) && ev19r.runnerMessageIds.length >= 1 && rec19.makbuzJson === JSON.stringify(ev19r, null, 1)
        && !!sh19.ps51 && sh19.ps51.ok === true && rec19Ok(r19.ps51) && r19.ps51.calls.some((c) => c.path === '/api/portal/admin/disable-user') && keep19.ps51 === true
        && !!sh19.ps7 && sh19.ps7.ok === true && rec19Ok(r19.ps7) && keep19.ps7 === true,
      `çıkış=${z19b.code} · yazma hatası=${(z19b.ev || {}).receiptWriteError || '-'} · durum=${rec19.makbuzDurumu} · adım seçeneği=${rgOpt7(rec19, psq7(dir))} [${durumOf7(rec19).slice(0, 120)}] · kanıtta receipt=${!!ev19r} id=${ev19r && ev19r.runnerMessageIds ? ev19r.runnerMessageIds.length : '-'} · ps51: ${shTxt(sh19.ps51)} Recover=${r19.ps51 ? r19.ps51.code : '-'} kimlik=${r19.ps51 && r19.ps51.ev ? (r19.ps51.ev.portalClose || {}).identity : '-'} makbuz baytları aynı=${keep19.ps51} · ps7: ${shTxt(sh19.ps7)} Recover=${r19.ps7 ? r19.ps7.code : '-'} kimlik=${r19.ps7 && r19.ps7.ev ? (r19.ps7.ev.portalClose || {}).identity : '-'} makbuz baytları aynı=${keep19.ps7} KEPT=${r19.ps7 ? r19.ps7.v('P7-MSG-KEPT') : '-'}`);

    // ==== R03-d (M1) — guard NORMAL + yeniden açma (ürün gibi sürüm artışı): eski oturum 401 → P7-C4 PASS; bulgu yok; portal açık satırı var
    const z20a = await runScenario('z20a-reopen-guard-normal', dir, { reopen: 'afterDisable' }, {}, { onDisplay: fullPhone });
    const n20a = nedenOf(z20a); const line20a = n20a.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    check('Z20-a', 'R03-d: guard NORMAL + hesap HTTP ölçümleri SIRASINDA yeniden açıldı (sahte API reopen afterDisable; sürüm ürün gibi ARTAR): eski oturum sürüm farkıyla REDDEDİLİR → P7-C4L/D PASS (HTTP 401); productFinding YOK, sessionVersion YOK; P7-C2 PASS, P7-C5 FAIL; kurtarma nedeninde portal satırı "yeniden AÇILDI (P7-C5 FAIL …): açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)" (R03-f: "(Recover kapatabilir)" YOK); "ÜRÜN BULGUSU" / "Recover düzeltemez" satırı YOK; DB\'de hesap AÇIK; çıkış 6',
      z20a.code === 6 && ['P7-C4L', 'P7-C4D'].every((id) => z20a.v(id) === 'PASS' && z20a.o(id) === 'HTTP 401') && z20a.v('P7-C2') === 'PASS' && z20a.v('P7-C5') === 'FAIL' && !!z20a.ev && !z20a.ev.productFinding && !pcOf(z20a).sessionVersion
        && line20a.includes(`hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}`) && !/Recover kapatabilir/.test(line20a) && !n20a.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n))
        && !!z20a.pu && z20a.pu.isActive === true,
      `çıkış=${z20a.code} · C4L=${z20a.o('P7-C4L')} C4D=${z20a.o('P7-C4D')} · C2=${z20a.v('P7-C2')} C5=${z20a.v('P7-C5')} · bulgu=${JSON.stringify((z20a.ev || {}).productFinding || null)} · portal satırı=${line20a.slice(0, 240)}`);
    // ==== R03-e: Z20-b DEĞİŞTİ — sürüm verilme değerine GERİ döner (sahte API afterDisableRevert; guard normal → eski oturum 200). R03-d bu durumda "adayı DEĞİL"
    //      yazıyordu; tablo TA: sürüm ölçüm aralığında AZALDI (ürün yazıcıları yalnız artırır → ürün dışı yazım; istek anındaki sürüm ölçülmedi) → AYRISTIRILAMADI.
    const z20b = await runScenario('z20b-reopen-version-revert', dir, { reopen: 'afterDisableRevert' }, {}, { onDisplay: fullPhone });
    const n20b = nedenOf(z20b); const line20b = n20b.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || ''; const sv20b = pcOf(z20b).sessionVersion || {};
    check('Z20-b', 'R03-e (R03-d\'den değişti): yeniden açmada sürüm oturumun verildiği değere GERİ döner (sahte API afterDisableRevert; guard normal → eski oturum 200): tablo TA — P7-C4L/D FAIL + "ürün bulgusu AYRIŞTIRILAMADI (TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI (HTTP öncesi b+1 → sonrası b; verilme b) — ürün yazıcıları yalnız artırır …)"; sessionVersion AYRISTIRILAMADI/TA (httpOncesi=b+1, olcumSonrasi=b); productFinding YOK; kurtarma nedeninde AYRI oturum satırı "ürün bulgusu olup olmadığı AYRIŞTIRILAMADI (TA; …)" + portal satırı "yeniden AÇILDI (…): açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür); … AYRI satırdadır (ürün bulgusu AYRIŞTIRILAMADI)" (R03-f: "(Recover kapatabilir)" YOK); "DEĞİL" / "ürün bulgusu değil" / "ÜRÜN BULGUSU" / "Recover düzeltemez" HİÇBİR yerde YOK; DB\'de hesap açık, sürüm = verilen; çıkış 6',
      z20b.code === 6 && z20b.v('P7-C2') === 'PASS' && z20b.v('P7-C5') === 'FAIL' && sv20b.sinif === 'AYRISTIRILAMADI' && sv20b.hucre === 'TA' && Number.isInteger(sv20b.verilen) && sv20b.olcumSonrasi === sv20b.verilen && sv20b.httpOncesi === sv20b.verilen + 1 && !!z20b.ev && !z20b.ev.productFinding
        && ['P7-C4L', 'P7-C4D'].every((id) => z20b.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI \(HTTP öncesi (\d+) → sonrası (\d+); verilme \2\) — ürün yazıcıları yalnız artırır/.test(z20b.o(id)))
        && n20b.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu olup olmadığı AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI/.test(n))
        && line20b.includes(`yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}; koşucu oturumunun erişmesi AYRI satırdadır (ürün bulgusu AYRIŞTIRILAMADI)`) && !/Recover kapatabilir/.test(line20b)
        && ![...n20b, z20b.o('P7-C4L'), z20b.o('P7-C4D'), z20b.o('P7-D9')].some((t) => /DEĞİL|ürün bulgusu değil|ÜRÜN BULGUSU|Recover düzeltemez/.test(t))
        && !!z20b.pu && z20b.pu.isActive === true && z20b.pu.tokenVersion === sv20b.verilen,
      `çıkış=${z20b.code} · sınıf=${JSON.stringify(sv20b)} · C4L=${z20b.o('P7-C4L').slice(0, 220)} · portal satırı=${line20b.slice(0, 300)} · DB sonra=${JSON.stringify(z20b.pu)}`);
    // ==== R03-e: Z20-c DEĞİŞTİ — kurtarma nedeni (birim) sessionClass200 sınıflarına göre: oturum satırı portal ERİŞİM satırından AYRI; ADAY P7-C2 FAIL dalında da
    //      (R03-d bu dalda ADAY yazmazdı); SAYILMADI yalnız T5; AYRISTIRILAMADI'da "DEĞİL" yok; Recover modunda "(Recover kapatabilir)" YAZILMAZ.
    const sc2 = typeof EX0.sessionClass200 === 'function' ? EX0.sessionClass200 : null; const S = (exists, isActive, hasPortalAccess, tokenVersion) => ({ exists, isActive, hasPortalAccess, tokenVersion });
    const R6c = (pairs) => pairs.map(([id, verdict]) => ({ id, verdict })); const vOpen = R6c([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL'], ['P7-C2V', 'FAIL'], ['P7-C5', 'FAIL'], ['P7-C4L', 'FAIL'], ['P7-C4D', 'FAIL']]);
    const pcOpen = (k, s1, s2, closeText) => ({ ok: false, portalDbClosed: false, productFinding: (k && k.bulgu) || null, sessionVersion: k ? { sinif: k.sinif, hucre: k.hucre, ifade: k.ifade, neden: k.neden } : null, after: s1, afterMeasure: s2, closeText,
      disableCalls: ['HTTP 403', 'HTTP 403'], docResidue: { durum: 'YOK', rows: 0, filesLeftOnDisk: [], filesAccessError: [] } });
    // R03-f: kapatma metni fixture'ı koşucunun R03-f biçiminde (F3: "DB'de portal hesabı AKTİF (…)"); disableCalls 403 → Recover metni RC_REJ(403) (F2)
    const stA = S(true, true, true, 2); const stS = S(true, true, true, 1); const ctA = 'kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm 1→2)'; const ctS = 'kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm 1→1)';
    const kA = sc2 ? sc2(1, stA, stA) : {}; const kS = sc2 ? sc2(1, stS, stS) : {}; const kU = sc2 ? sc2(null, stS, stS) : {};
    const nA = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kA, stA, stA, ctA) }, null, 'run').neden || []) : [];
    const nS = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kS, stS, stS, ctS) }, null, 'run').neden || []) : [];
    const nU = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kU, stS, stS, ctS) }, null, 'run').neden || []) : [];
    const nR = raf ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(null, stS, stS, ctS) }, null, 'recover').neden || []) : [];
    const candA = nA.filter((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI \(T2\) — eski portal oturumu sürüm reddine rağmen erişti \(oturumun verildiği sürüm 1, HTTP öncesi DB sürümü 2, sonrası 2 — /.test(n) && /oturum reddi ürün tarafıdır, Recover düzeltemez/.test(n) && !/Recover kapatabilir/.test(n));
    const openA = nA.filter((n) => n.startsWith(`PORTAL ERİŞİMİ kapandığı doğrulanmadı (P7-C1=FAIL,P7-C2=FAIL,P7-C2V=FAIL,P7-C5=FAIL) — kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB'de portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm 1→2): açık erişim kapatılmalıdır; ${RC_REJ(403)}; koşucu oturumunun erişmesi AYRI satırdadır (ÜRÜN BULGUSU ADAYI)`) && !/Recover düzeltemez|SAYILMADI|Recover kapatabilir/.test(n));
    check('Z20-c', 'R03-f (R03-e\'den değişti) kurtarma nedeni (birim, sessionClass200 çıktılarıyla): P7-C2 FAIL (hesap açık) + sürüm verilmeden büyük (T2) → ADAY: AYRI iki satır — oturum satırı "PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI (T2) — … Recover düzeltemez" ("(Recover kapatabilir)" YOK) + portal satırı "… — kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (… sürüm 1→2): açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run\'da kapatma HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (…); … AYRI satırdadır (ÜRÜN BULGUSU ADAYI)" ("Recover düzeltemez" / "SAYILMADI" / "(Recover kapatabilir)" YOK) · T5 → oturum satırı "ürün bulgusu SAYILMADI (T5: hesap aktif kaldı …)" ("kapatma DB\'ye yansımadı" YOK), "ÜRÜN BULGUSU" YOK · T0 → "ürün bulgusu olup olmadığı AYRIŞTIRILAMADI (T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor)", "DEĞİL" / "SAYILMADI" YOK · Recover modunda açık hesap → "açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)", "(Recover kapatabilir)" YOK',
      !!sc2 && !!raf && kA.sinif === 'ADAY' && kA.hucre === 'T2' && candA.length === 1 && openA.length === 1 && candA[0] !== openA[0] && !nA.some((n) => /SAYILMADI/.test(n))
        && kS.sinif === 'SAYILMADI' && nS.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI \(T5: hesap aktif kaldı \(isActive=true/.test(n)) && nS.some((n) => /AYRI satırdadır \(ürün bulgusu SAYILMADI\)/.test(n)) && !nS.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez|DB'ye yansımadı/.test(n))
        && kU.sinif === 'AYRISTIRILAMADI' && nU.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu olup olmadığı AYRIŞTIRILAMADI \(T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor\)$/.test(n)) && !nU.some((n) => /DEĞİL|ÜRÜN BULGUSU|SAYILMADI/.test(n))
        && nR.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n) && /: açık erişim KAPANMADI \(bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı\)/.test(n)) && !nR.some((n) => /Recover kapatabilir/.test(n)),
      `fonksiyon=${!!sc2} · ADAY=${nA.map((n) => n.slice(0, 120)).join(' | ')} · T5=${nS.map((n) => n.slice(0, 100)).join(' | ')} · T0=${nU.map((n) => n.slice(0, 100)).join(' | ')} · Recover=${nR.map((n) => n.slice(-120)).join(' | ')}`);
    // ==== R03-e: Z21-a — KARAR TABLOSU (birim, sessionClass200): her hücre sınıf + hücre + gözlem metni; ADAY'da ürün bulgusu metni "Recover düzeltemez" ile biter ve
    //      açık-erişim metnini içermez; "ürün bulgusu değil" / "SAYILMADI" YALNIZ T5'te; "DEĞİL" sınıfı ve metni YOK; satır yokken metin "sürüm null" DEMEZ.
    const T23 = [
      ['B', 1, S(true, false, false, 2), S(true, false, false, 2), 'BULGU', 'B', /^HTTP 200 — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)$/],
      ['T0', null, S(true, true, true, 1), S(true, true, true, 1), 'AYRISTIRILAMADI', 'T0', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor\)$/],
      ['T1', 1, S(false, null, false, null), S(false, null, false, null), 'ADAY', 'T1', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1\) — eski oturum hesap satırı yokken erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder/],
      // R03-f (F5): b'den bağımsız ADAY hücreleri T0'dan ÖNCE — b bilinmiyorken de T1 / TG / T3 (R03-e'de üçü de T0 AYRISTIRILAMADI verirdi)
      ['T1-b-yok', null, S(false, null, false, null), S(false, null, false, null), 'ADAY', 'T1', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1\) — eski oturum hesap satırı yokken erişti/],
      ['TG', null, S(true, true, true, 1), S(true, true, true, 1), 'ADAY', 'TG', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TG\) — eski oturum geçersiz sürüm claim'ine rağmen erişti \(oturumun token'ındaki tokenVersion claim'i tam sayı ≥ 0 değil — guard her isteği reddeder \(portal-auth\.guard\.ts:42-45; DB okumasından önce/, true],
      ['TG-pasif', null, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'TG', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TG\) — /, true],
      ['T3-b-yok', null, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'T3', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T3\) — eski oturum pasif hesap reddine rağmen erişti \(HTTP öncesi ve sonrası hesap pasif \(isActive=false→false; hasPortalAccess=true→true\) ve sürüm aralıkta değişmedi \(1; verilme bilinmiyor\) — guard pasif hesabı verilme sürümünden bağımsız reddeder \(portal-auth\.guard\.ts:58-60\); hasPortalAccess guard'da okunmaz\)$/],
      ['T3-b-üst', 5, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'T3', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T3\) — eski oturum pasif hesap reddine rağmen erişti \(.*sürüm aralıkta değişmedi \(1; verilme 5\)/],
      ['T1s-sürüm', 1, S(true, false, false, 2), S(false, null, false, null), 'ADAY', 'T1s', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1s\) — eski oturum sürüm \/ satır yokluğu reddine rağmen erişti \(hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi sürüm 2, verilme 1/],
      ['T1s-pasif', 1, S(true, false, true, 1), S(false, null, false, null), 'ADAY', 'T1s', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1s\) — eski oturum pasif hesap \/ satır yokluğu reddine rağmen erişti \(hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi pasif \(isActive=false\)/],
      ['T1s-açık', 1, S(true, true, true, 1), S(false, null, false, null), 'AYRISTIRILAMADI', 'T1s', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T1s; ÖLÇÜLEMEDİ: hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi açık \(isActive=true\) ve sürüm verilme sürümüne eşit \(1\) — istek anında satır açık ve aynı sürümdeyse 200 beklenir/],
      ['T1s-alt', 3, S(true, true, true, 1), S(false, null, false, null), 'AYRISTIRILAMADI', 'T1s', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T1s; ÖLÇÜLEMEDİ: hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi sürüm 1 verilme sürümünün \(3\) ALTINDA/],
      ['TA', 1, S(true, false, false, 2), S(true, true, true, 1), 'AYRISTIRILAMADI', 'TA', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI \(HTTP öncesi 2 → sonrası 1; verilme 1\) — ürün yazıcıları yalnız artırır/],
      // R03-f (F4): TI yalnız a = b = c — TI-açma girdisi a = b = c = 2'ye taşındı; R03-e'deki TI-açma girdisi (a = c = 2 ≠ b = 1) artık T2 ADAY (T2-TIdışı)
      ['TI-açma', 2, S(true, false, false, 2), S(true, true, true, 2), 'AYRISTIRILAMADI', 'TI', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden \(2\) isActive false→true — .*ürün dışı yeniden açma ölçüldü/],
      ['T2-TIdışı', 1, S(true, false, false, 2), S(true, true, true, 2), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 1, HTTP öncesi ve sonrası DB sürümü 2 — sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım \(isActive false→true, sürüm artmadan\) sürüme dokunmadı \(aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır\); guard sürüm farkında isActive'ten bağımsız reddeder/],
      ['TI-kapama', 1, S(true, true, true, 1), S(true, false, true, 1), 'AYRISTIRILAMADI', 'TI', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden \(1\) isActive true→false — .*ürün dışı kapatma ölçüldü/],
      ['T2-üst', 1, S(true, true, true, 2), S(true, true, true, 2), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 1, HTTP öncesi DB sürümü 2, sonrası 2 — ürün yazıcıları yalnız artırdığından istek anında da farklıydı/],
      ['T2-alt', 3, S(true, true, true, 1), S(true, true, true, 1), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 3, HTTP öncesi DB sürümü 1, sonrası 1 \(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma\)/],
      ['T2a', 2, S(true, true, true, 1), S(true, true, true, 3), 'AYRISTIRILAMADI', 'T2a', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T2a; ÖLÇÜLEMEDİ: HTTP öncesi DB sürümü 1 verilme sürümünün \(2\) ALTINDA, sonrası 3/],
      ['T3', 1, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'T3', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T3\) — eski oturum pasif hesap reddine rağmen erişti \(HTTP öncesi ve sonrası hesap pasif .*sürüm aralıkta değişmedi \(1; verilme 1\)/],
      ['T4', 1, S(true, false, true, 1), S(true, true, true, 2), 'ADAY', 'T4', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T4\) — eski oturum pasif hesap \/ sürüm reddine rağmen erişti \(.*istek anındaki ret nedeni ayrıştırılamadı \(pasiflik ya da sürüm\)/],
      // R03-f (F3): T5 metni ölçüleni söyler — "kapatma DB'ye yansımadı" YOK
      ['T5', 1, S(true, true, true, 1), S(true, true, true, 1), 'SAYILMADI', 'T5', /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — hesap aktif kaldı \(isActive=true — HTTP ölçümlerinden önce ve sonra\) ve sürüm verilme sürümüyle aynı \(1\); guard hasPortalAccess okumaz \(ölçülen true→true\); 200 beklenir — ürün bulgusu değil \(satır kimliği ve tenant yaşam döngüsü ölçülmedi/],
      ['T5-erişimKapalı', 1, S(true, true, false, 1), S(true, true, false, 1), 'SAYILMADI', 'T5', /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — hesap aktif kaldı .*guard hasPortalAccess okumaz \(ölçülen false→false\)/],
      ['T6', 1, S(true, true, true, 1), S(true, true, true, 2), 'AYRISTIRILAMADI', 'T6', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T6; ÖLÇÜLEMEDİ: HTTP öncesi hesap açık ve sürüm verilme sürümüne eşit \(1\), HTTP sonrası sürüm 2 — sürüm istek sırasında değişti/],
      // R03-g (G3): token JWT olarak OKUNAMADI → TJ (ADAY; ürün guard'ı :36 verifyAsync DB'den önce reddeder). 'TJ' girdisi T5 girdisiyle AYNI DB + b = s1 → T5'e ULAŞMAZ;
      // b bilinmiyorken (T0 değil), hesap pasifken (T3 değil) ve sürüm artışında (T6 değil) de TJ.
      ['TJ', 1, S(true, true, true, 1), S(true, true, true, 1), 'ADAY', 'TJ', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TJ\) — eski oturum JWT olarak okunamayan token'a rağmen erişti \(token JWT olarak okunamadı \(üç parçalı JWT değil ya da payload JSON nesnesi değil\) — ürün guard'ı bu token'ı DB'den önce reddeder \(portal-auth\.guard\.ts:36 verifyAsync; hesap durumundan ve sürümden bağımsız\)\)$/, false, true],
      ['TJ-b-yok', null, S(true, true, true, 1), S(true, true, true, 1), 'ADAY', 'TJ', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TJ\) — eski oturum JWT olarak okunamayan token'a rağmen erişti/, false, true],
      ['TJ-pasif', 1, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'TJ', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TJ\) — /, false, true],
      ['TJ-artış', 1, S(true, true, true, 1), S(true, true, true, 2), 'ADAY', 'TJ', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TJ\) — /, false, true],
      // R03-g (G5): SIRA — B, TG'den ve TJ'den ÖNCE (claim geçersiz / okunamaz, iki uç kapalı + sürüm aynı → BULGU / B); T1, TG'den ve TJ'den ÖNCE (st1 satırı yok → ADAY / T1)
      ['B-TG', null, S(true, false, false, 2), S(true, false, false, 2), 'BULGU', 'B', /^HTTP 200 — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)$/, true],
      ['T1-TG', null, S(false, null, false, null), S(false, null, false, null), 'ADAY', 'T1', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1\) — eski oturum hesap satırı yokken erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK/, true],
      ['B-TJ', 1, S(true, false, false, 2), S(true, false, false, 2), 'BULGU', 'B', /^HTTP 200 — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)$/, false, true],
      ['T1-TJ', 1, S(false, null, false, null), S(false, null, false, null), 'ADAY', 'T1', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1\) — eski oturum hesap satırı yokken erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK/, false, true],
      // R03-g (G4): a = c ≠ b, isActive değişti ve b > c → T2 ADAY + "(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma)" (R03-f: not yalnız tiOut DIŞI T2'deydi)
      ['T2-TIdışı-alt', 3, S(true, true, true, 1), S(true, false, true, 1), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 3, HTTP öncesi ve sonrası DB sürümü 1 \(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma\) — sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım \(isActive true→false, sürüm artmadan\) sürüme dokunmadı/],
    ];
    // R03-f: 8. sütun (isteğe bağlı) = claimInvalid — koşucunun token claim'i geçersiz (TG) · R03-g: 9. sütun = claimUnreadable — token JWT olarak okunamadı (TJ)
    const r23 = T23.map(([n, b, s1, s2, sinif, hucre, re, ci, cu]) => { const k = sc2 ? sc2(b, s1, s2, ci === true, cu === true) : {}; const txt = `${k.gozlem || ''} ${k.bulgu || ''}`;
      const bulguOk = k.sinif === 'ADAY' ? (/^ÜRÜN BULGUSU ADAYI \(/.test(k.bulgu || '') && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(k.bulgu || '') && !/Recover kapatabilir|açık erişim/.test(k.bulgu || '')) : (k.sinif === 'BULGU' ? /^ÜRÜN BULGUSU: /.test(k.bulgu || '') : k.bulgu === null);
      return { n, k, ok: k.sinif === sinif && k.hucre === hucre && re.test(k.gozlem || '') && bulguOk && !/sürüm null|sürümü null|DEĞİL|DB'ye yansımadı|null\)/.test(txt) }; });
    const notT5 = r23.filter((x) => x.k.hucre !== 'T5' && /ürün bulgusu değil|SAYILMADI/.test(`${x.k.gozlem || ''} ${x.k.bulgu || ''}`)).map((x) => x.n);
    check('Z21-a', 'R03-g (R03-f\'den değişti; G3/G4/G5) karar tablosu (birim, sessionClass200; 33 girdi, 14 hücre; SIRA: B → T1 → TG → TJ → T3 → T0 → T1s → TA → TI → T2 → T2a → T5 → T4 → T6) — R03-g: TJ (token JWT olarak okunamadı; T5 girdisiyle aynı DB + b = s1, b bilinmiyor, pasif, sürüm artışı) → ADAY + "ürün guard\'ı bu token\'ı DB\'den önce reddeder (portal-auth.guard.ts:36 verifyAsync; …)", T5\'e ULAŞMAZ · sıra girdileri B-TG / B-TJ (claim geçersiz / okunamaz, iki uç kapalı + sürüm aynı) → BULGU/B, T1-TG / T1-TJ (st1 satırı yok) → ADAY/T1 · a = c ≠ b + isActive değişti + b > c → T2 ADAY + "(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma)" — R03-f girdileri: B (kapalı + sürüm aynı) → BULGU · T1 (st1 satırı yok; b bilinmiyorken de) → ADAY · TG (token claim\'i geçersiz; b bilinmiyorken; hesap pasifken de TG) → ADAY + "guard her isteği reddeder (portal-auth.guard.ts:42-45 …)" · T3 (st1 ve st2 pasif, sürüm iki uçta aynı; b bilinmiyorken ve b aralık dışındayken de) → ADAY · T0 (verilme bilinmiyor, b\'den bağımsız hücre tutmadı) → AYRISTIRILAMADI · T1s (st2 satırı yok: sürüm > verilme / pasif → ADAY; açık + eşit / sürüm altında → AYRISTIRILAMADI; "sürüm null" YOK) · TA (sürüm aralıkta azaldı) → AYRISTIRILAMADI · TI YALNIZ a = b = c (sürüm değişmeden isActive değişti: ürün dışı açma / kapama) → AYRISTIRILAMADI · a = c ≠ b + isActive değişti → T2 ADAY ("sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım sürüme dokunmadı (aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır)") · T2 (verilme aralık dışında, üst ve alt) → ADAY · T2a → AYRISTIRILAMADI · T4 (pasif + sonra artış) → ADAY · T5 (aktif + eşit; hasPortalAccess=false dahil — guard okumaz) → SAYILMADI, metin "hesap aktif kaldı …; guard hasPortalAccess okumaz …; 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)" ("kapatma DB\'ye yansımadı" YOK) · T6 (aktif + istek sırasında artış) → AYRISTIRILAMADI; ADAY bulgu metni "Recover düzeltemez" ile biter, açık-erişim metni İÇERMEZ; "ürün bulgusu değil" / "SAYILMADI" yalnız T5\'te; "DEĞİL" / "null)" YOK',
      !!sc2 && r23.every((x) => x.ok) && notT5.length === 0 && new Set(r23.map((x) => x.k.hucre)).size === 14 && r23.length === 33,
      `fonksiyon=${!!sc2} · hatalı=${r23.filter((x) => !x.ok).map((x) => `${x.n}:${x.k.sinif}/${x.k.hucre} ${String(x.k.gozlem || '').slice(0, 90)}`).join(' || ') || 'yok'} · T5 dışı "değil/SAYILMADI"=${notT5.join(',') || 'yok'} · hücreler=${[...new Set(r23.map((x) => x.k.hucre))].join(',')}`);
    // ==== R03-e: Z21-b — verilme sürümü (birim): token claim'i İMZASIZ okunur; claim esas, s1 farklıysa ikisi de; okunamazsa s1; geçersizse bilinmiyor; kanıtta token YOK
    const ivF = typeof EX0.issuedVersionOf === 'function' ? EX0.issuedVersionOf : null; const tokOf = (p) => ['h', Buffer.from(JSON.stringify(p)).toString('base64url'), crypto.randomBytes(6).toString('hex')].join('.');
    const toks = [tokOf({ tokenVersion: 4 }), tokOf({ sub: 'x' }), tokOf({ tokenVersion: -1 }), 'pfake.' + Buffer.from('{"tv":4}').toString('base64url'), tokOf({ tokenVersion: 3 })];
    const ivs = ivF ? toks.map((t) => ivF(t, 3)) : [];
    check('Z21-b', 'R03-e verilme sürümü (birim, issuedVersionOf / portalTokenClaimVersion — İMZASIZ decode): claim 4 + s1 3 → esas 4, kaynak claim, claim=4 s1=3 fark=true · claim YOK → 0 (guard kuralı :98-101) · claim geçersiz (-1) → esas bilinmiyor (kaynak "yok (claim geçersiz)" → T0) · JWT değil → esas s1 (kaynak s1, OKUNAMADI) · claim = s1 → fark=false; kanıt nesnesinde token YOK',
      !!ivF && ivs[0].value === 4 && ivs[0].kanit.kaynak === 'claim' && ivs[0].kanit.claim === 4 && ivs[0].kanit.s1 === 3 && ivs[0].kanit.fark === true
        && ivs[1].value === 0 && ivs[1].kanit.kaynak === 'claim' && /guard kuralı/.test(ivs[1].kanit.claimNeden || '') && ivs[2].value === null && ivs[2].kanit.claimDurum === 'GECERSIZ' && ivs[2].kanit.kaynak === 'yok (claim geçersiz)'
        && ivs[3].value === 3 && ivs[3].kanit.kaynak === 's1' && ivs[3].kanit.claimDurum === 'OKUNAMADI' && ivs[4].kanit.fark === false && !ivs.some((x, i) => JSON.stringify(x.kanit).includes(toks[i]) || JSON.stringify(x.kanit).includes(toks[i].split('.')[1])),
      `fonksiyon=${!!ivF} · ${ivs.map((x) => `${x.value}/${x.kanit.kaynak}/${x.kanit.claimDurum}/fark=${x.kanit.fark}`).join(' · ')}`);
    // ==== R03-e: Z21-c..j — uçtan uca tablo varyantları: guard KUSUR taklidi (bayat) → beklenen sınıf ve metin · guard NORMAL → 401, P7-C4 PASS, productFinding YOK
    const candLine = (z) => nedenOf(z).find((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI/.test(n)) || '';
    const sessLine = (z) => nedenOf(z).find((n) => /^PORTAL: mevcut oturum HTTP 200/.test(n)) || '';
    const adayE2E = (z, hucre, bulguRe, c4Re) => { const sv = pcOf(z).sessionVersion || {}; const pf = (z.ev && z.ev.productFinding) || ''; const cand = candLine(z); const line = openLineOf(z);
      return z.code === 6 && sv.sinif === 'ADAY' && sv.hucre === hucre && bulguRe.test(pf) && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(pf) && !/Recover kapatabilir|açık erişim/.test(pf)
        && ['P7-C4L', 'P7-C4D'].every((id) => z.v(id) === 'FAIL' && c4Re.test(z.o(id)) && !/SAYILMADI|hâlâ|DEĞİL/.test(z.o(id)))
        && !!cand && /Recover düzeltemez/.test(cand) && !/Recover kapatabilir/.test(cand) && !!line && line !== cand && !/Recover düzeltemez/.test(line) && /AYRI satırdadır \(ÜRÜN BULGUSU ADAYI\)/.test(line)
        && !nedenOf(z).some((n) => /SAYILMADI|DEĞİL|hâlâ/.test(n)) && z.o('P7-D9').includes(`ÜRÜN BULGUSU ADAYI (${hucre})`); };
    const normalE2E = (z) => z.code === 6 && ['P7-C4L', 'P7-C4D'].every((id) => z.v(id) === 'PASS' && z.o(id) === 'HTTP 401') && !!z.ev && !z.ev.productFinding && !pcOf(z).productFinding && !pcOf(z).sessionVersion
      && !nedenOf(z).some((n) => /^PORTAL: mevcut oturum|ÜRÜN BULGUSU|Recover düzeltemez|SAYILMADI|hâlâ/.test(n));
    const sumE = (z) => `çıkış=${z.code} · sınıf=${JSON.stringify(pcOf(z).sessionVersion || null)} · bulgu=${String((z.ev || {}).productFinding || '').slice(0, 140)} · C4L=${z.o('P7-C4L').slice(0, 260)} · açıkErişim=${pcOf(z).acikErisim || '-'} · neden=${nedenOf(z).map((n) => n.slice(0, 170)).join(' | ')}`;
    const ver2 = (s) => { const m = /sürüm (\d+)→(\d+)\)/.exec(s || ''); return m ? [Number(m[1]), Number(m[2])] : null; };
    // T2 — açıkken "Şifre Değiştir" (sürüm +1, isActive değişmez) + kapatma ucu 403 → P7-C2 FAIL; guard sürümle reddetmeliydi → ADAY (R03-d bu dalda "SAYILMADI" yazıyordu)
    const z21c = await runScenario('z21c-t2-pwchange-forbidden-stale', dir, { guard: 'stale', pwChange: 'onDisable', disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    const sv21c = pcOf(z21c).sessionVersion || {}; const v21c = ver2(z21c.o('P7-C4L'));
    check('Z21-c', 'R03-f (R03-e\'den değişti: F2/F3 metinleri) T2 uçtan uca (guard KUSUR taklidi): açıkken sürüm +1 ("Şifre Değiştir" taklidi; isActive değişmez) + kapatma ucu 403 (P7-C1 FAIL, P7-C2 FAIL: hesap AKTİF) → 200 "ÜRÜN BULGUSU ADAYI (T2) — eski oturum sürüm reddine rağmen erişti (oturumun verildiği sürüm b, HTTP öncesi DB sürümü b+1, sonrası b+1 …)" + "· DB: HTTP öncesi … → sonrası …" + "· kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm b→b+1)" ("hâlâ" / "SAYILMADI" YOK); productFinding "… Recover düzeltemez" (açık-erişim metni İÇERMEZ); sessionVersion ADAY/T2 kaynak claim; acikErisim AYRI "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (…)"; kurtarma nedeninde AYRI oturum satırı + portal satırı (ölçülen kapatma metni + aynı Recover metni; "(Recover kapatabilir)" YOK); kanıtta issuedVersion kaynak=claim fark=false; DB\'de hesap açık, sürüm b+1; çıkış 6',
      adayE2E(z21c, 'T2', /^ÜRÜN BULGUSU ADAYI \(T2\): eski portal oturumu sürüm reddine rağmen mesaj ucuna erişti \(oturumun verildiği sürüm (\d+), HTTP öncesi DB sürümü (\d+), sonrası \2 — ürün yazıcıları yalnız artırdığından/,
        /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(.* · DB: HTTP öncesi isActive=true hasPortalAccess=true sürüm=(\d+) → sonrası isActive=true hasPortalAccess=true sürüm=\1 · kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm \d+→\1\)$/)
        && sv21c.httpOncesi === sv21c.verilen + 1 && sv21c.olcumSonrasi === sv21c.verilen + 1 && sv21c.verilenKaynak === 'claim' && !!v21c && v21c[0] === sv21c.verilen && v21c[1] === sv21c.verilen + 1 && z21c.v('P7-C1') === 'FAIL' && z21c.v('P7-C2') === 'FAIL'
        && acikAktif(z21c, RC_REJ(403))
        && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm \d+→\d+\): açık erişim kapatılmalıdır; /.test(openLineOf(z21c)) && openLineOf(z21c).includes(`: açık erişim kapatılmalıdır; ${RC_REJ(403)}; `) && !/Recover kapatabilir/.test(openLineOf(z21c))
        && (z21c.ev.issuedVersion || {}).kaynak === 'claim' && z21c.ev.issuedVersion.fark === false && z21c.ev.issuedVersion.esas === sv21c.verilen && !!z21c.pu && z21c.pu.isActive === true && z21c.pu.tokenVersion === sv21c.verilen + 1,
      sumE(z21c));
    const z21d = await runScenario('z21d-t2-pwchange-forbidden-normal', dir, { pwChange: 'onDisable', disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    check('Z21-d', 'R03-f (R03-e\'den değişti: F2/F3 metinleri) T2 ikizi (guard NORMAL): aynı varyant → eski oturum sürüm farkıyla REDDEDİLİR → P7-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı ölçülen kapatma metni "kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (…)" + "açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (…)"; acikErisim aynı Recover metniyle; "(Recover kapatabilir)" YOK; çıkış 6',
      normalE2E(z21d) && openLineOf(z21d).includes(`): açık erişim kapatılmalıdır; ${RC_REJ(403)}`) && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm \d+→\d+\): /.test(openLineOf(z21d)) && !/AYRI satırdadır|Recover kapatabilir/.test(openLineOf(z21d)) && acikAktif(z21d, RC_REJ(403)),
      sumE(z21d));
    // T1 — kapatma çağrısı 2xx ama portal kullanıcı SATIRI silindi (ürün dışı) → guard satır yokken reddetmeliydi → ADAY; metin "sürüm null" DEMEZ
    const z21e = await runScenario('z21e-t1-row-deleted-stale', dir, { guard: 'stale', rowDelete: 'onDisable' }, {}, { onDisplay: fullPhone });
    check('Z21-e', 'R03-e T1 uçtan uca (guard KUSUR taklidi): kapatma çağrısı 201 ama portal kullanıcı satırı silindi (sahte API rowDelete; ürün dışı) → P7-C1 PASS, P7-C2 FAIL; 200 "ÜRÜN BULGUSU ADAYI (T1) — eski oturum hesap satırı yokken erişti (hesap satırı HTTP ölçümlerinden ÖNCE DB\'de YOK — guard satır yokken reddeder …)" + "· DB: HTTP öncesi hesap satırı DB\'de YOK (hasPortalAccess=false) → sonrası hesap satırı DB\'de YOK (hasPortalAccess=false) · kapatma: kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB\'de YOK (hasPortalAccess=false)"; "sürüm null" / "null→" YOK; acikErisim YOK (açık erişim yok); portal satırında "(Recover kapatabilir)" YOK; DB\'de satır yok; çıkış 6',
      adayE2E(z21e, 'T1', /^ÜRÜN BULGUSU ADAYI \(T1\): eski portal oturumu hesap satırı yokken mesaj ucuna erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder/,
        /· DB: HTTP öncesi hesap satırı DB'de YOK \(hasPortalAccess=false\) → sonrası hesap satırı DB'de YOK \(hasPortalAccess=false\) · kapatma: kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK \(hasPortalAccess=false\)$/)
        && ['P7-C4L', 'P7-C4D'].every((id) => !/sürüm=null|sürüm null|null→/.test(z21e.o(id))) && z21e.v('P7-C1') === 'PASS' && z21e.v('P7-C2') === 'FAIL' && pcOf(z21e).acikErisim === null
        && /— kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK \(hasPortalAccess=false\)/.test(openLineOf(z21e)) && !nedenOf(z21e).some((n) => /Recover kapatabilir/.test(n)) && z21e.pu === null,
      sumE(z21e));
    const z21f = await runScenario('z21f-t1-row-deleted-normal', dir, { rowDelete: 'onDisable' }, {}, { onDisplay: fullPhone });
    check('Z21-f', 'R03-e T1 ikizi (guard NORMAL): satır silinmiş → eski oturum REDDEDİLİR → P7-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB\'de YOK"; acikErisim null (açık erişim yok); DB\'de satır yok; çıkış 6',
      normalE2E(z21f) && /— kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK/.test(openLineOf(z21f)) && pcOf(z21f).acikErisim === null && z21f.pu === null, sumE(z21f));
    // T3 — ürün dışı kapatma: kapatma çağrısı 2xx ama yalnız isActive=false (sürüm ARTMADI, hasPortalAccess açık kaldı) → guard pasif hesabı reddetmeliydi → ADAY
    const z21g = await runScenario('z21g-t3-passive-nobump-stale', dir, { guard: 'stale', disable: 'passiveOnly' }, {}, { onDisplay: fullPhone });
    // R03-f (F3): pasif hesap + açık müvekkil bayrağı — "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)"; "portal hesabı açık" YOK
    const PASIF_KT = 'portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık';
    const acikPasif = (z, rec) => { const t = pcOf(z).acikErisim || ''; return t.startsWith(`${PASIF_KT} (HTTP ölçümlerinden sonra isActive=false hasPortalAccess=true sürüm=`) && t.endsWith(`) — kapatılmalıdır; ${rec}`) && !/portal hesabı açık|Recover kapatabilir|AKTİF/.test(t); };
    const pasifLine = (z, rec) => { const l = openLineOf(z); return new RegExp(`— kapatma çağrısı 2xx döndü ama DB'de ${PASIF_KT} \\(isActive=false hasPortalAccess=true sürüm (\\d+)→\\1\\): müvekkil erişim bayrağı kapatılmalıdır \\(hesap pasif\\); `).test(l) && l.includes(`(hesap pasif); ${rec}`) && !/portal hesabı açık|Recover kapatabilir|kapanış TAMAMLANMADI \(isActive/.test(l); };
    check('Z21-g', 'R03-f (R03-e\'den değişti: F2/F3 metinleri) T3 uçtan uca (guard KUSUR taklidi): kapatma çağrısı 201 ama yalnız isActive=false (sürüm ARTMADI, hasPortalAccess=true; ürün dışı kapatma) → P7-C1 PASS ("kapatma çağrısı 2xx döndü" — "kapatıldı" DEĞİL), P7-C2 FAIL, P7-C2V FAIL; 200 "ÜRÜN BULGUSU ADAYI (T3) — eski oturum pasif hesap reddine rağmen erişti" + "· kapatma: kapatma çağrısı 2xx döndü ama DB\'de portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (isActive=false hasPortalAccess=true sürüm b→b)" ("kapatma YAPILMADI" YOK: 2xx vardı); acikErisim "portal kapanışı TAMAMLANMADI: … (HTTP ölçümlerinden sonra isActive=false hasPortalAccess=true sürüm=b) — kapatılmalıdır; Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)"; portal satırı aynı ölçülen metin + "müvekkil erişim bayrağı kapatılmalıdır (hesap pasif); Recover kapatmayı yeniden dener (…)"; "portal hesabı açık" / "(Recover kapatabilir)" YOK; çıkış 6',
      adayE2E(z21g, 'T3', /^ÜRÜN BULGUSU ADAYI \(T3\): eski portal oturumu pasif hesap reddine rağmen mesaj ucuna erişti/,
        new RegExp(`· kapatma: kapatma çağrısı 2xx döndü ama DB'de ${PASIF_KT} \\(isActive=false hasPortalAccess=true sürüm (\\d+)→\\1\\)$`))
        && z21g.v('P7-C1') === 'PASS' && z21g.v('P7-C2') === 'FAIL' && z21g.v('P7-C2V') === 'FAIL' && acikPasif(z21g, RC_GEN) && pasifLine(z21g, RC_GEN) && ![openLineOf(z21g), z21g.o('P7-C4L')].some((t) => /kapatma YAPILMADI/.test(t)),
      sumE(z21g));
    const z21h = await runScenario('z21h-t3-passive-nobump-normal', dir, { disable: 'passiveOnly' }, {}, { onDisplay: fullPhone });
    check('Z21-h', 'R03-f (R03-e\'den değişti: F2/F3 metinleri) T3 ikizi (guard NORMAL): pasif hesap → eski oturum REDDEDİLİR → P7-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "kapatma çağrısı 2xx döndü ama DB\'de portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)" + "müvekkil erişim bayrağı kapatılmalıdır (hesap pasif); Recover kapatmayı yeniden dener (…)"; acikErisim AYRI ("portal kapanışı TAMAMLANMADI: … — kapatılmalıdır; Recover kapatmayı yeniden dener (…)"); "portal hesabı açık" / "(Recover kapatabilir)" YOK; çıkış 6',
      normalE2E(z21h) && pasifLine(z21h, RC_GEN) && acikPasif(z21h, RC_GEN), sumE(z21h));
    // R03-f (F4): DEĞİŞTİ — ürün dışı yeniden açma (sürüm DEĞİŞMEDEN isActive=true) kapatmanın (+1) ARDINDAN: a = c = b+1 ≠ b → TI DEĞİL, T2 ADAY (sürüm iki uçta
    // verilme sürümünden farklı; ölçülen ürün dışı yazım sürüme dokunmadı). R03-e bunu TI AYRISTIRILAMADI yazıyordu (ADAY'ı bastırıyordu).
    const z21i = await runScenario('z21i-ti-reopen-nobump-stale', dir, { guard: 'stale', reopen: 'afterDisableNoBump' }, {}, { onDisplay: fullPhone });
    const sv21i = pcOf(z21i).sessionVersion || {};
    check('Z21-i', 'R03-f (R03-e\'den değişti; F4) uçtan uca (guard KUSUR taklidi): kapatma 201 (P7-C2 PASS; sürüm b → b+1) sonra HTTP ölçümleri sırasında sürüm DEĞİŞMEDEN yeniden açma (sahte API afterDisableNoBump; ürün dışı) → P7-C5 FAIL; a = c = b+1 ≠ b → 200 "ÜRÜN BULGUSU ADAYI (T2) — eski oturum sürüm reddine rağmen erişti (oturumun verildiği sürüm b, HTTP öncesi ve sonrası DB sürümü b+1 — sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım (isActive false→true, sürüm artmadan) sürüme dokunmadı (aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır) …)"; sessionVersion ADAY/T2 (httpOncesi = olcumSonrasi = verilen + 1); productFinding "… Recover düzeltemez"; AYRI aday satırı + portal satırı "hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL …): açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (…); … AYRI satırdadır (ÜRÜN BULGUSU ADAYI)"; "TI" / "AYRIŞTIRILAMADI" / "SAYILMADI" / "(Recover kapatabilir)" YOK; acikErisim "portal hesabı AKTİF (…)"; çıkış 6',
      adayE2E(z21i, 'T2', /^ÜRÜN BULGUSU ADAYI \(T2\): eski portal oturumu sürüm reddine rağmen mesaj ucuna erişti \(oturumun verildiği sürüm \d+, HTTP öncesi ve sonrası DB sürümü \d+ — sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım \(isActive false→true, sürüm artmadan\) sürüme dokunmadı \(aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır\)/,
        /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm \d+, HTTP öncesi ve sonrası DB sürümü \d+ — sürüm iki uçta verilme sürümünden farklı;.* · DB: HTTP öncesi isActive=false hasPortalAccess=false sürüm=(\d+) → sonrası isActive=true hasPortalAccess=true sürüm=\1$/)
        && z21i.v('P7-C2') === 'PASS' && z21i.v('P7-C5') === 'FAIL' && Number.isInteger(sv21i.verilen) && sv21i.httpOncesi === sv21i.verilen + 1 && sv21i.olcumSonrasi === sv21i.httpOncesi
        && openLineOf(z21i).includes(`hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}; koşucu oturumunun erişmesi AYRI satırdadır (ÜRÜN BULGUSU ADAYI)`)
        && ![...nedenOf(z21i), z21i.o('P7-C4L'), z21i.o('P7-C4D'), z21i.o('P7-D9')].some((t) => /AYRIŞTIRILAMADI|\(TI|SAYILMADI|ürün bulgusu değil|Recover kapatabilir/.test(t)) && acikAktif(z21i, RC_GEN),
      sumE(z21i));
    const z21j = await runScenario('z21j-ti-reopen-nobump-normal', dir, { reopen: 'afterDisableNoBump' }, {}, { onDisplay: fullPhone });
    check('Z21-j', 'R03-f (R03-e\'den değişti: F2/F3 metinleri) Z21-i ikizi (guard NORMAL): yeniden açılan hesapta sürüm verilme sürümünden büyük (kapatma +1) → eski oturum REDDEDİLİR → P7-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "yeniden AÇILDI …: açık erişim kapatılmalıdır; Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)"; acikErisim AYRI "portal hesabı AKTİF (…)"; "(Recover kapatabilir)" YOK; çıkış 6',
      normalE2E(z21j) && openLineOf(z21j).includes(`yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}`) && !/Recover kapatabilir/.test(openLineOf(z21j)) && acikAktif(z21j, RC_GEN), sumE(z21j));
    // claim ≠ s1 — token imzalanmadan önce sürüm +1 (sahte API login bumpBeforeSign): kanıtta ikisi de, esas claim; makbuz verilme sürümü = claim; normal akış çıkış 0
    const z21k = await runScenario('z21k-claim-differs-from-s1', dir, { login: 'bumpBeforeSign' }, {}, { onDisplay: fullPhone });
    const iv21k = (z21k.ev || {}).issuedVersion || {}; const evTxt21k = z21k.ev ? JSON.stringify(z21k.ev) : '';
    check('Z21-k', 'R03-e claim ≠ s1 (sahte API login bumpBeforeSign: token imzalanmadan önce sürüm +1): normal akış çıkış 0; kanıtta issuedVersion {kaynak=claim, claim = s1 + 1, esas = claim, fark=true} (İKİSİ de yazılır, claim esas); makbuzda portalIssuedTokenVersion = claim + kaynak "claim"; P7-C2V referansı claim ("oturumların verildiği sürüm=claim → şimdiki=claim+1"); kanıt JSON\'unda portal token YOK ("pfake." yok)',
      z21k.code === 0 && iv21k.kaynak === 'claim' && Number.isInteger(iv21k.s1) && iv21k.claim === iv21k.s1 + 1 && iv21k.esas === iv21k.claim && iv21k.fark === true && !!z21k.rc && z21k.rc.portalIssuedTokenVersion === iv21k.claim && z21k.rc.portalIssuedTokenVersionKaynak === 'claim'
        && z21k.v('P7-C2V') === 'PASS' && z21k.o('P7-C2V') === `oturumların verildiği sürüm=${iv21k.claim} → şimdiki=${iv21k.claim + 1}` && !!evTxt21k && !evTxt21k.includes('pfake.'),
      `çıkış=${z21k.code} · issuedVersion=${JSON.stringify(iv21k)} · makbuz=${z21k.rc ? `${z21k.rc.portalIssuedTokenVersion}/${z21k.rc.portalIssuedTokenVersionKaynak}` : '-'} · C2V=${z21k.o('P7-C2V')}`);
    // claim okunamaz (iki parçalı opaque token) → verilme sürümü s1 (P7-C2V referansı). R03-g (G3): DEĞİŞTİ — sınıf artık TJ (R03-e/f: T2). Gerekçe: sahte API'nin
    // opaque token'ı ürün davranışı DEĞİLDİR (ürün token'ı jwtService.sign ile JWT — portal.service.ts:438-446); ürün guard'ı JWT olmayan token'ı verifyAsync'te
    // (portal-auth.guard.ts:36) DB'den önce reddeder → 200'ün sınıfı sürümden bağımsızdır (sürüm sınıflaması bu token'da anlamsız). Guard KUSUR taklidi ile koşulur.
    const z21l = await runScenario('z21l-claim-unreadable-s1', dir, { guard: 'stale', pwChange: 'onDisable', disable: 'forbidden', portalToken: 'opaque' }, {}, { onDisplay: fullPhone });
    const iv21l = (z21l.ev || {}).issuedVersion || {}; const sv21l = pcOf(z21l).sessionVersion || {};
    check('Z21-l', 'R03-g (R03-e\'den değişti; G3) claim OKUNAMAZ (sahte API portalToken opaque: iki parçalı token; guard KUSUR taklidi; açıkken sürüm +1 + kapatma 403) → verilme sürümü yine s1 (kanıtta kaynak=s1, claimDurum=OKUNAMADI, claim=null; makbuzda kaynak "s1"); sınıf artık ADAY/TJ (R03-e/f: T2 — sahte API opaque token ürün davranışı değildir, ürün guard\'ı JWT olmayan token\'ı :36\'da DB\'den önce reddeder) — sessionVersion.verilenKaynak=s1, verilen=s1; productFinding "ÜRÜN BULGUSU ADAYI (TJ): …"; "(T2)" YOK; çıkış 6',
      z21l.code === 6 && iv21l.kaynak === 's1' && iv21l.claimDurum === 'OKUNAMADI' && iv21l.claim === null && Number.isInteger(iv21l.esas) && iv21l.esas === iv21l.s1 && sv21l.sinif === 'ADAY' && sv21l.hucre === 'TJ' && sv21l.verilenKaynak === 's1' && sv21l.verilen === iv21l.s1
        && /^ÜRÜN BULGUSU ADAYI \(TJ\): /.test((z21l.ev || {}).productFinding || '') && ![z21l.o('P7-C4L'), z21l.o('P7-C4D'), z21l.o('P7-D9')].some((t) => /\(T2\)/.test(t)) && !!z21l.rc && z21l.rc.portalIssuedTokenVersionKaynak === 's1',
      `çıkış=${z21l.code} · issuedVersion=${JSON.stringify(iv21l)} · sınıf=${JSON.stringify(sv21l)} · bulgu=${String((z21l.ev || {}).productFinding || '').slice(0, 120)}`);
    // ==== R03-d (m7 + m6 + BOM) — BAYAT makbuz önerilmez; makbuzDiskte klasörde false; BOM'lu makbuz KULLANILABILIR
    const aStale7 = raf ? raf(Object.assign(halfOut(okP7), { receipt: Object.assign({}, memR7, { runnerMessageIds: ['m1'] }), receiptWriteError: 'EACCES: izin yok', setup: { durum: 'TAMAM' } }), okP7, 'run', path.join(r18, 'kanit.json')) : {};
    const bomP7 = path.join(r18, 'bom.json'); fs.writeFileSync(bomP7, '\uFEFF' + JSON.stringify(memR7, null, 1), 'utf8'); const stBom7 = rfs ? rfs(bomP7, memR7) : {};
    const gBom7 = typeof EX0.readReceiptForRecover === 'function' ? EX0.readReceiptForRecover(bomP7) : {};
    check('Z20-d', 'R03-d (m7) + R04-b: diskteki makbuz BAYAT (bellekteki son makbuzla eşit değil: runnerMessageIds eklenmiş, yazma hatası EACCES) → Run adımı diskteki dosyayı ÖNERMEZ ("-ReceiptFile <makbuz>" YOK); R04-b: adım bloğun seçeneğini SOMUT kanıt diziniyle gösterir (`-Mode Recover -RunEvidenceDir \'<kanıt dizini>\'`; elle komut / "…-setup-receipt-kanittan.json" yolu YOK) ve BAYAT durumu yalnız bilgi olarak yazar: "durumu: BAYAT (diskteki makbuz koşucunun bellekteki son makbuzuyla EŞİT DEĞİL — farklı alan(lar): runnerMessageIds; makbuzun sonraki bir yazımı başarısız · makbuz yazma hatası: EACCES: izin yok; sonradan eklenen kimlikleri içermeyebilir → bu dosyayla Recover eksik kapanış yapabilir)"; makbuzGuncel=false · (m6) makbuz yolu KLASÖR → makbuzDiskte=false (önceki existsSync true) · BOM\'lu makbuz → receiptFileState KULLANILABILIR (güncel) ve readReceiptForRecover ok',
      noCmd7(aStale7) && rgOpt7(aStale7, psq7(r18))
        && durumOf7(aStale7) === 'BAYAT (diskteki makbuz koşucunun bellekteki son makbuzuyla EŞİT DEĞİL — farklı alan(lar): runnerMessageIds; makbuzun sonraki bir yazımı başarısız · makbuz yazma hatası: EACCES: izin yok; sonradan eklenen kimlikleri içermeyebilir → bu dosyayla Recover eksik kapanış yapabilir)'
        && aStale7.makbuzGuncel === false && aStale7.makbuzDurumu === 'KULLANILABILIR'
        && u5d.makbuzDiskte === false && fs.statSync(dirP7).isDirectory() && u5.makbuzDiskte === false
        && stBom7.durum === 'KULLANILABILIR' && stBom7.guncel === true && gBom7.ok === true,
      `bayat=${String(aStale7.adim || '').slice(0, 300)} · klasör makbuzDiskte=${u5d.makbuzDiskte} · BOM durum=${stBom7.durum}/${stBom7.guncel} okuma=${gBom7.ok}`);
    // ==== R03-f (F5): token claim'i GEÇERSİZ (sahte API portalToken badClaim: tokenVersion=-1) + kapatma ucu 403 (hesap AKTİF kalır, sürüm değişmez; B tutmaz).
    //      R03-e'de claim geçersizken verilme sürümü bilinmiyor → T0 AYRISTIRILAMADI yazılıyordu; ürün guard'ı bu oturumu her istekte DB'den ÖNCE reddeder
    //      (portal-auth.guard.ts:42-45) → 200 ADAY (TG). Guard normal ikizi: sahte API artık ürün gibi claim'i doğrular → 401 (dış zincir kapısı da 401 → akış durur).
    const z22a = await runScenario('z22a-tg-badclaim-stale', dir, { guard: 'stale', portalToken: 'badClaim', disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    const iv22a = (z22a.ev || {}).issuedVersion || {}; const sv22a = pcOf(z22a).sessionVersion || {};
    check('Z22-a', 'R03-f YENİ (F5) uçtan uca (guard KUSUR taklidi): token claim\'i GEÇERSİZ (tokenVersion=-1) + kapatma ucu 403 (P7-C2 FAIL, hesap AKTİF, sürüm aynı) → kanıtta issuedVersion {claimDurum=GECERSIZ, esas=null, kaynak "yok (claim geçersiz)"}, makbuzda verilme sürümü null; 200 → "ÜRÜN BULGUSU ADAYI (TG) — eski oturum geçersiz sürüm claim\'ine rağmen erişti (… guard her isteği reddeder (portal-auth.guard.ts:42-45 …)) · DB: … · kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (…)"; productFinding "ÜRÜN BULGUSU ADAYI (TG): … mesaj ucuna … Recover düzeltemez"; sessionVersion ADAY/TG (verilen=null); "T0" / "AYRIŞTIRILAMADI" HİÇBİR yerde YOK (R03-e: T0); acikErisim "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (…)"; çıkış 6',
      adayE2E(z22a, 'TG', /^ÜRÜN BULGUSU ADAYI \(TG\): eski portal oturumu geçersiz sürüm claim'ine rağmen mesaj ucuna erişti \(oturumun token'ındaki tokenVersion claim'i tam sayı ≥ 0 değil — guard her isteği reddeder \(portal-auth\.guard\.ts:42-45; DB okumasından önce/,
        /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TG\) — eski oturum geçersiz sürüm claim'ine rağmen erişti \(oturumun token'ındaki tokenVersion claim'i tam sayı ≥ 0 değil — guard her isteği reddeder \(portal-auth\.guard\.ts:42-45.* · DB: HTTP öncesi isActive=true hasPortalAccess=true sürüm=(\d+) → sonrası isActive=true hasPortalAccess=true sürüm=\1 · kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm \1→\1\)$/)
        && iv22a.claimDurum === 'GECERSIZ' && iv22a.esas === null && iv22a.kaynak === 'yok (claim geçersiz)' && sv22a.verilen === null && !!z22a.rc && z22a.rc.portalIssuedTokenVersion === null
        && z22a.v('P7-C2') === 'FAIL' && acikAktif(z22a, RC_REJ(403)) && ![...nedenOf(z22a), z22a.o('P7-C4L'), z22a.o('P7-C4D'), z22a.o('P7-D9')].some((t) => /AYRIŞTIRILAMADI|\(T0/.test(t)) && !!z22a.pu && z22a.pu.isActive === true,
      `issuedVersion=${JSON.stringify(iv22a)} · ${sumE(z22a)}`);
    const z22b = await runScenario('z22b-tg-badclaim-normal', dir, { portalToken: 'badClaim', disable: 'forbidden' }, {}, shouldNot);
    const iv22b = (z22b.ev || {}).issuedVersion || {};
    check('Z22-b', 'R03-f YENİ (F5) Z22-a ikizi (guard NORMAL — sahte API ürün guard\'ı gibi geçersiz claim\'i DB\'ye bakmadan reddeder): koşucunun portal girişi 201 ama dosya listesi DIŞ 401 → dış zincir kapısı PASS değil, mesaj akışı ve gösterim YOK; kapanışta mevcut oturum yerel + dış 401 → P7-C4L/D PASS ("HTTP 401"); productFinding / sessionVersion / oturum satırı YOK; issuedVersion claimDurum=GECERSIZ; kapatma 403 → hesap AKTİF kaldı: acikErisim "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (…)" ("(Recover kapatabilir)" YOK); çıkış 6',
      normalE2E(z22b) && z22b.ev.displayed === false && z22b.phone.length === 0 && iv22b.claimDurum === 'GECERSIZ' && acikAktif(z22b, RC_REJ(403)),
      `gösterim=${(z22b.ev || {}).displayed} · issuedVersion=${JSON.stringify(iv22b)} · ${sumE(z22b)}`);
    // ==== R03-g (G3): token JWT olarak OKUNAMADI (sahte API portalToken opaque) + kapatma ucu 403 (hesap AKTİF kalır, sürüm değişmez → a = b = c, iki uç aktif).
    //      R03-f'de verilme sürümü s1'e düşüyor ve sınıf T5 "ürün bulgusu değil" oluyordu; ürün guard'ı JWT olmayan token'ı verifyAsync'te DB'den ÖNCE reddeder
    //      (portal-auth.guard.ts:36) → 200 ADAY (TJ). Guard normal ikizi: sahte API artık ürün gibi JWT olmayan token'ı reddeder → 401 (dış zincir kapısı da 401).
    const z23a = await runScenario('z23a-tj-opaque-stale', dir, { guard: 'stale', portalToken: 'opaque', disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    const iv23a = (z23a.ev || {}).issuedVersion || {}; const sv23a = pcOf(z23a).sessionVersion || {};
    check('Z23-a', 'R03-g YENİ (G3) uçtan uca (guard KUSUR taklidi): token JWT olarak OKUNAMADI (sahte API portalToken opaque — ürün davranışı değil) + kapatma ucu 403 (P7-C2 FAIL; hesap AKTİF, sürüm aynı → a = b = c, iki uç aktif — R03-f: T5 "ürün bulgusu değil") → kanıtta issuedVersion {claimDurum=OKUNAMADI, kaynak=s1, esas=s1}; 200 → "ÜRÜN BULGUSU ADAYI (TJ) — eski oturum JWT olarak okunamayan token\'a rağmen erişti (token JWT olarak okunamadı (üç parçalı JWT değil ya da payload JSON nesnesi değil) — ürün guard\'ı bu token\'ı DB\'den önce reddeder (portal-auth.guard.ts:36 verifyAsync; …)) · DB: … · kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (…)"; productFinding "ÜRÜN BULGUSU ADAYI (TJ): … mesaj ucuna … Recover düzeltemez"; sessionVersion ADAY/TJ (verilen = httpOncesi = olcumSonrasi = s1, kaynak s1); "(T5" / "SAYILMADI" / "ürün bulgusu değil" HİÇBİR yerde YOK; acikErisim "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi …"; DB\'de hesap AKTİF; çıkış 6',
      adayE2E(z23a, 'TJ', /^ÜRÜN BULGUSU ADAYI \(TJ\): eski portal oturumu JWT olarak okunamayan token'a rağmen mesaj ucuna erişti \(token JWT olarak okunamadı \(üç parçalı JWT değil ya da payload JSON nesnesi değil\) — ürün guard'ı bu token'ı DB'den önce reddeder \(portal-auth\.guard\.ts:36 verifyAsync/,
        /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(TJ\) — eski oturum JWT olarak okunamayan token'a rağmen erişti \(token JWT olarak okunamadı .* · DB: HTTP öncesi isActive=true hasPortalAccess=true sürüm=(\d+) → sonrası isActive=true hasPortalAccess=true sürüm=\1 · kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de portal hesabı AKTİF \(isActive=true hasPortalAccess=true sürüm \1→\1\)$/)
        && iv23a.claimDurum === 'OKUNAMADI' && iv23a.kaynak === 's1' && Number.isInteger(iv23a.esas) && sv23a.verilen === iv23a.esas && sv23a.verilenKaynak === 's1' && sv23a.httpOncesi === sv23a.verilen && sv23a.olcumSonrasi === sv23a.verilen
        && z23a.v('P7-C2') === 'FAIL' && acikAktif(z23a, RC_REJ(403)) && ![...nedenOf(z23a), z23a.o('P7-C4L'), z23a.o('P7-C4D'), z23a.o('P7-D9')].some((t) => /\(T5|SAYILMADI|ürün bulgusu değil/.test(t)) && !!z23a.pu && z23a.pu.isActive === true,
      `issuedVersion=${JSON.stringify(iv23a)} · ${sumE(z23a)}`);
    const z23b = await runScenario('z23b-tj-opaque-normal', dir, { portalToken: 'opaque', disable: 'forbidden' }, {}, shouldNot);
    const iv23b = (z23b.ev || {}).issuedVersion || {};
    check('Z23-b', 'R03-g YENİ (G3) Z23-a ikizi (guard NORMAL — sahte API artık ürün guard\'ı gibi JWT olmayan token\'ı DB\'ye bakmadan reddeder, portal-auth.guard.ts:36; R03-f sahte API\'si opaque token\'ı kabul ediyordu — ürün davranışı değildi): koşucunun portal girişi 201 (P7-03L PASS) ama dosya listesi DIŞ 401 → P7-04D FAIL ("HTTP 401 …"), mesaj akışı ve gösterim YOK; kapanışta mevcut oturum yerel + dış 401 → P7-C4L/D PASS ("HTTP 401"); productFinding / sessionVersion / oturum satırı YOK; issuedVersion claimDurum=OKUNAMADI; kapatma 403 → hesap AKTİF: acikErisim "portal hesabı AKTİF (…) — açık erişim kapatılmalıdır; Recover aynı personel kimliğiyle … HTTP 403 ile reddedildi …"; çıkış 6',
      normalE2E(z23b) && z23b.v('P7-03L') === 'PASS' && z23b.v('P7-04D') === 'FAIL' && /^HTTP 401\b/.test(z23b.o('P7-04D')) && z23b.ev.displayed === false && z23b.phone.length === 0 && iv23b.claimDurum === 'OKUNAMADI' && acikAktif(z23b, RC_REJ(403)),
      `P7-03L=${z23b.v('P7-03L')} P7-04D=${z23b.v('P7-04D')} (${z23b.o('P7-04D')}) · gösterim=${(z23b.ev || {}).displayed} telefon=${z23b.phone.length} · issuedVersion=${JSON.stringify(iv23b)} · ${sumE(z23b)}`);
    // Z1 normal koşumunun (portal kapandı) ardından TEK Recover: hesap zaten kapalı → kapatma çağrısı yapılmaz → P7-C1 dayanağı "hesap zaten kapalıydı" (F1, Z22-c)
    const r22z = await recover(z1, dir, 'z22c-recover-already-closed', {});
    // ==== R03-f (F1) — P7-C1 açıklaması ölçülene indi: bu öz-testin TÜM Run/Recover günlüklerinde P7-C1 satırı "kapatıldı" DEMEZ; hesap varken açıklama C1_DESC
    //      (2xx · zaten kapalı · 2xx yok ama DB kapalı — DB kapanışı P7-C2 / P7-C5 satırlarında); gözlemde hangi dayanağın tuttuğu (`dayanak=`).
    const C1D = EX0.C1_DESC || '';
    let c1Lines = 0; let c1Desc = 0; let c1Absent = 0; const c1Bad = [];
    for (const f of new Set(artifacts)) {
      if (!/\.log$/.test(f) || !fs.existsSync(f)) continue;
      for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        if (!/^\s+(OK|FAIL|\?\?\?\?)\s+P7-C1\s/.test(l)) continue; c1Lines++;
        if (/kapatıldı/.test(l)) c1Bad.push(`${path.basename(f)}: ${l.trim().slice(0, 90)}`);
        if (C1D && l.includes(C1D)) c1Desc++; else if (/portal hesabı YOK \(DB'de ölçüldü\) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI/.test(l)) c1Absent++; else c1Bad.push(`${path.basename(f)}: tanınmayan açıklama ${l.trim().slice(0, 90)}`);
      }
    }
    check('Z22-c', 'R03-f YENİ (F1): bu öz-testin TÜM Run/Recover günlüklerinde P7-C1 satırı (OK / FAIL / ????) "kapatıldı" DEMEZ (≥ 25 satır); hesap varken açıklama "kapatma çağrısı yetkili uçta 2xx döndü (admin/disable-user) ya da hesap zaten kapalıydı ya da 2xx olmadan kapatma adımından sonra DB\'de kapalı görüldü — DB kapanışı P7-C2 / P7-C5 satırlarında", hesap yokken "portal hesabı YOK (DB\'de ölçüldü) …" (başka açıklama YOK); gözlemde dayanak: Z21-g (2xx ama DB\'de pasif + bayrak açık; P7-C2 FAIL) P7-C1 PASS "dayanak=2xx kapatma çağrısı" · Z16-b (403) P7-C1 FAIL "dayanak=YOK (2xx yok, DB\'de kapalı değil)" · Z1 sonrası Recover (hesap zaten kapalı) P7-C1 PASS "dayanak=hesap zaten kapalıydı (çağrı yapılmadı)", disable-user çağrısı YOK',
      !!C1D && c1Lines >= 25 && c1Bad.length === 0 && c1Desc >= 20 && c1Absent >= 1 && !/kapatıldı/.test(C1D)
        && z21g.v('P7-C1') === 'PASS' && /· dayanak=2xx kapatma çağrısı$/.test(z21g.o('P7-C1')) && z21g.v('P7-C2') === 'FAIL'
        && z16b.v('P7-C1') === 'FAIL' && /· dayanak=YOK \(2xx yok, DB'de kapalı değil\)$/.test(z16b.o('P7-C1')) && r22z.v('P7-C1') === 'PASS' && /· dayanak=hesap zaten kapalıydı \(çağrı yapılmadı\)$/.test(r22z.o('P7-C1'))
        && !r22z.calls.some((c) => c.path === '/api/portal/admin/disable-user'),
      `P7-C1 satırı=${c1Lines} (açıklama C1_DESC=${c1Desc} · hesap yok=${c1Absent}) · sorun=${c1Bad.length ? c1Bad.slice(0, 4).join(' | ') : 'yok'} · Z21-g=${z21g.o('P7-C1').slice(-40)} · Z16-b=${z16b.o('P7-C1').slice(-48)} · Z1-R=${r22z.o('P7-C1').slice(-50)} (çıkış ${r22z.code})`);
    // ==== R03-f (F2) — Recover metni `disableCalls`'a bağlı (birim + uçtan uca) ve hiçbir kanıtta "Recover kapatabilir" YOK
    const rct = typeof EX0.recoverCloseText === 'function' ? EX0.recoverCloseText : null;
    const rcU = rct ? [rct(['HTTP 403', 'personel oturumu YENİLENDİ (tek yeniden giriş)', 'HTTP 403']), rct(['HTTP 401', 'personel yeniden girişi başarısız (HTTP 429) — yeniden deneme YAPILMADI']), rct(['HTTP 500', 'HTTP 500']),
      rct(['HTTP 403', 'personel oturumu YENİLENDİ (tek yeniden giriş)', 'belirsiz']), rct([]), rct(['personel oturumu YOK']), rct(['HTTP 403', 'personel oturumu YENİLENDİ (tek yeniden giriş)', 'HTTP 201']), rct(['HTTP 404'])] : [];
    const rcExp = [RC_REJ(403), RC_REJ(401), RC_GEN, RC_GEN, RC_GEN, RC_GEN, RC_GEN, RC_GEN];
    let evS = 0; let evRc = 0; const evBad = [];
    for (const f of new Set(artifacts)) {
      if (!/-evidence\.json$/.test(f) || !fs.existsSync(f)) continue; const t = fs.readFileSync(f, 'utf8'); evS++;
      if (/Recover kapatabilir/.test(t)) evBad.push(`${path.basename(f)}:Recover kapatabilir`);
      if (t.includes(RC_GEN) || t.includes('Recover aynı personel kimliğiyle kapatmayı yeniden dener')) evRc++;
      let e = null; try { e = JSON.parse(t); } catch (x) { e = null; }
      if (e && e.record === 'EXTACC-D7-RECOVER' && (t.includes(RC_GEN) || t.includes('Recover aynı personel kimliğiyle'))) evBad.push(`${path.basename(f)}:Recover kanıtında Run metni`);
    }
    check('Z22-d', 'R03-f YENİ (F2): recoverCloseText (birim) — son kapatma çağrısı 403 (tek yeniden girişten sonra da) → "Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run\'da kapatma HTTP 403 ile reddedildi — Recover\'ın kapatabildiği ÖLÇÜLMEDİ (personel yetkisi düzelmeden Recover da reddedilebilir)" · 401 (yeniden giriş 429) → aynı metin HTTP 401 · 500/500, …→belirsiz, çağrı yok, oturum yok, …→201, 404 → "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)"; uçtan uca acikErisim: Z16-b 403 · Z16-d 401 · Z5 500 → genel · Z21-g 2xx (pasif + bayrak açık) → genel; bu öz-testin TÜM kanıtlarında "Recover kapatabilir" YOK (≥ 25 kanıt; Run metni ≥ 6 kanıtta), Recover kanıtında Run\'a özgü Recover metni YOK',
      !!rct && rcU.every((x, i) => x === rcExp[i]) && pcOf(z16b).acikErisim && pcOf(z16b).acikErisim.endsWith(`; ${RC_REJ(403)}`) && pcOf(z16d).acikErisim && pcOf(z16d).acikErisim.endsWith(`; ${RC_REJ(401)}`)
        && pcOf(z5).acikErisim && pcOf(z5).acikErisim.endsWith(`; ${RC_GEN}`) && pcOf(z21g).acikErisim && pcOf(z21g).acikErisim.endsWith(`; ${RC_GEN}`) && evS >= 25 && evRc >= 6 && evBad.length === 0,
      `birim=${rcU.map((x, i) => (x === rcExp[i] ? 'OK' : `HATA:${String(x).slice(0, 60)}`)).join(',')} · kanıt=${evS} (Recover metni ${evRc}) · sorun=${evBad.length ? evBad.slice(0, 5).join(', ') : 'yok'}`);
    // ==== R03-f (F3) — kısmi durum metinleri: yalnız müvekkil bayrağı yeniden açıldıysa "erişim bayrağı yeniden açıldı (hesap pasif …)" ("yeniden AÇILDI" DEĞİL);
    //      pasif + bayrak açık → "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)"; hiçbir kanıtta "portal hesabı açık" YOK.
    const vC5 = R7([['P7-C2', 'PASS'], ['P7-C5', 'FAIL']]);
    const nF1 = raf ? (raf({ closure: { ok: true }, results: vC5, portalClose: { ok: false, portalDbClosed: false, after: S(true, false, false, 2), afterMeasure: S(true, false, true, 2), disableCalls: ['HTTP 201'] } }, null, 'run').neden || []) : [];
    const nF2 = raf ? (raf({ closure: { ok: true }, results: vC5, portalClose: { ok: false, portalDbClosed: false, after: S(true, false, false, 2), afterMeasure: S(true, true, true, 3), disableCalls: ['HTTP 201'] } }, null, 'run').neden || []) : [];
    const nF3 = raf ? (raf({ closure: { ok: true }, results: R7([['P7-C2', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, after: S(true, false, true, 1), disableCalls: ['HTTP 201'] } }, null, 'run').neden || []) : [];
    const pF1 = nF1.find((n) => /^PORTAL ERİŞİMİ/.test(n)) || ''; const pF2 = nF2.find((n) => /^PORTAL ERİŞİMİ/.test(n)) || ''; const pF3 = nF3.find((n) => /^PORTAL ERİŞİMİ/.test(n)) || '';
    let evH = 0; const evHBad = [];
    for (const f of new Set(artifacts)) { if (!/-evidence\.json$/.test(f) || !fs.existsSync(f)) continue; evH++; const t = fs.readFileSync(f, 'utf8'); if (/portal hesabı açık|DB'ye yansımadı|DB'de AÇIK|kapanış TAMAMLANMADI \(isActive/.test(t)) evHBad.push(path.basename(f)); }
    check('Z22-e', 'R03-f YENİ (F3) kurtarma nedeni (birim): kapatmadan sonra kapalı, HTTP sonrası YALNIZ müvekkil bayrağı açık (isActive=false hasPortalAccess=true) → "erişim bayrağı ölçüm sırasında yeniden açıldı (hesap pasif; P7-C5 FAIL: … isActive=false hasPortalAccess=true): müvekkil erişim bayrağı kapatılmalıdır (hesap pasif); Recover kapatmayı yeniden dener (…)" — "yeniden AÇILDI" / "portal hesabı açık" YOK · HTTP sonrası isActive=true → "hesap ölçüm sırasında yeniden AÇILDI (…): açık erişim kapatılmalıdır; …" · kapatmadan sonra pasif + bayrak açık (kapatma metni yok) → "DB\'de portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (isActive=false hasPortalAccess=true)"; bu öz-testin TÜM kanıtlarında "portal hesabı açık", "DB\'ye yansımadı", "DB\'de AÇIK", eski "kapanış TAMAMLANMADI (isActive…" biçimi YOK',
      !!raf && pF1.includes(`ama erişim bayrağı ölçüm sırasında yeniden açıldı (hesap pasif; P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=false hasPortalAccess=true): müvekkil erişim bayrağı kapatılmalıdır (hesap pasif); ${RC_GEN}`) && !/yeniden AÇILDI|portal hesabı açık/.test(pF1)
        && pF2.includes(`ama hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): açık erişim kapatılmalıdır; ${RC_GEN}`)
        && pF3.includes(`— DB'de ${PASIF_KT} (isActive=false hasPortalAccess=true)`) && !/portal hesabı açık|kapanış TAMAMLANMADI \(isActive|DB'de AÇIK/.test(pF3)
        && evH >= 25 && evHBad.length === 0,
      `bayrak=${pF1.slice(0, 220)} · aktif=${pF2.slice(60, 220)} · pasif=${pF3.slice(0, 200)} · kanıt=${evH} sorunlu=${evHBad.length ? evHBad.slice(0, 5).join(',') : 'yok'}`);
    // ==== R03-g (G1) — Recover modunda açık erişim metni ÖLÇÜLENE bağlı. R03-f'de Recover modu her durumda "açık erişim KAPANMADI (bu Recover kapatamadı; …)"
    //      yazıyordu; Recover kapatmayı 2xx ile yapıp P7-C2 PASS ölçtüyse ve erişim HTTP ölçümleri sırasında dışarıdan yeniden açıldıysa "kapatamadı" kanıtsızdır.
    const roa = typeof EX0.recoverOpenAccessText === 'function' ? EX0.recoverOpenAccessText : null;
    const KAP_DEG = 'açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)';
    const TAIL23 = 'açık erişim KAPANMADI; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı';
    const R_2XX = `Recover kapattı (kapatma çağrısı 2xx, P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — ${TAIL23}`;
    const R_ZATEN = `hesap Recover başında zaten kapalıydı (kapatma çağrısı yapılmadı; P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — ${TAIL23}`;
    const R_NO2XX = `kapatma çağrısı 2xx dönmedi ama kapatma adımından sonra DB'de kapalı ölçüldü (P7-C2 PASS); erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — ${TAIL23}`;
    const sC = S(true, false, false, 3); const sO = S(true, true, true, 2); const sPf = S(true, false, true, 2); const sX = S(false, null, false, null);
    const roaU = roa ? [roa({ disable2xx: true, before: sO, after: sC }), roa({ disable2xx: false, before: sC, after: sC }), roa({ disable2xx: false, before: sO, after: sC }),
      roa({ disable2xx: true, before: sO, after: sPf }), roa({ disable2xx: false, before: sO, after: sO }), roa({ disable2xx: true, before: sO, after: sX }), roa({})] : [];
    const roaExp = [R_2XX, R_ZATEN, R_NO2XX, KAP_DEG, KAP_DEG, KAP_DEG, KAP_DEG];
    const nRe = raf ? (raf({ closure: { ok: true }, results: R7([['P7-C1', 'PASS'], ['P7-C2', 'PASS'], ['P7-C2V', 'PASS'], ['P7-C5', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, disable2xx: true, before: sO, after: sC, afterMeasure: S(true, true, true, 4), disableCalls: ['HTTP 201'] } }, null, 'recover').neden || []) : [];
    const nKd = raf ? (raf({ closure: { ok: true }, results: R7([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL'], ['P7-C2V', 'FAIL'], ['P7-C5', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, disable2xx: false, before: sO, after: sO, afterMeasure: sO, closeText: 'kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm 2→2)', disableCalls: ['HTTP 403'] } }, null, 'recover').neden || []) : [];
    const lRe = nRe.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) || ''; const lKd = nKd.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) || '';
    check('Z23-c', 'R03-g YENİ (G1) birim — recoverOpenAccessText (Recover modu; girdi = kapatma adımından sonraki DB (P7-C2 okuması), kapanış başı, 2xx): kapatma 2xx + sonra kapalı → "Recover kapattı (kapatma çağrısı 2xx, P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — açık erişim KAPANMADI; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı" · hesap baştan kapalı (çağrı yok) → "hesap Recover başında zaten kapalıydı (kapatma çağrısı yapılmadı; P7-C2 PASS) ama …" · 2xx yok ama sonra kapalı → "kapatma çağrısı 2xx dönmedi ama kapatma adımından sonra DB\'de kapalı ölçüldü (P7-C2 PASS); …" · kapatmadan sonra DB kapalı DEĞİL (2xx + pasif/bayrak açık; 403 + açık; 2xx + satır yok; girdi yok) → "açık erişim KAPANMADI (bu Recover kapatamadı; …)" (R03-f metni korunur) · recoveryAdvice(recover): kapatmadan sonra kapalı + HTTP sonrası açık → portal satırı "… ama hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: …): Recover kapattı (…) …" ("kapatamadı" YOK); kapatmadan sonra açık (403) → "…: açık erişim KAPANMADI (bu Recover kapatamadı; …)" ("Recover kapattı" YOK); ikisinde de Run\'a özgü Recover metni ve "Recover kapatabilir" YOK',
      !!roa && !!raf && roaU.every((x, i) => x === roaExp[i]) && lRe.includes(`— kapatmadan sonra DB'de kapalı ölçüldü (P7-C2=PASS) ama hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): ${R_2XX}`) && !/kapatamadı/.test(lRe)
        && lKd.includes(`: ${KAP_DEG}`) && !/Recover kapattı/.test(lKd) && ![lRe, lKd].some((t) => /Recover kapatabilir|Recover kapatmayı yeniden dener|Recover aynı personel kimliğiyle/.test(t)),
      `fonksiyon=${!!roa} · birim=${roaU.map((x, i) => (x === roaExp[i] ? 'OK' : `HATA:${String(x).slice(0, 70)}`)).join(',') || '-'} · yeniden açılan=${lRe.slice(0, 260)} · kapanmayan=${lKd.slice(-160)}`);
    // ==== R03-g (G1) uçtan uca — Z16-b makbuzu (Run: kapatma 403 → hesap AKTİF kaldı) üzerinde iki Recover: (1) kapatma ucu yine 403 → kapatma adımından sonra DB açık
    //      (P7-C2 FAIL) → "bu Recover kapatamadı" KORUNUR; (2) kapatma 201 → P7-C2 PASS; yeni giriş yerel + dış 401; dış giriş yanıtlandıktan SONRA hesap yeniden açılır
    //      (sahte API reopen afterDisable + reopenOn extLogin; sürüm ürün gibi +1) → P7-C5 FAIL → "Recover kapattı (…) ama erişim … yeniden açıldı …"; "kapatamadı" YOK.
    const r23k = await recover(z16b, dir, 'z23d-recover-forbidden', { disable: 'forbidden' });
    const r23r = await recover(z16b, dir, 'z23d-recover-reopen-after-close', { reopen: 'afterDisable', reopenOn: 'extLogin' });
    const pcK = (r23k.ev || {}).portalClose || {}; const pcR = (r23r.ev || {}).portalClose || {};
    const nK = (r23k.ev && r23k.ev.recovery && r23k.ev.recovery.neden) || []; const nRr = (r23r.ev && r23r.ev.recovery && r23r.ev.recovery.neden) || [];
    const lK = nK.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) || ''; const lR = nRr.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) || '';
    check('Z23-d', 'R03-g YENİ (G1) uçtan uca, Z16-b makbuzu üzerinde iki Recover — (1) kapatma ucu 403 (P7-C2 FAIL; hesap AKTİF): acikErisim "portal hesabı AKTİF (HTTP ölçümlerinden sonra …) — açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)" ve portal satırı aynı son ekle ("Recover kapattı" YOK); çıkış 6 · (2) kapatma 201 (P7-C1 PASS dayanak=2xx kapatma çağrısı, P7-C2 PASS), yeni giriş yerel + dış 401 (P7-C3L/D PASS), dış giriş yanıtından SONRA hesap yeniden açıldı (sahte API reopen afterDisable + reopenOn extLogin; sürüm +1) → P7-C5 FAIL; acikErisim "portal hesabı AKTİF (HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=<sonra>) — Recover kapattı (kapatma çağrısı 2xx, P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — açık erişim KAPANMADI; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı"; portal satırı "… kapatmadan sonra DB\'de kapalı ölçüldü (P7-C2=PASS) ama hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: …): Recover kapattı (…) …"; acikErisim ve kurtarma nedeninde "kapatamadı" / "Recover kapatabilir" YOK; çıkış 6',
      r23k.code === 6 && !!r23k.ev && r23k.ev.record === 'EXTACC-D7-RECOVER' && r23k.v('P7-C2') === 'FAIL' && pcK.disable2xx === false && (pcK.disableCalls || []).includes('HTTP 403')
        && /^portal hesabı AKTİF \(HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=\d+\) — açık erişim KAPANMADI \(bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı\)$/.test(pcK.acikErisim || '')
        && lK.includes(`: ${KAP_DEG}`) && !/Recover kapattı/.test(lK) && !!r23k.pu && r23k.pu.isActive === true
        && r23r.code === 6 && !!r23r.ev && r23r.ev.record === 'EXTACC-D7-RECOVER' && r23r.v('P7-C1') === 'PASS' && /· dayanak=2xx kapatma çağrısı$/.test(r23r.o('P7-C1')) && r23r.v('P7-C2') === 'PASS' && r23r.v('P7-C3L') === 'PASS' && r23r.v('P7-C3D') === 'PASS' && r23r.v('P7-C5') === 'FAIL'
        && pcR.disable2xx === true && Number.isInteger((pcR.after || {}).tokenVersion) && (pcR.afterMeasure || {}).tokenVersion === pcR.after.tokenVersion + 1
        && (pcR.acikErisim || '') === `portal hesabı AKTİF (HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=${(pcR.afterMeasure || {}).tokenVersion}) — ${R_2XX}`
        && lR.includes(`— kapatmadan sonra DB'de kapalı ölçüldü (P7-C2=PASS) ama hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true): ${R_2XX}`)
        && ![pcR.acikErisim || '', ...nRr].some((t) => /kapatamadı|Recover kapatabilir/.test(t)) && !!r23r.pu && r23r.pu.isActive === true && r23r.calls.some((c) => c.path === '/api/portal/admin/disable-user'),
      `(1) çıkış=${r23k.code} C2=${r23k.v('P7-C2')} çağrılar=${JSON.stringify(pcK.disableCalls || null)} açıkErişim=${pcK.acikErisim || '-'} · (2) çıkış=${r23r.code} C1=${r23r.v('P7-C1')} C2=${r23r.v('P7-C2')} C3L=${r23r.o('P7-C3L')} C3D=${r23r.o('P7-C3D')} C5=${r23r.v('P7-C5')} sürüm ${(pcR.after || {}).tokenVersion}→${(pcR.afterMeasure || {}).tokenVersion} açıkErişim=${pcR.acikErisim || '-'} · portal satırı=${lR.slice(0, 320)}`);

    // ---- C-1 (R03 c) — kanıttaki kurtarma/kapanış metinleri YALNIZ ölçüleni söyler: bu öz-testin ürettiği TÜM Run/Recover kanıtları taranır
    let evScanned = 0; let evNeed = 0; let evRunOpt = 0; const textBad = [];
    const fixedClaims = [/sentetik tenant CLOSED/, /sentetik tenant kapanışıyla/, /token 7 gün/, /birkaç dakika sonra Recover/, /Recover BİR KEZ/, /ile BİR KEZ/, /kapanışta yeniden kapatıldı/, /TEKRARLANMAZ: DB kapalı/];
    for (const f of new Set(artifacts)) {
      if (!/-evidence\.json$/.test(f) || !fs.existsSync(f)) continue; const nm = path.basename(f); let e;
      try { e = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { textBad.push(`${nm}:okunamadı`); continue; }
      evScanned++;
      if (e.revision !== 'R03') textBad.push(`${nm}:revision=${e.revision}`);
      const kept = (e.results || []).find((r) => r.id === 'P7-MSG-KEPT'); const vOf = (id) => ((e.results || []).find((r) => r.id === id) || {}).verdict;
      const txt = JSON.stringify({ recovery: e.recovery || null, temporaryAccess: e.temporaryAccess || null, note: (e.messageResidue || {}).note || null, kept: kept ? kept.observed : null, finding: e.productFinding || null });
      for (const re of fixedClaims) if (re.test(txt)) textBad.push(`${nm}:${re.source}`);
      if (kept && !/kapanış, ölçülen: /.test(kept.observed || '')) textBad.push(`${nm}:kalıntı metninde ölçülen kapanış özeti yok`);
      if (kept && /\(U-CLOSE PASS\)/.test(kept.observed || '') && vOf('U-CLOSE') !== 'PASS') textBad.push(`${nm}:kalıntı metni U-CLOSE PASS diyor, verdict ${vOf('U-CLOSE')}`);
      if (kept && /P7-C2 PASS\)/.test(kept.observed || '') && vOf('P7-C2') !== 'PASS') textBad.push(`${nm}:kalıntı metni P7-C2 PASS diyor, verdict ${vOf('P7-C2')}`);
      if (e.recovery && e.recovery.gerekli) {
        evNeed++; const a = e.recovery.adim || '';
        if (!/^ÖNERİ \(yetki DEĞİL\)/.test(a)) textBad.push(`${nm}:adım ÖNERİ değil`);
        if (e.record === 'EXTACC-D7-RECOVER' && e.exitCode !== 3 && !/İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(a)) textBad.push(`${nm}:Recover adımı ikinci Recover kuralını yazmıyor`);
        if (e.record === 'EXTACC-D7-RECOVER' && e.exitCode === 3 && !a.includes(`P7-C2=${vOf('P7-C2') || 'ÜRETİLMEDİ'} · P7-C5=${vOf('P7-C5') || 'ÜRETİLMEDİ'}`)) textBad.push(`${nm}:Recover 3 adımı kanıttaki verdict'i yazmıyor`);
        if (e.record !== 'EXTACC-D7-RECOVER' && !/AYRI owner onayıyla/.test(a)) textBad.push(`${nm}:Run adımı AYRI owner onayını yazmıyor`);
        // R04-b: hiçbir kanıtta elle komut / Run kanıt dizininin içine makbuz yazdıran yol yok; kanıtta makbuz metni varsa Run adımı bloğun -RunEvidenceDir seçeneğini gösterir.
        if (/Set-Content|Get-Content -Raw|setup-receipt-kanittan/.test(a)) textBad.push(`${nm}:adım elle komut içeriyor`);
        if (e.record !== 'EXTACC-D7-RECOVER' && typeof e.recovery.makbuzJson === 'string') {
          evRunOpt++;
          if (!a.includes('`-Mode Recover -RunEvidenceDir ') || /-ReceiptFile <makbuz>|-ReceiptFile '/.test(a)) textBad.push(`${nm}:kanıtta makbuz metni var ama adım -RunEvidenceDir seçeneğini göstermiyor`);
        }
      }
      // R03-c: ürün bulgusu yalnız P7-C2 PASS VE P7-C5 PASS iken (önceki ölçüt yalnız P7-C2'ye bakıyordu). R03-d: ya da P7-C2 PASS + P7-C5 FAIL iken sürüm
      // sınıflaması ADAY ise ("ÜRÜN BULGUSU ADAYI …"; portalClose.sessionVersion.sinif=ADAY) — başka her durumda bulgu metni yazılmaz.
      // R03-e: DEĞİŞTİ — ADAY sınıfı karar tablosunun HER hücresinde olabilir (P7-C2 FAIL dalı dahil); kesin bulgu yalnız BULGU sınıfı + P7-C2/C5 PASS iken;
      // "ürün bulgusu SAYILMADI" yalnız T5 hücresiyle (R03-d'de P7-C2 FAIL dalında koşulsuz yazılıyordu).
      const svE = (e.portalClose || {}).sessionVersion || {};
      const candOk = svE.sinif === 'ADAY' && /^ÜRÜN BULGUSU ADAYI \(/.test(e.productFinding || '') && /Recover düzeltemez$/.test(e.productFinding || '') && !/Recover kapatabilir/.test(e.productFinding || '');
      const realOk = svE.sinif === 'BULGU' && vOf('P7-C2') === 'PASS' && vOf('P7-C5') === 'PASS' && /^ÜRÜN BULGUSU: /.test(e.productFinding || '');
      if (e.productFinding && !realOk && !candOk) textBad.push(`${nm}:ürün bulgusu BULGU (P7-C2 + P7-C5 PASS) ya da ADAY sınıfı olmadan yazıldı`);
      if (/ürün bulgusu SAYILMADI/.test(JSON.stringify(e.results || []) + JSON.stringify(e.recovery || {})) && svE.hucre !== 'T5') textBad.push(`${nm}:"ürün bulgusu SAYILMADI" T5 hücresi olmadan yazıldı`);
      if (e.recovery && e.recovery.gerekli && e.record !== 'EXTACC-D7-RECOVER' && e.recovery.makbuzDurumu && e.recovery.makbuzDurumu !== 'KULLANILABILIR' && String(e.recovery.adim || '').includes('-ReceiptFile <makbuz>')) textBad.push(`${nm}:makbuz dosyası ${e.recovery.makbuzDurumu} iken Recover komutu önerildi`);
      // R03-d (m4 + m7): Run kanıtında makbuz varsa recovery.makbuzJson makbuzun BİREBİR metnidir; bayat makbuzda (makbuzGuncel=false) Recover komutu önerilmez.
      if (e.record === 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN' && e.receipt && !(e.recovery && e.recovery.makbuzJson === JSON.stringify(e.receipt, null, 1))) textBad.push(`${nm}:recovery.makbuzJson yok ya da makbuzla eşit değil`);
      if (e.recovery && e.recovery.makbuzGuncel === false && String(e.recovery.adim || '').includes('-ReceiptFile <makbuz>')) textBad.push(`${nm}:bayat makbuzla Recover komutu önerildi`);
      if (e.temporaryAccess && typeof e.temporaryAccessClosed !== 'boolean') textBad.push(`${nm}:temporaryAccessClosed ölçülmedi`);
      if (e.record === 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN' && !(e.setup && typeof e.setup.durum === 'string')) textBad.push(`${nm}:setup.durum yok`);
    }
    check('C-1', 'kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler (bu öz-testin TÜM Run/Recover kanıtları): revision=R03; sabit iddia YOK ("sentetik tenant CLOSED", "… kapanışıyla erişilemez", "token 7 gün", "birkaç dakika sonra Recover", "Recover BİR KEZ", "ile BİR KEZ", "kapanışta yeniden kapatıldı", "TEKRARLANMAZ: DB kapalı"); P7-MSG-KEPT kapanış özeti ölçülenden ve U-CLOSE / P7-C2 verdict\'iyle tutarlı; R03-e: ürün bulgusu yalnız BULGU sınıfı + P7-C2 + P7-C5 PASS ya da ADAY sınıfıyla (P7-C2 FAIL dalı dahil; "… Recover düzeltemez" ile biter, "Recover kapatabilir" içermez); "ürün bulgusu SAYILMADI" yalnız T5 hücresiyle; Run kanıtında makbuz varsa recovery.makbuzJson birebir; bayat makbuzla komut yok; kurtarma gerekliyse adım "ÖNERİ (yetki DEĞİL)" ile başlar — Run adımı AYRI owner onayını, Recover adımı (çıkış 3 dışı) "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR" kuralını, Recover 3 adımı kanıttaki P7-C2/C5 verdict\'ini yazar; R03-c: ürün bulgusu yalnız P7-C2 PASS + P7-C5 PASS iken; makbuz dosyası kullanılamıyorken Run adımı Recover komutu önermez; Recover geçici erişimi verdiyse kapanışı ölçülmüş alanla (temporaryAccessClosed); her Run kanıtında setup.durum; R04-b: hiçbir adımda elle komut (Get-Content -Raw / Set-Content) ya da "…-setup-receipt-kanittan.json" yolu YOK ve kanıtında makbuz metni (recovery.makbuzJson) olan her Run adımı `-Mode Recover -RunEvidenceDir` seçeneğini gösterir (`-ReceiptFile <makbuz>` / `-ReceiptFile \'<yol>\'` YOK)',
      evScanned >= 24 && evNeed >= 8 && evRunOpt >= 15 && textBad.length === 0, `taranan kanıt=${evScanned} · kurtarma gerekli=${evNeed} · -RunEvidenceDir seçeneği ölçülen Run kanıtı=${evRunOpt} · sorun=${textBad.length ? textBad.slice(0, 10).join(', ') : 'yok'}`);

    // ---- S-1 SIR SIZINTISI — parolalar, JWT'ler, DB URL, GO, telefon mesajı içeriği, tuzak (başka müvekkil) içeriği (sink dosyaları TARAMA DIŞI)
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f) || sinks.has(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${String(s).slice(0, 5)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const nPw = [...secretsSeen].filter((s) => /^D7p!/.test(String(s))).length; const nPhone = [...secretsSeen].filter((s) => /^PHONE-/.test(String(s))).length; const nLeak = [...secretsSeen].filter((s) => /^LEAK-/.test(String(s))).length;
    check('S-1', 'portal parolası · personel parolası · Recover ölçüm parolası · JWT · DB URL · GO · TELEFON MESAJI İÇERİĞİ · başka müvekkilin (tuzak) mesajı hiçbir log/makbuz/kanıtta YOK',
      scanned > 30 && leaks.length === 0 && nPw >= 10 && nPhone >= 4 && nLeak >= 1, `taranan=${scanned} · aranan=${secretsSeen.size} (portal parolası ${nPw} · telefon mesajı ${nPhone} · tuzak ${nLeak}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const EX = require(RUN);
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const srcNoDecl = src.replace(/FORBIDDEN_PORTAL = \[[^\]]*\]/, '');
  const adminCalls = src.split('\n').filter((l) => /httpJson\(/.test(l) && /portal\/admin\//.test(l));
  check('T-1', 'koşucu kaynağında forgot/reset/change-password/documents çağrısı YOK; admin uçları (create/disable/messages) YALNIZ `${base}` ile (origin ile HİÇ); geçici portal parolası tam 6 kullanım',
    !EX.FORBIDDEN_PORTAL.some((re) => re.test(srcNoDecl)) && adminCalls.length === 6 && adminCalls.every((l) => /`\$\{base\}\/portal\/admin\//.test(l)) && !/\$\{origin\}\/api\/portal\/admin/.test(src) && (src.match(/\bportalPw\b/g) || []).length === 6,
    `admin çağrı satırı=${adminCalls.length} · portalPw=${(src.match(/\bportalPw\b/g) || []).length}`);
  // T-9 (R03 b): personel yeniden girişi YALNIZ Run'ın kendi kapanışında; Recover'ın oturum açma yolu değişmedi; yeniden giriş DB'ye yazmaz.
  const runSrc = src.slice(src.indexOf('async function runMode'), src.indexOf('async function recoverMode')); const recSrc = src.slice(src.indexOf('async function recoverMode'));
  const iRe = runSrc.indexOf('const staffReauth ='); const reauthFn = iRe >= 0 ? runSrc.slice(iRe, runSrc.indexOf('} : null;', iRe)) : '';
  check('T-9', 'personel yeniden girişi yalnız Run kapanışında: Run\'ın closePortal çağrısına `staffReauth` verilir, Recover vermez; yeniden giriş fonksiyonu yalnız makbuzdaki personelle L.AH.login çağırır ve DB\'ye yazmaz (prisma çağrısı yok); closePortal yeniden girişi yalnız 401/403\'te ve bir kez yapar',
    reauthFn.length > 0 && /L\.AH\.login\(base, receipt\.elevEmail, pw, receipt\.tenantSlug\)/.test(reauthFn) && !/prisma\./.test(reauthFn) && /closePortal\([^)]*\{\s*session, staffReauth,/.test(runSrc) && !/staffReauth/.test(recSrc)
      && /\(r\.status === 401 \|\| r\.status === 403\) && o\.staffReauth && !res\.staffReauth/.test(src), `fonksiyon=${reauthFn.length} karakter · Recover'da staffReauth=${/staffReauth/.test(recSrc)}`);
  // T-11 (R03-e): koşucu oturumunun HER 200'ü TEK sınıflamadan (judgeSession → sessionClass200; P7-C2 PASS / FAIL dalı ayrımı yok); yorum dışı kaynakta "hâlâ AÇIK",
  // koşulsuz P7-C2 FAIL "SAYILMADI" metni (sessionWhileOpen / dbOpenTxt), eski sınıflama (sessionClassDuringChange) ve "adayı DEĞİL" YOK; "ürün bulgusu değil" tek yerde (T5).
  const nCls7 = (src.match(/sessionClass200\(/g) || []).length; const nDegil7 = (src.match(/ürün bulgusu değil/g) || []).length;
  check('T-11', 'R03-e + R03-f + R03-g: koşucu kaynağında (yorum dışı) oturum 200\'ü TEK sınıflamadan geçer — sessionClass200 tanım + judgeSession\'da TEK çağrı; çağrı claim geçersizliğini (R03-f, TG) ve JWT okunamazlığını (R03-g, TJ) verir ("if (r.status === 200) { const sc = sessionClass200(issued, st1, st2, o.issuedClaimInvalid === true, o.issuedClaimUnreadable === true);") ve Run iki girdiyi de kanıttaki issuedVersion.claimDurum\'dan kurar (GECERSIZ / OKUNAMADI); "hâlâ AÇIK", sessionWhileOpen, dbOpenTxt, sessionClassDuringChange, "adayı DEĞİL" YOK; "ürün bulgusu değil" yalnız bir kez (T5 hücresi)',
    nCls7 === 2 && /if \(r\.status === 200\) \{\s*const sc = sessionClass200\(issued, st1, st2, o\.issuedClaimInvalid === true, o\.issuedClaimUnreadable === true\);/.test(src) && /issuedClaimInvalid: !!\(out\.issuedVersion && out\.issuedVersion\.claimDurum === 'GECERSIZ'\)/.test(src)
      && /issuedClaimUnreadable: !!\(out\.issuedVersion && out\.issuedVersion\.claimDurum === 'OKUNAMADI'\)/.test(src)
      && !/hâlâ AÇIK|sessionWhileOpen|dbOpenTxt|sessionClassDuringChange|adayı DEĞİL/.test(src) && nDegil7 === 1,
    `sessionClass200( geçişi=${nCls7} · "ürün bulgusu değil"=${nDegil7} · yasak dize=${(src.match(/hâlâ AÇIK|sessionWhileOpen|dbOpenTxt|sessionClassDuringChange|adayı DEĞİL/g) || []).join(',') || 'yok'}`);
  // T-12 (R03-f): yorum dışı koşucu kaynağında owner'a giden metinlerde kanıtsız iddia YOK — "Recover kapatabilir" (F2), "DB'ye yansımadı" (F3), "portal hesabı açık"
  // (F3), eski "DB'de AÇIK" / "'AÇIK' : 'kapanış TAMAMLANMADI'" biçimi (F3); P7-C1 satırları yalnız C1_DESC ya da hesap-yok açıklamasıyla yazılır ve "kapatıldı" demez (F1).
  const c1Calls7 = src.match(/R\.(check|unmeasured)\('P7-C1', [^,]+,/g) || [];
  const t12Bad = (src.match(/Recover kapatabilir|DB'ye yansımadı|portal hesabı açık|DB'de AÇIK|'AÇIK' : 'kapanış TAMAMLANMADI'/g) || []);
  check('T-12', 'R03-f: yorum dışı koşucu kaynağında "Recover kapatabilir", "DB\'ye yansımadı", "portal hesabı açık", "DB\'de AÇIK" ve eski "\'AÇIK\' : \'kapanış TAMAMLANMADI\'" biçimi YOK; P7-C1 yazan tüm R.check / R.unmeasured çağrıları (≥ 4) açıklamayı C1_DESC ya da "portal hesabı YOK (DB\'de ölçüldü) …" ile verir, "kapatıldı" geçmez; C1_DESC "DB kapanışı P7-C2 / P7-C5 satırlarında" der',
    t12Bad.length === 0 && c1Calls7.length >= 4 && c1Calls7.every((c) => /'P7-C1', C1_DESC,$/.test(c) || /'P7-C1', 'portal hesabı YOK \(DB\\'de ölçüldü\)/.test(c)) && !c1Calls7.some((c) => /kapatıldı/.test(c)) && /DB kapanışı P7-C2 \/ P7-C5 satırlarında/.test((require(RUN).C1_DESC) || ''),
    `yasak dize=${t12Bad.join(',') || 'yok'} · P7-C1 çağrısı=${c1Calls7.length}: ${c1Calls7.map((c) => c.slice(0, 48)).join(' | ')}`);
  // T-15 (R05; statik): kapsam durdurması üç ölçütün HER BİRİNDEN hemen sonra ve kendi dosyasıyla mesajdan (D7-4P) ÖNCE; durdurma istisna fırlatmaz (kapanış
  // `finally`'de çalışır); gösterim kapısı üç ölçütü içerir; koşulmayan ölçütler R.unmeasured ile yazılır.
  const iOl = runSrc.indexOf('olcum: {'); const iOwn = runSrc.indexOf('(kendi caseId)'); const iHalt = runSrc.indexOf('const scopeHalt = (id) => {');
  const haltFn = iHalt >= 0 ? runSrc.slice(iHalt, runSrc.indexOf('};', iHalt)) : '';
  const haltAt = SCOPE_ORDER.map((id) => runSrc.indexOf(`if (scopeHalt('${id}')) break olcum;`));
  const iFin = runSrc.indexOf('finally {');
  check('T-15', 'R05 statik: `scopeHalt` üç ölçütün her birinden sonra çağrılır (sıra D7-4N < D7-4S < D7-4U), üçü de `olcum` bloğunda ve kendi dosyasıyla mesaj çağrısından ÖNCE; durdurma fonksiyonu `throw` içermez, PASS dışındaki her verdict\'te durur; gösterim kapısı listesi üç ölçütü içerir; koşulmayan ölçütler `R.unmeasured` ile yazılır; kapanış `finally` bloğunda (closePortal + closeAccess) kalır',
    iOl > 0 && iOwn > iOl && haltAt.every((x) => x > iOl && x < iOwn) && haltAt[0] < haltAt[1] && haltAt[1] < haltAt[2] && haltFn.length > 0 && !/throw/.test(haltFn) && /if \(vd === 'PASS'\) return false;/.test(haltFn)
      && /const GATE = \['P7-03L', 'P7-04D', 'D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-3', 'D7-3U'\];/.test(runSrc) && /for \(const id of out\.scopeStop\.kosulmayan\) R\.unmeasured\(id, /.test(runSrc)
      && iFin > iOwn && runSrc.indexOf('await closePortal(', iFin) > 0 && runSrc.indexOf('await closeAccess(', iFin) > 0,
    `durdurma noktaları=${haltAt.join(',')} · blok=${iOl} · kendi dosya çağrısı=${iOwn} · fonksiyon=${haltFn.length} karakter`);
  // T-13 (R04, owner talimatı madde 5; birim + statik — disposable DB / sahte API senaryosu GEREKMEZ): ret ölçütlerinde (P7-C3L/D yeni giriş · P7-C4L/D mevcut
  // oturum) 503 / 429 DIŞINDAKİ 5xx gözlemi "ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" der; verdict ifadesi (`r.status === 401`) ve
  // 503 / 429 → ÖLÇÜLEMEYEN dalı DEĞİŞMEDİ (her iki ölçütte R.check satırından hemen önce); eski yalın "HTTP ${r.status}" gözlemi iki ret ölçütünde kalmadı.
  const t13Txt = 'ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)';
  const t13Fn = typeof EX.rejectObs === 'function';
  const t13Five = t13Fn && [500, 502, 504, 599].every((s) => EX.rejectObs(s) === `HTTP ${s} — ${t13Txt}`);
  const t13Other = t13Fn && [401, 403, 404, 200, 201, 429, 503, 600].every((s) => EX.rejectObs(s) === `HTTP ${s}`);
  const t13Cnt = (s) => src.split(s).length - 1;
  const t13Login = t13Cnt("return R.check(id, desc, r.status === 401, `${rejectObs(r.status)}${res.measureCreds && !o.creds ? ' · ' + res.measureCreds : ''}`);");
  const t13Sess = t13Cnt('return R.check(id, desc, r.status === 401, rejectObs(r.status));');
  const t13Old = t13Cnt('r.status === 401, `HTTP ${r.status}');
  const t13Unm = (src.match(/if \(r\.status === 503 \|\| r\.status === 429\) return R\.unmeasured\(id, desc, `HTTP \$\{r\.status\} — neden UNKNOWN`\);\n\s*return R\.check\(id, desc, r\.status === 401, /g) || []).length;
  const t13Calls = ["judge401('P7-C3L'", "judge401('P7-C3D'", "judgeSession('P7-C4L'", "judgeSession('P7-C4D'"].every((c) => src.includes(c));
  check('T-13', 'R04 (owner madde 5): ret ölçütlerinde 503 / 429 dışındaki 5xx gözlemi "HTTP <kod> — ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" (birim: 500/502/504/599); 5xx dışı kodlar ve 503 "HTTP <kod>" aynen; judge401 (P7-C3L/D; ölçüm parolası notu korunur) ve judgeSession (P7-C4L/D) son dalı gözlemi `rejectObs(r.status)` ile yazar — verdict ifadesi `r.status === 401` ve hemen önündeki 503 / 429 → ÖLÇÜLEMEYEN dalı değişmedi; eski yalın "HTTP ${r.status}" ret gözlemi YOK',
    t13Fn && t13Five && t13Other && t13Login === 1 && t13Sess === 1 && t13Old === 0 && t13Unm === 2 && t13Calls,
    `fonksiyon=${t13Fn} · 5xx metni=${t13Five} · diğer kodlar=${t13Other} · yeni giriş son dalı=${t13Login} · mevcut oturum son dalı=${t13Sess} · eski son dal=${t13Old} · 503/429 dalı + R.check=${t13Unm} · dört ölçüt çağrısı=${t13Calls} · örnek=${t13Fn ? EX.rejectObs(502) : '-'}`);
  // T-14 (R04-b; statik — disposable DB / sahte API GEREKMEZ): (a) yorum dışı koşucu kaynağında elle komut YOK (Get-Content -Raw / Set-Content / "…-setup-receipt-kanittan" /
  // receiptFromEvidenceCommand; dışa aktarım da yok) ve `-RunEvidenceDir` seçeneği TEK yerde; `-ReceiptFile <makbuz>` yalnız "kanıtta makbuz yok + dosya okunabilir"
  // dalında (tek yer). (b) Recover makbuz dosyasına YAZMAZ: recoverMode kaynağında writeJson / saveReceipt / writeFileSync çağrısı YOK (doğrulanmış Recover girdisi
  // değişmez — uçtan uca ölçüm Z19-b). (c) Owner bloğu aynı seçeneği gösterir; yorum dışı blok kaynağında "elle komut" ifadesi YOK.
  const t14Old = (src.match(/Get-Content -Raw|Set-Content|setup-receipt-kanittan|receiptFromEvidenceCommand/g) || []);
  const t14Opt = (src.match(/-Mode Recover -RunEvidenceDir /g) || []).length; const t14File = (src.match(/-Mode Recover -ReceiptFile <makbuz>/g) || []).length;
  const t14RecW = (recSrc.match(/writeJson\(|saveReceipt\(|writeFileSync\(|appendFileSync\(/g) || []);
  let t14W = ''; try { t14W = fs.readFileSync(WRAPPER, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'); } catch (e) { t14W = ''; }   // bloğun yorum dışı kaynağı
  const t14Blk = t14W.includes('    -Mode Recover -RunEvidenceDir \'{0}\'') && !t14W.includes('elle komut') && t14W.includes('kanıttaki kurtarma adımı da bu seçeneği gösterir');
  check('T-14', 'R04-b (statik): yorum dışı koşucu kaynağında elle komut YOK ("Get-Content -Raw", "Set-Content", "setup-receipt-kanittan", receiptFromEvidenceCommand — dışa aktarım da yok); `-Mode Recover -RunEvidenceDir ` TEK yerde, `-Mode Recover -ReceiptFile <makbuz>` TEK yerde (kanıtta makbuz yok + dosya okunabilir dalı); Recover makbuz dosyasına YAZMAZ (recoverMode kaynağında writeJson / saveReceipt / writeFileSync / appendFileSync YOK; kanıt yazımı writeEvidenceOrDemote ile ayrı dosyaya); owner bloğu aynı seçeneği gösterir ("    -Mode Recover -RunEvidenceDir \'{0}\'"), bloğun yorum dışı kaynağında "elle komut" ifadesi YOK ve Run sonu metni "kanıttaki kurtarma adımı da bu seçeneği gösterir" der',
    t14Old.length === 0 && typeof EX.receiptFromEvidenceCommand === 'undefined' && t14Opt === 1 && t14File === 1 && recSrc.length > 2000 && t14RecW.length === 0 && /writeEvidenceOrDemote\(evid, out\)/.test(recSrc) && t14Blk,
    `elle komut izi=${t14Old.join(',') || 'yok'} · dışa aktarım=${typeof EX.receiptFromEvidenceCommand} · -RunEvidenceDir=${t14Opt} · -ReceiptFile <makbuz>=${t14File} · recoverMode kaynağı=${recSrc.length} karakter, makbuz / dosya yazımı=${t14RecW.join(',') || 'yok'} · blok=${t14Blk}`);
  // T-10 (R03 a): makbuz kurulumdan hemen sonra atanır ve dosyaya yazılır — iki ek dosya yazmasından ÖNCE (kaynak sırası).
  const iRcpt = runSrc.indexOf('receipt = { record: RECEIPT_RECORD'); const iSave = runSrc.indexOf("saveReceipt('makbuz yazılamadı"); const iSetup = runSrc.indexOf('L.setupI3(');
  const iCases = [...runSrc.matchAll(/prisma\.case\.create\(/g)].map((m) => m.index);
  check('T-10', 'koşucu kaynağında sıra: setupI3 → makbuz ataması → makbuz dosyası yazımı → iki ek dosya yazması (ikisi de makbuzdan SONRA); ek dosya kimlikleri makbuza yazıldıkça eklenir (foreignCaseId, sameTenantOtherCaseId + setupComplete)',
    iSetup >= 0 && iRcpt > iSetup && iSave > iRcpt && iCases.length === 2 && iCases.every((i) => i > iSave) && /receipt\.foreignCaseId = fcase\.id; saveReceipt\(null\)/.test(runSrc) && /receipt\.sameTenantOtherCaseId = scase\.id; receipt\.setupComplete = true; saveReceipt\(null\)/.test(runSrc),
    `setupI3@${iSetup} makbuz@${iRcpt} yazım@${iSave} ek dosyalar@${iCases.join(',')}`);
  const sinkLines = src.split('\n').filter((l) => /D7_TEST_DISPLAY_SINK/.test(l));
  check('T-2', 'gösterimsiz test dosyası (sink) kaynakta TEK yerde ve yalnız `display === \'none\'` koşuluyla (konsol varken asla)', sinkLines.length === 1 && /g\.display === 'none' && process\.env\.D7_TEST_DISPLAY_SINK/.test(sinkLines[0]) && /if \(con\) return DISPLAY\.show/.test(sinkLines[0]), `satır=${sinkLines.length}`);
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D7_EXPECT_DB: 'hukuk_db', D7_WAIT_MS: '1', D7_POLL_MS: '1', D7_VIEW_MS: '1', D7_HTTP_TIMEOUT_MS: '1', D7_CALL_TIMEOUT_MS: '1', D7_LATE_CREATE_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: `postgresql://u:p@127.0.0.1:${new URL(DBURL).port}/${DB_NAME}`, D7_EXPECT_DB: DB_NAME }));
  check('P-1', 'canlı DB: devralınan 6 süre değişkeni YOK SAYILIR (20 dk bekleme, 5 sn yoklama, 300 sn inceleme — R06; önceki 120 sn, 120 sn geç oluşma); test kısa süreleri korur',
    pl.live && Object.keys(EX.LIVE_PARAMS).length === 6 && Object.keys(EX.LIVE_PARAMS).every((k) => pl[k] === EX.LIVE_PARAMS[k]) && pl.D7_WAIT_MS === 1200000 && pl.D7_VIEW_MS === 300000 && pl.D7_LATE_CREATE_MS === 120000 && !pt.live && pt.D7_WAIT_MS === 1 && pt.D7_VIEW_MS === 1, `canlı=${pl.live}/${pl.D7_WAIT_MS}/${pl.D7_VIEW_MS} · test=${pt.live}/${pt.D7_WAIT_MS}/${pt.D7_VIEW_MS}`);
  // P-VIEW (R06): gözlem penceresi 300 sn (tek bekleme); "tamamlandı" girdisi yok; ekranda numaralı adımlar + GÖZLEM A / B ayrı + süre (Z1'in gösterim dosyası).
  const viewSleeps = (src.match(/await sleep\(P\.D7_VIEW_MS\)/g) || []).length;
  let z1Sink = ''; try { z1Sink = fs.readFileSync(path.join(P2DIR, 'z1-normal-display.sink'), 'utf8'); } catch (e) { z1Sink = ''; }
  const stepsOk = ['  1) ', '  2) ', '  3) GÖZLEM A — MESAJ LİSTESİ', '  4) GÖZLEM B — İKİNCİ YANIT', '  5) '].every((x) => z1Sink.includes(x));
  const order = ['  3) GÖZLEM A', '  4) GÖZLEM B', 'GÖZLEM süresi başladı'].map((x) => z1Sink.indexOf(x));
  check('P-VIEW', 'R06: canlı inceleme süresi 300000 ms ve koşucuda TEK bekleme (giriş algılanıp ikinci yanıt gönderildikten sonra); giriş bekleme 1200000 ms DEĞİŞMEDİ; koşucu konsoldan girdi okumaz (process.stdin yok); Z1 gösterim dosyasında numaralı beş telefon adımı, mesaj listesi (GÖZLEM A) ile ikinci yanıt (GÖZLEM B) AYRI adımlar, "SÜRELER:" satırı ve "GÖZLEM süresi başladı" satırı adım listesinden SONRA; ikinci yanıtın metni (…-OFFICE-2) ekranda yazılı',
    EX.LIVE_PARAMS.D7_VIEW_MS === 300000 && EX.LIVE_PARAMS.D7_WAIT_MS === 1200000 && viewSleeps === 1 && !/process\.stdin/.test(src)
      && stepsOk && /SÜRELER: giriş için en fazla \d+ dk beklenir · giriş algılanınca GÖZLEM A \+ B için \d+ sn\./.test(z1Sink) && /-OFFICE-2 \(ilk yanıttan son ekiyle ayrılır\)/.test(z1Sink) && order.every((x) => x >= 0) && order[0] < order[1] && order[1] < order[2],
    `canlı inceleme=${EX.LIVE_PARAMS.D7_VIEW_MS} · bekleme sayısı=${viewSleeps} · adımlar=${stepsOk} · sıra=${order.join(',')} · gösterim dosyası=${z1Sink.length} bayt`);
  const g = EX.runGates({ D7_DISPLAY: 'none', D7_EXPECT_DB: 'x', AH_DATABASE_URL: 'postgresql://u:p@h:1/x', D7_API_BASE: 'a', D7_EXPECT_API: 'a', D7_EXPECT_BASE_URL: 'https://ornek.invalid', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R01', D7_RUNID: 'abcdef12', D7_EXPECT_TENANT_SLUG: 'ah-abcdef12' });
  check('P-2', 'kapılar: doğru D-7 GO + runId + slug kabul; origin yolsuz https; FOREIGN_CASE_EXPECT=400 (kaynak); listOnlyOwn boş listeyi kabul etmez', g.code === 0 && g.origin === 'https://ornek.invalid' && EX.FOREIGN_CASE_EXPECT === 400 && EX.listOnlyOwn([], []).ok === false && EX.listOnlyOwn([{ id: 'a' }], ['a']).ok === true && EX.listOnlyOwn([{ id: 'a' }, { id: 'b' }], ['a']).ok === false, `kod=${g.code}`);
  if (fs.existsSync(WRAPPER)) {
    const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-portal-d7-r01/scripts/d7-qr-test.js'].sort();
    check('T-3', 'owner bloğunun pin listesi = koşucunun GERÇEKTEN yüklediği governance dosyaları + D-7 QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned),
      `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'} · fazla=${pinned.filter((f) => !expectPinned.includes(f)).join(',') || 'yok'}`);
    check('T-4', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 2, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-5', 'Preflight dalı yazmaz ve node/GO sormaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode/.test(pre), `dal=${pre.length}`);
    check('T-6', 'Run: D7_DISPLAY=conout; GO deseni D-7; defter koşumdan ÖNCE; D7_DISPLAY=none ve D7_TEST_DISPLAY_SINK KURULMAZ; QrTest adresi /portal/messages ve d7-qr-test.js',
      /\$env:D7_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-D7-\\d\{8\}-R\\d\{2\}/.test(w) && !/D7_DISPLAY\s*=\s*'none'/.test(w) && !/\$env:D7_TEST_DISPLAY_SINK\s*=/.test(w)
        && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:D7_MODE = 'run'") && /\/portal\/messages"/.test(w) && /d7-qr-test\.js/.test(w) && !/extacc-qr-test\.js/.test(w), 'kapılar');
    const exw = fs.readFileSync(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist pini = R27 dist (D-5 ile aynı ön koşul; R26 canlı dist ile blok DURUR) · .env pini EXTACC bloğuyla eşit', pinOf(w, 'ExpLiveDist') === R27_CAND_DIST && pinOf(w, 'ExpEnvSha') === pinOf(exw, 'ExpEnvSha'),
      `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
    const qsrc = fs.readFileSync(path.join(HERE, 'd7-qr-test.js'), 'utf8');
    check('T-8', 'd7-qr-test.js yalnız https://<host>/portal/messages kabul eder; canlı veri/token yok; extacc-display kullanır', /u\.pathname !== '\/portal\/messages'/.test(qsrc) && /extacc-display/.test(qsrc) && !/AH_DATABASE_URL|loadPrisma|token/i.test(qsrc.replace(/token YOK/g, '')), 'statik');
  } else check('T-3', 'owner bloğu mevcut', false, 'yok');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-7 R03 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log(`  (disposable DB 127.0.0.1:${new URL(DBURL).port}/${DB_NAME} + sahte portal API ${API_PORT}/${EXT_PORT} + gerçek TLS; canlı DB/API/DNS/tünel/e-posta KULLANILMADI)`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
