---
status: active
review-trigger: "Sprint sonu — yeni hata eklenmediğinden emin ol"
---

# 94 — Known Pre-existing TypeScript Debt

**Tarih:** 2026-05-21  
**Durum:** Kayıt altında — Sprint 2 ile ilgisiz  
**Amaç:** "Sprint X TypeScript'i bozdu" yanılgısını önlemek

---

## Baseline (2026-05-21, Sprint 2 başlangıcı)

| Metrik | Değer |
|--------|-------|
| **Toplam TS error** | 78 |
| **Etkilenen modül** | `calc-preview/` (tek modül) |
| **Sprint 2 dosyaları** | 0 hata |
| **CI davranışı** | `continue-on-error: true` (ci.yml, type check non-blocking) |

---

## Etkilenen Dosyalar (tamamı `src/modules/calc-preview/` altında)

| Dosya | Hata Tipi |
|-------|-----------|
| `chaos/fault-injector.service.ts` | TS2322 (Partial<T> → T) |
| `contracts/index.ts` | TS2308 (duplicate re-export) |
| `diagnostics/object-store/manifest-retry/__tests__/manifest-admin.controller.spec.ts` | TS2322 (mock type mismatch) |
| `diagnostics/object-store/manifest-retry/__tests__/manifest-retry-worker.spec.ts` | TS2322, TS2345 (mock + DlqEntry type) |
| `diagnostics/object-store/manifest-retry/__tests__/manifest-retry-worker-safety.integration.spec.ts` | TS2307 (vitest module) |
| `diagnostics/object-store/manifest-retry/audit/__tests__/audit-file-sink.spec.ts` | type mismatch |
| `diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/__tests__/dlq-carrier-storage.spec.ts` | type mismatch |
| `diagnostics/persistence/__tests__/prisma-repositories.integration.spec.ts` | type mismatch |
| `diagnostics/simulation-api/__tests__/simulation-v1-alias.controller.spec.ts` | type mismatch |
| `diagnostics/simulation-api/guards/__tests__/*.spec.ts` (6 dosya) | type mismatch |
| `regression/runner/compare/compare-result.ts` | type mismatch |
| `sweep/integration-sweep.spec.ts` | type mismatch |

---

## Neden Var?

Bu hatalar Phase 10/11/13 sprint'lerinde interface genişletmelerinden (yeni field'lar: `queryWithCursor`, `atomicRedrive`, `carrierJson`, vb.) sonra test mock'larının güncellenmemesinden kaynaklanıyor. Runtime'da çalışıyor (Jest geçiyor) çünkü `as any` cast'ler ve mock partial'lar yeterli. TypeScript strict mode'da fail ediyor.

---

## Sprint 2 Kuralı

> **Sprint 2 bu sayıyı artıramaz.**

Her sprint sonunda: `npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Measure-Object`

- Baseline: 78
- Sprint 2 sonunda: ≤ 78 (artış yasak)
- Azalma: opsiyonel ama teşvik edilir

---

## Temizlik Planı (opsiyonel, P2)

Bu debt Phase 2 Sprint 4+ veya ayrı bir "tech debt sprint"te temizlenebilir:
- Mock type'ları güncelle (DlqEntry, IManifestRetryQueueRepository)
- `vitest` import'u kaldır (Jest kullanılıyor)
- `contracts/index.ts` re-export ambiguity çöz

**Tahmini süre:** 2-3 saat mekanik iş.

---

**İmza:** ulas (2026-05-21)
