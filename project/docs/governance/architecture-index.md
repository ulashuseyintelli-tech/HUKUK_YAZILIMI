# Architecture Index

Bu dosya kesinleşmiş mimari kararların indeksidir. Kararın ayrıntısı ilgili ADR, boundary veya tasarım dokümanında kalır.

Kurallar:

- Kesinleşmiş Architecture Decisions tekrar tartışılmaz.
- Yeni görev mevcut kararı bozuyorsa ajan durur ve kullanıcı kararı ister.
- Bu indeks karar metnini kopyalamaz; authoritative dokümana pointer verir.

## Decision Sources

| ID | Title | Authoritative Source | Status | Notes |
|---|---|---|---|---|
| ADR-009 | Universal Office Approval — durum-değiştiren mutation'lar patron/kurucu-ortak onayından geçer | `docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md` | LOCKED | Bilgi girişi doğrudan; durum-değiştiren işlem `OfficeApprovalRequest` (PENDING→kurucu ortak→executor). `OfficeApprovalRequest`(iç) ≠ `ClientApprovalRequest`(dış). Generalization per-action backend (P4/Codex); engine core P4-5C/3B önce. |
| ADR-010 | AccountingJournal North-Star SoT — finansal-olay source-of-truth hedefi; bugün additive/shadow | `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md` | LOCKED (direction) | AccountingJournal hedef finansal-olay SoT AMA #645 additive-only contract'ı ŞİMDİ supersede ETMEZ. TBK100 KURALLARI yasal otorite KALIR; LedgerEntry/LedgerAllocation STORAGE ileride journal-türevi projection olabilir. Cutover yalnız shadow→prove→legal-signoff sonrası. POST-P4 ana eksen (7-faz Accounting Engine). Execution gated (Codex/owner). |
| ADR-011 | Audit Description Sanitization Policy | `docs/adr/ADR-011-AUDIT-DESCRIPTION-SANITIZATION.md` | LOCKED | `AuditLog.description` system-authored only; user-authored text domain entity only; audit metadata reference/hash/presence/length/system facts only; default audit UI requires safe projection, not raw metadata/oldValues/newValues. |
| RUNBOOK-WTCLEANUP | Worktree Cleanup & Git Safety (Windows+pnpm+çoklu oturum) | `docs/runbooks/worktree-cleanup.md` | Active | Recursive fiziksel silme (cmd rd/Remove-Item -Recurse/rm -rf/.NET Delete(true)) YASAK; yalnız `git worktree remove --force`+`prune`; "Directory not empty"→ORPHANED (owner manuel). Branch: gh-merged doğrula→`-D`+`push --delete`. Cleanup sonrası canonical integrity check zorunlu. `.git/config` torn-write→stop+read-only teşhis. Normatif özet process-rules.md. |
| ADR-012 | Waiting & Progress Policy (DX-005) — dışsal blocker'da (CI/PR/başka worktree/owner action) davranış modeli | `docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md` | ACTIVE | Üç katman: Active Progress (in-scope hazırlık, serbest) / Parallel Preparation (öner, başlatma owner kararı) / Passive Wait (son çare, mevcut CI WAIT/POLLING RULE aynen geçerli). İki ilke: "Passive waiting is the last option" + "An external blocker never authorizes scope expansion." CI bekleme mekaniğini DEĞİŞTİRMEZ, yalnız beklerken ne yapılacağını tanımlar. PR #998'de AGENTS.md'ye tam metin olarak eklenmiş erken versiyonun kanonik/pointer-model reconciliation'ıdır. |
| ADR-014 | CCB-001 Canonical Legal Calculation Core — legacy→canonical claim-balance clean-break cutover constitution | `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` | LOCKED (direction; PR-gated) | Canonical `computeBalance`/ClaimItem+TBK100+Interest Engine hedef tek hesaplama otoritesi; immediate cutover PR-1A..PR-9 hardening zincirinden önce BLOKLU. `ADR-013` (Fee/Harç/Snapshot/Journal) bu mimarinin alt bileşeni DEĞİLDİR — ayrı, hâlâ yazılmamış bir mimari hattır (bkz. altta). CCB-001 branch implementasyonu henüz main'e merge edilmedi; bu ADR yalnız mimari kaydı sabitler. Owner arbitration (2026-07-10) ile bu numaraya kesinleşti — kısa süre `ADR-013` olarak da var olmuştu (bkz. `decision-log.md`). |
| PAC-001-A | Authority Maps for ADR-013 Fee / Harc / Snapshot / Journal line | `docs/design/pac-001-a-authority-maps.md` | WIP / ADR-013 EVIDENCE GATE / OWNER REVIEW REQUIRED | Docs-only AS-IS evidence map and audit rubric. ADR-013 evidence delta is reconciled for owner review; governance acceptance is not yet granted. Does not decide final producer ownership, approve PR sequence, start PAC-Full, fee code, Boundary Audit, Snapshot/Journal spec, or runtime behavior. |

