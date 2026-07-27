# T5-COLLECTION-EXECUTION-GRANT-R02 — Task-Scoped Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=T5-COLLECTION-EXECUTION-GRANT-R02 -->

```text
Grant ID           : T5-COLLECTION-EXECUTION-GRANT-R02
Contract           : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Profile            : BOUNDED_CODE_TASK
Executor lane      : CODEX_LOCAL
Scope              : TASK-SCOPED — standing DEGIL, tek task
Issued at          : 2026-07-27T07:56:54Z
Expires at         : 2026-07-28T07:56:54Z   (24 saat)
Auto-merge         : OFF
Manual owner merge : REQUIRED
Grant JSON         : grant.R02.json
```

Mevcut Collection confirmation davranisinin test-only karakterizasyonu.

## Pinlenen task — ad degil, hash

```text
taskId               RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       f5c11d0b41be2d9895aa0d9769936950d0e8cbdcf2d5beed64f366293ece5318
declaredIntentSha256 988a37755026d24c2e002236e9bb4532ab8c9ad95488e24d75eef93f33d99264
boundaryPolicySha256 6e7cb3dca041716810ba8040286e1b9a18c218230100d3978e971bac7292ad85
requiredTestsSha256  c49f9dc21e8f38d4037a70ba4da7d6989c7d021c413221d5d2560c3ce15fdc5c
basePolicy           REFRESH_BEFORE_EXECUTION
planRef              project/docs/governance/coordination-v2/task-plans/COLLECTION/plan.v2.json
promptRef            project/docs/governance/coordination-v2/task-plans/COLLECTION/executor-prompt.md
```

Supersede edilen hash `4a84fe4c658d0370…` bu grant'ta **kullanilamaz**;
uretici betik onu pinlemeye calisirsa firlatir. Bkz. `../SUPERSEDED-PLAN-HASHES.md`.

## Yetki zinciri

```text
semanticAuthorityRef  RCV-COL-W2.2D-1A-TEST-ONLY-CHARACTERIZATION-AUTHORITY
                      project/docs/governance/decision-log.md
executionGrantRef     T5-COLLECTION-EXECUTION-GRANT-R02
                      project/docs/governance/coordination-v2/task-plans/COLLECTION/execution-grant.R02.md   (bu belge, yukaridaki marker)
ownerRatification     project/docs/governance/coordination-v2/task-plans/COLLECTION/plan-ratification.R02.md
                      @ 49ddb7fdf42d75767d81030b830bd5ed630f296b
excerptSha256         7538a8a13d1f28f11902a212013369a8cf34f1f2104850ef40bca7125bd700f2
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
allowedModuleRoots   project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts/
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
