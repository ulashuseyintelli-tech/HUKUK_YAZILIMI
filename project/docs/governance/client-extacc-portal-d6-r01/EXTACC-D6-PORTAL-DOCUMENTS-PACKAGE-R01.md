# EXTACC D-6 — PORTAL BELGE AKIŞI CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Canlı Run/Recover ve yayın bu paketle yetkilendirilmez.
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`); owner bloğu bu pini doğrular,
> R26 canlı ile Preflight/Run **DUR** verir. Uygulama sırası: R27 yayınından **sonra** (D-5 ile aynı koşul).
> Tanım: `client-extacc-d8-staff-surface-r01` §4 ve §6. İki bağımsız inceleme sonrası düzeltmeler: §8.
>
> **R02 (2026-10-01) — yalnız owner bloğu METNİ + blok öz-testi + bu belge.** Koşucu, sahte API, QR betiği ve bloğun pin listesindeki 9 dosya
> **değişmedi**; paket digest'i aynı (§6). **Owner kuralı (2026-10-01):** Run çıkış 5/6 otomatik Recover yetkisi **değildir**. Run'ın koşucu
> içindeki kendi kapanış adımları ile ayrıca başlatılan Recover **ayrıdır**; Recover yalnız kanıt incelendikten sonra **ayrı owner onayıyla,
> bir kez** başlatılır; blok Recover'ı başlatmaz. Değişiklik listesi, mantık eşitliği ölçümü ve test sonuçları: §9. R02'den önce yazılmış
> sonuç satırları ve kanıt atıfları (§5, §8) olduğu gibi bırakılmıştır; R02 satırları ayrıca eklenmiştir.

## 1. Ne ölçer ve ne yapmaz

Uçtan uca belge akışı: koşucu (makine ölçümü) **dış HTTPS** uçtan kendi multipart yüklemesini yapar → liste (yerel + dış) → indirme
(içerik sha256) → personel bekleyen liste (yerel, salt okuma) → kapsam dışı belge 404 (indirme + silme) → owner telefondan girip
listeyi/indirmeyi görür (telefon yüklemesi opsiyonel) → koşucu kendi belgesini **ürün DELETE'i** ile siler → satır + dosya yok → owner
listeyi yeniler (boş) → kapanış (D-4 R03 kuralları + belge kalıntısı). Koşucu **dosya silmez** (yalnız üç durumlu `stat` yoklaması),
forgot/reset/change-password, mesaj ve belge onay/ret uçlarını **çağırmaz**; parolaları, token'ları, GO'yu ve DB URL'yi **kendi** kanıt, makbuz ve
log dosyalarına yazmaz (ölçüm: öz-test S-1, sahte API'ye karşı). Canlı API uygulama günlüğü ve terminal/işletim sistemi kayıtları bu ölçümün
**kapsamı dışındadır** (R02; §7).

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

**R02 — telefon yüklemesi ve kova dizini (kaynak: R27 adayı `1b758d29`; `portal.controller.ts`, `portal.service.ts`,
`common/storage/runtime-storage-paths.ts`; kaynaktan okundu, canlıda ölçülmedi):**
- Yükleme günlük satırı (`Portal belgesi yüklendi: <fileName> (Client: <clientId>)`) `file.originalname` değerini **maskesiz** yazar. Koşucunun
  kendi yüklemesinde bu ad sentetiktir (`d6-<runId>.pdf`). Owner telefondan yükleme yaparsa **seçtiği dosyanın adı** canlı API günlüğüne
  maskesiz yazılır; bu satır kapanışta silinmez (koşucu ve blok günlükleri değiştirmez, silmez). Dosyanın kendisi canlı belge kovasına
  yazılır (disk adı `portal-<zaman>-<rastgele><uzantı>`; özgün ad DB satırında ve günlükte); telefondan silinmezse satır + dosya kalır → çıkış 6.
- `bucketDir` tenant dizinini ilk yüklemede oluşturur (`mkdirSync`); ürün DELETE'i yalnız dosyayı siler (`unlinkSync`). Kapanıştan sonra
  sentetik tenantın **boş kova dizini** (`<HUKUK_DATA_ROOT>/portal-documents/<tenantId>/`) diskte kalır — **saklandı**; koşucu ve blok dizin silmez.
Bu iki etki owner'a canlı veri işleme onay metninde gösterilir (blok öz-testi G-2).

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
**R02:** bu paragraf koşucunun Recover modundaki **davranışını** anlatır; bir çıkış kodu Recover'ı **yetkilendirmez**. Her Recover başlatması
(yukarıdaki "bir kez daha" dahil) kanıt incelendikten sonra **ayrı owner onayı** ister ve blok onu kendiliğinden başlatmaz (§4 adım 7, §7).

## 3. Owner bloğu (`scripts/d6-owner-live-block.ps1`) — modlar ve sıra

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` **biçim kapısı** (https + yalnız alan
adı; yol/port/IP/localhost DUR) — adres canlı `.env`'den okunur, blokta host literali **yoktur**; R05 eşleşmesi Run/QrTest'te owner'ın konsola
yazdığı adresle ölçülür (eşleşmezse GO sorulmadan DUR), `HUKUK_DATA_ROOT` .env'de
varsa dizin var **ve `portal-documents` alt dizini okunabilir** (yoksa not; okunamıyorsa DUR), 8080 tek dinleyici, yabancı kabul süreci yok,
DB kimliği, dış zincir 8081 loopback = HY-Caddy, Cloudflared) · QrTest (`/portal/documents`; kendi `d6-qr-test.js`) · **Run**: konsol →
bağımsız pencere teyidi → canlı veri işleme "EVET" (metin: yükleme günlüğü **maskesiz**, kişisel veri yok) → GO → defter (sha256) → koşum
→ ekran temizliği → owner beyanı (9 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`; kalıntı kararı E/H sorulur; GO sorulmaz.
Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama · 120 sn inceleme · 120 sn geç oluşma · 5 dk kalıntı bekleme).

**R02 — owner'a gösterilen metin (sıra, kapılar ve çıkış kodları değişmedi):** (a) canlı veri işleme onayı ayrıca telefon yüklemesinin
günlük (dosya adı maskesiz) ve kova etkisini, kapanışta kalan boş kova dizinini ve çıkış 5/6'nın Recover yetkisi olmadığını yazar; (b) koşum
sonu "kapanış" metni artık koşulsuz "DB + yeni giriş + mevcut oturum reddi …" demez: `P6-D9` PASS ise altı parçanın her biri kanıttaki ölçüt
verdict'lerinden yazılır (`DB kapalı [P6-C2/C2V/C5]`, `yeni giriş reddi [P6-C3L/D]`, `mevcut oturum reddi — koşucunun kendi portal oturumu
[P6-C4L/D]`, `belge kalıntısı yok [P6-C-DOC]`, `yabancı satır temiz [P6-FOREIGN-CLEAN]`, `personel/dosya kapanışı [U-CLOSE]`): gruptaki tüm
ölçütler PASS ise "PASS", biri FAIL ise "FAIL", aksi halde "ÖLÇÜLMEDİ". Telefondaki oturumun reddini koşucu ölçmez (owner beyanı);
(c) Run çıkış 5/6, belge kalıntısı ve Recover çıkış 6 satırları Recover talimatı vermez: çıkış kodu Recover yetkisi değildir, blok Recover
başlatmaz, önce kanıt incelenir, Recover yalnız ayrı owner onayıyla bir kez; kanıttaki kurtarma adımı bir **öneridir**.

## 4. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme; yalnız ekranda gördüğünüz değerleri kullanın)

1. Bağımsız PowerShell penceresi (uygulama paneli DEĞİL). `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
   **R02 — pencereyi owner doğrudan açar** (Başlat menüsü → Windows PowerShell). Ajan pencereyi PowerShell 7 içinden `Start-Process` ile
   açarsa çocuk Windows PowerShell 5.1 süreci PS7 modül yolunu (`PSModulePath`) devralır ve `Get-FileHash` **bulunamaz** (2026-10-01'de
   D-5'te ölçüldü; bu pakette yerel olarak yeniden ölçüldü: `d6-r02\test\ps51-modul-yolu-olcumu.log` — `Start-Process` → `Get-FileHash=False`,
   doğrudan çağrı → `True`). Bloğun `Sha` fonksiyonu `Get-FileHash` kullanır; bulunamazsa pin kapıları ölçüm yapamaz. Bu yol kullanılacaksa
   çocuk süreç için modül yolu önce düzeltilmelidir (ölçülen düzeltme: `Start-Process` öncesinde ebeveyn ortamından `PSModulePath`
   geçici olarak kaldırılır → çocuk kendi varsayılanını kurar → `Get-FileHash=True`).
2. `-Mode QrTest` → R05 kararındaki public portal adresini yazın (canlı `.env` değeriyle eşleşmeli) → telefonla QR okutun; belgeler/giriş sayfası açılırsa **E**; giriş yapmayın.
3. `-Mode Run`: pencere teyidi **E**, R05 public portal adresi (https://…), canlı veri işleme **EVET**, GO ref.
4. Konsol ekranı (1/2): QR'ı okutun, ekrandaki e-posta + parola ile **bir kez** giriş yapın; listede yalnız ekrandaki başlık olmalı; belgeyi indirin (PDF'de koşum kimliği yazar). Telefondan yükleme yapmak isterseniz yapın; koşucu "D6-RESIDUE-WAIT" gösterirse kendi yüklemenizi telefondan **silin**.
   **R02:** telefondan yüklerseniz seçtiğiniz dosyanın **adı** canlı API günlüğüne maskesiz yazılır (satır kalır) ve dosya canlı belge kovasına
   yazılır; adında ve içeriğinde kişisel veri **olmayan** bir dosya seçin. Silmezseniz satır + dosya kovada kalır ve koşum 6 ile biter.
5. Konsol ekranı (2/2): koşucu kendi belgesini sildi — listeyi yenileyin; boş olmalı.
6. Ekran temizlenince 9 beyan sorusunu yanıtlayın (parola yazmayın). Pencereyi kapatın.
7. **Çıkış 5/6 Recover yetkisi DEĞİLDİR (R02; owner kuralı 2026-10-01).** Run kendi kapanış adımlarını koşucu **içinde** zaten denemiştir;
   blok Recover'ı **başlatmaz**. Sıra:
   - (a) Pencereyi kapatın. Koşum bitiş ekranındaki "kanıt dizini" satırındaki dizinde `d6-evidence.json` (kurtarma/inceleme nedeni ve açık
     kalan kaynaklar) ile `d6-setup-receipt.json` vardır. Önce **kanıtı inceleyin** ve sonucu CLIENT'a bildirin.
   - (b) Recover **yalnız ayrı bir owner onayıyla, bir kez** başlatılır: yeni bir pencerede `-Mode Recover -ReceiptFile` ve ardından
     `d6-setup-receipt.json` dosyasının tam yolu. Kalıntı kararı (E/H) sorulur. Kanıttaki `recovery.adim` metni bir **öneridir**, yetki değildir.
   - (c) Recover 6 verirse bu da yeni bir Recover yetkisi **değildir**: kanıtta "diskte kalan dosya" listelendiyse dosyayı owner elle siler;
     "dosya erişimi ÖLÇÜLEMEDİ" yazıyorsa önce belge kovasının okunabilirliği düzeltilir. Sonraki Recover yine kanıt incelendikten sonra
     **yeni ve ayrı bir owner onayıyla, bir kez** başlatılır. Recover 3 verirse Recover tekrarlanmaz. Kabul koşumu (Run) tekrarlanmaz.

## 5. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB 127.0.0.1:5448/d5_reset_test, sahte API 8199 / dış 8458)

| Test | Sonuç |
|---|---|
| `d6-selftest.js`: Z1 normal 0 (telefon: liste/indirme sha/silme sonrası boş); Z2 indirme sızıntısı (**200 + içerik**) → D6-4A FAIL "KAPSAM DIŞI BELGEYE ERİŞİLDİ" 2; Z3 silme sızıntısı → D6-4B/4C FAIL 2; Z4 liste sızıntısı → D6-2 FAIL 2; Z5 delete 500 → 6, Recover 6 ("sentetik belge kaldı"), cleanup=1 → satır silindi dosya listelendi 6, dosya elle → Recover 3; Z6 delete dosya bırakıyor → 6; **Z6-b/c/d ACL reddi (gerçek `icacls`: dosya F + dizin RD) → Recover P6-C-DOC ÖLÇÜLEMEYEN 6 ("yok" sayılmadı), ACL geri → FAIL 6, dosya elle → 3**; Z7 upload 500 → 2; Z8 yarım kalma (D6-3 sonrası SIGKILL) → Recover kapatır, belge kaldı 6 → cleanup + dosya → 3; Z9 telefon yüklemesi silindi 0 / silinmedi 6; Z10 kapılar 3/3/4/4/1/4 + **Z10-g/h izole mod API kapısı 4/4**; Z11 create 500 → 6; Z12 guard bayat → ürün bulgusu 6; **Z16-a geç oluşma (late) → hesap kapanışta görüldü ve kapatıldı 2 · Z16-b/c askıda (hold) → 6, sonradan aktif, Recover kapatır 3 · Z16-d Recover beklerken oluşur → 3 · Z16-e Recover bittikten sonra oluşur → 6, ikinci Recover 3**; Z13 konsolsuz 4; Z14 makbuz 1; S-1 sır sızıntısı yok; T/P statik (**P-3 üç durumlu yoklama birimi, P-4 API kapısı birimi**; T-3..T-7 owner bloğunu statik inceler) | **51/51 PASS, çıkış 0** — inceleme düzeltmesi `fix-r01\d6-selftest-fix-run2.log`; orkestratör tekrarı `orkestrator-dogrulama\d6-selftest.txt` 51/51 rc=0; **kapanış düzeltmesi (blok değişti) `kapanis-duzeltme\d6-selftest.log` 51/51, çıkış 0** |
| `d6-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; N; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; **B-1..B-5 kova okunabilirliği (gerçek ACL reddi)**; R-1..R-9; V-0..V-5; L-1/L-2 7 süre; O-1..**O-5**; Z; Q + **Q-R05**; S-1..S-4 + **S-5 topoloji literali yok**) | inceleme düzeltmesi **58/58** WinPS 5.1.26100 (`fix-r01\d6-block-selftest-winps-fix-final.log`) ve pwsh 7.6.6 (`…-pwsh-fix-final.log`); orkestratör tekrarı 58/58 ×2; **kapanış düzeltmesi (6 yeni test) 64/64 WinPS 5.1 (`kapanis-duzeltme\d6-block-selftest-winps.log`) ve 64/64 pwsh 7.6.6 (`…-pwsh.log`), çıkış 0** — ilk kapanış koşumu 63/64 (K-7: IPv4 adres biçim kapısından geçiyordu → kapı düzeltildi, yeniden koşuldu) |
| **R02 (2026-10-01)** `d6-owner-block-selftest.ps1` — **son baytlar** (blok `5AEF3893…FA61`, öz-test `810BDEF5…9FB4`; log her koşumda test edilen bloğun sha256'sını yazar). 64 önceki test + 7 yeni: **G-1** kapsamsız mutlak iddia yok + başlık kapsamı adlandırır + geçici parola kanıt dizininde yok · **G-2** gösterilen onay metni (telefon yüklemesi günlük/kova, boş kova dizini, 5/6 Recover yetkisi değil) · **G-3** Recover çıkış 6 yeni Recover yetkisi değil · **G-4** Run çıkış 5/6 metni + tek node çağrısı + çıkış 0'da Recover metni yok · **O-6..O-8** kapanış metni kanıttaki verdict'lerden | **71/71 PASS** Windows PowerShell 5.1.26100 (`d6-r02\test\blok-oz-test-winps51.log`) ve **71/71 PASS** PowerShell 7.6.6 (`d6-r02\test\blok-oz-test-pwsh7.log`), çıkış 0. **Negatif kontrol:** eski blok baytları (`A206E19E…3629`) + yeni öz-test → **64/71**, çıkış 1, FAIL = G-1, G-2, G-3, G-4, O-6, O-7, O-8 (iki sürümde de; `d6-r02\neg\neg-eski-blok-winps51.log`, `…-pwsh7.log`) |
| **R02** `d6-selftest.js` (T-3..T-7 owner bloğunu statik okur) | Commit'li dosya baytlarıyla doğrudan koşum **KOŞULAMADI**: betik Prisma/bcrypt'i sabit yoldan, canlı yayın ağacının `node_modules` dizininden yükler; R02 iş talimatında canlı yayın ağacına erişim yasaktı. **Ayna koşumu** (yalnız `const REL` satırı canlı olmayan R27 aday çalışma ağacına çevrilmiş kopya; diğer 6 governance betik dizini ve yeni blok baytları aynen): **51/51 PASS**, çıkış 0, T-3..T-7 PASS (`d6-r02\test\d6-selftest-ayna.log`, kurulum farkı `d6-selftest-ayna-kurulum.json`: değişen satır 19, aynada farklı dosya 1). Bu sonuç commit'li `d6-selftest.js` baytlarının koşumu **değildir** |

Öz-testte "telefon" bir istemci taklididir; giriş bilgisini koşucunun **yalnız display=none ve canlı olmayan DB'de** yazdığı test
dosyasından (`D6_TEST_DISPLAY_SINK`) alır — bu yol kaynakta tek yerde, `if (con)` dalının dışında ve owner bloğunda kurulmaz (T-2, S-4).
Kanıt: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\extacc-d6-package-r01\` (ilk paket), `…\fix-r01\` (inceleme düzeltmeleri),
`…\orkestrator-dogrulama\` (bağımsız tekrar) ve `…\kapanis-duzeltme\` (kapanış düzeltmesi: blok + blok öz-testi değişti; koşucu değişmedi).

**R02 — kanıt atıfları (son baytlar):** yukarıdaki R02 öncesi satırlar **önceki** blok/öz-test baytlarıyla (blok `A206E19E…`, öz-test `4E7ED8D7…`
ve daha eskileri) koşulmuş logları gösterir; R02 baytları için geçerli tek kanıt `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\`
dizinidir (`test\` son koşumlar + status dosyaları: komut, çıkış kodu, test edilen dosyaların sha256'sı; `neg\` negatif kontroller; `onceki\`
R02 öncesi baytlar). Yer düzeltmesi: `fix-r01\` ve `review-r01\` dizinleri `extacc-d6-package-r01\` altındadır; `orkestrator-dogrulama\` ve
`kapanis-duzeltme\` dizinleri ise `HY_R27_AGENT_EVIDENCE\` kökündedir (üstteki "…\" kısaltması bunu ayırmıyordu).

## 6. Pinler (ölçülen değerler; sha256 ham dosya baytı — 2026-10-01 R02 sonrası)

| Dosya | sha256 |
|---|---|
| `d6-portal-documents-live-run.js` (koşucu; bloktaki `PkgPins` girdisiyle **eşit**; R02'de değişmedi) | `5D74206BAA26FD752FA57C3342698EDD870CA25A8BDB20B9C2213600EDE758DD` |
| `d6-qr-test.js` (PkgPins; R02'de değişmedi) | `C9FC15AADBFDF4AA87702542340EB6A5C68558D3FE6423F06DED8E452D85F418` |
| `d6-owner-live-block.ps1` (**R02**: yalnız metin + kapanış metni ifadesi; önceki — kapanış düzeltmesi — `A206E19E208F791631F94A4A0C1A67D435BA9AC35CD3E71F72164B9185DA3629`; ondan önceki `DE3634BE…5321`) | `5AEF38932FE9458F799349C559649E8AB75A2585C7A403EDB066BC9F58AFFA61` |
| `d6-fake-portal-api.js` (R02'de değişmedi) | `27D8CBADE5694F398151BBA0CCFB10C0472383CFF1E3DD24DEA49EFDD587953A` |
| `d6-selftest.js` (R02'de değişmedi) | `E9FB37DC6D4069682722C4C4ADCCAA1E8F29D771F0E1A8508D3EC1D78686F2C2` |
| `d6-owner-block-selftest.ps1` (**R02**: 7 yeni test G-1..G-4, O-6..O-8 + gözlem dökümü + test edilen blok sha256 satırı; önceki — kapanış düzeltmesi, 6 yeni test — `4E7ED8D7531CDC49FBDE783B3DAD9C2F9BEB675C1EF30504B09FC0B3E5D15E95`; ondan önceki `35E82EFC…BD02`) | `810BDEF5C7EE4D1F98676C705C1BC9CBF73BDD969A27DA1686B6F70F801F9FB4` |

R02 pin doğrulaması: 9 pinli dosya dosyalardan yeniden hesaplandı, uyuşmazlık 0; paket digest'i yeniden hesap = blok `$ExpPackage`
(`d6-r02\test\paket-digest-dogrulama.log`).

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

**R02 ile eklenen sınırlar (2026-10-01):**
- **Recover kuralı (owner, 2026-10-01).** Run çıkış 5/6 otomatik Recover yetkisi **değildir**. Run'ın koşucu içindeki kendi kapanış adımları
  ile ayrıca başlatılan Recover **ayrıdır**. Recover yalnız kanıt incelendikten sonra **ayrı owner onayıyla, bir kez** başlatılır; blok Recover'ı
  başlatmaz (blok öz-testi: koşum başına tek node çağrısı — G-3/G-4, R-2). Recover çıkış 6 da yeni bir Recover yetkisi değildir; sonraki
  Recover yeni ve ayrı owner onayı ister. Bu paket Recover için bir GO ref'i **sormaz** (blok mantığı R02'de değişmedi); ayrı onayın nasıl
  kaydedileceği bu paketin dışındadır (owner kararı).
- **Koşucunun kanıta yazdığı kurtarma metni değişmedi (koşucu değişikliği gerektirir; R02'de yapılmadı — §9 D6-E9).** Koşucu `d6-evidence.json`
  içindeki `recovery.neden` / `recovery.adim` alanlarına doğrudan adım yazar (ör. "Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile",
  "Recover BİR KEZ", "Recover BİR KEZ daha"). Bu metinler **öneridir**, yetki değildir; blok çıkışında ve §4 adım 7'de böyle okunması yazılıdır.
  Metnin kendisini düzeltmek koşucu değişikliği + yeni dosya pini + yeni paket digest'i + `d6-selftest.js` koşumu gerektirir (ayrı iş).
- **Sır iddiasının kapsamı.** "Yazmaz" iddiası yalnız bloğun ve koşucunun **kendi** kanıt/log dosyaları için ve yalnız ölçüldüğü ölçüde geçerlidir:
  blok öz-testi R-9 + G-1 (kanıt dizini + GO defterinde GO literali, DB URL ve geçici portal parolası yok; geçici node ile), koşucu öz-testi S-1
  (sahte API'ye karşı). Canlı API uygulama günlüğü, işletim sistemi / terminal kayıtları ve owner'ın beyan sorularına yazdığı yanıt metni
  **ölçülmedi**.
- **Telefon yüklemesi.** Dosya adı canlı API günlüğüne maskesiz yazılır ve satır kalır; dosya canlı belge kovasına yazılır (§1 R02 notu).
  Bu etkiler kaynaktan okunmuştur; canlıda ölçülmedi. Owner'a onay metninde gösterilir.
- **Boş kova dizini.** Kapanıştan sonra sentetik tenantın boş kova dizini diskte kalır — **saklandı** (koşucu ve blok dizin silmez; §1 R02 notu).
- **Kapanış metni.** "DOĞRULANDI" yalnız kanıtta PASS yazan parçalar içindir; "mevcut oturum reddi" koşucunun **kendi** portal oturumudur.
  Telefondaki oturumun reddi makineyle ölçülmez (yalnız yenileme beyanı).
- **`d6-selftest.js` R02'de commit'li baytlarıyla koşulamadı** (canlı yayın ağacından modül yükler; R02 talimatında o ağaca erişim yasaktı).
  Ayna koşumu §5'te; sonuç commit'li dosyanın koşumu sayılmaz. Betiğin canlı ağaç bağımlılığı ayrı bir düzeltme konusudur (bu paket değiştirmedi).
- **Pencere açma yolu.** Ajanın PowerShell 7'den `Start-Process` ile açtığı Windows PowerShell 5.1 penceresinde `Get-FileHash` bulunamaz
  (§4 adım 1); blok bu durumu kendisi düzeltmez.

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

## 9. R02 düzeltmeleri (2026-10-01; yalnız blok metni + blok öz-testi + bu belge)

Kapsam: koşucu (`d6-portal-documents-live-run.js`), sahte API, `d6-selftest.js`, QR betiği ve bloğun pin listesindeki 9 dosya **değişmedi** →
paket digest'i aynı (§6). Blok **mantığı** değişmedi; tek istisna D6-E2'deki kapanış metni ifadesidir (aşağıda ölçüldü). R02 hazırlanırken
canlı ortamda owner bloğu, koşucu, sonda ya da servis/görev komutu koşulmadı; bu revizyon canlı Run/Recover'ı yetkilendirmez.

| # | Bulgu | Karar | Değişiklik |
|---|---|---|---|
| D6-E1 | Çıkış 5/6 metinleri doğrudan Recover talimatı veriyordu: blok başlığındaki Recover satırı, Run çıkış 5/6 satırı (`KAPANIŞ DOĞRULANMADI: -Mode Recover …`), belge kalıntısı satırı, Recover çıkış 6 satırı ("Recover BİR KEZ daha koşulur") ve onay metnindeki "(Recover'da owner kararı)" | ÖNEMLİ — **düzeltildi** | Metinler D-5 R04 kalıbına çekildi: Run'ın koşucu içindeki kendi kapanışı ≠ Recover; çıkış kodu Recover yetkisi değil; blok Recover başlatmaz; önce kanıt incelenir; Recover yalnız ayrı owner onayıyla bir kez; kanıttaki adım öneridir. Belge §2, §3, §4 adım 7, §7. Öz-test G-2, G-3, G-4 |
| D6-E2 | Kapanış "DOĞRULANDI" metni yeni giriş ve mevcut oturum reddini koşulsuz iddia ediyordu; oysa portal hesabı hiç açılmadıysa ya da koşucunun portal oturumu yoksa `P6-D9` PASS olabilir ve bu ölçütler koşulmaz | KÜÇÜK — **düzeltildi** | `Get-ClosureStatus` içindeki `$st.text` ifadesi altı parçayı kanıttaki verdict'lerden kurar (PASS / FAIL / ÖLÇÜLMEDİ); "mevcut oturum" = koşucunun kendi oturumu; telefondaki oturumu koşucu ölçmez. Öz-test O-6, O-7, O-8 |
| D6-E3 | Onay metni telefon yüklemesinin günlük (dosya adı maskesiz) ve kova etkisini söylemiyordu | KÜÇÜK — **düzeltildi** | Blok onay metni (iki cümle) + §1 R02 notu + §4 adım 4 + §7. Öz-test G-2 |
| D6-E4 | Kapanışta sentetik tenantın boş kova dizini diskte kalır | KÜÇÜK — **düzeltildi (not: "saklandı")** | Blok başlığı + onay metni + §1 R02 notu + §7. Dizin silinmez; davranış değişmedi |
| D6-E5 | Blok başlığında kapsamsız mutlak ifade ("… hiçbir dosyaya yazılmaz") | KÜÇÜK — **düzeltildi** | Başlık kapsamı adlandırır (ölçülen dosyalar + ölçüm kaynağı + kapsam dışı); §1 cümlesi ve §7. Öz-test G-1 |
| D6-E6 | Pencereyi ajan PowerShell 7'den `Start-Process` ile açarsa çocuk Windows PowerShell 5.1'de `Get-FileHash` bulunamaz | KÜÇÜK — **düzeltildi (belge)** | §4 adım 1 + §7; yerel ölçüm `d6-r02\test\ps51-modul-yolu-olcumu.log` |
| D6-E7 / D6-E8 | Belgedeki öz-test kanıt atıfları son baytlarla koşulan loglara bağlı değildi | NİT — **düzeltildi** | §5 R02 satırları + "R02 — kanıt atıfları" notu; önceki sonuç satırları değiştirilmedi |
| D6-E9 | Koşucu değişikliği gerektiren kalem | **DÜZELTİLMEDİ** (R02 kapsamı: koşucu değişmez) | Bulgunun metni R02 oturumuna verilmedi. Koşucuda Recover temasıyla ilgili ölçülen kalem — kanıttaki `recovery.neden` / `recovery.adim` metinlerinin doğrudan Recover adımı yazması — §7'ye sınır olarak yazıldı. D6-E9 başka bir kalemse o kalem bu notun kapsamında **değildir** |

**Mantık eşitliği (AST; `d6-r02\test\mantik-esitligi.ps1` → `mantik-esitligi.log`; Windows PowerShell 5.1 ve PowerShell 7'de aynı sonuç).**
Yorumlar (39 → 56), `Write-Host` komutları (42 → 52) ve `Read-Answer`/`Read-Host` istem metinleri (15 → 15; değişmedi) çıkarılıp boşluk
normalize edildiğinde:
- **Ölçüm A (katı): eşit DEĞİL** — tek fark `Get-ClosureStatus` içindeki `$st.text = …` atamasıdır (ortak ön ek 13250, ortak son ek 6221
  karakter; farklı orta kısım 108 → 874 karakter).
- **Ölçüm B (bu tek atama iki dosyada da çıkarılmış): EŞİT** (19313 = 19313 karakter); fonksiyon sayısı 30 = 30.
- İstisna ifadesinin farkı: eski hali `verified` ise sabit bir cümle döndürüyordu; yeni hali `verified` ise zaten okunmuş kanıt nesnesinin
  (`$ev.results`) altı ölçüt grubunu dolaşıp cümleyi kurar. `verified` koşulu, `else` dalındaki "DOĞRULANAMADI" cümlesi, dönen diğer alanlar,
  dosya okuma/yazma, node çağrısı ve çıkış kodları **aynıdır**.
- Körlük kontrolü: yeni bloğun 4 mantık mutantı (5/6 koşulu, `verified` koşulu, EVET karşılaştırması, `Fail` mesajı) → "eşit değil";
  yalnız `Write-Host` metni değişen kontrol kopyası → "eşit" (`d6-r02\neg\mantik-mutant\`).

| R02 koşumu (son baytlar) | Sonuç | Kanıt (`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\`) |
|---|---|---|
| `Parser::ParseFile` (2 ps1) · BOM · satır sonu · kontrol karakteri | parse hatası 0 (WinPS 5.1 ve pwsh 7) · BOM var · LF (önceki biçim korundu) · kontrol karakteri 0 | `test\parse-winps51.log`, `test\parse-pwsh7.log` |
| `d6-owner-block-selftest.ps1` | **71/71 PASS** WinPS 5.1.26100 · **71/71 PASS** pwsh 7.6.6, çıkış 0 | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` + `…-status.json` |
| Negatif kontrol: eski blok baytları + yeni öz-test | **64/71**, çıkış 1; FAIL = G-1, G-2, G-3, G-4, O-6, O-7, O-8 (iki sürümde) | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log` + `…-status.json` |
| Mantık eşitliği (AST) | Ölçüm B eşit; Ölçüm A'nın tek farkı kapanış metni ataması (iki sürümde) | `test\mantik-esitligi.log` |
| Paket digest'i (9 pin, bağımsız yeniden hesap) | uyuşmazlık 0; digest = `$ExpPackage` | `test\paket-digest-dogrulama.log` |
| `d6-selftest.js` — commit'li baytlar | **KOŞULAMADI** (canlı yayın ağacından modül yükler; R02 talimatında yasak) | — |
| `d6-selftest.js` — ayna kopya (yalnız `const REL` satırı değişik) | **51/51 PASS**, çıkış 0; T-3..T-7 PASS (commit'li dosyanın koşumu değildir) | `test\d6-selftest-ayna.log`, `test\d6-selftest-ayna-status.json`, `test\d6-selftest-ayna-kurulum.json` |
