# PROGRAM-WIDE-OWNER-RESIDUALS-EXECUTION-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-OWNER-RESIDUALS-EXECUTION-REGISTER-R01.md
Task       : PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01
Parent     : PROGRAM-WIDE-SPRING-CLEANING-FULL-AUTHORIZED-EXECUTION-R01
Owner auth : FULL / RATIFIED (dokuz karar peşinen verilmiştir)
Durum      : EXECUTION REGISTER / NON-NORMATIVE
Baseline   : canonical main `26c42b69` (program başlangıcı)
Tarih      : 2026-07-27
```

Bu register dokuz ratifiye owner kararının uygulanma sonucunu taşır. Her kalem
**resolved · preserved · blocked · owner decision already applied · new owner decision required**
eksenlerinden biriyle etiketlenir.

## 1. ITEM-A01 — `ManifestAdminController` (OWNER DECISION: OPTION B — INTENTIONALLY DORMANT)

**Statü: `owner decision already applied` / RESOLVED — canonical kayıt oluşturuldu.**

```text
ManifestAdminController:
  IMPLEMENTED
  UNIT-TESTED
  NOT RUNTIME-BOUND
  INTENTIONALLY_DORMANT
  ACTIVATION AUTHORITY: NONE
```

### 1.1 Kanıt (fresh main `26c42b69` üzerinde yeniden doğrulandı)

```text
kod            : project/apps/api/src/modules/calc-preview/diagnostics/object-store/
                 manifest-retry/manifest-admin.controller.ts
route prefix   : @Controller('admin/manifest')
barrel export  : manifest-retry/index.ts:79 — VAR
module kaydı   : YOK — calc-preview.module.ts → controllers: [CalcPreviewController]
guard'lar      : ManifestAdminAuthGuard + ManifestAdminRateLimiter + ManifestAdminRateLimitGuard
                 calc-preview.module.ts:60-61'de REGISTER EDİLMİŞ
prefix tekilliği: repo genelinde 'admin/manifest' başka hiçbir controller'da tanımlı DEĞİL
unit test      : manifest-retry/__tests__/ altında mevcut
```

### 1.2 Bağlanmamış 8 endpoint

```text
POST /admin/manifest/bundles/:bundleId/retry
GET  /admin/manifest/retry-queue
GET  /admin/manifest/dlq
GET  /admin/manifest/retry/dlq
GET  /admin/manifest/retry/jobs
POST /admin/manifest/dlq/:dlqId/redrive      ← DLQ MUTASYONU
POST /admin/manifest/dlq/:dlqId/resolve      ← DLQ MUTASYONU
POST /admin/manifest/dlq/:dlqId/... (resolve varyantı)
```

**Mutasyon riski:** `redrive` ve `resolve` dead-letter kuyruğunun durumunu değiştirir.
Bunları canlı HTTP yüzeyine eklemek, hukuki/finansal bir sistemde yeni bir yönetimsel
mutasyon yüzeyi açmak demektir.

### 1.3 Neden activation YAPILMADI

```text
owner kararı            : OPTION B — INTENTIONALLY DORMANT (bu görevde ratifiye edildi)
görev authority sınırı  : "Bu görev YETKİLENDİRMEZ: ManifestAdminController activation,
                           new admin HTTP surface, DLQ mutations"
canonical authority     : controller'ın register edilmesini yetkilendiren kayıt YOK
```

Guard'ların register edilmiş olması **activation kanıtı değildir** — altyapı canlı, koruduğu
route yoktur. Yüzeysel "guard var, demek ki endpoint çalışıyor" çıkarımı bu vakada yanlıştır.

### 1.4 Gelecekte activation için gerekli ayrı bounded GO şartları

```text
1. Operasyonel ihtiyacın kanıtı — manifest retry/DLQ yönetiminin gerçekten gerektiği
2. 8 endpoint'in her biri için exact yetkilendirme (özellikle redrive/resolve mutasyonları)
3. ManifestAdminAuthGuard'ın yetki modelinin owner tarafından doğrulanması
4. Rate limiter eşiklerinin doğrulanması
5. DLQ mutasyonları için audit/geri alma davranışının tanımlanması
6. calc-preview.module.ts controllers: dizisine ekleme + kardeş servislerin provider kaydı
7. Gerçek runtime smoke (unit test YETERLİ DEĞİL)
```

**Production kodu bu görevde DEĞİŞTİRİLMEDİ.**

## 2. ITEM-A02 — OFFICE Password Recovery (OWNER DECISION: OPTION A — GO-DOCS CANONICAL CLOSURE)

**Statü: `owner decision already applied` / RESOLVED — canonical truth kaydı oluşturuldu.**

```text
OFFICE_PASSWORD_RECOVERY_ENABLED

