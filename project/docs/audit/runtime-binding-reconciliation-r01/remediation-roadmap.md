# Remediation Roadmap — R01

Audit base: `01240549d451b452d89091ffe822ecf5bdaac1ec`

Bu roadmap execution authority üretmez. `OWNER_DECISION_REQUIRED`, migration,
production activation ve external credential gerektiren işler ayrı owner kararı
olmadan uygulanamaz. Bu audit PR’ında runtime source değişikliği yapılmamıştır.

## Öncelik sonucu

| Seviye | Capability | Disposition |
|---|---:|---|
| P0 | 0 | Doğrulanmış canlı security/legal/data-integrity exposure yok. İsimden P0 türetilmedi. |
| P1 | 35 | Dört backend surface grubu ve iki UI route için owner-gated binding/product kararı. |
| P2 | 97 | Admin/ops provider, dormant activation ve consumer eksikleri bounded task’lere ayrılmalı. |
| P3 | 28 | Superseded capability’ler; silme veya legacy cleanup bu audit kapsamında değil. |

## WAVE 1 — Doğrulanmış P0

Bu audit’te eligible task yoktur. Unbound guard/idempotency/audit sınıf adları canlı
exposure kanıtı değildir. Canlı bir root üzerinde korumanın eksik olduğu ayrıca
kanıtlanırsa yeni bounded P0 task açılmalıdır.

## WAVE 2 — Core ve ops HTTP binding kararları

### RBR-R01-T01 — Break-glass disposition

| Alan | Değer |
|---|---|
| capabilityId | `runtime-binding-matrix.csv` içindeki 14 BreakGlass/CrossTenant HTTP satırı ve bağlı internal provider’lar |
| currentStatus | `CODE_PRESENT_UNBOUND` |
| targetStatus | `INTENTIONALLY_DORMANT` veya owner-ratified persistent production binding |
| exact breakpoint | `BreakGlassModule` production-reachable import graph’ında değil |
| expected files | `break-glass.module.ts`, ratified import/composition root, focused composition tests |
| migration | Kalıcı repository seçilirse muhtemel; mevcut module in-memory repository kullanır |
| runtime risk | Çok yüksek; cross-tenant privileged attack surface |
| backward compatibility | Yeni erişilebilir admin yüzeyi |
| test plan | fail-closed auth/allowlist/kill-switch, tenant isolation, persistent audit, route enumeration, L6 side-effect query |
| rollback | import/activation kaydını geri al; audit kayıtlarını koru |
| owner decision | **YES** — persistence, operator role, production activation ve legal audit semantics |

### RBR-R01-T02 — Ops playbook disposition

| Alan | Değer |
|---|---|
| capabilityId | 12 Playbook/Lease/Incident HTTP satırı |
| currentStatus | `CODE_PRESENT_UNBOUND` |
| targetStatus | `INTENTIONALLY_DORMANT` veya bounded production module |
| exact breakpoint | `PlaybookModule`, `DiagnosticsModule` tarafından import edilmiyor |
| expected files | diagnostics/playbook module graph ve focused composition/runtime tests |
| migration | Bilinmiyor; playbook state/lease/audit persistence seçimi owner-gated |
| runtime risk | Yüksek; admin actions, lease ve escalation side effects |
| test plan | route/DI enumeration, action policy, lease race, audit persistence, independent state query |
| rollback | module import/flag kapatılır |
| owner decision | **YES** — product/ops activation ve persistence |

### RBR-R01-T03 — Manifest admin disposition

| Alan | Değer |
|---|---|
| capabilityId | 7 `ManifestAdminController` HTTP satırı |
| currentStatus | `CODE_PRESENT_UNBOUND` |
| targetStatus | `INTENTIONALLY_DORMANT` veya explicitly authorized admin binding |
| exact breakpoint | production `module.controllers` kaydı yok |
| expected files | yeni/mevcut bounded module, composition root, route enumeration and L6 redrive evidence |
| migration | Mevcut persistence yeterliliği ayrıca doğrulanmalı |
| runtime risk | Yüksek; retry/DLQ mutation ve admin attack surface |
| test plan | auth/rate-limit/idempotency/transaction/audit + disposable DB side-effect verification |
| rollback | controller registration/flag geri alınır; DLQ state korunur |
| owner decision | **YES** — önceki audit de binding’i owner kararına bırakmıştır |

