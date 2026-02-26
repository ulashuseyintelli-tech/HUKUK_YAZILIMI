# PART-4 — Consolidated Patch Plan & Test Plan

**Tarih:** 2026-02-27  
**Amaç:** Ne yapılacak / hangi sırayla / nasıl doğrulanacak — tek doküman  
**Disiplin:** Her satır kanıt pointer taşır; pointer'sız satır backlog'dan çıkar

---

## 1. Executive Risk Order

Öncelik sırası sabittir ve ihlal edilmez:

**Security P1 kapanmadan reliability refactor başlamaz; reliability P1 kapanmadan perf refactor başlamaz.**

Sıra: (1) Security P1 — v28-engine auth guard eksikliği, login rate limit yokluğu, PII log masking. (2) Reliability P1 — external fetch timeout standardı, unbounded query pagination, cron overlap lock. (3) Performance P1 — N+1 loop batch write, include query ölçümü. (4) P2 — DB statement_timeout, query telemetry, RBAC skeleton.

---

## 2. Cron Lock Kararı (Standart)

**Default: `pg_try_advisory_lock` (DB-centric)**

Gerekçe:
- Ekstra infra gerektirmez (Redis cluster yok)
- Mevcut PostgreSQL bağlantısı üzerinden çalışır
- Session-scoped lock + `finally` block'ta explicit unlock
- Process crash → PostgreSQL session kapanır → lock otomatik release

**Alternatif (kullanılmayacak):** Redis-based DistributedLockService. Mevcut DistributedLockService calc-preview/diagnostics modülünde var ama scheduler modülüne genellemek ekstra bağımlılık ve Redis availability riski ekler. İleri optimizasyonda (multi-region, tenant-level parallel) değerlendirilebilir.

---

## 3. Consolidated Fix Backlog


