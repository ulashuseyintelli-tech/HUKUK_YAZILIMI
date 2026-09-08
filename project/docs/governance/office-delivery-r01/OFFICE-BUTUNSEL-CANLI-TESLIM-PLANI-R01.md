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
