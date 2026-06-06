---
status: decision-record
created: 2026-06-05
branch: fix/ci-pr-gates
review-trigger: "payment PR (fix/payment-instruction-tenant-isolation) merge olunca → rebase + uygulama"
---

# CI PR Gates — Impact Map (Decision Record)

Bu belge **karar kaydıdır, uygulama değildir.** Amaç: CI'ı "cosmetic" durumdan
"gerçek PR kapısı" durumuna taşımanın etki alanını dondurmak. Uygulama, payment PR
merge olduktan sonra ayrı diff planlarıyla yapılır.

## Kırmızı çizgi

> **CI PR'ında uygulama (runtime) kodu değişmeyecek.** Sadece `.github/workflows/`,
> `apps/api/scripts/`, ve `docs/ci/` dokunulur.

---

## 1. Mevcut workflow haritası

| Dosya | Tetikleyici | Rol |
|---|---|---|
| `.github/workflows/ci.yml` (repo kökü) | push:`*`, PR→main | **Çekirdek CI**: `architectural-guardrails` + `test-suite` |
| `project/.github/workflows/contract-tests.yml` | push/PR main+release, path-filtered (calc-preview/contracts, interest-engine/rates, fee-engine, policy-engine) | Sadece o path'ler değişince |
| `project/.github/workflows/sdk-test.yml` | push/PR main+develop, path-filtered (packages/calc-preview-sdk) | Sadece SDK değişince |
| `project/.github/workflows/sweep.yml` | push/PR main+develop, path-filtered (apps/api/src, packages) | Geniş tarama (type-check non-blocking içerir) |
| `project/.github/workflows/load-test.yml` | schedule (gece 2AM) + manual dispatch | **PR gate değil** — ops/nightly |

## 2. Blocking / non-blocking job ayrımı (ci.yml)

| Job / step | Durum | Not |
|---|---|---|
| `architectural-guardrails` (ADR-007 + ci-1..6) | ✅ **BLOCKING** | Ucuz grep gate'leri, continue-on-error yok |
| `test-suite` → Type check | ⚠️ **NON-BLOCKING** | `ci.yml:57-60` `continue-on-error: true` |
| `test-suite` → Tests | ⚠️ **DAR KAPSAM** | Sadece `guards/__tests__/(drift-guard\|baseline-math\|stage-*\|sd-*)`; **`integration` HARİÇ** (`testPathIgnorePatterns`) |
| contract-tests / sdk-test | path-filtered blocking | Sadece ilgili modül değişince |
| load-test | cosmetic | scheduled |

**Sonuç:** Bu oturumda yeşil yaptığımız 48 integration testi (domain-event-ingest 34,
collection-payment-received 12, uyap-event-ingest.boundary 2) **CI'da hiç koşmuyor.**

## 3. type-check neden non-blocking + 78 TS baseline gate planı

- **Neden:** 78 pre-existing TS hatası (calc-preview, `94-known-preexisting-debt.md`).
  Blocking yapılsa her PR kırmızı olur. `tsconfig.prod.json` zaten gevşetilmiş
  (`noUnusedLocals`, `exactOptionalPropertyTypes=false`).
- **Şu anki risk:** `continue-on-error` tüm hataları yutar → **regresyon koruması sıfır.**
- **Plan (baseline ratchet):**
  ```
  count = tsc --noEmit -p tsconfig.prod.json | grep -c "error TS"
  count > BASELINE(78) → exit 1
  ```
  Yeni hatayı bloklar, mevcut 78'i tolere eder. Baseline bir dosyada tutulur, azaldıkça düşürülür.

## 4. Postgres integration test planı

- `test-suite` job'una GitHub Actions `services: postgres` container ekle (ephemeral, bilinen cred).
- `prisma migrate deploy` + `DATABASE_URL` env (servise işaret eder).
- `testPathIgnorePatterns`'tan `integration` çıkar → 48 test koşar.
- Testler `describeIf(DATABASE_URL)` ile yazılı → DATABASE_URL set olunca otomatik aktive.
- `--runInBand` ile sıralı koşum (flaky riskini düşürür; immutability trigger'ları deterministik).

## 5. ci-7 security gate fikri

Mevcut `ci-1..6` (`project/apps/api/scripts/`) `architectural-guardrails`'te blocking.
Yeni **ci-7**: payment/tenant güvenlik regresyonunu yakalar —
- `req.headers['x-tenant-id']` fallback yasağı (controller'larda),
- guard'sız controller taraması (`@Controller` var ama `@UseGuards`/`@Public` yok).
Aynı job'a eklenir, blocking.

## 6. Bağımlılık: payment PR merge

CI'ın integration testleri koşması için o testler **main'de olmalı.** Şu an
`fix/payment-instruction-tenant-isolation` PR'ında. **Önce o merge olmalı**, sonra
`fix/ci-pr-gates` rebase edilir:
```
git checkout fix/ci-pr-gates
git fetch origin
git rebase origin/main
```

## 7. Secret/env

- Integration testler → **DATABASE_URL** ama ephemeral postgres service (harici secret YOK).
- guardrails / type-check → env gerektirmez.

## 8. PR süresi / performans

| Aşama | Tahmini |
|---|---|
| guardrails (grep) | ~30 sn |
| install (pnpm cache) + prisma generate | ~2 dk |
| type-check (baseline-gated) | ~30 sn |
| + postgres service + migrate + 48 integration test | +~2 dk |
| **Toplam** | **~5-6 dk** |

---

## Uygulama sırası (merge + rebase sonrası, her biri önce diff planı)

1. Postgres service + integration tests (`test-suite` job)
2. Type-check 78-baseline gate
3. ci-7 security gate

Her madde: **önce somut YAML/script diff planı → onay → yazım.**
