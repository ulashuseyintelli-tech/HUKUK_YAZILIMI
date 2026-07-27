# OFFICE plan.v2 — evidence and schema mapping

```text
taskId          OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
taskSpecSha256  056cd7584ffb2eca95b0d06f6dfe33998a633ada18016f1e0d6652038ea0689b
baseSha         6ec070d41b83bb89860f8401965250717f563672
Phase           P2 of T5-LIVE-TWO-PROGRAM-FULL-OWNER-AUTHORIZATION-AND-EXECUTION-R01
Authority       decision-log.md → OFFICE-CAP02-REPORTINGLINE-READ-CHARACTERIZATION-R01-AUTHORITY
Review          round 1 FAIL → round 2 FAIL → round 3 FAIL → corrected → round 4 pending
```

## 0. Round 1 adversarial review — dört blocking bulgu, dördü de doğrulandı

Bu belgenin ilk sürümü üç yerde **doğrulanabilir biçimde yanlıştı**. Ortak
sebep: iddiaları komutu koşmadan üretmiş olmam.

| Bulgu | İlk sürüm | Ölçülen gerçek |
|---|---|---|
| Manifest gücü | `218 spec` / `217 spec` | **70 spec** — `218` satır sayısıydı, 148'i yorum/boş |
| Required CI | `§4 Required CI — canonical kanıt` | `Test Suite` **required check değil** |
| Kod ↔ invariant | *"örtüşüyor, koddan okundu"* | `listEligible`'da **gerçek sapma** var (§2b) |
| successCriteria | "brief'e taşındı" | bağlayıcı hiçbir yere düşmemişti — `requiredTests[4]` eklendi |

Sayı `grep -c ''` ile üretilmişti; `run-ci-manifest.sh` koşturulduğunda kendisi
`CI-MANIFEST pure/platform-scripts-shared: 70 spec` yazdırıyor. Bu repoda
ratifikasyon artefaktının standardı tool output'tur, prose değil.

## 1. Brief'in istediği alanlar şemada yok — nereye gittiler

`task.schema.json` `additionalProperties: false` ve brief'in istediği alanların
**hiçbiri** mevcut değil.

| Brief alanı | Şemada | Nereye gitti | Mekanik karşılığı |
|---|---|---|---|
| `programId` | YOK | grant `workstream` | var |
| `allowedFiles` | YOK | `boundaryPolicy.allowedRoots` | var |
| `forbiddenPaths` | YOK | pozitif allowlist (§1b) | var |
| `requiredCI` | YOK | §4 + `requiredTests[3]` | orchestrator, GitHub DEĞİL |
| `successCriteria` | YOK | **`requiredTests[4]`** | var — §5 |
| `semanticAuthorityRef` | YOK | grant — `SYS-DEC-003` kasıtlı ayırır | `verifyAuthorityRefs` |
| `mode` | YOK | `declaredIntent` + boundary | dolaylı |

Şemayı genişletmedim: alan eklemek **mevcut her plan hash'ini değiştirir**,
COLLECTION'ın owner-ratifiye `4a84fe4c…` hash'i dahil.

### 1b. Düzeltme — `forbiddenPaths` eşlemesi

İlk sürüm bunu `IMMUTABLE_FORBIDDEN`'a atfediyordu. Yanlış atıf:
`IMMUTABLE_FORBIDDEN` production kaynak dosyalarını **içermez** (`project/apps/`
contract §1.1 gereği kasten çıkarılmıştır). `reporting-line.service.ts`'i
dışarıda tutan şey **pozitif allowlist**'tir, denylist değil. Sonuç aynı,
mekanizma farklı.

## 2. Karakterize edilecek davranış — kod kanıtı

`reporting-line.service.ts:318` `listActive`:

```text
where   { tenantId, validUntil: null }
select  id · actorUserId · managerUserId · disposition · validFrom
        validUntil SEÇİLMİYOR → kapalı ilişki detayı projection'a girmiyor
order   validFrom desc
```

Owner invariant'larıyla uyumlu.

### 2b. `listEligible` — owner invariant'ı ile GERÇEK SAPMA

```text
where   tenantId · isActive: true
        OR [ staffMember.is.isActive true , lawyer.is.isActive true ]   ← isActive FİLTRELİ
select  staffMember: { select: { id } } · lawyer: { select: { id } }    ← isActive FİLTRESİZ
map     profileType = u.lawyer ? 'LAWYER' : u.staffMember ? 'STAFF' : null
```