## ADR Naming Collision Matrix (GOV-ADR-NAMING-000)

Bu bölüm, `ADR-012` numarasının DX-005 için main üzerinde kanonikleşmesinden sonra yanlış ADR referansı üretilmesini engeller. **2026-07-10 owner arbitration (final):** Aynı gün iki aday çözüm değerlendirildi — Option C (`ADR-013`'ün kapsamını CCB-001'i içerecek şekilde genişletme, kısa süre uygulandı, PR #1019) ve ayrı-numara seçeneği (`ADR-013`'ü `GOV-ADR-NAMING-000`'ın orijinal dar kapsamında bırakıp CCB-001'e kendi numarasını verme). Owner'ın nihai kararı: **CCB-001'in mimari dokümanı `ADR-014`'tür; `ADR-013` `GOV-ADR-NAMING-000`'ın orijinal kapsamında (Fee/Harç/Snapshot/Journal, RESERVED/NOT_YET_CREATED) kalır, DEĞİŞMEDEN.** Bu patch runtime davranışı, kod, migration veya CCB-001 branch merge'i yaratmaz.

| Name | Canonical meaning on main | Status | Rule |
|---|---|---|---|
| ADR-012 | Waiting & Progress Policy / DX-005 | ACTIVE | Korunur; CCB/FEE mimari kararı için kullanılmaz. |
| ADR-013 | Fee / Harç / Snapshot / Journal architecture | RESERVED / NOT YET CREATED | Bu hattın kanonik ADR numarasıdır; ADR dosyası ayrı owner GO ile oluşturulur. CCB-001'in mimari dokümanı DEĞİLDİR (bkz. ADR-014) — 2026-07-10'da bir gün içinde bu iki hattın aynı numarada birleştirilmesi (Option C) denenip owner tarafından geri alındı; bu satır `GOV-ADR-NAMING-000`'ın orijinal metnidir, DEĞİŞMEMİŞTİR. |
| ADR-014 | CCB-001 Canonical Legal Calculation Core | LOCKED (direction; PR-gated) — dosya oluşturuldu | CCB-001'in kanonik mimari kaydıdır ve dosyası `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` olarak oluşturulmuştur (2026-07-10, owner arbitration). Fee/Harç/Snapshot/Journal için kullanılmaz — o `ADR-013`'tür (ayrı, hâlâ yazılmamış). |
| ADR-012-FEE | Yok | FORBIDDEN_AS_CANONICAL | Yeni belge, backlog, PR veya decision kaydında kanonik isim olarak kullanılmaz. |
| FEE-ADR-WIP | Geçici/historical alias | NON_CANONICAL_ALIAS | Yalnız geçmiş/WIP bağlamını açıklamak için kullanılabilir; kanonik hedef ADR-013'tür (Fee/Harç/Snapshot/Journal, CCB-001 değil). |
| CCB-001 | Canonical claim-balance cutover implementation authority / master stream | ACTIVE | Closure/cutover hattı olarak korunur; kendi mimari dokümanı **ADR-014**'tür (2026-07-10 owner arbitration); FEE implementation hattı veya ADR-013 değildir. |
| CAN-CUT-02 | CCB-001 altında milestone | OPEN / needs-owner-decision | CCB-001'e bağlı kalır; bağımsız veya rakip stream değildir. |
| REL-001 | Dış umbrella/etiket | NON_EPIC_LABEL | Bu reconciliation REL-001'i bağımsız epic'e dönüştürmez. |
