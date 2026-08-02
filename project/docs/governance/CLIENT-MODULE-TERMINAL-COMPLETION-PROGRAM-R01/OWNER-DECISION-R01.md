# OWNER DECISION — CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01 (v1.0 RATIFICATION)

```text
Belge yolu   : project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/OWNER-DECISION-R01.md
Rol          : OWNER RATIFICATION ENVELOPE — master plan v1.0 ve sayfa-bağlı grant'ın
               kanonik ratification kaynağı
Durum        : OWNER RATIFIED
Program      : CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
PROGRAM LOCK : CLIENT ONLY
```

Bu belge, `coordination-v2` standing-grant mekanizmasının şart koştuğu
`ownerRatificationEvidence` kaynağıdır: grant kaydı bu dosyanın **merge edilmiş**
commit'ini ve aşağıdaki **exact excerpt**'i referans alır
(`authority.cjs :: verifyRatificationEvidence` → `OWNER_RATIFICATION_NOT_IN_MAIN` /
`OWNER_RATIFICATION_EXCERPT_ABSENT` fail-closed kontrolleri).

---

## 1. RATIFIED DOCUMENT SET (v1.0)

| # | Belge | Rol |
|---|---|---|
| 1 | `MASTER-PLAN.md` | Program kontrol ve bağlam kaynağı |
| 2 | `CLAUDE-CLIENT-C1.md` | Core write integrity & seed/bulk boundary |
| 3 | `CLAUDE-CLIENT-C2.md` | Mutation authority completion + address lifecycle |
| 4 | `CLAUDE-CLIENT-C3.md` | Legal & data lifecycle controls |
| 5 | `CODEX-CLIENT-X1.md` | Portal, notification & client-facing security |
| 6 | `CODEX-CLIENT-X2.md` | Financial disclosure |
| 7 | `CODEX-CLIENT-X3.md` | Intake & promotion integrity |

Yedi belgenin **task order, lane ownership, blocker discipline, activation ownership,
remaining-work counter ve no-side-quest** kuralları **bağlayıcıdır**.

---

## 2. OWNER RATIFICATION (exact excerpt — grant bu satırları referans alır)

```text
OWNER DECISION:
RATIFIED / CONTROL-PAGE GO-COMPLETE

PROGRAM:
CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01

RATIFIED VERSION:
v1.0

PAGE-BOUND GRANT EXPANSION — OWNER GRANTED:

CLAUDE-CLIENT-C1:
- project/apps/api/src/modules/client/
- project/apps/api/src/modules/seed/
- project/apps/api/src/app.module.ts
- project/apps/api/prisma/
- Exact task-owned test files
- Serialized CI-manifest entry required for exact C1 tests

CLAUDE-CLIENT-C3:
- project/apps/api/prisma/
  Only if C3 evidence proves a schema change necessary; single Claude migration writer
  and serial execution remain mandatory.

CODEX-CLIENT-X1:
- project/apps/api/src/modules/portal/
- project/apps/api/src/modules/client-notification/

CODEX-CLIENT-X3:
- project/apps/api/src/modules/client-intake-public/
- project/apps/api/src/modules/client-intake-link/
- project/apps/api/src/modules/client-intake-review/
- project/apps/api/src/modules/client-intake-promotion/

THE GRANT:
- Is valid only for exact master-plan pages and ordered tasks.
- Does not authorize product implementation from the control page.
- Becomes usable only when the owner opens the corresponding separate page.
- Does not authorize early successor execution.
- Does not authorize cross-lane writes.
- Does not authorize control-plane/governance repair.
- Does not authorize destructive production mutation outside conditional production gates.
- Does not authorize other-module product implementation.
```

---

## 3. CONTROL-PAGE BOUNDARY (bu kayıt tarafından sabitlenir)

Kontrol sayfası **yapabilir**: master mimariyi doğrulamak · yedi kanonik belgeyi ve
sayfa-bağlı grant'ı materialize etmek · belge tutarlılığını doğrulamak · yalnız kendi
dokümantasyon/otorite PR'ını açıp merge etmek · ayrı sayfa launch handoff'ları üretmek ·
C1–C3/X1–X3'ten dönen ilerleme raporlarını incelemek · kavram kayması ve sıra ihlali
tespit etmek.

Kontrol sayfası **yapamaz**: C1-B01 veya herhangi bir ürün görevini başlatmak · CLIENT
ürün kodunu değiştirmek · CLIENT implementation branch/worktree açmak · bir implementation
bloğuna ait testleri çalıştırmak (belge doğruluğu için gereken salt-okunur doğrulama
hariç) · child sayfanın PR'ını sahiplenmek/değiştirmek/merge etmek · başka sayfanın
worktree'sine girmek · otomatik olarak C1'e devam etmek · `NEXT_ELIGIBLE`'ı yürütme
yetkisi saymak.

```text
STRICT RULE:
NEXT_ELIGIBLE  ≠  START AUTHORIZED ON THIS PAGE
```

C1, owner tarafından **ayrı bir konuşma/sayfada** kendi kanonik handoff'u ile açılır.

---

## 4. PROGRAM COEXISTENCE

```text
ACTIVE PRODUCT MODULE:                CLIENT ONLY
PRODUCT WRITER ON CONTROL PAGE:       NONE
LEGACY GOVERNANCE / ORCHESTRA CLOSEOUT: ALLOWED — exact path çakışması yoksa CLIENT
                                      blocker'ı DEĞİLDİR
CHILD-PAGE EXECUTION AUTHORITY:       NOT EXERCISABLE ON CONTROL PAGE
```

---

## 5. MATERIALIZATION EVIDENCE

```text
Fresh origin/main baseline : e8e4d467dfcdb7b05c805746997c600148941ad6
Analiz baseline            : f047e51e155bbf1f3947c603b53ebbb58747f9ee
Inherited evidence         : PR #2107 merge SHA 789cf8f622a71aad9e4b4f642e9525811f65dfbd
                             (OWN-13 I02-R3; ANCESTOR_OK) — C1 için INHERITED EVIDENCE'tır,
                             tamamlanmış bir C1 bloğu DEĞİLDİR. C1 BLOCKS COMPLETED: 0.
Şema/migration deltası     : YOK (schema.prisma ve prisma/migrations değişmedi)
```

---

## 6. SINIRLAR

Bu ratifikasyon **tek başına** şunları VERMEZ: ürün implementation'ı başlatma yetkisi ·
production migration/flag/backfill uygulama yetkisi (WAVE 4 koşullu kapılarına tabidir) ·
control-plane/governance onarım yetkisi · başka modülün ürün implementation'ı ·
cross-lane yazım · erken successor yürütme.

`MERGED ≠ ENGINEERING_COMPLETE` · `ENGINEERING_COMPLETE ≠ PRODUCTION_ACTIVE`.