`schema.prisma` `model User`: `staffMember StaffMember?` ve `lawyer Lawyer?` —
ikisi de opsiyonel, bir kullanıcı **ikisini birden** taşıyabilir.

Sonuç: **aktif StaffMember + pasif Lawyer** olan bir kullanıcı `where`'den doğru
şekilde geçer, ama `profileType` `"LAWYER"` etiketlenir. Yani `profileType`
profilin **varlığından** türetiliyor, **aktifliğinden** değil.

Owner invariant'ı *"profileType deterministik olarak lawyer > staffMember
sırasıyla türetilir"* der. Deterministiklik sağlanıyor; ancak *"aktif
StaffMember veya Lawyer profili"* ifadesiyle birlikte okunduğunda, etiketin
aktif profili yansıtması beklenir — bugünkü kod bunu garanti etmez.

```text
DISPOSITION: CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT — ADAY
```

Bu bir plan iddiası değil, koddan okundu ve `schema.prisma` ile doğrulandı.
Executor bunu önceden bilinen sapma olarak brief'te görecek; production kodunu
**düzeltmeyecek**, testi beklenen sonuca **zorlamayacak**, gözlemlenen gerçek
davranışı raporlayacak. Owner triyajı gerektirir.

## 3. Mevcut test kapsamı — boşluk gerçek

`reporting-line.service.spec.ts` içindeki `grep -c` sayıları:

```text
assignManager     13        listActive       0
markTopLevel       6        listEligible     0
endRelationship    5
reconciliation     3
```

(İlk sürüm 12/4/5/1 diyordu — yanlıştı. Yük taşıyan iddia, iki okuma yüzeyinin
**sıfır** kapsamı, doğrulandı.) Repo genelinde tek çağıran
`reporting-line.controller.ts:21,26`.

## 4. CI kapsamı — ve neyin required OLMADIĞI

İz doğru:

```text
.github/workflows/ci.yml:142-143
  → bash apps/api/scripts/run-ci-manifest.sh pure/platform-scripts-shared
ci-manifests/pure/platform-scripts-shared.txt:209
  → src/modules/reporting-line/__tests__/reporting-line.service.spec.ts
```

**Ama bu adım yalnız `Test Suite` job'ında koşar ve `Test Suite` bir required
check DEĞİLDİR.** Ölçüldü:

```text
gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks
  → ["Web Tests (vitest)","Architectural Guardrails"]
```

Yani bu spec RED iken PR teknik olarak merge edilebilir. Mekanik zorunluluk
GitHub tarafından değil, **orchestrator'ın `requiredTests[3]`'ü** tarafından
sağlanır — `run-ci-manifest.sh` fail-closed'dır (`set -euo pipefail`, manifest
yok → 1, boş → 1, per-spec `test -f` → 1, `--passWithNoTests` YOK).

CI manifest mutation bu görevin kapsamında değildir ve gerekmez; hedef spec
zaten manifest'te. Ancak "required check" olmadığı yukarıda açıkça kayıtlıdır —
owner bu farkı bilerek karar vermelidir.

## 5. requiredTests — beş girdi, üçü bağımsız

**Beşinin de argv[0]'ı `pnpm`.** Bu, owner'ın ratifiye ettiği COLLECTION
planıyla (`4a84fe4c…`) aynı ailedir — o plan da yalnız `pnpm` kullanır. Round 3
bunun tesadüf olmadığını gösterdi; §5b.

```text
[0] pnpm install --frozen-lockfile                         ortam
[1] prisma generate                                        ortam
[2] hedef spec                                             düzenlenen dosya
[3] 70 spec'in tamamı, manifest'ten donduruldu             69'u düzenlenemez
[4] listActive( ve listEligible( spec'te geçiyor mu        kapsam tabanı
```

`[3]` bağımsız koruyucudur: `[2]` tek başına olsaydı executor düzenlediği
dosyanın kendisini koşarak kendi ödevine not vermiş olurdu — sınır dosya
*yolunu* doğrular, *içeriğini* değil.

`[4]` `successCriteria`'nın mekanik tabanıdır. Onsuz plan "iki metot
karakterize edildi" ile "hiçbir şey yapılmadı"yı **ayırt edemez**:
`maxChangedFiles` bir üst sınırdır, `boundary.validate` boş diff'i ihlal
saymaz, ve `[2]`/`[3]` dokunulmamış dosyada da PASS verir.

