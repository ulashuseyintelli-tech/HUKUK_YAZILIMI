# OFFICE BÜTÜNSEL CANLI TESLİM PLANI — R01

```text
Kimlik        : OFFICE-BUTUNSEL-CANLI-TESLIM-PLANI-R01
Tarih         : 2026-09-08
Ölçüm tabanı  : main = ddcd4aba9a7f431c41c39e8a6092476326b7d5b1 (#2553) · açık PR 0
Canlı         : RELEASE20 @ 08ce8e2559b4d1d67fcee245413de510209507f3 · BUILD_ID LW4jlJUOMHrvVEqakKB3i
Rollback      : RELEASE19 @ a60d772b6c53ece6bc23b77821a2921ab0ec7942
Rol           : OFFICE'in TEK teslim planı. Paralel kayıt sistemi veya ikinci ana plan DEĞİLDİR;
                mevcut kayıtları (ODM, product-backlog, decision-log, O-serisi kabulü) DEVRALIR.
Yetki         : Owner GO 2026-09-08 (bütünsel canlı teslim). Mevcut mühür / tek-kullanım yetki /
                yürütücü kontrolleri KALDIRILMAZ; cutover koşumu OFFICE/C33 yürütücü hattındadır.
```

## 1. Yöntem

Teslim başlıkları dosya veya kusur numarasından değil, **kullanıcının aldığı gerçek hizmetten**
türetildi: `origin/main` üzerindeki OFFICE controller yüzeyi ölçüldü — 5 controller, **46 rota**
(`office` 17 · `lawyers` 9 · `office-approvals` 8 · `staff` 6 · `reporting-lines` 6). Bunlar
kullanıcıya görünen **12 hizmete** indirgendi. Yeni özellik siparişi üretilmedi.

"İş/hukuki karar" sütunu **mevcut owner kararını ve ürünün uyguladığı kuralı** gösterir. Test
başarısından genel hukuka uygunluk sonucu ÇIKARILMAZ.

## 2. TESLİM TABLOSU — 12 hizmet

Kısaltmalar: **F01** = `OfficeF01AuthorizationGuard` · **JWT** = `JwtAuthGuard` ·
**ADM** = `AdminGuard` · kabul kanıtı O-n = `OFFICE-O-SERIES-ACCEPTANCE-CLOSED-R01` (PR #2545,
`b9d8094a`), canlı RELEASE20 `08ce8e25` üzerinde ölçüldü.

