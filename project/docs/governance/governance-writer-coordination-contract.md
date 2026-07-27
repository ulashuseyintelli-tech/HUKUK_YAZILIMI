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