`[4]` test kalitesini yargılayamaz — onun kapısı `manualMergeRequired` ve owner
diff review'ıdır. Ne yaptığı §5c'de dürüstçe yazılı.

## 5b. Neden yalnız `pnpm` — üç turda öğrenilen

Round 2 `[4]`'ün `bash -c` formunu FAIL etti: WSL interop katmanı tırnakları
düşürüyor, `"$f"` boşa genişliyor, guard **her girdide** exit 1 veriyordu. Round
3 aynı sınıfın `node`'da da yaşadığını gösterdi. Ölçüm — operatörün gerçek
(registry) PATH'i:

```text
node   çıplak ad   ÇÖZÜLÜYOR ama exit 1   ('node' is not recognized… — mesaj shim'in kendisinden)
bash   çıplak ad   WSL bash               (x86_64-pc-linux-gnu — içinde node/npx yok)
pnpm   çıplak ad   ÇALIŞIYOR              (project ve project/apps/api cwd'lerinde 8.15.0)
```

`node` **bulunamıyor değil**: `resolve.cjs` `scanPath` onu
`C:\Program Files\Volta\node.EXE` olarak buluyor ve spawn ediyor. Başarısız olan
şey, shim'in Volta bağlamı dışında bir node sürümü çözememesi — ve o meşhur
`'node' is not recognized` satırını cmd.exe değil, **shim'in kendisi** basıyor.
Sonuç aynı (exit 1), ama mekanizma `NOT_RESOLVABLE` değil, çözülüp düşme.

Sebep, makinede iki `node.exe` olması ve asıl imajın kalıcı PATH'te
bulunmaması:

```text
C:\Users\...\Volta\tools\image\node\24.18.0\node.exe   kalici PATH'te DEGIL  (gercek imaj)
C:\Program Files\Volta\node.exe                        kalici PATH'te VAR    (shim)
```

Volta tools-image dizinini yalnız kendi shim'inin çocuklarına enjekte ediyor.
Bu yüzden `pnpm` çalışıyor da `node` çalışmıyor — ve `pnpm exec node` yeniden
çalışıyor. Aynı sebeple `[3]` artık `bash scripts/run-ci-manifest.sh` **değil**:
o script son satırında `exec npx jest … "${SPECS[@]}"` yapıyor, ama WSL bash'in
içinde `npx` yok, dolayısıyla executor ne yazarsa yazsın 127 dönerdi.

`[3]` bunun yerine manifest'in 70 spec'ini `baseSha`'da **dondurup** aynı jest
çağrısını `pnpm` üzerinden yapıyor. Dondurmak tek-atımlık ve hash'e pinlenmiş
bir plan için dürüst olan: digest kapıyı zaten sabitliyor, manifest'i canlı
okumak yalnız ratifikasyondan sonra kapının değişmesine yol açardı. Üretim
sırasında hedef spec'in manifest'te olduğu ve 70 yolun hepsinin diskte
bulunduğu doğrulanıyor; biri eksikse plan üretilmiyor.

Doğrulama, operatörün PATH'i ile ve gerçek `runCapture` yolundan, gerçek paket
dizininde (pnpm `package.json` bağlamı ister):

```text
mevcut spec (0 referans)   status=1  "listActive not referenced in spec"
iki metodu da çağıran      status=0  ""
dosya birebir geri yazıldı, worktree temiz
```

Kritik nokta: bu, `pnpm`'in çalıştığı kabukta değil, round 3'ün eski formu
öldürdüğü kabukta ölçüldü.

## 5c. `[4]` ne yapar, ne yapmaz

Bir **substring kontrolüdür**. Ölçülen davranış:

```text
gerçek karakterizasyon                                  GEÇER
mevcut spec + "// listActive("            (tek token)   GEÇMEZ  ← "listEligible not referenced"
mevcut spec + "// listActive( listEligible("            GEÇER   ← en ucuz kaçış
sadece import satırında geçmesi                         GEÇMEZ
listActiveFoo( gibi komşu tanımlayıcı                   GEÇMEZ
boş dosya                                               GEÇMEZ
```

İlk sürüm bu tabloda tek token'ın geçtiğini yazıyordu; ölçüldüğünde `status=1`
veriyor — guard **iki** token da ister. Kaçış yine mümkün, yalnız bir kelime
daha uzun. Satır düzeltildi çünkü tablonun başlığı "ölçülen davranış" ve bu
repoda ratifikasyon artefaktının standardı tool output'tur.

