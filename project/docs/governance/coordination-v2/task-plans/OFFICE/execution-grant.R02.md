# T5-OFFICE-CAP02-EXECUTION-GRANT-R02 — Task-Scoped Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=T5-OFFICE-CAP02-EXECUTION-GRANT-R02 -->

```text
Grant ID           : T5-OFFICE-CAP02-EXECUTION-GRANT-R02
Contract           : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Profile            : BOUNDED_CODE_TASK
Executor lane      : CLAUDE_LOCAL
Scope              : TASK-SCOPED — standing DEGIL, tek task
Issued at          : 2026-07-27T07:56:54Z
Expires at         : 2026-07-28T07:56:54Z   (24 saat)
Auto-merge         : OFF
Manual owner merge : REQUIRED
Grant JSON         : grant.R02.json
```

ReportingLineService.listActive() ve listEligible() okuma yuzeylerinin test-only karakterizasyonu.

## Pinlenen task — ad degil, hash

```text
taskId               OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       bbf1d6a2cfaf20363c7a7bb9077ec6654baeea5b7a860db18fd9c8d4aa4d3acd
declaredIntentSha256 f261c215698eba9fe110f2ccd12c0edba4753eb4bd91876705d99b7a689e52d1
boundaryPolicySha256 f906133efb25f7476bf883d9a9b60cc1faa712199ab1e5e4e647f771fac63d8f
requiredTestsSha256  0b6493fedea46b6c942343f92b594dd85ca6e015e49e5ff8dae83b223e87f01f
basePolicy           REFRESH_BEFORE_EXECUTION
planRef              project/docs/governance/coordination-v2/task-plans/OFFICE/plan.v3.json
promptRef            project/docs/governance/coordination-v2/task-plans/OFFICE/executor-prompt.v2.md
```

Supersede edilen hash `056cd7584ffb2eca…` bu grant'ta **kullanilamaz**;
uretici betik onu pinlemeye calisirsa firlatir. Bkz. `../SUPERSEDED-PLAN-HASHES.md`.

## Yetki zinciri

```text
semanticAuthorityRef  OFFICE-CAP02-REPORTINGLINE-READ-CHARACTERIZATION-R01-AUTHORITY
                      project/docs/governance/decision-log.md
executionGrantRef     T5-OFFICE-CAP02-EXECUTION-GRANT-R02
                      project/docs/governance/coordination-v2/task-plans/OFFICE/execution-grant.R02.md   (bu belge, yukaridaki marker)
ownerRatification     project/docs/governance/coordination-v2/task-plans/OFFICE/plan-ratification.R02.md
                      @ 49ddb7fdf42d75767d81030b830bd5ed630f296b
excerptSha256         f9fd1f06eb690d7a34c775974002064381efba2d0b9bc82cd4c775d41e06efc6
```

Uc referansin ucu de `run-task.cjs` tarafindan **calisma aninda** repository'ye
karsi cozulur: `verifyAuthorityRefs` recordId'lerin gercekten var oldugunu ve
execution grant kaydinin marker tasidigini, `verifyRatificationEvidence`
alintinin dosyada birebir bulundugunu ve commit'in main ancestor'i oldugunu
dogrular. Bu kontroller bu tur canli yola baglandi; onceden yalnizca testlerden
cagriliyorlardi.

**Alintinin pinlenen hash'i icermesi kasitlidir.** Sema `planRatificationRef`
tasimaz ve owner onu icat etmemizi yasakladi; bu yuzden bag mevcut evidence
modeliyle kuruldu: alinti, ratifiye edilen `taskSpecSha256`'yi metin olarak
tasir. Bugun hicbir kod alintinin pinlenen hash'e karsilik geldigini
dogrulamaz — bag bu nedenle en azindan okunabilir birakildi.

## Sinir

```text
allowedModuleRoots   project/apps/api/src/modules/reporting-line/__tests__/reporting-line.service.spec.ts/
task boundary        ayni kok (grant sinirinin alt kumesi)
maxChangedFiles      1
```

## Yasak

```text
production kaynak degisikligi · schema / migration · runtime aktivasyon
yeni urun veya domain semantigi · auto-merge · force push · rebase
executor'in commit / push / PR / merge yapmasi
```

## Suresi dolarsa

Bu grant `2026-07-28T07:56:54Z` sonrasinda gecersizdir
(`validateAgainstGrant` -> `GRANT_EXPIRED`). Suresi dolmus bir grant **yeniden
kullanilmaz**; R03 revizyonu uretilir.

## Bu kaydi kim yazdi, hangi yetkiyle

```text
YAZAN   : agent, owner'in T5 brief'indeki §9 talimatiyla
NITELIK : transkripsiyon — bu belge yeni bir owner karari URETMEZ
KANIT   : ratifikasyon kaniti owner'in brief'i ve plan-ratification.R02.md'dir,
          bu commit DEGILDIR
```

---

**IMPLEMENTATION AUTHORITY: TASK-SCOPED.** Yalnizca yukarida hash'iyle pinlenen
tek task icin, yalnizca yukaridaki sinir icinde, yalnizca sure dolana kadar.
Baska hicbir sey yetkilendirilmez.
