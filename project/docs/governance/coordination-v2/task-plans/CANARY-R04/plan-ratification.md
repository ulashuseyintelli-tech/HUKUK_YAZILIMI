# CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04 — plan ratification

Yetki kaynagi: `semantic-authority.md` (owner karari 2026-07-28, secenek 3).

## Pinlenen degerler

    TASK ID          CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
    PROGRAM          ORCHESTRA_OPERATIONAL_CANARY
    GRANT            TASK-GRANT-CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
    GRANT KIND       TASK_SCOPED_ONE_SHOT
    PLAN HASH        845b3d47b75c40628b08c12f9656d5adf8cae3015d02369d72212fbc1586dba6
    TARGET PATH SHA  6b19b2a6eed16fd65fa3af8d89b71354a384cfb57ee4c4c3033e209733a9eedb
    BASE SHA         8f2fc5cd724115b5271cc5281e4cc1da61670976
    EXECUTOR LANE    CODEX_LOCAL
    MERGE POLICY     SQUASH, service-owned, maxSuccessfulMerges 1, maxPRs 1

Plan hash kanonik `authority.specDigests()` yolundan uretilmistir — plandaki
turetilmis `*Sha256` alanlari normalizasyonda cikarilir. Ayni degerin ham
`digest()` ile uretilmesi R03'te iki kez `TASK_SPEC_HASH_MISMATCH` uretmisti;
burada tek kaynak `specDigests()`tir.

## Sinir

Tam olarak tek dosya:

    project/scripts/orchestration-v2/activation-evidence/
    CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04.md

`maxChangedFiles: 1`. Grant'in `allowedPathRoots` alani ayni tek yolu tasir ve
`one-shot-grant.cjs` plan ile grant'in bu konuda harfi harfine ayni seyi
soylemesini sart kosar: dizin adi kabul edilmez, iki yol kabul edilmez.

## Neden yeni bir grant turu

Service-owned merge yetkisi olan her standing grant urun modulu kod koklerine
bagliydi; governance evidence yuzeyine ulasan tek grant ise AUTO_MERGE'u
tasarim geregi reddediyordu. Ikisini birlestirmenin tek yolu bir standing
grant'i genisletmekti ve bu, her grant'in `noSelfAuthorizationChange` kurali
altinda yasaktir.

Owner bu yuzden yetkiyi genisletmek yerine daralttı: tek task, tek plan hash,
tek dosya, tek PR, tek basarili merge. Uygulayici
`orchestrator/one-shot-grant.cjs`, kanit `orchestrator/one-shot-grant.test.cjs`
icindeki on yedi reddetme testidir.

## Zorunlu test

    pnpm exec node --test scripts/orchestration-v2/orchestrator/one-shot-grant.test.cjs

Bu kosuyu yetkilendiren makinenin kendi negatif testleri. Ratification ile merge
arasinda reddetmelerden biri gecerliligini yitirirse merge oncesinde durur.

## Ratification kapsami disinda

Bu ratification yalnizca R04 icindir. Sonraki bir canary yeni bir owner karari,
yeni bir tek kullanimlik grant ve yeni bir plan hash gerektirir; bu grant
CONSUMED olduktan sonra hicbir sey yetkilendirmez.