| ID | Area | Source | Sev | Change | Owner | Effort | Dependency | Evidence Pointer | DoD | Tests |
|----|------|--------|-----|--------|-------|--------|------------|-----------------|-----|-------|
| PF-001 | Security | S-01A | P1 | v28-engine controller'larına `@UseGuards(JwtAuthGuard)` ekle | Backend | S | — | `v28-engine.controller.ts:36-80` — UyapEventController, FactStoreController'da `@UseGuards` yok; karşılaştırma: `icrabot.controller.ts:21` `@UseGuards(JwtAuthGuard)` var | Guard'sız endpoint'e token'sız istek → 401 | TS-01, TS-02 |
| PF-002 | Security | S-02 | P1 | `/auth/login` ve `/portal/login` endpoint'lerine rate limiting ekle | Backend | S | — | `auth.controller.ts:16-19` — `@Post("login")` rate limit yok; `portal.controller.ts:49-52` — `@Post("login")` rate limit yok | 10 başarısız login/dk sonrası 429 dönmeli | TS-03, TS-04 |
| PF-003 | Security | S-05A | P1 | PII log masking: IBAN, TCKN logger çıktılarında maskelenmeli | Backend | M | — | `bank.service.ts:543-544` — `this.logger.log(\`[GARANTI] Bakiye sorgusu: ${iban}\`)` (IBAN açık loglanıyor); `bank.service.ts:560,565,577,582` — aynı pattern 4 banka için; `uyap.service.ts:600` — `debtorIdentityNo` açık loglanıyor | `logger.log` çıktısında IBAN/TCKN regex match → 0 | TS-05, TS-06 |
| PF-004 | Reliability | R-01 | P1 | Tüm external fetch çağrılarına AbortController + 10s timeout ekle | Backend | S | — | `rate-sync.service.ts:207-209` — EVDS fetch timeout yok; `sms-provider.service.ts:107` — NetGSM fetch timeout yok; `sms-provider.service.ts:148` — İletimerkezi fetch timeout yok; `email-provider.service.ts:173` — SendGrid fetch timeout yok | Her fetch çağrısında `signal` parametresi var; 10s sonra AbortError fırlatılır | TR-01, TR-02 |
| PF-005 | Reliability | R-02.2 | P1 | Unbounded findMany çağrılarına `take` + cursor-based pagination ekle | Backend | M | — | `scheduler.service.ts:38-46` — checkPaymentOrderDeadlines findMany take yok; `scheduler.service.ts:113-120` — processNafakaPeriods findMany take yok; `scheduler.service.ts:710-720` — sendDueReminders findMany take yok; `scheduler.service.ts:388-396` — checkIhbarnameDeadlines findMany take yok (×2); `scheduler.service.ts:470-477` — checkExternalCaseFollowups findMany take yok | Her findMany çağrısında `take: 50` veya cursor pagination var | TR-03, TR-04 |
| PF-006 | Reliability | R-03.1 | P1 | Cron job'lara `pg_try_advisory_lock` wrapper ekle | Backend | M | PF-004 (timeout önce) | `scheduler.service.ts` — 10 `@Cron` decorator, 0 lock mekanizması; `automation.service.ts` — 5 `@Cron` decorator, 0 lock; codebase genelinde `pg_advisory_lock` araması: 0 match | Lock alınamayan job skip edilir + `scheduler_job_skipped_total` metric emit | TR-05, TR-06, TR-07 |
| PF-007 | Performance | R-02.1 | P1 | Loop write'ları `prisma.$transaction` ile batch'le | Backend | M | PF-005 (pagination önce) | `scheduler.service.ts:63-93` — processExpiredPaymentOrder: 3 ayrı await (update + create + create); `scheduler.service.ts:139-170` — addNafakaPeriod: 2 ayrı await; `scheduler.service.ts:212-248` — processMtsReturn: 3 ayrı await | Loop içi write'lar tek `$transaction` içinde; mock'ta `$transaction` 1 kez çağrılır | TP-01, TP-02 |
| PF-008 | Ops/P2 | R-04.1 | P2 | DB statement_timeout ayarla (DB-side ALTER ROLE) | DevOps | S | — | `.env.example:2` — `DATABASE_URL` parametresinde statement_timeout yok; `prisma.service.ts:1-15` — PrismaService'te timeout config yok | `SHOW statement_timeout;` → `30s` | TP-03 |
| PF-009 | Ops/P2 | R-04.2 | P2 | Query telemetry: dev'de Prisma query event, prod'da pg_stat_statements + app histogram | Backend + DevOps | M | PF-008 | `prisma.service.ts:1-15` — log/metric konfigürasyonu yok | Dev: slow query (>100ms) loglanıyor; Prod: `pg_stat_statements` view'da veri var | TP-04, TP-05 |
| PF-010 | Security/P2 | S-06 | P2 | RBAC enforcement skeleton: admin-only endpoint'lere role check ekle | Backend | L | PF-001 (auth guard önce) | `seed.controller.ts:9-97` — 12 `@UseGuards(JwtAuthGuard)` var ama role check yok; herhangi bir authenticated user seed çalıştırabilir | Admin olmayan user seed endpoint'ine istek → 403 | TS-07 |
| PF-011 | Security/P2 | S-07 | P2 | Mevcut `$queryRawUnsafe` çağrılarını `$queryRaw` tagged template'e refactor et | Backend | M | PF-006 (lock önce) | `manifest-dlq.repository.ts:345,360,779` — 3 `$queryRawUnsafe` çağrısı (production code); `run-migration-test.ts:270,328,370` — 3 çağrı (script, ayrı kategori) | Production codebase'te `$queryRawUnsafe` = 0; script path allowlist'te | TS-08 |


---

## 4. Zaman Planı

### Faz 0 — Acil (0–2 gün)

Sadece kanayan yerler. Maks 6 iş.

