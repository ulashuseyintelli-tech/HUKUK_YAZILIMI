# OFFICE plan.v3 — base policy refresh evidence

```text
taskId          OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
taskSpecSha256  bbf1d6a2cfaf20363c7a7bb9077ec6654baeea5b7a860db18fd9c8d4aa4d3acd
supersedes      056cd7584ffb2eca95b0d06f6dfe33998a633ada18016f1e0d6652038ea0689b
baseDriftPolicy REFRESH_BEFORE_EXECUTION
baseSha         5e35db28903a538784d264a7919e32c0bd2b7c9f
Owner task      T5-PLAN-BASE-POLICY-REFRESH-AND-EXECUTION-RESUME-R01 (OPTION A)
Authority       decision-log.md -> OFFICE-CAP02-REPORTINGLINE-READ-
                CHARACTERIZATION-R01-AUTHORITY   (değişmedi)
```

## 1. Neden yenilendi

`../SUPERSEDED-PLAN-HASHES.md`. Kısaca: ratification ve grant kanıtı main'e
merge edilmek zorunda, her merge base'i geçersizleştiriyor, `STRICT_PINNED_BASE`
bu döngüde sağlanamıyor. PR #1649 (`5e35db28`) drift kapısını çalışır hâle
getirince görünür oldu.

## 2. Ne değişti — ölçüldü

`plan.v2.json` yüklenip yalnız iki anahtar değiştirildi. Üretim,
yetkilendirilmemiş bir alan değişirse fırlatan bir betikle yapıldı; o betik
repository'de değildir, dolayısıyla burada delil sayılmaz. Delil, bağımsız
olarak yeniden üretilebilen anahtar karşılaştırmasıdır:

```text
key sayisi v2=14 v3=14 ; anahtar SIRASI ayni ; ham diff 2 satir
DIFF  baseDriftPolicy   "STRICT_PINNED_BASE" -> "REFRESH_BEFORE_EXECUTION"
DIFF  baseSha           "6ec070d4…"          -> "5e35db28…"
SAME  boundaryPolicy · declaredIntent · predecessorTaskIds · profile
SAME  requiredTests · schemaVersion · successorDisposition · taskId · taskSpecVersion

declaredIntentSha256   f261c215…  DEGISMEDI
boundaryPolicySha256   f906133e…  DEGISMEDI
requiredTestsSha256    0b6493fe…  DEGISMEDI
taskSpecSha256         056cd758…  ->  bbf1d6a2…
```

Alt digest'ler 14 anahtarın yalnız üçünü kapsar; kalan altısı yukarıda ayrıca
karşılaştırılmıştır.

## 2b. `baseSha` bu politikada YÜRÜTMEDE KULLANILMAZ

`orchestrator.cjs:262-273` altında `spec.baseSha` **yalnız**
`STRICT_PINNED_BASE` dalında okunur. `REFRESH_BEFORE_EXECUTION` dalı worktree
base'ini claim anında `git rev-parse origin/main` ile alır; çöp bir `baseSha`,
geçersiz bir `baseSha` ve alanın hiç olmaması aynı sonucu verir.

Alan yine de tutuldu: owner "refreshed baseSha is pinned" dedi ve alan
`taskSpecSha256`'ya dahildir. İşlevi **belgeseldir** — planın hangi ağaca
bakılarak üretildiğini kaydeder, yürütme base'ini belirlemez.

Nitekim bu belge yazılırken main zaten ilerlemişti (`5e35db28` -> `cfeb626c`,
ilgisiz PR #1650). `STRICT_PINNED_BASE` olsaydı plan **şu anda** zaten
`BLOCKED_BASE_SHA_DRIFT` verirdi. Owner'ın gerekçesinin ampirik doğrulaması.

## 2c. Politikanın ürettiği GERÇEK bir yan etki — dondurulmuş kapı artık alt küme

Bu, "yalnız iki alan değişti" cümlesinin **kapsamadığı** bir değişimdir ve
açıkça kaydedilir.

`requiredTests[3]` manifest'in spec listesini `baseSha`'da dondurur.
`STRICT_PINNED_BASE` altında `baseSha` aynı zamanda koşum base'iydi, yani
dondurulmuş küme canlı manifestle **birebir** kalırdı. `REFRESH` altında koşum
daha ileri bir base'de olur ve küme alt küme hâline gelir. Ölçüm:

```text
5e35db28 (uretim base'i)  manifest 70   dondurulmus 70   BIREBIR, sirasiyla
cfeb626c (guncel main)    manifest 100  dondurulmus 70   30 yeni spek kapsam disi
dondurulmus ama canlida olmayan yol : 0
dondurulmus yollar diskte           : 70/70
```

Kapının **amacı** bozulmadı: executor'ın düzenleyemediği 69 dosya hâlâ koşuluyor,
yani kendi ödevine not veremiyor. Kaybolan bir yol olursa `--runTestsByPath`
hata verir ve `REQUIRED_TEST_FAILED` üretir — fail-closed. Eklenen 30 spec
executor'ın sınırı dışındaki dosyalardır ve CI'da ayrıca koşulur.

Sonuç: kapı zayıflamadı, ama canlı manifestle birebirliğini kaybetti ve fark
zamanla büyüyebilir. Owner bunu bilerek ratifiye etmelidir.

## 3. Round 4'te doğrulanan içerik aynen korundu

Alt digest'ler değişmediği için aşağıdakilerin hepsi **bayt olarak** aynıdır —
bu bir iddia değil, `requiredTestsSha256` ve `boundaryPolicySha256`'nın
eşitliğinin sonucudur:

```text
requiredTests    5 girdi, hepsi argv[0] = pnpm
                 çıplak bash bağımlılığı YOK
                 çıplak node bağımlılığı YOK
[3]              manifest'in 70 spec'i donduruldu, pnpm exec jest ile koşuluyor
[4]              guard listActive VE listEligible referansını mekanik olarak arar
allowedRoots     .../reporting-line/__tests__/reporting-line.service.spec.ts/
maxChangedFiles  1
kapsam           test-only; production mutation, schema, migration YASAK
```

Kanıt belgeleri de yerinde ve geçerliliğini korur:

```text
plan.v2.evidence.md   70-spec manifest ölçümü · Test Suite'in required check
                      OLMADIĞININ kaydı · listEligible aktif-profil asimetrisi ·
                      [4]'ün ne yapıp ne yapamadığı
executor-prompt.v2.md CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT işleyişi
                      fail-closed; sapma için test yazılmaz
```

Bu iki belge `056cd758` hash'ini anar. O hash artık çalıştırılamaz; belgelerin
**teknik içeriği** ise `plan.v3.json` için geçerlidir, çünkü digest eşitliği
içeriğin değişmediğini kanıtlar. Belgeler tarihsel kanıt olarak silinmemiştir.

## 4. `taskSpecVersion` neden bumplanmadı

Owner refresh'in değiştirebileceği alanları saydı; versiyon aralarında değil.
Kimlik `taskSpecSha256` ile ayrışır ve o değişmiştir. Alan `1` bırakıldı.

## 5. Ayrıca yasak kalan hash

```text
c337cae59c0a28da4018d7666e64701881bc4fc5892098428fd572eea3af3b27
SUPERSEDED / NOT RATIFIABLE — base refresh ile ilgisiz, CAP-09A SLICE 3 dönemi
```

---

**IMPLEMENTATION AUTHORITY: NONE.** Plan ancak
`T5-OFFICE-CAP02-PLAN-RATIFICATION-R02` ve
`T5-OFFICE-CAP02-EXECUTION-GRANT-R02` kanonikleştikten sonra çalıştırılabilir.
