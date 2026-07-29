# Governance Writer Coordination Contract V1

```text
Contract ID            : GOV-COORD-V1
Owner-ratified         : 2026-07-24
Effective-from main    : c046819b968d16f20cf2834ba805beb22e4aa488
Primary executor       : CODEX_LOCAL
Secondary executor     : DISABLED
Failover               : OWNER-ACTIVATED ONLY
Lease                  : NONE
Trigger                : MANUAL_QUEUE_RUN
Merge                  : OWNER AUTHORITY REQUIRED; EX-ANTE TASK-SPECIFIC GO-COMPLETE ALLOWED
Standing auto-merge    : OFF
Register authority     : DERIVED / NON-AUTHORITATIVE
```

Bu contract shared governance dosyalarına yazan modül çalışma sayfalarının
birbirleriyle yarışmasını engeller. Bootstrap approved merge olmadan standing
execution aktif değildir; bu belgenin branch'te bulunması queue run veya
execution authority üretmez.

## 1. Sabit V1 modeli

V1 tek executor modelidir:

- `CODEX_LOCAL` tek `PRIMARY_EXECUTOR`dır.
- Secondary executor disabled'dır.
- Dynamic Claude/Codex lease, scheduler ve standing/unattended auto-merge yoktur.
- Failover yalnız ayrı, açık ve canonical owner activation kaydıyla kurulabilir.
- Request, execution ve result PR'larının tamamı owner-controlled merge ister.
  Owner authority exact task başında `GO-COMPLETE` + `IF GO-COMPLETE` olarak
  ex-ante verilebilir; tüm validation/CI/scope/mergeability/conflict gate'leri
  PASS ise CI sonrasında ikinci owner mesajı gerekmez. Bu standing auto-merge
  veya reusable merge authority değildir.
- Modül çalışma sayfası protected governance dosyasını doğrudan değiştiremez.
  İhtiyaç, immutable request olarak queue'ya taşınır.

## 2. Authority ayrımı

Her request iki ayrı reference taşır:

1. `semanticAuthorityRef`: değişikliğin anlamını ve owner/domain kararını
   gösterir.
2. `executionGrantRef`: executor'ın o bounded işlemi yapabilmesini gösterir.

İki reference:

- Zorunludur.
- Aynı path + record identity ile karşılanamaz.
- Birbirinin yerine kullanılamaz.
- Request prose'undan veya generated register'dan türetilemez.

Request authority üretmez. Governance Index routing/authority discovery sağlar
ama semantic veya execution authority üretmez. Generated register da authority
değildir.

### 2.1 Exact authority locator

Her canonical authority kaydı aşağıdaki machine-readable marker'ın authority
reference ile birebir eşleşen tek bir örneğini taşır:

```text
<!-- GOV-COORD-AUTHORITY kind=<KIND> recordId=<RECORD_ID> -->
```

- `<KIND>` yalnız `SEMANTIC_AUTHORITY` veya `EXECUTION_GRANT` olabilir.
- Marker `kind` ve `recordId` değerleri authority reference ile exact eşleşir.
- Aynı exact marker'ın olmaması veya birden fazla bulunması fail-closed
  validation failure üretir.
- `recordId` değerinin prose, başlık, tablo veya code block içinde tekrarlanması
  authority resolution sonucunu etkilemez.
- Raw `recordId`, fuzzy match, regex veya heading-based compatibility fallback
  kullanılmaz.
- Marker authority üretmez; yalnız mevcut canonical authority kaydının
  deterministic machine locator'ıdır.
- Marker eklemek semantic authority veya execution capability kapsamını
  genişletmez.

## 3. Capability matrix

| Capability | V1 durumu | Sınır |
|---|---|---|
| `CREATE_REQUEST_ONLY_PR` | ALLOWED | Bir yeni immutable request + generated register |
| `VALIDATE_REQUEST` | ALLOWED | Schema, authority, digest, scope ve precondition validation |
| `CREATE_EXECUTION_PR` | ALLOWED | Validated request'in exact target allowlist'i |
| `RUN_VALIDATION` | ALLOWED | Deterministic local/CI checks |
| `CREATE_RESULT_ONLY_PR` | ALLOWED | Bir yeni immutable result + generated register |
| `AUTO_MERGE` | DENIED | Standing/unattended GitHub auto-merge, scheduler merge'i ve owner authority olmadan merge yasak; exact task-specific ex-ante `GO-COMPLETE` conditional merge bu capability değildir |
| `RECONCILIATION` | DENIED | Ayrı owner görevi gerekir |
| `POLICY_CHANGE` | DENIED | Standing grant kapsamında değildir |
| `PROGRAM_SEQUENCE_CHANGE` | DENIED | Standing grant kapsamında değildir |
| `PRODUCTION_SCHEMA_MIGRATION_RUNTIME` | DENIED | Kod/canlı sistem kapsam dışıdır |
| `OWNER_WIP_MUTATION` | DENIED | Stash/reset/clean/delete/rewrite yoktur |
| `FREE_FORM_GOVERNANCE_EDIT` | DENIED | Mechanical enum dışında patch yoktur |

