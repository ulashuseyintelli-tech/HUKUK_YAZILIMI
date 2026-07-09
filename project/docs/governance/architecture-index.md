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

## ADR Naming Collision Matrix (GOV-ADR-NAMING-000)

Bu bölüm, `ADR-012` numarasının DX-005 için main üzerinde kanonikleşmesinden sonra FEE/Harç/Snapshot/Journal hattında yanlış ADR referansı üretilmesini engeller. Bu patch bir ADR metni, PAC-001-A Authority Map, fee implementation, snapshot/journal spec veya runtime davranışı yaratmaz.

| Name | Canonical meaning on main | Status | Rule |
|---|---|---|---|
| ADR-012 | Waiting & Progress Policy / DX-005 | ACTIVE | Korunur; FEE/Harç/Snapshot/Journal veya CCB/FEE mimari kararı için kullanılmaz. |
| ADR-013 | Fee / Harç / Snapshot / Journal architecture | RESERVED / NOT YET CREATED | Bu hattın kanonik ADR numarasıdır; ADR dosyası ayrı owner GO ile oluşturulur. |
| ADR-012-FEE | Yok | FORBIDDEN_AS_CANONICAL | Yeni belge, backlog, PR veya decision kaydında kanonik isim olarak kullanılmaz. |
| FEE-ADR-WIP | Geçici/historical alias | NON_CANONICAL_ALIAS | Yalnız geçmiş/WIP bağlamını açıklamak için kullanılabilir; kanonik hedef ADR-013'tür. |
| CCB-001 | Canonical claim-balance cutover implementation authority / master stream | ACTIVE | Closure/cutover hattı olarak korunur; FEE implementation hattı veya yeni ADR numarası değildir. |
| CAN-CUT-02 | CCB-001 altında milestone | OPEN / needs-owner-decision | CCB-001'e bağlı kalır; bağımsız veya rakip stream değildir. |
| REL-001 | Dış umbrella/etiket | NON_EPIC_LABEL | Bu reconciliation REL-001'i bağımsız epic'e dönüştürmez. |
