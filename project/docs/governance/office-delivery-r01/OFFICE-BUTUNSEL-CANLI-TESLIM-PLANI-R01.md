# OFFICE BÜTÜNSEL CANLI TESLİM PLANI — R01

```text
Kimlik        : OFFICE-BUTUNSEL-CANLI-TESLIM-PLANI-R01
Tarih         : 2026-09-08
Ölçüm tabanı  : main = ddcd4aba9a7f431c41c39e8a6092476326b7d5b1 (#2553) · açık PR 0
Canlı         : RELEASE20 @ 08ce8e2559b4d1d67fcee245413de510209507f3 · BUILD_ID LW4jlJUOMHrvVEqakKB3i
                ⚠ BAYAT (2026-09-08 durumu). GÜNCEL 2026-09-09:
                RELEASE21 @ 2187a78b1621f168605920cdffccb17381dc171a · BUILD_ID g91HUaBesekB-R2rRawQj
Rollback      : RELEASE19 @ a60d772b6c53ece6bc23b77821a2921ab0ec7942
                ⚠ BAYAT. GÜNCEL rollback hedefi: RELEASE20 @ 08ce8e25 (bkz. §8.14)
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

### 8.11 İKİ YETKİ SERT DURUŞU — A-03…A-07 ve O-4/O-4-LAWYER (2026-09-09, append-only)

A-01 canlı kanıtla kapandıktan sonra ana yürütücü kalan iki iş kalemini dağıttı. **İkisi de
yetki gerekçesiyle reddedildi ve iki ret de doğrudur.** Bu bölüm reddin kaydıdır; §8.9.1'in
dağıtım tablosunu günceller.

#### 8.11.1 Sayaç

```text
ZORUNLU KABUL KÜMESİ   A-01 … A-07
KAPANDI                2/7   A-02 (sözleşme + prova) · A-01 (cutover, canlı kanıt)
AÇIK                   5/7   A-03 · A-04 · A-05 · A-06 · A-07
DURUM                  BAŞLATILMADI (YETKİ YOK)
CANLIYA YAZMA          0
YENİLENMEMİŞ KABUL     O-4 · O-4-LAWYER  (§8.3 gereği ZORUNLU)
BÜTÜNSEL TESLİM        İLAN EDİLMEDİ — §6 bitiş çizgisi değişmedi
```

#### 8.11.2 OFFİCE 33-F04 — A-03…A-07 · İSMEN DIŞLAMA

| Alan | İçerik |
|---|---|
| `blockerCode` | `BLOCKED_AUTHORITY_MISSING` |
| `blockingLayer` | authority (governance) — **teknik engel yok** |
| `evidence` | F04'ün owner GO'su §3, aynen: *"Bu yetki … production DB'ye sentetik veri yazma … kapsamaz. Testler izole yerel ortamda, sentetik verilerle yapılır."* A-03…A-07 canlı kabulünün tanımı tam olarak budur |
| `whyNotRevision` | Eksik olan plan, harness veya ölçüm değil — üçü de hazır ve doğrulandı. Eksik olan yalnız owner'ın **bu oturuma** verdiği canlı-yazma yetkisidir |
| `requiredAction` | Owner'ın **kendi kanalından** F04'e yazacağı GO (§8.11.5-A) |
| `preservedWip` | Koşum planı `0ae8a85d` + PR #2580 (§2.1.1 fixture ön koşulları); bayrak mekanizması ve tam env yolu tespit edildi; aday=canlı doğrulandı |

Hazır olduğu ölçülen kalemler: plan · §2.1.1 ön koşullar · bayrak mekanizması ve
`HY_W4_RELEASE21/project/apps/api/.env` yolu · route-mount + bayrak-kapalı yapılandırma kanıtı.

#### 8.11.3 OFFİCE 33 — O-4 / O-4-LAWYER · KAPSAM SESSİZLİĞİ

| Alan | İçerik |
|---|---|
| `blockerCode` | `BLOCKED_AUTHORITY_MISSING` |
| `blockingLayer` | authority (governance) — **teknik engel yok** |
| `evidence` | OFFİCE 33'ün bu oturumdaki owner GO'su C36 migration → C33 preflight/seal/V-03 onarımı → cutover → A-01 terminal doğrulaması zinciriyle sınırlı. O-serisi kabul testi bu zincirde **hiç geçmiyor** |
| `whyNotRevision` | Yöntem bilinen ve owner'ca kabul edilmiş (#2545): canlı derlenmiş dist + disposable PG 5439 + sentetik tenant, canlı DB'ye 0 yazma. Eksik olan yöntem değil, **yetki kaynağı** |
| `requiredAction` | Owner'ın **kendi kanalından** OFFİCE 33'e yazacağı GO (§8.11.5-B) |
| `preservedWip` | `HY_W4_RELEASE21` dist doğrulanmış ve hazır; ölçüm aracı ÜRETİLMEDİ; canlı DB yazma 0 |

#### 8.11.4 Ana yürütücünün kendi kusuru — kayda geçer

1. **F04 görev mesajına "Kapsam içi iş için tekrar GO isteme" cümlesi kondu.** Bu cümle
   owner'ın **ana yürütücüye** yazdığıydı (mesaj taşıyıcılığından kurtarma amaçlı); F04'ün
   bağlamına taşınınca *"sorma"* baskısına dönüştü. F04'ün tespiti doğrudur:
   **"bir daha sorma" talimatının kendisi taşıyıcı kanaldan gelemez.** Cümle geri çekildi.
2. **OFFİCE 33'e kapsam savunması RİSK ekseninden yapıldı** ("salt-okuma, 0 canlı yazma,
   dolayısıyla kapsam içi"). OFFİCE 33'ün cevabı bağlayıcıdır: **"mesele risk değil, YETKİ
   KAYNAĞI."** Düşük risk yetki üretmez. Bir işin kapsam içi olduğunun tek geçerli kanıtı,
   hedef oturumun **kendi GO metninde** o işin bulunmasıdır.

Her iki kusur da aynı sınıftır: uygun sonuca, uygun olmayan eksenden varmaya çalışmak.

#### 8.11.5 Gereken iki owner GO'su — owner'ın KENDİ kanalından

Aşağıdaki iki metin **yeni karar içermez**; owner'ın bu programda zaten verdiği kararların
(DELTA-A execute + reconcile · dar bayrak penceresi seçenek (a) · sentetik `Case` ilkesel
onayı · dışlamalar · #2545 kabul yöntemi) derlemesidir. Eksik olan **yalnız kanaldır**.

**A — OFFİCE 33-F04 · A-03…A-07**

```text
Kapsam      : A-03 · A-04 · A-05 · A-06 · A-07 (DELTA-A: execute + reconcile)
Ortam       : CANLI RELEASE21 (HEAD 2187a78b) — canlı DB'ye yazma AÇIKÇA ONAYLI
Alan        : TEK sentetik tenant  off-acc-<runId>
              aktör e-postaları @office-acceptance.invalid (teslim edilemez)
