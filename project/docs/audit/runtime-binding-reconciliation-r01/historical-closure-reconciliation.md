# Historical Closure Reconciliation — R01

Audit base: `87090cdd45b6a17bc98f359d6b2a951f7130d4bd`
Tarihsel commit: 1989
Closure/closeout/standalone CLOSED iddiasıyla ilişkili capability: 27

## Yöntem ve kanıt sınırı

- Audit base’in bütün Git commit’leri tekil `historicalWorkId` ile envantere alındı.
- Her capability, implementation dosyasına dokunan bütün commit’lerle ilişkilendirildi; yalnız son commit kullanılmadı.
- Squash subject sonundaki `(#N)` PR referansı olarak kaydedildi. PR gövdesi veya runtime beyanı subject’ten türetilmedi.
- `CANONICAL`, `MERGED` ve `IMPLEMENTED` kayıtları tarihsel iddia olarak matriste korunur; false-closure paydasına yalnız gerçek closure/closeout/standalone CLOSED ve PASS girer.
- `fail-closed` bir closure beyanı değildir ve CLOSED sayılmaz.
- CLOSED beyanı geçmişten silinmez; güncel capability durumu yanına eklenir.

## Tarihsel kayıt dağılımı

| Original status | Tarihsel iş |
|---|---:|
| CANONICAL | 139 |
| CLOSED | 132 |
| IMPLEMENTED | 523 |
| MERGED | 1195 |

## Original status → güncel capability çapraz tablosu

Bu tablo non-exclusive’dir: bir capability birden fazla tarihsel commit statüsüyle ilişkili olabilir.

| Original status | Güncel final status | İlişki adedi |
|---|---|---:|
| CANONICAL | ACTIVE_UNREACHABLE | 1 |
| CANONICAL | BOUND_DORMANT | 3 |
| CANONICAL | OPERABLE_UNVERIFIED | 209 |
| CANONICAL | SUPERSEDED | 15 |
| CANONICAL | UNKNOWN_REQUIRES_EVIDENCE | 6 |
| CLOSED | OPERABLE_UNVERIFIED | 25 |
| CLOSED | SUPERSEDED | 1 |
| CLOSED | UNKNOWN_REQUIRES_EVIDENCE | 1 |
| IMPLEMENTED | ACTIVE_UNREACHABLE | 11 |
| IMPLEMENTED | BOUND_DORMANT | 80 |
| IMPLEMENTED | CODE_PRESENT_UNBOUND | 100 |
| IMPLEMENTED | INTENTIONALLY_DORMANT | 7 |
| IMPLEMENTED | OPERABLE_UNVERIFIED | 3039 |
| IMPLEMENTED | SUPERSEDED | 75 |
| IMPLEMENTED | UNKNOWN_REQUIRES_EVIDENCE | 298 |
| MERGED | ACTIVE_UNREACHABLE | 10 |
| MERGED | BOUND_DORMANT | 216 |
| MERGED | CODE_PRESENT_UNBOUND | 23 |
| MERGED | INTENTIONALLY_DORMANT | 3 |
| MERGED | OPERABLE_UNVERIFIED | 3523 |
| MERGED | SUPERSEDED | 151 |
| MERGED | UNKNOWN_REQUIRES_EVIDENCE | 373 |
| MERGED | VERIFIED_OPERATIONAL | 8 |

## Closure iddialarının tekil uzlaştırması

