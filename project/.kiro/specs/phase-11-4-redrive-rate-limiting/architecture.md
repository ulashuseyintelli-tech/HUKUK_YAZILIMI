# Phase 11.4 — Redrive Rate Limiting / Backoff Guardrail: Mimari Diyagram

## Bileşen Akışı (Controller Redrive Flow — Task 8.1 Patch ile güncellenmiştir)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    POST /admin/manifest/dlq/{dlqId}/redrive             │
│                         ManifestAdminController                          │
│                                                                          │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐        │
│  │ 1. getById   │──▶│ 2. resolveCarrier │──▶│ 3. enforceDepth   │        │
│  │   (DLQ Repo) │   │   (Phase 11.2)    │   │   (Phase 11.3)    │        │
│  └──────────────┘   └──────────────────┘   └────────┬──────────┘        │
│                                                      │                   │
│                                              ┌───────▼────────┐         │
│                                              │ depth allowed? │         │
│                                              └───┬────────┬───┘         │
│                                                  │YES     │NO           │
│                                                  │        └──▶ 409      │
│                                          ┌───────▼──────────┐           │
│                                          │ 4. ★ checkRate   │           │
│                                          │    Limit         │           │
│                                          │  (Phase 11.4)    │           │
│                                          │  PRE-CHECK ONLY  │           │
│                                          │  (best-effort)   │           │
│                                          └───┬────────┬─────┘           │
│                                              │        │                  │
│                                         ALLOWED   RATE_LIMITED           │
│                                              │        │                  │
│                                              │   ┌────▼──────────────┐  │
│                                              │   │ 409 Conflict      │  │
│                                              │   │ REDRIVE_RATE_     │  │
│                                              │   │ LIMITED           │  │
│                                              │   │ + waitSeconds     │  │
│                                              │   │ + nextAllowedAt   │  │
│                                              │   │ + audit + metric  │  │
│                                              │   └───────────────────┘  │
│                                              │                          │
│                                     ┌────────▼──────────┐              │
│                                     │ 5. computeNext    │              │
│                                     │    AllowedAt      │              │
│                                     │  (backoff policy) │              │
│                                     └────────┬──────────┘              │
│                                              │                          │
│  ┌──────────────┐   ┌────────────────┐  ┌────▼───────────┐             │
│  │ 8. ★ atomic  │◀──│ 7. enforce     │◀─│ 6. cloneFor    │             │
│  │   Redrive    │   │   SizeLimit    │  │   Redrive      │             │
│  │  (TX GATE)   │   └────────────────┘  └────────────────┘             │
│  │              │                                                       │
│  │  ┌────────────────────────────────────────────────────┐             │
│  │  │ TX: FOR UPDATE lock                                 │             │
│  │  │ TX: Status guard (DLQ_OPEN)                         │             │
│  │  │ TX: ★ Cooldown guard (now < next_allowed_redrive_at │             │
│  │  │       → RATE_LIMITED)                               │             │
│  │  │ TX: UPDATE (status + redrive_count++                │             │
│  │  │     + last_redriven_at + next_allowed_redrive_at)   │             │
│  │  │ TX: Existing job check                              │             │
│  │  │ TX: INSERT retry job                                │             │
│  │  │ TX: COMMIT (all-or-nothing)                         │             │
│  │  └────────────────────────────────────────────────────┘             │
│  └──────┬───────┘                                                       │
│         │                                                               │
│         │ SUCCESS                                                       │
│         │                                                               │
│  ┌──────▼──────────────────────────────────────────────┐               │
│  │ 9. 200 response                                      │               │
│  │    redriveCount + nextAllowedRedriveAt (from tx)     │               │
│  │    + audit SUCCESS event                             │               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Rate Limit Karar Matrisi