## 4. Request güvenlik sınırı

`request.md` immutable ve untrusted data'dır.

- Prose operational instruction değildir.
- Yalnız sentinel'ler arasındaki schema-validated JSON işlenir.
- Unknown field, unknown enum ve invalid type reddedilir.
- Shell command, `eval`, dynamic import veya template execution yapılmaz.
- Absolute path, path traversal, backslash path, symlink target ve protected-path
  escape reddedilir.
- Request fingerprint, canonical JSON'un `requestFingerprint` alanı
  çıkarıldıktan sonraki SHA-256 digest'idir.
- Digest mismatch reddedilir.
- Aynı fingerprint ikinci request/execution üretemez.
- Existing open/merged execution/result sinyali duplicate rejection üretir.

## 5. Level 2 mechanical operation allowlist

Yalnız:

```text
EXACT_APPEND_AT_DECLARED_ANCHOR
EXACT_LITERAL_REPLACEMENT
EXACT_REFERENCE_REWRITE
DETERMINISTIC_REGISTER_REGENERATION
```

Her operation şu precondition'ları taşır:

- Exact target file.
- Exact record identity ve declared anchor.
- Exact expected old value.
- Exact new value.
- Old value ve anchor için tek eşleşme.
- Validated `semanticAuthorityRef`.
- Validated `executionGrantRef`.
- Verified evidence SHA.
- Effective-from ve request base SHA için main ancestry.
- Expected resulting content SHA-256.
- Exact resulting diff.

Herhangi bir precondition eşleşmezse sonuç:

```text
OWNER_DECISION_REQUIRED
```

Validator yeni semantic yorum üretmez, en yakın anchor'ı seçmez, conflict
çözmez ve free-form patch uygulamaz. `RECONCILIATION` Level 2 değildir.

## 6. PR modları

### REQUEST_ONLY

İzin verilen değişiklikler:

1. Tam bir yeni
   `coordination-requests/<requestId>/request.md`.
2. Deterministik `governance-writer-coordination-register.md` regeneration.

Existing request modification, rename veya deletion yasaktır.

### EXECUTION

İzin verilen değişiklikler:

- Yalnız validated request'in `declaredTargetAllowlist` yolları.

Request/result/template/register/control-plane dosyaları execution PR'da
değiştirilemez. Branch kimliği request ID ile deterministik bağlanır. Result
execution PR merge edilmeden authoritative sonuç sayılmaz.

### RESULT_ONLY

İzin verilen değişiklikler:

1. Tam bir yeni
   `coordination-results/<requestId>/result.md`.
2. Deterministik generated register regeneration.

Existing result modification, rename veya deletion yasaktır.

### AUTHORITY_LOCATOR_REPAIR_I01 — tek kullanımlık bootstrap repair

Bu sınıflandırma yalnız authority-locator bootstrap repair PR'ı için geçerlidir
ve aşağıdaki üç exact değere birlikte bağlıdır:

```text
Base SHA : feadf408e9b6d02738d43a0ae78e38f75e594996
Head ref : codex/gov-coord-v1-authority-locator-repair-i01
Path set :
  - project/scripts/governance-coordination.cjs
  - project/scripts/governance-coordination.test.cjs
  - project/docs/governance/governance-writer-coordination-contract.md
  - project/docs/governance/decision-log.md
  - project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md
```

- Base SHA, head ref veya complete changed-path setinden herhangi biri farklıysa
  mevcut `CONTROL_PLANE_SCOPE_FORBIDDEN` sonucu korunur.
- Branch prefix, substring, wildcard, PR title veya PR body authority değildir.
- Bu sınıflandırma request-only, execution veya result-only modu üretmez.
- Genel veya reusable control-plane mutation authority değildir.
- Repair merge edilip main base ilerlediğinde exact base bağı nedeniyle
  kendiliğinden yeniden kullanılamaz.
