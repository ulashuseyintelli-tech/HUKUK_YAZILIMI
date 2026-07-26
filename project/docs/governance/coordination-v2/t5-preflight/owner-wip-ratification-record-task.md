# Owner-WIP Blocker — Exact Minimal Ratification-Record Task

```text
Task        : T5-LIVE-PILOT-OWNER-DECISIONS-AND-PLAN-AUTHORING-R01, PHASE B
Base        : origin/main @ 2f309e83
BLOCKER     : decision-log.md agent tarafından yazılamaz (owner WIP)
DURUM       : atlanmadı — exact metin aşağıda, owner'ın yazması gerekiyor
```

## 1. Neden agent yazamıyor

`governance-writer-coordination-protected-paths.json` →
`grandfatheredOwnerWipExactPaths` şunları içerir:

```text
project/docs/governance/decision-log.md          ← otoritatif kapanış kaynağı
project/docs/governance/product-backlog.md
project/docs/governance/COLLECTION-GOVERNANCE.md
project/docs/governance/COLLECTION-RISK-REGISTER.md
```

V1 `deniedCapabilities` → `OWNER_WIP_MUTATION` `DENIED`; `CLAUDE.md` §8
"kullanıcıya ait WIP'e dokunma". Bu dört dosyaya **dokunulmadı**.

Bunun somut sonucu: `OFFICE-OWNER-DECISIONS.md:9`'a göre otoritatif kapanış
kaynağı `decision-log.md`'dir. Bu turda yazılan kayıtlar
(`COLLECTION-DECOMPOSITION.md`, `OFFICE-RISK-REGISTER.md`,
`active-roadmap.md`, contract §0.0) gerçek ve doğrulanabilir, ancak
**otoritatif kapanış girdisi değildir**. Plan'ların `semanticAuthorityRef`'i
bu boşluğu taşır.

## 2. Yazılması gereken exact minimal girdiler

Aşağıdaki üç satır `decision-log.md`'ye eklenirse blocker kapanır. Metin
owner'ın kendi kararlarının transkripsiyonudur; agent yeni bir karar
önermemektedir.

### 2.1 COLLECTION

```text
| 2026-07-26 | **RC-COL / W2.2D-1 — SCHEMA FOUNDATION EXECUTION RECONCILIATION +
W2.2D-1A OWNER AUTHORIZATION:** PR #1415 (squash `80a11c2a4dff047e86879d8628cdb090fae66743`,
merged 2026-07-18T18:35:53Z, migration `20260718210000_rc_col_w2_2d1_collection_confirmed_at_foundation`)
W2.2D-1'in icra edilmiş schema-foundation dilimi olarak TESCİL EDİLİR.
**DISPOSITION: MERGED_WITHOUT_MATCHING_GOVERNANCE_RECORD.** Bu tescil geçmişe dönük
execution authority ÜRETMEZ; yalnız canonical gerçekleşmeyi kaydeder ve successor
planlamasını açar. **W2.2D-1A — CONFIRMED-AT CHARACTERIZATION** owner-authorized
test-only successor olarak kaydedilir: amaç mevcut Collection confirmation davranışını
testlerle karakterize etmektir; yeni confirmedAt semantiği, production kod değişikliği,
schema/migration değişikliği ve lifecycle davranışı YASAKTIR. W2.2D-1'in kalan semantik
kapsamı OWNER GO REQUIRED kalır; W2.2D-1A onu KAPATMAZ. COL-RISK-G03 PARTIALLY MITIGATED
kalır. | ... | ... | ... |
```

### 2.2 OFFICE

```text
| 2026-07-26 | **OFFICE PHASE 2 / CAP-09A — AUTHORITY RECONCILIATION + SLICE 3
AUTHORIZATION:** `decision-log.md` 2026-07-22 CAP-09 GO-DECIDE kaydı ("SLICE 1 bu kayıtla
yetkilendirilir") ile `OFFICE-RISK-REGISTER.md` STF-PRD-AUDIT-001 satırı ("SLICE 3 olarak
yetkilendirmiştir") arasındaki çelişki **risk register esas alınarak** çözülür.
**CAP-09A-CONSUMER-01 / SLICE 3: OWNER-AUTHORIZED.** Kapsam yalnız `StaffService.remove()`'u
`LawyerService.delete()` ile transactional audit attribution paritesine getirmektir.
YASAK: AuditLog şeması değiştirmek, yeni audit taksonomisi üretmek, SLICE 2 kapsamını örtük
uygulamak, başka staff lifecycle davranışlarını değiştirmek. **SLICE 2 (`CAP-09A-FOUNDATION`
= `OFFICE-PHASE2-CAP09A-FOUNDATION-I01`) İPTAL EDİLMEMİŞTİR** ve kalan tüketici kapsamı ayrı
ve sonraki unit olarak durur. REPOSITORY GERÇEĞİ: SLICE 2'nin foundation'ı zaten icra
edilmiştir — PR #1536 / `580edd8e`, migration `20260722213239_office_phase2_cap09a_foundation_audit_attribution`,
canlı DB APPLIED (TRAIN-R02 2026-07-23, exec `b3b0fa5b8183`); dolayısıyla "SLICE 3'ü SLICE 2
öncesine alma" fiilen konusuzdur. | ... | ... | ... |
```

### 2.3 GOV-COORD-V2

```text
| 2026-07-26 | **GOV-COORD-V2 — RATIFIED WITH LIMITATION:** `BOUNDED_CODE_TASK` profili
RATIFIED FOR USE. `MECHANICAL_GOVERNANCE` profili, ulaşılabilir hedef yüzeyi bulunmadığı
için (contract §1.2) **NON-ELIGIBLE / KULLANILAMAZ** işaretlenir; bu açık T5 bounded-code
pilotunu BLOKE ETMEZ ve ayrı bir contract follow-up candidate'ı olarak kaydedilir.
Governance kaydı yazımı için yürürlükteki V1 mekanizması kullanılır. AUTO-MERGE: OFF.
MANUAL OWNER MERGE: REQUIRED. Manifest elle ELIGIBLE yapılmaz; eligibility, ratifiye plan
ve execution grant sonrasında orchestrator tarafından hesaplanır. | ... | ... | ... |
```

## 3. Ayrıca owner düzeltmesi bekleyen bayat satırlar

Bunlar `product-backlog.md` içindedir (owner WIP) ve doğrulanmış biçimde
yanlıştır:

```text
:3327  "(2026-07-21; REGISTERED / NOT IMPLEMENTED)"
:3338  "Status: OPEN / NOT IMPLEMENTED — ... YETKİLENDİRİLMEMİŞTİR."
:3342  "NEXT ELIGIBLE ACTION: OFFICE-AUTH-P02-HARDENING-R01 — ayrı GO-IMPLEMENT gerektirir"
```

Gerçek: 5/5 residual kodda mevcut; kod PR #1494 / `b9916f5b`; canlı DB GATE M3
+ TRAIN-R02 exec `b3b0fa5b8183`. Kanıt tablosu
`t5-preflight/office-stale-register-reconciliation.md §2`'dedir.

`:3330-3334`'teki "Mevcut kod:" tespitleri **tarihsel kayıttır ve
silinmemelidir**; yalnız statü satırları düzeltilmelidir.

---

**AUTHORITY: NONE.** Bu belge bir owner kararı üretmez; owner'ın verdiği
kararların, agent'ın yazamadığı dosyalar için hazırlanmış exact
transkripsiyonudur.