```
┌─────────────────────────────────────────────────────────────────┐
│                    checkRateLimit(dlqEntry, now)                  │
│                    READ-ONLY — DB mutasyonu YOK                  │
│                                                                  │
│  Input: dlqEntry (mevcut state), now (current timestamp)         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Case 1: nextAllowedRedriveAt = NULL                    │      │
│  │   → İlk redrive, rate limit yok                        │      │
│  │   → return { allowed: true }                           │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Case 2: now >= nextAllowedRedriveAt                    │      │
│  │   → Cooldown dolmuş                                    │      │
│  │   → return { allowed: true }                           │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Case 3: now < nextAllowedRedriveAt                     │      │
│  │   → Cooldown aktif                                     │      │
│  │   → waitSeconds = ceil((nextAllowed - now) / 1000)     │      │
│  │   → return { allowed: false, RATE_LIMITED, waitSeconds }│      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ⚠️ Fail-closed: herhangi bir hata → reject                     │
│     Controller try/catch ile sarılır                             │
│     → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED (non-retriable)        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Rate Limit Key Çözümleme

```
┌─────────────────────────────────────────────────────────────────┐
│                resolveRateLimitKey(dlqEntry)                      │
│                                                                  │
│  Öncelik sırası (LOCKED):                                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐         │
│  │ 1. carrier_json mevcut ve parse edilebilir?          │         │
│  │    ├─ rootCorrelationId var? → rootCorrelationId     │         │
│  │    ├─ correlationId (requestId) var? → correlationId │         │
│  │    └─ ikisi de yok? → dlqEntry.id (fallback)         │         │
│  │                                                      │         │
│  │ 2. carrier_json yok veya parse hatası?               │         │
│  │    → dlqEntry.id (fallback)                          │         │
│  └─────────────────────────────────────────────────────┘         │
│                                                                  │
│  Cardinality clamp: key.length > 256 → "rl:v1:<sha256hex>"      │
│  Truncate KULLANILMAZ — collision riski.                         │
│  Hash format versioned: ileride schema değişirse prefix değişir  │
│                                                                  │
│  MUST NOT: key hiçbir zaman metrik label'ına yazılmaz            │
│  (cardinality explosion). Sadece reason/bucket label kullanılır  │
│                                                                  │
│  Amaç: Aynı correlation chain'deki tüm redrive'lar              │
│  tek bir rate limit kovasına düşer → retry storm engellenir      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Backoff Policy (Pure Function)

```
┌─────────────────────────────────────────────────────────────────┐
│          computeNextAllowedAt(now, redriveCount, config, rng)    │
│          redrive-backoff-policy.ts — SAF FONKSİYON               │
│                                                                  │
│  Formül:                                                         │
│    k = min(redriveCount, capExponent)                            │
│    backoff = min(maxBackoffMs, baseMs × 2^k)                     │
│    jitter = floor(rng() × jitterPct × backoff)                   │
│    nextAllowedAt = now + backoff + jitter                        │
│                                                                  │
│  Varsayılan config:                                              │
│    baseMs = 30,000 (30s)                                         │
│    capExponent = 7 (2^7 = 128)                                   │
│    maxBackoffMs = 3,600,000 (1 saat)                             │
│    jitterPct = 0.20 (20%)                                        │
│                                                                  │
│  Backoff tablosu (jitter=0, varsayılan config):                  │
│  ┌──────────────┬────────┬──────────────────────────┐            │
│  │ redriveCount │   k    │ backoff                   │            │
│  ├──────────────┼────────┼──────────────────────────┤            │
│  │      0       │   0    │ 30s                       │            │
│  │      1       │   1    │ 60s (1 dk)                │            │
│  │      2       │   2    │ 120s (2 dk)               │            │
│  │      3       │   3    │ 240s (4 dk)               │            │
│  │      4       │   4    │ 480s (8 dk)               │            │
│  │      5       │   5    │ 960s (16 dk)              │            │
│  │      6       │   6    │ 1920s (32 dk)             │            │
│  │      7+      │   7    │ 3600s (1 saat, CAP)       │            │
│  └──────────────┴────────┴──────────────────────────┘            │
│                                                                  │
│  Garantiler (PBT ile doğrulanacak):                              │
│    INV-11.4.5: backoffMs <= maxBackoffMs                         │
│    INV-11.4.5: jitterMs <= jitterPct × backoffMs                 │
│    INV-11.4.2: monoton artan (jitter hariç)                      │
│    Determinism: aynı input → aynı output (sabit rng ile)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```


