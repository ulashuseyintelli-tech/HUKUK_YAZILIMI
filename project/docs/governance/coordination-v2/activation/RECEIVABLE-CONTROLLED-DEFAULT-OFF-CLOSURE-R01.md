# RECEIVABLE Controlled Default-Off Kapanis Kaydi (R01)

`POST-PHASE-5-RESIDUAL-HYGIENE-AND-CANONICAL-CLOSEOUT-R01` gorevinin WP04
adiminin canonical kaydi. RECEIVABLE-LEGAL-BASIS-RESOLVER-CONTROLLED-DEFAULT-OFF-R01
gorevinin kapanis zincirinin fresh process ile yeniden dogrulanmis hali.

## Canonical gercek

```text
TASK       : RECEIVABLE-LEGAL-BASIS-RESOLVER-CONTROLLED-DEFAULT-OFF-R01
QUEUE ENTRY: 2d9eb72b7c9016b245cde9a2
PR         : #1930
HEAD SHA   : 0f332ed310d5b0f046d29f9ec68640017e0648e3
MERGE SHA  : 479df1056bbaf94ab0d6d946500e5b01c3550267
MERGED AT  : 2026-07-29T23:56:28Z
```

## Fresh dogrulama (bu oturumda, mock'suz)

| Kontrol | Sonuc |
|---|---|
| GitHub PR state | MERGED (`gh pr view 1930`) |
| merge SHA → origin/main ancestor | PASS (`git merge-base --is-ancestor`) |
| queue store | CLOSED |
| task store | CLOSED |
| iki store uyumu | "both stores agree the task is closed" |
| standing grant `validateAgainstGrant` | PASS (gercek `authority.cjs`, fixture/mock yok) |
| `verifyAuthorityRefs` (semanticAuthorityRef + executionGrantRef) | PASS |
| `verifyRatificationEvidence` | PASS |
| activation flag default | KAPALI (`RECEIVABLE_LEGAL_BASIS_RESOLVER_ENABLED`, katı `=== 'true'` karsilastirmasi) |
| module binding | ABSENT (`claim-item.module.ts` icinde resolver'a hicbir referans yok) |
| required test dosyasi | mevcut (`legal-basis-registry-resolver.spec.ts`, 5877 byte) |
| CI manifest kaydi | mevcut (`ci-manifests/pure/claim-collection-finance.txt` satir 67) |

## Kapanis zincirinin ozeti

Uc calistirma denemesi gerekti:
1. **0da0be71** — `EXECUTOR_TIMEOUT` (30dk ic limit, 0 commit, gecici/altyapisal).
2. **79bd9cca** — executor basariyla 3 dosyayi uretti (resolver + activation
   flag + birim testleri), PR #1930 acildi; CI ilk geciste
   `REQUIRED_CI_FAILED` verdi cunku yeni spec hicbir CI manifestine kayitli
   degildi (gorev tanimindaki eksik 4. adim — bu adim zaten RECEIVABLE'in
   path-boundary'sinin disinda kaldigi icin executor'in kendisi de
   yapamazdi). Ayri bir governance-fix commit'i ile manifest kaydi eklendi,
   yerelde (Prisma'siz, izole) 18/18 test dogrulandi, CI ikinci geciste
   PASS oldu, PR merge oldu.
3. **HY_receivable_ci_manifest_fix** — 79bd9cca ile ayni is/branch uzerinde
   manifest duzeltmesinin yapildigi worktree.

Merge sonrasi queue kaydinin kendi `prNumber`/`handoff` alanlari bos oldugu
icin (`REQUIRED_CI_FAILED` kod yolu bu alanlari yazmiyor), `handoff.prNumber`
isaretcisi tohumlanip `reconcile-merged` + `reconcile-task-store` komutlariyla
GERCEK GitHub dogrulamasina dayanan mutabakat yapildi (mergeSha reachability,
PR state, baseRefName tam kontrol edildi — hicbir deger korlemesine
guvenilmedi).

## Degistirilmeyenler (dogrulandi, dokunulmadi)

```text
resolver davranisi        : DEGISMEDI
activation default        : KAPALI, DEGISMEDI
module binding             : YOK, DEGISMEDI
legal registry icerigi     : DEGISMEDI
legal policy                : DEGISMEDI
migration state             : DEGISMEDI
```

## Sonuc

**RECEIVABLE TASK: CLOSED.** Yeni bir execution transition uretilmedi; her sey
zaten dogruydu ve her iki store zaten CLOSED idi. Mekanik reconciliation
gerekmedi.
