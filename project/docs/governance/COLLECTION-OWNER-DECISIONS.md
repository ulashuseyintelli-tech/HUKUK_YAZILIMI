# COLLECTION OWNER DECISIONS

## Tahsilat Domaini — Açık Owner Karar Paketleri (Normalize Edilmiş)

```text
Belge yolu              : project/docs/governance/COLLECTION-OWNER-DECISIONS.md
Durum                   : CANONICAL OPEN-DECISION DOSSIER
Sınıf                   : OPEN-DECISION DOSSIER — hiçbir kararı KAPATMAZ; kapanmış karar
                          yalnız decision-log.md'de authoritative'dir (OFFICE-OWNER-DECISIONS
                          ile aynı sınıf ve sınır)
Owner Status            : OWNER-APPROVED CANONICALIZATION (2026-07-13) — dossier'in kendisi
                          onaylandı; COL/OD-03, COL/OD-04, COL/OD-05 ve COL/OD-21 RECORDED;
                          COL/OD-18 RECORDED → COL/OD-18A ile AMENDED (2026-07-15);
                          kalan 16 karar OPEN
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Kanıt tabanı            : repo main @ beb7d673 + Desktop 01 §23 karar kuyruğu damıtımı
IMPLEMENTATION AUTHORITY: NONE — karar paketi hazırlığı hiçbir implementasyon yetkisi üretmez
```

---

# 0. ODP-1..ODP-12 crosswalk durumu

Orijinal ODP-1..ODP-12 ve TDP dossier metinleri repo'da, git geçmişinde, PROJECT_MEMORY_PACK'te
ve bu makinede MEVCUT DEĞİLDİR (Handoff Acceptance Report §3, doğrulanmış). Bu belge ODP'leri
YENİDEN ÜRETMEZ; Desktop 01 §23'teki karar kuyruğunu repo'daki açık kayıtlarla birleştirip
`COL/OD-*` kimlikleriyle NORMALIZE eder (repo konvansiyonu: OFF/OD-* örneği).

**ODP-N ↔ COL/OD-NN eşlemesi:** UNRESOLVED — owner orijinal dossier'leri sağlarsa tek
docs-only güncellemeyle eşleme sütunu doldurulur. Eşleme yokluğu karar içeriğini etkilemez.

---

# 1. Karar paketleri

Format: her paket → SORU / BAĞLAM+KANIT / SEÇENEK UZAYI (icat değil, analizden) / BAĞIMLILIK /
ETKİ. Hiçbirinde öneri "karar" olarak yazılmamıştır.

## KUYRUK A — P0 patch'lerinden ÖNCE (NOW)

### COL/OD-01 — Legal ledger adjustment policy
- SORU: Hatalı/eksik geçmiş finansal kayıt hangi mekanizmayla düzeltilir (yalnız compensating
  entry mi; kim, hangi approval ile)?
- KANIT: Append-only ledger CURRENT (F-04); adjustment kavramının kontratı yok.
- BAĞIMLILIK: — (kök karar). ETKİ: reversal/refund ailesinin tamamı (COL/OD-09, -10).

### COL/OD-02 — "Dosya tutarı" tanımı
- SORU: UI/rapor/UYAP'ta "dosya tutarı" hangi basis'tir (hangi gerçeklik, hangi as-of)?
- KANIT: COL-VOC-001 qualifier zorunluluğu; legacy yüzeyler kendi toplamlarını üretiyor (OF-05).
- BAĞIMLILIK: COL/OD-03. ETKİ: consumer cutover (COL/OD-16), CAN-CUT-02.

### COL/OD-03 — Canonical effective-date policy
- STATUS: **RECORDED** (2026-07-16) — authoritative kayıt:
  `decision-log.md` § `2026-07-16 — RC-COL / COL/OD-03`.
- SORU: transactionDate/valueDate/effectiveDate/confirmedAt hangi tek policy'ye bağlanır;
  faiz ve legal balance hangisini tüketir?