| # | Backlog ID | İş | Dosya(lar) |
|---|-----------|-----|-----------|
| 1 | PF-001 | v28-engine controller'larına `@UseGuards(JwtAuthGuard)` ekle | `v28-engine.controller.ts` |
| 2 | PF-002 | Login endpoint'lerine rate limit guard ekle (ThrottlerGuard veya custom) | `auth.controller.ts`, `portal.controller.ts` |
| 3 | PF-003 | PII log masking utility + bank.service / uyap.service'te uygula | `bank.service.ts`, `uyap.service.ts`, yeni: `pii-mask.util.ts` |
| 4 | PF-004 | External fetch timeout standardı (AbortController wrapper) | `rate-sync.service.ts`, `sms-provider.service.ts`, `email-provider.service.ts` |
| 5 | PF-005 | Unbounded query'lere take + pagination ekle | `scheduler.service.ts` (5 metod) |
| 6 | — | CI gate: PII log regex scanner (TS-06 ile birlikte) | `.github/workflows/` veya lint rule |

### Faz 1 — Stabilizasyon (1–2 hafta)

| # | Backlog ID | İş | Dosya(lar) |
|---|-----------|-----|-----------|
| 1 | PF-006 | Cron distributed lock: `withJobLock` wrapper + tüm `@Cron` job'lara uygula | Yeni: `job-lock.util.ts`; `scheduler.service.ts`, `automation.service.ts` |
| 2 | PF-007 | Loop write batch: `$transaction` ile sarma | `scheduler.service.ts` (processExpiredPaymentOrder, addNafakaPeriod, processMtsReturn) |
| 3 | PF-006+ | Cron idempotency: duplicate decisionLog/lifecycle koruması | `scheduler.service.ts` — her write'a `createMany` + `skipDuplicates` veya upsert |
| 4 | PF-010 | RBAC skeleton: admin-only endpoint'lere `@Roles('ADMIN')` guard | `seed.controller.ts`, `scheduler.controller.ts` |
| 5 | — | Cron job duration metric: `scheduler_job_duration_seconds{job}` histogram | `job-lock.util.ts` içinde |
| 6 | — | Include query ölçümü: dev ortamında `prisma.$on('query')` ile gerçek query count | `prisma.service.ts` (dev mode) |
| 7 | PF-011 | `$queryRawUnsafe` → `$queryRaw` tagged template refactor (production code) | `manifest-dlq.repository.ts` |

### Faz 2 — Hardening (1–2 ay)

| # | Backlog ID | İş | Dosya(lar) |
|---|-----------|-----|-----------|
| 1 | PF-008 | DB statement_timeout: `ALTER ROLE` + doğrulama | DB migration script |
| 2 | PF-009 | Query telemetry: pg_stat_statements + app histogram | `prisma.service.ts`, Prometheus config |
| 3 | — | Refresh token + revocation (JWT tek token → access+refresh pair) | `auth.service.ts`, `auth.controller.ts` |
| 4 | — | Audit logging interceptor: CRUD operasyonları için | Yeni: `audit.interceptor.ts` |
| 5 | — | Circuit breaker: external API çağrıları için (EVDS, NetGSM, SendGrid) | Yeni: `circuit-breaker.util.ts` |
| 6 | — | Perf/load test suite CI entegrasyonu | `__tests__/load/` |

---

## 5. Test Plan

### Security Regression Tests

| Test ID | Type | Target | Setup | Assertion | Pass Criteria |
|---------|------|--------|-------|-----------|---------------|
| TS-01 | integration | `POST /icrabot/v28/events` | Token'sız HTTP request | Response status | 401 Unauthorized |
| TS-02 | integration | `GET /icrabot/v28/facts/:caseId` | Token'sız HTTP request | Response status | 401 Unauthorized |
| TS-03 | integration | `POST /auth/login` | 11 ardışık başarısız login (aynı IP) | 11. request response | 429 Too Many Requests |
| TS-04 | integration | `POST /portal/login` | 11 ardışık başarısız login (aynı IP) | 11. request response | 429 Too Many Requests |
| TS-05 | unit | `piiMask()` utility | IBAN string input: `TR330006100519786457841326` | Masked output | `TR33****1326` (ilk 4 + son 4) |
| TS-06 | unit | PII log scanner | `bank.service.ts` logger çıktısı mock | IBAN/TCKN regex match count | 0 match |
| TS-07 | integration | `POST /seed/all` | Non-admin JWT token | Response status | 403 Forbidden |

