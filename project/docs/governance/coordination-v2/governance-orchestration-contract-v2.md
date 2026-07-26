# Governance Orchestration Contract V2

```text
Belge yolu : project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md
Contract ID: GOV-COORD-V2
Durum      : RATIFIED WITH LIMITATION — 2026-07-26
             BOUNDED_CODE_TASK       : RATIFIED FOR USE
             MECHANICAL_GOVERNANCE   : NON-ELIGIBLE / KULLANILAMAZ (§1.2)
             AUTO-MERGE              : OFF · MANUAL OWNER MERGE REQUIRED
Rol        : Bounded code task işlerinin tek orchestrator üzerinden, immutable
             authorization altında, fail-closed sınırlarla yürütülmesi için
             execution contract'ı.
Üst norm   : AGENTS.md · SYSTEM-CONSTITUTION.md · GOV-COORD-V1 contract
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir task, grant, migration,
runtime veya merge yetkisi ÜRETMEZ. Ratifikasyon, contract'ın yürürlüğe
girmesidir; tek tek task'lar ayrıca ratifiye plan + execution grant ister.
```

## 0.0 Ratifikasyon kaydı

```text
RATIFIED           : 2026-07-26
KAPSAM             : BOUNDED_CODE_TASK profili
KAPSAM DIŞI        : MECHANICAL_GOVERNANCE profili — NON-ELIGIBLE (§1.2)
AUTO-MERGE         : OFF
MANUAL OWNER MERGE : REQUIRED
KAYDEDEN           : agent, owner GO-COMPLETE altında
                     (T5-LIVE-PILOT-OWNER-DECISIONS-AND-PLAN-AUTHORING-R01)
RATİFİKASYON KANITI: owner'ın ilgili brief'i — bu commit DEĞİLDİR
```

`MECHANICAL_GOVERNANCE` açığı bu ratifikasyonla **kapatılmamış**, açıkça
`NON-ELIGIBLE` işaretlenerek dondurulmuştur. Düzeltmesi ayrı bir contract
follow-up candidate'ıdır ve bu turda uygulanmamıştır. Governance kaydı yazımı
gerektiğinde yürürlükteki **V1 mekanizması** kullanılır.

`decision-log.md` owner-WIP (`grandfatheredOwnerWipExactPaths`) olduğundan
otoritatif ratifikasyon girdisi agent tarafından yazılamaz; owner tarafından
ayrıca kaydedilmesi gerekir.

## 0. V1 ile ilişki

`governance-writer-coordination-contract.md` (GOV-COORD-V1) yürürlüktedir ve bu
belge onu **supersede ETMEZ**. V1 §3 capability matrix'indeki hiçbir `DENIED`
satırı bu belgeyle `ALLOWED` yapılmaz. V2, V1'in güvenlik çekirdeğini korur ve
üzerine ikinci bir execution profile ekler.

V2 2026-07-26'da `BOUNDED_CODE_TASK` profiliyle sınırlı olarak ratifiye
edilmiştir (§0.0). Governance yazımı için V1 tek yürürlükteki mekanizmadır ve
öyle kalır — V2'nin mechanical profili `NON-ELIGIBLE`'dır (§1.2).

## 1. Profile policy ayrımı

Ortak validator çekirdeği (her iki profil paylaşır):

```text
path normalization · diff extraction · deny evaluation
· invariant enforcement · result generation
```

| Profil | Policy | Validation | Kullanılabilirlik |
|---|---|---|---|
| `MECHANICAL_GOVERNANCE` | exact declared target allowlist | expected exact content/hash | **KULLANILAMAZ — §1.2** |
| `BOUNDED_CODE_TASK` | task-specific **positive** allowed roots | actual diff boundary + invariant/test | kullanılabilir |

**KURAL:** Global denylist dışında kalan hiçbir yol kendiliğinden izinli
sayılmaz. `BOUNDED_CODE_TASK`, V1 `deniedTargetPrefixes` listesinin inverse'i
**DEĞİLDİR**. Boş allowlist = hiçbir yol.

