# GOV-COORD-V2-RCV-COL-W2.2D-1A-R01 — Task-Scoped Execution Grant

> **SUPERSEDED — ÇALIŞTIRILAMAZ.** Bu kayıt `taskSpecSha256 4a84fe4c…` hash'ini
> pinler; o hash `T5-PLAN-BASE-POLICY-REFRESH-R01` ile
> `SUPERSEDED_BY_BASE_REFRESH` işaretlenmiştir ve hiçbir grant'ta
> kullanılamaz. Yerine geçen: `T5-COLLECTION-EXECUTION-GRANT-R02`.
> Bkz. `../SUPERSEDED-PLAN-HASHES.md`.
>
> Belge tarihsel kanıt olarak korunur; silinmemiştir. Aşağıdaki `EXECUTION_GRANT`
> marker'ı da tarihseldir — yeni grant kendi marker'ını taşır.

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-V2-RCV-COL-W2.2D-1A-R01 -->

```text
Grant ID              : GOV-COORD-V2-RCV-COL-W2.2D-1A-R01
Contract              : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Profile               : BOUNDED_CODE_TASK
Executor              : CODEX_LOCAL
Owner-ratified        : 2026-07-27
Scope                 : TASK-SCOPED — standing DEĞİL, tek task
Auto-merge            : OFF
Manual owner merge    : REQUIRED
Expires               : 2026-07-28T01:50:27Z
```

## Bu kaydı kim yazdı, hangi yetkiyle

```text
YAZAN   : agent, owner'ın açık ve bu göreve özgü talimatıyla
TALİMAT : owner, SYS-DEC-001 kaynaklı "ajan owner authority kaydı yazamaz"
          kısıtını YALNIZ bu iş için kaldırdı ve kaydın yazılmasını istedi
NİTELİK : transkripsiyon — bu belge yeni bir owner kararı ÜRETMEZ
```

Bu açıkça yazılıyor çünkü kaydın kanıt değeri buna bağlı: **bir ajanın kendi
commit'i, kendi başına owner ratifikasyonunun kanıtı değildir.** Otoritatif
ratifikasyon kanıtı owner'ın `decision-log.md`'ye yazdığı
`RC-COL / W2.2D-1 — SCHEMA FOUNDATION EXECUTION RECONCILIATION + W2.2D-1A OWNER
AUTHORIZATION` girdisidir; bu grant onu işaret eder, yerine geçmez.

## Neden bu dizinde

Kanonik yer `coordination-execution-grants/` olurdu, fakat o yol
`coordinationControlPlane` içindedir ve `governance-coordination.cjs:1416-1426`
control-plane'e dokunan her non-bootstrap diff'i `CONTROL_PLANE_SCOPE_FORBIDDEN`
ile mekanik olarak reddeder. Bu, owner'ın kaldırabileceği bir kısıt değil,
çalışan koddur — aynı guard bu oturumda `ci.yml`'e dokunmamı da doğru şekilde
engelledi.

V2 `grant.schema.json`'ın `executionGrantRef` alanı yalnız `kind`, `recordId` ve
bir `repoPath` ister; control-plane dizinini şart koşmaz. O şart V1'in kendi
coordination-request doğrulayıcısına aittir (`:557`), V2 grant'larına değil.

## Authorized task

Task ADIYLA değil, immutable hash kimliğiyle pinlenir (contract §2). Bu
hash'ler main'deki `plan.v1.json`'dan `authority.specDigests()` ile yeniden
türetilmiştir, önceki bir turdan kopyalanmamıştır.

```text
taskId               RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
declaredIntentSha256 988a37755026d24c2e002236e9bb4532ab8c9ad95488e24d75eef93f33d99264
boundaryPolicySha256 6e7cb3dca041716810ba8040286e1b9a18c218230100d3978e971bac7292ad85
requiredTestsSha256  c49f9dc21e8f38d4037a70ba4da7d6989c7d021c413221d5d2560c3ce15fdc5c
baseSha              64d54732ffffc3246ac03af242e0ec9611fc0222
```

Herhangi biri tutmazsa orchestrator `TASK_SPEC_HASH_MISMATCH` ile fail-closed
olur. Plan dosyası değişirse bu grant kendiliğinden geçersizdir.

## Granted capabilities

| Capability | Granted |
|---|---|
| `CREATE_ISOLATED_WORKTREE` | YES |
| `PREPARE_ENVIRONMENT` | YES |
| `SPAWN_EXECUTOR` | YES |
| `MUTATE_WITHIN_DECLARED_BOUNDARY` | YES |
| `RUN_REQUIRED_TESTS` | YES |
| `CREATE_EXECUTION_PR` | YES |
| `PRODUCE_MERGE_READY_ATTESTATION` | YES |

Boundary yalnız plan'ın `boundaryPolicy.allowedRoots`'udur — **tek dosya**:

```text
project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts
```

## Explicit denials

```text
AUTO_MERGE
PERFORM_MERGE
PRODUCTION_SCHEMA_MIGRATION_RUNTIME
OWNER_WIP_MUTATION
POLICY_CHANGE
PROGRAM_SEQUENCE_CHANGE
FREE_FORM_GOVERNANCE_EDIT
BOUNDARY_WIDENING
SUCCESSOR_AUTO_START
CONTROL_PLANE_MUTATION
```

`PERFORM_MERGE` ayrıca runner tarafında da imkânsızdır: `run-task.cjs`'in
`performMerge`'ü `MERGE_NOT_PERMITTED` ile throw eder. Bu grant o davranışı
değiştirmez.

## Revocation

```text
project/docs/governance/coordination-v2/task-plans/COLLECTION/REVOKED
```

Bu yolda bir dosya oluşturmak grant'ı derhal iptal eder.

## Semantic authority

Bu grant hiçbir semantik karar ÜRETMEZ. Değişikliğin anlamı
`COLLECTION-DECOMPOSITION.md` §W2.2D-1A'dadır; bu kayıt onu değiştirmez,
genişletmez, yeniden yorumlamaz. W2.2D-1'in kalan semantik kapsamı
`OWNER GO REQUIRED` kalır, `COL-RISK-G03` `PARTIALLY MITIGATED` kalır.

## Bu grant HENÜZ KULLANILAMAZ — owner hash ratifikasyonunu açıkça vermedi

Owner'ın `decision-log.md` girdisi (`855f4793`, 2026-07-27) semantic authority
verir ama hash ratifikasyonunu **açıkça reddeder**:

```text
"Bu kayıt COLLECTION plan hash'i 4a84fe4c65…bd407e için ratification DEĞİLDİR;
 hash ayrıca explicit owner ratification gerektirir."
"plan hash NOT RATIFIED"
```

Dolayısıyla `grant.json`'ın `ownerRatificationEvidence` bloğu **doldurulmadı**.
O girdiyi ratifikasyon kanıtı olarak göstermek, owner'ın kendi metninde
reddettiği bir anlamı ona yüklemek olurdu.

`authority.validateAgainstGrant` bu hâlde `OWNER_RATIFICATION_EVIDENCE_PLACEHOLDER`
ile fail-closed olur — davranış doğrudur ve bu belge onu atlatmaz.

Eksik olan tek şey owner'ın şu iki satırı:

```text
RATIFY  COLLECTION plan hash 4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
GRANT   GOV-COORD-V2-RCV-COL-W2.2D-1A-R01  (bu kayıt)
```

Bu ratifikasyon `decision-log.md`'ye yazıldığında, o commit'in SHA'sı ve exact
excerpt'i `ownerRatificationEvidence`'a girer ve grant tamamlanır.
