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
