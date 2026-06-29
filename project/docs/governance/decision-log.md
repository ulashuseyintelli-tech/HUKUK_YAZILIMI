# Decision Log

Bu dosya governance, faz ve ürün yönetimi kararlarının kronolojik kaydıdır.

Kurallar:

- Kesinleşmiş mimari kararlar `architecture-index.md` üzerinden authoritative dokümana bağlanır.
- Backlog veya roadmap kararları ilgili governance dosyalarına da yansıtılır.
- Bu dosya tek başına implementasyon yetkisi vermez.

## Log

| Date | Decision | Scope | Source | Follow-up |
|---|---|---|---|---|
| 2026-06-29 | **Universal Office Approval**: durum-değiştiren mutation'lar yetkisiz aktör için doğrudan kesinleşmez; `OfficeApprovalRequest` (PENDING → kurucu ortak onayı → deferred executor) üzerinden uygulanır. Bilgi girişi (intake/review/promote/create) doğrudan kalır. Kurucu ortak approver: Ulaş, Fatma. `OfficeApprovalRequest`(iç) ≠ `ClientApprovalRequest`(dış); ClientApprovalRequest patron onayı için genişletilmez. | Platform-wide (intel retract/false-positive/supersede · dosya kapatma/statü · tahsilat/ödeme iptali · mahsup apply/reverse · ileride seçilecek kritik mutation'lar) | Kurucu ortaklar (Ulaş, Fatma); Client Intake 4.7d-2 design-gate (intel mutation authz+audit boşluğu) | **ADR-009 (LOCKED)** → `docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md`. Per-action backend create-path + executor (P4/Codex); substrate REUSE; engine core P4-5C/3B hardening önce. Intel 4.7d-2b/c BLOCKED (approval-backed backend gerek); 4.7d-2a (read-only) bağımsız READY. |