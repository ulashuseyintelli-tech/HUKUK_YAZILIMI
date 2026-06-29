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
| RUNBOOK-WTCLEANUP | Worktree Cleanup & Git Safety (Windows+pnpm+çoklu oturum) | `docs/runbooks/worktree-cleanup.md` | Active | Recursive fiziksel silme (cmd rd/Remove-Item -Recurse/rm -rf/.NET Delete(true)) YASAK; yalnız `git worktree remove --force`+`prune`; "Directory not empty"→ORPHANED (owner manuel). Branch: gh-merged doğrula→`-D`+`push --delete`. Cleanup sonrası canonical integrity check zorunlu. `.git/config` torn-write→stop+read-only teşhis. Normatif özet process-rules.md. |