## Persist Semantiği (atomicRedrive tx — Task 8.1 Patch ile güncellenmiştir)

```
┌─────────────────────────────────────────────────────────────────┐
│     atomicRedrive(dlqId, redrivenBy, null, rateLimitGate?)      │
│     ALL-OR-NOTHING — tek transaction                            │
│                                                                  │
│  rateLimitGate geçildiğinde (controller redrive path):           │
│                                                                  │
│  Adımlar (TX içinde):                                            │
│    0. SELECT ... FOR UPDATE (satır kilidi)                       │
│    1. Status guard: DLQ_OPEN değilse → reject                   │
│    2. ★ Cooldown guard: now < next_allowed_redrive_at → reject   │
│       → DlqRedriveError('RATE_LIMITED', { nextAllowedAt, wait })│
│    3. UPDATE manifest_dead_letter_queue SET                      │
│         status = 'DLQ_REDROVE',                                 │
│         redriven_at = NOW(),                                     │
│         redriven_by = $redrivenBy,                               │
│         redrive_count = COALESCE(redrive_count, 0) + 1,         │
│         last_redriven_at = $rateLimitGate.now,                   │
│         next_allowed_redrive_at = $rateLimitGate.nextAllowed,    │
│         rate_limit_reason = NULL                                 │
│       WHERE id = $dlqId AND status = 'DLQ_OPEN'                 │
│    4. Existing job check                                         │
│    5. INSERT retry job                                           │
│    6. COMMIT                                                     │
│                                                                  │
│  rateLimitGate geçilmediğinde (backward compat):                 │
│    → Mevcut UPDATE (status + redriven_at + redriven_by)          │
│    → Rate limit kolonlarına dokunulmaz                           │
│                                                                  │
│  Sonuç:                                                          │
│    Ya hepsi commit olur, ya hiçbiri.                             │
│    Ayrı "persist failure" senaryosu YOKTUR.                      │
│    State drift riski YOKTUR.                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> **Single Source of Truth:** Rate limit enforcement DB lock + tx guard'dadır.
> Controller gate (`checkRateLimit`) sadece load-shedding / UX optimizasyonudur.
> Gerçek rate-limit enforcement tx içindedir; controller pre-check deterministik değildir ve güvenlik iddiası taşımaz.

> **Backward Compatibility:** `rateLimitGate` parametresi optional'dır.
> Geçilmezse mevcut davranış korunur (Phase 10.2 callers etkilenmez).
> Migration sırası: önce DB kolonları (Task 1), sonra kod deploy (Task 8).

> **`onRedriveEnqueued` / `recordRedriveSuccess`:** Controller path'ten artık çağrılmaz.
> Fonksiyonlar silinmedi — ileride başka call path'ler kullanabilir.
> Deprecated doc notu eklendi.

## Fail-Closed Garanti Katmanları (Task 8.1 Patch ile güncellenmiştir)

```
Katman 1: Controller pre-check try/catch (UX + erken reddetme)
├── checkRateLimit() çağrısı try bloğunda
├── RateLimitCheckResult.allowed=false → 409 REDRIVE_RATE_LIMITED (fast reject)
├── Diğer tüm hatalar → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED (non-retriable)
├── redriveRejectedMetric.inc({ reason: 'RATE_LIMIT_CHECK_FAILED' })
└── Sonuç: DB hatası, parse hatası, timeout → HEPSİ reject (409, 500 DEĞİL)

