# COLLECTION plan.v2 — base policy refresh evidence

```text
taskId          RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecSha256  f5c11d0b41be2d9895aa0d9769936950d0e8cbdcf2d5beed64f366293ece5318
supersedes      4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
baseDriftPolicy REFRESH_BEFORE_EXECUTION
baseSha         5e35db28903a538784d264a7919e32c0bd2b7c9f
Owner task      T5-PLAN-BASE-POLICY-REFRESH-AND-EXECUTION-RESUME-R01 (OPTION A)
```

## 1. Neden yenilendi

`STRICT_PINNED_BASE` bu iş akışında inşa gereği sağlanamıyor: ratification ve
grant kanıtı canonical main'e merge edilmek zorunda, her merge main'i planın
üretim base'inin ötesine taşıyor, sonuç `BLOCKED_BASE_SHA_DRIFT`. Ayrıntı:
`../SUPERSEDED-PLAN-HASHES.md`.

Bu, PR #1649 (`5e35db28`) drift kapısını gerçekten çalışır hâle getirdikten
sonra görünür oldu. Kapı bozukken plan bayat base üzerinde sessizce koşacaktı.

## 2. Ne değişti — ölçüldü, iddia edilmedi

Plan mevcut `plan.v1.json` yüklenip **yalnız iki anahtar** mutasyona uğratılarak
üretildi. Üretim, yetkilendirilmemiş bir alan değişirse fırlatan bir betikle
yapıldı; o betik repository'de değildir, dolayısıyla burada delil sayılmaz.
Delil, aşağıdaki bağımsız olarak yeniden üretilebilir karşılaştırmadır.

Alt digest'ler üç alanı kapsar ve değişmemiştir:

```text
declaredIntentSha256   988a3775…  DEGISMEDI   -> amaç aynı
boundaryPolicySha256   6e7cb3dc…  DEGISMEDI   -> izinli yol ve maxChangedFiles aynı
requiredTestsSha256    c49f9dc2…  DEGISMEDI   -> kapılar ve başarı ölçütü aynı
taskSpecSha256         4a84fe4c…  ->  f5c11d0b…
```

**Bu üç digest tek başına yeterli kanıt değildir.** Spec'in 14 anahtarından
yalnız üçünü kapsar. Kalan altısı (`schemaVersion`, `taskId`, `taskSpecVersion`,
`profile`, `predecessorTaskIds`, `successorDisposition`) ayrıca anahtar anahtar
karşılaştırılmıştır ve aynıdır:

```text
key sayisi v1=14 v2=14 ; anahtar SIRASI ayni
DIFF  baseDriftPolicy   "STRICT_PINNED_BASE" -> "REFRESH_BEFORE_EXECUTION"
DIFF  baseSha           "64d54732…"          -> "5e35db28…"
SAME  boundaryPolicy · boundaryPolicySha256 · declaredIntent · declaredIntentSha256
SAME  predecessorTaskIds · profile · requiredTests · requiredTestsSha256
SAME  schemaVersion · successorDisposition · taskId · taskSpecVersion
ham diff: 2 satir (51, 53)
```

Korunanlar (digest ile kanıtlı):

```text
allowedRoots     project/apps/api/src/modules/interest-engine/calc-prep/
                 __tests__/payment-mapper.spec.ts/    (tek dosya)
maxChangedFiles  1
requiredTests    3 girdi, hepsi argv[0] = pnpm
kapsam           test-only characterization
                 production kod / schema / migration / lifecycle semantiği YOK
```

## 2b. `baseSha` bu politikada YÜRÜTMEDE KULLANILMAZ

Dürüstlük gereği açıkça yazılıyor: `orchestrator.cjs:262-273` altında
`spec.baseSha` **yalnız** `STRICT_PINNED_BASE` dalında okunur.
`REFRESH_BEFORE_EXECUTION` dalı worktree base'ini claim anında
`git rev-parse origin/main` ile alır ve `spec.baseSha`'ya hiç bakmaz.

```text
STRICT_PINNED_BASE        pinnedBase = spec.baseSha         -> karsilastirilir
REFRESH_BEFORE_EXECUTION  pinnedBase = rev-parse origin/main -> spec.baseSha OKUNMAZ
```

