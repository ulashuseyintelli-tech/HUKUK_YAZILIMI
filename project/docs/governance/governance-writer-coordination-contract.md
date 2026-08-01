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
Base SHA : a23e074589236bd451e797fd0f6a2b7e24c66fb9
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

## KC01 FORMAL CLOSURE — exact control-plane authority binding

Owner-ratified 2026-07-29. Bu kayıt yalnız PR #1867 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-P02-S08-D02-KC01-FORMAL-CLOSURE-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01
Base SHA : 42fb9dcd0d8d33a4992973d091c77e5798d5cab7
Head ref : codex/rcv-claim-form-d02-kc01-formal-closure-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-P02-S08-D02-KC01-FORMAL-CLOSURE-R01
Target mode      : RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_R01
Target PR        : #1867
Original base SHA: a43918b6d58417a951337328d4fc4b0b72675746
Head ref         : codex/rcv-claim-form-d02-kc01-formal-closure-r01
Scope            : M project/docs/governance/GOVERNANCE-INDEX.md
                   M project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md
                   M project/docs/governance/canonicalization-register.md
                   M project/docs/governance/product-backlog.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01-GRANT
Implementation   : PR #1856 / 74d1950deb632380a7ca6574a009e85c206c7f14
Provider         : AWS_KMS
Manifest checksum: 1e80168ebc52e6601f9231834ddde81a339e69a2337a0630bd9daa993f0519ec
Next task        : RCV-CLAIM-FORM-P02-S08-D02-TR01 / OWNER GO REQUIRED
```

Hedef PR yalnız exact branch ve `M/M/M/M` dört-file seti; main'de canonical
semantic authority ile execution grant marker'larının exact tekil oluşu;
grant'in semantic authority ve aynı dört path'e exact binding'i; implementation
squash ancestry'si; target content'in KC01 closure, AWS KMS provider, public
manifest checksum, `PENDING_ONBOARDING`/`NOT_ACTIVE` sınırları ve yalnız TR01
owner gate'ini taşıması; güncel target base'in bu binding'i canonical yapan
commit'in descendant'ı olması birlikte doğrulandığında kabul edilir. Original
base provenance'dır; target head SHA pinlenmez ve fresh-main normal merge ile
uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1867 ve dört target path için geçerlidir. Genel
governance yazma, authority/grant üretme, request/execution/result, AWS provider
mutation, trust-root activation, signing, signed release, production, schema,
migration, live database, runtime veya owner WIP yetkisi üretmez. D02-TR01'i
başlatmaz; D02-F01, resolver/provider wiring, I04/I05, canary ve containment
retirement'a authority vermez. AWS account ID, key/IAM ARN, credential, token,
public/private key material, wildcard, prefix authority veya reusable authority
taşımaz. PR #1867 merge veya close olduğunda binding yeniden kullanılamaz.

## GOVERNANCE CLOSEOUT LIVE LEDGER GAP — root-authority bootstrap binding

Owner-ratified 2026-07-29. Bu kayıt yalnız aşağıdaki iki aşamalı, task-specific
bootstrap protokolünü tanır. Stage 1 control-plane binding'i oluşturur; canonical
authority kaydı yazmaz. Stage 2 ayrı ve fresh owner grant olmadan yetkili değildir.

```text
Protocol mode ID : GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01
Program ID       : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
Target task      : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01
Workspace module : SHARED_CONTROL_PLANE
Owner name       : Av. Ulaş Hüseyin Telli
Owner role       : Repository Owner / Semantic Authority
Issued at        : 2026-07-29
```

### Stage 1 — exact control-plane binding

```text
Task ID  : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 35e215cde413dd3de42093f967c01b4929f37fed
publicationBasePolicy : OWNER_PINNED_START_OR_UNCHANGED_DESCENDANT
Head ref : codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

Stage 1 yalnız exact task, mode, branch ve complete `M/M/M` status/path setiyle
kabul edilir. `Base SHA` owner-pinned execution-start base'idir. Publication
base yalnız bu SHA veya onun Git-backed descendant'ı olabilir; descendant kabulü
üç Stage 1 binding blob'unun owner-pinned base ile birebir aynı kalmasını
gerektirir. Eski/unrelated base, binding-blob drift, ek/eksik path veya status
drift fail-closed reddedilir. Bu aşama Decision Log, execution grant,
design/audit artifact, closeout runner, ledger veya ürün yüzeyi yazamaz.

### Stage 2 — prospective exact authority materialization binding

```text
Task ID           : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-MATERIALIZATION-R01
Mode              : GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_MATERIALIZATION_R01
Head ref          : codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap
Scope             : M project/docs/governance/decision-log.md
                    A project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
stage2Predecessor : OWNER_GRANT_2_REQUIRED
stage2Base : OWNER_GRANT_2_REQUIRED
STAGE 2 STATUS: NOT AUTHORIZED / OWNER RATIFICATION REQUIRED
```

Stage 2 owner grant'i canonical Stage 1 squash SHA'sını predecessor, fresh
`origin/main` SHA'sını exact base olarak ayrıca pinler. Predecessor burada
tahmin edilmez. Stage 2 ancak base bu unique predecessor'ın descendant'ıysa ve
Stage 1'deki script, test ve contract blob'ları değişmemişse kabul edilir.

Stage 2'nin iki distinct canonical kaydı ve exact content şeması:

```text
recordType : SEMANTIC_AUTHORITY
recordId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01
path : project/docs/governance/decision-log.md
programId : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
taskId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
decision : RATIFIED
issuedAt : 2026-07-29
status : ACTIVE_AFTER_APPROVED_MERGE
exactTaskBinding : REQUIRED
exactPrBinding : REQUIRED
exactHeadBinding : REQUIRED
exactScopeBinding : REQUIRED
requiredChecksBinding : REQUIRED
singleUseConsumption : REQUIRED
staleReuse : PROHIBITED
manualFallback : EMERGENCY_ONLY
productionActivation : NOT_AUTHORIZED
standingAuthority : PROHIBITED
```

Semantic marker Decision Log'da exact bir kez bulunur ve aynı satırdaki exact
record kimliğini işaret eder:

```html
<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01 -->
```

Validator, marker'daki exact `recordId` alanını taşıyan tek fenced `text` SA
kayıt bloğunu deterministik olarak seçer. Zorunlu alanların tekillik ve değer
kontrolü yalnız bu hedef blok içinde yapılır; başka geçerli SA kayıtlarındaki
ortak alanlar çakışma sayılmaz. Hedef blokta eksik olan alan başka bir SA
kaydından karşılanamaz. Missing/duplicate marker, missing/duplicate hedef kayıt
bloğu ile hedef blok içindeki missing/duplicate/wrong alanlar fail-closed
reddedilir. EG marker, alan ve bootstrap kontrolleri bu record-scoping
kuralından etkilenmez.

Record-scoping repair publication'ı yalnız aşağıdaki self-binding ile kabul
edilir:

```text
Task ID  : GOVERNANCE-COORDINATION-ROOT-SA-RECORD-SCOPING-REPAIR-R01
Mode     : GOVERNANCE_COORDINATION_ROOT_SA_RECORD_SCOPING_REPAIR_R01
Base SHA : 3f3d672197722f8f7d9ebdebdf979d715cfb601d
Head ref : codex/governance-coordination-root-sa-record-scoping-repair-r02
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

Base, branch veya exact `M/M/M` path-status tuple drift ederse publication
fail-closed reddedilir. Bu self-binding authority materialization, başka bir
control-plane repair veya genişletilmiş path yetkisi üretmez.

```text
recordType : EXECUTION_GRANT
recordId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01
path : project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
programId : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
taskId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
executionMode : GO-COMPLETE
workspaceModule : SHARED_CONTROL_PLANE
issuedAt : 2026-07-29
status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK
stage1PredecessorSha : <OWNER_GRANT_2_EXACT_SHA>
stage2BaseSha : <OWNER_GRANT_2_EXACT_SHA>
productionActivation : NOT_AUTHORIZED
ciBypass : PROHIBITED
ledgerBypass : PROHIBITED
standingAuthority : PROHIBITED
reusableAuthority : PROHIBITED
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01
```

Execution marker execution-grant dosyasında exact bir kez bulunur:

```html
<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01 -->
```

`globalAuthority : PROHIBITED`, `reusableAuthority : PROHIBITED` ve
`auditAsAuthority : PROHIBITED` bağlayıcıdır. İki kayıt kind, path ve record ID
bakımından distinct kalır. Stage 2 base'inde bu kayıt veya marker'lardan biri
zaten varsa mode consumed sayılır ve reuse reddedilir. Bu binding global owner
authority, wildcard/prefix authority, standing scheduler/auto-merge, ledger/CI
bypass, production activation, closeout implementasyonu veya başka task için
yetki üretmez.

### Stage 2 validator/base-binding reconciliation — exact task-bound extension

Owner-ratified 2026-07-30. Byte-equality primary path olarak korunur. Yalnız bu
exact root-bootstrap zincirinde protected Stage 1 blob drift'i varsa, aşağıdaki
canonical task-bound reconciliation record'ı bütün security ve staleness
kontrollerini geçirdiğinde semantic reconciliation path kullanılabilir.

```text
Task ID  : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-VALIDATOR-BASE-BINDING-RECONCILIATION-R01
Mode     : GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_BASE_BINDING_RECONCILIATION_R01
Base SHA : 989dac5b18ee895a1e621586c84adb3cabeb4c02
Head ref : codex/governance-closeout-stage2-validator-base-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
           A project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/stage2-base-reconciliation-authority.json
```

Canonical reconciliation locator ve provenance:

```text
recordType : ROOT_BOOTSTRAP_STAGE2_BASE_RECONCILIATION
recordId   : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-BASE-RECONCILIATION-R01
source PR  : #1915
source SHA : 0f78a5ea49b0c3be91172de4939ae8bd95a25f17
source path: project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/reconciliation-result.json
```

Validator yalnız iki base path kabul eder:

```text
1. Stage 1 protected blob'ları canonical predecessor ile byte-for-byte eşit.
2. Blob'lar farklı ve exact canonical reconciliation record'ı:
   - program, target task, bootstrap mode ve Stage 1 merge SHA'ya exact bağlı;
   - source reconciliation merge SHA'sı current base'in ancestor'ı;
   - drift classification closed allowlist içinde;
   - security invariants PRESERVED;
   - target program/task binding, Stage 2 binding ve contract/code/test consistency PASS;
   - authority conflict ve resolver ambiguity NONE;
   - current protected blob SHA setiyle exact eşit.
```

İzinli drift classification seti yalnız `PRESERVED_EXACTLY`,
`PRESERVED_SEMANTICALLY_EQUIVALENT`, `EXTENDED_BACKWARD_COMPATIBLY` ve
`SUPERSEDED_BY_CANONICAL_SUCCESSOR` değerleridir. Record'ın kendisi current
writer durumunu kalıcılaştırmaz; `writerGateRequirement` exact olarak
`PASS_AT_CURRENT_EXECUTION_PREFLIGHT` kalır. `validate-root-stage2-base` çağrısı
current execution'da explicit `--writer-gate PASS` olmadan readiness üretmez.

Missing, malformed, duplicate/conflicting, cross-task, wrong-mode, wrong-Stage-1,
non-ancestor, weakened-security veya post-reconciliation protected-blob drift'i
fail-closed reddedilir. Markdown, chat, PR/commit açıklaması ve audit-only belge
authority kaynağı değildir. Bu extension exact task/branch/path/record kontrollerini,
single-use davranışını, CI/ledger zorunluluğunu veya production yasağını gevşetmez;
Stage 2 SA/EG materyalize etmez ve target live-ledger implementasyonunu başlatmaz.

## TR01 TRUST-ROOT AUTHORITY BOOTSTRAP — exact control-plane authority binding

Owner-ratified 2026-07-29. Bu kayıt yalnız PR #1903 için tek kullanımlık,
task-specific bir control-plane binding oluşturur; mevcut hiçbir kontrolü
gevşetmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-D02-TR01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 75790c059acb69a558ba2f835179dcedbbef2a45
Head ref : codex/rcv-claim-form-d02-tr01-authority-bootstrap-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-D02-TR01-AUTHORITY-BOOTSTRAP-R01
Target mode      : RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_R01
Target PR        : #1903
Original base SHA: d284befcc37dc3ba499440b71dfb506589916503
Head ref         : codex/rcv-claim-form-d02-tr01-authority-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01-GRANT
```

Hedef PR yalnız exact branch ve `M/A` iki-file seti, iki marker'ın exact tekil
oluşu, execution grant'in semantic authority'ye exact binding'i ve güncel target
base'in bu binding'i canonical yapan commit'in descendant'ı olması birlikte
doğrulandığında kabul edilir. Original base provenance'dır; target head SHA
pinlenmez ve fresh-main normal merge ile uzlaştırma korunur.

Binding yalnız yukarıdaki PR #1903 ve iki target path için geçerlidir. Genel
`decision-log.md` yazma, başka execution grant, TR01 formal-closure target
mutation'ı, request/execution/result, AWS KMS mutation, production signing,
schema, migration, runtime veya owner WIP yetkisi üretmez. AWS account ID,
key/IAM ARN, credential, token, private material veya unredacted CloudTrail
evidence taşımaz. PR #1903 merge veya close olduğunda binding yeniden
kullanılamaz.

## KC01/TR01 OWNERSHIP RECONCILIATION AUTHORITY BOOTSTRAP — exact control-plane binding

Owner-ratified 2026-07-30. Bu kayıt yalnız PR #1914 için tek kullanımlık,
task-specific authority-bootstrap binding oluşturur; mevcut hiçbir kontrolü
gevşetmez ve altıncı bir hukuk modülü üretmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : ebb82762a6ecf24c214b6b6a5d2fede8caa4c206
Head ref : codex/rcv-claim-form-kc01-tr01-ownership-authority-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-AUTHORITY-BOOTSTRAP-R01
Target mode      : RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_R01
Target PR        : #1914
Original base SHA: abd06a6b221faba42671104df0302114d4ec9ba5
Head ref         : codex/rcv-claim-form-kc01-tr01-ownership-authority-bootstrap-r01
Scope            : M project/docs/governance/decision-log.md
                   A project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT
