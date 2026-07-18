# Governance

Bu klasör HUKUK_YAZILIMI için kalıcı governance kayıt alanıdır.

Tek kaynak modeli:

- `AGENTS.md` bu repo için tüm ajanlara yönelik execution ve repository-safety baseline'ıdır.
- `CLAUDE.md` Claude'a özgü operasyonel supplement'tir; `AGENTS.md` ile çelişemez veya onu override edemez.
- `project/docs/governance/` roadmap, backlog, decision ve süreç kayıtlarını tutar; bu kayıtlar `AGENTS.md` ile tutarlı olmalıdır.
- Gelecekteki repo-local skill'ler resmi Codex scan yüzeyi olan `.agents/skills/` altında tanımlanır.
- `.codex/` Codex operasyonel config, hooks ve project-scoped custom agents yüzeyidir; mevcut owner/user WIP sayılır ve açık yetki olmadan değiştirilmez.
- Repository-wide AI ground-truth rule: Sohbet geçmişi yalnız niyet ve karar taşır; mevcut gerçekler her görevde repository state, git state, dosya içeriği, governance kayıtları, PR/CI durumu ve komut çıktılarından yeniden doğrulanır.

Bu klasör `AGENTS.md` yerine geçmez. `AGENTS.md` execution/repository-safety,
`SYSTEM-CONSTITUTION.md` system-wide domain/business semantiği otoritesidir. Semantic
authority execution izni üretmez; execution authority domain semantiğini değiştirmez.
Bir görev her iki authority eksenine aynı anda uymalıdır.

Dosyalar:

- `SYSTEM-CONSTITUTION.md` - system-wide semantic authority (RATIFIED — BINDING;
  repository-canonical upon approved merge).
- `GOVERNANCE-INDEX.md` - yeni göreve başlayan ajan için okuma sırası ve authority haritası
  (RATIFIED; repository effect approved merge ile başlar).
- `DEBTOR-GOVERNANCE.md` - ratifiye Debtor Domain Law (RATIFIED v1.0, 2026-07-12).
- `RECEIVABLE-GOVERNANCE.md` - ratifiye Receivable Domain Governance ve alacak hattının
  tek domain giriş noktası (RATIFIED v1.0; repository-canonical upon approved merge).
- `RCV-PHASE-1-AUTHORIZATION.md` - RCV program/register cross-pointer'ı, DEC-0030
  disposition'ı, gerçekleşen phase/workstream progression, Phase 1 ile WS01/WS02 formal
  closure, `RCV-P2-WS03-P01/P02/P03` formal closure, P03 için ratified
  `RECORD_COLLECTION` object-scope/additive confirmation contract'ı, WS03 formal closure,
  WS04-P01 `DA-4`/`CA-1`/`CM-1` drift-baseline authority contract'ı ve P01 formal
  closure, WS04-P02 static/synthetic/disposable evidence-package formal closure kaydı,
  WS04-P03 representative replay package contract ratification'ı, default-disabled reader/adapter
  implementation formal closure'ı ve ayrı data-access, evidence-execution,
  production-observation ve disposition owner gate'leri.
- `OFFICE-GOVERNANCE.md` - aday OFFICE Domain Law (DRAFT / OWNER REVIEW REQUIRED).
- `OFFICE-MASTER-SYNTHESIS.md` - OFFICE kanıt/gerekçe/senaryo katmanı (NON-NORMATIVE).
- `OFFICE-RISK-REGISTER.md` - OFFICE domain risk dossier'i (global triage otoritesi değil).
- `OFFICE-OWNER-DECISIONS.md` - OFFICE açık owner karar dossier'i (kapanmış karar otoritesi değil).
- `OFFICE-PHASE2-CONSTITUTION.md` - OFFICE Phase 2 program-seviyesi normatif çerçeve;
  SYSTEM-CONSTITUTION ve OFFICE-GOVERNANCE'a tabidir, implementation authority üretmez
  (RATIFIED / CANONICAL PROGRAM-LEVEL NORMATIVE v1.0, 2026-07-17).
- `OFFICE-PHASE2-MASTER-SYNTHESIS.md` - OFFICE Phase 2 capability/dependency sentezi
  (CANONICAL REFERENCE / NON-NORMATIVE / AS-OF EVIDENCE BASELINE v1.0, 2026-07-17).
- `OFFICE-PHASE2-PROGRAM-CHARTER.md` - OFFICE Phase 2 program charter; authorization
  belgesi değildir (RATIFIED / CANONICAL PHASE PROGRAM AUTHORITY v1.0, 2026-07-17).
- `OFFICE-PHASE2-ROADMAP.md` - OFFICE Phase 2 sıralama/decomposition çerçevesi;
  Wave/Candidate/Task/implementasyon-sırası seçmez, authority üretmez
  (CANONICAL PLANNING REFERENCE / NON-AUTHORIZING v1.0, 2026-07-17).
- `OFFICE-PHASE2-DECOMPOSITION.md` - OFFICE Phase 2 decomposition blueprint (capability
  delivery map + increment/Wave mimarisi + decision queue + exit coverage + first-unit
  seçenekleri); hiçbir Wave/unit seçmez, mutable delivery statü taşımaz — statü authority
  OFFICE-DELIVERY-MANIFEST.md'dir (CANONICAL REFERENCE / NON-NORMATIVE / NON-AUTHORIZING v1.0, 2026-07-18).
- `active-roadmap.md` - aktif fazlar ve implementasyona açık işler.
- `product-backlog.md` - yeni governance Product Backlog hedef kaydı.
- `architecture-index.md` - kesinleşmiş mimari kararların indeksi.
- `parking-lot.md` - şu anda değerlendirilmeyecek fikirler.
- `decision-log.md` - governance ve ürün karar günlüğü.
- `process-rules.md` - `AGENTS.md` standardının kısa operasyonel özeti.
