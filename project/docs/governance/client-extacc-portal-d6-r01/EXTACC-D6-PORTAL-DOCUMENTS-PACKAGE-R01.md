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
>
> **R02 ikinci tur (2026-10-01) — inceleme düzeltmeleri, yalnız METİN/BELGE.** Bağımsız incelemenin küçük/nit bulguları kapatıldı (§9 "R02
> ikinci tur"). Koşucu, sahte API, QR betiği, `d6-selftest.js` ve 9 pinli dosya yine **değişmedi**; paket digest'i aynı. Blok ve blok öz-testi
> baytları değişti → §6'daki pinler **son baytlara** göre güncellendi; ilk R02 commit'indeki ara değerler "R02 ilk tur" diye korunmuştur.
> **Owner kuralının ikinci Recover'a uygulanışı:** çıkış 5/6 Recover yetkisi değildir; Recover yalnız kanıt incelendikten sonra ayrı owner
> onayıyla **bir kez** başlatılır; blok başlatmaz. **İkinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir** — belge ve blok
> metni "yeni onayla tekrar edilebilir" türü bir yol tanımlamaz.
>
> **R02 tur 4 (2026-10-03) — yalnız `d6-selftest.js` + bu belge.** Koşucu öz-testi artık canlı yayın ağacını **varsaymaz**: Prisma istemcisi ve
> bcrypt'in yükleneceği kütüphane kökü `D6T_LIB_ROOT` ile verilir (verilmezse betiğin checkout'unun proje kökü denenir); modül yoksa ya da kök
> canlı yayın ağacına çözülüyorsa test **başlamaz** (§5 "R02 tur 4"). Commit'li dosya **doğrudan** koşuldu: **51/51 PASS**. Koşucu, owner bloğu,
> blok öz-testi, QR betiği, sahte API ve 9 pinli dosya **değişmedi**; paket digest'i aynı (§6). Önceki turların "koşulamadı" satırları güncel
> duruma çevrildi, eski metin tarihsel not olarak korundu; ayna kopya sonuçları **tarihsel kanıttır**. Bu tur canlı Run/Recover'ı yetkilendirmez.

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