```

Hedef PR yalnız exact branch ve `M/A` iki-file seti, iki marker'ın exact tekil
oluşu, execution grant'in semantic authority'ye exact binding'i ve güncel target
base'in bu binding'i canonical yapan commit'in descendant'ı olması birlikte
doğrulandığında kabul edilir. Original base provenance'dır; target head SHA
pinlenmez ve fresh-main normal merge ile uzlaştırma korunur.

Binding yalnız PR #1914 ve iki target path için geçerlidir. Genel protected-doc
yazma, final reconciliation target mutation'ı, AWS/IAM/KMS işlemi, Office runtime,
Legal Basis content ratification, schema, migration, production activation,
signing, signed release veya owner WIP yetkisi üretmez. PR #1914 merge veya close
olduğunda binding yeniden kullanılamaz; reusable authority `NONE` kalır.

## KC01/TR01 OWNERSHIP RECONCILIATION — exact control-plane binding

Owner-ratified 2026-07-30. Bu kayıt yalnız PR #1925 için tek kullanımlık,
task-specific governance reconciliation binding oluşturur. PR #1914 ile canonical
hale gelen semantic authority ve execution grant birbirinden ayrı kalır; bu binding
yeni semantik veya execution grant üretmez.

### Binding PR kimliği

```text
Task ID  : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-CONTROL-PLANE-BINDING-R01
Mode     : RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01
Base SHA : 68badf34cdf63dbfe3f860efb97f61fbe05a6f71
Head ref : codex/rcv-claim-form-kc01-tr01-ownership-control-plane-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
```

### Hedef PR kimliği

```text
Target task      : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01
Target mode      : RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_R01
Target PR        : #1925
Original base SHA: 11f0657af70d4b292ebd609f45398574cd99ec8f
Head ref         : codex/rcv-claim-form-kc01-tr01-ownership-reconciliation-r01
Scope            : M project/docs/governance/GOVERNANCE-INDEX.md
                   M project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md
                   M project/docs/governance/canonicalization-register.md
                   M project/docs/governance/product-backlog.md
Semantic record  : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01
Execution record : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT
KC01 evidence SHA: 74d1950deb632380a7ca6574a009e85c206c7f14
TR01 evidence SHA: 3472052b2efb08d5e3fbcda7ce0654b012225689
Sequence SHA     : 76fb4c3440586453f2380a866aeda58322c778bf
Next task        : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01
```

Hedef PR yalnız exact branch ve `M/M/M/M` dört-file seti, canonical binding
ancestry'si, exact semantic/execution authority marker'ları, grant içindeki exact
path allowlist'i, KC01/TR01/sequence evidence ancestry'si ve üçlü ownership
literal'leri birlikte doğrulandığında kabul edilir. Fresh-main advance, binding
commit'inin ve evidence SHA'larının descendant'ı olduğu sürece normal reconciliation
ile desteklenir.

Binding yalnız PR #1925 ve dört target path için geçerlidir. AWS/IAM/KMS mutation,
Office runtime, Legal Basis content ratification, code, test, schema, migration,
production activation, signing, signed release, D02-LB01 authority veya owner WIP
yetkisi üretmez. PR #1925 merge veya close olduğunda binding yeniden kullanılamaz;
global/reusable authority `NONE` kalır.

## RECEIVABLE LEGAL BASIS CONTENT RATIFICATION — root-authority bootstrap binding

Owner-ratified 2026-07-30. Bu kayıt yalnız
`RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01` için tek
kullanımlık iki aşamalı authority-bootstrap modelinin Stage 1 control-plane
binding'ini oluşturur. Existing root-bootstrap security invariant'larını
gevşetmez ve Stage 2'yi yürütmez.

```text
protocolModeId : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_ROOT_AUTHORITY_BOOTSTRAP_R01
programId : RECEIVABLE-LEGAL-BASIS-MODEL-COMPLETION
targetTaskId : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01
workspaceModule : RECEIVABLE
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
issuedAt : 2026-07-30
expiresAt : 2026-07-30T19:30:00Z
designId : ROOT-AUTHORITY-BOOTSTRAP-DESIGN-R01
designMergeSha : 8738bfcde7d962dda7729fc92ff1dfb929881f33
```

### Stage 1 exact binding

```text
Task ID  : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : b5bf8977e3e4458c2da294f75aa48558df5e581c
Head ref : codex/receivable-legal-basis-registry-content-ratification-r01-authority-bootstrap-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
publicationBasePolicy : OWNER_PINNED_EXACT_ONLY
```

Base, branch, task/mode ve complete `M/M/M` path-status setinden herhangi
biri farklıysa Stage 1 fail-closed reddedilir. Grant expiry anında veya
sonrasında Stage 1 yürütülemez; descendant base otomatik kabul edilmez.

### Stage 2 prospective binding

```text
Task ID  : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-AUTHORITY-MATERIALIZATION-R01
Mode     : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_AUTHORITY_MATERIALIZATION_R01
Head ref : codex/receivable-legal-basis-registry-content-ratification-r01-authority-bootstrap
Scope    : M project/docs/governance/decision-log.md
           A project/docs/governance/coordination-execution-grants/RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01.md
Semantic kind   : SEMANTIC_AUTHORITY
Semantic path   : project/docs/governance/decision-log.md
Semantic record : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-SA01
Execution kind   : EXECUTION_GRANT
Execution path   : project/docs/governance/coordination-execution-grants/RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01.md
Execution record : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01
stage2Predecessor : OWNER_GRANT_2_REQUIRED
stage2Base : OWNER_GRANT_2_REQUIRED
```

Stage 2 yalnız unique canonical Stage 1 squash SHA ve fresh Stage 2 base SHA
ayrı owner grant'inde exact pinlendikten sonra çalışabilir. Stage 1'in üç
protected blob'u Stage 2 base'inde byte-exact korunmalıdır. Semantic authority
ile execution grant farklı kind, path ve record ID taşır.

### Hash-bound target content invariants

```text
decisionPackId : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01
decisionPackVersion : 1
decisionPackSha256 : 94a98d53ea6f1d785f811ffe24a199e9fecd5cb8b46f138c3c3932079666b357
ldoName : Av. Fatma Uluca Telli
ldoRole : LEGAL DOMAIN OFFICER / LEGAL REVIEWER
ldoRatifierCode : TELLI-LEGAL-REVIEWER-01
ldoDisposition : APPROVED
finalRatifierName : Av. Ulaş Hüseyin Telli
finalRatifierRole : OWNER / FINAL LEGAL RATIFIER
finalRatifierCode : TELLI-FINAL-LEGAL-RATIFIER-01
finalRatifierDisposition : RATIFIED
ratificationEffectiveAtUtc : 2026-07-30T12:03:52Z
ratifiedModel : MODEL_B_SIX_CLAIM_LEVEL_SUBTYPES
ratifiedSubtype : INTERIM_MAINTENANCE
ratifiedSubtype : MINOR_CHILD_MAINTENANCE
ratifiedSubtype : ADULT_CHILD_EDUCATION_MAINTENANCE
ratifiedSubtype : POVERTY_MAINTENANCE
ratifiedSubtype : SEPARATE_LIVING_SPOUSAL_MAINTENANCE
ratifiedSubtype : FAMILY_SUPPORT_MAINTENANCE
```

Stage 2 authority records yalnız bu exact content tuple'ını taşıyabilir. Wrong
hash, ratifier identity/code, shared timestamp, model veya subtype seti
fail-closed reddedilir. `TELLI-PROD-LEGAL-01` hukuki ratifier değildir.

```text
globalAuthority : PROHIBITED
reusableAuthority : PROHIBITED
auditAsAuthority : PROHIBITED
STAGE 2 STATUS: NOT AUTHORIZED / OWNER RATIFICATION REQUIRED
```

Bu binding decision-log mutation, SA/EG materialization, target governance
write, registry JSON/schema/validator/release/checksum mutation, resolver,
application code, Prisma/schema/migration, UYAP, OFFICE, AWS/IAM/KMS, runtime
activation, signing veya signed release yetkisi üretmez. Stage 1 approved merge
ile `CONSUMED / NON-REUSABLE` olur; Stage 2 ve target ratification ayrı gate'te
kalır.

## RECEIVABLE LEGAL BASIS CONTENT RATIFICATION — fresh Stage 1 re-binding R02

Owner-ratified 2026-07-31. Bu kayıt, historical PR #1945 Stage 1 binding'ini
değiştirmeden current canonical control-plane blob'larını aynı Receivable target
task için yeniden exact pinler. Generic validator relaxation veya başka bootstrap
binding'leri için descendant acceptance üretmez.

```text
protocolModeId : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_STAGE1_FRESH_REBINDING_R02
programId : RECEIVABLE-LEGAL-BASIS-MODEL-COMPLETION
targetTaskId : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01
workspaceModule : RECEIVABLE
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
issuedAt : 2026-07-31
designId : ROOT-AUTHORITY-BOOTSTRAP-DESIGN-R01
designMergeSha : 8738bfcde7d962dda7729fc92ff1dfb929881f33
```

### Historical predecessor

```text
Task ID    : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Merge SHA  : 1bcda6874c1119073fe90a566a5174ab35062173
Disposition: HISTORICAL_CANONICAL_IMMUTABLE
```

### Fresh Stage 1 R02 exact binding

```text
Task ID  : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-STAGE1-FRESH-REBINDING-R02
Mode     : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_STAGE1_FRESH_REBINDING_R02
Base SHA : 6c34395d4ade84603b340b197f2c4e5d13c1ec4f
Head ref : codex/receivable-legal-basis-stage1-fresh-rebinding-r02
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
publicationBasePolicy : OWNER_PINNED_EXACT_ONLY
```

Base, branch, task/mode ve exact `M/M/M` path-status setinden herhangi biri
farklıysa R02 fail-closed reddedilir. R02 yalnız captured exact base üzerinde
yayınlanabilir; historical R01 fallback veya current authority olarak yeniden
kullanılamaz.

### Stage 2 binding after R02

```text
Task ID  : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-AUTHORITY-MATERIALIZATION-R01
Mode     : RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_AUTHORITY_MATERIALIZATION_R01
Head ref : codex/receivable-legal-basis-registry-content-ratification-r01-authority-bootstrap
Scope    : M project/docs/governance/decision-log.md
           A project/docs/governance/coordination-execution-grants/RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01.md
