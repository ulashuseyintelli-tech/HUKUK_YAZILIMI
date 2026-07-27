# PROGRAM-WIDE-WRITTEN-BUT-NOT-OPERATIONAL-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-WRITTEN-BUT-NOT-OPERATIONAL-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING — ADDENDUM: WRITTEN-BUT-NOT-OPERATIONAL ACTIVATION AUDIT
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Yazılmış / merge edilmiş / canonical gösterilmiş fakat fiilen çalışmayan işleri
             O01-O15 operasyonel sınıfına ayırır. Aktivasyon yetkisi ÜRETMEZ.
Baseline   : canonical main `f8b7a912`
Tarih      : 2026-07-27
```

## 0. Temel kural — uygulanan zincir

```text
CODE EXISTS → ENTRYPOINT EXISTS → RUNTIME BINDING EXISTS → CONFIGURATION EXISTS
→ FEATURE ENABLED → DEPLOYED → USER/SYSTEM PATH REACHABLE → ACCEPTANCE VERIFIED
→ OBSERVABLE IN OPERATION
```

**Bu denetimin kanıt sınırı — açıkça beyan edilir:** halkalar 1-5 (kod, entrypoint, binding,
konfigürasyon tanımı, kod-seviyesi default) repository'den **deterministik olarak** doğrulanabilir
ve doğrulanmıştır. Halkalar 6-9 (deployment, gerçek çalışan runtime, kabul, gözlenebilirlik)
**doğrulanamamıştır**: bu oturum gerçek `hukuk_db`'ye bağlanmamış, hiçbir `.env` veya production
credential okumamış, hiçbir servisi restart etmemiştir. Bu nedenle hiçbir kalem için
`O14 FULLY_OPERATIONAL` iddiası repository kanıtıyla ÜRETİLMEMİŞTİR — tek istisna §4'teki
owner-tanıklı kayıttır ve o da repository kanıtı değil, **owner tanıklığıdır**.

`MERGED != OPERATIONAL` · `CANONICAL != ENABLED` · `CI PASS != DEPLOYED` ·
`UNIT TEST PASS != REAL RUNTIME VERIFIED`

## 1. O02 — MERGED_NOT_RUNTIME_BOUND (6)

### 1.1 `ManifestAdminController` — 8 admin endpoint erişilemez (EN ÖNEMLİ BULGU)

```text
ITEM               : Manifest Retry/DLQ Admin API (Phase 10 / Task 10.1.8-11, Phase 10.5 Task 7)
CODE               : project/apps/api/src/modules/calc-preview/diagnostics/object-store/
                     manifest-retry/manifest-admin.controller.ts   (@Controller('admin/manifest'))
RUNTIME ENTRYPOINT : NestJS HTTP controller — 8 route tanımlı:
                       POST /bundles/:bundleId/retry
                       GET  /retry-queue
                       GET  /dlq
                       GET  /retry/dlq
                       GET  /retry/jobs
                       POST /dlq/:dlqId/redrive
                       POST /dlq/:dlqId/resolve
RUNTIME BINDING    : **NONE** — hiçbir NestJS module'ün `controllers:` dizisinde DEĞİL
ENABLEMENT         : yok (flag ile korunmuyor; hiç register edilmiyor)
USER/SYSTEM PATH   : **UNREACHABLE** — `admin/manifest` prefix'i repo genelinde başka hiçbir
                     controller tarafından da tanımlanmıyor
ACCEPTANCE EVIDENCE: unit/spec dosyaları mevcut → gerçek runtime kanıtı DEĞİL
OBSERVABILITY      : yok
CURRENT CLASS      : **O02 MERGED_NOT_RUNTIME_BOUND**
REASON             : `calc-preview.module.ts` → `controllers: [CalcPreviewController]` (tek kalem)
ACTION             : **OWNER DECISION** — bkz. ACTIVATION-OWNER-DECISION-REGISTER ITEM-A01
```

**Doğrulama kanıtı (üç bağımsız kontrol):**

```text
1. barrel export VAR   : manifest-retry/index.ts:79
                         export { ManifestAdminController } from './manifest-admin.controller';