**İstisna — D6-1D (R02 ikinci tur, bulgu D6-E9; koşucu kaynağından doğrulandı, koşucu değiştirilmedi):** üç durumlu kural ("`olculemez` →
ÖLÇÜLEMEYEN") D6-5D ve P6-C-DOC için geçerlidir. **D6-1D'de erişim reddi FAIL sayılır**: koşucu `onDisk = (durum === 'var')` kurar ve
`R.check('D6-1D', … && onDisk)` çağırır; durum `olculemez` ise kontrol `false` olur → **FAIL** (ÖLÇÜLEMEYEN değil; gözlem alanına
`diskte=olculemez(<kod>)` yazılır). Bu **kapalı yöndür**: D6-1D gösterim kapısındadır, PASS değilse giriş bilgisi gösterilmez ve telefon
beklenmez. Üç durumlu kuralın istisnasıdır; düzeltme (D6-1D'de `olculemez` → ÖLÇÜLEMEYEN) **sonraki koşucu revizyonunda** yapılır — koşucu
pinlidir, bu revizyonda değiştirilmedi (§7, §9).

**Kapılar:** D-4/D-5 ortak kapılara ek olarak **izole mod API kapısı** (inceleme R01, bulgu 12): bağlı DB `hukuk_db` değilse `D6_API_BASE`
127.0.0.1/localhost ve **8080 dışı** açık bir port olmalı; aksi halde çıkış 4 ve hiçbir çağrı yapılmaz (yanlış beyanla izole koşumdan canlı
API'ye tek giriş denemesi bile gitmez). D-5 koşucusunda bu kapı **yoktur** (ayrı kayıt, §7).

Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI (erişim **ya da belge
kalıntısı**) DOĞRULANMADI · 7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0). Kalan belge varsa DELETE personel oturumuyla
**yapılamaz** (ürün ucu yok): Run 6 verir; Recover'da owner kararı `D6_RESIDUE_CLEANUP=1` satırları Prisma ile siler, **dosyaları silmez**
(ad listeler, yollar makbuza `residueFiles`); owner dosyayı elle sildikten sonra Recover bir kez daha → P6-C-DOC ölçülür; Recover
ölçülemeyeni 0 yapmaz (C4 → 3). **Recover'ın 0 verebildiği tek yol** portal hesabının hiç açılmamış olduğu erken dönüştür (bu yolda HTTP
reddi ölçülmez); hesap varken mevcut oturum reddi Recover'da ölçülemez → en iyi 3 (Run kanıtındaki P6-C4 satırlarına bakılır).
**R02 (ikinci turda yeniden yazıldı):** bu paragraf koşucunun Recover modundaki **davranışını** (öz-testte ölçülen çıkış kodlarını) anlatır;
owner için bir adım tanımı **değildir** ve bir çıkış kodu Recover'ı **yetkilendirmez**. Recover yalnız kanıt incelendikten sonra **ayrı owner
onayıyla, bir kez** başlatılır; blok onu kendiliğinden başlatmaz. Yukarıdaki "Recover bir kez daha" ifadesi koşucunun öz-testte ölçülen
davranışıdır: **ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir** (§4 adım 7, §7).

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
verdict'lerinden yazılır. Bloğun bastığı etiketler (birebir): `DB kapalı + sürüm arttı [P6-C2/C2V/C5]`, `yeni giriş reddi, yerel + dış [P6-C3L/D]`,
`mevcut oturum reddi, koşucunun kendi portal oturumu, yerel + dış [P6-C4L/D]`, `belge kalıntısı yok [P6-C-DOC]`,
`yabancı satır temiz [P6-FOREIGN-CLEAN]`, `personel/dosya kapanışı [U-CLOSE]`; her etiketin ardından `: PASS`, `: FAIL` ya da `: ÖLÇÜLMEDİ`
gelir: gruptaki tüm ölçütler PASS ise "PASS", biri FAIL ise "FAIL", aksi halde "ÖLÇÜLMEDİ". Telefondaki oturumun reddini koşucu ölçmez (owner beyanı);
(c) Run çıkış 5/6, belge kalıntısı ve Recover çıkış 6 satırları Recover talimatı vermez: çıkış kodu Recover yetkisi değildir, blok Recover
başlatmaz, önce kanıt incelenir, Recover yalnız ayrı owner onayıyla bir kez; kanıttaki kurtarma adımı bir **öneridir**.

**R02 ikinci tur — gösterilen metin (yine sıra, kapılar ve çıkış kodları değişmedi):** (d) onay metni "yalnız … tenantına yazar" iddiasını
kapsamıyla yazar: koşucu canlı DB'de yalnız bu koşumun **iki** sentetik tenantına (hedef + yabancı) yazar — **kaynaktan okundu**; koşumda
`U-ISO` yalnız diğer tenantlardaki kullanıcı/müvekkil **sayılarını** ölçer — ve bildirim üreten uçları çağırmaz (**statik ölçüt**: koşucu
öz-testi T-1); (e) kova dizini metinde tek adla geçer: `portal-documents/<sentetik tenant>/` (üç yerde; `PORTAL_DOCUMENTS/…` yazımı kaldırıldı);
(f) kapanış satırı "DOĞRULANDI yalnız **bu satırın devamında** PASS yazan parçalar içindir" der (parçalar aynı satırdadır; "aşağıda" değil) ve
altına şu not basılır: `Not: satır rengi yalnız birleşik ölçütü (P6-D9) gösterir (yeşil = P6-D9 PASS; kırmızı = PASS değil ya da kanıt okunamadı);
parçaların ayrı sonucu satırın metnindedir.` Renk mantığı değişmedi; (g) Recover çıkış 6 satırı: "Bu çıkış kodu yeni bir Recover için YETKİ
DEĞİLDİR … İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir" — ikinci Recover için yol tanımlanmaz.

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
   - (c) Recover 6 verirse bu çıkış kodu yeni bir Recover için yetki **değildir**; **ikinci bir Recover bu paketle tanımlı değildir, owner
     kararı gerektirir** (R02 ikinci tur). Kanıtı inceleyin ve sonucu CLIENT'a bildirin. Kanıtta "diskte kalan dosya" listelendiyse dosyayı
     owner elle siler; "dosya erişimi ÖLÇÜLEMEDİ" yazıyorsa belge kovasının okunabilirliğini owner düzeltir — bunlar yeni bir Recover
     yetkisi vermez. Recover 3 verirse Recover tekrarlanmaz. Kabul koşumu (Run) tekrarlanmaz.

## 5. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB 127.0.0.1:5448/d5_reset_test, sahte API 8199 / dış 8458)

| Test | Sonuç |
|---|---|
| `d6-selftest.js`: Z1 normal 0 (telefon: liste/indirme sha/silme sonrası boş); Z2 indirme sızıntısı (**200 + içerik**) → D6-4A FAIL "KAPSAM DIŞI BELGEYE ERİŞİLDİ" 2; Z3 silme sızıntısı → D6-4B/4C FAIL 2; Z4 liste sızıntısı → D6-2 FAIL 2; Z5 delete 500 → 6, Recover 6 ("sentetik belge kaldı"), cleanup=1 → satır silindi dosya listelendi 6, dosya elle → Recover 3; Z6 delete dosya bırakıyor → 6; **Z6-b/c/d ACL reddi (gerçek `icacls`: dosya F + dizin RD) → Recover P6-C-DOC ÖLÇÜLEMEYEN 6 ("yok" sayılmadı), ACL geri → FAIL 6, dosya elle → 3**; Z7 upload 500 → 2; Z8 yarım kalma (D6-3 sonrası SIGKILL) → Recover kapatır, belge kaldı 6 → cleanup + dosya → 3; Z9 telefon yüklemesi silindi 0 / silinmedi 6; Z10 kapılar 3/3/4/4/1/4 + **Z10-g/h izole mod API kapısı 4/4**; Z11 create 500 → 6; Z12 guard bayat → ürün bulgusu 6; **Z16-a geç oluşma (late) → hesap kapanışta görüldü ve kapatıldı 2 · Z16-b/c askıda (hold) → 6, sonradan aktif, Recover kapatır 3 · Z16-d Recover beklerken oluşur → 3 · Z16-e Recover bittikten sonra oluşur → 6, ikinci Recover 3**; Z13 konsolsuz 4; Z14 makbuz 1; S-1 sır sızıntısı yok; T/P statik (**P-3 üç durumlu yoklama birimi, P-4 API kapısı birimi**; T-3..T-7 owner bloğunu statik inceler) | **51/51 PASS, çıkış 0** — inceleme düzeltmesi `fix-r01\d6-selftest-fix-run2.log`; orkestratör tekrarı `orkestrator-dogrulama\d6-selftest.txt` 51/51 rc=0; **kapanış düzeltmesi (blok değişti) `kapanis-duzeltme\d6-selftest.log` 51/51, çıkış 0** |
| `d6-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; N; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; **B-1..B-5 kova okunabilirliği (gerçek ACL reddi)**; R-1..R-9; V-0..V-5; L-1/L-2 7 süre; O-1..**O-5**; Z; Q + **Q-R05**; S-1..S-4 + **S-5 topoloji literali yok**) | inceleme düzeltmesi **58/58** WinPS 5.1.26100 (`fix-r01\d6-block-selftest-winps-fix-final.log`) ve pwsh 7.6.6 (`…-pwsh-fix-final.log`); orkestratör tekrarı 58/58 ×2; **kapanış düzeltmesi (6 yeni test) 64/64 WinPS 5.1 (`kapanis-duzeltme\d6-block-selftest-winps.log`) ve 64/64 pwsh 7.6.6 (`…-pwsh.log`), çıkış 0** — ilk kapanış koşumu 63/64 (K-7: IPv4 adres biçim kapısından geçiyordu → kapı düzeltildi, yeniden koşuldu) |
| **R02 ilk tur (2026-10-01; ara baytlar — son baytlar bir alttaki satırdadır)** `d6-owner-block-selftest.ps1` (blok `5AEF3893…FA61`, öz-test `810BDEF5…9FB4`; log her koşumda test edilen bloğun sha256'sını yazar). 64 önceki test + 7 yeni: **G-1** kapsamsız mutlak iddia yok + başlık kapsamı adlandırır + geçici parola kanıt dizininde yok · **G-2** gösterilen onay metni (telefon yüklemesi günlük/kova, boş kova dizini, 5/6 Recover yetkisi değil) · **G-3** Recover çıkış 6 yeni Recover yetkisi değil · **G-4** Run çıkış 5/6 metni + tek node çağrısı + çıkış 0'da Recover metni yok · **O-6..O-8** kapanış metni kanıttaki verdict'lerden | **71/71 PASS** Windows PowerShell 5.1.26100 (`d6-r02\test\blok-oz-test-winps51.log`) ve **71/71 PASS** PowerShell 7.6.6 (`d6-r02\test\blok-oz-test-pwsh7.log`), çıkış 0. **Negatif kontrol:** eski blok baytları (`A206E19E…3629`) + yeni öz-test → **64/71**, çıkış 1, FAIL = G-1, G-2, G-3, G-4, O-6, O-7, O-8 (iki sürümde de; `d6-r02\neg\neg-eski-blok-winps51.log`, `…-pwsh7.log`) |
| **R02 ikinci tur (2026-10-01) — SON BAYTLAR** `d6-owner-block-selftest.ps1` (blok `082527EE…B3E2`, öz-test `34C95DCB…9BAE`). 71 önceki test (G-3 ikinci Recover kuralına göre **yeniden yazıldı**) + 2 yeni: **G-3** Recover çıkış 6 metni yeni bir Recover için yetki değildir, ikinci Recover için yol **tanımlamaz** ("YENİ ve AYRI onayla / sonraki Recover / BİR KEZ / tekrar edilebilir" gösterilen metinde ve kaynakta yok; başlık aynı kuralı yazar) · **G-5** onay metni kapsamı (iki sentetik tenant: kaynaktan + U-ISO yalnız sayı; bildirim: statik ölçüt T-1) + kova dizini tek adla (`portal-documents/<sentetik tenant>/` ×3) · **O-9** kapanış satırı "bu satırın devamında" + altı parça aynı satırda + satır rengi notu (P6-D9 PASS ve FAIL koşumlarında) + renk mantığı aynı | **73/73 PASS** Windows PowerShell 5.1.26100 (`d6-r02\tur2\test\blok-oz-test-winps51.log`) ve **73/73 PASS** PowerShell 7.6.6 (`d6-r02\tur2\test\blok-oz-test-pwsh7.log`), çıkış 0. **Negatif kontrol:** R02 ilk tur blok baytları (`5AEF3893…FA61`) + ikinci tur öz-testi → **70/73**, çıkış 1, FAIL = G-3, G-5, O-9 (iki sürümde de; `d6-r02\tur2\neg\neg-ilk-tur-blok-winps51.log`, `…-pwsh7.log`) |
| **R02 tur 4 (2026-10-03) — COMMIT'Lİ DOSYA, SON BAYTLAR** `d6-selftest.js` (`5560FAF8…178F`) **doğrudan** (kopya/ayna değil); `D6T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü; blok `082527EE…B3E2` (değişmedi) | **51/51 PASS**, çıkış 0; T-3..T-7 PASS; test kimlikleri ve sonuçları ikinci tur ayna koşumuyla aynı (51 = 51) (`d6-r02\tur4\test\d6-selftest-commit.log`, `…-status.json`). Kök çözümü, koşum komutu ve negatif ölçümler: aşağıda "R02 tur 4"; koşum tablosu §9 |
| **R02 ikinci tur** `d6-selftest.js` — ayna kopya, **ikinci tur blok baytlarıyla** (`082527EE…B3E2`) — **tarihsel kanıt** (güncel sonuç: üst satır) | **51/51 PASS**, çıkış 0; T-3..T-7 PASS (`d6-r02\tur2\test\d6-selftest-ayna.log`, `…-status.json`, `…-kurulum.json`: değişen satır 19, aynada farklı dosya 1). Commit'li `d6-selftest.js` baytlarının koşumu **değildir** (aşağıdaki satırdaki neden aynen geçerli) |
| **R02 ilk tur** `d6-selftest.js` (T-3..T-7 owner bloğunu statik okur) — **tarihsel kanıt** | **GÜNCEL DURUM (tur 4): commit'li dosya artık doğrudan koşulur — 51/51 PASS (iki üst satır).** Tarihsel not (R02 ilk tur metni; o günkü baytlar `E9FB37DC…F2C2` için geçerlidir): Commit'li dosya baytlarıyla doğrudan koşum **KOŞULAMADI**: betik Prisma/bcrypt'i sabit yoldan, canlı yayın ağacının `node_modules` dizininden yükler; R02 iş talimatında canlı yayın ağacına erişim yasaktı. **Ayna koşumu** (yalnız `const REL` satırı canlı olmayan R27 aday çalışma ağacına çevrilmiş kopya; diğer 6 governance betik dizini ve yeni blok baytları aynen): **51/51 PASS**, çıkış 0, T-3..T-7 PASS (`d6-r02\test\d6-selftest-ayna.log`, kurulum farkı `d6-selftest-ayna-kurulum.json`: değişen satır 19, aynada farklı dosya 1). Bu sonuç commit'li `d6-selftest.js` baytlarının koşumu **değildir** |

Öz-testte "telefon" bir istemci taklididir; giriş bilgisini koşucunun **yalnız display=none ve canlı olmayan DB'de** yazdığı test
dosyasından (`D6_TEST_DISPLAY_SINK`) alır — bu yol kaynakta tek yerde, `if (con)` dalının dışında ve owner bloğunda kurulmaz (T-2, S-4).
Kanıt: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\extacc-d6-package-r01\` (ilk paket), `…\fix-r01\` (inceleme düzeltmeleri),
`…\orkestrator-dogrulama\` (bağımsız tekrar) ve `…\kapanis-duzeltme\` (kapanış düzeltmesi: blok + blok öz-testi değişti; koşucu değişmedi).

**R02 — kanıt atıfları:** yukarıdaki R02 öncesi satırlar **önceki** blok/öz-test baytlarıyla (blok `A206E19E…`, öz-test `4E7ED8D7…`
ve daha eskileri) koşulmuş logları gösterir. **Son baytlar (R02 ikinci tur: blok `082527EE…`, öz-test `34C95DCB…`) için geçerli tek kanıt
`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\tur2\` dizinidir** (`test\` son koşumlar + status dosyaları: komut, çıkış kodu,
test edilen dosyaların sha256'sı; `neg\` negatif kontroller ve mantık mutantları; `r02-ilk-tur\` ilk R02 commit'indeki baytlar; `STATUS.txt`).
`d6-r02\` kökündeki `test\`, `neg\` ve `onceki\` dizinleri **R02 ilk tur** baytlarının (blok `5AEF3893…`, öz-test `810BDEF5…`) kanıtıdır.
Yer düzeltmesi: `fix-r01\` ve `review-r01\` dizinleri `extacc-d6-package-r01\` altındadır; `orkestrator-dogrulama\` ve
`kapanis-duzeltme\` dizinleri ise `HY_R27_AGENT_EVIDENCE\` kökündedir (üstteki "…\" kısaltması bunu ayırmıyordu).
**R02 tur 4:** `d6-selftest.js` son baytları (`5560FAF8…178F`) için geçerli kanıt `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\tur4\`
dizinidir (`test\`, `neg\`, `neg-baglanti\`, `STATUS.txt`); blok ve blok öz-testi baytları tur 4'te **değişmedi** ve aynı dizinde yeniden koşuldu.

**R02 tur 4 — koşucu öz-testi canlı yayın ağacı bağımlılığı olmadan koşar (2026-10-03; yalnız `d6-selftest.js` + bu belge).** Önceki baytlarda
(`E9FB37DC…F2C2`) betik Prisma istemcisini ve bcrypt'i sabit yoldan, canlı yayın ağacının `node_modules` dizininden yüklüyordu (`const REL = …`
satırı); commit'li dosya canlı ağaca dokunmadan koşulamıyordu. Yeni baytlarda (`5560FAF8…178F`):
- **Kök çözümü.** Kütüphane kökü **`D6T_LIB_ROOT`** ortam değişkeniyle verilir; verilmezse betiğin bulunduğu checkout'un proje kökü denenir
  (betik konumundan göreli). İki modül dizini (`@prisma/client` 5.22.0 ve `bcrypt` 5.1.1; kökün `node_modules\.pnpm` dizininde) bu kökte aranır.
  Kök ya da modül yoksa betik **açık mesajla çıkış 2** verir ve test başlamaz; sessizce canlı ağaca **düşmez**.
- **Canlı ağaç reddi.** Canlı yayın ağacı, owner bloğunun `$Rel` sabitinden okunur (`…\project` ise bir üstü: yayın ağacının tamamı) — betikte
  canlı yol literali **yoktur**; blok okunamazsa çıkış 2. Yol büyük/küçük harf duyarsız karşılaştırılır ve bileşen bileşen çözülür: yolun kendisi
  ya da bir bağlantının (junction/symlink) hedefi canlı ağaca çıkıyorsa o ağaca dosya sistemi çağrısı yapılmadan **çıkış 4** ("RED") verilir.
  Denetim ilk yerel `require`dan (koşucu dahil) **önce** çalışır: izole test canlı ağaçtan modül yüklemez.
- **Çıktı.** Kullanılan kök çıktının ilk satırına yazılır (`kütüphane kökü: … (kaynak: D6T_LIB_ROOT | bu checkout'un proje kökü; …)`); yerel
  kullanıcı adı ve kullanıcı profili yolu maskelenir.
- **Ölçülen şey değişmedi.** Test sayısı 51 = 51; Z / S / T / P ölçütleri (T-3..T-7 statik ölçütleri dahil) aynıdır. Koddaki değişiklik yalnız
  kök çözümü + ret denetimi + çıktı satırıdır. Koşucu, owner bloğu, blok öz-testi, QR betiği, sahte API ve 9 pinli dosya değişmedi.

Commit'li dosyanın koşum komutu (PowerShell; bağlantı dizgesinin değeri ve parola belgeye **yazılmaz**):

```powershell
$env:D6T_DB_URL   = '<tek kullanımlık test veritabanının bağlantı dizgesi; hedef bu bölümün başlığındaki disposable DB>'
$env:D6T_LIB_ROOT = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project'   # Prisma istemcisi + bcrypt kurulu, CANLI OLMAYAN proje kökü
Set-Location <checkout>\project\docs\governance\client-extacc-portal-d6-r01\scripts
node d6-selftest.js
```

Ön koşul: test konteyneri (`d5-reset-pg`) çalışıyor, 8199 ve 8458 portları boş, `openssl` yolda. **Sonuç (2026-10-03, node v24.18.0): 51/51 PASS,
çıkış 0**; ilk çıktı satırı `kütüphane kökü: D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project (kaynak: D6T_LIB_ROOT; canlı yayın ağacı DEĞİL …)`.
Üç negatif ölçüm: (a) `D6T_LIB_ROOT` verilmeden ve checkout kökünde modüller yokken → çıkış **2**; (b) kök canlı yayın ağacının altında → çıkış
**4**, canlı ağaç altında dosya sistemi çağrısı 0 ve modül yükleme 0 (ret `require`dan önce); (c) varolmayan kök → çıkış **2** (ayrıntı: §9
"R02 tur 4"). **Ayna kopya sonuçları tarihsel kanıttır:** `d6-r02\test\` ve `d6-r02\tur2\test\` altındaki `d6-selftest-ayna.*` dosyaları önceki
baytların tek satırı değiştirilmiş kopyasının koşumlarıdır; silinmedi ve değiştirilmedi. Güncel sonuç, commit'li dosyanın tur 4 koşumudur.

## 6. Pinler (ölçülen değerler; sha256 ham dosya baytı — 2026-10-03 R02 tur 4 sonrası; tur 4'te değişen tek satır `d6-selftest.js`)

| Dosya | sha256 |
|---|---|
| `d6-portal-documents-live-run.js` (koşucu; bloktaki `PkgPins` girdisiyle **eşit**; R02'de değişmedi) | `5D74206BAA26FD752FA57C3342698EDD870CA25A8BDB20B9C2213600EDE758DD` |
| `d6-qr-test.js` (PkgPins; R02'de değişmedi) | `C9FC15AADBFDF4AA87702542340EB6A5C68558D3FE6423F06DED8E452D85F418` |
| `d6-owner-live-block.ps1` (**R02 ikinci tur — son baytlar**: yalnız metin; **R02 ilk tur** ara değeri `5AEF38932FE9458F799349C559649E8AB75A2585C7A403EDB066BC9F58AFFA61` (yalnız metin + kapanış metni ifadesi); R02 öncesi — kapanış düzeltmesi — `A206E19E208F791631F94A4A0C1A67D435BA9AC35CD3E71F72164B9185DA3629`; ondan önceki `DE3634BE…5321`) | `082527EE641565B4E1B1F6ADF9A6EE6935EC796F958430C99CE16E3E28A8B3E2` |
| `d6-fake-portal-api.js` (R02'de değişmedi) | `27D8CBADE5694F398151BBA0CCFB10C0472383CFF1E3DD24DEA49EFDD587953A` |
| `d6-selftest.js` (**R02 tur 4 — son baytlar**: yalnız kütüphane kökü çözümü + canlı ağaç ret denetimi + çıktı satırı; ölçülen testler aynı, 51 test; **önceki** değer — R02 ilk ve ikinci turda değişmemişti — `E9FB37DC6D4069682722C4C4ADCCAA1E8F29D771F0E1A8508D3EC1D78686F2C2`). PkgPins'te **değildir** (koşucu bu dosyayı yüklemez); paket digest'i etkilenmez | `5560FAF870B90E03471B973AE2289593354C3D71F62D69D565B71F695603178F` |
| `d6-owner-block-selftest.ps1` (**R02 ikinci tur — son baytlar**: G-3 yeniden yazıldı + 2 yeni test G-5, O-9 → 73 test; **R02 ilk tur** ara değeri `810BDEF5C7EE4D1F98676C705C1BC9CBF73BDD969A27DA1686B6F70F801F9FB4` (7 yeni test G-1..G-4, O-6..O-8 + gözlem dökümü + test edilen blok sha256 satırı → 71 test); R02 öncesi — kapanış düzeltmesi, 6 yeni test — `4E7ED8D7531CDC49FBDE783B3DAD9C2F9BEB675C1EF30504B09FC0B3E5D15E95`; ondan önceki `35E82EFC…BD02`) | `34C95DCBBB76362AA9D5B683D4990B133C42040ECF6BA63A5AF40B91B9349BAE` |

R02 pin doğrulaması: 9 pinli dosya dosyalardan yeniden hesaplandı, uyuşmazlık 0; paket digest'i yeniden hesap = blok `$ExpPackage`
(R02 ilk tur: `d6-r02\test\paket-digest-dogrulama.log`; **R02 ikinci tur, son baytlar:** `d6-r02\tur2\test\paket-digest-dogrulama.log`;
**R02 tur 4** — `d6-selftest.js` değiştikten sonra yeniden: 9 pin, uyuşmazlık 0, digest aynı — `d6-r02\tur4\test\paket-digest-dogrulama.log`).

**Blok revizyonunun ayırt edilmesi (R02 ikinci tur, V-5).** Bloğun kanıta yazdığı `owner-block.json` içindeki `revision` alanı R02 bloğunda da
**`R01`** yazar: alan Write-Host / yorum / istem metni değildir ve mantık eşitliği gereği **değiştirilmedi** (bu alanı değiştiren kopya
mantık eşitliği ölçümünde "eşit değil" verir: `d6-r02\tur2\neg\mantik-mutant\m7-revision-alani.ps1`). Bloğun **metin revizyonu yalnız blok
dosyasının sha256'sı ile** ayırt edilir (yukarıdaki tablo). **Owner koşumdan önce blok dosyasının sha256'sını kaydeder** ve bu tablodaki son
değerle karşılaştırır; kanıttaki `revision = R01` tek başına hangi blok metninin koşulduğunu göstermez.

Paket digest (blok içinde `$ExpPackage`; 9 pinli dosyanın `yol\0sha\n` sıralı birleşiminin sha256'sı): `7C54C0FC38D85548D0B626A3D60D2CD7DF07080CC13F6C20C682933B1790F057`
— bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0). `ExpLiveDist` = R27
`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`; `ExpEnvSha` EXTACC bloğuyla aynı. Blok dosyasının kendisi PkgPins'te
**değildir** (koşucu bloğu yüklemez); blok değişince paket digest'i değişmez, yalnız bu tablo güncellenir.

PkgPins = koşucunun gerçek require ağacı (reqtree ile ölçüldü: ah-lib, i3-lib, extacc-display, qrcode vendor, h5-url-live-run,
i12-live-identity, i13-lib, koşucu) + `d6-qr-test.js`. Koşucu değiştiğinde pin ve paket digest'i `d6_pins.py` yöntemiyle yeniden hesaplanır.

## 7. Sınırlar ve owner kararları

- Sahte API ürünün kendisi değildir: ürünün gerçek multer/kova/`assertContained`/hız sınırı davranışı yalnız canlıda ölçülür. Kova kökü
  (`HUKUK_DATA_ROOT`) görev ortamından geliyorsa Preflight yalnız "env-dosyasinda-yok" notu düşer; koşucu `filePath`'i DB'den alıp `stat` yapar.
- Telefon yüklemesi opsiyoneldir ve makine ölçümü değildir; silinmezse kalıntı → 6 → Recover'da **owner kararı** (satır Prisma ile; dosya elle)
  (çıkış 6 Recover yetkisi değildir; §4 adım 7).
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
  başlatmaz (blok öz-testi: koşum başına tek node çağrısı — G-3/G-4, R-2). Recover çıkış 6 da yeni bir Recover için yetki değildir;
  **ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir** (R02 ikinci tur: önceki "sonraki Recover yeni ve ayrı owner
  onayı ister" cümlesi bir yol tanımladığı için kaldırıldı). Bu paket Recover için bir GO ref'i **sormaz** (blok mantığı R02'de değişmedi);
  ayrı onayın nasıl kaydedileceği bu paketin dışındadır (owner kararı).
- **Kanıttaki kurtarma adımı metni değişmedi (koşucu değişikliği gerektirir; R02'de yapılmadı — §9 "kanıttaki kurtarma adımı metni").** Koşucu
  `d6-evidence.json` içindeki `recovery.neden` / `recovery.adim` alanlarına doğrudan adım yazar (ör. "Owner bloğu `-Mode Recover -ReceiptFile
  <makbuz>` ile", "Recover BİR KEZ", "Recover BİR KEZ daha"). Bu metinler **öneridir**, yetki değildir ve ikinci bir Recover için yol
  **tanımlamaz**; blok çıkışında ve §4 adım 7'de böyle okunması yazılıdır. Metnin kendisini düzeltmek koşucu değişikliği + yeni dosya pini +
  yeni paket digest'i + `d6-selftest.js` koşumu gerektirir (ayrı iş). (R02 ilk turda bu not yanlışlıkla "D6-E9" etiketiyle yazılmıştı; D6-E9
  aşağıdaki D6-1D kalemidir.)
- **D6-1D'de erişim reddi FAIL sayılır (bulgu D6-E9; koşucu kaynağından doğrulandı).** Diskteki dosya için `stat` erişim reddi verirse
  (`olculemez`) D6-5D ve P6-C-DOC ÖLÇÜLEMEYEN verir, **D6-1D ise FAIL** verir (koşucu: `onDisk = durum 'var' ise true`; aksi halde kontrol
  `false` → FAIL). Kapalı yöndür (gösterim kapısı geçilmez); üç durumlu kuralın istisnasıdır (§2). Düzeltme **sonraki koşucu revizyonunda**;
  koşucu pinlidir ve R02'de değiştirilmedi.
- **`owner-block.json` `revision` alanı R02 bloğunda da `R01` yazar** (mantık eşitliği gereği değiştirilmedi); metin revizyonu blok dosyasının
  sha256'sı ile ayırt edilir; owner koşumdan önce blok sha256'sını kaydeder (§6).
- **Onay metnindeki kapsam iddiası (R02 ikinci tur).** "Koşucu canlı DB'de yalnız bu koşumun iki sentetik tenantına yazar" cümlesi **kaynaktan
  okunmuştur** (koşucunun doğrudan Prisma yazmaları makbuzdaki sentetik kimliklere bağlıdır; kurulum `setupI3` hedef + yabancı tenantı yeni
  oluşturur; kapanış `closeAccess` bu iki tenantla sınırlıdır); canlıda ölçülmedi. Koşumda `U-ISO` yalnız diğer tenantlardaki kullanıcı ve
  müvekkil **sayılarının** önce/sonra aynı olduğunu ölçer (içerik ya da başka tablo ölçmez). "Bildirim üreten uçları çağırmaz" bir **statik
  ölçüttür** (koşucu öz-testi T-1: kaynak taraması); canlıda ayrıca ölçülmedi.
- **Sır iddiasının kapsamı.** "Yazmaz" iddiası yalnız bloğun ve koşucunun **kendi** kanıt/log dosyaları için ve yalnız ölçüldüğü ölçüde geçerlidir:
  blok öz-testi R-9 + G-1 (kanıt dizini + GO defterinde GO literali, DB URL ve geçici portal parolası yok; geçici node ile), koşucu öz-testi S-1
  (sahte API'ye karşı). Canlı API uygulama günlüğü, işletim sistemi / terminal kayıtları ve owner'ın beyan sorularına yazdığı yanıt metni
  **ölçülmedi**.
- **Telefon yüklemesi.** Dosya adı canlı API günlüğüne maskesiz yazılır ve satır kalır; dosya canlı belge kovasına yazılır (§1 R02 notu).
  Bu etkiler kaynaktan okunmuştur; canlıda ölçülmedi. Owner'a onay metninde gösterilir.
- **Boş kova dizini.** Kapanıştan sonra sentetik tenantın boş kova dizini diskte kalır — **saklandı** (koşucu ve blok dizin silmez; §1 R02 notu).
- **Kapanış metni.** "DOĞRULANDI" yalnız kanıtta PASS yazan parçalar içindir; "mevcut oturum reddi" koşucunun **kendi** portal oturumudur.
  Telefondaki oturumun reddi makineyle ölçülmez (yalnız yenileme beyanı). **Satır rengi yalnız birleşik ölçütü (P6-D9) gösterir**: yeşil satırda
  da bir parça "ÖLÇÜLMEDİ" ya da "FAIL" yazabilir; parçaların sonucu satırın metninden okunur (R02 ikinci tur: not owner'a gösterilir; renk
  mantığı değiştirilmedi).
- **`d6-selftest.js` — GÜNCEL DURUM (R02 tur 4, 2026-10-03): commit'li dosya canlı yayın ağacına dokunmadan doğrudan koşulur** (kütüphane kökü
  `D6T_LIB_ROOT` ile; 51/51 PASS; §5 "R02 tur 4"). Kalan sınırlar: (1) canlı ağaç reddi **yol adı** üzerinden çalışır (büyük/küçük harf duyarsız,
  `.`/`..` çözülmüş, bağlantı hedefleri izlenir); 8.3 kısa ad, `subst` sürücüsü ya da UNC yazımıyla verilen bir canlı yol bu denetimle
  **yakalanmaz** — ölçülmedi (kanıt sürücüsünde 8.3 kısa ad üretimi yok). (2) Betik yalnız iki modül dizinini çözer; modüllerin geçişli
  bağımlılıkları kökün `.pnpm` bağlantılarıyla yüklenir — kullanılan kök için ayrıca ölçüldü (bağlantı 4687, kökün dışına çıkan 0), betik bunu
  kendisi denetlemez. (3) `D6T_LIB_ROOT` verilmeden, modülleri kurulu bir checkout'ta pozitif koşum **ölçülmedi** (bu çalışma ağacında
  `node_modules` yok; yalnız "modül yok → çıkış 2" yönü ölçüldü). (4) Bağlantı hedefi dalı gerçek canlı ağaca karşı **ölçülmedi** (canlı ağaca
  bağlantı kurulmaz); kanıt dizininde sahte bir kökle ölçüldü (§9). (5) Owner bloğu dosyası yoksa ya da `$Rel` satırı tek değilse test başlamaz
  (çıkış 2); önceki baytlarda blok yokken dinamik testler koşar, T-3 "owner bloğu mevcut" FAIL verirdi — commit'li pakette blok vardır.
  Tarihsel not (R02 ilk/ikinci tur metni; o günkü baytlar `E9FB37DC…F2C2` için geçerlidir): "`d6-selftest.js` R02'de commit'li baytlarıyla
  koşulamadı (canlı yayın ağacından modül yükler; R02 talimatında o ağaca erişim yasaktı). Ayna koşumu §5'te; sonuç commit'li dosyanın koşumu
  sayılmaz. Betiğin canlı ağaç bağımlılığı ayrı bir düzeltme konusudur (bu paket değiştirmedi)."
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
| kanıttaki kurtarma adımı metni (R02 ilk turda "D6-E9" etiketiyle yazılmıştı; etiket ikinci turda düzeltildi — bu kalem D6-E9 **değildir**, ayrı ve geçerli bir sınırdır) | Koşucu kanıttaki `recovery.neden` / `recovery.adim` alanlarına doğrudan Recover adımı yazar | **DÜZELTİLMEDİ** (R02 kapsamı: koşucu değişmez) | §7'ye sınır olarak yazıldı: metinler öneridir, yetki değildir, ikinci Recover için yol tanımlamaz. (İlk tur notu: "Bulgunun metni R02 oturumuna verilmedi … D6-E9 başka bir kalemse o kalem bu notun kapsamında değildir" — D6-E9'un doğru içeriği alttaki satırdadır) |
| D6-E9 (doğru içerik; R02 ikinci tur) | Koşucuda D6-1D ölçütünde diskteki dosyaya erişim reddi (`olculemez`) ÖLÇÜLEMEYEN yerine **FAIL** üretir; D6-5D ve P6-C-DOC aynı durumda ÖLÇÜLEMEYEN verir ve §2 "`olculemez` → ÖLÇÜLEMEYEN" der | **DÜZELTİLMEDİ** (koşucu pinli; R02 kapsamı: koşucu değişmez) — **sınır notu yazıldı** | Koşucu kaynağından doğrulandı (`d6-portal-documents-live-run.js`, D6-1D bloğu: `onDisk = fst.state === 'var'`; `R.check('D6-1D', …, … && onDisk, …)`; `check` `false` için FAIL üretir; D6-1D gösterim kapısı listesindedir). §2 "İstisna — D6-1D" + §7: erişim reddi D6-1D'de FAIL sayılır (kapalı yön; üç durumlu kuralın istisnası); düzeltme sonraki koşucu revizyonunda |

**Mantık eşitliği — R02 ilk tur (R02 öncesi blok `A206E19E…` → R02 ilk tur bloğu `5AEF3893…`; AST; `d6-r02\test\mantik-esitligi.ps1` →
`mantik-esitligi.log`; Windows PowerShell 5.1 ve PowerShell 7'de aynı sonuç). İkinci turun ölçümü bu bölümün sonundadır.**
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

| R02 ilk tur koşumu (ara baytlar: blok `5AEF3893…`, öz-test `810BDEF5…`) | Sonuç | Kanıt (`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\`) |
|---|---|---|
| `Parser::ParseFile` (2 ps1) · BOM · satır sonu · kontrol karakteri | parse hatası 0 (WinPS 5.1 ve pwsh 7) · BOM var · LF (önceki biçim korundu) · kontrol karakteri 0 | `test\parse-winps51.log`, `test\parse-pwsh7.log` |
| `d6-owner-block-selftest.ps1` | **71/71 PASS** WinPS 5.1.26100 · **71/71 PASS** pwsh 7.6.6, çıkış 0 | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` + `…-status.json` |
| Negatif kontrol: eski blok baytları + yeni öz-test | **64/71**, çıkış 1; FAIL = G-1, G-2, G-3, G-4, O-6, O-7, O-8 (iki sürümde) | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log` + `…-status.json` |
| Mantık eşitliği (AST) | Ölçüm B eşit; Ölçüm A'nın tek farkı kapanış metni ataması (iki sürümde) | `test\mantik-esitligi.log` |
| Paket digest'i (9 pin, bağımsız yeniden hesap) | uyuşmazlık 0; digest = `$ExpPackage` | `test\paket-digest-dogrulama.log` |
| `d6-selftest.js` — commit'li baytlar | **GÜNCEL DURUM (tur 4): koşuldu — 51/51 PASS, çıkış 0** (yeni baytlar `5560FAF8…178F`; aşağıda "R02 tur 4"). Tarihsel not (bu turun metni; baytlar `E9FB37DC…F2C2`): **KOŞULAMADI** (canlı yayın ağacından modül yükler; R02 talimatında yasak) | güncel: `tur4\test\d6-selftest-commit.log`; bu turda: — |
| `d6-selftest.js` — ayna kopya (yalnız `const REL` satırı değişik) | **51/51 PASS**, çıkış 0; T-3..T-7 PASS (commit'li dosyanın koşumu değildir) | `test\d6-selftest-ayna.log`, `test\d6-selftest-ayna-status.json`, `test\d6-selftest-ayna-kurulum.json` |

### R02 ikinci tur — inceleme düzeltmeleri (2026-10-01; yalnız metin/belge)

İlk R02 commit'i (`efcbfe73`) bağımsız incelendi; engelleyici/önemli bulgu yoktu. Bu tur incelemenin küçük/nit bulgularını **yalnız blok
metni, blok öz-testi ve bu belge** ile kapatır. Koşucu (`.js`), sahte API, QR betiği, `d6-selftest.js` ve 9 pinli dosya **değişmedi**; paket
digest'i aynı. Canlı ortamda hiçbir owner bloğu, koşucu, sonda ya da servis/görev komutu koşulmadı; bu tur canlı Run/Recover'ı yetkilendirmez.

| # | Bulgu | Karar | Değişiklik |
|---|---|---|---|
| V-2 | Onay metnindeki "Koşucu yalnız bu koşumun sentetik tenantlarına yazar ve bildirim üreten uçları çağırmaz." cümlesi kapsamsızdı | NİT — **düzeltildi** | Cümle kapsamıyla yazıldı: canlı DB'de yalnız bu koşumun **iki** sentetik tenantına yazar (kaynaktan okundu; koşumda U-ISO yalnız sayıları ölçer); bildirim üreten uçları çağırmaz (statik ölçüt: koşucu öz-testi T-1). Aynı metnin ilk satırındaki "YALNIZ yeni bir sentetik tenantta" ifadesi de iki tenantla tutarlı yazıldı ("bu koşumun İKİ yeni sentetik tenantında (hedef + yabancı)"). §3(d), §7. Öz-test G-5 |
| V-3 | Onay metninde kova dizini iki adla geçiyordu (`PORTAL_DOCUMENTS/…` ve `portal-documents/…`) | NİT — **düzeltildi** | Üç yerde de `portal-documents/<sentetik tenant>/`. Öz-test G-5 |
| V-4 | Kapanış metni "aşağıda PASS yazan parçalar" diyordu; parçalar aynı satırdadır. Satır rengi yalnız birleşik ölçüte bağlıdır | NİT — **düzeltildi (yalnız metin)** | Metin "bu satırın devamında PASS yazan parçalar"; altına "satır rengi yalnız birleşik ölçütü (P6-D9) gösterir" notu. Renk mantığı değişmedi. Öz-test O-9. **Bu, ikinci turda yorum / Write-Host / istem metni dışında değişen tek yerdir** (aşağıdaki ölçüm) |
| V-5 | `owner-block.json` `revision` alanı R02 bloğunda da `R01` yazar | NİT — **belgelendi** | §6 "Blok revizyonunun ayırt edilmesi" + §7; alan değiştirilmedi (mantık eşitliği) |
| V-6 | §7'deki "kalıntı → 6 → Recover'da owner kararı" cümlesi yetki sınırını anmıyordu; §3(b) etiketleri bloğun bastığı metinle birebir değildi | NİT — **düzeltildi** | §7 cümlesine "(çıkış 6 Recover yetkisi değildir; §4 adım 7)"; §3(b) etiketleri bloğun bastığı metinle birebir |
| V-7 | Kanıt dizinindeki `test\run-d6-selftest-ayna.ps1` test DB bağlantı dizgesini dosya içinde kuruyordu | NİT — **düzeltildi (repo dışı)** | Betik bağlantı dizgesini artık **ortamdan** (`D6T_DB_URL`) okur; dosyada yalnız `postgresql://postgres:<maskeli>@…` biçim açıklaması vardır. Kanıt dizininin `SHA256-MANIFEST.txt` dosyası yeniden üretildi. Commit'i etkilemez |
| İkinci Recover | Blok (başlık + Recover çıkış 6 satırı) ve belge (§2, §4 adım 7, §7) "sonraki Recover yeni ve ayrı owner onayı ister / onayıyla bir kez başlatılır" diyerek ikinci bir Recover için yol tanımlıyordu | KÜÇÜK — **düzeltildi** | Owner kuralı: "bu çıkış kodu yeni bir Recover için yetki değildir; ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir". Recover çıkış 6 satırındaki "önce … düzeltilir" sıralaması da kaldırıldı. Öz-test G-3 (yeniden yazıldı) |
| D6-E9 | Yukarıdaki tabloda (doğru içerik) | **DÜZELTİLMEDİ** (koşucu pinli) — sınır notu | §2 "İstisna — D6-1D", §7 |

**Mantık eşitliği — R02 ikinci tur (R02 ilk tur bloğu `5AEF3893…` → ikinci tur bloğu `082527EE…`; `d6-r02\tur2\test\mantik-esitligi-tur2.ps1` →
`mantik-esitligi-tur2.log`; Windows PowerShell 5.1 ve PowerShell 7'de aynı sonuç).** Yorumlar (56 → 62), `Write-Host` komutları (52 → 55) ve
`Read-Answer`/`Read-Host` istem metinleri (15 → 15; değişmedi) çıkarıldıktan sonra:
- **Ölçüm A (katı): eşit DEĞİL** (20345 → 20356 karakter). Kalan kod birebir eşit **değildir**; fark aşağıdaki tek dize sabitidir.
- **Ölçüm T (token):** çıkarılan aralıkların dışında karşılaştırılan token sayısı 3667 = 3667; **farklı token 1**: `Get-ClosureStatus` içindeki
  `$st.text = …` atamasında tek tırnaklı bir dize sabiti (owner'a gösterilen ve `owner-declaration.json` → `closureShownToOwner` alanına yazılan
  kapanış metni). Eski: `'… DOĞRULANDI yalnız aşağıda PASS yazan parçalar içindir (kanıttan): '` → yeni:
  `'… DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir (kanıttan): '` (V-4).
- **Ölçüm C (izinli tek fark):** token sayısı eşit + farklı token tam 1 + iki dosyada da tek tırnaklı dize sabiti + iki dosyada da `$st.text`
  atamasının içinde + fark yalnız `aşağıda PASS yazan` → `bu satırın devamında PASS yazan` → **sağlandı**.
- İlk tur betiğiyle süreklilik ölçümü (`d6-r02\test\mantik-esitligi.ps1`): Ölçüm B (kapanış metni ataması iki dosyada çıkarılmış) **EŞİT**
  (19313 = 19313); Ölçüm A'nın farklı orta kısmı 5 → 16 karakter.
- Sonuç: işleç, koşul, değişken, çağrı, sıra, pin, çıkış kodu ve fonksiyon sayısı (30 = 30) **aynıdır**; değişen tek kod öğesi bir görüntü
  metni dize sabitinin içeriğidir. "Yorum + Write-Host + istem metni çıkarılınca birebir eşit" ölçütü **bu tek dize sabiti dışında** sağlanır;
  V-4 düzeltmesi bu sabit değişmeden yapılamaz.
- Körlük kontrolü (ikinci tur bloğunun 11 kopyası × 2 sürüm = 22 koşum; beklenenle uyuşan 22): 8 mutant → "eşit değil" (5/6 koşulu, `verified`
  koşulu, EVET karşılaştırması, `Fail` mesajı, kapanış metni atamasında **başka** bir dize sabiti, aynı atamada işleç, `revision` alanı,
  izinli dize sabitinde fazladan değişiklik); 3 kontrol kopyası (yalnız `Write-Host` metni / yalnız yorum / yalnız istem metni) → "eşit sayılır"
  (`d6-r02\tur2\neg\mantik-mutant\`).

| R02 ikinci tur koşumu (**son baytlar**: blok `082527EE…B3E2`, öz-test `34C95DCB…9BAE`) | Sonuç | Kanıt (`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\tur2\`) |
|---|---|---|
| `Parser::ParseFile` (2 ps1) · BOM · satır sonu · kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) | parse hatası 0 (WinPS 5.1 ve pwsh 7) · ps1'lerde UTF-8 BOM var, belgede yok (önceki biçim) · LF (CR 0) · kontrol karakteri 0 | `test\parse-winps51.log`, `test\parse-pwsh7.log` |
| `d6-owner-block-selftest.ps1` | **73/73 PASS** WinPS 5.1.26100 · **73/73 PASS** pwsh 7.6.6, çıkış 0 | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` + `…-status.json` |
| Negatif kontrol: R02 ilk tur blok baytları + ikinci tur öz-testi | **70/73**, çıkış 1; FAIL = G-3, G-5, O-9 (iki sürümde) | `neg\neg-ilk-tur-blok-winps51.log`, `neg\neg-ilk-tur-blok-pwsh7.log` + `…-status.json` |
| Mantık eşitliği (AST + token) | Ölçüm A eşit değil; farklı token 1 (kapanış metni dize sabiti); Ölçüm C sağlandı; ilk tur betiğinde Ölçüm B eşit (iki sürümde); körlük kontrolü 22/22 | `test\mantik-esitligi-tur2.log`, `neg\mantik-mutant\` |
| Paket digest'i (9 pin, bağımsız yeniden hesap) | uyuşmazlık 0; digest = `$ExpPackage` (`7C54C0FC…F057`) | `test\paket-digest-dogrulama.log` |
| Değişmeyen dosyalar (`git diff` ilk R02 commit'ine göre) | değişen yalnız 3 dosya: blok, blok öz-testi, bu belge; koşucu `5D74206B…`, QR `C9FC15AA…`, sahte API `27D8CBAD…`, `d6-selftest.js` `E9FB37DC…` aynı | `test\degismeyen-dosyalar.log` |
| `d6-selftest.js` — commit'li baytlar | **GÜNCEL DURUM (tur 4): koşuldu — 51/51 PASS, çıkış 0** (yeni baytlar `5560FAF8…178F`; aşağıda "R02 tur 4"). Tarihsel not (bu turun metni; baytlar `E9FB37DC…F2C2`): **KOŞULAMADI** (canlı yayın ağacından modül yükler; talimatta yasak) | güncel: `..\tur4\test\d6-selftest-commit.log`; bu turda: — |
| `d6-selftest.js` — ayna kopya (yalnız `const REL` satırı değişik), ikinci tur blok baytlarıyla — **tarihsel kanıt** | **51/51 PASS**, çıkış 0; T-3..T-7 PASS (commit'li dosyanın koşumu değildir) | `test\d6-selftest-ayna.log`, `test\d6-selftest-ayna-status.json`, `test\d6-selftest-ayna-kurulum.json` |

### R02 tur 4 — koşucu öz-testi canlı yayın ağacı bağımlılığı olmadan koşar (2026-10-03; yalnız `d6-selftest.js` + bu belge)

Kapsam: değişen yalnız `scripts/d6-selftest.js` ve bu belgedir. Koşucu (`d6-portal-documents-live-run.js`), owner bloğu, blok öz-testi, QR betiği,
sahte API ve bloğun pinlediği 9 dosya **değişmedi**; paket digest'i aynı (`7C54C0FC…F057`). Canlı Run kapıları ve pin denetimi değişmedi (bloğa
dokunulmadı). Canlı ortamda hiçbir owner bloğu, koşucu, sonda ya da servis/görev komutu koşulmadı; canlı yayın ağacı, canlı DB ve canlı günlükler
okunmadı — canlı ağaç yolu negatif ölçümlerde yalnız **metin** olarak (`D6T_LIB_ROOT` değeri) kullanıldı. Bu tur canlı Run/Recover'ı yetkilendirmez.

| # | Bulgu | Karar | Değişiklik |
|---|---|---|---|
| T4-1 | `d6-selftest.js` Prisma istemcisini ve bcrypt'i sabit yoldan, canlı yayın ağacının `node_modules` dizininden yüklüyordu; commit'li dosya canlı ağaca dokunmadan koşulamıyor, sonuç yalnız tek satırı değiştirilmiş ayna kopyayla alınabiliyordu | ÖNEMLİ — **düzeltildi** | Kütüphane kökü `D6T_LIB_ROOT` ile verilir; verilmezse betiğin checkout'unun proje kökü; kök/modül yoksa çıkış 2; kök (ya da bir bağlantı hedefi) canlı yayın ağacına çözülüyorsa çıkış 4 — ilk yerel `require`dan önce; canlı ağaç owner bloğunun `$Rel` sabitinden okunur (betikte canlı yol literali yok); kullanılan kök çıktıya yazılır (kullanıcı adı maskeli). Tasarım ve koşum komutu: §5 "R02 tur 4"; sınırlar: §7 |

| R02 tur 4 koşumu (**son baytlar**: `d6-selftest.js` `5560FAF8…178F`; blok `082527EE…B3E2` ve blok öz-testi `34C95DCB…9BAE` değişmedi) | Sonuç | Kanıt (`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\d6-r02\tur4\`) |
|---|---|---|
| **Commit'li `d6-selftest.js` doğrudan** (kopya/ayna değil); `D6T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü; test konteyneri + sahte API 8199 / dış 8458 | **51/51 PASS**, çıkış 0; T-3..T-7 PASS; ilk satır `kütüphane kökü: …\HY_WT_R27\project (kaynak: D6T_LIB_ROOT; …)`; test kimlikleri + sonuçları ikinci tur ayna koşumuyla aynı (51 = 51); koşum öncesi/sonrası 6 betiğin sha256'sı eşit | `test\d6-selftest-commit.log`, `test\d6-selftest-commit-status.json` |
| Negatif (a): `D6T_LIB_ROOT` verilmedi, checkout proje kökünde `node_modules` yok | çıkış **2**; "Prisma istemcisi modülü kütüphane kökünde yok (bu checkout'un proje kökü — D6T_LIB_ROOT verilmedi: …) — test BAŞLAMADI; canlı yayın ağacına DÜŞÜLMEZ" | `neg\neg-a-kok-verilmedi.log` + `…-status.json` |
| Negatif (b): kök canlı yayın ağacının altında — dört yazım: bloğun `$Rel` değeri · ağacın kökü (`project` üstü) · küçük harf + `/` ayracı + alt dizin · `..` / `.` bileşenli | çıkış **4** "RED: kütüphane kökü canlı yayın ağacına çözülüyor … test BAŞLAMADI" (4/4). Erişim izleyicisiyle (`node -r`; betik baytları aynı): canlı ağaç altında dosya sistemi çağrısı **0**, modül yükleme **0**, modül çözümleme **0**, `require.cache` içinde canlı ağaçtan dosya **0**; önbellekte yalnız 2 dosya (izleyici + öz-test) → koşucu dahi yüklenmeden çıkıldı (ret `require`dan önce) | `neg\neg-b1-…` … `neg\neg-b4-…` (`.log`, `-status.json`, `-status-izleyici.json`) |
| İzleyici körlük kontrolü (pozitif kontrol): (a) koşumu, izleyici ön eki = gerçekten dokunulan checkout proje kökü | ön ek altında dosya sistemi çağrısı **7**, modül yükleme 1 → izleyici kör değil (b ölçümlerinde gözlenen toplam fs çağrısı 4, modül yükleme 6) | `neg\neg-a-izleyici-pozitif-kontrol-*` |
| Negatif (c): varolmayan kök | çıkış **2**; "kütüphane kökü dizini yok ya da erişilemiyor (… · ilk eksik bileşen: …)" | `neg\neg-c-varolmayan-kok.log` + `…-status.json` |
| Bağlantı (junction) dalı — **ayna**: `d6-selftest.js` baytları commit'li dosyayla **aynı** (`5560FAF8…`), yalnız owner bloğu **kopyasında** `$Rel` kanıt dizinindeki sahte bir "canlı" köke çevrildi (sahte kökte iki modül dizini kurulu: ret çalışmasaydı modül çözülürdü) | düz yazım → **4**; kök = sahte köke junction → **4**; kök gerçek dizin, `node_modules` = sahte köke junction → **4**; üçünde de sahte kök altında dosya sistemi çağrısı **0**. Kontrol: canlı olmayan boş dizine junction → **2** (bağlantı izlendi, çözülen yol yazıldı; 4 değil). Kontrol (commit'li dosya + gerçek blok): aynı sahte dizin canlı sayılmaz → kök kabul edildi ("kütüphane kökü: …" satırı). Blok dosyası olmayan dizin → **2** ("canlı yayın ağacının kökü owner bloğundan okunamadı"). Koşum sonrası kanıt dizininde kalan junction 0 | `neg-baglanti\` (`j0` … `j5`, `ayna-kurulum.json`) |
| Kütüphane kökü bağlantı taraması (R27 aday çalışma ağacı; salt okuma) | `node_modules` bağlantı değil; incelenen bağlantı **4687**; hedefi kökün dışına çıkan **0**; canlı ağaca çıkan **0** | `test\kutuphane-koku-baglanti-taramasi.log` |
| `d6-owner-block-selftest.ps1` (blok ve blok öz-testi baytları değişmedi; koşum öncesi/sonrası sha256 eşit) | **73/73 PASS** Windows PowerShell 5.1.26100 · **73/73 PASS** PowerShell 7.6.6, çıkış 0 | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` + `…-status.json` |
| Paket digest'i (9 pin, bağımsız yeniden hesap) · `node --check` / parse / BOM / satır sonu | uyuşmazlık 0; digest = `$ExpPackage` (`7C54C0FC…F057`) · `d6-selftest.js` `node --check` 0, LF (CR 0), BOM yok (önceki biçim); 2 ps1 parse hatası 0 | `test\paket-digest-dogrulama.log`, `test\parse-bom-satir-sonu.log` |
| Değişen dosyalar (`git diff --name-only` ikinci tur commit'ine `c6d3ff60` göre) | yalnız 2 dosya: `d6-selftest.js`, bu belge; koşucu `5D74206B…`, QR `C9FC15AA…`, sahte API `27D8CBAD…`, blok `082527EE…`, blok öz-testi `34C95DCB…` aynı | `test\degismeyen-dosyalar.log` |

İlk (b3) denemesi ölçüm betiğinin hatasıydı, betiğin değil: sürücü küçük harfe çevirmeyi Türkçe kültürle yaptı (`I` → `ı`), verilen yol canlı
ağaç değil başka (varolmayan) bir ad oldu ve betik doğru olarak "kütüphane kökü dizini yok" (çıkış 2) dedi; canlı ağaç altında dosya sistemi
çağrısı yine 0'dı. Sürücü kültürden bağımsız çevirmeye düzeltildi ve (b3) yeniden ölçüldü (çıkış 4). İlk kayıt silinmedi:
`neg\ilk-kosum-b3-tr-kultur\`.
