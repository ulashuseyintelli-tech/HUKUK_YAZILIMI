# COLLECTION GOVERNANCE

## Tahsilat Domaini — Domain Governance

```text
Belge yolu              : project/docs/governance/COLLECTION-GOVERNANCE.md
Durum                   : CANONICAL DOMAIN GOVERNANCE
Owner Status            : OWNER-APPROVED CANONICALIZATION (owner review tamamlandı + GO-DOCS
                          canonicalization talimatı, 2026-07-13)
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Üst Otorite             : SYSTEM-CONSTITUTION (SYS-*) — bu belge system-wide normu yeniden tanımlamaz
  Kardeş Domain Law       : RECEIVABLE-GOVERNANCE v1.9 (RATIFIED) — ikinci Receivable anayasası DEĞİLDİR
  Sürüm                   : 1.7 (2026-07-21 — TPA-04B contract + schema-amendment evidence)
Kanıt tabanı            : repo main @ beb7d6735fb4002ad6169604531681414a17aa0e
                          + Handoff Acceptance Report (2026-07-13)
                          + TAHSILAT_BLOKU_CANONICAL_MIMARI v1.0 (Master Analysis damıtımı, Desktop 01)
IMPLEMENTATION AUTHORITY: NONE — bu belgenin varlığı, review'i veya merge'i hiçbir kod, schema,
                          migration, feature activation, cutover ya da release yetkisi üretmez
                          (SYS-GOV-003 uygulaması)
```

---

# NON-GOALS

Bu belge:

- RECEIVABLE-GOVERNANCE'ın tekrarı veya ikinci Receivable anayasası değildir.
- Master Synthesis (kanıt katmanı) değildir — kanıt COLLECTION-MASTER-SYNTHESIS.md'dedir.
- Risk Register, Owner Decisions dossier'i veya Decomposition değildir.
- ADR değildir; teknik implementasyon rehberi değildir.
- Hiçbir açık owner kararını ratifiye etmez (açık kararlar COLLECTION-OWNER-DECISIONS.md'de).

Normatif tekrar yasağı (SDOM §2): Başka canonical belgede yaşayan norm burada yalnız
ID/bölüm referansıyla anılır, kopyalanmaz.

# READING ORDER

```text
AGENTS.md → GOVERNANCE-INDEX.md → SYSTEM-CONSTITUTION.md
→ RECEIVABLE-GOVERNANCE.md → (bu belge) COLLECTION-GOVERNANCE.md
→ tm3-collection-disposition-boundary.md (ONAYLANDI sınır sözleşmesi)
→ dbind-financial-authority-decisions.md (ONAYLANDI finansal otorite kararları)
→ ADR-014 / ADR-013 / ADR-010 / ADR-009
→ decision-log.md → Master Register
```

---

# 1. Domain amacı ve bounded context

## 1.0. Anayasal çapa

COLLECTION, `SYS-GOV-013 — Beş Primary Legal-Operation Domain` hükmünde sayılan beş primary
domain'den biridir (SYSTEM-CONSTITUTION.md:172). Bu belge, Constitution'ın COLLECTION sınır
hükmü `SYS-GOV-018`'i — "COLLECTION receipt, cash provenance, idempotency, reversal/refund
başlangıcı ve legal allocation sonucu ile bağlantının sahibidir. Creditor entitlement veya
accounting classification'ı tek başına belirleyemez." (SYSTEM-CONSTITUTION.md:202-205) —
YALNIZ AYRINTILANDIRIR; değiştiremez veya zayıflatamaz (additive ilişki; OFFICE-GOVERNANCE'ın
SYS-GOV-014 ile kurduğu desenin aynısı).

## 1.1. Amaç

COLLECTION domaini şunların sahibidir (SOURCE: Master Analysis → Desktop 01 §5;
KANIT: `CollectionService` tek otorite — TM3 §2, invariant 13):

- gerçekleşen para/değer girişini (receipt fact) kaydetmek,
- işlem kimliği, belge ve provenance taşımak,
- Collection lifecycle durumunu yönetmek,
- idempotent command execution sağlamak,
- Receivable'ın hukuki allocation politikasını deterministic olarak YÜRÜTMEK
  (politikanın sahibi değil, yürütücüsüdür — REC-AUTH-011/012),
- current AS-IS ledger etkisini append-only kayıtlarla üretmek; target persistence'ta
  yalnız ratifiye tek-yazıcı cross-domain boundary içinde orchestration yapmak,
- fazla ödeme (overpayment), refund ve reversal lifecycle'ını yönetmek,
- downstream finansal dağıtım için güvenilir tahsilat fact'i üretmek,
- audit, actor ve correlation bilgisini taşımak (bugün kısmi — bkz. COL-INV-037..043
  lifecycle etiketleri).

## 1.2. Bounded context hükmü

**COL-BC-001 — "Tahsilat Bloku" tek bounded context değildir.**
RECEIVABLE, COLLECTION, CLIENT-FINANCIAL SETTLEMENT ve ACCOUNTING ayrı domainlerdir;
Tahsilat Bloku bunları çapraz kontratlarla yöneten bir Program şemsiyesidir.
(SOURCE: Desktop 01 §0.2; repo teyidi: REC-GOV §6 domain ownership tablosu + TM3 §1.)

**COL-BC-002 — İki ayrı "tahsilat" vardır ve asla tek kelimeyle anılmaz.**
Borçlu tahsilatı (`Collection`, dosya etkisi) ≠ tahsilatın dağıtımı
(`CollectionDisposition`, müvekkil–ofis etkisi). (SOURCE: TM3 §1 — ONAYLANDI.)

---

# 2. Canonical vocabulary

REC-GOV §4'teki tanımlar esas alınır; aşağıdakiler Collection'a özgü ekleridir
(SOURCE: Desktop 01 §7; çakışma kontrolü: REC-GOV §4 ile uyumlu):

| Terim | Canonical anlam | Lifecycle |
|---|---|---|
| Receipt / Tahsilat Girişi | Paranın/değerin sisteme girdiği fact | CURRENT |
| Collection | Receipt'in bağlam, statü, belge ve işlem taşıyıcısı | CURRENT |
| Internal Confirmation | Sistem içi kayıt onayı; banka finality değildir | CURRENT |
| External Settlement | Banka/sağlayıcı kesinleşmesi | TARGET — LIFECYCLE + HYBRID TYPED EVIDENCE CONTRACT RECORDED / PENDING CANDIDATE INGRESS + UNSETTLED ADMISSION GUARD + TYPED EVIDENCE + FINALITY PROJECTION SCHEMA FOUNDATIONS + DEDICATED VERIFIER PERMISSION BOUNDARY + IMMUTABLE HUMAN EVIDENCE WRITER + CANDIDATE CAS TRANSITION + EVIDENCE-INTEGRITY ADMISSION GUARD PRESENT / `confirmedAt` + PROJECTION HARDENING REMAIN (COL/OD-06 Option A + COL/OD-06A; W2.2A/B/C-0/C-1/C-2/C-3/C-4/C-5/D-0) |
| Legal Allocation | Tahsilatın target `LegalCalculationBucket` üzerindeki immutable hukuki etkisi (`LegalApplication`); ClaimItem/source açıklaması ayrı, non-authoritative `ApplicationAttribution` fact'idir | TPA-03A FOUNDATION + TPA-04B REQUIRED-EVIDENCE SCHEMA AMENDMENT CLOSED / CANONICAL EVIDENCE; PLAN/WRITER/REPLAY/CUTOVER NOT AUTHORIZED; TARGET SHADOW_ONLY (XD-001; REC-AUTH-011/012) |
| TBK100 Allocation | Masraf→fer'i→işlemiş faiz→anapara deterministic mahsup | CURRENT (REC-GOV §9.2 — norm oradadır) |
| Client Disposition | Tahsilatın müvekkil/ofis dağıtım kararı | CURRENT (TM3) |
| Client Offset | Müvekkil finansal bakiyeleri arası settlement; debtor set-off DEĞİL | CURRENT (adr-client-offset) |
| Overpayment | Borcu aşan para; borç değil, emanet/HELD sınıfı | CURRENT (schema `CollectionOverpayment`) |
| Unapplied Payment | Borca uygulanmamış tahsilat; overpayment ile otomatik eş anlamlı DEĞİL | TARGET — CONTRACT RECORDED / RUNTIME ABSENT (COL/OD-06 Option A) |
| Refund | Paranın ayrı çıkış hareketiyle iadesi | TARGET — partial refund NO_GO (REC-AUTH-015) |
| Reversal | Önceki hukuki etkinin bağlı compensating event ile geri alınması | CURRENT — yalnız linked FULL reversal (REC §11) |
| Legal Balance | Receivable policy'ye göre hukuki bakiye | REC-AUTH-021/022 statüsüne tabidir |
| Accounting Balance | Journal projection'ı; legal balance authority DEĞİL | ADR-010 gated |
| Operational Metric | Strateji/eligibility türevi; canonical legal balance DEĞİL | CURRENT ilke |

**COL-VOC-001 — Yalın `payment`, `mahsup`, `bakiye`, `settlement`, `dosya tutarı`,
`amount`, `remainingAmount` isimleri qualifier olmadan yeni API/kolon/DTO'da kullanılamaz.**
(SOURCE: Desktop 01 §7; SYS ile uyumlu basis-açıklığı ilkesi.)

---

# 3. Dört gerçeklik ve source-of-truth matrisi

## 3.1. Dört gerçeklik

Her parasal çıktı basis'ini açıkça taşır (SOURCE: Desktop 01 §9):

1. **Cash Reality** — para gerçekten girdi/çıktı mı? (Collection / ClientPayout)
2. **Legal Reality** — hukuki borç ne ölçüde azaldı? (current AS-IS
   `LedgerEntry`/ClaimItem-keyed `LedgerAllocation`; target
   `LegalCalculationBucket` + `LegalApplication` + canonical hesap)
3. **Operational Reality** — hangi aksiyon alınmalı? (projection/metric)
4. **Accounting Reality** — muhasebede ne tanındı? (AccountingJournal — ADR-010)

Bu dörtlünün aynı tutarı göstermesi zorunlu değildir; alan yalnız `balance` adı taşıyamaz.

## 3.2. Source-of-truth matrisi

(KANIT sütunu: repo main @ beb7d673 üzerinde bu oturumda doğrulanan dosya/satır ya da
ratifiye belge referansı.)

| Gerçek | Canonical authority | KANIT / statü |
|---|---|---|
| Receipt fact | `Collection` — tek yazım otoritesi `CollectionService` | collection.service.ts:393; TM3 inv-13 |
| Hukuki para etkisi | Target: independent `LegalApplicationBatch` + immutable `LegalApplication` on `LegalCalculationBucket`; current AS-IS/legacy: `LedgerEntry` + ClaimItem-keyed `LedgerAllocation` | TPA-03A exact two-file schema foundation PR #1449 / `63f0b0ea` ile canonical; `LegalApplicationWriter` yalnız canonical Collection transaction client ile tek logical writer; writer/replay/conservation enforcement/cutover NOT AUTHORIZED |
| Claim amount/provenance | `ClaimItem` authority alanları | REC-AUTH-001..004 (collectedAmount NON-AUTHORITATIVE) |
| Hukuki bakiye (hedef) | canonical computeBalance | REC-AUTH-021/022 — bugün SHADOW_ONLY (case-balance-display.ts:766) |
| Hukuki bakiye (fiili bugün) | legacy calculation-summary | case.service.ts:4097-4101 primary; CUTOVER NOT AUTHORIZED |
| Overpayment | `CollectionOverpayment` (HELD) | schema.prisma:2362-2391; collection.service.ts:548-666 |
| Müvekkil dağıtımı | posted `CollectionDisposition` + satırları | TM3 §3/§5.1; dbind §3 kanonik akış |
| Müvekkile borç | `CLIENT_PAYABLE` disposition line | TM3 inv-3 |
| Gerçek payout | `ClientPayout` | schema.prisma:8529/8540 (idempotency kontratlı) |
| Client offset | `ClientOffset` | adr-client-offset-cross-ledger-settlement.md (Accepted) |
| Muhasebe | `AccountingJournalEntry/Line` | ADR-010 (LOCKED direction; UNWIRED/shadow) |
| UI/report/export/UYAP | yukarıdaki otoritelerin read projection'ı | REC-AUTH-027/028; bağımsız formül yasak |

---

# 4. Ownership sınırı (ÖZEL GÖREV — Receivable/Collection/komşu domainler)

## 4.1. COLLECTION'ın sahip OLDUĞU

- Collection receipt fact, statüsü, belgesi, provenance'ı (REC-AUTH-010: "COLLECTION owner").
- Collection lifecycle: create → (internal confirmation) → cancel/void (approval-gated).
- Legal allocation SONUCU ile bağlantı ve current AS-IS ledger yazımı (`SYS-GOV-018`
  dili): TBK100 politikasının (sahibi RECEIVABLE — REC-GOV §9.2) tek transaction içinde
  deterministic yürütülmesi ve mevcut LedgerEntry/LedgerAllocation üretimi. Bu persistence
  target legal authority olarak ratifiye edilmemiştir. Target yürütme REC-AUTH-011/012
  single-writer cross-domain legal-application boundary'sine tabidir; bu belge tek taraflı
  policy, persistence veya allocation authority'si kurmaz.
- CollectionOverpayment (yalnız borç-üstü tahsil; HELD emanet sınıfı).
- Linked full reversal execution (compensating REVERSAL satırı + net-zero ayna).
- PAYMENT_RECEIVED / PAYMENT_REVERSED / OVERPAYMENT_RECORDED domain event üretimi (same-tx).

## 4.2. RECEIVABLE'ın sahip olduğu (Collection burada yalnız tüketici/yürütücü)

- ClaimItem semantiği, demandedAmount, interestTypeCode, Due→ClaimItem ingress (REC §7.2, §8).
- Allocation POLİTİKASI: TBK100 sırası ve REC-ALLOC-001..004 (REC-GOV §9.2 — norm oradadır,
  burada kopyalanmaz).
- Canonical Receivable snapshot, target `LegalCalculationBucket`, `LegalApplication` ve
  `ApplicationAttribution` ayrımı (REC §4, §9.2).
- Faiz tabanı ve legal balance semantiği (REC §10; REC-AUTH-021/022).
- Reversal'ın hukuki kapsam sınırı: linked-full-only, partial NO_GO (REC §11, REC-AUTH-015).

## 4.3. ACCOUNTING'e bırakılan

- Journal posting ve muhasebesel projection (ADR-010; REC-BOUNDARY-002: journal legal balance
  hesaplamaz). Collection create/cancel journal'a kanıt yazar (collection.service.ts:496;
  collection-cancel-executor.ts:209-217) ama muhasebe otoritesi ACCOUNTING domainindedir.