Katman 2: Tx gate (★ ASIL GARANTİ — authoritative)
├── atomicRedrive tx içinde FOR UPDATE lock
├── Status guard: DLQ_OPEN değilse → reject
├── ★ Cooldown guard: now < next_allowed_redrive_at → RATE_LIMITED
├── Merged UPDATE: status + rate limit state tek statement
├── INSERT retry job
├── COMMIT (all-or-nothing)
└── Sonuç: Pre-check geçse bile tx gate reddedebilir (concurrent race)
```

> **Kaldırılan:** Katman 2 (persist failure isolation) — artık tx içinde.
> `RATE_LIMIT_PERSIST_FAILED` senaryosu ortadan kalktı.
> State drift riski yoktur.

## Metrik Topolojisi (Phase 11.4 — Task 7 Contract ile güncellenmiştir)

```
Mevcut metrikler (korunan — backward compat):
  carrier_redrive_depth_total (Histogram, Phase 11.3)
  carrier_redrive_rejected_total{reason} (Counter, Phase 10.5+)
    reason: RATE_LIMITED | RATE_LIMIT_CHECK_FAILED | DEPTH_EXCEEDED | ...
    → Genel reject counter. Tüm nedenler tek metrikte. Dashboard'lar buna bağlı.

Phase 11.4 yeni metrikler (Task 7 — LOCKED):

  ┌─────────────────────────────────────────────────────────────────────┐
  │ Counters                                                           │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │ carrier_redrive_rate_limited_total{gate}                            │
  │   gate="precheck" → controller pre-check rejected (fast 409)       │
  │   gate="tx"       → atomicRedrive tx gate rejected (concurrent)    │
  │   Cardinality: 2 (sabit). Başka gate değeri eklenmez.              │
  │   Kullanım: precheck >> tx → sağlıklı; tx >> precheck → stale     │
  │                                                                     │
  │ carrier_redrive_rate_check_failed_total                             │
  │   Label yok (simple counter).                                       │
  │   Normal operasyonda 0. > 0 → immediate investigation.             │
  │   Kullanım: fail-closed tetiklenme sıklığı izleme                 │
  │                                                                     │
  ├─────────────────────────────────────────────────────────────────────┤
  │ Histogram                                                           │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │ carrier_redrive_backoff_seconds                                     │
  │   Buckets: [30, 60, 120, 300, 600, 1800, 3600]                     │
  │   Prometheus export: _bucket, _sum, _count suffix'leri otomatik    │
  │   Ölçülen değer: (backoffMs + jitterMs) / 1000                     │
  │   Emit: atomicRedrive tx başarılı döndükten SONRA                  │
  │   Kullanım: backoff dağılımı izleme, config tuning                 │
  │                                                                     │
  ├─────────────────────────────────────────────────────────────────────┤
  │ Distribution Counter                                                │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │ carrier_redrive_backoff_applied_total{count_bucket}                 │
  │   count_bucket="0"   → redriveCount=0 (ilk redrive, 30s backoff)  │
  │   count_bucket="1"   → redriveCount=1 (60s)                       │
  │   count_bucket="2"   → redriveCount=2 (120s)                      │
  │   count_bucket="3-4" → redriveCount=3–4 (240s–480s)               │
  │   count_bucket="5-9" → redriveCount=5–9 (960s–3600s)              │
  │   count_bucket="10+" → redriveCount≥10 (cap'te sabit)             │
  │   Cardinality: 6 (kapalı enum). Yeni değer eklenmez.              │
  │   Label adı count_bucket — Prometheus histogram le bucket'ları     │
  │   ile kavramsal çakışmayı önler.                                   │
  │   Kullanım: 5-9/10+ yoğunsa → aynı entry tekrar tekrar redrive   │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘

  Emission noktaları (controller redriveDlqEntry):

    409 RATE_LIMITED (pre-check):
      → carrier_redrive_rejected_total{reason="RATE_LIMITED"}     (mevcut)
      → carrier_redrive_rate_limited_total{gate="precheck"}       (yeni)

    409 RATE_LIMIT_CHECK_FAILED (fail-closed):
      → carrier_redrive_rejected_total{reason="RATE_LIMIT_CHECK_FAILED"} (mevcut)
      → carrier_redrive_rate_check_failed_total                          (yeni)

    409 RATE_LIMITED (tx gate):
      → carrier_redrive_rejected_total{reason="RATE_LIMITED"}     (mevcut)
      → carrier_redrive_rate_limited_total{gate="tx"}             (yeni)

    200 SUCCESS (atomicRedrive OK):
      → carrier_redrive_cloned_total                              (mevcut)
      → carrier_redrive_backoff_applied_total{count_bucket}       (yeni)
      → carrier_redrive_backoff_seconds.observe(seconds)          (yeni)

  Topoloji notu:
    precheck/tx ayrımı gate label'ı ile taşınır.
    reason kırılımı mevcut carrier_redrive_rejected_total'da kalır.
    İki metrik birlikte kullanılır: rejected → "neden?", rate_limited → "nerede?"
```

## Phase 11.3 ↔ 11.4 Entegrasyon Sırası (Task 8.1 Patch ile güncellenmiştir)

```
Controller redrive flow (tam sıra):
  1. getById(dlqId)                    — Phase 10
  2. resolveCarrierForRedrive          — Phase 11.2
  3. enforceRedriveDepthLimit          — Phase 11.3 (LOCKED)
     ├── POISON latch → 409 POISON_ENTRY
     ├── depth >= MAX → markAsPoison + 409 DEPTH_EXCEEDED
     └── depth < MAX → continue
  4. ★ checkRateLimit (PRE-CHECK)      — Phase 11.4 (read-only, best-effort)
     ├── NULL nextAllowed → allow (ilk redrive)
     ├── now >= nextAllowed → allow
     ├── now < nextAllowed → 409 RATE_LIMITED (fast reject)
     └── hata → 409 REDRIVE_RATE_LIMIT_CHECK_FAILED (fail-closed, non-retriable)
  5. computeNextAllowedAt              — Phase 11.4 (backoff hesabı)
  6. cloneCarrierForRedrive            — Phase 10.5
  7. enforceCarrierSizeLimit           — Phase 10.5
  8. ★ atomicRedrive(rateLimitGate?)   — Phase 11.4 patch (TX GATE — authoritative)
     ├── FOR UPDATE lock
     ├── Status guard (DLQ_OPEN)
     ├── ★ Cooldown guard (now < next_allowed_redrive_at → RATE_LIMITED)
     ├── UPDATE (status + redrive_count++ + last_redriven_at + next_allowed_redrive_at)
     ├── INSERT retry job
     └── COMMIT (all-or-nothing)

  Sıra garantisi: 11.3 depth check ÖNCE, 11.4 rate limit SONRA.
  Gerekçe: POISON entry zaten reddedilmeli; rate limit check gereksiz.

  Double-check pattern: Step 4 (pre-check) + Step 8 (tx gate).
  Pre-check geçse bile tx gate reddedebilir (concurrent race).
  Gerçek rate-limit enforcement tx içindedir.
```

## Concurrency Model (Task 8.1 Patch)

```
Request A ──► pre-check: ALLOWED ──► atomicRedrive tx
Request B ──► pre-check: ALLOWED ──► atomicRedrive tx (concurrent)

Tx A: FOR UPDATE lock acquired
Tx A: cooldown guard → ALLOWED
Tx A: UPDATE + INSERT → COMMIT → 200

Tx B: FOR UPDATE lock → WAITS for Tx A
Tx B: lock acquired → status = DLQ_REDROVE
Tx B: status guard → ALREADY_REDRIVEN (409)

Sonuç: Tek entry, tek redrive. TOCTOU yok.
```

```
Request C ──► pre-check: RATE_LIMITED (fast 409, no tx)
Sonuç: DB lock açılmadı, hızlı reject.
```

> **Gerçek rate-limit enforcement tx içindedir; controller pre-check deterministik değildir ve güvenlik iddiası taşımaz.**

## Veri Akışı Örneği (Rate Limit Senaryosu — Task 8.1 Patch ile güncellenmiştir)

```
DLQ Entry [id=abc, redriveCount=0, nextAllowedRedriveAt=NULL]
  │
  │ 1. redrive talebi (t=0)
  │    depth check: OK (depth=1 < 3)
  │    pre-check: nextAllowed=NULL → ALLOWED (ilk redrive)
  │    computeNextAllowedAt: k=0, backoff=30s, jitter=~3s → nextAllowed = t+33s
  │    atomicRedrive(rateLimitGate={now=t, nextAllowed=t+33s}):
  │      TX: FOR UPDATE → status OK → cooldown OK (NULL) → UPDATE + INSERT → COMMIT
  │      → count=1, nextAllowed=t+33s (tx içinde yazıldı)
  │
  ▼
DLQ Entry [id=abc, redriveCount=1, nextAllowedRedriveAt=t+33s]
  │
  │ 2. redrive talebi (t=10s) — 10 saniye sonra
  │    depth check: OK
  │    pre-check: now(t+10s) < nextAllowed(t+33s) → RATE_LIMITED (fast 409)
  │    waitSeconds = ceil((33-10)) = 23
  │    → 409 { code: REDRIVE_RATE_LIMITED, waitSeconds: 23 }
  │    (DB lock açılmadı, tx'e girilmedi)
  │
  │ 3. redrive talebi (t=40s) — cooldown dolmuş
  │    depth check: OK
  │    pre-check: now(t+40s) >= nextAllowed(t+33s) → ALLOWED
  │    computeNextAllowedAt: k=1, backoff=60s, jitter=~8s → nextAllowed = t+108s
  │    atomicRedrive(rateLimitGate={now=t+40s, nextAllowed=t+108s}):
  │      TX: FOR UPDATE → status OK → cooldown OK → UPDATE + INSERT → COMMIT
  │      → count=2, nextAllowed=t+108s (tx içinde yazıldı)
  │
  ▼
DLQ Entry [id=abc, redriveCount=2, nextAllowedRedriveAt=t+108s]
  │
  │ ... backoff üstel olarak artar: 30s → 60s → 120s → 240s → ...
  │ ... redriveCount=7+ → 1 saat cap
```

## HTTP Response Matrisi (Phase 11.3 + 11.4 Birleşik — Task 8.1 Patch ile güncellenmiştir)

```
┌──────────────────────────┬──────┬──────────────────────────────┬───────────┬──────────┐
│ Durum                    │ HTTP │ code                         │ Mutasyon  │ Gate     │
├──────────────────────────┼──────┼──────────────────────────────┼───────────┼──────────┤
│ Zaten POISON (11.3)      │ 409  │ POISON_ENTRY                 │ Yok       │ Ctrl     │
│ Depth aşıldı (11.3)     │ 409  │ REDRIVE_DEPTH_EXCEEDED       │ poison    │ Ctrl     │
│ Depth check fail (11.3)  │ 500  │ DEPTH_CHECK_FAILED           │ Yok       │ Ctrl     │
│ Rate limited (pre-check) │ 409  │ REDRIVE_RATE_LIMITED         │ Yok       │ Ctrl     │
│ Rate limited (tx gate)   │ 409  │ REDRIVE_RATE_LIMITED         │ Yok       │ Tx       │
│ Rate check fail (11.4)   │ 409  │ REDRIVE_RATE_LIMIT_CHECK_    │ Yok       │ Ctrl     │
│                          │      │ FAILED (non-retriable)       │           │          │
│ Carrier upgrade fail     │ 400  │ INVALID_CARRIER              │ Yok       │ Ctrl     │
│ Carrier size exceeded    │ 413  │ CARRIER_SIZE_EXCEEDED        │ Yok       │ Ctrl     │
│ Already redriven         │ 409  │ ALREADY_REDRIVEN             │ Yok       │ Tx       │
│ Already resolved         │ 409  │ ALREADY_RESOLVED             │ Yok       │ Tx       │
│ Already queued           │ 409  │ ALREADY_QUEUED               │ Yok       │ Tx       │
│ Not found                │ 404  │ NOT_FOUND                    │ Yok       │ Tx       │
│ Success                  │ 200  │ REDRIVEN                     │ redrive + │ Tx       │
│                          │      │                              │ rate state│          │
└──────────────────────────┴──────┴──────────────────────────────┴───────────┴──────────┘

Kaldırılan satır: RATE_LIMIT_PERSIST_FAILED — artık tx içinde, ayrı persist yok.
```