En ucuz kaçış beş kapının **hiçbiri** tarafından yakalanmaz. Bu kabul edilen bir
sınırdır, gizlenmiş değil: `[4]`'ün işi "hiçbir şey yapılmadı"yı elemektir,
"iyi test yazıldı"yı doğrulamak değil. İkincisinin kapısı owner diff review'ıdır.

Boşluk toplama (`/\s+/g`) satır sonuyla bölünmüş gerçek çağrıları yakalar; aynı
nedenle satır sonuyla ayrılmış **ilgisiz** metni de yakalayabilir. Satır
yönelimli bir grep'te olmayan bu maliyet, yukarıdaki kaçış zaten mümkün olduğu
için kapının gücünü değiştirmiyor.

`requiredTests[2]` ts-jest'i `diagnostics: false` ile koşar
(`apps/api/jest.config.js`): **sözdizimi** hatası transpile'da düşer, **tip**
hatası düşmez.

## 6. Kapsam dışı — açıkça

```text
production kaynak değişikliği (reporting-line.service.ts dahil)
schema / migration
CAP-02 population · activation · enforcement
OFFICE-P2-CAP02-REPRESENTATIVE-PERSONNEL-DATA-BOOTSTRAP-PLAN-R01
  → GO-ANALYZE / READ-ONLY kalır, bu planla yetkilendirilmez
CAP-09A SLICE 3 ve eski hash c337cae5… → NOT RATIFIABLE
```

## 7. Brief'teki yol düzeltmesi

Brief `…/modules/office/reporting-line/…` veriyor. Gerçek canonical yol
kullanıldı, paralel spec oluşturulmadı — brief'in kendi talimatı.

**Düzeltme (round 3/4).** Bu bölüm önce *"`office/` segmenti repository'de
yoktur"* diyordu; bu **yanlıştı**. `project/apps/api/src/modules/office/`
vardır (`office.service.ts`, `office.controller.ts`, `office.module.ts`,
`__tests__`). Var olmayan `office/reporting-line/` alt yoludur;
`reporting-line` kendi başına bir modüldür.

Round 3'te bu bölüm ayrıca *"aynı hatalı ifade owner'ın `decision-log.md`
kaydına da geçmiştir"* diyordu — **o suçlama haksızdı ve geri alınıyor.** Owner
kaydının kendi ifadesi ölçüldü:

```text
"brief'teki `office/` ara dizini repository'de YOKTUR"
```

`ara dizini` nitelemesiyle kayıt **doğrudur**. Hata yalnız bu belgenin ilk
sürümüne aittir.

## 8. Bilinen artık riskler

```text
plan.v2.json ad çakışması  owner kaydı bu adı "geri çekilmiş ihlal artefaktı"
                         olarak anıyor; yetkili yeniden üretim aynı yolu
                         kullanıyor — yalnız hash ile ayırt edilebilir
boundary prefix deliği   underAnyRoot'un startsWith dalı ".../spec.ts/x.ts"yi
                         içeri alır; aynı isimde hem dosya hem dizin olamayacağı
                         için pratikte kapalı, maxChangedFiles:1 ile ikinci kat
assertion zayıflatma     sınır içinde teknik olarak mümkün; silme [2]+[3] ile
                         yakalanır, zayıflatma yakalanmaz — owner diff review
outOfScope[]             contract §15.3 boş olmayan liste istiyor; task.schema.json'da
                         alan YOK — önceden var olan contract/schema çelişkisi
[0]/[1] tekrarı          orchestrator.cjs:306-309 ortam hazırlığını requiredTests'e
                         koymayı açıkça anti-pattern sayıyor ve prepareEnvironment
                         bunu zaten koşuyor; yine de tutuldu, çünkü owner-ratifiye
                         COLLECTION planı da tutuyor ve iki T5 planının yapısal
                         olarak aynı kalması ratifikasyon karşılaştırmasını
                         kolaylaştırıyor. Idempotent; attestation sayısını şişirir
[3] manifest kopyası     70 yol baseSha'da donduruldu; manifest sonradan değişirse
                         plan onu görmez. Tek-atımlık plan için kabul edildi
```

---

**AUTHORITY: NONE.** Bu belge bir ratifikasyon değildir. Plan hash'i P4'te
owner-ratifiye edilene ve P5'te grant üretilene kadar çalıştırılamaz.