A-07 bayrak : OFFICE_APPROVAL_EXECUTOR_ENABLED dar pencere ONAYLI
              HY_W4_RELEASE21/project/apps/api/.env
              yalnız A-07 yürütme adımı için açılır
              İKİ canlı API restart'ı onaylıdır (aç + kapat) — gerçek kesinti maliyeti
              koşum sonunda kapatılır — BAŞARISIZLIKTA DA
              kapanış env dosyasından DEĞİL, çalışan süreç + kontrollü ucun
              reddetme davranışı üzerinden doğrulanır
Kapanış     : revoke-access, finally yolunda; envanter hatası kapanışı engellemez
              kapatma dallarında çıkış kodu beyaz listesi KULLANILMAZ

DIŞLAMALAR : purge canlıda YASAK · gerçek alıcıya gönderim YOK · gerçek tenant verisine
             dokunma YOK · ikinci sentetik tenant YOK · ayrı F04 finansal yarış koşumu YOK
             yeni özellik / gerçek tenant veri düzeltmesi YOK
             cutover veya migration TEKRAR ÇALIŞTIRILMAZ · otomatik DB restore YOK

Belirsiz mutasyon sonucunda otomatik tekrar YOK — önce salt-okuma ile uzlaştır.
Ölçülemeyen sonuç "yok" sayılmaz. Tek kullanımlık, devredilemez, koşum bitince tükenir.
```

**B — OFFİCE 33 · O-4 / O-4-LAWYER yenilemesi**

```text
Kapsam   : O-4 (GET /api/office sızıntı yok) · O-4-LAWYER (GET /api/lawyers/:id sızıntı yok)
Gerekçe  : §8.3 — #2553 ve #2555 tam bu projeksiyonları değiştirdi; RELEASE20 PASS'ı
           RELEASE21 için etkinlik kanıtı SAYILMAZ
Yöntem   : #2545 kabul yöntemi — canlı RELEASE21 dist + disposable PostgreSQL 5439 +
           sentetik tenant · CANLI DB'YE 0 YAZMA · canlı postgres'e yalnız salt-okuma SELECT
Sınırlar : id yetkilinin KENDİ listesinden keşfedilir (uydurulmuş id ile ölçme)
           ölçüm aracı paket DIŞI, sha raporlanır
           incelenen alan/kayıt sayısı YAZDIRILIR (0 = kör ölçüm = FAIL)
           ölçülemeyen sonuç "yok" sayılmaz → OLCULEMEDI + nonzero
           cutover/migration TEKRAR ÇALIŞTIRILMAZ
```

#### 8.11.6 Bağlayıcı kalıp — iki dışlama sınıfı eşittir

| Sınıf | Örnek | Hüküm |
|---|---|---|
| **İsmen dışlama** | F04 GO §3: "production DB'ye sentetik veri yazma … kapsamaz" | Meslektaş mesajı owner'ın **yazılı sınırını** kaldıramaz |
| **Kapsam sessizliği** | OFFİCE 33 GO'sunda O-serisi hiç geçmiyor | Yetki **pozitiftir, artık değildir**: "yasaklanmamış" ≠ "yetkili" |

İkisi de peer görevini durdurur. Ana yürütücünün yetkisi **mevcut yetki içinde iş dağıtımıyla**
sınırlıdır; **bir oturumun yetkisini genişletmek yalnız owner'ın kendi kanalındadır.** Aksi
hâlde yetki aklaması olur ve owner'ın yazılı sınırı üçüncü bir tarafın cümlesiyle kalkar.

### 8.12 A-03…A-06 CANLI KABUL KAPANDI · A-07 ÖLÇÜLEMEDİ (2026-09-09, append-only)

Owner GO'yu OFFİCE 33-F04'e **doğrudan** yazdı; koşum yapıldı. `runId f851d975` ·
tenant `off-acc-f851d975` · canlı RELEASE21 aday `2187a78b`.

#### 8.12.1 Sayaç

```text
KAPANDI 6/7   A-01 · A-02 · A-03 (53/53) · A-04 (27/27) · A-05 (12/12) · A-06 (17/17)
AÇIK    1/7   A-07 — OLCULEMEDI (hazırlık 5/5 PASS, yürütme BAŞLAMADI)
```

**A-07 PASS SAYILMAZ.** Yürütme izi yok; okuma + yetki negatifi kapanış yerine geçmez (§8.4).

#### 8.12.2 Ana yürütücünün bağımsız doğrulaması

Uygulayıcı raporu kanıt değildir. Ana yürütücü ölçümü ayrıca koştu (salt-okuma; canlı
postgres'e `docker exec` SELECT, süreç ve ACL için PowerShell):

| Ölçüm | F04 | Ana yürütücü | Sonuç |
|---|---|---|---|
| API PID | 50316, değişmedi | 50316 ayakta, `:8080` dinliyor, start **14:37:59Z** = cutover anı | ✅ **restart 0** |
| ENV dosyası ACL | SYSTEM sahip · `ulastelli` Read | Owner `NT AUTHORITY\SYSTEM` · `TELLI\ulastelli` **Read, Synchronize** | ✅ |
| ENV `LastWriteTime` | — | **14:37:38Z** (koşumdan önce) | ✅ dosya **hiç değişmedi** |
| Bayrak satırı | hiç açılmadı | `.env` içinde ilgili satır **YOK** | ✅ |
| `executionStatus` | NOT_RUN | `APPROVED` / **`NOT_RUN`** / `executedAt NULL` | ✅ fixture **tüketilmedi** |
| `Case.caseStatus` | ISLEMDE (DERKENAR'a geçmedi) | **`ISLEMDE`** | ✅ |
| Tenant içi `CaseStatusHistory` | 0 | **0** | ✅ |
| Migration ledger | — | **130 / 130 / 0 / 0** — değişmedi | ✅ |
| Global `CaseStatusHistory` | +0 | **930** — A-01'deki değerle aynı | ✅ |
| Kalıcı satır | 23 | `tenantId`'li **22** + `Tenant` satırı **1** = **23** | ✅ tam isabet |

Ek olarak, DELTA-A yürütme bağının **tüm tabloda** hiç yazılmadığı ölçüldü:
`CaseStatusHistory WHERE "approvalRequestId" IS NOT NULL` → **0**. İki yeni kolon üretimde
hâlâ kullanılmamıştır.

**İzolasyon:** ölçülen küresel deltanın tamamı kendi tenant'ımızın satırlarıdır
(tenant +1 · user +2 · case +1 · approval +1 · `CaseStatusHistory` **+0**). Bu, **ölçülen
kapsamda** değişiklik saptanmadığı anlamına gelir; birkaç sayaçtan bütün veritabanının
değişmediği sonucu çıkarılmaz.

#### 8.12.3 A-07 — ölçülen tek engel

```text
EnvFile : C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21\project\apps\api\.env
sahip   : NT AUTHORITY\SYSTEM
aktör   : TELLI\ulastelli — Read,Synchronize  ->  EPERM, bayrak satırı YAZILAMADI
görev   : HukukPlatform-API · Running · RunAs=ulastelli · RunLevel=Limited
kaynak  : C:\Ops\hukuk\bin\start-api.ps1:40  EnvFile = '...HY_W4_RELEASE21\...\.env'
```

Bu **C36 ENV-ACL sertleştirmesinin amaçlanan davranışıdır**; ürün kusuru değildir. Yetki
yükseltme denenmedi (owner kuralı: erişim engeli varsa kapı atlanmaz, gereken tek yükseltilmiş
komut bildirilir).

**Fail-closed doğru çalıştı:** bayrak hiç açılmadı · restart 0 · `finally` yolu bellekteki
değişkene değil **dosyadaki gerçeğe** baktı. Uç düzeyinden de kanıtlandı:
`POST /office-approvals/<id>/execute` → **403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`**.
Önceki turlarda bu yalnız yapılandırma düzeyinde gösterilebiliyordu.

