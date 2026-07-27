# PROGRAM-WIDE-INTENTIONALLY-NOT-DONE-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-INTENTIONALLY-NOT-DONE-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : "Yapılmadı" görünen fakat aslında BİLİNÇLİ olarak yapılmamış işleri, her biri için
             canonical kanıtla birlikte kaydeder. Hiçbir gate'i açmaz, hiçbir statü DEĞİŞTİRMEZ.
Tarih      : 2026-07-27
```

## 0. Intent testi

`AGENTS.md` ve görev talimatı gereği bir iş `INTENTIONALLY_NOT_IMPLEMENTED` veya
`OWNER_GATED_NOT_STARTED` sayılabilmesi için **en az bir canonical kanıt** gerekir:
owner decision · `NOT AUTHORIZED` · `OWNER-GATED` · scope exclusion · supersession · withdrawal ·
architecture prohibition · program sequencing decision.

Aşağıdaki her satır bu testi geçmiştir. **Sadece eski olmak abandonment kanıtı değildir** ve bu
register'da hiçbir kayıt yalnız tarihe dayandırılmamıştır.

## 1. Program seviyesi authority gate'leri (13)

Kaynak: `project/docs/governance/GOVERNANCE-INDEX.md` §2 belge haritası (RATIFIED / CANONICAL).

| # | Hat | Canonical statü alıntısı | Sınıf |
|---|---|---|---|
| I-01 | RECEIVABLE / TPA | `TPA-04C..G ayrı owner gate, runtime/cutover unauthorized` | `OWNER_GATED_NOT_STARTED` |
| I-02 | RCV Legal Subtype Registry V1 | `runtime DORMANT; provider/resolver/key/signature/signed release/schema/migration authority NONE; next D02-PB01 owner-gated` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-03 | DOCUMENT-SOURCE-GOVERNANCE | `writer/resolver/schema/migration NOT AUTHORIZED` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-04 | COLLECTION W2.2D-1 | `W2.2D-1 OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED` | `OWNER_GATED_NOT_STARTED` |
| I-05 | COLLECTION W2.3 | `W2.3 BLOCKED — W2.2 BOUNDARY PENDING` | `OWNER_GATED_NOT_STARTED` |
| I-06 | DEBTOR Blueprint (DBP) | `IMPLEMENTATION ENTRY: HOLD / NEXT IMPLEMENTATION WORKSTREAM: OWNER DECISION REQUIRED` | `OWNER_GATED_NOT_STARTED` |
| I-07 | UYAP Master Synthesis v1.1 | `IMPLEMENTATION AUTHORITY: NONE; UYAP CUTOVER HARD HOLD korunur` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-08 | UYAP Normative Annex | `IMPLEMENTATION AUTHORITY: NONE` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-09 | UYAP Module Boundary Contracts | `IMPLEMENTATION AUTHORITY: NONE; runtime wiring YETKİLENDİRİLMEZ` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-10 | UYAP Program Audit Reconciliation | `IMPLEMENTATION AUTHORITY: NONE; REAL TRANSPORT 0` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-11 | UYAP CPE-POA Authority Design | `IMPLEMENTATION AUTHORITY: NONE; SCHEMA DELTA REQUIRED (migration ÜRETİLMEDİ)` | ⚠️ **ÇELİŞKİ** — bkz. MERGED-BUT-UNCLOSED-REGISTER W3-02 |
| I-12 | GOV-COORD-V2 contract v1.0 | `IMPLEMENTATION AUTHORITY: NONE — task/grant/lease instance, live pilot ve auto-merge üretmez` | `INTENTIONALLY_NOT_IMPLEMENTED` |
| I-13 | `coordination-v2/programs.manifest.json` | altı programın tamamı `liveExecutionEligibility: DENIED` | `INTENTIONALLY_NOT_IMPLEMENTED` |

**I-11 istisnası:** Bu satır bu programda **doğrulanamamıştır**. Canonical belge
`IMPLEMENTATION AUTHORITY: NONE` derken repository'de I01 ve I02 paketleri merge edilmiş
durumdadır. Bu bir kayıt–gerçeklik çelişkisidir ve bu register tarafından ÇÖZÜLMEZ;
`PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-02'ye taşınmıştır.

## 2. UYAP CPE-POA implementation paketleri — bilinçli sıralama (5)

Kaynak: `project/docs/blueprint/UYAP-CPE-POA-ACTING-LAWYER-AUTHORITY-DESIGN-v1.0.md` §L
— *"Implementation Decomposition (bounded, sıralı — hiçbiri bu görevle başlatılmaz)"*.