- Gelecekteki control-plane değişiklikleri ayrı owner authority ve ayrı exact
  classifier gerektirir.

### REGISTER_TEST_FIXTURE_REPAIR_I01 — tek kullanımlık register test repair

Bu sınıflandırma yalnız bootstrap-only boş-register varsayımını fixture'a taşır
ve aşağıdaki exact binding ile kullanılabilir:

```text
Base SHA : a02498dfd50e349b2cb1eddfbde0561ece30fba6
Head ref : codex/gov-coord-v1-register-test-fixture-repair-i01
Path set :
  - project/scripts/governance-coordination.cjs
  - project/scripts/governance-coordination.test.cjs
  - project/docs/governance/governance-writer-coordination-contract.md
```

- Empty-register assertion yalnız izole fixture'da uygulanır.
- Live repository request sayısı sabit değildir.
- Canonical invariant register'ın immutable instance'lardan deterministik,
  byte-stable ve current türetilmesidir.
- Yanlış base, head ref veya complete path set
  `CONTROL_PLANE_SCOPE_FORBIDDEN` üretir.
- Bu tek-kullanımlık mod request/result/execution veya semantic governance
  authority üretmez; main ilerlediğinde kendiliğinden sona erer.

### GITHUB-PLATFORM-BASELINE GH-02 — exact control-plane authority binding

`GITHUB-PLATFORM-BASELINE-GH02-CONTROL-PLANE-BINDING-R01` yalnız mevcut
GH-02 workflow-hardening değişikliğini classifier'a bağlayan iki aşamalı,
tek-görevlik authority'dir.

Authority-binding PR'ı yalnız aşağıdaki exact kombinasyonla tanınır:

```text
Mode     : GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01
Base SHA : ad7e00a85be748dcfc5a8b5049e13d3744a3e15e
Head ref : codex/github-platform-gh02-control-plane-binding-r01
Path set :
  - project/scripts/governance-coordination.cjs
  - project/scripts/governance-coordination.test.cjs
  - project/docs/governance/governance-writer-coordination-contract.md
```

Bounded production PR'ı yalnız aşağıdaki exact task identity ve target ile
tanınır:

```text
Mode                 : GITHUB_PLATFORM_GH02_WORKFLOW_HARDENING_R01
Existing PR          : #1622
Original base SHA    : 1b682a9a0474d9c94b6a98fc8251ca92fea48766
Historical first patch SHA : cc6dfba9d0ae2fb5dcfddeb022ad94659d7d406f (record only; runtime input değildir)
Canonical squash SHA : ea84c9f5b71716588ac06933ee30b3b72dc52395
Canonical target blob : 5644cf69ce5d43a5a63fd1d796cf4cdfc8dccf00
Head ref             : codex/github-platform-gh02-workflow-hardening-r01
Target               : .github/workflows/ci.yml
Change               : M (exactly one path)
```

Runtime validation ayrıca şunların tamamını zorunlu tutar:

- Canonical squash commit Git object'i erişilebilirdir; yoksa raw Git hatası yerine
  `CONTROL_PLANE_BINDING_OBJECT_UNAVAILABLE` üretilir.
- Canonical squash commit'teki target blob exact canonical blob SHA ile eşittir.
- Base ilerlemişse bu binding current base'te canonical olarak bulunur.
- Current PR head'teki `ci.yml` blob'u canonical target blob ile exact eşittir.
- Başka production/control-plane path, başka workflow, rename/delete/add,
  wildcard/similar branch veya task identity mismatch fail-closed reddedilir.

Bu binding yalnız workflow-level `contents: read`, 11 external action
invocation'ının doğrulanmış full commit SHA'lara pinlenmesi ve dört checkout
invocation'ında `persist-credentials: false` hardening'ini taşır. Trigger,
concurrency, job/check adı, test komutu/seçimi, artifact davranışı, project Node
20, pnpm 8.15.0 ve PostgreSQL 16 semantiğini değiştirme authority'si değildir.
Başka workflow veya control-plane görevi için wildcard, prefix veya reusable
authority üretmez.

#### GH-02 control-plane recovery R02

`GITHUB-PLATFORM-BASELINE-GH02-CONTROL-PLANE-RECOVERY-R02`, transient PR-head
bağımlılığını yukarıdaki canonical squash + target blob modeline dönüştürmek için
owner-authorized, tek-görevlik ve main ilerlediğinde inert olan repair binding'idir:

