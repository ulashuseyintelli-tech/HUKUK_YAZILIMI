# SYSTEM CONSTITUTION — HUKUK_YAZILIMI Governance Çatısı

```text
Belge yolu : project/docs/governance/SYSTEM-CONSTITUTION.md
Durum      : PROPOSED — owner talimatıyla oluşturuldu (2026-07-12);
             bu governance PR'ının owner review/merge onayı ile RATIFIED olur.
Rol        : Governance belge hiyerarşisinin çatısı. Domain kuralı içermez;
             hangi belgenin hangi otoriteye sahip olduğunu ve nasıl değiştiğini tanımlar.
```

## RELATED DOCUMENTS

- Okuma sırası: `project/docs/governance/GOVERNANCE-INDEX.md`
- Domain governance (aktif): `project/docs/governance/DEBTOR-GOVERNANCE.md` (borçlu hattı)
- Domain governance (rezerve — henüz yazılmadı): Receivable Governance · Collection Governance
- Kanıt/analiz katmanı: `project/docs/analysis/debtor-master-synthesis-v2.md`
- ADR kütüğü: `project/docs/governance/architecture-index.md` + `project/docs/adr/`
- Karar kaydı: `project/docs/governance/decision-log.md`
- Master Register: `project/docs/governance/product-backlog.md`, `project/docs/governance/master-triage-register.md`, `project/docs/governance/active-roadmap.md`
- Ajan baseline: `AGENTS.md` (repo kökü)

## 1. Otorite hiyerarşisi

```text
AGENTS.md (repository-level ajan baseline'ı — bu anayasanın üstünde)
→ SYSTEM-CONSTITUTION (governance çatısı: hiyerarşi + değişim kuralları)
→ Domain governance belgeleri (DEBTOR-GOVERNANCE; ileride Receivable/Collection)
→ Contract / standard belgeleri (ilgili domain'in sözleşmeleri)
→ ADR'lar (architecture-index.md üzerinden, project/docs/adr/)
→ decision-log.md (kronolojik karar kaydı)
→ Master Register (product-backlog / master-triage-register / active-roadmap)
→ Implementation (kod, migration, test)
```

- Bu anayasa `AGENTS.md` ile çelişemez ve onu override etmez; çelişki halinde `AGENTS.md` uygulanır ve çelişki düzeltilmek üzere raporlanır (README kuralı ile aynı).
- Alt katman üst katmanla çelişemez; çelişki bir bulgudur, sessizce çözülmez.
- Bir domain governance belgesi yalnız kendi domain'i için bağlayıcıdır; domain'ler arası kesişim koordinasyon gerektirir (örn. borçlu hattı ↔ repo ADR-013/ADR-014 finansal hatları).

## 2. Çekirdek ilkeler

1. **Evidence-first:** Sohbet geçmişi yalnız niyet taşır; güncel gerçek her görevde repo/git/CI/governance state'inden doğrulanır.
2. **Owner kapıları:** Açık owner kararları (`MS/OD-*`, `MS/EXEC-*` vb.) decision-log kaydı olmadan kapanmış sayılmaz.
3. **Ratifikasyon ≠ implementation yetkisi:** Governance onayı iş başlatmaz; implementation ayrıca `GO-IMPLEMENT`/`GO-COMPLETE` ister.
4. **Hukuki zorunluluk koddan üstündür:** Kod ile hukuk çelişirse hukuk esas alınır; kod düzeltme backlog'una girer.
5. **Hukuki/finansal NEVER_AUTO sınırları değiştirilemez** (bkz. DEBTOR-GOVERNANCE §7).
6. **Operasyonel belge ≠ kanıt belgesi:** Governance belgeleri kuralı taşır; gerekçe ve kanıt analiz katmanında (`project/docs/analysis/`) yaşar ve silinmez.

## 3. Governance değişim kuralları

- Bu anayasa ve domain governance belgeleri yalnız **governance PR'ı** ile değişir.
- Her karar değişikliği `decision-log.md`'ye kaydedilir.
- Ratifiye edilmemiş fikirler kanonik kural olarak eklenmez (Triage → Product Backlog → READY → Active Roadmap).
- Yeni domain governance belgesi eklenirse: bu anayasanın RELATED DOCUMENTS listesi ve `GOVERNANCE-INDEX.md` aynı PR'da güncellenir.
- Her governance belgesinin başında `RELATED DOCUMENTS` bölümü, her kanıt/analiz belgesinin başında operasyonel karşılığını gösteren `SUPERSEDED BY` notu bulunur.