Semantic kind   : SEMANTIC_AUTHORITY
Semantic path   : project/docs/governance/decision-log.md
Semantic record : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-SA01
Execution kind   : EXECUTION_GRANT
Execution path   : project/docs/governance/coordination-execution-grants/RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01.md
Execution record : RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01-EG01
stage2Predecessor : FRESH_R02_CANONICAL_MERGE_REQUIRED
stage2Base : FENCE_FIRST_CAPTURED_CURRENT_MAIN
```

### Master authority and role-separation policy

```text
masterTaskId : RECEIVABLE-NAFAKA-LEGAL-BASIS-TERMINAL-CLOSURE-R01
authorityPolicy : CONDITIONAL_DECISION_PACK_V2_RECONSTRUCTION
legacyDecisionPackV1Status : UNVERIFIABLE_NOT_USABLE
decisionPackV2Status : PENDING_RECONSTRUCTION
contentRatificationStatus : NOT_YET_CLAIMED
ldoName : Av. Fatma Uluca Telli
ldoRole : LEGAL DOMAIN OFFICER / LEGAL REVIEWER
ldoRatifierCode : TELLI-LEGAL-REVIEWER-01
finalRatifierName : Av. Ulaş Hüseyin Telli
finalRatifierRole : OWNER / FINAL LEGAL RATIFIER
finalRatifierCode : TELLI-FINAL-LEGAL-RATIFIER-01
productionSignerIdentity : TELLI-PROD-LEGAL-01
productionSignerRole : PRODUCTION_RELEASE_SIGNER
productionSignatureStatus : PENDING_NOT_EXECUTED
```

Stage 2, yalnız R02 canonical merge SHA'sı ve fence-first captured current-main
base'i üzerinde exact iki-file materialization olarak çalışır. SA01 ve EG01
birbirinden ayrı kalır; second materialization, stale base, wrong task, wrong
marker ve wrong reference fail-closed reddedilir.

```text
globalAuthority : PROHIBITED
reusableAuthority : PROHIBITED
auditAsAuthority : PROHIBITED
STAGE 2 STATUS: OWNER_AUTHORIZED_AFTER_R02_MERGE
```

R02 veya Stage 2 eski Decision Pack v1'i content authority olarak kullanmaz.
Stage 2 merge'i content ratification değildir. Decision Pack v2 reconstruction,
row-level legal content, immutable release, resolver success path, runtime ve
production activation ayrı program fazlarında kalır.

## OFFICE SPRING-CLEANING RECONCILIATION — exact authority-bootstrap binding

Bu bölüm yalnız owner tarafından önceden ratifiye edilen aşağıdaki tek OFFICE
authority materialization tuple'ını sınıflandırır. Genel bootstrap, standing
authority veya ordinary control-plane write yetkisi üretmez.

```text
bootstrapId : OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01
programId : OFFICE-SPRING-CLEANING-R01
targetTaskId : OFFICE-SPRING-CLEANING-RECONCILIATION-R01
workspaceModule : CROSS_MODULE
workspaceScope : OFFICE / SHARED_CONTROL_PLANE
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
ownerAuthorityRef : OWNER-RATIFICATION-AND-EXECUTION-GRANT-PR1954-POST-MERGE-RECONCILIATION-2026-07-30
issuedAt : 2026-07-30
```

### Control-plane binding PR

```text
Task ID  : OFFICE-SPRING-CLEANING-RECONCILIATION-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01
Mode     : OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
Base SHA : 057f1c84cbdc3f7845c5722aa348e34876dbfb0e
Head ref : codex/office-spring-cleaning-authority-bootstrap-binding-r01
Scope    : M project/scripts/governance-coordination.cjs
           M project/scripts/governance-coordination.test.cjs
           M project/docs/governance/governance-writer-coordination-contract.md
publicationBasePolicy : OWNER_PINNED_START_OR_UNCHANGED_DESCENDANT
```

### Fresh R02 authority materialization

```text
Historical pull request : 1967
Historical disposition : CLOSED_NOT_MERGED_NOT_REOPENED
Historical canonical authority source : NO
Task ID  : OFFICE-SPRING-CLEANING-RECONCILIATION-R01-AUTHORITY-MATERIALIZATION-R02
Mode     : OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_MATERIALIZATION_R02
materializationBasePolicy : CURRENT_CANONICAL_BINDING_DESCENDANT
Head ref : codex/office-spring-cleaning-reconciliation-r01-authority-r02
Scope    : M project/docs/governance/decision-log.md
           A project/docs/governance/coordination-execution-grants/OFFICE-SPRING-CLEANING-RECONCILIATION-R01-EG01.md