```text
Mode     : GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02
Base SHA : 627c76e4549196153da0cf2401ed706047ca38c9
Head ref : codex/github-platform-gh02-control-plane-recovery-r02
Path set :
  - project/scripts/governance-coordination.cjs
  - project/scripts/governance-coordination.test.cjs
  - project/docs/governance/governance-writer-coordination-contract.md
```

Bu binding `.github/workflows/ci.yml` değişikliği, başka protected path,
request/result/execution authority, wildcard/prefix eşleşmesi veya reusable grant
üretmez. Exact base, branch ya da üç dosyalık modified path setinden sapma
`CONTROL_PLANE_SCOPE_FORBIDDEN` ile fail-closed reddedilir.

## 7. Generated register

Register immutable request/result instance'larından deterministik üretilir.

- Timestamp içermez.
- Aynı input byte'ları aynı output byte'ını üretir.
- Manuel edit edilmez.
- Queue sırası, semantic priority, owner kararı veya execution authority
  üretmez.
- Request/result PR'larında izin verilen tek companion diff'tir.

## 8. Protected paths

Machine-readable source:
`governance-writer-coordination-protected-paths.json`.

Protected path olmak otomatik yazma izni değildir. Control-plane dosyaları V1
standing execution target'ı olamaz. Domain Law, Constitution, Decision Log,
program sequence ve grandfather overlap'leri ayrıca semantic/owner gate taşır.

## 9. Grandfathered owner WIP

Bootstrap öncesi WIP
`governance-writer-coordination-cutover-record.md` içinde snapshot olarak
kaydedilir.

Bu kayıt:

- Disposition üretmez.
- Merge veya reconciliation authority üretmez.
- Cleanup/removal authority üretmez.
- Hiçbir kaydı abandoned, removable, safe-to-delete veya conclusively stale
  ilan etmez.
- Byte-for-byte preservation gerektirir.

Grandfather overlap'i hedefleyen standing request fail-closed reddedilir.
Overlap'in kaldırılması ayrı owner decision ve control-plane amendment ister.

## 10. Failure ve idempotency

- Validation failure hiçbir target file mutasyonu yapmaz.
- Anchor/old-value mismatch'te alternatif arama yapılmaz.
- Multiple match fail-closed'dur.
- Duplicate fingerprint yeni execution üretmez.
- Execution PR çakışırsa automatic rebase/reconciliation yapılmaz.
- Owner WIP sinyali varsa execution oluşturulmaz.
- Result yalnız observed evidence taşır; başarı uydurulmaz.

## 11. Activation sınırı

Bootstrap'ın approved merge'i bu V1 contract ve grant'i repository'de
canonical hale getirir. Yine de:

- Queue yalnız manual run ile işlenir.
- Pilot ayrı owner kararıdır.
- Required branch check/ruleset aktivasyonu ayrı admin action'dır.
- Standing/unattended auto-merge, scheduler, lease veya failover kendiliğinden açılmaz.

## 12. Owner-authorized conditional merge ayrımı

`MANUAL / OWNER AUTHORITY`, owner'ın CI sonrasında ikinci kez mesaj yazması veya
GitHub butonuna bizzat basması zorunluluğu değildir. Zorunlu olan owner
authority'sidir. Exact task scope'u ve `IF GO-COMPLETE` kapanış gate'leri task
başında açıkça yetkilendirilmişse ajan validation/required CI PASS, exact scope,
`CLEAN / MERGEABLE` ve conflict/collision `NONE` doğrulamasından sonra aynı task
içinde squash-merge, main sync ve cleanup yapabilir.

Bu ayrım V1 standing grant'ini genişletmez: request kendi başına merge authority
üretmez; GitHub auto-merge açılmaz; scheduler, lease, failover veya reusable
merge grant'i oluşmaz.

## GH-03 control-plane binding (CI Test Suite consolidation)

Owner-ratified 2026-07-27. Adds a record; relaxes no existing control.

```text
Task ID   : GITHUB-PLATFORM-BASELINE-GH03-CONTROL-PLANE-BINDING-R01
Mode      : GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01
Base SHA  : 8a917fb3d3136ac48faf405f021d13ca54c6c254
Head ref  : codex/gh03-control-plane-binding-r01
Target    : .github/workflows/ci.yml
Content   : pinned by BLOB sha (2d75a88c5ef9bc466c609029985ffa700982cbe1)
```

