# Task 7 — Metric Contract (Phase 11.4 Rate Limiting)

## Tarih & Bağlam

- **Tarih:** 2026-02-08
- **Bağımlılık:** Task 8.1 (Fail-Closed Patch) DONE, spec docs synced
- **Amaç:** Rate limiting metrikleri tanımla, label contract'ı kilitle, implementasyona geç

## Naming Convention Analizi

Mevcut `carrier-lifecycle-metrics.ts` pattern'i:
- Prefix: `carrier_` (tüm metrikler)
- Suffix: `_total` (counter'lar)
- Histogram: `_total` suffix (mevcut: `carrier_redrive_depth_total`)

**Spec'teki isimler uyumsuz:**
| Spec (eski) | Convention-uyumlu (yeni) |
|---|---|
| `redrive_rate_limited_total` | `carrier_redrive_rate_limited_total` |
| `redrive_next_allowed_seconds` | `carrier_redrive_backoff_seconds` |
| `redrive_backoff_applied_total` | `carrier_redrive_backoff_applied_total` |

## Metric Contract (LOCKED)

### 1. `carrier_redrive_rate_limited_total` (Counter)

**Amaç:** Rate limit nedeniyle reddedilen redrive sayısı.

**Labels:**
| Label | Değerler | Açıklama |
|---|---|---|
| `gate` | `precheck` \| `tx` | Hangi gate reddetti |

**Emission noktaları:**
- Controller pre-check reject → `gate=precheck`
- Controller tx gate reject (DlqRedriveError RATE_LIMITED) → `gate=tx`

**Neden `gate` label'ı?**
- `redriveRejectedMetric{reason=RATE_LIMITED}` zaten mevcut — genel reject counter
- Bu yeni metrik rate limit'e özel, gate ayrımı operasyonel değer taşır:
  - `precheck >> tx` → pre-check iyi çalışıyor (beklenen)
  - `tx >> precheck` → pre-check bypass ediliyor veya stale data (sorun sinyali)
  - Sadece `tx` artıyorsa → concurrent race yoğun (load sinyali)

**Cardinality:** 2 (sabit)

**Alert önerisi:**
- `rate(carrier_redrive_rate_limited_total[5m]) > 10` → retry storm / misuse
- `carrier_redrive_rate_limited_total{gate="tx"} / carrier_redrive_rate_limited_total > 0.3` → pre-check stale

### 2. `carrier_redrive_rate_check_failed_total` (Counter)

**Amaç:** Pre-check fail-closed tetiklenme sayısı.

**Labels:** Yok (simple counter)

**Emission noktası:**
- Controller pre-check catch bloğu (REDRIVE_RATE_LIMIT_CHECK_FAILED)

**Neden ayrı counter?**
- `redriveRejectedMetric{reason=RATE_LIMIT_CHECK_FAILED}` zaten mevcut — ama bu "genel reject" counter'ı
- Ayrı counter: fail-closed'ın sıklığını izole etmek için
  - 0 olmalı (normal operasyonda)
  - > 0 → rate limiter'da bug veya data corruption sinyali

**Cardinality:** 1 (sabit)

**Alert önerisi:**
- `carrier_redrive_rate_check_failed_total > 0` → immediate investigation

### 3. `carrier_redrive_backoff_seconds` (Histogram)

**Amaç:** Backoff policy'nin ürettiği delay dağılımı.

**Ölçülen değer:** Backoff policy'nin hesapladığı toplam bekleme süresi (saniye) = `(backoffMs + jitterMs) / 1000`. Bu, `computeNextAllowedAt`'ın ürettiği delay'dir — `nextAllowedAt - now` ile eşdeğer.

> **Prometheus export:** `_bucket`, `_sum`, `_count` suffix'leri otomatik üretilir.

**Buckets:** `[30, 60, 120, 300, 600, 1800, 3600]`
- Backoff tablosuyla uyumlu: 30s, 60s, 120s, 240s, 480s, 960s, 1920s, 3600s
- Bucket'lar "le" (less-than-or-equal) semantiği ile çalışır

**Labels:** Yok

**Emission noktası:**
- Controller, `atomicRedrive` başarılı döndükten sonra
- Değer: `(backoffResult.backoffMs + backoffResult.jitterMs) / 1000`

**Neden tx sonrası?**
- Pre-check reject'te backoff hesaplanmıyor (gereksiz)
- Sadece başarılı redrive'larda backoff uygulanıyor

**Cardinality:** 1 (label yok)

### 4. `carrier_redrive_backoff_applied_total` (Counter)

**Amaç:** Hangi backoff seviyesinde yoğunluk var.

**Labels:**
| Label | Değerler | Açıklama |
|---|---|---|
| `count_bucket` | `0` \| `1` \| `2` \| `3-4` \| `5-9` \| `10+` | redriveCount bucket |

> **Not:** Label adı `count_bucket` — Prometheus'un histogram `le` bucket'ları ile kavramsal çakışmayı önler.

**Bucket mapping (LOCKED — 6 değer, kapalı enum):**
- `redriveCount = 0` → `count_bucket=0` (ilk redrive, 30s backoff)
- `redriveCount = 1` → `count_bucket=1` (60s)
- `redriveCount = 2` → `count_bucket=2` (120s)
- `redriveCount = 3–4` → `count_bucket=3-4` (240s–480s)
- `redriveCount = 5–9` → `count_bucket=5-9` (960s–3600s cap)
- `redriveCount >= 10` → `count_bucket=10+` (cap'te sabit)

**Emission noktası:**
- Controller, `atomicRedrive` başarılı döndükten sonra
- Bucket hesaplama:
  ```typescript
  function redriveCountBucket(count: number): string {
    if (count <= 2) return String(count);
    if (count <= 4) return '3-4';
    if (count <= 9) return '5-9';
    return '10+';
  }
  ```

**Cardinality:** 6 (sabit, kapalı enum — yeni değer eklenmez)

**Dashboard değeri:**
- `bucket=5+` yoğunsa → aynı entry'ler tekrar tekrar redrive ediliyor (sorun)
- `bucket=0` dominant → sağlıklı (çoğu ilk denemede çözülüyor)

## Emission Noktaları Özeti

```
Controller redriveDlqEntry():

  Pre-check reject (RATE_LIMITED):
    → redriveRejectedMetric.inc({ reason: 'RATE_LIMITED' })     // mevcut
    → redriveRateLimitedMetric.inc({ gate: 'precheck' })        // YENİ

  Pre-check fail-closed:
    → redriveRejectedMetric.inc({ reason: 'RATE_LIMIT_CHECK_FAILED' })  // mevcut
    → redriveRateCheckFailedMetric.inc()                                 // YENİ

  Tx gate reject (RATE_LIMITED):
    → redriveRejectedMetric.inc({ reason: 'RATE_LIMITED' })     // mevcut
    → redriveRateLimitedMetric.inc({ gate: 'tx' })              // YENİ

  Success (atomicRedrive OK):
    → redriveClonedMetric.inc()                                 // mevcut
    → redriveBackoffAppliedMetric.inc({ count_bucket })         // YENİ
    → redriveBackoffHistogram.observe(waitSeconds)              // YENİ
```

**gate label contract (LOCKED):** Sadece `precheck` ve `tx`. Başka string değer eklenmez.

## Mevcut `redriveRejectedMetric` ile İlişki

**Kaldırılmıyor.** `redriveRejectedMetric{reason=RATE_LIMITED}` ve `{reason=RATE_LIMIT_CHECK_FAILED}` mevcut emission'ları korunur. Yeni metrikler ek boyut sağlar:

- `redriveRejectedMetric` → "toplam reject" (tüm nedenler tek counter'da)
- `redriveRateLimitedMetric` → "rate limit reject" (gate ayrımı ile)
- `redriveRateCheckFailedMetric` → "fail-closed" (izole alert)

Bu, mevcut dashboard'ları bozmaz ve yeni operasyonel görünürlük ekler.

## Backward Compatibility

- Mevcut metrik isimleri değişmiyor
- Mevcut emission noktaları korunuyor
- Yeni metrikler ek olarak ekleniyor
- `resetAllMetrics()` yeni metrikleri de reset edecek

## Implementation Checklist

- [x] 7.1 `carrier-lifecycle-metrics.ts`'ye 4 yeni metrik tanımla
- [x] 7.2 `resetAllMetrics()`'e yeni metrikleri ekle
- [x] 7.3 Controller'a emission noktaları ekle (pre-check reject, fail-closed, tx reject, success)
- [x] 7.4 Mevcut test'lerde yeni metrik assertion'ları ekle