Semantic kind   : SEMANTIC_AUTHORITY
Semantic path   : project/docs/governance/decision-log.md
Semantic record : OFFICE-SPRING-CLEANING-RECONCILIATION-R01-SA01
Execution kind   : EXECUTION_GRANT
Execution path   : project/docs/governance/coordination-execution-grants/OFFICE-SPRING-CLEANING-RECONCILIATION-R01-EG01.md
Execution record : OFFICE-SPRING-CLEANING-RECONCILIATION-R01-EG01
exactPathStatusBinding : REQUIRED
secondMaterialization : PROHIBITED
ordinaryControlPlaneDiff : PROHIBITED
requiredCiBypass : PROHIBITED
```

Validator yalnız exact program/task, distinct SA/EG locator, owner identity,
`GO-COMPLETE`, exact `M/A` iki-dosya seti, tekil marker/structured record,
canonical binding ancestry ve EG içindeki actual materialization base SHA
birlikte doğrulandığında bu tuple'ı kabul eder. PR #1967 historical kayıttır;
yeniden açılmaz ve canonical authority source değildir.
Eksik veya fazla path, status/branch/record drift'i, başka authority kaydı,
cross-task reuse ve ikinci materialization fail-closed reddedilir. Bu kabul
yalnız scope classification'dır; required CI, merge ve live closeout gate'lerini
bypass etmez.

## OFFICE F01 AUTHORIZATION AND SENSITIVE PROJECTION — Stage 1 binding

Bu bölüm yalnız owner tarafından verilen tek kullanımlık OFFICE F01 Stage 1
control-plane binding grant'ini sınıflandırır. Stage 1 yeni owner kararı,
semantic authority kaydı veya execution-grant dosyası üretmez; Stage 2 ve
OFFICE implementation bu binding'in kapsamı dışındadır.

```text
bootstrapId : OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_R01
programId : REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01
wave : WAVE 1 — CRITICAL PATH
taskId : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-AUTHORITY-BOOTSTRAP-STAGE1-BINDING-R01
mode : OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01
baseSha : b3d8075969d4ec7b8902004e2216c5110e4c05a3
headRef : codex/office-sc-f01-authority-bootstrap-stage1-binding-r01
executionMode : GO-COMPLETE — STAGE 1 ONLY
workspace : SHARED CONTROL PLANE / OFFICE
priority : P0
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
ownerDecisions : 8/8 RATIFIED
reRatification : NOT REQUIRED
targetSuccessorTaskId : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-AUTHORITY-MATERIALIZATION-R01
finalImplementationTaskId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
M project/scripts/governance-coordination.cjs
M project/scripts/governance-coordination.test.cjs
M project/docs/governance/governance-writer-coordination-contract.md
```

Stage 1 validator'ın tanıdığı deterministik Stage 2 successor tuple'ı aşağıdaki
gibidir. Bu tuple yalnız eligibility kanıtıdır; dispatchable değildir ve
mutation authority taşımaz:

```text
stage2TaskId : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-AUTHORITY-MATERIALIZATION-R01
stage2Mode : OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_MATERIALIZATION_R01
stage2HeadRef : codex/office-sc-f01-authority-materialization-r01
stage2StatusTuple : M / A / A / A
stage2PathCount : 4
stage2Eligibility : ELIGIBLE / EXECUTION AUTHORITY MISSING
stage2Dispatchable : NO
stage2Mutation : FORBIDDEN
futureSemanticAuthorityId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-SA01
futureSemanticAuthorityPath : project/docs/governance/decision-log.md
futureExecutionGrantId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01
futureExecutionGrantPath : project/docs/governance/coordination-execution-grants/OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01.md
stage2Scope : M project/docs/governance/decision-log.md
stage2Scope : A project/docs/governance/office-sc-f01-authorization/office-authorization-decision-matrix.md
stage2Scope : A project/docs/governance/office-sc-f01-authorization/office-sensitive-field-classification-matrix.md
stage2Scope : A project/docs/governance/coordination-execution-grants/OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01.md
stage2AuthorityMaterialization : NOT AUTHORIZED
ownerDecisionMaterialization : NOT AUTHORIZED
officeImplementation : NOT AUTHORIZED
schemaMigration : NOT AUTHORIZED
productionActivation : NOT AUTHORIZED
stage1GrantReuseForStage2 : PROHIBITED
distinctSemanticAndExecutionLocators : REQUIRED
exactAllowlist : REQUIRED
```

Validator yalnız exact owner-pinned base veya protected Stage 1 blob'ları
değişmemiş descendant base, exact branch, task/mode ve üç dosyalık `M/M/M`
allowlist birlikte sağlandığında Stage 1 binding'i kabul eder. Stage 2 tuple'ı
yanlış task, yanlış program, path/status drift'i, ekstra dosya, Stage 1 grant
reuse veya distinct semantic/execution locator koşulunun ihlali halinde
fail-closed reddedilir. Stage 2 için ayrı task-bound execution authority
verilmeden `DISPATCHABLE: NO` ve `MUTATION: FORBIDDEN` kalır.

## UYAP-M01 Legal-Basis resolver binding — exact authority publication binding

Bu kayıt yalnız `UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01` görevinin
consumer-only Legal-Basis resolver binding'i için distinct Semantic Authority ve
Execution Grant yayımlanmasını tanır. RECEIVABLE Legal-Basis semantiğini UYAP'a
taşımaz, yeniden yorumlamaz ve production activation yetkisi üretmez.

```text
Program   : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Binding task : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-AUTHORITY-CONTROL-PLANE-BINDING-R01
Binding mode : UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01
Base SHA     : ca749dd61376fc9e393489ca5f5e13d3efab8f18
Head ref     : codex/uyap-m01-authority-control-plane-binding-r01
Binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Materialization task : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-AUTHORITY-MATERIALIZATION-R01
Materialization mode : UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_I01_AUTHORITY_MATERIALIZATION_R01
Original captured base : ca749dd61376fc9e393489ca5f5e13d3efab8f18
Head ref : codex/uyap-m01-authority-materialization-r01
Materialization scope:
  M project/docs/governance/decision-log.md
  A project/docs/governance/coordination-execution-grants/UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01.md

Semantic authority record : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-SA01
Execution grant record     : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01
Second use                 : FAIL-CLOSED
Production activation      : PROHIBITED
Cross-task reuse           : PROHIBITED
```

Owner ratification evidence is byte-exact and SHA-256 bound:

```text
Av. Ulaş Hüseyin Telli olarak, UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01 görevinin canonical RECEIVABLE Legal-Basis release’ini UYAP içinde consumer-only, exact-version, checksum-bound, fail-closed ve production activation oluşturmayan biçimde bağlamasını; gerekli task-specific Semantic Authority ve Execution Grant kayıtlarının oluşturulmasını; analiz, implementasyon, test, PR, required CI, squash-merge, main sync, post-merge doğrulama ve güvenli cleanup işlemlerinin aynı görev içinde GO-COMPLETE yetkisiyle tamamlanmasını onaylıyorum.
```

```text
ownerRatificationEvidence.excerptSha256 : b6e5202f14c49eba84c66a4173bf11d0ff1674b1e60cfdce2da6ab1c3e7374ae
```

Validator exact branch/base/path tuple'ını, distinct SA/EG record kimliklerini,
exact excerpt/hash eşliğini ve EG'nin exact SA referansını doğrular. Fazla path,
başka branch/base, missing evidence, generic validator relaxation, reusable grant
ve ikinci kullanım fail-closed reddedilir.

## UYAP official AlacakKalemi structured emission — exact authority publication binding

Bu kayıt yalnız `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01`
görevinin bounded reconstruction'ı için distinct Semantic Authority ve Execution
Grant yayımlanmasını tanır. Canonical M01 Legal-Basis sonucunu consumer olarak
kullanır; RECEIVABLE semantiğini yeniden yorumlama, UYAP alanlarından yeni Legal
Basis üretme veya production activation yetkisi vermez.

```text
Program   : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Binding task : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-AUTHORITY-CONTROL-PLANE-BINDING-R01
Binding mode : UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_AUTHORITY_CONTROL_PLANE_BINDING_R01
Base SHA     : 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
Head ref     : codex/uyap-official-alacakkalemi-structured-emission-i01-control-plane-binding-r01
Binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Materialization task : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-AUTHORITY-MATERIALIZATION-R01
Materialization mode : UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_AUTHORITY_MATERIALIZATION_R01
Original captured base : 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
Head ref : codex/uyap-official-alacakkalemi-structured-emission-i01-authority-materialization-r01
Materialization scope:
  M project/docs/governance/decision-log.md
  A project/docs/governance/coordination-execution-grants/UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01.md