Bu binding `.github/workflows/ci.yml` uzerinde tek seferlik, exact-scope bir
degisikligi yetkilendirir: `test-suite` job'indaki 112 ayri Jest cagrisinin 8
manifest'te birlestirilmesi ve CI-8 invocation budget gate'inin baglanmasi.

Icerik pin'i BLOB sha'sidir, commit sha'si degildir. Blob content-addressed'dir;
squash-merge ve branch silinmesinden sag cikar. GH-02'de silinebilir bir branch
commit'ine konan pin main'i bes PR boyunca RED tutmustu.

Kayit GH-03'e ozgudur: yeniden kullanilabilir veya genel amacli degildir.

## GH-05 / GH-06 CI cutover binding

Owner-ratified 2026-07-27. Adds a record; relaxes no existing control and
leaves the GH-02 and GH-03 records untouched.

```text
Task ID   : GITHUB-PLATFORM-BASELINE-GH05-GH06-CI-CUTOVER-R01
Mode      : GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01
Base SHA  : 06be6be78f3530a940194d79b1fbf57015653655
Head ref  : codex/gh05-gh06-ci-cutover-r01
Target    : .github/workflows/ci.yml
Content   : pinned by BLOB sha (53d5afd7d9317f96416bbe455d44b97d115d951c)
```

Bu binding `.github/workflows/ci.yml` uzerinde tek seferlik, exact-scope bir
degisikligi yetkilendirir ve IKI ayri owner yetkisini tasir:

1. **GH-05 — manifest cutover.** `test-suite` job'indaki 8 manifest step'i
   spec listelerini artik inline tasimaz; `apps/api/ci-manifests/**` altindaki
   dosyalari okuyan `run-ci-manifest.sh` cagrilir. Amac: yeni bir spec'i CI'a
   baglamak icin control-plane dokunusu ve binding seremonisi gerekmemesi.
   CI-8 invocation budget gate sayimi manifest dosyalarini da kapsayacak sekilde
   guncellenir; aksi halde manifest ekleyerek butce sessizce asilabilirdi.
   Owner yetkisi: binding-free spec wiring talimati (2026-07-27).

2. **GH-06 — smoke kritik yol.** `client-workspace-live-smoke` job'inin
   `needs` alanindan `test-suite` cikarilir; `web-tests` KORUNUR. Smoke
   test-suite'ten hicbir artifact/output tuketmiyor (kendi checkout, install,
   prisma generate/migrate, seed, build ve postgres service'i var), yani `needs`
   saf siralamaydi ve kritik yola ~3.6 dk ekliyordu.
   Owner yetkisi: GITHUB-PLATFORM-BASELINE-GH06-SMOKE-CRITICAL-PATH-R01
   talimati (2026-07-27).

Icerik pin'i BLOB sha'sidir, commit sha'si degildir; GH-03 kaydindaki gerekce
aynen gecerlidir.

Kayit bu cutover'a ozgudur: yeniden kullanilabilir veya genel amacli degildir.

## GH-08 gate / jest separation binding

Owner-ratified 2026-07-27. Adds a record; relaxes no existing control and leaves
the GH-02, GH-03 and GH-05/GH-06 records untouched.

```text
Task ID   : GITHUB-PLATFORM-BASELINE-GH08-GATE-JEST-SEPARATION-R01
Mode      : GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01
Base SHA  : 562c34d1abc955d3d70fb0b6f7e6e8851c62d0bb
Head ref  : codex/gh08-gate-jest-separation-r01
Target    : .github/workflows/ci.yml
Content   : pinned by BLOB sha (b4543870e99d732a1b13c27cd657a189bc0f91b0)
```

`test-suite` job'inda 14 step gate mantigini (grep FORBIDDEN kontrolleri +
denetlenen kaynak dosyalarin `test -f` guard'lari) ve ayri bir Jest cagrisini
AYNI step'te tasiyordu. Her Jest cagrisi ~13.6s sabit ts-jest bootstrap oduyor.

Bu binding yalnizca o 14 cagrinin kaldirilmasini yetkilendirir. Gate mantigi
step'te AYNEN KALIR; spec'ler `apps/api/ci-manifests/**` altindaki mevcut
manifest'lere tasinir ve orijinal step gerekceleri manifest basligina gecirilir.

Kapsam disi ve DOKUNULMAMISTIR: `Test Suites: N passed, N total` sayim
assertion'i tasiyan 8 step. O assertion, spec'in gercekten kostugunun kanitidir;
manifest'e katlanirsa yapisal olarak kaybolur.