### Reliability Regression Tests

| Test ID | Type | Target | Setup | Assertion | Pass Criteria |
|---------|------|--------|-------|-----------|---------------|
| TR-01 | unit | `fetchWithTimeout()` wrapper | Mock fetch: 15s delay | AbortError thrown | Error thrown < 11s |
| TR-02 | unit | `fetchWithTimeout()` happy path | Mock fetch: 200ms response | Response returned | No AbortError |
| TR-03 | unit | `checkPaymentOrderDeadlines` | Mock findMany: 60 case döndür | findMany call args | `take` parametresi mevcut |
| TR-04 | unit | `sendDueReminders` pagination | Mock findMany: batch 1 = 50 item, batch 2 = 10 item | findMany call count | 2 çağrı (cursor-based) |
| TR-05 | unit | `withJobLock` — lock acquired | Mock `pg_try_advisory_lock` → true | Job function çağrıldı + unlock çağrıldı | fn() 1 kez, unlock 1 kez |
| TR-06 | unit | `withJobLock` — lock NOT acquired | Mock `pg_try_advisory_lock` → false | Job function çağrılmadı | fn() 0 kez, metric emit 1 kez |
| TR-07 | unit | `withJobLock` — job throws | Mock `pg_try_advisory_lock` → true, fn throws | Unlock yine çağrıldı | unlock 1 kez (finally) |

### Performance Regression Tests

| Test ID | Type | Target | Setup | Assertion | Pass Criteria |
|---------|------|--------|-------|-----------|---------------|
| TP-01 | unit | `processExpiredPaymentOrder` batch | Mock 5 case | `$transaction` call count | 1 transaction (3 write yerine) |
| TP-02 | unit | `addNafakaPeriod` batch | Mock 5 case | `$transaction` call count | 1 transaction (2 write yerine) |
| TP-03 | integration | statement_timeout | `SET LOCAL statement_timeout='1s'; SELECT pg_sleep(5)` | Query cancelled | Error: `canceling statement due to statement timeout` |
| TP-04 | unit | Prisma query event (dev mode) | Slow query mock (>100ms) | Logger.warn çağrıldı | warn 1 kez, query süresi logda |
| TP-05 | integration | pg_stat_statements | Herhangi bir query çalıştır | `pg_stat_statements` view'da satır var | `calls > 0` |

---

## 6. CI Gates (Hard Fail Kuralları)

| Gate | Kural | Regex / Check | Fail Condition | Allowlist |
|------|-------|---------------|----------------|-----------|
| PII-LOG | Logger çıktısında PII yok | `logger\.\w+\(.*\b(iban\|tckn\|identityNo\|email@)\b` | Match > 0 | `__tests__/**`, `*.spec.ts` |
| AUTH-COVERAGE | icrabot/v28 controller'larda guard var | `@Controller.*v28` olan dosyalarda `@UseGuards` kontrolü | Guard'sız controller class | — |
| SECRET-SCAN | Hardcoded secret yok | `(password|secret|apiKey)\s*[:=]\s*['"][^'"]{8,}` | Match > 0 (test dışı) | `.env.example`, `__tests__/**` |
| RAW-QUERY-AUDIT | `$queryRawUnsafe` kullanımı izlenir | `\$queryRawUnsafe` | Aşama 1: Yeni eklenen `$queryRawUnsafe` (diff-based) flag + reviewer onayı zorunlu. Aşama 2 (PF-011 sonrası): Production path'te 0 match | `prisma/run-migration-test.ts` (script — kalıcı allowlist) |

**Not:** `$queryRawUnsafe` için "0 match" kuralı uygulanamaz — mevcut codebase'te `manifest-dlq.repository.ts` ve `run-migration-test.ts`'de meşru kullanım var. Bunun yerine diff-based gate: yeni eklenen `$queryRawUnsafe` çağrısı PR'da flag'lenir, reviewer onayı zorunlu.

