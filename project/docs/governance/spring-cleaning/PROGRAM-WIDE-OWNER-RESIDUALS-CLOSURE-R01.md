# PROGRAM-WIDE-OWNER-RESIDUALS-CLOSURE-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-OWNER-RESIDUALS-CLOSURE-R01.md
Task       : PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01
Parent     : PROGRAM-WIDE-SPRING-CLEANING-FULL-AUTHORIZED-EXECUTION-R01
Owner auth : FULL / RATIFIED — dokuz karar peşinen verilmiştir
Durum      : CLOSED / CANONICAL / PASS WITH PROTECTED RESIDUALS
Baseline   : start `26c42b69`
Tarih      : 2026-07-27
```

## 1. Dokuz owner kararının uygulanma sonucu

| Item | Ratifiye karar | Sonuç |
| --- | --- | --- |
| **ITEM-01** CCB-001 | `PRESERVE_AND_AUDIT_FOR_RECOVERY` | **AUDIT COMPLETE / RECOVERY BLOCKED — authority absent** (§2) |
| **ITEM-02** UYAP I01/I02 | `RECONCILE, DO NOT RATIFY` | **RESOLVED** — PR #1675 / `89f2649a` |
| **ITEM-03** 5 owner WIP | `PRESERVE + INVENTORY + RECOVER ONLY WHEN EXACT` | **INVENTORIED / PRESERVED** — 0 recovery (§3) |
| **ITEM-04** Junction hazard | `REMEDIATE SAFELY` | **RESOLVED** — 6 junction ayrıldı, 2 worktree silindi, canonical korundu |
| **ITEM-05** Fiziksel orphan | `SAFE_DISPOSITION_AND_DELETE_WHERE_PROVEN` | **36 silindi / 111 korundu** — exact gerekçelerle |
| **ITEM-A01** ManifestAdminController | `OPTION B — INTENTIONALLY DORMANT` | **RESOLVED** — PR #1678 / `cf9b3371`, kod değişmedi |
| **ITEM-A02** Password recovery | `OPTION A — GO-DOCS CLOSURE` | **RESOLVED** — PR #1678, secret yazılmadı |
| **ITEM-A03** 18 flag | `OPTION B — UNKNOWN KALSIN` | **RESOLVED** — statik envanter + önceki yanlış sayım düzeltildi |
| **ITEM-A04** SnapshotCleanupService | `OPTION A — REMOVE` | **RESOLVED** — PR #1680 / `bd65a9c4`, 444 satır silindi |

```text
DOKUZ KARARDAN: 7 tam çözüldü · 1 audit tamam/recovery bloke (ITEM-01) · 1 kısmi (ITEM-05)
```

## 2. ITEM-01 — CCB-001 recovery audit (tam sonuç)

```text
branch  : codex/ccb-001-pr1-pr6-rescue
local   : 961bbaf3 (7 unique commit)   remote: 4263b26a   local remote'un 5 commit ÖNÜNDE
merge-base: 7b222c50
PR      : hiç açılmadı
worktree: HUKUK_ccb-001-r (clean, 0 dirty)
```

### 2.1 Patch-id karşılaştırması

6 commit'in patch-id'si main geçmişinde **bulunamadı** (7.'si zaman aşımına uğradı).
Bu beklenen sonuçtur: repo squash-merge kullanır, patch-id eşleşmesi merge kanıtı üretmez.
Karar bu ölçüme **dayandırılmamıştır**.

### 2.2 Dosya bazlı semantic disposition (72 dosya)

| Disposition | Adet | Kanıt |
| --- | --- | --- |
| `ALREADY_CANONICAL` | 3 | branch blob'u main blob'u ile **birebir aynı** |
| `STILL_VALID_RECOVERABLE` | **21** | yalnız branch değiştirdi, main hiç dokunmadı |
| `CONFLICTING` | 34 | hem branch hem main değiştirdi (`case.service.ts`, `CLAUDE.md`, `balance-display-shadow-diff.*` dahil) |
| `NOT_IN_MAIN` | 17 | 16 yeni dosya + `.claude/settings.json` (grandfathered owner WIP) |

### 2.3 21 recoverable dosyanın gerçek değeri

Whitespace/CRLF filtresi (`--ignore-cr-at-eol --ignore-all-space --ignore-blank-lines`)
uygulandığında:

```text
GERÇEK SEMANTİK DEĞİŞİKLİK : 21 / 21 dosya
YALNIZ WHITESPACE/CRLF     :  0 dosya
TOPLAM DEĞİŞEN SATIR       : 526
```

En büyükleri: `report.service.ts` (128), `HesapOzetiPanel.tsx` (100),
`report-passive-policy.spec.ts` (66), `golden-scenarios.spec.ts` (40),
**`tbk100-allocator.service.ts` (38)**, `useCaseCalculation.ts` (30),
`claim-priority.service.ts` (2).

Branch'te bir CRLF-normalizasyon commit'i (`6dfa958d`) bulunmasına rağmen, recoverable
kümenin **tamamı** gerçek semantik değişikliktir. **Bu iş değersiz değildir.**

### 2.4 Recovery neden yapılmadı — authority testi

Owner kuralı: *"Semantik authority mevcutsa aynı program içinde uygula. Authority yoksa exact
owner-decision residual olarak bırak."*

```text
product-backlog.md — CCB-001-RELEASE-BLOCKER-TRACK:
  "ID: CCB-001 backlog kaydının kendisi — WIP branch main'e HENÜZ merge edilmedi,
   canonical cutover main'de yok, BU TRACK O MERGE'İ YAPMADI VE YETKİLENDİRMİYOR"

