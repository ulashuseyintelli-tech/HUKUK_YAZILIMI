# C1-B04 — CANARY DELIVERY: PROVIDER_CONFIGURATION_REQUIRED (R01)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    C1-B04-CANARY-PROVIDER-CONFIG-REQUIRED-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER GO-COMPLETE (C1-B04) + SAFE-CANARY-ENVIRONMENT-R01 +
              STOP-PASSWORD-LOOP owner directives (2026-08-09)
VERDICT:      C1-B04 = PAUSED / PROVIDER_CONFIGURATION_REQUIRED
              REAL DELIVERY = 0 · PIPELINE/PDF = VERIFIED
              (PASS veya ENGINEERING_COMPLETE İLAN EDİLMEDİ)
RC (pinned):  Web RC2 45b24a0cefec806399db81cba32fd3ad85ff5e95 ·
              API RC 1488063d60f52616d8a30debafdb6a2705fd7615 (değişmedi)
```

## 1. NE KANITLANDI (VERIFIED)
- **İzole canary DB** kuruldu: `hukuk_canary_c1b04` — fingerprint
  `NON_PRODUCTION / ISOLATED_CANARY`, production bağlantısı YOK, gerçek veri
  kopyalanmadı, **121 canonical migration = RC frontier**, tek sentetik tenant
  (`demo-firma-canary`) + minimal fixture.
- **Statement üretimi:** client-level ekstre (SYSTEM_MONTHLY_STATEMENT aktör),
  2 satır, closing −2250.50 TRY, dönem 2026-08.
- **PDF + attachment:** `ekstre-genel-20260731-20260831.pdf` (application/pdf) —
  notification metadata'sında kanıtlı.
- **deliveryMode = PORT** (gerçek provider yolu bağlı); dispatch provider'a ulaştı.
- **Dedupe tasarımı:** SENT-varsa-skip + kalıcı-defter (X3 şemasına bağlı, şu an
  `persistentDeliveryLedger:false` → mevcut ClientNotification dedupeKey ledger'ı
  READ-ONLY). FAILED kayıt dedupe'u BLOKLAMAZ (yalnız SENT bloklar).

## 2. EXACT BLOCKER (provider/authentication)
Gerçek SMTP turunda provider **535** döndü:
`535 5.7.8 Error: authentication failed` (smtp.yandex.com:465, SSL).
Owner talimatı gereği **535'ten "yanlış parola türü" çıkarımı YAPILMADI**.
Kök neden aday kümesi (daraltılmadı): credential değeri · mailbox için SMTP/harici
istemci erişiminin kapalı olması · host/port/TLS uyuşmazlığı · hesap kilit/throttle.

## 3. SECRETLESS CONFIG DOĞRULAMA (read-only, değer basılmadı)
| Kontrol | Sonuç |
|---|---|
| SMTP user EXACT = hedef mailbox | true |
| From EXACT = hedef mailbox | true |
| host/port/TLS geçerli SSL kombosu (smtp.yandex.com:465 secure) | true |
| Mailbox SMTP/harici-istemci erişimi açık mı | **UNKNOWN** (provider-tarafı) |
| Hesap kilitli/throttled mı | **UNKNOWN** (provider-tarafı) |

## 4. SECRET DISCIPLINE / EXPOSURE (owner-ratified sınıflandırma)

```text
REPOSITORY/LOG/PR EXPOSURE: 0
CHAT TRANSCRIPT EXPOSURE:    YES / CREDENTIAL COMPROMISED
ROTATION REQUIRED:          YES
```

- **REPOSITORY/LOG/PR EXPOSURE = 0:** SMTP parolası ajan tarafından hiçbir dosya,
  commit mesajı, PR açıklaması, log veya çıktıya YAZILMADI. Parola izole canary'ye
  owner-run hidden-stdin script'iyle girildi; **iş sonunda `smtpPass=NULL`** yapıldı
  (row-count=1, `passNowNull:true` doğrulandı). Geçici owner-run script'leri
  repo/worktree DIŞI task dizininden kaldırıldı; RC immutable worktree
  `git status --porcelain=v1 --untracked-files=all` = 0 satır.
- **CHAT TRANSCRIPT EXPOSURE = YES / CREDENTIAL COMPROMISED:** canlı denemede owner
  parolayı yanlışlıkla oturum sohbet transkriptine düşürdü. Bu bir credential
  compromise'dir — repo/log/PR temiz olması bunu telafi ETMEZ.
- **ROTATION REQUIRED = YES:** ilgili hesabın credential'ı owner tarafından rotate
  edilmelidir. (Parolanın kendisi, parçaları veya transkript bağlantısı bu kayda
  BİLİNÇLİ olarak yazılmamıştır.)

## 5. PRODUCTION-CLASS RECONCILIATION (ADIM 1 — tamamlandı)
B04 denemesi sırasında production-class `demo-firma` (hukuk_db) üzerinde oluşan
mutation'lar exact-ID envanterlendi (PRE_EXISTING vs CREATED_BY_B04) ve exact-ID
rollback ile geri alındı (row-count assertion'ları OK):
- client.email → NULL (öncesi NULL kanıtlı)
- ClientStatement + 4 line → delete
- FAILED ClientNotification → delete
- 10 MessageTemplate (seedDefaultTemplates) → delete
- Office SMTP alanları → temizlendi
- AuditLog `CLIENT_STATEMENT_GENERATED` → **KORUNDU** (audit bütünlüğü, bilinçli)

## 6. B05'E DEVREDİLEN GATE (owner direktifi #7)
**Production aktivasyonunda plaintext `smtpPass` YASAK.** Kalıcı ve şifreli
credential yönetimi zorunlu: `CREDENTIAL_ENCRYPTION_KEY` yapılandırılmalı ve
secret'lar `office-credential-encryption.util.ts` (AES-256-GCM) ile at-rest şifreli
saklanmalı. Mevcut RC `.env`'inde `CREDENTIAL_ENCRYPTION_KEY` YOK → app secret'ları
legacy düz-metin okuyor (VERIFIED). Bu, C1-B05 PRODUCT_COMPLETE sertifikasyonunun
zorunlu bir aktivasyon gate'idir.

## 7. SONRAKI DENEME KOŞULU (owner direktifi #6)
Gerçek teslim yeniden denemesi ANCAK kalıcı + şifreli credential yönetimi
hazırlandıktan sonra yapılır; owner her çalıştırmada yeniden parola GİRMEYECEK.

## 8. KORUNAN ARTIFACTLAR (SİLME — B04 RESUMPTION tamamlanana kadar)
- İzole canary DB `hukuk_canary_c1b04` — **B04 RESUMPTION** tamamlanana kadar korunur.
- RC2 branch `rc2/c1b03-authfix` + dört runtime/rollback dizini — SİLİNMEZ.

## 9. VERDICT / STATUS
```text
C1-B04       = PAUSED / PROVIDER_CONFIGURATION_REQUIRED  (REAL DELIVERY = 0)
C1-B05       = NOT ELIGIBLE / WAITING_FOR_PREDECESSOR
NEXT ELIGIBLE = C1-B04 provider remediation/resumption
```
Pipeline (statement + PDF + attachment + dispatch-to-provider + dedupe tasarımı) =
VERIFIED. Gerçek inbox teslimi, geçerli/şifreli SMTP credential yönetimi hazır
olduğunda ayrı mini-adımda yapılacaktır. C1-B04 **ENGINEERING_COMPLETE DEĞİLDİR** ve
C1-B05 predecessor gate'i (B04 gerçek canary teslimi) aşılmadan başlamaz.
