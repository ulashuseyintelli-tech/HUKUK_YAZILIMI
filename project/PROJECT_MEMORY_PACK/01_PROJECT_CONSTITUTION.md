# 01 — PROJECT CONSTITUTION (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : SYSTEM-CONSTITUTION.md'ye yönlendirme + kritik invariant özeti + yeni Claude okuma rehberi
Scope                         : Sistem çapı semantic anayasa özeti (yeniden üretim DEĞİL)
Authority                     : NONE — yeni authority üretmez. Bağlayıcı kaynak: SYSTEM-CONSTITUTION.md
Source Documents              : project/docs/governance/SYSTEM-CONSTITUTION.md (SYS-CONST-001, RATIFIED-BINDING v1.0),
                                AGENTS.md, project/docs/governance/GOVERNANCE-INDEX.md
Supersedes                    : NONE
Update Policy                 : Yalnız SYSTEM-CONSTITUTION.md değişince güncellenir; asla onun yerine geçmez.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER. Bu belge yeni semantic authority üretmez ve `SYSTEM-CONSTITUTION.md`'yi supersede etmez. Çelişki halinde `SYSTEM-CONSTITUTION.md` esastır.

## Bağlayıcı kaynak

Sistem çapı domain/business semantiğinin, source-of-truth sınırlarının, invariant'ların, governance hiyerarşisinin ve canonicalization kurallarının TEK üst normu: **`project/docs/governance/SYSTEM-CONSTITUTION.md`** (belge kimliği `SYS-CONST-001`, RATIFIED — BINDING). Bu dosya onun özeti ve yönlendiricisidir; onu değiştirmez.

## İki authority ekseni (SYS-AUTH-001..006)

```text
Semantic authority : SYSTEM-CONSTITUTION → Domain Law → ADR → Implementation
Execution/safety   : AGENTS.md (repo baseline) + repository/tool policies + task authorization
```
Eksenler tek doğrusal üstünlük değildir; semantic authority execution izni vermez, execution authority domain semantiğini değiştirmez. Her görev iki eksene aynı anda uyar.

## Sistem amacı

Hukuk (icra/takip/tahsilat) yazılımı: borçlu, alacak, tahsilat, müvekkil, ofis (avukat/personel) ve deterministik hukuki hesaplama domainleri. Amaç: hukuki ve finansal doğruluğu deterministik katmanda güvence altına almak; generative AI'yı yalnız yardımcı katmanda tutmak.

## Owner authority

Owner kararı scope, tarih, semantic ve repository etkisi taşır (SYS-DEC-001). Ajan verilmemiş owner kararını varsayamaz. Açık owner gate'i yalnız açık karar + governance kaydıyla kapanır (SYS-DEC-008).

## Kritik invariant özeti (bağlayıcı hükümler ilgili kaynakta)

- **Tenant isolation:** tüm okuma/yazma tenant-scoped; batch işlemler her girdinin ownership'ini tek tek doğrular (DEBTOR-GOVERNANCE INV-01/02; SYS §13).
- **Tek canonical authority / fail-closed:** aynı hukuki/finansal fact için aynı anda birden fazla production primary authority olamaz; çatışmada projection kazanmaz, işlem fail-closed olur (SYS-SOT-003/005).
- **Current ≠ Target:** belge/şema varlığı runtime implementation kanıtı değildir (SYS-SOT-001).
- **Migration/backfill:** staged, additive-first, no-guess + idempotent backfill, dual-write geçici+süreli, read/write ayrı cutover, cutover açık gate ister, backward-compatibility varsayılan (SYS-MIG-001..010; SYS-SOT-006).
- **AI/automation sınırı:** AI hukuki veya finansal authority değildir; kanonik hukuki/finansal state yazamaz; recommendation command değildir; Digital Twin source of truth değildir (SYS-AI-001/002; SYS-DEC-007; DEBTOR-GOVERNANCE INV-06/09).
- **Hukuki/finansal fact üretme sınırı:** mock/synthetic veri legal fact olamaz; user input tek başına external truth değildir; legal time versiyonludur; competing legal-time authority PRODUCTION_NO_GO (SYS-LEGAL-002/003/005; SYS-SOT-007; DEBTOR-GOVERNANCE INV-03/04/05).
- **Evidence ayrımı:** AuditLog ≠ DomainEvent ≠ LegalEvidence; evidence immutable+traceable; DomainEvent transactional+idempotent (outbox) (SYS-EVID-001..008; DEBTOR-GOVERNANCE INV-08/12).
- **Karar/ratification/merge/implementation ayrımı:** merge ratifikasyon değildir; ratifikasyon implementation yetkisi değildir; geçmiş rewrite edilmez (append-only) (SYS-DEC-002/003/004).

## Domain ve bounded-context sınırları

Beş primary legal-operation domain (SYS-GOV-013): `OFFICE`, `CLIENT`, `DEBTOR`, `RECEIVABLE`, `COLLECTION`. Sınırlar SYS-GOV-014..018'de tanımlıdır. Accounting'in konumu açık owner kararıdır (SYS-GOV-020). Ayrıntı: [05_DOMAIN_INDEX.md](05_DOMAIN_INDEX.md).

## Yeni Claude için okuma rehberi

Zorunlu ilk okuma: `AGENTS.md` → `GOVERNANCE-INDEX.md` → `SYSTEM-CONSTITUTION.md` → ilgili Domain Law → ilgili roadmap/charter → `decision-log.md`/register'lar. Operasyonel giriş: [09_NEW_WORKSTATION_HANDOFF.md](09_NEW_WORKSTATION_HANDOFF.md).
