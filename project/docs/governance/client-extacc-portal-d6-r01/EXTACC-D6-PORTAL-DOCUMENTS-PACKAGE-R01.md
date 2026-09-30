# EXTACC D-6 — PORTAL BELGE AKIŞI CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Canlı Run/Recover ve yayın bu paketle yetkilendirilmez.
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`); owner bloğu bu pini doğrular,
> R26 canlı ile Preflight/Run **DUR** verir. Uygulama sırası: R27 yayınından **sonra** (D-5 ile aynı koşul).
> Tanım: `client-extacc-d8-staff-surface-r01` §4 ve §6. İki bağımsız inceleme sonrası düzeltmeler: §8.

## 1. Ne ölçer ve ne yapmaz

Uçtan uca belge akışı: koşucu (makine ölçümü) **dış HTTPS** uçtan kendi multipart yüklemesini yapar → liste (yerel + dış) → indirme
(içerik sha256) → personel bekleyen liste (yerel, salt okuma) → kapsam dışı belge 404 (indirme + silme) → owner telefondan girip
listeyi/indirmeyi görür (telefon yüklemesi opsiyonel) → koşucu kendi belgesini **ürün DELETE'i** ile siler → satır + dosya yok → owner
listeyi yeniler (boş) → kapanış (D-4 R03 kuralları + belge kalıntısı). Koşucu **dosya silmez** (yalnız üç durumlu `stat` yoklaması),
forgot/reset/change-password, mesaj ve belge onay/ret uçlarını **çağırmaz**; parolaları, token'ları, GO'yu ve DB URL'yi hiçbir kanıta yazmaz.

**D-8 §4'ten sapmalar (iş talimatı gereği; açıkça kaydedilir):**
- D-8 §4 "D6-1 telefon: yükleme 201 (owner beyanı zorunlu)" der. Bu pakette **makine ölçümü koşucunun kendi yüklemesidir**; telefondan
  yükleme **opsiyoneldir** ve owner beyanı ayrı dosyada (`owner-declaration.json`) tutulur; beyan makine ölçümü değildir.
- D-8 §4 "D6-6 personel onay/ret iç ağdan (opsiyonel)" der. Bu paket **onay/ret uçlarını bilinçli olarak çağırmaz** (`reviewDocument`
  uygulama içi `PortalNotification` satırı yazar; onay sonrası ürün DELETE'i kilitlenir → kalıntı). D6-6 bu koşucuda **yalnız bekleyen
  liste GET'i** olarak ve **zorunlu ölçüt** olarak ölçülür (FAIL → çıkış 2; gösterim kapısında değildir). Onay/ret istenirse ayrı paket (§7).

**Yan etki bulgusu (kaynak `HY_WT_R27` `apps/api/src/modules/portal/portal.controller.ts` + `portal.service.ts`):**
`documents/upload` → `resolveCaseReference` + `portalDocument.create` + `logger.log` (fileName + clientId, **maskesiz**; `maskEmail`
yalnız hesap/giriş/sıfırlama loglarında) · `documents` → `findMany` · `documents/:id/download` → `getDocument` + `assertContained` +
`res.download` · `DELETE documents/:id` → `findFirst` (PENDING şartı) + `delete` + kontrolcüde `unlinkSync` (kova içi) ·
`admin/documents/pending` → `findMany`. Bu uçlarda **bildirim, e-posta, outbox, audit ve event YOK**; gerçek alıcıya gönderim gerektiren
bir kısım **yok**. Yalnız `admin/documents/:id/approve|reject` (`reviewDocument`) uygulama içi `PortalNotification` satırı yazar (e-posta yok)
— paket bu uçları **çağırmaz**. Dolayısıyla D-5'teki alıcı/gönderim owner kararları bu pakette **yoktur** (`plannedRealSends=0`). Depolama:
`runtimeStoragePaths().bucketDir("PORTAL_DOCUMENTS", tenantId)` → `<HUKUK_DATA_ROOT>/portal-documents/<tenantId>/portal-<zaman>-<rastgele>.pdf`;
yol DB'de `filePath`. Sentetik PDF ≤ 50 KB, içinde yalnız `D6-<runId>`; dosya adı `d6-<runId>.pdf` (API log satırına kişisel veri girmez).

## 2. Ölçütler

| ID | Ölçüt | Kaynak |
|---|---|---|
| P6-00 / P6-01 / P6-02 | elev1 ADMIN değil · sentetik müvekkile portal hesabı (`.invalid`; gönderim yok) · DB aktif+erişim+adres | D-4 kalıbı |
| P6-03L / P6-04D | koşucu portal girişi yerel 201 · dosya listesi DIŞ 200 yalnız `I3-<runId>` (dış zincir kapısı) | HTTP |
| D6-1 / D6-1D | koşucunun DIŞ multipart yüklemesi 201 (id/title/fileName/status=PENDING) · DB satırı: clientId (sorgu) · tenantId · caseId · fileName · fileSize=bayt · mimeType · status · `filePath` diskte **var** (stat) | HTTP+DB+disk |
| D6-2L / D6-2D | liste yerel 200 / DIŞ 200, YALNIZ bu belge; dış yanıtta `filePath` yok | HTTP |
| D6-3 | DIŞ indirme 200, içerik sha256 = yüklenen, `content-disposition` dosya adını taşır | HTTP |
| D6-6 | personel bekleyen liste YEREL 200 belgeyi içerir — D-8 §4'te "opsiyonel"; **bu koşucuda zorunlu ölçüt** (FAIL → çıkış 2; gösterim kapısında değil); onay/ret **çağrılmaz** | HTTP |
| D6-4A / D6-4B / D6-4C | kapsam dışı belge (yabancı tenant'ın müvekkiline Prisma ile yazılmış dosyasız satır) indirme **404** · silme **404** · satır dokunulmadı; 200 gelirse "KAPSAM DIŞI BELGEYE ERİŞİLDİ (ürün bulgusu)" | HTTP+DB |
| P6-DISP / P6-WAIT | QR `/portal/documents` + giriş bilgisi yalnız konsol · koşucu dışından giriş (loginCount; cihaz/ağ owner beyanı) | konsol/DB |
| P6-PHONE-DOC | telefon yüklemesi varsa koşucu silmesinden ÖNCE telefondan silindi (koşucu `D6_RESIDUE_WAIT_MS` bekler) | DB |
| D6-5 / D6-5D / D6-5L | koşucu belgesi DIŞ DELETE 200 · satır YOK + dosya **yok** (üç durumlu yoklama; erişim reddi → ÖLÇÜLEMEYEN, "yok" sayılmaz) · dış liste boş | HTTP+DB+disk |
| P6-C1 … P6-C5, P6-C2V | portal erişim kapanışı (D-4 R03 kuralları; mevcut oturum belge listesi ucunda ölçülür); geç oluşma belirsizse `D6_LATE_CREATE_MS` beklenir | DB+HTTP |
| **P6-C-DOC** | belge kalıntısı YOK: bu müvekkilin `PortalDocument` satırı 0 ve bilinen dosyalar diskte **yok** (`var` / `yok` / `olculemez`; `olculemez` → ÖLÇÜLEMEYEN, PASS değil) — geç oluşma dalında da ölçülür | DB+disk |
| **P6-FOREIGN-CLEAN** | sentetik yabancı satır Prisma ile temizlendi (açıkça raporlanır; dosyası hiç yoktu) | DB |
| U-CLOSE / U-ISO / P6-D9 | personel/dosya kapanışı · izolasyon · birleşik (portal + kalıntı + yabancı + personel) | DB |

Kanıt ayrıca `auditRetained` (tenant audit satır sayısı; **saklandı**, silinmedi — belge uçları audit yazmaz, fark hesap aç/kapa kaynaklı),
`foreignCleanup` (Prisma ile silinen/kalan) ve `portalClose.docResidue` (`filesLeftOnDisk`, `filesAccessError`) alanlarını taşır.

**Üç durumlu dosya yoklaması (inceleme R01, bulgu 2):** `fs.existsSync` erişim hatasında da `false` döner; Windows'ta ölçüldü — dosya `F` +
üst dizin `RD` reddi → `statSync` **EPERM**, `existsSync` **false**. Koşucu bu yüzden `stat` ile `var` / `yok` (ENOENT, ENOTDIR) /
`olculemez` (EACCES, EPERM, …) ayırır; `olculemez` hiçbir "diskte yok" ölçütünde PASS üretmez. Owner bloğu Preflight'ı `.env`'de
`HUKUK_DATA_ROOT` varsa `portal-documents` alt dizininin listelenebilirliğini ölçer, okunamıyorsa **DUR** verir.

**Kapılar:** D-4/D-5 ortak kapılara ek olarak **izole mod API kapısı** (inceleme R01, bulgu 12): bağlı DB `hukuk_db` değilse `D6_API_BASE`
127.0.0.1/localhost ve **8080 dışı** açık bir port olmalı; aksi halde çıkış 4 ve hiçbir çağrı yapılmaz (yanlış beyanla izole koşumdan canlı
API'ye tek giriş denemesi bile gitmez). D-5 koşucusunda bu kapı **yoktur** (ayrı kayıt, §7).

Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI (erişim **ya da belge
kalıntısı**) DOĞRULANMADI · 7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0). Kalan belge varsa DELETE personel oturumuyla
**yapılamaz** (ürün ucu yok): Run 6 verir; Recover'da owner kararı `D6_RESIDUE_CLEANUP=1` satırları Prisma ile siler, **dosyaları silmez**
(ad listeler, yollar makbuza `residueFiles`); owner dosyayı elle sildikten sonra Recover bir kez daha → P6-C-DOC ölçülür; Recover
ölçülemeyeni 0 yapmaz (C4 → 3). **Recover'ın 0 verebildiği tek yol** portal hesabının hiç açılmamış olduğu erken dönüştür (bu yolda HTTP
reddi ölçülmez); hesap varken mevcut oturum reddi Recover'da ölçülemez → en iyi 3 (Run kanıtındaki P6-C4 satırlarına bakılır).

## 3. Owner bloğu (`scripts/d6-owner-live-block.ps1`) — modlar ve sıra

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` **biçim kapısı** (https + yalnız alan
adı; yol/port/IP/localhost DUR) — adres canlı `.env`'den okunur, blokta host literali **yoktur**; R05 eşleşmesi Run/QrTest'te owner'ın konsola
yazdığı adresle ölçülür (eşleşmezse GO sorulmadan DUR), `HUKUK_DATA_ROOT` .env'de
varsa dizin var **ve `portal-documents` alt dizini okunabilir** (yoksa not; okunamıyorsa DUR), 8080 tek dinleyici, yabancı kabul süreci yok,
DB kimliği, dış zincir 8081 loopback = HY-Caddy, Cloudflared) · QrTest (`/portal/documents`; kendi `d6-qr-test.js`) · **Run**: konsol →
bağımsız pencere teyidi → canlı veri işleme "EVET" (metin: yükleme günlüğü **maskesiz**, kişisel veri yok) → GO → defter (sha256) → koşum
→ ekran temizliği → owner beyanı (9 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`; kalıntı kararı E/H sorulur; GO sorulmaz.
Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama · 120 sn inceleme · 120 sn geç oluşma · 5 dk kalıntı bekleme).

## 4. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme; yalnız ekranda gördüğünüz değerleri kullanın)

1. Bağımsız PowerShell penceresi (uygulama paneli DEĞİL). `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
2. `-Mode QrTest` → R05 kararındaki public portal adresini yazın (canlı `.env` değeriyle eşleşmeli) → telefonla QR okutun; belgeler/giriş sayfası açılırsa **E**; giriş yapmayın.
3. `-Mode Run`: pencere teyidi **E**, R05 public portal adresi (https://…), canlı veri işleme **EVET**, GO ref.
4. Konsol ekranı (1/2): QR'ı okutun, ekrandaki e-posta + parola ile **bir kez** giriş yapın; listede yalnız ekrandaki başlık olmalı; belgeyi indirin (PDF'de koşum kimliği yazar). Telefondan yükleme yapmak isterseniz yapın; koşucu "D6-RESIDUE-WAIT" gösterirse kendi yüklemenizi telefondan **silin**.
5. Konsol ekranı (2/2): koşucu kendi belgesini sildi — listeyi yenileyin; boş olmalı.
6. Ekran temizlenince 9 beyan sorusunu yanıtlayın (parola yazmayın). Pencereyi kapatın.
7. Çıkış 5/6 ise: koşum bitiş ekranındaki "kanıt dizini" satırındaki yolu alın; bu dizinde `d6-setup-receipt.json` dosyası vardır. Yeni bir pencerede `-Mode Recover -ReceiptFile` ve ardından o dosyanın tam yolunu yazın. Kalıntı kararı (E/H) sorulur. Kanıtta "diskte kalan dosya" listelendiyse dosyayı elle silip Recover'ı bir kez daha koşun; "dosya erişimi ÖLÇÜLEMEDİ" yazıyorsa önce belge kovasının okunabilirliğini düzeltin, sonra Recover'ı bir kez daha koşun.

## 5. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB 127.0.0.1:5448/d5_reset_test, sahte API 8199 / dış 8458)

| Test | Sonuç |
|---|---|
| `d6-selftest.js`: Z1 normal 0 (telefon: liste/indirme sha/silme sonrası boş); Z2 indirme sızıntısı (**200 + içerik**) → D6-4A FAIL "KAPSAM DIŞI BELGEYE ERİŞİLDİ" 2; Z3 silme sızıntısı → D6-4B/4C FAIL 2; Z4 liste sızıntısı → D6-2 FAIL 2; Z5 delete 500 → 6, Recover 6 ("sentetik belge kaldı"), cleanup=1 → satır silindi dosya listelendi 6, dosya elle → Recover 3; Z6 delete dosya bırakıyor → 6; **Z6-b/c/d ACL reddi (gerçek `icacls`: dosya F + dizin RD) → Recover P6-C-DOC ÖLÇÜLEMEYEN 6 ("yok" sayılmadı), ACL geri → FAIL 6, dosya elle → 3**; Z7 upload 500 → 2; Z8 yarım kalma (D6-3 sonrası SIGKILL) → Recover kapatır, belge kaldı 6 → cleanup + dosya → 3; Z9 telefon yüklemesi silindi 0 / silinmedi 6; Z10 kapılar 3/3/4/4/1/4 + **Z10-g/h izole mod API kapısı 4/4**; Z11 create 500 → 6; Z12 guard bayat → ürün bulgusu 6; **Z16-a geç oluşma (late) → hesap kapanışta görüldü ve kapatıldı 2 · Z16-b/c askıda (hold) → 6, sonradan aktif, Recover kapatır 3 · Z16-d Recover beklerken oluşur → 3 · Z16-e Recover bittikten sonra oluşur → 6, ikinci Recover 3**; Z13 konsolsuz 4; Z14 makbuz 1; S-1 sır sızıntısı yok; T/P statik (**P-3 üç durumlu yoklama birimi, P-4 API kapısı birimi**; T-3..T-7 owner bloğunu statik inceler) | **51/51 PASS, çıkış 0** — inceleme düzeltmesi `fix-r01\d6-selftest-fix-run2.log`; orkestratör tekrarı `orkestrator-dogrulama\d6-selftest.txt` 51/51 rc=0; **kapanış düzeltmesi (blok değişti) `kapanis-duzeltme\d6-selftest.log` 51/51, çıkış 0** |
| `d6-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; N; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; **B-1..B-5 kova okunabilirliği (gerçek ACL reddi)**; R-1..R-9; V-0..V-5; L-1/L-2 7 süre; O-1..**O-5**; Z; Q + **Q-R05**; S-1..S-4 + **S-5 topoloji literali yok**) | inceleme düzeltmesi **58/58** WinPS 5.1.26100 (`fix-r01\d6-block-selftest-winps-fix-final.log`) ve pwsh 7.6.6 (`…-pwsh-fix-final.log`); orkestratör tekrarı 58/58 ×2; **kapanış düzeltmesi (6 yeni test) 64/64 WinPS 5.1 (`kapanis-duzeltme\d6-block-selftest-winps.log`) ve 64/64 pwsh 7.6.6 (`…-pwsh.log`), çıkış 0** — ilk kapanış koşumu 63/64 (K-7: IPv4 adres biçim kapısından geçiyordu → kapı düzeltildi, yeniden koşuldu) |

Öz-testte "telefon" bir istemci taklididir; giriş bilgisini koşucunun **yalnız display=none ve canlı olmayan DB'de** yazdığı test
dosyasından (`D6_TEST_DISPLAY_SINK`) alır — bu yol kaynakta tek yerde, `if (con)` dalının dışında ve owner bloğunda kurulmaz (T-2, S-4).
Kanıt: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\extacc-d6-package-r01\` (ilk paket), `…\fix-r01\` (inceleme düzeltmeleri),
`…\orkestrator-dogrulama\` (bağımsız tekrar) ve `…\kapanis-duzeltme\` (kapanış düzeltmesi: blok + blok öz-testi değişti; koşucu değişmedi).

## 6. Pinler (ölçülen değerler, 2026-09-29 kapanış düzeltmesi sonrası)

| Dosya | sha256 |
|---|---|
| `d6-portal-documents-live-run.js` (koşucu; bloktaki `PkgPins` girdisiyle **eşit**) | `5D74206BAA26FD752FA57C3342698EDD870CA25A8BDB20B9C2213600EDE758DD` |
| `d6-qr-test.js` (PkgPins) | `C9FC15AADBFDF4AA87702542340EB6A5C68558D3FE6423F06DED8E452D85F418` |
| `d6-owner-live-block.ps1` (kapanış düzeltmesi: host/kullanıcı yolu literali kaldırıldı, R05 owner girdisi + adres biçim kapısı; önceki `DE3634BE…5321`) | `A206E19E208F791631F94A4A0C1A67D435BA9AC35CD3E71F72164B9185DA3629` |
| `d6-fake-portal-api.js` | `27D8CBADE5694F398151BBA0CCFB10C0472383CFF1E3DD24DEA49EFDD587953A` |
| `d6-selftest.js` | `E9FB37DC6D4069682722C4C4ADCCAA1E8F29D771F0E1A8508D3EC1D78686F2C2` |
| `d6-owner-block-selftest.ps1` (kapanış düzeltmesi: 6 yeni test; önceki `35E82EFC…BD02`) | `4E7ED8D7531CDC49FBDE783B3DAD9C2F9BEB675C1EF30504B09FC0B3E5D15E95` |

Paket digest (blok içinde `$ExpPackage`; 9 pinli dosyanın `yol\0sha\n` sıralı birleşiminin sha256'sı): `7C54C0FC38D85548D0B626A3D60D2CD7DF07080CC13F6C20C682933B1790F057`
— bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0). `ExpLiveDist` = R27
`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`; `ExpEnvSha` EXTACC bloğuyla aynı. Blok dosyasının kendisi PkgPins'te
**değildir** (koşucu bloğu yüklemez); blok değişince paket digest'i değişmez, yalnız bu tablo güncellenir.

PkgPins = koşucunun gerçek require ağacı (reqtree ile ölçüldü: ah-lib, i3-lib, extacc-display, qrcode vendor, h5-url-live-run,
i12-live-identity, i13-lib, koşucu) + `d6-qr-test.js`. Koşucu değiştiğinde pin ve paket digest'i `d6_pins.py` yöntemiyle yeniden hesaplanır.

## 7. Sınırlar ve owner kararları

- Sahte API ürünün kendisi değildir: ürünün gerçek multer/kova/`assertContained`/hız sınırı davranışı yalnız canlıda ölçülür. Kova kökü
  (`HUKUK_DATA_ROOT`) görev ortamından geliyorsa Preflight yalnız "env-dosyasinda-yok" notu düşer; koşucu `filePath`'i DB'den alıp `stat` yapar.
- Telefon yüklemesi opsiyoneldir ve makine ölçümü değildir; silinmezse kalıntı → 6 → Recover'da **owner kararı** (satır Prisma ile; dosya elle).
- **D6-6 onay/ret bilinçli olarak çağrılmaz** (bildirim satırı + silme kilidi). Onay/ret akışının canlı kabulü istenirse **ayrı paket** — owner kararı.
- Yabancı sentetik satır ürün ucu dışı (Prisma) yazılır ve silinir; kanıtta açıkça raporlanır. Audit/log kayıtları silinmez ("saklandı").
- **Makbuz (`d6-setup-receipt.json`) ve kanıt JSON'u canlı belge kovasının MUTLAK yolunu içerir** (`documentFile`, `residueFiles`; Recover'ın
  diskte yoklaması için gerekli). Bu dosyalar repoya/belgeye **kopyalanmaz**, yalnız owner'ın yerel kanıt dizininde kalır.
- Dosya erişimi `olculemez` ise (kova ACL) Run/Recover PASS vermez (6); kova okunabilirliğini owner düzeltir; Preflight bunu önceden ölçer.
- İzole mod API kapısı yalnız D-6'da; D-5 koşucusu aynı sertleştirmeyi taşımaz (ayrı kayıt; bu paket D-5'i değiştirmez).
- `extacc-qr-test.js` yalnız `/portal/login` kabul eder; D-6 kendi `d6-qr-test.js`'ini kullanır (D-5 bloğunun QrTest modu `/portal/forgot-password`
  ile aynı betiği çağırır → orada çıkış 4 beklenir; ayrı kayıt, bu paket D-5'i değiştirmez).
- Bu paket H1–H8 sayacını değiştirmez (0/8). Canlı koşum için ayrı owner GO gerekir (`OWNER-GO-CLIENT-EXTACC-D6-YYYYMMDD-RNN`; literal belgeye yazılmaz).

## 8. İnceleme düzeltmeleri (R01, 2026-09-29; iki bağımsız inceleme)

| # | Bulgu | Karar | Değişiklik |
|---|---|---|---|
| 1 | Geç oluşma senaryoları öz-testte yok; `createUncertain` dalında kalıntı ölçülmüyor | ÖNEMLİ — **düzeltildi** | Z16-a..e (D-4 y17–y20 kalıbı; `recover()` `during` kancası); `closePortal` geç oluşma dalında `documentResidue` çağrılır |
| 2 | `fileExists` erişim reddini "yok" sayıyor | ÖNEMLİ — **düzeltildi** (Windows'ta EPERM ölçüldü) | `fileState` üç durumlu; P6-C-DOC/D6-5D `olculemez` → ÖLÇÜLEMEYEN; `filesAccessError`; kurtarma notu/adımı; Preflight `Test-BucketReadable`; Z6-b/c/d + P-3 + B-1..B-5 |
| 3 | Onay metni "maskelenmiş" — kaynak maskesiz | KÜÇÜK — **düzeltildi** | Blok metni "MASKESİZ … kişisel veri yok"; O-4 |
| 4 | Recover bitiş metni 0'ı güçlü anlatıyor | KÜÇÜK — **düzeltildi** | Metin "0 = hesap hiç açılmamıştı (HTTP reddi ölçülmedi) · 3 = …"; O-5; §2 |
| 5 | Sahte `download: leak` 400 döndürüyor, 200 dalı ölçülmüyor | KÜÇÜK — **düzeltildi** | Leak 200 + içerik; Z2 "KAPSAM DIŞI BELGEYE ERİŞİLDİ" metnini doğrular |
| 6/8 | D6-6 "opsiyonel" etiketi koşucuyla çelişiyor; sapma owner kararı olarak yok | KÜÇÜK — **düzeltildi** (koşucu zorunlu ölçüt olarak kaldı) | §1 sapma kaydı, §2 satırı, §7 owner kararı |
| 7 | Adım 7 yer tutucu; ExpLiveDist kısaltılmış | KÜÇÜK — **düzeltildi** | §4 adım 7 yer tutucusuz; tam 64 hex §1/§6 |
| 9 | D-8 §4 telefon yükleme beyanından sapma kaydı yok | KÜÇÜK — **düzeltildi** | §1 sapma kaydı |
| 10 | Çalışma ağacında D-6 dışı kirli dosyalar | KÜÇÜK — **eylem yok (bu paket dokunmadı)** | Commit kapsamı yalnız `client-extacc-portal-d6-r01/`; D-5/D-8/R27 dosyaları sahiplerince ayrı |
| 11 | Makbuz/kanıt mutlak kova yolu notu yok | KÜÇÜK — **düzeltildi** | §7 |
| 12 | İzole modda API adresi kapısı yok | KÜÇÜK — **düzeltildi** (yalnız D-6) | `commonGates` loopback + 8080 dışı port; Z10-g/h + P-4 |
| 13 (kapanış) | §6 pin tablosu dosyalarla uyuşmuyordu (koşucu `C8091219…` yazıyordu, gerçek `5D74206B…`; paket digest `3C0B9FD9…` yazıyordu, blok ve bağımsız hesap `7C54C0FC…`); diğer pinler "§8 tablosu"na atıfla verilmişti, tabloda yoktu | ENGELLEYİCİ — **düzeltildi** | §6 tüm dosyalar için ölçülen sha256; paket digest bağımsız yeniden hesaplandı (`kapanis-duzeltme\pin-dogrulama.txt`) |
| 14 (kapanış) | Öz-test sonuçları belgeye yazılmamıştı (§5/§8 yer tutucu) | ÖNEMLİ — **düzeltildi** | §5 satırları ölçülen sayılar + kanıt dosya adları; §8 koşum tablosu |
| 15 (kapanış) | Owner bloğu public repoya canlı topoloji ayrıntısı taşıyordu (public host literali, yerel kullanıcı yolu) | ÖNEMLİ — **düzeltildi** | `$ExpBaseUrl` canlı `.env`'den (`Assert-PortalBaseUrl` biçim kapısı) + Run/QrTest'te owner'ın yazdığı R05 adresiyle eşleşme (`Confirm-PortalBaseUrlR05`); `$EvRoot` = `$env:USERPROFILE`'a göreli; canlı kök tek yerde. Blok öz-testi K-6/K-6b/K-7/K-8/Q-R05/S-5. D-4/D-5/EXTACC blokları için aynı sertleştirme **ayrı iş** (R27 belgesi §9) |

Reddedilen bulgu yok. Düzeltme koşumlarının sonuçları (ölçülen değerler):

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `node --check` (4 js) · `Parser::ParseFile` (2 ps1) · BOM | 0 hata · 0 hata · BOM var | `kapanis-duzeltme\parse-bom-ps1.txt`, `node-check.txt` |
| `d6-selftest.js` (inceleme düzeltmesi sonrası) | **51/51 PASS**, çıkış 0 | `fix-r01\d6-selftest-fix-run2.log`; tekrar `orkestrator-dogrulama\d6-selftest.txt` (51/51, rc=0) |
| `d6-owner-block-selftest.ps1` (inceleme düzeltmesi sonrası) | **58/58 PASS** WinPS 5.1.26100 · **58/58 PASS** pwsh 7.6.6 | `fix-r01\d6-block-selftest-winps-fix-final.log`, `…-pwsh-fix-final.log`; tekrar `orkestrator-dogrulama\d6-owner-block-selftest.ps1-*.txt` |
| `d6-selftest.js` (kapanış düzeltmesi; blok değişti, koşucu aynı sha) | **51/51 PASS**, çıkış 0 | `kapanis-duzeltme\d6-selftest.log` |
| `d6-owner-block-selftest.ps1` (kapanış düzeltmesi, 64 test) | **64/64 PASS** WinPS 5.1.26100 · **64/64 PASS** pwsh 7.6.6 (ilk koşum 63/64: K-7 IPv4 kabulü → kapı düzeltildi) | `kapanis-duzeltme\d6-block-selftest-winps.log`, `…-pwsh.log`, `selftest-summary.txt` |