Jest yurutmesi 30 -> 16 (8 dogrudan + 8 manifest). CI-8 invocation budget ayni
PR'da 32 -> 18 DUSURULUR; aksi halde 14 slot bos headroom kalir ve ratchet
gevser.

Icerik pin'i BLOB sha'sidir, commit sha'si degildir; GH-03 kaydindaki gerekce
aynen gecerlidir.

Kayit bu ayirmaya ozgudur: yeniden kullanilabilir veya genel amacli degildir.

## RCV-COL FULL REMEDIATION BOOTSTRAP — exact control-plane authority binding

Owner-ratified 2026-07-28. Bu kayıt mevcut hiçbir kontrolü gevşetmez ve yalnız
PR #1721 için tek kullanımlık, task-specific bir control-plane binding oluşturur.

### Binding PR kimliği

```text
Task ID  : GOV-COORD-RCV-COL-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 7ba8d8e69fcd236bb1ca902eabc9cff0837fea04
Head ref : codex/gov-coord-rcv-col-bootstrap-control-plane-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-COL-FULL-REMEDIATION-BOOTSTRAP-R01
Target mode      : RCV_COL_FULL_REMEDIATION_BOOTSTRAP_R01
Target PR        : #1721
Original base SHA: 1018c6b521e9159b3b5e9e1b82ed307fec6ff79f
Head ref         : codex/rcv-col-full-remediation-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01.md
Semantic record  : RCV-COL-FULL-REMEDIATION-RATIFICATION-R01
Execution record : RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01
```

Hedef PR yalnız exact path/status seti, her authority marker'ının exact tekil
oluşu, execution grant'in yukarıdaki semantic authority'ye exact binding'i ve
güncel target base'in bu binding'i canonical hale getiren commit'ten gelmesi
birlikte doğrulandığında kabul edilir. Original base yalnız provenance olarak
korunur; hedef head commit SHA'sı pinlenmez. Bu nedenle binding main'e girdikten
sonraki fresh-main hizalaması, içerik kimliği değişmiyorsa geçerlidir.

Binding yalnız yukarıdaki iki target path'e ve PR #1721'e uygulanır. Genel
`decision-log.md` yazma, genel execution-grant oluşturma veya başka bir RCV,
COLLECTION ya da RECEIVABLE task'ına aktarma yetkisi vermez. Request-only,
execution ve result-only kurallarını değiştirmez; Constitution veya Domain Law
yetkisi üretmez. PR #1721 merge veya close olduktan sonra yeniden kullanılamaz
ve reusable authority oluşturmaz.

## GOV-COORD-RCV-COL-LARGE-AUTHORITY-READ-REPAIR-R01 — one-time large authority read repair

Owner-ratified 2026-07-28. Bu kayıt yalnız büyük canonical governance authority
dosyalarının Git üzerinden eksiksiz ve bounded okunmasını sağlayan control-plane
onarımını yetkilendirir.

```text
Task ID  : GOV-COORD-RCV-COL-LARGE-AUTHORITY-READ-REPAIR-R01
Mode     : GOV_COORD_RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01
Base SHA : d4ffd3ef277554d3c45e6471bf96f14af4b3fcd1
Head ref : codex/gov-coord-rcv-col-large-authority-read-repair-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

Kök neden, `spawnSync('git', ...)` çağrısının Node varsayılan output buffer'ı
nedeniyle büyük `decision-log.md` içeriğini `ENOBUFS` ile yarıda kesmesidir.
Generic Git process capture limiti 2 MiB; canonical text blob logical limiti
8 MiB; canonical blob subprocess limiti 16 MiB; hata diagnostic limiti 4.096
karakterdir. `gitShow`, içeriği okumadan önce `git cat-file -s` ile byte size
preflight yapar; 8 MiB üstünü `GIT_BLOB_SIZE_LIMIT_EXCEEDED` ile reddeder ve
başarılı okumada UTF-8 byte uzunluğunun bildirilen blob size ile exact eşitliğini
zorunlu kılar. `ENOBUFS`, partial output kullanmadan
`GIT_OUTPUT_LIMIT_EXCEEDED` üretir. Unbounded veya environment-controlled
capture, partial/truncated authority kabulü ve asynchronous streaming refactor
yasaktır. 8 MiB üstündeki governance blob ayrı archive/split ya da storage-model
owner task'ı gerektirir.

Bu self-binding yalnız exact base, exact head ref ve exact `M/M/M` path seti
birlikte eşleştiğinde geçerlidir. Buffer onarımı authority marker, checksum,
exact-literal veya domain semantiğini değiştirmez. PR #1721'in semantic
authority'sini veya exact iki dosyalık kapsamını değiştirmez ve genişletmez;
başka protected governance write, request/execution/result, production, schema,
migration veya runtime yetkisi üretmez. Repair PR merge edildikten sonra pinned
base nedeniyle yeniden kullanılamaz. Reusable authority yoktur.

## HCR-08 AUTHORITY BOOTSTRAP — exact control-plane authority binding

Owner-ratified 2026-07-28. Bu kayıt yalnız PR #1728 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-HCR-08-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 7854504b25ef1c988606b1885d1562ef44ce54aa
Head ref : codex/rcv-claim-form-hcr-08-authority-bootstrap-control-plane-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-HCR-08-AUTHORITY-BOOTSTRAP-R01
Target mode      : RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_R01
Target PR        : #1728
Original base SHA: 14d0f2931ac464321278e05f81ffc5053a8a7719
Head ref         : codex/rcv-claim-form-hcr-08-authority-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01.md
Semantic record  : RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01
Execution record : RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01-GRANT
```

