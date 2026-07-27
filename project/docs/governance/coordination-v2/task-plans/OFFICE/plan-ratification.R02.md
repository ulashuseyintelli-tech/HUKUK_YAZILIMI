# T5-OFFICE-CAP02-PLAN-RATIFICATION-R02 — Plan Hash Ratification

<!-- GOV-COORD-AUTHORITY kind=PLAN_RATIFICATION recordId=T5-OFFICE-CAP02-PLAN-RATIFICATION-R02 -->

```text
Record ID    : T5-OFFICE-CAP02-PLAN-RATIFICATION-R02
Phase        : P4 (§7) of T5-PLAN-BASE-POLICY-REFRESH-AND-EXECUTION-RESUME-R01
Contract     : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Profile      : BOUNDED_CODE_TASK
Auto-merge   : OFF
Manual owner merge : REQUIRED
```

## Ratifiye edilen hash

Task **adıyla** değil, immutable hash kimliğiyle pinlenir (contract §2). Plan
sonradan değişirse hash değişir ve bu ratifikasyon o planı authorize **etmez**.

```text
taskId               OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       bbf1d6a2cfaf20363c7a7bb9077ec6654baeea5b7a860db18fd9c8d4aa4d3acd
declaredIntentSha256 f261c215698eba9fe110f2ccd12c0edba4753eb4bd91876705d99b7a689e52d1
boundaryPolicySha256 f906133efb25f7476bf883d9a9b60cc1faa712199ab1e5e4e647f771fac63d8f
requiredTestsSha256  0b6493fedea46b6c942343f92b594dd85ca6e015e49e5ff8dae83b223e87f01f
basePolicy           REFRESH_BEFORE_EXECUTION
baseSha              5e35db28903a538784d264a7919e32c0bd2b7c9f
planRef              project/docs/governance/coordination-v2/task-plans/OFFICE/plan.v3.json
```

Hash'ler `authority.specDigests()` ile plan dosyasından bu kayıt yazılırken
yeniden türetilmiştir; önceki bir turdan kopyalanmamıştır.

**`baseSha` bu politikada yürütmede kullanılmaz.** `REFRESH_BEFORE_EXECUTION`
altında orchestrator worktree base'ini claim anında `origin/main`'den alır.
Alan belgeseldir — planın hangi ağaca bakılarak üretildiğini kaydeder — ve
`taskSpecSha256`'ya dahil olduğu için burada da yazılıdır.

## Supersede edilen hash

```text
056cd7584ffb2eca95b0d06f6dfe33998a633ada18016f1e0d6652038ea0689b
disposition : SUPERSEDED_BY_BASE_REFRESH
              NOT VALID FOR NEW GRANT · NOT VALID FOR T5 EXECUTION
              HISTORICAL REVIEW EVIDENCE PRESERVED
kayit       : ../SUPERSEDED-PLAN-HASHES.md
```

## Semantic authority — bu ratifikasyonun dayandığı owner kararı

```text
sourcePath       project/docs/governance/decision-log.md
sourceCommitSha  6ec070d41b83bb89860f8401965250717f563672
kayit            OFFICE CAP-02 — REPORTINGLINE READ-SURFACE CHARACTERIZATION AUTHORITY (OFFICE-CAP02-REPORTINGLINE-READ-CHARACTERIZATION-R01-AUTHORITY)
excerptSha256    e551946e8b8b006614b9baff35057fb2357bfd1a053154c6453106854da2c7b6
```

`exactExcerpt` (birebir, dosyadan alındı — elle yazılmadı):

```text
Supersession yalnız şu tek teknik amacı kapsar: `ReportingLineService.listActive()` ve `ReportingLineService.listEligible()` okuma yüzeylerinin **mevcut** davranışının testlerle karakterize edilmesi.
```

Alıntının `origin/main`'in güncel tepesinde de bulunduğu bu kayıt yazılırken
doğrulanmıştır; sonradan kaldırılmış bir yetki yürürlükte değildir.

## Review kanıtı

```text
bağımsız adversarial review — PASS (BOUNDARY TOO WIDE: NO, AUTHORITY VALID: YES); blocking yok, 7 advisory kaydedildi. Öncülü plan.v2 ayrıca 4 tur review gördü (R1/R2/R3 FAIL, R4 PASS) ve semantik içerik bayt olarak korundu.
```

## Kapsam

```text
IZINLI    test-only characterization — ReportingLineService.listActive() ve listEligible()
          tek dosya: project/apps/api/src/modules/reporting-line/__tests__/reporting-line.service.spec.ts/
          maxChangedFiles: 1

YASAK     production kaynak degisikligi
          schema / migration
          runtime aktivasyon
          yeni urun veya domain semantigi
```

Bu ratifikasyon **hiçbir** production, schema veya migration yetkisi üretmez.

## Bu kaydı kim yazdı, hangi yetkiyle

```text
YAZAN   : agent, owner'ın T5 brief'indeki §7 ex-ante conditional ratification
          yetkisiyle
NITELIK : transkripsiyon — bu belge yeni bir owner kararı ÜRETMEZ
KANIT   : ratifikasyon kanıtı owner'ın brief'idir, bu commit DEĞİLDİR
```

Bir ajanın kendi commit'i, kendi başına owner ratifikasyonunun kanıtı değildir.

---

**IMPLEMENTATION AUTHORITY: NONE.** Task ancak `T5-OFFICE-CAP02-EXECUTION-GRANT-R02`
bu hash'i pinlediğinde ve authority doğrulaması PASS verdiğinde çalıştırılabilir.