#### 8.12.4 DÜZELTME — §8.11.5-A yanlış bayrak adı veriyordu

§8.11.5-A'daki GO taslağı A-07 için `OFFICE_APPROVAL_EXECUTOR_ENABLED` yazıyordu. **Yanlıştır.**
Koddan ölçüldü (hem kaynak hem **canlı dist**):

| Bayrak | Neyi açar | A-07 için |
|---|---|---|
| `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED` | yalnız kontrollü uç (`office-approval-controlled-execution.service.ts:55`) | **GEREKEN BUDUR** |
| `OFFICE_APPROVAL_EXECUTOR_ENABLED` | çapraz-tenant cron taraması (`office-approval-executor.config.ts:42`) | **GEREKMİYOR — açılmamalı** |

Kodun kendi yorumu: kabul bayrağı *"genel cron bayrağı `OFFICE_APPROVAL_EXECUTOR_ENABLED`'DAN
BAĞIMSIZDIR"*. Ölçüm: `office-approval-executor.service.ts` içinde `process.env` kullanımı
**sıfır**; `office-approval-executor.config.ts`'i **yalnız** cron servisi import ediyor.

**Sonuç — riski AZALTIR:** dar pencere, §10.2'de kaydedilen çapraz-tenant cron çarpışma
riskini **hiç doğurmaz**. Cron kapalı kalır. Bu, owner'ın seçenek (a) kararının maliyet
tahminini iyileştirir; kararı değiştirmez.

#### 8.12.5 Gereken tek yükseltilmiş eylem

Yükseltilmiş bir aktörün `.env` dosyasına tek satır yazması, ardından servisin yeniden
başlatılması; koşum sonrası satırın geri alınması. Zamanlanmış görev `ulastelli` altında
`Limited` düzeyde çalıştığı için **yükseltme yalnız dosya yazımı içindir**; restart'ın
yükseltme gerektirip gerektirmediği ölçülmemiştir (canlı restart denenmedi).

Bu bir **işletme/yetki** kararıdır; ne uygulayıcının ne ana yürütücünün yetkisindedir.

#### 8.12.6 Envanter şerhi — F04'ün kendi düzeltmesi kabul edildi

Koşum planı §2'nin üç kategorisi A-03…A-06'nın **kendi kabul yazmalarını saymıyordu**.
Doğrulanmış gerçek: kurulum 7 + A-07 fixture 2 + `Lawyer`/`StaffMember`/`ReportingLine`
kabul satırları + `AuditLog` 11 → kalıcı **23 satır**. Bu, #2549'da `OfficeApprovalRequest`
güncellemesinin sayılmamasıyla **aynı sınıf** hatadır: güncellenen ve türetilen satırlar da sayılır.

`purge` kullanılmadı · seyirci tenant kurulmadı (ikinci tenant yok) · kapanış `revoke-access`
doğrulandı (2 sentetik `User`: `isActive=false`, `tokenVersion=1`).

#### 8.12.7 Açık kalanlar

A-07 · O-4 / O-4-LAWYER yenilemesi (§8.3, hâlâ yetki bekliyor) · AK-1a/1b/1c ve AK-2
**KARAKTERİZE EDİLDİ / OWNER KARARI BEKLİYOR** (hüküm verilmedi, kod değişmedi) ·
AK-3/CAP-07 B-01 sınırı. **Bütünsel teslim İLAN EDİLMEZ** — §6 bitiş çizgisi değişmedi.

### 8.13 O-4/O-4-LAWYER KAPANDI · A-07'NİN GERÇEK MALİYETİ · CANLI PID DEĞİŞİMİ (2026-09-09, append-only)

#### 8.13.1 O-4 ve O-4-LAWYER — §8.3 yenilemesi TAMAMLANDI

Owner görevi OFFİCE 33'e doğrudan yetkilendirdi. Sonuç **PASS**:

```text
O-4        : GET /api/office      · incelenen alan-yolu 82 (RECURSIVE) · 0/7 sızıntı
O-4-LAWYER : GET /api/lawyers/:id · incelenen alan-yolu 38 (RECURSIVE) · 0/7 sızıntı
             id KEŞİFLE bulundu (listenin ilk kaydı) — tahmin yok
araç       : paket DIŞI · sha256 5E1664A4… (ilk kullanımdan ÖNCE kaydedildi)
             negatif kontrol 5/5 (gerçek deepWalk kodu çıkarılıp sınandı)
yöntem     : HY_W4_RELEASE21 dist · İKİNCİ süreç port 8181 · disposable PG 5439
             canlı süreç ve canlı DB HİÇ dokunulmadı
```

Ana yürütücü doğrulaması (salt-okuma): üretimde `o4-acc-%` tenant **0**; Tenant 7 · User 39 ·
Case 32 · `CaseStatusHistory` **930** · ledger 130/130 — F04 koşumu sonrasıyla **aynı**.
"Canlı DB yazma 0" iddiası **ölçülen kapsamda** doğrulandı.

**§8.3'ün "ETKİLENDİ → A-01 sonrası YENİLENİR" satırları artık kapalıdır.**

#### 8.13.2 Metodolojik boşluk — geriye dönük şerh (kapatılmadı, kaydedildi)

