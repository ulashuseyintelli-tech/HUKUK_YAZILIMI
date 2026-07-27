# PROGRAM-WIDE-UNFINISHED-WORK-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-UNFINISHED-WORK-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Gerçekten yarım kalmış, kurtarılabilir veya hâlâ yapılması gereken işleri taşır.
             Implementation authority ÜRETMEZ.
Tarih      : 2026-07-27
```

Bu register **yalnız** unique değer taşıyan ve canonical main'de bulunmayan işleri listeler.
Bilinçli yapılmayan işler `PROGRAM-WIDE-INTENTIONALLY-NOT-DONE-REGISTER-R01.md` içindedir.

## 1. `STARTED_LOCAL_WIP` — commit edilmemiş owner WIP (5)

Hiçbirine dokunulmadı. `AGENTS.md` §8 ve `maintenance-register` MR-001/MR-003 gereği
overwrite/stash/revert/cleanup YAPILMAZ.

| # | Worktree | Branch | Dirty içerik | Disposition |
|---|---|---|---|---|
| U-01 | `HUKUK_rcv_claim_form_p02_s05_i01` | `codex/rcv-claim-form-p02-s05-i01` | `M project/apps/api/src/modules/case/case.service.ts` + `?? .../__tests__/case-due-formation-admission.spec.ts` | `OWNER_DECISION_REQUIRED` — RCV-CLAIM-FORM P02-S05-I01 hattı; branch main ile 0 unique commit, tüm değer uncommitted |
| U-02 | `HUKUK_rcv_ws04_p03_syn_01` | `codex/rcv-ws04-p03-syn-01` | `?? .../summary-engine/__tests__/synthetic-allocation-corpus.spec.ts` + `synthetic-allocation-corpus.ts` | `OWNER_DECISION_REQUIRED` — RCV WS04 P03 sentetik allocation corpus; 2 yeni dosya, hiç commit edilmemiş |
| U-03 | `HUKUK_ver05a_unified_inventory` | `codex/ver-05a-unified-inventory` | 2 modified + 9 untracked (`ver-05a-unified-inventory.{core,db,cli,types}.ts` + 4 spec + `scripts/inventory-ver-05.ts`) | `OWNER_DECISION_REQUIRED` — VER-05A birleşik envanter; **en büyük tekil WIP**, tam bir modül taslağı |
| U-04 | `HY_WT/T5_R02` | `codex/t5-plan-refresh-r02` | `M COLLECTION/grant.template.json`, `M OFFICE/grant.template.json`, `?? COLLECTION/plan.v2.json`, `?? OFFICE/plan.v2.json` | `OWNER_DECISION_REQUIRED` — T5 plan refresh R02; T5 programı #1667 ile PASS kapandı, bu WIP'in hâlâ geçerli olup olmadığı semantic karar |
| U-05 | `HY_WT/RUNTIME` | detached `1d042280` | `?? Invoke-CanaryAuthProbe.ps1` | `OWNER_DECISION_REQUIRED` — UYAP canary auth probe script'i; UYAP CUTOVER HARD HOLD altında |

## 2. `LOCAL_UNPUSHED_COMMIT` + `OWNER_WIP_REQUIRES_DECISION` — CCB-001 rescue (1 branch / 7 commit)

```text
branch (local)  : codex/ccb-001-pr1-pr6-rescue   HEAD 961bbaf3
branch (remote) : origin/codex/ccb-001-pr1-pr6-rescue   HEAD 4263b26a
local vs remote : local 5 commit ILERI  (push edilmemiş)
main'e göre     : 7 unique commit, 72 değişen dosya, 69 residual delta
PR              : YOK — hiç açılmadı
worktree        : C:\Development\HUKUK_YAZILIMI\HUKUK_ccb-001-r  (clean)
```

Commit zinciri:

```text
961bbaf3 fix(ccb-001): reconcile allocation behavior and authority metadata before ADR-012
fcdbebde fix(ccb-001): repair case service encoding contamination
0a169f23 docs(governance): PARTIAL/branch-local CCB-001 <-> CAN-CUT-02 <-> ADR-012 alignment
6dfa958d fix(ccb-001): normalize CRLF line endings introduced by workstation restore
4b646b9c chore(env): update local Claude workspace paths
4263b26a chore(ccb-001): restore migrated WIP from old workstation
be9c0c90 chore(ccb-001): checkpoint PR1-PR6 canonical calculation WIP
```

**Disposition: `OWNER_DECISION_REQUIRED` — merge kuyruğuna ALINMADI, silinmedi, dokunulmadı.**

Gerekçe (canonical kanıt):

- `product-backlog.md` `ID: CCB-001-RELEASE-BLOCKER-TRACK` kaydı açıkça şunu yazar:
  *"`ID: CCB-001` backlog kaydının kendisi — WIP branch main'e HENÜZ merge edilmedi, canonical
  cutover main'de yok, bu track o merge'i yapmadı ve yetkilendirmiyor"*.
- `decision-log.md` 2026-07-10 kaydı: *"CCB-001 branch'in kendisi merge EDİLMEDİ, kod/migration/
  schema/PAC-001-A/fee implementation YOK"*.
- Commit mesajları (`restore migrated WIP from old workstation`, `update local Claude workspace
  paths`) bunun bir **workstation göçü artefaktı** olduğunu doğrular.

Yani bu branch **unutulmuş değil, bilinçli olarak açık tutulan** owner WIP'idir; ancak merge/kapatma
kararı hâlâ verilmemiştir. Bu nedenle `INTENTIONALLY_NOT_IMPLEMENTED` değil, `OWNER_DECISION_REQUIRED`
sınıfına atanmıştır. Ayrıntılı A/B kararı: `PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-01.

