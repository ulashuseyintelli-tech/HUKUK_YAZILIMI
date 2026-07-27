# PROGRAM-WIDE-STALE-ORPHAN-CLEANUP-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-STALE-ORPHAN-CLEANUP-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : EXECUTION EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Uygulanan mekanik temizliğin tam kaydı + uygulanmayanların gerekçesi.
Tarih      : 2026-07-27
```

## 1. Local branch temizliği — 47 silindi

Ön koşul: her branch için `no unique value` + `no owner WIP` + `no open PR dependency` +
`no active successor` + `no competing writer` pozitif doğrulandı.

### 1.1 Merged-PR grubu (33) — `MERGED_CANONICAL` → `STALE_BRANCH_SAFE_TO_DELETE`

Kanıt: PR `MERGED` + branch tepesi `refs/pull/<N>/head` altında kalıcı.

```text
claude/agitated-wozniak-f180e4                  9c5409df  PR #1474
claude/client-p2-u03-i02-document-projection    87177bbf  PR #1506
claude/client-p2-u03-track-b-i01                4dbf96b2  PR #1629
claude/great-joliot-90590e                      005dbab9  PR #1477
claude/office-cap09a-ci-coverage-gov-closure    8d6c7ce5  PR #1563
claude/office-cap09a-migration-ci-coverage-r01  0e25cf5b  PR #1560
claude/practical-curie-9c1770                   1da39eb6  PR #1140
claude/quizzical-brahmagupta-ed3881             ce711420  PR #1150
claude/quizzical-meninsky-dbc468                44d6dd62  PR #1590
claude/t5-collection-grant-draft-r01            98b7058d  PR #1644 + #1645
claude/uyap-poa-tenant-safety-i01               2256d702  PR #1633
codex/adr014-evidence-runner                    8e73578c  PR #1159
codex/adr014-pe04-dataset-contract              1b0c8fb4  PR #1163
codex/adr014-reversal-arbitration-v11           f7fd1d2a  PR #1033
codex/adr014-scenario-infra-arbitration         51b8cb73  PR #1029
codex/adr014-split-pr-baseline-v1               b987711c  PR #1032
codex/can-p0-002-a1-patchflags-redirect         e658e63a  PR #1006
codex/can-p0-002-c-remove-metadata-write        66489ac5  PR #1014
codex/canonical-five-module-workspace-map       ccfaac8d  PR #1631
codex/ccb001-release-blocker-track-close        7159d1fe  PR #1013
codex/fee-tariff-001b1-register-close           ddc776d4  PR #1007
codex/fee-tariff-2026-001a-test                 f597cfe0  PR #1015
codex/fee-tariff-2026-001a-test-register-close  3b3b533e  PR #1018
codex/fee-tariff-2026-001b2-close               6bef9c27  PR #1010
codex/of01-history-p04b                         19104f1f  PR #1537
codex/rc-col-w2-2c1-closure-reconciliation      ab1c7a7c  PR #1373
codex/rc-col-w2-2c5-closure-reconciliation      fafafd15  PR #1402
docs/can-p0-002-a-register-update               beed17a1  PR #1001
docs/can-p0-002-a1-register-closure             170213ce  PR #1009
docs/can-p0-002-c-register-closure              4c877db5  PR #1017
docs/fin-tbk100-di-001-closure-record           6349f4d9  PR #995
docs/gov-adr-013-canonical-legal-calc-core      33f19ffd  PR #1019
governance/office-p2-cap02-residual-check-r01   64e4db36  PR #1634
```

### 1.2 Sıfır unique commit grubu (13) — `git branch -d` (safe delete kabul etti)

Kanıt: `git rev-list --count origin/main..<branch>` = **0**; içerikleri main'in atasıdır.

```text
claude/bold-haslett-f84f80                 5867a0f7
claude/clever-tesla-20b7cc                 98276670
claude/determined-kirch-10a725             7676d851
claude/gracious-golick-074d99              18394f77
claude/great-shannon-cb47c1                285e6fcd
claude/magical-poincare-0e0ff2             f4fc0877
claude/peaceful-mahavira-8df1b0            c4ee2332
claude/relaxed-darwin-19f8d1               63001c83
claude/serene-kilby-f094dd                 bd35e20b
claude/vigorous-hopper-908801              95fe9f82
claude/youthful-swanson-990c99             2487d52b
codex/gomigrate-p01-collection-confirmedat 83b0a9b5
codex/r03-smoke-test                       6565190e
```

### 1.3 `DUPLICATE` (1)

```text
claude/musing-burnell-55db1a               5c8c83bf   PR YOK (local-only)
```

Disposition: `CLOSE_DUPLICATE`. Commit'i (`docs(governance): close FIN-TBK100-DI-001 after PR #989`)
`decision-log.md`'ye eklediği satır canonical main'de **kelime kelime mevcuttur** (PR #995,
`docs/fin-tbk100-di-001-closure-record` üzerinden merge edilmiştir); `product-backlog.md`'ye eklediği
`ID: FIN-TBK100-DI-001` kaydı da main'de bulunmaktadır. Unique değer YOK.

