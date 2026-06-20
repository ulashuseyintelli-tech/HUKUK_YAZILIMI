# Debtor/CaseDebtor lifecycle regression index

Bu indeks D2/D4/L7a/L7b davranislarini tek bir dev suite'e tasimadan, mevcut targeted spec sahipligini gorunur tutar.

## Coverage map

| Alan | Koruyan spec/test dosyalari | Not |
| --- | --- | --- |
| Debtor hard-delete preflight | `project/apps/api/src/modules/debtor/__tests__/debtor-delete-case-debtor-preflight.spec.ts` | D4 preflight genislemesi: CaseDebtor varsa hard-delete bloklanir; PASSIVE CaseDebtor da blocker kalir; direct/loose dependency ve cross-tenant NotFound kapsanir. |
| CaseDebtor passivation | `project/apps/api/src/modules/debtor/case-debtor.service.spec.ts`, `project/apps/api/src/modules/debtor/case-debtor.collection-guard.spec.ts`, `project/apps/api/src/modules/debtor/case-debtor.remove-orphan-tasks.spec.ts` | CaseDebtor hard-delete edilmez, PASSIVE yapilir; metadata ezilmez; bagli collection/tebligat/history referanslari korunur. |
| PASSIVE writer guards | `project/apps/api/src/modules/case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service.spec.ts`, `project/apps/api/src/modules/case-debtor-lifecycle-guard/operational-create-lifecycle-guard.spec.ts`, `project/apps/api/src/modules/case-debtor-lifecycle-guard/manual-case-debtor-mutation-lifecycle-guard.spec.ts`, `project/apps/api/src/modules/address-discovery/address-discovery-lifecycle-guard.spec.ts`, `project/apps/api/src/modules/collection/__tests__/collection-ledger-forward.spec.ts`, `project/apps/api/src/modules/tebligat/__tests__/tebligat-create-validation.spec.ts`, `project/apps/api/src/modules/address-task/address-task.service.spec.ts` | Yeni operasyon yazilari PASSIVE CaseDebtor icin guard ile durur; late-result/tarihsel kapanis akislari ayri sinifta tutulur. |
| ACTIVE-only readers | `project/apps/api/src/modules/debtor/__tests__/case-debtor-active-reader.spec.ts` | Default reader ACTIVE-only kalir; `includePassive=true` yalniz istenirse PASSIVE kayitlari dahil eder; operational summary ACTIVE-only kalir. |
| PASSIVE UI read-only safety | `project/apps/web/src/__tests__/passive-case-debtor-ui-safety.test.tsx`, `project/apps/web/src/__tests__/passive-child-panel-readonly.test.tsx` | Row/drawer badge, drawer readOnly yayilimi ve child panel create/run kontrolleri korunur. |
| includePassive confinement | `project/apps/web/src/__tests__/case-debtor-include-passive-confinement.test.ts` | Case detail/history yuzeyleri disinda `includePassive: true` yayilmasi engellenir; intake promote ve selector/search akislari ACTIVE-only kalir. |

## Quick note decision

PASSIVE drawer'da quick note read-only kabul edilmistir. Gecmis nota sonradan yazmak operasyonel/audit semantigini bulandirabilecegi icin PR-L7b kapsaminda UI tarafinda edit kapali tutulur; backend contract degisikligi beklenmez.

## Suite shape

Bu davranislar tek bir monolit regression suite'e konsolide edilmemelidir. Her davranis kendi owner modul/test dosyasinda kalir; bu indeks ve PR-R1 web confinement testleri gorunurluk ve leakage korumasi saglar.
