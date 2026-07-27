# T5-COLLECTION-PLAN-RATIFICATION-R02 — Plan Hash Ratification

<!-- GOV-COORD-AUTHORITY kind=PLAN_RATIFICATION recordId=T5-COLLECTION-PLAN-RATIFICATION-R02 -->

```text
Record ID    : T5-COLLECTION-PLAN-RATIFICATION-R02
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
taskId               RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       f5c11d0b41be2d9895aa0d9769936950d0e8cbdcf2d5beed64f366293ece5318
declaredIntentSha256 988a37755026d24c2e002236e9bb4532ab8c9ad95488e24d75eef93f33d99264
boundaryPolicySha256 6e7cb3dca041716810ba8040286e1b9a18c218230100d3978e971bac7292ad85
requiredTestsSha256  c49f9dc21e8f38d4037a70ba4da7d6989c7d021c413221d5d2560c3ce15fdc5c
basePolicy           REFRESH_BEFORE_EXECUTION
baseSha              5e35db28903a538784d264a7919e32c0bd2b7c9f
planRef              project/docs/governance/coordination-v2/task-plans/COLLECTION/plan.v2.json
```

Hash'ler `authority.specDigests()` ile plan dosyasından bu kayıt yazılırken
yeniden türetilmiştir; önceki bir turdan kopyalanmamıştır.

**`baseSha` bu politikada yürütmede kullanılmaz.** `REFRESH_BEFORE_EXECUTION`
altında orchestrator worktree base'ini claim anında `origin/main`'den alır.
Alan belgeseldir — planın hangi ağaca bakılarak üretildiğini kaydeder — ve
`taskSpecSha256`'ya dahil olduğu için burada da yazılıdır.

## Supersede edilen hash

```text
4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
disposition : SUPERSEDED_BY_BASE_REFRESH
              NOT VALID FOR NEW GRANT · NOT VALID FOR T5 EXECUTION
              HISTORICAL REVIEW EVIDENCE PRESERVED
kayit       : ../SUPERSEDED-PLAN-HASHES.md
```

## Semantic authority — bu ratifikasyonun dayandığı owner kararı

```text
sourcePath       project/docs/governance/decision-log.md
sourceCommitSha  855f4793c34145e302a914113db4e055c892f570
kayit            RC-COL / W2.2D-1 — SCHEMA-FOUNDATION EXECUTION RECONCILIATION + W2.2D-1A TEST-ONLY CHARACTERIZATION AUTHORIZATION
excerptSha256    6200235728a5d5b8430b3848b2d7e48ca2586ce170e3a5035ebede1b185e7fd2
```

`exactExcerpt` (birebir, dosyadan alındı — elle yazılmadı):

```text
W2.2D-1A yalnız mevcut Collection confirmation davranışını karakterize eden test-only successor'dır; production kod, schema, migration veya lifecycle semantiği değişikliği yasaktır.
```

Alıntının `origin/main`'in güncel tepesinde de bulunduğu bu kayıt yazılırken
doğrulanmıştır; sonradan kaldırılmış bir yetki yürürlükte değildir.

## Review kanıtı

```text
bağımsız adversarial review — PASS (BOUNDARY TOO WIDE: NO, AUTHORITY VALID: YES); 1 blocking evrak bulgusu düzeltildi, 6 advisory kaydedildi
```

## Kapsam

```text
IZINLI    test-only characterization — mevcut Collection confirmation davranışı
          tek dosya: project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts/
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

**IMPLEMENTATION AUTHORITY: NONE.** Task ancak `T5-COLLECTION-EXECUTION-GRANT-R02`
bu hash'i pinlediğinde ve authority doğrulaması PASS verdiğinde çalıştırılabilir.
