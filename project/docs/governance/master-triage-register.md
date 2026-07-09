# Master Triage — Canonical Register

**Durum:** Living document — kanonik, tekilleştirilmiş, çok-turlu konsolidasyon.
**Son güncelleme:** 2026-07-09 (VER-10+ governance verification reconcile)
**Kaynak birleştirmeler:**
1. Orijinal Master Triage (25 export, ~343 ham kayıt) — 2026-07-04 GO-ANALYZE konsolidasyonu
2. PB-01..09 / VR-01..14 / WQ-01..07 batch (kalan ~6 sayfa konsolidasyonu)
3. PAYOUT-CPB-01..07 / VER-01..04 / WQ-01..02 batch

Bu dosya `CLAUDE.md`'nin governance akışına (`Yeni fikir → Triage → Product Backlog → READY → Active Roadmap → Implementation`) paralel, ayrı bir **triage/register** katmanıdır — `active-roadmap.md`/`product-backlog.md`/`decision-log.md` ile birlikte okunmalıdır, onların yerine geçmez.

**Kullanım kuralı:** Bu dosyadaki hiçbir kayıt doğrudan doğru kabul edilmez. Bir kayıt üzerinde çalışılmadan önce repository güncel durumu son otoritedir; kayıt zaten kapanmışsa veya değişmişse bu dosya güncellenir. **POST-MERGE GOVERNANCE CHECK** (bkz. `decision-log.md` 2026-07-04 kaydı) her GO-COMPLETE sonrası bu dosyaya yansıtılmalıdır — aksi halde kayıtlar "zombie archive/backlog" haline gelir (bkz. ARC-05 vakası, Bölüm E).

**Sync notu (2026-07-09, GOV-REGISTER-SYNC-001):** Bu dosya Master Triage indeksidir; Product Backlog, Decision Log ve Canonicalization Register karşısında tek başına otorite değildir. `MVR-*` namespace'i bu governance dosyalarında kanonik değildir; verification kayıtlarının kanonik namespace'i `VER-*` olarak korunur. `CCB-001` Master Triage kapsamına taşınmaz: canonical claim balance clean-break implementation authority `product-backlog.md` içindeki `CCB-001` kaydıdır; `canonicalization-register.md` içindeki `CAN-CUT-02` bu workstream altında milestone olarak izlenir.

**Alias notu (2026-07-09, VER-09 / OWN-02 remediation):** "MVR-009 Route Drift Remediation" ifadesi bu register'da yeni bir `MVR-*` kaydı açmaz. Bu işin repo-doğrulanmış kapsamı runtime patch değil, `VER-*` kanonik namespace'i ile Owner Decision bookkeeping arasındaki governance drift düzeltmesidir. `VER-09` aşağıdaki tabloda escalation fallback doğrulaması olarak kalır; route-drift/P2 observe bookkeeping ile karıştırılmaz.

**Verification reconcile notu (2026-07-09, VER-10+):** "MVR-010+" bu register'da kanonik namespace değildir; doğru namespace `VER-10+` olarak kalır ve yeni `MVR-*` namespace'i açılmaz. Bu reconcile runtime drift bulmadı; yalnız repo kanıtıyla kapanan/stale kalan verification kayıtlarını governance bookkeeping olarak ayrıştırır. Canlı ortam, DB apply, process, owner/local-WIP veya product-decision gerektiren kayıtlar otomatik kapatılmaz.

---

## A. Master Product Backlog (ACTIVE)

| ID | Domain | İş | Öncelik | Not |
|---|---|---|---|---|
| **ACT-24** | UI | Approval Inbox'a CLIENT_PAYOUT_POST summary projector eklenmesi | Low | 3. batch (PAYOUT-CPB-01), henüz ele alınmadı |
| **ACT-25** | Accounting | ClientPayoutService.create() dead-code kararı + test suite finalize()'a taşıma | Low | 3. batch (PAYOUT-CPB-02), henüz ele alınmadı |
| **ACT-28** | Alacak Kalemi | Collection/LedgerEntry/LedgerAllocation üç-otorite reconciliation (PAID_DELTA kök nedeni) | Orta-Yüksek | 4. batch (CPB-2) — GO-ANALYZE onaylandı: ALC-AUTH-3D yalnız guard-seviyesi otoriteyi (frontend hangi listeyi dinliyor) birleştirdi, PAID_DELTA'ya yol açan alttaki veri-kaynağı çakışmasına hiç dokunmadı. ⚠️ ALC-AUTH-* isim-alanına ait, cross-reference. **Sıradaki adım: (VR-2 zaten bu turda cevaplandı) GO-ANALYZE (owner talimatı bekliyor).** ⚠️ **İSİM-ÇAKIŞMASI DÜZELTMESİ (2026-07-05):** bkz ACT-27 notu — "ALC-AUTH-4/5" tahmini bu madde için de geçersiz, "ALC-AUTH-4A/4B/4C" başka bir konuya (sign-off/rollout) atandı; bu üç-otorite reconciliation konusu hâlâ numarasız. |

### Owner-Gated / Future / Decision-Split

| ID | Domain | İş | Durum | Not |
|---|---|---|---|---|
| ACT-20 | OCR | Instrument identityNo taşıma (uzun vade) | OWNER-GATED / FUTURE / HOLD | GO-ANALYZE ile owner-gated/A1-d-bağımlı bulundu (2026-07-05). A1-d ciro zinciri sırası owner tarafından HOLD; ciranta için OCR kimlik çıkarımı yok; ACT-19 kapsam kilidi nedeniyle güvenli dar implementasyon yolu yok. A1-d epic'i owner tarafından açıldığında yeniden değerlendirilir. |
| ACT-23 | Debtor | `setPrimaryAddress()`/`deleteAddress()` genişletme adayı | OWNER_DECISION_REQUIRED | ARC-07 ile çakışma riski sürüyor; ClientAddress backfill owner tarafından bilinçli kapsam dışı bırakılmıştı. Implement öncesi owner teyidi gerekir. |
| ACT-27 | Alacak Kalemi | Principal current/original semantic split | DECISION_CLOSED / IMPLEMENTATION_NEEDED | Semantik karar verildi: `principalAmount` = kalan/current anapara; başlangıç takip anaparası ayrı `originalPrincipalAmount`/`initialPrincipalAmount` alanı ile temsil edilir. Kod/schema/migration yapılmadı; gerçek implementasyon ayrı GO-IMPLEMENT ve derin GO-ANALYZE gerektirir. |

