# Guarded Apply Script Convention

**Durum:** Docs-only (ACT-13). Kod/schema/migration YOK; mevcut script davranışı DEĞİŞMEDİ.
**Son güncelleme:** 2026-07-05

## Bağlam

`ACT-13` ("runGuardedApply konvansiyon/doküman eksikleri") kaydı GO-ANALYZE ile doğrulandı: repoda `runGuardedApply` adında bir fonksiyon **hiç yok** (yalnız Master Triage register'ın kendi metninde geçiyor — muhtemelen aşağıdaki desenin kısaltılmış/hatalı anımsanmış adı). Ancak altındaki gerçek konu geçerli: dev DB'ye tehlikeli, geri-alınamaz yazma yapan CLI script'leri için **üç bağımsız, birbirinden habersiz "apply gate" deseni** birikmiş durumda. Bu doküman bu deseni adlandırır, referans implementasyonu gösterir ve mevcut script'lerin hangisinin hangi deseni kullandığını kataloglar — **hiçbir script'i retrofit etmez**.

## Referans implementasyon: K1 guarded-apply core

`project/apps/api/src/modules/policy-engine/diagnostics/k1-reviewed-linkage.core.ts` (PR #522, K1-3) en olgun, en çok test edilmiş (63 unit test) desendir:

- `evaluateApplyGuards()` — üçlü kapı: mod-flag (`--apply`) + non-prod-rıza-flag (`--allow-dev-db-write`) + insan-inceleme-onayı-flag (`--confirm-manifest-reviewed`). Üçü de yoksa apply çalışmaz.
- `classifyDbTarget()` — `DATABASE_URL`'i HOST-tabanlı sınıflandırır (`missing|prod|non-prod|unknown`); DB adı tek başına non-prod kanıtı sayılmaz, `unknown` → hard-stop.
- `planApply()` — idempotency-aware preflight (zaten uygulanmış → no-op; çakışan bağ → `CONFLICT`, sessiz üzerine-yazma yok).
- `applyLinkages()` — injected `tx`, tek `$transaction`, koşullu yazma (`WHERE ... AND userId IS NULL`) fail-fast + tam rollback.
- `redactSecrets()` — hata mesajlarında connection-string/secret asla ham basılmaz.

Kullanım dokümanı: `project/docs/k1-reviewed-linkage-apply-usage.md`.

## Mevcut script'lerin envanteri (2026-07-05 itibarıyla)

| Script | Desen | Not |
|---|---|---|
| `project/apps/api/scripts/k1-reviewed-linkage.ts` | K1 core'u **kullanır** (`evaluateApplyGuards` import) | Üçlü kapı: `--apply --allow-dev-db-write --confirm-manifest-reviewed` |
| `project/apps/api/scripts/k1-capacity-linkage.ts` | K1 core'u **kullanır** (`evaluateApplyGuards` import) | İki kapı: `--apply --allow-dev-db-write` (manifest-review'i gerektirmeyen daha dar kapsam) |
| `project/apps/api/scripts/backfill-due-to-claimitem.ts` | **Kendi bağımsız kapısı** (`parseBackfillArgs`, `due-to-claimitem-backfill.core.ts`) | Farklı flag/semantik: `--apply --all-tenants --confirm-prod-backfill`; K1 core'u import ETMEZ |
| `project/docs/g6-backfill-script-design.md` | **Tasarım-only** (kod yok), kendi kapı önerisi | `--apply --prod --confirm=<token>` — üçüncü, henüz kodlanmamış bir varyant |

Üç farklı flag ismi/semantiği (`--allow-dev-db-write`, `--confirm-prod-backfill`, `--confirm=<token>`) aynı temel niyeti ("bunun non-prod/dev DB'de çalıştığını bilinçli olarak onaylıyorum") üç ayrı şekilde ifade ediyor — bu, ACT-13'ün işaret ettiği gerçek konvansiyon boşluğu.

## İleriye dönük öneri (bu doküman kapsamında UYGULANMAZ)

Yeni bir dev-DB-yazan guarded-apply script'i yazılırken:

1. Yazma deseni K1'inkine benziyorsa (manifest-doğrula → planla → guard'lı transaction'da uygula), **K1 core'unu (`k1-reviewed-linkage.core.ts`) yeniden kullanmayı ilk seçenek olarak değerlendir** — `k1-capacity-linkage.ts` bunun nasıl yapılacağının canlı örneğidir.
2. Yeniden kullanım uygun değilse (farklı domain/veri şekli), en azından **aynı üç kapı semantiğini** koru: mod-flag + açık non-prod-rıza-flag + (insan-incelemesi gerekiyorsa) ayrı bir inceleme-onayı-flag'i. Flag isimleri script'e özgü olabilir; niyetin üçü de karşılanmalı.
3. Her yeni guarded-apply script'i kendi kısa kullanım dokümanını (`project/docs/<script-adı>-apply-usage.md` deseni, bkz. K1) eklemelidir.

## Kapsam dışı (bu ACT-13 turu)

- `backfill-due-to-claimitem.ts`'in K1 core'una geçirilmesi (davranış değişikliği, ayrı bir GO-IMPLEMENT kararı gerektirir).
- `g6-backfill-script-design.md`'nin K1 deseniyle hizalanması (henüz kodlanmamış, ayrı tasarım kararı).
- Yeni bir ortak/paylaşılan "guarded-apply" NPM paketi/modülü çıkarma (YAGNI — üç script için henüz gerekçelendirilmiş değil).