- Accounting write-off hukuki sona erme üretmez (COL-INV-005; SYS-FIN ailesiyle uyumlu).

## 4.4. DEBTOR'a bırakılan

- Debtor/CaseDebtor kimliği, legal role, liability rejimi (DEBTOR-GOVERNANCE).
- Tahsilat tahsisi = NEVER_AUTO sınırı DEBTOR-GOV §7'de yaşar; REC-GOV §9.1 bunu korur.
  Collection, case-scoped payment dışında debtor-level pool davranışı sergileyemez.
- PaymentDesignation/PaymentScope ratifiye DEĞİL: sistem kendiliğinden tahsis beyanı üretemez
  (SOURCE: Desktop 01 §20; repo teyidi: böyle bir model/contract yok).

## 4.5. OFFICE'e bırakılan

- Actor kimliği, rol, yetki, delegasyon (OFFICE-GOVERNANCE Domain Law).
- Approval kararının kendisi: `OfficeApprovalRequest` zinciri (ADR-009 — tahsilat iptali,
  ödeme iptali, mahsup apply/reverse kapsam-içi). Finansal domain approval'ın VARLIĞINI
  doğrular, kararı yeniden üretmez ve approval kaydını overwrite etmez.
- Self-approval rejimi ve istisnaları dbind §5 + OWN-29-A/B/C/D ile sabittir:
  `COLLECTION_VOID` payout değildir, self-approval istisnasını miras almaz.

## 4.6. CLIENT-FINANCIAL SETTLEMENT'a bırakılan