## 2. Remote branch temizliği — 148 silindi

### 2.1 Merged-PR grubu (145)

Tam liste `git log` ve GitHub PR kayıtlarından deterministik olarak türetilmiştir; her biri için
`PR state == MERGED` doğrulandı. Kanıt `refs/pull/<N>/head` altında kalıcıdır.

```text
assign-4-pr-c-fu-conflict-mapping · assign-4-pr-c-unique-index · chore/assign-3c-staff-type-cleanup ·
chore/claude-code-stop-hook-notify · chore/gitignore-db-dumps · chore/legal-time-deploy-verification ·
ci/enforce-type-check-gate · ci/web-next-build-gate · claude/agitated-wozniak-f180e4 ·
claude/automation-toggle-tenant-guard-gov · claude/client-p2-u03-i02-document-projection ·
claude/faz-b-0-statement-caseid-nullable · claude/migration-train-r01-close-gov · claude/office-auth-p01 ·
claude/office-cap09a-ci-coverage-gov-closure · claude/office-cap09a-migration-ci-coverage-r01 ·
claude/quizzical-brahmagupta-ed3881 · claude/quizzical-meninsky-dbc468 · codex/14d-live-smoke-harness ·
codex/6d-action-catalog-read-endpoint · codex/6e-operating-snapshot-read-endpoint ·
codex/6s-intake-delivery-visibility · codex/6u-intake-retry-as-new-ui · codex/8c-template-notification-frontend ·
codex/9c-document-request-schema · codex/acct-1m-2-manual-adjustment-service · codex/adr014-evidence-runner ·
codex/alc-auth-1a-b1-scope-narrowing · codex/alc-auth-4a-suppress-visibility · codex/alc-auth-6-component-coverage ·
codex/alc-auth-6-governance · codex/alc-auth-6-register-close · codex/case-archived-gate-activate ·
codex/case-footprint-guard · codex/case-ui-residual-cleanup · codex/casedebtor-passivate-hardening ·
codex/casefeeagreement-audit-hardening · codex/client-activity-tab-v2-sources ·
codex/client-intel-4-6c-asset-contact-promote · codex/client-intel-debtor-surface · codex/client-intel-mutation-ui ·
codex/client-intel-wire-create-props · codex/d5b-collection-casedebtor-fk · codex/d5c-tebligat-casedebtor-fk ·
codex/dbind-p1-disposition-approval-sync · codex/dbind-p2-contract-smoke · codex/dbnd-blocker-1-tenant-guard ·
codex/debtor-cross-case-alert · codex/debtor-spec-fixture-cleanup · codex/docs-db-gate-policy ·
codex/estate-tebligat-guard · codex/intel-capability-hardening · codex/lawyer-deactivate-hardening ·
codex/of01-history-p04b · codex/payout-reversal-spec-typefix · codex/poa-revoke-hardening · codex/portal-option-b ·
codex/s2-payment-reversed-publish · codex/tm3-s1-collection-safety-mainbase · codex/tm3-s2-payment-reversed-human ·
codex/tm47d-5a-manual-reversal-ops-read-model · docs/addr1-deprecated-address-fields-forensic ·
docs/addr1-fu-residual-run · docs/aggregate-version-concurrency-risk · docs/bridge-removal-decision-record ·
docs/cdt1-case-detail-tabs-cleanup-forensic · docs/g6-backfill-script-design ·
docs/interest-policy-casetype-mapping-risk · docs/legal-awareness-review · docs/legal-time-adoption-decision ·
docs/legal-time-forensic-impact · docs/legal-time-policy-correction-complete · docs/legal-time-pr-b-reframe ·
docs/legal-time-signoff-q1-q7-resolved · docs/legal-time-signoff-record · docs/legal-time-tz-observation ·
docs/real-person-case-responsibility-design · docs/status1-strand-index · docs/tbk100-legal-signoff ·
docs/tbk100-minor-unit-adoption-decision · docs/wp1d5-10-d4-zero-responsible-audit-design ·
docs/wp1d5-11-write-path-closure-note · docs/wp1d5-8-caselawyer-lifecycle-decision-note ·
docs/wp1d5-legal-responsibility-write-path-contract ·
docs/wp1d5-legal-responsibility-write-path-decision-matrix ·
docs/wp1d5-legal-responsible-endpoint-audit-contract · docs/wp1d5-product-legal-decisions ·
feat/dosya-sorumlusu-dg5-office-ui · feat/error-logs-ui-polish · feat/error-logs-ui-pr5 ·
feat/g6-backfill-dry-run · feat/interest-engine-cost-slot · feat/interest-engine-interpretation-profile ·
feat/interest-policy-assigned-emit · feat/ocr-bank-stamp-endorser-filter · feat/ocr-characterization-safety-net ·
feat/ocr-issuedate-print-date-guard · feat/ocr-white-endorsement-flag · feat/outbox-tenancy-threading ·
feat/settings-shell-a1 · feat/tbk100-allocator-minor-unit · feat/tbk100-minor-unit-helper ·
feat/v28-remove-timeline-bridge · feat/v28-tenant-boundary-hardening · feat/wp1d4-strand-closure-note ·
feat/wp1d4c2-responsibility-history-ui · feat/wp1d4c3-responsibility-history-filters-ui ·
feat/wp1d5-4-legal-responsible-change-backend · feat/wp1d5-5-legal-responsible-change-ui ·
fix/aggregate-version-advisory-lock · fix/calc-preview-sdk-strict-ts-dts-build · fix/case-debtor-collection-guard ·
fix/ci-pr-gates · fix/day-count-calculator-tz-invariant · fix/default-same-day-payment-start-of-day ·
fix/deflake-debtor-wizard-accept-2 · fix/deflake-debtor-wizard-accept-test-timeout · fix/expense-tariff-mock ·
fix/interest-formula-exact-rounding · fix/interest-policy-casetype-mapping ·
fix/m2-wizard-step1-responsible-required · fix/outbox-bridge-removal · fix/outbox-tenant-notnull ·
fix/outbox-tenant-required · fix/payment-instruction-tenant-isolation · fix/prisma-migration-baseline ·
fix/sd-25-stale-closed-set · fix/test-db-env-failsafe · fix/v28-timeline-aggregate-version ·
fix/wp1d5-5-button-placement · fix/wp1d5-6-legal-responsible-ui-consolidation-refresh ·
fix/wp1d5-7-caselawyer-legal-responsible-guard · fix/wp1d5-9-caselawyer-lifecycle-hardening ·
refactor/interest-engine-compute-balance-split · removal/v28-policygate-dead-subsystem ·
test/allocation-engine-characterization · test/balance-shadow-display-flake-deterministic ·
test/ci-case-debtor-include-passive-confinement-reliability · test/day-count-characterization ·
test/debtor-wizard-accept-deterministic · test/interest-engine-calculate-determinism ·
test/money-characterization-formula · test/payment-boundary-characterization ·
test/tbk100-allocator-characterization · wire-uyap-query-soft-warning
```

