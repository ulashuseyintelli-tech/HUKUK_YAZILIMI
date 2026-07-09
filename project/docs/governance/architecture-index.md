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
| ADR-013 | Canonical Legal Calculation Core — legacy→canonical claim-balance clean-break cutover constitution (CCB-001) | `docs/adr/ADR-013-CANONICAL-LEGAL-CALCULATION-CORE.md` | LOCKED (direction; PR-gated) | Canonical `computeBalance`/ClaimItem+TBK100+Interest Engine hedef tek hesaplama otoritesi; immediate cutover PR-1A..PR-9 hardening zincirinden önce BLOKLU. Fee Projection/Snapshot/Journal/tarife-kanuni-sabit-sözleşmesel sınıflandırma bu mimarinin ALT BİLEŞENLERİDİR, ayrı ADR değildir (bkz. altta, GOV-ADR-NAMING-000 scope clarification — Option C, 2026-07-10). CCB-001 branch implementasyonu henüz main'e merge edilmedi; bu ADR yalnız mimari kaydı sabitler. |

## ADR Naming Collision Matrix (GOV-ADR-NAMING-000)

Bu bölüm, `ADR-012` numarasının DX-005 için main üzerinde kanonikleşmesinden sonra yanlış ADR referansı üretilmesini engeller. **2026-07-10 güncellemesi (Option C, owner kararı):** `ADR-013`'ün ilk rezervasyon metni ("Fee/Harç/Snapshot/Journal architecture") dar yazılmıştı — gerçek kapsam `ADR-013-CANONICAL-LEGAL-CALCULATION-CORE.md` (Canonical Legal Calculation Core) olarak netleştirildi; Fee/Harç/Snapshot/Journal/tarife-sınıflandırması onun ALT BİLEŞENLERİDİR. Bu, `GOV-ADR-NAMING-000`'ın `ADR-012`=Waiting&Progress-Policy kararını DEĞİŞTİRMEZ — yalnız `ADR-013`'ün rezerve edilen kapsamını netleştirir. Bu patch runtime davranışı, kod, migration veya CCB-001 branch merge'i yaratmaz.

| Name | Canonical meaning on main | Status | Rule |
|---|---|---|---|
| ADR-012 | Waiting & Progress Policy / DX-005 | ACTIVE | Korunur; CCB/FEE mimari kararı için kullanılmaz. |
| ADR-013 | Canonical Legal Calculation Core (CCB-001) — Fee Projection/Snapshot/Journal/tarife-kanuni-sabit-sözleşmesel sınıflandırma dahil, alt bileşen olarak | LOCKED (direction; PR-gated) — dosya oluşturuldu | Bu hattın kanonik ADR numarasıdır ve dosyası `docs/adr/ADR-013-CANONICAL-LEGAL-CALCULATION-CORE.md` olarak oluşturulmuştur (2026-07-10, Option C). Fee/Harç/Snapshot/Journal için AYRI bir ADR açılmaz. |
| ADR-012-FEE | Yok | FORBIDDEN_AS_CANONICAL | Yeni belge, backlog, PR veya decision kaydında kanonik isim olarak kullanılmaz. |
| FEE-ADR-WIP | Geçici/historical alias | NON_CANONICAL_ALIAS | Yalnız geçmiş/WIP bağlamını açıklamak için kullanılabilir; kanonik hedef ADR-013'tür. |
| CCB-001 | Canonical claim-balance cutover implementation authority / master stream | ACTIVE | Closure/cutover hattı olarak korunur; ADR-013 onun mimari kaydıdır, implementasyonun kendisi değildir. |
| CAN-CUT-02 | CCB-001 altında milestone | OPEN / needs-owner-decision | CCB-001'e bağlı kalır; bağımsız veya rakip stream değildir. |
| REL-001 | Dış umbrella/etiket | NON_EPIC_LABEL | Bu reconciliation REL-001'i bağımsız epic'e dönüştürmez. |