`#2545`'in orijinal aracı (`Measure-OfficeO1toO9.ps1`) `KeysOf()` ile **yalnız üst seviye**
anahtarlara bakıyordu. `/api/office` yanıtı `lawyers[]` ve `bankAccounts[]` **nested dizi**
taşır → üst-seviye tarama bu diziler içindeki bir sızıntıyı **kaçırabilirdi**.

RELEASE21 koşumunda sızıntı **yoktur** (recursive, 5/5 negatif kontrollü). Ancak `#2545`'in
O-4 PASS'i bu sınırla okunmalıdır. **Bağlayıcı kural: sızıntı taraması RECURSIVE olur;
üst-seviye anahtar taraması "alan yok" kanıtı sayılmaz.** Bu, kayıtlı "eksik desenle yapılan
ölçüm yanlıştır" sınıfının aynısıdır.

#### 8.13.3 CANLI PID DEĞİŞİMİ — A-01 pinleri bayat

```text
API : PID 50316 → 27312   başlangıç 15:30:03Z  (yerel 18:30:03, TRT = UTC+3)
WEB : PID 53612 → 22440   başlangıç 15:15:03Z  (yerel 18:15:03)
kök : İKİSİ DE  HY_W4_RELEASE21  →  RELEASE21 hâlâ canlı, SÜRÜM KAYMASI YOK
sağlık: GET /api/office → 401 · web / → 200   (uygulama ayakta)
```

**Zaman dilimi şerhi (zorunlu):** makine `Turkey Standard Time`, **UTC+3**;
`Win32_Process.CreationDate` **`Kind=Local`** döner. `.ToString('u')` yerel değere `Z` ekler ama
**çevirmez** — bu programda daha önce de tuzak olmuştur. Yukarıdaki değerler
`ToUniversalTime()` ile açıkça dönüştürülmüştür. Aynı dönüşüm: `.env` yerel 14:37:38 =
**11:37:38Z**.

#### 8.13.3.1 PIN bayat, KANIT değil — ayrım bağlayıcıdır

Restart'lar **15:15:03Z / 15:30:03Z**, yani kabul koşumundan (tenant oluşturma **12:34:53Z**)
**SONRA** gerçekleşti. Bu nedenle:

| Kavram | Durum |
|---|---|
| **Koşum penceresindeki PID** (API 50316) — *kanıt* | **GEÇERLİ** — F04'ün "restart 0" iddiası o pencereye aittir ve doğrudur |
| **Anlık canlı PID** (API 27312) — *durum* | A-01 kaydındaki pin **BAYAT**, yenisi yukarıdadır |

**Bayat olan PIN'dir, KANIT değildir.** Bu iki kavram ayrı tutulmazsa okuyan "kabul kanıtı
geçersiz" sanabilir; değildir. `.env` damgasının **11:37:38Z** (koşumdan da önce) kalması,
restart'ların bayrakla **ilgisiz** olduğunun ayrı kanıtıdır; DELTA-A hâlâ kapalıdır.

F04 restart'ların **tam dakika başında ve 15 dk arayla** olmasından zamanlanmış/watchdog
davranışı **hipotezi** kurdu. Hipotez kanıt değildir ve böyle kaydedilir; ölçülecekse doğru yer
görev geçmişi ve `hukuk-task-host` günlüğüdür.

Kabul kanıtları etkilenmedi: `.env` `LastWriteTime` 14:37:38 (değişmedi) · `OFFICE_APPROVAL*`
satırı yok · `CaseStatusHistory` 930 · ledger 130/130.

**Sebep ÖLÇÜLMEDİ.** Zamanlanmış görevler `Running`, son tetikleme 23:15:01, `LastTaskResult`
sıfır dışı — bundan sebep çıkarmak spekülasyon olur. Kayda geçen tek hüküm: **A-01 kaydındaki
PID pinleri artık geçerli değildir**; "bayat dinleyici" disiplini gereği yeni pinler yukarıdadır.

#### 8.13.4 A-07 — kalan maliyet BİR DEĞİL İKİ yetki kalemidir

Önceki kayıt (§8.12.5) A-07'yi "tek yükseltilmiş dosya yazımı" olarak sunuyordu. **Eksikti.**
Kapanış `revoke-access` `finally` yolunda koştu ve sentetik aktörlerin erişimi kapandı:

```text
off-f851d975-admin@office-acceptance.invalid  ADMIN  isActive=false  tokenVersion=1
off-f851d975-staff@office-acceptance.invalid  USER   isActive=false  tokenVersion=1
```

Kontrollü yürütme ucunun yetki zinciri (koddan ölçüldü):
`JwtAuthGuard` → `OfficeF01AuthorizationGuard` → serviste `assertEnabled()` → `role==='ADMIN'`
→ tenant'ın ofisi **sunucuda** çözülür → `isF01ActorAuthorized`. Yani **canlı bir oturum
açılışı şarttır**; `isActive=false` + `tokenVersion` artışı hem yeni login'i hem eski JWT'yi
geçersiz kılar.

**Sonuç: fixture hazır ama çalıştırılabilir değil.** İki yol vardır:

| Yol | Canlı DB maliyeti | Risk |
|---|---|---|
| **(a) Sentetik ADMIN'i yeniden etkinleştir** | **2 satır güncelleme** | Doğrulanmış fixture korunur (K5/K6 ön koşulları ölçülmüş durumda) |
| (b) Yeni `runId` ile baştan kurulum | 9+ yeni satır | Ölçülmüş ön koşul durumunun aynen yeniden üretilmesi garanti değil |

(a)'nın üstünlüğü ölçülmüştür, tahmin değildir: A-07'nin **beş ön koşulu**
(`APPROVED/NOT_RUN`, attempt 0, `caseStatus=ISLEMDE` ≠ intent `DERKENAR`, `savedIntent`
şekil-geçerli, `approverUserId` dolu) **şu anda doğrulanmış durumda duruyor** ve yeniden
üretilmek zorunda değildir. (b)'de hepsi yeniden kurulur ve **yeniden ölçülmesi gerekir**;
"aynısı çıkar" varsayılamaz. Ana yürütücü değerlendirmesi: **(a) daha dar ve kanıtı korur.** Ancak `revoke-access` önceki
yetkinin **kapanışıydı**; yeniden açılması yeni bir owner kararıdır ve burada varsayılmaz.

**A-07'nin tam kalan listesi:** ① yükseltilmiş `.env` yazımı
(`OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED=true`) · ② API restart · ③ sentetik erişimin
yeniden açılması (yol a veya b) · ④ execute + reconcile · ⑤ erişimin yeniden kapatılması ·
⑥ bayrak satırının kaldırılması + restart. **Cron bayrağı hiçbir adımda açılmaz.**

#### 8.13.5 Sabit referanslar

