# PROGRAM-WIDE-DORMANT-DEFAULT-OFF-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-DORMANT-DEFAULT-OFF-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING — ADDENDUM
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Kod-seviyesi default-OFF ve bilinçli dormant yüzeylerin envanteri.
             Hiçbir flag'i AÇMAZ ve açma yetkisi ÜRETMEZ.
Baseline   : canonical main `f8b7a912`
Tarih      : 2026-07-27
```

## 0. Kanıt sınırı — bu register neyi söyler, neyi söylemez

Her satırdaki **`KOD DEFAULT`** sütunu repository'den deterministik olarak okunmuştur.
**`DEPLOY EDİLMİŞ DEĞER` sütunu YOKTUR** ve kasıtlı olarak yoktur: bu oturum hiçbir `.env`,
production konfigürasyonu veya çalışan runtime okumamıştır. Bir flag'in kod-seviyesi
default'unun `false` olması, **deploy edilmiş ortamda da `false` olduğu anlamına gelmez** —
tersi de geçerlidir (bkz. `WRITTEN-BUT-NOT-OPERATIONAL` §4: kod default'u kapalı olan bir
flag owner'ın runtime `.env`'inde açık ve E2E doğrulanmıştır).

Bu nedenle her satırın gerçek çalışma durumu `O15 UNKNOWN_OPERATIONAL_STATE`'tir.

## 1. O03 — RUNTIME_BOUND_NOT_ENABLED: kod-seviyesi default-OFF flag'ler (17)

Hepsi register edilmiş servislerde okunur (yani binding VAR, enablement kod default'unda YOK).

| # | Flag | Kod konumu | Kod default |
|---|---|---|---|
| F-01 | `POA_EXPIRY_NOTIFICATION_ENABLED` | `automation/automation.service.ts:19` | `=== 'true'` → KAPALI |
| F-02 | `LEGAL_TIME_CUTOVER` | `automation/workflow-engine.service.ts:474`, `debtor/debtor.service.ts:408` | `=== "true"` → KAPALI |
| F-03 | `LEGAL_TIME_SHADOW_ENABLED` | `legal-time-shadow/legal-time-shadow.service.ts:57` | `=== "true"` → KAPALI |
| F-04 | `CASE_TASK_ESCALATION_ENABLED` | `escalation/case-task-escalation.service.ts:41` | `=== "true"` → KAPALI |
| F-05 | `EXPENSE_REMAINING_GATE_ENABLED` | `expense-request/expense-gate.service.ts:11` | `=== 'true'` → KAPALI |
| F-06 | `FEE_AGREEMENT_RECOMMENDATION_ENABLED` | `client-settlement/distribution-recommendation.service.ts:33` | `=== 'true'` → KAPALI |
| F-07 | `ICRABOT_OUTBOX_CRON_ENABLED` | `icrabot/v28-engine/outbox.constants.ts:61` | `=== 'true'` → KAPALI |
| F-08 | `PHASE9_REDIS_ENABLED` | `…/simulation-api/redis/redis-config.ts:79` | `=== 'true'` → KAPALI |
| F-09 | `GUIDED_OPEN_AUTHZ_MODE` | `permission-diagnostics/guided-open-observe.service.ts:33` | mod seçimi; boş default |
| F-10 | `OFFICE_PASSWORD_RECOVERY_ENABLED` | `auth/password-reset/password-reset.service.ts:40` | `=== "true"` → KAPALI ⚠️ **runtime'da AÇIK** (§3) |
| F-11 | `BREAK_GLASS_ENABLED` | `calc-preview/break-glass/break-glass.config.ts:124` | `parseBoolean(..., DEFAULT_BREAK_GLASS_ENABLED)` |
| F-12 | `ERROR_LOG_RETENTION_ENABLED` | `error-log/retention/` | owner-gated (master-triage OWN-30) |
| F-13 | `OFFICE_APPROVAL_EXECUTOR_ENABLED` | `office-approval` executor | — |
| F-14 | `ADR014_OBSERVATION_ENABLED` | ADR-014 gözlem harness'i | — |
| F-15 | `ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED` | ADR-014 local evidence runner | — |
| F-16 | `PHASE7_ENABLED` | Phase 7 yüzeyi | — |
| F-17 | `ENABLE_CHAOS_ENDPOINTS` | chaos test endpoint'leri | güvenlik gereği KAPALI olmalı |

**Default-ON tespit edilen tek flag:** `SIMULATION_API_ENABLED` — `app.module.ts:128`
`!== "false"`, yani **aksi belirtilmedikçe AÇIK**. Diğer 17'den semantik olarak ayrışır ve
bu asimetri bilinçli bir tasarım kararı gibi görünmektedir; doğrulanmamıştır.

## 2. O09 — DEFAULT_OFF_BY_POLICY: ratifiye güvenlik/politika kararları (7)

Bunlar **defekt değildir**; kapalı olmaları ratifiye edilmiş politikadır.

| # | Yüzey | Kanıt |
|---|---|---|
| P-01..P-06 | `coordination-v2/programs.manifest.json` — **altı programın tamamı** `"liveExecutionEligibility": "DENIED"` | Doğrulandı: `grep -o '"liveExecutionEligibility"[^,]*' \| sort \| uniq -c` → `6 DENIED`. `GOVERNANCE-INDEX` §2: manifest `GENERATED / DERIVED / NON-AUTHORITATIVE`, `taxonomyLevel: UNKNOWN` fail-closed |
| P-07 | `DORMANT_WRITE` mekanizması (PR #1653 — *"dormancy'yi mekanik değişmeze çevir"*) | Dormancy'yi doküman iddiası olmaktan çıkarıp mekanik olarak zorlanan bir değişmeze dönüştürür — bu register'ın varlık sebebiyle aynı ilkeyi paylaşır |

## 3. O08 — INTENTIONALLY_DORMANT ve ters sapma

`WRITTEN-BUT-NOT-OPERATIONAL-REGISTER-R01.md` §3 (4 kalem) ve §4 (1 ters sapma) bu register'ın
parçasıdır; burada tekrar edilmez.

**F-10 özel not:** kod default'u KAPALI, canonical kayıt *"code-level false kalır … ayrı owner
GO bekler"* diyor, fakat owner'ın `HY_WT/RUNTIME` worktree'sindeki untracked `.env`'inde flag
**AÇIK** ve tam E2E zinciri 2026-07-22'de owner tanıklığında doğrulanmış. Repository'de bu
aktivasyonun canonical kaydı **yoktur** ve bu program onu **yazmamıştır** — kaydın kendisi ayrı
bir `GO-DOCS` owner yetkisi gerektirdiğini belirtir.

## 4. Bu register'da hiçbir flag AÇILMADI

```text
FEATURES ENABLED: 0
```

Gerekçe (ADDENDUM §H, her biri bağımsız olarak yeterli):

```text
"production activation authority absent"        → hiçbir flag için canonical aktivasyon yetkisi yok
"default-OFF state is a ratified safety policy" → P-01..P-07 için doğrudan geçerli
"feature was intentionally dormant"             → F-02/F-03 (LEGAL_TIME), UYAP F4-b için geçerli
"new user-visible behavior choice required"     → F-01, F-05, F-06, F-12 kullanıcıya görünür davranış değiştirir
"security boundary would be weakened"           → F-17 (chaos endpoints), F-11 (break-glass)
```

Ayrıca **hiçbir flag'in gerçek deploy edilmiş değeri bilinmediği için**, "zaten açık olanı
açmak" gibi görünen bir işlem bile aslında kör bir production mutasyonu olurdu.

`DEFAULT_OFF != COMPLETE` — fakat `DEFAULT_OFF != DEFECT` de değildir. Bu register 17 flag'in
hiçbirini defekt olarak işaretlememektedir; yalnız **operasyonel durumlarının bilinmediğini**
ve karar yüzeyinin owner'da olduğunu kayıt altına alır.

---

## 5. DÜZELTME (2026-07-27) — §1 sayımı yanlıştı

`PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01` / ITEM-A03 kapsamında
fresh main `26c42b69` üzerinde her flag'in tanım yeri tek tek doğrulandı. §1'in
*"17 kod-default KAPALI, 1 AÇIK"* sayımı **YANLIŞTIR**. Doğru dağılım:

```text
14  runtime feature flag  — kod default KAPALI
 2  runtime feature flag  — kod default AÇIK
                            (SIMULATION_API_ENABLED, PHASE7_ENABLED — her ikisi de
                             `!== 'false'` deseni: hiçbir env tanımlanmazsa AÇIK)
 2  test-only env switch  — production feature flag DEĞİL
                            (ADR014_OBSERVATION_ENABLED,
                             ADR014_LOCAL_EVIDENCE_HARNESS_ENABLED —
                             yalnız scripts/__tests__/ altında geçer)
```

İki düzeltme:

- **`PHASE7_ENABLED` default-OFF DEĞİL, default-ON'dur.** §1 tablosunda F-16 olarak
  default-OFF listelenmişti. Gerçek kod:
  `phase7-config.ts:54` → `process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] !== 'false'`.
  Yani `SIMULATION_API_ENABLED` ile aynı desendedir: **hiçbir env tanımlanmazsa AÇIK.**
- **İki `ADR014_*` tanımlayıcısı runtime feature flag değildir.** Yalnız
  `scripts/__tests__/` altındaki spec dosyalarında geçerler; production tüketicileri yoktur.
  Bunları feature-flag envanterinde saymak yanıltıcıydı.

Tam düzeltilmiş envanter (tanım yeri + kod default + spec sayısı):
`PROGRAM-WIDE-OWNER-RESIDUALS-EXECUTION-REGISTER-R01.md` §3.2.

§1 tablosu tarihsel kayıt olarak **silinmeden** korunur; bu bölüm onu supersede eder.
Her iki flag için `DEPLOYED_VALUE` hâlâ `UNKNOWN`'dır — düzeltme yalnız kod default'una
ilişkindir.