2. module kaydı YOK    : grep -rl "ManifestAdminController" --include=*.module.ts  → 0 dosya
3. route prefix tekil  : grep -rn "admin/manifest" --include=*.ts (controller ve test hariç) → 0
```

**Yanıltıcı sinyal:** Controller'ın guard'ları **register edilmiştir** —
`calc-preview.module.ts:60-61` `ManifestAdminAuthGuard`, `ManifestAdminRateLimiter`,
`ManifestAdminRateLimitGuard` sağlar. Yani altyapı canlı, koruduğu route yok. Yüzeysel bir
"guard var, demek ki endpoint çalışıyor" çıkarımı **yanlıştır**.

### 1.2 Bağlanmamış servisler (5)

Tespit: sınıf hiçbir `*.module.ts`'de geçmiyor **ve** test dışında hiçbir dosyadan import
edilmiyor. Test double'lar (`MockClockService`, `MockSimulationFeatureFlagService`) bu
sayımdan çıkarılmıştır.

| Servis | Yol | Not |
|---|---|---|
| `ManifestRetryMetricsService` | `…/manifest-retry/manifest-retry-metrics.service.ts` | §1.1 ile aynı alt sistem (Phase 10.1.7 circuit-breaker + queue/DLQ metrikleri) |
| `EvidenceAggregatorService` | `…/diagnostics/evidence/evidence-aggregator.service.ts` | Phase 8 Sprint 1A |
| `HysteresisEscalationService` | `…/diagnostics/playbook/hysteresis-escalation.service.ts` | Sprint 3 Task 5.3 |
| `TraceRetentionService` | `…/calc-preview/trace/trace-retention.service.ts` | "Production-grade retention" başlıklı, fakat hiç bağlı değil |
| `JtiAnomalyDetectorService` | `…/break-glass/services/anomaly/jti-anomaly-detector.service.ts` | JWT `jti` anomali tespiti; break-glass alt sistemi |

Tümü `calc-preview` diagnostics ailesindendir; bu alt sistem **kısmen** bağlıdır
(`CalcPreviewController` + guard'lar canlı) → alt sistem seviyesinde `O12 PARTIALLY_ACTIVE`.

## 2. O13 — OBSOLETE_IMPLEMENTATION (1)

```text
SnapshotCleanupService   …/diagnostics/evidence/snapshot-cleanup.service.ts
```

Kendi JSDoc'u kanıttır: `@deprecated Phase 11 - Use SnapshotCleanupOrchestratorService instead.`
Bağlanmamış olması **defekt değil, kasıtlı emeklilik**tir. Kod silme bu programın kapsamı
(docs/governance-only) dışındadır; `ACTION: owner decision (removal candidate)`.

## 3. O08 — INTENTIONALLY_DORMANT (4)

Bu kalemler bağlanmamıştır **ve canonical kayıt bunu açıkça öngörür** — yani defekt değildir.
`DORMANT != DEFECT, UNLESS INTENT IS UNPROVEN` kuralı gereği her biri için intent kanıtı verilmiştir.

| # | Kalem | Bağlanma durumu | Intent kanıtı |
|---|---|---|---|
| D-1 | `HumanClaimItemFormationAdmissionService` | `claim-item.module.ts`'de **yok** | `GOVERNANCE-INDEX` §2: RCV Claim Formation *"runtime DORMANT; provider/resolver/key/signature/signed release/schema/migration authority NONE"* |
| D-2 | `TransactionalClaimItemFormationFinalizerService` | `claim-item.module.ts`'de **yok** | aynı |
| D-3 | Receivable Legal Subtype Registry V1 | resolver/provider yok | aynı satır: *"next D02-PB01 owner-gated"* |
| D-4 | UYAP F4-b orchestrator | flag-gated OFF (#1566) | UYAP audit reconciliation: `IMPLEMENTED · CI-PROVEN · DEFAULT-OFF · NOT RUNTIME-PROVEN`, `REAL TRANSPORT 0`, `UYAP CUTOVER HARD HOLD` |

## 4. Ters yönlü sapma — runtime kayıttan İLERİDE (1)

Bu, denetimin aradığı klasik boşluğun **tersidir** ve ayrıca kaydedilir.

```text
ITEM        : OFFICE Password Recovery (OFFICE-AUTH-P02)
CODE        : modules/auth/password-reset/password-reset.service.ts:40
              String(config.get("OFFICE_PASSWORD_RECOVERY_ENABLED") ?? "").toLowerCase() === "true"
              → kod-seviyesi default: KAPALI

