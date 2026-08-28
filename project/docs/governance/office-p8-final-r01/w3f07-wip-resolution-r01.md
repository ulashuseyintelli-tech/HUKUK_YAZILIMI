# C26 — W3F07 WIP RESOLUTION R01 (Faz 1 Salt-Okuma Envanteri)

Bu belge C26 gorevinin Faz 0 (kayip onleyici private backup) ve Faz 1 (salt-okuma
WIP envanteri + restore rehearsal) ciktisidir. Hicbir W3F07 mutasyonu icermez ve
hicbir execution yetkisi uretmez.

```text
EXECUTION AUTHORITY: NONE
G4 EXECUTION AUTHORITY: NONE
```

## 1. W3F07 kimligi ve fresh state (2026-08-28, olcum bu oturumda)

```text
SOURCE WORKTREE   = C:/Development/HY_WT/W3F07   (registered git worktree; VERIFIED)
SOURCE BRANCH     = claude/w3-f07-cron-overlap-job-identity-r01
SOURCE HEAD       = 4da92ab1162c64e705e521a002bfd6e97e837166
FRESH STATUS      = 15 tracked-modified + 4 untracked   (beklenen degerle BIREBIR; WIP drift YOK)
STAGED DELTA      = 0   (git diff --cached bos)
COMMITTED DELTA   = 0   (branch tip == HEAD; rev-list count 0)
MERGE-BASE        = merge-base(HEAD, origin/main) == W3F07 HEAD   (PASS)
ANCESTRY          = W3F07_HEAD, origin/main ancestor'i   (PASS)
FRESH MAIN        = 6ec2c8ab6877a996f39e4383258cf74c6e7be85a   (local == origin; drift YOK)
ACIK PR           = 0
LOCK / MERGE-STATE= YOK (index.lock/MERGE_HEAD/REBASE_HEAD/CHERRY_PICK_HEAD/BISECT_LOG yok)
ACTIVE WRITER     = NONE (W3F07 yolunu kullanan process taramasi: yalniz olcum komutunun kendisi)
TRACKED DELTA     = 15 dosya, +1175 / -893 satir; tum tracked modlar 100644 (symlink/special YOK)
```

WIP niteligi: `RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01`.
Tum runtime-bound `@Cron` job'larina (33 adet) deterministik `name` kimligi
(`crypto.randomUUID()` fallback anti-deseninin kaldirilmasi) + canonical
`runWithOverlapGuard` overlap korumasi (tumu `DENY_PARALLEL`) getirir. Ad-hoc
`isProcessing` / `isRunning_X` / `running` flag'leri kaldirilip tek paylasilan
mekanizmaya baglanir.

## 2. Faz 0 backup kaniti

```text
BACKUP ROOT               = C:/Development/HY_EVIDENCE/C26-W3F07-20260828T131059Z/
                            (git repo DISI, registered worktree DISI, reparse-point DEGIL,
                             sync-root DEGIL, yeni ve bos olusturuldu; local-private, PR'a EKLENMEZ)
ICERIK                    = metadata/ (head, branch, status v2 -z bin, status human, worktree list,
                            git version, base-main-shas, paths-with-status, changed-path-inventory.json)
                            + patches/ (tracked-working-tree.binary.patch 118736 B; staged.binary.patch 0 B)
                            + payload/ (19 dosyanin birebir kopyasi, 251687 B)
                            + manifests/ (sha256-manifest.txt + .json)
MANIFEST SHA-256 (txt)    = 9d91c68842176df24b53ad75b9ba67b6eb8ab5930830c8ce16ccca2e4bae9db7
MANIFEST SHA-256 (json)   = a761438cadc4d7de61a9e071966829df5595cff18b48bdc7b2605c5a134ef736
MANIFEST REVERIFY         = PASS (sha256sum -c; eksik/fazla entry YOK)
BACKUP COPY PARITY        = PASS (ikinci bagimsiz gecis: 19/19 hash esit; kaynak=backup 251687 B)
RESTORE REHEARSAL         = PASS (disposable worktree @4da92ab1 → binary patch apply-check + apply
                            → untracked overlay → 19/19 SHA-256/byte parity → status class parity
                            BIREBIR → rehearsal worktree dogrulama SONRASI kaldirildi)
PATH PARITY               = PASS
BYTE/HASH PARITY          = PASS
STATUS CLASS PARITY       = PASS
GIZLILIK TARAMASI         = PASS (payload'da gercek secret/credential YOK; yalniz test-only
                            placeholder ve env-var ISIM referanslari — deger yok)
```

