# COLLECTION GOVERNANCE

## Tahsilat Domaini — Domain Governance

```text
Belge yolu              : project/docs/governance/COLLECTION-GOVERNANCE.md
Durum                   : CANONICAL DOMAIN GOVERNANCE
Owner Status            : OWNER-APPROVED CANONICALIZATION (owner review tamamlandı + GO-DOCS
                          canonicalization talimatı, 2026-07-13)
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Üst Otorite             : SYSTEM-CONSTITUTION (SYS-*) — bu belge system-wide normu yeniden tanımlamaz
Kardeş Domain Law       : RECEIVABLE-GOVERNANCE v1.0 (RATIFIED) — ikinci Receivable anayasası DEĞİLDİR
Sürüm                   : 1.0 (2026-07-13 — owner review R1–R7 revizyonları uygulanmış metin)
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
- ledger etkisini append-only kayıtlarla üretmek,
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
| External Settlement | Banka/sağlayıcı kesinleşmesi | TARGET — LIFECYCLE + HYBRID TYPED EVIDENCE CONTRACT RECORDED / PENDING CANDIDATE INGRESS + UNSETTLED ADMISSION GUARD + TYPED EVIDENCE SCHEMA FOUNDATION PRESENT / RUNTIME WRITER-TRANSITION ABSENT (COL/OD-06 Option A + COL/OD-06A; W2.2A/B/C-0/C-1) |
| Legal Allocation | Tahsilatın alacak bileşenlerine hukuki uygulanması | CURRENT (REC-AUTH-011) |
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
2. **Legal Reality** — hukuki borç ne ölçüde azaldı? (LedgerEntry + LedgerAllocation + canonical hesap)
3. **Operational Reality** — hangi aksiyon alınmalı? (projection/metric)
4. **Accounting Reality** — muhasebede ne tanındı? (AccountingJournal — ADR-010)

Bu dörtlünün aynı tutarı göstermesi zorunlu değildir; alan yalnız `balance` adı taşıyamaz.

## 3.2. Source-of-truth matrisi

(KANIT sütunu: repo main @ beb7d673 üzerinde bu oturumda doğrulanan dosya/satır ya da
ratifiye belge referansı.)

| Gerçek | Canonical authority | KANIT / statü |
|---|---|---|
| Receipt fact | `Collection` — tek yazım otoritesi `CollectionService` | collection.service.ts:393; TM3 inv-13 |
| Hukuki para etkisi | `LedgerEntry` + `LedgerAllocation`, append-only | schema.prisma:5169-5217; update/delete production yolunda yok |
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
- Legal allocation SONUCU ile bağlantı ve ledger yazımı (`SYS-GOV-018` dili): TBK100
  politikasının (sahibi RECEIVABLE — REC-GOV §9.2) tek transaction içinde deterministic
  yürütülmesi ve LedgerEntry/LedgerAllocation üretimi. Yürütme, REC-AUTH-011/012 ortak
  legal-allocation boundary'sine tabidir (TM3-ACT28 reconciliation OPEN); bu belge tek
  taraflı allocation sahipliği kurmaz.
- CollectionOverpayment (yalnız borç-üstü tahsil; HELD emanet sınıfı).
- Linked full reversal execution (compensating REVERSAL satırı + net-zero ayna).
- PAYMENT_RECEIVED / PAYMENT_REVERSED / OVERPAYMENT_RECORDED domain event üretimi (same-tx).

## 4.2. RECEIVABLE'ın sahip olduğu (Collection burada yalnız tüketici/yürütücü)

- ClaimItem semantiği, demandedAmount, interestTypeCode, Due→ClaimItem ingress (REC §7.2, §8).
- Allocation POLİTİKASI: TBK100 sırası ve REC-ALLOC-001..004 (REC-GOV §9.2 — norm oradadır,
  burada kopyalanmaz).
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
| COL-INV-002 | ClaimItem yalnız legal allocation etkisiyle azalır | CURRENT-CONFIRMED | REC-AUTH-004 (collectedAmount NON-AUTH); summary-engine ledger hattı |
| COL-INV-003 | Collection ≠ LedgerEntry ≠ LedgerAllocation | CURRENT-CONFIRMED | schema.prisma:2311/5169/5217 ayrı modeller |
| COL-INV-004 | Legal allocation ≠ client disposition | CURRENT-CONFIRMED | TM3 inv-7 |
| COL-INV-005 | Accounting write-off hukuki sona erme üretmez | CURRENT-PRINCIPLE | ADR-010 sınırı; REC-BOUNDARY-002 |
| COL-INV-006 | ClientOffset debtor set-off değildir | CURRENT-CONFIRMED | adr-client-offset (Accepted, locked invariants) |
| COL-INV-007 | Overpayment borç veya negatif claim değildir | CURRENT-CONFIRMED | CollectionOverpayment HELD; schema:2362-2391 |
| COL-INV-008 | Unapplied ≠ overpayment | TARGET-CONTRACT-RECORDED / RUNTIME-ABSENT | COL/OD-06 Option A; unapplied lifecycle henüz yok |
| COL-INV-009 | Refund ayrı para çıkış event'idir; Collection overwrite edilmez; chargeback otomatik refund/reversal değildir | CURRENT-PRINCIPLE (full) / TARGET (partial) | COL/OD-06 Option A; REC §11.3; REC-AUTH-015 |
| COL-INV-010 | Reversal yalnız açık bağlı compensating event ile | CURRENT-CONFIRMED | COL/OD-01 Option A; cancel-executor.ts:137-145; reversesLedgerEntryId @unique |
| COL-INV-011 | Posted/confirmed finansal kayıt fiziksel silinmez veya yerinde değiştirilmez | CURRENT-CONFIRMED | COL/OD-01 Option A; Ledger'da production update/delete yok; TM3-S1 hard-delete kapatıldı |
| COL-INV-012 | collectedAmount/amount/display cache legal authority olamaz | CURRENT-CONFIRMED | REC-AUTH-003/004 |
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

## 7.3. TARGET lifecycle contract (COL/OD-06 Option A; PENDING ingress + unsettled admission guard present, transition/evidence runtime absent)

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
11. **Execution gate:** COL/OD-06 contract'ı `RECORDED`; W2.2A schema foundation, W2.2B
    PENDING ingress ve W2.2C-0 admission guard `CLOSED / CANONICAL`dır. COL/OD-06A ile
    settlement evidence authority kaydedilmiş ve W2.2C decision gate sağlanmıştır. W2.2C-1,
    approved reconciliation merge'iyle `CLOSED / CANONICAL` olur; runtime evidence writer,
    verifier permission consumer ve candidate transition hâlâ yoktur. `W2.2C-2` yalnız sonraki
    owner-gated adaydır ve W2.3 W2.2 boundary uygulanıp kanıtlanana kadar blokludur.
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
   `e7d2f11d` kanıtıyla approved reconciliation merge'i üzerine `CLOSED / CANONICAL` olur.
   Runtime permission consumer, evidence writer, status transition ve Collection admission
   hâlâ yoktur. `W2.2C-2` yalnız owner-gated sıradaki adaydır; W2.2D/W2.2E/W2.3 veya başka
   runtime implementation bu kapanışla yetkilendirilmez. COL-RISK-G03
   `OPEN — RUNTIME WRITER / TRANSITION ABSENT` kalır.

---

# 8. Cross-domain contracts

| Contract | Statü | Taşıyıcı |
|---|---|---|
| RECEIVABLE–COLLECTION balance/allocation | CURRENT-PARTIAL — REC-GOV §7.3/§9 + TM3; ayrı contract belgesi YOK; TM3-ACT28-LEGAL reconciliation OPEN | REC-GOV + TM3 |
| OFFICE–COLLECTION actor/approval | CURRENT (approval) / TARGET-CONTRACT-RECORDED (dedicated `bank.settlement.verify`; runtime consumer absent) — approval ile settlement verifier permission aynı authority değildir | ADR-009 + dbind + COL/OD-06A |
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