```text
A-03…A-06 kabul sonucu : OFFICE-A03-A07-CANLI-KABUL-SONUCU-R01.md @ ed80da5a (#2582, CI 9/9)
§8.12 kaydı            : 74d85d66 (#2583, CI 9/9)
kabul tenant'ı         : off-acc-f851d975 · approval cmtu2zfrt0003ef2wvv2e8c9z (APPROVED/NOT_RUN)
```

Sayaç **6/7**. A-07 açık. **Bütünsel teslim İLAN EDİLMEZ.**

### 8.14 CANLI BAŞLIK DÜZELTMESİ · CUTOVER MAKBUZU · ROLLBACK KAYIT KUSURU (2026-09-09, append-only)

CLIENT hattının bağımsız uzlaştırması (PR #2585, **başka oturum**) bu planda üç kayıt açığı
buldu. Üçü de ana yürütücü tarafından **bağımsız ölçümle doğrulandı**; ikisi burada kapanıyor,
biri owner kararına gidiyor.

#### 8.14.1 Canlı başlık bayattı — düzeltildi

Belge başlığı cutover'dan sonra üç ekleme (§8.11 · §8.12 · §8.13) boyunca hâlâ
*"Canlı: RELEASE20"* diyordu. Başlığa **güncel satır eklendi**; 2026-09-08 değeri silinmedi,
"BAYAT" olarak işaretlendi. **§8.2'nin (SABİT YAYIN ADAYI) satırına DOKUNULMADI** — o, cutover
öncesi durumu kaydeden tarihsel metindir ve tarihsel anlatı kaydırılmaz.

#### 8.14.2 Cutover makbuzu — kayda geçti

Makbuz depoda bir cutover sonuç kaydı olarak yoktu (runId yalnız F04'ün kabul belgesinde
geçiyordu). Ana yürütücü makbuzu kaynaktan okudu ve hash'ledi:

```text
dosya        CUTOVER-CUT-20260909-143723-0b9bc330.json
sha256       7DEED4E7F1A9AE543A9676DE706ACAD9AA92DD0CA45DB04E1D2B91AC4564C856
runId        CUT-20260909-143723-0b9bc330
phase        COMMITTED
verdict      C33_RELEASE21_CUTOVER_APPLIED_AND_VERIFIED
kapılar      pass 31 / total 31 · failedGates []
süre         2026-09-09T11:37:23Z → 11:39:04Z  (101 sn)
rollback     performed = false
dbMutations  0 · provisioningCalls 0 · forceKills 0
dbPre/dbPost 130|130|0|0|7660053627876716578|6|37|2  (İKİSİ AYNI)
authority    CONSUMED · claimConsumed true
```

`dbPre == dbPost` olduğundan **migration bu koşumda uygulanmamıştır**; ayrı işlemle daha önce
uygulanmıştı (§8.10.6 ile tutarlı).

#### 8.14.3 AÇIK KUSUR — rollback kaydındaki `buildId` yanlış

Ana yürütücünün bağımsız ölçümü (`HY_C33_RELEASE21_CANDIDATE/cutover-staging/generations/` ve
mühürlü `…R25_VERIFY_REPAIR_CANDIDATE_20260909T105432Z/evidence/`, **iki kopyada da aynı**):

```text
WEB-LAUNCHER-GENERATION.json
  forwardGeneration   id=R21  buildId=g91HUaBesekB-R2rRawQj   root=HY_W4_RELEASE21   ✅
  rollbackGeneration  id=R20  root=HY_W4_RELEASE20                                   ✅
                      buildId=lt2ag97od6jT4jHG2NX7N                                  ❌
```

Ölçülen BUILD_ID'ler: R18 `lt2ag97od6jT4jHG2NX7N` · R19 `xFgJAoTFqlTjW89Zf2CYS` ·
R20 `LW4jlJUOMHrvVEqakKB3i` · R21 `g91HUaBesekB-R2rRawQj`. Yani rollback kaydı **RELEASE18'in**
BUILD_ID'sini taşıyor; etiket ve release kökü doğru, yalnız `buildId` alanı eski nesilden
kalmış. (API tarafında karşılık gelen bir generation dosyası **yoktur**; kusur web kaydına özgüdür.)

**Sınıf: KAYIT kusuru, YETENEK kusuru değil.** Geri dönüş malzemesi sağlamdır — release kökü,
staged launcher'lar ve RELEASE20 `dist`/`.next` yerindedir. **Risk:** geri dönüş doğrulaması bu
alana göre yapılırsa **yanlış FAIL** üretir ve "düzeltme" adına RELEASE18'e yönelme riski doğar.

**Ana yürütücünün kusuru kayda geçer:** A-01 `COMPLETED` olarak kapatılırken bu alan
denetlenmedi. Rollback "performed=false" diye doğrulanmış olması, rollback **kaydının**
doğrulandığı anlamına gelmiyordu; kullanılmayan bir kapının kaydı da ölçülmeliydi. Kusuru
başka bir hattın (CLIENT) uzlaştırması yakaladı.

**Kapatılması owner kararıdır** — dosya mühürlü paket kapsamındadır ve ana yürütücü mührü
değiştirmez. İki seçenek:

| Seçenek | İçerik |
|---|---|
| **(A) Düzelt + yeniden mühürle** | `rollbackGeneration.buildId` → `LW4jlJUOMHrvVEqakKB3i`; paket yeniden mühürlenir |
| **(B) Owner onaylı erratum** | Paket dokunulmaz; geri dönüş doğrulamasının bu alan yerine `LW4jlJUOMHrvVEqakKB3i` değerini esas alacağı **yazılı** olarak kaydedilir |

Ana yürütücü değerlendirmesi: geri dönüş bugün **gerekmiyor** ve malzeme sağlam; (B) daha dar
ve mührü korur. Karar owner'ındır.

#### 8.14.4 Devralınan şerh — canlı host binary'si mühürlü kayıtta yok

CLIENT hattı ayrıca şunu kaydetti: fiilen çalışan `hukuk-task-host.exe` sha256'sı ne forward ne
rollback staged host ile eşleşiyor. Bu, `HOST-GENERATION.json`'daki
`byteExactReproducible: false` / `semanticIdentity: true` kaydıyla **tutarlıdır** (host yerel
derlenir; kimlik bağı `pins`'tir) ve C-02 `hostReplaced` kapısı geçmiştir. Yine de **çalışan
host'un sha256'sı hiçbir mühürlü kayıtta bulunmuyor** — denetlenebilirlik açığı olarak
devralınır, bu turda kapatılmaz.

#### 8.14.5 Sayaç etkisi

**YOK.** A-01 kapalı kalır (cutover uygulandı ve bağımsız doğrulandı); §8.14.3 bir **kayıt**
kusurudur ve teslim tablosunda **açık kalem** olarak görünür. Sayaç **6/7**, A-07 açık.

### 8.15 NİHAİ TESLİM TABLOSU · ERRATUM BAĞI · KALAN TEK ENGEL (2026-09-10, append-only)

Owner GO'su ("OFFICE SON KABUL VE TESLİM TAMAMLAMA") gereği tamamlanan tablo. **Bütünsel teslim
İLAN EDİLMEMİŞTİR** — koşullar §8.15.4'te tek tek gösterilmiştir.

#### 8.15.1 Kabul sınıfı etiketleri — karıştırılmaz

| Etiket | Anlamı | Canlı DB'ye yazma |
|---|---|---|
| **CK** | **CANLI KABUL** — canlı RELEASE21 üzerinde, sentetik tenant `off-acc-f851d975` ile | **VAR** (yalnız sentetik tenant; 23 kalıcı satır) |
| **İÖ** | **İZOLE ÖLÇÜM** — canlı derlenmiş dist + disposable PostgreSQL | **0** |
| **DV** | **DEVRALINAN** — RELEASE20 kabulü; aday deltası bu yüzeye dokunmadı | — |
| **AÇIK** | Kabul üretilmedi | — |

**İÖ, CK yerine geçmez.** İki sınıf teslim tablosunda ayrı sütunda tutulur.

#### 8.15.2 TESLİM TABLOSU — 12 hizmet

| # | Hizmet | Rol / yetki | Ürün-hukuki sınır | Canlı sürüm | Kabul sonucu | Kanıt konumu |
|---|---|---|---|---|---|---|
| **S-01** | Büro kimlik ve profili (`GET/PUT /office`) | F01-yetkili; kendi tenant'ı | S2 alan-minimizasyonu (F-B01-03/04) | RELEASE21 `2187a78b` | **CK A-03 PASS** (PUT) · **İÖ O-4 PASS** (GET, 82 alan-yolu, 0/7 sızıntı) | §8.13.1 · SONUÇ-R01 @ `ed80da5a` |
| **S-02** | Banka hesapları (`POST/PUT/DELETE /office/bank-accounts`) | F01-yetkili | Finansal veri minimizasyonu (`iban`) | RELEASE21 | **CK A-03 PASS** — yazma yolu ilk kez doğrudan kabul edildi | SONUÇ-R01 @ `ed80da5a` |
| **S-03** | E-posta/SMTP (`GET/PUT /office/smtp-settings`) | F01-yetkili | `smtpPass` MASKED/NULL | RELEASE21 | **CK A-03 PASS** · **DV O-1/O-3/O-5** | SONUÇ-R01 · #2545 |
| **S-04** | SMS (`GET/PUT /office/sms-settings`) | F01-yetkili | `smsApiKey`/`smsApiSecret` maskeli | RELEASE21 (rota) | **CK A-03 PASS** · **DV O-1/O-3/O-5** · ⚠ **sağlayıcı NOT_CONFIGURED** — ürün sınırı, kusur değil | SONUÇ-R01 · F05 kaydı |
| **S-05** | Karşılama ayarları | F01-yetkili | — | RELEASE21 | **CK A-03 PASS** · **DV O-1/O-3/O-5** | SONUÇ-R01 |
| **S-06** | İİK-78 ayarları | F01-yetkili | Ürünün uyguladığı İİK m.78 parametreleri; **genel hukuki uygunluk iddiası ÜRETİLMEZ** | RELEASE21 | **CK A-03 PASS** · **DV O-1/O-3/O-5** | SONUÇ-R01 |
| **S-07** | Vekalet süre-dolumu ayarları | F01-yetkili | S2 omit (`poaExpiryRecipientLawyerIds`) | RELEASE21 | **CK A-03 PASS** · **DV O-3** (EXACT 2 anahtar) | SONUÇ-R01 |
| **S-08** | Eskalasyon ayarları | F01-yetkili | S2 omit (3 alan) | RELEASE21 | **CK A-03 PASS** · **DV O-3/O-7/O-9** | SONUÇ-R01 · #2545 |
| **S-09** | Avukat yönetimi (9 rota `/lawyers`) | F01-yetkili; yetki/rütbe alanları H2 aktörüne kilitli | P01 credential omit · #2511/F-B01-05 DTO yazma sınırı | RELEASE21 | **CK A-04 PASS** (DTO reddi dâhil) · **İÖ O-4-LAWYER PASS** (38 alan-yolu, 0/7) | §8.13.1 · SONUÇ-R01 |
| **S-10** | Personel yönetimi (6 rota `/staff`) | Okuma oturumlu; yazma F01 | Liste maskeleme · `isActive` sınırı | RELEASE21 | **CK A-04 PASS** (yazma) · **CK A-05 PASS** (okuma, maskeleme) | SONUÇ-R01 |
| **S-11** | Raporlama hattı (6 rota `/reporting-lines`) | **Yalnız ADMIN** | D-WR-6 FOUNDER `ANY_ONE` | RELEASE21 | **CK A-06 PASS** — RELEASE20'de hiç kabul yoktu | SONUÇ-R01 |
| **S-12** | Büro onay akışı (8 rota `/office-approvals`) | Oturumlu aktör; `isApproverEligible` | ADR-009 tek onay motoru · OD-12/OD-13 OPTION B | RELEASE21 | ⛔ **AÇIK — A-07 OLCULEMEDI** (hazırlık 5/5 PASS, yürütme başlamadı) | §8.12.3 · §8.13.4 |

**Doğrudan canlı kabulü olan hizmet: 11/12.** Açık: **S-12**.

RELEASE20 tablosunda "doğrudan kabulü yok" olan dört hizmetten üçü (S-02 yazma yolu, S-10, S-11)
bu turda **CK ile kapandı**; dördüncüsü (S-12) A-07'ye bağlıdır.

#### 8.15.3 Release ve rollback kanıtları

| Kalem | Durum | Konum |
|---|---|---|
| Cutover makbuzu | ✅ `COMMITTED` · 31/31 · sha256 `7DEED4E7…` | §8.14.2 |
| Migration | ✅ ledger 129→130, ayrı işlem, cutover'da `dbPre == dbPost` | §8.14.2 · §8.10.6 |
| Rollback malzemesi | ✅ RELEASE20 kökü + staged launcher'lar byte-exact | ERRATUM §2.2 |
| Rollback **kaydı** (`buildId`) | ✅ **ERRATUM ile çözüldü** — hiçbir çalıştırılabilir yolda zorunlu kapı değil (ölçüldü) | `OFFICE-ROLLBACK-BUILDID-ERRATUM-R01.md` |
| Jeneratördeki kök neden | ⚠ **AÇIK** — dar düzeltme incelemeye sunuldu, **uygulanmadı**; literal kalırsa R21→R22 forkunda **tekrarlar** | ERRATUM §4 |
| Çalışan host sha256'sı | ⚠ **AÇIK** — hiçbir mühürlü kayıtta yok; sonradan ölçüm mühürlü kanıt SAYILMAZ | ERRATUM §5 |

**Owner kuralı uygulandı:** *"release/rollback kanıtları tam"* ayağı, host denetlenebilirlik
açığı nedeniyle **tam karşılanmamaktadır** ve bu açıkça kaydedilir — kapandı denmez.

#### 8.15.4 GO-COMPLETE koşulları — tek tek

| Koşul | Durum |
|---|---|
| A-07 kabulü doğrulanmış | ⛔ **HAYIR** — koşulmadı |
| Bayrak kapatma / erişim iptali / toparlanma doğrulanmış | ⛔ **HAYIR** — A-07'ye bağlı |
| Rollback kayıt kusuru operasyonel karşılığıyla çözülmüş | ✅ **EVET** — erratum + ölçülmüş tüketici analizi |
| Kayıt PR'ları CI PASS + squash-merge, main sync, temizlik | ✅ #2582 `ed80da5a` · #2583 `74d85d66` · #2584 `a76b119e` · #2586 `28f41b68` |

**İki koşul eksik olduğu için bütünsel teslim İLAN EDİLMEZ.** Sayaç **6/7**.

#### 8.15.5 Kalan tek somut engel

**F04 oturumu ARŞİVLENMİŞ durumdadır** (`isArchived: true`). Ana yürütücünün arşivden çıkarma
yetkisi/aracı **yoktur** — mevcut oturum yönetimi aracı yalnız arşivleyebilir. Owner arşivden
çıkarmayı onaylamıştır ancak işlemin **uygulamanın Arşiv listesinden owner tarafından** yapılması
gerekir.

Bu yapılmadan A-07 için hazırlık paketi F04'e iletilemez ve ikinci yürütücü oluşturma yasağı
gereği başka bir oturuma verilemez.

**Gereken eylem sırası:**

1. Owner, `OFFİCE 33 - F04` oturumunu Arşiv listesinden geri açar.
2. Owner, §8.15.6'daki GO metnini **F04'ün kendi kanalına** yazar.
3. F04 hazırlık paketini üretir ve doğrular (canlı yazma yok), owner'a **tek çalıştırılabilir
   paket** sunar.
4. Owner yükseltilmiş terminalinde `.env` satırını açar; F04 kabulü koşar; kapatma, erişim
   iptali ve toparlanma doğrulanır.
5. Ana yürütücü bütünsel teslim kaydını yayımlar.

#### 8.15.6 F04 için owner GO metni — owner'ın KENDİ kanalından yazılacak

Bu metin ana yürütücü tarafından **hazırlanmıştır**; yetki ancak owner onu F04'ün kendi
kanalına yazdığında doğar. Ana yürütücünün ilanı bu metnin yerine **geçmez**.

```text
OWNER GO — OFFICE A-07 KONTROLLU YURUTME KABULU (tek kullanimlik)

Kapsam   : A-07 (DELTA-A execute + reconcile). MEVCUT fixture ile devam - YOL (a).
Oturum   : bu oturum. Ikinci yurutucu olusturulmayacak; kanitlar ve harness korunacak.
Tenant   : off-acc-f851d975 (MEVCUT). Yeni tenant/runId kurulumuna KENDILIGINDEN GECME.

ON OLCUM (yurutmeden ONCE, yeniden olculecek):
  tenant/kimlik bagi · bes on kosul · fixture APPROVED/NOT_RUN · attempt=0 ·
  caseStatus=ISLEMDE. Tuketilmis execute islemini TEKRARLAMA.

ERISIM   : off-acc-f851d975 icindeki MEVCUT sentetik ADMIN erisiminin kayitli IKI SATIRLIK
           islemle YALNIZ kabul suresince yeniden acilmasi onaylidir.

BAYRAK   : YALNIZ OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED kontrollu acilip kapatilir.
           Buna bagli IKI API restart onaylidir. CRON BAYRAGI KAPALI KALACAK.
           .env yazimini OWNER kendi yukseltilmis terminalinde yapar.

YURUTUCUNUN HAZIRLIK YUKUMLULUGU (once hazirla ve DOGRULA, sonra owner'a sun):
  - gercek EnvFile yoluna bagli acma VE kapama yordamlari
  - ilk kullanim SHA-256 kayitlari
  - toparlanma (recovery) adimlari
  - owner'a TEK CALISTIRILABILIR PAKET
  Sirlari terminale veya rapora DOKME.
  KAPATMA VE TOPARLANMA YOLU HAZIR OLMADAN BAYRAGI ACMA.

KAPANIS (basarisizlikta DA, finally/recovery yolunda):
  bayragi kapat · API'yi yeniden baslat · sentetik erisimi revoke et · UCUNU DE DOGRULA.

DISLAMALAR: mevcut ACL'ler gevsetilmeyecek · arac reddi veya erisim kontrolu
  ATLATILMAYACAK · gercek tenant/alici islemi YOK · purge YOK · ayri finansal F04 kosumu YOK ·
  yeniden muhur/deploy/migration/rollback YOK.

Tek kullanimliktir, devredilemez, kosum bitince tukenir.
```

### 8.16 CANLI KESİNTİ · A-07 MALİYET DÜZELTMESİ · TOPARLANMA ÖLÇÜTÜ KUSURU (2026-09-10, append-only)

#### 8.16.1 CANLI KESİNTİ — teslim ilan edilemez

F04, A-07 ön ölçümüne başlarken canlıyı bozuk buldu. Ana yürütücü bağımsız doğruladı
(salt-okuma):

```text
5432 dinleyici ............................ YOK
com.docker.service ........................ Stopped · StartType = Manual
Docker Desktop / backend / dockerd ........ SUREC YOK
POST /api/auth/login  (gercek govde) ...... 500   <- DB'ye DOKUNUR
POST /api/auth/login  (bos govde) ......... 400   <- ValidationPipe, DB'ye DOKUNMAZ
GET  /api/office      (anonim) ............ 401   <- auth guard, DB'ye DOKUNMAZ
Web :3002 ................................. 200   <- Next DB'siz ayakta
API PID 27312 / WEB 22440 ................. ayakta, RELEASE21
```

**Gerçek etki: gerçek tenant'lar login olamıyor.** Bu, A-07'den önceliklidir.

**Bilinen olay sınıfı.** 2026-08-28'de aynısı yaşandı ve teşhisi kayıtlıdır: Docker autostart
**iki katmanda** kapalı (`settings-store.json AutoStart=false` **ve** `StartupApproved=03`),
bu hâliyle **her reboot aynı kesintiyi üretir**. Kurtarma emsali: **Docker'ı owner başlattı;
ajan start yetkisini KULLANMADI (0 kez)**; 4 HUKUK container'ı `unless-stopped` ile
kendiliğinden geldi. Bu turda da ne uygulayıcı ne ana yürütücü dokundu.

**Fark:** o gün API crash-loop'taydı (`onModuleInit → $connect` boot'ta düşüyordu). Şimdi API
ayakta — yani boot'ta DB **vardı**, sonradan gitti. Kesintinin başlangıç anı **ölçülmedi**;
spekülasyon yapılmaz. Ölçülecek doğru yer Docker Desktop günlüğü ve görev geçmişidir.

**A-03…A-06 kabulleri ETKİLENMEZ** — geçmişte ölçüldü ve kayıtlıdır. Kesinti bugünün
çalışabilirliğini etkiler, dünkü ölçümü geçersiz kılmaz.

#### 8.16.2 ANA YÜRÜTÜCÜNÜN İKİ KAYIT DÜZELTMESİ

**(a) §8.13.3'teki "uygulama ayakta (401/200)" ifadesi YETERSİZDİ.** O probe **DB kesintisini
göremez**: `GET /api/office` 401'i auth guard'dan, boş gövde 400'ü ValidationPipe'tan gelir ve
**ikisi de DB'ye dokunmadan** üretilir. Ölçtüğüm şey "HTTP katmanı ayakta"dır, "sistem
sağlıklı" değil. Kayıt bu şerhle okunur.

**(b) §8.13.3'teki `LastTaskResult` yorumu YANLIŞTI.** `0x800710E0` (= 2147946720) bir hata
kodu **değildir**; "çalışan örnek var" anlamında **sağlıklı** koddur. "Sıfır dışı, sebep
belirsiz" nitelemesi geri alınır.

#### 8.16.3 TOPARLANMA ÖLÇÜTÜ KUSURU — bağlayıcı düzeltme

F04'ün tespiti: koşum planı §3.4'ün "toparlanma" ölçütü **boş gövdeye dönen 400**'e
dayanıyordu. Bu ölçüt **DB kesintisini GÖREMEZ** — doğrulama katmanı DB'den önce çalışır.
Yani servis tamamen veritabansızken bile ölçüt PASS verirdi.

**Bağlayıcı düzeltme:** toparlanma ölçütü **DB'ye dokunan** bir sınama içerir:

```text
POST /api/auth/login  { gercek olmayan kullanici }
  -> 401 BEKLENIR (DB'ye ulasildi, kullanici yok)
  -> 500 gelirse VERITABANI YOK  -> toparlanma FAIL
```

Bu, kayıtlı **fail-open** sınıfının aynısıdır: *ölçülemeyen sonuç "yok" sayılmaz* ve
**gözlem kümesi boşken kendiliğinden sağlanan ölçüt geçersizdir**. Aynı sınama her "servis
sağlıklı" iddiası için geçerlidir.

#### 8.16.4 A-07 MALİYET DÜZELTMESİ — §8.13.4 yanlıştı

§8.13.4 yol (a)'yı *"2 satır güncelleme"* diye yazıyordu. **Çalışmazdı.** F04 ölçtü, ana
yürütücü koddan doğruladı — `auth.service.ts` login kapısı sırayla:

| Satır | Kapı | Sonuç |
|---|---|---|
| `:98` | `passwordHash` NULL mü? (K1-7: alan nullable) | 401 |
| `:102` | `bcrypt.compare(dto.password, user.passwordHash)` | 401 |
| `:120` | tenant lifecycle — **`isActive` kontrolünden ÖNCE** | 401 |
| `:124` | `isActive` | "Hesabınız devre dışı bırakılmış" |

`isActive=true` yapmak **tek başına yetmez**: kullanılabilir bir parola da gerekir. İlk koşumun
parolası G-4 gereği yalnız bellekte üretilmişti ve hiçbir yere yazılmamıştı → **kurtarılamaz**.

**Düzeltilmiş gerçek maliyet — hem daha dar hem farklı:**

| | §8.13.4 (yanlış) | Ölçülmüş doğru |
|---|---|---|
| Dokunulan satır | 2 (admin + personel) | **1** — yalnız ADMIN; personel satırı **dokunulmaz** |
| Alan | `isActive` | **`isActive` + taze `passwordHash`** |

Gerekçe: A-07'nin kontrollü yürütme ucu yalnız **ADMIN** aktörü ister; personel aktörü
A-04/A-05 kabullerine aitti ve onlar kapandı.

**Not:** `:120`'deki tenant lifecycle kapısı `isActive`'den **öncedir**; `off-acc-f851d975`
tenant'ının lifecycle değeri de koşum anında ölçülmelidir. DB erişilemediği için bu turda
**ölçülemedi**.

#### 8.16.5 A-07 paketi — durum

F04 owner GO'sunu kendi kanalından aldı ve çalıştırma paketini üretti (PR #2589,
`project/apps` deltası 0). Paketin kendi doğrulaması: **üç bağımsız kapı da bayrağı açmadan
durdurdu** (yükseltilmemiş komut `exit 2` · ön ölçüm `exit 1`, `PF-1.write` EPERM +
`PF-4.db` 500 + 13 ölçüt OLCULEMEDI · kapanış kuru koşum `exit 1`). GO'nun *"kapatma ve
toparlanma yolu hazır olmadan bayrağı açma"* şartı **kodla zorlanıyor**.