Hedef PR yalnız exact branch ve `M/A` iki-file seti, iki marker'ın exact tekil
oluşu, execution grant'in semantic authority'ye exact binding'i ve güncel target
base'in bu binding'i canonical yapan commit'in descendant'ı olması birlikte
doğrulandığında kabul edilir. Original base provenance'dır; target head SHA
pinlenmez ve fresh-main normal merge ile uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1728 ve iki target path için geçerlidir. Genel
`decision-log.md` yazma, başka execution grant, request/execution/result,
production, schema, migration, runtime veya owner WIP yetkisi üretmez. Wildcard,
prefix authority ve reusable authority yoktur. PR #1728 merge veya close
olduğunda binding yeniden kullanılamaz.

## PB01 AUTHORITY BOOTSTRAP — exact control-plane authority binding

Owner-ratified 2026-07-28. Bu kayıt yalnız PR #1797 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-P02-S08-D02-PB01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 1801748aab2f2197ffc5882b46d182613b1e92b1
Head ref : codex/rcv-claim-form-pb01-authority-bootstrap-control-plane-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-P02-S08-D02-PB01-AUTHORITY-BOOTSTRAP-R01
Target mode      : RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_R01
Target PR        : #1797
Original base SHA: a62e078a33803774ef5595343092ab2ad36d48a9
Head ref         : codex/rcv-claim-form-p02-s08-d02-pb01-authority-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01-GRANT
```

Hedef PR yalnız exact branch ve `M/A` iki-file seti, iki marker'ın exact tekil
oluşu, execution grant'in semantic authority'ye exact binding'i ve güncel target
base'in bu binding'i canonical yapan commit'in descendant'ı olması birlikte
doğrulandığında kabul edilir. Original base provenance'dır; target head SHA
pinlenmez ve fresh-main normal merge ile uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1797 ve iki target path için geçerlidir. Genel
`decision-log.md` yazma, başka execution grant, PB01 formal-closure target
mutation'ı, request/execution/result, production, schema, migration, runtime
veya owner WIP yetkisi üretmez. Wildcard, prefix authority ve reusable authority
yoktur. PR #1797 merge veya close olduğunda binding yeniden kullanılamaz.

## PB01 FORMAL CLOSURE — exact control-plane authority binding

Owner-ratified 2026-07-28. Bu kayıt yalnız PR #1807 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-P02-S08-D02-PB01-FORMAL-CLOSURE-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01
Base SHA : 0335c4cff8879a3246bddd33ad439c7567be7bf9
Head ref : codex/rcv-claim-form-pb01-formal-closure-control-plane-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-P02-S08-D02-PB01-FORMAL-CLOSURE-R01
Target mode      : RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_R01
Target PR        : #1807
Original base SHA: 11010e1d771929eec13e76d080c4243fc31db6c2
Head ref         : codex/rcv-claim-form-p02-s08-d02-pb01-formal-closure-r01
Scope            : M project/docs/governance/GOVERNANCE-INDEX.md
                   M project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md
                   M project/docs/governance/canonicalization-register.md
                   M project/docs/governance/product-backlog.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01-GRANT
Implementation   : PR #1794 / a62e078a33803774ef5595343092ab2ad36d48a9
Contract         : RCV-CLAIM-LEGAL-BASIS-PROJECTION-BINDING@1
Next task        : RCV-CLAIM-FORM-P02-S08-D02-KC01 / OWNER GO REQUIRED
```