## WAVE 3 — Dormant activation

### RBR-R01-T04 — Dormant flag/config evidence pack

| Alan | Değer |
|---|---|
| capabilityId | 45 `BOUND_DORMANT` ve 100 `UNKNOWN_REQUIRES_EVIDENCE` satırı |
| currentStatus | `BOUND_DORMANT` / `UNKNOWN_REQUIRES_EVIDENCE` |
| targetStatus | deploy evidence ile `OPERABLE_UNVERIFIED`, ratified dormant veya L6 |
| exact breakpoint | deployed flag/config/seed/migration/tenant capability değeri audit kapsamında okunmadı |
| migration | Capability’ye göre değişir; migration uygulandığı varsayılmaz |
| runtime risk | Orta–yüksek |
| test plan | secret değerini açığa çıkarmadan config-presence, route/registry snapshot ve representative behavior |
| rollback | activation değeri eski haline alınır |
| owner decision | Production activation için **YES**; read-only evidence collection için NO |

## WAVE 4 — Scheduler ve internal consumer

### RBR-R01-T05 — Provider-without-root reconciliation

| Alan | Değer |
|---|---|
| capabilityId | 11 internal `ACTIVE_UNREACHABLE` satırı |
| currentStatus | `ACTIVE_UNREACHABLE` |
| targetStatus | gerçek root consumer veya explicit superseded/dormant disposition |
| exact breakpoint | provider registration var; root’a ulaşan production consumer yok |
| expected files | ilgili module/service ve focused consumer/composition tests |
| migration | Beklenmiyor; side-effect’e göre yeniden değerlendirilir |
| runtime risk | Orta |
| test plan | DI graph + gerçek root invocation + observable side effect |
| rollback | consumer binding kaldırılır |
| owner decision | İşlevin hâlâ gerekli olup olmadığı için çoğu satırda **YES** |

## WAVE 5 — UI reachability

### RBR-R01-T06 — Client edit/accounting route disposition

| Alan | Değer |
|---|---|
| capabilityId | `UI-4559857D5B3C`, `UI-D8B811E689DF` |
| currentStatus | `ACTIVE_UNREACHABLE` |
| targetStatus | gerçek navigation/action consumer veya intentional private/disposition |
| exact breakpoint | repository navigation/action referansı yok |
| expected files | ilgili client detail UI/navigation ve Playwright smoke |
| migration | Yok |
| runtime risk | Düşük–orta; authorization ve stale route davranışı doğrulanmalı |
| test plan | role-aware navigation, direct route, API contract, post-action backend state |
| rollback | navigation entry kaldırılır |
| owner decision | **YES** — kullanıcı akışı ve rol görünürlüğü seçimi |

## WAVE 6 — Legacy/superseded

28 `SUPERSEDED` capability otomatik silinmeyecektir. Önce replacement ancestry,
consumer absence ve data/audit retention etkisi doğrulanmalı; destructive removal için
ayrı owner authority gerekir.

## WAVE 7 — Verification expansion

1.240 `OPERABLE_UNVERIFIED` capability için tek seferde toplu refactor yapılmayacaktır.
Risk tabanlı representative L6 paketleri önce authorization/tenant, financial/legal
mutation, scheduler/integration ve core UI akışlarına uygulanmalıdır. Her paket gerçek
entry point, consumer execution, disposable persistence/integration ve bağımsız state
sorgusunu birlikte kanıtlamalıdır.

## Next eligible task

Production mutation gerektirmeyen en küçük sonraki iş:
`RBR-R01-T04` için secret içermeyen deployed activation-presence evidence collector ve
yüksek-riskli UNKNOWN satırlarının manuel triage’ıdır. Production config kaynağına
read-only erişim yoksa sonuç `BLOCKED_EXTERNAL_VERIFICATION` kalır.