### 2.2 Closed-unmerged, disposition verilmiş (2)

```text
claim-item-wizard-multiitem-fix   53fb852a   PR #406   PRESERVE_AS_HISTORICAL_EVIDENCE
codex/pdf-takip-talebi-authz      e2d5007f   PR #1147  CLOSE_SUPERSEDED
```

Her ikisinin kanıtı `refs/pull/406/head` ve `refs/pull/1147/head` altında kalıcıdır
(silme öncesi pozitif doğrulandı). Gerekçeler `PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md` §3'te.

### 2.3 PR'sız, sıfır unique commit (1)

```text
phase-11-ci-carrier-write-once-gate   5e96d5d8   ahead 0 / behind 2238 — main'in atası
```

## 3. ⚠️ P0 — CANONICAL `node_modules` JUNCTION HAZARD (kaldırılmadı)

Bu programın en önemli güvenlik bulgusudur.

```text
HUKUK_cutover_smoke        → branch claude/cutover-smoke              (0 unique commit)
HUKUK_office_auth_p01_live → branch claude/office-auth-p01-live-migration (0 unique commit)
```

İki worktree de "temiz ve stale" görünmesine rağmen **kaldırılmamıştır**. Junction hedefleri
(`Get-Item -Force`, `LinkType=Junction`) ile pozitif doğrulanan topoloji:

```text
HUKUK_cutover_smoke\project\node_modules
    -> C:\Development\HUKUK_YAZILIMI\project\project\node_modules            ← CANONICAL
HUKUK_cutover_smoke\project\apps\api\node_modules
    -> C:\Development\HUKUK_YAZILIMI\project\project\apps\api\node_modules   ← CANONICAL
HUKUK_cutover_smoke\project\apps\web\node_modules
    -> C:\Development\HUKUK_YAZILIMI\project\project\apps\web\node_modules   ← CANONICAL

HUKUK_office_auth_p01_live\project\node_modules            -> aynı canonical hedefler
HUKUK_office_auth_p01_live\project\apps\api\node_modules
HUKUK_office_auth_p01_live\project\apps\web\node_modules
```

**Sonuç:** Bu iki dizinde `git worktree remove --force`, `rd /s /q`, `Remove-Item -Recurse` veya
`robocopy` mirror-empty çalıştırılması junction'ın **içinden geçerek canonical repository'nin
`node_modules` ağacını imha eder** ve tüm workspace'i (nest/prisma/jest/tsc/next shim'leri dahil)
kullanılamaz hale getirir.

**Zorunlu güvenli sıra (owner veya gelecekteki ajan için):**

```text
1. ÖNCE junction'ları unlink et — yalnız link silinir, hedef silinmez:
   cmd /c rmdir "C:\Development\HUKUK_YAZILIMI\HUKUK_cutover_smoke\project\node_modules"
   cmd /c rmdir "C:\Development\HUKUK_YAZILIMI\HUKUK_cutover_smoke\project\apps\api\node_modules"
   cmd /c rmdir "C:\Development\HUKUK_YAZILIMI\HUKUK_cutover_smoke\project\apps\web\node_modules"
   (rmdir — /s YOK. /s ile çalıştırmak hedefi de siler.)
2. Canonical integrity check (runbook §3): .bin sayıları 12 / 30 / 27 + nest/prisma/jest/tsc/next
3. ANCAK BUNDAN SONRA: git worktree remove --force <yol>
```