- CollectionDisposition, ClientPayable, ClientPayout, ClientOffset, ClientStatement
  (TM3 §3/§5/§5.1 — D1 KİLİTLİ: payout BalanceLedger'a yazılmaz).
- Finansal otorite CaseClient/creditor set'tir; `Case.clientId` finansal otorite DEĞİLDİR
  (dbind §1). Disposition `clientId` ile kurulmaz (TM3 inv-4).
- Borçlu tahsilatı otomatik müvekkile borç değildir (TM3 inv-1/2/3).

**CLIENT ↔ COLLECTION named contract (XDC-C — Creditor Disposition and Client Settlement)**: yukarıdaki §4.6 hükümleri tekrar edilmeden — COLLECTION receipt, collection ledger, payable, payout, offset, allocation/source-linkage ve money-out lifecycle otoritesini elinde tutar; **creditor disposition CLIENT/COLLECTION shared ve approval-gated**tır (`CL-INV-005`; Constitution Financial SOT §9). CLIENT PROVIDES: creditor scope/context, instruction/disposition context. CLIENT NON-AUTHORITY: collection ledger mutation, money-out execution, legacy `clientId`-tabanlı entitlement. AÇIK pointer'lar: COL/OD-07 · COL/OD-08 · COL/OD-09 · COL/OD-10 · COL/OD-14 · COL/OD-15 · COL/OD-19 · financial role/approval predicate. Refund/reversal/financial-role policy bu clause'da SEÇİLMEZ. CLIENT-tarafı index: `CLIENT-GOVERNANCE-CHARTER.md` §6 XDC-C.

## 4.7. Açık sınır uyuşmazlığı (ÇÖZÜLDÜ — COL/OD-18 RECORDED → COL/OD-18A AMENDED)

**COL-BOUNDARY-CONFLICT-001:** Handoff işletim haritası (Desktop 01 §0.3 / 03 §2)
CollectionDisposition/ClientPayable/ClientPayout/ClientOffset uygulamasını **Codex para
hattına** atar; repo'da bağlayıcı TM3 (§5, §11) client-settlement modülünü **Claude'a** atar
ve D2 kararı consumer handler'ı Claude client-settlement'a kilitler. Repo otorite sırası
gereği TM3 CURRENT-BINDING'dir; handoff ataması PROPOSED'dur. Nihai lane ataması
**COL/OD-18** owner kararına bırakılmıştır. Bu belge lane değiştirmez.

**ÇÖZÜM (2026-07-15):** COL-BOUNDARY-CONFLICT-001 owner kararıyla kapanmıştır:
COL/OD-18 RECORDED (execution lane = Claude; main@`dd46aa03`) → **COL/OD-18A AMENDED**
(PR #1257, main@`c4ee2332`): client-settlement + W1.3 Payout Replay Harness
implementation/execution lane'i **Codex**, Claude **analysis/review**; aynı anda tek aktif
writer, paralel yazım PROHIBITED (Analysis Owner ≠ Implementation Owner —
`process-rules.md` § Lane Ownership). Yukarıdaki paragraf tarihsel kayıt olarak korunmuştur;
authoritative kayıt: `decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18A`.

---

# 5. Invariantlar

Aşağıdaki tablolar Master Analysis'in COL-INV-001..048 setini (SOURCE: Desktop 01 §11–16)
korur ve her birine repo-kanıtlı lifecycle etiketi ekler:

- `CURRENT-CONFIRMED` — main @ beb7d673 üzerinde davranış/şema kanıtı bu oturumda doğrulandı.
- `CURRENT-PARTIAL` — kısmen mevcut; açık boşluk Risk Register'da kayıtlı.
- `CURRENT-PRINCIPLE` — normatif ilke; ihlali bilinmiyor, hedefli runtime kanıtı bu turda üretilmedi.
- `TARGET-OWNER-GATED` — bugün mevcut değil; owner kararı/kontratı olmadan CURRENT ilan edilemez.
- `CURRENT-VIOLATED-KNOWN` — norm bağlayıcıdır ve yürürlüktedir; bilinen ihlaller Risk
  Register'da DRIFT sınıfında kayıtlıdır ve düzeltmeleri cutover/W-programına bağlanmıştır.

## 5.1. Finansal ve hukuki invariantlar

| ID | Kural (kısa) | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-001 | Tahsilat girişi tek başına alacağı kapatmaz | CURRENT-CONFIRMED | Etki yalnız allocation hattından; REC-BOUNDARY-001 |
| COL-INV-002 | ClaimItem legal source/provenance/calculation input'tur; target legal-application target'ı değildir | CURRENT-CONFIRMED SOURCE ROLE / TARGET APPLICATION GRAIN OWNER-RATIFIED | REC-AUTH-004/011/012; RCV-P2-WS04 amendment |
| COL-INV-003 | Collection ≠ LedgerEntry ≠ LedgerAllocation | CURRENT-CONFIRMED | schema.prisma:2311/5169/5217 ayrı modeller |
| COL-INV-004 | Legal allocation ≠ client disposition | CURRENT-CONFIRMED | TM3 inv-7 |
| COL-INV-005 | Accounting write-off hukuki sona erme üretmez | CURRENT-PRINCIPLE | ADR-010 sınırı; REC-BOUNDARY-002 |
| COL-INV-006 | ClientOffset debtor set-off değildir | CURRENT-CONFIRMED | adr-client-offset (Accepted, locked invariants) |
| COL-INV-007 | Overpayment borç veya negatif claim değildir | CURRENT-CONFIRMED | CollectionOverpayment HELD; schema:2362-2391 |
| COL-INV-008 | Unapplied ≠ overpayment | TARGET-CONTRACT-RECORDED / RUNTIME-ABSENT | COL/OD-06 Option A; unapplied lifecycle henüz yok |
| COL-INV-009 | Refund ayrı para çıkış event'idir; Collection overwrite edilmez; chargeback otomatik refund/reversal değildir | CURRENT-PRINCIPLE (full) / TARGET (partial) | COL/OD-06 Option A; REC §11.3; REC-AUTH-015 |
| COL-INV-010 | Reversal yalnız açık bağlı compensating event ile | CURRENT-CONFIRMED | COL/OD-01 Option A; cancel-executor.ts:137-145; reversesLedgerEntryId @unique |
| COL-INV-011 | Posted/confirmed finansal kayıt fiziksel silinmez veya yerinde değiştirilmez | CURRENT-CONFIRMED | COL/OD-01 Option A; Ledger'da production update/delete yok; TM3-S1 hard-delete kapatıldı |
| COL-INV-012 | collectedAmount/amount/display cache legal authority olamaz; collectedAmount için yeni reader/writer açılamaz | CURRENT-CONFIRMED | REC-AUTH-003/004; XD-001 |
| COL-INV-013 | Dosya kapanışı claim satisfaction değildir | CURRENT-PRINCIPLE | Satisfaction modeli yok; COL/OD-08 |
| COL-INV-014 | Muhasebe kapanışı hukuki kapanış değildir | CURRENT-PRINCIPLE | ADR-010 yön sınırı |
| COL-INV-015 | Hukuki politika/override yalnız yetkili actor + approval ile | CURRENT-PARTIAL | ADR-009 + OWN-29-B (void approval-gated); genel override matrisi COL/OD-07 |
| COL-INV-016 | Para çıkışı/override/yüksek etkili adjustment özel approval taşır | CURRENT-CONFIRMED | CLIENT_PAYOUT_POST + COLLECTION_VOID + CLAIM_ITEM_HIGH_IMPACT_CHANGE (dbind §5, OWN-29-*) |

### COL-CORR-001 — Historical financial correction contract (COL/OD-01 Option A)

1. **Lifecycle split:** `PENDING` kayıtlar yalnız ilgili kayıt tipi için yetkilendirilmiş
   correction kuralları içinde düzeltilebilir. `CONFIRMED` veya `POSTED` finansal fact yerinde
   değiştirilemez ve fiziksel olarak silinemez.
2. **Erroneous fact:** Hatalı confirmed/posted kayıt, özgün kaydı açıkça referanslayan valid
   linked full reversal ile terslenir. Doğru finansal sonuç, reversal satırının overwrite'ı
   olarak değil, ayrı ve idempotent yeni canonical command ile oluşturulur.
3. **Missing fact:** Eksik finansal kayıt yalnız kaynak evidence ve provenance taşıyan yeni
   canonical command olarak eklenebilir; mevcut bir fact'e sessiz backfill veya in-place edit
   yapılamaz.
4. **Partial/delta boundary:** Partial reversal, delta adjustment ve indirgenemeyen historical
   repair için ayrı typed contract ratifiye edilene kadar işlem fail-closed kalır. Genel amaçlı
   `ADJUSTMENT` etiketi tek başına hukuki veya finansal correction authority'si değildir.
5. **Authorization and audit:** Historical correction dual control, action-specific approval ve
   COL/OD-05'e uygun transaction-bound audit gerektirir. Approved execution; reversal, yeni
   command, allocation/ledger etkileri, event/outbox ve audit izleri bakımından ilgili atomic
   boundary dışında kısmi başarı üretemez. Approval workflow kendi authority'sinde kalır;
   execution onaylanmış intent'i açıkça referanslar.
6. **Effective date:** Reversal ve replacement command'in hukuki etki tarihi COL/OD-03
   `COL-TIME-001` canonical effective-date authority'sine tabidir; correction işlemi yeni veya
   tahmine dayalı bir tarih authority'si üretemez.
7. **Scope boundary:** Bu contract runtime implementasyonu, schema, migration, backfill,
   geçmiş kayıtların yeniden hesaplanması, partial refund/reversal, downstream remediation veya
   Phase 2 başlangıcı/cutover yetkisi vermez.

## 5.2. Para birimi ve hassasiyet

| ID | Kural | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-017 | Her tutar currency taşır | CURRENT-PRINCIPLE | REC-FX-001 ekseni |
| COL-INV-018 | Yetkili FX contract'sız toplama/netleme yok | CURRENT-CONFIRMED | REC-AUTH-018/019; mismatch fail-closed |
| COL-INV-019 | Floating point authority olamaz | CURRENT-PRINCIPLE | REC-ALLOC-004 (norm REC'te) |
| COL-INV-020 | Minor-unit/rounding merkezî ve deterministic | CURRENT-PARTIAL | ADR-014 PR-3h cent hardening (calc-core scope) |
| COL-INV-021 | Allocation satır toplamı uygulanan tutarı aşamaz | CURRENT-CONFIRMED (canonical create) | A2 gerçek PostgreSQL concurrency harness: PR #1217; COL-RISK-T01 CLOSED |
| COL-INV-022 | Bileşen bazında allocation hukuki tutarı aşamaz | CURRENT-CONFIRMED (canonical create) | Aynı Case/ClaimItem, farklı-key A2 kanıtı: PR #1217; COL-RISK-T01 CLOSED |
| COL-INV-023 | Kuruş remainder davranışı testle sabitlenir | CURRENT-CONFIRMED | Gerçek Collection→ledger zincirinde exact decimal allocation/remaining/overpayment kanıtı: W1.1 PR #1223, squash `5fe5f0eb`; lost cent, over-allocation ve negative remainder yok |

## 5.3. Transaction / concurrency / idempotency

| ID | Kural | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-024 | Finansal command tenant-scoped idempotency taşır | CURRENT-CONFIRMED (create yolları) | Collection @@unique(tenantId,idempotencyKey) schema:2336; ClientPayout schema:8540 |
| COL-INV-025 | Aynı key + aynı payload yeni etki üretmez | CURRENT-CONFIRMED | collection.service.ts:414-418; client-payout.service.ts:333-353 |
| COL-INV-026 | Aynı key + farklı payload fail-closed conflict | CURRENT-CONFIRMED | IDEMPOTENCY_KEY_CONFLICT client-payout.service.ts:595-613 |
| COL-INV-027 | Collection+ledger+allocation+overpayment aynı atomic boundary'de | CURRENT-CONFIRMED | collection.service.ts:393-666 tek $transaction |
| COL-INV-028 | Aynı case/currency scope'ta concurrency over-allocation üretemez | CURRENT-CONFIRMED (canonical path) | A2 gerçek PostgreSQL kanıtı PR #1217; explicit lock contract COL/OD-04; ikinci allocation write path'i W1.2 PR #1279 ile fail-closed kapatıldı — COL-RISK-D04/G02 CLOSED |
| COL-INV-029 | Money-out command'leri approval'a ek idempotent | CURRENT-CONFIRMED | dbind §5 + COL/OD-21; ClientPayout kontratı; CollectionDisposition collectionId @unique |
| COL-INV-030 | Retry duplicate statement/journal/payable/payout üretemez | CURRENT-CONFIRMED | COL/OD-21 + gerçek PostgreSQL sequential+concurrent same-key payout replay harness'ı 10/10 PASS: W1.3 PR #1265, squash `081bd961`; duplicate payout yok |
| COL-INV-031 | Mid-transaction failure orphan satır bırakamaz | CURRENT-CONFIRMED | Gerçek Collection transaction'ında deterministic post-allocation failure ve orphan-row doğrulaması: PR #1220, squash `c46de431`; atomic rollback confirmed |

### COL-LOCK-001 — Canonical allocation concurrency contract (COL/OD-04)

1. **Authority:** PostgreSQL transaction-scoped same-case advisory lock, canonical allocation
   concurrency authority'dir. Event aggregate-version akışındaki kullanım A2 ile güvenli
   bulunmuş; W1.2 PR #1279 lock'u ilk allocation-sensitive ClaimItem okumasından önce açıkça
   alarak korumayı allocation kontratına taşımış ve event yan etkisine sessiz bağımlılığı
   kaldırmıştır.
2. **Scope:** Tenant doğrulaması yapılmış tek `Case`; lock currency'den bağımsız case-wide
   serialization uygular. Bu, aynı case/currency minimum invariantından daha sıkı bir kapsamdır.
3. **Key:** `hashtextextended(caseId, 0)`. `Case.id` global primary key'dir. Mevcut
   `tenantId + idempotencyKey` lock'u replay/conflict sınırıdır; allocation serialization
   authority'si değildir ve bu lock'un yerine geçmez.
4. **Transaction boundary:** Lock ilk allocation-sensitive `ClaimItem` okumasından önce
   canonical `CollectionService.create` Prisma transaction'ı içinde alınır; Collection,
   event/outbox, ledger, allocation, `ClaimItem`, overpayment ve transaction-bound audit
   etkileri commit veya rollback olana kadar tutulur.
5. **Failure / retry:** Lock timeout, deadlock veya transaction hatası fail-closed'dur; bütün
   transaction rollback edilir. Kısmi persistence ve transaction-içi kısmi retry yasaktır.
   Retry yalnız bütün canonical Collection command'inin aynı idempotency key ile yeniden
   yürütülmesidir. Bu karar `SERIALIZABLE`, schema, migration veya yeni unique guard gerektirmez.
6. **Second path:** Canonical `CollectionService.create` dışındaki ikinci canlı allocation
   giriş yolunun disposition'ı **CLOSE**'dur. Ayrı authority bırakılamaz veya aynı lock'a
   bağlanarak yaşatılamaz. Ortak internal allocator yalnız canonical Collection transaction'ı
   içinde ve bu lock altında kullanılabilir. Bu karar daha geniş REC-AUTH-011/012
   reconciliation'ını, ADR-014 allocator/cutover hattını veya runtime cutover'ı kapatmaz.
7. **Implementation status:** **CLOSED / CANONICAL.** COL/OD-04 PR #1275 ile canonical;
   secondary allocation write path W1.2 PR #1279 / squash `6c2329dc` ile fail-closed kapalıdır.
   Ortak internal allocator yalnız canonical `CollectionService.create` transaction'ı ve bu
   lock altında kullanılabilir. Bu kapanış daha geniş REC-AUTH-011/012 reconciliation'ını veya
   runtime cutover'ı kapatmaz.

### COL-IDEM-001 — Canonical money-out idempotency contract (COL/OD-21)

1. **Replay authority:** Current recorded money-out authority `ClientPayout`tır. Canlı command
   zinciri `requestPayout → approve → finalize`dır. `OfficeApprovalRequest` authorization
   intent/gate, `ClientPayoutAllocation` source linkage ve Accounting Journal muhasebe
   temsilidir; ayrı payout authority değildir.
2. **Idempotency boundary:** Key zorunludur ve logical command boyunca stabil kalır. Canonical
   replay identity `tenantId + idempotencyKey`; finansal payload identity `caseId + caseClientId
   + exact Decimal amount + currency` alanlarıdır. `note` ve actor payout replay identity'sine
   dahil değildir; approval saved-intent hash'i finalize aşamasında birebir eşleşir.
3. **Replay / conflict:** Aynı key + aynı finansal payload mevcut `payoutId` ile
   `created=false, idempotentReplay=true` döner ve yeni finansal side-effect üretmez. Aynı key +
   farklı payload fail-closed `IDEMPOTENCY_KEY_CONFLICT` üretir.
4. **Duplicate policy:** Farklı key yeni command'dir. Transport retry sırasında yeni key üretmek
   yasaktır; tutar, tarih veya actor benzerliğinden duplicate tahmini yapılmaz. Yeni command
   bağımsız approval ve taze outstanding kontrolüne tabidir.
5. **Concurrency boundary:** `tenantId + caseId + caseClientId + currency` transaction advisory
   lock'ı aynı outstanding kaynağını tüketen payout/offset çağrılarını serialize eder.
   `ClientPayout @@unique([tenantId, idempotencyKey])` nihai replay fence'idir.
6. **Transaction / failure:** `ClientPayout`, source allocations, accounting journal ve
   transaction-bound audit aynı Prisma transaction'da atomiktir. Lock, transaction, allocation,
   journal veya audit hatası bütün finansal write'ları rollback eder; partial persistence ve
   transaction-içi kısmi retry yasaktır. Approval intent rollback dışında kalabilir; retry aynı
   key ile tüm finalize command'ini yeniden yürütür. Commit sonrası best-effort approval
   execution-marker hatası committed payout'ı geri almaz; `ClientPayout` financial truth kalır.
7. **Scope boundary:** Current `RECORDED` contract repository içi money-out fact'ini kapsar.
   Harici banka/provider instruction, settlement confirmation veya provider-level idempotency bu
   kararın kapsamı dışındadır ve ayrı explicit contract gerektirir.

## 5.4. Zaman

| ID | Kural | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-032 | createdAt hukuki etki tarihi değildir | CURRENT-PRINCIPLE | Desktop 01 §14 |
| COL-INV-033 | transactionDate/valueDate/effectiveDate/confirmedAt/externalSettledAt ayrıdır | CURRENT-CONFIRMED (W2.1 scope) | COL/OD-03 Option A + W2.1A PR #1315; raw source tarihleri competing authority değildir |
| COL-INV-034 | Faiz+legal balance yalnız canonical effectiveDate policy tüketir | CURRENT-CONFIRMED (W2.1 scope) | COL-TIME-001 precedence/fallback zinciri W2.1A PR #1315 ile karakterize edildi |
| COL-INV-035 | Raw source tarihleri provenance olarak korunur | CURRENT-CONFIRMED (W2.1 scope) | REC §8.1 + W2.1A provenance-exclusion kanıtı; `valueDate`/`confirmedAt` legal-balance girdisine taşınmaz |
| COL-INV-036 | Official as-of/known-at sonucu snapshot authority'siz iddia edilemez | CURRENT-CONFIRMED (yasak olarak) | REC-AUTH-024/025; official snapshot yok |

### COL-TIME-001 — Canonical effective-date contract (COL/OD-03 Option A)

1. **Authority:** Faiz ve legal balance yalnız kendi calculation contract'ındaki canonical
   `effectiveDate` değerini tüketir. Aynı hesapta `transactionDate`, `valueDate`, `confirmedAt`,
   `createdAt` veya başka bir ham tarih competing legal-time authority olamaz.
2. **Resolver:** Açık ve yetkili bir canonical `effectiveDate` varsa bu değer kullanılır. Yoksa
   current-compatible resolver `LedgerEntry.entryDate` değerini; Ledger bulunmayan mevcut
   Collection fallback'inde `Collection.date` değerini kullanır.
3. **Provenance:** `valueDate`, `confirmedAt`, `transactionDate`, `externalSettledAt` ve diğer
   ham tarih alanları kaynağı ve lifecycle kanıtını korur. `valueDate` veya `confirmedAt` salt
   mevcut olmaları nedeniyle hukuki etki tarihi hâline gelmez.
4. **Fail-closed:** Resolver'ın zorunlu tarih girdisi eksikse veya canonical authority'ler
   çelişiyorsa tarih tahmin edilmez; faiz/legal-balance sonucu fail-closed kalır.
5. **Scope boundary:** Bu karar snapshot, migration, backfill, geçmiş kayıtların yeniden
   hesaplanması, consumer switch veya Phase 2 runtime cutover yetkisi vermez. Accounting
   Journal gibi legal-balance authority'si olmayan modellerde aynı adlı alanların mevcut
   kullanımı bu kontratla kendiliğinden legal authority kazanmaz.
6. **W2.1 implementation evidence:** Test-only W2.1A PR #1315 / squash
   `1d5974e5b15961cd1ebc04d84dcb43c3c9073fce`; explicit `LedgerEntry.effectiveDate`
   precedence'ını, yokluğunda `LedgerEntry.entryDate` fallback'ini, Ledger bulunmadığında
   `valueDate`/`confirmedAt` farklı olsa da `Collection.date` kullanımını ve geçersiz zorunlu
   tarihte fail-closed `RangeError` davranışını karakterize eder. Required CI `4/4 SUCCESS`tır;
   production kodu, schema, migration, backfill, snapshot veya Accounting Journal değişmemiştir.
7. **W2.1 closure boundary:** Yukarıdaki contract ve W2.1A kanıtı W2.1 exit criteria'sını
   karşılar. Approved closure-reconciliation merge'iyle W2.1 `CLOSED / CANONICAL` olur;
   W2.2–W2.5, snapshot, cutover ve ilgili owner gate'leri ayrı ve açık kalır.

## 5.5. Actor / tenant / audit

| ID | Kural | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-037 | Hiçbir finansal write yalnız nesne ID'siyle yürümez | CURRENT-PRINCIPLE | REC-WRITE-001 ekseni |
| COL-INV-038 | Her write en az tenantId+caseId+actor doğrular | CURRENT-CONFIRMED (Collection mutations) | W1.6 PR #1246: public create/update/cancel boundary trusted tenant+actor alır; tenant-scoped case/collection doğrulaması ve actor trace transaction-bound audit'e taşınır |
| COL-INV-039 | Actor yetkisi OFFICE'ten gelir; Collection rol sistemi yaratmaz | CURRENT-CONFIRMED | ADR-009; Collection'da rol tablosu yok |
| COL-INV-040 | Approval OFFICE contract'ından referanslanır, overwrite edilmez | CURRENT-CONFIRMED | OWN-29-B COLLECTION_VOID zinciri |
| COL-INV-041 | Finansal command idempotencyKey+commandId+actor+audit izi taşır | CURRENT-CONFIRMED (Collection mutations) | COL/OD-05 + W1.6 PR #1246: create/gerçek update/başarılı void transaction-bound audit; replay/no-op duplicate audit yok; allowlist-only metadata |
| COL-INV-042 | Correlation/causation zinciri domainler arası kaybolmaz | CURRENT-CONFIRMED (Collection mutations) | W1.6 PR #1246: trusted request context correlationId immutable taşınır; commandId mutation-attempt scoped; gerçek predecessor varsa causationId; audit failure tüm finansal transaction'ı rollback eder |
| COL-INV-043 | Tenant dışı read/write fail-closed | CURRENT-CONFIRMED | TM3 §7; cross-tenant 404 deseni |

## 5.6. Projection ve cutover

| ID | Kural | Lifecycle | Kanıt/Kaynak |
|---|---|---|---|
| COL-INV-044 | UI/API/report/template/UYAP yeni finansal formül üretemez | CURRENT-VIOLATED-KNOWN | Norm bağlayıcı; bilinen ihlaller COL-RISK-D01..D03 ve D05 — düzeltme cutover programında (Phase 4) |
| COL-INV-045 | Projection canonical authority'yi değiştiremez | CURRENT-CONFIRMED | REC-AUTH-PROJ-001..003 |
| COL-INV-046 | Legacy consumer cutover parity+flag+rollback+owner sign-off ister | CURRENT-CONFIRMED (gate olarak) | REC-GOV §20; decision-log cutover kayıtları |
| COL-INV-047 | Canonical motor SHADOW iken production authority ilan edilemez | CURRENT-CONFIRMED | case-balance-display.ts:766 SHADOW_ONLY |
| COL-INV-048 | Report/UI parity kapanmadan tek-motor iddiası yok | CURRENT-CONFIRMED | REC-AUTH-027/028 |

---

# 6. Yasak davranışlar (forbidden behaviors)

(SOURCE: Desktop 01 §6 + TM3 §10 + dbind; repo normlarıyla çakışmaz.)

COLLECTION şunları YAPAMAZ:

1. Party/avukat/personel/kullanıcı kimliği veya rol sistemi sahiplenmek (OFFICE'in).
2. Debtor legal role/liability rejimi tanımlamak (DEBTOR'un).
3. Müvekkil vekâlet/talimat ilişkisi yönetmek (CLIENT'ın).
4. ClaimItem'ın hukuki doğum/geçerlilik semantiğini sahiplenmek (RECEIVABLE'ın).
5. Fee/harç hukuk politikası üretmek (ADR-013 alanı; REC-FEE-001..005).
6. Muhasebe kaydıyla hukuki borcu sona erdirmek (ADR-010 sınırı).
7. UI/report'ta yeni bakiye formülü üretmek veya buna izin vermek (COL-INV-044).
8. Owner kararsız cross-currency kur politikası uygulamak (REC-FX-002).
9. Tahsil edilebilirlik/operational balance'ı kendiliğinden tanımlamak.
10. `CollectionService.create/cancel` dışında ikinci tahsilat yazım otoritesi açmak (TM3 §10).
11. Global debtor-level payment pool davranışı veya otomatik dosyalar-arası allocation
    (REC §9.1/§9.3; DEBTOR §7 NEVER_AUTO).
12. Event payload'ına `clientId` koymak; disposition'ı `clientId` ile kurmak (TM3 §6/inv-4).
13. `remainingDebtAfterCollection` benzeri türetilmiş borcu persist etmek (TM3 §10).
14. Posted/confirmed kaydı fiziksel silmek veya ledger-bypass update yapmak (COL-INV-011).

---

# 7. Lifecycle

## 7.1. Collection lifecycle (CURRENT — repo kanıtlı)

```text
create (idempotencyKey ZORUNLU — PR #851)
  → tek $transaction: Collection + recorded journal + PAYMENT_RECEIVED event
    + ledger forward (LedgerEntry+LedgerAllocation) + overpayment(HELD, koşullu)
  → confirmed
  → cancel/void:
      unconfirmed  → cancel path
      confirmed    → COLLECTION_VOID approval (ADR-009; OWN-29-B; self-approval YOK)
        → executeCollectionCancelInTransaction:
          REVERSAL LedgerEntry (negatif ayna, reversesLedgerEntryId bağı, tek-reversal)
          + allocation aynası + collectedAmount decrement + overpayment HELD→REVERSED
          + PAYMENT_REVERSED (causedBy=orijinal event)
```

## 7.2. Downstream dağıtım köprüsü (CURRENT — TM3/dbind)

```text
Collection(confirmed)
  → PAYMENT_RECEIVED outbox
  → CollectionDisposition draft (HELD_PENDING_DISTRIBUTION; otomatik dağıtım YOK)
  → disposition recommendation → approval → post (kesin dağıtım etkisi YALNIZ burada doğar)
  → ClientStatementLine / (yalnız avans etkili satırlarda) BalanceLedger
  → CLIENT_PAYABLE → ClientPayout (idempotent + approval; COL/OD-21)
```

## 7.3. TARGET lifecycle contract (COL/OD-06 Option A; candidate lifecycle + evidence/finality runtime + evidence-integrity admission guard present, `confirmedAt` / projection hardening pending)

1. **Candidate boundary:** Harici banka/provider hareketi doğrulanıp yetkili eşleştirme
   yapılana kadar Integration tarafında non-canonical candidate'dır. Candidate durumları
   `PENDING | SETTLED | REJECTED`tır.
2. **Canonical admission:** Settlement kanıtı ve yetkili eşleştirme olmadan Collection,
   allocation, legal balance, journal veya disposition etkisi doğmaz. Canonical Collection
   doğrulama sonrasında `CONFIRMED` olarak oluşturulur.
3. **Status-axis separation:** `CollectionStatus.PENDING` draft/unposted anlamında kalır ve
   settlement bekleme hali için kullanılmaz. External finality ekseni
   `NOT_APPLICABLE | SETTLED | REVERSED`; application ekseni
   `UNAPPLIED | PARTIALLY_APPLIED | APPLIED`tır.
4. **Unapplied/overpayment boundary:** `UNAPPLIED`, overpayment değildir. Overpayment yalnız
   canonical allocation sonrasında borcu aşan tutarın ayrı `HELD` sonucudur.
5. **Temporal boundary:** `confirmedAt` ve `externalSettledAt` provenance/lifecycle
   tarihleridir; COL-TIME-001 `effectiveDate` authority'sini değiştirmez.
6. **Chargeback boundary:** Chargeback linked external reversal evidence üretir; otomatik
   cancellation, refund veya financial reversal üretmez. Partial refund ve downstream reversal
   COL/OD-09/-10 kapsamında açık kalır; `CollectionStatus.REFUNDED` bu kararla aktive edilmez.
7. **Schema foundation boundary:** W2.2A PR #1332 / squash
   `88290071c5508952ad0c875e00f072a45e57ba4c` yalnız
   `BankTransactionCandidateStatus(PENDING | SETTLED | REJECTED)` enum'unu ve nullable,
   defaultsuz `BankTransaction.candidateStatus` kolonunu additive olarak eklemiştir. Backfill
   yoktur; legacy `NULL` unknown kalır ve `SETTLED` olarak yorumlanamaz. Schema varlığı
   lifecycle authority, runtime writer veya davranış üretmez.
8. **Candidate ingress boundary:** W2.2B PR #1347 / squash
   `61b49ce02b75ed966f163e290d8bdd1ed140587a`, yeni `INCOMING` banka receipt hareketlerini
   `candidateStatus=PENDING` ile oluşturur. `OUTGOING` hareketlerde candidate lifecycle
   başlatılmaz. `tryAutoMatch` yalnız tenant-scoped `PENDING` adayı tespit/eşleştirme hazırlığı
   için okur; Collection, journal, event, outbox, ledger, allocation veya overpayment üretmez.
   Duplicate sync mevcut satırı çoğaltmaz ya da legacy `NULL` değerini backfill etmez; tenant
   isolation korunur. Bu kanıt `SETTLED`/`REJECTED` transition, settlement evidence,
   `externalSettledAt` veya canonical Collection confirmation authority'si üretmez.
9. **Canonical admission guard boundary:** W2.2C-0 PR #1353 / squash
   `758f6186a7fe72edb43c81e7514d3e4acc5dceee`, yeni canonical Collection oluşturulmadan
   önce `candidateStatus=SETTLED` şartını uygular. `PENDING`, `REJECTED` ve legacy `NULL`
   açık hata ile fail-closed kalır; Collection, journal, event, outbox, ledger, allocation,
   overpayment, ClaimItem veya bank-match projection write'ı üretmez. `SETTLED` aday mevcut
   canonical match yoluna devam eder. Daha önce başarıyla eşleşmiş transaction replay'i
   admission guard'dan önce değerlendirilir ve yeni etki üretmeden mevcut Collection'ı döndürür.
   Bu containment settlement transition, evidence writer, verifier permission veya finality
   authority'si oluşturmaz.
10. **Typed evidence schema foundation boundary:** W2.2C-1 PR #1369 / squash
    `e7d2f11d917da3933860053acf4b7026e4057db0`, yalnız
    `VALIDATED_PROVIDER_ATTESTATION | SETTLEMENT_VERIFIER` source ve
    `SETTLED | REJECTED` outcome enum'larıyla immutable `BankSettlementEvidence` modelini,
    tenant-scoped `(tenantId, idempotencyKey)` replay authority'sini ve `BankTransaction`
    üzerinde nullable/defaultsuz tenant-safe evidence pointer'ını additive olarak eklemiştir.
    Verifier evidence için actor zorunluluğu, tenant-safe foreign key'ler, evidence pointer ve
    supersession tekilliği ile UPDATE/DELETE immutable guard'ları DB katmanında uygulanır.
    Backfill ve yeni evidence modelinde raw provider payload alanı yoktur. Schema varlığı runtime
    evidence writer, `bank.settlement.verify` enforcement, candidate transition veya Collection
    admission authority'si üretmez.
11. **Candidate finality projection schema boundary:** W2.2C-2 PR #1377 / squash
    `fcba6d989c8d6699e540e4d37a4b00b85a85fcc8`, nullable/defaultsuz
    `BankTransaction.externalSettledAt` provenance alanını additive olarak eklemiştir. Legacy
    `NULL` korunur; default, backfill veya tarih tahmini yoktur. W2.2C-1'in nullable/defaultsuz
    tenant-safe settlement-evidence relation'ı değiştirilmeden korunur ve cross-tenant evidence
    bağlama fail-closed kalır. `externalSettledAt`, COL-TIME-001 `effectiveDate` authority'si
    değildir. Schema varlığı runtime evidence writer, verifier permission consumer, candidate
    transition veya Collection admission authority'si üretmez.
12. **Dedicated settlement verifier permission boundary:** W2.2C-3 PR #1382 / squash
    `be1771d3ea3a270e46bdf9c8cd796f93fe109d2a`, salt-okunur
    `SettlementVerifierAuthorizationService` ile exact `bank.settlement.verify` permission
    boundary'sini uygular. Yalnız trusted tenant'ta aktif User ve aynı tenant'ta tam bir aktif
    Lawyer veya Staff profili ile aktif exact `GLOBAL` grant kabul edilir; exact aktif `DENY`,
    `ALLOW` üzerinde önceliklidir. Eksik identity/grant, expired veya henüz aktif olmayan grant,
    yanlış tenant/actor/key, non-`GLOBAL` scope, inactive/eksik/çift/yanlış-tenant human profile
    fail-closed'dur. Boundary `RECORD_COLLECTION` permission'ını yeniden kullanmaz; evidence,
    candidate status, `BankTransaction` veya Collection yazımı üretmez.
13. **Immutable human evidence append boundary:** W2.2C-4 PR #1391 / squash
    `facc778947523700e9dbc58c1edda9a26e932b23`, exact `bank.settlement.verify`
    boundary'sinden sonra yalnız `SETTLEMENT_VERIFIER` typed evidence'ını append eder.
    `(tenantId, idempotencyKey)` replay authority'sidir: aynı key/aynı payload mevcut evidence'ı
    yeni write veya audit olmadan döndürür; aynı key/farklı payload fail-closed conflict üretir.
    Concurrent aynı-key replay bir evidence ve bir audit ile sonuçlanır; aynı key farklı
    tenant'larda bağımsızdır. Evidence ve allowlist-only audit aynı transaction'da yazılır;
    audit failure evidence append'i rollback eder. Provider evidence yolu `DEFERRED` ve
    fail-closed kalır. Writer candidate status/evidence pointer, `BankTransaction`, Collection,
    journal, event, outbox, ledger, allocation veya overpayment yazımı üretmez.
14. **Candidate CAS transition boundary:** W2.2C-5 PR #1401 / squash
    `0452e836b7e2e86cc89052c27969be67782ad717`, exact `bank.settlement.verify`
    boundary'sini ve aynı tenant'a ait immutable evidence'ı zorunlu tüketir. Transition yalnız
    `tenantId + transactionId + candidateStatus=PENDING` CAS koşuluyla `SETTLED` veya
    `REJECTED` terminal durumuna gider. Evidence pointer, status, `SETTLED` için
    `externalSettledAt=evidence.observedAt` ve allowlist-only audit aynı transaction'dadır;
    `REJECTED` settlement zamanı üretmez. Aynı evidence/idempotency replay'i yeni write/audit
    üretmez; farklı evidence/outcome/terminal state, legacy `NULL` ve `OUTGOING` fail-closed
    kalır. Concurrent yarışta tek transition kazanır; audit failure tüm transition'ı rollback
    eder. Mutation Collection, journal, event, outbox, ledger, allocation veya overpayment
    yazımı üretmez.
15. **Evidence-integrity admission guard boundary:** W2.2D-0 PR #1407 / squash
    `1156e4def38795f25b834ed46a1224ff4de12483`, yeni canonical Collection admission'ından
    önce `INCOMING + candidateStatus=SETTLED + settlementEvidenceId` tuple'ını ve evidence'ın
    aynı tenant'ta `outcome=SETTLED`, `source=SETTLEMENT_VERIFIER` olmasını zorunlu kılar.
    `externalSettledAt`, aynı canonical evidence'ın `observedAt` değeriyle birebir eşleşir.
    Eksik pointer, bulunamayan/cross-tenant evidence, deferred provider source, non-SETTLED
    outcome ve eksik/uyuşmayan settlement zamanı açık hata ile fail-closed kalır. Daha önce
    başarıyla eşleşmiş transaction replay'i guard'dan önce değerlendirilir. Hata yollarında
    Collection, journal, event, outbox, ledger, allocation, overpayment, ClaimItem ve
    bank-match projection write'ı oluşmaz.
16. **Execution gate:** COL/OD-06 contract'ı `RECORDED`; W2.2A schema foundation, W2.2B
    PENDING ingress ve W2.2C-0 admission guard `CLOSED / CANONICAL`dır. COL/OD-06A ile
    settlement evidence authority kaydedilmiş ve W2.2C decision gate sağlanmıştır. W2.2C-1
    ila W2.2C-5 `CLOSED / CANONICAL`dır; W2.2D-0 approved reconciliation merge'iyle
    `CLOSED / CANONICAL` olur. Candidate finality ve evidence-integrity admission guard
    mevcuttur; `Collection.confirmedAt` ve match-projection hardening hâlâ tamamlanmamıştır.
    Sonraki gate yalnız `W2.2D-1 — OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED`dır.
    W2.3,
    W2.2 boundary uygulanıp kanıtlanana kadar blokludur.
    Refund/downstream reversal ve claim satisfaction/re-open paketleri kendi owner kararları
    kapanmadan CURRENT ilan edilemez.

### COL-SETTLE-001 — Canonical settlement evidence authority (COL/OD-06A)

1. **Evidence authority:** Settlement evidence authority hybrid typed modeldir. Yalnız
   doğrulanmış provider attestation veya evidence-backed dedicated `SETTLEMENT_VERIFIER`
   candidate finality girdisi üretebilir.
2. **Dedicated human authority:** İnsan doğrulayıcı için exact permission key
   `bank.settlement.verify`dır. Permission, OFFICE authorization zinciri ve trusted tenant
   context içinde değerlendirilir; title, genel SystemRole, Collection admission authority,
   kullanıcı beyanı veya salt tenant üyeliğinden türetilemez.
3. **Source exclusion:** `transactionDate`, `valueDate`, `confirmedAt` ve kullanıcı beyanı
   salt mevcut olmaları nedeniyle settlement evidence değildir. `confirmedAt` ve
   `externalSettledAt` provenance/lifecycle alanı kalır; COL-TIME-001 authority'si değildir.
4. **Gate separation:** Settlement verification candidate finality gate'idir; canonical
   Collection admission ayrı authority gate'idir. Settlement doğrulaması tek başına
   Collection, journal, ledger, allocation, legal balance veya disposition etkisi üretmez.
5. **Immutable evidence:** Candidate transition yalnız immutable typed evidence'a dayanabilir.
   Evidence append append-only'dir; silent update/delete/cascade yasaktır. Correction yeni
   version/supersession ile izlenebilir kalır.
6. **Separate mutation:** Evidence append ile `BankTransaction` status transition ayrı canonical
   mutation'lardır. Birinin kaydı diğerini kendiliğinden tamamlanmış veya yetkili saymaz.
7. **Audit/data boundary:** Her canonical mutation'ın audit'i kendi transaction boundary'sinde
   ve allowlist metadata ile tutulur. Audit actor izi olup evidence yerine geçmez. Ham provider
   payload, IBAN, açıklama veya serbest metin audit metadata/description alanlarına yazılmaz;
   ADR-011 reference/hash/presence/length/system-fact sınırı korunur.
8. **Provider gate:** Provider evidence yolu doğrulanabilir provider finality desteği oluşana
   kadar `DEFERRED` ve fail-closed'dur; mock, tarih alanı veya belirsiz provider sonucu canonical
   evidence olamaz.
9. **Execution status:** COL/OD-06A `RECORDED`; W2.2C decision gate sağlanmıştır.
   `W2.2C-1 — Typed Settlement Evidence Additive Schema Foundation`, PR #1369 /
   `e7d2f11d` kanıtıyla ve `W2.2C-2 — Candidate Finality Projection Schema`, PR #1377 /
   `fcba6d98` kanıtıyla ve `W2.2C-3 — Dedicated Settlement Verifier Boundary`, PR #1382 /
   `be1771d3` kanıtıyla ve `W2.2C-4 — Immutable Evidence Append`, PR #1391 /
   `facc7789` kanıtıyla ve `W2.2C-5 — Candidate CAS Transition`, PR #1401 /
   `0452e836` kanıtıyla `CLOSED / CANONICAL`dır. `W2.2D-0 — Evidence-Integrity Admission
   Guard`, PR #1407 / `1156e4de` kanıtıyla approved reconciliation merge'i üzerine
   `CLOSED / CANONICAL` olur. Candidate finality ve canonical settlement-evidence tuple
   admission guard mevcuttur; `Collection.confirmedAt` ve match-projection hardening hâlâ
   tamamlanmamıştır. `W2.2D-1` yalnız sonraki owner gate'tir; W2.2D-1/W2.2E/W2.3 veya başka
   runtime implementation bu kapanışla yetkilendirilmez. COL-RISK-G03
   `PARTIALLY MITIGATED — CONFIRMATION BOUNDARY REMAINS` kalır.

---

# 8. Cross-domain contracts

| Contract | Statü | Taşıyıcı |
|---|---|---|
| RECEIVABLE–COLLECTION balance/allocation | CURRENT-PARTIAL — REC-GOV §7.3/§9 + TM3; ayrı contract belgesi YOK; TM3-ACT28-LEGAL reconciliation OPEN | REC-GOV + TM3 |
| OFFICE–COLLECTION actor/approval | CURRENT (approval) / TARGET-CONTRACT-RECORDED + PERMISSION BOUNDARY + IMMUTABLE HUMAN EVIDENCE WRITER + CANDIDATE CAS TRANSITION + EVIDENCE-INTEGRITY ADMISSION GUARD PRESENT (dedicated `bank.settlement.verify`; `Collection.confirmedAt` / projection hardening remain) — approval ile settlement verifier permission aynı authority değildir | ADR-009 + dbind + COL/OD-06A |
| DEBTOR–COLLECTION attribution | CURRENT-PARTIAL — case-scoped + NEVER_AUTO CURRENT; PaymentDesignation TARGET | REC §9.1 + DEBTOR §7 |
| CLIENT–COLLECTION settlement | CURRENT — TM3 + adr-client-offset + dbind §1-5; tek çatı belge YOK | TM3 + dbind |
| COLLECTION–ACCOUNTING journal | DIRECTION LOCKED / EXECUTION GATED | ADR-010 |
| GLOBAL-ACTOR-AUDIT-CONTEXT | TARGET — correlationId/causationId/commandId şemada YOK | Desktop 01 §17 (öneri); COL/OD-05 |

**COL-CONTRACT-001 — Eksik contract belgesi, mevcut ratifiye normların yokluğu anlamına
gelmez; yeni contract belgesi mevcut normları yalnız konsolide eder, değiştiremez.**

---

# 9. Değişiklik ve ratifikasyon

- Bu belge yalnız owner text-ratification + docs-only PR ile canonical olur; o ana kadar
  hiçbir ajan bu belgeye dayanarak davranış değiştiremez.
- Ratifikasyon sonrası değişiklikler append-only supersession ile yürür (SYS-GOV-006).
- Bu belgedeki hiçbir hüküm RECEIVABLE-GOVERNANCE, DEBTOR-GOVERNANCE, OFFICE-GOVERNANCE,
  TM3 veya dbind kayıtlarını override edemez; çelişki tespitinde implementation durur ve
  yalnız Governance Reconciliation önerilir (AGENTS.md kuralı).

## 9.1. RCV-P2-WS04 legal-application boundary amendment — 2026-07-18

Collection receipt fact ve transaction execution owner'ı olmaya devam eder. Bu rol,
Collection'a ClaimItem, target legal-calculation bucket, legal-application policy veya
legal-balance authority vermez.

- `LedgerAllocation` ClaimItem-keyed current AS-IS/legacy persistence'tır; target legal
  authority olarak ratifiye edilmemiştir.
- `CollectionAllocation` compatibility projection only'dir; legal authority veya fallback
  authority değildir.
- `ClaimItem.collectedAmount` deprecated/non-authoritative derived cache'tir; yeni consumer
  açılamaz.
- Target application `LegalCalculationBucket` üzerinde `LegalApplication` üretir;
  `ApplicationAttribution` ClaimItem/source lineage açıklamasıdır.
- Balance Engine target canonical legal-calculation authority'dir, fakat `SHADOW_ONLY`
  kalır; cutover yetkili değildir.

ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. Target persistence için schema/migration likely
required'dır; design ve implementation yetkili değildir. Bu amendment current Collection
transaction davranışını, ledger writer'ını, runtime'ı, schema'yı veya migration'ı değiştirmez.

## 9.2. XD-001 legal-application boundary canonicalization — 2026-07-19

Receivable canonical `LegalCalculationBucket` semantiğinin ve TBK100 application policy'sinin
sahibidir. Collection receipt lifecycle ve bu politikanın yetkili transaction içinde
deterministic execution orchestration'ının sahibidir. Collection policy veya bucket
authority'sini; Receivable receipt lifecycle authority'sini sahiplenemez.

Target `LegalApplication` persistence tek bir logical writer ve tek canonical authority
gerektirir. İki domainin aynı hukuki etkiyi bağımsız yazması, kalıcı dual-write veya legacy
cache/projection fallback'i yasaktır.

- `ClaimItem` application target, payment-state veya allocation authority değildir.
- `ClaimItem.collectedAmount` için yeni reader veya writer açılamaz.
- `CollectionAllocation` bağımsız/fallback authority olamaz; yalnız canonical output-derived
  geçici compatibility projection olabilir.
- Physical persistence owner'ı, aggregate, relation, key ve transaction contract'ı seçilmemiştir.
- `ApplicationBatch` dahil alternatifler yalnız `TPA-02` salt-okunur analizinde karşılaştırılır.

XD-001 authority boundary kararı canonicaldır. ACT-28 ve REC-AUTH-011/012 fiziksel persistence,
writer, migration, consumer cutover ve legacy retirement kapanana kadar `OPEN` kalır.
`TPA-02 — Target Persistence Architecture` için `GO-ANALYZE REQUIRED`; runtime/schema/migration
ve implementation authority `NONE`dır.

## 9.3. TPA-02 target persistence architecture canonicalization — 2026-07-19

Owner, legal-application physical target modelini bağımsız `LegalApplicationBatch`
aggregate'i olarak ratifiye etmiştir:

```text
LegalApplicationBatch
  ├─ immutable LegalApplication[]
  └─ non-authoritative ApplicationAttribution[]
```

Receivable bucket/context/snapshot semantiği ve TBK100 allocation policy'sinin sahibidir.
Collection receipt lifecycle, idempotency ve outer transaction orchestration'ın sahibidir.
RCV-COL Legal Application Boundary aggregate persistence'ın sahibidir; tek logical writer
`LegalApplicationWriter`dır. Writer yalnız canonical Collection transaction'ı içinde mevcut
transaction client ile çağrılır; bağımsız endpoint, ayrı/nested transaction veya ikinci
allocator authority açılamaz.

Bir `APPLY` batch'i bir Collection receipt'ine karşılık gelir ve
`receiptAmountMinor = Σ appliedAmountMinor + heldRemainderMinor` exact-cent conservation'ını
sağlar. Replay authority `tenantId + idempotencyKey + commandHash`tır. Aynı key/hash mevcut
batch'i yeni write/audit/event olmadan döndürür; aynı key/farklı hash fail-closed conflict'tir.
Full reversal linked append-only `REVERSAL` batch'idir. Existing batch/application
`UPDATE`/`DELETE` edilemez; partial reversal ayrı owner gate'idir. Tenant-safe composite FK,
`ON DELETE RESTRICT`, no historical guessing ve no silent backfill zorunludur.

Legacy disposition:

- `ClaimItem.collectedAmount`: frozen legacy cache; yeni reader/writer yasak, retirement required.
- `CollectionAllocation`: bağımsız authority yasak; yalnız canonical-output-derived transitional
  projection.
- `LedgerAllocation`: historical legacy record; target-era authority yasak.

ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. `codex/rcv-ws04-p03-syn-01` disposition,
PR #407 `HOLD / CONFLICTING / DO NOT MERGE`, deterministic bucket identity,
representative replay/evidence ve consumer cutover authority açık blocker'lardır.
TPA-03 schema-foundation analysis owner-gated'dir. Schema/migration/writer/replay/cutover/
retirement implementation authority `NONE`dır.

## 9.4. TPA-03 two-file hybrid schema-foundation canonicalization — 2026-07-20

Owner, Option B'yi ratifiye etmiştir. Foundation şu modelleri ve enum'ları taşır:

```text
LegalApplicationBatch
  ├─ immutable LegalApplication[]
  └─ non-authoritative ApplicationAttribution[]

LegalApplicationBatchType:
  APPLY | REVERSAL

LegalApplicationComponentType:
  COST | ANCILLARY | ACCRUED_INTEREST | PRINCIPAL
```

Exact implementation scope yalnız `schema.prisma` ve tek additive `migration.sql` dosyasıdır.
Foundation writer-free, no-backfill ve mevcut Collection runtime/consumer davranışına etkisiz
olmak zorundadır. Tenant-safe composite FK, `ON DELETE RESTRICT` ve batch/application
immutability protection zorunludur.

Amount alanları positive minor-unit magnitude taşır; yön batch type'tan gelir.
`receiptAmountMinor`, APPLY için canonical Collection receipt magnitude'ı, REVERSAL için linked
original receipt magnitude'ıdır. Canonical conservation
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` olarak korunur; DB/writer
enforcement foundation sonrası owner-gated aşamaya bırakılır.

Replay unique sınırı `(tenantId, idempotencyKey)` ve payload authority'si `commandHash`tır.
Same key/same hash existing batch ve no new write; same key/different hash fail-closed conflict'tir.
Full reversal linked append-only REVERSAL batch'idir; self-reversal ve double reversal yasaktır;
partial reversal yetkili değildir.

`bucketContextKey` ve `bucketInstanceId` required/opaque/nonblank'tir; generation algoritması
writer-stage contract'a bırakılır. `ApplicationAttribution` authority değildir; optional ClaimItem
lineage ve optional attributed amount taşıyabilir.

`codex/rcv-ws04-p03-syn-01` schema foundation için non-blocking, writer/evidence/cutover için
blocking'dir. PR #407 `HOLD / CONFLICTING / DO NOT MERGE / DO NOT REBASE`; ACT-28 ve
REC-AUTH-011/012 `OPEN` kalır. TPA-03A schema foundation owner `GO-IMPLEMENT` ister ve henüz
yetkili değildir.

## 9.5. TPA-03A schema-foundation closure reconciliation — 2026-07-20

TPA-03A implementation PR #1449 / squash
`63f0b0ea2cbef3f5d106ae3dfd8be6b770b5229f` exact two-file additive foundation'ı
canonical main'e taşımıştır. `LegalApplicationBatch`, immutable `LegalApplication` ve
non-authoritative `ApplicationAttribution`; tenant-safe composite FK, `ON DELETE RESTRICT`,
tenant replay uniqueness, reversal/nonblank-bucket/minor-unit kontrolleri ve UPDATE/DELETE
immutable trigger'larıyla kurulmuştur.

Foundation writer-free ve no-backfill'dir; Collection runtime, test, consumer, legacy
reader/writer veya historical data etkisi `NONE`dır. Exact-cent conservation enforcement
writer-stage'e deferred kalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus
writer/evidence/cutover için `BLOCKING`; PR #407 `HOLD / UNTOUCHED`dur. Sonraki görev yalnız
`TPA-04 — LEGALAPPLICATIONWRITER CONTRACT ANALYSIS / OWNER GO-ANALYZE REQUIRED`dır.

## 9.6. TPA-04 target-native dormant-writer contract — 2026-07-20

Owner, Option C — Target-Native Plan-Then-Persist / Dormant-First Single Writer kararını
ratifiye etmiştir. `LegalApplicationWriter`, yalnız official canonical Receivable snapshot ve
Receivable-owned target-native `LegalApplicationPlan` tüketen tek persistence writer'dır.
TBK100 policy hesaplamaz; ClaimItem, `collectedAmount`, `LedgerAllocation` veya
`CollectionAllocation` üzerinden hedef plan üretmez.

Writer yalnız canonical Collection outer transaction'ı içinde mevcut Prisma transaction client
ile çağrılabilir. Independent endpoint, nested transaction, ikinci writer, production call-chain
wiring, production shadow persistence, legacy-derived target ve long-lived dual-write yasaktır.
Collection receipt lifecycle ve outer transaction orchestration sahibidir; Receivable snapshot,
bucket semantiği, TBK100 policy ve plan sahibidir.

Official snapshot zorunludur. `authority=NONE`, `snapshotAvailable=false`, stale/unavailable
snapshot ve unmapped component fail-closed'dur; HELD değildir. `bucketContextKey` stable legal
context'i, `bucketInstanceId` snapshot-specific identity'yi versioned canonical serialization +
SHA-256 ile taşır; ClaimItem ID key input olamaz.

Batch amount'ları aynı currency/minor-unit contract'ında `bigint` minor-unit'tir ve
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` zorunludur. DB aggregate
conservation writer öncesi ayrı owner-gated schema amendment ile kurulmalıdır. Replay
`tenantId + idempotencyKey + commandHash` kuralındadır; same key/hash side-effect-free existing
batch, different hash fail-closed conflict'tir; farklı key ile aynı Collection'a ikinci APPLY
yasaktır.

APPLY tek Collection receipt'i ve target-native bucket planı içindir; ClaimItem-keyed allocation
ve `collectedAmount` mutation üretmez. Full reversal ayrı owner-gated linked append-only
REVERSAL paketidir; same-case advisory lock ve exact inverse gerekir; partial reversal
yetkisizdir. Audit transaction-bound/allowlist-only'dir; replay yeni audit/event/outbox üretmez.
Mevcut `PAYMENT_RECEIVED` / `PAYMENT_REVERSED` zinciri korunur; public
`LEGAL_APPLICATION` event'i ayrıca owner-gated'dir.

Legacy runtime geçici authority olarak korunur ancak yeni legacy reader/writer açılamaz.
`CollectionAllocation` yalnız gelecekte canonical-output-derived projection olabilir;
`ClaimItem.collectedAmount` frozen cache ve `LedgerAllocation` historical legacy'dir. Synthetic
corpus target writer için superseded legacy evidence'dır ve writer/evidence/cutover için
blocking kalır. PR #407 hold/untouched; ACT-28 ve REC-AUTH-011/012 open'dır.

Successor sırası TPA-04A snapshot/bucket identity, TPA-04B writer-evidence schema amendment,
TPA-04C pure plan builder, TPA-04D dormant writer, TPA-04E full reversal writer, TPA-04F
representative replay/reconciliation evidence ve TPA-04G coordinated writer/consumer cutover
decision'dır. Her biri `OWNER GO REQUIRED / NOT AUTHORIZED`dır.

## 9.7. TPA-04A receipt-bound canonical snapshot boundary — 2026-07-20

Owner, Option C — Receipt-Bound Embedded Canonical Snapshot Envelope kararını ratifiye
etmiştir. `CanonicalReceivableApplicationSnapshotV1` yalnız target Collection receipt'ine
bağlı LegalApplication planı için official snapshot alt türüdür. Receivable eligibility,
bucket/context/snapshot semantiği, source-version completeness, COL/OD-03
`applicationEffectiveDate`, RCV-CAS/v1 serialization/hash ve deterministic bucket identity
sahibidir. RCV-COL boundary envelope'ı `LegalApplicationBatch` aggregate'inde persist eder.

Collection yalnız canonical receipt lifecycle, admission/idempotency/finality gate'leri ve
outer transaction orchestration sahibidir. Target receipt pre-application history'den hariç
tutulur. `confirmedAt`, `valueDate` ve `externalSettledAt` legal effective-date authority
değildir. Currency/minor-unit, evidence, staleness, duplicate/collision veya conservation
tutarsızlığı fail-closed'dur ve HELD'e çevrilemez.

Snapshot envelope'ı `tenantId`, `caseId`, `targetCollectionId`, currency/minor-unit,
receipt amount, as-of/effective context, source/version set ve canonical buckets taşır.
Repository-wide `minorUnit=2` varsayımı yasaktır. Snapshot ve bucket identity
domain-separated SHA-256 + versioned canonical serialization kullanır; ClaimItem ID,
receipt/Collection ID, row ID, display text veya list index `bucketContextKey` girdisi olamaz.

General presentation, Fee/Harç, Journal, consumer authority ve broader ADR-013 lifecycle açık
kalır. Current Balance Engine `SHADOW_ONLY`; TPA-04B schema amendment canonicaldır fakat
snapshot/hash runtime, writer, plan builder, production shadow ve cutover yetkisizdir. PR #407 final disposition B ile
closed/unmerged'dır; requirements RD01/TPA'da preserved, code discarded ve extraction/reuse yoktur;
synthetic corpus writer/evidence/cutover için blocking; ACT-28 ve REC-AUTH-011/012 open'dır.
Sonraki yalnız owner-gated analiz `TPA-04C — PURE LEGALAPPLICATIONPLAN BUILDER ANALYSIS`dır;
implementation yetkili değildir.

## 9.8. TPA-04B required-evidence schema-amendment boundary — 2026-07-20

Owner, exact iki dosyalık writer-evidence schema-amendment kontratını ratifiye etmiştir.
Gelecekteki patch yalnız Prisma schema ve tek yeni migration dosyası olabilir. Bütün yeni
snapshot/version/bucket evidence alanları required, default-free ve backfill-free'dir; mevcut
foundation row'u migration lock'u sonrasında fail-closed hard-stop'tur.

Collection, canonical receipt amount/currency/idempotency ve outer transaction orchestration
sahipliğini korur; Receivable snapshot/bucket/policy/plan semantiğinin sahibidir. Amendment
`LegalApplicationBatch` üzerinde canonical snapshot/version envelope'ını ve
`LegalApplication` üzerinde component/source-lineage/before-after bucket evidence'ını taşır.
`ApplicationAttribution` değişmez ve non-authoritative'dir. Canonical snapshot payload exact
PostgreSQL `TEXT` bytes'tır; JSONB storage yasaktır.

DB contract'ı şu exact-cent conservation ve arithmetic sınırını enforce etmelidir:

```text
receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor
APPLY:    bucketBeforeMinor - bucketAfterMinor = appliedAmountMinor
REVERSAL: bucketAfterMinor - bucketBeforeMinor = appliedAmountMinor
```

Tamamen HELD batch geçerlidir. Snapshot/bucket identity formatları TPA-04A ile exact uyumludur;
`minorUnit` required ve currency-specific'tir. DB syntax/format/arithmetic guard'larını taşır;
canonical serialization/hash recomputation future writer'a aittir. Full reversal exact-inverse
TPA-04E'ye deferred'dır.

Bu karar runtime writer, plan builder, feature flag, replay, consumer cutover veya legacy
remediation yetkisi üretmez. PR #1469 merged/non-blocking, PR #407 closed/unmerged/no-further-
action'dır. Synthetic corpus schema amendment için non-blocking, writer/evidence/cutover için
blocking; ACT-28 ve REC-AUTH-011/012 open'dır. Sonraki yalnız `TPA-04B-ENTRY — OWNER GO-VERIFY
REQUIRED`dır.

## 9.9. TPA-04B schema-amendment closure reconciliation — 2026-07-21

TPA-04B implementation PR #1470 / squash
`9dabe8dbddecafad49dbe58958ef2c3642d14a01`, exact iki dosyalık schema/migration
amendment'ını canonical main'e taşımıştır. Diff yalnız `schema.prisma` ile
`20260721002219_legal_application_writer_evidence/migration.sql` dosyalarından oluşur.

Required/default-free/no-backfill evidence alanları, exact canonical snapshot `TEXT` payload'ı,
snapshot/hash/ref/minorUnit/nonblank kontrolleri, per-batch bucket uniqueness, APPLY/REVERSAL
bucket arithmetic, immutable UPDATE/DELETE koruması, nonempty-foundation hard stop ve
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` transaction-end
conservation guard'ı kurulmuştur. PostgreSQL 16 disposable DB apply/rollback/re-apply kanıtı
PASS'tir; `ApplicationAttribution` değişmemiştir.

Runtime writer/backfill etkisi `NONE`dir. Closure anındaki live/production DB apply
`NOT AUTHORIZED / NOT PERFORMED` kaydı, 2026-07-22 M2 live-apply kaydıyla superseded'dır.
ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus schema amendment için
non-blocking, TPA-04C writer/evidence/cutover için `BLOCKING` kalır. Sonraki görev yalnız
`TPA-04C — PURE LEGALAPPLICATIONPLAN BUILDER ANALYSIS / OWNER GO-ANALYZE REQUIRED`dır.

### PR #407 final disposition B — Collection compliance pointer

PR #407'nin eski keep-open/redesign lifecycle kararı superseded'dır. Korunan sekiz
balance-exposure gereksiniminin canonical taşıyıcısı
`RCV-PHASE-1-AUTHORIZATION.md §1.27`, `RECEIVABLE-GOVERNANCE.md §23.13` ve ADR-014'tür.
Özellikle held receipt exposure reconciliation dışındadır; cost/ancillary exact-cent
reconcile edilir ve principal+interest toplamı genel claim-remaining invariant'ı değildir.
Bu pointer Collection runtime, writer, schema, migration veya cutover authority üretmez.

## 9.10. TPA-04C pure LegalApplicationPlan builder contract — 2026-07-22

Owner `OD-TPA-04C-01..20` kararlarını ADR-014'te tek tam authority kaydı olarak ratifiye
etmiştir. Receivable official snapshot, component/bucket semantics, TBK100 policy ve pure
exact-minor-unit plan authority'sini; Collection receipt lifecycle, admission, idempotency ve
outer transaction orchestration'ı korur. Builder DB/Prisma/clock/transaction/persistence,
audit/event/outbox veya legacy allocator yüzeyi kullanamaz. ClaimItem application target ve
payment-state authority değildir.

Plan APPLY-only, deterministic ve fail-closed'dur. Closed order COST→ANCILLARY→
ACCRUED_INTEREST→PRINCIPAL; HELD yalnız valid-authority remainder'dır. Exact persistence
conservation `receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` kalır.
Attribution optional/non-authoritative; partial reversal unauthorized'dır.

M2 migration `20260721002219_legal_application_writer_evidence`, execution anchor
`9dabe8dbddecafad49dbe58958ef2c3642d14a01` ile live DB'de applied/post-validated'dır.
Backfill/data `NONE`; üç target table `EMPTY`; runtime writer `NOT IMPLEMENTED / NOT
ACTIVATED`dır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus TPA-04C
writer/evidence/cutover için `BLOCKING` kalır. TPA-04C implementation yetkisizdir; next yalnız
`TPA-04C-I02 — CANONICAL SNAPSHOT VALIDATION / DETERMINISTIC ERRORS / OWNER GO-IMPLEMENT
REQUIRED`dır. I01 PR #1517 / squash `568f76e1847d5ee0060e81d76996f8e2177bada1` ile
`CLOSED / CANONICAL EVIDENCE`; I02 henüz `NOT STARTED / NOT AUTHORIZED`dır.

## 9.11. TPA-04C-I02 snapshot-validation boundary — 2026-07-22

I02 yalnız Receivable-owned canonical snapshot envelope validation'ıdır. RCV-CAS/v1 hash
preimage'ı `UTF8("RCV-CAS/v1") || 0x00 || canonicalEnvelopeBytes`; payload-only hash
yasaktır. Explicit byte/count/depth/string limitleri, null-vs-absent ve deterministic
first-error sırası ADR-014 OD-TPA-04C-21..36'dadır. Bu kayıt Collection admission,
allocation, HELD, writer, transaction, audit/event/outbox, persistence veya runtime wiring
yetkisi üretmez. Collection receipt lifecycle ve outer transaction authority'si değişmez;
ACT-28 ve REC-AUTH-011/012 `OPEN` kalır.

## 9.12. TPA-04C-I02 snapshot-validation implementation closure — 2026-07-22

TPA-04C-I02 implementation PR #1520 / squash
`d46df4cec753b03bebcaefd07e5540dcb2b97709`, exact seven-file scope ve required CI
`4/4 PASS` ile canonical main'dedir. I02, strict duplicate-key-safe JSON parser,
domain-restricted canonical serializer, domain-separated snapshot hash binding'i, deterministic
fail-closed errors ve yalnız validator tarafından üretilebilen opaque/non-forgeable
`ValidatedCanonicalSnapshotV1` boundary'sini kurmuştur. I01+I02 targeted testleri
`113/113 PASS`tır.

Bu closure Collection admission, allocation, HELD reason, fingerprint, attribution, writer,
transaction, audit/event/outbox, persistence veya runtime wiring yetkisi üretmez. Schema,
migration, backfill ve live-DB action `NONE`; M2 live foundation, boş target tablolar ve
Collection receipt/outer-transaction authority'si değişmemiştir. Runtime writer `NOT
IMPLEMENTED / NOT ACTIVATED`; ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus
writer/evidence/cutover için `BLOCKING` kalır. Sonraki tek owner-gated birim
`TPA-04C-I03 — PURE APPLY ORDERING / EXACT-MINOR-UNIT ALLOCATION CORE`; ayrı owner
`GO-IMPLEMENT REQUIRED / NOT YET AUTHORIZED`dır. I04-I07 self-start etmez.

## 9.13. TPA-04C-I03 closure / I04 plan-fingerprint contract — 2026-07-23

TPA-04C-I03 implementation PR #1535 / squash
`719e6898a6e967ba824a69aeadbf716e55c3056d`, exact four-file scope ile
`CLOSED / CANONICAL EVIDENCE`dır. I03 `24/24`, I01-I03 `137/137`, bounded property ve
determinism/permutation/repetition testleri; production/strict type-check, API build, exact-file
ESLint ve required CI `4/4 PASS`tır. Runtime ve legacy allocator değişmemiştir.

Owner, ADR-014 OD-TPA-04C-37..56 ile bağımsız plan-fingerprint protocolü `RCV-LAP/v1`ı
ratifiye etmiştir. Exact hash:

```text
SHA-256(UTF8("RCV-LAP/v1") || 0x00 || canonicalPlanIdentityBytes)
rcv-legal-application-plan:v1:sha256:<64-lowercase-hex>
```

Identity; tenant/case/Collection receipt context'i, currency/minorUnit/effectiveDate/direction ve
snapshotRef/hash/sourceVersionSetHash/historyBoundaryRef evidence'ını bağlar. Runtime object
order veya generic key sorting authority değildir; exact top-level/application property order ve
I03 `COST → ANCILLARY → ACCRUED_INTEREST → PRINCIPAL` sequence'i ADR-014'te kapalıdır.
`heldReason` daima bulunur ve no-remainder absence encoding'i `NONE`dır. Attribution optional,
non-authoritative ve fingerprint-excluded'dır; persistence ID, `idempotencyKey`, `commandHash`,
actor ve request/correlation/transaction ID fingerprint'e katılmaz.

Fingerprint yalnız exact-cent conservation doğrulandıktan sonra üretilebilir. Bu kayıt I04 kodu,
fingerprint helper'ı, writer, runtime wiring, schema/migration, consumer cutover veya legacy
retirement yetkisi üretmez. I04 `NEXT / NOT STARTED / NOT AUTHORIZED`; ayrı owner
`GO-IMPLEMENT` gerekir. I05-I07 self-start edemez.

## 9.14. Phase 2 full-remediation governance reconciliation — 2026-07-29

TPA-04C pure plan-builder programı I01–I06 implementation evidence zinciriyle tamamlanmış,
I07 `SUPERSEDED / NOT REQUIRED IN TPA-04C` olarak disposition edilmiş ve execution PR
#1815 / `4bf75df85153a61e2d129300c17d1a719a02f3f0` ile immutable result PR #1816 /
`2c6fa957` üzerinden `CLOSED / CANONICAL` olmuştur. TPA-04D integration seam'i owner-ratified
full-remediation programı altında `AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE` kalır;
`LegalApplicationWriter`, persistence/atomic transaction, representative replay evidence,
consumer cutover ve legacy retirement uygulanmamıştır. Runtime writer `NOT IMPLEMENTED / NOT
ACTIVATED`; ACT-28 ile REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için
`BLOCKING`dir.

W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743` nullable/defaultsuz/
backfillsiz `Collection.confirmedAt` schema foundation'ını, W2.2D-1A PR #1660 /
`168daec75fe877f65b241b489eec92820167dc7e` ise lifecycle timestamp'in
`effectiveDate` authority'si olmadığını ve invalid provenance'ın fail-closed kaldığını
kanıtlar. W2.2D-2 Task07 exact twelve-file implementation PR #1944 /
`6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile `CLOSED / CANONICAL EVIDENCE`dır. Future
canonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve
immutable `confirmedAt` üretir; idempotent replay mevcut timestamp'i korur ve explicit caller
timestamp kabul edilmez. Pre-side-effect persisted-readback guard ile audit timestamp eşleşmesi
fail-closed uygulanır. W2.2D-3 Task08 exact six-file implementation PR #1969 /
`392e831c56d7b648dd90b35acb7468a0b2c1cc0c` ile `CLOSED / CANONICAL EVIDENCE`dır. Bank
eligibility doğrulaması, canonical Collection admission ve finansal/event/outbox etkileri,
`matchedCollectionId` CAS projection'ı ve audit aynı Prisma/PostgreSQL transaction'ında atomik
çalışır; rollback, deterministic replay/target-conflict ve concurrent single-winner kanıtları
mevcuttur. Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır. Task09
`RCV-COL-IDEM-01` exact fourteen-file implementation PR #2001 /
`6c34395d4ade84603b340b197f2c4e5d13c1ec4f` ile `CLOSED / CANONICAL EVIDENCE`dır.
Versioned `RCV-COL-CMD/v1` canonical payload ve domain-separated SHA-256 fingerprint; same
identity + same semantic command için side-effect-free replay, divergent command için
`IDEMPOTENCY_SEMANTIC_CONFLICT`, legacy evidence-unknown için fail-closed rejection ve bank
admission'ın Task08 shared transaction içindeki semantic replay gate'ine yeniden girmesini
sağlar. Nullable/default-free evidence migration'ı repository-ready; live/production DB apply
yapılmamıştır ve historical fingerprint tahmin edilmemiştir. Task10 `TPA-04F-ENTRY` yalnız
`NEXT / NOT STARTED`dır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus
writer/evidence/cutover için `BLOCKING` kalır.

## 9.15. TPA-04F-ENTRY representative corpus foundation closure — 2026-08-01

TPA-04F-ENTRY / Task10 exact seven-file implementation PR #2036 / squash
`624f27ee09297ccc895155e6d65c00ce08dc6db7` ile `CLOSED / CANONICAL EVIDENCE`dır.
`CanonicalReceivableApplicationSnapshotV1 → LegalApplicationPlan` sınırına ait
`RCV-REP-CORPUS/v1` deterministic corpus foundation'ı 19 scenario, golden expectation,
acceptance matrix, Task11 input contract ve pinned SHA-256
`0e0d5f1db96d7f0b8f204307cb2b9e73d57b89a04194b93dc6c4ffc80a10f05e` üretir.
Representative corpus suite `11/11`, LegalApplicationPlan regression `8 suite / 205 test`
ve required CI `9/9 PASS`tır.

Corpus yalnız test/evidence foundation'dır: runtime export, official snapshot producer,
`LegalApplicationWriter`, legal-effect persistence, schema/migration, live DB, production
activation veya consumer cutover üretmez. ClaimItem-keyed legacy synthetic corpus
`PRESERVED / SUPERSEDED_FOR_TARGET_AUTHORITY / HISTORICAL_BASELINE /
NON_AUTHORITATIVE / NO_MUTATION`dır; fiziksel archive, move, rename, overwrite veya cleanup
yapılmamıştır.

Task15 gerçek writer/persistence replay ve reconciliation evidence'ı `NOT YET SATISFIED`dır.
Official snapshot producer, `LegalApplicationWriter`, atomic persistence/transaction, full
reversal, consumer cutover ve legacy retirement sonraki owner-ratified program birimlerinde
kalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; COL-RISK-G07 `OPEN`; runtime writer `NOT
IMPLEMENTED / NOT ACTIVATED`dır. Canonical successor `TPA-04D-I01 / Task11 — NEXT /
ELIGIBLE / NOT STARTED`dır ve Task10'un bütün governance exit gate'leri tamamlanmadan
başlatılamaz.

## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05

Owner'ın `POST-APPLY COLLISION RECONCILIATION` kararı, formal write-freeze sırasında
başka bir process/executor'ın migration'ı uyguladığını ve bu kaydın temiz bir
single-executor APPLY olarak yorumlanamayacağını ratifiye eder. Bu thread `migrate deploy`
çalıştırmamıştır; gerçek executor identity `NOT_PROVEN`dır. RCV-COL pre-apply backup da
`NOT_PROVEN`dır. Apply'dan 31 saniye sonra alınan backup yalnız `POST-APPLY RECOVERY
EVIDENCE / RESTORE PASS` kanıtıdır; pre-apply backup olarak sınıflandırılamaz.

Owner teknik DB sonucunu kabul etmiştir. Migration yeniden uygulanmayacak; rollback,
repair, reapply veya `migrate resolve` yapılmayacaktır. Canonical repository migration
dosyası SHA-256 değeri production ledger checksum'u ile aynıdır:
`d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400`.

Production ledger kanıtı:

```text
finished_at                 : 2026-08-05 11:03:21.711968+00
checksum                    : d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400
applied_steps_count         : 1
rolled_back_at              : NULL
applied count               : 113
failed                      : 0
RCV-COL post-apply pending  : 8
Collection state           : 5 total / 5 legacy all-null / 0 backfill-or-inference
```

Production'da üç evidence kolonu `TEXT`, nullable ve defaultsuz;
`ck_collection_command_evidence_complete` validated; mutation function ve immutable
trigger mevcut; legacy satırlarda backfill/inference olmadığı doğrulanmıştır. Runtime
writer/activation ve production code değişikliği `NONE`dır. RCV-COL post-apply snapshot'ında
sıradaki exact migration
`20260801183656_debtor_external_case_status_integrity_d2i01_provenance` (DEBTOR-2) idi.
DEBTOR-2 daha sonra kendi program sayfasında bağımsız DB doğrulamasıyla uygulanmış ve
PR #2221 / `7c2665700b0214e264ae629cf5d6cd5bb80959b1` ile kaydedilmiştir; bu sonraki işlem
RCV-COL process-collision sınıflandırmasını değiştirmez ve bu kayıt başka programa APPLY
yetkisi üretmez.

```text
PROCESS COLLISION: RECONCILED
APPLY CLASSIFICATION: NOT A CLEAN SINGLE-EXECUTOR APPLY
RCV-COL MIGRATION: PRODUCTION_APPLIED / DATA_INTEGRITY_VERIFIED
CHECKSUM CANONICAL PARITY: PASS
LEDGER: 113 APPLIED / 0 FAILED
RCV-COL POST-APPLY PENDING: 8
EXECUTOR IDENTITY: NOT_PROVEN
RCV-COL PRE-APPLY BACKUP: NOT_PROVEN
31-SECOND-LATER BACKUP: POST-APPLY RECOVERY EVIDENCE / RESTORE PASS
ROLLBACK / REPAIR / REAPPLY / RESOLVE: NONE
DATA / BACKFILL: NONE
RUNTIME WRITER / ACTIVATION: UNCHANGED / NONE
CROSS-PROGRAM APPLY: NONE
```

## 9.17. WAVE 4 predecessor queue — RC-COL production migration apply — 2026-08-05

Owner'ın `WAVE 4 PREDECESSOR QUEUE CLEARANCE R01` sırasındaki dördüncü migration
`20260802120000_bank_tenant_fk_name_reconciliation_r01`, exact frontier commit
`0c799a7d90a5782d921a546a1cd4ed09d6a609b0` üzerinden production'da tek hedef olarak
uygulanmış ve post-validate edilmiştir. Frontier artifact 115 migration içerir; hedef
artifact'ın son ve apply öncesi tek pending migration'ıdır. Migration dosyası frontier ile
current main'de aynı SHA-256'a sahiptir:
`b9f0111114be9625a0c59974b2ad5a5b5a5c593ae4605024b947bbed0386a1fe`. Current main
üzerinden `migrate deploy`, manual SQL, `migrate resolve`, fake-applied veya başka program
migration'ı çalıştırılmamıştır.

Apply öncesinde HUKUK API/Web container ve project process sayısı `0`, external DB client /
active transaction sayısı `0` ve waiting lock sayısı `0` olarak doğrulanmış; formal
write-freeze `2026-08-05T22:37:10.028+03:00` anında ilan edilmiştir. Repo dışı fresh
`pg_dump -Fc` backup:
`C:\Development\HUKUK_YAZILIMI\backups\hukuk_db_pre_rc_col_wave4_20260805T193710Z.dump`,
`1,125,242` byte, SHA-256
`b5159be87ba55c2e5cee41c1c4d051bb78c8c29b781b191e08632dc5d889f0ee`; WAVE 4 terminal
kapanışına kadar korunacaktır. PostgreSQL 16.14 disposable restore parity `114 applied /
0 failed`, target absent, iki eski FK validated ve `BankSettlementEvidence=0 /
BankTransaction=0` PASS; disposable container doğrulama sonrası kaldırılmıştır.

Production apply bu task'ın Prisma süreci tarafından `2026-08-05T22:38:10.990+03:00` ile
`2026-08-05T22:38:11.493+03:00` arasında çalıştırılmış; CLI yalnız hedef migration'ı
uyguladığını ve tüm migration'ların başarıyla tamamlandığını raporlamıştır. Ledger kanıtı:

```text
started_at          : 2026-08-05 19:38:11.439872+00
finished_at         : 2026-08-05 19:38:11.451027+00
checksum            : b9f0111114be9625a0c59974b2ad5a5b5a5c593ae4605024b947bbed0386a1fe
applied_steps_count : 1
rolled_back_at      : NULL
logs                 : NULL
applied count       : 114 -> 115
newly applied       : exact target only
failed/rolled-back  : 0
frontier status     : up to date
current-main pending: 7 -> 6
```

Eski FK adları production'da `0`; canonical yeni adlar `2/2`, validated ve önceki FK
tanımlarıyla semantik olarak eşittir. `BankSettlementEvidence` ve `BankTransaction` satır
sayıları apply öncesi/sonrası `0 -> 0`dır; data mutation/backfill yoktur. Rollback, repair,
reapply, `migrate resolve` veya manual SQL yapılmamıştır. Current-main kuyruğunda yalnız
altı CLIENT migration'ı kalır; ilk pending
`20260802190000_client_identity_active_partial_unique`dır. Bu kayıt CLIENT C3 / ADIM 0 için
`115 applied / 6 CLIENT pending` predecessor-success kanıtıdır; CLIENT APPLY veya başka
program mutation yetkisi üretmez.

```text
RC-COL MIGRATION: PRODUCTION_APPLIED / POST-VALIDATED / CANONICAL EVIDENCE
APPLY CLASSIFICATION: CLEAN SINGLE-TARGET FRONTIER APPLY
CHECKSUM CANONICAL PARITY: PASS
LEDGER: 115 APPLIED / 0 FAILED
CURRENT-MAIN PENDING: 6 CLIENT MIGRATIONS
PRE-APPLY BACKUP / DISPOSABLE RESTORE: PASS / RETAINED
CONSTRAINT RENAME: 2/2 VALIDATED
DATA / BACKFILL: NONE
ROLLBACK / REPAIR / REAPPLY / RESOLVE / MANUAL SQL: NONE
CROSS-PROGRAM APPLY: NONE
NEXT: CLIENT C3 / ADIM 0 FRESH RE-RUN — SEPARATE PROGRAM PAGE
```