Backup C26 kapsaminda hicbir zaman silinmez.

## 3. Item envanteri — ortak alanlar

Asagidaki alanlar 19 item'in TAMAMI icin ortaktir (tekrar edilmez):

- `FILE TYPE` = regular file (symlink/dizin/special YOK; tracked modlar 100644).
- `BACKUP SHA-256` = `SOURCE SHA-256` (BACKUP COPY PARITY = PASS; tablo 5'te tek kolon).
- `PURPOSE` = W3-F07 cron overlap + job identity kablolamasi (bolum 1'deki tanim).
- `OWNERSHIP EVIDENCE` = dosya basliklarinda ve yorumlarda literal
  `W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01` imzasi; branch adi ile birebir uyum;
  15 tracked dosyada AYNI tek mekanik kalip; yeni dosyalarin tumu ayni program
  basligini tasir. Sahiplik siniflari tablo 4'te.
- `SECURITY/PRIVACY CLASS` = NONE (secret/kisisel veri yok; bolum 2 taramasi).
- `PROTECTED-PATH/CLASSIFIER ROUTE` = 19 path'in tumu `project/apps/api/src/` altinda
  uygulama kodu; governance protected-path DEGIL. Port PR'lari feature-code PR
  rotasindan gider; fresh classifier sonucu port aninda esastir.
- `SPLIT ANALIZI` = Hicbir dosyada karisik/bagimsiz ikinci amac tespit edilmedi
  (hunk'lar tek amacin parcalari: import + `@Cron` name + guard sarmasi + eski
  flag temizligi). `SPLIT_REQUIRED` YOK; child-hunk kimligi uretilmedi.
- `OWNER DISPOSITION` = tumu icin literal: **PENDING_OWNER — NOT AUTHORIZED IN PHASE 1**
  (tablo 4'te ayrica item basina yazilmistir).

Cron kimlik sayimi capraz dogrulamasi: 15 serviste toplam **33 named `@Cron`**
== `SCHEDULER_JOB_REGISTRY_COUNT = 33` (iki bagimsiz sayim esit). `@Cron(`
metin eslesmelerinin fazlasi yorum/doc satiridir (scheduler.service.ts'te 4,
greeting.service.ts'te 1 yorum eslesmesi); GERCEK bagli decorator'larin tamami
`name` tasir.

## 4. Item tablosu ve disposition durumu

| ID | Repo-relative path | Status | Anchor (jobId / sembol) | Sahiplik | Main drift | Porting riski | Onerilen aksiyon | Owner disposition |
|---|---|---|---|---|---|---|---|---|
| W3F07-I01 | project/apps/api/src/common/__tests__/w3-async-runtime-binding.static-guard.spec.ts | M | `describe('W3-F07 — cron overlap + job identity guard')` [21]–[26] | W3F07_SUPPORTING_TEST | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I02 | project/apps/api/src/modules/address-task/address-task-scheduler.service.ts | M | AddressTaskSchedulerService.{checkOverdueTasks, checkAnnualRefreshTasks, publishOutboxEvents} (3 job) | W3F07_CORE | VAR (66c9271d) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I03 | project/apps/api/src/modules/automation/automation.service.ts | M | AutomationService.* (8 job); `isProcessing` flag kaldirilir | W3F07_CORE | VAR (66c9271d) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I04 | project/apps/api/src/modules/error-log/retention/error-log-retention.service.ts | M | `errorLogRetention` (legacy name KORUNUR) | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I05 | project/apps/api/src/modules/escalation/case-task-escalation.service.ts | M | CaseTaskEscalationService.scheduledRun | W3F07_CORE | VAR (0e0a0aeb) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I06 | project/apps/api/src/modules/escalation/operational-escalation.service.ts | M | OperationalEscalationService (1 job) | W3F07_CORE | VAR (0e0a0aeb) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I07 | project/apps/api/src/modules/exchange-rate/exchange-rate.service.ts | M | ExchangeRateService.scheduledRateUpdate | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I08 | project/apps/api/src/modules/greeting/greeting.service.ts | M | GreetingService.greetingSchedulerTick | W3F07_CORE | VAR (0e0a0aeb) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I09 | project/apps/api/src/modules/icrabot/v28-engine/outbox-cron.service.ts | M | OutboxCronService.processOutboxActions; `running` flag kaldirilir | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I10 | project/apps/api/src/modules/interest-engine/rate-sync.service.ts | M | RateSyncService.{syncTcmbRates, syncMonthlyMevduatRates} (2 job) | W3F07_CORE | VAR (66c9271d) | ORTA | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I11 | project/apps/api/src/modules/office-approval/office-approval-executor-cron.service.ts | M | `officeApprovalExecutor` (legacy name KORUNUR); C-F01 hedef dosyasi | W3F07_CORE | YOK | DUSUK (G4 komsulugu: yalniz kayit) | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I12 | project/apps/api/src/modules/policy-engine/decision-logger/decision-log-retention.service.ts | M | DecisionLogRetentionService.archiveOldRecords | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I13 | project/apps/api/src/modules/policy-engine/deprecated-usage-tracker.service.ts | M | DeprecatedUsageTrackerService.{generateDailyReport, flushBuffer, cleanupOldRecords} (3 job) | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I14 | project/apps/api/src/modules/scheduler/scheduler.service.ts | M | SchedulerService.* (8 job); 6 `isRunning_X` flag kaldirilir | W3F07_CORE | VAR (66c9271d) | ORTA-YUKSEK (en buyuk delta, 603 satir) | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I15 | project/apps/api/src/modules/tariff/gazette-watcher.service.ts | M | GazetteWatcherService.checkGazette | W3F07_CORE | YOK | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I16 | project/apps/api/src/common/__tests__/w3-f07-cron-overlap-identity-runtime.db-gated.integration.spec.ts | ?? | runtime-matrix A–G senaryolari (gercek AppModule bootstrap + SchedulerRegistry, disposable Postgres) | W3F07_SUPPORTING_TEST | YOK (main'de path yok) | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I17 | project/apps/api/src/common/scheduler-job-registry.ts | ?? | `SCHEDULER_JOB_REGISTRY` (33 job envanteri) + `SCHEDULER_JOB_REGISTRY_COUNT = 33` | W3F07_CORE | YOK (main'de path yok) | ORTA (sayim fresh main'e karsi YENIDEN dogrulanmali) | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I18 | project/apps/api/src/common/scheduler-overlap-guard.spec.ts | ?? | DB-free birim testi: RAN / SKIPPED_ALREADY_RUNNING / parallel deneme | W3F07_SUPPORTING_TEST | YOK (main'de path yok) | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |
| W3F07-I19 | project/apps/api/src/common/scheduler-overlap-guard.ts | ?? | `runWithOverlapGuard(jobId, fn)` + `isJobCurrentlyRunning` + test reset (DI'siz duz fonksiyon idiomu) | W3F07_CORE | YOK (main'de path yok) | DUSUK | PORT_TO_PR (GROUP P1) | PENDING_OWNER — NOT AUTHORIZED IN PHASE 1 |

Bayatlik degerlendirmesi: origin/main'de bu servislerin GERCEK bagli
decorator'larinda `name` HALA yok (orn. scheduler 0/8, automation 0/8,
greeting 0/1; yalniz 2 miras ad `errorLogRetention` / `officeApprovalExecutor`
mevcut). W3-F07'nin cozdugu UUID-kimlik problemi fresh main'de AYNEN durmaktadir
→ WIP semantik olarak BAYAT DEGIL; yalniz C15 drift reconciliation gerektirir.

## 5. SHA-256 tablosu (source = backup; parity PASS)

| ID | Bytes | SHA-256 |
|---|---|---|
| W3F07-I01 | 33892 | d84348fc901180fb410adff3d40b7f0951e8cfb29bf5df6cf2c0d6b0f8b3dc7b |
| W3F07-I02 | 11198 | 2cd9698ee636bce9fd97a99b68ed6dad11fcc08ff68e16a44469c7075eff7a39 |
| W3F07-I03 | 19424 | e1f4a0d8c4e2b57fb4a5d13799a8abb91a76a19e45bc6fcf17ae04aab11ee0a2 |
| W3F07-I04 | 6314 | 17d0a1ef80c95d3e1089e51a2fb36ddcbc75bcad9f8552a957484e7181541edd |
| W3F07-I05 | 14841 | ad99c8ace2c3bc3d1501efc6d385e258d75ee0c86a5328149fca177ccb353058 |
| W3F07-I06 | 22061 | d6780ac5d5957cebf8b9fc64b96e6a642d8280c46380a7624d033bbe220b00b8 |
| W3F07-I07 | 8042 | 9ebe875cfaab02c22b4b23cb5d2f4003ab1f0646869bfcf6559c9c7c814bca9c |
| W3F07-I08 | 19657 | a90691fd67e99ed113d93a493eca7f541e34f42a9c0aff1fc1353c0d7ef0968a |
| W3F07-I09 | 2827 | 49fcc558d0280a34a5b2edbb8ff2d5319f8b29b462c38e3592ea224fbb14a596 |
| W3F07-I10 | 16085 | 0a007278e8047136e57eda628b5cfd0872d528e139d986b2c06908bb9655c7a5 |
| W3F07-I11 | 9369 | ebec638ab5797c57452342f1971962c19da7696aaa22ac33bafd5f54d70cb039 |
| W3F07-I12 | 6888 | bdae5a323cb39b96cd0b87d072a391f1418e335cc73ddfac153848ea0d020c0b |
| W3F07-I13 | 10273 | 7241e3f79db2936650948a6a99580808c3bf199db5e9b1907d845de9695f19b8 |
| W3F07-I14 | 34479 | a7fc3a116efd10da29669429e1275977339a71508aaac31d22a34900aa46ceec |
| W3F07-I15 | 6952 | 12f46d5069a7df6cef57e14969a0d115b18b230de6eeefe1a92ca4da707d7436 |
| W3F07-I16 | 8441 | 1be44527a3e284c7956c1499b0c48f402359f5b01124f614a9ec5d1c8a86d2f2 |
| W3F07-I17 | 12101 | f51aeed1dec15702404667cdee6de33824d0eea10ba9e64cca345f912e7c97ff |
| W3F07-I18 | 5155 | 292ca8fbc3a8e789ef6576f91731b3dff12f35a5442372f9cf64ebac634808e7 |
| W3F07-I19 | 3688 | b11ef0e66a5d39a880021ca57760830757a50afbe7f88f748a4a59f79a864483 |

## 6. Main drift tablosu (4da92ab1..origin/main; 19 path uzerinde)

| Path (item) | Main'de degisim | Kaynak commit(ler) | Nitelik |
|---|---|---|---|
| I02 address-task-scheduler | VAR | 66c9271d (#2457 C15 PR-4A) | Tenant lifecycle enforcement; +5/-1 |
| I03 automation | VAR | 66c9271d (#2457) | Tenant lifecycle; +7/-1 |
| I05 case-task-escalation | VAR | 0e0a0aeb (#2455 C15 PR-2) | Tenant lifecycle; +8/-1 |
| I06 operational-escalation | VAR | 0e0a0aeb (#2455) | Tenant lifecycle; +8/-1 |
| I08 greeting | VAR | 0e0a0aeb (#2455) | `ACTIVE_TENANT_WHERE` import + query-level `where` (sorgu ici) |
| I10 rate-sync | VAR | 66c9271d (#2457) | Tenant lifecycle; +7/-1 |
| I14 scheduler | VAR | 66c9271d (#2457) | Tenant lifecycle; +14/-0 |
| Diger 8 tracked (I01, I04, I07, I09, I11, I12, I13, I15) | YOK | — | — |
| 4 untracked (I16–I19) | YOK (path main'de mevcut degil) | — | Temiz ekleme |

Drift'in TAMAMI C15 tenant-lifecycle-enforcement programindandir (toplam +44/-5;
kucuk, W3-F07 ile SEMANTIK olarak ortogonal: tenant eleme sorgu-seviyesi, W3-F07
entrypoint-seviyesi). ANCAK ayni metod govdelerine/dosyalara dokundugu icin
TEXTUAL conflict olasidir; kor patch apply YASAKTIR. Porting plani:
`FRESH MAIN + OWNER-RATIFIED ITEM'LAR + CURRENT ARCHITECTURE RECONCILIATION +
SEMANTIC INTENT PRESERVATION` (iki mekanizma birlikte yasar: guard sarmasi
tenant-eleme sorgularini DEGISTIRMEZ). I17 registry'nin `33` sayimi ve
`legacyName` istisnalari port aninda fresh main'e karsi YENIDEN olculur
(C15 yeni cron eklemis/kaldirmis olabilir); sayim degisirse static-guard
[21]–[26] gate'i FAIL eder ve fark checkpoint'e tasinir — bu MATERIAL uyarlama
sayilir ve owner'a gosterilmeden port merge edilmez.

## 7. Test ve authority rotalari

- Mevcut kapsam (WIP icinde): I18 DB-free birim spec (normal run / duplicate
  start / parallel deneme — mekanizma kaniti); I16 db-gated runtime spec
  (runtime-matrix A–G: duplicate start, restart, parallel, graceful shutdown,
  re-registration — gercek bootstrap + disposable Postgres); I01 static-guard
  [21]–[26] (registry↔kaynak cift yonlu tamlik). Concurrency/idempotency kapsami
  MEVCUT — yalniz happy-path DEGIL.
- Targeted komutlar (port PR'inda): `scheduler-overlap-guard.spec.ts` (DB-free)
  + static-guard spec (`w3-async-runtime-binding.static-guard.spec.ts`) +
  db-gated spec (disposable Postgres, port 5433 Docker prosedürü).
- CI wiring riski: yeni spec dosyalarinin CI manifest/allowlist kapsamina girip
  girmedigi port PR'inda AYRICA dogrulanmali (dar allowlist'te yeni spec'in CI'da
  HIC kosmamasi bilinen bosluktur). Kosmayan gate yesil sayilmaz.
- Full CI: runtime davranisi degistigi icin port PR'lari full required-CI + fresh
  classifier rotasindan gecer.
- Authority rotasi: 19 path'in tumu uygulama kodu (governance protected-path
  DEGIL). Port PR'lari standart feature-code PR'idir; bu belgeye receipt append
  etmek disinda governance-write gerektirmez.

## 8. Onerilen porting gruplari

**GROUP P1 = I01–I19 (TEK PR).** Gerekce: static-guard [23]/[25]/[26] iddialari
registry ↔ kaynak kablolamasini CIFT YONLU baglar — core mekanizma (I17/I19)
wiring'siz merge edilirse [25]/[26] FAIL eder; wiring registry'siz merge edilirse
import cozulmez. 19 dosya SEMANTIK olarak atomiktir; bolmek yapay kirilma ve
iki kez full-CI maliyeti uretir. Owner isterse alternatif bolme (P1a: I16–I19 +
I01 core/test; P1b: I02–I15 wiring) MUMKUN DEGILDIR — P1a tek basina static-guard
[25] bidirectional tamlik testini FAIL eder; bu nedenle tek grup onerilir.

## 9. Worktree ve branch end-state secenekleri (owner karari)

- WORKTREE: `REMOVE_AFTER_VERIFIED_CONSUMPTION` (tum item'lar port/discard ile
  tuketildikten, status clean dogrulandiktan sonra yalniz canonical
  `git worktree remove` yolu; basarisizlikta ORPHANED bildirimi, fiziksel
  recursive silme YASAK) **veya** `PRESERVE_ACTIVE_WIP` (competing-writer surer;
  C26 = BLOCKED_DEFERRED_WIP, G4 bloke kalir).
- BRANCH: `DELETE_AFTER_VERIFIED_CONSUMPTION` (unique committed delta = 0
  oldugundan branch silme veri kaybetmez; yalniz worktree guvenli kaldirildiktan
  ve port'lar canonical dogrulandiktan sonra) **veya** `PRESERVE_ARCHIVED_REFERENCE`.

## 10. Owner ratifikasyon formati (Faz 2 tek kullanimlik yetki)

```text
C26 OWNER DISPOSITION RATIFICATION:

PORT_TO_PR:
- GROUP P1 = [exact item ID'leri]

DISCARD_BACKED_UP:
- [exact item ID'leri veya NONE]

DEFER_PRESERVE:
- [exact item ID'leri veya NONE]

WORKTREE END STATE:
- REMOVE_AFTER_VERIFIED_CONSUMPTION | PRESERVE_ACTIVE_WIP

BRANCH END STATE:
- DELETE_AFTER_VERIFIED_CONSUMPTION | PRESERVE_ARCHIVED_REFERENCE

RATIFICATION: APPROVED
```

Listelenmeyen item karara baglanmis sayilmaz. Bu belge ve PR1 hicbir Faz 2
execution, G4 / C-F01, CLF-O0-01, D13 veya P8 FINAL yetkisi uretmez.
