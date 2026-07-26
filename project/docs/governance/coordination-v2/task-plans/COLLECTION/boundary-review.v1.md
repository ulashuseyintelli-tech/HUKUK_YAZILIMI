# COLLECTION — Boundary Review v1 (adversarial)

```text
Plan            : task-plans/COLLECTION/plan.v1.json
taskId          : RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
Base            : 64d54732ffffc3246ac03af242e0ec9611fc0222
Planner         : CLAUDE
Reviewer        : bağımsız ajan, salt-okunur, "çürüt" talimatıyla — planner DEĞİL
Tur sayısı      : 3
FINAL VERDICT   : PASS
BOUNDARY TOO WIDE: NO
```

## 1. Tur özeti

| Tur | Verdict | Ne değişti |
|---|---|---|
| 1 | **FAIL** — boundary too wide: YES | boundary dizinden tek dosyaya indirildi; `cwd` düzeltildi; selektör `--runTestsByPath`'e geçti |
| 2 | **FAIL** — boundary too wide: NO | `requiredTests`'e install + prisma generate prerequisite'leri eklendi; `npx` → `pnpm exec` |
| 3 | **PASS** — boundary too wide: NO | — |

Planner iki turda da reviewer'ı haklı buldu ve kendi kanıtıyla doğruladı.

## 2. Kapatılan blocking bulgular

**B1 — Boundary kendi yetki kaydından genişti.** Yetki kaydı
(`t5-preflight/collection-test-only-decision-pack.md §5`) sınırı harfiyen tek
dosya olarak adlandırıyordu; plan dizini vermişti. Dizin altındaki
`currency-grouper.spec.ts` ve `rate-requirements.spec.ts` CI'da hiç koşmuyor —
executor birini boşaltıp `maxChangedFiles: 1` içinde kalabilir, hem
`requiredTests` hem CI yeşil kalırdı.

Düzeltme: `allowedRoots` tek-dosya formunda
(`.../payment-mapper.spec.ts/`). `boundary.underAnyRoot` önce
`path === r.slice(0,-1)` tam-eşleşmesini deniyor, `task.schema.json`'ın
`repoRoot` pattern'i bu stringi kabul ediyor.

Gerçek `boundary.validate` ile ölçüldü:

```text
MODIFY hedef                        within=true
DELETE hedef                        within=true
ADD kardeş spec                     within=false  OUTSIDE_PERMITTED_BOUNDARY
MODIFY currency-grouper             within=false  OUTSIDE_PERMITTED_BOUNDARY
ADD __snapshots__/ alt dizin        within=false  OUTSIDE_PERMITTED_BOUNDARY
MODIFY production payment-mapper.ts within=false  OUTSIDE_PERMITTED_BOUNDARY
```

**B2 — `cwd` yanlıştı.** Plan `cwd: "project"` diyordu; `jest.config.js` ve
`jest` devDependency yalnız `project/apps/api` altında, ve `ci.yml` **97 kez**
`cd apps/api` yapıyor. Düzeltildi.

**B3 — requiredTests hiçbir temiz worktree'de yeşile dönemezdi.** Bu tek başına
planı işlevsiz kılıyordu:

```text
scripts/orchestration-v2 altında hiç install çağrısı YOK
.gitignore:2 node_modules/  →  git worktree add taşımaz
→ npx registry'ye düşer, PİNLENMEMİŞ jest çeker
```

Planner yerel koşarken bunu birebir gördü: çekilen sürüm
`--testPathPattern`'ı `--testPathPatterns` olarak yeniden adlandırmıştı.

Düzeltme: `npx` → `pnpm exec` (registry fallback'i yok;
`project/package.json` `packageManager: pnpm@8.15.0` pinliyor) + iki
prerequisite girdisi.

**B4 — `prisma generate` eksikti.** Planner OFFICE'in testlerini baz'da
koştururken bulundu; reviewer node_modules olmadığı için koşamazdı:

```text
Cannot find module '.prisma/client/default'
Test Suites: 4 failed · Tests: 0 · exit 1
```

CI bunu `ci.yml:99-101`'de yapıyor. `prisma migrate deploy` (`ci.yml:102-103`)
**kasıtlı olarak dışarıda** — payment-mapper saf unit test, DB gerektirmiyor.

## 3. Uçtan uca yürütme kanıtı