CANONICAL KAYIT (repository):
  decision-log.md + pending-migration-coordination-register.md §9.4:
  "OFFICE_PASSWORD_RECOVERY_ENABLED code-level false kalır; OFFICE-AUTH-P02 runtime
   aktivasyonu ... kendi workstream'lerinin ayrı owner GO'larını bekler."

REPOSITORY'DE AKTİVASYON KAYDI : YOK
  (repo geneli arama: "PASSWORD-RECOVERY.*(ACTIVATION|CONFIG)-R01" → 0 sonuç)

GERÇEK RUNTIME (owner tanıklığı, repository DIŞI):
  Owner'ın `C:\Development\HY_WT\RUNTIME` worktree'sindeki **untracked `.env`** dosyasında
  flag aktif edilmiş ve tam E2E zincir (forgot-password → gerçek SMTP → e-posta teslimi →
  owner'ın kendi tarayıcısından reset → tokenVersion artışı → yeni parola ile login)
  2026-07-22'de owner tanıklığında doğrulanmıştır.

CURRENT CLASS : O14 FULLY_OPERATIONAL (runtime) / GOVERNANCE RECORD: STALE-BY-DESIGN
ACTION        : **OWNER DECISION** — canonical closure kaydı yazmak ayrı, dar bir GO-DOCS
                görevi gerektirir ve bu programda AÇILMAMIŞTIR.
```

**Neden bu program bu kaydı repository'ye yazmıyor:** (a) aktivasyon owner'ın local runtime
`.env`'indedir, repository state'i değildir; (b) canonical closure için ayrı owner GO'su
gerektiği kaydın kendisinde yazılıdır; (c) `.env` içeriği okunmamış/aktarılmamıştır.
`"operationally live" != "governance-closed"`.

## 5. O01 — CODED_NOT_MERGED (1)

`codex/ccb-001-pr1-pr6-rescue` — 7 unique commit, `READY_FOR_PR` doğrulanmış, merge edilmemiş.
Ayrıntı: `PROGRAM-WIDE-UNFINISHED-WORK-REGISTER-R01.md` §2 ve
`PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-01.

## 6. Sayım

| Sınıf | Adet | Kanıt |
|---|---|---|
| `O01 CODED_NOT_MERGED` | 1 | §5 |
| `O02 MERGED_NOT_RUNTIME_BOUND` | 6 | §1 |
| `O03 RUNTIME_BOUND_NOT_ENABLED` | 17 | DORMANT-DEFAULT-OFF-REGISTER §1 |
| `O04 ENABLED_NOT_DEPLOYED` | **UNDETERMINABLE** | deployment erişimi yok |
| `O05 DEPLOYED_NOT_REACHABLE` | **UNDETERMINABLE** | aynı |
| `O06 REACHABLE_NOT_ACCEPTANCE_VERIFIED` | **UNDETERMINABLE** | aynı |
| `O07 VERIFIED_NOT_OPERATIONALLY_USED` | **UNDETERMINABLE** | aynı |
| `O08 INTENTIONALLY_DORMANT` | 4 | §3 |
| `O09 DEFAULT_OFF_BY_POLICY` | 7 | DORMANT-DEFAULT-OFF-REGISTER §2 |
| `O10 ACTIVATION_OWNER_GATED` | 2 | ACTIVATION-OWNER-DECISION-REGISTER |
| `O11 ACTIVATION_BLOCKED_BY_MISSING_DEPENDENCY` | 0 | — |
| `O12 PARTIALLY_ACTIVE` | 1 | `calc-preview/diagnostics` alt sistemi (§1.2) |
| `O13 OBSOLETE_IMPLEMENTATION` | 1 | §2 |
| `O14 FULLY_OPERATIONAL` | 1 (owner tanıklığı) | §4 — repository kanıtı DEĞİL |
| `O15 UNKNOWN_OPERATIONAL_STATE` | 17 | 17 flag'in gerçek deploy edilmiş değeri |