Semantic authority record : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-SA01
Execution grant record     : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01
Grant scope                : UYAP STRUCTURED-EMISSION-I01 ONLY
Second use                 : SECOND USE: FAIL-CLOSED
Production activation      : PROHIBITED
Cross-task reuse           : PROHIBITED
```

Owner ratification evidence is byte-exact and SHA-256 bound:

```text
Av. Ulaş Hüseyin Telli olarak, UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01 görevinin canonical M01 Legal-Basis sonucunu değiştirmeden tüketmesini; yalnız W-01…W-05 ile doğrulanmış resmî çek, senet, poliçe ve ilam sarmalayıcıları altında deterministik ve fail-closed structured emission üretmesini; gerekli SA01 ve EG01 kayıtlarının oluşturulmasını; bounded reconstruction, test, required CI, PR, squash-merge, main sync, post-merge doğrulama, terminal closeout ve güvenli cleanup işlemlerinin aynı görev içinde GO-COMPLETE yetkisiyle tamamlanmasını onaylıyorum.
```

```text
ownerRatificationEvidence.excerptSha256 : 5975da98c0e8f2cdf5db86743bf6caa2ed21fde941515791ea27de422b6d1b10
```

Uygulama semantiği yalnız W-01…W-05 ile doğrulanmış resmî çek, senet,
poliçe ve ilam sarmalayıcılarında deterministic emission'a izin verir.
Tenant/case/claim ilişkisi server-side doğrulanır; M01 exact-version ve checksum
sonucu aynen tüketilir. Caller-supplied wrapper veya Legal Basis authority,
fallback/default wrapper ve faiz alacağı emission'ı fail-closed reddedilir.
Runtime default-OFF ve production-unreachable kalır. Validator exact
branch/base/path tuple'ını, distinct SA/EG kimliklerini, exact owner evidence'ını
ve tek kullanımlı grant sınırını doğrular; generic control-plane gevşetmesi yapmaz.

## UYAP official serializer bypass hardening — exact authority publication binding

Bu kayıt yalnız `UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01` görevinin
canonical `OfficialCodeResolution` provenance/capability enforcement'ı için
distinct Semantic Authority ve Execution Grant yayımlanmasını tanır. `takipTuru`
ve `mahiyetKodu` için yalnız canonical resolver tarafından üretilmiş, runtime'da
doğrulanabilir resolution capability'si serializer kapısından geçebilir;
caller-constructed veya kopyalanmış yapısal `RESOLVED` nesneleri XML ve byte
üretiminden önce fail-closed reddedilir.

Bu binding yeni UYAP kod eşlemesi, Legal Basis semantiği, schema/migration,
production call-site, runtime activation, transport veya strict-DTD uygunluk
iddiası üretmez. Structured-emission ve dormant serializer davranışı default-OFF
ve production-unreachable kalır.

```text
Program   : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Known good floor : 2694d1e4bbc4173ee8dc328d97edb853d0d32b78
Binding task : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-AUTHORITY-CONTROL-PLANE-BINDING-R01
Binding mode : UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_AUTHORITY_CONTROL_PLANE_BINDING_R01
Base SHA     : ee0ebe1fbd825b007de71c5f4a9deed6cc4d9a6e
Head ref     : codex/uyap-official-serializer-bypass-hardening-i01-control-plane-binding-r01
Binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Materialization task : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-AUTHORITY-MATERIALIZATION-R01
Materialization mode : UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_AUTHORITY_MATERIALIZATION_R01
Original captured base : ee0ebe1fbd825b007de71c5f4a9deed6cc4d9a6e
Head ref : codex/uyap-official-serializer-bypass-hardening-i01-authority-materialization-r01
Materialization scope:
  M project/docs/governance/decision-log.md
  A project/docs/governance/coordination-execution-grants/UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01.md

Semantic authority record : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-SA01
Execution grant record     : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01
Grant scope                : UYAP SERIALIZER-BYPASS-HARDENING-I01 ONLY
Second use                 : SECOND USE: FAIL-CLOSED
Production activation      : PROHIBITED
Cross-task reuse           : PROHIBITED
```

Owner ratification evidence is byte-exact and SHA-256 bound:

```text
OWNER TASK-BOUND AUTHORITY
SEMANTIC AUTHORITY + EXECUTION GRANT
GO-COMPLETE

OWNER:
Av. Ulaş Hüseyin Telli

PROGRAM:
UYAP-MODULE-FULL-GAP-CLOSURE-R02

CURRENT PHASE:
POST-STRUCTURED-EMISSION AUTHORITY HARDENING

EXACT TASK:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01

TITLE:
Canonical Resolution Provenance / Capability Enforcement

SEMANTIC AUTHORITY:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-SA01

EXECUTION GRANT:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01

KNOWN GOOD FLOOR:
2694d1e4bbc4173ee8dc328d97edb853d0d32b78

OWNER DECISION:
RATIFIED

EXECUTION:
GO-COMPLETE

GRANT:
ONE-SHOT / TASK-BOUND

GRANT EXPIRY:
TERMINAL CLOSEOUT
```

```text
ownerRatificationEvidence.excerptSha256 : 7f935ec61b02222e556a237f6cdadd700aa7f457dcdc0935778e89bfb0eae5b6
```

Validator Stage 1'de exact `M/M/M` control-plane tuple'ını; Stage 2'de yalnız
`decision-log.md` semantic authority satırı ile yeni task-local EG dosyasının
exact `M/A` tuple'ını doğrular. Owner evidence byte-exact/hash-bound, SA ve EG
distinct, grant one-shot/task-bound ve ikinci kullanım fail-closed'dır.

## UYAP official pipeline final-CI eligibility — exact authority publication binding

Bu kayıt yalnız `UYAP-FINAL-CI-ELIGIBILITY-I01` görevinin canonical UYAP
official pipeline predecessor'larını birlikte ve fiilen çalıştırarak teknik CI
qualification üretmesini tanır. Görev authority-integrity, default-OFF,
production-unreachable, no-bypass ve regression kanıtını bağlar; yeni hukuki
mapping, Strict DTD uygunluk iddiası, production wiring, runtime activation,
Canary, gerçek transport veya cutover üretmez.

```text
Program   : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Known good floor : f68c86d28be8eab8e980db758864c334245dabd0
Binding task : UYAP-FINAL-CI-ELIGIBILITY-I01-AUTHORITY-CONTROL-PLANE-BINDING-R01
Binding mode : UYAP_FINAL_CI_ELIGIBILITY_I01_AUTHORITY_CONTROL_PLANE_BINDING_R01
Base SHA     : 7e6c39591d96757aec1c2f799a04ec60e97e2c71
Head ref     : codex/uyap-final-ci-eligibility-i01-control-plane-binding-r01
Binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Materialization task : UYAP-FINAL-CI-ELIGIBILITY-I01-AUTHORITY-MATERIALIZATION-R01
Materialization mode : UYAP_FINAL_CI_ELIGIBILITY_I01_AUTHORITY_MATERIALIZATION_R01
Original captured base : 7e6c39591d96757aec1c2f799a04ec60e97e2c71
Head ref : codex/uyap-final-ci-eligibility-i01-authority-materialization-r01
Materialization scope:
  M project/docs/governance/decision-log.md
  A project/docs/governance/coordination-execution-grants/UYAP-FINAL-CI-ELIGIBILITY-I01-EG01.md