- OWNER SELECTION: **OPTION A — Current-compatible effective-date authority.**
- KARAR:
  - Faiz ve legal balance yalnız canonical `effectiveDate` tüketir.
  - Explicit authorized canonical `effectiveDate` varsa kullanılır. Yoksa current-compatible
    resolver `LedgerEntry.entryDate` değerini; Ledger bulunmayan mevcut Collection fallback'inde
    `Collection.date` değerini kullanır.
  - `valueDate`, `confirmedAt`, `transactionDate`, `externalSettledAt` ve diğer ham tarihler
    provenance/lifecycle kanıtı olarak korunur; `valueDate` veya `confirmedAt` kendiliğinden
    hukuki etki tarihi değildir.
  - Zorunlu tarih eksik veya canonical authority çelişkiliyse tahmin yapılmaz; faiz/legal-balance
    sonucu fail-closed kalır.
  - Karar snapshot, migration, backfill, geçmiş kayıtların yeniden hesaplanması, consumer switch
    veya Phase 2 runtime cutover yetkisi vermez.
- KANIT: COL-INV-033/034; historical çift-tarih authority gap'i OF-06/COL-RISK-G05; current
  interest mapper `effectiveDate ?? entryDate`, Collection fallback'i `Collection.date` tüketir.
- BAĞIMLILIK: —. ETKİ: faiz kesinliği, COL/OD-02, -06, -14.
- PHASE 0 EFFECT: Bu karar approved merge ile canonical olduktan sonra COL/OD-03 W0.3
  blocker'ı kalkar; COL/OD-01 açık kaldığı için Phase 0 kapanmaz.

### COL/OD-04 — Allocation concurrency control kontratı
- STATUS: **RECORDED** (2026-07-15) — authoritative kayıt:
  `decision-log.md` § `2026-07-15 — RC-COL / COL/OD-04`.
- SORU: Aynı case/currency/ClaimItem scope'unda eşzamanlılık hangi AÇIK mekanizmayla
  serialize edilir (per-case advisory lock kontratlaşır mı, serializable mı, unique guard mı)?
  Canonical create dışındaki ikinci allocation giriş yolunun kaderi ne?
- KANIT: Koruma bugün DOLAYLI (OF-02); COL-INV-028 CURRENT-PARTIAL.
- BAĞIMLILIK: race harness kanıtı (Desktop 04 / A2) karara girdi üretir; karar test sonrası.
- ETKİ: W1.2 lock patch'i.
- KARAR — CANONICAL LOCK: Mevcut PostgreSQL transaction-scoped same-case advisory lock
  canonical allocation concurrency authority'dir. Scope, tenant doğrulaması yapılmış tek
  `Case`'tir; currency'den bağımsız case-wide serialization uygulanır. Canonical key
  `hashtextextended(caseId, 0)`'dır. `tenantId + idempotencyKey` lock'u ayrı idempotency
  authority'sidir ve allocation lock'un yerine geçmez.
- TRANSACTION BOUNDARY: Lock, ilk allocation-sensitive `ClaimItem` okumasından önce
  canonical `CollectionService.create` Prisma transaction'ı içinde alınır; Collection,
  event/outbox, ledger, allocation, `ClaimItem`, overpayment ve transaction-bound audit
  etkileri commit veya rollback olana kadar tutulur.
- FAILURE / RETRY: Lock timeout, deadlock veya transaction hatası fail-closed'dur ve bütün
  transaction rollback edilir. Kısmi persistence ve transaction-içi kısmi retry yasaktır;
  retry yalnız bütün canonical Collection command'inin aynı idempotency key ile yeniden
  yürütülmesidir. `SERIALIZABLE`, schema, migration veya yeni unique guard gerekli değildir.
- SECOND ALLOCATION PATH: **CLOSE**. Canonical `CollectionService.create` dışındaki ikinci
  canlı allocation giriş yolu ayrı authority olarak bırakılamaz ve aynı lock'a bağlanarak
  yaşatılamaz. Ortak internal allocator yalnız canonical Collection transaction'ı içinde,
  canonical same-case lock altında kullanılabilir.
- IMPLEMENTATION EFFECT: **W1.2 CLOSED / CANONICAL** — A2 concurrency evidence PR #1217,
  bu kararın canonicalization'ı PR #1275 ve secondary allocation write-path closure PR #1279
  ile tamamlanmıştır. Daha geniş REC-AUTH-011/012 reconciliation'ı ayrı ve açık kalır.

### COL/OD-05 — Audit/correlation sınırı + GLOBAL-ACTOR-AUDIT-CONTEXT ratification
- STATUS: **RECORDED** (2026-07-14) — authoritative kayıt:
  `decision-log.md` § `2026-07-14 — RC-COL / COL/OD-05`.
