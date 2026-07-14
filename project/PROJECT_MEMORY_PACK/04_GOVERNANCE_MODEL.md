# 04 — GOVERNANCE MODEL (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Repository'de fiilen kullanılan hafif governance modelini kaydetmek
Scope                         : Governance modeli özeti; yeni governance üretmez
Authority                     : NONE (navigation). Bağlayıcı: SYSTEM-CONSTITUTION.md, GOVERNANCE-INDEX.md, canonicalization-policy.md
Source Documents              : GOVERNANCE-INDEX.md, SYSTEM-CONSTITUTION.md (SYS-GOV-*, SYS-DEC-*), canonicalization-policy.md,
                                canonicalization-register.md, decision-log.md, README.md
Supersedes                    : NONE
Update Policy                 : Kaynak governance belgeleri değişince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — yeni governance üretmez, mevcut kararları değiştirmez.

## Fiili hafif governance modeli

```text
owner approval / ratification → approved merge → canonical → gerektiğinde supersession kaydı
```
Repo **repo-geneli ağır artifact-revision state machine kullanmaz** (DRAFT→IN REVIEW→...→CANONICAL ACTIVE→ARCHIVED gibi enumerated bir makine YOK; "CANONICAL ACTIVE" ifadesi kanonik governance belgelerinde kullanılmaz). Bunun yerine doc-header statüsü (DRAFT / OWNER REVIEW / RATIFIED / CANONICAL / SUPERSEDED) + `SYS-DEC` garantileri + `decision-log` canonicalization kayıtları + `canonicalization-register` (kod-drift) kullanılır.

## Ayrımlar (bağlayıcı hükümler kaynakta)

- **Binding Rule ≠ Pattern:** açık yazılı + repo-geneli + ihlalde stop/fail-closed olan kural bağlayıcıdır; tek dosya/domain örneği repo-genel invariant DEĞİLDİR.
- **Capability Status ≠ Governance Gap:** alt-belge (Domain Law/contract/standard) eksikliği ratifikasyonu engellemez; ilgili capability `DOCUMENTED_ONLY`/`NOT_IMPLEMENTED`/`SHADOW_ONLY`/`PRODUCTION_NO_GO` olarak sınıflanır (SYS-GOV-010). Eksik belge otomatik gap değildir.
- **Ratification ≠ Merge:** merge repository fact üretir; açık normatif owner kararı üretmez (SYS-DEC-002).
- **Ratification ≠ Implementation:** semantic ratifikasyon GO-ANALYZE/GO-IMPLEMENT/GO-COMPLETE yetkileri değildir (SYS-DEC-003).
- **main'de olmak tek başına authority üretmez:** canonical statü, RATIFIED doc + approved merge + (varsa) decision-log closure kaydıyla oluşur.
- **Append-only karar geçmişi:** yeni karar eskiyi supersede edebilir; eski kayıt korunur, düzeltme append-only supersession kaydıyla yapılır (SYS-DEC-004; SYS-GOV-006/009).
- **Domain Law ≠ non-semantic cross-domain program:** birleşik NORMATİF domain law iki primary domain'i birleştiremez; semantic authority ÜRETMEYEN cross-domain PROGRAM (aggregate/SoT/domain-law tekrar etmeyen) sınır ihlali değildir.

## Governance yüzeyleri (kanonik)

- `GOVERNANCE-INDEX.md` — routing/discovery + okuma sırası + belge haritası (RATIFIED/CANONICAL).
- `SYSTEM-CONSTITUTION.md` — system-wide semantic üst norm.
- Domain Governance belgeleri — bkz [05_DOMAIN_INDEX.md](05_DOMAIN_INDEX.md).
- `decision-log.md` — kronolojik, append-only karar/supersession kaydı.
- `canonicalization-policy.md` + `canonicalization-register.md` — kod-drift sınıflandırma (ARCHITECTURAL_DRIFT/DEAD_CODE/CUTOVER/INTENTIONAL_BOUNDED_CONTEXT) ve kayıt.
- `product-backlog.md` / `master-triage-register.md` / `active-roadmap.md` / `maintenance-register.md` — register'lar (authority/implementation izni üretmez).

## Kapanmış governance kararları (bu ortamda, kanonik olmayan tarihsel bağlam)

Aşağıdakiler bu ortamda alınmış governance sonuçlarıdır; **canonical kaynak main'deki `decision-log.md` ve ilgili belgelerdir** — bu satırlar yalnız navigasyon içindir:

- **R0.2 "Client/Debtor Governance Integration": NO-GO.** Dış governance kiti mevcut ratifiye çerçeveyle (AGENTS.md baseline + SYSTEM-CONSTITUTION + DEBTOR/RECEIVABLE/COLLECTION/OFFICE domain law) çakıştığı için reddedildi; repo-geneli ikinci governance rejimi kurulmadı.
- **Ağır artifact-revision state machine: kurulmayacak** (owner kararı; hafif model korunur).
- **CLIENT DOMAIN LAW: mevcut kanıtla gerekçelendirilmedi** (SYS-GOV-010 capability status; owner isterse ileride açılabilir).
- **Untracked R0.2 dosyaları: NON-CANONICAL, owner-gated cleanup durumunda.** Kaynak olarak KULLANILMAZ (bkz [10_PROJECT_MEMORY.md](10_PROJECT_MEMORY.md) ve KAYNAK DİSİPLİNİ). Konum: `codex/client-debtor-governance-integration` worktree'si (commit edilmedi).
