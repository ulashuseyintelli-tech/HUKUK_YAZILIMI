# ADR-010: AccountingJournal North-Star Source of Truth — Finansal-Olay Kayıt Bütünlüğü

**Status:** Accepted (LOCKED as direction; execution gated)
**Date:** 2026-06-29
**Deciders:** Owner — Ulaş (kurucu ortak)
**Related:** #645 (S9F `AccountingJournalEntry`/`AccountingJournalLine` şema contract), `docs/governance/decision-log.md`, `docs/governance/active-roadmap.md` (PHASE 1-7 Accounting Engine), `docs/governance/product-backlog.md` (ACCT-1..6), ADR-009 (Universal Office Approval), TBK100 legal decisions, `balance-display-shadow-diff` / `balance-shadow-compare` modülleri

## Context

P4 Approval Engine kapandıktan sonra ürünün ana ekseni Accounting Engine'e çevrildi (decision-log 2026-06-29). Bu eksende en kritik mimari soru:

> AccountingJournal mı yoksa LedgerEntry mi finansal source-of-truth?

Bugünkü durum (kod-doğrulandı):

- **#645 (S9F)** persisted double-entry journal ŞEMASINI ekledi (`AccountingJournalEntry` + `AccountingJournalLine`), ama şema başlığı (schema.prisma) açıkça: *"Additive persistence only ... Existing LedgerEntry/LedgerAllocation remain the TBK100/legal ledger."* Journal şu an **UNWIRED** (posting service / controller / endpoint yok).
- `LedgerEntry` / `LedgerAllocation` = TBK100/legal ledger (yasal faiz/mahsup); `BalanceLedger` = avans/masraf. `computeBalance` / `getCalculationSummary` cutover'ı henüz **BİTMEMİŞ** (summary hâlâ otorite) — yani repoda zaten yarım bir SoT cutover'ı var.
- SoT-geçiş deseni repoda **HAZIR**: `balance-display-shadow-diff` + `balance-shadow-compare` (shadow → compare → guarded cutover).

Hukuki muhasebede SoT'u yanlış kurmak tehlikelidir: TBK100 faiz hesabı ve mahsup sırası yasal-bağlayıcıdır.

## Decision

**Hedef (north-star): AccountingJournal, finansal-olayların tek source-of-truth'udur.** Ancak bu bir YÖN kararıdır; bugün uygulanmaz.

Normatif cümleler (değiştirilmeden korunur):

> AccountingJournal is the target financial-event source of truth, but this ADR does not immediately supersede the current #645 additive-only contract.

> TBK100 rules remain legal authority.
> LedgerEntry/LedgerAllocation storage may later become a journal-derived projection.

### Kritik ayrım (KİLİTLİ — karıştırılmaz)

| Katman | Bugün | North-star hedefi |
|---|---|---|
| **TBK100 KURALLARI** (faiz, mahsup sırası) | Yasal otorite | **Yasal otorite KALIR** (projection OLMAZ) |
| **LedgerEntry / LedgerAllocation STORAGE** (satır temsili) | TBK100/legal ledger (kanonik) | İleride **journal-türevi projection** olabilir |
| **AccountingJournal** | additive / shadow (UNWIRED) | Finansal-olay **SoT** |

Yani: kanun kuralı SoT değişiminden etkilenmez; yalnız ledger'ın **DEPOLAMA temsili** journal'dan türetilen, journal'a karşı mutabık bir projeksiyona evrilebilir.

## Rules

### MUST
1. PHASE 1 Journal Engine **additive + SHADOW** yazar (dual-write; DEFAULT-OFF flag). Otorite KAYMAZ; `LedgerEntry` / `LedgerAllocation` / `BalanceLedger` write yolları KANONİK kalır.
2. Her journal entry dengeli olmalı (Σ DEBIT == Σ CREDIT) ve idempotent (`idempotencyKey`).
3. SoT faithfulness, cutover'dan ÖNCE kanıtlanır: journal-türevi bakiyeler == mevcut legal-ledger bakiyeleri (Trial Balance + shadow-compare ile). Mevcut `balance-*-shadow` deseni reuse edilir.
4. TBK100 KURALLARI her durumda yasal otorite kalır (faiz/mahsup mantığı journal'a yansısa bile kanonik hesap kanun-belirlidir).

### MUST NOT
1. #645 additive-only contract'ı bu ADR ile ŞİMDİ supersede ETME; journal'ı bugün otoriter SoT yapma.
2. TBK100-temsili → projection cutover'ı shadow / prove / legal-signoff OLMADAN yapma.
3. Faiz/mahsup yasal kurallarını "projection" diye yeniden-türetip kanonik kabul etme.
4. SoT inversion için yeni cutover deseni icat etme (mevcut shadow-diff/compare disiplinini reuse et).

### SHOULD
1. Trial Balance (PHASE 2) faithfulness harness'ı olarak erken gelir.
2. Cutover, ayrı ve legal-sign-off-gated bir karar olarak ileride değerlendirilir (bu ADR onu AÇMAZ).

## Non-Goals
- SoT inversion'ı şimdi implement etmek (yalnız yön kararı).
- #645 şema/kod değişikliği (bu ADR docs-only).
- TBK100 faiz/mahsup kurallarını değiştirmek.

## Consequences

### Positive
- Eksenin uzun-vadeli hedefi netleşir; PHASE 1 additive journal, daha büyük bir yayının ilk adımı olarak konumlanır.
- Hukuki güvenlik: kural-otoritesi ile depolama-temsili ayrımı baştan sabit.
- Mevcut shadow-cutover altyapısı reuse edilir; yeni desen icat edilmez.

### Negative
- Çok-fazlı, uzun program; cutover ayrı legal-gated karar.
- Yarım balance cutover'ı ile birlikte iki SoT-geçiş izi yönetilmeli.

### Neutral
- Bugünkü davranış değişmez (#645 additive-only korunur).

## References
- #645 (S9F) `AccountingJournalEntry` / `AccountingJournalLine` şema contract (schema.prisma).
- `docs/governance/decision-log.md`, `architecture-index.md`, `active-roadmap.md`, `product-backlog.md` (ACCT-1..6).
- `balance-display-shadow-diff` / `balance-shadow-compare` (mevcut SoT-cutover deseni); `computeBalance` / `getCalculationSummary` (yarım balance cutover).
- ADR-009 (Universal Office Approval) — approval artık accounting zincirinin destekleyicisidir.

## Revision History
| Date | Version | Change |
|---|---|---|
| 2026-06-29 | 1.0 | İlk karar (docs-only; LOCKED-as-direction, execution gated). AccountingJournal north-star SoT; TBK100 kuralları yasal otorite; storage ileride projection; cutover shadow→prove→legal-signoff sonrası. |