CODE DEFAULT      : FALSE
                    project/apps/api/src/modules/auth/password-reset/password-reset.service.ts:40
                    String(config.get("OFFICE_PASSWORD_RECOVERY_ENABLED") ?? "").toLowerCase() === "true"

LOCAL OWNER RUNTIME: ENABLED

E2E               : OWNER-VERIFIED

DEPLOYMENT CLASS  : LOCAL SINGLE-PC / NON-PRODUCTION

PRODUCTION CLAIM  : NONE
```

### 2.1 Kanıt sınıflarının ayrımı

| Eksen | Kaynak | Sınıf |
| --- | --- | --- |
| Kod default'unun `false` olması | repository — `password-reset.service.ts:40` | **REPOSITORY EVIDENCE** |
| Canonical kaydın *"code-level false kalır"* demesi | `decision-log.md` + `pending-migration-coordination-register.md` §9.4 | **REPOSITORY EVIDENCE** |
| Local runtime'da flag'in açık olması | owner beyanı | **OWNER TESTIMONY — repository kanıtı DEĞİL** |
| E2E zincirinin çalışması (forgot-password → SMTP → teslim → reset → tokenVersion artışı → yeni parola ile login) | owner tanıklığı, owner'ın kendi tarayıcısı | **OWNER TESTIMONY — repository kanıtı DEĞİL** |

Owner tanıklığı geçerli bir kanıttır fakat **repository kanıtı ile aynı sınıfa konulamaz**;
bu ayrım kasıtlı olarak korunmuştur.

### 2.2 Kod default'u vs runtime override

```text
kod default    : KAPALI  — yeni bir ortam hiçbir şey yapılmazsa özelliği KAPALI bulur
runtime override: owner'ın local çalışma ortamındaki untracked .env dosyasında AÇIK
```

Bu iki eksen birbirinin yerine geçmez. Bu vaka, program genelinde uygulanan
**"kod default'u = gerçek değer" varsayımının yanlış olduğunun kanıtıdır** ve ITEM-A03'te
18 flag'in `DEPLOYED_VALUE: UNKNOWN` bırakılmasının gerekçesidir.

### 2.3 Bu kaydın YAZMADIKLARI

```text
.env dosya içeriği · connection string · SMTP host/user/parola · token · reset link
· e-posta adresi · herhangi bir credential   →  HİÇBİRİ YAZILMADI
```

Bu görev **flag değerini DEĞİŞTİRMEZ**; yalnız canonical truth kaydını düzeltir.
`OFFICE-AUTH-P02` runtime aktivasyonunun **production** yetkisi hâlâ yoktur.

## 3. ITEM-A03 — 18 runtime flag (OWNER DECISION: OPTION B — UNKNOWN KALSIN)

**Statü: `owner decision already applied` / RESOLVED — statik envanter tamamlandı, deployed value okunmadı.**

`.env`, production config veya secret store **okunmamıştır**. Hiçbir flag için deployed value
tahmini yapılmamıştır.

### 3.1 ÖNCEKİ SAYIMIN DÜZELTİLMESİ

`PROGRAM-WIDE-DORMANT-DEFAULT-OFF-REGISTER-R01.md` §1 bu 18 tanımlayıcıyı
*"17 kod-default KAPALI, 1 AÇIK"* olarak saymıştı. Fresh main üzerinde yapılan tanım-yeri
doğrulaması bu sayımın **yanlış** olduğunu göstermiştir. Doğru dağılım:

```text
14  runtime feature flag  — kod default KAPALI
 2  runtime feature flag  — kod default AÇIK    (!== 'false' deseni)
 2  test-only env switch  — production feature flag DEĞİL
