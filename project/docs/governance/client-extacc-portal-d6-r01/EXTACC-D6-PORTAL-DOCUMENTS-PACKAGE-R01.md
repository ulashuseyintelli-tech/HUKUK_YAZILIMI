# EXTACC D-6 — PORTAL BELGE AKIŞI CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Canlı Run/Recover ve yayın bu paketle yetkilendirilmez.
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`); owner bloğu bu pini doğrular,
> R26 canlı ile **her modda** (Preflight, QrTest, Run ve Recover) **DUR** verir — R02-b düzeltmesi: önceki metin yalnız "Preflight/Run" diyordu;
> kapılar mod dalından önce koşar (§10.1). Uygulama sırası: R27 yayınından **sonra** (D-5 ile aynı koşul).
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
>
> **R02-b (2026-10-03) — yalnız bu belge.** "Run / normal kapanış / AYRI Recover" sınırları kaynaktan (owner bloğu, koşucu, ortak kütüphaneler)
> yeniden okunarak **§10**'a yazıldı: kapıların her modda koşması ve Recover'ın kapı bağımlılıkları, Recover'ın canlı yazma kümesi, Recover'ın Run
> makbuzunu yeniden yazması, kalıntı senaryosunda tek Recover'ın sınırı, Recover'ın 1 ve 2 çıkış kodları, Run kapanışında personel oturumunun
> yenilenmemesi, onay metni ile kurulumun yazdığı kayıt kümesi arasındaki fark. Owner bloğu, koşucu, iki öz-test, QR betiği, sahte API ve 9 pinli
> dosya **değişmedi**; §6'daki pinler ve paket digest'i aynıdır. Bu turda hiçbir blok, koşucu ya da öz-test **koşulmadı**; §10'daki kalemler
> **kaynaktan okundu, canlıda ölçülmedi**. Karar gerektiren konular §10.8'de **açık owner kararı** olarak durur; bu not canlı Run/Recover'ı
> yetkilendirmez.
>
> **R03 (2026-10-03) — koşucu kapanış eksikleri (koşucu DEĞİŞTİ; pinler ve paket digest'i YENİ).** (a) Run'ın **kendi** kapanışında personel
> oturumu yetkili uçta 401/403 ile reddedilirse koşucu makbuzdaki sentetik personelle **bir kez** yeniden giriş yapar ve kapatmayı **bir kez**
> yeniden dener (Recover değildir; Recover'ın yolu değişmedi); (b) depolama erişim hatası (ÖLÇÜLEMEYEN + ayrı neden) ile **doğrulanmış**
> kalıntı (FAIL) ayrıldı — D6-1D istisnası (D6-E9) kapandı, erişim hatası artık doğrulanmış kalıntıyı da gizlemez; (c) kanıttaki
> kurtarma/kapanış metinleri ve bloğun Recover bitiş satırı yalnız ölçüleni yazar. Değişen dosyalar: koşucu, sahte API, koşucu öz-testi, owner
> bloğu (koşucu pini + paket digest'i + yalnız Recover bitiş METNİ; kapılar, sıra, çıkış kodları değişmedi), blok öz-testi. Ayrıntı, ölçümler,
> negatif kontroller, yeniden girişin canlıya ek etkisi ve yeni sınırlar: **§11**; pinler: **§6**. Bu turda canlı Run/Recover koşulmadı, owner
> bloğu çalıştırılmadı (yalnız blok öz-testi); bu not canlı Run/Recover'ı yetkilendirmez.
>
> **R03-b (2026-10-03) — R03'ün bağımsız doğrulama bulguları giderildi (koşucu DEĞİŞTİ; pinler ve paket digest'i YENİ).** (MAJOR) Kapatma hiç
> gerçekleşmediğinde (portal hesabı DB'de açık) koşucunun kendi portal oturumunun 200 dönmesi artık "ÜRÜN BULGUSU … Recover düzeltemez" diye
> **yazılmaz**: ürün bulgusu yalnız DB kapanışı ölçülmüşken (P6-C2 PASS) yazılır; açık hesapta P6-C4 yine FAIL'dir ama gözlem "portal hesabı DB'de
> hâlâ AÇIK — kapatma YAPILMADI" der. (MINOR 1) Kurtarma nedenindeki portal erişim satırı ürün bulgusu / kalıntı / erişim hatası satırlarından
> bağımsız yazılır. (MINOR 2) Recover çıkış 3 adımı kanıttaki P6-C2/C5 verdict'lerinden kurulur. (MINOR 3) Bloğun Run'daki "BELGE KALINTISI"
> satırı kanıttaki P6-C-DOC verdict'ine ve `docResidue.durum` alanına bağlandı (yalnız metin). Çıkış kodları değişmedi (OK-5 açık kalır).
> Ayrıntı, ölçümler ve negatif kontroller: **§12**; pinler: **§6**. Canlı Run/Recover koşulmadı, owner bloğu çalıştırılmadı; bu not canlı
> Run/Recover'ı yetkilendirmez.
>
> **R03-c (2026-10-03) — kapanış / Recover doğruluğu (owner talimatı madde 2; koşucu DEĞİŞTİ; pinler ve paket digest'i YENİ).** (a) Koşucu
> oturumunun 200 dönmesi artık **yalnız P6-C2 PASS ve P6-C5 PASS** iken ürün bulgusudur: hesap HTTP ölçümleri sırasında yeniden açılırsa (P6-C5
> FAIL) gözlem "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI" der, "Recover düzeltemez" yazılmaz ve kurtarma nedenindeki portal
> satırı HTTP ölçümlerinden sonraki değerleri yazar. (b) Bloğun Recover bitiş satırı her kodu (1 ve 2 dahil) yalnız ölçülenle açıklar; mevcut
> oturum reddinin Recover'da **her zaman** ölçülemediği kodlardan önce yazılır; 0 artık "hiç açılmamıştı" demez. (c) Makbuz dosyası yazılamamış
> ya da bulunamıyorsa kanıttaki kurtarma adımı ve bloğun Run sonu metni uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` önerisini **yazmaz**;
> kanıttaki `receipt` nesnesinden yeni makbuz dosyası yolu (öz-testte uçtan uca ölçüldü) **[R03-d'de GEÇERSİZ → §13.5: o yol WinPS 5.1'de kullanılamıyordu;
> yerine kanıttaki `recovery.makbuzJson`'dan iki kabukta ölçülmüş TEK komut]** ya da kanıtta da yoksa **somut engel** yazılır. Çıkış
> kodları değişmedi. (d) Hesap yokken günlükteki P6-C1 satırı artık "kapatıldı" demez (ikinci commit; D-7 taramasının ikizi). Ayrıntı ve
> ölçümler: **§13**; pinler: **§6**. Canlı Run/Recover koşulmadı; bu not canlı Run/Recover'ı yetkilendirmez.
>
> **R03-d (2026-10-04) — R03-c bağımsız doğrulamasının bulguları (koşucu, sahte API, öz-testler ve blok DEĞİŞTİ; pinler ve paket digest'i YENİ).**
> R03-c (a)'daki **"ürün bulgusu adayı DEĞİL" sınıflaması YANLIŞTI**: ürünün guard'ı eski oturumu sürüm farkıyla `isActive`'ten bağımsız reddeder ve
> yeniden açma sürümü artırır — P6-C2 PASS + P6-C5 FAIL iken 200 artık sürüme bağlı sınıflanır ("ÜRÜN BULGUSU ADAYI" + ayrı "yeniden AÇILDI … (Recover
> kapatabilir)" satırı; "adayı DEĞİL" yalnız sürüm verilme değerine eşit ve hesap açıkken). R03-c (c)'deki "receipt nesnesini yeni JSON dosyasına yazın"
> yolu ölçülmemişti ve WinPS 5.1'de kullanılamıyordu; yerine iki kabukta ölçülmüş TEK komut. Bloğun Recover kod açıklamaları yalnız okunabilir kanıt
> varken; bayat makbuz önerilmez. Ayrıntı ve ölçümler: **§13.5**; pinler: **§6**. Canlı Run/Recover koşulmadı; bu not canlı Run/Recover'ı yetkilendirmez.
> **[R03-e'de değişti → §13.6:** "adayı DEĞİL" dalı kaldırıldı; sürüm kuralı artık her 200'e uygulanır.**]** **[R03-f'de değişti → §13.7:** "(Recover kapatabilir)" kesin
> ifadesi kaldırıldı — Recover metni Run'ın kapatma çağrılarına bağlı; "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken.**]**
>
> **R03-e (2026-10-04) — R03-d iki bağımsız doğrulamasının bulguları (koşucu, sahte API, iki öz-test ve blok DEĞİŞTİ; pinler ve paket digest'i YENİ).**
> (B1) R03-d'nin sürüm kuralı yalnız P6-C2 PASS + P6-C5 FAIL dalındaydı; kardeş dal (kapatmadan sonra hesap AÇIK) 200'ü sürüme bakmadan "ürün bulgusu
> SAYILMADI" yazıyor, 2xx kapatma çağrısına rağmen "kapatma YAPILMADI" diyordu. Artık koşucu oturumunun **her** 200'ü tek fonksiyonla, kaynağa karşı
> denetlenmiş bir **karar tablosuyla** sınıflanır (§13.6); "ürün bulgusu değil" yalnız T5'te (hesap önce ve sonra açık, sürüm verilme sürümüne eşit)
> yazılır; R03-d'nin "sürüm geri dönüşü → adayı DEĞİL" dalı kaldırıldı (artık AYRIŞTIRILAMADI). Kapatma metni ölçülene bağlı; açık portal erişimi ürün
> bulgusundan **ayrı** satırda (kanıt + blok ekranı). Verilme sürümü koşucunun token'ındaki claim'den (İMZASIZ decode; token kanıta yazılmaz).
> (B2) Bu belgedeki R03-d'de geçersizleşen satırlar işaretlendi. (B3) 5xx'in guard'ı geçtiğini gösterdiği not edildi (kod değişmedi). Ayrıntı ve
> ölçümler: **§13.6**; pinler: **§6**. Canlı Run/Recover koşulmadı; bu not canlı Run/Recover'ı yetkilendirmez.
> **[R03-f'de değişti → §13.7:** karar sırası (b'den bağımsız T1 → TG → T3, sonra T0), TI yalnız a = b = c, T5 metni ("kapatma DB'ye yansımadı" yerine ölçülen),
> açık erişim metni ("portal hesabı açık … (Recover kapatabilir)" yerine ölçülen durum + Run'ın kapatma çağrılarına bağlı Recover metni), P6-C1 açıklaması.**]**
>
> **R03-f (2026-10-04) — R03-e iki bağımsız doğrulamasının MINOR bulguları (koşucu, sahte API, iki öz-test ve blok DEĞİŞTİ; pinler ve paket digest'i YENİ).**
> (F1) P6-C1 açıklaması ölçülene indi: "kapatma çağrısı yetkili uçta 2xx döndü (admin/disable-user) ya da hesap zaten kapalıydı ya da 2xx olmadan kapatma
> adımından sonra DB'de kapalı görüldü — DB kapanışı P6-C2 / P6-C5 satırlarında"; gözlemde hangi dayanağın tuttuğu (`dayanak=`); "kapatıldı" DB kapanışı
> ölçülmeden yazılmaz. (F2) "(Recover kapatabilir)" kesin ifadesi kaldırıldı: Run'daki son kapatma çağrısı 401/403 ise "Recover aynı personel kimliğiyle
> kapatmayı yeniden dener; Run'da kapatma HTTP <kod> ile reddedildi — Recover'ın kapatabildiği ÖLÇÜLMEDİ (…)", aksi halde "Recover kapatmayı yeniden dener
> (sonuç Recover kanıtında ölçülür)". (F3) Kısmi durum metinleri ölçülenle: "portal hesabı AKTİF (…)" / "portal kapanışı TAMAMLANMADI: hesap pasif ama
> müvekkil erişim bayrağı açık (…)"; "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken; T5 "hesap aktif kaldı …; guard hasPortalAccess okumaz; 200
> beklenir — ürün bulgusu değil (…)". (F4) TI yalnız a = b = c; a = c ≠ b → T2 ADAY. (F5) b'den bağımsız ADAY hücreleri T0'dan önce: T1 → **TG** (yeni: token
> claim'i geçersiz — guard her isteği reddeder, `portal-auth.guard.ts:42-45`) → T3. (F6) Bloğun bayat R03-d yorumu düzeltildi (yalnız yorum). Ayrıntı,
> ölçümler ve negatif kontroller: **§13.7**; pinler: **§6**. Canlı Run/Recover koşulmadı; bu not canlı Run/Recover'ı yetkilendirmez.
> **[R03-g'de değişti → §13.8:** Recover modunun açık erişim metni ölçülene bağlı; token JWT olarak okunamazsa TJ (ADAY).**]**
>
> **R03-g (2026-10-04) — R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur (koşucu, sahte API, koşucu öz-testi ve blok DEĞİŞTİ; pinler ve paket
> digest'i YENİ; blok öz-testi DEĞİŞMEDİ).** (G1) Recover modunda açık erişim metni ölçülene bağlı: Recover kapatmayı 2xx ile yapıp P6-C2 PASS ölçtüyse ve
> erişim HTTP ölçümleri sırasında yeniden açıldıysa "Recover kapattı (kapatma çağrısı 2xx, P6-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı
> (P6-C5 FAIL) — açık erişim KAPANMADI; …"; "bu Recover kapatamadı" yalnız kapatma adımından sonra DB'de kapalı ölçülmemişken. (G2) D-6 bloğunda koşulsuz
> Recover yetenek metni YOK (ölçüldü) — blok metni değişmedi. (G3) Token JWT olarak okunamazsa (verilme sürümü s1'e düşse de) HTTP 200 → yeni hücre **TJ**
> (ADAY; ürün guard'ı bu token'ı DB'den önce reddeder, `portal-auth.guard.ts:36`); T5'e ulaşmaz. (G4) T2'nin a = c ≠ b dalında b > c iken "ALTINDA" notu.
> (G5) Sıra girdileri (B / T1 → TG / TJ). (G6) §13.6 (v) işaretlendi. Ayrıntı, ölçümler ve negatif kontroller: **§13.8**; pinler: **§6**. Canlı Run/Recover
> koşulmadı; bu not canlı Run/Recover'ı yetkilendirmez.
>
> **R04-recover-girdi (2026-10-04) — owner kararı madde 5 + 6 (koşucu, koşucu öz-testi, owner bloğu, blok öz-testi ve bu belge değişti; koşucu pini ve paket
> digest'i YENİ; sahte API DEĞİŞMEDİ) — §13.9:** (i) Yeni Recover girdisi `-Mode Recover -RunEvidenceDir '<tamamlanmış Run kanıt dizini>'`: makbuzu blok, ayrı Recover onayından (owner bu modu ayrıca başlatır; kalıntı kararı sorulur) sonra,
> Run kanıtındaki `recovery.makbuzJson` alanından Run kanıt dizininin **dışına** (kardeş dizin) yazar ve Recover başlamadan doğrular (manifest / hash bağı, runId /
> kimlik bağı, GO defteri satırı, geri okuma, kaynağın değişmediği); biri tutmazsa Recover başlamaz ve başarı sayılmaz. Var olan makbuz ezilmez; `-ReceiptFile` yolu
> korunur; Run başarısız oldu diye otomatik Recover yoktur. (ii) Recover bitiş ekranı portal erişimini son ölçüme göre AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir.
> (iii) Ret ölçütlerinde (P6-C3L/D, P6-C4L/D) 503 / 429 dışındaki 5xx gözlemi "ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" der; sonuç
> (verdict) ve çıkış kodları değişmedi. Manifestin bağımsız çapası **yoktur** (sınır; ekrana ve kayda yazılır). **Koşucu öz-testi bu aşamada KOŞULMADI** (blok öz-testi iki
> kabukta koşuldu). Pinler: **§6**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.

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
**R03 — istisna KAPANDI (§11.2):** satır alanları doğru ve dosya `olculemez` ise D6-1D artık **ÖLÇÜLEMEYEN** + ayrı neden ("depolama erişimi
ÖLÇÜLEMEDİ (<kod>)") verir; dosya doğrulanmış olarak yoksa (ENOENT/ENOTDIR) ya da satır alanı yanlışsa FAIL kalır. Kapı yine **kapalıdır**
(gösterim kapısı PASS ister). Ayrıca D6-5D ve P6-C-DOC'ta **doğrulanmış kalıntı** (kalan satır ya da stat `var`) erişim hatası yanında da FAIL'dir
(önceki baytlarda erişim hatası onu ÖLÇÜLEMEYEN'e indiriyordu); kanıtta `portalClose.docResidue.durum` = `DOGRULANMIS_KALINTI` |
`ERISIM_OLCULEMEDI` | `YOK` (| `OLCULEMEDI_DB`).

**Kapılar:** D-4/D-5 ortak kapılara ek olarak **izole mod API kapısı** (inceleme R01, bulgu 12): bağlı DB `hukuk_db` değilse `D6_API_BASE`
127.0.0.1/localhost ve **8080 dışı** açık bir port olmalı; aksi halde çıkış 4 ve hiçbir çağrı yapılmaz (yanlış beyanla izole koşumdan canlı
API'ye tek giriş denemesi bile gitmez). D-5 koşucusunda bu kapı **yoktur** (ayrı kayıt, §7).

Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI (erişim **ya da belge
kalıntısı**) DOĞRULANMADI · 7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0). Kalan belge varsa DELETE personel oturumuyla
**yapılamaz** (ürün ucu yok): Run 6 verir; Recover'da owner kararı `D6_RESIDUE_CLEANUP=1` satırları Prisma ile siler, **dosyaları silmez**
(ad listeler, yollar makbuza `residueFiles`); owner dosyayı elle sildikten sonra Recover bir kez daha → P6-C-DOC ölçülür; Recover
ölçülemeyeni 0 yapmaz (C4 → 3). **Recover'ın 0 verebildiği tek yol** Recover anında portal hesabının DB'de YOK ölçüldüğü erken dönüştür (bu
yolda HTTP reddi ölçülmez; hesabın "hiç açılmamış" olduğu ölçülmez — R03-d düzeltmesi, §13.5); hesap varken mevcut oturum reddi Recover'da ölçülemez →
en iyi 3 (Run kanıtındaki P6-C4 satırlarına bakılır).
**R02 (ikinci turda yeniden yazıldı):** bu paragraf koşucunun Recover modundaki **davranışını** (öz-testte ölçülen çıkış kodlarını) anlatır;
owner için bir adım tanımı **değildir** ve bir çıkış kodu Recover'ı **yetkilendirmez**. Recover yalnız kanıt incelendikten sonra **ayrı owner
onayıyla, bir kez** başlatılır; blok onu kendiliğinden başlatmaz. Yukarıdaki "Recover bir kez daha" ifadesi koşucunun öz-testte ölçülen
davranışıdır: **ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir** (§4 adım 7, §7).
**R02-b (2026-10-03):** yukarıdaki "owner dosyayı elle sildikten sonra Recover bir kez daha" akışı **iki** Recover içerir; tek Recover kuralıyla
birlikte okunduğunda sıra karara bağlanmamıştır — dosya diskte kaldıkça P6-C-DOC FAIL ve çıkış 6'dır (§10.4; **açık owner kararı OK-2**, §10.8).
Çıkış satırındaki kodlar Run içindir; Recover'ın 1 ve 2 dahil çıkış kodları §10.5'tedir.

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

**R02-b — kapılar ve Recover (2026-10-03; blok değişmedi, yalnız bu belge):** bu bölümün ilk paragrafı kapıları "Preflight" başlığı altında
sayar; blokta salt okuma kapıları **mod dalından önce** koşar ve QrTest, Run ile **Recover**'da da aynen aranır (dış zincir yalnız Preflight ve
Run'da, yerel konsol yalnız QrTest ve Run'da). Recover'ın kapı bağımlılıkları §10.1'de, Recover'ın canlı yazma kümesi §10.2'de, Recover'ın
bitiş satırında sayılmayan 1 ve 2 çıkış kodları §10.5'tedir. Blok Recover girişinde canlı yazma kümesini owner'a **göstermez** (tek soru
kalıntı kararıdır); owner bu kümeyi §10.2'den okur. **R03-c:** Recover bitiş satırı artık 1 ve 2'yi de sayar ve mevcut oturum reddinin Recover'da
her zaman ölçülemediğini kodlardan önce yazar; Run çıkış 5/6 metni Recover komutunu yalnız makbuz dosyası okunabiliyorsa önerir (§13).

**R04 — Recover girdisi (2026-10-04; §13.9):** Recover artık `-ReceiptFile <makbuz>` **ya da** `-RunEvidenceDir <tamamlanmış Run kanıt dizini>` ile başlatılır (biri;
ikisi birlikte DUR). `-RunEvidenceDir` yolunda makbuzu blok, owner bu modu ayrıca başlatıp kalıntı kararını verdikten sonra, Run kanıtındaki `recovery.makbuzJson`
alanından Run kanıt dizininin **dışına** (kardeş dizin) yazar ve Recover başlamadan doğrular; biri tutmazsa Recover başlamaz. Run çıkış 5/6 ekranı kanıtta makbuz metni
varsa elle komut yerine bu seçeneği gösterir (blok Recover'ı kendiliğinden başlatmaz). Recover bitiş ekranı portal erişimini son ölçüme göre AÇIK / KAPALI /
ÖLÇÜLEMEDİ diye gösterir. Kapılar, Run sırası, node çağrısı ve çıkış kodları değişmedi.

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
   - (d) **R02-b (2026-10-03) — Recover onayından ÖNCE okunacaklar (§10):** Recover canlıya yazar; yazma kümesi §10.2'dedir (blok bunu göstermez).
     Recover ancak tüm salt okuma kapıları geçerse başlar (§10.1); Run'dan sonra main ilerlemiş, canlı dist ya da `.env` değişmiş ya da API
     kapalıysa blok 90 ile durur ve Recover başlamaz (**açık owner kararı OK-1**). Recover, Run makbuzunu yeniden yazabilir; Run'ın
     `SHA256-MANIFEST.txt` dosyasındaki makbuz özeti artık tutmaz (§10.3; **OK-3**). Kalıntı senaryosunda (b)→(c) sırası — önce Recover, sonra
     dosyanın elle silinmesi — tek Recover ile P6-C-DOC PASS **üretmez**; sıranın nasıl olacağı **açık owner kararıdır** (§10.4; **OK-2**) ve bu
     belgeyle karara bağlanmaz. Recover 1 ya da 2 ile de bitebilir (§10.5); bu kodlar da yeni bir Recover için yetki değildir.
   - (e) **R04 (2026-10-04; §13.9) — Recover girdisi:** (b)'deki `-ReceiptFile` yerine **`-Mode Recover -RunEvidenceDir` ve ardından Run kanıt dizininin tam yolu**
     kullanılır (Run çıkış 5/6 ekranı, kanıtta makbuz metni varsa bu seçeneği somut yoluyla gösterir). Bu yolda makbuzu blok, kalıntı kararından sonra, Run kanıt
     dizininin **dışına** (kardeş dizin `<Run dizini>.recover-girdi-<UTC zaman>`) yazar ve doğrular; doğrulama tutmazsa Recover başlamaz (blok 90 ile durur) ve Run
     kanıt dizini değişmez. Run dizinindeki `d6-setup-receipt.json` dosyasını `-ReceiptFile` ile vermeyin (o yol Run dizinini değiştirir — §10.3). Ayrı owner onayı ve
     "bir kez" kuralı aynen geçerlidir; blok Recover'ı kendiliğinden başlatmaz.

## 5. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB 127.0.0.1:5448/d5_reset_test, sahte API 8199 / dış 8458)

**R03-b (2026-10-03) — güncel sonuçlar §12.4'tedir** (koşucu öz-testi 70 test, blok öz-testi 76 test). R03 sonuçları (62 / 75 test) §11.4'te
tarihsel kanıt olarak durur. R03 ve R03-b koşumları ajanın kendi tek kullanımlık konteynerinde. Aşağıdaki satırlar önceki baytların tarihsel kanıtıdır.

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

**R03 — DB kapısı:** `d6-selftest.js` artık sabit `127.0.0.1:5448/d5_reset_test` istemez (o konteyner başka işlere aittir): bağlantı
dizgesi `127.0.0.1` + **5432 dışı** bir port + `_test` ile biten ve `hukuk_db` olmayan bir veritabanı adı olmalıdır; koşucuya beklenen DB adı
bu addan verilir. R03 koşumları ajanın kendi tek kullanımlık konteynerinde koşuldu (§11.4). Aşağıdaki ön koşul satırı tur 4 koşumunu anlatır.
Ön koşul: test konteyneri (`d5-reset-pg`) çalışıyor, 8199 ve 8458 portları boş, `openssl` yolda. **Sonuç (2026-10-03, node v24.18.0): 51/51 PASS,
çıkış 0**; ilk çıktı satırı `kütüphane kökü: D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project (kaynak: D6T_LIB_ROOT; canlı yayın ağacı DEĞİL …)`.
Üç negatif ölçüm: (a) `D6T_LIB_ROOT` verilmeden ve checkout kökünde modüller yokken → çıkış **2**; (b) kök canlı yayın ağacının altında → çıkış
**4**, canlı ağaç altında dosya sistemi çağrısı 0 ve modül yükleme 0 (ret `require`dan önce); (c) varolmayan kök → çıkış **2** (ayrıntı: §9
"R02 tur 4"). **Ayna kopya sonuçları tarihsel kanıttır:** `d6-r02\test\` ve `d6-r02\tur2\test\` altındaki `d6-selftest-ayna.*` dosyaları önceki
baytların tek satırı değiştirilmiş kopyasının koşumlarıdır; silinmedi ve değiştirilmedi. Güncel sonuç, commit'li dosyanın tur 4 koşumudur.

## 6. Pinler (ölçülen değerler; sha256 ham dosya baytı — 2026-10-04 **R04-recover-girdi** sonrası; R04'te değişen: koşucu, koşucu öz-testi, blok, blok öz-testi, paket digest'i — sahte API ve `d6-qr-test.js` DEĞİŞMEDİ)

| Dosya | sha256 |
|---|---|
| `d6-portal-documents-live-run.js` (koşucu; bloktaki `PkgPins` girdisiyle **eşit**; **R04 — son baytlar** (§13.9: ret ölçütlerinde (P6-C3L/D, P6-C4L/D) 503 / 429 dışındaki 5xx gözlem metni `rejectObs` — "ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)"; verdict ve çıkış kodları aynı); **R03-g** değeri `191C6B2F9EFD783F567C46DA3296510404504F8D3F193C62C83EB0A68210E97A` (§13.8: Recover modunda açık erişim metni ölçülene bağlı (`recoverOpenAccessText`), token JWT olarak okunamazsa TJ (`sessionClass200` 5. girdi `claimUnreadable`; sıra B → T1 → TG → TJ → T3 → T0 …), T2 a = c ≠ b dalında ALTINDA notu); **R03-f** değeri `AA3D819E6E31EAEF99E2EDF47C3521419775DC94ECE031171816EDD1B28AAE0A` (§13.7: P6-C1 açıklaması ölçülene indi (`C1_DESC` + `dayanak=`), Recover metni `disableCalls`'a bağlı (`recoverCloseText`), kısmi durum metinleri (`openStateTxt`), karar sırası B → T1 → TG → T3 → T0, TI yalnız a = b = c, T5 metni); **R03-e** değeri `9C8B05105532A212B8AEC0005C805AB19D8232FAB21B06DDE8E5DAE89AC49349` (§13.6: oturum 200'ünün tek sınıflaması `sessionClass200` + karar tablosu, ölçülen kapatma metni, `portalClose.acikErisim`, token claim'inden verilme sürümü `issuedVersion`); **R03-d** değeri `EE0AE16D13BAD1A8E3AFE5FEF3E668409BEB85E09AA054499C28A73E0E0E0202` (§13.5: sürüme bağlı oturum sınıflaması, BOM'lu makbuz okuma, `recovery.makbuzJson` + TEK komut, bayat makbuz, P6-FOREIGN-CLEAN açıklaması, `makbuzDiskte` = dosya); **R03-c** değeri `84D003D7DE242BF35613D1F0CF1362871765CEBD96AFCAE74E2C080471987017` (§13; ikinci commit: hesap yokken P6-C1 satır açıklaması); R03-c ilk commit ara değeri `9FA67CAE821A41B5A8A68071B4338F38216F4ACAC180244FE9236DE5DC51EFD8`; **R03-b** değeri `46AB88957A4F8C239EE8525D80A19D39A6E22706B31F4D9AC93EFF4FF590C3F7`; **R03** değeri `7BB52D994DA5AB19009097DF6227F79E5C72E8FC1434EDBF29FACEC65F875C0F`; R02 ve öncesi — R01 kapanış düzeltmesinden beri — `5D74206BAA26FD752FA57C3342698EDD870CA25A8BDB20B9C2213600EDE758DD`) | `74C495094F1191C950728D866245044DBDF5DBB82E216519646D2ED36284BDCE` |
| `d6-qr-test.js` (PkgPins; R02, R03, R03-b, R03-c, R03-d, R03-e, R03-f, R03-g ve R04'te değişmedi) | `C9FC15AADBFDF4AA87702542340EB6A5C68558D3FE6423F06DED8E452D85F418` |
| `d6-owner-live-block.ps1` (**R04 — son baytlar** (§13.9): yeni Recover girdisi `-RunEvidenceDir` (makbuzu blok yazar ve doğrular; kardeş dizin; ezme yok; hata → DUR + KULLANILMAZ işareti), Run çıkış 5/6 ekranı bu seçeneği gösterir, Recover bitiş ekranında PORTAL ERİŞİMİ (son ölçüme göre) satırı, PkgPins'te koşucu pini + `$ExpPackage` + başlık notu; kapılar, Run sırası, node çağrısı, çıkış kodları değişmedi; **R03-g ek** değeri `194816C56D4AEF83874C82EA72922B6B88E208445ED258F8FAA960BDE7E9C686` (§13.8 "R03-g ek"): Run onay ekranındaki (`Confirm-LiveDataProcessing`) kapanış satırı "Hedeflenen kapanış: … sonuç kanıttaki P6-C*, P6-FOREIGN-CLEAN ve U-CLOSE satırlarından okunur (ör. kapatma çağrısı 401/403 dönerse portal hesabı açık kalır)" olarak nitelendi (yalnız gösterilen metin; PkgPins ve `$ExpPackage` değişmedi); **R03-g** değeri `F1EBCC45E3F2BADBD746211BCB6F6236C768A912818630806505DAFB6DDD86DB` (§13.8): PkgPins'te koşucu pini + `$ExpPackage` + başlık notu (bu blokta koşulsuz Recover yetenek metni YOK — ölçüldü; Recover bitiş ekranı `acikErisim`'i göstermez — önceki tasarım); kapılar, sıra, Recover okuma kapısı, node çağrısı, gösterilen metin, çıkış kodları değişmedi; **R03-f** değeri `B2D15957F54E92BA94CB3238F549B5BDC965EB5CFEBD40830CD468CB5CB60E45` (§13.7): PkgPins'te koşucu pini + `$ExpPackage` + YALNIZ YORUM (ADAY gösterim yorumu karar tablosunu adlandırır; bayat R03-d yorumu ve açık erişim satırı yorumundaki Recover'ın kapatabileceği iddiası kaldırıldı) + başlık notu; kapılar, sıra, Recover okuma kapısı, node çağrısı, gösterilen metin, çıkış kodları değişmedi; **R03-e** değeri `4A444A3054A76B33BB821E08D88C537BCD0F497DAEAFE51AC8FD2B85B2A39A74` (§13.6): PkgPins'te koşucu pini + `$ExpPackage` + Run sonu ekranında `portalClose.acikErisim` ürün bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırı + başlık notu; kapılar, sıra, Recover okuma kapısı, node çağrısı, çıkış kodları değişmedi; **R03-d** değeri `4DB916169E328028F21420DF6D4589555A33C72D843AEFE78DDB9A153D12BB84` (§13.5): PkgPins'te koşucu pini + `$ExpPackage` + Recover bitiş satırı kod açıklamalarını yalnız okunabilir kanıt varken yazar (`Get-RecoverEvidenceState`) ve 3'ün metni ölçülenle + Run 5/6'da bayat makbuz önerilmez ve kanıttaki makbuzJson'dan TEK komut + ürün bulgusu ADAYI gösterimi + `Get-ClosureStatus` kanıtı `-Encoding UTF8` ile okur; kapılar, sıra, Recover okuma kapısı, çıkış kodları değişmedi; **R03-c** değeri `20A01089AA565221396F4955F396A4E506D39DBB20DAB877DC2886D72AC8ACA0` (PkgPins'te koşucu pini + `$ExpPackage` + yalnız METİN — Recover bitiş satırı (1 ve 2 dahil; mevcut oturum reddi her zaman ölçülemez) ve Run çıkış 5/6 metni (`Get-ReceiptFileState`: Recover komutu yalnız makbuz dosyası okunabiliyorsa) + başlık notu; kapılar, sıra, Recover okuma kapısı, çıkış kodları değişmedi; ikinci commit'te yalnız koşucu pini + `$ExpPackage` + başlık notu değişti; R03-c ilk commit ara değeri `A40842067065DC9E02AA079E6645E5EAAB7C0A97221DA82B5C6ACCE7BE5AE34E`; **R03-b** değeri `7B43591AED43C478AE97BB830F7CA8F9A0B6CE8881857DFFBA72C5681DF983C2` (Run'daki BELGE KALINTISI METNİ); **R03** değeri `76018BA78B50E81B6774675799D56B5CFB099E567DD96B41CE5D080F4D9DDF68`; **R02 ikinci tur** değeri `082527EE641565B4E1B1F6ADF9A6EE6935EC796F958430C99CE16E3E28A8B3E2`; **R02 ilk tur** ara değeri `5AEF38932FE9458F799349C559649E8AB75A2585C7A403EDB066BC9F58AFFA61` (yalnız metin + kapanış metni ifadesi); R02 öncesi — kapanış düzeltmesi — `A206E19E208F791631F94A4A0C1A67D435BA9AC35CD3E71F72164B9185DA3629`; ondan önceki `DE3634BE…5321`) | `054CB9622FB5EC3020C98868E0F5B444C7B8D02D7479738106A960ACECF9A8D3` |
| `d6-fake-portal-api.js` (**R04'te DEĞİŞMEDİ**; **R03-g — son baytlar** (§13.8): guard NORMAL taklidi ürün guard'ı gibi JWT olmayan token'ı (`portalToken opaque`) DB'ye bakmadan reddeder (`portal-auth.guard.ts:36`; R03-e/f'de kabul ediyordu — ürün davranışı değildi) + `reopenOn extLogin` (yeniden açma tetiği başarılı kapatmadan sonraki İLK dış portal girişi yanıtlandıktan sonra; Recover uçtan uca ölçümü için; varsayılan `documents` = önceki davranış); **R03-f** değeri `0715DBB4853897F45D4ADB3E9555A936825FACA5FC51B11CB83398D98C561BDC`: `portalToken badClaim` (tokenVersion claim'i -1) + guard NORMAL taklidi ürün gibi geçersiz claim'i DB'ye bakmadan reddeder (§13.7); **R03-e** değeri `AF4943D336C5407F9850811CCE18BAE78F0B34C1B8C05D5D2A88A81617501BE6`: portal token'ı ürün gibi üç parçalı JWT biçiminde (claim adları ürünle aynı) + `portalToken opaque` · `login bumpBeforeSign` · `pwChange onDisable` · `rowDelete onDisable` · `disable passiveOnly` · `reopen afterDisableNoBump` (§13.6); **R03-d** değeri `AA8EE23E5B8E2B9F79B031971F989F19B0641D29E57765D278A6DD4B61B16EDB` (`reopen afterDisable` sürümü ürün gibi ARTIRIR + `afterDisableRevert` (sürüm verilme değerine döner) (§13.5)); **R03-c** değeri `3CF7AD13A2DEE52893015434E2FAF4091682DB57A18E0D7BD2212947C493D520` (`reopen normal\|afterDisable` senaryosu, §13); **R03-b** değeri `A863011C9C9B34F978D29B02ED5F8CEF280C9E6D0E261DE99AF1D3B0CA72166C` (`relogin normal\|reject\|rateLimit` senaryosu, §12.4); **R03** değeri `FC06C8CC911F4285CE765952D38FD4BB52E497F0FACAFB77C70333F29CC12054` (benzersiz personel token'ı + R03 senaryoları (§11.4) + ACL reddi yalnız sürecin geçici kovasındaki dosyaya); R03 ara değeri (kova sınırı denetimi öncesi; ilk koşum ve ilk negatif kontrol) `4A5103842EFF905EDB93128BD9C11F2EEE078C581190FF7A159D633AEB5F2BFC`; R02 ve öncesi `27D8CBADE5694F398151BBA0CCFB10C0472383CFF1E3DD24DEA49EFDD587953A`). PkgPins'te **değildir** | `6D55509A6D8B18692717BDD5866D9F02650B8DDCC0C6924FD288FCD3172DF7E6` |
| `d6-selftest.js` (**R04 — son baytlar**: T-11 yeni (1; birim + statik, 5xx gözlem metni) → 103 test (§13.9) — **bu aşamada KOŞULMADI**; **R03-g** değeri `81431BF8F33DBDD4C2AE0A5D62424FACE5FDBE032EA2D1B8D46E683818C3B372`: Z25-a, Z25-b, Z25-c, Z25-d yeni (4) + Z23-a, Z23-l, T-9 değişti (3) → 102 test (§13.8); **R03-f** değeri `706F9499455BA5705621CBB65DFD52526FA286D1378A488309E7DABF67A7B205`: Z24-a..e + T-10 yeni (6) + Z20-a..d, Z20-f, Z20-h, Z21-a, Z22-a, Z22-b, Z22-c, Z23-a, Z23-c, Z23-d, Z23-g, Z23-h, Z23-i, Z23-j, T-9 değişti (18) → 98 test (§13.7); **R03-e** değeri `B7E6BAA7CCF3887D0FB4933AE009C53B922D4F754A955547C932DCC3E4FFCF78`: Z23-a..l + T-9 yeni (13) + Z20-a..d, Z20-f, Z20-h, Z21-a, Z22-b, Z22-c değişti → 92 test (§13.6); **R03-d** değeri `434B55E3445E881EC2ECF2B331218B9F5266B53925B7320D1627326FF6F3608F` (Z22-a..e yeni + Z16-a, Z21-a, Z21-b, Z21-c değişti → 79 test (§13.5)); **R03-c** değeri `F6F544448C130C67A7D6DB80BE7C22B3D30F384CF859335A84F4B7DE5AEF82AC` (Z21-a..d yeni + Z20-e, Z20-h değişti → 74 test); R03-c ilk commit ara değeri `6D7BD64FB3CE2409AA0F12719696EC03E0D76D30A57FB346413423C34A34385C` (Z21-d yok, 73 test); **R03-b** değeri `DF54415700010B377F0210EA4E42C66413E238AA59315DDC8C4E18A48AD6E99F` (Z20-a..h → 70 test); **R03** değeri `2B0003CBB63B8FDB4C13B0D016A19CA794DC1F3E096D78FFACDFC37A5D4904E2` (Z17, Z18, Z19, C-1, T-8 → 62 test + DB kapısı kendi konteyner için genelleştirildi); **R02 tur 4** değeri `5560FAF870B90E03471B973AE2289593354C3D71F62D69D565B71F695603178F` (51 test); ondan önceki — R02 ilk ve ikinci turda değişmemişti — `E9FB37DC6D4069682722C4C4ADCCAA1E8F29D771F0E1A8508D3EC1D78686F2C2`). PkgPins'te **değildir** (koşucu bu dosyayı yüklemez); paket digest'i etkilenmez | `AF0697A6CAE703F033F3C3239E5974871C48484C657072AC240B20EAF9ACF961` |
| `d6-owner-block-selftest.ps1` (**R04 — son baytlar**: RG-1 … RG-10 yeni (10) + O-13 değişti + O-15 kaldırıldı → 92 test; sahte koşucu kanıta `runId` + tam `receipt` yazar, `EXSTUB_PC` ile `portalClose` verilir (§13.9); **R03-f / R03-g** değeri `3159BF72F973D6FDA06B956FD81FA74A4E90D5D694BEC5418A0FD8D316E01A38` (R03-g'de DEĞİŞMEDİ — blokta yalnız pin + başlık notu değişti; G2'nin D-6 karşılığı yok — §13.8): O-18 yeni → 83 test (§13.7); **R03-e** değeri `6681E3D244AC2C82B865E2460359F0C9012D3F2081FDF52220835FCC2C996B12`: O-17 yeni → 82 test; sahte koşucu `EXSTUB_ACIK` ile `portalClose.acikErisim` yazar (§13.6); **R03-d** değeri `3300E3F128394EA291221300D3DC84AD3A0AF9DE4AFC604899A0B5CA31C4D65E` (O-14, O-15, O-16 yeni + O-12, O-13 değişti → 81 test; sahte koşucu kanıta record + exitCode + recovery.makbuzJson yazar (§13.5)); **R03-c** değeri `636F006812E43192265E417E6E5CAA72B80047D036C19F8A1D95263BFA68EF55` (O-12, O-13 yeni + O-5 değişti → 78 test; sahte koşucu Run'da makbuz yazar; O-10 döngü değişkeni `$t` → `$o10t` (geçici dizin değişkenini eziyordu; ölçüt mantığı aynı); **R03-b** değeri `02650A8B3490B80C2B898AE730C26C8C9FF8B184CE04CB2383573426338EB2F5` (O-11 → 76 test + sahte kanıta `portalClose.docResidue.durum`); **R03** değeri `AC8F06EFDB3A54266F104110EB2054F036361B86C35B333A94BD5E9C5F596581` (2 yeni test PIN-1, O-10 → 75 test); **R02 ikinci tur** değeri `34C95DCBBB76362AA9D5B683D4990B133C42040ECF6BA63A5AF40B91B9349BAE` (G-3 yeniden yazıldı + G-5, O-9 → 73 test); **R02 ilk tur** ara değeri `810BDEF5C7EE4D1F98676C705C1BC9CBF73BDD969A27DA1686B6F70F801F9FB4` (71 test); R02 öncesi — kapanış düzeltmesi, 6 yeni test — `4E7ED8D7531CDC49FBDE783B3DAD9C2F9BEB675C1EF30504B09FC0B3E5D15E95`; ondan önceki `35E82EFC…BD02`) | `9F6879F57CD6CE39BC9669851F3062A10D5A2E2BFAA28C19EEFBE8181DE95764` |

**R04 pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `DF36BC1B…5080` (`r04\d6-d7-recover-hazirlik\asama1\d6\test\pin-dogrulama-son.log`; bloğun kendi `Sha` + `Digest` fonksiyonlarıyla). Blok
öz-testinin **PIN-1** ölçütü aynı eşitliği her koşumda ölçer (R04 son koşumları: iki kabukta 9/9, digest `DF36BC1B…` = `$ExpPackage`).

**R03-g pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `F511D5F9…747C` (`r04\recover-dogrulugu\r5\d6\test\pin-dogrulama-son.log`). Blok öz-testinin **PIN-1** ölçütü aynı eşitliği her
koşumda ölçer (R03-g son koşumları: iki kabukta 9/9, digest `F511D5F9…` = `$ExpPackage`).

**R03-f pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `40921CD2…B619` (`r04\recover-dogrulugu\r4\d6\test\pin-dogrulama-son.log`). Blok öz-testinin **PIN-1** ölçütü aynı eşitliği her
koşumda ölçer (R03-f son koşumları: iki kabukta 9/9, digest `40921CD2…` = `$ExpPackage`).

**R03-e pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `E49930A2…9AC9` (`r04\recover-dogrulugu\r3\d6\test\pin-dogrulama-son.log`). Blok öz-testinin **PIN-1** ölçütü aynı eşitliği her
koşumda ölçer (R03-e son koşumları: iki kabukta 9/9, digest `E49930A2…` = `$ExpPackage`).

**R03-d pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `13858A12…CED1` (`r04\recover-dogrulugu\r2\d6\test\pin-dogrulama-son.log`). Blok öz-testinin **PIN-1** ölçütü aynı eşitliği
her koşumda ölçer (R03-d son koşumları: iki kabukta 9/9, digest `13858A12…` = `$ExpPackage`).

**R03-c pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `E8CFA864…FCB4` (`r04\recover-dogrulugu\d6\test\pin-dogrulama-yeni.log`; R03-c ilk commit ara değeri `B9D9AD68…1BD5`,
`test\tur1-pin-dogrulama-yeni.log`). Blok öz-testinin **PIN-1** ölçütü aynı eşitliği her koşumda ölçer (R03-c son koşumları: 9/9, digest
`E8CFA864…` = `$ExpPackage`).

**R03-b pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri `BD8D8744…D6E1` (`r04\d6-closure-r03b\test\pin-dogrulama-yeni.log`). Yöntem doğrulaması: aynı betik R03 baytlarında
(`53f3873f` aynası; R03 bloğu) R03 digest'ini `39507F28…9D5B` birebir üretir (`r04\d6-closure-r03b\onceki\pin-dogrulama-53f3873f.log`). Blok
öz-testinin **PIN-1** ölçütü aynı eşitliği her koşumda ölçer (R03-b koşumları: 9/9, digest `BD8D8744…` = `$ExpPackage`).

**R03 pin doğrulaması:** 9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = bloğun yeni
`$ExpPackage` değeri (`r04\d6-closure-r03\test\pin-dogrulama-yeni.log`). Yöntem doğrulaması: aynı betik R02 baytlarında (HEAD aynası) eski
digest'i `7C54C0FC…F057` birebir üretir (`r04\d6-closure-r03\onceki\pin-dogrulama-head.log`). Blok öz-testinin yeni **PIN-1** ölçütü aynı
eşitliği her koşumda ölçer (blok `Sha` + `Digest` fonksiyonlarıyla; canlı kapı koşulmaz).

R02 pin doğrulaması: 9 pinli dosya dosyalardan yeniden hesaplandı, uyuşmazlık 0; paket digest'i yeniden hesap = blok `$ExpPackage`
(R02 ilk tur: `d6-r02\test\paket-digest-dogrulama.log`; **R02 ikinci tur, son baytlar:** `d6-r02\tur2\test\paket-digest-dogrulama.log`;
**R02 tur 4** — `d6-selftest.js` değiştikten sonra yeniden: 9 pin, uyuşmazlık 0, digest aynı — `d6-r02\tur4\test\paket-digest-dogrulama.log`).

**Blok revizyonunun ayırt edilmesi (R02 ikinci tur, V-5).** Bloğun kanıta yazdığı `owner-block.json` içindeki `revision` alanı R02 bloğunda da
**`R01`** yazar: alan Write-Host / yorum / istem metni değildir ve mantık eşitliği gereği **değiştirilmedi** (bu alanı değiştiren kopya
mantık eşitliği ölçümünde "eşit değil" verir: `d6-r02\tur2\neg\mantik-mutant\m7-revision-alani.ps1`). Bloğun **metin revizyonu yalnız blok
dosyasının sha256'sı ile** ayırt edilir (yukarıdaki tablo). **Owner koşumdan önce blok dosyasının sha256'sını kaydeder** ve bu tablodaki son
değerle karşılaştırır; kanıttaki `revision = R01` tek başına hangi blok metninin koşulduğunu göstermez.

Paket digest (blok içinde `$ExpPackage`; 9 pinli dosyanın `yol\0sha\n` sıralı birleşiminin sha256'sı) — **R04:** `DF36BC1B838373A15024C36364E4C358C272EF02BA69A27B7380CA2E0F865080`
(koşucu pini yine değiştiği için). **R03-g:** `F511D5F91D76D25F455472569BD78578C5B65FBF4D1D800B257AAA60EDFF747C`
(koşucu pini yine değiştiği için). **R03-f:** `40921CD246F23CAA1954C95CDF6132A1FFDC5DFD622283EF0FF5D6088B22B619`
(koşucu pini yine değiştiği için). **R03-e:** `E49930A2EB04E2FD50A0A622357F12927629574E725D7C1305E9D042BB309AC9`
(koşucu pini yine değiştiği için). **R03-d:** `13858A1283CA465694F6117EBD835ADA7B1E211AA083D15CB21AC419B3F9CED1`
(koşucu pini yine değiştiği için). **R03-c:** `E8CFA86465F74A33EA2760818EB95FA327E0AFBAC74E03B6200E49718154FCB4`
(koşucu pini yine değiştiği için; R03-c ilk commit ara değeri `B9D9AD682377B202374B41A8FF48832FA8830ECF80F34DDEA9707DAFFA541BD5`). **R03-b:** `BD8D87441734CCE5BAD076BCEEF2CF346779EF441DAD0DFF0E395D6AE804D6E1`
(koşucu pini yine değiştiği için). **R03:** `39507F282C1CDBA2A8FE9DF45693125FE9F9CA1A7ECA83029690D968A7029D5B` (koşucu pini değiştiği için). R02 ve öncesi: `7C54C0FC38D85548D0B626A3D60D2CD7DF07080CC13F6C20C682933B1790F057`
— bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0). `ExpLiveDist` = R27
`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`; `ExpEnvSha` EXTACC bloğuyla aynı. Blok dosyasının kendisi PkgPins'te
**değildir** (koşucu bloğu yüklemez); blok değişince paket digest'i değişmez, yalnız bu tablo güncellenir.
**R03 — koşucu revizyonunun ayırt edilmesi:** koşucunun kanıta yazdığı `d6-evidence.json` içindeki `revision` alanı R03 koşucusunda **`R03`**
yazar (Run ve Recover kayıtları; önceki baytlarda `R01`). Bloğun `owner-block.json` `revision` alanı yine `R01`'dir (değiştirilmedi); blok
metin revizyonu blok dosyasının sha256'sıyla ayırt edilir (yukarıdaki tablo). **R03-b:** koşucunun `revision` alanı **`R03` kalır** (öz-test C-1
bu değeri ölçer; alan değiştirilmedi) — R03 ile R03-b koşucusu kanıtta koşucu dosyasının sha256'sıyla ayırt edilir: Run'ın `owner-block.json`
dosyasındaki `packageDigest` alanı (R03-b `BD8D8744…`, R03 `39507F28…`) ve Preflight çıktısındaki `paket=` değeri. **R03-c:** `revision` alanı
yine **`R03`** (değiştirilmedi); R03-c koşucusu `packageDigest` `E8CFA864…` ile ayırt edilir. **R03-d:** `revision` yine **`R03`**; R03-d koşucusu
`packageDigest` `13858A12…` ile ayırt edilir. **R03-e:** `revision` yine **`R03`** (öz-test C-1 bu değeri ölçer); R03-e koşucusu `packageDigest`
`E49930A2…` ile ayırt edilir; kanıtta yeni alanlar `issuedVersion`, `portalClose.sessionVersion.hucre`, `portalClose.closeText`, `portalClose.acikErisim`.
**R03-f:** `revision` yine **`R03`** (öz-test C-1 bu değeri ölçer); R03-f koşucusu `packageDigest` `40921CD2…` ile ayırt edilir; kanıtta yeni alan yok —
`portalClose.sessionVersion.hucre` artık `TG` olabilir, P6-C1 gözlemi `· dayanak=…` ile biter, `closeText` / `acikErisim` / kurtarma nedeni metinleri §13.7'deki biçimdedir.
**R03-g:** `revision` yine **`R03`** (öz-test C-1 bu değeri ölçer); R03-g koşucusu `packageDigest` `F511D5F9…` ile ayırt edilir; kanıtta yeni alan yok —
`portalClose.sessionVersion.hucre` artık `TJ` olabilir; Recover kanıtında `portalClose.acikErisim` ve kurtarma nedeni §13.8'deki biçimdedir.
**R04:** `revision` yine **`R03`** (alan değiştirilmedi; öz-test C-1 bu değeri ölçer — bu aşamada koşulmadı); R04 koşucusu `packageDigest` `DF36BC1B…` ile ayırt edilir;
kanıtta yeni alan yok — P6-C3L/D ve P6-C4L/D satırlarının gözlemi 503 / 429 dışındaki 5xx'te §13.9 (iii)'teki metindir. `-RunEvidenceDir` ile hazırlanan Recover girdisi
dizinindeki `RECOVER-GIRDI-KAYDI.json` bloğun yazdığı yeni bir kayıttır (kayıt türü `EXTACC-D6-RECOVER-INPUT`, `revision` `R04`); `owner-block.json` `revision` alanı yine `R01`.

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
  (R02-b kapsam notu: Preflight yalnız `portal-documents` **kova kökünün** listelenebilirliğini ölçer; sentetik tenantın alt dizinindeki ya da
  tek dosyadaki erişim reddini ölçmez — §10.1.)
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
  **R03 — DÜZELTİLDİ (§11.3):** `recovery.adim` artık "ÖNERİ (yetki DEĞİL)" ile başlar; Run'da "çıkış kodu Recover yetkisi değildir … Recover yalnız
  AYRI owner onayıyla", Recover'da "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir" yazar; "Recover BİR KEZ daha" iki
  yerden kaldırıldı. Koşucu öz-testi C-1 bunu bu koşumun ürettiği tüm Run/Recover kanıtlarında ölçer.
- **D6-1D'de erişim reddi FAIL sayılır (bulgu D6-E9; koşucu kaynağından doğrulandı).** Diskteki dosya için `stat` erişim reddi verirse
  (`olculemez`) D6-5D ve P6-C-DOC ÖLÇÜLEMEYEN verir, **D6-1D ise FAIL** verir (koşucu: `onDisk = durum 'var' ise true`; aksi halde kontrol
  `false` → FAIL). Kapalı yöndür (gösterim kapısı geçilmez); üç durumlu kuralın istisnasıdır (§2). Düzeltme **sonraki koşucu revizyonunda**;
  koşucu pinlidir ve R02'de değiştirilmedi. **R03 — DÜZELTİLDİ (§11.2):** erişim reddi D6-1D'de ÖLÇÜLEMEYEN + ayrı neden; kapı yine kapalı
  (koşucu öz-testi Z17-a: çıkış 3; doğrulanmış yokluk Z17-b: FAIL, çıkış 2).
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

**R02-b ile eklenen sınırlar (2026-10-03):** Run / normal kapanış / ayrı Recover sınırları ve bunlara bağlı **açık owner kararları** (OK-1 … OK-4)
ayrı bölümdedir: **§10**. Yukarıdaki maddeler olduğu gibi durur; §10 onları kaynağa göre tamamlar (kapılar her modda, Recover'ın yazma kümesi,
makbuzun yeniden yazılması, kalıntıda sıra, Recover 1/2, personel oturumu, onay metni kapsamı).

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

## 10. R02-b ek sınırlar — Run / normal kapanış / AYRI Recover (2026-10-03; yalnız bu belge)

Kapsam: değişen **yalnız bu belgedir**. Owner bloğu, koşucu, iki öz-test, QR betiği, sahte API ve bloğun pinlediği 9 dosya **değişmedi**; §6'daki
pinler ve paket digest'i aynıdır. Bu bölümdeki her kalem **kaynaktan okunmuştur**; satır numaraları dal ucu `cefe2663`'teki dosyalara göredir ve
okunan baytlar §6 / bloktaki pinlerle eşit ölçülmüştür (blok `082527EE…B3E2`, koşucu `5D74206B…58DD`, `i13-lib.js` `59BA7360…D385`, `i3-lib.js`
`56F3788E…74A3`, `i12-live-identity.js` `9516E462…774F`, `h5-url-live-run.js` `F2D0975D…C359`). Kalemler **canlıda ölçülmedi**; bu turda hiçbir
blok, koşucu ya da öz-test **koşulmadı**, canlı ortama ve canlı `.env`'e dokunulmadı. Bu bölüm canlı Run/Recover'ı yetkilendirmez; karar
gerektiren konular §10.8'de **açık owner kararı** olarak yazılıdır ve bu belgeyle karara bağlanmaz.

Üç ayrı işlem (terimler): **Run** = tek seferlik kabul koşumu (GO ile). **Normal kapanış** = Run'ın koşucu **içindeki** `finally` bloğu (koşucu
satır 406–428; sıra: konsol temizliği → portal kapanışı + belge kalıntısı → yabancı satır temizliği → personel/dosya kapanışı → U-CLOSE → audit
sayımı → P6-D9 → U-ISO → özet → kurtarma önerisi → çıkış kodu → kanıt); Run'ın parçasıdır, ayrı onay istemez. **Recover** = owner'ın ayrıca
başlattığı, canlıya **yeniden yazan** ayrı işlem (koşucu satır 431–470); çıkış kodu onu yetkilendirmez (§4 adım 7).

### 10.1 Kapılar her modda koşar; Recover'ın kapı bağımlılıkları (düzeltme)

- **Düzeltilen iddia.** Belge başlığı "R26 canlı ile Preflight/Run DUR verir" diyordu; eksikti. Blok akışında `Invoke-ReadOnlyGates` mod dalından
  **önce** çağrılır (blok satır 453–467): Preflight, QrTest, Run ve **Recover**'ın dördünde de aynı salt okuma kapıları koşar. Biri tutmazsa blok
  **çıkış 90** ile durur (satır 469–472) ve o mod başlamaz. Başlık ve §3 buna göre düzeltildi (R02-b notları).
- **Kapılar (blok satır 129–171):** Node ortam değişkenleri (`NODE_OPTIONS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`) tanımsız ·
  `git fetch` + ana checkout HEAD = origin/main · takipli kirli dosya yok · 9 dosya pini + paket digest'i · canlı API dist pini (R27) · canlı
  `.env` pini · public portal adresi biçimi · `HUKUK_DATA_ROOT` `.env`'de tanımlıysa dizin var; `portal-documents` kova kökü **varsa** listelenebilir (henüz yoksa yalnız not, DUR değil) ·
  8080'de **tam bir** dinleyici (canlı API ayakta) · başka kabul süreci çalışmıyor (D-4 / D-5 / D-6 / D-7 / D-8 koşucuları dahil: D-6 ile D-7 aynı
  anda koşamaz) · başlatıcı günlüğünde DB kimliği · `node` çözülebilir.
- **Moda özgü ek kapılar.** Dış zincir (`Assert-ExternalChain`) yalnız Preflight ve Run'da (satır 459, 332); yerel konsol (`Assert-LocalConsole`)
  yalnız QrTest ve Run'da (satır 434, 333) aranır. **Recover'da ikisi de aranmaz** (satır 405–430): zincir bozukken dış adresten yeni giriş reddi
  (P6-C3D) ölçülemeyen kalabilir (yanıt yok / 503 / 429); dış uçtan 401 dışında **başka** bir yanıt gelirse P6-C3D FAIL olur ve Recover çıkış 6
  verir (koşucu satır 219, 231, 237). Dış uçların zincir bozukken ne döndürdüğü canlıda ölçülmedi.
- **Recover'a etkisi (D-7 paket belgesindeki K-4'ün D-6 karşılığı).** Run ile Recover arasında şunlardan biri olursa blok 90 ile durur, Recover
  **başlamaz**, koşucu çağrılmaz ve canlıya hiçbir şey yazılmaz: (i) main ilerlemiş ve ana checkout senkron değil (blok yalnız `git fetch` yapar;
  senkronlama bloğun dışındadır); (ii) ana checkout'ta takipli dosya kirli; (iii) pinli 9 dosyadan biri main'de değişmiş; (iv) canlı dist
  değişmiş (yeni yayın ya da geri dönüş); (v) canlı `.env` değişmiş; (vi) canlı API kapalı ya da 8080'de birden çok dinleyici var; (vii) başka bir
  kabul koşucusu çalışıyor (ör. D-7, ya da asılı kalmış bir D-6 koşucusu); (viii) `portal-documents` kova kökü var ama listelenemiyor. Bu durumda kapanış bu
  bloktan tamamlanamaz → **açık owner kararı OK-1** (§10.8). Yayın planı ile D-6 koşum sırası bu yüzden birlikte kararlaştırılır.
- **Koşucunun Recover'daki kendi kapıları** (koşucu satır 432–439, 448–450): TLS doğrulaması açık, beklenen DB = bağlı DB, API adresi beyanı,
  origin biçimi, `D6_RECOVER_CONFIRM`, makbuz okunabilir + biçimi + runId eşleşmesi, kimlik bağı (makbuz ↔ tenant kimliği / slug / runId;
  `i12-live-identity.js` satır 34–63), portal hâlâ açıksa makbuzdaki personel kullanıcısının varlığı. Biri tutmazsa canlı DB'ye **yazılmadan**
  durulur (çoğunda çıkış 4). Koşucu dist/`.env` pini ölçmez — ama bloksuz koşum bu paketle yetkilendirilmez.
- **Kova kapısının kapsamı.** `Test-BucketReadable` yalnız `portal-documents` **kova kökünün** listelenebilirliğini ölçer (blok satır 197–203);
  sentetik tenantın alt dizinindeki ya da tek dosyadaki erişim reddini ölçmez. O durum ancak koşucunun üç durumlu yoklamasında `olculemez` olarak
  görünür (§2). §7'deki "Preflight bunu önceden ölçer" cümlesi bu kapsamla okunur (kaynaktan okundu; canlıda ölçülmedi).

### 10.2 Recover canlıya ne yazar — Run'ın kendi kapanışından AYRI bir canlı yazma işlemi

Recover kabul ölçütlerini koşmaz; yalnız kapanışı yeniden dener ve **canlıya yazar**. Bu küme belgede listelenmiyordu (yalnız satır silme
anlatılıyordu) ve blok Recover girişinde owner'a **gösterilmez** (blok satır 405–430: tek soru kalıntı kararıdır). Yazma kümesi (koşucu
`recoverMode` satır 431–470, `closePortal` 172–235, `documentResidue` 140–159, `foreignCleanup` 161–169; `i13-lib.js` `closeAccess` 46–59;
öz-testte sahte API'ye karşı Z5 / Z8 / Z16 senaryolarında koşulur, canlıda koşulmadı):

1. **Portal hâlâ açıksa** (hesap aktif ya da müvekkil erişim bayrağı açık; koşucu satır 450, geç oluşmada 196): makbuzdaki sentetik personel
   (elev1) **geçici olarak yeniden aktifleştirilir ve parola özeti yeniden yazılır** (`User.isActive=true` + yeni `passwordHash`; satır 447; parola
   bloğun o Recover koşumu için ürettiği rastgele değerdir — blok satır 212–213); o personelle yerel API'de oturum açılır ve yetkili uç çağrılır
   (`POST /portal/admin/disable-user`, en çok 2 deneme; satır 195–203). Ürün tarafı (R27 adayı `1b758d29`, `portal.service.ts`
   `disablePortalUser`): portal hesabı pasif + sürüm artışı + bekleyen sıfırlama alanları temizlenir, müvekkil portal erişimi kapalı, **kapatma
   audit satırı** (aktör: sentetik personel).
2. **Portal DB'de kapalı durumdaysa** (1. adımla ya da önceden; satır 216, 458): pasif portal hesabına **yalnız ölçüm için yeni rastgele parola
   özeti** yazılır (`ClientPortalUser.passwordHash`; hesap pasif kalır) ve bu parolayla yerel + dış adresten giriş **denenir** (401 beklenir;
   P6-C3L / P6-C3D; satır 217–220).
3. **Owner kalıntı sorusuna E dediyse ve satır varsa:** sentetik müvekkilin **tüm** `PortalDocument` satırları Prisma ile silinir (satır 144–148;
   koşucunun kendi belgesi ile telefondan yüklenenler ayrılmaz). **Dosyalar silinmez**: koşucuda dosya ya da dizin silen çağrı yoktur; kalan
   dosyalar kanıtta adlarıyla listelenir. H denirse satır da silinmez.
4. **Sentetik yabancı satır** (makbuzda `foreignDocumentId` varsa) Prisma ile silinir (satır 161–169, 459) — P6-FOREIGN-CLEAN.
5. **Personel/dosya kapanışı (`closeAccess`; satır 460):** iki sentetik tenantın TÜM kullanıcıları pasif + `tokenVersion` artışı (**her çağrıda
   yeniden artar**: Run'ın normal kapanışında artmış sürümler Recover'da bir kez daha artar), ACTIVE dosyalar CLOSED. 1. adımda aktifleştirilen
   personel burada yeniden pasifleştirilir; bu adım doğrulanmazsa personel **aktif kalmış olabilir** (çıkış 5; portal da doğrulanmadıysa 6).
6. **Yerel dosyalar:** Run makbuzu yeniden yazılabilir (§10.3); makbuzun yanında yeni bir `recover-<zaman>-<id>` kanıt dizini oluşur
   (`d6-evidence.json`, `d6-recover.log`, `SHA256-MANIFEST.txt`; blok satır 411–421).

Recover'ın **yazmadıkları**: GO defteri değişmez ve GO sorulmaz; `Tenant` satırına yazma yoktur; audit ve günlük satırları silinmez; diskteki
dosyalar ve kova dizini silinmez. Kimlik bağı doğrulanmazsa koşucu canlı DB'ye yazmadan durur (çıkış 4; satır 448). Recover **U-ISO, P6-D9 ve
kabul ölçütlerini (D6-\*) üretmez**; mevcut oturum reddi (P6-C4L / P6-C4D) Recover'da hep ÖLÇÜLEMEYEN kalır (koşumun portal oturumu saklanmaz;
satır 457). Canlı API uygulama günlüğüne düşen satırlar (personel / portal giriş denemeleri) bu paketle ölçülmez; ürünün giriş uçlarının kendi
yazmaları bu turda kaynaktan okunmadı.

**"Recover BİR KEZ" kuralı kodla zorlanmaz.** Blok Recover'da GO sormaz, defter tutmaz ve aynı makbuzla ikinci bir Recover'ı engellemez; koşucu
da engellemez. İkinci bir Recover yukarıdaki yazmaları **yeniden** yapar (kullanıcı sürümleri yeniden artar, pasif portal hesabına yeniden
ölçüm parolası özeti yazılır). Kural owner disiplinidir (§4 adım 7, §7); ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir.

### 10.3 Recover Run makbuzunu yeniden yazabilir — Run manifestindeki makbuz özeti tutmaz

Recover, `-ReceiptFile` ile verilen makbuzu **yerinde** yeniden yazar: bilinen bir dosya yolu varsa (makbuzdaki `documentFile`, önceki
`residueFiles` ya da o an DB'de kalan satırların yolları) makbuza `residueFiles` alanı eklenip dosya yeniden kaydedilir (koşucu satır 452–454;
yazılamazsa yalnız kanıta `receiptWriteError` düşer, Recover sürer). Run yükleme adımına ulaşıp DB satırını gördüyse `documentFile` makbuzda
vardır; yani bu durumda **ilk** Recover makbuzun baytlarını değiştirir. Run'ın `SHA256-MANIFEST.txt` dosyası kanıt dizinindeki tüm dosyaları —
makbuz dahil — Run sonunda özetlemiştir (blok satır 239–242, 379). Sonuç: **Recover'dan sonra Run manifestindeki `d6-setup-receipt.json` özeti
dosyayla tutmaz**; bu, kanıtın bozulduğunu değil Recover'ın makbuzu yeniden yazdığını gösterir. Run manifestinin diğer satırları etkilenmez
(Recover kanıtı ayrı `recover-*` alt dizinine yazılır; Run manifesti yalnız üst düzey dosyaları kapsar). Makbuz başka bir yoldan (kopya) verilirse
yeniden yazılan ve yanına `recover-*` dizini açılan o kopyadır. Recover'dan önce Run kanıtının nasıl sabitleneceği **açık owner kararıdır**
(OK-3). Makbuza `residueFiles` yazıldığı koşucu öz-testinde ölçülür (Z5-b); Run manifestindeki makbuz özetinin Recover'dan sonra tutmadığı ise
öz-testte **ölçülmez** (kaynaktan okundu) ve canlıda ölçülmedi.

**[R04 (§13.9):** `-Mode Recover -RunEvidenceDir` yolunda makbuz Run kanıt dizininin **dışına** (kardeş dizin) yazılır ve Recover o kopyayla başlar: Run kanıt dizini,
içindeki makbuz ve Run manifesti bu yolda **değişmez** (blok öz-testi RG-1; sahte koşucuyla). Bu bölümdeki davranış, Run dizinindeki makbuz `-ReceiptFile` ile verildiğinde
aynen geçerlidir. OK-3: owner kararı (2026-10-04, madde 5) `-RunEvidenceDir` yolunda Run kanıtını değiştirmeyerek karşılanır; `-ReceiptFile` yolu için OK-3 açık kalır.**]**

### 10.4 Kalıntı senaryosunda tek Recover'ın sınırı (çelişki kaydı)

Belge kalıntısı (P6-C-DOC) "bu müvekkilin `PortalDocument` satırı 0 **ve** bilinen dosyalar diskte yok" ister (koşucu satır 140–159). Recover'da
owner E dese ve satırlar silinse bile **dosya diskte durdukça P6-C-DOC FAIL**'dir; erişim reddinde ÖLÇÜLEMEYEN'dir. İki durumda da portal
kapanışı "DB kapalı" sayılmaz (satır 230) ve Recover **çıkış 6** verir (satır 237). Koşucu ve blok dosya silmez.

Belgedeki çelişki: §2 çıkış paragrafı ve koşucunun kanıt metni (`recovery.adim`, satır 466–468: "… elle silindikten sonra Recover BİR KEZ daha")
"Recover → dosyayı elle sil → Recover bir kez daha" akışını anlatır; öz-test Z5 / Z6 / Z8 de bu zinciri ölçer (üçünde de üç Recover). Aynı belge
ikinci bir Recover'ı "bu paketle tanımlı değil" sayar; §4 adım 7(c) ise dosyanın Recover 6'dan **sonra** elle silinmesini anlatır. Bu sırayla
**tek** Recover hiçbir zaman P6-C-DOC PASS üretmez: dosyanın yokluğu makineyle ölçülmeden kalır. Tek Recover ile ölçülmüş temiz kalıntı ancak
dosya Recover'dan **önce** yoksa (ve kalan satır varsa aynı Recover'da E ile siliniyorsa) çıkar. Aynı şey "dosya erişimi ÖLÇÜLEMEDİ" durumu için geçerlidir
(kova okunabilirliği Recover'dan önce düzelmemişse sonuç yine 6'dır).

Hangi sıranın uygulanacağı **AÇIK OWNER KARARIDIR (OK-2, §10.8)**; bu belge ikisinden birini seçmez. Karara yardımcı kaynak bilgisi:
- Run kanıtı kalan dosyaları yalnız **adlarıyla** listeler (`portalClose.docResidue.filesLeftOnDisk`); mutlak yol yalnız koşucunun kendi belgesi
  için vardır: Run makbuzunda ve Run kanıtının `receipt` alanında (`documentFile`). Telefondan yüklenen dosyanın mutlak yolu Run makbuzunda da
  kanıtında da yoktur; ilk Recover onu makbuza `residueFiles` olarak yazar (satır 454). Ürün aynı tenantın yüklemelerini aynı kova dizinine yazar (§1; kaynaktan okundu, canlıda ölçülmedi).
- Dosya, satırı durduğu halde elle silinirse satır Recover'da E ile silinene kadar dosyasız kalır; canlı diskte elle silme bu paketin bir adımı
  değildir, owner'ın kendi işlemidir.

### 10.5 Recover çıkış kodları — 1 ve 2 dahil

Bloğun Recover bitiş satırı (blok satır 422) 0 / 3 / 6 / 5 / 4 / 7 / 91 kodlarını açıklar; **1 ve 2'yi saymaz**. Koşucunun Recover çıkış kodu
(`recoverExitCode`, koşucu satır 237) şu öncelikle kurulur: **6 > 5 > 1 > 2 > 3 > 0**; kanıt yazılamazsa 7 (5 / 6 korunur; `h5-url-live-run.js`
satır 199–207). Blok node kodunu değiştirmeden taşır.

| Kod | Recover'da anlamı (kaynaktan okundu; canlıda ölçülmedi) |
|---|---|
| 90 | Blok kapıda durdu: salt okuma kapısı, `-ReceiptFile` eksik, makbuz biçimi tanınmadı ya da kalıntı yanıtı E/H değil. Bu nedenlerde koşucu çağrılmadı; canlıya yazılmadı (§10.1). **İstisna:** node 0 döndükten sonra blokta beklenmeyen bir hata olursa (ör. manifest yazılamadı) blok yine 90 verir (blok satır 471); bu durumda koşucu **çağrılmıştır** — `recover-*` dizininde `d6-evidence.json` varlığına bakılır |
| 4 | Koşucu kapısı: DB / API / origin beyanı, makbuz okunamadı ya da alanı eksik, runId eşleşmiyor, kimlik bağı doğrulanmadı, portal açık ama makbuzdaki personel yok. Canlı DB'ye yazılmadı |
| 6 | Portal DB kapanışı doğrulanmadı (P6-C2 / P6-C5 PASS değil ya da P6-C2V FAIL), **belge kalıntısı** (P6-C-DOC PASS değil — §10.4), yeni giriş reddi FAIL (P6-C3L/D), geç oluşma dışlanamadı ya da portal kapanış adımı hata ile kesildi |
| 5 | 6 koşulları oluşmadı; personel/dosya kapanışı (`closeAccess`) doğrulanmadı — geçici aktifleştirilen personel aktif kalmış olabilir (§10.2 adım 5) |
| **1** | **DURDU — beklenmeyen hata.** İki yol: (a) koşucu başlangıç adımlarında (portal durumu okuması, geçici personel oturumu) bir hata yakaladı (`out.fatal`; satır 448–450) ve 6 / 5 koşulları **oluşmadı** — yani portal DB kapanışı ve personel/dosya kapanışı kanıtta ok görünür ama koşum hatalıdır; (b) koşucu kanıt yazmadan düştü (yakalanmamış hata; Node'un bu durumdaki çıkış kodu ölçülmedi **[R03-d'de GEÇERSİZ → §13.5: bağımsız doğrulamada ölçüldü, çıkış 1; blok kanıtsız kodu artık açıklamaz]**) — bu durumda `d6-evidence.json` **yoktur** ve kapanış durumu bu koşumdan okunamaz (blok yalnız "0 + kanıt yok"u 7'ye çevirir; satır 231–235). Hangisi olduğu kanıt dosyasının varlığından ve `fatal` alanından ayrılır |
| **2** | **FAIL — kapanış ok, en az bir ölçüt FAIL.** Recover'da üretilen ölçütlerden 6 ya da 5'e düşmeden FAIL kalabilen tek ölçüt **P6-FOREIGN-CLEAN**'dir (yabancı sentetik müvekkilde satır kaldı; satır 161–169) — diğer FAIL'ler 6 ya da 5 üretir. (Koşucunun kapı düzeyindeki 2'si — zorunlu ortam eksik, satır 435 — blok ortamı her zaman kurduğu için bloktan beklenmez) |
| 3 | En iyi olağan sonuç: FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN. Hesap varken P6-C4L/D hep ölçülemeyendir. **Dikkat:** blok satırı "3 = DB kapalı + yeni giriş reddi" der; yeni giriş reddi yanıt yok / 503 / 429 nedeniyle ÖLÇÜLEMEYEN kaldığında da çıkış 3'tür (satır 219, 231, 237) — yeni giriş reddinin gerçekten ölçülüp ölçülmediği P6-C3L / P6-C3D satırlarından okunur. P6-C2V referans sürüm yokken ölçülemeyen kalabilir |
| 0 | Yalnız Recover anında portal hesabı DB'de YOK ölçülmüşse + kalıntı yoksa (HTTP reddi ölçülmez; §2). **R03-d düzeltmesi:** bu satır R02-b'de "portal hesabı hiç açılmamışsa" diyordu — ölçülen yalnız Recover anındaki yokluktur; hesabın hiç açılıp açılmadığı ölçülmez |
| 7 / 91 | Kanıt yazılamadı ya da node 0 döndü ama kanıt yok · node başlatılamadı / kod alınamadı |

Recover'ın **hiçbir** çıkış kodu (1 ve 2 dahil) yeni bir Recover için yetki değildir; blok 1 ve 2 için ek yönlendirme satırı basmaz (yalnız 3 ve
6 için basar; satır 423–427). Sonuç kanıtla birlikte CLIENT'a bildirilir; ikinci bir Recover bu paketle tanımlı değildir (§4 adım 7).
**R03-c — DEĞİŞTİ (§13):** yukarıdaki tablo R02-b'de kaynaktan yazılmıştı; bloğun Recover bitiş satırı R03-c'de 1 ve 2'yi saymaya başladı
(2 = kaynaktan yalnız P6-FOREIGN-CLEAN), 0'ı "Recover anında portal hesabı DB'de YOK (ölçüldü)" diye yazdı ("hiç açılmamıştı" çıkarımı kaldırıldı)
ve "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D …)" + "yeni giriş reddi P6-C3L/D satırlarından okunur" cümlelerini kodlardan
önce, her kod için geçerli olarak yazdı. Ek yönlendirme satırları (3 ve 6) değişmedi.
**R03-d — DÜZELTME (§13.5):** R03-c notundaki "bloğun Recover bitiş satırı artık bu tabloyla **uyumludur**" iddiası **ölçülmemişti ve yanlıştı**:
(1) tablonun 1 (b) yolu (koşucu kanıt yazmadan düşer) bloğun satırında yoktu — blok 1'i koşulsuz "aynı kapanışlar doğrulandı" diye açıklıyordu;
bağımsız doğrulama geçersiz `AH_PRISMA_ROOT` ile koşucunun Recover'da kanıt YAZMADAN **1** ile çıktığını ölçtü (yukarıdaki "Node'un bu durumdaki çıkış
kodu ölçülmedi" ifadesinin yerine: ölçüldü, 1); (2) tablonun 0 satırı "hiç açılmamışsa" diyordu (blok "Recover anında DB'de YOK"). R03-d: tablo 0
satırı ölçülenle düzeltildi; blok kod açıklamalarını (0/1/2/3/5/6) **yalnız okunabilir kanıt VARKEN** yazar (`Get-RecoverEvidenceState`: dosya + kayıt
türü `EXTACC-D6-RECOVER` + kanıttaki `exitCode` = süreç kodu); kanıt yoksa kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla
bitti, hiçbir kapanış ölçülmedi" (çıkış 1) ya da "kanıt yok (… çıkış N) — hiçbir kapanış bu kanıttan ölçülmüş DEĞİL"; 3'ün metni ölçülenle ("P6-C2 /
P6-C5 ve P6-C-DOC ölçüldü; P6-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır)"). Blok öz-testi O-12 / O-14 ölçer.

### 10.6 Run'ın normal kapanışında personel oturumu yenilenmez

Run'ın kapanış çağrısı (`POST /portal/admin/disable-user`) koşumun başında, kurulumdan hemen sonra alınan personel (elev1) token'ını kullanır
(koşucu satır 283). Run'ın `closePortal` çağrısına oturum yenileyici (`sessionProvider`) **verilmez** (satır 409–411); yeniden oturum açma yalnız
Recover'da vardır (satır 447, 455). Token kapanış anında geçersizse yetkili uç isteği 4xx ile reddeder; koşucu 4xx yanıtta ikinci denemeyi yapmaz
(satır 202), **portal erişimi açık kalır** (P6-C2 FAIL) ve koşum **çıkış 6** ile biter. Yabancı satır temizliği ve personel/dosya kapanışı yine
denenir (satır 414–415): personel pasifleşir ama portal hesabı açık kalmış olur. Token alındıktan sonra koşum şu süreleri bekleyebilir: telefon
girişi en çok 20 dk + inceleme 120 sn + telefon yüklemesi için kalıntı beklemesi en çok 5 dk + ikinci inceleme 120 sn (≈ 29 dk) ve aradaki HTTP
çağrıları. Personel token süresi kaynakta `JWT_EXPIRES_IN` ile belirlenir (R27 adayı `1b758d29`, `auth.module.ts`: kaynak varsayılanı `7d`);
**canlıdaki değer ve canlıdaki token süresi ölçülmedi** (canlı `.env` bu turda okunmadı). Bu yoldan gelen çıkış 6 da Recover yetkisi değildir
(§4 adım 7). Kaynaktan okundu; canlıda ölçülmedi.
**R03 — DEĞİŞTİ (§11.1):** yukarıdaki paragraf R02 baytlarını anlatır. R03 koşucusunda Run'ın `closePortal` çağrısına tek kullanımlık bir personel
yeniden giriş fonksiyonu (`staffReauth`) verilir: kapatma ucu 401 ya da 403 dönerse ve DB'de portal hâlâ açıksa koşucu makbuzdaki sentetik
personelle **bir kez** yeniden giriş yapar ve kapatmayı **bir kez** yeniden dener; başka 4xx'te yeniden giriş yoktur. Personel pasifse ya da
yeniden giriş reddedilirse yeniden deneme yapılmaz ve sonuç yine çıkış 6'dır (Recover yetkisi değildir). Recover'ın oturum yolu değişmedi.

### 10.7 Onay metni ile kurulumun yazdığı kayıt kümesi (sınır notu; blok metni DEĞİŞTİRİLMEDİ)

**Blok metni şunu der** (canlı veri işleme onayı; blok satır 247–250): canlı DB'de bu koşumun iki yeni sentetik tenantında "sentetik kullanıcılar,
müvekkil, dosya, borçlu", sentetik müvekkile ait bir portal hesabı, bir `PortalDocument` satırı + kovada bir dosya ve yabancı sentetik müvekkil
için dosyasız bir satır yazılacaktır.

**Kurulum şunu yazar** (`setupI3`, `i3-lib.js` satır 153–291; tek transaction; koşucu satır 277) — kaynaktan sayılan doğrudan `create` çağrısı
**27 satır**:

| Tenant | Kayıt | Adet |
|---|---|---|
| hedef + yabancı | `Tenant` | 2 |
| hedef | `User` (hepsi `.invalid` adresli; kurulumda aktif, kapanışta pasif) | 9 |
| hedef | `Lawyer` profili (üç kullanıcı için) | 3 |
| hedef | `StaffMember` profili (beş kullanıcı için) | 5 |
| hedef | `PermissionGrant` (bir kullanıcı için) | 1 |
| hedef | `Client` (portal hesabının açıldığı müvekkil + ikinci müvekkil) | 2 |
| hedef | `Case` + `CaseClient` bağı | 1 + 1 |
| hedef | `Debtor` + `CaseDebtor` bağı | 1 + 1 |
| yabancı | `Client` | 1 |

Fark: metin "müvekkil" der (tekil), kurulum hedefte **iki**, yabancıda **bir** müvekkil yazar; kullanıcı sayısı (9) ile bunlara bağlı avukat /
personel profili ve yetki kaydı satırları, dosya–müvekkil ve dosya–borçlu bağ satırları metinde sayılmaz. Metnin doğru olan kısmı: tenant sayısı
(iki) ve kapsam (yalnız bu koşumun sentetik tenantları). Kurulum dışındaki yazmalar (portal hesabı ve belge satırı ürün ucuyla, yabancı belge
satırı Prisma ile, portal aç/kapa audit satırları) metinde vardır; portal girişlerinin hesabın giriş sayacını işlediği (koşucu telefon girişini bu
sayaçtan algılar; satır 377) metinde anılmaz. **Kapanışta bu satırların hiçbiri silinmez**: `closeAccess` yalnız kullanıcıları pasifleştirir ve
dosyayı CLOSED yapar (`i13-lib.js` satır 46–59); iki sentetik tenant ve kayıtları canlı DB'de kalır — **saklandı**. Owner "EVET" yazarken onay
metninin bu eksiklerini bu nottan bilir; metnin kendisini düzeltmek blok dosyasını (ve §6'daki blok sha256'sını) değiştirir → OK-4.

### 10.8 Açık owner kararları (bu belgeyle karara bağlanmaz)

- **OK-1 — Recover ve kapı bağımlılıkları (D-7 paket belgesindeki K-4'ün D-6 karşılığı).** Run 5/6 ile bittikten sonra bir kapı tutmuyorsa
  (§10.1: main ilerlemiş, canlı dist ya da `.env` değişmiş, API kapalı …) Recover bu bloktan çalışmaz. Seçenekler: (a) kapı koşulunu geri
  getirip (ör. ana checkout'u senkronlamak; canlı dist'i R27'ye geri almak; API'yi ayağa kaldırmak) Recover'ı bu blokla koşmak; (b) yeni pinli bir
  blok revizyonu hazırlatıp Recover'ı onunla koşmak; (c) CLIENT kararıyla kapanışı ayrı bir yolla doğrulamak. Bu paket hiçbirini kendiliğinden
  yapmaz. Yeni bir yayının D-6 koşumuna göre sırası da bu karara bağlıdır.
- **OK-2 — Kalıntı senaryosunda sıra (§10.4).** İki seçenek: **(A)** kalan dosya(lar) Recover'dan **önce** owner tarafından elle silinir (erişim
  reddinde kova okunabilirliği Recover'dan önce düzeltilir), sonra tek Recover koşulur; **(B)** önce tek Recover koşulur (çıkış 6 beklenir), dosya
  sonra elle silinir ve dosyanın yokluğunun makineyle ölçülmesi için **ikinci bir Recover'a ayrı owner kararı** verilir — verilmezse bu ölçüm
  yapılmaz ve kalıntının temizliği owner beyanı olarak kalır. Bu belge A ile B arasında seçim yapmaz; §4 adım 7(c)'deki mevcut sıra karar
  verilene kadar olduğu gibi durur.
- **OK-3 — Recover öncesi Run kanıtının sabitlenmesi (§10.3).** Recover Run makbuzunu yeniden yazabildiği için Run manifestindeki makbuz özeti
  Recover'dan sonra tutmaz. Recover'dan önce Run kanıt dizininin (en azından makbuzun ve `SHA256-MANIFEST.txt` dosyasının) özetinin ya da
  kopyasının ayrıca kaydedilip kaydedilmeyeceği, yoksa farkın bu notla açıklanmış sayılıp sayılmayacağı owner / CLIENT kararıdır.
- **OK-4 — Blok metnindeki eksikler.** Üç yerde blok metni kaynağın gerisindedir ve bu turda **değiştirilmedi**: Recover girişinde canlı yazma
  kümesi gösterilmez (§10.2); Recover bitiş satırı 1 ve 2 kodlarını saymaz ve 3'ü "yeni giriş reddi" ile birlikte anlatır (§10.5); onay metni
  kurulumun kayıt kümesini eksik sayar (§10.7). Bunların bir sonraki blok revizyonunda (yalnız metin; blok sha256'sı ve blok öz-testi değişir)
  düzeltilmesi mi, yoksa bu belge notlarıyla kabul edilmesi mi gerektiği owner kararıdır.
  **R03:** owner'ın R03 talimatı ("sabit doğrulandı türü metin kaldıysa düzelt") üzerine OK-4'ün **yalnız** "Recover bitiş satırı 3'ü yeni giriş
  reddi ile birlikte anlatır" kalemi düzeltildi (§11.3; blok öz-testi O-10). OK-4'ün diğer kalemleri — Recover girişinde canlı yazma kümesinin
  gösterilmemesi, bitiş satırının 1 ve 2 kodlarını saymaması, onay metninin kurulumun kayıt kümesini eksik sayması — **AÇIK kalır**.
  **R03-c:** owner talimatı madde 2 üzerine "bitiş satırının 1 ve 2 kodlarını saymaması" kalemi de düzeltildi (§13; blok öz-testi O-12). OK-4'ün
  kalan iki kalemi — Recover girişinde canlı yazma kümesinin gösterilmemesi ve onay metninin kurulumun kayıt kümesini eksik sayması — **AÇIK kalır**.
- Önceden açık olan kararlar aynen durur: ikinci bir Recover'a izin ve Recover için ayrı onayın nasıl kaydedileceği (§7 "Recover kuralı").
- **OK-5 (R03, yeni) — kalıntı bağlamında ayrı çıkış kodu.** Kapanışta doğrulanmış kalıntı (P6-C-DOC FAIL) ile yalnız depolama erişim hatası
  (P6-C-DOC ÖLÇÜLEMEYEN) **ikisi de çıkış 6** verir: iki durumda da kapanış doğrulanmamıştır. Ayrım kanıttadır (§11.2). Yalnız erişim hatası
  için ayrı bir çıkış kodu çıkış kodu sözleşmesini (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0) ve bloğun 5/6 metinlerini değiştirir; istenip
  istenmediği owner kararıdır. 3'e indirmek güvenli bulunmadı (§11.2). **R03-b:** çıkış kodu yine **değiştirilmedi**; bloğun Run'daki kalıntı
  satırı artık ayrımı METİNDE gösterir (§12.3) — OK-5 **açık kalır**.
- **OK-6 (R03-b kaydı) — Run kapanışında tek yeniden giriş kabulü.** R03 (a) Run'ın kendi kapanışına canlı API'ye en çok **bir** ek personel
  girişi (`POST /auth/login`) ve en çok **bir** ek kapatma çağrısı ekler (§11.1; canlı etkisi kaynaktan okundu, canlıda ölçülmedi: DB yazması yok,
  bellek içi giriş hız sınırı sayacı +1, metrik / günlük satırı). Bu davranışın canlı koşumda kabul edilip edilmediği owner kararıdır; bu belge
  onu kabul edilmiş saymaz. Reddedilirse R02 davranışına (yeniden giriş yok; portal açık kalır, çıkış 6) dönmek koşucu değişikliğidir (pin +
  paket digest'i değişir).

**Korunan sınır notu:** `d6-selftest.js` kütüphane kökü denetiminin 8.3 kısa ad, `subst` sürücüsü ve UNC yazımıyla verilen canlı yolu
yakalamadığına ilişkin not §7'de olduğu gibi durur; bu tur ona dokunmadı.

**Blok öz-testi — belgenin son hâliyle (2026-10-03, tur 5):** R02-b ekleri ve bağımsız doğrulama düzeltmelerinden sonra `d6-owner-block-selftest.ps1`
yeniden koşuldu: 73/73 Windows PowerShell 5.1 ve 73/73 PowerShell 7, çıkış 0; blok, blok öz-testi ve koşucu öz-testi özetleri koşum öncesi/sonrası aynı.
Bağımsız doğrulama (salt okuma) bu bölümde altı küçük düzeltme istedi; altısı da uygulandı. Blok, koşucu ve pinli dosyalar değişmedi.

## 11. R03 — koşucu kapanış eksikleri (2026-10-03)

Kapsam: owner talimatı — geçmiş testler tekrarlanmadan, açık kalan kaynakların güvenle belirlenip kapatılmasını engelleyen kusurlar için dar koşucu
düzeltmesi + izole hata senaryosu; yalnız uyarı metni eklenerek çözülmüş sayılmaz. Normal Run kapanışı ile **ayrı** Recover yetkisi ayrı kalır
(çıkış 5/6 Recover yetkisi değildir). Bu turda canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi), canlı ağaç,
canlı DB, canlı `.env`, canlı API/portlar ve canlı günlükler okunmadı/kullanılmadı. Kaynak okumaları R27 adayı `1b758d29` üzerindendir.

| Dosya | Değişiklik |
|---|---|
| `d6-portal-documents-live-run.js` (koşucu) | (a) `closePortal`'da 401/403'te tek yeniden giriş + tek yeniden deneme; Run `staffReauth` verir, Recover vermez · (b) D6-1D, D6-5D, P6-C-DOC ve kurtarma nedeninde erişim hatası ile doğrulanmış kalıntı ayrımı; kanıtta `portalClose.docResidue.durum`, `upload.disk`, `portalClose.staffReauth` · (c) `recovery.adim` / `neden`, Recover `temporaryAccess` (+ ölçülen `temporaryAccessClosed`), Run `auditRetained` (+ ölçülen `delta`), kalıntı temizliği notu; `revision` alanı `R03`. Çıkış kodu fonksiyonları ve öncelik **değişmedi** |
| `d6-fake-portal-api.js` (sahte API) | benzersiz personel token'ı (sıra no); senaryolar `staffAuth: expireOnDisable`, `disable: forbidden \| notFound`, `upload: denyUntilNext \| noFile`, `delete: failDeny \| noUnlinkDeny`; gerçek ACL reddi (`icacls`, dosya F + dizin RD) ve `/__lift` |
| `d6-selftest.js` (koşucu öz-testi) | Z17-a/b, Z18-a..d, Z19-a..c, C-1, T-8 (51 → 62 test); DB kapısı kendi tek kullanımlık konteyner için genelleştirildi (§5 "R03 — DB kapısı") |
| `d6-owner-live-block.ps1` (owner bloğu) | `PkgPins` koşucu pini + `$ExpPackage`; Recover bitiş satırı METNİ (3 iddiası kaldırıldı; 6'da kalıntı DOĞRULANDI / ÖLÇÜLEMEDİ ayrımı kanıta bağlandı; çıkış 6 yönlendirmesi koşucunun yeni metniyle eşlendi); başlık notu. Kapılar, mod sırası, node çağrısı, çıkış kodları **değişmedi** |
| `d6-owner-block-selftest.ps1` (blok öz-testi) | PIN-1, O-10 (73 → 75 test) |

### 11.1 (a) Run kapanışında personel oturumu reddi — tek yeniden giriş + tek yeniden deneme

**Kusur (R02 baytları; §10.6):** Run'ın `closePortal` çağrısına oturum yenileyici verilmiyordu; personel token'ı kapanış anında geçersizse
(ör. ~29 dk beklemeden sonra süre dolumu) kapatma ucu 401 verir, koşucu 4xx'te ikinci denemeyi yapmaz, **portal hesabı açık kalır** ve koşum çıkış
6 ile biter — açık kaynak Run'ın kendi kapanışında kapatılabilecekken kapanmaz.

**Değerlendirme — güvenli mi?** Evet, şu sınırlarla:
- Kimlik bilgisi Run'ın koşum başında zaten kullandığı **aynıdır** (makbuzdaki sentetik personel e-postası + tenant slug'ı + bloğun bu koşum için
  ürettiği parola); yeni token sır listesine eklenir (koşucu öz-testi S-1: 110 dosya, sızıntı yok). `closePortal` başında makbuz kimlik bağı
  doğrulanmıştır.
- Yeniden giriş **DB'ye yazmaz**: koşucu tarafında yalnız `POST /auth/login` çağrılır; Prisma çağrısı yoktur (statik ölçüt T-8). Recover'daki geçici
  erişim yolu (personeli `isActive=true` yapıp parola özeti yazmak) Run'da **kullanılmaz** — personel pasifse yeniden giriş reddedilir ve yeniden
  deneme yapılmaz.
- Ürün tarafı (kaynaktan; `portal.controller.ts` `@UseGuards(JwtAuthGuard)` + `portal.service.ts` `disablePortalUser` → `assertCanManagePortalAccess`):
  401 kimlik doğrulama koruyucusundan, 403 yetki denetiminden **yazmadan önce** döner. Reddedilen ilk çağrı yazmamıştır; yeniden deneme çift yazma
  üretmez. Yeniden girişten önce DB'de portal kapalı görülürse yeniden giriş yapılmaz.
- Sınır: **yalnız 401/403** ve **bir kez**. Başka 4xx (ör. 404) → yeniden giriş yok; ikinci 401/403 → yeniden giriş yok (döngü yok); 5xx / belirsiz
  yanıt için en çok iki adım kuralı değişmedi. Toplam: yeniden giriş ≤ 1, kapatma çağrısı ≤ 3.
- Recover değişmedi (Recover oturumu Recover başında açar; 401/403'te yeniden giriş yapmaz). Yeniden giriş Run'ın **kendi** kapanışının parçasıdır;
  Recover değildir ve Recover yetkisi doğurmaz.

**Yeniden girişin canlıya ek etkisi** (kaynaktan okundu — `auth.controller.ts` `POST /auth/login` + `LoginRateLimitGuard`, `auth.service.ts`
`login()`, `app.module.ts` ara katmanları; **canlıda ölçülmedi**):
- **DB:** personel girişi (`AuthService.login`) yalnız okur (`user.findFirst` + bcrypt karşılaştırması + token üretimi); `lastLoginAt`, giriş sayacı
  ya da audit satırı **yazmaz**. Portal hesabının giriş sayacı (`ClientPortalUser.loginCount`) personel girişinden etkilenmez; P6-WAIT telefon
  beklemesi zaten bitmiştir.
- **Bellek içi giriş hız sınırı sayacı:** `LoginRateLimitGuard` (personel kovası; anahtar `request.ip`) her girişte — başarılı olanlar dahil —
  sayacı 1 artırır (60 sn pencerede 10 deneme → 5 dk blok). Koşucu yerel API'ye loopback'ten bağlanır; aynı anahtarı paylaşan başka personel
  girişleri o pencerede aynı kovayı kullanır. Sayaç kalıcı değildir (DB'ye yazılmaz). Hız sınırına takılırsa (429) yeniden deneme yapılmaz → çıkış 6.
- **Bellek içi HTTP metrikleri** (+1 giriş, +1 kapatma isteği) ve **API uygulama günlüğü** (401/403 istisna satırı dahil) — ölçülmedi.
- **Yeniden deneme başarılıysa** yazma kümesi normal kapanışla **aynıdır** (portal hesabı pasif + sürüm artışı + bekleyen sıfırlama alanları temiz +
  müvekkil erişimi kapalı + kapatma audit satırı; aktör sentetik personel). Ek DB yazması yoktur.
- Kanıt: `portalClose.staffReauth = { neden, giris, yenidenDeneme }` (yalnız HTTP kodları; token yok), P6-C1 gözleminde çağrı listesi,
  `calledEndpoints`'te `POST <API>/auth/login (kapanış: personel oturumu yenileme)`; kapanış yine doğrulanmazsa kurtarma nedeni
  "PERSONEL OTURUMU kapanışta reddedildi …" satırını taşır.

### 11.2 (b) Depolama erişim hatası ≠ doğrulanmış kalıntı

**Kusurlar (R02 baytları, kaynaktan):** (1) D6-1D erişim reddini FAIL sayıyordu (D6-E9); (2) D6-5D, satır **kalmışken** dosya erişimi reddedilirse
ÖLÇÜLEMEYEN veriyordu; (3) P6-C-DOC, herhangi bir dosyada erişim hatası varsa ÖLÇÜLEMEYEN veriyordu — kalan satır ya da stat `var` dosya
(**doğrulanmış kalıntı**) olsa bile; (4) kurtarma nedeni erişim hatası varken kalıntı satırını hiç yazmıyordu (`D6_RESIDUE_CLEANUP` kararının
gerektiği bilgisi kayboluyordu); (5) Recover adımı yalnız ACL cümlesini yazıyordu. (2)–(5) erişim hatasının doğrulanmış kalıntıyı **gizlemesidir**;
açık kalan kaynağın güvenle belirlenmesini engeller.

**Yeni davranış:**
- **D6-1D:** satır alanları doğru + dosya `olculemez` → **ÖLÇÜLEMEYEN** + "depolama erişimi ÖLÇÜLEMEDİ (<kod>) — dosyanın varlığı ÖLÇÜLMEDİ";
  dosya doğrulanmış olarak yoksa (ENOENT/ENOTDIR) ya da satır alanı yanlışsa **FAIL**. Gösterim kapısı PASS ister → kapı yine kapalıdır.
  Kanıtta `upload.disk = { state, code }`.
- **D6-5D / P6-C-DOC:** doğrulanmış kalıntı (satır > 0 ya da stat `var`) → **FAIL**; erişim hatası **ayrıca** yazılır (gizlenmez). Doğrulanmış kalıntı
  yoksa erişim hatası → **ÖLÇÜLEMEYEN** ("var" da "yok" da sayılmaz). `docResidue.durum` = `DOGRULANMIS_KALINTI` | `ERISIM_OLCULEMEDI` | `YOK`
  (DB okunamazsa `OLCULEMEDI_DB`).
- **Kurtarma nedeni:** iki **ayrı** satır — `BELGE: sentetik belge KALDI — DOĞRULANMIŞ KALINTI (…)` ve `BELGE: depolama erişimi ÖLÇÜLEMEDİ (…)`.
  Recover adımı ikisini ayrı cümlelerle yazar.

**Çıkış kodu ile ayrım — ölçülen:**
- **D6-1D bağlamı:** erişim reddi (kapanış doğrulanmışsa) **çıkış 3**; doğrulanmış yokluk **çıkış 2** — ikisi çıkış koduyla da kanıtla da ayrılır
  (Z17-a / Z17-b; önceki baytlarda erişim reddi de 2 idi).
- **Kapanış (kalıntı) bağlamı:** (i) dosya gerçekten duruyor ve (ii) dizin erişimi reddediliyor **ikisi de çıkış 6**'dır: iki durumda da kapanış
  **doğrulanmamıştır** ((i) kalıntı doğrulandı; (ii) kalıntı yokluğu ölçülemedi). Ayrım kanıttadır: P6-C-DOC **FAIL** ↔ **ÖLÇÜLEMEYEN**,
  `docResidue.durum`, `filesLeftOnDisk` ↔ `filesAccessError`, ayrı kurtarma satırları (Z18-a / Z18-b); bloğun Recover bitiş satırı ayrımı bu
  alanlara bağlar (O-10). Yalnız erişim hatası için ayrı bir çıkış kodu sözleşme değişikliğidir → **OK-5** (§10.8). Erişim hatasını 3'e indirmek
  **güvenli değildir**: Recover 3 "TEKRARLANMAZ" der ve en iyi olağan sonuç sayılır; erişim hatası kova içinde kalan bir dosyayı gizleyebilir.

### 11.3 (c) Kapanış metinleri yalnız ölçüleni söyler

- **Koşucu (kanıt):** `recovery.adim` "ÖNERİ (yetki DEĞİL)" ile başlar; Run'da çıkış kodunun Recover yetkisi olmadığını ve Recover'ın yalnız AYRI owner
  onayıyla başlatıldığını, Recover'da "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir" kuralını yazar; "Recover BİR KEZ daha"
  (iki yer) ve "birkaç dakika sonra Recover BİR KEZ" kaldırıldı. "token 7 gün geçerli" (ölçülmemiş süre) → "geçerlilik süresi bu koşumda
  ÖLÇÜLMEDİ". Recover `temporaryAccess` metnindeki sabit "kapanışta yeniden kapatıldı" iddiası (U-CLOSE'dan ÖNCE yazılıyordu) kaldırıldı; yerine
  ölçülen `temporaryAccessClosed`. Run `auditRetained` notundaki sabit "fark portal hesabı aç/kapa kaynaklıdır" iddiası kaldırıldı; yerine ölçülen
  `delta` + "kaynağı satır satır ÖLÇÜLMEDİ". Kalıntı temizliği notu silinen satır sayısını (`deleteMany` sonucu) yazar. "PORTAL ERİŞİMİ kapandığı
  doğrulanmadı" ve "DB kapalı ama HTTP reddi doğrulanmadı" satırları PASS olmayan ölçütleri adıyla yazar.
- **Blok:** Run kapanış satırı (`Get-ClosureStatus`) R02'den beri kanıttan kurulur — **değişmedi**. Recover bitiş satırındaki "3 = DB kapalı + yeni
  giriş reddi" bir **sabit iddiaydı** (3, yeni giriş reddi ÖLÇÜLEMEYEN iken de çıkar; §10.5) → "3 = DB kapalı, FAIL yok, en az bir ölçüt
  ÖLÇÜLEMEYEN — yeni giriş reddinin ölçülüp ölçülmediği kanıttaki P6-C3L/D satırlarından okunur". 6 → "belge kalıntısı DOĞRULANDI / ÖLÇÜLEMEDİ
  (hangisi: kanıttaki P6-C-DOC satırı ve docResidue.durum)". Preflight'taki "dış zincir DOĞRULANDI" satırı `Assert-ExternalChain` geçtikten sonra
  yazılır (ölçülmüş) — değişmedi. OK-4'ün diğer kalemleri açık kalır (§10.8).

### 11.4 Öz-testler, negatif kontroller (ölçülen)

Kanıt kökü: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-closure-r03\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek
kullanımlık konteynerinde (`postgres:16-alpine`, loopback, `_test` adlı veritabanı; şema `D6T_LIB_ROOT`'taki üretilmiş Prisma istemcisinin
şemasından `prisma db push` ile) ve `D6T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü ile koşuldu; `d5-reset-pg` / `d67-test-pg`
kullanılmadı. Sahte API 8199 / dış 8458.

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — ilk koşum (koşucu `7BB52D99…`, sahte API ara değeri `4A510384…`, öz-test `2B0003CB…`) | **62/62 PASS**, çıkış 0 (yeni 11: Z17-a/b, Z18-a..d, Z19-a..c, C-1, T-8; önceki 51 aynen PASS) | `test\d6-selftest-ilk.log`, `test\ilk-kosum-artifaktlar\` |
| `d6-owner-block-selftest.ps1` — R03 baytları (blok `76018BA7…`, öz-test `AC8F06EF…`) | **75/75 PASS** Windows PowerShell 5.1.26100 · **75/75 PASS** PowerShell 7.6.6, çıkış 0 (PIN-1: 9/9 dosya, digest `39507F28…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` |
| **Negatif — koşucu (ilk):** R02 koşucu baytları (`5D74206B…`) + R03 öz-test + R03 sahte API ara değeri (ayna) | **52/62**, çıkış 1 — FAIL = tam olarak yeni 10 test: Z17-a (eski: D6-1D **FAIL** "diskte=olculemez(EPERM)" → çıkış 2), Z17-b (çıkış kodu Z17-a ile ayrılmıyor: 2 = 2), Z18-a / Z18-b (`docResidue.durum` yok; eski neden "diskteki dosya erişimi"), Z18-c (eski: satır=1 doğrulanmış kalıntı varken D6-5D ve P6-C-DOC **ÖLÇÜLEMEYEN**, kurtarma nedeni yalnız erişim satırı), Z18-d (eski adım "… Recover BİR KEZ daha"), Z19-a (eski: tek 401 → yeniden giriş yok → **çıkış 6**), Z19-b (kapatma çağrısı 1), C-1 (revision R01, "fark … kaynaklıdır", "BİR KEZ daha"), T-8 (yeniden giriş fonksiyonu yok). Önceki 51 test + Z19-c (404'te yeniden giriş yok — koruma testi) eski baytlarda da PASS | `neg\neg-eski-kosucu-yeni-oz-test.log`, `neg\ayna-eski-kosucu-kurulum.txt` |
| **Negatif — blok:** R02 ikinci tur blok baytları (`082527EE…`) + R03 öz-test + R03 koşucu ve 8 pinli dosya (ayna) | **73/75**, çıkış 1 — FAIL = **PIN-1** (koşucu `7BB52D99` ≠ eski pin `5D74206B`; digest `39507F28` ≠ `7C54C0FC`) ve **O-10** (eski "3 = DB kapalı + yeni giriş reddi" metni), iki kabukta da | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log`, `neg\ayna-eski-blok-kurulum.txt` |
| Pin hesabı (yöntem doğrulaması + yeni pinler) | HEAD baytlarında digest `7C54C0FC…` birebir; R03 baytlarında 9 pin uyuşmazlık 0, digest `39507F28…` = `$ExpPackage` | `onceki\pin-dogrulama-head.log`, `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `Get-FileHash` iki kabukta bulunuyor; `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |
| **SON BAYTLAR — doğrudan koşum** (koşucu `7BB52D99…`, sahte API `FC06C8CC…`, öz-test `2B0003CB…`, blok `76018BA7…`, blok öz-testi `AC8F06EF…`; 6 betiğin sha256'sı koşum öncesi = sonrası; commit'teki baytlarla eşitliği commit sonrası ayrıca ölçüldü) | koşucu öz-testi **62/62 PASS**, çıkış 0 · **negatif** (R02 koşucusu + son öz-test/sahte API; ayna) **52/62**, çıkış 1, FAIL = aynı 10 yeni test · blok öz-testi **75/75 PASS** WinPS 5.1.26100 ve **75/75 PASS** pwsh 7.6.6, çıkış 0 | `test\son-kosum-sha.txt`, `test\d6-selftest-son.log`, `neg\neg-eski-kosucu-son.log`, `test\blok-oz-test-son-winps51.log`, `test\blok-oz-test-son-pwsh7.log` |

Yeni senaryolar (sahte API'ye karşı; gerçek ACL reddi):
- **Z17-a** (ii) yükleme sonrası dosya + dizin erişimi reddedilir, bir sonraki belge isteğinde kalkar → D6-1D ÖLÇÜLEMEYEN ("depolama erişimi
  ÖLÇÜLEMEDİ (EPERM)"), `upload.disk.state=olculemez`, giriş bilgisi gösterilmedi, koşucu kendi belgesini sildi, kapanış doğrulandı, FAIL 0 → **çıkış 3**.
- **Z17-b** (karşı durum) satır var, dosya diskte doğrulanmış olarak yok (ENOENT) → D6-1D FAIL → **çıkış 2**.
- **Z18-a** (i) kapanışta dosya gerçekten duruyor → P6-C-DOC FAIL, `durum=DOGRULANMIS_KALINTI`, kurtarma nedeni kalıntı (erişim satırı yok) → çıkış 6.
- **Z18-b** (ii) kapanışta dosya + dizin erişimi reddediliyor (satır 0) → P6-C-DOC ÖLÇÜLEMEYEN, `durum=ERISIM_OLCULEMEDI`, kurtarma nedeni erişim
  ("sentetik belge KALDI" yok), D6-5D ÖLÇÜLEMEYEN → çıkış 6.
- **Z18-c** (i)+(ii) birlikte: ürün DELETE'i 500, satır kalır + dosya erişimi reddedilir → D6-5D FAIL ("DOĞRULANMIŞ KALINTI (satır)" + erişim) ve
  P6-C-DOC FAIL (ÖLÇÜLEMEYEN'e inmedi), iki ayrı kurtarma satırı → çıkış 6. **Z18-d** aynı ret altında Recover (kalıntı kararı H) → P6-C-DOC FAIL,
  adım kalan satırı ve kova okunabilirliğini ayrı yazar, "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR" → çıkış 6.
- **Z19-a** ilk kapatma çağrısında personel token'ları geçersizleşir (401) → tek yeniden giriş (201) + tek yeniden deneme (201) → portal kapandı,
  P6-D9 PASS, **çıkış 0 (6 değil)**; kapatma çağrısı 2, personel girişi 2. **Z19-b** kapatma ucu her çağrıda 403 → yeniden giriş 1, yeniden deneme 1,
  sonra durur (kapatma çağrısı tam 2) → çıkış 6, kurtarma nedeni personel reddini yazar. **Z19-c** 404 → yeniden giriş yok (kapatma çağrısı 1,
  giriş 1) → çıkış 6.
- **C-1** bu koşumun ürettiği tüm Run/Recover kanıtlarında (38 dosya; 27'sinde kurtarma gerekli) sabit iddia yok, adım ÖNERİ, Recover adımı ikinci
  Recover kuralını yazar, `temporaryAccessClosed` ve audit `delta` ölçülmüş. **T-8** yeniden giriş yalnız Run'da, DB yazmaz, yalnız 401/403 ve bir kez.

### 11.5 Yeni sınır durumu

- **Kapalı:** D6-1D istisnası (D6-E9); erişim hatasının doğrulanmış kalıntıyı gizlemesi (D6-5D, P6-C-DOC, kurtarma nedeni, Recover adımı); kanıttaki
  kurtarma adımı metninin Recover yolu tanımlaması (§7); Run kapanışında personel oturumu süre dolumu / tek seferlik ret nedeniyle portalın açık
  kalması (§10.6); bloğun Recover bitiş satırındaki "3 = … yeni giriş reddi" iddiası (OK-4'ün bu kalemi).
- **Açık / owner kararı:** OK-1, OK-2, OK-3 aynen; OK-4'ün kalan üç kalemi; **OK-5** (kalıntı bağlamında ayrı çıkış kodu).
- **Ölçülmeyenler:** yeniden girişin canlı etkisi (DB yazmaması, hız sınırı sayacı, günlük) yalnız kaynaktan okundu; canlı personel token süresi ve
  canlı hız sınırı anahtarı ölçülmedi; sahte API ürünün kendisi değildir (ürünün gerçek JWT süresi / yetki reddi / kova ACL davranışı canlıda
  ölçülmedi); ACL senaryoları Windows'a (`icacls`) bağlıdır. Recover'da 401/403 yeniden girişi yoktur (Recover oturumu Recover başında taze açılır;
  bu yol değiştirilmedi).
- Bu revizyon canlı Run/Recover'ı yetkilendirmez; canlı koşum için ayrı owner GO gerekir (§7).
- **R03-b notu:** R03'ün bağımsız doğrulaması bu bölümdeki R03 baytlarında bir MAJOR ve üç MINOR bulgu ölçtü; giderilişi **§12**'dedir. §11.4'teki
  tablo R03 baytlarının (koşucu `7BB52D99…`, blok `76018BA7…`) tarihsel kanıtıdır.

## 12. R03-b — bağımsız doğrulama bulguları ve giderilişi (2026-10-03)

Kapsam: R03'ün (`53f3873f`) bağımsız doğrulamasının açık bulguları — dar koşucu düzeltmesi + izole senaryo; yalnız uyarı metni eklenerek
çözülmüş sayılmaz. Bu turda canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı ağaç, canlı DB, canlı
`.env`, canlı API/portlar ve canlı günlükler okunmadı/kullanılmadı. Çıkış kodu fonksiyonları ve öncelik (6 > 5 > 7 > 1 > 2 > 3 > 0) **değişmedi**.

### 12.1 Bulgular (doğrulayıcının ölçümü, R03 baytları)

| No | Bulgu | Etki |
|---|---|---|
| MAJOR | `closePortal` içindeki mevcut oturum ölçütü: kapatma hiç gerçekleşmediğinde (P6-C1/P6-C2 FAIL, portal hesabı DB'de AÇIK) koşucunun kendi portal oturumunun 200 dönmesi koşulsuz `productFinding = "ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum … erişmeye devam ediyor"` yazıyordu; kurtarma nedeni yalnız "PORTAL: mevcut oturum kapanmadı (ÜRÜN BULGUSU — Recover düzeltemez …)" diyordu ve else-if zinciri "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P6-C1=FAIL,P6-C2=FAIL…)" satırını bastırıyordu. Blok bunu kırmızıyla "ÜRÜN BULGUSU" diye basıyordu. 403, 404, yeniden giriş reddi / 429 ve iki kez 5xx yollarının hepsinde | ölçülmemiş ve yanlış çıkarım: portal kapatılmamıştı; metin owner'ı açık kalan portal hesabını kapatmaktan alıkoyabilirdi |
| MINOR 1 | `recoveryAdvice`: doğrulanmış kalıntı ya da depolama erişim hatası varken portalın kapanmadığı ölçülmüşse "PORTAL ERİŞİMİ kapandığı doğrulanmadı" satırı yazılmıyordu (`else if (!residue && !access)`) | açık portal hesabı kanıtın kurtarma nedeninde görünmüyordu |
| MINOR 2 | Recover çıkış 3 adım metni sabit "DB kapalı (P6-C2/C5 PASS)" iddiası taşıyordu; portal hesabı hiç yoksa P6-C2/C5 üretilmez | ölçülmeyeni iddia eden metin |
| MINOR 3 | Bloğun Run'daki kırmızı "BELGE KALINTISI … kalmış olabilir (P6-C-DOC PASS değil)" satırı doğrulanmış kalıntı (FAIL) ile ÖLÇÜLEMEYEN'i ayırmıyordu | owner ekranında kalıntı türü görünmüyordu (kanıtta vardı) |

### 12.2 Koşucu değişikliği (`d6-portal-documents-live-run.js`)

- **MAJOR:** mevcut oturum 200 dönerse `productFinding` **yalnız DB kapanışı ölçülmüşken** (P6-C2 PASS: portal kullanıcısı pasif + müvekkil erişimi
  kapalı) yazılır ve ölçülen dayanağını adlandırır: "ÜRÜN BULGUSU: portal erişimi kapatıldıktan ve DB kapanışı ölçüldükten sonra (P6-C2 PASS) …";
  P6-C4L/D gözlemi "DB kapanışı ölçüldükten sonra (P6-C2 PASS) MEVCUT OTURUM KAPANMADI (ürün bulgusu)". DB'de portal hâlâ açıksa P6-C4L/D **yine
  FAIL**'dir (oturum reddedilmedi) ama gözlem "portal hesabı DB'de hâlâ AÇIK (P6-C2 FAIL: isActive=… hasPortalAccess=…) — kapatma YAPILMADI;
  oturumun erişmesi bu durumda ürün bulgusu SAYILMADI" der ve `productFinding` **yazılmaz** → bloğun kırmızı "ÜRÜN BULGUSU" satırı ve kurtarma
  nedenindeki "Recover düzeltemez" ifadesi yalnız gerçek ürün bulgusunda görünür.
- **MINOR 1:** kurtarma nedeninde portal erişim satırı ürün bulgusu / belge kalıntısı / depolama erişim hatası satırlarından **bağımsız** yazılır.
  Ölçüt yeni `portalClose.portalDbClosed` alanıdır (P6-C2 PASS + P6-C2V FAIL değil + P6-C5 PASS; belge kalıntısından **ayrı** — `dbClosed`
  alanı kalıntıyı da içerdiği için önceki zincir bu ayrımı yapamıyordu). DB'de açık ölçüldüyse satır değerleriyle yazar: "PORTAL ERİŞİMİ kapandığı
  doğrulanmadı (P6-C1=FAIL,P6-C2=FAIL,…) — portal hesabı DB'de hâlâ AÇIK (isActive=true hasPortalAccess=true): kapatma YAPILMADI, açık erişim
  kapatılmalıdır …". Portal DB'de kapalıyken doğrulanmayan kapanış ölçütleri "PORTAL: DB'de erişim kapalı ölçüldü (P6-C2=… · P6-C5=…) ama
  doğrulanmayan kapanış ölçütleri var (…)" satırıyla yazılır (hesap yoksa yazılmaz: `portalClose.accountAbsent`). Ek: belge satırları DB'den
  okunamadıysa (`docResidue.durum = OLCULEMEDI_DB`) ayrı satır "BELGE: belge kalıntısı ÖLÇÜLEMEDİ — … DB'den okunamadı" — önceki zincirde bu durum
  yanlışlıkla "PORTAL ERİŞİMİ kapandığı doğrulanmadı (ölçüt satırı yok)" diye yazılırdı.
- **MINOR 2:** Recover adımı saf fonksiyona (`recoverStepText`) taşındı; çıkış 3 metni kanıttaki verdict'lerden kurulur: "Recover TEKRARLANMAZ —
  kanıttaki portal DB ölçütleri: P6-C2=<verdict> · P6-C5=<verdict>[ (portal hesabı YOK — DB kapanış ölçütleri üretilmedi)]; ÖLÇÜLEMEYEN satırlar (…)
  Run kanıtıyla değerlendirilir"; hesap yoksa "P6-C2=ÜRETİLMEDİ · P6-C5=ÜRETİLMEDİ". Kalıntı / erişim hatası cümleleri aynen; DB okuma hatası için
  ayrı cümle. `recoveryAdvice` ve `recoverStepText` öz-test birim ölçümü için dışa açıldı.
- **Değişmeyenler:** çıkış kodu fonksiyonları (`exitCodeOf`, `recoverExitCode`) ve öncelik; `res.ok` / `dbClosed` hesabı (eşdeğer); R03 (a) tek yeniden
  giriş yolu; Recover'ın oturum yolu; kanıttaki `revision` alanı (`R03`).

### 12.3 Owner bloğu değişikliği (`d6-owner-live-block.ps1`; yalnız METİN + pin)

- `PkgPins` koşucu pini `46AB8895…C3F7` + `$ExpPackage` `BD8D8744…D6E1`.
- **MINOR 3:** `Get-ClosureStatus` kanıttan `portalClose.docResidue.durum` alanını da okur; Run'daki "BELGE KALINTISI:" satırı verdict + duruma göre
  kurulur: P6-C-DOC **FAIL** → "DOĞRULANDI (P6-C-DOC FAIL · docResidue.durum=DOGRULANMIS_KALINTI): sentetik belge satırı ya da diskte dosya KALDI …";
  **ÖLÇÜLEMEYEN + ERISIM_OLCULEMEDI** → "ÖLÇÜLEMEDİ (P6-C-DOC ÖLÇÜLEMEYEN · docResidue.durum=ERISIM_OLCULEMEDI): depolama erişimi ölçülemedi — kalıntı
  DOĞRULANMADI, yokluğu da DOĞRULANMADI; belge kovasının okunabilirliğini owner düzeltir"; diğer ÖLÇÜLEMEYEN → ÖLÇÜLEMEDİ + durum; satır yok /
  kanıt okunamadı → "ÖLÇÜLMEDİ …". Satırın geri kalanı (Recover BAŞLATMAZ · kanıt incelendikten sonra · AYRI owner onayı · otomatik DEĞİL) aynen;
  son cümle "kanıtta diskte kalan dosya listelendiyse OWNER elle siler" (önceki: koşulsuz "diskte kalan dosyayı OWNER elle siler"). Satır rengi
  (kırmızı), kapılar, mod sırası, node çağrısı ve çıkış kodları **değişmedi**. `owner-block.json` `revision` alanı yine `R01`.

### 12.4 Öz-testler, negatif kontroller (ölçülen)

Kanıt kökü: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-closure-r03b\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek
kullanımlık konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D6T_LIB_ROOT`'taki üretilmiş Prisma
istemcisinin şemasından `prisma db push` ile; iş sonunda kaldırıldı) ve `D6T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü ile
koşuldu; `d5-reset-pg` / `d67-test-pg` kullanılmadı. Sahte API 8199 / dış 8458. Negatif kontroller `git archive 53f3873f` aynasında (çalışma ağacı
bozulmadı).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — **SON BAYTLAR** (koşucu `46AB8895…`, sahte API `A863011C…`, öz-test `DF544157…`, blok `7B43591A…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **70/70 PASS**, çıkış 0 (yeni 8: Z20-a..h; önceki 62 aynen PASS; C-1: 41 kanıt, 30'unda kurtarma gerekli, sorun yok; S-1: 119 dosya, sızıntı yok). İlk koşum (aynı koşucu / öz-test / sahte API; blok pin güncellemesinden önce) de 70/70 | `test\d6-selftest-son.log`, `test\son-kosum-sha.txt`; ilk: `test\d6-selftest-ilk.log` |
| `d6-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `7B43591A…`, öz-test `02650A8B…`) | **76/76 PASS** Windows PowerShell 5.1.26100 · **76/76 PASS** PowerShell 7.6.6, çıkış 0 (PIN-1: 9/9, digest `BD8D8744…` = `$ExpPackage`). İlk WinPS koşumu **75/76** (O-11 FAIL: eski cümle bloğun `Get-ClosureStatus` YORUMUNDA geçiyordu — ölçüt kaynakta da arar; yorum literal içermeyecek biçimde yeniden yazıldı, iki kabukta yeniden koşuldu) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log`; ilk: `test\blok-oz-test-ilk-winps51.log` |
| **Negatif — koşucu:** R03 koşucu baytları (`7BB52D99…`, `53f3873f`) + R03-b öz-test / sahte API / blok (ayna) | **62/70**, çıkış 1 — FAIL = tam olarak yeni 8 test (Z20-a..h). Eski davranış ölçüldü: 403 / 404 / yeniden giriş 429 / iki kez 500 / kalıntı + 404 koşumlarının hepsinde portal AÇIK (P6-C2 FAIL) iken `productFinding = "ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum …"`, kurtarma nedeni "… (ÜRÜN BULGUSU — Recover düzeltemez …)" ve portal açık satırı YOK; gerçek ürün bulgusu metni dayanağını adlandırmıyor; `recoveryAdvice` / `recoverStepText` dışa açık değil, kaynakta sabit "DB kapalı (P6-C2/C5 PASS)" var | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-z20-gozlem.txt`, `neg\ayna-eski-kosucu-kurulum.txt` |
| **Negatif — blok:** R03 blok baytları (`76018BA7…`, `53f3873f`) + R03-b koşucu / öz-testler (ayna) | **74/76**, çıkış 1 — FAIL = **PIN-1** (koşucu `46AB8895` ≠ eski pin `7BB52D99`; digest `BD8D8744` ≠ `39507F28`) ve **O-11** (eski "kalmış olabilir (P6-C-DOC PASS değil)" satırı FAIL ve ÖLÇÜLEMEYEN'de aynı), iki kabukta da | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log`, `neg\ayna-eski-blok-kurulum.txt` |
| Pin hesabı | R03-b: 9 pin uyuşmazlık 0, digest `BD8D8744…` = `$ExpPackage`; yöntem: R03 aynasında `39507F28…` birebir | `test\pin-dogrulama-yeni.log`, `onceki\pin-dogrulama-53f3873f.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Yeni ölçütler (sahte API'ye karşı; koşucu öz-testi):
- **Z20-a / Z20-b** (Z19-b 403 ve Z19-c 404 koşumları): portal AÇIK kaldı → `productFinding` yok, kurtarma nedeninde ve P6-D9'da "ÜRÜN BULGUSU" /
  "Recover düzeltemez" yok; P6-C4L/D FAIL + "portal hesabı DB'de hâlâ AÇIK (P6-C2 FAIL …)"; kurtarma nedeninde portal açık satırı (P6-C2=FAIL + "hâlâ
  AÇIK … kapatma YAPILMADI") var.
- **Z20-c** (yeni senaryo `staffAuth: expireOnDisable` + `relogin: rateLimit`): ilk kapatma 401 → tek yeniden giriş 429 → yeniden deneme yok
  (kapatma 1, personel girişi 2) → aynı ayrım + personel reddi satırı.
- **Z20-d** (yeni senaryo `disable: fail`): iki kez 500 (kapatma 2, yeniden giriş yok) → aynı ayrım; portal satırı iki 500 çağrısını yazar.
- **Z20-e** (Z12 guard bayat koşumu): DB kapanışı ölçülmüşken (P6-C2/C2V/C5 PASS) 200 → `productFinding` yazılır ve "(P6-C2 PASS)" dayanağını
  taşır; kurtarma nedeni "ÜRÜN BULGUSU … Recover düzeltemez" der, portal açık satırı yazmaz.
- **Z20-f** (yeni senaryo `delete: fail` + `disable: notFound`): doğrulanmış kalıntı (satır=1) + portal AÇIK birlikte → iki satır da var.
- **Z20-g**: `recoverStepText` birim (hesap yokken metinde "PASS" yok; "P6-C2=ÜRETİLMEDİ · P6-C5=ÜRETİLMEDİ (portal hesabı YOK …)"; DB kapalıyken
  "P6-C2=PASS · P6-C5=PASS" + ÖLÇÜLEMEYEN satırlar adıyla) + bu öz-testin 6 gerçek Recover çıkış 3 kanıtında adım kanıttaki verdict'i yazar +
  koşucu kaynağında sabit iddia yok.
- **Z20-h**: `recoveryAdvice` birim — (i) portal açık + depolama erişim hatası → iki satır; (ii) portal kapalı + belge satırları DB'den okunamadı →
  yalnız "BELGE: belge kalıntısı ÖLÇÜLEMEDİ" satırı, portal satırı yok; (iii) ürün bulgusu + HTTP sonrası DB açık (P6-C5 FAIL) → iki satır da.
- **O-11** (blok öz-testi): Run'daki "BELGE KALINTISI:" satırı FAIL → "DOĞRULANDI (… DOGRULANMIS_KALINTI)", ÖLÇÜLEMEYEN + ERISIM_OLCULEMEDI →
  "ÖLÇÜLEMEDİ (…)" + kova okunabilirliği, PASS → satır yok; eski cümle gösterilen metinde ve kaynakta yok; iki satır da G-4'ün dört ifadesini taşır.

### 12.5 Yeni sınır durumu

- **Kapalı:** MAJOR (açık hesapta yanlış "ürün bulgusu" / "Recover düzeltemez"), MINOR 1 (portal satırının bastırılması), MINOR 2 (Recover çıkış 3
  sabit iddiası), MINOR 3 (bloğun Run kalıntı satırında FAIL ↔ ÖLÇÜLEMEYEN ayrımı).
- **Açık / owner kararı:** OK-1, OK-2, OK-3 aynen; OK-4'ün kalan üç kalemi; **OK-5** (ayrı çıkış kodu — çıkış kodu değiştirilmedi); **OK-6** (Run
  kapanışında tek yeniden giriş kabulü, §10.8).
- **Ölçülmeyenler:** canlı etki yalnız kaynaktan okundu (yeniden girişin DB yazmaması, hız sınırı sayacı, günlük; ürünün gerçek JWT süresi / yetki
  reddi / kova ACL davranışı); sahte API ürünün kendisi değildir; `OLCULEMEDI_DB` dalı yalnız birim ölçümüyle (Z20-h) sınandı — gerçek bir DB okuma
  hatası senaryosu koşulmadı; P6-C2 PASS iken P6-C5 FAIL dalı (HTTP ölçümü sırasında hesabın yeniden açılması) yalnız birim ölçümüyle sınandı.
- Bu revizyon canlı Run/Recover'ı yetkilendirmez; canlı koşum için ayrı owner GO gerekir (§7).
- **R03-c notu:** bu bölümün "P6-C2 PASS iken P6-C5 FAIL dalı yalnız birim ölçümüyle sınandı" satırı R03-b içindir; R03-c'de bu dal **değişti** ve
  sahte API'ye karşı uçtan uca ölçüldü (§13, Z21-a).

## 13. R03-c — kapanış / Recover doğruluğu (2026-10-03; owner talimatı madde 2)

Kapsam: owner talimatı madde 2 — "kapanış veya Recover hakkında kanıtın desteklemediği başarı ifadesi bulunmasın; ölçülemeyen mevcut oturum
reddi açıkça belirtilsin; makbuz yazılamadığında uygulanamayacak bir Recover komutu önerilmesin, gerçekten kullanılabilir kurtarma yolu ya da
somut engel gösterilsin". Önceki bağımsız doğrulamanın açık bıraktığı üç madde **kaynakta doğrulandı** (R03-b baytları `0f6a0b2c`) ve dar
düzeltildi. Canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı ağaç, canlı DB, canlı `.env`, canlı
API/portlar kullanılmadı. Çıkış kodu fonksiyonları ve öncelik (6 > 5 > 7 > 1 > 2 > 3 > 0) **değişmedi**; kanıttaki `revision` alanı `R03` kalır.

### 13.1 Kaynakta doğrulanan açıklar (R03-b baytları)

| No | Açık (R03-b) | Etki |
|---|---|---|
| 6a | `closePortal`: koşucu oturumunun 200'ü yalnız `flags` (P6-C2 PASS) ile ürün bulgusu sayılıyordu; P6-C5 (HTTP ölçümlerinden **sonraki** DB) oturum yargısından **sonra** okunuyordu. Hesap P6-C2 ile P6-C5 arasında yeniden açılırsa (P6-C5 FAIL) 200 yine "ÜRÜN BULGUSU … Recover düzeltemez" yazılıyor, portal satırı açık hesabın değerlerini göstermiyordu (portal satırı `after` = kapatma sonrası kapalı değerlere bakıyordu) | ölçülmemiş ürün bulgusu iddiası; açık kalan hesap kurtarma nedeninde görünmüyordu (negatif kontrolde ölçüldü) |
| 6b | Bloğun Recover bitiş satırı 1 ve 2 kodlarını saymıyordu; "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" yalnız 3'ün açıklamasındaydı; 0 "portal hesabı hiç açılmamıştı" diyordu (ölçülen: Recover anında hesap DB'de yok) | kodların bir kısmı açıklamasız; 0 metni ölçülenden güçlü |
| 6c | Run'ın kurtarma adımı (`recoveryAdvice`) yalnız makbuz **yolu** var mı diye bakıp `-Mode Recover -ReceiptFile <makbuz>` öneriyordu; makbuz dosyası yazılamamış / silinmişse (`makbuzDiskte=false`) de aynı komut yazılıyordu. Bloğun Run 5/6 metni dosyaya hiç bakmadan aynı komutu öneriyordu. Makbuz kurulumdan hemen sonra yazılır (`saveReceipt` — ilk yazma hatası fatal; sonraki yazma hataları `receiptWriteError` + diskte eski makbuz) | uygulanamayan Recover komutu önerisi |

**Recover makbuzu nasıl okur (kaynaktan):** blok `-ReceiptFile` yolunda dosya var + JSON + `record = EXTACC-D6-SETUP-RECEIPT` + `runId` 8 hex; koşucu
dosyayı okur, `record` + `elevUserId` + `elevEmail` + `runId` eşleşmesi + DB'de kimlik bağı (`assertReceiptIdentity`; doğrulanmazsa yazmadan çıkış 4).
Run kanıtındaki `receipt` alanı koşucunun bellekteki makbuz nesnesidir (`out.receipt = receipt`; kanıt yazılırken serileştirilir; parola / token
içermez). Dolayısıyla makbuz dosyası yoksa kanıttaki `receipt` nesnesinden yazılan yeni bir dosya Recover'ın iki kapısını da geçebilir — bu yol
öz-testte **uçtan uca ölçüldü** (Z21-c). Kanıtta da makbuz yoksa Recover başlatılamaz (somut engel).

### 13.2 Değişiklik

- **Koşucu (6a):** P6-C5'in DB okuması oturum yargısından **önce** yapılır (satırlar yine C4L, C4D, C5 sırasıyla); 200 → `productFinding` yalnız
  **P6-C2 PASS + P6-C5 PASS** iken ("… DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken (P6-C2 PASS + P6-C5 PASS) …"). P6-C2 PASS, P6-C5 FAIL
  → P6-C4L/D FAIL + "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI (P6-C5 FAIL: isActive=… hasPortalAccess=… sürüm a→b) — oturumun
  erişmesi bu durumda ürün bulgusu SAYILMADI" (hesap kapalı ama sürüm değiştiyse "DB durumu ölçüm sırasında DEĞİŞTİ"). `recoveryAdvice`: ürün bulgusu
  satırı ("Recover düzeltemez") yalnız P6-C2 PASS + P6-C5 PASS iken; portal satırı kapatma sonrası kapalı, HTTP sonrası açık ölçüldüyse `afterMeasure`
  (st2) değerleriyle "kapatmadan sonra DB'de kapalı ölçüldü (P6-C2=PASS) ama hesap ölçüm sırasında yeniden AÇILDI (P6-C5 FAIL: HTTP ölçümlerinden sonra
  isActive=… hasPortalAccess=…): açık erişim kapatılmalıdır" yazar.
- **Koşucu (6c):** yeni `receiptFileState` (salt okuma: dosya var + JSON + kayıt türü + runId + personel alanları; bellekteki makbuzla eşitlik). Run
  adımı: makbuz kullanılabilirse komut önerilir (diskteki makbuz bellektekinden farklıysa "FARKLI" + yazma hatası notu); dosya yok / okunamıyorsa
  komut **önerilmez**: "makbuz dosyası YOK|OKUNAMIYOR (neden · yazma hatası): bu makbuz yoluyla bloktan Recover BAŞLATILAMAZ … Kullanılabilir yol: bu
  kanıttaki `receipt` nesnesi … yeni bir JSON dosyasına yazılır ve Recover yalnız AYRI owner onayıyla `-ReceiptFile <o dosya>` ile başlatılır";
  kanıtta makbuz da yoksa "SOMUT ENGEL: Recover makbuz ister, bu paketle Recover başlatılamaz; … karar owner/CLIENT'a aittir". Kanıtta yeni alan
  `recovery.makbuzDurumu` (`KULLANILABILIR` · `YOK` · `OKUNAMADI` · `YOL_YOK`); `makbuzDiskte` (dosya var mı) aynen.
- **Blok (6b, yalnız METİN):** Recover bitiş satırı: "HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D; …); yeni giriş
  reddinin ölçülüp ölçülmediği kanıttaki P6-C3L/D satırlarından okunur · 0 = Recover anında portal hesabı DB'de YOK (ölçüldü) + … HTTP reddi
  ÖLÇÜLMEDİ (hesap yok) · 3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — … · 2 = aynı kapanışlar doğrulandı, en az bir satır FAIL (kaynaktan
  okundu: Recover'da bunu yalnız P6-FOREIGN-CLEAN üretir …) · 1 = DURDU: … hazırlık adımında hata (kanıttaki fatal alanı …) · 6 · 5 · 4 · 7 · 91".
- **Blok (6c, yalnız METİN):** yeni `Get-ReceiptFileState` (Recover okuma kapısıyla aynı denetim; salt okuma). Run çıkış 5/6: makbuz okunabiliyorsa
  önceki öneri + "Makbuz dosyası: VAR"; değilse "MAKBUZ DOSYASI YOK|OKUNAMIYOR …: bu makbuzla bloktan Recover BAŞLATILAMAZ" + kanıttaki receipt yolu
  (AYRI owner onayıyla, BİR KEZ, `-ReceiptFile <o dosya>`) ya da kanıtta da yoksa "SOMUT ENGEL" (kırmızı). `PkgPins` koşucu pini + `$ExpPackage`.
  Kapılar, sıra, Recover okuma kapısı, node çağrısı, çıkış kodları değişmedi; `owner-block.json` `revision` alanı `R01`.
- **Sahte API:** `reopen normal|afterDisable` senaryosu (başarılı kapatmadan sonraki ilk yerel belge listesi isteğinde hesap DB'de yeniden açılır).
- **Koşucu (6d — ikinci commit; D-7 7c taramasının D-6 ikizi):** portal hesabı **yokken** (ör. makbuz yazılamadı → hesap hiç istenmedi; Z14) Run
  günlüğü "OK P6-C1 portal erişimi yetkili uçla kapatıldı" diyordu — kapatma yapılmamıştı, ölçülen yalnız "hesap yok". Satır açıklaması artık "portal
  hesabı YOK (DB'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI"; verdict ve gözlem değişmedi (açıklama kanıta değil günlüğe
  yazılır). `PkgPins` koşucu pini + `$ExpPackage` yeniden güncellendi; blok metni değişmedi.

### 13.3 Öz-testler, negatif kontroller (ölçülen)

Kanıt kökü: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\d6\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi**
tek kullanımlık konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D6T_LIB_ROOT`'taki üretilmiş Prisma
istemcisinin şemasından `prisma db push`; iş sonunda kaldırıldı); `D6T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü; sahte API
8199 / dış 8458. Negatif kontroller `git archive 0f6a0b2c` aynasında (çalışma ağacı bozulmadı).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — **SON BAYTLAR** (koşucu `84D003D7…`, sahte API `3CF7AD13…`, öz-test `F6F54444…`, blok `20A01089…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **74/74 PASS**, çıkış 0 (yeni 4: Z21-a..d; değişen 2: Z20-e, Z20-h; önceki 68 aynen; C-1 ve S-1 PASS) | `test\d6-selftest-son.log`, `test\son-kosum-sha.txt`; ilk commit'in son koşumu (73/73, koşucu `9FA67CAE…`) `test\tur1-d6-selftest-son.log`; ara koşumlar `test\d6-selftest-ilk*.log` |
| `d6-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `20A01089…`, öz-test `636F0068…`) | **78/78 PASS** Windows PowerShell 5.1.26100 · **78/78 PASS** PowerShell 7.6.6, çıkış 0 (PIN-1: 9/9, digest `E8CFA864…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log`; ilk commit'in koşumları `test\tur1-blok-oz-test-*.log` (blok `A4084206…`, 78/78); ara koşumlar `test\blok-oz-test-ilk*.log` |
| **Negatif — koşucu:** R03-b baytları (`0f6a0b2c` aynası: koşucu `46AB8895…`, blok `7B43591A…`) + R03-c öz-test / sahte API | **68/74**, çıkış 1 — FAIL = tam olarak yeni / değişen 6 kalem (Z20-e, Z20-h, Z21-a, Z21-b, Z21-c, Z21-d). Eski davranış ölçüldü: hesap ölçüm sırasında yeniden açılmışken (P6-C2 PASS, P6-C5 FAIL; DB'de açık) `productFinding` + "… Recover düzeltemez"; portal satırı açık değerleri yazmıyor; makbuz dosyası yokken adım `-Mode Recover -ReceiptFile <makbuz>` öneriyor; `receiptFileState` yok; hesap yokken günlükte "OK P6-C1 portal erişimi yetkili uçla kapatıldı". Kanıttaki `receipt` nesnesinden yazılan dosyayla Recover eski baytlarda da kimlik bağını geçti (yol koşucu değişikliğine bağlı değildir) | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-gozlem.txt`, `neg\ayna-kurulum.txt`; Z21-d eklenmeden önceki negatif (68/73) `neg\tur1-neg-eski-kosucu.log` |
| **Negatif — blok:** aynı ayna (R03-b bloğu) + R03-c blok öz-testi (ikinci commit'te blok öz-testi değişmedi) | **75/78**, çıkış 1 — FAIL = **O-5**, **O-12**, **O-13** (iki kabukta da; PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log` |
| Pin hesabı | 9 pin uyuşmazlık 0, digest `E8CFA864…` = `$ExpPackage` (ilk commit: `B9D9AD68…`, `test\tur1-pin-dogrulama-yeni.log`) | `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler:
- **Z21-a** (yeni senaryo `guard: stale` + `reopen: afterDisable`): kapatma 201 → P6-C2 PASS; hesap HTTP ölçümleri sırasında yeniden açıldı → P6-C5 FAIL;
  oturum 200 → P6-C4L/D FAIL + "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI (P6-C5 FAIL: isActive=true hasPortalAccess=true …)";
  `productFinding` yok; neden ve P6-D9'da "ÜRÜN BULGUSU" / "Recover düzeltemez" yok; portal satırı HTTP sonrası değerlerle; DB'de hesap açık; çıkış 6.
- **Z21-b** (birim): `receiptFileState` altı durum (var · yok · klasör · bozuk · yol yok · başka runId) + Run adımının yedi girdisi (kullanılabilir · eski
  makbuz + yazma hatası · yok · klasör · bozuk · kanıtta makbuz yok · Recover modu).
- **Z21-c** (uçtan uca): gösterimden sonra makbuz dosyası silinir, ürün DELETE'i dosyayı bırakır → çıkış 6; kanıtta `makbuzDurumu=YOK`, adım komut
  önermez + kanıttaki `receipt` yolu; o nesne değiştirilmeden dosyaya yazılıp Recover'a verilir → kayıt `EXTACC-D6-RECOVER`, kimlik bağı OK,
  P6-C2/C3L PASS, kalan dosya P6-C-DOC FAIL, personel pasif, çıkış 6.
- **Z21-d** (yeni, uçtan uca; ikinci commit): hesap yokken (Z14: makbuz yazılamadı) P6-C1 günlük satırı "portal hesabı YOK (DB'de ölçüldü) — kapatılacak
  portal erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" yok; disable-user çağrısı 0.
- **Z20-e** (değişti): gerçek ürün bulgusunun dayanağı "(P6-C2 PASS + P6-C5 PASS)". **Z20-h (iii)** (değişti): P6-C5 FAIL iken ürün bulgusu satırı
  yok; portal satırı "yeniden AÇILDI" + HTTP sonrası değerler.
- **O-12** (blok, yeni): Recover çıkış 0, 1, 2, 3, 6 koşumlarında gösterilen bitiş satırı — genel cümle kodlardan önce; tüm kodlar açıklamalı; "hiç
  açılmamıştı" yok. **O-13** (blok, yeni): Run çıkış 5/6 metni dört makbuz durumunda (var · yok · bozuk · kanıtta da yok). **O-5** (değişti): 0
  metni ölçülenle.

### 13.4 Sınır durumu

- **Kapalı:** 6a (P6-C5 FAIL'de yanlış ürün bulgusu / "Recover düzeltemez"), 6b (Recover bitiş satırında 1 / 2 ve mevcut oturum reddinin genel
  ölçülemezliği; 0'ın çıkarımı), 6c (makbuz dosyası yokken uygulanamayan Recover komutu — kanıtta ve blokta), 6d (hesap yokken P6-C1 günlük satırının
  kapatma ifadesi), OK-4'ün "1 ve 2'yi saymama" kalemi. **R03-d: 6a'nın kapanışı GERİ ALINDI** (R03-c'nin "adayı DEĞİL" sınıflaması yanlıştı) ve
  6b / 6c R03-c bağımsız doğrulamasında eksik bulundu (kanıtsız 1; BOM'lu makbuz; bayat makbuz) — düzeltmeler §13.5.
- **Açık / owner kararı:** OK-1, OK-2, OK-3 aynen; OK-4'ün kalan iki kalemi; OK-5; OK-6. Kanıttaki `receipt` nesnesinden makbuz dosyası yazmak
  (6c kullanılabilir yolu) Recover'dan önceki bir dosya işlemidir: kim yazar ve Run kanıt dizini dışında mı yazılır — owner / CLIENT kararıdır;
  bu paket onu kendiliğinden yapmaz. **[R03-d'de GEÇERSİZ → §13.5]** — `receipt` nesnesinden yazma yolu kaldırıldı. **Güncel açık owner kararı:
  "`recovery.makbuzJson`'dan yazılan yeni makbuz dosyasını kim, nereye yazar".** Bugünkü durum (blok kaynağından, `d6-owner-live-block.ps1`
  Invoke-RunMode): blok Run sonunda gösterdiği TEK komutla dosyayı **Run kanıt dizinine** (`<kanıt dizini>\d6-setup-receipt-kanittan.json`)
  yazdırır; Run'ın `SHA256-MANIFEST.txt` dosyası bu komut gösterilmeden **önce** yazılır (`Write-Manifest`, Write-OwnerDeclaration'ın `finally`
  bloğu) — dolayısıyla owner komutu koştuğunda oluşan yeni makbuz dosyası Run manifestinde **yer almaz**. Komutu blok koşmaz; owner koşar.
- **Ölçülmeyenler:** canlıda hiçbiri koşulmadı; sahte API ürünün kendisi değildir (hesabın ölçüm sırasında yeniden açılması sahte API'nin dış
  müdahale taklididir; ürünün bunu kendiliğinden yapıp yapmadığı ölçülmedi). Makbuz dosyasının kaybı öz-testte **silme** ile üretildi; gerçek bir
  yazma hatası (izin / disk) uçtan uca koşulmadı — yazma hatası metni birim ölçümüyle (Z21-b) sınandı. Bloğun Recover okuma kapısı kanıttaki
  `receipt` kopyasıyla ayrıca koşulmadı (kapı yalnız dosya + JSON + kayıt türü + runId biçimine bakar — kaynaktan; koşucunun kapısı ve kimlik
  bağı Z21-c'de koşuldu). Mevcut oturum reddi Recover'da yapısal olarak ölçülemez (koşumun portal oturumu saklanmaz); Run kanıtındaki P6-C4 satırları
  tek kaynaktır.
- Bu revizyon canlı Run/Recover'ı yetkilendirmez; canlı koşum için ayrı owner GO gerekir (§7).

### 13.5 R03-d — R03-c bağımsız doğrulamasının bulguları (2026-10-04)

Kapsam: owner ölçütü — kapanış veya Recover hakkında kanıtın desteklemediği ifade YOK; Recover'da ölçülemeyen mevcut oturum reddi açık; makbuz
yazılamadığında uygulanamayan Recover komutu YOK, gerçekten kullanılabilir yol ya da somut engel. R03-c bağımsız doğrulamasının yedi bulgusu önce
**kaynakta doğrulandı** (R03-c yerel ucu `9556a7e5`; ürün kaynağı `HY_WT_R27` salt okuma), sonra dar düzeltildi. Canlı Run/Recover **koşulmadı**,
owner bloğu **çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

**Önceki turun hatası (açıkça):** R03-c §13.2 / §13.3'teki "P6-C2 PASS + P6-C5 FAIL (hesap ölçüm sırasında yeniden açıldı) iken koşucu oturumunun
200'ü **ürün bulgusu adayı DEĞİL**" sınıflaması ve onu ölçen Z21-a beklentisi **yanlıştı**. Kaynak (`HY_WT_R27`): `portal-auth.guard.ts` 66-68 —
claim sürümü DB sürümünden farklı eski token `isActive`'ten **bağımsız** reddedilir (pasif hesap da 58-60'ta reddedilir); `portal.service.ts`
307-316 — yeniden açma (reactivate) `tokenVersion`'ı **artırır** (kapatma da 763-769'da artırır). Yani hesap ölçüm sırasında ürün yoluyla yeniden
açılsa bile eski oturumun reddedilmesi beklenir; 200 bir oturum iptali **ürün bulgusu adayıdır**. R03-c sahte API'si yeniden açmada sürümü
değiştirmediği için bu hata öz-testte görünmedi.

| No | Bulgu (doğrulayıcı) | Kaynakta doğrulama (9556a7e5) | Düzeltme |
|---|---|---|---|
| M1 | P6-C2 PASS + P6-C5 FAIL iken 200 → "adayı DEĞİL", productFinding / "Recover düzeltemez" düşüyor | `closePortal` `if (flags)` dalı sürüme bakmadan "adayı DEĞİL"; sahte API `reopen` sürümü değiştirmiyor — **doğrulandı** | **[R03-e'de değişti → §13.6: kural yalnız bu dalda kalmıştı; artık her 200 tek karar tablosundan; "adayı DEĞİL" dalı kaldırıldı]** `sessionClassDuringChange`: verilme sürümü bilinmiyor → "ürün bulgusu ayrıştırılamadı (ÖLÇÜLEMEDİ)"; HTTP sonrası DB sürümü ≠ verilme → **"ÜRÜN BULGUSU ADAYI — eski oturum sürüm reddine rağmen erişti"** (`productFinding`, "oturum reddi ürün tarafıdır, Recover düzeltemez", `portalClose.sessionVersion.sinif=ADAY`) + kurtarma nedeninde **AYRI** portal satırı "hesap ölçüm sırasında yeniden AÇILDI (P6-C5 FAIL …): açık erişim kapatılmalıdır (Recover kapatabilir)"; sürüm EŞİT + hesap açık → "adayı DEĞİL" (sürüm reddi beklenmezdi); sürüm eşit ama hesap pasif → ADAY (pasif hesap reddi; guard 58-60 — görev metninden **daha dar** "DEĞİL" koşulu). `changedTxt` ("DB durumu DEĞİŞTİ") aynı kurala bağlı. Blok ADAY'ı "bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular)" diye gösterir. Sahte API: `reopen afterDisable` sürümü ürün gibi artırır; `afterDisableRevert` (ayrı test varyantı) sürümü verilme değerine döndürür |
| M2 | Blok Recover bitişinde 1 "aynı kapanışlar doğrulandı" diyor; koşucu yakalanmamış hatayla kanıtsız 1 verebiliyor | `loadPrisma` `try` dışında; blok bitiş satırı kanıtın varlığına bakmıyor — **doğrulandı** (doğrulayıcının `crash-probe.js` ölçümü: çıkış 1, kanıt yok) | `Get-RecoverEvidenceState` (dosya + kayıt türü `EXTACC-D6-RECOVER` + kanıttaki `exitCode` = süreç kodu); değilse kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" (1) / "kanıt yok (… çıkış N) …" / "kanıttaki exitCode (…) süreç çıkış koduyla (…) EŞİT DEĞİL"; kod açıklamaları yalnız okunabilir kanıt varken. §10.5 notu ve 0 satırı düzeltildi |
| m3 | Recover 3 metni "P6-C2/C2V/C5 … ölçüldü"; `portalDbClosed` C2V için yalnız "FAIL değil" ister | `portalDbClosed = C2 PASS && C2V !== 'FAIL' && C5 PASS` — **doğrulandı** | "3 = … P6-C2 / P6-C5 ve P6-C-DOC ölçüldü; P6-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok"; 2 / 1 "aynı kapanışlar" atfıyla buna bağlı |
| m4 | "receipt nesnesini yeni JSON dosyasına yazın" yolu kullanılamıyor (WinPS 5.1 BOM → koşucu JSON.parse reddi; PS 7 tarih dönüşümü; 5.1 `-Depth` 2) | koşucu Recover okuması `JSON.parse(readFileSync)` BOM atmıyor; blok kapısı BOM'u kabul ediyor — **doğrulandı**; PS 7'de `ConvertFrom-Json` tarih biçimli dizgeyi `DateTime`'a çevirir — **ölçüldü** (O-15: `receipt.createdAt` 5.1'de String, 7'de DateTime) | (i) koşucu Recover okuması BOM'u atar (`readReceiptForRecover`, tek kaynak; `receiptFileState` de); (ii) Run kanıtı `recovery.makbuzJson` = `JSON.stringify(receipt, null, 1)` (makbuz dosyasıyla aynı serileştirme; dizge — tarih dönüşümüne uğramaz, ölçüldü); adım ve blok TEK komut verir: `(Get-Content -Raw -Encoding UTF8 -LiteralPath '<kanıt>' \| ConvertFrom-Json).recovery.makbuzJson \| Set-Content -Encoding UTF8 -NoNewline -LiteralPath '<kanıt dizini>\d6-setup-receipt-kanittan.json'` + AYRI owner onayıyla `-Mode Recover -ReceiptFile '<o dosya>'`. Gerekçe: nesne yerine **dizge** taşımak gidiş-dönüş dönüşümlerini (tarih, derinlik) tamamen dışlar; komutu blok somut yollarla basar |
| m5 | P6-FOREIGN-CLEAN PASS açıklaması silinen=0 iken "Prisma ile temizlendi" | açıklama sabit — **doğrulandı** (negatifte ölçüldü: Z3 / Z7) | silinen > 0 → "Prisma ile temizlendi"; kimlik yok → "hiç yazılmadı — temizleme YAPILMADI"; kimlik var + silinen 0 → "zaten yoktu — temizleme YAPILMADI"; gözlem "… — silinen=N kalan=M (ölçüldü)" |
| m6 | `makbuzDiskte` `existsSync` → klasörde true | **doğrulandı** (negatifte ölçüldü) | `statSync().isFile()` |
| m7 | Bayat makbuzda blok yalnız "Makbuz dosyası: VAR" deyip bayat dosyayla Recover öneriyor | blok `Get-ReceiptFileState` güncelliğe bakmıyor; koşucu adımı bayatta da komut öneriyor — **doğrulandı** | koşucu: bayatta diskteki dosya ÖNERİLMEZ ("BAYAT (… farklı alan(lar): … · makbuz yazma hatası …) … eksik kapanış") + TEK komut; blok: kanıttaki `makbuzJson` ile metin eşitliği, eşit değilse "MAKBUZ DOSYASI BAYAT … bu dosyayla Recover ÖNERİLMEZ" + TEK komut |

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r2\` (`d6\test\`,
`d6\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, loopback, yüksek port, `_test`
adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda kaldırıldı);
`D6T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi alındı / bırakıldı; koşumdan önce kullanılabilir commit ölçüldü (≥ 4 GB).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — son baytlar | **79/79 PASS**, çıkış 0 (yeni 5: Z22-a..e; değişen 4: Z16-a, Z21-a, Z21-b, Z21-c; C-1, S-1 PASS) | `d6\test\d6-selftest-son.log` (+ `.sha-once` / `.sha-sonra`) |
| `d6-owner-block-selftest.ps1` — son baytlar | **81/81 PASS** Windows PowerShell 5.1 · **81/81 PASS** PowerShell 7 (PIN-1 9/9, digest = `$ExpPackage`) | `d6\test\blok-oz-test-son-winps51.log`, `d6\test\blok-oz-test-son-pwsh7.log` |
| **Negatif — koşucu:** `9556a7e5` aynası + R03-d öz-test / sahte API | **70/79**, çıkış 1 — FAIL = tam olarak Z16-a, Z21-a, Z21-b, Z21-c, Z22-a, Z22-b, Z22-c, Z22-d, Z22-e. Eski davranış ölçüldü: yeniden açılan hesapta (sürüm 1→2) "adayı DEĞİL"; sürüm geri dönüşünde de aynı metin; P6-FOREIGN-CLEAN silinen 0 iken "Prisma ile temizlendi"; bayat makbuzda `-ReceiptFile <makbuz>`; klasörde `makbuzDiskte=true`; BOM'lu makbuz OKUNAMADI | `d6\neg\neg-eski-kosucu.log`, `d6\neg\neg-eski-gozlem.txt`, `d6\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-d blok öz-testi | iki kabukta **76/81**, çıkış 1 — FAIL = tam olarak O-12, O-13, O-14, O-15, O-16 (eski blok "1 + kanıt yok"ta "aynı kapanışlar doğrulandı" yazdı; O-15'te komut satırı yok) | `d6\neg\neg-eski-blok-winps51.log`, `d6\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `13858A12…` = `$ExpPackage`; iki ps1 parse hatası 0 (iki kabuk), `node --check` 0, iki ps1 UTF-8 BOM | `d6\test\pin-dogrulama-son.log`, `d6\test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler: **Z21-a** (guard kusur taklidi + yeniden açma, sürüm verilen + 2 → ADAY + ayrı "yeniden AÇILDI … (Recover kapatabilir)" satırı;
"adayı DEĞİL" hiçbir yerde yok) · **Z22-a** (guard normal + yeniden açma → eski oturum 401, P6-C4 PASS, bulgu yok, portal açık satırı) · **Z22-b**
(sürüm geri dönüşü → 200 "adayı DEĞİL") · **Z22-c** (sınıflama + kurtarma nedeni birim; AYRISTIRILAMADI'da "DEĞİL" yok) · **Z22-d** (P6-FOREIGN-CLEAN
Z1 / Z3 / Z7) · **Z22-e** (bayat makbuz; klasör `makbuzDiskte=false`; BOM'lu makbuz kullanılabilir) · **Z21-b / Z21-c** (TEK komut; Z21-c'de komut
WinPS 5.1 ve PS 7 ile **gerçekten** koşuldu: 5.1 dosyası BOM'lu, 7 BOM'suz, ikisi `makbuzJson`'a birebir, koşucu kapısı ok, iki Recover kimlik bağı OK)
· **Z16-a** (yabancı satır metni) · **O-12** ("1 + kanıt yok", "kod farklı") · **O-13** (bayat durumu + TEK komut somut yollarla) · **O-14** (3 metni)
· **O-15** (bloğun gösterdiği TEK komut iki kabukta koşulur; dosyalar bloğun Recover okuma kapısından ve GERÇEK koşucunun `readReceiptForRecover`
kapısından geçer) · **O-16** (ADAY gösterimi).

**Ölçülmeyenler / sınır:** canlıda hiçbiri koşulmadı. Sahte API ürün değildir: hesabın ölçüm sırasında yeniden açılması bir dış müdahale taklididir;
ürünün bunu kendiliğinden yapıp yapmadığı ölçülmedi. ADAY sınıfı bir **aday**dır (kaynaktan çıkarım + sahte API ölçümü); canlı guard'ın 200 verdiği
bir durum gözlenmedi. "Sürüm eşit ama hesap pasif → ADAY" dalı yalnız birim ölçümüyle (Z22-c) sınandı. Gerçek bir makbuz yazma hatası (izin / disk)
uçtan uca koşulmadı (kayıp silme ile, bayatlık birim ile üretildi). Blok Recover'ının koşucuyu gerçek veriyle çağırması (blok öz-testinde koşucu
sahte; kapı fonksiyonu gerçek) ölçülmedi — koşucu tarafı Z21-c'de gerçek DB ile ölçüldü. `-ReceiptFile` için yazılan yeni dosyanın kim tarafından
ve Run kanıt dizinine mi yazılacağı owner / CLIENT kararıdır; bu paket onu kendiliğinden yapmaz. Bu revizyon canlı Run/Recover'ı yetkilendirmez.

### 13.6 R03-e — R03-d iki bağımsız doğrulamasının bulguları (2026-10-04)

Kapsam: owner ölçütü **iki yönlüdür** — kanıtın desteklemediği BAŞARI iddiası da, kanıtın desteklemediği "ürün bulgusu DEĞİL / SAYILMADI" iddiası da
yazılmaz; ölçülmeyen "ölçülmedi / ayrıştırılamadı" diye yazılır. Bulgular önce **kaynakta doğrulandı** (R03-d yerel ucu `60b2a84d`; ürün kaynağı
`HY_WT_R27` @ `1b758d29`, salt okuma), sonra dar düzeltildi. Canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi).
Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

**B1 (major) — kaynakta doğrulama.** `60b2a84d` koşucusunda `closePortal` → `judgeSession` üç dallıydı: `flags && c5ok` → kesin bulgu; `flags` (P6-C2
PASS) → R03-d sürüm kuralı; **aksi halde** (P6-C2 FAIL) `sessionWhileOpen` + "portal hesabı DB'de hâlâ AÇIK … — kapatma YAPILMADI; oturumun erişmesi bu
durumda ürün bulgusu SAYILMADI" — sürüme ve kapatma çağrısının 2xx olup olmadığına **bakmadan**. `recoveryAdvice` aynı dalda "kapatma YAPILMADI … ürün
bulgusu SAYILMADI" yazıyordu; aday koşulu yalnız `P6-C2 PASS && P6-C5 FAIL` idi — **doğrulandı**. Ürün yoluyla erişilebilir: `portal.service.ts:564-598`
`changePassword` sürümü artırır, `isActive`'e dokunmaz; kapatma 403 dönerse hesap açık kalır ve sürüm verilme sürümünden büyüktür → guard
(`portal-auth.guard.ts:66-68`) eski oturumu reddetmeliydi → 200 **ADAY**. Negatif kontrolde eski baytlarda ölçüldü: Z23-c (sürüm 0→1, kapatma 403) →
"ürün bulgusu SAYILMADI"; Z23-g (kapatma 201, yalnız `isActive=false`) → "kapatma YAPILMADI" + "SAYILMADI".

**Düzeltme — tek sınıflama (`sessionClass200`, saf fonksiyon).** Koşucu oturumunun **her** HTTP 200 yanıtı (P6-C2 PASS ya da FAIL) bu fonksiyondan
geçer. Girdiler: `b` = oturumun verildiği sürüm (token claim'i; okunamazsa girişten önce okunan s1), `st1` = HTTP ölçümlerinden **önce** DB (P6-C2
okuması: satır var mı, `isActive`, `hasPortalAccess`, `tokenVersion`), `st2` = HTTP ölçümlerinden **sonra** DB (P6-C5 okuması). `a` = st1 sürümü,
`c` = st2 sürümü; "pasif" = `isActive ≠ true` (guard ölçütü).

| Hücre | Koşul | Sınıf | Metin özü (kanıtta ölçülen değerlerle) |
|---|---|---|---|
| B | st1 ve st2 kapalı (isActive=false + hasPortalAccess=false), c = a | BULGU | R03-c kuralı (P6-C2 PASS + P6-C5 PASS) aynen; verilme sürümünden bağımsız (guard pasif hesabı reddeder) |
| T0 | b bilinmiyor | AYRISTIRILAMADI | "oturumun verildiği sürüm bilinmiyor" **[R03-f düzeltmesi → §13.7:** bu hücrede önceden yazan "Run'da claim ya da s1 her zaman vardır; yalnız birim ölçümde oluşur" cümlesi YANLIŞTI — Run'da token claim'i geçersizse (tam sayı ≥ 0 değil) verilme sürümü bilinmez ve s1'e düşülmez; ürünün imzaladığı token'da claim her zaman DB'deki tam sayıdır (`portal.service.ts:443`), bu yüzden canlıda pratikte beklenmez. R03-f'de geçersiz claim T0 değil **TG (ADAY)**; T0 artık b'den bağımsız T1 / TG / T3 hücrelerinden SONRA değerlendirilir.**]** |
| T1 | st1 satırı YOK | ADAY | "hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder"; "sürüm null" YAZILMAZ |
| T1s | st1 var, st2 satırı YOK | a > b ya da (a = b, st1 pasif) → ADAY · (a = b, st1 açık) ya da a < b → AYRISTIRILAMADI | satırın HTTP'den SONRA silindiği açıkça yazılır |
| TA | c < a (sürüm ölçüm aralığında AZALDI — "sürüm geri dönüşü") | AYRISTIRILAMADI | "ürün yazıcıları yalnız artırır; ürün dışı yazım ölçüldü, istek anındaki sürüm ölçülmedi" |
| TI | c = a ama isActive aralıkta değişti | AYRISTIRILAMADI | "sürüm artmadan yeniden açma / kapatma: ürün dışı; istek anındaki isActive ölçülmedi" **[R03-f'de değişti → §13.7:** TI yalnız a = b = c; a = c ≠ b → T2 ADAY.**]** |
| T2 | b < a ya da b > c | ADAY | "eski oturum sürüm reddine rağmen erişti — verilme b, HTTP öncesi a, sonrası c; ürün yazıcıları yalnız artırdığından istek anında da farklıydı" |
| T2a | a < b ≤ c | AYRISTIRILAMADI | "HTTP öncesi sürüm verilmenin ALTINDA (ürün dışı azaltma); istek anında eşit olabilir" |
| T3 | a = b = c, st1 ve st2 pasif | ADAY | "pasif hesap reddine rağmen erişti" **[R03-f'de değişti → §13.7:** koşul c = a, st1 ve st2 pasif — b'den ve hasPortalAccess'ten bağımsız; T0'dan önce.**]** |
| T4 | a = b < c, st1 pasif | ADAY | "istek artıştan önceyse pasiflik, sonraysa sürüm reddi; ret nedeni ayrıştırılamadı (pasiflik ya da sürüm)" |
| T5 | a = b = c, st1 ve st2 açık | **SAYILMADI** | "kapatma DB'ye yansımadı — hesap önce ve sonra açık, sürüm verilme sürümüyle aynı; guard kabul eder → 200 beklenir; ürün bulgusu değil (guard'ın satır kimliği ve tenant yaşam döngüsü koşulları ÖLÇÜLMEDİ …)" — "ürün bulgusu değil" **yalnız bu hücrede** **[R03-f'de değişti → §13.7:** metin "hesap aktif kaldı (isActive=true …) ve sürüm verilme sürümüyle aynı; guard hasPortalAccess okumaz; 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)"; "kapatma DB'ye yansımadı" kaldırıldı.**]** |
| T6 | a = b < c, st1 açık | AYRISTIRILAMADI | "sürüm istek sırasında değişti; istek anındaki sürüm ölçülmedi" |

**Varsayım (metinde ve kodda açık).** Ürünün `ClientPortalUser.tokenVersion` yazıcıları **yalnız artırır**: `portal.service.ts` :315 (yeniden açma),
:587 (changePassword), :724 (resetPassword), :769 (disable) — dördü de `increment: 1` (bu turda grep ile yeniden doğrulandı; ClientPortalUser'a
başka yazım yalnız :307 (aynı yeniden açma), :345 (yeni satır — yalnız satır yokken), :429 (loginCount), :628 (resetToken); ham SQL yok). `isActive`'i
değiştiren iki yazım (:307-317, :765-770) aynı yazımda sürümü artırır; satırı silen ürün yolu yalnız Client cascade'dir; create-user mevcut satırı
**aynı id** ile yeniden açar (:289-317). Bu varsayım yalnız st1–st2 aralığına uygulanır; aralıkta ölçümle çiğnendiyse (TA, TI) sınıf AYRISTIRILAMADI.
**İstek anındaki DB durumu ÖLÇÜLMEDİ** (koşucu yalnız HTTP'den önce ve sonra okur).

**Görev tablosuna karşı kaynak denetimi — farklı hücreler ve gerekçe.** (1) Görevdeki T1'in "st2 satırı YOK → ADAY" yarısı: st1 açık ve a = b iken
satır HTTP'den **sonra** silinmişse istek anında satır açık ve aynı sürümde olabilir → guard kabul eder → ADAY kanıtla desteklenmez → **T1s'de
AYRISTIRILAMADI**; a > b ya da st1 pasif ise her iki anda da ret → ADAY. (2) Görevdeki T2 "st1.v ≠ b → ADAY": a < b iken (verilmeden sonra ürün dışı
azaltma) ürün artışları istek anında sürümü b'ye getirebilir → yalnız b ∉ [a, c] iken ADAY (T2), a < b ≤ c → **T2a AYRISTIRILAMADI**. (3) Görev
tablosunda olmayan durum: st1 açık, st2 pasif, a = b = c (sürüm artmadan kapatma — ürün dışı) → **TI AYRISTIRILAMADI**; görevdeki T4'ün "st2 açık ve
st2.v = b (ürün dışı yeniden açma) → AYRISTIRILAMADI" hücresi de TI'dır. (4) B görev tablosunda yoktur: R03-c'nin P6-C2 PASS + P6-C5 PASS kuralı
**korundu**, T0'dan önce (verilme sürümüne bağlı değildir). (5) Guard `hasPortalAccess`'i **okumaz** (`portal-auth.guard.ts:47-60`): T5'te "açık" =
`isActive=true`; hasPortalAccess=false iken de 200 beklenir (Z23-a). Açık **portal erişimi** (isActive ya da hasPortalAccess) ayrı satırdadır.

**R03-d'nin "sürüm geri dönüşü → adayı DEĞİL" dalı neden kaldırıldı.** st1 kapalı (a = b + 1), st2 açık (c = b): sürüm ölçüm aralığında **azaldı** —
ürün yazıcıları yalnız artırdığından bu bir ürün dışı yazımdır ve istek bu yazımdan önce de sonra da olabilir (önce: sürüm b+1 ≠ b → ret beklenirdi;
sonra: açık + sürüm b → kabul). Ne "DEĞİL" ne "ADAY" kanıtla desteklenir → **TA AYRISTIRILAMADI**. Görevin önerdiği T2 (ADAY) da seçilmedi: T2'nin
gerekçesi ("ürün yazıcıları yalnız artırdığından istek anında da farklıydı") aralıkta azalma **ölçülmüşken** geçerli değildir.

**Diğer değişiklikler (koşucu).** (i) Kapatma metni ölçülene bağlı (`portalClose.closeText`): "kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB'de AÇIK
(isActive=… hasPortalAccess=… sürüm a→b)" **yalnız** 2xx kapatma çağrısı yokken; 2xx varken "kapatma çağrısı 2xx döndü ama DB'de AÇIK / kapanış
TAMAMLANMADI (…)" ya da "… ama kapatmadan sonra hesap satırı DB'de YOK"; "hâlâ" kaldırıldı. (ii) ADAY her hücrede: `productFinding` ("… oturum reddi ürün
tarafıdır, Recover düzeltemez" — açık-erişim metnini **içermez**) + `sessionVersion` {sinif, hucre, verilen, verilenKaynak, httpOncesi, olcumSonrasi};
`recoveryAdvice`'ın aday koşulu tabloyu kullanır (`sessionVersion.sinif === 'ADAY'`). (iii) Hesap HTTP ölçümlerinden sonra açıksa (isActive ya da
hasPortalAccess) **AYRI** `portalClose.acikErisim` = "portal hesabı açık (…) — açık erişim kapatılmalıdır (Recover kapatabilir)"; kurtarma nedeninde
portal ERİŞİM satırı oturum satırından ayrıdır ve "(Recover kapatabilir)" ile biter; Recover modunda "(Recover kapatabilir)" **yazılmaz** ("açık erişim
KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)"). **[R03-f'de değişti → §13.7:** "portal hesabı açık" ve
"(Recover kapatabilir)" kaldırıldı — durum ölçülenle ("portal hesabı AKTİF (…)" / "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık
(…)"), Run'daki Recover metni kapatma çağrılarına bağlı.**]** (iv) Kurtarma nedeninde AYRISTIRILAMADI ve SAYILMADI da
kendi oturum satırını yazar. (v) **Verilme sürümü:** koşucu portal token'ının payload'ını **İMZASIZ** decode eder (`portalTokenClaimVersion`; imza
doğrulanmaz; token kanıta / günlüğe yazılmaz); claim varsa esas claim, yoksa guard kuralıyla 0, geçersizse bilinmiyor (T0), token JWT değilse s1.
**[R03-f/g'de değişti:** claim geçersizse sınıflamada **TG** (ADAY; R03-f, §13.7); token JWT olarak okunamazsa verilme sürümü yine s1 (P6-C2V referansı) ama
sınıflamada **TJ** (ADAY; R03-g, §13.8) — ikisi de T0'a / T5'e ulaşmaz.**]**
Kanıtta `issuedVersion` = {esas, kaynak (claim | s1), claim, s1, fark, claimDurum}; claim s1'den farklıysa ikisi de yazılır. Makbuzdaki
`portalIssuedTokenVersion` esas değere güncellenir + `portalIssuedTokenVersionKaynak` (Recover P6-C2V referansı). **Blok:** Run sonu ekranında
`portalClose.acikErisim` ürün bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırında gösterilir (yalnız gösterim).

**B3 (not; kapsam dışı — kod DEĞİŞTİRİLMEDİ; ölçülmeyen / açık).** Guard kendi hata yollarını 401'e çevirir (`portal-auth.guard.ts:87-89`); bu yüzden
**yerel** API'den P6-C4L için gelen 5xx guard'ın kendisinden gelmez — guard geçilmiş olabilir. Koşucu: 503 / 429 → ÖLÇÜLEMEYEN; diğer 5xx → P6-C4 FAIL
+ çıkış 6, ama ADAY **sınıflamaz** (`sessionVersion` yazılmaz). 5xx'in guard'dan sonra mı (eski oturum erişti, işleyici hata verdi) yoksa guard'dan
önceki bir katmanda mı üretildiği **ölçülmedi**; dış (DIŞ HTTPS) 5xx kenar katmanından da gelebilir. 5xx'in aday sayılıp sayılmayacağı açık kalır.

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r3\` (`d6\test\`,
`d6\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırıldı); `D6T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı; her koşumdan önce FreeVirtualMemory ölçüldü
(≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — son baytlar (koşucu `9C8B0510…`, sahte API `AF4943D3…`, öz-test `B7E6BAA7…`) | **92/92 PASS**, çıkış 0 (yeni 13: Z23-a..l, T-9; değişen 9: Z20-a, Z20-b, Z20-c, Z20-d, Z20-f, Z20-h, Z21-a, Z22-b, Z22-c; C-1, S-1 PASS) | `d6\test\d6-selftest-son.log` (+ `.sha-once` / `.sha-sonra`); ara koşumlar `d6-selftest-ilk*.log` (ilk koşumda T-8 FAIL: Run'ın `closePortal` çağrısına eklenen `mode` alanı T-8'in aradığı sıranın önündeydi → alan sona alındı, T-8 değişmedi) |
| `d6-owner-block-selftest.ps1` — son baytlar (blok `4A444A30…`, öz-test `6681E3D2…`) | **82/82 PASS** Windows PowerShell 5.1 · **82/82 PASS** PowerShell 7 (PIN-1 9/9, digest `E49930A2…` = `$ExpPackage`; O-17 yeni) | `d6\test\blok-oz-test-son-winps51.log`, `d6\test\blok-oz-test-son-pwsh7.log` |
| **Negatif — koşucu:** `git archive 60b2a84d` aynası (koşucu `EE0AE16D…`, blok `4DB91616…`) + R03-e öz-test / sahte API | **70/92**, çıkış 1 — FAIL = tam olarak Z20-a, Z20-b, Z20-c, Z20-d, Z20-f, Z20-h, Z21-a, Z22-b, Z22-c, Z23-a, Z23-b, Z23-c, Z23-d, Z23-e, Z23-f, Z23-g, Z23-h, Z23-i, Z23-j, Z23-k, Z23-l, T-9 (22 = yeni 13 + değişen 9). Eski davranış ölçüldü: açıkken sürüm artmış + kapatma 403 → "hâlâ AÇIK … ürün bulgusu SAYILMADI"; 2xx kapatmada "kapatma YAPILMADI"; sürüm geri dönüşünde "adayı DEĞİL" | `d6\neg\neg-eski-kosucu.log`, `d6\neg\neg-eski-gozlem.txt`, `d6\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-e blok öz-testi | iki kabukta **81/82**, çıkış 1 — FAIL = yalnız **O-17** (PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `d6\neg\neg-eski-blok-winps51.log`, `d6\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `E49930A2…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d6\test\pin-dogrulama-son.log`, `d6\test\parse-iki-kabuk-son.log` |

Yeni / değişen ölçütler: **Z23-a** (karar tablosu, 18 girdi, 12 hücre; metin beklentileri; "ürün bulgusu değil" yalnız T5; "DEĞİL" yok; satır yokken
"sürüm null" yok) · **Z23-b** (claim decode: claim / claim yok → 0 / geçersiz → T0 / JWT değil → s1 / eşit; kanıtta token yok) · **Z23-c/d** T2 (açıkken
sürüm +1 + kapatma 403; guard kusur taklidi → ADAY + ayrı satırlar · guard normal → 401) · **Z23-e/f** T1 (satır silme) · **Z23-g/h** T3 (sürüm artmadan
pasif; 2xx kapatma metni) · **Z23-i/j** TI (sürüm artmadan yeniden açma) · **Z23-k** claim ≠ s1 (ikisi kanıtta, claim esas, makbuz + P6-C2V referansı
claim) · **Z23-l** claim okunamaz → s1 · **T-9** statik (tek sınıflama çağrısı; "hâlâ AÇIK", `sessionWhileOpen`, "adayı DEĞİL" yok) · **Z20-a..d, Z20-f**
(T5 metni + ölçülen kapatma metni) · **Z20-h (i)** ("hâlâ" yok) · **Z21-a** (T2 + hücre; bulgu metni açık-erişim satırını içermez) · **Z22-b** (TA) ·
**Z22-c** (kurtarma nedeni sınıflara göre; Recover'da "(Recover kapatabilir)" yok) · **O-17** (blok: ayrı "PORTAL ERİŞİMİ:" satırı).

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. Sahte API ürün değildir: "Şifre Değiştir" (sürüm +1), satır silme, sürüm artmadan pasif / yeniden
açma ve sürüm geri dönüşü dış müdahale ya da kusur **taklitleridir**; ürünün bunları kendiliğinden yapıp yapmadığı ölçülmedi. ADAY bir **aday**dır
(kaynaktan çıkarım + sahte API ölçümü); canlı guard'ın 200 verdiği bir durum gözlenmedi. Claim decode gerçek ürün JWT'sinde ölçülmedi (sahte API ürünün
claim adlarıyla üç parçalı token üretir; imza sahte, koşucu imzayı zaten doğrulamaz). T0, T1s, T2a, T4, T6 hücreleri ve "T5 + hasPortalAccess=false"
yalnız birim ölçümüyle (Z23-a) sınandı. Guard'ın satır kimliği (`id = sub`) ve tenant yaşam döngüsü koşulları koşumda ölçülmez (T5 metninde yazılı;
kurulum tenant'ı şema varsayılanı ACTIVE ile yazılır — kaynaktan). Recover'da mevcut oturum reddi (P6-C4) **her zaman** ölçülemez (değişmedi). B3 açık.
`recovery.makbuzJson`'dan yazılan yeni makbuz dosyasını kim, nereye yazar — açık owner kararı (§13.4). Bu revizyon canlı Run/Recover'ı yetkilendirmez.

### 13.7 R03-f — R03-e iki bağımsız doğrulamasının MINOR bulguları (2026-10-04)

Kapsam: iki doğrulamada blocker / major yoktu; MINOR bulgular dar kapatıldı. Owner ölçütü **iki yönlüdür** — kanıtın desteklemediği başarı / yetenek iddiası
da, kanıtsız "bulgu değil" de yazılmaz. Her madde önce **kaynakta doğrulandı** (R03-e yerel ucu `4b75bbe7`; ürün kaynağı `HY_WT_R27` @ `1b758d29`, salt okuma),
sonra eski baytlarda negatif kontrolle ölçüldü. Karar tablosunun F4 / F5 dışındaki hücreleri **değişmedi**. Canlı Run/Recover **koşulmadı**, owner bloğu
**çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

| Madde | Kaynakta (`4b75bbe7`) — doğrulama | Düzeltme (R03-f) |
|---|---|---|
| F1 | P6-C1 PASS koşulu `disabledNow ∨ (hesap zaten kapalı) ∨ flags`; açıklama sabit "portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user) ya da zaten kapalıydı". 2xx kapatma çağrısı dönüp DB açık kaldığında (Z23-g: yalnız `isActive=false`, bayrak açık, P6-C2 FAIL) da "kapatıldı" yazıyordu; kimlik reddi (FAIL) ve geç oluşma (ÖLÇÜLEMEYEN) satırları da aynı açıklamayı taşıyordu — **doğrulandı** (eski baytlarda Z24-c: 59 P6-C1 satırının 58'inde "kapatıldı") | Açıklama `C1_DESC` = "kapatma çağrısı yetkili uçta 2xx döndü (admin/disable-user) ya da hesap zaten kapalıydı ya da 2xx olmadan kapatma adımından sonra DB'de kapalı görüldü — DB kapanışı P6-C2 / P6-C5 satırlarında" (üç yol: kimlik reddi, geç oluşma, normal); gözlem `· dayanak=2xx kapatma çağrısı` / `hesap zaten kapalıydı (çağrı yapılmadı)` / `2xx yok — kapatma adımından sonra DB'de kapalı görüldü` / `YOK (2xx yok, DB'de kapalı değil)`. **Görev metninden sapma:** görevdeki açıklamada üçüncü yol ("2xx olmadan DB'de kapalı görüldü") yoktu; PASS koşulu `flags`'i de içerdiğinden o yol yazılmasaydı açıklama o dalda kanıtsız olurdu — eklendi. "kapatıldı" artık yalnız B hücresinin bulgu metninde (DB kapanışı HTTP'den önce ve sonra ölçülmüşken) geçer |
| F2 | `acikErisim` ve kurtarma nedeni son eki Run'da sabit "açık erişim kapatılmalıdır (Recover kapatabilir)". Recover (`openStaffSession`) makbuzdaki **aynı** sentetik personeli (`elevUserId`; geçici parola + `isActive=true`) açar ve aynı `disable-user` ucunu çağırır; Run'da kapatma 401/403 ile reddedildiyse (tek yeniden girişten sonra da) Recover'ın kapatabildiği **ölçülmemiştir** — **doğrulandı** (eski baytlarda Z24-d: Z19-b / Z19-c / Z20-c / Z20-d / Z20-f kanıtlarında "Recover kapatabilir") | `recoverCloseText(disableCalls)`: son kapatma çağrısı (HTTP kodu ya da "belirsiz") `HTTP 401` / `HTTP 403` → "Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run'da kapatma HTTP <kod> ile reddedildi — Recover'ın kapatabildiği ÖLÇÜLMEDİ (personel yetkisi düzelmeden Recover da reddedilebilir)"; diğer her durumda (2xx ama açık, 5xx, belirsiz, çağrı / oturum yok, 404) "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)". Recover modunun metni ("açık erişim KAPANMADI (bu Recover kapatamadı; …)") değişmedi |
| F3 | (i) `isActive=false` + `hasPortalAccess=true` için `acikErisim` "portal hesabı açık (…)"; guard pasif hesabı reddeder (`portal-auth.guard.ts:58-60`), giriş `isActive=true` ister (`portal.service.ts:403-405`) — "hesap açık" kanıtsızdı. (ii) Kapatmadan sonra kapalı, HTTP sonrası yalnız bayrak açık iken kurtarma nedeni "hesap ölçüm sırasında yeniden AÇILDI" yazıyordu (`isActive` false kalmıştı). (iii) T5 "kapatma DB'ye yansımadı" — kapatma çağrısı hiç 2xx dönmemiş olabilir (Z19-b: 403) — **doğrulandı** (eski baytlarda Z24-e: `isActive=false` iken "yeniden AÇILDI") | `isActive=true` → "portal hesabı AKTİF (…)"; `isActive=false` + bayrak açık → "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…) — kapatılmalıdır" (kapatma metni, `acikErisim`, kurtarma nedeninin geri dönüş metni); "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken, yalnız bayrak açıldıysa "erişim bayrağı ölçüm sırasında yeniden açıldı (hesap pasif; P6-C5 FAIL: …)"; T5 "hesap aktif kaldı (isActive=true — HTTP ölçümlerinden önce ve sonra) ve sürüm verilme sürümüyle aynı (b); guard hasPortalAccess okumaz (ölçülen …); 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi: …)" |
| F4 | TI (`c = a` ve `isActive` değişti) T2'den ÖNCE değerlendiriliyordu: a = c ≠ b iken sürüm iki uçta verilme sürümünden farklıyken ADAY bastırılıyordu — **doğrulandı** (eski baytlarda Z23-i: kapatma +1 sonra sürüm artmadan yeniden açma → `AYRISTIRILAMADI/TI`, verilen 0, öncesi = sonrası 1) | TI yalnız a = b = c; a = c ≠ b → **T2 ADAY**, neden "oturumun verildiği sürüm b, HTTP öncesi ve sonrası DB sürümü a — sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım (isActive …→…, sürüm artmadan) sürüme dokunmadı (aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır); guard sürüm farkında isActive'ten bağımsız reddeder (portal-auth.guard.ts:66-68)" |
| F5 | T0 (verilme sürümü bilinmiyor) b'den bağımsız ADAY hücrelerinden ÖNCE geliyordu; token claim'i geçersizken (`issuedVersionOf` → GECERSIZ, değer null) sınıf T0 oluyordu, oysa guard bu oturumu her istekte **DB'den önce** reddeder (`portal-auth.guard.ts:42-45`, `:98-104`) — **doğrulandı** (eski baytlarda Z24-a: `AYRISTIRILAMADI/T0`; Z23-a: T1 / TG / T3 girdileri b bilinmiyorken T0). §13.6'daki "Run'da claim ya da s1 her zaman vardır" cümlesi yanlıştı (T0 satırında işaretlendi) | Sıra: B → **T1** (st1 satırı yok) → **TG** (yeni: claim geçersiz → ADAY, "guard her isteği reddeder (portal-auth.guard.ts:42-45; DB okumasından önce, hesap durumundan ve sürümden bağımsız)") → **T3** (st1 ve st2 pasif, sürüm iki uçta aynı → ADAY; b'den ve `hasPortalAccess`'ten bağımsız) → T0 → T1s → TA → TI → T2 → T2a → T5 → T4 → T6. Run, `issuedVersion.claimDurum === 'GECERSIZ'` iken `closePortal`'a `issuedClaimInvalid` verir; `sessionClass200(issued, st1, st2, claimInvalid)` |
| F6 | Bloktaki ADAY gösterim yorumu R03-d'den kalmaydı ("P6-C2 PASS + P6-C5 FAIL iken sürüm sınıflaması"); "PORTAL ERİŞİMİ:" satırının yorumu Recover'ın kapatabileceğini söylüyordu — **doğrulandı** (eski baytlarda O-18) | Yalnız yorum: ADAY yorumu `sessionClass200` karar tablosunun ADAY hücrelerini adlandırır; erişim satırı yorumu metnin koşucudan geldiğini ve kapatma çağrılarına bağlı olduğunu yazar. Gösterilen metin, kapılar, sıra, çıkış kodları değişmedi |

**Sahte API (ürün değil).** `portalToken badClaim` → üç parçalı JWT, `tokenVersion` claim'i `-1`. Guard NORMAL taklidi artık ürün guard'ı gibi claim'i doğrular
(tam sayı ≥ 0 değilse DB'ye bakmadan ret; claim yoksa 0 — değişmedi); guard `stale` kusur taklidi claim'e bakmaz (değişmedi).

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r4\` (`d6\test\`,
`d6\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırılır); `D6T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı (`dogrulama-ortak\kilit-olay.txt`); her koşumdan
önce FreeVirtualMemory ölçüldü (≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — son baytlar (koşucu `AA3D819E…`, sahte API `0715DBB4…`, öz-test `706F9499…`, blok `B2D15957…`) | **98/98 PASS**, çıkış 0 (yeni 6: Z24-a, Z24-b, Z24-c, Z24-d, Z24-e, T-10; değişen 18: Z20-a, Z20-b, Z20-c, Z20-d, Z20-f, Z20-h, Z21-a, Z22-a, Z22-b, Z22-c, Z23-a, Z23-c, Z23-d, Z23-g, Z23-h, Z23-i, Z23-j, T-9; C-1, S-1 PASS) | `d6\test\d6-selftest-son.log` (+ `.sha-once` / `.sha-sonra`: koşum sırasında dosya değişmedi); ara koşumlar: `d6-selftest-ilk1.log` 97/98 — Z22-c FAIL: Recover modundaki son ek istemeden değişmişti ("açık erişim kapatılmalıdır; " öne eklenmişti) → Recover modu metni önceki hâline döndürüldü, test değişmedi; `d6-selftest-ilk2.log` 98/98 |
| `d6-owner-block-selftest.ps1` — son baytlar (blok `B2D15957…`, öz-test `3159BF72…`) | **83/83 PASS** Windows PowerShell 5.1 · **83/83 PASS** PowerShell 7 (PIN-1 9/9, digest `40921CD2…` = `$ExpPackage`; O-18 yeni) | `d6\test\blok-oz-test-ilk1-winps51.log`, `d6\test\blok-oz-test-ilk1-pwsh7.log` (bu koşum son baytlarladır; sonrasında blok ve blok öz-testi değişmedi) |
| **Negatif — koşucu:** `git archive 4b75bbe7` aynası (koşucu `9C8B0510…`, blok `4A444A30…`) + R03-f öz-test / sahte API | **74/98**, çıkış 1 — FAIL = tam olarak Z20-a, Z20-b, Z20-c, Z20-d, Z20-f, Z20-h, Z21-a, Z22-a, Z22-b, Z22-c, Z23-a, Z23-c, Z23-d, Z23-g, Z23-h, Z23-i, Z23-j, Z24-a, Z24-b, Z24-c, Z24-d, Z24-e, T-9, T-10 (24 = yeni 6 + değişen 18). Eski davranış ölçüldü: geçersiz claim → T0; a = c ≠ b → TI; P6-C1 "kapatıldı"; "(Recover kapatabilir)"; pasif hesapta "yeniden AÇILDI" ve "portal hesabı açık"; T5 "kapatma DB'ye yansımadı" | `d6\neg\neg-eski-kosucu.log`, `d6\neg\neg-eski-gozlem.txt`, `d6\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-f blok öz-testi | iki kabukta **82/83**, çıkış 1 — FAIL = yalnız **O-18** (PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `d6\neg\neg-eski-blok-winps51.log`, `d6\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `40921CD2…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d6\test\pin-dogrulama-son.log`, `d6\test\parse-iki-kabuk.log` |

Not: Z24-b'nin özü (guard normal → 401, P6-C4 PASS, bulgu yok) eski koşucuda da tutar; eski baytlarda FAIL vermesinin nedeni aynı koşumdaki açık-erişim
metnidir (F2 / F3: "portal hesabı açık … (Recover kapatabilir)") — `neg-eski-gozlem.txt`.

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. F1'in üçüncü dayanağı ("2xx yok — kapatma adımından sonra DB'de kapalı görüldü") uçtan uca
ölçülmedi (bu dalı üreten sahte API varyantı yok; açıklama PASS koşulunun kodundan). TG gerçek ürün JWT'sinde ölçülmedi: ürünün imzaladığı token'da
claim DB'deki tam sayıdır (`portal.service.ts:443`) — canlıda pratikte beklenmez; guard normal ikizi sahte API'nin claim doğrulamasıdır, ürün guard'ının
kendisi değildir. F2: 401/403 sonrasında Recover'ın gerçekten kapatıp kapatamadığı ölçülmedi (metin bunu söyler; sonuç Recover kanıtında ölçülür).
"Erişim bayrağı yeniden açıldı (hesap pasif)" dalı, TG + pasif hesap, T3'ün b bilinmiyor / b aralık dışında varyantları ve TI'nın a = b = c açma girdisi
yalnız birim ölçümüyle (Z24-e, Z23-a) sınandı. B3 açık (değişmedi). Recover'da mevcut oturum reddi (P6-C4) her zaman ölçülemez (değişmedi). Bu revizyon
canlı Run/Recover'ı yetkilendirmez.

### 13.8 R03-g — R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur (2026-10-04)

Kapsam: R03-f'nin iki bağımsız doğrulaması (ikisi de ok=true) yalnız MINOR kenarlar bıraktı; bunlar dar kapatıldı. Karar tablosunun aşağıdakiler dışındaki
hücreleri ve onaylanmış metinler **değişmedi**. Her madde önce **kaynakta doğrulandı** (R03-f yerel ucu `a3094a5b`; ürün kaynağı `HY_WT_R27` @ `1b758d29`,
salt okuma), sonra eski baytlarda negatif kontrolle ölçüldü. Canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu
fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

| Madde | Kaynakta (`a3094a5b`) — doğrulama | Düzeltme (R03-g) |
|---|---|---|
| G1 | Recover modunda `acikErisim` (`closePortal`) ve kurtarma nedeni son eki (`recoveryAdvice`) sabit "açık erişim KAPANMADI (bu Recover kapatamadı; …)". Kurtarma nedeninin "kapatmadan sonra DB'de kapalı ölçüldü (P6-C2=PASS) ama … yeniden AÇILDI (P6-C5 FAIL …)" dalında da aynı son ek yazılıyordu: Recover kapatmayı 2xx ile yapıp P6-C2 PASS ölçtüyse "kapatamadı" kanıtsızdır — **doğrulandı** (eski baytlarda Z25-d (2): kapatma 201, P6-C2 PASS, P6-C3L/D 401, P6-C5 FAIL → "açık erişim KAPANMADI (bu Recover kapatamadı; …)") | `recoverOpenAccessText` (saf fonksiyon; girdi = kapatma adımından sonraki DB (P6-C2 okuması), kapanış başı, `disable2xx`): kapatmadan sonra DB'de kapalı **değilse** "açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)" (R03-f metni korunur); kapalıysa (P6-C2 PASS) dayanak ölçülenle: "Recover kapattı (kapatma çağrısı 2xx, P6-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P6-C5 FAIL) — açık erişim KAPANMADI; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı" · "hesap Recover başında zaten kapalıydı (kapatma çağrısı yapılmadı; P6-C2 PASS) ama …" · "kapatma çağrısı 2xx dönmedi ama kapatma adımından sonra DB'de kapalı ölçüldü (P6-C2 PASS); erişim …". Run modu değişmedi (`recoverCloseText`) |
| G2 | D-6 bloğunda koşulsuz Recover yetenek metni ("Recover canlıya şunları YAZAR … yetkili uç çağrılır …") **YOK** — ölçüldü (blokta "Recover canlıya", "disable-user", "en çok 2 deneme" eşleşmesi 0; `Invoke-RecoverMode` bilgi metni içermez; `d6\test\g2-blok-olcum.txt`) | Blok metni değişmedi (yalnız pin + başlık notu). Blok öz-testine kalem eklenmedi |
| G3 | `issuedVersionOf`: claim OKUNAMADI (token üç parçalı değil ya da payload JSON nesnesi değil) → verilme sürümü s1; `sessionClass200`'ün bu durum için girdisi yoktu → a = b = c ve iki uç aktifken **T5 "ürün bulgusu değil"** yazılabiliyordu. Ürün guard'ı JWT olmayan token'ı `verifyAsync`'te (`portal-auth.guard.ts:36`) DB'den önce reddeder; ürünün verdiği token `jwtService.sign` ile JWT'dir (`portal.service.ts:438-446`) — **doğrulandı** (eski baytlarda Z25-a: `SAYILMADI/T5` "… 200 beklenir — ürün bulgusu değil …"; Z23-a: TJ girdileri T5 / T0 / T3 / T6) | Yeni hücre **TJ** (ADAY): "token JWT olarak okunamadı (üç parçalı JWT değil ya da payload JSON nesnesi değil) — ürün guard'ı bu token'ı DB'den önce reddeder (portal-auth.guard.ts:36 verifyAsync; hesap durumundan ve sürümden bağımsız)"; TG ile aynı ilke, B → T1 → TG → **TJ** → T3 → T0 …; T5'e ulaşmaz. `sessionClass200(issued, st1, st2, claimInvalid, claimUnreadable)`; Run 5. girdiyi `issuedVersion.claimDurum === 'OKUNAMADI'`'dan kurar. `issuedVersionOf` değerleri değişmedi (verilme sürümü yine s1 → P6-C2V referansı aynı) |
| G4 | `sessionClass200` T2'nin a = c ≠ b + `isActive` değişti (tiOut) dalında b > c iken "(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma)" notu yoktu (tiOut dışı T2 yazıyordu) — **doğrulandı** (eski baytlarda Z23-a `T2-TIdışı-alt`) | Not tiOut dalına da eklendi (sürüm değerlerinden hemen sonra; metin tiOut dışı T2 ile aynı) |
| G5 | Z23-a'da B'nin TG'den ve T1'in TG'den önce geldiğini sınayan girdi yoktu | Z23-a'ya sıra girdileri: B-TG, T1-TG, B-TJ, T1-TJ (+ TJ, TJ-b-yok, TJ-pasif, TJ-artış ve G4 girdisi `T2-TIdışı-alt`: b=3, st1 (aktif, 1), st2 (pasif, bayrak açık, 1) → T2 ADAY + ALTINDA) — 33 girdi, 14 hücre |
| G6 | §13.6 (v) "claim … geçersizse bilinmiyor (T0)" R03-f'den beri bayattı | Cümlenin ardına "[R03-f/g'de değişti: … TG (ADAY; §13.7) … TJ (ADAY; §13.8) …]" işareti (onaylanmış metin silinmedi) |

**Güncel karar sırası (R03-g).** B → T1 → TG → **TJ** → T3 → T0 → T1s → TA → TI → T2 → T2a → T5 → T4 → T6 (ilk tutan hücre). TJ satırı: koşul "token JWT olarak
okunamadı (Run: `issuedVersion.claimDurum === 'OKUNAMADI'`)", sınıf ADAY, metin yukarıda. Diğer hücreler §13.6 / §13.7'deki gibi; T2'nin a = c ≠ b dalı b > c
iken ALTINDA notunu da yazar.

**Sahte API (ürün değil).** (i) Guard NORMAL taklidi artık ürün guard'ı gibi JWT olmayan token'ı (`portalToken opaque`, iki parçalı) DB'ye bakmadan reddeder
(`portal-auth.guard.ts:36`). R03-e/f'de normal taklit opaque token'ı kabul ediyordu — **ürün davranışı değildi**; bu yüzden Z23-l'nin beklentisi değişti (opaque
token + guard kusur taklidi → T2 değil **TJ**; gerekçe: sahte API'nin opaque token'ı ürün davranışı değildir, ürün guard'ı bu token'ı DB'den önce reddeder ve 200'ün
sınıfı sürümden bağımsızdır). Guard `stale` kusur taklidi değişmedi. (ii) `reopenOn extLogin`: yeniden açma tetiği (`reopen afterDisable*` ile) başarılı kapatmadan
sonraki İLK **dış** portal girişi yanıtlandıktan sonra (o giriş kapalı hesabı görür). Recover'ın HTTP ölçümleri yalnız yeni giriştir (P6-C3L yerel, P6-C3D dış;
belge listesi isteği yoktur), bu yüzden mevcut `documents` tetiği Recover'da hiç çalışmazdı. Varsayılan `documents` (önceki davranış aynen).

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r5\` (`d6\test\`,
`d6\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırılır); `D6T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı (`dogrulama-ortak\kilit-olay.txt`); her koşumdan
önce FreeVirtualMemory ölçüldü (≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-selftest.js` — son baytlar (koşucu `191C6B2F…`, sahte API `6D55509A…`, öz-test `81431BF8…`, blok `F1EBCC45…`) | **102/102 PASS**, çıkış 0 (yeni 4: Z25-a, Z25-b, Z25-c, Z25-d; değişen 3: Z23-a, Z23-l, T-9; C-1, S-1 PASS) | `d6\test\d6-selftest-son.log` (+ `.sha-once` / `.sha-sonra`: koşum sırasında dosya değişmedi); ilk koşum `d6-selftest-ilk1.log` 102/102 (blok pini güncellenmeden önce; koşucu / sahte API / öz-test aynı baytlar) |
| `d6-owner-block-selftest.ps1` — son baytlar (blok `F1EBCC45…`, öz-test `3159BF72…` — değişmedi) | **83/83 PASS** Windows PowerShell 5.1 · **83/83 PASS** PowerShell 7 (PIN-1 9/9, digest `F511D5F9…` = `$ExpPackage`) | `d6\test\blok-oz-test-ilk1-winps51.log`, `d6\test\blok-oz-test-ilk1-pwsh7.log` (son baytlarla; `-sha-once` / `-sha-sonra` eşit) |
| **Negatif A — koşucu:** `git archive a3094a5b` aynası (ESKİ koşucu `AA3D819E…`, ESKİ blok `B2D15957…`) + R03-g öz-test + R03-g sahte API | **96/102**, çıkış 1 — FAIL = tam olarak Z23-a, Z23-l, Z25-a, Z25-c, Z25-d, T-9 (6). **Z25-b PASS** — beklenen: özü sahte API'nin guard sadakatidir (JWT olmayan token → 401), koşucu değişikliğine bağlı değildir | `d6\neg\neg-A-eski-kosucu.log`, `d6\neg\neg-A-eski-gozlem.txt`, `d6\neg\ayna-kurulum.txt` |
| **Negatif B — önceki yerel ucun TÜM paket baytları:** `git archive a3094a5b` aynası (ESKİ koşucu, ESKİ blok, ESKİ sahte API `0715DBB4…`) + yalnız R03-g öz-test | **95/102**, çıkış 1 — FAIL = tam olarak Z23-a, Z23-l, Z25-a, Z25-b, Z25-c, Z25-d, T-9 (7 = yeni 4 + değişen 3) | `d6\neg\neg-B-eski-paket.log`, `d6\neg\neg-B-eski-gozlem.txt` |
| **Negatif — blok:** uygulanmadı — blok öz-testinde yeni / değişen kalem yok (blokta yalnız pin + başlık notu değişti; PIN-1 her koşumda pin eşitliğini ölçer) | — | — |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `F511D5F9…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d6\test\pin-dogrulama-son.log`, `d6\test\parse-iki-kabuk-son.log` |

Eski davranış ölçüldü (`neg-A-eski-gozlem.txt`, `neg-B-eski-gozlem.txt`): Z23-a — `TJ` girdisi `SAYILMADI/T5`, `TJ-b-yok` T0, `TJ-pasif` T3, `TJ-artış` T6,
`T2-TIdışı-alt` ALTINDA notsuz; Z23-l — opaque token + guard kusur taklidi `ADAY/T2`; Z25-a — `SAYILMADI/T5` "… 200 beklenir — ürün bulgusu değil …"; Z25-c —
`recoverOpenAccessText` yok, Recover kurtarma nedeni "yeniden AÇILDI … : açık erişim KAPANMADI (bu Recover kapatamadı; …)"; Z25-d (2) — kapatma 201 + P6-C2
PASS iken `acikErisim` "… (bu Recover kapatamadı; …)"; T-9 — 4 girdili çağrı; Z25-b (yalnız ayna B) — eski sahte API opaque token'ı kabul etti: P6-04D 200,
gösterim yapıldı, P6-C4 200 → T5.

Yeni / değişen ölçütler: **Z25-a** (TJ uçtan uca, guard kusur taklidi; a = b = c, iki uç aktif — R03-f'de T5) · **Z25-b** (TJ ikizi, guard normal: dış zincir 401,
P6-C4L/D 401 PASS, productFinding yok) · **Z25-c** (G1 birim: `recoverOpenAccessText` 7 girdi + Recover modunda kurtarma nedeni iki dal) · **Z25-d** (G1 uçtan
uca, Z19-b makbuzu üzerinde iki Recover: kapatma 403 → "bu Recover kapatamadı" korunur; kapatma 201 + dış giriş ölçümünden sonra yeniden açma → "Recover
kapattı (…) ama erişim … yeniden açıldı …", "kapatamadı" yok) · **Z23-a** (33 girdi, 14 hücre; TJ, G4, G5 sıra girdileri) · **Z23-l** (T2 → TJ) · **T-9**
(5 girdili çağrı; Run iki girdiyi de `claimDurum`'dan kurar).

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. G1'in "hesap Recover başında zaten kapalıydı" ve "2xx dönmedi ama … kapalı ölçüldü" dalları yalnız birim
ölçümüyle (Z25-c) sınandı; uçtan uca ölçülen dal 2xx + yeniden açmadır (sahte API dış müdahale taklidi). TJ'nin uçtan uca ölçümü sahte API'nin opaque token'ıyla
yapıldı; ürünün JWT olmayan token verdiği bir durum bilinmiyor (ürün token'ı `jwtService.sign` ile JWT).

**Doğrulayıcıların bulgu SAYMADIĞI ama owner'a açık bilinen sınırlar.** (1) **TG ve TJ yalnız sahte API'de ölçüldü:** ürünün imzaladığı token'da claim DB'deki
tam sayıdır ve token JWT'dir (`portal.service.ts:438-446`) — canlıda bu iki hücrenin tutması pratikte beklenmez; sahte API'nin `badClaim` / `opaque` token'ları ve
guard normal taklidi ürünün kendisi değildir. (2) **Recover bitiş ekranı `acikErisim`'i göstermez** (önceki tasarım; değişmedi): bloğun Recover bitiş satırı yalnız
çıkış kodunu açıklar; açık erişim metni Recover kanıtındadır (`portalClose.acikErisim` ve kurtarma nedeni) — owner kanıtı okumadan Recover'dan sonra erişimin
açık kalıp kalmadığını ekranda görmez [**R04'te kapandı:** Recover bitiş ekranı artık "PORTAL ERİŞİMİ (son ölçüme göre …)" satırını gösterir — §13.9 (ii)]. (3) **B hücresinin bulgu metnindeki "portal erişimi kapatıldıktan" ifadesi** DB kapanışı HTTP ölçümlerinden önce ve sonra
ölçülmüşken (P6-C2 PASS + P6-C5 PASS) yazılır; kapanışın dayanağı (2xx kapatma çağrısı / hesap zaten kapalıydı / 2xx olmadan DB'de kapalı görüldü) bu metinde
ayrışmaz — P6-C1 gözlemindeki `dayanak=` alanındadır. Üçü de bu turda **değiştirilmedi** (kapsam dışı; owner kararı). B3 açık (değişmedi). Recover'da mevcut
oturum reddi (P6-C4) her zaman ölçülemez (değişmedi). Bu revizyon canlı Run/Recover'ı yetkilendirmez.

(4) **§10.2 madde 1** Recover yazma kümesini ürünün `disablePortalUser` etkileriyle anlatır ve bunları kapatma çağrısının 2xx dönmesine açıkça bağlamaz (onaylanmış metin; değiştirilmedi): 401/403'te ürün yazmaz (kaynak: `portal.service.ts` kapatma yolu yazmadan önce reddeder); sonuç Recover kanıtındadır (P6-C1 / P6-C2 satırları ve `portalClose.acikErisim`). D-7'deki eşdeğer sınır §14.8 (4)'tedir.

**R03-g ek (ana oturum, 2026-10-04).** R03-g bağımsız doğrulamasının (blocker / major yok) üç minor bulgusu: (a) bu bölümdeki G2 satırında kanıt yolu bir kaçış hatasıyla bozulmuştu (yol içinde sekme karakteri) — düzeltildi (`d6\test\g2-blok-olcum.txt`); (b) yukarıdaki (4) eklendi; (c) Run onay ekranındaki kapanış satırı koşulsuz bir yetenek gibi okunuyordu ("Kapanış: … portal hesabı pasif + sürüm artırılır, erişim kapalı, personel pasif, dosya CLOSED"); D-7 bloğundaki nitelemeyle aynı biçimde "Hedeflenen kapanış: … sonuç kanıttaki P6-C*, P6-FOREIGN-CLEAN ve U-CLOSE satırlarından okunur" oldu. Yalnız gösterilen metin değişti; blok `PkgPins`'te olmadığından `$ExpPackage` ve koşucu değişmedi; blok sha256'sı §6'da. Blok öz-testi (G-2 onay metni ölçütü dahil) iki kabukta yeniden koşuldu.

### 13.9 R04-recover-girdi — Recover girdisini blok yazar ve doğrular; Recover bitiş ekranı; 5xx gözlem metni (2026-10-04; owner kararı madde 5 + 6)

Kapsam (owner kararı 2026-10-04, madde 5 — üç iş, tek teslim): (i) ayrı Recover onayından sonra makbuzu **blok** yazar ve Recover başlamadan bütünlüğünü
doğrular; (ii) Recover bitiş ekranı portal erişimini **son ölçüme göre** AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir; (iii) ret ölçütlerinde 5xx gözlem metni ret
kanıtlanmadığını ve nedenin kesinleşmediğini söyler — **sonuç (verdict) ve çıkış kodları değişmedi**. Ayrı Recover onayı korunur; Run başarısız oldu diye otomatik
Recover **yoktur**. Canlı Run/Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi). Bu revizyon canlı Run/Recover'ı yetkilendirmez.
Taban: origin/main `549b8344`. **Bu aşamada koşucu öz-testi (`d6-selftest.js`) KOŞULMADI** (aşağıda "Ölçülmeyenler").

**(i) Yeni Recover girdisi — `-Mode Recover -RunEvidenceDir '<tamamlanmış Run kanıt dizini>'`.** `-ReceiptFile` yolu korunur; ikisi birlikte verilemez (DUR). Sıra:
salt okuma kapıları (değişmedi) → kalıntı kararı E/H (Recover'ın mevcut tek sorusu; değişmedi) → kaynak doğrulama → yazım → geri okuma → koşucu (Recover).
Makbuz, owner bu modu **ayrıca** başlatıp kalıntı kararını verdikten **sonra** yazılır; karar E/H değilse hiçbir şey yazılmaz.

| Adım | Blok ne yapar | Tutmazsa |
|---|---|---|
| Kaynak doğrulama (yazımdan ÖNCE) | Dizin adı `extacc-d6-live-<runId>-<zaman>`; `SHA256-MANIFEST.txt` var ve biçimli; manifestte `d6-evidence.json`, `owner-block.json`, `goref-consumed.json` satırları; **manifestteki her dosyanın** sha256'sı satırına eşit (dosya bir kez okunur; aynı baytlar hem özetlenir hem ayrıştırılır); kanıt kayıt türü Run kanıtı (`EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN` — Recover kanıtından makbuz çıkarılmaz); runId = dizin adı = makbuz = `owner-block.json` (mod Run) = `goref-consumed.json` = **GO defteri satırı** (GO sha256 + runId; kanıt dizininin dışında); `recovery.makbuzJson` dizge + JSON + Recover okuma kapısı alanları (kayıt türü, runId biçimi, `elevUserId`, `elevEmail`); kimlik alanları (`record`, `runId`, `tenantId`, `tenantSlug`, `foreignTenantId`, `clientId`, `foreignClientId`, `caseId`, `elevUserId`, `elevEmail`) kanıttaki `receipt` nesnesiyle eşit; `tenantSlug` = `ah-<runId>` | DUR (çıkış 90) — makbuz yazılmaz, kardeş dizin oluşmaz, Recover başlamaz; ekranda somut neden |
| Yazım | Hedef = Run kanıt dizininin **kardeşi** `<Run dizini>.recover-girdi-<UTC yyyyMMddTHHmmssZ>`; içinde `d6-setup-receipt-kanittan.json`. Dizin ya da dosya **zaten varsa DUR** (ezme yok; dosyalar yalnız "yeni oluştur" kipiyle açılır) | DUR — var olan dizin / dosya değişmez |
| Yazımdan sonra | Dosya bayt olarak **geri okunur** ve beklenen baytlarla karşılaştırılır; bloğun Recover okuma kapısı (`Get-ReceiptFileState`, `recovery.makbuzJson` metin eşitliği dahil) koşulur; `d6-evidence.json` ve `SHA256-MANIFEST.txt` sha256'sı **yeniden ölçülür** (önce = sonra); yanına `RECOVER-GIRDI-KAYDI.json` yazılır (kaynak dizin adı, kanıt adı + sha256, manifest sha256, manifest satırı, runId, yeni dosyanın sha256'sı / bayt sayısı, kodlama tanımı, bağımsız çapa durumu, zaman) | DUR — Recover başlamaz, başarı sayılmaz; hedef dizin **silinmez**, `RECOVER-GIRDI-KULLANILMAZ.txt` (neden) ile işaretlenir; yarım / doğrulanamamış makbuz yerinde kalır ve **`-ReceiptFile` ile verilse de reddedilir** (işaret dosyası varsa DUR). İşaret dosyası da yazılamazsa ekran bunu söyler (o durumda kodla zorlanamaz) |
| Recover | Koşucu yeni dosyayla çağrılır; `recover-*` kanıt dizini makbuzun yanında, yani **kardeş dizinde** açılır. Run kanıt dizinine ve manifestine **yazılmaz** | — |

**Kodlama tanımı (açık).** Yeni makbuz dosyasının baytları = `recovery.makbuzJson` **dizgesinin UTF-8 kodlaması**: BOM **yok**; satır sonları dizgede ne ise o (koşucunun
`JSON.stringify(…, null, 1)` çıktısı LF'dir; **dönüştürülmez**); sonda ek satır sonu **yok**. Geçersiz UTF-16 (eşlenmemiş vekil) ya da BOM karakteriyle başlayan dizge
yazılmaz (DUR). `RECOVER-GIRDI-KAYDI.json` ve `RECOVER-GIRDI-KULLANILMAZ.txt` de UTF-8 BOM'suzdur.

**Bağımsız çapa (ölçüldü — uydurulmadı).** Manifest ve kanıt **içeriği** için bağımsız çapa **yoktur**: bloğun Run kayıtları (`owner-block.json`, `goref-consumed.json`,
`owner-declaration.json`, GO defteri) manifest ya da kanıt özeti taşımaz; ilk üçü kanıtla aynı dizindedir ve aynı manifestle örtülüdür. GO defteri (kanıt dizininin
dışında) yalnız runId ↔ GO sha256 bağını taşır → **runId çapası** olarak doğrulanır. Sonuç: manifest kanıtla **birlikte** değiştirilirse bu doğrulama bunu
**yakalayamaz**; sınır ekrana ("SINIR: manifestin bağımsız çapası YOK …") ve `RECOVER-GIRDI-KAYDI.json`'a (`bagimsizCapa`) yazılır. Yeni dosyanın yanındaki iki özetin
eşitliği kaynak bütünlüğü kanıtı sayılmaz; kaynak bağı manifest + runId / kimlik bağı + GO defteri satırıdır.

**Run sonu ekranı (çıkış 5/6).** Kanıtta makbuz metni (`recovery.makbuzJson`) varsa elle komut yerine `-Mode Recover -RunEvidenceDir '<kanıt dizini>'` gösterilir
(somut yol; "AYRI owner onayıyla, BİR KEZ", "otomatik DEĞİL"; blok Recover'ı kendiliğinden başlatmaz); kanıt dizinindeki makbuz dosyasının durumu (VAR … EŞİT / YOK /
OKUNAMIYOR / BAYAT) bilgi olarak yazılır ve "-ReceiptFile ile VERMEYİN" denir (Recover makbuzu yerinde yeniden yazabilir ve `recover-*` dizinini makbuzun yanında açar —
§10.3). Kanıtta makbuz metni yoksa R03-d dalları aynen (dosya okunabiliyorsa `-ReceiptFile <makbuz>` önerisi; değilse SOMUT ENGEL). Koşucunun kanıta yazdığı kurtarma
adımı metni (elle TEK komut) **değişmedi**; bloğun öneri yolu artık o komut değildir.

**(ii) Recover bitiş ekranı.** Kod açıklamalarından ayrı tek satır: `PORTAL ERİŞİMİ (son ölçüme göre, bu Recover'ın kanıtından; DB durumu): <durum> — <ölçülen>.
Yeni giriş reddi kanıttaki P6-C3L/D satırlarından okunur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ.` Son ölçüm sırası: HTTP ölçümlerinden sonraki DB okuması
(`afterMeasure`, P6-C5) → kapatma adımından sonraki (`after`, P6-C2) → Recover başındaki (`before`).

| Durum | Koşul (Recover kanıtındaki `portalClose`) | Gösterilen |
|---|---|---|
| AÇIK | son ölçümde `isActive=true` | "portal hesabı AKTİF (isActive=… hasPortalAccess=… sürüm=…; son ölçüm: …)" + varsa "kanıttaki açık erişim metni: …" (`acikErisim`) |
| AÇIK | son ölçümde hesap pasif, `hasPortalAccess=true` | "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)" (koşucunun `isOpenAccess` / `openStateTxt` ayrımı) |
| KAPALI | son ölçümde hesap pasif + bayrak kapalı | "hesap pasif + müvekkil erişim bayrağı kapalı (…)" |
| KAPALI | son ölçümde hesap satırı yok | "portal hesabı satırı DB'de YOK (hasPortalAccess=…; son ölçüm: …)" |
| ÖLÇÜLEMEDİ | Recover kanıtı okunamıyor (yok / kayıt türü / exitCode farklı) · `portalClose` yok · geç oluşma dışlanamadı · kapanış adımı hatası (DB değeri yok) | somut neden |

Mevcut kod açıklamaları ve "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" satırı korunur; çıkış kodu değişmez. §13.8 "bilinen sınır (2)" (Recover bitiş ekranı
`acikErisim`'i göstermez) bu değişiklikle **kapandı**.

**(iii) 5xx gözlem metni (koşucu).** Ret ölçütlerinde (yeni giriş P6-C3L/D — `judge401`; mevcut oturum P6-C4L/D — `judgeSession`) 503 / 429 **dışındaki** 5xx gözlemi artık
"HTTP <kod> — ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" (`rejectObs`; önce yalnız "HTTP <kod>"). Değişmeyenler: verdict (401 beklenirken 401
gelmedi → FAIL), 503 / 429 → ÖLÇÜLEMEYEN ("neden UNKNOWN"), çıkış kodu fonksiyonları ve öncelik, kanıttaki `revision` (`R03`), `sessionVersion` / `productFinding` (5xx'te
yazılmaz — değişmedi). Diğer 5xx gözlemleri (yükleme, liste, indirme, kapsam dışı 404, kapatma çağrıları) owner kapsamında **değil** — dokunulmadı.

**Öz-testler ve negatif kontrol (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-d7-recover-hazirlik\asama1\` (`d6\test\`, `d6\neg\`, `taban\`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d6-owner-block-selftest.ps1` — son baytlar (blok `054CB962…`, blok öz-testi `9F6879F5…`, koşucu `74C49509…`) | **92/92 PASS** Windows PowerShell 5.1 · **92/92 PASS** PowerShell 7 (PIN-1 9/9, digest `DF36BC1B…` = `$ExpPackage`); 83 − 1 (O-15 kaldırıldı) + 10 (RG-1 … RG-10) = 92; O-13 değişti | `d6\test\blok-oz-test-son-winps51.log`, `d6\test\blok-oz-test-son-pwsh7.log` (`son-sha-once.txt` = `son-sha-sonra.txt`: koşum sırasında dosya değişmedi) |
| **Negatif — blok:** `git archive 549b8344` (origin/main) aynası (ESKİ blok `194816C5…`, ESKİ koşucu `191C6B2F…`) + R04 blok öz-testi | **81/92**, çıkış 1 — FAIL = tam olarak O-13, RG-1, RG-2, RG-3, RG-4, RG-5, RG-6, RG-7, RG-8, RG-9, RG-10 (11), iki kabukta aynı küme; PIN-1 PASS (aynada eski pin + eski koşucu tutarlı) | `d6\neg\neg-eski-blok-winps51.log`, `d6\neg\neg-eski-blok-pwsh7.log`, `d6\neg\ayna-kurulum.txt`, `d6\neg\neg-blok-sha.txt` |
| Taban (değişiklik öncesi, origin/main baytları) | 83/83 PASS iki kabukta | `taban\d6-blok-oz-test-taban-winps51.log`, `taban\d6-blok-oz-test-taban-pwsh7.log`, `taban\taban-sha256.txt` |
| `d6-selftest.js` (koşucu öz-testi; T-11 yeni → 103 kalem) | **bu aşamada KOŞULMADI** (Postgres açılmadı; ağır koşu yuvası verilmedi) — sonraki aşamada koşulacak; sonucu buraya eklenecek | — |
| T-11'in ifadeleri (ad-hoc; Postgres / sahte API gerekmez; **öz-testin kendisi değildir**) | yeni koşucu baytlarında (`74C49509…`) TUTTU; origin/main koşucu baytlarında (`191C6B2F…`) TUTMADI (`rejectObs` yok; eski yalın son dal 2) | `d6\test\t11-adhoc-yeni-kosucu.log`, `d6\neg\t11-adhoc-eski-kosucu.log`, `d6\test\t11-adhoc.js` |
| Koşucu öz-testinin bloğa bakan statik kalemlerinin (T-3 … T-6) ad-hoc eşdeğeri (**öz-testin kendisi değildir**) | TUTTU — pin listesi = koşucunun require ağacı + `d6-qr-test.js`; BOM / `exit $rc` / finally; Preflight dalı yazmaz; Run kapıları | `d6\test\blok-statik-adhoc-son.log`, `d6\test\blok-statik-adhoc.js` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `DF36BC1B…` = `$ExpPackage`; iki ps1 ayrıştırma hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, koşucu öz-testi, sahte API, qr-test) 0, iki ps1 UTF-8 BOM'lu, satır sonu LF | `d6\test\pin-dogrulama-son.log`, `d6\test\parse-iki-kabuk-son.log` |

Yeni / değişen blok öz-testi ölçütleri (her ret kalemi **somut neden metnini** ister; kaynak sahte koşucuyla GERÇEK `Invoke-RunMode`'un ürettiği Run kanıt dizinidir, ret
kalemleri onun kopyalarında koşar): **RG-1** geçerli çıkarma — hedef kardeş dizinde, baytlar = sahte koşucunun yazdığı makbuz metni (tarih biçimli alan + ASCII dışı
karakter + ters bölü dahil), BOM yok, yalnız LF, ek satır sonu yok, kayıt dosyası doğru, Run dizini (dosya adları + her dosyanın sha256'sı) ve manifest değişmedi,
Recover yeni dosyayla başladı, GERÇEK koşucunun `readReceiptForRecover` kapısı "ok" · **RG-2** değiştirilmiş kaynak (makbuzJson / manifest satırı / başka dosya →
"manifest uyuşmuyor"; yazım sırasında kaynak değişirse "yazım sırasında DEĞİŞTİ" + işaret) · **RG-3** bozulmuş / yanlış koşuma ait makbuz, Recover kanıtı, dizin adı,
JSON olmayan metin, makbuz olmayan kayıt · **RG-4** kimlik alanı (beş alan + türetilen slug + başka koşumun blok kaydı) · **RG-5** eksik kaynak (dizin, dosya yolu,
kanıt, manifest, manifest satırları, makbuzJson, GO defteri satırı) · **RG-6** ezme yok (hedef dizin / aynı adlı dosya; "yeni oluştur" var olan dosyada istisna) ·
**RG-7** yazma hatası (gerçek ACL reddi; kısmi yazım, kayıt yazımı ve işaret yazımı taklitleri) · **RG-8** geri okuma uyuşmazlığı taklitleri + işaretli dizindeki sağlam
makbuzun `-ReceiptFile` ile de reddi · **RG-9** Recover bitiş ekranı (AÇIK ×2, KAPALI ×2, ÖLÇÜLEMEDİ ×4) · **RG-10** çift kaynak reddi, karar yazımdan önce, statik
(sıra; Run'da otomatik Recover yok; silme / üzerine yazma çağrısı yok; kodlama tanımı kaynakta) · **O-13** (değişti) Run sonu ekranı yeni seçeneği gösterir · O-15
kaldırıldı (blok artık elle TEK komutu göstermez; makbuzu blok yazar → RG-1 iki kabukta).

**Ölçülmeyenler / sınır.** (1) **Koşucu öz-testi koşulmadı:** T-11 öz-test içinde koşulmadı; mevcut 102 kalemin yeni koşucu baytlarında geçtiği ölçülmedi; sahte API kaynağında ret
ölçütünün ucuna (portal girişi / belge listesi) 503 dışında 5xx döndüren bir senaryo anahtarı **görülmedi** (500 yalnız yasak uç, oluşturma, kapatma ve işleyici hatasında) —
5xx metni uçtan uca ölçülmedi (birim + statik ifade ad-hoc ölçüldü). (2) **Gerçek
koşucu kanıtıyla çıkarma ölçülmedi:** blok öz-testi sahte koşucunun kanıtını kullanır (alan adları koşucu kaynağından: `record`, `runId`, `receipt`,
`recovery.makbuzJson` = makbuzun `JSON.stringify(…, null, 1)` metni); gerçek koşucunun ürettiği `d6-evidence.json` ile `-RunEvidenceDir` uçtan uca koşulmadı. (3) Manifestin
bağımsız çapası yok (yukarıda). (4) `-RunEvidenceDir` yalnız manifesti yazılmış (tamamlanmış) Run kanıt dizini içindir; manifest yoksa bu yol kapalıdır ve yalnız
`-ReceiptFile` yolu kalır (o yol §10.3'teki gibi Run dizinini değiştirir). (5) Recover, kardeş dizindeki makbuz kopyasını yerinde yeniden yazabilir (§10.3);
`RECOVER-GIRDI-KAYDI.json`'daki `makbuzSha256` yazım anındaki (Recover'dan önceki) değerdir. (6) İkinci bir çıkarma / ikinci Recover kodla **engellenmez** (her çıkarma yeni
zaman damgalı kardeş dizin açar; ikinci Recover bu paketle tanımlı değildir, owner kararı gerektirir — değişmedi). (7) PORTAL ERİŞİMİ satırı bir DB durumudur; HTTP reddi
kanıt satırlarından okunur; mevcut oturum reddi Recover'da ölçülemez (değişmedi). (8) Canlıda hiçbiri koşulmadı; B3 açık (değişmedi).
