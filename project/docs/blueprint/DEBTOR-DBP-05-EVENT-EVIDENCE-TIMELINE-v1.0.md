# DEBTOR DBP-05 — DOMAIN EVENT, LEGAL EVIDENCE & TIMELINE ARCHITECTURE v1.0

> **Canonical Phase 1 L4 artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER v1.0`
> §9 kapsamındaki DBP-05 work package'ının owner-onaylı çıktısıdır (Charter artefaktları #11
> Domain Event Catalogue'un aday/kanıt katmanı · #14 Legal Evidence Architecture iskeleti ·
> #15 Audit/Event/Evidence Separation Spec temeli). İçerik GO-ANALYZE (DBP-05 R0.1 → R0.2)
> çıktısıdır; bu GO-DOCS turunda yeni analiz, owner kararı veya LDO/KVKK sign-off'u
> üretilmemiştir. **OBD-07 (event-store / Published Language) ve OBD-08 (evidence
> classification / submission contract) SEÇİLMEMİŞTİR — açık owner kararlarıdır.**

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-05 — DOMAIN EVENT, LEGAL EVIDENCE & TIMELINE ARCHITECTURE (L4)
VERSION            : v1.0 (R0.2 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 LIMITED EVENT/EVIDENCE CORRECTION);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[K] — bkz. §17)
REVIEW DISPOSITION : OWNER-APPROVED WITH OPEN EVENT / EVIDENCE BOUNDARIES — yeni bir
                     repository lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : OBD-07 event-store/PL seçimi · OBD-08 evidence classification +
                     submission-contract seçimi · Legal Evidence hukuki sınıflandırma içeriği ·
                     LE retention/redaction süreleri · consumer inbox/dedup tasarımı ·
                     integration-event versioning kararı · full event completeness/rebuild
                     iddiası · FND-09 remediasyon implementasyonu — statüleri LDO/KVKK
                     SIGN-OFF PENDING veya OPEN — OWNER DECISION REQUIRED.
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları origin/main @ 2761bf3c; GO-DOCS drift kontrolü ve bu
                     belgenin base'i origin/main @ 63f27aa9 (fetch 2026-07-15; DBP-05 girdi
                     kaynaklarında — blueprint/, DEBTOR-GOVERNANCE, schema.prisma,
                     domain-event-ingest/, legal-deadline/, collection/, case.service —
                     2761bf3c→63f27aa9 arası SIFIR değişiklik; drift yok)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir model/altyapı için implementasyon, schema,
                     migration, cutover, remediasyon, workstream açılışı veya register
                     genişletmesi yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : EV/DL/AU/PJ/LE sınıf etiketleri ve CDC-E/OPT kimlikleri DBP-05-local
                     PROPOSED'dur (DBP-12'ye kadar). OF/DA/AE/HD DBP-04'ün, BC/OBD DBP-03'ün
                     kimlikleridir (SYS-GOV-011/012).
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md`
(SYS-EVID-001..008) → `DEBTOR-GOVERNANCE.md` (INV-08/09/11/12) → ADR. Execution/safety —
`AGENTS.md` + task authorization.

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`
- DBP-02/03/04: `project/docs/blueprint/DEBTOR-DBP-02-BUSINESS-CAPABILITY-VALUE-STREAM-v1.0.md`,
  `.../DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md`, `.../DEBTOR-DBP-04-LEGAL-STATE-LEGALGUARD-v1.0.md`
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md`
- İncelenen runtime kaynakları (pin'de):
  `project/apps/api/src/modules/icrabot/domain-event-ingest/domain-event-ingest.service.ts` +
  `aggregate-version-allocator.ts` · `project/apps/api/src/modules/legal-deadline/legal-deadline.service.ts` ·
  `project/apps/api/src/modules/collection/collection.service.ts` + `collection-cancel-executor.ts` ·
  `project/apps/api/src/modules/case/case.service.ts` · `project/apps/api/prisma/schema.prisma`
- Kanıt katmanı: `project/docs/analysis/debtor-master-synthesis-v2.md` (MS §E — FND-09..13)

---

## 2. Statü Sözlüğü

DBP-02/03/04 eksenleri aynen: AUTH/MAT/EVD/DEC/S-OWN/HOST/EXEC; CD/ODR/PROPOSED/VR; **LSO**=
LDO sign-off; NI=NOT_IMPLEMENTED; ABSENT=repo'da yok. Delivery varsayılan modeli:
**AT-LEAST-ONCE + IDEMPOTENT CONSUMER** (exactly-once İDDİA EDİLMEZ).

---

## 3. Record & Event Taxonomy — OWNER-APPROVED [A]

### 3.1 Event kavramları (7 sınıf; AS-IS eşleme VERIFIED)

| Sınıf | Tanım | AS-IS |
|---|---|---|
| A. DOMAIN EVENT | üreticinin gerçekleşmiş business-fact bildirimi | `header.eventType` değerleri (CASE_OPENED, PAYMENT_RECEIVED, PAYMENT_REVERSED, INTEREST_POLICY_ASSIGNED, …) |
| B. INTEGRATION EVENT | domain dışına yayımlanan VERSİYONLU sözleşme | **NOT DEFINED** — versiyonlu dış sözleşme yok; `EVENT_PUBLISHED:*` bu sınıfta DEĞİLDİR |
| C. EVENT STORAGE RECORD | envelope'ın persistence temsili | `IcrabotTimelineEntry` (body = header+payload) — otorite bloğu §4 |
| D. OUTBOX MESSAGE | dağıtım envelope'ı | `IcrabotOutboxAction.payload`; `actionType = "EVENT_PUBLISHED:{eventType}"` = **outbox action-type wrapper** (sözleşme/event adı değil) |
| E. DELIVERY STATE | mutable retry/status/error | aynı satırın `status(pending/sent/done/failed/dead)/attemptCount/nextRetryAt/updatedAt` alanları (D ile co-located) · `AddressOutboxEvent` (PENDING/PROCESSING/PROCESSED/FAILED + attemptCount/lastError/processedAt) — **append-only DEĞİL, VERIFIED** |
| F. CONSUMER PROCESSING / INBOX | tüketici dedup kaydı | **ABSENT** → consumer-side dedup davranışı VR |
| G. ACTION / COMMAND ENVELOPE | işlem NİYETİ (fact değil) | aynı outbox tablosundaki `open_lock, enqueue, send_email, send_sms, uyap_submit` action'ları — **outbox, event-delivery ile command-queue'yu KARIŞIK taşır** (ayrıştırma OBD-07 girdisi) |

### 3.2 Diğer kayıt sınıfları

**AU — AUDIT:** merkezi `AuditLog` (action/entity/user + oldValues/newValues Json; ADR-011
sanitization) + 5 alan-özgü audit (Expense/Icrabot/IcrabotFact/Address/ManifestAdmin); üretimde
update/delete yazarı yok (yalnız test-seed temizliği) — VERIFIED.
**PJ — PROJECTION/TIMELINE:** genel projection modeli yok; tek aday tablo C ile co-located (§4).
**LE — LEGAL EVIDENCE:** `model LegalEvidence` ŞEMADA YOK (NI); tek kırıntı: ingest'in
`occurredAtConfidence` + `EXTERNAL_SIGNED → evidence zorunlu` validasyonu (HR-34, VERIFIED).
OF/DA/AE/HD: DBP-04 §3 tanımları geçerli (reconciliation §14).

---

## 4. Event Authority & Completeness — OWNER-APPROVED [B]/[C]

### 4.1 `IcrabotTimelineEntry` otorite bloğu

```text
CURRENT IMPLEMENTATION STORAGE : IcrabotTimelineEntry
CURRENT STRUCTURED EVENT APPEND PATH : DomainEventIngest (appendInTransaction)
İKİNCİ CREATE-YAZARI           : TimelineService.addEntry (v28 UYAP timeline yazımı) — iki yazar
                                 da AggregateVersionAllocator kullanır (çift max+1 borcu kapalı)
WRITE BEHAVIOR                 : CREATE-ONLY IN PRODUCTION CODE — VERIFIED (update/delete yazarı 0)
DATABASE IMMUTABILITY          : NOT ENFORCED / NOT VERIFIED (WORM/constraint yok; yalnız
                                 @@unique(caseId, aggregateVersion) + gap-free trigger)
EVENT COMPLETENESS             : VERIFICATION REQUIRED (§4.2; UYAP-timeline girişleriyle domain
                                 event'ler aynı tabloda — içerik saflığı ayrıca VR)
CANONICAL EVENT-STORE AUTHORITY: OWNER DECISION REQUIRED — OBD-07
TIMELINE / PROJECTION ROLE     : CURRENTLY CO-LOCATED. BEFORE TIMELINE ENRICHMENT, ONE OF THE
                                 FOLLOWING IS REQUIRED:
                                   A. physical event-storage / projection separation
                                   B. strict non-mutating projection isolation preserving the
                                      original event envelope
                                 SELECTION: OWNER DECISION REQUIRED — OBD-07.
                                 Timeline enrichment mevcut event envelope'ı MUTATE EDEMEZ.
```

### 4.2 Emission coverage ve completeness matrisi

```text
NO DOMAIN-EVENT EMISSION THROUGH DomainEventIngest WAS FOUND AT THE PINNED SHA
(debtor, tebligat, address, legal-deadline, status ve diğer modüllerde çağrı yolu yok).
ALTERNATIVE EVENT / ACTION / AUDIT MECHANISMS (AddressOutboxEvent, Escalation/ClientApproval/
Calendar/BundleSeal event modelleri, alan-özgü audit'ler): DO NOT CONSTITUTE DOMAIN EVENTS
UNLESS EXPLICITLY CLASSIFIED. OTHER EMITTER COVERAGE: VERIFICATION REQUIRED.
```

| Producer / mutation (VERIFIED çağrı noktaları) | Current producer eventType | Same tx | Hist. coverage | Stream-order alanı | Completeness | Rebuild suitability |
|---|---|---|---|---|---|---|
| case.service:2009 (dosya açılış) | CASE_OPENED | ✓ (tx param; HR-39 yorumu) | başlangıç tarihi VR; backfill YOK | ✓ | kısmi | FORWARD-ONLY PROJECTION |
| case.service:2034 (faiz politikası ataması) | INTEREST_POLICY_ASSIGNED (HUMAN-actor zorunlu sette) | ✓ | VR | ✓ | kısmi | FORWARD-ONLY |
| collection.service:196/530/680 | PAYMENT_RECEIVED + ilişkili tipler (overpayment dahil) | ✓ | VR | ✓ | kısmi | FORWARD-ONLY |
| collection-cancel-executor:255 | PAYMENT_REVERSED (deterministic eventId — üretici-tarafı idempotent kimlik) | ✓ | VR | ✓ | kısmi | FORWARD-ONLY |
| DomainEventIngest-dışı tüm mutation'lar | — | — | — | — | ingest yolu YOK (diğer mekanizmalar sınıflandırılmadı) | NOT REBUILDABLE / VR |

Gap-tespiti: DB trigger sıra bütünlüğünü korur; **kayıp-mutation tespiti YOK**. Hiçbir alan
için `FULL REBUILD SUPPORTED` İLAN EDİLMEZ; full event completeness/rebuild iddiası AÇIK kalemdir.

---

## 5. Producer Transaction Boundary Matrix — OWNER-APPROVED [D]

```text
TRANSACTIONAL ATOMICITY: VERIFIED FOR —
  case.service CASE_OPENED / INTEREST_POLICY_ASSIGNED yolları · collection.service 3 yolu ·
  collection-cancel-executor PAYMENT_REVERSED yolu
  (appendInTransaction(tx, …): mutation ile aynı Prisma tx; event + outbox aynı tx; başarısızlıkta
  tam rollback — servis garantisi HR-39/44/45; SYS-EVID-002 hizalı)
NOT VERIFIED FOR —
  bu 6 yol dışındaki her mutation. Genel "bütün üreticiler atomik" hükmü KURULMAZ.
NOT: TimelineService.addEntry (UYAP yazarı) kendi $transaction'ında çalışır — domain mutation'la
  atomicity iddiası yoktur (farklı amaç).
Tenant zorunluluğu: outbox yazımı tenantId'siz THROW ("outbox_tenant_required") — VERIFIED.
```

---

## 6. Delivery / Inbox / Idempotency Matrix — OWNER-APPROVED [E]

| Alan | IcrabotOutboxAction | AddressOutboxEvent |
|---|---|---|
| Message identity | `evt:{eventId}` | — (yalnız cuid) |
| Idempotency key + unique | ✓ `idempotencyKey @unique` (VERIFIED) | **YOK → duplicate-delivery riski AÇIK; consumer-side dedup ZORUNLU yükümlülük (PROPOSED kural)** |
| Claim/lock | VR (tek mutasyon yazarı `v28-engine/outbox.service.ts`; claim deseni taranmadı) | VR |
| Retry / max attempts | attemptCount + nextRetryAt VAR; eşikler VR | attemptCount + lastError VAR; eşikler VR |
| Dead-letter | `dead` status VAR | YOK (FAILED terminal mi → VR) |
| Processing timeout / concurrent worker | VR | VR (PROCESSING ara durumu mevcut) |
| Consumer inbox/dedup | ABSENT (sınıf F) — tasarım AÇIK kalem | ABSENT |
| Poison-message | VR | VR |

---

## 7. Event Time & Ordering Model — OWNER-APPROVED [F]

**Ordering (kanıt: `AggregateVersionAllocator`):**

```text
CASE-STREAM-LOCAL RECORD ORDERING : VERIFIED — anahtar caseId; tx içinde
  pg_advisory_xact_lock(hashtextextended(caseId)) serileştirme + max+1; DB belt+suspenders:
  @@unique([caseId, aggregateVersion]) + enforce_aggregate_version_gap_free trigger.
DOMAIN-EVENT-ONLY ORDERING        : NOT GUARANTEED — aynı case-stream'e UYAP timeline kayıtları
  da yazılır (iki yazar); sıra numarası KAYIT sırasıdır, saf domain-event sırası değildir.
AGGREGATE SEMANTIC VERSION        : NOT ESTABLISHED — `aggregateVersion` mevcut ALAN ADIDIR;
  tek başına DDD aggregate-version otoritesi sayılmaz.
GLOBAL ORDERING                   : YOK — farklı case'ler/aggregate'ler arasında sıra garantisi
  yoktur ve HUKUKİ KRONOLOJİ SAYILMAZ.
```

**Zaman alanları:**

| Alan | Anlam | Durum |
|---|---|---|
| OCCURRED AT (+confidence; EXTERNAL_SIGNED→evidence) | olayın gerçekleşme anı | MEVCUT (HR-34) |
| RECORDED AT | sunucu kayıt anı (createdAt; HR-29) | MEVCUT |
| OBSERVED AT / RECEIVED AT / SOURCE REPORTED AT | gözlem/alım/kaynak-bildirim | HEDEF (PROPOSED; CDC-06 ACL girdilerinde ayrışır) |
| LEGAL EFFECTIVE AT | hukuki etki anı (DA katmanı belirler) | HEDEF (PROPOSED + **LSO**) |

---

## 8. Replay / Redelivery / Reprocessing / Reassessment — OWNER-APPROVED [G]

| İşlem | Kural |
|---|---|
| A. DELIVERY RETRY | aynı outbox mesajının tekrar teslimi; hukuki/finansal side-effect TEKRARI YASAK (idempotent consumer şartı — SYS-EVID-007) |
| B. PROJECTION REPLAY | EV kayıtlarından türev görünüm rebuild'i; business command ÜRETMEZ; completeness doğrulanmadan full-replay SÖZÜ VERİLMEZ (§4.2) |
| C. CONSUMER REPROCESSING | varsayılan KAPALI; yalnız explicit maintenance gate ile |
| D. LEGAL REASSESSMENT | replay DEĞİLDİR; mevcut OF'lerin yeni rule-version ile değerlendirilmesi → YENİ versiyonlu DA kaydı (DBP-04 supersession deseni) |

---

## 9. Layered Evidence & Provenance Model — OWNER-APPROVED [H] (classification içerik: LSO)

```text
A. SOURCE ARTIFACT             : belge/e-ileti/resmî çıktı/dış payload — ORİJİNAL DEĞİŞTİRİLMEZ
B. EVIDENCE INGEST RECORD      : kaynağın sisteme alınması
C. PROVENANCE / CHAIN-OF-CUSTODY: kaynak · alım zamanı · aktör · sistem · transfer · doğrulama izi
D. INTEGRITY RECORD            : hash/imza/mühür/boyut/format
E. EVIDENCE ASSERTION          : artifact'ın HANGİ observed fact'i desteklediği iddiası
F. LEGAL CLASSIFICATION        : delil niteliği + kullanım kapsamı — LDO SIGN-OFF REQUIRED
G. DERIVATIVE / REDACTED VIEW  : yetki/minimizasyon türevi
KURALLAR: redaksiyon orijinali DEĞİŞTİRMEZ (ayrı derivative) · correction overwrite ETMEZ
(supersession/correction metadata) · LEGAL HOLD, silme/anonymization taleplerine karşı AYRI gate ·
evidence assertion kaynak fact'in semantic owner'ını BC-18'e TAŞIMAZ (DBP-03 üç-katman modeli).
Submission contract: source context → fact/evidence submission contract → BC-18 append/integrity
enforcement — sözleşme alanları OBD-08 ile.
```

---

## 10. Class-Based Retention / WORM Matrix — OWNER-APPROVED [I]
Her sınıfta üç alan ayrık: **CURRENT IMPLEMENTATION BEHAVIOR / CANONICAL CONSTRAINT / PROPOSED POLICY.**

| Sınıf | CURRENT BEHAVIOR (VERIFIED) | CANONICAL CONSTRAINT | PROPOSED RETENTION/CORRECTION POLICY |
|---|---|---|---|
| EV | create-only (kod-düzeyi); DB-immutability yok; retention tanımsız | SYS-EVID-006 (silent update/delete yasak) — kapsamın EV'ye uygulanışı bu belgeyle KESİNLEŞTİRİLMEZ | `NO SILENT OVERWRITE OR HARD DELETE; CORRECTION BY NEW VERSION / SUPERSESSION` — **POLICY STATUS: OWNER-APPROVED ARCHITECTURAL RULE · LEGAL/RETENTION EFFECT: LDO + KVKK SIGN-OFF PENDING, AS APPLICABLE**; süre: ODR |
| DL | mutable state-machine; dead-letter arşivi tanımsız | — | kısa-ömür + arşiv politikası: ODR |
| AU | üretimde mutasyon yok; ADR-011 sanitization aktif; retention yazılı değil | SYS-EVID-003/005 | yasal saklama sınıfları: **LDO + KVKK** |
| LE | model YOK (NI) | SYS-EVID-004/006 (hedef) | WORM + legal-hold gate + redaction süreleri: **LSO** |
| PJ | genel projection yok | INV-09 (SoT değil) | **REBUILDABLE / DISPOSABLE CANDIDATE — SUBJECT TO EVENT COMPLETENESS, OPERATIONAL RETENTION AND KVKK POLICY** (serbest silme İLAN EDİLMEZ) |
| DA/AE/HD | DA-02 supersession deseni VERIFIED (DBP-04 §12); diğerleri ABSENT | SYS-EVID-006 | aynı OWNER-APPROVED ARCHITECTURAL RULE + LDO/KVKK pending; DA hukuki içerik: LSO |

---

## 11. Cross-Domain Event Contract Catalog (CDC-E — tam satırlar) — OWNER-APPROVED [J]

> `CURRENT PRODUCER EVENT TYPE: VERIFIED · VERSIONED INTEGRATION EVENT CONTRACT: NOT DEFINED ·
> CANONICAL CROSS-DOMAIN CONTRACT STATUS: OWNER DECISION REQUIRED / PROPOSED` — tüm satırlar için
> geçerli üst kural. Runtime log tek başına canonical contract kanıtı SAYILMAZ.

| Alan | CDC-E-01 | CDC-E-02 | CDC-E-03 | CDC-E-04 | CDC-E-05 |
|---|---|---|---|---|---|
| Current producer event/action type | eventType `PAYMENT_RECEIVED` | eventType `PAYMENT_REVERSED` (caused_by ZORUNLU — HR-23) | eventType seti `CASE_CLOSED/CASE_REOPENED/CASE_SUSPENDED/DEBTOR_IDENTITY_CORRECTED/INTEREST_POLICY_ASSIGNED/PAYMENT_REVERSED` (HUMAN-actor zorunlu — HR-26) | **action/eventType karışık üretim**: `EVIDENCE_UPLOADED, DEBTOR_CREATED, CASE_STATUS_CHANGED, …` (AddressOutboxEvent.eventType) | `source='uyap'` ETİKETİ (event type DEĞİL — kaynak sınıflandırması) |
| Producer | COLLECTION (collection.service / cancel-executor) | COLLECTION | CASE + ilgili üreticiler (ingest HR-26 seti) | Adres hattı (BC-04) | UYAP-kaynaklı girişler (TimelineService/ingest EXTERNAL actor) |
| Semantic owner | COLLECTION | COLLECTION | ilgili üretici context | DEBTOR (BC-04) | kaynak: dış (CDC-06C); kayıt: üretici |
| Consumer | disposition hattı handler'ı (runtime log kanıtı) | disposition reverse/no-op handler'ı | tüketici envanteri VR | dış işleme worker'ı (VR) | timeline okuyucuları |
| Wrapper | `EVENT_PUBLISHED:PAYMENT_RECEIVED` (outbox action-type; sözleşme adı DEĞİL) | aynı | aynı desen | wrapper YOK (kendi tablosu) | — |
| Schema version | NOT DEFINED | NOT DEFINED | NOT DEFINED | NOT DEFINED | — |
| Delivery mechanism | IcrabotOutboxAction (at-least-once) | aynı + deterministic eventId | aynı | AddressOutboxEvent (**key'siz — duplicate riski açık**) | tablo içi kayıt (delivery değil) |
| Event purpose | tahsilat gerçekleşti sinyali | tahsilat geri alındı sinyali | yaşam-döngüsü insan-onaylı fact'leri | adres hattı dış-işleme tetikleri | UYAP kaynak izi |
| Prohibited inferences | receipt'ten closure/allocation/hukuki durum türetme YASAK (DBP-02 §8.2; DBP-04) | reversal'dan otomatik hukuki sonuç türetme YASAK | stage/state'ten hukuki gerçek türetme YASAK (SYS-LEGAL-001) | adres event'inden doğrulanmış-adres türetme YASAK (SYS-ID-004) | source etiketi delil/contract DEĞİLDİR |
| Idempotency expectation | consumer dedup ZORUNLU (inbox ABSENT) | aynı (üretici kimliği deterministic) | aynı | **consumer dedup ZORUNLU (key yok)** | — |
| Replay policy | §8 | §8 | §8 | §8 | §8 |
| Evidence status | üretici+wrapper+tx: **VERIFIED** · consumer+duplicate: **VR** | aynı | üretici sabitleri VERIFIED · tüketici VR | şema VERIFIED · işleme VR | etiket VERIFIED |
| Contract status | ODR/PROPOSED | ODR/PROPOSED | ODR/PROPOSED | ODR/PROPOSED — **action-envelope niteliğinde; gerçek event contract sınıflandırması AÇIK** | contract DEĞİL (kaynak etiketi) |

---

## 12. FND-09..13 Verification Report (taze — 2026-07-15) + FND-09 Authority Violation — OWNER-APPROVED [K]

| FND | Taze durum | Kanıt |
|---|---|---|
| FND-09 | **ARCHITECTURAL AUTHORITY VIOLATION — REMEDIATION REQUIRED** | `debtor.service.ts:1643 auditLog.findMany` (business signal olarak audit okunuyor; INV-08 + SYS-EVID-003/005) |
| FND-10 | CONFIRMED — STILL OPEN | `model PaymentPromise|SettlementOffer` = 0 |
| FND-11 | CONFIRMED — STILL OPEN (kısmi) | report.service.ts: 21 `findMany` / 3 `take:` |
| FND-12 | CONFIRMED — STILL OPEN | ci.yml'de 6 `passWithNoTests` |
| FND-13 | CONFIRMED — STILL OPEN | `model Party` = 0 (OD-04) |

**FND-09 etkileri:** (1) audit retention değişirse İŞ DAVRANIŞI değişir; (2) ADR-011
sanitization iş sinyalini kaybettirebilir; (3) audit kaydı eksikse domain kararı bozulur;
(4) audit ↔ domain-event semantiği karışır (FND-10 ile ortak kök: davranış sinyali modeli yok);
(5) bu sinyaller event kaydında olmadığından replay/rebuild imkânsız. **Gate etkisi:** analysis
approval'ı bloke ETMEZ; FULLY RESOLVED EVENT ARCHITECTURE statüsünü bloke EDER. Remediasyon
rotası: BehaviorFeature/EV tabanlı sinyal (DBP-08 + BC-11) — bu belge remediasyonu yetkilendirmez.

---

## 13. OBD-07 / OBD-08 Decision Options (SEÇİLMEDİ — owner+LDO)

**OBD-07 — event-store / Published Language:** OPT-A mevcut append-path'i platform
event-distribution çekirdeği olarak kanonikleştir (tablo EV-record olarak resmîleşir; timeline
ayrışır) · OPT-B yeni genel DomainEvent tablosu (mevcut tablo projection'a iner;
EXPAND→BACKFILL→SHADOW — SYS-MIG-002) · OPT-C alana-özgü federasyonu koru (zayıf aday —
DG "rakip altyapı yasağı"nın ruhu konsolidasyon yönündedir; canonically inconsistent İLAN
EDİLMEDİ). Timeline ayrışması için A/B seçenekleri §4.1 bloğundaki gibi (fiziksel ayrım VEYA
strict non-mutating projection isolation) — SELECTION: ODR.
**OBD-08 — evidence classification + submission contract:** OPT-A tek merkezi LE (BC-18
integrity-host) · OPT-B domain-lokal LE + BC-18 integrity sözleşmesi. Her ikisinde
classification taksonomisi **LSO**.

---

## 14. DBP-04 Record Candidate Reconciliation

| DBP-04 kalemi | DBP-05 kanıtıyla güncel durum |
|---|---|
| DA-02 lifecycle VR | **ÇÖZÜLDÜ: SUPERSESSION VERIFIED** — idempotent no-op → eski kayıt yalnız `status: ACTIVE→SUPERSEDED` → yeni create (payload alanları mutate edilmez); "immutable" DEĞİL (status alanı mutable) |
| EventOutbox mutable-state VR | **ÇÖZÜLDÜ: MUTABLE VERIFIED** (iki outbox ailesi; şema + tek mutasyon yazarı) |
| LegalTimeShadowDiff VR | kod-düzeyi create-only VERIFIED (yazar-yokluğu); DB-düzeyi immutability AÇIK |
| OF-01 (Tebligat) davranışı | VR KALIYOR (update path'leri taranmadı) |
| AE ↔ CPE DecisionLog/ExecutionRecord eşlemesi | VR KALIYOR (spec VERIFIED; runtime eşleme taranmadı) |
| HD ↔ OfficeApproval eşlemesi | VR KALIYOR |
| EV kaydı | YENİ BULGU: iki-yazarlı, çift-rollü tablo (§4) — OBD-07 girdisi |

---

## 15. DBP-06/07/08 Routing

| Hedef | Giden |
|---|---|
| **DBP-06** | PARTY_* event ihtiyaçları (BC-01 event seti) OBD-07 seçimine bağlı · MergeLog record sınıfı · OBD-01/OD-04 kararı DBP-06'da VERİLMEZ |
| **DBP-07** | Liability event/record ihtiyaçları · Collection event tüketim sınırı (CDC-E-01/02 × disposition hattı; N-16 koordinasyon) |
| **DBP-08** | EV→BehaviorFeature beslemesi (EN-01 zinciri) · FND-09/10 remediasyon rotası (davranış sinyali modeli) · NBA outcome-feedback event'leri |

---

## 16. Analysis Approval / Fully Resolved Blocker Matrisi

| Konu | (i) ANALYSIS APPROVAL? | (ii) FULLY RESOLVED L4? |
|---|---|---|
| OBD-07 seçimi | NO | **YES** |
| OBD-08 + LE classification (LSO) | NO | **YES** |
| **FND-09 authority violation** | NO | **YES (remediation gate)** |
| Event completeness doğrulaması (emitter envanteri + tarih kapsamı) | NO | **YES** |
| Consumer inbox/dedup tasarımı (sınıf F ABSENT) | NO | CONDITIONAL |
| Integration-event versioning (sınıf B) | NO | CONDITIONAL (owner review) |
| LEGAL EFFECTIVE AT + zaman alanları (LSO) | NO | CONDITIONAL |
| LE retention/redaction süreleri (LSO+KVKK) | NO | **YES** |

DBP-05, açık kalemleri görünür taşıyarak **OWNER-APPROVED WITH OPEN EVENT / EVIDENCE
BOUNDARIES** disposition'ıyla kapanmıştır (2026-07-15); **FULLY RESOLVED** statüsü yukarıdaki
kararlar/sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 17. Owner Approval Record

```text
APPROVE DBP-05 R0.2 WITH OPEN EVENT / EVIDENCE BOUNDARIES (2026-07-15, chat-only owner kararı;
bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[K]): event/delivery/audit/evidence taksonomisi · IcrabotTimelineEntry iki-yazar
ve çift-rol bulgusu · event completeness ve rebuild sınıflandırması · producer transaction-
boundary matrisi · at-least-once + idempotent-consumer modeli · event time/ordering ayrımı ·
replay/redelivery/reprocessing/legal-reassessment ayrımı · katmanlı evidence & provenance modeli ·
sınıf-bazlı retention/WORM çerçevesi · CDC-E katalog yapısı · FND-09 statüsü (ARCHITECTURAL
AUTHORITY VIOLATION — REMEDIATION REQUIRED).
ONAYLANMAMIŞ/AÇIK: OBD-07 · OBD-08 · LE hukuki sınıflandırma içeriği · LE retention/redaction
süreleri · consumer inbox/dedup tasarımı · integration-event versioning · full completeness/
rebuild iddiası · FND-09 remediasyon implementasyonu — LDO/KVKK SIGN-OFF PENDING veya OPEN—ODR.
```

**Revizyon geçmişi (özet):** R0.1 ilk L4 analizi (outbox-mutable bulgusu, çift-rol tablo,
FND-09..13 taze doğrulama, DBP-04 reconciliation) → R0.2 LIMITED EVENT/EVIDENCE CORRECTION
(7-sınıf event taksonomisi; wrapper/event ayrımı; iki-yazar bulgusu; completeness matrisi;
üretici-bazlı atomicity; at-least-once modeli; case-stream ordering; replay 4'lü; 7-katman
evidence; sınıf-bazlı retention; FND-09 yükseltme) → GO-DOCS pre-normalizasyonu (6 terminoloji
düzeltmesi: append-otoritesi ayrımı, emission-coverage ifadesi, case-stream-local ordering,
current-producer-event-type, timeline A/B seçenekleri, retention üç-alan modeli + tam CDC-E
kataloğu). Ara revizyon metinleri görev sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- IcrabotTimelineEntry canonical event store ilan edildi mi:        NO (ODR — OBD-07)
- Full rebuild / complete event history iddiası:                    NO (§4.2)
- aggregateVersion DDD aggregate-version sayıldı mı:                NO (NOT ESTABLISHED)
- Runtime eventType versioned integration contract sayıldı mı:      NO (NOT DEFINED ayrımı)
- Outbox exactly-once gösterildi mi:                                NO (at-least-once + dedup)
- AuditLog ihlali çözülmüş gösterildi mi:                           NO (REMEDIATION REQUIRED)
- Evidence classification/retention LDO/KVKK onaylı gösterildi mi:  NO (PENDING işaretli)
- Emission-coverage kategorik yokluk iddiası:                       NO (pinned-SHA + ingest-yolu sınırlı ifade)
- OBD-07/08 açık mı:                                                YES
- IMPLEMENTATION AUTHORITY: NONE korundu:                           YES
- Register/decision-log değişikliği:                                NO
- Orphan referans:                                                  NO (path'ler main'de mevcut)
```