```text
I03  UYAP-SEND-AUTHORITY-RESOLVER-I03        bağımlılık: I01, I02
I04  UYAP-CPE-AUTHORITY-FACT-BRIDGE-I04      bağımlılık: I03
I05  UYAP-AUTHORITY-FRESHNESS-TX-I05         bağımlılık: I04
I06  UYAP-LEGACY-POA-FLAG-DEPRECATION-I06    bağımlılık: I05
I07  UYAP-AUTHORITY-GOVERNANCE-CLOSURE-I07   bağımlılık: I06
```

Sınıf: `PLAN_ONLY_NO_IMPLEMENTATION` + `OWNER_GATED_NOT_STARTED`. Bunlar **unutulmuş iş değildir**;
belge açıkça sıralı bağımlılık ve `DECISION-1`/`DECISION-2` owner kararı gerektiğini yazar
(*"her iki kararda FAIL-CLOSED / NO IMPLEMENTATION"*). Bu program bunlara dokunmamıştır.

## 3. ADR-014 / CCB-001 runtime cutover — bilinçli kapsam dışı

Kaynak: `product-backlog.md` `ID: CCB-001-RELEASE-BLOCKER-TRACK` — *"Track'in KAPSAMADIĞI"* listesi.

```text
CCB-001 branch merge          : "canonical cutover main'de YOK, bu track o merge'i
                                 yapmadı ve yetkilendirmiyor"
ADR-012-FEE implementasyonu   : "henüz başlamadı"
ADR-014 PR-11..PR-14          : governance kayıtlarında not-yet-started
```

Sınıf: `INTENTIONALLY_NOT_IMPLEMENTED` (cutover) + `OWNER_DECISION_REQUIRED` (branch disposition).

## 4. Master Triage Register — kapalı karar yüzeyleri

Kaynak: `project/docs/governance/master-triage-register.md`.

| Bölüm | Adet | Sınıf | Not |
|---|---|---|---|
| **H. Owner Decision Register** (`OWN-03` … `OWN-30`) | 28 | `OWNER_GATED_NOT_STARTED` | Her satır bekleyen owner kararını açıkça yazar |
| **G. Blocked Register** (`BLK-01` … `BLK-10`) | 10 | `OWNER_GATED_NOT_STARTED` | 2026-07-04 tam re-verification: *"tüm kayıtlar KAPALI sayılır, bir bağımlılık somut olarak değişmeden yeniden açılmaz"* |
| **E. Archived Register** (`ARC-01` … `ARC-08`) | 8 | `INTENTIONALLY_NOT_IMPLEMENTED` | `ARC-01/02/03/04` ADR ile **kararlı-red**; ARC-05 split sonrası yalnız UA-1 parçası arşivde |
| **F. Superseded Register** | 1 | `SUPERSEDED` | Export #4 "V3" — kaynak export format artığı, gerçek kayıt değil |

Bu 47 kayıt bu program tarafından **açılmamış, yeniden sınıflandırılmamış ve statüsü
değiştirilmemiştir**. Master Triage Register'ın kendi otoritesi korunur.

## 5. Bu programda bilinçli olarak YAPILMAYANLAR

| İş | Neden yapılmadı | Sınıf |
|---|---|---|
| `HUKUK_cutover_smoke` + `HUKUK_office_auth_p01_live` worktree kaldırma | Top-level `node_modules` junction'ları **canonical repo'ya** işaret ediyor; `worktree remove --force` canonical workspace'i imha ederdi | P0 SAFETY — bkz. STALE-ORPHAN-CLEANUP §3 |
| 149 fiziksel orphan dizinin silinmesi | `AGENTS.md` §8 + `runbooks/worktree-cleanup.md` §2.3: recursive fiziksel silme AJAN tarafından YAPILMAZ | HARD PROHIBITION |
| `.claude/`, `.codex/`, `.worktrees/`, `.claude/launch.json` | `governance-writer-coordination-protected-paths.json` → `grandfatheredOwnerWipPrefixes` | OWNER WIP |
| `ci_now_tmp.yml` (0 byte, untracked, repo kökü) | Owner WIP olabilir; `AGENTS.md` §8 bilinmeyen untracked dosyayı silmeyi yasaklar | OWNER WIP |
| `codex/ccb-001-pr1-pr6-rescue` merge veya silme | Governance kaydı merge'i açıkça yetkilendirmiyor; unique unpushed owner WIP | `OWNER_DECISION_REQUIRED` |
| Herhangi bir schema / migration üretimi | Bu programın kapsamı değil; owner yetkisi yok | HARD PROHIBITION |