- SORU: Collection create/cancel hangi audit yazımını, hangi correlation alanlarını
  (correlationId/causationId/commandId) hangi katmanda taşır? Shared contract (Desktop 01 §17)
  ratifiye edilecek mi, hangi alan seti zorunlu?
- KANIT: OF-01 (audit=0, correlation şemada yok, commandId hiç yok; causedBy VAR).
- BAĞIMLILIK: —. ETKİ: W1.6 audit capture; tüm cross-domain event kontratları.
- KARAR:
  - Zorunlu committed mutation audit kataloğu `COLLECTION_CREATE`, `COLLECTION_UPDATE` ve
    `COLLECTION_VOID_EXECUTED`'dır. Idempotent replay, no-op update ve rollback ikinci/yanlış
    başarı audit'i üretmez. Void approval lifecycle mevcut `OFFICE_APPROVAL_*` authority'sinde
    kalır; yinelenen Collection approval audit'i yoktur.
  - HTTP correlation authority'si doğrulanmış server request context; internal/job authority'si
    command boundary'de bir kez üretilen server UUID'sidir. `correlationId` transaction boyunca
    immutable; `commandId` mutation attempt'e özgü ve idempotency key'den ayrıdır;
    `causationId` yalnız gerçek önceki kayıt varsa zorunludur. Void execution causation'ı
    `approvalRequestId`, `PAYMENT_REVERSED.header.causedBy` ise özgün payment event ID'sidir.
  - Audit actor/tenant/case/collection ile journal, ledger, event, outbox, varsa overpayment ve
    approval bağlantılarını allowlist metadata ile taşır. Başarı audit'i aynı transaction'da
    hata yutmadan yazılır; audit write başarısızsa tüm finansal mutation rollback olur.
  - Ham DTO/event/outbox/savedIntent, hassas kimlik/iletişim/banka verisi, serbest metin,
    credential/header, SQL ve stack audit'e yazılmaz. Hassas before/after yalnız presence,
    changed-field listesi ve SHA-256 fingerprint ile temsil edilir.
- IMPLEMENTATION EFFECT: **W1.6 CLOSED / CANONICAL** — COL/OD-05 kontratı W1.6 PR #1246 /
  squash `c7f55da4` ile transaction-bound Collection audit capture olarak uygulanmıştır.

## KUYRUK B — P1'den ÖNCE

### COL/OD-06 — External settlement / unapplied payment / chargeback kapsamı
- SORU: Banka kesinleşmesi (externalSettledAt), borca uygulanmamış tahsilat lifecycle'ı ve
  chargeback bu domain'e giriyor mu; hangi statülerle?
- KANIT: Vocabulary'de TARGET (COL-INV-008/033); runtime karşılığı yok.
- BAĞIMLILIK: COL/OD-03. ETKİ: W2.2, W2.3.

### COL/OD-07 — Feragat / indirim / sulh / ibra / write-off etki matrisi
- SORU: Bu hukuki işlemler ClaimItem/ledger/faiz üzerinde hangi etkiyi, hangi approval ile üretir?
- KANIT: COL-INV-015 CURRENT-PARTIAL (genel override matrisi yok); COL-INV-005 accounting sınırı.
- BAĞIMLILIK: COL/OD-01. ETKİ: W2.5, claim satisfaction.

### COL/OD-08 — Claim satisfaction / re-open
- SORU: Alacak ne zaman "karşılandı" sayılır; re-open hangi koşul ve kayıtla olur?
- KANIT: COL-INV-013 (dosya kapanışı ≠ satisfaction); FINANCIAL_CASE_CLOSE (OWN-29-C) actor
  sınırı var, satisfaction semantiği yok.
- BAĞIMLILIK: COL/OD-07. ETKİ: W2.5.

### COL/OD-09 — Refund / partial reversal kontratı
- SORU: Kısmi iade/kısmi reversal hangi model, hangi netting ve hangi approval ile tanımlanır?
- KANIT: REC-AUTH-015 TARGET/PRODUCTION_NO_GO; full reversal CURRENT (F-07).
- BAĞIMLILIK: COL/OD-01. ETKİ: W2.4.

### COL/OD-10 — Downstream reversal (dağıtım sonrası iptal)
- SORU: Disposition/payable/payout doğduktan sonra tahsilat void edilirse downstream etki
  nasıl geri sarılır?
