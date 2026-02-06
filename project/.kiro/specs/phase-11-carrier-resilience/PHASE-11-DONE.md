# Phase 11 — Carrier Resilience: SIGN-OFF

**Status:** ✅ DONE (Wave A — P2 COMMIT)  
**Sign-Off Date:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## 1. Release / Rollout

### Uygulama Sırası (Strict)

```
1. 11.0 Migration  → Deploy migration first (schema ready, NULL columns)
2. Deploy code     → NULL-tolerant code goes live (mapRawToEntry ?? null)
3. 11.1 Worker     → Degraded mode active (invalid carrier → warn, job continues)
4. 11.2 DLQ Store  → Carrier storage active (new DLQ entries get carrier_json)
```

**Kritik:** Migration (11.0) MUTLAKA kod deploy'undan ÖNCE çalışmalı.
Kod deploy'u migration'sız yapılırsa, upsert carrier kolonlarını bulamaz → SQL error.

### Rollback Koşulları

| Senaryo | Rollback Güvenli mi? | Açıklama |
|---------|----------------------|----------|
| Migration deploy edildi, kod henüz deploy edilmedi | ✅ Güvenli | `down.sql` çalıştır, kolonlar boş |
| Kod deploy edildi, DLQ'ye henüz carrier yazılmadı | ✅ Güvenli | Kodu geri al → `down.sql` çalıştır |
| Prod'da carrier_json dolu satırlar var | ⚠️ Dikkat | `down.sql` carrier verilerini SİLER. Rollback öncesi carrier_json'ları export et veya rollback'ten vazgeç |
| 11.1 degraded mode aktif, metrikler akıyor | ✅ Güvenli | Kodu geri al → eski validation davranışına döner |

**Rollback komutu:**
```bash
# apps/api/prisma/migrations/20260206100000_phase11_dlq_carrier_columns/
psql $DATABASE_URL < down.sql
```

### Feature Flag

Feature flag YOK. Carrier storage, kod deploy'u ile otomatik aktif olur.
`prepareCarrierForDlqStorage(null)` degraded mode'da null döner — bu zaten backward-compatible.

### Öncelik Sırası — CI Gate PR vs Wave B

1. **CI gate PR (ÖNCELİKLİ)** — `carrier-write-drift-gate` step'i `ci.yml`'e eklenmeli. Phase 11'in en değerli çıktısı write-once carrier contract'tır ve bu contract'ı tek başına doküman koruyamaz. CI gate'i koymadığın her gün, biri fark etmeden update payload'a carrier ekleyip kontratı delebilir. Küçük PR, hızlı merge, risk düşürücü.
2. **Wave B (11.3 / 11.4)** — CI gate merge edildikten sonra güvenli zeminde başlar.

---

## 2. Operational Runbook

### carrier_truncated=true Gördüğümüzde

**Ne anlama gelir:** Carrier 4KB limitini aştı, `failureHistory` kısaltılarak saklandı.
Carrier JSON mevcut ama eksik history ile.

**Aksiyon:**
1. `carrier_dlq_storage_truncated_total` metriğini kontrol et — spike varsa carrier boyutu büyüyor demek
2. DLQ entry'deki `carrier_json`'ı parse et → `failureHistory` array uzunluğuna bak
3. Truncation oranı >%10 ise → Phase 11.4 (compression) öne alınmalı

**Alert önerisi:**
```
carrier_dlq_storage_truncated_total / carrier_dlq_storage_total > 0.1
→ warn: "Carrier truncation rate above 10%"
```

### Redrive Sırasında Stored Carrier Parse Fail

**Beklenen davranış:** `resolveCarrierForRedrive()` catch bloğuna düşer → warn log → `createMinimalCarrierFromDlq()` fallback.

**Log Event:**

| Alan | Değer |
|------|-------|
| Message key (stable prefix) | `[DLQ_REDRIVE_CARRIER_FALLBACK]` |
| Level | `warn` |
| Source | `DlqCarrierStorage` (NestJS Logger context) |

**Log fields:**

