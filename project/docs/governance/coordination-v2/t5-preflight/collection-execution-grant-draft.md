# COLLECTION Execution Grant — OWNER DRAFT

```text
DURUM      : TASLAK — owner tarafından yazılmayı bekliyor
YAZAN      : agent (hazırlık); bu belge bir grant DEĞİLDİR
NEDEN AGENT YAZAMAZ:
  execution grant bir owner authority kaydıdır (SYS-DEC-001 / SYS-AI-003).
  Ayrıca hedef dizin coordination-execution-grants/ control-plane'dedir.
```

**Tazelik doğrulaması (bu taslak yazılırken yapıldı).** Aşağıdaki hash'ler
önceki bir turdan kopyalanmadı; `authority.specDigests()` ile main'deki
`plan.v1.json`'dan yeniden türetildi ve `grant.template.json`'ın pinleriyle
karşılaştırıldı — dördü de MATCH. Ayrıca `COLLECTION-DECOMPOSITION.md:546`
kontrol edildi: `W2.2D-1A` hâlâ `OWNER-AUTHORIZED`, OFFICE `SLICE 3` gibi
supersede **edilmemiş**.

Bu kontrol boşuna değil: aynı gün OFFICE tarafında dondurulmuş bir plana
güvenip yetkiyi repo'dan yeniden türetmemek, geri çekilmiş bir birim için
brief yazılmasına yol açtı.

## 1. Neden ayrı bir kayıt gerekiyor

`grant.schema.json` iki ayrı referans zorunlu kılıyor ve `SYS-DEC-003` gereği
**aynı path + recordId ikisini birden karşılayamaz**:

```text
semanticAuthorityRef   değişikliğin ANLAMINI ve owner/domain kararını gösterir
                       → COLLECTION-DECOMPOSITION.md · RCV-COL-W2.2D-1A
                         (§W2.2D-1A, PR #1619 ile main'de — HAZIR)

executionGrantRef      executor'ın o bounded işlemi YAPABİLMESİNİ gösterir
                       → bu belge henüz YOK  ← eksik olan tek şey
```

Yani "W2.2D-1A yetkilendirildi" kaydı zaten var; eksik olan "CODEX_LOCAL bu
task'ı bu sınırlar içinde yürütebilir" kaydı.

## 2. Yazılacak dosya

```text
project/docs/governance/coordination-execution-grants/GOV-COORD-V2-RCV-COL-W2.2D-1A-R01.md
```

V1'in `GOV-COORD-V1-CODEX-LOCAL.md`'siyle aynı dizin ve aynı desen. İlk satırdaki
HTML marker zorunludur — coordination guard onu arar.

## 3. Exact metin

```markdown
# GOV-COORD-V2-RCV-COL-W2.2D-1A-R01 — Task-Scoped Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-V2-RCV-COL-W2.2D-1A-R01 -->

```text
Grant ID              : GOV-COORD-V2-RCV-COL-W2.2D-1A-R01
Contract              : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Profile               : BOUNDED_CODE_TASK
Executor              : CODEX_LOCAL
Owner-ratified        : <TARİH>
Scope                 : TASK-SCOPED — standing DEĞİL, tek task, tek attempt
Auto-merge            : OFF
Manual owner merge    : REQUIRED
Expires               : <ISO-8601 UTC>          (öneri: ratifikasyondan +24 saat)
```

## Authorized task

Task ADIYLA değil, immutable hash kimliğiyle pinlenir (§2).

```text
taskId               RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
declaredIntentSha256 988a37755026d24c2e002236e9bb4532ab8c9ad95488e24d75eef93f33d99264
boundaryPolicySha256 6e7cb3dca041716810ba8040286e1b9a18c218230100d3978e971bac7292ad85
requiredTestsSha256  c49f9dc21e8f38d4037a70ba4da7d6989c7d021c413221d5d2560c3ce15fdc5c
baseSha              64d54732ffffc3246ac03af242e0ec9611fc0222
```

Bu hash'lerden herhangi biri tutmazsa orchestrator `TASK_SPEC_HASH_MISMATCH`
ile fail-closed olur. Plan dosyası değişirse bu grant kendiliğinden geçersizdir.

## Granted capabilities

| Capability | Granted |
|---|---|
| `CREATE_ISOLATED_WORKTREE` | YES |
| `SPAWN_EXECUTOR` | YES |
| `MUTATE_WITHIN_DECLARED_BOUNDARY` | YES |
| `RUN_REQUIRED_TESTS` | YES |
| `CREATE_EXECUTION_PR` | YES |
| `PRODUCE_MERGE_READY_ATTESTATION` | YES |

Boundary yalnız plan'ın `boundaryPolicy.allowedRoots`'udur — tek dosya:
`project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts`

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
```

## Revocation

```text
project/docs/governance/coordination-v2/task-plans/COLLECTION/REVOKED
```

Bu yolda bir dosya oluşturmak grant'ı derhal iptal eder; orchestrator her
attempt'te kontrol eder.

## Semantic authority

Bu grant hiçbir semantik karar ÜRETMEZ. Değişikliğin anlamı
`COLLECTION-DECOMPOSITION.md` §W2.2D-1A'dadır ve bu kayıt onu değiştirmez,
genişletmez veya yeniden yorumlamaz. W2.2D-1'in kalan semantik kapsamı
OWNER GO REQUIRED kalır.
```

## 4. Yazdıktan sonra bana söylemeniz gerekenler

```text
1  execution grant dosyasının commit SHA'sı
2  decision-log.md'deki COLLECTION girdisinin commit SHA'sı
3  expiresAt olarak seçtiğiniz ISO-8601 UTC değeri
```

Bu üçüyle `grant.template.json`'daki yedi `<OWNER-FILLS>` alanını doldurup
`grant.json` üretirim. `excerptSha256`'yı ben hesaplarım — sizin yazmanıza
gerek yok.

## 5. Sonra ne olur

```text
pnpm orch:run --plan …/COLLECTION/plan.v1.json \
              --grant …/COLLECTION/grant.json \
              --prompt …/COLLECTION/executor-prompt.md \
              --lane CODEX_LOCAL
```

Orchestrator lease alır, izole worktree açar, ortamı kurar, Codex'i alt süreç
olarak çalıştırır, diff'i sınıra karşı doğrular, testleri koşar, PR açar ve
MERGE_READY attestation üretir. **Merge etmez** — o sizde kalır.

---

**AUTHORITY: NONE.** Bu belge bir execution grant değildir, hiçbir yetki
üretmez ve owner kararının yerine geçmez.