Semantic authority record : UYAP-FINAL-CI-ELIGIBILITY-I01-SA01
Execution grant record     : UYAP-FINAL-CI-ELIGIBILITY-I01-EG01
Grant scope                : UYAP FINAL-CI-ELIGIBILITY-I01 ONLY
Second use                 : SECOND USE: FAIL-CLOSED
Production activation      : PROHIBITED
Cross-task reuse           : PROHIBITED
```

Owner ratification evidence is byte-exact and SHA-256 bound:

```text
FULL OWNER EXECUTION AUTHORITY — GO-COMPLETE

OWNER:
Av. Ulaş Hüseyin Telli

CURRENT PROGRAM:
UYAP-MODULE-FULL-GAP-CLOSURE-R02

PROGRAM LOCK:
ACTIVE

PREDECESSOR:
UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01
CLOSED / CANONICAL / PASS

KNOWN-GOOD FLOOR:
f68c86d28be8eab8e980db758864c334245dabd0

NEXT TASK:
UYAP-FINAL-CI-ELIGIBILITY-I01

TITLE:
UYAP Official Pipeline Final CI Qualification and Technical Readiness Closure

AUTHORITY MODE:
FULL OWNER AUTHORITY
TASK-BOUND
SINGLE-EXECUTOR
FENCE-FIRST
GO-COMPLETE

OWNER DECISION:

Av. Ulaş Hüseyin Telli olarak,
UYAP-FINAL-CI-ELIGIBILITY-I01 görevinin fresh canonical main
üzerinden başlatılmasını; gerekli control-plane binding, SA01 ve EG01
kayıtlarının materialize edilmesini; UYAP official pipeline’ın tüm
canonical predecessor’larıyla birlikte kapsamlı CI, regresyon,
authority-integrity, default-OFF ve production-unreachable
doğrulamalarından geçirilmesini; görev kapsamındaki teknik test/CI
kusurlarının semantik sınırlar değiştirilmeden düzeltilmesini; required
CI tamamen PASS olduğunda PR, squash-merge, post-merge verification,
terminal closeout ve güvenli cleanup işlemlerinin kesintisiz biçimde
tamamlanmasını GO-COMPLETE yetkisiyle onaylıyorum.

Bu yetki yeni hukuki mapping, Strict DTD uygunluk iddiası, production
wiring, runtime activation, Canary, gerçek transport veya cutover
yetkisi vermez.
```

```text
ownerRatificationEvidence.excerptSha256 : d44e460f2673f4e806f5a1c2e5ef45246cea38e9ae7033c588ef659e8f70f5d1
```

Validator Stage 1'de exact `M/M/M` control-plane tuple'ını; Stage 2'de
yalnız `decision-log.md` semantic authority satırı ile yeni task-local EG
dosyasının exact `M/A` tuple'ını doğrular. Task teknik qualification ile
sınırlıdır; predecessor semantiğini yeniden açmaz ve activation/canary yetkisi
üretmez.

### UYAP serializer-bypass hardening terminal closeout — exact publication binding

Bu ek yalnız merge edilmiş serializer-bypass hardening implementation sonucunun
existing task-local execution-grant dosyasına append-only terminal receipt
olarak yazılmasını tanır. Yeni semantic authority, ikinci grant kullanımı,
production activation veya successor execution authority üretmez.

```text
Closeout binding task : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-TERMINAL-CLOSEOUT-CONTROL-PLANE-BINDING-R01
Closeout binding mode : UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_TERMINAL_CLOSEOUT_CONTROL_PLANE_BINDING_R01
Closeout binding base : 11ffb62994e95d7e6a051dbf609d5db74101a6b7
Closeout binding ref  : codex/uyap-official-serializer-bypass-hardening-i01-terminal-closeout-binding-r01
Closeout binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Closeout task : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01
Closeout mode : UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_TERMINAL_CLOSEOUT_R01
Original closeout base : 11ffb62994e95d7e6a051dbf609d5db74101a6b7
Closeout ref : codex/uyap-official-serializer-bypass-hardening-i01-terminal-closeout
Closeout scope:
  M project/docs/governance/coordination-execution-grants/UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01.md

Semantic authority record : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-SA01
Execution grant record     : UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-EG01
Implementation PR          : 2067
Implementation squash      : 11ffb62994e95d7e6a051dbf609d5db74101a6b7
Grant terminal state       : CONSUMED / CLOSED
Second use                 : FAIL-CLOSED
Production activation      : PROHIBITED
```

Validator closeout binding PR'ında exact `M/M/M` control-plane tuple'ını;
target closeout PR'ında yalnız existing EG dosyasının `M` durumunu, canonical
SA/EG referanslarını, implementation PR/SHA kanıtını, canonical resolver
capability enforcement'ını, caller-created/kopya resolution fail-closed
sonucunu, sıfır rejected XML/byte çıktısını, unchanged mapping/M01/RECEIVABLE
sınırlarını, `DEFAULT-OFF`, required CI ve `SECOND USE: FAIL-CLOSED` terminal
receipt alanlarını doğrular. `decision-log.md` closeout PR'ında değiştirilemez;
böylece mevcut semantic authority duplicate edilmez.

### UYAP-M01 terminal closeout — exact publication binding

Bu ek yalnız merge edilmiş UYAP-M01 implementation sonucunun existing task-local
execution-grant dosyasına append-only terminal receipt olarak yazılmasını tanır.
Yeni semantic authority, ikinci grant kullanımı, production activation veya
successor execution authority üretmez.

```text
Closeout binding task : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-TERMINAL-CLOSEOUT-CONTROL-PLANE-BINDING-R01
Closeout binding mode : UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_I01_TERMINAL_CLOSEOUT_CONTROL_PLANE_BINDING_R01
Closeout binding base : 5338a6214e21a52bd7e0fa4e82f85384952bd19d
Closeout binding ref  : codex/uyap-m01-terminal-closeout-binding-r01
Closeout binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Closeout task : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01
Closeout mode : UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_I01_TERMINAL_CLOSEOUT_R01
Original closeout base : 5338a6214e21a52bd7e0fa4e82f85384952bd19d
Closeout ref : codex/uyap-m01-terminal-closeout
Closeout scope:
  M project/docs/governance/coordination-execution-grants/UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01.md

Semantic authority record : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-SA01
Execution grant record     : UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01-EG01
Implementation PR          : 2033
Implementation squash      : 5338a6214e21a52bd7e0fa4e82f85384952bd19d
Grant terminal state       : CONSUMED / CLOSED
Second use                : FAIL-CLOSED
Production activation     : PROHIBITED
```

Validator closeout binding PR'ında exact `M/M/M` control-plane tuple'ını;
target closeout PR'ında yalnız existing EG dosyasının `M` durumunu, canonical
SA/EG referanslarını, implementation PR/SHA kanıtını, `DEFAULT-OFF`, sıfır
production call-site/reachability, required CI ve `SECOND USE: FAIL-CLOSED`
terminal receipt alanlarını doğrular. `decision-log.md` closeout PR'ında
değiştirilemez; böylece mevcut semantic authority duplicate edilmez.

### UYAP structured-emission terminal closeout — exact publication binding

Bu ek yalnız merge edilmiş UYAP structured-emission implementation sonucunun
existing task-local execution-grant dosyasına append-only terminal receipt
olarak yazılmasını tanır. Yeni semantic authority, ikinci grant kullanımı,
production activation veya successor execution authority üretmez.

```text
Closeout binding task : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-TERMINAL-CLOSEOUT-CONTROL-PLANE-BINDING-R01
Closeout binding mode : UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_TERMINAL_CLOSEOUT_CONTROL_PLANE_BINDING_R01
Closeout binding base : 7082d49a5f78deebc4983726683506abeb0a2ab2
Closeout binding ref  : codex/uyap-official-alacakkalemi-structured-emission-i01-terminal-closeout-binding-r01
Closeout binding scope:
  M project/scripts/governance-coordination.cjs
  M project/scripts/governance-coordination.test.cjs
  M project/docs/governance/governance-writer-coordination-contract.md