| Capability | Original claim(s) | Güncel durum | Reconciliation | Kanıt / breakpoint |
|---|---|---|---|---|
| CLI-0C61E57E2CDD — hukuk-platform:db:studio | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.db:studio |
| CLI-2DA40C06F8BD — hukuk-platform:orch:verify-executors | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.orch:verify-executors |
| CLI-38A87F9DBFD0 — hukuk-platform:orch:service | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.orch:service |
| CLI-43EF0B16796E — hukuk-platform:orch:run | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.orch:run |
| CLI-562C5A953DD7 — hukuk-platform:orch:enqueue | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.orch:enqueue |
| CLI-7F9783911686 — hukuk-platform:lint | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.lint |
| CLI-8018B19E88FA — hukuk-platform:orch:closeout | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.orch:closeout |
| CLI-88141DA5450D — hukuk-platform:verify:live | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.verify:live |
| CLI-956AECCAE6BA — hukuk-platform:db:generate | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.db:generate |
| CLI-9EEADCE50B6E — hukuk-platform:type-check | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.type-check |
| CLI-B409CACEE8A6 — hukuk-platform:build | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.build |
| CLI-C23C1302D87D — hukuk-platform:db:push | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.db:push |
| CLI-E01985D02B4F — hukuk-platform:dev | HIST-D004068C3FFF CLOSED: feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/package.json:scripts.dev |
| INT-202E7ADC4290 — TariffService | HIST-D21135EA08C0 CLOSED: fix(tariff): fail closed on missing required tariff sections (#997) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/api/src/modules/expense-request/expense-calculator.service.ts:consumer-reference<br>project/apps/api/src/modules/fee-engine/fee-engine.module.ts:FeeEngineModule.providers<br>project/apps/api/src/modules/tariff/tariff.controller.ts:consumer-reference |
| INT-559856C8029B — CaseBalanceService | HIST-11023234457E CLOSED: fix(interest): fail closed on NO_BUCKETS (ADR-014 PR-2) (#1104) | UNKNOWN_REQUIRES_EVIDENCE | CLOSED_BUT_UNVERIFIED | project/apps/api/src/modules/accounting-journal/accounting-journal.writer.ts:consumer-reference<br>project/apps/api/src/modules/balance-display-shadow-diff/balance-display-shadow-diff.service.ts:consumer-reference<br>project/apps/api/src/modules/balance-shadow-compare/balance-shadow-compare.service.ts:consumer-reference |
| INT-8B049A21ADAA — ClaimItemService | HIST-5CAB26213FAC CLOSED: fix(receivable): fail closed unsupported rule components (RCV-CLAIM-FORM-P02-S01) (#1439) | SUPERSEDED | CLOSED_SUPERSEDED | project/apps/api/src/modules/claim-item/claim-item.controller.ts:consumer-reference<br>project/apps/api/src/modules/claim-item/claim-item.module.ts:ClaimItemModule.providers<br>project/apps/api/src/modules/claim-item/claim-item.service.ts:59 |
| INT-96210DFD3630 — UyapCaseMapperService | HIST-FBEF69159FC6 CLOSED: fix(uyap): fail closed on unsupported legacy instrument export | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/api/src/modules/uyap-export/uyap-case-mapper.service.ts:50<br>project/apps/api/src/modules/uyap-export/uyap-export.module.ts:UyapExportModule.providers<br>project/apps/api/src/modules/uyap-export/uyap-export.service.ts:consumer-reference |
| UI-17BA2FFBF305 — Next.js route /portal | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/(dashboard)/settings/clients/page.tsx:navigation-reference<br>project/apps/web/src/app/(dashboard)/settings/portal/page.tsx:navigation-reference<br>project/apps/web/src/app/(dashboard)/settings/security/page.tsx:navigation-reference |
| UI-22081B10F7CC — Next.js route /portal/cases | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-dashboard-aggregate.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-route-boundary.spec.tsx:navigation-reference |
| UI-4400567A1B8A — Next.js route /portal/login | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-route-boundary.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/forgot-password/page.tsx:navigation-reference |
| UI-585E221FEA04 — Next.js route /portal/forgot-password | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-route-boundary.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/forgot-password/page.tsx:1 |
| UI-7AD63ABCE73E — Next.js route /portal/documents | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-api-base-url-usage.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-notifications.spec.tsx:navigation-reference |
| UI-7E344E276C65 — Next.js route /portal/cases/[id] | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-dashboard-aggregate.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-route-boundary.spec.tsx:navigation-reference |
| UI-C679ADB15948 — Next.js route /portal/messages | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-api-base-url-usage.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/__tests__/portal-layout-notifications.spec.tsx:navigation-reference |
| UI-E701D0365454 — Next.js route /portal/poas | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-closeout-r01.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/layout.tsx:navigation-reference<br>project/apps/web/src/app/portal/poas/__tests__/portal-poa-page.spec.tsx:navigation-reference |
| UI-EAD407FC7C58 — Next.js route /portal/profile | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/(dashboard)/settings/security/page.tsx:navigation-reference<br>project/apps/web/src/app/portal/layout.tsx:navigation-reference<br>project/apps/web/src/app/portal/profile/page.tsx:1 |
| UI-F559139C175A — Next.js route /portal/reset-password | HIST-A154EC6D29E0 CLOSED: docs(client): CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation and closure (#1625) | OPERABLE_UNVERIFIED | CLOSED_BUT_UNVERIFIED | project/apps/web/src/app/portal/__tests__/portal-layout-route-boundary.spec.tsx:navigation-reference<br>project/apps/web/src/app/portal/layout.tsx:navigation-reference<br>project/apps/web/src/app/portal/reset-password/__tests__/reset-password-page.spec.tsx:navigation-reference |

INCORRECTLY_CLOSED_COUNT: 0
HISTORICALLY_CLOSED_COUNT: 27
FALSE_CLOSURE_RATE: 0%

Not: `CLOSED_BUT_UNVERIFIED`, geçmişteki kapanışın otomatik olarak yanlış olduğu anlamına gelmez;
yalnız bu audit’in L6 bağımsız runtime teslim kanıtı üretmediğini gösterir.