```

### 3.2 Statik envanter

| # | Flag | Tanım yeri | Kod default | Spec sayısı |
| --- | --- | --- | --- | --- |
| F-01 | `POA_EXPIRY_NOTIFICATION_ENABLED` | `modules/automation/automation.service.ts:19` | KAPALI | 3 |
| F-02 | `LEGAL_TIME_CUTOVER` | `modules/automation/workflow-engine.service.ts:474` (+ `debtor.service.ts:408`) | KAPALI | 4 |
| F-03 | `LEGAL_TIME_SHADOW_ENABLED` | `modules/legal-time-shadow/legal-time-shadow.service.ts:57` | KAPALI | 2 |
| F-04 | `CASE_TASK_ESCALATION_ENABLED` | `modules/escalation/case-task-escalation.service.ts:41` | KAPALI | 1 |
| F-05 | `EXPENSE_REMAINING_GATE_ENABLED` | `modules/expense-request/expense-gate.service.ts:11` | KAPALI | 2 |
| F-06 | `FEE_AGREEMENT_RECOMMENDATION_ENABLED` | `modules/client-settlement/distribution-recommendation.service.ts:33` | KAPALI | 1 |
| F-07 | `ICRABOT_OUTBOX_CRON_ENABLED` | `modules/icrabot/v28-engine/outbox.constants.ts:61` | KAPALI | 1 |
| F-08 | `PHASE9_REDIS_ENABLED` | `modules/calc-preview/diagnostics/simulation-api/redis/redis-config.ts:79` | KAPALI | 0 |
| F-09 | `GUIDED_OPEN_AUTHZ_MODE` | `modules/permission-diagnostics/guided-open-observe.service.ts:33` | boş → mod seçimi yok | 3 |
| F-10 | `OFFICE_PASSWORD_RECOVERY_ENABLED` | `modules/auth/password-reset/password-reset.service.ts:40` | KAPALI | 2 |
| F-11 | `BREAK_GLASS_ENABLED` | `modules/calc-preview/break-glass/break-glass.config.ts:124` | `parseBoolean(..., DEFAULT_BREAK_GLASS_ENABLED)` | 0 |
| F-12 | `ERROR_LOG_RETENTION_ENABLED` | `modules/error-log/retention/error-log-retention.config.ts:54` (`parseBool`) | KAPALI | 2 |
| F-13 | `OFFICE_APPROVAL_EXECUTOR_ENABLED` | `modules/office-approval/office-approval-executor.config.ts` | KAPALI (yokluk dahil) | 1 |
| F-14 | `ENABLE_CHAOS_ENDPOINTS` | `modules/calc-preview/chaos/chaos.module.ts:23` | KAPALI | 0 |
| **F-15** | `SIMULATION_API_ENABLED` | `app.module.ts:128` — `!== "false"` | **AÇIK** | 0 |
| **F-16** | `PHASE7_ENABLED` | `modules/calc-preview/diagnostics/simulation-api/phase7-config.ts:54` — `!== 'false'` | **AÇIK** | 15 |
| T-01 | `ADR014_OBSERVATION_ENABLED` | yalnız `scripts/__tests__/` | **test-only switch** | 1 |
| T-02 | `ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED` | yalnız `scripts/__tests__/adr014-disabled-local-evidence-harness.security.spec.ts` | **test-only switch** | 2 |

### 3.3 Her flag için operasyonel durum

```text
CODE_DEFAULT      : yukarıdaki tabloda — ÖLÇÜLDÜ
DEPLOYED_VALUE    : UNKNOWN — okunmadı, tahmin edilmedi
OPERATIONAL STATUS: O15 UNKNOWN
```

**Kritik asimetri:** F-15 ve F-16 `!== 'false'` desenini kullanır; yani **hiçbir ortam
değişkeni tanımlanmazsa AÇIK** çalışırlar. Diğer 14 flag'in tersidir. Bu asimetrinin
bilinçli bir tasarım kararı olup olmadığı **doğrulanmamıştır** ve bu register bunu
defekt olarak işaretlememektedir; yalnız kayıt altına alır.

### 3.4 Canonical activation kaydı

18 tanımlayıcının hiçbiri için repository'de bir **canonical activation kaydı** bulunmamıştır.
Tek istisna F-10'dur ve o da repository kaydı değil owner tanıklığıdır (§2).

## 4. Uygulanan kararların özeti (bu register kapsamı)

| Item | Owner kararı | Sonuç |
| --- | --- | --- |
| ITEM-A01 | OPTION B — intentionally dormant | **RESOLVED** — canonical kayıt yazıldı, kod değişmedi |
| ITEM-A02 | OPTION A — GO-DOCS canonical closure | **RESOLVED** — canonical truth yazıldı, flag değişmedi, secret yazılmadı |
| ITEM-A03 | OPTION B — UNKNOWN kalsın | **RESOLVED** — statik envanter tamamlandı + önceki yanlış sayım düzeltildi |

```text
FEATURES ENABLED        : 0
RUNTIME BINDINGS        : 0
PRODUCTION CODE CHANGED : 0
SECRETS WRITTEN         : 0
```