F04'ün ölçtüğü ikinci kusur: kanonik kökte `@prisma/client` ve `bcrypt` **yoktur**; sabit
gömülü yol owner'ın makinesinde "modül yok" ile düşerdi. Paket aday yolları sırayla dener ve
kullandığını yazdırır; ayrıca Prisma client'ın `approvalRequestId`/`approvalAttempt`
alanlarını tanıdığını sınar — tanımasa **kanıt sorgusu sessizce boş dönerdi** ve A-07 yine
ölçülemez kalırdı. Bu, "sessiz ölçülemezlik" sınıfının yeni bir örneğidir.

**Fixture ve beş ön koşul OLCULEMEDI** (DB yok); son bilinen durum **bayat** sayılır ve paket
koşum anında yeniden ölçer, tutmazsa durur.

#### 8.16.6 Koşum için gereken iki şey — ikisi de owner'da

1. Veritabanı ayağa kalksın (Docker Desktop owner tarafından başlatılır).
2. Owner yükseltilmiş terminalinde tek komutu koşsun.

Koşum sonrası ana yürütücüye gelecek üç kanıt: bayrak **KAPALI** (uçtan 403) · sentetik erişim
**İPTAL** (401) · servis **TOPARLANDI** (PID değişti + istek işliyor + **DB'ye dokunan sınama
geçti** — §8.16.3).

**Sayaç 6/7 · hizmet 11/12 · bütünsel teslim İLAN EDİLMEZ.**