**KAPANMIŞ/MERGED (ACTIVE'den çıkarıldı, bkz. Bölüm D — Closed Register):** ACT-01 (CLOSED/INVALID/Zombie), ACT-02, ACT-03, ACT-04, ACT-05, ACT-06 (CLOSED/Zombie-Active — bkz. altta), ACT-07 (MERGED — bkz. altta), ACT-08 (MERGED — bkz. altta), ACT-09 (MERGED — bkz. altta), ACT-10 (MERGED — bkz. altta), ACT-11 (MERGED — bkz. altta), ACT-12 (MERGED — bkz. altta), ACT-13 (MERGED — bkz. altta), ACT-14 (MERGED — bkz. altta), ACT-15 (MERGED — bkz. altta), ACT-16 (MERGED — bkz. altta), ACT-17 (MERGED — bkz. altta), ACT-19 (MERGED — bkz. altta), ACT-21 (MERGED — bkz. altta), ACT-22 (MERGED — bkz. altta), ACT-26 (CLOSED/Zombie-Active — bkz. altta).

**ACT-18 → OWNER_DECISION/PAUSED olarak yeniden sınıflandırıldı (2026-07-05, bkz. Bölüm H, OWN-30).** ACTIVE listesinden çıkarıldı — Closed DEĞİL (henüz kapanmadı, owner'ın "dönebilirim" dediği anı bekliyor).

**Not (ACT-27/28 bağlamı — ALC-AUTH-* isim-alanı):** `product-backlog.md`'de paralel bir oturum tarafından yürütülen ayrı bir ALC-AUTH-* zinciri var (bu kanonik dosyanın izlemediği bir namespace, `decision-log.md`'nin kendi 2026-07-05 kaydında açıkça belirtildiği gibi). Kısa özet: ALC-AUTH-3B (`totalDebtAmount.grossPrincipal` plumbing, PR #917 MERGED) → ALC-AUTH-3D (guard authority alignment — frontend artık kendi `HARD_NO_GO_CODES`'unu değil backend `cutoverReadiness`'ini dinliyor, PR #922+#925 MERGED, FINAL) → ALC-AUTH-3E (cost/attorney-fee understatement suppress, PR #929 MERGED, "B1/guarded-primary-pilot ekseninde bilinen son blocker kapandı"). Guarded primary pilot flag hâlâ varsayılan KAPALI (rollout ayrı owner kararı). ACT-27 (principal gross/net) ve ACT-28 (üç-otorite reconciliation) bu zincirin HİÇBİRİNDE ele alınmadı — gerçek GO-IMPLEMENT'leri muhtemelen ALC-AUTH-4/5 olarak `product-backlog.md`'de devam edecek.

---

## B. Master Verification Required

| ID | Konu | Öncelik | Not |
|---|---|---|---|
| VER-02 | Client çok-adres UI çelişkisi (eski sayfa vs ClientAddress closure) | Yüksek | Henüz doğrulanmadı |
| VER-03 | Faz1B FU1 ↔ Faz7 müvekkil-muhasebesi read-model entegrasyon ihtiyacı | Orta | Henüz doğrulanmadı |
| VER-04 | #636 sonrası Hesap Özeti aggregate follow-up ihtiyacı | Düşük | Henüz doğrulanmadı |
| VER-05 | ClaimItem/Due reconciliation kapsamı | Orta | Henüz doğrulanmadı |
| VER-06 | Client.update() lifecycle-gate bypass (#827 CBND-6 ilişkisi) | Orta-Yüksek | Henüz doğrulanmadı |
| VER-07 | icrabot action-executor PASSIVE CaseDebtor kontrolü iddiası | Düşük | Henüz doğrulanmadı |
| VER-08 | case-compare-modal.tsx `d.type==='REAL'` DebtorType enum uyumsuzluğu | Düşük-Orta | Henüz doğrulanmadı |
| VER-09 | Escalation FOUNDER/MANAGER fallback bug'ının resmî backlog kaydı var mı | Orta | Henüz doğrulanmadı — bu kayıt "MVR-009 Route Drift" alias'ı değildir; route-drift/P2 observe bookkeeping düzeltmesi ayrı governance-only remediation olarak kapatıldı |
| VER-10 | Senet/bono arka-yüz OCR endorsement canlı doğrulama | Düşük-Orta | Açık — PR/merge zinciri mevcut olsa da kayıt "canlı doğrulama" istiyor; canlı dataset/evidence olmadan kapatılmaz |
| VER-12 | 3 duplike `nest start --watch` süreci kasıtlı mı terkedilmiş mi | Düşük | Açık — process command-line incelemesi güvenlik/owner izni gerektirir; repo ağacından kapanmaz |
| VER-13 | PR #406/#407 mergeStateStatus canlı teyidi | Orta | Açık — PR #406 OPEN/UNKNOWN görüldü; PR #407 için dış metadata doğrulaması owner/açık izin gerektirir |
| VER-14 | Journal migration #645 + FAZ-1b migration 20260630120000 DB apply durumu | Yüksek | Açık — migration dosyaları repo'da var; DB apply durumu repo ağacından kanıtlanamaz |
| VER-16 | 6 codex/* local branch stale/aktif durumu | Düşük | Açık — branch/worktree hijyeni ayrı bakım/owner-local context gerektirir |
| **VER-20** | pnpm store diğer paketler content-eksikliği | — | 2. batch (eski VR-01) |
| **VER-21** | Diğer worktree'ler paylaşımlı pnpm store'dan etkilendi mi | — | 2. batch (eski VR-02), VER-20'ye bağımlı |
| **VER-22** | Promote-ekranı nav-girişi eksik mi (→ ACT adayı) | — | Açık / product-decision split — `/client-intake` sidebar var ve promote route mevcut; detail sayfasında promote bilinçli yok. Yeni ACT açılacaksa owner/product kararı gerekir |
| **VER-23** | CS1-5 (Case domain) hangi sayfaya devredildi | — | Açık — doğrudan yeterli devir kanıtı çıkmadı |
| **VER-25** | Mevcut WIP hangi sayfaya ait | — | 2. batch (eski VR-06) — ⚠️ kısmi gözlem var (MPB-027/AddressTask), bağımsız teyit yok |
| **VER-26** | H1-H7+P4 Office Approval UI+TBK100 zinciri MERGED mi | — | 2. batch (eski VR-07) — **P4 Office Approval FE parçası ZATEN DOĞRULANDI** (bkz. ARC-05, Bölüm E): PR #823+#832 MERGED. H1-H7/TBK100 parçası hâlâ ayrı doğrulama gerektiriyor. |
| **VER-27** | `authz-workstream-handoff` OWN-01 notu bu sayfaya mı ait | — | Açık — finance ADR cross-reference var; docs-only açıklama/cross-ref kararı gerekir |
| **VER-29** | Migration deploy sorunsuz mu | — | 2. batch (eski VR-10), WQ (migrate deploy) çalıştırıldıktan sonra anlamlı |
| **VER-33** | Orphaned worktree içerik teyidi | — | 2. batch (eski VR-14), WQ (orphan-cleanup grubu) öncesi gerekli |
| **VER-36** | `dbind-financial-authority-decisions.md` §5'e çapraz-referans eklenmeli mi | — | Açık / docs-only follow-up — DBIND §5 ve OWN-29 riski mevcut; cross-reference ekleme ayrı dar governance patch olabilir |

**KAPANMIŞ (bu bölümden çıkarıldı, bkz. Bölüm D):** VER-01 (Disposition-POST authz) CLOSED. VER-11/15/17/18/24/28/30/31/34/35 (VER-10+ reconcile, repo kanıtıyla CLOSED/stale-local). VER-19 → OWN-24'e taşındı (aşağıda). VER-32 (eski VR-13, PR #890) → yukarıda not düşüldü, fiilen CLOSED.

---

## C. Master Workflow Queue

### PENDING

| İş | Bağımlılık |
|---|---|
| CLEANUP-A: build → PR → CI → merge → cleanup → main sync | Sırasıyla |
| Codex ACCT-1 sonrası: tsc + targeted api spec | ACCT-1 tamamlanması (Codex) |
| ADR-010 amendment sonrası: docs PR + CI + merge | OFFSET kararı sonrası |
| Trial Balance FE sonrası: targeted vitest/tsc + web E2E | Backend hazır olunca |
| ACCT-5B canlı tarayıcı smoke-test | — |
| Vekalet drawer canlı UX doğrulaması | — |
| Disposition→payout→offset canlı E2E smoke | ROLL-001/002 öncesi |
| **Worktree orphan-dizin temizliği (toplu, owner-manuel)**: `HUKUK_client_workspace`, `HUKUK_debtor_lifecycle_hardening`, `HUKUK_faz1b_backfill_apply`, `HUKUK_acct5b_financial_statement_panel`, `HUKUK_client_address_ui`, `HUKUK_lawyer_office_approval_ui` (2. batch), `HUKUK_staff_prepare_disposition` (2. batch), `HUKUK_d6-debtor-notification` (2. batch, VER-33 önce gerekli), `HUKUK_alc-auth-total-debt-contract` (4. batch, WQ-1) | Junction-audit önce |
| Rutin `git fetch` + `main==origin/main` taze kontrolü (her yeni sayfa öncesi) | — |
| **[Ultra-tier, owner GO gerekir]** `canPrepareCollectionDisposition` → `prisma migrate deploy` (paylaşımlı `hukuk_db`) | 2. batch (eski WQ-02) |
| **Canonical main fast-forward** — başka oturumun local commit'leri (`89e119cd`/`7d338bf0`, "Merge origin/main into main"/"MPB-027 closure") nedeniyle `git merge --ff-only` diverged hatası veriyor; dosya-WIP değil, gerçek git-tarihçesi ayrışması. Diğer oturum kendi işini reconcile/push edince kendiliğinden çözülür, o zamana kadar dokunulmaz. | 3. batch (PAYOUT-WQ-02) ile AYNI kayıt — dedupe edildi |
| `balance-shadow-diff-panel` testinin sonraki PR'larda izlenmesi | 2. batch (eski WQ-06) — ⚠️ **doğrudan kanıtlandı**: bu test (`balance-shadow-display.test.tsx`) PR #408 ve PR #902'de iki bağımsız kez flake oldu, ikisinde de rerun'la 4/4 PASS'e döndü. Kararsızlık gerçek. |
| 3× ORPHANED_WORKTREE_DIR manuel owner temizliği (isimler bu export'ta belirtilmemiş) | 3. batch (PAYOUT-WQ-01) — isim netleşince yukarıdaki toplu listeye katılacak |

### DONE

- PR #511/#513 zinciri (P2b-2, K1-1) — tamamlandı
- Borçlu forensic zinciri (#396/#398/#401/#402/#405) — tamamlandı
- OCR zinciri (#301/#305/#313/#316) — tamamlandı
- PR #669 (POA persistence) — tamamlandı
- **PR #408 (G1, orientation-robust endorsement extraction)** — GO-COMPLETE bu oturumda: KONKORDATO kontaminasyonu + toFixed guardrail ihlali düzeltildi (fix `e120ad9b`), squash → `01de4881` MERGED

### CANCELLED

*(yok)*

---

## D. Closed Register

| Kayıt | Kapanış Kanıtı |
|---|---|
| PR #511/#513, #669, #301/#305/#313/#316, #396/#398/#401/#402/#405 zincirleri | Workflow Queue DONE — **bu oturumda 12/12 `gh pr view` ile MERGED + örneklem ancestry doğrulandı** |
| Portal client.update() C0 audit bypass | **Bu oturumda doğrulandı**: portal.service.ts 3× tx+audit birlikte, bypass kalmamış |
| ClientAddress multi-address altyapısı (schema+service+Workspace UI) | Memory: `clientaddress-multi-address-closure` — MERGED+deploy (not: VER-02'deki *ayrı* eski-sayfa bug'ını kapatmaz) |
| **VER-01 (Disposition-POST authz)** | `disposition-post-authz-gap-confirmed` — 2× bağımsız re-confirmed |
| **ACT-01 (Scheduler NAFAKA DueType fix)** | CLOSED/INVALID/Zombie-Backlog — `codex-domain-boundary-no-drift` |
| **ACT-02 (SMTP/SMS secret encryption-at-rest)** | PR #883 → `3d5c4787` MERGED |
| **ACT-03 (OCR G2 region detection)** | PR #888 → `1f61edee` MERGED |
| **ACT-04 (OCR G3 classifier)** | PR #891 → `baeecbe9` MERGED (KONKORDATO Master-Triage kontaminasyonu tespit+düzeltildi) |
| **ACT-05 (OCR G4 completeness scoring)** | PR #918 → `6a7ab240` MERGED (§3.4 birebir: CIRO sayısı + eksik-düğüm-riski OK/LOW; §3.5/§3.6'ya taşınmadı, Round-2 bağımlılığı yok) |
| **ACT-06 (ROLL-001 Expense Advisory Lock + ROLL-002 UYAP Gate reconciliation)** | ⚠️ **ZOMBIE-ACTIVE olarak tespit edildi (GO-ANALYZE, 2026-07-04)**: kayıt ACTIVE/"dormant" görünüyordu ama repo'da her iki alt-kalem de zaten MERGED bulundu. ROLL-001 → PR #799 (`abcaf5dc`, disposition APPLY lock) + PR #804 (`136c36fd`, collection-reversal REVERSAL lock), her ikisi 2026-07-02. ROLL-002 → PR #811 (`8f2a55d1`, isUyapBlockedLegacy↔checkGate reconciliation), 2026-07-02. Üç PR de bağımsız (aynı flag'e değiniyor ama farklı dosya/kaygı, sıralı bağımlı değil, S8-B FAZ-1b rollout'unun parçası). Kod: `clientOffsetLockKey()` 3 call-site'ta wire edilmiş (client-offset/disposition-posting/collection-reversal.service.ts), `expense-gate.service.ts` satır 151-158'de "ROLL-002 kapanır" yorumu. |
| **ACT-16 (strategic-backlog.md → product-backlog.md içerik migration)** | MPB-026 kapsamında kapatıldı: legacy `strategic-backlog.md` SB-001..SB-013 kayıtları `product-backlog.md` içine `Migrated Strategic Backlog (MPB-026)` olarak taşındı; legacy dosya tarihsel/superseded olarak işaretlendi; governance README kanonik talimat drift'i düzeltildi. |
| **ACT-07 (Vekalet Süresi Uyarısı office-level ayar)** | PR #931 → `666faaf4` MERGED. Owner-onaylı Kapsam A (E-POSTA-ONLY): `Office.poaExpiryNotificationEnabled`/`poaExpiryThresholdDays`/`poaExpiryRecipientLawyerIds` (additive migration, owner-onaylı local-dev-DB apply) + `PoaExpiryRecipientSource.OFFICE_OVERRIDE`. SMS/kanal genişletmesi kapsam DIŞI — OWN-20 ayrı owner kararı olarak kalmaya devam ediyor. GET/PUT `poa-expiry-settings` (iik78/escalation ile aynı desen). 28/28 test PASS. |
| **ACT-08 (address-task-scheduler PASSIVE CaseDebtor guard)** | PR #940 → `86a8c77a` MERGED. GO-ANALYZE'de doğrulandı: BORCLU-GATE serisi (PR #396/#398/#402/#405) bu scheduler'ı bilinçli olarak dışarıda bırakmıştı (PR #402: "forensic P2-B, ayrı gate"). `CaseDebtorLifecycleGuardService.isPassiveByCaseAndDebtor()` (throw-etmeyen boolean varyant) eklendi + `checkOverdueTasks()`/`checkAnnualRefreshTasks()` artık pasif dosya borçlusu için sessizce atlıyor. 17/17 test PASS. |
| **ACT-17 (Worktree-remove runbook revizyonu)** | PR #943 → `7e83b93b` MERGED. GO-ANALYZE'de doğrulandı: `worktree-cleanup.md` (son güncelleme 2026-06-29) bu oturumun bizzat karşılaştığı 2 olay sınıfını hiç kapsamıyordu — (1) canonical main committed-divergence (MR-004 kalıbı), (2) `git worktree add` timeout sonrası kısmi/bozuk checkout (ACT-06 kapanışında yaşandı). Runbook'a §5 (MR-004 prosedürü) + §6 (worktree-add-timeout prosedürü) + incident geçmişi eklendi. Docs-only, kod/script/runtime YOK. |
| **ACT-12 (Tebrik drawer + "Bugün ne gidecek?" önizleme)** | PR #968 → `3a4dee6b` MERGED. GO-ANALYZE: backend `GET /greetings/today` (`findTodayGreetings`) ve `POST /greetings/send` tam çalışır durumdaydı (doğum günü/kuruluş yıldönümü/vekalet yıldönümü/bayram tebrik motoru) ama FE hiç tüketmiyordu — mevcut Tebrik drawer'ı yalnız enable/saat toggle içeriyordu. Fix: FE-only wiring — drawer'a yeni bir önizleme kartı eklendi (bugün tebrik alacak müşteriler listelenir, her satırda mevcut send endpoint'ini kullanan "Gönder" butonu). Backend DEĞİŞMEDİ. tsc temiz. Bu sayfa için mevcut test harness'i yoktu (1700+ satır) — yeni test suite yazmak kapsam dışı bırakıldı; canlı tarayıcı doğrulaması YAPILMADI (login+bugüne-denk-gelen seed veri gerektiriyor, dev-server-ownership kısıtı). |
| **ACT-22 (AddressService vs DebtorService.updateAddress sorumluluk netliği)** | PR #979 → `fd2c050e` MERGED. GO-ANALYZE: `debtor.service.ts:updateAddress()`'in XML remarks yorumu ile `address.service.ts:update()`'in yorumu ÇELİŞİYORDU — biri "AddressService.update() cross-case bildirim tetiklemiyor, bilinen boşluk" derken diğeri "her iki yol da aynı bildirimi tetikliyor" diyordu. Kod kontrolü: `address.service.ts:255,267` gerçekten `notifyCrossCaseAddressChangeSafe()` → `DebtorCrossCaseNotificationService.notifyFieldGroupChanges()` çağırıyor — `debtor.service.ts`'deki yorum bayat kalmış (DBND-D6A-2'nin bu boşluğu kapattığını hiç yansıtmamış). Fix: bayat yorum düzeltildi, çelişki giderildi. Davranış DEĞİŞMEDİ — yalnız XML remarks metni. tsc temiz (prisma generate sonrası). |
| **ACT-21 (StaffModal canApproveFinance/canPrepareCollectionDisposition etiket karışıklığı)** | PR #975 → `bd8303b3` MERGED. GO-ANALYZE: `canApproveFinance` backend'de yalnız persist ediliyor (`staff.service.ts`) — hiçbir authorization kapısında kontrol edilmiyor (dekoratif). `canPrepareCollectionDisposition` ise gerçek bir yetki kapısı (`disposition-posting.service.ts:381`) ama yalnız hazırlık/öneri, nihai onay değil. UI'da ikisi özdeş görünüyordu — büro admin'i "Muhasebe onaylayabilir"i işaretleyince gerçek onay yetkisi verdiğini sanabilirdi. Fix: iki checkbox'a da parantez-içi netlik + tooltip eklendi, `schema.prisma` yorumu güncellendi (migration yok). Backend authorization DEĞİŞMEDİ. tsc+prisma validate temiz. Canlı tarayıcı doğrulaması YAPILMADI. |
| **ACT-09 (ThirdPartyPanel + quickNote UI cilası)** | PR #972 → `8b006fe4` MERGED. GO-ANALYZE: backend `PUT`/`DELETE /third-parties/:id` tam çalışır durumdaydı ama `ThirdPartyPanel.tsx` yalnız ekleme sunuyordu — aynı dosyadaki "Dış Dosya" sekmesi zaten edit+delete'e sahipti, asimetri gerçek bir eksiklikti. `EditThirdPartyModal` eklendi + Sil butonu (yalnız ihbarname hiç gönderilmemişse — resmi tebligat izini bozmasın). `DebtorDetailDrawer.tsx`'te quickNote "Kaydet" butonuna saving-state göstergesi eklendi. Backend guard DEĞİŞMEDİ. tsc temiz, mevcut `passive-case-debtor-ui-safety.test.tsx` 7/7 PASS (regresyon yok). Bu iki bileşen için özel test dosyası yoktu — yeni suite kapsam dışı bırakıldı; canlı tarayıcı doğrulaması YAPILMADI. |
| **ACT-10 (GET /confidence/:addressId GET-içi-yazma anti-pattern)** | PR #966 → `14c65572` MERGED. GO-ANALYZE: GET route `updateAddressScore()`'u (hesapla+persist) çağırıyordu — HTTP GET semantiğini ihlal eden gerçek bir anti-pattern. FE'de bu endpoint'in (ve backend'de hiç var olmayan `/recalculate` sibling'inin) hiçbir canlı caller'ı bulunamadı — risk şu an teorik, üretim etkisi yok. Fix: `computeAddressScore()` (salt-okuma, YAZMAZ) eklendi, GET bunu kullanıyor; `updateAddressScore()` (persist eden) yalnız `POST update-all` yolunda kaldı — davranış DEĞİŞMEDİ. 2 mevcut test güncellendi + 2 yeni test (controller: updateAddressScore çağrılmıyor; entegrasyon: DB'ye yazmıyor — disposable Docker Postgres container'a karşı çalıştırıldı). 36/36 test PASS, tsc temiz. |
| **ACT-11 (Client "Pasifleştir" butonu — yetkisiz kullanıcıya gizleme)** | PR #960 → `ec0e7cf9` MERGED. GO-ANALYZE: backend zaten sağlam guard'lıydı (`assertCanManageLifecycle` → `isApproverEligible`, PARTNER/yetkilendirilmiş avukat, `client-core-p0.spec.ts` ile test edilmiş) — bu kozmetik/UX açığıydı, güvenlik açığı değildi. JWT'deki `user.role` (`UserRole` enum: ADMIN/USER/VIEWER) `lawyerRank`/`canApproveOfficeActions` ile ilgisiz olduğundan basit bir FE-only tahmin mümkün değildi. Owner-onaylı Scope B: yeni **GET `/clients/lifecycle-eligibility`** + `ClientService.canManageLifecycle()` (aynı alttaki kontrolü kullanan, throw etmeyen boolean varyant; gerçek guard DEĞİŞMEDİ). FE buton yalnız `eligible=true` iken render ediliyor. 4 yeni backend test, 25/25 PASS, tsc temiz. Canlı tarayıcı doğrulaması YAPILMADI (dev-server-ownership kısıtı, login+seed-kullanıcı gerektiriyor). |
| **ACT-13 (runGuardedApply konvansiyon/doküman eksikleri)** | PR #962 → `6079e432` MERGED. GO-ANALYZE: `runGuardedApply` adında bir fonksiyon repoda HİÇ yok (yalnız register metninde geçiyordu). Gerçek bulgu: üç script/tasarım üç farklı "apply gate" deseni kullanıyor — `k1-reviewed-linkage.ts`+`k1-capacity-linkage.ts` K1 core'unu (`evaluateApplyGuards`/`planApply`/`applyLinkages`, PR #522) reuse ediyor; `backfill-due-to-claimitem.ts` kendi bağımsız kapısını (`--confirm-prod-backfill`) kullanıyor; `g6-backfill-script-design.md` üçüncü, henüz kodlanmamış bir varyant öneriyor. Yeni doküman (`project/docs/runbooks/guarded-apply-script-convention.md`) K1 core'unu referans desen olarak adlandırır, 3 script'i/tasarımı kataloglar, gelecek script'ler için öneri sunar. Hiçbir script'e dokunulmadı (retrofit kasıtlı kapsam dışı). Docs-only. |
| **ACT-14 (tm3-collection-disposition-boundary.md §11 sahiplik matrisi güncelleme)** | PR #958 → `7332a59a` MERGED. GO-ANALYZE: `case.service.ts`/`case.controller.ts` satır referansları koddan drift etmişti (3441/3505→3671/3743, 682/721→687/727), güncellendi. `client.service.ts` satır referansı kırılgan sayı yerine C0-a call-site adlandırmasıyla değiştirildi (dosya 1600+ satıra büyümüş). `client-settlement/` modülü artık "NEW" değil — M1/M2 fiilen teslim edilmiş (disposition/offset/payout/accounting-reader alt-servisleri), matriks buna göre güncellendi. `action-handler.service.ts` "AÇIK: sahip kim" notu BİLİNÇLİ KORUNDU — kapsam dışı, hâlâ ayrı owner kararı gerektiriyor. Docs-only. |
| **ACT-15 (disposition-posting.service.spec.ts mojibake temizliği)** | PR #953 → `d62b0cd1` MERGED. GO-ANALYZE'de gerçek çift-encode mojibake doğrulandı (UTF-8 baytları yanlışlıkla CP1252 okunup tekrar UTF-8 kaydedilmiş, 39 `it()`/`describe()` string literal etkilenmiş; FAZ-1b reimbursement testleri zaten doğru kodlanmıştı). CP1252 ters-eşleme tablosuyla bayt seviyesinde düzeltildi (naif latin1↔utf8 denemesi veri kaybına yol açtığı için terk edildi). Yalnız string literal, test mantığı/assertion değişmedi. 41/41 test PASS, tsc temiz. |
| **ACT-19 (Ön-yüz LEHTAR OCR — FRONT_PAYEE VERIFY mesajı netliği)** | PR #949 → `f4889cb9` MERGED. Owner-onaylı **Kapsam B**: front-face extraction prompt/pipeline'a DOKUNULMADI (kilitli karar, `a1-client-anchoring-design.md` — "Per-page ön-yüz extraction prompt'una dokunulmaz"), auto-role assignment eklenmedi. Yalnız `clientRoleSignal()` FRONT_PAYEE dalının mesajı, ANOMALY/REVIEW kardeşleriyle tutarlı hale getirildi: "otomatik rol atanmaz" netliği eklendi. 1 yeni test (`client-match.test.ts`), toplam 43/43 PASS, tsc temiz. |
| **ACT-26 (Cross-case creditor cluster, DBIND-1 P3)** | ⚠️ **ZOMBIE-ACTIVE olarak tespit edildi (GO-ANALYZE, 2026-07-05)**: DBIND §2 v1-scope (`CASE_CREDITOR_CLUSTER` computed/projection, stored entity/shareRatio YOK, cluster-dışı otomatik mahsup YOK) zaten mevcut ve wire edilmiş — `collection-disposition.service.ts`(beneficiaryScope), `case-payment-preview.service.ts`, `payment-preview.dto.ts`, `distribution-recommendation.service.ts`. Kaynak PR #545+#551 (2026-06-26/27), DBIND §2'nin kendisinden (2026-07-04) 9 gün ÖNCE merge edilmiş — §2 yeni iş açmadı, mevcut TM3/M1/M2 davranışını kanonikleştirdi. |
| **OWN-01 (Invite↔Lawyer/Staff linkage)** | PR #879 → `a01f5ed2` MERGED |
| **ARC-01 (ClaimGroup tablosu)** | ARCHIVED_CONFIRMED + ADR §Q1 clarification PR #902 → `aebe38e8` MERGED |
| **ARC-05-A (Office-Approval Inbox FE, P4-6)** | ⚠️ **ARCHIVED → CLOSED yeniden sınıflandırıldı** (owner kararı, 2026-07-04): PR #823+#832 (2026-07-02) ile fiilen teslim edildi, `/office-approvals` canlı. Governance bookkeeping düzeltmesi PR #908 → `49cde917` MERGED (`product-backlog.md` P4-6 Status BACKLOG→DONE). |
| **VER-32 (eski VR-13, PR #890'ı kapatan süreç)** | 2. batch doğrulaması + `act04-ocr-region-classifier` memory: diff-audit sonrası CLOSED, benzersiz iyileştirme yok |
| **OWN-02 (CHANGE_STATUS/EDIT_PARTIES observe wiring)** | Governance drift remediation (2026-07-09): repo'da P2 observe wiring zaten mevcut ve testli — P2a resolver core PR #507, P2b-1 observe adapter PR #508, EDIT_PARTIES observe PR #527, CHANGE_STATUS observe PR #531. Runtime/schema/test değişikliği yapılmadı. Daha geniş Universal Office Approval/action-generalization işi `product-backlog.md` içindeki UA-1 altında DEFERRED kalır. |
| **PB-03 (SummaryEngineService.allocateWithTBK100 3. allocator)** | 2. batch — sahiplik "alacak kalemleri" sayfasına devredildi. ⚠️ VER-28 yalnız transfer doğrulaması; geniş claim-item-domain-audit NO-GO'sunu kapatmaz. |
| **ALC-AUTH-4A (misleading-eligibility fix, kod)** | PR #942 → `50aa2e33` MERGED. ALC-AUTH-3E'nin cost/attorney-fee suppress'i (`hasCostOrAttorneyFeeUnderstatementRisk`) yalnız `buildGuardedPrimaryCalculationResult()` içindeydi; `evaluateGuardedPrimaryDisplayPilot()` riski hiç görmüyordu, bu yüzden suppress tetiklenirken bile `decision.reasonCodes` boş kalıp banner "eligible" diyordu (toplamBorc/sonBorc/kalanBorc sessizce legacy'ye düşerken). Fix: aynı risk kontrolü artık `evaluateGuardedPrimaryDisplayPilot()` içinde de çalışıyor, yeni `COST_ATTORNEY_FEE_SUPPRESSED` reasonCode tetiklendiğinde `primarySource` otomatik `LEGACY_CALCULATION_SUMMARY`'ye düşüyor. Kapsam dar tutuldu (yalnız `guarded-primary-display.ts` + `balance-shadow-display.test.tsx`); ComponentCoverageReport/rollout/flag-açma kapsam DIŞI kaldı, B1 flag hâlâ OFF. 82/82 test PASS, tsc temiz. Not: PR #938 (ayrı oturum, ALC-AUTH-4A/4B/4C governance-only kaydı) bu fix'i İÇERMİYORDU — hâlâ OPEN, bu PR'dan bağımsız. |
| **UI-FEE-ENGINE-WARN-001 (fee-engine catch-block silent-failure warning)** | PR #996 → `7f57cc79` MERGED. `cases/new/page.tsx` içindeki `generateFromClaimEngine()`'in fee-engine catch bloğu sessizce yutuyordu (yalnız `console.log`) — transient fee-engine/tariff hatasında masraf kalemleri (harç/vekalet/tebligat) hiçbir kullanıcı uyarısı olmadan eksik kalabiliyordu. Fix: aynı dosyadaki `addFeesFromEngine()`'in kullandığı `alert()` konvansiyonuna hizalandı (tek satır). Hesaplama/backend/schema DEĞİŞMEDİ — ADR-012 implementasyonu değil, FEE-TARIFF-2026-001A'dan bağımsız. tsc+lint temiz, `next dev` derlemesi temiz; gerçek fee-engine-fail senaryosu canlı tetiklenmedi (backend+DB+auth gerektiriyor, LOW risk/tek-satır değişikliğe göre orantısız). No backlog/register impact (LEVEL 1 UX fix). |
| **VER-11 (K8 UX-guard forensic)** | VER-10+ reconcile (2026-07-09): repo'da K8 non-blocking uyarı semantiği mevcut bulundu — `client-match.ts` NOT_FOUND/uyarı metni, `DebtorStep.tsx` non-blocking "müvekkil güvenilir eşleşmedi" badge/uyarı kullanımı ve `ocr-draft-architecture.md` K8 karar kaydı. Runtime patch yok. |
| **VER-15 (dbind-p2-debtor-financial-binding WIP)** | VER-10+ reconcile (2026-07-09): `codex/dbind-p2-debtor-financial-binding` aktif local worktree/branch olarak görünmedi; DBIND-P2 karar/test/doküman izleri repo'da mevcut (`dbind-financial-authority-decisions.md`, DBIND-P2 smoke/spec). Stale-WIP verification olarak kapandı. |
| **VER-17 (#795/#822/#838 main kapanışları)** | VER-10+ reconcile (2026-07-09): #795 ve #822 GitHub metadata ile MERGED doğrulandı; #838 git log'da `e10a6458 ... (#838)` olarak main geçmişinde görünüyor. |
| **VER-18 (`fervent-rosalind-363133` .git yokluğu)** | VER-10+ reconcile (2026-07-09): parent dizin listelemesinde `fervent-rosalind-363133` artık yok; `.git` path varlık kontrolü false. Stale local-worktree doğrulaması kapandı; WQ orphan listesinden düşürüldü. |
| **VER-24 (a01f5ed2→aebe38e8 arası Müvekkil/intel/intake dokunulmuş mu)** | VER-10+ reconcile (2026-07-09): `git diff --name-only a01f5ed2 aebe38e8` Client/Address/Accounting dosyalarına dokunulduğunu gösterdi; dar verification kapandı. |
| **VER-28 (ACCRUES COST/ANCILLARY transfer doğrulaması)** | VER-10+ reconcile (2026-07-09): PB-03 Closed Register'da "alacak kalemleri" sayfasına devredilmiş; bu yalnız dar transfer doğrulamasını kapatır, geniş `claim-item-domain-audit` B1/B6/B5 NO-GO bulgularını kapatmaz. |
| **VER-30 (D6A-1 contact field-set)** | VER-10+ reconcile (2026-07-09): D6 field semantics repo'da net — D6A-2 notification fieldGroup `{ADDRESS, KEP_ADDRESS, IDENTITY, NAME}`; CONTACT/phone/email kalıcı notification dışında, D6A-1 audit category olarak `contact` kullanır. Runtime patch yok. |
| **VER-31 (`sourceCaseId` FE taraflı dolduruluyor mu)** | VER-10+ reconcile (2026-07-09): FE/API wiring mevcut — `DebtorDetailDrawer`, `AddressListSection`, `NewDebtorModal`, `AddressFormModal`, DTO/service/testlerde `sourceCaseId` ingress ve exclusion path görülüyor. |
| **VER-34 (`office-approval-shadow.service.ts` gerçek tüketicisi)** | VER-10+ reconcile (2026-07-09): gerçek tüketici `case-status.controller.ts`; module ve spec importları da mevcut. CPB-03 kapsamındaki tüketici doğrulaması kapandı. |
| **VER-35 (`HUKUK_payout-audit-hardening` foreign/tracked doğrulaması)** | VER-10+ reconcile (2026-07-09): `HUKUK_payout-audit-hardening` dizini parent workspace altında yok; repo içi referans yalnız bu register satırıydı. Stale local verification olarak kapandı. |

---

## E. Archived Register

| ID | Domain | İş | Neden | Durum (bu oturumda re-verify edildi) |
|---|---|---|---|---|
| ARC-01 | Claim | ClaimGroup tablosu | Gerçek ayrık-borçlu/karışık-süreç verisi görülene dek eklenmeyecek (ADR §Q1) | **ARCHIVED_CONFIRMED** → Bölüm D'ye taşındı (ADR clarification eklendi, PR #902) |
| ARC-02 | Claim | PeriodicObligation yazılır-tablosu | Dosya-bazlı opt-in talep gelirse değerlendirilecek (ADR §Q4) | **ARCHIVED_CONFIRMED** — opt-in talebi yok, NAFAKA/DueType ile karışmıyor |
| ARC-03 | Claim | BalanceComponent yazılır-tablosu | Kararlı-red, projection kalacak (ADR §Q2) | **ARCHIVED_CONFIRMED** — hiç materyalize edilmemiş (şema/kod/type hiçbiri), computeBalance kanonik |
| ARC-04 | Claim | FinancialEvent + BalanceSnapshot ikinci event-omurgası | Kararlı-red (ADR §Q7) | **ARCHIVED_CONFIRMED** — LedgerEntry gerçek omurga, domainEventIngest yalnız outbox/audit |
| **ARC-05** | Accounting | Office-Approval Inbox FE (P4-6) + UA-1 generalization | Demand-gated / deprioritized | **SPLIT (owner kararı, 2026-07-04)**: **A) FE Inbox → ARCHIVED'den ÇIKARILDI, CLOSED'a taşındı** (Bölüm D). **B) UA-1 generalization → ARCHIVED_CONFIRMED, burada kalıyor** (product-backlog.md UA-1 satırı: Status DEFERRED, gerçekten hâlâ yapılmamış). |
| ARC-06 | Client | CasePartiesSection.tsx yerel Client union (PERSON eksik) | Component orphan/dormant, canlı bug değil | Henüz bu oturumda ele alınmadı |
| ARC-07 | Client | ClientAddress backfill (flat→tablo) + isCurrent arşiv UI + dedicated GET endpoint | Owner bilinçli kapsam-dışı bıraktı, closure memory ile tutarlı | Henüz bu oturumda ele alınmadı — ⚠️ **ACT-23 ile çakışma riski**, bkz. Bölüm A |
| ARC-08 | DevOps | Auto-mode classifier'ın rollback'li smoke testleri bloklaması | Owner mevcut duruma razı oldu | Henüz bu oturumda ele alınmadı |

**Not:** "UA-1" satırı bu tabloda ARC-05-B olarak korunur; ARC-05 ID'si artık yalnız bu deferred parçayı temsil eder (FE parçası CLOSED'a taşındığı için).

---

## F. Superseded Register

| Kayıt | Neden geçersiz |
|---|---|
| Export #4 "V3" numara boşluğu (Verification Required) | Gerçek bir kayıt değil, kaynak export'ta format artığı |

---

## G. Blocked Register

*(2026-07-04 tam re-verification tamamlandı — tüm kayıtlar KAPALI sayılır, bir bağımlılık somut olarak değişmeden yeniden açılmaz.)*

| ID | Domain | İş | Bağımlılık | Bu oturumdaki durum |
|---|---|---|---|---|
| BLK-01 | Accounting | ACCT-1 Journal Engine implementasyonu | Codex hattı — Claude'un işi değil | Aynen doğrulandı |
| BLK-02 | Accounting | Trial Balance FE + kalan 5+ ekran | Codex projection/sözleşmesi olgunlaşmalı | Reframe: **FE READY** |
| BLK-03 | Accounting | POA süre-dolumu teslimat motoru (P2) + kart besleme | Codex P2 tamamlanmalı | Reframe: **OWNER_DECISION/Scope Required** |
| BLK-04 | Claim | Faz 2 — Display cutover (getCalculationSummary→computeBalance) | Av. sign-off (henüz alınmadı) | Aynen doğrulandı |
| BLK-05 | Claim | Faz 3 — #404 guard (excludedOutstanding) | Faz 1B tamamlanmalı | Terminoloji düzeltildi |
| BLK-06 | Claim | Faz 4 — PaymentDesignation epiği | Allocator-read design + VER-06 | Aynen doğrulandı |
| BLK-07 | Claim | Faz 5 — Anapara alt-model refactor | Faz 4 + gerçek veri bekleniyor | Aynen doğrulandı |
| BLK-08 | Claim | PR-3 (test genişletme) + PR-5 (legacy retirement) | BLK-04 (Faz 4/PR-4) | Terminoloji düzeltildi |
| BLK-09 | OCR | Round-3 dataset + R3 ölçüm/karar kapısı + A1-V1b-order PR | Ulaş'ın veri sağlaması | Aynen doğrulandı |
| BLK-10 | Authorization | P3 — Guarded-edge enforcement | K1-2 linkage onarımı (OWN-01) | Reframe: **BLOCKED kaldırıldı** — OWN-01 MERGED olduğu için build-out durumuna geçti |

---

## H. Owner Decision Register

| ID | Domain | İş | Bekleyen karar |
|---|---|---|---|
| OWN-03 | Authorization | CREATE_LOGIN_USER güvenli parola akışı | Tasarım sınırı |
| OWN-04 | Authorization | runGuardedApply test-harness + regex host-scope + IPv6 dead-branch | Kullanıcı onayı yalnız kısmi kapsamı kapsadı |
| OWN-05 | Accounting | CaseFeeAgreement (FAZ-2) | GO + design-gate |
| OWN-06 | Accounting | AdminGuard kaldırma (trial-balance/cutover-readiness) | Owner'a aynı soru yeniden sorulmalı |
| OWN-07 | Accounting | Muhasebe Defteri/Müvekkil Ekstresi UX konsolidasyonu + top-level /muhasebe | Active Roadmap'e alınma kararı |
| OWN-08 | Accounting | FAZ-1b görünürlük yüzeyi gerekliliği | Ayrı GO-ANALYZE ile teyit |
| OWN-09 | Accounting | PR-2c canlı DB E2E doğrulama | SEED veri-seti mi prod bekleme mi |
| OWN-10 | Client | DB remediation (geçersiz-checksum pasif kayıtlar) | DB-write owner-gated |
| OWN-11 | Client | Client Detail Workspace (Task4) route/tab planı | Tasarım kararları |
| OWN-12 | Client | RISKY Fork A-D (ApiClient birleştirme, envelope normalize, modal konsolidasyon, backend envelope) | Fork sırası owner kararı |
| OWN-13 | Client | Client mutation capability-gate | Owner tasarım kararı hiç verilmedi |
| OWN-14 | Client | findOne() isActive filtre politikası | Politika belirsiz |
| OWN-15 | Client | ClientInfoRequest→ClientIntake adapter ("Yol1") + Intel/Intake capability+audit gate | Owner resmi onayı |
| OWN-16 | Debtor | DB kimlik tekilliği (TCKN/VKN/DETSİS unique-index) | Migration onayı |
| OWN-17 | Debtor | updateCaseDebtorNotification guard | Ürün kararı |
| OWN-18 | Debtor | 13 boş katalog borçlusu temizliği | Veri temizlik onayı |
| OWN-19 | Notification | Günlük özet/dosya-güncelleme/görev-hatırlatıcı motorları | Yatırım/öncelik kararı |
| OWN-20 | Notification | Vekalet SMS varyantı | Öncelik kararı |
| OWN-21 | Notification | Per-user bildirim tercihleri (opt-out) | Ürün kararı |
| OWN-22 | Notification | Kanal-bazlı KVKK rızası | Ayrı domain, owner "ayrı epik" dedi |
| OWN-23 | OCR | A1 tam ciro-zinciri epik | Av./legal sign-off |
| OWN-24 | DevOps | CI full-suite coverage triage | Gerçek backlog'a alınsın mı (eski VER-19 buraya taşınmıştı) |
| OWN-25 | DevOps | PR #406 rebase-veya-kapat | Sahiplik/güncellik önce teyit, sonra karar |
| OWN-26 | DevOps | Muhasebe kullanıcısına Lawyer'dan bağımsız capability alanı | Owner yönü |
| OWN-27 | UI/Architecture | 3 silinen orphan component'in kalıcı terk mi | Ürün kararı |
| **OWN-28 (YENİ)** | Authorization | 2. batch PB-01 = zaten ALT'daki ile aynı (bkz. not) | — |
| **OWN-29 (YENİ, ÖNEMLİ)** | Authorization | K4 (2026-07-02, "money-out/void/close/reversal → PARTNER self-authority YOK, four-eyes") ile DBIND §5'in (payout için PARTNER self-approve istisnası) çelişkisi. Payout'ta DBIND §5 lehine çözüldü; K4'ün kapsadığı diğer 4 aksiyon sınıfı (**offset confirm-gate, collection void approval, case-close financial guard, receivable item approval**) hâlâ eski hüküm altında görünüyor. | Bu 4 sınıfa da PARTNER self-approve istisnası uygulanacak mı, yoksa K4'ün orijinal four-eyes hükmü mü korunacak? **Risk: Yüksek** — netleşmeden implementasyon başlarsa payout'taki rework tekrarlanabilir + canlı four-eyes koruma boşluğu. |
| **OWN-30 (2026-07-05, ACT-18'den yeniden sınıflandırıldı)** | Observability | Hata Logları (`error-logs-observability-pr-chain` memory) sayfası için "ileride geliştirme adayları" — retention manuel-tetik + retention-stats admin endpoint (şu an cron-only), UI resolved/unresolved filtresi (backend `isResolved` query param gerekir), log export (CSV), bulk resolve, hata-artış trend/alerting. Owner bu listeyi **2026-06-29'da bizzat PARK etti** ("bu sayfa Hata Logları olarak kalsın, başka işe gitmeyelim, ileride geliştirme için dönebilirim") ve kısa bir humanized-display turu sonrasında **yine** "merge sonrası dur, yeni Error Logs işi başlatma" dedi. Retention zaten owner-gated (`ERROR_LOG_RETENTION_ENABLED` + API restart gerekir, prod-etkili); admin endpoint/export/trend-alerting de operasyonel davranış etkisi taşıyor — **Low öncelikli kozmetik iş DEĞİL**. | Owner "şimdi dönüyorum" dediğinde hangi alt-maddeyle başlanacağı ve hangi kapsamda (retention aktivasyonu ayrı, dar bir GO-IMPLEMENT gerektirir). |

**Not (OWN-28 hakkında):** 2. batch'in PB-01'i ("Staff ASLA final-approver kilidi dar istisnaya revize edilsin mi") zaten `p4-approval-engine` memory'sindeki mevcut "Staff/MUHASEBE final approver NO-GO pending owner" kararıyla aynıdır — **bu tabloya AYRI kayıt olarak eklenmedi**, yalnız referans amacıyla ID rezerve edildi. Gerçek yeni karar **OWN-29**'dur (3. batch'in CPB-06'sı).

---

## I. Risk Report (konsolide)

### Kritik Çelişkiler
1. **VER-02 (client çok-adres):** 5 bağımsız export aynı bulguyu yaptı — doğrulanmadan Task4 (OWN-11) kapsamına dahil edilirse kapsam belirsizliği büyür.
2. **OWN-29 (K4↔DBIND§5 self-approval çelişkisi):** offset/void/case-close/receivable sınıflarında four-eyes koruma boşluğu riski — **YÜKSEK**, karar gelmeden implementasyon başlatılmamalı.

### Kritik Bağımlılıklar
- **BLK-04 (Faz2 Display Cutover)** zincirin kilit noktası: BLK-05/06/07/08 buna bağlı.
- **BLK-01/02/03 (Codex hattı):** Accounting'in büyük kısmı Claude'un kontrolü dışında.
- **ACT-23 (setPrimaryAddress/deleteAddress genişletme)** ARC-07'nin (owner bilinçli kapsam-dışı) kapsamıyla çakışabilir — implement öncesi owner teyidi şart.
- ~~ACT-26 (cross-case creditor cluster)~~ — GO-ANALYZE'de zombie-active bulunup Closed Register'a taşındı (v1-scope zaten mevcut, bkz. Bölüm D).

### Hukuki Riskler
- BLK-04 (Faz2 Display Cutover — FAİZ=0 stub müvekkil-görünür)
- BLK-07 (Anapara alt-model refactor — migration+hukuki etki)
- OWN-23 (A1 ciro-zinciri epik — legal sign-off)
- OWN-16 (Debtor kimlik tekilliği — migration)
- **OWN-29 (K4↔DBIND§5) — money-out sınıfının offset/void/case-close/receivable ayakları hâlâ four-eyes korumasız olabilir**

### Mimari Riskler
- OWN-12 (RISKY Fork A-D) — yüksek blast-radius kararlar bekliyor
- ARC-02/03/04 (PeriodicObligation/BalanceComponent/FinancialEvent) — bilinçli reddedilmiş, ADR referansları korunmalı

### Çapraz-Domain Riskleri
- VER-03 (FU1↔Faz7 accounting entegrasyonu)
- VER-01(eski)/OWN-29 çözümü hem Accounting hem Authorization'ı etkiliyor
- Worktree orphan-dizin birikimi (10+ örnek) — hijyen turu (ACT-17 dokümantasyonu tamamlandı, fiziksel temizlik hâlâ owner-manuel bekliyor, bkz. WQ orphan-listesi)
- **ACT-23 ↔ ARC-07** (Debtor/Client/Notification sınırı çakışma riski)

### Süreç Riski (bu oturumun en önemli bulgusu)
- **ARC-05 "zombie archive" örneği**: teknik hatadan değil, GO-COMPLETE sonrası governance bookkeeping (Product Backlog/Master Triage/Closed Register) güncellenmediği için bir kayıt gerçekte kapanmışken "archived/backlog" görünmeye devam etti. **Çözüm:** her GO-COMPLETE'in son adımı olarak **POST-MERGE GOVERNANCE CHECK** (bkz. `decision-log.md` 2026-07-04 kaydı) uygulanmalı.

---

## Özet Sayım (bu dosyanın güncel hali)

| Kategori | Sayı |
|---|---|
| Master Product Backlog (ACTIVE) | 3 (ACT-24, ACT-25, ACT-28; ACT-20→OWNER-GATED/FUTURE/HOLD, ACT-23→OWNER_DECISION_REQUIRED, ACT-27→DECISION_CLOSED/IMPLEMENTATION_NEEDED) |
| Master Verification Required | 23 (VER-02..10 + VER-12..14 + VER-16 + VER-20..23 + VER-25..27 + VER-29 + VER-33 + VER-36; VER-01/11/15/17/18/19/24/28/30/31/32/34/35 kapandı/taşındı) |
| Master Workflow Queue — PENDING | 13 grup |
| Master Workflow Queue — DONE | 5 zincir (PR #408 eklendi) |
| Closed Register | 41 (VER-10+ reconcile ile VER-11/15/17/18/24/28/30/31/34/35 eklendi) |
| Archived Register | 7 (ARC-05 split sonrası tek satır, A parçası Closed'a gitti) |
| Superseded Register | 1 |
| Blocked Register | 10 (tümü re-verified, KAPALI sayılır) |
| Owner Decision Register | 29 (OWN-02 kapandı/ayrıştırıldı; OWN-30 yeni — ACT-18'den yeniden sınıflandırıldı; OWN-28 yalnız referans) |