- KANIT: Upstream net-zero CURRENT; downstream reversal kontratı analizde açık kalem.
- BAĞIMLILIK: COL/OD-01, -09; TM3 lane kararı COL/OD-18. ETKİ: W2.4.

### COL/OD-11 — Eski UYAP route disposition (AS7 revizyonu)
- SORU: `/uyap-export` kalıcı kararı ne: guard'la, düzelt, yönlendir, emekli et? Üçüncü XML
  yolu (template-engine) dahil mi?
- KANIT: OF-04; AS7 mevcut owner kararı "emekli EDİLMEZ, düzeltme ayrı PR".
- BAĞIMLILIK: —. ETKİ: W1.5, W4.3; CAN-CUT-01/PR-A5 hattıyla koordinasyon.

## KUYRUK C — CUTOVER'dan ÖNCE

### COL/OD-12 — ADR-014 cutover authorization
- SORU: Ölçülmüş baseline + representative evidence sonrası PR-11 ve runtime cutover APPROVED mı?
- KANIT: decision-log:15/48 — 3 gate açık; policy DEFINED ≠ APPROVED.
- BAĞIMLILIK: baseline + evidence (owner-side operasyonel gate). ETKİ: W4.4/W4.6.

### COL/OD-13 — Official snapshot / as-of authority
- SORU: Durable official snapshot lifecycle/hash/persistence kontratı ratifiye edilecek mi?
- KANIT: REC-AUTH-025 TARGET; REC-GOV §14.4.
- BAĞIMLILIK: ADR-013 hattı (COL/OD-14 ile birlikte okunur). ETKİ: W4.5.

### COL/OD-14 — ADR-013 fee/harç TO-BE seçimi
- SORU: Fee/harç authority modeli (A–D opsiyonları) hangisi; tahsil harcı + cezaevi harcı
  temsili nasıl?
- KANIT: ADR-013 Draft/owner-review-required; boundary audit BLOCKED-before-implementation.
- BAĞIMLILIK: ADR-013 Boundary Audit (GO-ANALYZE). ETKİ: W3.1.

### COL/OD-15 — FX contract
- SORU: Cross-currency observation/conversion kontratı açılacak mı; kapsam ne?
- KANIT: REC-AUTH-019/020 NO_GO; REC-FX-001/002.
- BAĞIMLILIK: COL/OD-03. ETKİ: W3.5.

### COL/OD-16 — Report/UI/template consumer switch
- SORU: Hangi tüketici hangi sırayla canonical DTO'ya geçer; parity kanıtı ve rollback nasıl?
- KANIT: REC-AUTH-027/028; CAN-CUT-02 needs-owner-decision; OF-05 legacy formüller.
- BAĞIMLILIK: COL/OD-02, -12. ETKİ: W4.1/W4.2/W4.4.

## KUYRUK D — GELECEK DOMAIN GENİŞLEMESİ

### COL/OD-17 — Liability / kefalet / müşterek-müteselsil double-count
- SORU: Kefalet/müşterek-müteselsil rejimde aynı alacağın birden çok borçlu üzerindeki
  görünümü nasıl temsil edilir; debtor-level agregasyonda double-count nasıl önlenir?
- KANIT: Desktop 01 §23; DEBTOR-GOV liability sınırı. BAĞIMLILIK: DEBTOR hattıyla ortak.

### COL/OD-19 — PaymentDesignation / PaymentScope
- SORU: Ödeyen≠borçlu ve tahsis beyanı modeli ratifiye edilecek mi?
- KANIT: §4.4 — bugün NEVER_AUTO + case-scoped; model yok. ETKİ: W3.4.

### COL/OD-20 — Muaccel / overdue / dispute / conditionality / collectability
- SORU: Muaccel/overdue/dispute/conditionality/collectability durumları hangi domainde ve
  hangi statü modeliyle tanımlanır; bu türevler canonical legal balance'tan nasıl ayrık tutulur?
- KANIT: Desktop 01 §23 gelecek kuyruğu; operational metric sınırı COL-INV setinde. ETKİ: W3.2/W3.3.

## KUYRUK E — İŞLETİM (teknik değil, sahiplik)