---

## 7. Rollback Planı

| Faz | Rollback Stratejisi |
|-----|-------------------|
| Faz 0 (Security) | Guard ekleme geri alınabilir (decorator kaldır). Rate limit guard kaldırılabilir. PII mask utility'si backward compatible (mask fonksiyonu çağrılmazsa eski davranış). |
| Faz 1 (Reliability) | `withJobLock` wrapper kaldırılırsa eski davranışa dönülür (lock'suz). `$transaction` kaldırılırsa eski sequential write'a dönülür. Feature flag gerekmez — kod seviyesinde revert yeterli. |
| Faz 2 (Hardening) | `statement_timeout` → `ALTER ROLE ... RESET statement_timeout;`. Telemetry → Prisma log config kaldır. Refresh token → eski tek-token JWT'ye dön (breaking change — client update gerekir). |

---

## 8. PART-2/PART-3 Kanıt Referans Özeti

Bu tablo PART-4'teki her PF-ID'nin hangi PART'taki bulguya ve hangi dosya/satıra dayandığını gösterir.

| PF-ID | PART | Bulgu ID | Dosya | Satır/Bölge | Kanıt Özeti |
|-------|------|----------|-------|-------------|-------------|
| PF-001 | PART-2 | S-01A | `v28-engine.controller.ts` | L36-80 | 5 controller class, 0 `@UseGuards` — `IcrabotController` (L21) ile karşılaştır |
| PF-002 | PART-2 | S-02 | `auth.controller.ts` | L16-19 | `@Post("login")` — rate limit decorator/guard yok |
| PF-002 | PART-2 | S-02 | `portal.controller.ts` | L49-52 | `@Post("login")` — rate limit yok |
| PF-003 | PART-2 | S-05A | `bank.service.ts` | L543-584 | 6 `logger.log` çağrısında IBAN açık text |
| PF-003 | PART-2 | S-05A | `uyap.service.ts` | L600 | `debtorIdentityNo` açık loglanıyor |
| PF-004 | PART-3 | R-01 | `rate-sync.service.ts` | L207-209 | `fetch(url, {headers})` — signal/timeout yok |
| PF-004 | PART-3 | R-01 | `sms-provider.service.ts` | L107, L148 | `fetch()` — timeout yok |
| PF-004 | PART-3 | R-01 | `email-provider.service.ts` | L173 | `fetch()` — timeout yok |
| PF-005 | PART-3 | R-02.2 | `scheduler.service.ts` | L38-46 | `case.findMany` — take yok |
| PF-005 | PART-3 | R-02.2 | `scheduler.service.ts` | L113-120 | `case.findMany` (nafaka) — take yok |
| PF-005 | PART-3 | R-02.2 | `scheduler.service.ts` | L710-720 | `due.findMany` — take yok |
| PF-006 | PART-3 | R-03.1 | `scheduler.service.ts` | tüm dosya | 10 `@Cron`, 0 lock |
| PF-006 | PART-3 | R-03.1 | `automation.service.ts` | tüm dosya | 5 `@Cron`, 0 lock |
| PF-007 | PART-3 | R-02.1 | `scheduler.service.ts` | L63-93 | processExpiredPaymentOrder: 3 sequential await |
| PF-008 | PART-3 | R-04.1 | `.env.example` | L2 | DATABASE_URL — timeout param yok |
| PF-009 | PART-3 | R-04.2 | `prisma.service.ts` | L1-15 | PrismaClient extend — log config yok |
| PF-010 | PART-2 | S-06 | `seed.controller.ts` | L9-97 | 12 `@UseGuards(JwtAuthGuard)` — role check yok |
| PF-011 | PART-2 | S-07 | `manifest-dlq.repository.ts` | L345, L360, L779 | 3 `$queryRawUnsafe` (production); `run-migration-test.ts` L270,328,370 (script) |