## 3. `REMOTE_BRANCH_NO_PR` + `GENUINE_REMAINING_WORK` — ver05 maintenance kaydı

```text
branch  : codex/ver05-inventory-maintenance   HEAD 8bec6c23   (local + remote, PR YOK)
commit  : docs(maintenance): track ver05 inventory worktree orphan
diff    : project/docs/governance/maintenance-register.md  +1 satır
worktree: C:\Development\HUKUK_YAZILIMI\HUKUK_ver05_inventory_maintenance  (clean)
```

**Bulgu:** Branch'in eklediği satır `MR-023 | ORPHANED_WORKTREE_DIR — HUKUK_ver05_due_claimitem_inventory`
idi. Canonical main'de **`MR-023` ID'si başka bir kayda** (`HUKUK_pr2b-input-adapters`, PR #1065)
verilmiştir. Yani:

- İçerik hâlâ **geçerlidir** — `C:\Development\HUKUK_YAZILIMI\HUKUK_ver05_due_claimitem_inventory`
  dizini fiziksel olarak **hâlâ mevcuttur** (bu programda doğrulandı) ve main'in
  `maintenance-register.md`'sinde **hiç izlenmemektedir**.
- Ancak branch **doğrudan merge edilemez**: ID çakışması + branch main'in 597 commit gerisinde.

**Disposition: `RECOVER_ON_FRESH_MAIN` — UYGULANDI.** İçerik bu programın PR'ında fresh main
üzerinde yeniden ve doğru ID ile yazıldı (bkz. `maintenance-register.md` yeni satır). Kaynak branch
merge EDİLMEDİ. Branch, owner doğrulaması için silinmedi.

## 4. `PLAN_ONLY_NO_IMPLEMENTATION` — planı olan, başlamamış işler (7)

Bunlar **yapılabilir teknik iş değildir**: hepsi açık bir owner gate'i tarafından bloke edilmiştir.
Ayrıntı `PROGRAM-WIDE-INTENTIONALLY-NOT-DONE-REGISTER-R01.md` §2'dedir.

```text
UYAP-SEND-AUTHORITY-RESOLVER-I03          (bağımlılık: I01 + I02; DECISION-1/2 açık)
UYAP-CPE-AUTHORITY-FACT-BRIDGE-I04
UYAP-AUTHORITY-FRESHNESS-TX-I05
UYAP-LEGACY-POA-FLAG-DEPRECATION-I06
UYAP-AUTHORITY-GOVERNANCE-CLOSURE-I07
ADR-014 PR-11..PR-14 (runtime cutover)    (owner: NOT AUTHORIZED)
DBP-07                                    (owner: HOLD / NOT AUTHORIZED)
```

## 5. Bu register'da OLMAYANLAR

Aşağıdakiler tarandı ve **gerçek yarım iş bulunmadı**:

```text
git stash                     : 0 kayıt
OPEN_PR_STALE                 : 0 — envanter anında hiç açık PR yoktu
CLOSED_UNMERGED_ABANDONED     : 0 — 5 kapalı PR'ın hepsinin gerekçesi kayıtlı
AUTHORIZED_NOT_STARTED        : 0 — yetkisi olup başlanmamış iş bulunmadı
MISSING_ARTEFACT_REFERENCE    : 0 — bkz. GHOST-REFERENCE-REGISTER
```