### COL/OD-18 — Client-settlement lane ataması (TM3 ↔ handoff çelişkisi)
- STATUS: **RECORDED** (2026-07-15) → **AMENDED** (2026-07-15) — execution lane ataması
  **SUPERSEDED BY COL/OD-18A**; karar metni gerçekleşmiş owner kararı olarak SİLİNMEDEN
  korunur. Authoritative kayıtlar: `decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18`
  ve § `2026-07-15 — RC-COL / COL/OD-18A`.
- SORU: CollectionDisposition/ClientPayable/ClientPayout/ClientOffset uygulama hattı Claude'da
  mı kalır (TM3 §5/§11 + D2, CURRENT-BINDING) yoksa Codex para hattına mı devredilir
  (Desktop 01 §0.3 / 03 §2, PROPOSED)?
- KANIT: COL-BOUNDARY-CONFLICT-001 (COLLECTION-GOVERNANCE §4.7).
- BAĞIMLILIK: — (işletim kararı; teknik ön koşulu yok). ETKİ: tüm W-SET lane'leri, worktree
  adlandırması, dosya sahiplik matrisi.
- KARAR:
  - `CollectionDisposition`, `ClientPayable`, `ClientPayout`, `ClientOffset` ve
    `project/apps/api/src/modules/client-settlement/` execution lane'i **Claude** olarak kalır;
    W1.3 Payout Replay Harness sahibi Claude'dur.
  - Aynı `client-settlement` servisleri, testleri ve W1.3'e özgü fixture/harness yüzeyinde
    paralel yazım **PROHIBITED**'dır. Aynı anda yalnız bir aktif writer ve bir execution
    worktree bulunur; diğer ajanlar aynı yüzeyde eşzamanlı edit, rebase, commit veya merge yapmaz.
  - W1.3 yalnız sequential/concurrent replay, idempotency ve concurrency evidence üretir.
    Production payout remediation, production davranış değişikliği, schema, migration ve para
    onay politikası kapsam dışıdır.
- IMPLEMENTATION EFFECT: W1.3, bu kayıt approved merge ile canonical olduktan sonra ayrı owner
  `GO-IMPLEMENT` için hazırdır. Bu kayıt tek başına implementation authority üretmez.

### COL/OD-18A — Execution lane amendment (implementation lane Codex'e devir)
- STATUS: **RECORDED** (2026-07-15) — authoritative kayıt:
  `decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18A`.
- KARAR:
  - COL/OD-18'in execution lane ataması AMEND edilmiştir: `CollectionDisposition`,
    `ClientPayable`, `ClientPayout`, `ClientOffset`, bunların
    `project/apps/api/src/modules/client-settlement/` uygulama hattı ve W1.3 Payout Replay
    Harness **implementation/execution lane'i Codex**'tir; **Claude analysis/review
    lane'indedir**. COL/OD-18'in `CLAUDE EXCLUSIVE` execution ataması silinmez; yalnız
    SUPERSEDED işaretlenir.
  - COL/OD-18'in lane-dışı hükümleri aynen yürürlüktedir: aynı yüzeyde paralel yazım
    **PROHIBITED** (aynı anda yalnız bir aktif writer — artık Codex — ve bir execution
    worktree); W1.3 kapsam sınırı (yalnız replay/idempotency/concurrency evidence; production
    davranışı, schema, migration, para onay politikası kapsam dışı) değişmemiştir.
- İLKE: **Analysis Owner ≠ Implementation Owner** — her workstream/lane kaydında analysis/
  review sahibi ile implementation sahibi ayrı ve açık yazılır
  (`process-rules.md` § Lane Ownership).
- IMPLEMENTATION EFFECT: **W1.3 CLOSED / CANONICAL** — amendment ile belirlenen Codex-exclusive
  lane altında PR #1265 / squash `081bd961` ile replay evidence tamamlanmış; closure evidence
  PR #1269 ile canonical kayıtlara işlenmiştir.

### COL/OD-21 — Money-out idempotency kontratının text-ratification'ı
- STATUS: **RECORDED** (2026-07-16) — authoritative kayıt:
  `decision-log.md` § `2026-07-16 — RC-COL / COL/OD-21`.