`orchestrator.cjs`'in yaptığı gibi koşuldu (sırayla, `cwd = join(worktree, entry.cwd)`,
her biri exit 0):

```text
[0] pnpm install --frozen-lockfile              cwd=project            1.6s  exit=0
[1] pnpm --filter @hukuk/api exec prisma generate cwd=project          3.6s  exit=0
[2] pnpm exec jest … --runTestsByPath …         cwd=project/apps/api   6.6s  exit=0
                                                 payment-mapper 26/26 PASS
```

## 4. Reviewer'ın kabul edilen atıf düzeltmesi

Planner `--runTestsByPath` için `ci.yml:1839-1843`'e atıf yapmıştı; o aralık
`test -f` guard'ı + `--testPathPattern`'dır. Gerçek emsal: `ci.yml:123/137/149/532`
(npx formu), `:1587/:1609` (pnpm exec formu). Gerekçe kaydında düzeltildi.

## 5. Kalan residual'lar — owner gate'i

Hiçbiri boundary genişliği değil; hepsi kaçınılmaz veya owner'a ait.

```text
R1  taskId RCV-COL-W2.2D-1A-CHARACTERIZATION-R01 için owner-mint kanıtı YOK.
    Workstream ID'si (RCV-COL-W2.2D-1A) owner-kayıtlı; task ID'si değil.
    ID minting bir owner decomposition işlemidir.

R2  grant.template.json'daki <OWNER-FILLS> alanları doldurulmadan
    validateAgainstGrant GRANT_EXPIRY_INVALID ile fail-closed olur. Doğru
    davranış; owner gate'inde çözülür.

R3  validateAgainstGrant, boundary ∩ immutable-forbidden kesişimini
    SPEC-VALIDATION anında uygulamıyor — yalnız diff anında
    (orchestrator.cjs:381). Contract §15.2 plan-anı mekanik kapı ilan ediyor.
    Bu plan için etkisiz (kesişim boş, elle doğrulandı). Kontrol düzlemi işi.

R4  requiredTests, mirror ettiği CI adımından dar: CI aynı çağrıda
    case-balance.service.spec.ts'i de koşuyor. Boundary sorunu değil.

R5  Hedef spec'in mevcut confirmedAt iddiaları (payment-mapper.spec.ts:86-100)
    boundary içinde zayıflatılabilir. Test düzenleme görevlerine içkin; tek
    azaltıcı manualMergeRequired: true owner diff review'ı.

R6  Boundary tek başına hedef dosyanın SİLİNMESİNİ yasaklamıyor (within=true).
    Yakalayan: requiredTests[2] (--runTestsByPath var olmayan yolda exit≠0)
    ve ci.yml:544-547 test -f guard'ı.

R7  YENİ, kontrol düzlemi adayı: requiredTests artık MUTASYON YAPAN komut
    içeriyor (install, generate) ve diff validation ondan ÖNCE
    (orchestrator.cjs:370-398), PR açılışı SONRA (:419-421) çalışıyor.
    Bu planda üç kanıtla kapalı: --frozen-lockfile lockfile yazmaz;
    workspace'te hiç preinstall/postinstall/prepare script'i yok;
    prisma generate yalnız gitignore'lu node_modules altına yazar.
    Genel kural olarak "requiredTests mutasyon yapabiliyorsa diff validation
    PR'dan hemen önce tekrarlanmalı" — GOV-COORD-V2 kontrol düzlemi işi,
    bu task'in kapsamı DEĞİL.
```

## 6. Pinlenen hash'ler

```text
taskSpecSha256       4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
declaredIntentSha256 988a37755026d24c2e002236e9bb4532ab8c9ad95488e24d75eef93f33d99264
boundaryPolicySha256 6e7cb3dca041716810ba8040286e1b9a18c218230100d3978e971bac7292ad85
requiredTestsSha256  c49f9dc21e8f38d4037a70ba4da7d6989c7d021c413221d5d2560c3ce15fdc5c
```

`authority.specDigests()` ile üretildi — orchestrator runtime'da aynı
canonicalizer'ı kullanır, yani byte-birebir. Dördü de
`grant.template.json`'daki pinlerle eşleşiyor.

---

**AUTHORITY: NONE.** Bu kayıt bir plan ratifikasyonu değildir ve hiçbir
execution grant üretmez.