| # | Hizmet ve kullanıcı sonucu | Kim / tenant / onay | İş-hukuki karar ve sınırı | Kod+config | Canlıda? | Kabul kanıtı (sürüm/kapsam) | Kalan iş |
|---|---|---|---|---|---|---|---|
| **S-01** | **Büro kimlik ve profili** — büronun adı, iletişim ve kimlik bilgilerini görüntüle/güncelle (`GET/PUT /office`) | F01-yetkili aktör; tenant kendi bürosu; onay yok | F01 yetki modeli (OFFICE-SC-F01, #2076) + S2 alan-minimizasyonu (F-B01-03 CLOSED, #2547) | MERGED, ek config yok | ✅ RELEASE20 | **O-2/O-4/O-5** — staff 403, anonim 401, yetkili 200 ve `tckn`/`iban`/`uyapToken` sızıntısı YOK. Kapsam: **yalnız GET** | **A-03** (PUT yazma kabulü) |
| **S-02** | **Banka hesapları** — büro hesaplarını ekle/güncelle/sil (`POST/PUT/DELETE /office/bank-accounts`) | F01-yetkili; tenant kendi bürosu | F01 yetki + finansal veri minimizasyonu (F-B01-03) | MERGED | ✅ RELEASE20 | **Dolaylı** — F01 guard artefaktı canlı dist'te doğrulandı; yazma yolu için **doğrudan canlı kabul YOK** | **A-03** |
| **S-03** | **E-posta (SMTP) yapılandırması** (`GET/PUT /office/smtp-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki + secret maskeleme (`smtpPass` MASKED/NULL) | MERGED; canlı SMTP mevcut (F05 kaydı) | ✅ RELEASE20 | **O-1/O-3/O-5** — 403 / 200 / 401; `smtpPass` maskeli veya null | **A-03** |
| **S-04** | **SMS yapılandırması** (`GET/PUT /office/sms-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki + secret maskeleme (`smsApiKey`, `smsApiSecret`) | MERGED; **SMS sağlayıcı NOT_CONFIGURED** (F05 kaydı) | ✅ rota / ⚠️ sağlayıcı yok | **O-1/O-3/O-5** | **A-03** · sağlayıcı yapılandırması **B-04** |
| **S-05** | **Karşılama (greeting) ayarları** (`GET/PUT /office/greeting-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki | MERGED | ✅ RELEASE20 | **O-1/O-3/O-5** | **A-03** |
| **S-06** | **İİK-78 ayarları** — icra takibinde İİK m.78 davranış parametreleri (`GET/PUT /office/iik78-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki + ürünün uyguladığı İİK-78 parametreleri (owner ürün kararı; **genel hukuki uygunluk iddiası ÜRETİLMEZ**) | MERGED | ✅ RELEASE20 | **O-1/O-3/O-5** | **A-03** |
| **S-07** | **Vekalet süre-dolumu bildirimi ayarları** (`GET/PUT /office/poa-expiry-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki + S2 omit (`poaExpiryRecipientLawyerIds` yanıtta YOK) | MERGED | ✅ RELEASE20 | **O-3** — EXACT 2 anahtar, S2 alanı YOK | **A-03** |
| **S-08** | **Eskalasyon ayarları** — onay/görev eskalasyon kuralları (`GET/PUT /office/escalation-settings`) | F01-yetkili; tenant kendi bürosu | F01 yetki + S2 omit (3 alan) + eskalasyon motoru kuralları | MERGED | ✅ RELEASE20 | **O-3** (EXACT 9 anahtar, S2'siz) · **O-7** (canlı DOM: 12/12 alıcı kutusu disabled, "Atanan sorumlu" = "—") · **O-9** (`/client-notifications/overview` 200, `escAssignees` YOK) · **O-10 yalnız gözlem** | **A-03** · `escAssignees` iç tüketici residual'ı **B-02** |
| **S-09** | **Avukat yönetimi** — ekle/güncelle/sil, sıra ve varsayılanlar (9 rota `/lawyers`) | F01-yetkili; tenant kendi bürosu; yetki/rütbe alanları K1-4b/H2 aktörüne kilitli | F01 yetki · **CANDIDATE-F1** liste maskeleme (WAVE 3 RATIFIED) · **P01** credential omit (`uyapToken`, `eSignatureSerial`) · **#2511** yazma sınırı (kimlik/ilişki/nested reddi; aynı-boolean `isActive` kabul-ama-yazma) | MERGED (#2511 canlıda) | ✅ RELEASE20 | **O-4-LAWYER** — `/api/lawyers/:id` 200, sızıntı YOK (id yetkilinin kendi listesinden keşfedildi) · #2511 regresyonu 55+242+81 PASS (**depo içi**, canlı kabul değil) | **A-04** |
| **S-10** | **Personel yönetimi** — ekle/güncelle/sil, sıra (6 rota `/staff`; liste/detay JWT, yazma F01) | Liste/detay oturumlu kullanıcı; yazma F01-yetkili; tenant kendi bürosu | F01 yetki (yazma) · staff liste maskeleme · #2511 `isActive` sınırı | MERGED | ✅ RELEASE20 | **Dolaylı** — staff aktörü O-1/O-2'de *yetkisiz taraf* olarak kullanıldı; **hizmetin kendi kabulü YOK** | **A-05** (okuma) + **A-04** (yazma) |
| **S-11** | **Raporlama hattı** — büro hiyerarşisi: atama, sonlandırma, üst-düzey, uzlaştırma (6 rota `/reporting-lines`) | **Yalnız ADMIN** (`AdminGuard`); tenant kendi bürosu | ReportingLine Population Core (CAP-02 object-scope) · **D-WR-6 FOUNDER = `ANY_ONE`** (FOUNDER kimliği ReportingLine'dan bağımsız) | MERGED | ✅ RELEASE20 | **YOK** — RELEASE20'de canlı kabul kanıtı bulunmadı | **A-06** |
| **S-12** | **Büro onay akışı** — onay kutusu; onayla / reddet / revizyon iste / değişiklikle onayla / iptal (8 rota `/office-approvals`) | Oturumlu aktör; onay yetkisi `isApproverEligible` (PARTNER/yetkili avukat); tenant kendi bürosu | **ADR-009 tek onay motoru** · P4 approval-record zorunluluğu · **OD-12/OD-13 OPTION B** (çoklu seviye tek kişi / delegasyon delegatörü aşamaz) | MERGED; FE PR #823 + #832 (P4-6 DONE) | ✅ RELEASE20 | **Dolaylı** — P4 umbrella `CLOSED_WITH_RECORDED_RESIDUALS` (C23) · F04 KABUL-A2 canlı koşumunda `OFFICE_APPROVAL_EXECUTION_SUCCEEDED` ölçüldü (#2549) · **hizmetin kendi kabulü YOK** | **A-07** |

**Z (teslim kapsamındaki hizmet) = 12** · bugün doğrulanan **Y = 8** (S-01, S-03…S-09 okuma/yetki
yüzeyi) · doğrudan kabulü olmayan = 4 (S-02 yazma yolu, S-10, S-11, S-12).

## 3. LİSTE A — bu sürümün teslimi için ZORUNLU işler (N = 7)

| ID | İş | Bağımlılık | Sorumlu hat | Ölçülebilir kapanış koşulu |
|---|---|---|---|---|
| **A-01** | **F-B01-04 onarımını canlıya al** — `#2553 ddcd4aba` (ham `Office` satırı modül sınırını geçmez) RELEASE20'de YOK. Yeni aday + cutover | — | OFFICE/C33 yürütücü (mevcut mühür ve tek-kullanım yetki kuralları geçerli) | Canlı API+Web kaynak SHA = yeni aday; `office-identity-boundary-fb0104` + cross-module static-guard canlı dist'te doğrulandı; rollback hedefi RELEASE20 |
| **A-02** | **OFFICE yazma kabul paketi** — sentetik tenant sözleşmesi: önceden belirlenmiş veri, tam yazma envanteri, korunacak kayıtlar, erişim kapatma (`revoke-access`), durma koşulları | — | PAGE-O0 hazırlık | Paket dokümanı + betikler; disposable provası PASS; canlı yazma 0 |
| **A-03** | **Ayar yüzeyi PUT yazma kabulü (O-8)** — S-01…S-08 | A-01, A-02 | OFFICE kabul hattı | 8 yüzeyde PUT 2xx + yalnız hedef alan değişti + S2/secret sızıntısı 0 + izlenen tenant'larda fark 0 |
| **A-04** | **Avukat + personel yazma kabulü** — S-09/S-10 (#2511 sınırları canlıda) | A-02 | OFFICE kabul hattı | create/update/delete/order 2xx; kimlik/ilişki/nested reddi 4xx; aynı-boolean `isActive` kabul-yazma-yok; gerçek geçiş ve geçersiz tip red |
| **A-05** | **Personel okuma kabulü** — S-10 kendi rolüyle liste/detay | A-01 | OFFICE kabul hattı | Yetkili 200 + maskeleme kuralı; yetkisiz 403; anonim 401 |
| **A-06** | **Raporlama hattı canlı kabulü** — S-11 (ADMIN) | A-01 | OFFICE kabul hattı | ADMIN 200 (list/eligible/reconciliation); ADMIN-dışı 403; anonim 401; yazma (assign/end/top-level) sentetik tenant'ta |
| **A-07** | **Onay akışı canlı kabulü + teslim kaydı** — S-12 ve teslim tablosunun register'a işlenmesi | A-01…A-06 | OFFICE kabul hattı + PAGE-O0 | inbox/mine 200; yetkisiz aktörde 403; approve/reject sentetik tenant'ta ADR-009 tek motor izi; ODM + product-backlog + decision-log kaydı |

**N = 7 SABİTTİR.** Yeni bulunan iş otomatik eklenmez; yalnız teslim hizmetini bozan gerçek hata,
güvenlik/veri bütünlüğü sorunu veya zorunlu bağımlılık **kapsam değişikliği** olarak kaydedilir.

## 4. LİSTE B — sonraki sürüm ve bu sürümün AÇIK sınırları

| ID | Kalem | Neden bu sürümde değil |
|---|---|---|
| B-01 | **OFF-P2-CAP-07** — alan-düzeyi izin taşıyıcısı / hassas veri unmask yönetimi | `BLOCKED_BY` field-level unmask governance kararı — **owner ürün kararı eksik** (`OFFICE-PHASE2-MASTER-SYNTHESIS.md:121`) |
| B-02 | **`escAssignees` S2-türevi residual** — iç tüketicide ADMIN-gate arkasında sayaç | HTTP okuma yüzeyinden #2535 ile kaldırıldı; iç tüketici kalemi ayrı ürün kararı |
| B-03 | **F-B01-05** — `Lawyer.uyapToken` "// Şifrelenmiş" yorumu kod karşılıksız | Yazan servis yolu YOK, DB doluluğu 0 → kullanıcı hizmetini etkilemez; kayıt amaçlı düşük öncelik |
| B-04 | **SMS sağlayıcı yapılandırması** (S-04) | Canlıda `NOT_CONFIGURED`; sağlayıcı seçimi ve sözleşmesi **owner ürün kararı** |
| B-05 | **O-10 eskalasyon motoru davranış kabulü** | Salt-okuma sayım teslimi kanıtlamaz; ayrı gözlem penceresi tasarımı ister |
| B-06 | **Preflight `SilentlyContinue`** (`Invoke-OwnerPreflight.ps1:246-248`) | Yayın aracı kusuru; kullanıcı hizmetini etkilemez — OFFICE/C33 hattı, owner kararı |
| B-07 | **Vitest flake** (`settings-clients-address-guard-i01`) | CI altyapısı; ayrı takip (owner kararı) |
| B-08 | **WR01 ürün genişlemesi** (B02 Aşama 5+, B03…B10) | Ayrı product extension; P8 hükmüyle bu teslimi bekletmez |

**Bu sürümün açıkça belirtilen sınırları:** alan-düzeyi unmask yönetimi yok (B-01); SMS gönderimi
yapılandırılmamış (B-04); eskalasyon motorunun davranışsal kabulü yok — yalnız ayar yüzeyi kabul
edildi (B-05); `escAssignees` iç sayacı duruyor (B-02).

## 5. Devralınan kanıtlar — YENİDEN uygulanmayacak / test edilmeyecek

| Kanıt | Kapsam | Neden devralınıyor |
|---|---|---|
| O-1…O-7, O-9 (PR #2545 `b9d8094a`) | RELEASE20 `08ce8e25` okuma/yetki yüzeyi | Canlı ölçüm; ölçüm aracı sha `CB0FD506…`, yerel fixture 27/27 |
| F-B01-03 CLOSED (PR #2547 `649334a2`) | GET yetki asimetrisi + S2 omit | Owner ratifiye; O-1/O-3/O-6 kanıtına bağlı |
| #2511 regresyonu (55 + 242 + 81) | Avukat/personel yazma sınırı — **depo içi** | Kod yüzeyi kanıtı; canlı kabul A-04'te |
| F-B01-04 depo regresyonu (85 suite / 1476 test) | Modül sınırı — **depo içi** | Canlı kabul A-01 sonrası |
| P4 umbrella / F03 / F04 (C23; #2414 + #2416) | Onay motoru + E2E | Terminal kayıtlı; yalnız A-07 canlı yüzeyi ölçülecek |

**Son değişikliğin etkilediği kabul:** #2553 `office.service.ts` modül sınırını değiştirdi →
S-01 ve S-09'un **okuma** kabulü (O-4, O-4-LAWYER) A-01 sonrası **yenilenecek**; diğer O-kalemleri
etkilenmez (ayar yüzeylerine dokunulmadı).

## 6. Bitiş çizgisi

1. A-01…A-07 kanıtla tamamlanmış. 2. On iki hizmet hedef canlı sürümde mevcut. 3. Rol, tenant,
yapılandırma ve kullanıcı akışı kabulleri geçmiş. 4. Devralınan ve yeni kanıtlar bu tabloda bağlı.
5. Teslimi engelleyen açık kusur veya belirsiz işlem sonucu yok. 6. Release/rollback kanıtları,
kayıtlar ve işe ait temizlik tamam.

**Bu plan yeni yetki üretmez.** Cutover koşumu, tek-kullanımlık mühür/authority ve yürütücü
kontrolleri aynen geçerlidir. Gerçek müşteri verisine test yazımı ve gerçek alıcıya test gönderimi
YASAKTIR; yazma kabulleri yalnız izolasyonu doğrulanmış sentetik tenant'ta yapılır.

---

## 7. Ek — R01 sonrası ölçülen güncellemeler (append-only)

**A-02 paketi üretildi:** `office-delivery-r01/OFFICE-YAZMA-KABUL-PAKETI-R01.md` — sentetik tenant
`off-acc-<runId>`, 7 satırlık atomik kurulum, F01 yetki sözleşmesi (koddan ölçüldü), A-03…A-07
ölçütleri, korunacak kayıtlar, `revoke-access` kapanışı ve fail-closed durma koşulları.

**B-03 yeniden sınıflandırma:** `F-B01-05` kaleminin plan R01'deki öncülü ("yazan servis yolu yok,
düşük öncelik") **bayat çıktı**. `#2555 fa1e3bb2` ölçümü: `POST /api/lawyers` gövdesi DTO sınıfı
değil satır-içi tip literali ile tiplenmişti; tip runtime'da silindiği için global `ValidationPipe`
(whitelist + forbidNonWhitelisted) metatype `Object` görüp çalışmıyordu ve gövde
`prisma.lawyer.create({ data: { ...data } })` içine geçiyordu — **credential/tenant enjeksiyonu**.
Onarım main'de (`create-lawyer.dto.ts` + controller + service allow-list; `uyapToken` şema yorumu
düzeltildi). Kalem B listesinden çıkarılıp **A-01'in yüküne alınmıştır**; kapatılmamıştır,
canlı kabulü A-01 ile birlikte yapılacaktır. **N = 7 DEĞİŞMEDİ.**

**A-01 aday kimliği (ölçüldü):** aday `93f04f67`, canlı `08ce8e25`'ten 19 commit ileri; kod 26 dosya
`+1016/−69`; **yeni migration 0** (şema değişimi yalnız yorum); veri etkisi yok; rollback hedefi
RELEASE20 `08ce8e25`; beklenen kesinti R23/R20 emsaliyle 13,7–14,7 s mertebesi (garanti değil).
Etkilenen hizmetler: **S-01** (projeksiyon sınırı) ve **S-09** (create yazma sınırı); diğer on
hizmetin kod yüzeyi değişmedi.

## 8. GÖREV ATAMASI ve SABİT YAYIN ADAYI (owner ataması 2026-09-08, append-only)

Owner ataması bu bölümle kanonikleşir: **ana yürütücü = "Avukat personel analiz dosyası"**
(kanonik plan, kapsam, görev dağılımı, bağımlılık, ilerleme, nihai teslim).
**Uygulayıcı sayfalar = "OFFICE 33"** ve **"OFFICE 33-F04"**. Önceki "OFFICE 33 tek ana yürütücüdür"
ataması bu kayıtla düzeltilmiştir; teslim hedefi ve yetkisi korunur.

### 8.1 A-01…A-07 — her kaleme TEK sorumlu

| ID | Sorumlu sayfa | Neden bu sayfa | Bağımlılık |
|---|---|---|---|
| **A-01** yayın adayı + cutover | **OFFICE 33** | C33 yayın makinesi (paket, mühür, tek-kullanımlık yetki, rollback) bu sayfada; ikinci başlatıcı yaratılmaz | — |
| **A-02** yazma kabul paketi | **Ana yürütücü** — ✅ **TAMAMLANDI** (#2556 `db2f52f3`, CI 9/9) | Sözleşme/ölçüt üretimi ana yürütücüde | — |
| **A-03** ayar yüzeyi PUT kabulü (S-01…S-08) | **OFFICE 33-F04** | Canlı kabul koşum uzmanlığı (sentetik tenant, gerçek HTTP, fail-closed ölçüm, teardown) bu sayfada | A-01, A-02 |
| **A-04** avukat + personel yazma kabulü (S-09/S-10) | **OFFICE 33-F04** | Aynı koşum düzeneği; A-03 ile aynı sentetik tenant oturumunda yürür | A-01, A-02 |
| **A-05** personel okuma kabulü (S-10) | **OFFICE 33-F04** | A-03/A-04 ile aynı koşumda ölçülür; ayrı sayfa açmak ikinci başlatıcı üretir | A-01 |
| **A-06** raporlama hattı kabulü (S-11) | **OFFICE 33-F04** | ADMIN yüzeyi; yazma adımları aynı sentetik tenant sözleşmesine tabi | A-01 |
| **A-07** onay akışı kabulü (S-12) | **OFFICE 33-F04** | Yazma içerir (approve/reject); A-02 paketinin `actionCode` kuralına tabi | A-01…A-06 |

**Nihai teslim kaydı** (teslim tablosu + register) **ana yürütücünün** görevidir; A-07'nin kanıtı
üzerine kurulur ve ayrı bir A-kalemi DEĞİLDİR. **N = 7 korunur.**

**Sayfalar arası kural:** aynı dosyada ikinci yazıcı, aynı canlı işlemde ikinci başlatıcı YOK.
A-02 paketi ve tamamlanmış işler yeniden üretilmez. Uygulayıcılar kanıtı ana yürütücüye iletir;
sıradaki adımı ana yürütücü başlatır. Meslektaş mesajı yeni owner yetkisi ÜRETMEZ.

### 8.2 SABİT YAYIN ADAYI

```text
ADAY SHA (SABİT)  d2223e78fd98af647968dd2bd6161c6b13314746
CANLI             RELEASE20 08ce8e2559b4d1d67fcee245413de510209507f3 · BUILD_ID LW4jlJUOMHrvVEqakKB3i
ROLLBACK          RELEASE20 08ce8e25 (preimage 3 dosya byte-eşit doğrulanmıştı)
```

"veya fresh main" ifadesi **KULLANILMAZ**; aday yukarıdaki SHA'dır. Doğrulama (2026-09-08):

| Onarım | Ancestry | İçerik kanıtı |
|---|---|---|
| **F-B01-04** `ddcd4aba` (#2553) | ✅ adayın atası | `office.service.ts` içinde `getOfficeIdentity` mevcut; modül-dışı tüketiciler bu dar projeksiyona bağlı (`client-approval`, `client-intake-link`, `client-statement` ×3, `client-settlement`) |
| **F-B01-05** `fa1e3bb2` (#2555) | ✅ adayın atası | `lawyer/dto/create-lawyer.dto.ts` mevcut (33 dekoratör/sınıf satırı); `tenantId`/`officeId`/`uyapToken` sunucu denetiminde, gövdeden gelen `tenantId`'nin güvenilen değeri ezmesi kapandı |

Adayın canlıya göre **çalışma zamanı** farkı yalnız üç commit'tir: #2552 (CLIENT `reasonCode`),
#2553, #2555. #2554/#2556/#2557/#2558 `project/apps` altına **dokunmaz** (docs/spec/script).
**Yeni migration 0**; `schema.prisma` değişimi yalnız yorum. **Veri etkisi yok.**

### 8.3 Devralınan kabuller — hizmet/sürüm bazında

| Kabul | Hizmet | Geçerli olduğu sürüm | Aday `d2223e78` karşısında |
|---|---|---|---|
| O-1, O-2, O-5 (403/401 yetki negatifleri) | S-01…S-08 | RELEASE20 `08ce8e25` | **Etkilenmedi** — F01 guard bağı değişmedi; yeniden koşulmaz |
| O-3 (yetkili GET, S2 omit, secret maskeleme) | S-03…S-08 | RELEASE20 | **Etkilenmedi** — ayar yüzeyi dokunulmadı; yeniden koşulmaz |
| O-6 (DB ayak izi fark 0) | tümü | RELEASE20 · o kabul penceresi | **Pencere-bağlı**; yeni koşumun kendi penceresi ölçülecek |
| O-7 (canlı DOM, 12/12 disabled) | S-08 UI | RELEASE20 | **Etkilenmedi** |
| O-9 (`/client-notifications/overview` 200, `escAssignees` yok) | S-08 türevi | RELEASE20 | **Etkilenmedi** (#2557: kod tabanında `escAssignees` sıfır referans) |
| **O-4** (`/api/office` sızıntı yok) | **S-01** | RELEASE20 | **ETKİLENDİ** — #2553 tam bu projeksiyonu değiştirdi → **A-01 sonrası YENİLENİR** |
| **O-4-LAWYER** (`/api/lawyers/:id` sızıntı yok) | **S-09** | RELEASE20 | **ETKİLENDİ** — #2553 + #2555 → **A-01 sonrası YENİLENİR** |

**Kural:** eski PASS, incelenmeden bugünkü etkinlik kanıtı sayılmaz. Yukarıdaki "etkilenmedi"
hükümleri, ilgili commit'lerin dosya kapsamının ölçülmesine dayanır (adayın canlıya göre
`project/apps` deltası 3 commit ve 26 dosyayla sınırlıdır).

### 8.4 A-07 kapsam netleştirmesi (bağlayıcı)

A-07 **yalnız okuma ve yetki-negatifiyle tamamlanmış SAYILMAZ.** Kapanış için onay akışının
**durum değiştiren** bir adımı (approve veya reject) sentetik tenant'ta yürütülmeli, ADR-009 tek
motor izi (`OfficeApprovalRequest` durum geçişi + `OFFICE_APPROVAL_EXECUTION_*` olayı) ölçülmelidir.
A-02 paketinin kuralı geçerlidir: finansal zincir gerektirmeyen en dar `actionCode` koşum anında
kanıtla seçilir; hiçbiri uygun değilse A-07 **kapanmaz**, `BLOCKED` olarak ana yürütücüye döner
(okuma+negatifle sınırlı sonuç kabul yerine geçmez).

### 8.5 AÇIK KARARLAR — owner kararı bekleyen tek tablo

| ID | Konu | Ölçülen bugünkü davranış (kanıt) | Engellediği kabul | Öneri |
|---|---|---|---|---|
| **AK-1a** | F01 rol eleyiciliği | `UserRole` yalnız **ADMIN** için kısa-yol; diğer roller eleyici değil → **VIEWER**, MANAGER/delege avukata bağlıysa F01 kapısından **GEÇER** (#2557, `office-f01-role-tenant-matrix.characterization.spec.ts` 15/15) | A-03/A-04/A-05'in "yetkisiz reddedilir" ölçütünün **rol listesi** | VIEWER'ın yazma yüzeylerinde eleyici sayılması; okuma için mevcut davranış korunabilir |
| **AK-1b** | cross-office kapsamı | cross-office kontrolü **yalnız `targetOfficeId` verilince** çalışır → başka ofise bağlı **PARTNER**, ofis belirtmeyen çağrılarda yetkili sayılır (#2557) | A-03/A-04/A-06'nın tenant/ofis sınırı ölçütü | Aktörün kendi `officeId`'sinin varsayılan kapsam olarak uygulanması |
| **AK-1c** | ADMIN kısa-yol sırası | cross-office kontrolü ADMIN kısa-yolundan **önce** → başka ofise bağlı **ADMIN hedef ofis verilince REDDEDİLİR**; avukat bağı olmayan ADMIN geçer (#2557) | A-06 (ADMIN yüzeyi) ölçütü | Sıranın owner tarafından teyidi; davranış bilinçliyse kayda geçirilmesi |
| **AK-2** | create'te H2 alanları | `lawyerRank` / `defaultPermissions` / `permissionsLocked` / `canModifyOtherPermissions` **create'te H2 otorite kontrolünden muaf**; DTO bunları kabul eder (`create-lawyer.dto.ts:95-99`), update'te H2 kontrolü vardır (#2555 bunu bilinçli DEĞİŞTİRMEDİ) | **A-04** — avukat create ölçütü | create'te de H2 aktör kontrolü (update ile simetri); aksi hâlde yeni avukat oluştururken yetki/rütbe serbestçe atanabilir |
| **AK-3** | OFF-P2-CAP-07 | Alan-düzeyi izin taşıyıcısı **üretilmedi**; unmask governance BLOCKED. `projectF01Lawyer` allow-list olduğu için `tckn/iban/identityNo/bankName/branchName/vergiDairesi/vergiNo` **her aktör için düşer** (maskeleme değil, yokluk). Sızıntı-kapatma alt-parçasında açık kod boşluğu **ölçülemedi** (#2557) | Teslimi engellemez — **B-01** sınırı | Bu sürümde sınır olarak beyan; taşıyıcı kararı sonraki sürüme |

**Karar beklerken:** AK-1a/1b/1c ve AK-2 **karakterizasyon** olarak ölçülür (bugünkü davranış
kanıtlanır), fakat "doğru davranış" hükmü verilmez. Bu kalemler A-03/A-04/A-05/A-06'yı
**durdurmaz**; ilgili ölçüt satırı `KARAKTERİZE EDİLDİ / OWNER KARARI BEKLİYOR` olarak kapanır ve
teslim tablosunda bu sürümün açık sınırı olarak görünür.

### 8.6 Kapsam değişikliği kaydı (N korunur)

Plan §4'teki **B-03 (F-B01-05)** kalemi, R01 yazıldığında "yazan servis yolu yok, düşük öncelik"
öncülüne dayanıyordu; #2555 bu öncülün **bayat** olduğunu kanıtladı (`POST /lawyers` gövdesi DTO
sınıfıyla değil satır-içi tip literaliyle tipliydi; global `ValidationPipe` metatype `Object`
gördüğü için hiç çalışmıyordu → gövde `prisma.lawyer.create` içine spread ediliyordu =
credential/tenant enjeksiyonu). Kalem **B-03 → A-01 yüküne** taşındı; **yeni iş eklenmedi**,
**N = 7 değişmedi**, eksik iş gizlenmedi.

### 8.7 §8.2/§8.3 ÖLÇÜM DÜZELTMESİ (append-only şerh, 2026-09-08)

§8'i yazarken iki sayısal/isimsel ayrıntıyı yanlış kaydettim. Aşağıdaki satırlar
**doğrusudur**; §8.2 ve §8.3'ün tarihsel metni silinmez, bu şerh onları düzeltir.
Uygulayıcı sayfalar A-01 ve A-03…A-07'de **bu şerhi** esas alır.

| Yanlış kayıt | Ölçülen doğru değer | Ölçüm |
|---|---|---|
| §8.2: modül-dışı tüketiciler `client-approval`, `client-intake-link`, `client-statement` ×3, `client-settlement` | Beş **çalışma zamanı** tüketicisi: `client-approval.service.ts:239` · `client-intake-link.service.ts:376` · `client-statement.service.ts:434` · `client-statement-monthly-delivery.service.ts:343` · **`expense-request.service.ts:1388`**. `client-settlement`'ta yalnız **spec** mock'u değişti, çalışma zamanı çağrısı YOK | `git grep -n getOfficeIdentity d2223e78 -- project/apps/api/src`; `git show --name-only ddcd4aba -- .../client-settlement` → tek dosya, `__tests__/tm47d-…spec.ts` |
| §8.3 dipnot: "`project/apps` deltası 3 commit ve **26** dosya" | **27** dosya | `git diff --name-only 08ce8e25..d2223e78 -- project/apps \| wc -l` = 27 |

**Değişmeyen hükümler** (yeniden ölçüldü, doğru çıktı):

- Adayın canlıya göre **çalışma zamanı** farkı gerçekten yalnız üç commit'tir. Commit
  başına çalışma zamanı (spec/`ci-manifests` hariç) dosya sayısı: `ad484c49` = 1 ·
  `ddcd4aba` = 6 · `fa1e3bb2` = 4 · `4f13a0ac` = 0 · `d2223e78` = 0 · `93f04f67` = 0 ·
  `db2f52f3` = 0. Toplam **11 çalışma zamanı dosyası**, biri (`schema.prisma`) yalnız yorum.
- **Yeni migration 0** (`git diff --name-only 08ce8e25..d2223e78 -- .../prisma/migrations` = 0).
- Tüketici **sayısı** beştir (statik guard `office-raw-row-cross-module.static-guard.spec.ts`
  "bes bilinen tuketici" ile aynı kümeyi bağlar); yanlış olan sayı değil, iki **isimdi**.

**Adayın sabitliği:** main bu şerhle birlikte `d2223e78`'in ilerisindedir (#2559 → `09b792ef`),
fakat aradaki tek fark **bu plan dosyasıdır**; `project/apps` dokunuşu **0**. Bu nedenle aday
**`d2223e78` olarak SABİT KALIR**; "fresh main" kullanılmaz ve main'in ilerlemiş olması
A-01'in adayını değiştirmez.

### 8.8 CANLI DURUM — A-01 öncesi taze ölçüm (2026-09-08)

| Ölçüm | Değer | Yöntem |
|---|---|---|
| API dinleyici | PID **61532**, port 8080 | `Get-NetTCPConnection -State Listen` |
| API komut satırı | `node …\HY_W4_RELEASE20\project\apps\api\dist\apps\api\src\main.js` | `Win32_Process.CommandLine` |
| Web dinleyici | PID **47868**, port 3002 | aynı |
| Web komut satırı | `node …\HY_W4_RELEASE20\project\apps\web\node_modules\next\dist\bin\next start --port 3002` | aynı |
| Web BUILD_ID | `LW4jlJUOMHrvVEqakKB3i` | `HY_W4_RELEASE20\project\apps\web\.next\BUILD_ID` |
| Host süreçleri | `hukuk-task-host.exe api` PID 62736 · `… web` PID 42736 (başlangıç 2026-09-07 17:44–17:45) | `Get-Process` |

Yani **canlı hâlâ RELEASE20 `08ce8e25`'tir**; RELEASE20 cutover'ından bu yana runtime
değişmemiştir. Bu ölçüm salt-okumadır: canlı DB'ye yazma 0, süreç mutasyonu 0.

Not: `GET /api/health` **404** döner — bu bir kusur kaydı DEĞİLDİR, o yolun bu sürümde
bulunmadığının ölçümüdür; A-01/A-03 sağlık kontrolü bu yola bağlanmaz.

### 8.9 MERKEZÎ DAĞITIM ve A-01 YETKİ KALEMİ (2026-09-08, append-only)

Owner ek talimatı: owner'ın tek muhatabı **ana yürütücüdür**; görev iletimi, yanıt alma ve
ilerleme takibi ana yürütücüdedir. Mevcut oturumlar kullanılır, aynı işi yapacak yeni oturum
açılmaz. Owner sayfalar arası **rutin mesaj taşıyıcısı olarak kullanılmaz**.

**Durum ayrımı zorunludur:** *hazırlandı* ≠ *gönderildi* ≠ *alındı* ≠ *başladı*. Ölçüt:
`send_message` sonucu = gönderildi · hedefin oturum etkinliği sıçraması = alındı ·
görevi aldığını bildiren **yanıt mesajı** = başladı.

#### 8.9.1 Dağıtım kaydı

| Kalem | Sorumlu | Gönderildi | Alındı | Başladı | İz |
|---|---|---|---|---|---|
| **A-01** | OFFİCE 33 | ✅ 2026-09-08 09:49 | ✅ | ✅ (altı alanlı rapor döndü) | Kasıtlı olarak **hiçbir artefakt yok** |
| **A-03…A-07 canlı** | OFFİCE 33-F04 | ⛔ **dağıtılmadı** — A-01'e bağlı | — | — | — |
| A-02 §8 disposable provası (hazırlık) | OFFİCE 33-F04 | ✅ 2026-09-08 09:49 | ✅ | ✅ | dal `claude/office-a02-rehearsal-r01` |

#### 8.9.2 A-01 — yetki kalemi (teknik engel YOK)

OFFİCE 33 A-01'i **koşmadı** ve hiçbir aday derleme kökü / paket / mühür / worktree üretmedi.
Gerekçesi kabul edilmiştir: o oturuma owner'ın verdiği son kapsam **canlı deploy'u dışlar**
("Canlı deploy, production DB yazımı, gerçek alıcıya test gönderimi ve O-8 Kaydet kabulü yok" +
"ikinci işi kendiliğinden başlatma"). Ana yürütücünün görev mesajı **owner yetkisi üretmez**;
meslektaş talebiyle kapsam dışı bir canlı işlemi başlatmak **yetki yıkamasıdır**.

| Alan | İçerik |
|---|---|
| `blockerCode` | `NO_OWNER_GO_FOR_LIVE_CUTOVER` |
| `blockingLayer` | authority (governance) — **teknik engel yok** |
| `evidence` | OFFİCE 33'ün son owner talimatındaki kapsam cümlesi; ana yürütücü mesajındaki "bu mesaj yeni owner yetkisi ÜRETMEZ" ifadesi |
| `whyNotRevision` | Eksik olan plan/aday/ölçüm değil — üçü de bağımsız doğrulandı. Eksik olan yalnız owner'ın **bu oturuma** verdiği canlı-işlem yetkisidir; revizyonla çözülmez |
| `requiredAction` | Owner'dan bu oturuma açık A-01 GO'su (RatificationRef + tek-kullanımlık authority/nonce) |
| `preservedWip` | **YOK** — çalışma ağacı temiz, açık PR yok, artefakt üretilmedi |

#### 8.9.3 Bağımsız doğrulama — OFFİCE 33 ölçümleri (ana yürütücü tarafından yeniden koşuldu)

| Ölçüm | OFFİCE 33 | Ana yürütücü | Sonuç |
|---|---|---|---|
| `project/apps` delta `08ce8e25..d2223e78` | 27 | 27 | ✅ |
| Sınıflandırma | 11 runtime + 16 spec/manifest | 11 + 16 | ✅ |
| Migration deltası | 0 | 0 | ✅ |
| `ddcd4aba` / `fa1e3bb2` adayda | EVET | EVET | ✅ |
| `schema.prisma` deltası | yalnız yorum (`uyapToken String?` önce/sonra aynı) | aynı | ✅ |
| `d2223e78` (#2558) `project/apps` dokunuşu | 0 | 0 (yalnız `docs/governance` + 9 script) | ✅ |
| `client-settlement` üretim çağrısı YOK | teyit | §8.7 ile aynı | ✅ |

**Sonuç:** §8.2/§8.7'nin aday tanımı iki bağımsız ölçümle desteklidir. "CLIENT'i pakete dahil
etme" sınırı aday ucu (#2558) yüzünden **ihlal olmuyor** — o commit `project/apps` altına
dokunmuyor.

#### 8.9.4 RatificationRef — motor literali bağı (mühürden ÖNCE doğrulanacak)

RELEASE20 R24 mühürleyicisi (`tools/Seal-Package.ps1:40`) ref'i şu desenle kabul eder:

```text
^OWNER-RATIFICATION-C33-RELEASE20-CUTOVER-[0-9]{8}-R[0-9]{2}(-[A-Z0-9-]+)?$
```

Sürüm adı **literaldir**. Fiilen kullanılanlar: `…RELEASE20-CUTOVER-20260907-R01` ve `-R02`.
Serbest biçimli "ULAS-…" ref bu desene uymaz ve S-00'da reddedilir.

**Bağlayıcı kural:** yeni sürüm paketi forklanırken `Seal-Package.ps1` içindeki sürüm literali
yeni sürüm adına güncellenir ve **S-00'ın ref'i kabul ettiği mühürden önce kanıtlanır**. Ref ile
motor literali uyuşmuyorsa **DUR**; yürütücü kendi başına ref biçimi uydurmaz. (RELEASE17→18
forkunda bu literal elle düzeltilmişti; atlanırsa mühür S-00'da düşer.)

#### 8.9.5 F04 provasına iki bağlayıcı düzeltme

1. **Derleme tabanı sabit aday `d2223e78`** — "güncel main" değil. Bugün maliyeti sıfır:
   `d2223e78:project/apps` ve `f8d15f73:project/apps` ağaç hash'i **birebir eşit**
   (`b26d922cd7f39121b0881b62305d6e90908c80e0`). Taban sabitlenmezse main ilerlediğinde prova
   kanıtı kendiliğinden bayatlar.
2. **Harness PR'inin `project/apps` deltası 0 olmalı.** `project/apps` altına dokunan bir merge,
   ölçülmüş 27-dosya deltasını ve §8.3'teki devralınan kabulleri geçersiz kılar; A-01 yeniden
   ölçülmek zorunda kalır. Tek istisna: yalnız `ci-manifests/*.txt` satırı (CI manifest tuzağı —
   listeye eklenmeyen spec CI'da hiç koşmaz); kod/spec dosyası `project/apps` altına girmez.

F04'ün doğru tespiti kayda geçer: **A-02 bir sözleşme belgesidir, çalıştırılabilir betik
içermez.** Harness'ı F04 yazar; sözleşme belgesi yeniden yazılmaz. Ayrıca F04, provada
uygulamayı F-B01-05'i içeren bir ağaçtan derleyeceği için **A-04'ün DTO reddi ölçütünü provada
gerçekten ölçebilir** — bu, canlı A-04'ün A-01 bağımlılığını **değiştirmez**.

### 8.10 A-07 KESİN YÜRÜTME BAĞI ve MIGRATION KARARI (2026-09-08, append-only)

Bu bölüm A-07'nin "yürütme izi" ölçütünün nasıl kapatılacağını ve bunun A-01'in yayın
adayına etkisini kayda geçirir. Owner kararlarıyla ilerledi; her hüküm ölçüme dayanır.

#### 8.10.1 A-07 daraltılamadı — owner reddi

Ana yürütücü, A-02 §4'ün geri-düşüş kuralına dayanarak A-07'nin "okuma yüzeyi + yetki
negatifi" ile sınırlı kapanmasını önerdi. **Owner ONAYLAMADI:** yürütme izi açıkken A-07 ve
bütünsel OFFICE teslimi tamamlanmış sayılamaz. Bu, planın "N=7 zorunlu iş" tanımını korur.

#### 8.10.2 Belirleyici ölçüm — yürütmenin tek tetikleyicisi cron'du

| Ölçüm | Bulgu |
|---|---|
| `OfficeApprovalExecutorService` enjeksiyonu (üretim) | **yalnız** `office-approval-executor-cron.service.ts:53` |
| `office-approval.controller.ts` rotaları | `inbox` · `mine` · `:id` · `approve` · `reject` · `request-revision` · `approve-with-changes` · `cancel` — **yürütme ucu YOK** |
| Modül şerhi | `office-approval-executor.module.ts:15` "internal callable … route YOK" |

Sonuç: ADR-009 tek-motor yürütme izini üreten tek yol cron'du. Bu, owner'ın iki şartını
(*"cron kabul satırını kontrolsüz yürütmesin"* + *"yürütme izi üretilsin"*) mevcut kodla
**çelişkiye** soktu. Kod-dışı kaldıraç arandı, bulunamadı: cron/executor'da tenant lifecycle
yüklemi **0**; tenant'ı pasifleştirmek cron kapsamından çıkarmıyor (ve çıkarsa da
`isLoginableLifecycle` ACTIVE istediği için HTTP kabul koşulamıyor — iki yönlü ölü yol).

#### 8.10.3 Devralınamayan kanıt — iki yolun ürettiği iz AYNI DEĞİL

`markExecution` yardımcısı kaynak durum olarak `{NOT_RUN, RUNNING}` kabul eder; yani
`markExecutionSucceeded` RUNNING'den geçmeden de çağrılabilir. Üç üretim yolu:
`office-approval-executor.service.ts:220,276` · `client-settlement/disposition-posting.service.ts:368`
· `client-settlement/client-payout.service.ts:286`.

| Ölçüt | Executor (CHANGE_STATUS/LegalCase) | Disposition posting |
|---|---|---|
| `markExecutionRunning` STRICT NOT_RUN→RUNNING (çift-apply fence) | ✅ | ❌ |
| `OFFICE_APPROVAL_EXECUTION_STARTED` | ✅ | ❌ |
| Yaşam döngüsü | NOT_RUN → RUNNING → SUCCEEDED | **NOT_RUN → SUCCEEDED** |
| `..._SUCCEEDED` | ✅ | ✅ |

**Sonuç:** F04'ün #2549'daki `COLLECTION_DISPOSITION_POST` kanıtı terminal bir işaretçiydi,
ADR-009 tek motor yürütmesi değil → **devralınamaz.** Owner'ın "yeni finansal zinciri
kendiliğinizden kurmayın" şartı da geçerli olduğundan yol `CHANGE_STATUS/LegalCase`tir.

#### 8.10.4 DELTA-A — owner seçimi (execute + reconcile)

Owner DELTA-A'yı **execute + reconcile** kapsamıyla seçti; uygulama OFFİCE 33-F04'ün,
aday/paket/mühür/cutover OFFİCE 33'ün, koordinasyon ana yürütücünündür. **Aynı dosya
kapsamının tek yazarı** kuralı geçerlidir.

Yetkilendirilen değişiklik: `CaseStatusHistory` üzerinde nullable **`approvalRequestId`** ve
**`approvalAttempt`** + doğrulanmış sorguya uygun indeks (tek migration klasörü) · kontrollü
`execute` ve **yalnız hedef talebe yönelik** `reconcile` uçları · varsayılan **KAPALI**, genel
cron bayrağından **bağımsız** kabul bayrağı · F01 + ADMIN + sunucuda çözülen tenant/ofis +
talep/Case/deneme kontrolleri (bayrak açıkken de zorunlu) · spec'ler + **CI manifesti**.

Bağlayıcı: talep/deneme bağı **Case değişikliğiyle aynı transaction'da** yazılır · istemci bu
bağı sahte üretemez · **kesin kanıt olmadan SUCCEEDED yazılmaz** · tekrar uygulama yapılmaz ·
**genel cron reconcile davranışı değiştirilmez**.

#### 8.10.5 İki ölçüm, iki geri çekilen hüküm

**(a) Guard owner şartını sağlamıyordu.** Owner *"ADMIN olmak tenant/ofis sınırını
kaldırmasın"* dedi. Ölçüm: `office-f01-authorization.guard.ts:32` `isF01ActorAuthorized`'ı
`targetOfficeId` **vermeden** çağırıyor; `office-approval.service.ts:26` cross-office
kontrolünü yalnız `targetOfficeId` verilince çalıştırıyor, `:30` ADMIN'i kısa-yoldan geçiriyor.
Yani yeni uç guard'a dayansaydı şart **ilk gün ihlal** olurdu → `targetOfficeId` sunucuda
türetilip servis katmanında açıkça geçirilecek; **paylaşımlı predicate DEĞİŞTİRİLMEZ**.
Owner düzeltmesi: `Office.tenantId @unique` = **"en fazla bir ofis"** ("tam olarak bir" DEĞİL);
ofis bulunamazsa veya ilişkilerde uyuşmazlık varsa **fail-closed reddedilir**. Bu uçtaki
doğrulama **AK-1c'nin veya bütün F01 yüzeylerinin genel kapanışı olarak raporlanmaz**.

**(b) Ana yürütücünün onayladığı reconcile eşiği YETERSİZDİ.** `caseId + aktör + zaman +
hedef statü` yüklemi onaylanmıştı; owner *"aynı aktörün başka işlemi de bu koşulları
sağlayabilir"* diyerek reddetti ve **haklıydı** — ölçüm: `changeStatus` **paylaşımlı**
(`case-status.controller.ts:107` + executor `:214`), yani aynı aktör controller üzerinden
birebir aynı görünen satırı üretebilir. `CaseStatusHistory` ve `DecisionLog`'da
`approvalRequestId` **yoktu** → kesin bağ mevcut değildi. Ayrıca **yeniden deneme mümkün**
(`executeRetry` + `markExecutionRetrying` FAILED→RUNNING, `retryCount < maxAttempts`), her
deneme yeni history satırı üretir ve `markExecutionRetrying` `retryCount`'u **artırmaz** →
`retryCount` tek başına deneme ayırt edicisi olamaz. Bu yüzden ayrı `approvalAttempt` alanı.

#### 8.10.6 MIGRATION — C33 cutover motorunda KOŞAMAZ

| Kanıt | Ölçüm |
|---|---|
| Motor başlığı | `engine/Invoke-C33Cutover.ps1:5` "YASAK: … DB restore/**migration**/credential rotation …" |
| P-16 kapısı | `:499` `$litDen = @(('mig'+'rate'), …)` — parçalı jeton (tarayıcı kendini eşleştirmesin); `:505` `yasakLit=0` şartı → motora migration girerse **P-16 düşer** (19 zorunlu kapıdan biri) |
| DB değişmezliği | `:351` `Get-DbSnapshot` → `count(*) FROM _prisma_migrations` (+ kırılım); `:455` dbPre · `:614` dbMid · `:634` dbPost · `:700` dbRb |
| **Paket pini** | `pins/PINS.json:65` `"ledgerTuple": "129\|129\|0\|0"` · `:66` `"dbSnapshot": "129\|129\|0\|0\|…\|5\|36\|2"` |

Motor "canlı DB'ye dokunmadım"ı **migration sayacıyla kanıtlıyor**; migration pencere içinde
koşarsa bu kanıt modeli kendisiyle çelişir.

**PİN ZATEN KAYMIŞ** (ana yürütücü ölçümü, salt-okuma, RELEASE20 dist'inin Prisma istemcisiyle):
```
pinli : 129|129|0|0|<sysid>|5|36|2
canlı : 129|129|0|0|<sysid>|6|37|2      → Tenant 5→6 · User 36→37
altıncı tenant: f04-acc-ccd471d3  2026-09-07T20:26:44Z  (#2549 canlı kabul koşumu)
```
Yani **RELEASE20 paketi bugün yeniden koşulsa kendi pin kapısında düşerdi.** Yapısal sonuç:
**her canlı kabul koşumu bu tuple'ı oynatır** → A-03…A-07 canlı kabulünün cutover'dan SONRA
gelmesi **tercih değil ZORUNLULUKTUR**; pin ölçümü ile mühür arasında canlıya tenant/kullanıcı
yaratan hiçbir iş koşmaz (koordinasyon ana yürütücüde).

#### 8.10.7 Kilit riski — ölçüldü, korumasız

```
lock_timeout = 0 · statement_timeout = 0 · idle_in_transaction_session_timeout = 0
deadlock_timeout = 1000 ms · max_connections = 100 · PostgreSQL 16.14
CaseStatusHistory: 930 satır · 408 kB toplam · açık işlem yok (ölçüm anında)
depoda lock_timeout kullanan migration: 0/129 · CONCURRENTLY: 0/129
```
Risk **tablo boyutundan bağımsızdır**: `ADD COLUMN` ACCESS EXCLUSIVE ister; `lock_timeout=0`
olduğu için kilit alınamazsa migration **süresiz bekler** ve talep kuyruğa girdiği anda
**arkasındaki tüm yeni sorgular** (okuma dahil) bloke olur. 129 migration'ın kilit koruması
olmadan uygulanmış olması güvenlik kanıtı **değildir** (hayatta kalma yanılgısı).
Bağlayıcı: `SET LOCAL lock_timeout` (değer + gerekçe) · **düz `CREATE INDEX`** (CONCURRENTLY
transaction içinde koşamaz → kısmi/INVALID indeks; düz kullanım `ADD COLUMN` ile **atomik**) ·
migration öncesi açık/idle işlem ön-kontrolü. **"Nullable kolon zaten risksizdir" argümanı
owner tarafından ismen yasaklanmıştır ve kullanılmamıştır.**

#### 8.10.8 Migration sırası — dört seçenek, hepsi ölçülü gerekçeyle

| # | Seçenek | Sonuç |
|---|---|---|
| **1** | Cutover **öncesi**, ayrı yetkili adım; motor dokunulmaz | **ÖNERİ** — bütçeye eklemez; atomik; RELEASE20 koşarken uygulanır, böylece "RELEASE20 genişlemiş şemayla çalışır" kanıtı **zorunlu ön koşul** hâline gelir (rollback güvencesiyle aynı kanıt) |
| 2 | Cutover **sonrası** | **ELENDİ — ölçüldü:** `case-status.service.ts:206` `caseStatusHistory.findMany` `include` kullanıp modele `select` **vermiyor** → Prisma tüm skalar alanları çeker; RELEASE21 istemcisi kolonsuz şemaya karşı `column does not exist` alır. Kullanıcıya açık `GET /case-status/:caseId/history` (`controller:128`) **500** verir. Dar (tek okuma yolu) ama **gerçek** |
| 3 | Cutover **içinde**, motor değiştirilerek | **REDDEDİLDİ** — P-16 düşer; dbSnapshot değişmezliği motorun garantisinin taşıyıcısı; kesinti bütçesine doğrudan eklenir |
| 4 | Migration **hiç yapılmaz** | **REDDEDİLDİ** — owner'ın onayladığı A-07 kesin bağ tasarımını geri alır |

Seçenek belgesi: `HY_C33_RELEASE21_CUTOVER_R25_PREP/MIGRATION-SIRA-SECENEKLERI-R01.md`
(altı sütun her seçenek için dolu; **BEKLENTİ olarak kalan hiçbir eleme gerekçesi yoktur**).

#### 8.10.9 Adayın ve ratifikasyonun durumu

- Aday **`d2223e78` DEĞİL**; DELTA-A + güvenlik onarımları **aynı yeni adayda**, **tek cutover**.
  `d2223e78` ayrıca canlıya **alınmayacak**.
- `OWNER-RATIFICATION-…-R01` **ölü** (owner: içerik değişirse referans yeni adaya taşınmaz).
  **R02 ayrıldı fakat mühür yetkisi DEĞİLDİR**; nihai ratifikasyon, ölçüm tamamlandıktan sonra
  **yeni aday SHA · BUILD_ID · migration kimliği · rollback · paket digest'i** birlikte
  bağlanarak **tek mesajda** sunulacaktır (ana yürütücü derler).
- Aday artık **"migration 0" diye sunulmayacaktır.**
- Rollback = uygulamanın doğrulanmış **RELEASE20** sürümüne dönüşü; **down migration
  kolon/indeks/yürütme kanıtı SİLMEZ**; RELEASE20'nin genişlemiş şemayla çalıştığı **izole
  provada** kanıtlanır.

#### 8.10.10 Yetki sınırı — ana yürütücünün ihlali ve düzeltmesi

Ana yürütücü, owner'ın migration kararını OFFİCE 33-F04'e aktarıp "yazabilirsin" dedi. **F04
HARD STOP verdi ve haklıydı:** o oturumun GO'su migration'ı ismen dışlıyordu ve bir meslektaş
oturumunun aktarımı — doğru aktarılmış olsa bile — o oturum için geçerli yetki üretmez
(**yetki aklama** sınıfı). Ana yürütücü hükmü geri çekti ve owner'dan **F04 oturumuna dönük
doğrudan yetki** istedi; owner verdi (kaynak geliştirme + izole prova + merge; **canlı
migration/deploy/kabul yazımları hariç**). Owner ayrıca ana yürütücüye **onaylanan kapsam
içinde doğrudan dağıtım** yetkisi tanıdı; kapsam genişletme ve nihai canlı ratifikasyon
yetkisi tanınmadı.

İkinci düzeltme: ana yürütücü OFFİCE 33'e migration kapsamını **tek kolon** diye aktarmıştı;
owner'ın son yetki metninde `approvalAttempt` **ismen vardı**. OFFİCE 33 bunu kapsam sorusu
olarak yükseltti — **doğru refleks**; hata aktarımdaydı, kapsam genişlemesi yoktu.

#### 8.10.11 Prova durumu — canlı kabul DEĞİL

```
kurulum 7/7 · A-03 53/53 · A-04 27/27 · A-05 12/12 · A-06 17/17 · kapanış 3/3
PROVA SONUÇ: PASS · FAIL 0 · OLCULEMEDI 0 · canlı :8080'e sıfır temas
```
Harness'ın **altı kendi kusuru** provada yakalandı (boş izleme kümesi PASS veriyordu ·
"yazıldı" ölçütü yanlıştı · banka hesabı id'si ölçülemiyordu · seyircide kullanıcı yoktu ·
login rate-limit · merkezî login atıl kalmıştı) — **hiçbiri ürün kusuru değildir**.
Owner kuralı: **prova başarısı canlı kapanış sayılmaz**; A-03…A-06 kabul satırları canlı
koşumla dolacaktır. Provalar korunur; yalnız yeni değişiklikten etkilenen kanıtlar yenilenir.

#### 8.10.12 `f04-acc-ccd471d3` — korunur

Owner: kayıtlar ve yürütme izi **korunacak**; bu tenant yeni OFFICE kabulünde
**kullanılmayacak**; **silme veya yeniden etkinleştirme YOK**. Ana yürütücü salt-okuma
doğrulaması:
```
kullanıcı 1 · isActive=false · tokenVersion=1 · role=ADMIN
e-posta @f04-acceptance.invalid (teslim edilemez)
korunan kayıt: OfficeApprovalRequest 1 · AuditLog 1
```
**Uyumsuzluk YOK** — somut düzeltme gerekmiyor.