- SORU: Runtime'da MEVCUT kontrat (F-12) canonical governance metnine bağlanacak mı?
- KARAR:
  - Current recorded money-out authority `ClientPayout`tır. `OfficeApprovalRequest`
    authorization intent/gate, `ClientPayoutAllocation` source linkage ve Accounting Journal
    muhasebe temsilidir; ayrı payout authority değildir.
  - Canonical replay identity zorunlu ve logical command boyunca stabil
    `tenantId + idempotencyKey`dir. Finansal payload identity `caseId + caseClientId + exact
    Decimal amount + currency` alanlarıdır. `note` ve actor payout replay identity'sine dahil
    değildir; approval saved-intent hash'i finalize aşamasında yine birebir eşleşir.
  - Aynı key + aynı finansal payload mevcut `payoutId` ile side-effect üretmeyen idempotent
    replay'dir. Aynı key + farklı payload fail-closed `IDEMPOTENCY_KEY_CONFLICT`tır. Farklı key
    yeni command'dir; transport retry sırasında re-key yasaktır ve tutar/zaman benzerliğinden
    duplicate tahmini yapılmaz.
  - Concurrency boundary `tenantId + caseId + caseClientId + currency` transaction advisory
    lock'ıdır; `ClientPayout @@unique([tenantId, idempotencyKey])` nihai replay fence'idir.
  - Payout, source allocations, accounting journal ve transaction-bound audit tek Prisma
    transaction'da atomiktir. Hata bütün finansal write'ları rollback eder; partial persistence
    yasaktır. Approval intent rollback dışında kalabilir. Commit sonrası best-effort approval
    execution-marker hatası committed payout'ı geri almaz.
  - Current `RECORDED` contract repository içi money-out fact'ini kapsar; harici banka/provider
    transfer lifecycle'ı bu kararın kapsamı dışındadır.
- KANIT: Handoff bu maddeyi "eksik" biliyordu; repo'da CLOSED bulundu — kalan iş yalnız
  normatif kayıttı. W1.3 PR #1265 / squash `081bd961` gerçek PostgreSQL üzerinde sequential ve
  concurrent same-key replay'i 10/10 doğruladı; duplicate payout yok. BAĞIMLILIK: —.
  ETKİ: docs-only.
- PHASE 0 EFFECT: Bu karar approved merge ile canonical olduktan sonra COL/OD-21 W0.3
  blocker'ı kalkar; COL/OD-01 ve COL/OD-03 açık kaldığı için Phase 0 kapanmaz.

---

# 2. Owner Decision Dependency Graph

```text
KÖK (bağımsız başlar):
  COL/OD-01 (adjustment)   COL/OD-03 (effective-date — RECORDED)   COL/OD-05 (audit/correlation — RECORDED)
  COL/OD-11 (UYAP route)   COL/OD-18 (lane — AMENDED: COL/OD-18A)  COL/OD-21 (RECORDED)

COL/OD-01 ─┬─> COL/OD-07 (feragat/indirim/sulh) ──> COL/OD-08 (satisfaction/re-open)
           ├─> COL/OD-09 (partial refund/reversal) ─┬─> COL/OD-10 (downstream reversal)
           │                                        └── (COL/OD-18 lane sonucunu tüketir)
COL/OD-03 ─┬─> COL/OD-02 (dosya tutarı) ──> COL/OD-16 (consumer switch)
           ├─> COL/OD-06 (external settlement/unapplied)
           └─> COL/OD-15 (FX)
COL/OD-04 (RECORDED; W1.2 CLOSED / CANONICAL) <── A2 race harness kanıtı
COL/OD-12 (cutover auth) <── owner-side gate: baseline + representative evidence
COL/OD-13 (snapshot) ── ADR-013 hattı ── COL/OD-14 (fee TO-BE)
COL/OD-12 + COL/OD-16 ──> W4.6 nihai cutover
```

Önerilen oturum sırası (yalnız sıralama önerisidir, karar değildir):
1) COL/OD-21 RECORDED (2026-07-16; money-out idempotency contract canonicalization kaydı)
2) COL/OD-03 RECORDED (2026-07-16); COL/OD-01 sıradaki açık Phase 0 kök kararı
3) COL/OD-04 RECORDED (W1.2: CLOSED / CANONICAL)
4) Kuyruk B → Kuyruk C.

---

# 3. Kapanış kuralı

Bir COL/OD kararı yalnız şu zincirle kapanır:
owner kararı → decision-log.md kaydı → (gerekiyorsa) ilgili governance belgesine amendment
→ bu dossier'de satırın `OPEN → RECORDED(decision-log #ref)` işaretlenmesi.
Bu dossier'de "kapalı" görünen hiçbir satır tek başına authority değildir.