Bu satır `maintenance-register.md`'ye kalıcı kayıt olarak eklenmiştir (MR-058).

## 4. Worktree registry temizliği — 19 → 11

| Worktree | Topoloji | Sonuç |
|---|---|---|
| `HUKUK_five_module_workspace_map` | C (node_modules yok) | **TAM SİLİNDİ** |
| `HUKUK_grant_draft` | C | **TAM SİLİNDİ** |
| `HUKUK_office_res01` | C | **TAM SİLİNDİ** |
| `HUKUK_adr014-evidence-runner` | B (pnpm, 77k dosya) | Unregister edildi; `Filename too long` → fiziksel kalıntı |
| `HUKUK_client_p2_u03_i02_document_projection` | B (81k) | Unregister edildi; fiziksel kalıntı |
| `HUKUK_of01_history_p04b` | B (77k) | Unregister edildi; fiziksel kalıntı |
| `HUKUK_trackb_i01` | B (81k) | Unregister edildi; fiziksel kalıntı |
| `HUKUK_uyap_i02_poa_tenant` | B (81k) | Unregister edildi; fiziksel kalıntı |
| `project/.claude/worktrees/quizzical-meninsky-dbc468` | B | Unregister edildi; `Result too large` → fiziksel kalıntı |
| `HUKUK_cutover_smoke` | **A — HAZARD** | **DOKUNULMADI** (§3) |
| `HUKUK_office_auth_p01_live` | **A — HAZARD** | **DOKUNULMADI** (§3) |
| `HUKUK_ccb-001-r` | — | **KORUNDU** — owner WIP branch |
| `HUKUK_rcv_claim_form_p02_s05_i01` | — | **KORUNDU** — dirty owner WIP |
| `HUKUK_rcv_ws04_p03_syn_01` | — | **KORUNDU** — dirty owner WIP |
| `HUKUK_ver05a_unified_inventory` | — | **KORUNDU** — dirty owner WIP |
| `HUKUK_ver05_inventory_maintenance` | — | **KORUNDU** — unique unmerged branch |
| `HY_WT/RUNTIME` | — | **KORUNDU** — dirty owner WIP |
| `HY_WT/T5_R02` | — | **KORUNDU** — dirty owner WIP |
| `HY_wp00` | — | **KORUNDU** — concurrent writer (#1668) |

Her kaldırma sonrası canonical integrity doğrulandı: `.bin` = 12 / 30 / 27, tüm shim'ler mevcut,
canonical tracked tree CLEAN.

## 5. Fiziksel orphan dizinler — 149 (SİLİNMEDİ)

`AGENTS.md` §8 ve `project/docs/runbooks/worktree-cleanup.md` §2.3 gereği recursive fiziksel
silme AJAN tarafından YAPILMAZ. Bu dizinler owner-manuel cleanup bekler.

```text
C:\Development\HUKUK_YAZILIMI\HUKUK_*              141 dizin (registry'de kayıtlı 7 tanesi hariç)
C:\Development\HUKUK_YAZILIMI\project\.claude\worktrees\   8 dizin
```

`project/.worktrees/` altındaki 6 dizin (`adr014-pe-05b`, `adr014-pe-05b-baseline`,
`adr014-pe-06b1`, `adr014-pe-06b2`, `adr014-pr1b-reversal-netting`,
`adr014-w03-ratification-hardening`) `governance-writer-coordination-protected-paths.json` →
`grandfatheredOwnerWipPrefixes` kapsamındadır ve bu sayıma **dahil edilmemiştir**; MR-029/MR-030/
MR-049/MR-051/MR-052 tarafından zaten izlenmektedir.

Bu programın **yeni ürettiği** 6 orphan (bkz. §4) `maintenance-register.md` MR-059'a kaydedilmiştir.
Diğer ~143 dizin MR-002 genel şemsiyesi ve MR-005..MR-056 bireysel kayıtları altında zaten izlenir.
