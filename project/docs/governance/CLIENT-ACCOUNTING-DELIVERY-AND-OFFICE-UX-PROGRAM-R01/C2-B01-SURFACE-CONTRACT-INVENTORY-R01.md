# C2-B01 — KVKK/C3 YÜZEY ENVANTERİ VE SÖZLEŞME OKUMASI (R01)

```text
BLOK:      CAD C2-B01 (ekran YAZILMADI — ANALYSIS_DELIVERED)
BASELINE:  origin/main 1a564fec (fresh; #2265 bccfe1e7 + #2272 ANCESTOR_OK)
PRE-FLIGHT: açık CLIENT PR=0 · X2 in-flight manifest=YOK · overlap=YOK · karar=YÜRÜDÜ
KURAL:     backend sözleşmesi YENİDEN YAZILMAZ; eksik endpoint bulunmadı →
           NEW FINDING yok, B02–B04 implementasyonu bu envanteri TÜKETİR.
```

## 1. RIZA (CONSENT) — `client/client-consent.controller.ts`

```text
GET  /clients/:id/consents            (listeleme)
POST /clients/:id/consents            (kayıt)
POST /clients/:id/consents/revoke     (geri çekme)
```
B02 tüketimi: salt-görüntü + mevcut aksiyonlar; yeni yetki modeli KURULMAZ.

## 2. AYDINLATMA TESLİM — `client/client-kvkk-rights.controller.ts` + `client-disclosure.service.ts`

```text
GET  /clients/disclosure-texts                    (sürümlü metin listesi)
POST /clients/disclosure-texts                    (yeni sürüm)
GET  /clients/:id/disclosure-deliveries           (teslim kayıtları — sürüm+tarih)
POST /clients/:id/disclosure-deliveries           (teslim kaydı)
```
B02 zorunluluğu "hangi SÜRÜM hangi tarihte" bilgisi delivery kaydında mevcut
(`ClientDisclosureText` sürümleme + `ClientDisclosureDelivery`).

## 3. DSAR / BİLGİ TALEPLERİ — `client/client-kvkk-rights.controller.ts`

```text
GET  /clients/data-subject-requests                        (kuyruk)
POST /clients/:id/data-subject-requests                    (kayıt)
POST /clients/data-subject-requests/:requestId/start-review
POST /clients/data-subject-requests/:requestId/assign
POST /clients/data-subject-requests/:requestId/respond
DURUM MAKİNESİ (backend'ten): RECEIVED → IN_REVIEW → RESPONDED (assign ayrı eksen)
```
B03 kuralı: UI kendi durum makinesini KURMAZ — bu geçişleri projekte eder.
NOT: address-discovery modülündeki `client-info-request.*` AYRI bir yüzeydir
("Bilgi Talepleri" boş-durum metni C1-B02'de düzeltildi — C2 O DOSYAYA DOKUNMAZ).

## 4. LEGAL HOLD + SİLME DEĞERLENDİRME — `client/client-legal-hold.controller.ts` + `client-data-lifecycle-gate.ts`

```text
GET  /clients/legal-holds
POST /clients/:id/legal-holds
POST /clients/legal-holds/:holdId/request-release
POST /clients/legal-holds/:holdId/approve-release      (iki-adımlı release)
POST /clients/:id/deletion-evaluation
FAIL-CLOSED GEREKÇE SETİ (lifecycle gate — 8 koşul, kullanıcıya AÇIK gösterilecek):
  RECORD_FAMILY_OWNER_CONFIRMED · BUSINESS_TERMINAL_EVENT_CONFIRMED ·
  RETENTION_LEGAL_BASIS_CONFIRMED · EVIDENCE_DEPENDENCY_CLEARED ·
  CROSS_DOMAIN_DEPENDENCY_CLEARED · NO_ACTIVE_LEGAL_HOLD ·
  REFERENCE_INTEGRITY_ASSESSED · AUTHORIZED_DELETION_METHOD_SELECTED (K8.5: bugün SEÇİLİ DEĞİL)
```
B03 kuralı: hold aktifken kısıtlı aksiyonlar GÖRÜNÜR-kısıtlı; "sahte aktif" buton YOK.

## 5. ÖZEL NİTELİKLİ VERİ — `client/client-special-category.controller.ts` + service

```text
GET  /clients/:id/special-category-records
POST /clients/:id/special-category-records
GET  /clients/special-category-records/:recordId
FAIL-CLOSED: env CLIENT_SPECIAL_CATEGORY_DATA_KEY yoksa →
  "Özel nitelikli veri anahtarı yapılandırılmamış — işlem fail-closed reddedildi (K7.3)"
  Kategori md.6 kapalı listesi dışı → "…(K7.1) — fail-closed RED"
```
B04 kuralı: varsayılan GİZLİ; açma yetki+audit'e bağlı; anahtar-yok durumu operatöre
AÇIKÇA gösterilir (mesajlar backend'ten hazır geliyor — UI yeniden ÜRETMEZ).

## 6. EFEKTİF CAPABILITY / POA — `client/client.controller.ts`

```text
GET /clients/:clientId/action-catalog        (aksiyon kataloğu — mevcut projeksiyon)
GET /clients/lifecycle-eligibility           (Pasifleştir gate sinyali, salt-okunur)
POA canonical kaynağı: client-poa-capability (ClientPowerOfAttorney) — B04 PROJEKTE
eder, YENİDEN HESAPLAMAZ (XL-D: eligibility yüzeyleri READ-ONLY).
```

## SONUÇ

Beş yüzeyin TAMAMI mevcut backend sözleşmesiyle karşılanabilir; eksik endpoint YOK.
B02–B04, `apps/web/src/lib/api/client-compliance.ts` (YENİ) istemcisiyle bu route'ları
tüketir; hata/fail-closed mesajları backend'ten geçirilir (yeniden üretilmez).
Yerleşim kararı (sekme/route/panel) B02 başında mevcut `(dashboard)/clients/[clientId]`
desenine bakılarak verilecek (çözüm dayatması yasağı).
```text
BLOCK RESULT: ANALYSIS_DELIVERED
```