Alan yine de tutuldu, çünkü owner "refreshed baseSha is pinned" dedi ve alan
`taskSpecSha256`'ya dahildir (`authority.cjs` canonical form). İşlevi
**belgeseldir**: planın hangi ağaca bakılarak üretildiğini kaydeder. Yürütme
anında main bunun ötesine geçmiş olabilir ve bu bir hata değildir — politikanın
tanımı budur.

Nitekim bu belge yazılırken main zaten ilerlemişti (`5e35db28` -> `cfeb626c`,
ilgisiz PR #1650). Bu, owner'ın gerekçesinin ampirik doğrulamasıdır: main T5
merge'lerinden bağımsız olarak da hareket ediyor.

## 3. `taskSpecVersion` neden bumplanmadı

Owner refresh'in değiştirebileceği alanları saydı; versiyon aralarında değil.
Kimliği `taskSpecSha256` ayırır ve o değişmiştir; contract §2 grant'ın
"sonradan değiştirilen veya aynı `taskId` ile yeniden tanımlanan spec'i
authorize etmemesini" hash üzerinden sağlar. Alan `1` bırakıldı.

## 4. Semantic authority — atıf onarımı ayrı yapılır

Yetki `decision-log.md`'de mevcuttur:

```text
RC-COL / W2.2D-1 — SCHEMA-FOUNDATION EXECUTION RECONCILIATION
+ W2.2D-1A TEST-ONLY CHARACTERIZATION AUTHORIZATION   (2026-07-27)
"W2.2D-1A yalnız mevcut Collection confirmation davranışını karakterize eden
 test-only successor'dır; production kod, schema, migration veya lifecycle
 semantiği değişikliği yasaktır."
```

Eski `grant.json` bu yetkiyi **yanlış dosyada ve var olmayan bir ID ile**
arıyordu (`RCV-COL-W2.2D-1A` / `COLLECTION-DECOMPOSITION.md`; ölçüm: 0 geçiş).
`verifyAuthorityRefs` fonksiyonu bunu `AUTHORITY_RECORD_ID_ABSENT` ile reddeder
— **ama o fonksiyon canlı yola bağlı değildir.** Ölçüldü: `verifyAuthorityRefs`
ve `verifyRatificationEvidence` yalnız `orchestrator.test.cjs`'ten çağrılıyor;
`orch:run` → `run-task.cjs` → `orchestrator.runTask` yolu yalnız
`authority.validateAgainstGrant`'i çağırıyor. Eski grant'ı canlıda durduran şey
`OWNER_RATIFICATION_EVIDENCE_PLACEHOLDER`'dı, atıf kontrolü değil.

Bu, bu refresh'in ürettiği bir kusur değil, önceden var olan bir bağlanma
eksiğidir (#1645 kontrolü ekledi, çağrı yerini eklemedi) ve R02 grant'ları
canlıya girmeden önce kapatılmalıdır; aksi hâlde grant'ların atıf gerçekliği
yalnız insan review'ı ile güvence altındadır.

Onarım, owner brief'i `T5-PLAN-BASE-POLICY-REFRESH-AND-EXECUTION-RESUME-R01`
§8'de ("COLLECTION SEMANTIC AUTHORITY REFERENCE REPAIR", exact owner-WIP
mutation authority) yetkilendirilmiştir ve R02 grant'ından önce yapılır. Bu
belge yeni bir owner kararı üretmez, yalnız kaydeder.

Eski grant dosyaları `grant.SUPERSEDED.json` ve
`grant.template.SUPERSEDED.json` olarak yeniden adlandırılmıştır; R01 execution
grant kaydı `execution-grant.md` banner ile çalıştırılamaz işaretlenmiştir.

---

**IMPLEMENTATION AUTHORITY: NONE.** Bu belge ratifikasyon değildir. Plan ancak
`T5-COLLECTION-PLAN-RATIFICATION-R02` ve `T5-COLLECTION-EXECUTION-GRANT-R02`
kanonikleştikten sonra çalıştırılabilir.