decision-log.md 2026-07-10:
  "CCB-001 branch'in kendisi merge EDİLMEDİ, kod/migration/schema/PAC-001-A/
   fee implementation YOK"

ADR-014 PR-11..PR-14 (bu işin ait olduğu runtime cutover):
  governance kayıtlarında NOT AUTHORIZED / not-yet-started
```

Recoverable içerik (canonical display cutover, `report.service.ts`, TBK-100 allocator)
tam olarak **ADR-014 PR-10/11 alanıdır** ve o alan açıkça yetkilendirilmemiştir.

```text
SEMANTIC AUTHORITY : ABSENT
DISPOSITION        : STILL_VALID_RECOVERABLE — RECOVERY BLOCKED / AUTHORITY ABSENT
BRANCH             : PRESERVED (silinmedi, merge edilmedi, dokunulmadı)
WORKTREE           : PRESERVED
```

Bu, `OWNER_WIP_PRESERVED_NO_CURRENT_RECOVERY` **değildir** — kurtarılabilir değer
kanıtlanmıştır; eksik olan **yetkidir**.

## 3. ITEM-03 — Beş owner WIP dispositionu

Hiçbir dosya silinmedi, reset/clean/checkout-overwrite/stash **yapılmadı**.

| # | Worktree | Branch | Unique commit | staged/unstaged/untracked | Disposition |
| --- | --- | --- | --- | --- | --- |
| W-1 | `HUKUK_ver05a_unified_inventory` | `codex/ver-05a-unified-inventory` | 0 | 0 / 2 / 9 | **`ACTIVE_OWNER_WIP`** — `VER-05A` için canonical authority kaydı **yok** (yalnız bu programın kendi register'larında geçiyor). Ayrıca canonical-junction taşır (§FILESYSTEM §2) → çift korumalı. |
| W-2 | `HUKUK_rcv_claim_form_p02_s05_i01` | `codex/rcv-claim-form-p02-s05-i01` | 0 | 0 / 1 / 1 | **`SUPERSEDED_WIP`** — WIP'in eklediği `assertDueCreationAdmission` guard'ı **main'de mevcut** (`case.service.ts:489`, çağrı `:1640`); main ayrıca ikinci bir guard taşıyor. Task `RCV-CLAIM-FORM-P02-S05-I01-GOV` ile **kapatılmış**. Untracked spec main'de yok; main'de `UNSUPPORTED_COMPONENT` kapsayan 5 spec var. Dosyalar **korundu**. |
| W-3 | `HUKUK_rcv_ws04_p03_syn_01` | `codex/rcv-ws04-p03-syn-01` | 0 | 0 / 0 / 2 | **`ACTIVE_OWNER_WIP`** — `WS04-P03` canonical statüsü **`NOT AUTHORIZED / NOT STARTED`**. Recovery yetkisi yok. |
| W-4 | `HY_WT/T5_R02` | `codex/t5-plan-refresh-r02` | 0 | 0 / 2 / 2 | **`UNKNOWN_OWNER_WIP`** — `T5-PLAN-REFRESH-R02` için governance korpusunda **hiçbir kayıt yok**. T5 programı #1667 ile PASS kapandı; bu WIP'in hâlâ geçerli olup olmadığı belirsiz. |
| W-5 | `HY_WT/RUNTIME` | detached `1d042280` | 0 | 0 / 0 / 1 | **`RUNTIME_LOCAL_STATE`** — `Invoke-CanaryAuthProbe.ps1`. UYAP CUTOVER HARD HOLD altında. **`.env` veya secret içeriği okunmadı/kopyalanmadı.** |

```text
RECOVERED ITEMS: 0
```

Beşinin de `no unique commit` özelliği vardır: **tüm değer working tree'dedir**, hiçbiri
commit edilmemiştir. Owner kuralının dokuz recovery şartından `current semantic authority exists`
ve `authority source path exact` **hiçbirinde** sağlanmamıştır.

## 4. Program statüsü

```text
PROGRAM STATUS:
CLOSED / CANONICAL / PASS WITH PROTECTED RESIDUALS
```

`PASS WITH OWNER-GATED RESIDUALS` **kullanılmamıştır** — dokuz kararın tamamı zaten ratifiye
edilmiş ve uygulanmıştır. Kalanlar owner kararı beklemiyor; **teknik veya yetki olarak
imkânsız** oldukları için korunmaktadır.

### 4.1 Protected residuals (yeni owner kararı GEREKTİRMEYEN)

| # | Residual | Exact gerekçe |
| --- | --- | --- |
| P-1 | CCB-001 branch + worktree | Kurtarılabilir değer **var** (21 dosya / 526 satır), fakat ADR-014 PR-11..14 alanı `NOT AUTHORIZED`. Yeni bir GO gerekir. |
| P-2 | 5 owner WIP worktree | `no unique commit`; hiçbirinde exact semantic authority yok. Silinmedi, dokunulmadı. |
| P-3 | 9 canonical-junction dizini | ITEM-04 güvenli sırası her biri için ayrıca uygulanmalı; `ver05a` ayrıca owner WIP. |
| P-4 | ~96 kanıtsız orphan dizin | `maintenance-register`'da "WIP YOK" ibaresi yok → dirty/untracked değer **kanıtla dışlanamıyor**. Kanıtsız silme yapılmaz. |
| P-5 | `project/.worktrees/` (6) + `project/.claude/worktrees/` (8) | `grandfatheredOwnerWipPrefixes` — protected-paths sözleşmesi |
| P-6 | 18 flag deployed value | Owner kararı `OPTION B — UNKNOWN kalsın`. Kapalı bir karardır, açık residual değildir. |
| P-7 | UYAP `DECISION-1`/`DECISION-2` | Parent programdan devralınan, **bu görev tarafından çözülmesi yasaklanmış** semantic kararlar. |

### 4.2 Yeni owner kararı gerektirenler

```text
NEW OWNER DECISIONS REQUIRED: 1
```

**N-1 — `AGENTS.md` §8 metin tansiyonu.** §8, evidence-gated cleanup için istisna cümlesi
taşımadan `.NET Directory.Delete(path,true)` ve `Remove-Item -Recurse` kullanımını yasaklar;
bu görevin owner talimatı ise aynı işlemi ratifiye edip mekanizmayı tarif eder. Uygulama,
yasağın **amacına** (kör/yetkisiz/hedef-takipli imha) uygun yapılmıştır. Metnin bir istisna
cümlesiyle güncellenip güncellenmeyeceği **owner kararıdır** ve bu görevde yapılmamıştır.

## 5. Program boyunca yapılmayanlar

```text
PRODUCTION CHANGES        : NONE
FEATURES ENABLED          : NONE
RUNTIME BINDINGS          : NONE
SCHEMA/MIGRATION CREATED  : NONE
MIGRATIONS APPLIED        : NONE
SECRETS READ OR WRITTEN   : NONE
OWNER WIP DESTROYED       : NONE
STALE BRANCH DIRECT MERGE : NONE
RETROACTIVE AUTHORITY     : NONE
AUTO-MERGE                : OFF
PROTECTED PATH IMPACT     : NONE
```