Closeout task : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01
Closeout mode : UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_TERMINAL_CLOSEOUT_R01
Original closeout base : 7082d49a5f78deebc4983726683506abeb0a2ab2
Closeout ref : codex/uyap-official-alacakkalemi-structured-emission-i01-terminal-closeout
Closeout scope:
  M project/docs/governance/coordination-execution-grants/UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01.md

Semantic authority record : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-SA01
Execution grant record     : UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01
Implementation PR          : 2048
Implementation squash      : 7082d49a5f78deebc4983726683506abeb0a2ab2
Grant terminal state       : CONSUMED / CLOSED
Second use                 : FAIL-CLOSED
Production activation      : PROHIBITED
```

Validator closeout binding PR'ında exact `M/M/M` control-plane tuple'ını;
target closeout PR'ında yalnız existing EG dosyasının `M` durumunu, canonical
SA/EG referanslarını, implementation PR/SHA kanıtını, M01 qualification,
RECEIVABLE-only Legal Basis ownership, no-fallback/faiz rejection,
`DEFAULT-OFF`, sıfır production call-site/reachability, strict-DTD non-claim,
required CI ve `SECOND USE: FAIL-CLOSED` terminal receipt alanlarını doğrular.
`decision-log.md` closeout PR'ında değiştirilemez; mevcut semantic authority
duplicate edilmez.

## ORCHESTRA EXECUTION MODEL REVISION R01 — reconciled checkpoint contract

Owner intent (ratified) is reconciled here without creating a global grant. Orkestra
is the execution coordinator under `AGENTS.md`; it is not an independent semantic or
merge authority. A semantic decision is the owner-ratified business/legal/security
tuple. If its tuple is unchanged, semantic re-ratification is not requested. A changed
tuple, new role or rule, schema/migration, production activation, irreversible action,
scope expansion or unique WIP reopens the semantic checkpoint.

### Eligibility, dispatch and authority

`ELIGIBLE` is a dependency/terminal-state result, not mutation authority. A
`DISPATCH_CANDIDATE` may be queued or evaluated read-only. Mutation requires two
distinct, task-specific, non-reusable canonical references:

```text
SEMANTIC_AUTHORITY + EXECUTION_GRANT
```

The execution grant must name this task; a grant for another task, a reusable grant,
or an absent grant is fail-closed. Merge additionally requires task/PR/head/scope and
required-check evidence bound to the exact merge authority. No standing, unattended or
repository-wide merge authority is inferred from eligibility.

### Semantic and mechanical checkpoints

Owner-gated semantic checkpoints cover new business/legal/security policy, migration,
production activation, irreversible operation, scope expansion and unique-WIP or
semantic ambiguity. Mechanical checkpoints (fresh base, branch/worktree, PR, CI
polling, mergeability, exact-scope verification, cleanup and deterministic successor
eligibility) may continue only under the exact existing task grant. `GO-ANALYZE` remains
read-only and may stop after analysis. `GO-COMPLETE` may continue through its exact
scope after analysis when no owner-gated condition is present.

### Stages and successors

Stage 1 (control-plane binding) and Stage 2 (authority materialization) remain separate
tasks, branches, PRs, merges and execution grants. Stage 2 cannot use Stage 1's grant.
An explicit canonical deterministic grant-activation contract could authorize a
mechanical transition; absent that contract, a separate Stage 2 grant is required.
Path, record, semantic tuple, writer or scope drift reopens the owner checkpoint.
A closed task may make a deterministic successor `ELIGIBLE`, but dispatch and mutation
still require that successor's own exact grant. Same-file competing writers stop
mutation; snapshot, comparison and proven terminal disposition remain read-only.

### Priority and terminal truth

Ordering is P0 security/tenant/data-integrity, P1 runtime/product blocker, product
activation, runtime certification, production certification, then non-blocking
governance cleanup. This order never overrides a program lock, legal dependency,
migration prohibition or single-writer fence. `MERGED` is not runtime completion:
post-merge acceptance, delivery evidence and the existing closeout gates remain binding.

## OFFICE F01 Stage 2 validator reconciliation — exact task-bound repair

This bounded control-plane repair removes the unconditional Stage 2 validator
rejection. It does not create a new business, legal, authorization, schema,
migration or production policy. The Stage 2 materialization tuple remains
separate from Stage 1 and is accepted only with the exact task-bound evidence
and four-path scope below.

```text
Repair task ID : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-STAGE2-VALIDATOR-RECONCILIATION-R01
Repair mode    : OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_STAGE2_VALIDATOR_RECONCILIATION_R01
Repair base    : 8f2426d6df5cd9e92d1511ad2588a8d0ffb7edd1
Repair head    : codex/office-f01-stage2-validator-reconciliation-r01
Repair follow-up head : codex/office-f01-validator-mapping-followup-r01
Repair scope   : M project/scripts/governance-coordination.cjs
                 M project/scripts/governance-coordination.test.cjs
                 M project/docs/governance/governance-writer-coordination-contract.md
Stage 1 merge  : de310fb16aa9681c15770e74e681ed24e64e553e
Owner          : Av. Ulaş Hüseyin Telli
Owner role     : Repository Owner / Semantic Authority
Owner decisions: 8/8 RATIFIED
Target task    : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-AUTHORITY-MATERIALIZATION-R01
Target mode    : OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_MATERIALIZATION_R01
Target head ref: codex/office-sc-f01-authority-materialization-r01
Owner evidence SHA-256 : 7b2ffeb93ae6b91a88eee84991852bf19b3682ebc587f9152442e04388de4302
```

Owner evidence excerpt (byte-exact UTF-8/LF, including the final LF):

```text
Av. Ulaş Hüseyin Telli olarak,
OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-
AUTHORITY-MATERIALIZATION-R01 görevinin;

yalnız exact M/A/A/A dört-path Stage 2 tuple’ı üzerinde,
ayrı task-bound ve non-reusable GO-COMPLETE — STAGE 2 ONLY
execution authority ile yürütülmesini;

Stage 1 grant’inin yeniden kullanılmamasını;
OFFICE implementation, schema/migration ve production activation
yapılmamasını;

required CI PASS ve mergeability hâlinde squash-merge, canonical
doğrulama ve güvenli cleanup’a kadar tamamlanmasını onaylıyorum.
```

The repair requires the exact program, task and branch; the owner-pinned repair
base or a verified descendant of that base on fresh canonical main; Stage 1 merge
ancestry; unchanged protected Stage 1 binding literals; exact M/A/A/A target
tuple; exact SA01/EG01 identifiers and distinct locators; owner identity and
8/8 evidence; first materialization on a base without prior F01 SA/EG records;
single-use Stage 2 authority; and no product, schema or migration expansion.
Generic governance diffs, wrong status/path/task/owner/evidence, duplicate
records and second materialization remain fail-closed.