Immutable global forbidden (task-bazlı override **EDİLEMEZ**), kaynak
`governance-writer-coordination-protected-paths.json`:

- `canonicalSemanticGovernance[*]`
- `coordinationControlPlane[*]`
- `grandfatheredOwnerWipPrefixes[*]` · `grandfatheredOwnerWipExactPaths[*]`
- `project/apps/api/prisma/` · `project/ops/` · `project/node_modules/`
- `project/prisma/` · `project/deploy/` — DEFENSIVE, ağaçta karşılığı YOK (§1.1)

Gerekçe: bu yollar `PRODUCTION_SCHEMA_MIGRATION_RUNTIME`'dır ve V1 §3'te
`DENIED`'dır. V2 bunu gevşetmez; ayrı owner gate gerektirir.

### 1.1 `project/apps/api/prisma/` neden ayrıca sayılır

V1 `deniedTargetPrefixes` altı giriş taşır; bunlardan `project/apps/` tüm
uygulama yüzeyini, dolayısıyla `project/apps/api/prisma/`'yı da kapsar.
`BOUNDED_CODE_TASK` profili tanım gereği `project/apps/` altında çalışmak
zorundadır, bu yüzden V2 `project/apps/` ve `project/packages/` prefix'lerini
immutable listeden çıkarır. İlk yazımda bu çıkarma yapılırken schema/migration
**alt-yüzeyi oyulmamıştı**, dolayısıyla `PRODUCTION_SCHEMA_MIGRATION_RUNTIME:
DENIED` hükmü onu uygulaması gereken liste tarafından uygulanmıyordu:
`allowedRoots: ['project/apps/api/']` olan bir task
`project/apps/api/prisma/migrations/` altına production migration ekleyebilir ve
§15.2'nin mekanik kontrolü (`boundary ∩ immutable global forbidden = ∅`) buna
PASS verirdi. Ağaçtaki tek schema/migration yüzeyi `project/apps/api/prisma/`
olduğu için (104 tracked dosya: `schema.prisma` + tüm migration'lar) burada
açıkça sayılır. Deny modeli gevşetilmez; gerçek yüzeye bağlanır.

`project/apps/api/src/prisma/` KAPSAM DIŞIDIR — NestJS `PrismaModule`/
`PrismaService` kodudur, schema/migration yüzeyi değildir; onu da kapatmak
`BOUNDED_CODE_TASK`'i gereksiz daraltırdı.

`project/prisma/` ve `project/deploy/` V1'den devralınmıştır ve ağaçta
**yoktur**. Listede DEFENSIVE olarak kalırlar: maliyeti sıfırdır ve ileride bir
üst-düzey `project/prisma/` açılırsa kendiliğinden kapsar. Ancak tek başlarına
`PRODUCTION_SCHEMA_MIGRATION_RUNTIME` kapsamını KARŞILAMAZLAR; o kapsamı
karşılayan giriş `project/apps/api/prisma/`'dır.

### 1.2 `MECHANICAL_GOVERNANCE` profilinin ulaşılabilir hedef yüzeyi YOKTUR

**CANONICAL GAP — OWNER TRIAGE REQUIRED. Bu profil bu contract altında
kullanılamaz.**

Profil §1 tablosunda ilan edilmiştir ve bu belgede **başka hiçbir yerde
geçmez**. Hedef yüzeyi ise şu üç hükmün kesişiminde boş kalır:

```text
profil policy'si : "exact declared target allowlist" — kanonik governance
                   belgeleri üzerinde exact-content/hash yazımı
§1 forbidden     : canonicalSemanticGovernance[*] immutable global forbidden
                   = project/docs/governance/** · adr/** · blueprint/**
                   · design/** · runbooks/** · AGENTS.md · CLAUDE.md
§1 override      : "task-bazlı override EDİLEMEZ"
§15.2 mekanik    : boundary ∩ immutable global forbidden = ∅
```

Yani `decision-log.md`, `active-roadmap.md`, `product-backlog.md`, risk
register'lar, ADR'ler — mekanik governance yazımının bütün gerçek hedefleri —
istisnasız forbidden'dır ve override yolu yoktur. Profil ilan edilmiş, ama
tanımı gereği yapması gereken işi yapamaz.

V1 bu iş için zaten ratifiye edilmiş bir mekanizma taşır ve bu contract ona
**hiç atıf yapmaz** (`level2Operations` ve `queueExceptions` bu belgede sıfır
kez geçer):

```text
V1 level2Operations   EXACT_APPEND_AT_DECLARED_ANCHOR · EXACT_LITERAL_REPLACEMENT
                      EXACT_REFERENCE_REWRITE · DETERMINISTIC_REGISTER_REGENERATION
V1 queueExceptions    coordination-requests/<requestId>/request.md
                      coordination-results/<requestId>/result.md
```

Boşluğun kapatılması bir **owner kararıdır** ve bu düzeltme turunda
yapılmamıştır: profile bir yüzey vermek, §1'in "override EDİLEMEZ" hükmüne bir
istisna sınıfı eklemek anlamına gelir — bu policy'dir, mekanik düzeltme
değildir. Kanonik olarak tutarlı tek aday, V1'in yukarıdaki ratifiye
mekanizmasını V2'ye taşımaktır; başka her şekil yeni authority modeli üretir ve
§15'in "yeni authority modeli ÜRETMEZ" hükmünü ihlal eder.

**T5 ile ilişkisi YOKTUR.** `LIVE_TWO_PROGRAM` pilotu iki canlı
`BOUNDED_CODE_TASK` ister; pilot yuvası governance işiyle doldurulmaz, aksi
hâlde pilotun kanıt değeri düşer. Bu açık T5'i bloke etmez ve T5 bu açığın
kapanmasını beklemez.

**Aciliyeti ratifikasyondandır:** governance kaydı yazılması gerekiyorsa
yürürlükteki V1 mekanizması zaten kullanılabilir, dolayısıyla acil bir
operasyonel boşluk yoktur. Ancak bu boşluk kapanmadan V2 ratifiye edilirse ölü
bir profil sabitlenir ve sonraki düzeltme amendment olur. Bu nedenle
ratifikasyonun ön koşuludur, T5'in değil.

## 2. Immutable authorization

Her authorize edilen task şu immutable kimlikle pinlenir:

```text
taskId · taskSpecVersion · taskSpecSha256 · declaredIntentSha256
· boundaryPolicySha256 · requiredTestsSha256 · predecessorTaskIds[]
```

Alternatif olarak bütün plan pinlenir:

```text
executionPlanRef · executionPlanCommitSha · executionPlanContentSha256
```

Grant alanları:

```text
grantId · workstream · expiresAt · revocationPath
· semanticAuthorityRef · executionGrantRef · ownerRatificationEvidence
· baseDriftPolicy (§13)
```

- Hash mismatch = fail-closed.
- Grant sonradan değiştirilen veya aynı `taskId` ile yeniden tanımlanan spec'i
  **authorize ETMEZ**.
- Orchestrator grant veya authorization **ÜRETEMEZ**; yalnız canonical evidence
  ve hash eşleşmesini doğrular.
- `semanticAuthorityRef` ≠ `executionGrantRef` (V1 §2; `SYS-DEC-003`).

## 3. Task lifecycle

| State | Prereq | Writer | Evidence | Retry | Terminal |
|---|---|---|---|---|---|
| `DECLARED` | task spec var | task author | spec + sha | — | H |
| `AUTHORIZED` | grant hash eşleşti | OWNER only | grant kaydı | — | H |
| `ELIGIBLE` | predecessor `CLOSED`, boundary conflict yok | orchestrator | eligibility kaydı | — | H |
| `CLAIMED` | lease CAS başarılı | orchestrator | lease record | — | H |
| `WORKTREE_READY` | base pin (§13) | orchestrator | worktree + baseSha | E | H |
| `EXECUTOR_RUNNING` | resolve + smoke OK | orchestrator | attempt manifest | E | H |
| `VALIDATING` | executor exit | orchestrator | exit + diff + test | E | H |
| `PR_OPEN` | boundary + test PASS | orchestrator | PR no + head SHA | — | H |
| `CI_PENDING` | PR açık | orchestrator | check run id'leri | — | H |
| `MERGE_READY` | §5 konjonksiyonu TAM | orchestrator | attestation (§5) | — | H |
| `MERGED` | task-specific owner-authorized merge (manual veya ex-ante `IF GO-COMPLETE`) | OWNER-authorized executor | merge SHA | — | H |
| `CLOSED` | result yayımlandı | orchestrator | result record | — | E |
| `BLOCKED` | herhangi bir gate fail | orchestrator | blocker enum | — | H |
| `CANCELLED` | owner iptali / timeout | owner / orchestrator | reason | — | E |

`E` = yeni `taskAttemptId` ile tekrarlanabilir. `PR_OPEN` ve sonrası otomatik
retry **EDİLMEZ**. `BLOCKED` terminal değildir; owner aksiyonuyla `ELIGIBLE`'a
döner.

### 3.1 Lease doğrulama zamanlaması

```text
DECLARED → AUTHORIZED → ELIGIBLE : authorization/eligibility evidence
                                   doğrulanır; LEASE ARANMAZ (henüz yoktur)
CLAIMED → CLOSED/CANCELLED       : her mutation ÖNCESİ leaseEpoch +
                                   holderToken doğrulanır
```

### 3.2 Lease lifetime

Lease `CLAIMED`'de edinilir ve şunlardan biri tamamlanana dek **korunur**:

- `CLOSED`
- `CANCELLED` cleanup tamamlandı
- terminal `BLOCKED` disposition yayımlandı
- owner explicit release

`MERGE_READY` lease'i **otomatik serbest bırakmaz**. Task-specific merge
authority yoksa veya merge gate'leri henüz tamamlanmadıysa orchestrator
heartbeat/renewal **sürdürür**. Ex-ante `IF GO-COMPLETE` authority ve bütün
gate'ler mevcutsa ikinci owner mesajı beklenmez.

`CANCELLED`'e ancak şunların tamamı sağlanmışsa girilir: executor process tree
sonlandırıldı · state/result yayımlandı · geçici kaynaklar disposition edildi ·
lease `RELEASED` tombstone'una geçirildi.

## 4. Successor contract

```text
DECLARED_SUCCESSOR           → grant'te pinlenmiş; predecessor CLOSED olunca
                               EK OWNER PROMPT'U OLMADAN ELIGIBLE
DISCOVERED_FOLLOW_UP         → kaydedilir, ELIGIBLE OLMAZ
OWNER_AUTHORIZATION_REQUIRED → kuyruğa girmez
NO_SUCCESSOR                 → zincir biter
```

Executor tarafından keşfedilen iş implementation yetkisi **kazanmaz**.

## 5. MERGE_READY attestation

`MERGE_READY` kalıcı statü **değil**; revocable ve SHA-bound bir
attestation'dır.

Alanlar:

```text
taskId · taskAttemptId · taskSpecSha256 · grantId · grantSha256
· leaseEpoch · holderToken · prNumber · prHeadSha · targetBranch
· targetBranchObservedSha · mergeBaseSha · requiredCiResultSetSha256
· createdAt · expiresAt
```

Üretim konjonksiyonu — **hepsi TRUE olmalıdır**:

```text
executorExitSuccess · currentLeaseEpochConfirmed · holderTokenConfirmed
· taskSpecHashMatchesGrant · actualDiffWithinBoundary
· immutableForbiddenPathsUntouched · requiredInvariantsPass · requiredTestsPass
· requiredCiChecksPass · prOpen · prMergeable · noBlockingReview
· noCompetingWriter · baseDriftPolicySatisfied · worktreeStateValid
```

Şunlardan biri değişirse attestation **anında geçersiz** olur: PR head SHA ·
target branch SHA · merge base · CI check sonucu · blocking review ·
mergeability · `leaseEpoch`/`holderToken` · grant expiry/revocation · task spec
hash.

Task-specific owner-authorized merge işleminden (manual action veya ex-ante
`IF GO-COMPLETE`) **hemen önce** orchestrator fresh revalidation çalıştırır.
Fresh attestation olmadan gerçekleşen harici merge `CLOSED` sayılamaz:

```text
UNVERIFIED_EXTERNAL_MERGE_OWNER_REVIEW_REQUIRED
```

**STANDING / UNATTENDED AUTO-MERGE HER DURUMDA YASAKTIR.** GitHub auto-merge,
scheduler merge'i veya task-specific owner authority olmadan merge yapılamaz.
Owner'ın exact task başında verdiği `GO-COMPLETE` + `IF GO-COMPLETE` authority
altında, bu bölümdeki bütün gate'ler PASS ise aynı task içindeki conditional
merge standing auto-merge sayılmaz ve ikinci owner mesajı gerektirmez.

### 5.1 Effective required CI set

```text
effectiveRequiredCiChecks =
    immutable task-spec required checks
  ∪ current platform/branch-protection required checks
  ∪ current governance-required checks
```

Üç kümenin **tamamı** PASS olmadan `MERGE_READY` üretilemez. Küme runtime'da
sorgulanır; hiçbir check adı bu contract'a sabitlenmez.

## 6. Lease authority — V2 minimum

**Kapsam:** single host · single canonical repository · shared Git common
directory. Ayrı clone veya multi-host execution V2 minimum kapsamında
**değildir** (ayrı storage/consensus kararı gerektirir).

```text
Authoritative store : `git rev-parse --git-common-dir` altındaki dedicated ref
Namespace           : refs/governance-coordination/leases/<task-id>
Mutation            : git update-ref <ref> <newObject> <expectedOldObject>
```

- İzole worktree'ler aynı common Git directory'yi **paylaşmalıdır** (entry
  gate'te doğrulanır).
- Lease record canonical JSON (§12) olarak Git object database'e yazılır.
- `expectedOldObject` mismatch → `CLAIM_CONFLICT` / `FENCING_FAILURE`,
  fail-closed.
- Release'te ref **silinmez**; `RELEASED` tombstone record'a CAS ile ilerletilir.
- `leaseEpoch` **hiçbir zaman sıfırlanmaz**. Yeni claim = önceki `leaseEpoch` + 1.
- Ref silme veya epoch reset: **yasak**.

Lease record:

```text
leaseId · taskId · taskAttemptId · leaseEpoch · holder · holderToken
· acquiredAt · heartbeatAt · expiresAt · previousStateHash
```

Semantik ayrımı:

```text
leaseId       : mantıksal claim kimliği
leaseEpoch    : monoton fencing generation
holderToken   : process-instance kimliği
taskAttemptId : retry kimliği
```

`leaseEpoch` + `holderToken` şunların **her birinde** yeniden doğrulanır: state
yazımı · worktree oluşturma · executor spawn · PR creation · result publication
· merge-ready evaluation · merge-time revalidation.

Eşzamanlı executor üst sınırı: **2**. Bu bir scheduler parametresidir, mimari
kısıt değildir; değiştirilmesi kota ve lease topolojisi değerlendirmesi ister.

## 7. Executor resolution ve process contract

### 7.1 Resolution order (normatif)

```text
1. explicit machine-local configured path
2. current process PATH resolution
3. known installation fallback
4. identity/version verification
5. headless smoke verification
```

- Resolved absolute path task attempt başlangıcında **pinlenir**.
- Version bu contract'a sabitlenmez; runtime evidence olarak manifeste yazılır.
- PATH'in task başladıktan sonra değişmesi devam eden attempt'i **etkilemez**.
- Resolution/smoke failure → executor state `UNAVAILABLE`.
- Failure "executor kurulu değil" **demek değildir**; "bu process
  environment'ından çözülemedi" olabilir — adım 3 bu yüzden **zorunludur**.

Attempt manifest: `resolvedAbsolutePath` · `version` · `smokeExitCode` ·
`smokeResult` · `resolutionSource`.

### 7.2 Spawn

```text
UseShellExecute = false · shell interpolation YASAK
· arguments ayrı argv elemanları · prompt tek exact argument veya güvenli
  stdin payload · workingDirectory = isolated worktree root (pinned)
```

### 7.3 Environment

Parent environment **bütünüyle miras alınmaz**; deterministik inşa edilir.

Minimum OS allowlist:

```text
SystemRoot · ComSpec · TEMP · TMP · USERPROFILE · HOME
· PATH · PATHEXT · LOCALAPPDATA · APPDATA
```

Child `PATH`'i, daemon başlangıç PATH'i ile machine-local configured path'ler
birleştirilerek deterministik oluşturulur. Executor-specific credential/config
ayrı allowlist ile eklenir. Task prompt'u environment variable içine
**yazılmaz**. Gereksiz secret/token child process'e **geçirilmez**.

### 7.4 Output

`stdout` ve `stderr` **ayrı** stream edilir · byte/size limitleri tanımlanır ·
tam log ile redacted report ayrılır · structured result schema doğrulanmadan
success **kabul edilmez**.

### 7.5 Cancellation

Önce graceful cancellation denenir; grace period sonunda **entire process tree**
zorla sonlandırılır. Orphan child process bırakılması **validation failure**'dır.
`timeout`, owner cancellation ve lease epoch loss **aynı** cancellation
primitive'ini kullanır.

### 7.6 Lease loss

Yeni state/result/PR mutation **anında** yasaklanır · çalışan executor process
tree **derhal** sonlandırılır · stale attempt sonucu **publish edilemez**.

## 8. Diff security

Doğrulanacak change class'ları:

```text
ADD · MODIFY · DELETE · RENAME · COPY · TYPE_CHANGE · SYMLINK
· GITLINK · BINARY · MODE_CHANGE · UNTRACKED
```

Kanonik kaynak (yalnız filesystem glob **yetersizdir**):

```text
git diff --name-status -z
git diff --raw -z
git ls-files --stage
```

Fail-closed ele alınacak vakalar: case-only path değişikliği · Windows path
normalization · `..` / separator anomalisi · symlink escape ·
submodule/gitlink · allowed→forbidden rename · forbidden→allowed rename ·
lockfile / generated artifact · executable-bit değişikliği · staged/unstaged
farkı · untracked dosyalar.

## 9. Program identity manifest

Alanlar: `programId` · `canonicalName` · `governanceSourceFiles[]` ·
`taxonomyLevel` · `activeStatus` · `authorizationState` ·
`authorizationEvidence`.

```text
authorizationState ∈ { AUTHORIZED · OWNER_GATED · NOT_AUTHORIZED
                     · BLOCKED · UNKNOWN_REQUIRES_OWNER_REVIEW }
```

Belirsizlik contract görevini **durdurmaz**; yalnız o program için live
execution eligibility fail-closed `DENIED` olur.

`authorizationEvidence` zorunlu alanları — satır numarası tek başına
**yetersizdir**, dosya ilerleyince sessizce eskir:

```text
sourcePath · sourceCommitSha · startLine · endLine · exactExcerpt · excerptSha256
```

Program **içeriği** JSON'a dönüştürülmez; task listesi çıkarılmaz.

## 10. Pilot contract'ları

### `SYNTHETIC_DUAL_EXECUTOR` (T4 kapanış kapısı)

Production root mutation **yasak** · disposable fixture roots **zorunlu** · iki
ayrı executor.

Zorunlu senaryolar:

```text
normal parallel success · duplicate task claim · shared-path conflict
· boundary escape · executor timeout · owner cancellation · stale lease epoch
· process-tree termination · stale result suppression · CI failure
· PR head drift · target branch drift · revoked grant
· expired MERGE_READY attestation · declared successor eligibility
· discovered follow-up rejection
```

### `LIVE_TWO_PROGRAM` (T5)

İki farklı program · iki immutable grant · conflict-free positive boundary ·
forbidden shared path yok · required CI mevcut · task-specific owner-authorized
merge (manual veya ex-ante `IF GO-COMPLETE`).

Uygun görev yoksa disposition:

```text
SYSTEM_READY / LIVE_PILOT_BLOCKED_NO_AUTHORIZED_TASKS
```

Bu bir program başarısızlığı **değildir** ve yetkisiz iş üretmek için gerekçe
**oluşturmaz**.

## 11. Machine-readable schemas

```text
project/docs/governance/coordination-v2/schemas/task.schema.json
project/docs/governance/coordination-v2/schemas/grant.schema.json
project/docs/governance/coordination-v2/schemas/executor.schema.json
project/docs/governance/coordination-v2/schemas/lease.schema.json
project/docs/governance/coordination-v2/schemas/program.schema.json
project/docs/governance/coordination-v2/schemas/result.schema.json
project/docs/governance/coordination-v2/programs.manifest.json
project/docs/governance/coordination-v2/environment-evidence.md
```

Zorunlu: `additionalProperties: false` · enum'lar · path format sınırları ·
profile-dependent conditional validation.

Hash alanı formatı:

```json
{ "type": "string", "pattern": "^[0-9a-f]{64}$" }
```

Bu belgeyle **schema** üretilir; **instance** üretilmez.

## 12. Hash canonicalization

JSON tabanlı spec/contract hash'leri:

```text
RFC 8785 JSON Canonicalization Scheme · UTF-8 · BOM yok
· canonical JSON byte sequence üzerinde SHA-256
· lowercase 64-character hexadecimal output
```

Path listeleri hash **öncesinde**: Git canonical forward-slash formatına
çevrilir · duplicate girdiler reddedilir · lexicographical sıralanır · relative
olmayan değerler reddedilir.

`requiredTests` ordered **argv-object** listesi olarak canonicalize edilir;
shell command string **hashlenmez**.

Textual evidence hash'i: UTF-8 · BOM yok · LF line ending · Unicode NFC
normalization.

## 13. Base drift policy

Task spec zorunlu olarak birini taşır:

| Policy | Davranış |
|---|---|
| `STRICT_PINNED_BASE` **(varsayılan)** | Executor yalnız grant'te pinlenen `baseSha` üzerinde çalışır. `origin/main` ilerlerse → `BLOCKED_BASE_SHA_DRIFT`. Yeni base için **yeni** immutable task spec/grant gerekir. |
| `REBASE_AND_REVALIDATE` | Rebase yalnız task spec açıkça izin veriyorsa. Rebase sonrası actual diff yeniden çıkarılır; boundary + invariant + test tamamen yeniden koşar; PR head SHA ve attestation **yeniden üretilir**. |
| `REFRESH_BEFORE_EXECUTION` | Claim öncesi `origin/main` fresh SHA attempt base'i olarak pinlenir. Executor başladıktan **sonra** base kendiliğinden değiştirilemez. |

## 14. Normative / evidence ayrımı

```text
NORMATIVE CONTRACT (bu belge):
  required CI union NASIL belirlenir · executable NASIL resolve edilir
  · version NASIL doğrulanır · base drift NASIL yönetilir

ENVIRONMENT EVIDENCE APPENDIX (environment-evidence.md, timestamped):
  gözlenen executable path/version/smoke sonucu · gözlenen current required
  checks · gözlenen current main SHA/drift · gözlenen common-dir topolojisi
```

Hiçbir gözlenen değer normatif gövdede **hüküm** olarak yer almaz.

## 15. Task plan authoring

### 15.1 Lane ayrımı

Bu bölüm yeni bir authority modeli **üretmez**; mevcut ratifiye kuralı uygular —
`process-rules.md` § Lane Ownership (kaynak: `COL/OD-18A`), "Analysis Owner ≠
Implementation Owner":

```text
PLANNER LANE  : task plan DRAFT'ı üretir · GO-ANALYZE · SIFIR execution authority
EXECUTOR LANE : ratifiye planı yürütür
```

Aynı workstream'de planner ve executor **aynı ajan olamaz**. Draft, V1'deki
`request.md` ile aynı statüdedir: immutable untrusted input, **authority
değildir**.

### 15.2 Akış

```text
Workstream
  → PLANNING RUN (GO-ANALYZE; planner = workstream domain'ini bilen oturum)
      çıktı: coordination-v2/task-plans/<workstreamId>/plan.draft.json
      her task : taskId · declaredIntent (tek cümle, insan-okunur)
                 · boundaryPolicy (positive allowed roots)
                 · requiredTests (argv-object listesi, §12)
                 · predecessorTaskIds[] · baseDriftPolicy (§13)
      plan     : outOfScope[] ZORUNLU
  → ADVERSARIAL BOUNDARY REVIEW (İKİNCİ ajan, GO-ANALYZE)
      tek soru : "bu boundary, declaredIntent'in gerektirdiğinden
                  FAZLASINA izin veriyor mu?"
      mekanik  : boundary ∩ immutable global forbidden (§1) = ∅
  → OWNER REVIEW                      ← gerçek semantik karar burada
  → RATIFICATION: plan dondurulur
      plan.v<N>.json · executionPlanContentSha256 (§12)
  → STANDING GRANT (coordination-execution-grants/<grantId>.md)
      grant planı HASH ile referanslar; task ADIYLA referanslamaz
  → ORCHESTRATOR: yalnız hash'i eşleşen spec'i yürütür
  → MERGE_READY → OWNER-AUTHORIZED MERGE
```

### 15.3 Reviewability kısıtları

Owner review'in biçimsel bir onaydan ibaret kalmaması için:

- Bir plan = **bir** workstream. Program-seviyesi plan yasaktır.
- `declaredIntent` tek cümle ve insan-okunur olmak zorundadır.
- `boundaryPolicy` **minimal** olmalıdır: `declaredIntent`'i gerçekleştirmek
  için gereken en dar positive root kümesi.
- `outOfScope[]` boş bırakılamaz.
- Plan uzunluğu owner review'i fiilen mümkün kılacak sınırda tutulur; aşılırsa
  workstream **bölünür**.

### 15.4 Amendment / drift

Yürütme sırasında bir task spec'inin yanlış olduğu anlaşılırsa:

- O task `BLOCKED` olur (§3).
- Plan değişikliği = **yeni** plan versiyonu + **yeni** hash + yeni/amended grant.
- Eski grant yeni spec'i **authorize etmez** (§2).

`DISCOVERED_FOLLOW_UP` planı **genişletmez** (§4). Grant `revocationPath` owner
tarafından her an kullanılabilir.

### 15.5 Planner'ın üretemeyeceği şeyler

- Kendi planı için execution grant
- `semanticAuthorityRef` (owner/domain kararı)
- Active Roadmap dışında task (`active-roadmap.md`: "Active Roadmap dışında
  implementasyon başlamaz")
- Boundary'si immutable global forbidden'a değen task

## 16. Program yapısı ve kapanış kapıları

```text
T1  Execution contract + schemas          ← bu belge
T2  Safety kernel (lease CAS · diff validator · worktree isolation)
T3  Executor adapter katmanı
T4  Orchestration + synthetic dual-executor pilot
T5  Live two-program pilot
```

`T2` ve `T3`, `T1` kapandıktan sonra ayrık scope'larla **paralel**
yürütülebilir. `T4`, `T2` ve `T3` kapanmadan başlayamaz. `T5`, `T4` kapanmadan
ve iki uygun immutable execution grant bulunmadan başlayamaz.

---

**IMPLEMENTATION AUTHORITY: NONE.** Bu belge PROPOSED statüsündedir; owner
ratifikasyonu olmadan hiçbir orchestrator, executor, task, grant veya merge
yetkisi üretmez.