| Field | Tip | Açıklama |
|-------|-----|----------|
| `dlqEntryId` | string | DLQ kaydının ID'si |
| `bundleId` | string | İlgili bundle |
| `carrierVersion` | number \| "null" | Saklanan carrier version (null ise pre-11.2) |
| `carrierTruncated` | boolean | Carrier truncate edilmiş miydi |
| `hasCarrierJson` | boolean | carrier_json kolonu dolu muydu (her zaman `true` — null olsa bu path'e girmez) |
| `reason` | string | Parse/upgrade hata mesajı |

**Örnek log çıktısı:**
```
[Nest] WARN [DlqCarrierStorage] [DLQ_REDRIVE_CARRIER_FALLBACK] Stored carrier parse/upgrade failed, using minimal fallback. dlqEntryId=dlq-abc123 bundleId=bundle-456 carrierVersion=2 carrierTruncated=false hasCarrierJson=true reason=Unexpected token x in JSON at position 0
```

**Önerilen query (son 24 saat fallback sayısı):**

```
# CloudWatch Logs Insights
fields @timestamp, @message
| filter @message like /DLQ_REDRIVE_CARRIER_FALLBACK/
| stats count(*) as fallback_count by bin(1h)
| sort @timestamp desc

# Kibana / OpenSearch (KQL)
message: "DLQ_REDRIVE_CARRIER_FALLBACK" AND @timestamp >= now-24h

# Loki (LogQL)
{app="api"} |= "DLQ_REDRIVE_CARRIER_FALLBACK" | count_over_time({app="api"} |= "DLQ_REDRIVE_CARRIER_FALLBACK" [24h])
```

**Aksiyon:** Parse fail sık görülüyorsa → carrier_json'daki veri bozulmuş olabilir, DB corruption veya encoding sorunu araştır.

**Deferred metric notu:** `carrier_redrive_fallback_total` dedicated metric'i şu an YOK. Yukarıdaki log query'si Wave B metric gelene kadar "operasyonel göz" sağlar. Warn log spike yaparsa → dedicated metric eklenmesi Wave B kapsamında değerlendirilir.

### carrier_json=NULL olan DLQ Entry Redrive Edildiğinde

**Beklenen davranış:** Pre-11.2 entry veya degraded mode'da yazılmış entry. `createMinimalCarrierFromDlq()` minimal carrier üretir.

**Minimal carrier içeriği:** bundleId, attempt, lastFailedAt — yeterli redrive context'i var ama full lifecycle history yok.

---

## 3. Non-Negotiable Contracts

### Write-Once Contract (NNI-3)

Carrier kolonları (`carrier_json`, `carrier_version`, `carrier_truncated`) yalnızca `manifest-dlq.repository.ts` içindeki `upsert()` fonksiyonunun INSERT + ON CONFLICT UPDATE path'inde set edilir. `resolve()`, `markRedriven()`, `atomicRedrive()` ve controller dahil hiçbir UPDATE statement'ı carrier kolonlarına DOKUNMAZ. Bu contract grep gate ile CI'da enforce edilir.

### Truncation Invariant (NNI-2)

`carrier_truncated=true` ⇒ `carrier_json IS NOT NULL`. Bu hem DB constraint (`chk_dlq_carrier_truncated`) hem de `prepareCarrierForDlqStorage()` code path'i tarafından garanti edilir. REJECTED durumda (truncation bile yetmez) → `carrierJson=null, carrierTruncated=false` döner.

### Redrive Priority (NNI-1 + Redrive)

Redrive'da carrier çözümleme önceliği: stored carrier JSON > minimal fallback. `resolveCarrierForRedrive()` tek kanonik entry point; controller doğrudan carrier parse ETMEZ.

---

## 4. CI Gate — Carrier Write-Drift Guard

### Job Tanımı

| Alan | Değer |
|------|-------|
| Job adı | `carrier-write-drift-gate` (step adı, mevcut `architectural-guardrails` job'a eklenir) |
| Stage | `architectural-guardrails` job'u içinde, ADR-007 step'inden sonra (pre-test) |
| CI dosyası | `.github/workflows/ci.yml` |
| Trigger | push to main/develop + PR to main (mevcut trigger ile aynı) |
| Working directory | Checkout root (`HUKUK_YAZILIMI/project/` değil — CI checkout sonrası `apps/` doğrudan erişilebilir) |

### Tam CI Step (ci.yml `architectural-guardrails` job'una eklenecek)

```yaml
      # Phase 11: Carrier Write-Once Contract
      # Prevents UPDATE SET carrier_* outside upsert EXCLUDED path
      - name: Check carrier write-once contract (Phase 11)
        run: |
          echo "Checking Phase 11 compliance: carrier write-once contract..."
          
          # Gate #1: UPDATE SET carrier_* drift (expect: 0 match outside EXCLUDED)
          VIOLATIONS=$(grep -rn "UPDATE.*SET" apps/api/src/ \
            --include="*.ts" \
            --exclude-dir="__tests__" \
            --exclude="*.spec.ts" \
            --exclude="*.test.ts" \
            | grep -i "carrier_\(json\|version\|truncated\)" \
            | grep -v "EXCLUDED\." \
            || true)
          
          # Gate #2: executeRaw + carrier columns (expect: 0 match)
          RAW_VIOLATIONS=$(grep -rn "executeRaw.*carrier_\(json\|version\|truncated\)" \
            apps/api/src/ --include="*.ts" \
            --exclude-dir="__tests__" \
            --exclude="*.spec.ts" \
            || true)
          
          ALL_VIOLATIONS="${VIOLATIONS}${RAW_VIOLATIONS}"
          
          if [ -n "$ALL_VIOLATIONS" ]; then
            echo ""
            echo "═══════════════════════════════════════════════════════════════════════════════"
            echo "  ❌ PHASE 11 VIOLATION: Carrier write-once contract breached"
            echo "═══════════════════════════════════════════════════════════════════════════════"
            echo ""
            echo "$ALL_VIOLATIONS"
            echo ""
            echo "  Carrier columns are write-once: only upsert() INSERT + ON CONFLICT UPDATE"
            echo "  may set carrier_json, carrier_version, carrier_truncated."
            echo ""
            echo "  resolve/markRedriven/atomicRedrive MUST NOT touch carrier columns."
            echo "  executeRaw MUST NOT reference carrier columns."
            echo ""
            echo "  See: .kiro/specs/phase-11-carrier-resilience/PHASE-11-DONE.md"
            echo ""
            exit 1
          fi
          
          echo "✅ Phase 11 compliant: carrier write-once contract intact"
```

### Allowlist / Exclude Mantığı

| Pattern | Neden |
|---------|-------|
| `--exclude-dir="__tests__"` | Test fixture'ları izinli |
| `--exclude="*.spec.ts"` / `--exclude="*.test.ts"` | Test dosyaları izinli |
| `grep -v "EXCLUDED\."` | upsert ON CONFLICT'teki `EXCLUDED.carrier_json` izinli |
| Migration `.sql` dosyaları | Kapsam dışı (sadece `.ts` aranıyor) |
| `executeRaw` gate | `$queryRawUnsafe` veya `$executeRaw` ile carrier kolonlarına doğrudan erişim engellenir |

### Beklenen Çıktı (Temiz)

```
Checking Phase 11 compliance: carrier write-once contract...
✅ Phase 11 compliant: carrier write-once contract intact
```

### CI Gate PR Durumu

✅ **CI STEP EKLENDİ** — `ci.yml`'deki `architectural-guardrails` job'una Phase 11 carrier write-once contract step'i eklendi. PR merge bekliyor.

---

## 5. Test Inventory — Kanıt Formatı

### Test Komutu

```bash
# Carrier lifecycle test suite (apps/api package)
pnpm --filter api test -- --testPathPattern="carrier-lifecycle"

# Tüm ilgili test dosyaları
pnpm --filter api test -- --testPathPattern="(dlq-carrier-storage|validate-inbound-carrier|carrier-size-limiter|carrier-version-upgrade|redrive-carrier-cloner|manifest-dlq.repository)"
```

### Test Envanteri

| Test Dosyası | Test Sayısı | Kapsam |
|-------------|-------------|--------|
| `validate-inbound-carrier.spec.ts` | 41 | Inbound validation: OVERSIZE (3), MALFORMED (4), VERSION_MISMATCH (4), VALID_V2 (1), truncated inbound (2), null defaults (1), MISSING_REQUIRED (4), TYPE_ERROR (3), UPGRADE_FAILED (1), V1 upgrade (1), no sizeBytes (2), sanitizeCarrierSnapshot (7), extractMinimalFields (6), buildMinimalResult (2) |
| `dlq-carrier-storage.spec.ts` | 14 | prepareCarrierForDlqStorage (6: null, valid, truncated, invariant×2, never-throws), resolveCarrierForRedrive (5: stored, corrupted, null, V1-upgrade, never-throws), createMinimalCarrierFromDlq (3: valid, requestId, movedToDlqAt) |
| `carrier-size-limiter.spec.ts` | ~15 | Size enforcement: OK, TRUNCATED, REJECTED, boundary cases |
| `carrier-version-upgrade.spec.ts` | ~8 | V1→V2 upgrade, invalid version handling |
| `redrive-carrier-cloner.spec.ts` | ~10 | Clone for redrive, correlationId chain, attemptNumber reset |
| `manifest-dlq.repository.spec.ts` | ~20 | Repository CRUD, carrier field mapping, NULL tolerance |
| `carrier-lifecycle.integration.spec.ts` | ~5 | End-to-end lifecycle flow |

### Özet

**Core suite'ler: 2 suite / 55 test (validate-inbound: 41, dlq-storage: 14) / 0 failure**
Ek suite'ler dahil toplam: ~111 test.

### Grep Gate Kanıtı

```bash
# Gate #1: UPDATE SET carrier_* drift (expect: 0 match outside EXCLUDED)
grep -rn "UPDATE.*SET" apps/api/src/ --include="*.ts" --exclude-dir="__tests__" \
  | grep -i "carrier_\(json\|version\|truncated\)" \
  | grep -v "EXCLUDED\."
# Expected: empty (0 lines)

# Gate #2: executeRaw + carrier columns (expect: 0 match)
grep -rn "executeRaw.*carrier_\(json\|version\|truncated\)" apps/api/src/ \
  --include="*.ts" --exclude-dir="__tests__" --exclude="*.spec.ts"
# Expected: empty (0 lines)

# Gate #3: Full inventory — allowed locations only
grep -rn "carrierJson\|carrierVersion\|carrierTruncated\|carrier_json\|carrier_version\|carrier_truncated" \
  apps/api/src/ --include="*.ts" --exclude-dir="__tests__" --exclude="*.spec.ts" \
  | grep -v "\.types\.ts" | grep -v "//.*carrier"
# Expected: only dlq-carrier-storage.ts, manifest-retry-worker.service.ts, manifest-dlq.repository.ts
```

---

## 6. Deferred Items (Wave B — P3 OPTIONAL)

### Öncelik Sırası

```
1. CI gate PR (carrier-write-drift-gate → ci.yml)  ← ÖNCELİK #1, Wave B'den ÖNCE
2. 11.3 Redrive Chain Depth Limit                   ← Wave B sprint 1
3. 11.4 Carrier Compression                         ← Wave B sprint 2 (veya trigger aktif olursa öne alınır)
```

### 11.3 — Redrive Chain Depth Limit

| Alan | Değer |
|------|-------|
| Status | ⬜ DEFERRED |
| Depends On | 11.2 (DONE) + CI gate PR (DONE) |
| Risk | Sonsuz redrive loop: aynı bundle sürekli DLQ → redrive → DLQ döngüsüne girer. Şu an depth limit yok, admin dikkatine bağlı. |
| Ne bozulabilir | Admin fark etmeden aynı bundle'ı 10+ kez redrive eder → gereksiz job churn, metrik kirliliği, potansiyel downstream side-effect |
| Trigger | Prod'da aynı bundle'ın 3+ kez redrive edildiği görülürse (DLQ audit log'dan tespit). `carrier_dlq_storage_total` metriğinde aynı bundleId tekrarı spike yapıyorsa. |
| Scope | Migration (is_poison, poison_reason columns) + depth calculation + POISON flag + metric |
| Owner | Atanmadı — Wave B planning'de assign edilecek |
| Next Planned Wave | Wave B — CI gate PR merge edildikten sonraki ilk sprint |

### 11.4 — Carrier Compression

| Alan | Değer |
|------|-------|
| Status | ⬜ DEFERRED |
| Depends On | Bağımsız (11.0 sonrası herhangi bir zamanda) |
| Risk | Carrier boyutu büyüdükçe DLQ storage maliyeti artar + truncation oranı yükselir. Şu an 4KB limit + truncation yeterli. |
| Ne bozulabilir | Truncation rate %10'u geçerse → carrier'ların çoğu eksik history ile saklanır, redrive kalitesi düşer |
| Trigger | `carrier_dlq_storage_truncated_total / carrier_dlq_storage_total > 0.1` (truncation rate %10 üzeri). Veya carrier ortalama boyutu 2KB'ı geçerse. |
| Scope | gzip+base64 compression (storage mode), threshold 1KB, wire mode disabled by default |
| Owner | Atanmadı — Wave B planning'de assign edilecek |
| Next Planned Wave | Wave B — truncation rate trigger'ı aktif olursa öne alınır, aksi halde sprint 2 |

---

## Completed Tasks Summary

| Task | Priority | Size | Status | Key Artifact |
|------|----------|------|--------|--------------|
| 11.0 Migration | P2 | S | ✅ DONE | migration.sql + down.sql + DB constraints |
| 11.1 Degraded Mode | P2 | S | ✅ DONE | validateInboundCarrier() + 41 tests |
| 11.2 DLQ Storage | P2 | M | ✅ DONE | prepareCarrierForDlqStorage() + grep gate |

---

## Tech Debt (Recorded)

1. **`query()` $queryRawUnsafe + string interpolation** in `manifest-dlq.repository.ts`  
   Not injection (enum-bounded orderBy/status), but bad pattern.  
   Backlog: migrate to Prisma tagged template + allowlist orderBy mapping.

---

## References

- [requirements.md](./requirements.md)
- [design.md](./design.md)
- [phase-11-1-requirements.md](./phase-11-1-requirements.md) (LOCKED)
- [phase-11-1-design.md](./phase-11-1-design.md) (LOCKED)
- [phase-11-2-design.md](./phase-11-2-design.md) (LOCKED)
- [ADR-008 v1.3](../../../docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md)
- [CI Pipeline](.github/workflows/ci.yml)