Hedef PR yalnız exact branch ve `M/M/M/M` dört-file seti; main'de canonical
semantic authority ile execution grant marker'larının exact tekil oluşu;
grant'in semantic authority ve aynı dört path'e exact binding'i; implementation
squash ancestry'si; target content'in PB01 closure, contract identity ve yalnız
KC01 owner gate'ini taşıması; güncel target base'in bu binding'i canonical yapan
commit'in descendant'ı olması birlikte doğrulandığında kabul edilir. Original
base provenance'dır; target head SHA pinlenmez ve fresh-main normal merge ile
uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1807 ve dört target path için geçerlidir. Genel
governance yazma, authority/grant üretme, request/execution/result, production,
schema, migration, live database, runtime, key/signature/signed release veya
owner WIP yetkisi üretmez. D02-KC01'i başlatmaz; D02-F01, D02-I01/I02/I03,
I04/I05, canary ve containment retirement'a authority vermez. Wildcard, prefix
authority ve reusable authority yoktur. PR #1807 merge veya close olduğunda
binding yeniden kullanılamaz.

## OWNER-WIP MULTI-SOURCE PATH OWNERSHIP — exact reconciliation binding

Owner-ratified 2026-07-29. This one-time binding permits only the lossless
source-attribution reconciliation of grandfathered owner WIP. It does not grant
domain-document mutation, source cleanup or owner-content mutation authority.

```text
Task ID  : OWNER-WIP-MULTI-SOURCE-DISPOSITION-AND-PATH-OWNERSHIP-R01
Mode     : OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01
Base SHA : 36208cdbab07a712a79756151b065270b88c64ae
Head ref : codex/owner-wip-path-ownership-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
           M project/docs/governance/governance-writer-coordination-protected-paths.json
           M project/docs/governance/governance-writer-coordination-cutover-record.md
```

The protected-path registry may carry a backward-compatible
`grandfatheredOwnerWipSources` attribution layer. Each source records identity,
location, base, owner, semantic purpose, disposition, archive reference and
sorted exact-path records with SHA-256 content identity and active-protection
state. The legacy flat exact-path list remains required and must equal the
deterministic sorted union of all active source paths. Any active source keeps a
path forbidden; all attributed sources must be inactive before that path is
released. Prefix protection is unchanged.

The evidence archive is external to the repository and is pinned by
`sha256-manifest.txt` digest
`777108ef35abb88eb7d4277561e7033b28b6c4b2fa82312cee3a4407409d982b`.
This binding cannot modify the protected domain documents, unlock or clean any
source, remove a branch/worktree, weaken owner-WIP failures, create a reusable
authority, or authorize Task 04 semantic changes. Exact base, branch and five
modified paths are mandatory; after merge the binding cannot be reused.

## KC01 AWS KMS AUTHORITY BOOTSTRAP — exact control-plane authority binding

Owner-ratified 2026-07-29. Bu kayıt yalnız PR #1859 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-D02-KC01-AWS-KMS-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : edcb2f704f4474f366bb29fa173b6e2cd19a5489
Head ref : codex/rcv-claim-form-d02-kc01-aws-kms-authority-bootstrap-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-D02-KC01-AWS-KMS-AUTHORITY-BOOTSTRAP-R01
Target mode      : RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_R01
Target PR        : #1859
Original base SHA: 74d1950deb632380a7ca6574a009e85c206c7f14
Head ref         : codex/rcv-claim-form-d02-kc01-aws-kms-authority-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01-GRANT
```

Hedef PR yalnız exact branch ve `M/A` iki-file seti, iki marker'ın exact tekil
oluşu, execution grant'in semantic authority'ye exact binding'i ve güncel target
base'in bu binding'i canonical yapan commit'in descendant'ı olması birlikte
doğrulandığında kabul edilir. Original base provenance'dır; target head SHA
pinlenmez ve fresh-main normal merge ile uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1859 ve iki target path için geçerlidir. Genel
`decision-log.md` yazma, başka execution grant, KC01 formal-closure target
mutation'ı, request/execution/result, AWS provider mutation, production,
schema, migration, runtime veya owner WIP yetkisi üretmez. AWS account ID,
key/IAM ARN, credential, token, public/private key material veya reusable
authority taşımaz. PR #1859 merge veya close olduğunda binding yeniden
kullanılamaz.
