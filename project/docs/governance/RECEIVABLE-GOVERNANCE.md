# RECEIVABLE GOVERNANCE

## Alacak Kalemi / Kanonik Hesaplama Domain Anayasası

> **Tek domain giriş noktası:** Bu metin receivable-specific authority, boundary ve invariant kurallarının kanonik giriş noktasıdır. System-wide normları yeniden tanımlamaz; ratifiye `SYSTEM-CONSTITUTION` içindeki ilgili `SYS-*` hükümlerini referans alır ve yalnız receivable domain ayrıntısını ekler.

```text
Belge Durumu: CANONICAL
Belge Sınıfı: DOMAIN GOVERNANCE
Üst Otorite: SYSTEM-CONSTITUTION
Version: 1.9
Canonical Path: project/docs/governance/RECEIVABLE-GOVERNANCE.md
Owner Status: RATIFIED — BINDING
Repository Status: CANONICAL UPON APPROVED MERGE TO MAIN
Execution Authority: Bu belgenin ratifikasyonu veya merge'i hiçbir durumda kod, schema,
                     migration, feature activation, runtime cutover ya da release yetkisi
                     üretmez. Her mutation ayrıca AGENTS.md ve task-specific GO authorization
                     gerektirir.
Domain: Receivable / ClaimItem / Due ingress / Collection effect / Canonical legal calculation
Dil: Türkçe
Kalıcılık: Stable governance; volatil PR/SHA/blocker bilgileri yalnız Appendix C'de
```

---

# İçindekiler

0A. Non-goals
0B. Reading order
1. Belgenin rolü ve anayasal yeri
2. Amaç, kapsam ve kapsam dışı alanlar
3. Normatif hukuk ve AS-IS kanıt hiyerarşisi
4. Temel kavramlar
5. Dört otorite modeli
6. Domain ownership ve sınırlar
7. Alan-bazlı authority matrisi
8. Alacak ingress ve write-path anayasası
9. Payment / Collection / Allocation anayasası
10. Faiz ve kısmi ödeme anayasası
11. Reversal / refund / cancellation sınırı
12. Döviz ve currency anayasası
13. Fee / harç sınırı
14. Journal / Trace / Snapshot ayrımı
15. Presentation ve API anayasası
16. Integration ve NEVER_AUTO kuralları
17. Determinizm, hassasiyet ve test invariantları
18. CURRENT / TARGET / OUT-OF-SCOPE ayrımı
19. ADR sınırları ve terminoloji
20. Canonical consumer cutover anayasası
21. Legacy sınıflandırma ve silme sırası
22. Repository / provenance ve kapanış protokolü
23. Değişiklik, istisna ve ratifikasyon kuralları
24. Related documents ve zorunlu pointer'lar
25. Appendix A — Proposed / not ratified kararlar
26. Appendix B — Future product architecture programı
27. Appendix C — Non-normative current-state snapshot
28. Appendix D — Owner ratification checklist

---

# NON-GOALS

Bu belge:

- Product Architecture Constitution veya PAC değildir.
- ADR değildir.
- Release Plan değildir.
- Roadmap değildir.
- Master Register değildir.
- Decision Log değildir.
- Implementation Guide değildir.

Bu belge, `SYSTEM-CONSTITUTION` altında yalnız receivable domaininin kalıcı semantik,
authority ve boundary kurallarını ayrıntılandırır. Ratifikasyon veya merge hiçbir
implementation, migration, cutover, feature activation ya da release yetkisi üretmez.
Bu sınır `SYS-GOV-003`, `SYS-AUTH-006` ve `SYS-DEC-003` hükümlerini uygular.

---

# READING ORDER

Yeni geliştirici, reviewer veya ajan için zorunlu semantik okuma sırası:

```text
SYSTEM-CONSTITUTION
→ RECEIVABLE-GOVERNANCE
→ ADR-014
→ ADR-013
→ ADR-010
→ Decision Log
→ Master Register / Canonicalization Register
```

Execution ve repository-safety kuralları ayrı authority ekseninde `AGENTS.md` üzerinden
uygulanır. Semantic authority execution izni üretmez; execution izni de bu belgedeki
domain semantiğini değiştirmez (`SYS-AUTH-005`, `SYS-AUTH-006`).

---

# 1. Belgenin rolü ve anayasal yeri

## 1.1. Hiyerarşi

Bu belgenin repository governance hiyerarşisindeki yeri şöyledir:

```text
Semantic authority:
SYSTEM-CONSTITUTION
→ RECEIVABLE-GOVERNANCE (bu belge)
→ Contract / Standard
→ ADR
→ Implementation

Execution and safety authority:
AGENTS.md + repository policies + task-specific authorization
```

Decision Log ve Master Register/Canonicalization Register bu hiyerarşinin karar/evidence
kayıt yüzeyleridir; tek başlarına semantic veya execution authority üretmez.

**REC-GOV-001 — Bu belge sistem üst anayasası değildir.**
`SYSTEM-CONSTITUTION` altında yer alan alacak domain governance belgesidir.

**REC-GOV-002 — ADR, bu belgenin yerine geçmez.**
ADR-014, ADR-013 ve ADR-010 belirli karar ve uygulama sınırlarını yönetir; alacak domaininin kalıcı authority ve boundary kuralları bu belgede tutulur.

**REC-GOV-003 — Gelecekteki PAC-Full bu belgenin kendiliğinden üstü değildir.**
Product Architecture çalışması, `SYSTEM-CONSTITUTION` altında ayrı bir program veya domainler-arası contract seti olarak ratifiye edilmedikçe mevcut governance hiyerarşisini değiştiremez.

## 1.2. Tek domain giriş noktası

Bu doküman aşağıdaki receivable-specific konuların kanonik giriş noktasıdır:

- alacak kalemi field authority matrisi,
- Due / ClaimItem yönü,
- payment ve tahsilat etkisi,
- allocation ve TBK100 sırası,
- faiz matrahı,
- reversal sınırı,
- currency isolation,
- fee/harç sınırı,
- journal/trace/snapshot ayrımı,
- presentation authority,
- consumer cutover,
- legacy quarantine,
- governance ve ratifikasyon.

Ayrı sözleşme veya ADR'ler bu belgenin ayrıntısını uygulayabilir; fakat bu belgedeki bir invariant'ı sessizce değiştiremez. System-wide normlar burada bağımsız kopya olarak yeniden üretilmez; ilgili `SYS-*` hükmüne referans verilir.

Rule placement `SYS-GOV-007`ye tabidir. `REC-*` kimlikleri domain-local namespace'tir;
benzersizlik ve namespace koruması `SYS-GOV-011` ile `SYS-GOV-012` uyarınca uygulanır.

---

# 2. Amaç, kapsam ve kapsam dışı alanlar

## 2.1. Amaç

Bu belgenin amacı, alacak hattında daha önce görülen şu mimari bozulmaların tekrarını engellemektir:

1. Canonical diye geliştirilen bir hattın fiilen legacy kalması.
2. Aynı bakiye veya kalem için iki bağımsız production authority oluşması.
3. `Due`, `ClaimItem`, Collection, Ledger ve display alanlarının birbirini çift yönlü ve kontrolsüz tetiklemesi.
4. Tahsilat etkisinin `ClaimItem.collectedAmount` gibi non-authoritative alanlardan okunması.
5. UI, controller, report veya template içinde ayrı formül bulunması.
6. Eksik mapping, tarife veya currency verisinin sessiz `0`, `{}` veya legacy fallback üretmesi.
7. Adapter varlığının cutover tamamlanmış gibi yorumlanması.
8. Synthetic test kanıtının production empirical evidence yerine kullanılması.
9. Legacy kodun sınıflandırılmadan silinmesi.
10. WIP branch'te doğrulanan durumun `main`, production veya release durumuymuş gibi raporlanması.

## 2.2. Kapsam içi

- `ClaimItem` alanlarının hukuki ve teknik authority rolleri
- `Due → ClaimItem` ingress/provenance sınırı
- Payment / Collection / Ledger etkisinin alacak bakiyesine yansıması
- Allocation ve TBK100 sıra invariantları
- Kısmi ödemenin principal ve interest-base etkisi
- Full reversal için doğrulanmış net-zero sınırı
- Currency isolation ve fail-closed davranış
- Legal balance, projection, persistence ve presentation ayrımı
- ADR-014 pre-cutover canonical core sınırı
- Consumer cutover, bake, rollback ve legacy quarantine
- Legacy classification taxonomy
- Repository/provenance ve evidence-before-closure protokolü

## 2.3. Kapsam dışı

Bu belge aşağıdaki konuların bütün özel politikasını ratifiye etmez:

- tahsil harcı stage/rate matrisi,
- cezaevi harcı modeli,
- peşin harç floor/minimum kararı,
- yıllık tarife rakamları,
- Accounting Journal'ın bütün hesap planı,
- official/durable snapshot persistence implementasyonu,
- exact UYAP rich-interest mapping tablosu,
- banka import ve otomatik eşleştirme,
- full product aggregate/state/event/concurrency programı.

Bu alanlar ilgili ADR, contract veya ayrı domain governance altında yürütülür.

---

# 3. Normatif hukuk ve AS-IS kanıt hiyerarşisi

## 3.1. Normatif hukuk hiyerarşisi

Bu belge `SYS-GOV-004`, `SYS-AUTH-002`, `SYS-AUTH-003` ve `SYS-AUTH-004` hükümlerini
receivable domaininde uygular. Bağlayıcı mevzuat ve resmî kararlar üst normdur; Domain
Governance bunları receivable semantiğine taşır, ADR teknik/mimari tercihi kaydeder ve
implementation norm üretmez.

**REC-INV-001 — Hukuka üstün ürün kararı yoktur.**
Owner kararı, hukuken mümkün modeller arasından ürün politikasını seçebilir; bağlayıcı hukuk kuralını geçersiz kılamaz.

**REC-INV-002 — Kaynaksız hukuki oran yoktur.**
Kanuni sabit, yıllık tarife, sözleşmesel oran ve manuel hukuki karar ayrı kaynak sınıflarıdır; biri diğerinin yerine kullanılamaz.

## 3.2. AS-IS kanıt hiyerarşisi

AS-IS doğrulaması `SYS-GOV-005`, `SYS-COMP-002`, `SYS-COMP-004` ve `SYS-COMP-009`
uyarınca repository, git, runtime/DB, PR/CI ve governance kanıtından görev başında yeniden
yapılır. Evidence güveni ile authority/lifecycle/compliance statüsü birbirine karıştırılmaz.

**REC-INV-003 — Normatif hedef ile fiili davranış ayrıdır.**
“Hukuken ne olmalı?” ve “kod bugün ne yapıyor?” aynı kanıt türüyle cevaplanamaz.

**REC-INV-004 — Repository kanıtı olmayan receivable kapanışı yoktur.**
`SYS-CAN-005` ve `SYS-CAN-006` uygulanır; `DONE`, `CLOSED`, `CANONICAL`, `CUTOVER READY`
veya `RELEASED` iddiası ilgili seviyenin receivable evidence ve Master Register kanıtı
olmadan kullanılamaz.

---

# 4. Temel kavramlar

| Kavram | Bağlayıcı tanım |
|---|---|
| **Receivable** | Hukuki kaynağı, talep tutarı, faiz politikası ve yaşam döngüsü bulunan alacak hakkı |
| **Due** | Alacağın ingress/provenance kaynağı; canonical calculation authority olması zorunlu değildir |
| **ClaimItem** | Takip/alacak bileşeninin legal source, provenance ve calculation input kaydı; payment veya legal-application target değildir ve her alanı authority değildir |
| **LegalCalculationBucket** | Canonical Receivable snapshot'tan üretilen target legal-application grain'i; category ile currency/legal-basis/effective-date/interest-rule/priority bağlamını korur |
| **LegalApplication** | Receipt'in `LegalCalculationBucket` üzerindeki hukuki etkisi |
| **ApplicationAttribution** | `LegalApplication` sonucunun ClaimItem/source lineage açıklaması; application fact'i değildir |
| **Payment** | Borçlu veya üçüncü kişi tarafından yapılan ödeme fact'i |
| **Collection** | Ödemenin tahsilat bağlamı, statüsü ve ilişkili belge/işlem kaydı |
| **Allocation** | Ödeme tutarının hukuki sıraya göre borç bileşenlerine dağıtılması |
| **Legal Balance** | Yetkili input, policy ve rate setiyle hesaplanan hukuki bakiye sonucu |
| **Projection** | Persist edilmiş fact'lerden türetilen read model veya görünüm |
| **Journal** | Gerçek finansal olayın muhasebe kaydı |
| **Trace** | Hesap sonucunun nasıl oluştuğunu açıklayan evidence |
| **Snapshot** | Belirli input/policy/version setine ait hesaplama sonucu delili |
| **Compatibility Mirror** | Geçiş süresince taşınan, bağımsız authority olmayan uyumluluk alanı |
| **Consumer Cutover** | Production tüketicisinin legacy çıktından canonical çıktıya geçirilmesi |
| **Production Empirical Evidence** | Gerçek veya yetkili temsilî üretim verisiyle elde edilmiş davranış kanıtı |
| **Synthetic Evidence** | Fixture veya sentetik veriyle elde edilen test kanıtı; production evidence değildir |

---

# 5. Dört otorite modeli

```text
Single Source of Calculation
≠ Projection Ownership / Derived Read Contract
≠ Single Source of Persistence
≠ Single Source of Presentation
```

Bu ayrım `SYS-SOT-002`, `SYS-SOT-003` ve `SYS-SOT-004` hükümlerinin receivable-domain
uygulamasıdır. Projection ve presentation owner'ları source-of-truth veya canonical write
authority değildir.

## 5.1. Calculation Authority

Şu sorunun tek owner'ıdır:

> Hukuki ve matematiksel olarak hangi tutar hesaplanmalıdır?

Örnekler:

- canonical allocation,
- interest engine,
- legal balance core,
- ratifiye fee calculation engine,
- ratifiye FX policy.

## 5.2. Projection Ownership / Derived Read Contract

Şu sorunun tek owner'ıdır:

> Persist edilmiş fact'lere göre dosyada bugün hangi durum görünmelidir?

Örnekler:

- CaseBalance projection,
- fee projection,
- reconciliation view,
- canonical display DTO.

**REC-AUTH-PROJ-001 — Projection source fact'i override edemez.**

**REC-AUTH-PROJ-002 — Projection canonical write authority değildir.**

**REC-AUTH-PROJ-003 — Projection conflict-resolution authority değildir.**
Canonical ve derived sonuç çatışırsa `SYS-SOT-005` uygulanır; projection kazanmaz ve
conflict fail-closed evidence üretir.

## 5.3. Persistence Authority

Şu sorunun tek owner'ıdır:

> Hangi olay gerçekten gerçekleşti ve kalıcı kayıt nedir?

Örnekler:

- Payment / Collection fact,
- Accounting Journal posting,
- ClaimItem creation/update,
- frozen observation,
- official snapshot yalnız ratifiye edildikten sonra.

## 5.4. Presentation Authority

Şu sorunun tek owner'ıdır:

> Kullanıcıya, API'ye, rapora veya belgeye hangi yetkili sonuç gösterilir?

Presentation katmanı hesap yapmaz; yetkili DTO tüketir.

**REC-AUTH-000 — Aynı receivable semantiği için iki production authority yasaktır.**
Bu hüküm `SYS-SOT-003`ün domain ayrıntısıdır.

---

# 6. Domain ownership ve sınırlar

| Domain | Sahip olduğu gerçek | Sahip olmadığı gerçek |
|---|---|---|
| **Receivable / Claim** | alacak provenance'ı, demanded amount, interest code, claim semantiği | ödeme gerçekleşmesi, journal posting, Debtor/CaseDebtor legal role veya liability |
| **Collection** | payment/collection fact, statü, belge, reversal linki | legal balance formülü |
| **Calculation** | allocation, interest segmentleri, legal balance result | finansal event persistence'ı |
| **Accounting** | journal posting ve finansal event evidence | hukuki bakiye formülü |
| **Fee** | tarife/mevzuat/sözleşme kaynaklı fee calculation | receivable core içine gizli formül |
| **Presentation** | yetkili DTO tüketimi | bağımsız formül ve policy |
| **Integration** | harici fact, candidate veya mapping input'u | otomatik hukuki authority |

**REC-BOUNDARY-001 — Payment, ClaimItem'ı keyfî biçimde mutate etmez.**
Etki, Collection fact + canonical allocation akışı üzerinden üretilir.

**REC-BOUNDARY-002 — Accounting Journal legal balance hesaplamaz.**

**REC-BOUNDARY-003 — Calculation result finansal olayın gerçekleştiğini ispatlamaz.**

**REC-BOUNDARY-004 — Domain governance belgeleri birbirinin authority'sini sahiplenemez.**

Debtor/Receivable sınırı `SYS-GOV-016`, `SYS-GOV-017` ve `DEBTOR-GOVERNANCE` ile birlikte
okunur: ClaimItem receivable semantiğini taşır; Debtor/CaseDebtor legal role veya liability
authority'si üretmez.

**CLIENT ↔ RECEIVABLE sınırı (XDC-B — Creditor Context versus Receivable Authority)**: RECEIVABLE ClaimItem, receivable kompozisyonu, principal/interest/cost ve legal allocation + receivable lifecycle otoritesini elinde tutar; CLIENT tarafı creditor relationship/context, client instruction context ve client-facing read context'idir. CLIENT NON-AUTHORITY: independent receivable balance, claim mutation, legal allocation authority. Guard: **legacy client reference (`Case.clientId`) creditor veya finansal authority DEĞİLDİR** (`SYS-ID-001`; DBIND §1; `CL-INV-002`); creditor identity `CaseClient`/creditor set üzerinden belirlenir. ADR-014 calculation cutover ve ADR-013 fee/harç ownership bu sınırda çözülmez (kendi owner-gate'leri). CLIENT-tarafı index: `CLIENT-GOVERNANCE-CHARTER.md` §6 XDC-B.

---

# 7. Alan-bazlı authority matrisi

## 7.1. Statü sınıfları

Receivable-specific nitelemeler system lifecycle statüsünün yerine geçmez. Her authority
satırı semantik rolü, owner'ı, system lifecycle'ı ve evidence/compliance durumunu ayrı taşır.

| Receivable niteliği | System lifecycle mapping | Kullanım sınırı |
|---|---|---|
| `CURRENT_CANONICAL` | `CURRENT` + `CANONICAL_WITHIN_STATED_SCOPE` | Yalnız kanıtlanmış read/write veya calculation scope'u |
| `CURRENT_PROVENANCE` | `CURRENT` + `NON_CANONICAL_INPUT` | Kaynak/ingress kanıtı; hesap veya write authority değil |
| `COMPATIBILITY_ONLY` | `DEPRECATED` veya `SHADOW_ONLY` | Geçiş uyumluluğu; bağımsız authority değil |
| `NON_AUTHORITATIVE` | `CURRENT` + `DERIVED_ONLY` | Cache/projection/display/evidence; canonical write üretmez |
| `TARGET_OWNER_GATED` | `TARGET` + `PRODUCTION_NO_GO` | Owner/ADR/cutover gate kapanmadan current olamaz |
| `FORBIDDEN` | `PRODUCTION_NO_GO` | İlgili açık authority contract oluşana kadar yasak |
| `OUT_OF_SCOPE` | `STATUS_PER_CANONICAL_OWNER` | Ayrı domain/ADR statüsü esas alınır |

Evidence statüsü (`CONFIRMED`, `REVALIDATION_REQUIRED`, `UNVERIFIABLE`, `REFUTED`) ile
lifecycle/compliance statüsü birbirinin yerine kullanılmaz (`SYS-COMP-002`).

## 7.2. ClaimItem ve Due

| ID / alan | Semantic Role | Authority / Owner | System Lifecycle Status | Evidence / Compliance Status |
|---|---|---|---|---|
| `REC-AUTH-001` — `ClaimItem.originalAmount` | Creation provenance; normal mutation ile değişmez | ClaimItem creation command | `CURRENT / NON_CANONICAL_PROVENANCE` | `CONFIRMED / RUNTIME CONTRACT IMPLEMENTED` |
| `REC-AUTH-002` — `ClaimItem.demandedAmount` | Takipte talep edilen canonical alacak tutarı | Receivable/ClaimItem command owner | `CURRENT / CANONICAL_WITHIN_CLAIMITEM_SCOPE` | `CONFIRMED / RUNTIME IMPLEMENTED` |
| `REC-AUTH-003` — `ClaimItem.amount` | Controlled compatibility mirror; canonical değeri override edemez | Compatibility writer, demandedAmount ile kontrollü aynı akış | `DEPRECATED / COMPATIBILITY_ONLY` | `CONFIRMED / TRANSITIONAL COMPLIANCE` |
| `REC-AUTH-004` — `ClaimItem.collectedAmount` | Deprecated derived cache; tahsilat, legal application, legal balance veya display authority değildir | Yeni reader veya writer açılamaz; legacy backward compatibility dışında authority üretmez | `DEPRECATED / DERIVED_NON_AUTHORITATIVE` | `CONFIRMED / AUTHORITY EXCLUSION IMPLEMENTED; MIGRATION/CUTOVER NOT AUTHORIZED` |
| `REC-AUTH-005` — `ClaimItem.interestTypeCode` | Faiz hesaplama read authority | Receivable mapping/ClaimItem command owner | `CURRENT / CANONICAL_WITHIN_INTEREST_SCOPE` | `CONFIRMED / RUNTIME IMPLEMENTED` |
| `REC-AUTH-006` — `Due.interestTypeCode` | Ingress ve kaynak provenance'ı; calculation authority değil | Due owner | `CURRENT / NON_CANONICAL_INPUT` | `CONFIRMED / RUNTIME IMPLEMENTED` |
| `REC-AUTH-007` — legacy `interestType` | Sınırlı compatibility projection; yeni canonical karar kaynağı olamaz | Compatibility adapter | `DEPRECATED / COMPATIBILITY_ONLY` | `CONFIRMED / STRICT MAPPING ONLY` |
| `REC-AUTH-008` — Due → ClaimItem | Kontrollü tek yönlü ingress bridge | Due-to-ClaimItem bridge | `CURRENT / CONTROLLED_BRIDGE` | `CONFIRMED / RUNTIME IMPLEMENTED; IDEMPOTENCY CONTRACT APPLIES` |
| `REC-AUTH-009` — ClaimItem → Due | Implicit/otomatik reverse-write yasaktır | Write authority yok | `PRODUCTION_NO_GO / FORBIDDEN` | `CONFIRMED / STATIC REGRESSION GUARD` |

## 7.3. Payment / Collection / Allocation

| ID / semantik | Semantic Role | Authority / Owner | System Lifecycle Status | Evidence / Compliance Status |
|---|---|---|---|---|
| `REC-AUTH-010` — Payment/Collection receipt varlığı ve statüsü | Dosyaya bağlanan para giriş fact'i; ClaimItem cache alanından çıkarılamaz | COLLECTION owner; receivable yalnız yetkili fact'i tüketir | `CURRENT PARTIAL` | `CONFIRMED / IDEMPOTENCY CONFIRMED; CANONICAL PUBLIC RECEIPT TENANT / OBJECT-SCOPE GATES CONFIRMED; PROVIDER FINALITY OPEN UNDER RC-COL / W2.2` |
| `REC-AUTH-011` — Tahsilatın alacağa etkisi | Receipt'in target `LegalCalculationBucket` üzerindeki immutable `LegalApplication` etkisi; attribution ayrı ve non-authoritative fact'tir | RECEIVABLE bucket/context/snapshot semantics + policy; COLLECTION receipt/idempotency/outer transaction orchestration; RCV-COL boundary single writer `LegalApplicationWriter` | `TPA-03A FOUNDATION + TPA-04B REQUIRED-EVIDENCE SCHEMA AMENDMENT CLOSED / CURRENT AS-IS LEGACY PERSISTENCE / TARGET SHADOW_ONLY / WRITER ABSENT` | `ACT-28/REC-AUTH-011/012 OPEN; plan/writer/replay/cutover/retirement UNAUTHORIZED; next TPA-04C analysis owner-gated` |
| `REC-AUTH-012` — Payment allocation | TBK100 ve geçerli validation ile `MASRAF → FERİ → FAİZ → ANA PARA` sırasındaki exact-cent target legal-application sonucu | RECEIVABLE legal-calculation policy; COLLECTION canonical transaction orchestration; `LegalApplicationWriter` tek logical persistence writer'ıdır | `TARGET LEGALAPPLICATIONBATCH FOUNDATION + REQUIRED-EVIDENCE PERSISTENCE PRESENT / CURRENT AS-IS CLAIMITEM-KEYED LEDGER HISTORICAL LEGACY / SHADOW_ONLY` | `Canonical TEXT snapshot evidence, bucket arithmetic and aggregate conservation PR #1470 ile present; data/replay/writer/cutover NOT AUTHORIZED; ACT-28 / REC-AUTH-011/012 OPEN` |
| `REC-AUTH-013` — Overpayment / hold | Kapsamı belirlenmiş allocation/collection sonucu; principal'a sessiz yazılamaz | Allocation/Collection result owner | `CURRENT PARTIAL / SCOPE-BOUNDED` | `CONFIRMED WITHIN ADR-014 FIXTURE/ENGINE SCOPE; PRODUCTION REVALIDATION REQUIRED` |
| `REC-AUTH-014` — Valid linked full reversal | Bağlı payment'ın canonical legal etkisini net-zero yapar | Reversal link + canonical allocation | `CURRENT / CANONICAL_WITHIN_LINKED_FULL_REVERSAL_SCOPE` | `CONFIRMED / UNIT + DISPOSABLE-DB + REAL CANCEL PATH` |
| `REC-AUTH-015` — Partial reversal/refund | Ayrı ratifikasyon olmadan inference yapılamaz | Owner/contract henüz tanımlanmamış | `TARGET / PRODUCTION_NO_GO` | `NOT_IMPLEMENTED / OWNER DECISION REQUIRED` |

## 7.4. Interest ve currency

| ID / semantik | Semantic Role | Authority / Owner | System Lifecycle Status | Evidence / Compliance Status |
|---|---|---|---|---|
| `REC-AUTH-016` — Interest type selection | Canonical faiz türü seçimi; legacy label override edemez | `ClaimItem.interestTypeCode` + ratifiye policy | `CURRENT / CANONICAL_WITHIN_INTEREST_SCOPE` | `CONFIRMED / RUNTIME IMPLEMENTED` |
| `REC-AUTH-017` — Interest base mutation | Yalnız principal allocation kadar, effective date sonrası base azaltımı | Canonical allocation result + interest engine | `CURRENT / CANONICAL_WITHIN_PRE_CUTOVER_SCOPE` | `CONFIRMED / UNIT + DB REGRESSION EVIDENCE` |
| `REC-AUTH-018` — Currency isolation | Currency gruplarını ayırır; mismatch fail-closed | ADR-014 calculation core | `CURRENT / CANONICAL_WITHIN_PRE_CUTOVER_SCOPE` | `CONFIRMED / UNIT + DB REGRESSION EVIDENCE` |
| `REC-AUTH-019` — Cross-currency conversion | Yetkili FX contract olmadan uygulanamaz | Current authority yok | `NOT_IMPLEMENTED / PRODUCTION_NO_GO` | `CONFIRMED ABSENT / FUTURE OWNER GATE REQUIRED` |
| `REC-AUTH-020` — Frozen FX observation | Gelecekteki explicit observation contract adayı | Owner-gated future FX contract | `TARGET / PRODUCTION_NO_GO` | `NOT IMPLEMENTED / CONTRACT DETAILS NOT RATIFIED` |

## 7.5. Legal balance, trace, snapshot ve journal

| ID / semantik | Semantic Role | Authority / Owner | System Lifecycle Status | Evidence / Compliance Status |
|---|---|---|---|---|
| `REC-AUTH-021` — ADR-014 / Balance Engine legal-balance computation | Target canonical legal-calculation authority; production primary değildir | ADR-014 calculation core / Balance Engine | `TARGET / SHADOW_ONLY` | `CONFIRMED IMPLEMENTATION EVIDENCE / W0-PR10 CLOSED; AUTHORITY PROMOTION AND CUTOVER NOT AUTHORIZED` |
| `REC-AUTH-022` — Production receivable balance/display | Production consumer'ın yetkili legal-balance contract'ı | Current legacy owner until cutover; target canonical calculation owner after gate | `TARGET / SHADOW_ONLY / PRODUCTION_NO_GO` | `CONFIRMED / ADAPTER ADDITIVE; CUTOVER NOT AUTHORIZED` |
| `REC-AUTH-023` — Calculation trace | Hesabı açıklayan derived evidence; financial event değildir | Explainability owner | `SHADOW_ONLY / DERIVED_NON_AUTHORITATIVE` | `CONFIRMED / NON-PERSISTED` |
| `REC-AUTH-024` — Non-official snapshot | Request-time/non-official calculation evidence | Explainability evidence owner | `SHADOW_ONLY / DERIVED_NON_AUTHORITATIVE` | `CONFIRMED / authority=NONE; persisted=false` |
| `REC-AUTH-025` — Official snapshot | Dar receipt-bound legal-application alt türü `CanonicalReceivableApplicationSnapshotV1`; broader presentation/Fee/Harç/Journal snapshot lifecycle ayrı açık kontrattır | RECEIVABLE subtype semantics; RCV-COL boundary embedded persistence; broader ADR-013 owner review | `TARGET / SHADOW_ONLY / PRODUCTION_NO_GO` | `NARROW SUBTYPE RATIFIED / RUNTIME NOT_IMPLEMENTED; BROADER ADR-013 OPEN` |
| `REC-AUTH-026` — Financial posting | Muhasebe temsili; legal calculation sonucu posting authority değildir | Accounting Journal / ADR-010 | `TARGET / SHADOW-DIRECTION; STATUS PER ACCOUNTING OWNER` | `EXECUTION GATED / ADR-010 EVIDENCE REQUIRED` |

## 7.6. Presentation ve integration

| ID / semantik | Semantic Role | Authority / Owner | System Lifecycle Status | Evidence / Compliance Status |
|---|---|---|---|---|
| `REC-AUTH-027` — UI hesap özeti | Cutover sonrası yetkili DTO tüketimi; UI formül üretmez | Presentation consumer contract | `TARGET / SHADOW_ONLY / PRODUCTION_NO_GO` | `LEGACY PRIMARY ACTIVE; CANONICAL CUTOVER NOT AUTHORIZED` |
| `REC-AUTH-028` — Report/document balance | UI ile aynı canonical contract'ın tüketimi; ayrı formül yasak | Presentation/report consumer contract | `TARGET / PRODUCTION_NO_GO` | `REVALIDATION + CONSUMER CUTOVER REQUIRED` |
| `REC-AUTH-029A` — UYAP source fact | Harici kaynaktan gelen provenance/evidence; doğrulanmadan canonical truth değildir | Validated UYAP adapter + domain confirmation | `CURRENT INPUT / NON_CANONICAL` | `CURRENT PARTIAL / PROVENANCE AND RECONCILIATION REQUIRED` |
| `REC-AUTH-029B` — UYAP mapping policy | Rich-interest ve exporter kodları arasındaki ratifiye dönüşüm kararı | Owner/legal-approved integration mapping | `TARGET / PRODUCTION_NO_GO` | `SELECTED D1–D9 CELLS OWNER_LEGAL_ACCEPTED / CONTRACT + NUMERIC ADAPTER CANONICAL; SHARED NUMERIC XML CONSUMER ACTIVE IN UyapXmlService; OTHER CELLS UNVERIFIED-FAIL-CLOSED; SUBMIT EXECUTION + FAIZT + CUTOVER NOT AUTHORIZED; PR-A5-1 DORMANT RELATION/PROJECTION/BATCH CONTRACT IMPLEMENTED WITH ZERO PRODUCTION CONSUMERS; PR-A5-2 NOT AUTHORIZED` |
| `REC-AUTH-030` — Bank receipt candidate | Tahsis öncesi non-authoritative integration candidate | Bank adapter + authorized confirmation | `CURRENT INPUT / NON_CANONICAL` | `HUMAN/OWNER CONFIRMATION REQUIRED; NO AUTO-ALLOCATION` |
| `REC-AUTH-031` — AI/risk output | Advisory derived output; hukuki/finansal authority değildir | AI/risk projection owner | `CURRENT PARTIAL / DERIVED_NON_AUTHORITATIVE` | `TENANT, VISIBILITY, PROVENANCE AND HUMAN-GATE COMPLIANCE REQUIRED` |

**REC-INV-005 — Model canonical olabilir; her alanı authority değildir.**

---

# 8. Alacak ingress ve write-path anayasası

## 8.1. Due → ClaimItem

```text
Due / source fact
→ validate
→ map
→ ClaimItem create/update command
→ audit/provenance
```

Kurallar:

1. Bridge tek yönlüdür.
2. Mapper deterministic ve idempotent olmalıdır.
3. Kaynak referansı ve actor bilgisi korunmalıdır.
4. Compatibility alanı canonical alanı override edemez.
5. ClaimItem değişikliği Due'ya implicit reverse-write üretemez.

## 8.2. Write-path asgari şartları

Bu sınır `SYS-AUTH-007`, `SYS-AUTH-008` ve `SYS-FIN-008` hükümlerinin receivable
write-path uygulamasıdır.

Her canonical write command şunları açıkça taşımalıdır:

```text
tenantId
aggregate/case identity
actor
idempotency key veya eşdeğer tekrar koruması
source/provenance
legal/policy basis gerekiyorsa referans
```

**REC-WRITE-001 — Tenant'sız canonical financial record kabul edilmez.**

**REC-WRITE-002 — Compatibility mirror yazımı canonical write ile aynı kontrollü akışta olmalıdır.**

**REC-WRITE-003 — Compatibility alanından canonical alana implicit reverse-write yasaktır.**

---

# 9. Payment / Collection / Allocation anayasası

Bu bölüm `SYS-FIN-002`, `SYS-FIN-003`, `SYS-FIN-007` ve `SYS-FIN-008` ile birlikte
uygulanır.

## 9.1. Case-scoped payment

Standart manuel akış:

```text
Kullanıcı belirli dosyayı açar
→ tahsilat girer
→ payment caseId ile persist edilir
→ canonical allocation yalnız seçili dosyada çalışır
```

Sistem global debtor-level payment pool varmış gibi davranamaz.

`DEBTOR-GOVERNANCE` §7'deki “Tahsilat tahsisi = NEVER_AUTO” sınırı korunur: AI, NBA veya
generic automation Collection ledger'a allocation yazamaz. Yetkili kullanıcının case-scoped
payment command'ı sonrasında domain-owned deterministic TBK100 calculation yürütülmesi bu
otomasyon yasağını genişletmez veya bypass etmez.

## 9.2. TBK100 sıra invariantı

Canonical intra-case allocation sırası:

```text
1. Masraf / takip / yargılama giderleri
2. Fer'i alacaklar
3. İşlemiş faiz
4. Ana para
```

**REC-ALLOC-001 — Yüksek öncelikli bucket açıkken principal allocation yapılamaz.**

**REC-ALLOC-002 — Payment principal'ı doğrudan düşürmez.**
Principal yalnız allocation sonucu principal bucket'a ulaşan tutar kadar azalır.

**REC-ALLOC-003 — Negatif payment kabul edilmez.**

**REC-ALLOC-004 — Money allocation minor-unit/decimal hassasiyetinde yürütülür; float-dust authority olamaz.**

**REC-ALLOC-005 — Target legal-application grain'i ClaimItem değildir.**
Canonical Receivable snapshot, application öncesinde `LegalCalculationBucket` üretir.
`LegalApplication` bu bucket'a uygulanır; `ApplicationAttribution` sonucu ClaimItem/source
lineage'ına açıklar. ClaimItem-keyed `LedgerAllocation` current AS-IS/legacy persistence'tır
ve target legal authority olarak yorumlanamaz. ClaimItem payment-state, collected-balance
veya allocation authority değildir; `ClaimItem.collectedAmount` için yeni reader veya writer
açılamaz.

**REC-ALLOC-006 — Sub-bucket context kaybı yasaktır.**
Aynı kategori içinde currency, legal basis, effective date, interest rule veya priority
bağlamı farklıysa ayrı calculation sub-bucket korunur. Bu bağlamlardan biri eksikken
bucket'lar tahminle birleştirilemez.

### 9.2.1. RD01 LegalCalculationBucket ve balance-exposure contract'ı

**REC-ALLOC-007 — Bucket context ile snapshot instance ayrı kimliklerdir.**

```text
bucketContextKey =
  category
  + subcategory
  + currency
  + legalBasisRef
  + effectiveDate/period
  + interestRuleRef
  + priority

bucketInstanceId =
  tenantId
  + caseId
  + canonicalSnapshotRef
  + asOfDate
  + calculationRuleVersion
  + bucketContextKey hash
```

`bucketContextKey` stable hukuki bağlamı, `bucketInstanceId` belirli hesaplama snapshot'ını
tanımlar. Her bucket `sourceLineageSetRef`, currency minor-unit bilgisi ve
gross/applied/remaining tutarlarını taşır. ClaimItem id bu anahtarlardan biri veya
legal-application target'ı değildir.

**REC-ALLOC-008 — Gross, applied ve remaining exposure aynı bağlamda reconcile edilir.**

Her currency için MASRAF, FERİ, FAİZ ve ANA PARA ayrı category olarak korunur:

```text
remainingAmountMinor
= grossAmountMinor - netAppliedAmountMinor

receiptAmountMinor
= Σ LegalApplication.appliedAmountMinor + heldRemainderMinor
```

Cross-currency aggregate veya conversion yapılmaz. Held/unapplied receipt amount legal
exposure'a eklenmez. Eksik context, currency, snapshot, rule version veya lineage
referansı `0` değildir; typed `null` ile `UNAVAILABLE`, `NOT_COMPARABLE`, `STALE` veya
`FAIL_CLOSED` sonucu üretir.

**REC-ALLOC-009 — LegalApplication ve ApplicationAttribution contract'ları ayrıdır.**

`LegalApplication` en az receipt fact referansı, `bucketContextKey`, application-time
snapshot, effective time, application sequence, rule version, applied exact-cent amount,
before/after bucket state ve varsa linked reversal referansı taşır. Held remainder tekil
application değil receipt/application-batch seviyesindedir.

`ApplicationAttribution` application sonucunu ClaimItem/source lineage'a açıklayan ayrı,
non-authoritative fact'tir. Amount-based attribution varsa attribution tutarları exact-cent
olarak application tutarıyla reconcile edilir; attribution payment, bucket veya legal
application authority'si üretemez. Attribution eksikliği bucket-level application'ı
otomatik hükümsüz kılmaz. Bununla birlikte zorunlu trace/provenance eksikse projection
primary-eligible olamaz ve source-level açıklama `AVAILABLE` gösterilemez.

**REC-ALLOC-010 — Public projection category-level ve fail-closed'dur.**

Public projection yalnız per-currency/category gross/applied/remaining toplamları,
tenant/case, as-of, snapshot/input hash, engine/rule/policy version, authority,
availability, provenance ve diagnostic bilgisi taşır. Sub-bucket/source trace restricted
diagnostic yüzeyinde kalır; raw lineage/PII public contract'a sızamaz.

```text
availability = AVAILABLE | UNAVAILABLE | NOT_COMPARABLE | STALE | FAIL_CLOSED
authority    = SHADOW_ONLY | CANONICAL | LEGACY_COMPATIBILITY
current      = SHADOW_ONLY
```

**REC-ALLOC-011 — LegalApplication persistence tek-yazıcı cross-domain boundary'dir.**

Receivable canonical bucket semantiği ile TBK100 application policy'sinin; Collection receipt
lifecycle ve yetkili transaction içindeki deterministic execution orchestration'ının
sahibidir. Target `LegalApplication` persistence tek bir logical writer ve tek bir canonical
authority taşımak zorundadır. Permanent dual-write, iki domainin bağımsız application fact'i
yazması veya legacy cache/projection'ın fallback authority olması yasaktır.

XD-001 fiziksel persistence modelini seçmezdi. Sonraki TPA-02 owner kararı bağımsız
`LegalApplicationBatch` aggregate'ini, tek logical writer'ı ve transaction/replay/reversal
sınırlarını `REC-ALLOC-012` ile ratifiye eder. Bu seçim schema, migration, writer,
consumer cutover veya retirement yetkisi üretmez.

**REC-ALLOC-012 — LegalApplicationBatch target persistence aggregate'idir.**

`LegalApplicationBatch`, immutable `LegalApplication` bucket-effect fact'lerini ve yalnız
lineage/provenance taşıyan non-authoritative `ApplicationAttribution` fact'lerini kapsar.
Aggregate'ın tek logical writer'ı `LegalApplicationWriter`dır ve yalnız canonical Collection
transaction'ı içinde mevcut transaction client ile çağrılır. Bağımsız endpoint, ayrı/nested
transaction veya ikinci allocator authority yasaktır.

Her `APPLY` batch'i tam olarak bir Collection receipt'ine karşılık gelir ve
`receiptAmountMinor = Σ appliedAmountMinor + heldRemainderMinor` exact-cent conservation'ını
sağlar. Replay authority `tenantId + idempotencyKey + commandHash`tır: aynı key/hash mevcut
batch'i side-effect üretmeden döndürür; aynı key/farklı hash fail-closed conflict'tir.
Full reversal linked append-only `REVERSAL` batch'idir; mevcut batch/application
`UPDATE`/`DELETE` edilemez. Partial reversal ayrı owner gate'idir. Tenant-safe composite FK,
`ON DELETE RESTRICT`, no historical guessing ve no silent backfill zorunludur.

**REC-ALLOC-013 — TPA-03 Option B additive schema-foundation kontratıdır.**

Foundation şu canonical adları kullanır:

```text
LegalApplicationBatch
LegalApplication
ApplicationAttribution

LegalApplicationBatchType:
  APPLY | REVERSAL

LegalApplicationComponentType:
  COST | ANCILLARY | ACCRUED_INTEREST | PRINCIPAL
```

Implementation exact scope'u yalnız `schema.prisma` ve tek additive `migration.sql` dosyasıdır.
Foundation writer-free, no-backfill ve mevcut runtime/consumer davranışına etkisizdir.
Tenant-safe composite FK, `ON DELETE RESTRICT` ve batch/application `UPDATE`/`DELETE`
immutability protection zorunludur.

Tüm amount alanları positive minor-unit magnitude taşır; yön batch type'tan gelir.
`receiptAmountMinor`, APPLY için canonical Collection receipt magnitude'ı, REVERSAL için linked
original receipt magnitude'ıdır. Canonical conservation
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` olarak korunur; foundation
patch'i aggregate-level constraint/writer enforcement'ı sonraki owner-gated writer aşamasına
bırakır.

Replay unique sınırı `(tenantId, idempotencyKey)`dir. Aynı key + aynı `commandHash` existing
batch/no new write, aynı key + farklı hash fail-closed conflict'tir. Full reversal linked
append-only REVERSAL batch'idir; self-reversal ve double reversal yasaktır. Partial reversal
yetkili değildir.

`bucketContextKey` ve `bucketInstanceId` required/opaque/nonblank'tir; generation algoritması
writer-stage kontratına bırakılır. `ApplicationAttribution` non-authoritative'tir; ClaimItem
ilişkisi yalnız optional lineage ve attributed amount optional olabilir.

**REC-ALLOC-014 — TPA-03A schema foundation evidence'ı canonicaldır.**

Implementation PR #1449 / squash `63f0b0ea2cbef3f5d106ae3dfd8be6b770b5229f`,
`schema.prisma` ile tek additive
`20260720174245_legal_application_batch_foundation/migration.sql` dosyasını değiştirmiştir.
`LegalApplicationBatch`, `LegalApplication` ve `ApplicationAttribution`; tenant-safe composite
FK, `ON DELETE RESTRICT`, tenant replay uniqueness, linked full-reversal row guards,
required/nonblank bucket identity, positive minor-unit checks ve altı UPDATE/DELETE immutable
trigger'ı ile additive olarak kurulmuştur. Existing data backfill edilmemiş; runtime writer,
feature flag, test, consumer veya legacy reader/writer değişikliği yapılmamıştır.

Aggregate exact-cent conservation enforcement ve bucket key generation
`LegalApplicationWriter` contract aşamasına deferred'dır. ACT-28 ve REC-AUTH-011/012 `OPEN`;
target authority `SHADOW_ONLY`; representative replay/evidence, consumer cutover ve retirement
yetkisizdir.

**REC-ALLOC-015 — TPA-04 Option C target-native dormant single-writer kontratıdır.**

`LegalApplicationWriter` yalnız official canonical Receivable snapshot ve Receivable-owned
target-native `LegalApplicationPlan` tüketir. Writer TBK100 policy hesaplamaz; ClaimItem,
`ClaimItem.collectedAmount`, `LedgerAllocation` veya `CollectionAllocation` üzerinden hedef
plan üretmez. ClaimItem application target değildir ve bucket identity ClaimItem ID'den
üretilemez.

Writer yalnız canonical Collection outer transaction'ı içinde existing Prisma transaction client
ile çağrılır; independent endpoint, nested transaction, second writer ve production Collection
wiring yetkisizdir. Legacy-derived target, production shadow persistence, dual authority ve
long-lived dual-write yasaktır.

Official snapshot zorunludur; `authority=NONE`, `snapshotAvailable=false`, unavailable/stale
snapshot ve unmapped component fail-closed'dur ve HELD'e çevrilemez. `bucketContextKey` stable
legal context, `bucketInstanceId` snapshot-specific identity'dir; ikisi versioned canonical
serialization + SHA-256 ile üretilir.

Tüm tutarlar batch boyunca aynı currency/minor-unit sözleşmesinde `bigint` minor-unit'tir.
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` aggregate invariant'ı DB'de
writer'dan önce ayrı owner-gated schema amendment ile enforce edilmelidir. Replay
`tenantId + idempotencyKey + commandHash` ile fail-closed'dur; farklı idempotency key ile aynı
Collection'a ikinci APPLY yasaktır.

APPLY tek Collection receipt'i ve target-native plan içindir; ClaimItem-keyed allocation veya
`collectedAmount` mutation yoktur. Full reversal ayrı owner-gated linked append-only REVERSAL,
same-case advisory lock ve exact inverse gerektirir; partial reversal yetkisizdir. Audit
transaction-bound/allowlist-only; replay side-effect-free'dir. Existing PAYMENT event chain'i
korunur; public LEGAL_APPLICATION event kontratı ayrı owner gate'idir.

Legacy runtime cutover'a kadar geçici authority'dir fakat yeni legacy reader/writer açılamaz.
Synthetic ClaimItem-grain corpus target writer için superseded legacy evidence ve
writer/evidence/cutover blocker'ıdır. PR #407 hold/untouched; ACT-28 ve REC-AUTH-011/012 open
kalır. TPA-04A..TPA-04G sıralı successor'ların her biri ayrı owner GO gerektirir.

**REC-ALLOC-016 — TPA-04A receipt-bound canonical snapshot ve bucket identity kontratıdır.**

`CanonicalReceivableApplicationSnapshotV1`, tek canonical Collection receipt'i için
Receivable-owned `LegalApplicationPlan` üretmeye özgü immutable snapshot envelope'udur.
Snapshot owner Receivable; envelope persistence owner RCV-COL Legal Application Boundary'dir ve
fiziksel yer `LegalApplicationBatch` aggregate'idir. General presentation, Fee/Harç, Journal,
consumer authority ve broader snapshot lifecycle kapsam dışıdır.

Eligibility şu koşulların tamamını ister:

- trusted tenant, case, target Collection ve currency aynı authoritative context'te olmalıdır;
- receipt canonical admission/idempotency/finality gate'lerini geçmiş olmalıdır;
- target receipt, pre-application history ve bucket balance'larına dahil edilemez;
- `applicationEffectiveDate` yalnız COL/OD-03 authority'sinden gelir;
- `confirmedAt`, `valueDate`, `externalSettledAt` ve benzeri tarihler provenance/lifecycle'dır;
- source/version set tam ve hash'lenebilir; engine, calculation rule, policy, rate table,
  interpretation profile ve bucket identity version explicit'tir;
- COST ve ANCILLARY dahil bütün canonical component'ler completeness sonucuna sahiptir;
- historical input target-native veya ayrı owner-approved baseline'dır; tahmin/backfill yoktur;
- bütün okuma tek transaction-consistent as-of context'ten gelir.

Envelope alanları:

```text
contractVersion
serializationVersion
tenantId
caseId
targetCollectionId
currency
minorUnit
receiptAmountMinor
asOfDate
applicationEffectiveDate
historyBoundaryRef
engineVersion
calculationRuleVersion
policyVersion
rateTableVersion
interpretationProfileId
bucketIdentityVersion
sourceVersionSet
sourceVersionSetHash
canonicalBuckets
```

`minorUnit` zorunlu semantik girdidir; repository genelinde `2` sabitlenemez. Writer aşaması
currency/minor-unit uyumunu fail-closed doğrular. `snapshotHash`, `"RCV-CAS/v1\0"` domain
separator'ı ile canonical semantic snapshot bytes üzerinde SHA-256; `snapshotRef`,
`rcv-app-snapshot:v1:sha256:<64-lowercase-hex>` biçimindedir. Hash input'u generatedAt, actor,
correlation, display/free text, raw bank/provider payload, IBAN veya açıklama içermez.

Canonical serialization `RCV-CAS/v1` ve RFC 8785 temelli domain-restricted JSON'dır:
UTF-8/no-BOM, Unicode NFC, locale-independent key/order, minor-unit integer string, no float,
ISO `YYYY-MM-DD` date, explicit null/absent ve versioned list-order kuralları zorunludur.
Application sırası `component order → priorityRank → bucketContextKey byte order`dır.

`bucketContextKey = bctx:v1:sha256:<64-lowercase-hex>` ve yalnız şu canonical girdileri
kullanır:

```text
componentType
componentCode
currency
minorUnit
legalBasisRef / version
effective context
interest rule / version
priority policy / version / rank
liability context
```

ClaimItem ID, tenantId/caseId, snapshotRef, target Collection ID, amount, sequence, actor,
display label ve database insertion order context key için yasaktır.

`bucketInstanceId = binst:v1:sha256:<64-lowercase-hex>` ve yalnız şu canonical girdileri
kullanır:

```text
identityContractVersion
tenantId
caseId
snapshotRef / snapshotHash
asOfDate
calculationRuleVersion
bucketContextKey
```

Context key aynı hukuki bucket için snapshot'lar arasında stable kalabilir; instance ID snapshot
değişince değişir. Collision, unsafe ordering, Unicode/date/minor-unit normalization veya unknown
version fail-closed'dur.

Typed fail-closed sonuç kümesi:

```text
SOURCE_VERSION_INCOMPLETE
FORMATION_CONTEXT_INCOMPLETE
POLICY_VERSION_MISSING
FEE_AUTHORITY_UNRESOLVED
BUCKET_CONTEXT_UNMAPPED
CURRENCY_OR_MINOR_UNIT_INVALID
HISTORY_BOUNDARY_UNAUTHORIZED
DUPLICATE_BUCKET_CONTEXT
SNAPSHOT_STALE
HASH_MISMATCH
SOURCE_CONCURRENCY_UNSAFE
```

`LegalApplicationPlan` pure Receivable output'udur; typed canonical bucket application'ları,
`bigint` minor-unit applied amounts ve HELD remainder taşır. ClaimItem target, legacy
`LedgerAllocation`, `CollectionAllocation` veya `collectedAmount` input'u yoktur. Plan,
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` sağlanmadan üretilemez.

TPA-04B owner kararı; snapshot contract/serialization version, snapshotRef/hash, canonical
snapshot payload, sourceVersionSetHash, asOfDate/applicationEffectiveDate, history boundary,
engine/rule/policy/rate/interpretation versions, bucket identity version, minorUnit,
componentCode, sourceLineageSetRef ve bucket before/after minor-unit state ile deferred aggregate
conservation enforcement'ını required-evidence amendment kontratı olarak ratifiye eder.
Schema/migration implementation, snapshot/hash implementation, writer, plan builder, production
shadow, replay evidence, consumer cutover ve retirement bu ratifikasyonla yetkilendirilmez.

**REC-ALLOC-017 — TPA-04B required-evidence schema amendment contract'ıdır.**

Future exact two-file amendment, TPA-04A evidence envelope'ını `LegalApplicationBatch` ve
bucket arithmetic evidence'ını `LegalApplication` üzerinde required/default-free/no-backfill
alanlar olarak persist eder. `ApplicationAttribution` değişmez ve non-authoritative kalır.
`snapshotCanonicalPayload` exact canonical bytes için PostgreSQL `TEXT`tir; JSONB storage
yasaktır. Foundation tabloları doluysa migration lock sonrasında fail-closed durur; nullable
transition ve guessed history yasaktır.

Snapshot contract/serialization/ref/hash, source-version hash, as-of/effective/history context,
engine/rule/policy/rate/interpretation, bucket identity version ve minorUnit kanıtı zorunludur.
Identity formatları TPA-04A ile exact uyumludur; hashes 64 lowercase hexadecimal, reference ve
version alanları trimmed/nonblank'dir. `minorUnit` evrensel `2` değildir. Aynı batch içinde
`bucketContextKey` ve `bucketInstanceId` ayrı ayrı unique'dir; snapshot ref/hash global veya
tenant unique değildir.

DB aggregate conservation ve satır aritmetiğini enforce eder:

```text
receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor
APPLY:    bucketBeforeMinor - bucketAfterMinor = appliedAmountMinor
REVERSAL: bucketAfterMinor - bucketBeforeMinor = appliedAmountMinor
```

Zero-application/full-HELD batch geçerlidir. DB syntax/unique-key, format ve arithmetic
kontrollerini yapar; canonical serialization/hash recomputation writer-stage sorumluluğudur.
Full reversal exact-inverse TPA-04E'ye deferred'dır. Bu contract implementation, runtime writer,
plan builder, replay, cutover veya retirement yetkisi üretmez; successor yalnız
`TPA-04B-ENTRY — OWNER GO-VERIFY REQUIRED`dır.

`AVAILABLE`, authority promotion anlamına gelmez. Legacy field'lar breaking rename olmadan
korunur; deprecation yalnız explicit cutover gate'iyle tamamlanır. Shadow projection normal
kullanıcı primary display'ına açılamaz; restricted diagnostic olarak kalır.

## 9.3. TBK101/102 sınırı

TBK101/102 standart manuel workflow'da otomatik dosyalar-arası allocator değildir.

Sistem:

- uyarabilir,
- dekont açıklamasını kontrol edebilir,
- başka dosyayı önerebilir,
- audit kaydı oluşturabilir.

Sistem:

- ödemeyi sessizce başka dosyaya taşıyamaz,
- global debtor pool'dan otomatik dağıtım yapamaz.

---

# 10. Faiz ve kısmi ödeme anayasası

## 10.1. Faiz tabanı

```text
Future interest base
= previous outstanding principal
- principalAllocatedAmount
```

**REC-INT-001 — Principal allocation yoksa gelecekteki faiz tabanı değişmez.**

**REC-INT-002 — Principal allocation varsa faiz tabanı yalnız principal'a tahsis edilen tutar kadar ve tahsis tarihinden sonrası için azalır.**

## 10.2. İşlemiş faiz ve pre/post dönem

- Takip tarihine kadar işlemiş ve tutarı belirli faiz `ACCRUED_INTEREST` sabit hukuki
  borç bucket'ıdır.
- Takipten sonra işleyecek faiz `InterestPolicy` / calculation rule'dur; sabit tutarlı
  ClaimItem veya legal-application target'ı olarak modellenmez.
- Takip sonrası as-of tarihine kadar policy ile deterministik hesaplanmış faiz,
  `InterestPolicy` ve period/rule context'ine bağlı calculation sub-bucket exposure'ıdır;
  source ClaimItem değildir. As-of sonrasındaki henüz işlememiş faiz yalnız policy'dir ve
  monetary exposure olarak gösterilemez.
- Pre-enforcement ve post-enforcement accrued-interest sonuçları ayrı gross/applied/remaining
  bileşenler olarak reconcile edilir.
- Faize faiz yalnız açık hukuki dayanak ve ratifiye policy varsa uygulanabilir.
- Faiz segmentleri tarih aralıklarına ayrılmalıdır.
- Takip öncesi ve takip sonrası faiz ayrımı policy/ADR ile tanımlıysa deterministic uygulanmalıdır.
- Aynı gün olaylarında tie-breaker açık olmalıdır.
- Timezone ve date cutoff belirsiz bırakılamaz.

## 10.3. Trace

Her allocation ve faiz segmenti en az şu bilgileri taşıyabilmelidir:

```text
source claim item
period
rate/policy reference
base
amount
payment event
allocation category
principal touched?
rounding/precision basis
```

Trace açıklama evidence'ıdır; financial event veya official snapshot değildir.

---

# 11. Reversal / refund / cancellation sınırı

Bu bölüm `SYS-FIN-009`un valid linked full-reversal için ADR-014 ile kanıtlanmış dar
receivable uygulamasıdır; detailed/partial reversal owner gate'i kapanmış sayılmaz.

## 11.1. Ratifiye full reversal invariantı

> Geçerli biçimde linklenmiş tam reversal, bağlandığı payment'ın canonical legal etkisini net-zero yapar.

```text
Payment + valid linked full reversal = zero net canonical legal effect
```

## 11.2. Fail-closed

- bağlantısız reversal,
- malformed relation,
- duplicate reversal,
- currency uyumsuzluğu

resmi hesapta sessizce uygulanamaz.

## 11.3. Bu invariant kapsamında olmayanlar

```text
partial reversal
partial refund
inferred matching
historical repair
cross-case compensation
```

Bunlar ayrıca ratifiye edilmedikçe otomatik uygulanamaz.

---

# 12. Döviz ve currency anayasası

## 12.1. CURRENT / ratifiye sınır

Mevcut canonical sınır:

```text
currency isolation
mismatch fail-closed
cross-currency conversion yok
yeni FX authority yok
```

**REC-FX-001 — Aynı currency bucket içinde olmayan payment/claim sessizce netlenemez.**

**REC-FX-002 — Yetkili FX contract olmadan conversion yoktur.**

## 12.2. TARGET / owner-gated

Stable invariant şudur:

> Production-grade cross-currency calculation veya conversion, açık owner/legal kararıyla
> ratifiye edilmiş FX authority contract olmadan üretilemez.

Gelecekteki observation alanları, hash kapsamı, source/date/type/value modeli ve frozen-state
lifecycle'ı bu belgeyle ratifiye edilmez. Aday ayrıntılar Appendix A'da non-normative olarak
tutulur. Bu hedef mevcut implementation tamamlanmış gibi raporlanamaz.

---

# 13. Fee / harç sınırı

## 13.1. Kaynak sınıfları

Her fee/harç kuralı şu sınıflardan birine aittir:

```text
STATUTORY_CONSTANT
ANNUAL_TARIFF
CONTRACTUAL
MANUAL_LEGAL_DECISION
CASE_STATE_CALCULATED
```

Bu sınıflar birbirinin yerine kullanılamaz.

## 13.2. Otorite ayrımı

```text
Fee Calculation Authority
≠ Fee Projection Ownership / Derived Read Contract
≠ Fee Persistence Authority
≠ Fee Presentation Authority
```

## 13.3. Bağlayıcı hükümler

**REC-FEE-001 — Fee/harç hesabı receivable core içine gizlice gömülemez.**

**REC-FEE-002 — UI, controller veya report içinde bağımsız tarife/formül bulunamaz.**

**REC-FEE-003 — Eksik hukuki/tarife veri sessiz `0`, `{}` veya varsayılan üretmez.**

**REC-FEE-004 — Legacy fee fallback canonical authority değildir.**

**REC-FEE-005 — ADR-013 ratifiye edilmeden proposed fee policy production authority olamaz.**

## 13.4. Bu belgede ratifiye edilmeyen özel politikalar

Bu belgenin stable gövdesi şu spesifik kararları tek başına ratifiye etmez:

- peşin harç floor/minimum,
- tahsil harcı stage/rate matrisi,
- cezaevi harcı base ve liable party,
- yıllık opening fee rakamları,
- exact attorney-fee tariff.

Bunlar ilgili source contract/ADR altında ratifiye edilmelidir.

---

# 14. Journal / Trace / Snapshot ayrımı

```text
Accounting Journal = ne oldu?
Calculation Trace  = nasıl hesaplandı?
Balance Snapshot   = belirli input/policy/version ile ne sonuç çıktı?
```

## 14.1. Journal

- `SYS-FIN-001`, `SYS-FIN-006` ve `SYS-FIN-010` receivable sınırında uygulanır.
- Finansal event persistence'ıdır; legal balance formülünün owner'ı değildir.
- Additive accounting hardening, receivable cutover sınırını değiştirmediği sürece paralel ilerleyebilir.

## 14.2. Trace

- Explainability evidence'ıdır.
- Payment, journal veya official snapshot authority'si değildir.

## 14.3. Non-official snapshot

- Request-time veya non-persisted evidence olabilir.
- `authority:NONE`, `persisted:false` veya eşdeğer statüdeyse official değildir.

## 14.4. Official snapshot hedefi

Stable invariant şudur:

> Yalnız TPA-04A ile ratifiye edilmiş receipt-bound
> `CanonicalReceivableApplicationSnapshotV1`, LegalApplication plan/writer girdisi için
> official snapshot alt türüdür. Daha geniş presentation, Fee/Harç, Journal ve consumer
> snapshot lifecycle'ı ADR-013 altında açık kalır ve production authority üretmez.

Bu dar alt türün eligibility, envelope, serialization/hash ve bucket identity sözleşmesi
`REC-ALLOC-016` ile canonicaldır. Runtime writer, persistence amendment, production shadow,
consumer authority ve cutover ayrıca owner-gated'dir.

---

# 15. Presentation ve API anayasası

## 15.1. Tek canonical contract

Production cutover sonrasında:

```text
Canonical legal balance
+ authorized fee projection
+ FX summary
+ warnings/blockers
+ trace reference
→ Canonical DTO
→ API / UI / Report / Document
```

## 15.2. Yasaklar

```text
UI hesap yapamaz.
Report ayrı formül üretemez.
Template ayrı bakiye üretemez.
Controller tarife tablosu taşıyamaz.
Frontend oran uygulayamaz.
```

## 15.3. Pre-cutover sınır

Compatibility adapter veya canonical shadow alanının bulunması, production presentation authority'nin canonical olduğu anlamına gelmez.

**REC-PRES-001 — Adapter hazır ≠ consumer switch yetkili.**

---

# 16. Integration ve NEVER_AUTO kuralları

## 16.1. UYAP

Bu ayrım `SYS-ID-004`, `SYS-LEGAL-002` ve canonical UYAP evidence/mapping gate'leriyle
birlikte uygulanır.

### 16.1.1. UYAP Source Fact

UYAP adapter'dan gelen source fact:

- provenance/evidence taşıyan harici input'tur,
- doğrulanmadan canonical legal truth değildir,
- legal balance hesaplamaz,
- domain confirmation ve reconciliation gerektirir.

### 16.1.2. UYAP Mapping Policy

UYAP mapping policy:

- source fact'ten ayrı bir authority'dir,
- owner/legal-approved exact mapping contract gerektirir,
- belirsiz, unknown veya ambiguous mapping'i tahmin etmez,
- PR-A4 exact-mapping gate'i kapanmadan production authority olamaz.

Numeric UYAP activation policy:

- preview, download ve case-bazlı submit aynı projection authority'yi kullanır,
- endpoint'e özgü ikinci mapper veya duplicate canonical projection authority oluşturulmaz,
- legacy-only yol strict compatibility ile sınırlıdır,
- unknown, ambiguous veya unverified projection fail-closed olur; silent fallback yasaktır,
- runtime consumer activation ile submit payload değişikliği ayrı explicit owner authorization gerektirir,
- runtime activation cutover değildir; production evidence ve cutover gate'leri ayrı kalır,
- policy veya adapter varlığı `VERIFIED_OFFICIAL` statüsü üretmez.

## 16.2. Banka

Bank adapter:

- receipt candidate üretir,
- kullanıcı/onay olmadan dosyaya tahsis yapmaz,
- otomatik cross-case allocation yapmaz.

## 16.3. AI / Risk

Bu bölüm `SYS-AI-001`, `SYS-AI-002`, `SYS-AI-004` ve `SYS-AI-008` hükümlerinin
receivable-domain uygulamasıdır.

AI/risk çıktısı:

- advisory'dir,
- kaynak/evidence göstermelidir,
- hukuki veya finansal authority olamaz,
- cross-tenant debtor intelligence üretemez.

## 16.4. NEVER_AUTO listesi

Aşağıdakiler otomatik ve sessiz yapılamaz:

```text
ClaimItem → Due reverse synchronization
unknown mapping tahmini
unsupported FX conversion
partial reversal/refund inference
unmatched payment auto-allocation
cross-tenant aggregation
source'suz oran üretme
official snapshot yaratma
consumer cutover
legacy deletion
```

---

# 17. Determinizm, hassasiyet ve test invariantları

Bu bölüm `SYS-FIN-007`, `SYS-SOT-007`, `SYS-COMP-003`, `SYS-COMP-004` ve
`SYS-COMP-005` hükümlerinin receivable-specific test ve hesaplama uygulamasıdır.

## 17.1. Matematiksel invariantlar

```text
Same authorized inputs + same policy/rate versions → same result
```

Asgari kurallar:

1. Para hesabı float authority ile yürütülmez; minor-unit/decimal normalization kullanılır.
2. Same-day ordering deterministic olmalıdır.
3. Timezone/date cutoff açık olmalıdır.
4. Negative payment reddedilmelidir.
5. Overpayment principal/interest bucket'larını bozmaz.
6. Currency mismatch fail-closed'dur.
7. Full reversal yalnız valid link ile net-zero'dur.
8. UI/API/report aynı yetkili contract'ı tüketmelidir.

## 17.2. Test sınıfları

```text
Unit invariants
Property/edge tests
Golden legal fixtures
Integration tests
Disposable DB tests
Shadow/diff diagnostics
Production empirical evidence
```

**REC-TEST-001 — Golden fixture production evidence değildir.**

**REC-TEST-002 — Scratchpad doğrulaması kalıcı regression test yerine geçmez.**

**REC-TEST-003 — Bir test behavior contract'ı mı, characterization mı açıkça belirtilmelidir.**

---

# 18. CURRENT / TARGET / OUT-OF-SCOPE ayrımı

## 18.1. CURRENT CANONICAL

- ADR-014'ün tanımlı pre-cutover W0–PR-10 zinciri kendi sınırları içinde CLOSED/CANONICAL'dır.
- Trace/non-official snapshot evidence mevcuttur.
- Golden fixture matrisi mevcuttur.
- Additive compatibility adapter mevcuttur.

## 18.2. CURRENT LEGACY / COMPATIBILITY

- Production consumer cutover yapılmadığı sürece legacy consumer primary kalabilir.
- Compatibility alanları yalnız açık sınıflandırmayla tutulabilir.
- Legacy primary'nin aktif olması canonical core'ın varlığını geçersiz kılmaz; fakat cutover tamamlandı anlamına gelmez.
- ClaimItem-keyed `LedgerAllocation` current AS-IS/legacy persistence'tır; target
  legal-application authority değildir.
- `CollectionAllocation` compatibility projection only'dir ve legal fallback authority değildir.
- `ClaimItem.collectedAmount` deprecated/non-authoritative derived cache'tir; yeni consumer açılamaz.

## 18.3. TARGET / OWNER-GATED

```text
canonical consumer switch
legacy fallback disable
shadow cleanup
legacy quarantine/deletion
official snapshot lifecycle
frozen FX observation
exact UYAP mapping
fee/harç authority tamamlaması
production empirical evidence
LegalCalculationBucket target persistence design
LegalApplication / ApplicationAttribution persistence separation
TPA-02 single-writer physical persistence owner/aggregate analysis
```

## 18.4. OUT-OF-SCOPE / FUTURE

```text
partial reversal/refund model
full PAC aggregate/state/event/concurrency programı
bank import auto-matching
cross-file allocator
konkordato/iflas geniş kapsamı
```

**REC-INV-006 — “Canonical” sözcüğü scope dışına taşırılamaz.**
Pre-cutover core kapanışı; genel calculation completeness, production readiness, consumer cutover, fee completion veya bütün receivable lifecycle'ının tamamlandığı anlamına gelmez.

---

# 19. ADR sınırları ve terminoloji

## 19.1. ADR-014

Canonical legal calculation pre-cutover core, trace, fixtures ve additive compatibility adapter sınırını yönetir.

## 19.2. ADR-013

Fee / harç / snapshot programıdır. `DRAFT / OWNER REVIEW` olduğu sürece proposed kararlar implementation authority değildir.

## 19.3. ADR-010

Accounting Journal SoT yönünü yönetir. Additive journal hardening otomatik olarak ADR-014 cutover sonrasına ertelenmez; receivable authority/cutover sınırını değiştiren işler gated'dir.

## 19.4. Güncel terminoloji

```text
CCB-001 → tarihsel/master-stream kimliği
ADR-014 → güncel canonical legal calculation programı
ADR-013 → fee/harç/snapshot programı
ADR-010 → journal SoT programı
PAC-001-A → dar authority-map çalışması
PAC-Full → henüz tanımlanmamış gelecek program
```

Yanlış/stale kullanımlar:

```text
ADR-012 = CCB/Fee
ADR012-FEE
REL-001 bağımsız epic
PAC-001-A = full product constitution
```

---

# 20. Canonical consumer cutover anayasası

Bu bölüm `SYS-MIG-001`, `SYS-MIG-006`, `SYS-MIG-007`, `SYS-MIG-009` ve `SYS-SOT-006`
hükümlerini ADR-014 consumer cutover sırasına uygular.

```text
Canonical core ready
≠ adapter ready
≠ consumer switch authorized
≠ production accepted
≠ legacy removable
```

## 20.1. Cutover öncesi zorunlu kanıt

### REC-CUTOVER-101 — Repository/provenance

- canonical `main` doğrulanmış,
- branch/HEAD/remote/tracking açık,
- çalışma ağacı temiz veya sahipliği açıklanmış,
- migration/schema/package/lock etkisi raporlanmış olmalıdır.

### REC-CUTOVER-102 — Technical evidence

- ADR-014 pre-cutover zinciri scope'unda closed,
- golden fixtures PASS,
- representative integration/disposable DB tests PASS,
- compatibility adapter fail-closed,
- PR-11 sırasında fallback varsa açık, observable, policy-defined ve audit edilebilir;
  sessiz legacy substitution yoktur. Fallback'ın tamamen kaldırılması PR-12 kapsamıdır.

### REC-CUTOVER-103 — Legal/mapping evidence

- desteklenen mapping kapsamı açık,
- unknown mapping fail-closed,
- exact UYAP mapping blocker'ları ayrılmış,
- production evidence yoksa açıkça belirtilmiş.

### REC-CUTOVER-104 — Operational evidence

- feature flag owner,
- monitoring/log source,
- rollback runbook,
- incident owner,
- acceptance threshold,
- pilot scope,
- bake duration.

## 20.2. Owner karar formu

Yalnız şu verdict'lerden biri verilebilir:

```text
GO-PR-11
NO-GO
MORE-EVIDENCE-REQUIRED
```

GO için doldurulacak alanlar:

```text
Pilot scope
Start condition
Acceptance thresholds
Monitoring owner
Rollback owner
Rollback trigger
Maximum tolerated discrepancy
Bake duration
Audit/signoff authority
Legacy fallback policy
Production evidence status
Known exclusions
```

## 20.3. Uygulama sırası

```text
PR-11 — Consumer switch
↓
Bake / monitoring / acceptance
↓
PR-12 — Legacy fallback disable
↓
PR-13 — Shadow/diagnostic cleanup
↓
PR-14 — Legacy quarantine/deletion
```

Her PR ayrı scope, CI/validation ve register kapanışına sahiptir. Canonical split-plan ile
uyumlu owner gate dağılımı:

```text
PR-11 → owner gate REQUIRED
PR-12 → owner gate REQUIRED
PR-13 → canonical scope genişlemedikçe additional owner gate YOK
PR-14 → owner gate REQUIRED
```

Bu dağılım hard-coded yeni policy üretmez; canonical split-plan değişirse bu belge açık
governance reconciliation ile güncellenir.

## 20.4. PR-11 sınırı

İzin verilen:

- mevcut adapter'ın yetkili consumer tarafından kullanılması,
- kontrollü feature flag,
- açık rollback,
- diagnostic evidence'in korunması.

Yasak:

- legacy silme,
- fallback disable,
- fee/harç scope ekleme,
- journal/snapshot authority değiştirme,
- unknown mapping tahmini.

## 20.5. Bake ve acceptance

İzlenecek başlıca sınıflar:

```text
total balance
principal
interest
collection allocation
reversal
currency
cost/attorney-fee data gap
unknown mapping
fail-closed/error counts
```

Synthetic PASS tek başına production acceptance değildir.

## 20.6. PR-12

Yalnız:

- PR-11 acceptance tamam,
- rollback doğrulanmış,
- canonical availability yeterli,
- unexplained blocker yok,
- owner ayrı GO vermişse

fallback disable yapılabilir.

## 20.7. PR-13

Yalnız operasyonel değeri kalmayan diagnostic yüzey temizlenir. Golden fixtures, migration reference ve audit evidence korunabilir.

## 20.8. PR-14

Legacy quarantine/deletion ancak:

- classification,
- zero production caller,
- replacement parity,
- bake tamamlanması,
- rollback ihtiyacının kalkması,
- owner GO

ile yapılabilir.

## 20.9. Rollback

Rollback:

- veri kaybı üretmez,
- canonical write'ı legacy formatına tahminle çeviremez,
- feature flag/consumer routing seviyesinde tanımlanır,
- journal/collection fact'lerini geri yazmaz,
- incident/divergence evidence'i silmez.

---

# 21. Legacy sınıflandırma ve silme sırası

| Sınıf | İzin verilen aksiyon |
|---|---|
| `LEGACY_PRODUCTION_AUTHORITY` | Cutover ile devreden çıkarılır; yeni kullanım yasak |
| `COMPATIBILITY_WRAPPER` | Canonical'a yönlendirilmiş, süreli tutulabilir |
| `MIGRATION_REFERENCE` | Quarantine/reference alanında tutulabilir |
| `GOLDEN_FIXTURE_SOURCE` | Test fixture kaynağı olarak korunabilir |
| `DIAGNOSTIC_DIFF_ONLY` | Cutover/bake sonuna kadar read-only tutulabilir |
| `DUPLICATE_FORMULA` | Tek authority'ye taşınmadan silinemez |
| `UNSAFE_FALLBACK` | Fail-closed yapılır veya kaldırılır |
| `DEAD_CODE_CANDIDATE` | Call-site/evidence doğrulaması sonrası silinebilir |

**REC-LEGACY-001 — Classification-first, deletion-last.**

**REC-LEGACY-002 — Compatibility wrapper bağımsız hesap yapamaz.**

**REC-LEGACY-003 — Legacy silme, rollback kapasitesi veya audit evidence'i erken yok edemez.**

---

# 22. Repository / provenance ve kapanış protokolü

## 22.1. Büyük faz öncesi preflight

Execution preflight `AGENTS.md`, repository policy ve `SYS-GOV-005` uyarınca yapılır.
Receivable görevinde bunlara ek olarak ilgili ClaimItem/Due/Collection authority satırı,
ADR-010/013/014 gate'i, test database güvenliği ve concurrent PR/worktree ownership
doğrulanır. Yanlış branch veya belirsiz provenance durumunda kod yazılmaz.

## 22.2. Durum zinciri

`SYS-COMP-002`, `SYS-CAN-001` ve `SYS-CAN-005` uygulanır.
`IMPLEMENTED`, `VERIFIED`, `MERGED`, `CANONICAL`, `CLOSED`, `CUTOVER_READY` ve
`RELEASED` ayrı statülerdir; receivable evidence olmadan bir üst statü kullanılamaz.

## 22.3. Kapanış zinciri

Receivable closure `SYS-CAN-005`, `SYS-CAN-006` ve `SYS-CAN-007` uyarınca PR/commit,
CI, mergeability, canonical-main sync, scope, cleanup, açık gate ve Master Register
kanıtını birlikte doğrular. `Master Register yap` kapanış kuralı korunur.

## 22.4. Active waiting

Harici blocker davranışı `AGENTS.md` ve ADR-012 Waiting & Progress Policy'den okunur.
Blocker, receivable task scope'unu veya mutation authority'sini genişletmez.

## 22.5. No code during audit

Audit/verification görevi açık task-specific implementation GO almadıkça mutation üretmez.
Bu execution hükmünün canonical kaynağı `AGENTS.md`dir; bu belge ek yetki vermez.

---

# 23. Değişiklik, istisna ve ratifikasyon kuralları

## 23.1. Invariant değişikliği

Bir `REC-GOV-*`, `REC-INV-*`, `REC-AUTH-*`, `REC-BOUNDARY-*`, `REC-WRITE-*`,
`REC-ALLOC-*`, `REC-INT-*`, `REC-FX-*`, `REC-FEE-*`, `REC-PRES-*`, `REC-TEST-*`,
`REC-CUTOVER-*` veya `REC-LEGACY-*` maddesi şu zincir olmadan değiştirilemez:

Bu zincir `SYS-CAN-003`, `SYS-CAN-004` ve `SYS-CAN-009` hükümlerinin receivable-domain
uygulamasıdır:

```text
hukuki/ürün impact analizi
→ owner-hukuk review
→ ilgili ADR/contract kararı
→ backward-compatibility/migration analizi
→ test/evidence planı
→ Decision Log
→ register etkisi
→ governance PR
→ owner merge/ratification
```

## 23.2. Emergency hotfix / REGULARIZE

Acil hotfix ve operational exception için `SYS-COMP-006`, `SYS-COMP-007` ve geçerli
execution policy uygulanır. Governance'dan önce yapılmışsa:

1. kapsam dar tutulur,
2. no-broad-refactor kuralı uygulanır,
3. test/evidence alınır,
4. sonrasında açıkça `REGULARIZE` protokolüyle Decision Log ve register güncellenir.

Emergency hotfix, anayasal değişiklik sayılmaz.

## 23.3. Ratifikasyon statüleri

```text
PROPOSED
OWNER REVIEW
REVISIONS REQUIRED
RATIFIED
SUPERSEDED
VOID
```

Header, Decision Log ve Governance Index statüleri birbiriyle tutarlı olmalıdır.

## 23.4. RCV-P2-WS04 allocation-authority amendment — 2026-07-18

Bu amendment owner'ın ClaimItem source/input ile target legal-application grain'ini
ayıran kararını canonical domain normuna taşır. Tarihsel WS04 implementation ve closure
kayıtları silinmez veya geriye dönük başarısız sayılmaz; yalnız ileriye dönük authority
ve evidence etkileri açıkça amend/supersede edilir:

```text
P01   AMENDMENT REQUIRED
P02   AMENDMENT REQUIRED
P03   SUPERSEDED / REQUIRES REDESIGN
P03-A CONFIRMED — SAFETY INFRASTRUCTURE ONLY
P03-B SUPERSEDED / DO NOT EXECUTE
```

Target persistence için schema/migration **LIKELY REQUIRED**dır; design ve implementation
yetkili değildir. ACT-28 ile REC-AUTH-011/012 `OPEN` kalır. ClaimItem-keyed synthetic
corpus, representative replay, data access, production observation, consumer switch,
Balance Engine cutover, WS05 ve WS06 hard-hold'dadır.

PR #407 `HOLD / DO NOT MERGE`dir. Amendment canonical olduktan sonra ayrı salt-okunur
semantic triage yapılmadan PR rebase, safe-patch extraction, close veya redesign kararı
verilemez.

## 23.5. RD01 balance-exposure contract ratifikasyonu — 2026-07-19

Owner, PR #407 disposition'ını `COORDINATED REDESIGN REQUIRED` olarak ratifiye etmiştir.
PR'ın production code hunk'ları rebase, cherry-pick veya safe-patch extraction ile
taşınmayacaktır; yalnız gross/remaining ayrımı, remaining principal'ın
`totalDue-interest` ile uydurulmaması, interest-only application'ın principal'ı
azaltmaması, application yoksa aynı context içinde gross=remaining ve projection'ın
side-effect-free olması iş kuralları yeniden kullanılabilir.

RD01 contract'ı `REC-ALLOC-007..010` ile canonicalizedır. Public projection
per-currency/category-level ve fail-closed; sub-bucket/source trace restricted diagnostic;
Balance Engine current authority `SHADOW_ONLY`dır. PR #407 `OPEN / HOLD / DO NOT MERGE /
DO NOT REBASE / DO NOT CLOSE YET` kalır. Target persistence analysis yalnız
`READ-ONLY AUTHORIZED`; schema/migration design veya implementation, runtime/API,
consumer switch ve cutover `NOT AUTHORIZED`dır. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır.

## 23.6. XD-001 legal-application boundary ratifikasyonu — 2026-07-19

Owner, Receivable'ın canonical legal bucket ve allocation policy; Collection'ın receipt
lifecycle ve execution orchestration sahibi olduğunu ratifiye etmiştir. Target
`LegalApplication` persistence tek-yazıcı cross-domain boundary'dir; dual authority ve
kalıcı dual-write yasaktır.

`ClaimItem` application target, payment-state veya allocation authority değildir.
`ClaimItem.collectedAmount` için yeni reader/writer açılamaz. `CollectionAllocation`
bağımsız/fallback authority olamaz; yalnız canonical output'tan türetilen geçici compatibility
projection olarak kalabilir.

Bu karar fiziksel persistence owner'ı veya aggregate seçmez. `ApplicationBatch` dahil bütün
alternatifler `TPA-02 — Target Persistence Architecture` salt-okunur analizinin konusudur.
XD-001 authority boundary kararı canonicaldır; ACT-28 ve REC-AUTH-011/012 physical
persistence, migration, writer, consumer cutover ve retirement kapanana kadar `OPEN` kalır.
TPA-02 için `GO-ANALYZE REQUIRED`; implementation authority `NONE`dır.

## 23.7. RCV-CLAIM-FORM-P01-R01 formation-admission ratifikasyonu — 2026-07-19

Owner, ClaimItem formation için iki seviyeli taxonomy ve fail-closed admission contract'ını
ratifiye etmiştir. Bu amendment yalnız ClaimItem'ın **hangi hukuki borç bileşeni olarak,
hangi source/rule/legal context ile oluşabileceğini** düzenler.

### 23.7.1. İki seviyeli component taxonomy

Canonical category:

```text
PRINCIPAL
COST
ANCILLARY
ACCRUED_INTEREST
```

Component subtype category'den ayrı ve versioned classification registry'ye bağlıdır.
Her subtype açık legal context ve tek bir canonical category mapping'i taşır. Örnek subtype
vocabulary `TAX_KDV`, `TAX_BSMV`, `TAX_KKDF`, `COURT_FEE`, `ENFORCEMENT_FEE`,
`ATTORNEY_FEE`, `CONTRACTUAL_PENALTY`, `CHECK_PENALTY`, `PRECAUTIONARY_COST` ve
`DOCUMENTED_EXPENSE` içerir. `TAX`, `FEE`, `ATTORNEY_FEE` veya `PENALTY` tek başına yeni
canonical application category üretmez.

Her cost/ancillary subtype ayrı legal basis, canonical category, parent/base ilişkisi,
interest eligibility, effective context, required evidence ve rule/version crosswalk'ı
taşır. Mevcut mekanik `NO_INTEREST` varsayımı canonical hukuki karar değildir.

### 23.7.2. `OTHER`, unknown ve generic-document sınırı

`OTHER` yeni canonical ClaimItem write için `DENIED`dır; catch-all, fallback veya bilinmeyen
component karşılığı olamaz. Mevcut `OTHER` kayıtları `LEGACY_ONLY`dır. Taxonomy'de olmayan
yeni hukuki component önce açık classification code, canonical category, hukuki dayanak ve
formation context için `LEGAL_REVIEW_REQUIRED` sonucu üretir; ratifikasyondan sonra subtype
registry'ye eklenebilir.

Bilinmeyen, boş veya map edilmemiş component `UNSUPPORTED_COMPONENT` üretir; sessizce
`PRINCIPAL`, `OTHER` veya başka bir default component'e dönemez. Bilinmeyen/eşlemesiz
document type `PRINCIPAL` ClaimItem üretemez. Document source yalnız explicit, exhaustive
ve versioned document-type/component-subtype mapping ile admission'a girebilir.

### 23.7.3. Interest semantics ve compatibility

Geçmiş dönemde işlemiş, as-of tarihinde belirli ve tutarı hesaplanmış faiz
`ACCRUED_INTEREST` sabit hukuki borç component'idir. En az `periodStart`, `periodEnd`,
`asOf`, `principalBasisRef`, `interestPolicyRef`, policy/rule version, rate/legal source,
legal-basis reference/version ve exact amount/currency context'i zorunludur.

As-of tarihinden sonra işleyecek faiz sabit ClaimItem değildir; yalnız `InterestPolicy`,
calculation rule ve rate/legal context olarak temsil edilir. `POST_INTEREST_RULE` ClaimItem
üretmez.

Compatibility disposition:

```text
INTEREST      DEPRECATED / NEW WRITE DENIED / LEGACY_ONLY
PRE_INTEREST  ACCRUED_INTEREST COMPATIBILITY ALIAS /
              NEW DIRECT WRITE DENIED / LEGACY_ONLY
POST_INTEREST NEW CLAIMITEM ADMISSION DENIED / LEGACY_ONLY
```

Tam period/policy/legal context bulunması otomatik migration authority üretmez. Legacy
`INTEREST`, `PRE_INTEREST`, `POST_INTEREST` ve `OTHER` kayıtları ayrı inventory ve migration
kararı verilene kadar korunur; bu amendment mutation, normalization veya backfill yetkisi
vermez.

### 23.7.4. Rule Engine admission

Unknown Rule Engine output `UNSUPPORTED_COMPONENT`dır. `POST_INTEREST_RULE` yalnız policy
output'tur. Monetary ClaimItem sıfır/negatif amount, açık component mapping'i olmayan rule
output veya version/checksum'sız input ile oluşamaz. Rule version ve normalized input
checksum zorunludur.

### 23.7.5. Mandatory formation context

Her yeni canonical ClaimItem formation en az:

```text
tenantId / caseId
componentCategory / componentSubtype
exact originalAmount / exact demandedAmount / currency
sourceType / sourceId / sourceSlot / sourceVersion
legalBasisRef / legalBasisVersion
effectiveAt / liabilityContext
provenance / actor / authority
correlation / idempotency identity
normalizedInputChecksum / formationAt
```

taşır. Faiz veya faiz doğurabilecek component ayrıca `interestEligibility`,
`interestPolicyRef/version` ve `ruleRef/version` taşır.

### 23.7.6. `ClaimFormationSnapshotV1`

`ClaimFormationSnapshotV1`, hukuki anlamı ve kaynak input'unu versioned, immutable ve
yeniden üretilebilir mantıksal contract olarak sabitler. Hukuki anlamı veya kaynak verisini
değiştiren güncelleme sessiz overwrite yapamaz; yeni source version/snapshot ve explicit
supersession ilişkisi gerektirir. Version/checksum'sız mevcut kayıtlar `LEGACY_ONLY`dır.
Bu logical contract fiziksel persistence, schema veya migration kararı değildir.

### 23.7.7. Human direct entry

Source-less veya yalnız Office approval'a dayanan direct ClaimItem write `PROHIBITED`dır.
Human direct entry ancak explicit source/evidence, legal-basis/version, category/subtype,
exact amount/currency, liability context ve gerekli Office approval birlikte mevcutsa
admission değerlendirmesine girer. Office approval hukuki provenance yerine geçmez.

### 23.7.8. Interest eligibility ve admission sonuçları

Interest eligibility:

```text
ACCRUES
NO_INTEREST
UNRESOLVED
```

`UNRESOLVED` otomatik `NO_INTEREST` değildir. Temel alacak ve hukuki classification kesin
ise `ALLOWED_WITH_POLICY_HOLD` mümkündür: ClaimItem oluşabilir; `InterestPolicy`
bağlanamaz, faiz hesaplanamaz ve consumer borcu faizsiz kabul edemez.

Canonical admission vocabulary:

```text
ALLOWED
ALLOWED_WITH_POLICY_HOLD
DENIED
LEGAL_REVIEW_REQUIRED
POLICY_CONTEXT_REQUIRED
SOURCE_CONTEXT_REQUIRED
UNSUPPORTED_COMPONENT
LEGACY_ONLY
```

`ALLOWED`, tam formation ve gerekli policy context'in hazır olduğunu gösterir.
`ALLOWED_WITH_POLICY_HOLD` dışındaki diğer non-`ALLOWED` sonuçlar yeni canonical formation
write üretemez.

### 23.7.9. Legal-review authority

Final legal review authority Ulaş Hüseyin Telli veya owner tarafından daha sonra açıkça
atanmış yetkili avukattır. Personel/staff yalnız hazırlık, belge toplama ve classification
önerisi yapabilir; final hukuki classification veya faiz uygunluğu kararı veremez.

### 23.7.10. Boundary ve status separation

Receivable scope:

```text
ClaimItem formation
component semantics
source admission
legal basis
interest-policy input
versioning/provenance
formation snapshot
```

Collection/shared-boundary authority `UNCHANGED`dır. `LegalApplication`,
`ApplicationBatch`, payment allocation orchestration, receipt lifecycle ve allocation
execution bu amendment kapsamında tasarlanmaz.

```text
CONTRACT                    RATIFIED / CANONICAL UPON APPROVED MERGE
RUNTIME ENFORCEMENT         NOT IMPLEMENTED
IMPLEMENTATION AUTHORITY    NONE
SCHEMA / MIGRATION          NOT AUTHORIZED
LEGACY MUTATION / BACKFILL  NOT AUTHORIZED
ACT-28                      OPEN / UNCHANGED
REC-AUTH-011                OPEN / UNCHANGED
REC-AUTH-012                OPEN / UNCHANGED
```

Tarihsel closure kayıtları silinmez veya yeniden yazılmaz. Bu amendment yeni workstream,
Collection/shared-boundary task'ı, Balance Engine, replay/data access veya cutover yetkisi
üretmez.

## 23.8. TPA-02 target persistence architecture ratifikasyonu — 2026-07-19

Owner, physical target model olarak Option D'yi ratifiye etmiştir:

```text
LegalApplicationBatch
  ├─ immutable LegalApplication[]
  └─ non-authoritative ApplicationAttribution[]
```

Receivable bucket/context/snapshot semantiği ile TBK100 allocation policy'sinin; Collection
receipt lifecycle, idempotency ve outer transaction orchestration'ın sahibidir. RCV-COL
Legal Application Boundary aggregate persistence'ın sahibidir; tek logical writer
`LegalApplicationWriter`dır. Invocation yalnız canonical Collection transaction'ı içinde,
mevcut transaction client ile yapılır.

Bir `APPLY` batch'i bir Collection receipt'ine karşılık gelir. Exact-cent conservation,
tenant-scoped key+hash replay, linked append-only full reversal, immutable application,
tenant-safe composite FK ve `ON DELETE RESTRICT` zorunludur. Partial reversal ayrı owner
gate'idir. Historical tahmin, silent backfill, dual allocator ve dual authority yasaktır.

Legacy disposition:

```text
ClaimItem.collectedAmount  FROZEN LEGACY CACHE / RETIREMENT REQUIRED
CollectionAllocation      CANONICAL-OUTPUT-DERIVED TRANSITIONAL PROJECTION ONLY
LedgerAllocation          HISTORICAL LEGACY RECORD / TARGET-ERA AUTHORITY PROHIBITED
```

ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. `codex/rcv-ws04-p03-syn-01` disposition,
PR #407 `HOLD / CONFLICTING / DO NOT MERGE`, deterministic bucket identity,
representative replay/evidence ve consumer cutover authority açık blocker'lardır.
TPA-03 schema-foundation analysis yalnız ayrı owner `GO-ANALYZE` ile başlayabilir.
Schema, migration, writer, replay/evidence, cutover ve retirement implementation authority
`NONE`dır.

## 23.9. TPA-03 schema-foundation contract ratifikasyonu — 2026-07-20

Owner, Option B — Two-File Hybrid Schema Foundation kararını ratifiye etmiştir. Foundation
`LegalApplicationBatch`, immutable `LegalApplication` ve non-authoritative
`ApplicationAttribution` modelleriyle; `LegalApplicationBatchType = APPLY | REVERSAL` ve
`LegalApplicationComponentType = COST | ANCILLARY | ACCRUED_INTEREST | PRINCIPAL` enum'larını
taşır.

Exact implementation scope yalnız `schema.prisma` ile tek `migration.sql` dosyasıdır. Patch
additive, writer-free ve no-backfill olmak; mevcut runtime, consumer ve historical data
davranışını değiştirmemek zorundadır. Tenant-safe composite FK, `ON DELETE RESTRICT`,
batch/application immutability ve positive minor-unit amount zorunludur.

`receiptAmountMinor` APPLY için canonical Collection receipt, REVERSAL için linked original
receipt magnitude'ıdır; yön batch type'tan gelir. Exact-cent conservation canonical kalır fakat
aggregate-level enforcement foundation patch'inde değil, ayrı writer-stage gate'indedir.
Replay `(tenantId, idempotencyKey)` unique sınırı ve `commandHash` karşılaştırmasıyla
fail-closed'dur. Full reversal linked append-only batch'tir; self/double/partial reversal
foundation kapsamında yetkili değildir.

Bucket identity alanları required/opaque/nonblank'tir; üretim algoritması owner-gated writer
kontratına bırakılır. Attribution yalnız optional ClaimItem lineage taşıyabilir ve authority
olamaz.

`codex/rcv-ws04-p03-syn-01`, TPA-03A schema foundation için `NON-BLOCKING`; writer, evidence ve
cutover için `BLOCKING`dir. PR #407 `HOLD / CONFLICTING / DO NOT MERGE / DO NOT REBASE` kalır.
ACT-28 ve REC-AUTH-011/012 `OPEN`dır. TPA-03A yalnız ayrı owner `GO-IMPLEMENT` ile başlayabilir;
bu ratifikasyon schema, migration veya implementation yetkisi üretmez.

## 23.10. TPA-03A schema-foundation closure reconciliation — 2026-07-20

Owner-gated TPA-03A implementation'ı PR #1449 / squash
`63f0b0ea2cbef3f5d106ae3dfd8be6b770b5229f` ile exact two-file scope'ta
`CLOSED / CANONICAL`dır. Foundation additive, writer-free ve no-backfill'dir; tenant-safe FK,
restrictive delete, replay/reversal, nonblank bucket, positive minor-unit ve immutable
UPDATE/DELETE korumaları kanıtlanmıştır. Runtime, test, consumer ve historical data etkisi
`NONE`dır.

Exact-cent conservation enforcement writer-stage'e deferred kalır. ACT-28 ve
REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING`; PR #407
`HOLD / UNTOUCHED`dur. Sonraki yalnız owner-gated görev `TPA-04 —
LEGALAPPLICATIONWRITER CONTRACT ANALYSIS`; authority `OWNER GO-ANALYZE REQUIRED`dır.

## 23.11. TPA-04 LegalApplicationWriter contract ratifikasyonu — 2026-07-20

Owner, Option C — Target-Native Plan-Then-Persist / Dormant-First Single Writer kararını
ratifiye etmiştir. Canonical writer ve domain sınırları `REC-ALLOC-015`te tanımlıdır.
Contract production wiring veya shadow execution açmaz; DB conservation amendment, snapshot
identity, plan builder, dormant writer, reversal writer, evidence ve cutover ayrı sıralı
owner gate'leridir.

Successor sırası:

1. TPA-04A Canonical Snapshot / Bucket Identity Contract
2. TPA-04B Writer Evidence Schema Amendment
3. TPA-04C Pure LegalApplicationPlan Builder
4. TPA-04D Dormant LegalApplicationWriter
5. TPA-04E Full Reversal Writer
6. TPA-04F Representative Replay / Reconciliation Evidence
7. TPA-04G Coordinated Writer / Consumer Cutover Decision

Tüm successor'lar `OWNER GO REQUIRED / NOT AUTHORIZED`dır. ACT-28 ve REC-AUTH-011/012
`OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING`; PR #407
`OPEN / HOLD / CONFLICTING / DO NOT MERGE / DO NOT REBASE` olarak korunur.

## 23.12. TPA-04A canonical snapshot / bucket identity contract ratifikasyonu — 2026-07-20

Owner, Option C — Receipt-Bound Embedded Canonical Snapshot Envelope kararını
ratifiye etmiştir. `CanonicalReceivableApplicationSnapshotV1` yalnız LegalApplication
plan/writer girdisi için official narrow subtype'tır; `REC-AUTH-025` ve `REC-ALLOC-016`
eligibility, envelope, `RCV-CAS/v1` serialization/hash, deterministic bucket identity,
fail-closed readiness ve pure plan sınırlarını tanımlar.

ADR-013 yalnız bu dar alt tür bakımından ratifiye edilmiştir; general presentation,
Fee/Harç, Journal, consumer authority ve broader lifecycle açık kalır. Current Balance Engine
`SHADOW_ONLY`; production authority/writer/cutover `NOT AUTHORIZED`dır.

PR #407 final disposition B ile `CLOSED / UNMERGED / REQUIREMENTS PRESERVED / CODE DISCARDED`;
PR #1460 ancestry/collision implementation girişi öncesi yeniden doğrulanır;
synthetic corpus writer/evidence/cutover için `BLOCKING`; ACT-28 ve REC-AUTH-011/012
`OPEN` kalır. Sonraki yalnız `TPA-04B — WRITER EVIDENCE SCHEMA AMENDMENT ANALYSIS /
OWNER GO-ANALYZE REQUIRED`; implementation `NOT AUTHORIZED`dır.

## 23.13. PR #407 final disposition B supersession — 2026-07-20

Owner, önceki `COORDINATED REDESIGN REQUIRED / KEEP OPEN` yaşam döngüsü kararını
supersede etmiştir. PR #407 birleşmeden kapatılır; kodu discard edilir ve hiçbir hunk
extract/reuse edilmez. Gereksinimler bağımsız olarak korunur:

1. gross ve remaining principal/interest ayrı görünür;
2. remaining principal `totalDue - totalInterest` ile türetilmez;
3. interest-only application principal'ı azaltmaz;
4. application yoksa aynı valid context'te gross=remaining;
5. missing/stale/unverified exposure `0` değil typed `null` ve fail-closed'dur;
6. exact-cent reconcile cost/ancillary bileşenleri içerir;
7. held receipt exposure reconciliation dışındadır; ve
8. cost/ancillary nedeniyle `claimRemaining = remainingPrincipal + remainingInterest`
   genel invariant değildir.

Bu kayıt runtime, schema, migration, snapshot, writer, display, API, consumer veya cutover
yetkisi üretmez. RD01/TPA contract'ları, ACT-28, REC-AUTH-011/012 ve TPA-04B+ gate'leri korunur.

## 23.14. TPA-04B required-evidence schema-amendment contract ratifikasyonu — 2026-07-20

Owner, two-file required-evidence schema-amendment kontratını ratifiye etmiştir. Gelecekteki
patch yalnız Prisma schema ve tek yeni migration dosyasıdır. Bütün snapshot/version/bucket
evidence alanları required, default-free ve backfill-free; canonical snapshot payload exact
TEXT bytes'tır. Foundation tablolarında mevcut row, lock sonrası hard-stop'tur.

TPA-04A identity formatları, per-batch bucket uniqueness, APPLY/REVERSAL before-after arithmetic
ve `receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` DB contract'ı zorunludur.
Tamamen HELD batch geçerlidir; exact-inverse full reversal TPA-04E'ye deferred kalır.

PR #1469 merged/non-blocking'dir; PR #407 closed/unmerged/no-further-action'dır. Synthetic corpus
schema amendment için non-blocking, writer/evidence/cutover için blocking kalır. ACT-28 ve
REC-AUTH-011/012 `OPEN`; runtime/schema implementation bu canonicalization ile yetkili değildir.
Sonraki yalnız `TPA-04B-ENTRY — OWNER GO-VERIFY REQUIRED`dır.

## 23.15. TPA-04B required-evidence schema-amendment closure reconciliation — 2026-07-21

Implementation PR #1470 / squash
`9dabe8dbddecafad49dbe58958ef2c3642d14a01`, exact iki dosyalık amendment'ı canonical
main'e taşımıştır: `schema.prisma` ve
`20260721002219_legal_application_writer_evidence/migration.sql`.

Required/default-free/no-backfill evidence alanları ve exact canonical snapshot `TEXT` payload'ı;
snapshot/hash/ref/minorUnit/nonblank guard'ları; per-batch bucket uniqueness; APPLY/REVERSAL
bucket arithmetic; immutable UPDATE/DELETE protection; nonempty-foundation fail-closed gate ve
`receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor` transaction-end
conservation'ı kurulmuştur. PostgreSQL 16 apply/rollback/re-apply ile seeded hard-stop/unchanged
row evidence'ı PASS'tir. `ApplicationAttribution` unchanged/non-authoritative kalır.

Runtime writer ve backfill `NONE`dir. Closure anındaki live/production DB apply
`NOT AUTHORIZED / NOT PERFORMED` kaydı 2026-07-22 M2 live-apply kaydıyla superseded'dır.
ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus schema amendment için non-blocking,
TPA-04C writer/evidence/cutover için `BLOCKING`dir. TPA-04C pure-plan contract'ı
OD-TPA-04C-01..36 ile ratified'dır. I01, PR #1517 / squash
`568f76e1847d5ee0060e81d76996f8e2177bada1` ile `CLOSED / CANONICAL EVIDENCE`dır; sonraki
yalnız `TPA-04C-I02 — CANONICAL SNAPSHOT VALIDATION / DETERMINISTIC ERRORS / OWNER
GO-IMPLEMENT REQUIRED`dır ve implementation henüz yetkili değildir.

## 23.18. TPA-04C pure-plan authority pointer — 2026-07-22

TPA-04C'nin tek tam contract authority kaydı ADR-014 `OD-TPA-04C-01..36` bölümüdür.
Receivable official snapshot producer, closed component semantics, TBK100 policy,
deterministic bucket order, exact-minor-unit arithmetic ve pure plan authority'sini korur.
Collection receipt/admission/idempotency/outer-transaction owner'ıdır; builder hiçbir DB,
Prisma, transaction, persistence, audit/event/outbox veya legacy allocator dependency taşımaz.

ClaimItem hukuki source/input/lineage olabilir fakat application target veya payment-state
authority değildir. Attribution optional/non-authoritative; COST yalnız official snapshot
evidence'ından gelir; invalid authority HELD'e dönüştürülemez. TPA-04C APPLY-only'dir; full
reversal TPA-04E'ye deferred ve partial reversal unauthorized'dır.

M2 live DB applied/post-validated, target tables empty, data/backfill none ve runtime writer
not implemented/not activated'dır. ACT-28 ile REC-AUTH-011/012 open; implementation slices
self-start edemez.

## 23.19. TPA-04C-I01 closure / I02 validation contract — 2026-07-22

I01 exact four-file contract/primitives implementation'ı PR #1517 / squash `568f76e1847d5ee0`
ile canonical main'dedir; `57/57` targeted test, production type-check, API build ve required
CI `4/4 PASS`tır. Runtime değişmemiştir.

I02 için RCV-CAS/v1 hash preimage'ı exact
`UTF8("RCV-CAS/v1") || 0x00 || canonicalEnvelopeBytes` olarak korunur. Envelope maksimum
`1,048,576` UTF-8 byte, bucket `10,000`, applicable attribution `50,000`, nesting depth `32`dir.
Duplicate key, unknown field, unexpected null, non-NFC, ambiguous integer ve canonical-byte
mismatch fail-closed'dur; validation deterministic first-error sırasını izler. Exact string
limitleri ve error surface ADR-014 OD-TPA-04C-21..36'dadır. I02 `NEXT / NOT STARTED / NOT
AUTHORIZED`; ayrı owner GO-IMPLEMENT gerektirir. I03-I07, runtime writer, allocation, replay,
cutover ve retirement yetkisiz; ACT-28 ve REC-AUTH-011/012 `OPEN` kalır.

## 23.20. S08-D01A shared document-source authority contract — 2026-07-22

Owner, `RCV-CLAIM-FORM-P02-S08-D01A-OWNER-DECISION` ile `OPTION D — SHARED
EVIDENCE / DOCUMENT PLATFORM` modelini ratifiye etmiştir. Contract'ın canonical home'u
`DOCUMENT-SOURCE-GOVERNANCE.md`dir. Bu kayıt yeni primary domain, program veya Master
Register identity üretmez; `SYSTEM-CONSTITUTION` `SYS-GOV-019` shared/supporting-context
sınırını consume eder.

Shared Evidence / Document Platform; logical document/source identity, document version ve
lifecycle, storage object, binary/content integrity, document-classification version,
versioned source fingerprint, OCR/extraction evidence, reviewed-evidence lifecycle,
revocation/tombstone ve retention/legal-hold linkage sahibidir. Version modeli `V4 —
IMMUTABLE VERSION ENTITY + VERSIONED FINGERPRINT`; OCR statüsü `O1 — DERIVED /
NON-AUTHORITATIVE`dır. Mevcut `CaseDocument`, canonical versioned aggregate kurulana kadar
`LEGACY / INCOMPLETE PROJECTION`; legacy rows `LEGACY_SOURCE_VERSION_UNRESOLVED`dır.

RECEIVABLE yalnız read-only, deterministic, tenant/case-scoped ve exact-version capable
document-source resolver tüketir; document lifecycle, storage/hash veya OCR lifecycle sahibi
değildir. Document classification ile Claim component classification aynı değildir. Unknown
veya generic document sessizce `PRINCIPAL`/`OTHER` üretemez; deterministic classification
yoksa `LEGAL_REVIEW_REQUIRED` korunur. OFFICE actor/permission/approval sahibi olarak kalır;
approval legal source/basis/classification/snapshot değildir. DEBTOR/CASE yalnız case identity
ve access boundary sahibidir. COLLECTION değişmez.

Bu ratifikasyon yalnız S08-D01'in Document authority tarafındaki owner/program blocker'ını
`CONTRACTUALLY CLOSED` yapar. Legal-basis/version authority blocker'ı `OPEN`; S08-D01'in
implementation/persistence tarafı `NOT STARTED / NOT AUTHORIZED`dır. Document writer/resolver,
schema/migration, storage/live-data access, legacy hashing/bootstrap, OCR persistence,
`ClaimItemFormationIntentV1`, `ClaimFormationSnapshotV1`, S08-I02A ve client cutover
yetkilendirilmez. Runtime `PARTIAL — S01 + S02-I01 + S03-I01 + S04-I01 + S05-I01 +
S06-I01 + S07-I01 + S08-I01 ONLY`; Claim Formation phase `OPEN`; next task `UNSET — OWNER
GO REQUIRED` kalır.

## 23.21. TPA-04C-I02 snapshot-validation implementation closure — 2026-07-22

TPA-04C-I02 implementation PR #1520 / squash
`d46df4cec753b03bebcaefd07e5540dcb2b97709`, exact seven-file implementation ve required CI
`4/4 PASS` ile `CLOSED / CANONICAL EVIDENCE`dır. Strict duplicate-key-safe parsing,
domain-restricted canonical serialization, exact
`SHA-256(UTF8("RCV-CAS/v1") || 0x00 || canonicalEnvelopeBytes)` binding'i, snapshot/ref/hash ve
command/context doğrulaması, bounded deterministic first-error davranışı ile opaque/non-forgeable
`ValidatedCanonicalSnapshotV1` boundary'si kurulmuştur. I01+I02 targeted testleri
`113/113 PASS`tır.

I02 pure validation boundary'sidir; allocation, HELD, fingerprint, attribution, writer,
persistence, replay, consumer cutover veya legacy retirement yapmaz. Runtime, schema, migration,
backfill ve live-DB action `NONE`; M2 live foundation ve boş target tablolar değişmemiştir.
Runtime writer `NOT IMPLEMENTED / NOT ACTIVATED`; ACT-28 ve REC-AUTH-011/012 `OPEN`;
synthetic corpus writer/evidence/cutover için `BLOCKING` kalır. Sonraki owner-gated slice
`TPA-04C-I03 — PURE APPLY ORDERING / EXACT-MINOR-UNIT ALLOCATION CORE`; ayrı owner
`GO-IMPLEMENT REQUIRED / NOT YET AUTHORIZED`dır. I04-I07 self-start edemez.

## 23.22. S08-D01B Legal Basis Registry/version authority contract — 2026-07-23

Owner, `RCV-CLAIM-FORM-P02-S08-D01B-OWNER-DECISION` ile D01B contract analizini kabul etmiş ve
`L1 — RECEIVABLE-OWNED LEGAL BASIS REGISTRY` modelini ratifiye etmiştir. RECEIVABLE stable
legal-basis identity, immutable version consumption, formation compatibility, effective-date ve
liability-context validation, exact-version/checksum binding, deterministic resolver ve admission
result semantiğinin sahibidir. Bu kayıt yeni primary Legal Policy domain veya program identity
oluşturmaz.

Final `LegalBasisVersion` ratifier'ı Ulaş Hüseyin Telli veya owner tarafından açıkça
yetkilendirilmiş avukattır. Staff/personel candidate data hazırlayabilir; final legal
classification, version ratification, revoke/retroactivity veya case-specific legal-review
authority'si üretemez. Developer, system administrator, runtime enablement ve OfficeApproval
workflow'u da hukuki ratifikasyon değildir. Global activation four-eyes legal review gerektirir;
legal draft/review ile final authorized ratifier ayrıdır.

Canonical identity stable internal `legalBasisCode` + separate immutable `legalBasisVersion`dır.
Statute/article, contract clause ve official publication version payload'ındaki reference'lardır;
DB UUID varsa yalnız storage identity'sidir. Ratified payload mutate veya hard-delete edilmez;
correction yeni immutable version, revoke/supersession append-only lifecycle event'tir. Formation
intent exact code/version/checksum/registry release bağlar; finalizer aynı exact version'ı status,
effective interval, checksum ve compatibility yönlerinden yeniden doğrular. Automatic version
upgrade yasaktır; ex nunc/ex tunc ve retroactivity runtime tarafından çıkarılamaz.

Subtype Registry ve Legal Basis Registry ayrı fakat version-bound'dur. Subtype version tam bir
canonical category'ye bağlanır; LegalBasisVersion allowed exact category/subtype combinations,
required source/evidence classes, evidence combination, liability requirements ve interest
eligibility taşır. Resolver exact DocumentSourceVersion ve EvidenceBundle ile birlikte bu
compatibility'yi fail-closed doğrular. Document Platform evidence identity/version sahibidir;
RECEIVABLE compatibility evaluation sahibidir. Generic/unresolved evidence silent admission
üretemez.

Tenant modeli global versioned legal basis + yalnız daha sıkı operational/evidence overlay'dir.
Overlay legal meaning, category/subtype mapping, effective interval veya interest eligibility'yi
değiştiremez ve global guard'ı zayıflatamaz. Target persistence `P3 — VERSIONED ARTIFACT SOURCE OF
TRUTH + COMPILED READ-ONLY DB PROJECTION`; transitional model `P1/L3 — SIGNED VERSIONED
REPOSITORY RELEASE + PURE EXACT-VERSION RESOLVER`dır. Bunlar architecture disposition'dır;
artifact, resolver, DB projection, schema veya migration implementation authority'si değildir.

Version/checksum'sız legacy rows `LEGACY_LEGAL_BASIS_UNRESOLVED`dır. Metadata, document type veya
current registry version üzerinden historical basis tahmini; automatic backfill/reclassification;
existing ClaimItem/snapshot mutation yasaktır. D01B owner/authority blocker'ı bu approved
governance merge ile `CONTRACTUALLY CLOSED`; D01A Document blocker'ı `CONTRACTUALLY CLOSED` kalır.
S08-D01 yalnız `READY FOR FINAL DESIGN RECONCILIATION`; S08-I02A `NOT STARTED / NOT AUTHORIZED`dır.
Runtime `PARTIAL THROUGH S08-I01 ONLY`; code/test/schema/migration, basis contents, subtype
contents, intent/snapshot persistence, client cutover, Collection/shared-boundary veya historical
data değişikliği yoktur. Next yalnız `RCV-CLAIM-FORM-P02-S08-D01-FINAL-RECONCILE — SEPARATE OWNER
GO REQUIRED`dır.

## 23.23. TPA-04C-I03 closure / I04 plan-fingerprint contract — 2026-07-23

TPA-04C-I03, PR #1535 / squash
`719e6898a6e967ba824a69aeadbf716e55c3056d` ve exact four-file implementation ile
`CLOSED / CANONICAL EVIDENCE`dır. I03 `24/24`, I01-I03 `137/137`, property ve deterministic
ordering/repetition kontrolleri; production/strict type-check, API build, exact-file ESLint ve CI
`4/4 PASS`tır. Runtime ve legacy allocator unchanged'dır.

ADR-014 OD-TPA-04C-37..56, `RCV-CAS/v1`dan bağımsız `RCV-LAP/v1` plan-fingerprint
protocolünü ratifiye eder. Preimage exact
`UTF8("RCV-LAP/v1") || 0x00 || canonicalPlanIdentityBytes`; output
`rcv-legal-application-plan:v1:sha256:<64-lowercase-hex>`dir. Exact versioned schema, property
order, unsigned minor-unit strings, JSON-integer priority, NFC/UTF-8 policy ve I03 application
sequence'i authority'dir. Generic object/key ordering authority değildir.

Identity tenant/case/Collection receipt context'i ile snapshot evidence set'ini bağlar. `NONE`,
zero-remainder için yalnız fingerprint absence sentinel'dır. Attribution optional,
non-authoritative ve fingerprint-excluded; detailed lineage yoksa boş olabilir, fakat
`sourceLineageSetRef` application'da required kalır. Persistence ID'leri, replay identifiers,
actor ve transport/transaction provenance fingerprint'e katılmaz. Conservation veya identity
inconsistency fail-closed typed error üretir ve fingerprint dönmez.

I04 yalnız bu docs amendment merge'i, fresh collision check ve ayrı owner `GO-IMPLEMENT`
sonrasında eligible olabilir. Şu anda `NEXT / NOT STARTED / NOT AUTHORIZED`; I05-I07 de
yetkisizdir. Runtime writer `NOT IMPLEMENTED / NOT ACTIVATED`; ACT-28 ve REC-AUTH-011/012
`OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING` kalır.

## 23.24. S08-I02A intent/snapshot technical-foundation closure — 2026-07-23

RCV-CLAIM-FORM-P02-S08-I02A implementation PR #1541 / squash
`3ba17a0a8cf1210afc38613943c83d7c1a6efe49`, required CI `4/4 PASS` ile
`FORMALLY CLOSED / CANONICAL TECHNICAL FOUNDATION`dır. Additive
`ClaimItemFormationIntent` + `ClaimFormationSnapshot` schema foundation'ı ve
`20260723100000_claim_formation_intent_snapshot_foundation` migration'ı merge edilmiştir.
Disposable PostgreSQL üzerinde 98 migration clean deploy, foundation testleri `18/18` ve
ClaimItem regresyonu `267/267 PASS`tır.

Bu teknik foundation production writer veya runtime activation değildir. Typed intent
writer/admission, OfficeApproval binding, Document/Legal Basis resolver, transactional finalizer,
ClaimItem/snapshot production writer, feature/capability activation ve web/client cutover
`NONE / NOT AUTHORIZED` kalır. Migration gerçek `hukuk_db`ye uygulanmamıştır; live apply ayrı
owner `GO-MIGRATE` gerektirir. Historical inventory, backfill veya mevcut veri mutation'ı yoktur.
S08-I01 containment `ACTIVE / UNCHANGED`; Claim Formation runtime
`PARTIAL — THROUGH S08-I01 ONLY`dır.

S08-I02B, S08-I03 ve S08-I04 `NOT AUTHORIZED / NOT STARTED` kalır. Bu closure successor seçmez:
`NEXT ELIGIBLE TASK = UNSET — OWNER GO REQUIRED`. Collection/shared-boundary authority ve mevcut
Document/Legal Basis authority contract'ları değişmez.

## 23.25. S08-I02B typed formation-intent admission formal closure — 2026-07-23

RCV-CLAIM-FORM-P02-S08-I02B implementation PR #1549 / squash
`e0db42d283520448066124c611217544bb62cce7`, required CI `4/4 PASS` ile
`FORMALLY CLOSED / CANONICAL`dır. Target unit/static `27/27`, broad ClaimItem regression
`266/266` ve disposable PostgreSQL `3/3 PASS`; Production TypeScript, Nest build,
changed-file ESLint ile static/scope/diff kontrolleri PASS'tır.

Typed `ClaimItemFormationIntentV1` admission implemented fakat `DORMANT / DEFAULT DISABLED`dır.
Intent + pending OfficeApproval + request audit tek transaction içinde atomic ve doğrulanmıştır.
Document ile Legal Basis resolver'ları yalnız port'tur; production adapter ve production call-site
`NONE`dır. ClaimItem veya ClaimFormationSnapshot finalizer, OfficeApproval execution flow,
production activation, human-create re-enable ve historical backfill yoktur. I02B implementation
schema veya migration değiştirmemiştir; I02A migration'ının live apply durumu
`NOT AUTHORIZED / NOT APPLIED` kalır. S08-I01 containment `ACTIVE / UNCHANGED`; production Claim
Formation runtime `PARTIAL — THROUGH S08-I01 ONLY` kalır.

Claim Formation phase ve S08 workstream `OPEN`dır. Yalnız
`RCV-CLAIM-FORM-P02-S08-I03 — Transactional Claim Formation Finalizer` next eligible olur;
`NOT STARTED / OWNER GO REQUIRED`dır. Bu closure I03, I04, production resolver, runtime,
schema/migration apply veya Collection/shared-boundary authority'si üretmez.

## 23.26. S08-I03 transactional Claim Formation finalizer formal closure — 2026-07-24

RCV-CLAIM-FORM-P02-S08-I03 implementation PR #1556 / squash
`1d47fef64e66b01561c12dc2717a63e7262dcfca`, required CI `4/4 PASS` ile
`FORMALLY CLOSED / CANONICAL`dır. Approved immutable formation intent; exact
Document/Legal Basis version, fingerprint/checksum, source/evidence, subtype ve liability
compatibility bağları yeniden doğrulandıktan sonra canonical `ClaimItem`, immutable
`ClaimFormationSnapshot`, audit/domain-event/outbox continuity ve OfficeApproval execution
completion state'i aynı transaction içinde üretir.

Execution deterministic ve idempotent'tir: intent-scoped advisory lock ile aynı tamamlanmış
intent replay'i mevcut canonical sonucu döndürür, ikinci ClaimItem üretmez; bozuk veya çelişkili
execution state fail-closed durur. Amount değerleri BigInt olarak exact korunur. Revalidation
veya write aşamalarından herhangi biri başarısızsa ClaimItem, snapshot, audit/event/outbox ya da
completion state bakımından partial write oluşmaz.

Bu teknik finalizer production runtime authority'si değildir. Nest provider, route veya
production call-site `NONE`; runtime `DEFAULT DISABLED`dır. S08-I01 human-create containment
`ACTIVE / UNCHANGED`, I02A live migration apply `NOT AUTHORIZED / NOT APPLIED`, historical
backfill `NONE` kalır. Web/client ve Collection/shared-boundary değişmez. Claim Formation phase
ile S08 `OPEN`dır. `RCV-CLAIM-FORM-P02-S08-I04` yalnız next eligible task'tır; `NOT AUTHORIZED /
OWNER GO REQUIRED`dır.

Current-state reconciliation: `89c16e9b` local I02B-I01 writer-foundation commit'inin canonical
disposition'ı `CLOSED / FULLY SUPERSEDED / CODE DISCARDED / NOT MERGED` olarak korunur;
gereksinimleri merged I03 tarafından karşılanmıştır. Tarihsel I02B-I01 kaydı korunur; fiziksel
branch/worktree bu closure kapsamında değiştirilmez veya temizlenmez.

## 23.27. S08-D02-R01 exact-version source readiness ve deferred-execution contract — 2026-07-24

Owner, `RCV-CLAIM-FORM-P02-S08-D02-R01` kapsamında aşağıdaki production-readiness ve
execution-boundary sözleşmesini ratifiye etmiştir. Bu kayıt production implementation,
schema/migration, provider wiring, runtime activation, web/client veya I04 authority'si
değildir. I02B ve I03'ün dormant/default-disabled canonical davranışını değiştirmez.

### 23.27.1. Authority ownership matrix

| Fact / capability | Canonical owner | Receivable consumer boundary |
|---|---|---|
| Logical document, immutable document version, storage/content integrity, fingerprint, classification ve lifecycle | Shared Evidence / Document Platform | Exact-version, tenant/case-scoped, read-only result tüketir; Document authority üretmez |
| Legal Basis Registry, immutable LegalBasisVersion, release, checksum, lifecycle ve formation compatibility | RECEIVABLE | Exact code/version/release binding'ini üretir ve doğrular |
| Actor, permission ve approval decision | OFFICE | Claim Formation business effect veya legal source authority üretmez |
| Case identity ve object-scope access | DEBTOR / CASE + OFFICE authorization | Document version veya Legal Basis authority üretmez |
| Formation admission, immutable intent binding ve ClaimItem/Snapshot finalization | RECEIVABLE / CLAIM FORMATION | I02B admission ve I03 finalizer sınırı |
| Audit, DomainEvent ve Outbox transport | Shared infrastructure | Claim Formation transaction'ına katılır; business authority değildir |

Authority ownership açık ve çelişkisizdir. Document Platform'ın shared authority'si
`DOCUMENT-SOURCE-GOVERNANCE.md`; Legal Basis authority'si bu belgenin §23.22 hükmüdür.
RECEIVABLE, Document lifecycle/storage/hash/classification kararını yeniden tanımlayamaz.
OFFICE approval kararı da Document, Legal Basis, ClaimItem veya Snapshot hukuki anlamını
tek başına üretemez.

### 23.27.2. Exact-Version Source Readiness Contract

#### Document source

Canonical target; stable `CaseDocument` identity, immutable `CaseDocumentVersion`,
trusted `StorageObject`, versioned classification/integrity ve append-only lifecycle
durumundan oluşur. Exact identity en az:

```text
tenantId
caseId
documentId
versionId
version
```

taşır. `binaryContentHash`, `documentEnvelopeHash`, `classificationHash`,
`fingerprintAlgorithm`, `fingerprintVersion` ve bunlardan üretilen
`canonicalSourceFingerprint` Shared Evidence / Document Platform authority'sidir.

Production read interface:

```text
resolveExactDocumentVersion({
  tenantId,
  caseId,
  documentId,
  requestedVersionId,
  expectedFingerprint?
})
```

yalnız immutable exact version döndürür. `current`, `latest`, version'sız lookup,
`updatedAt`, storage path, OCR text, current-version pointer veya legacy `CaseDocument`
üzerinden fallback yasaktır. Existing `CaseDocument` modeli
`LEGACY / INCOMPLETE PROJECTION`; disposition
`LEGACY_SOURCE_VERSION_UNRESOLVED`dır.

Current readiness:

```text
DOCUMENT AUTHORITY CONTRACT          READY
IMMUTABLE VERSION PERSISTENCE        MISSING
CANONICAL WRITER                     MISSING
EXACT-VERSION READ INTERFACE         MISSING
PRODUCTION PROVIDER                  MISSING
DOCUMENT SCHEMA / MIGRATION GO       MISSING / SHARED OWNER REQUIRED
```

Document V4 persistence/writer/read foundation RECEIVABLE paketi değildir. Ayrı Shared
Evidence / Document Platform owner GO'su, schema/migration authority'si ve disposable/live
execution kapıları gerektirir. RECEIVABLE yalnız bu foundation sonrasında kendi consumer
adapter'ını implemente edebilir.

#### Legal Basis source

Canonical identity:

```text
legalBasisCode
legalBasisVersion
legalBasisChecksum
registryReleaseId
registryReleaseChecksum
```

olarak korunur. `legalBasisCode` stable identity, `legalBasisVersion` immutable semantic
version'dır. Release immutable, versioned ve final legal ratifier tarafından onaylanmış
olmalıdır; canonical bytes/checksum, signature/ratifier evidence, effective interval ve
append-only revoke/supersession lifecycle'ı taşır. Automatic current/latest upgrade,
release substitution, metadata inference ve historical backfill yasaktır.

Target P3 modeli versioned artifact source of truth + compiled read-only DB projection;
ilk geçiş P1/L3 modeli signed versioned repository release + pure exact-version
resolver'dır. Signed release serialization, checksum/signature algorithmı, trust root ve ilk
authorized release manifest'i `D02-F01` içinde owner + final legal ratifier tarafından ayrıca
ratifiye edilmeden production resolver başlatılamaz.

Admission resolver exact requested version'ı çözer. Finalizer revalidation ise intent'te
pinlenmiş code/version/checksum/release ID/release checksum'u birebir hedefler; başka release
veya current registry görünümüne fallback yapamaz.

Current readiness:

```text
LEGAL BASIS AUTHORITY MODEL          READY
VERSION / RELEASE IDENTITY CONTRACT  READY
SIGNED RELEASE ARTIFACT              MISSING
SIGNATURE / TRUST ROOT CONTRACT      MISSING
FIRST AUTHORIZED RELEASE             MISSING
READ-ONLY PROJECTION                 MISSING
PRODUCTION RESOLVER / PROVIDER       MISSING
```

### 23.27.3. Deferred Formation Execution Contract

Canonical transaction ownership:

1. I02B admission; authorization ve exact-source resolution sonrası
   `ClaimItemFormationIntent + PENDING OfficeApproval + request audit` transaction'ının
   sahibidir. Admission ClaimItem üretmez.
2. OFFICE, approval decision transaction'ının sahibidir. Decision business effect değildir.
3. Yalnız committed `APPROVED` karar ayrı deferred Claim Formation executor'ına adaydır.
   `APPROVED_WITH_CHANGES`, rejected, cancelled, revision-requested veya expired karar
   fail-closed'dur.
4. RECEIVABLE I03 finalizer; ClaimItem, immutable ClaimFormationSnapshot, audit,
   DomainEvent/outbox ve OfficeApproval execution completion state'inin tek transaction
   sahibidir.
5. Finalizer `OfficeApprovalDomainSyncService.syncAfterDecision()` içinde nested transaction
   olarak çağrılamaz. Approval transaction'ı ile finalizer transaction'ı ayrı, sıralı ve
   idempotent'tir.

Finalizer intent-scoped advisory lock ve intent checksum'u ile duplicate execution'ı
önler. Aynı completed intent mevcut canonical ClaimItem/Snapshot sonucunu döndürür; farklı
checksum, bozuk completion state veya ikinci ClaimItem denemesi fail-closed'dur. Retry aynı
tenant + formationIntentId + intentChecksum identity'sini korur ve yeni audit/event/outbox
üretmez.

Final execution'daki exact authority revalidation, lock sonrasında açılan tek bir
transaction-consistent authority-read context kullanmalıdır. V1 production adapter:

- immutable exact-version payload'ı,
- execution anındaki lifecycle/effective durumunu,
- checksum/fingerprint ve resolution hash'ini

aynı bounded read context'te doğrular. Local read-only projection bu transaction context'ine
katılabilir. Remote provider, aynı consistency'yi kanıtlayan versioned CAS/lease veya eşdeğer
owner-ratified protocol olmadan kullanılamaz. Transaction dışı lifecycle read'i ile ardından
canonical write yapılması TOCTOU nedeniyle yasaktır.

I02B'nin admission-time read'i intent'e exact fingerprint/checksum/release bağlar; aradaki
değişiklik ClaimItem etkisi üretmez. I03 finalizer aynı bağları execution anında yeniden
doğrulamadıkça write yapamaz.

### 23.27.4. Nest composition ve capability strategy

Logical provider sınırları:

```text
Shared Document read module
  -> Shared exact-version read port

RECEIVABLE Legal Basis Registry module
  -> Legal Basis exact-version resolver

RECEIVABLE Claim Formation runtime module
  -> human authorization adapter
  -> Document consumer adapter
  -> Legal Basis resolver
  -> I02B admission service
  -> I03 finalizer
  -> deferred execution adapter
```

OFFICE generic module Claim Formation business effect'inin owner'ı olmaz; Claim Formation
runtime module da OfficeApproval engine/schema'sını yeniden tasarlamaz. Test adapters yalnız
test scope'unda kalır; production module graph'ına export veya silent fallback edilemez.

Admission ve execution için ayrı default-off capability gate gerekir. Eksik, blank, invalid
veya tanınmayan flag değeri `false` sayılır. Flag `true` iken required production provider
eksikse startup veya ilk invocation deterministic fail-closed olur; mock/test/default provider
kullanılmaz. D02-I03 yalnız dormant composition kurabilir. Public route, web/client migration,
human-create containment retirement ve gerçek runtime enablement sırasıyla I04/I05 ve ayrı
owner gates altında kalır.

### 23.27.5. Canonical error/disposition contract

Internal disposition public response'tan daha ayrıntılı olabilir; raw source identity,
tenant/case existence, checksum veya evidence payload public response/log'a sızdırılmaz.
Public mapping mevcut typed Claim Formation error shape'ini korur.

| Disposition | Admission | Finalizer | Retryability | Public exposure |
|---|---|---|---|---|
| `VERSION_NOT_FOUND` | No intent/write | No ClaimItem/Snapshot/write | Hayır; yeni valid input gerekir | Document için `FORMATION_SOURCE_UNAVAILABLE`, Legal Basis için `LEGAL_BASIS_VERSION_NOT_FOUND` |
| `RELEASE_NOT_FOUND` | No intent/write | No ClaimItem/Snapshot/write | Hayır; exact release düzeltilmelidir | `LEGAL_BASIS_VERSION_NOT_FOUND` |
| `AUTHORITY_UNAVAILABLE` | Fail-closed, no write | Fail-closed, no partial write | Evet; bounded retry, aynı idempotency identity | Generic `FORMATION_SOURCE_UNAVAILABLE`; altyapı detayı gizli |
| `REVOKED` | Yeni admission reddedilir | Existing intent stale/fail-closed | Hayır | Source unavailable veya legal basis not-effective |
| `SUPERSEDED` | Yeni admission exact superseded source ile reddedilir | Automatic upgrade yok; stale/fail-closed | Hayır; yeni intent gerekir | Generic unavailable/not-effective |
| `CHECKSUM_MISMATCH` | No intent/write | Integrity mismatch, no partial write | Hayır | `INVALID_FORMATION_CONTEXT`; checksum değeri gizli |
| `FINGERPRINT_MISMATCH` | No intent/write | Source mismatch, no partial write | Hayır | `SOURCE_FINGERPRINT_MISMATCH`; fingerprint değeri gizli |
| `SCOPE_MISMATCH` | No intent/write | No partial write | Hayır | Cross-tenant existence sızdırmayan generic unavailable |
| `LEGACY_UNRESOLVED` | Canonical admission yok | Canonical finalization yok | Hayır; ayrı migration/ratification gerekir | Generic unavailable; legacy row detayı gizli |

Provider/read timeout, temporary connection failure veya projection freshness failure
`AUTHORITY_UNAVAILABLE`dır. Missing/revoked/superseded/integrity/scope durumları retry ile
başka authority sonucu üretemez.

### 23.27.6. Security invariants

- Tenant ve actor trusted JWT/session context'inden gelir; request body/header authority olamaz.
- Document resolver tenant + case + object scope'u server-side doğrular; scope mismatch
  version existence'ını açıklamaz.
- Exact input'in version/release/fingerprint/checksum alanları request retry sırasında
  değiştirilemez; değişiklik duplicate conflict veya yeni intent gerektirir.
- Admission idempotency'si ile finalizer execution idempotency'si ayrı fakat intent checksum'u
  üzerinden bağlıdır.
- Revoked/superseded/stale authority silent current/latest upgrade üretmez.
- Test/mock adapter, legacy model veya missing provider fallback'i production legal state'e
  yazamaz.
- Capability flag tek başına activation authority değildir; provider readiness, migration
  readiness, I04 route contract ve ayrı owner runtime GO birlikte gerekir.
- Error/audit metadata PII-safe ve allowlist-only kalır.

### 23.27.7. Readiness ve canonical blocker register

| ID | Prerequisite | Readiness | Owner / disposition |
|---|---|---|---|
| `D02-BLK-DOC-01` | Document V4 immutable persistence + canonical writer + exact reader | `MISSING` | Shared Evidence / Document Platform; Receivable dışı owner GO + schema/migration gate |
| `D02-BLK-LB-01` | Signed Legal Basis release foundation, trust root ve first authorized release | `MISSING` | RECEIVABLE + final legal ratifier |
| `D02-BLK-PORT-01` | Admission/finalizer exact disposition ve pinned-release port alignment | `PARTIAL` | RECEIVABLE D02-I01/I02 |
| `D02-BLK-EXEC-01` | Deferred executor + transaction-consistent authority read context | `PARTIAL` | RECEIVABLE; OFFICE decision-only boundary preserved |
| `D02-BLK-NEST-01` | Production module/provider composition ve test-adapter isolation | `MISSING` | RECEIVABLE D02-I03 |
| `D02-GATE-FLAG-01` | Separate default-off admission/execution gates | `MISSING` | RECEIVABLE D02-I03; activation separately owner-gated |
| `D02-GATE-MIG-01` | I02A intent/snapshot physical foundation | `READY / LIVE APPLIED` | TRAIN-R02 ile applied; runtime authority üretmez |
| `D02-FOUND-I02B` | Typed admission core | `READY / DORMANT` | Formally closed |
| `D02-FOUND-I03` | Atomic/idempotent finalizer core | `READY / DORMANT` | Formally closed |

`D02-GATE-MIG-01` güncel current-state reconciliation'dır:
`pending-migration-coordination-register.md` §16, M6
`20260723100000_claim_formation_intent_snapshot_foundation` migration'ının TRAIN-R02 ile
2026-07-23'te canlıya uygulandığını kaydeder. I02A/I02B/I03 kapanış metinlerindeki
`NOT APPLIED` ifadeleri kendi pre-TRAIN-R02 tarihsel bağlamlarında korunur; güncel live state
`APPLIED`, runtime ise hâlâ `DEFAULT DISABLED`dır.

### 23.27.8. Dependency graph ve package plan

```text
RCV-CLAIM-FORM-P02-S08-D02-R01
  |
  +--> D02-F01 — Legal Basis Signed Release Foundation
  |      OWNER: RECEIVABLE + FINAL LEGAL RATIFIER
  |      SCHEMA: NONE for transitional P1/L3 artifact foundation
  |
  +--> SHARED-DOCUMENT-V4-FOUNDATION
         OWNER: SHARED EVIDENCE / DOCUMENT PLATFORM
         RECEIVABLE DIŞI
         SCHEMA / MIGRATION: SEPARATE OWNER GO REQUIRED

D02-F01
  -> D02-I01 — Legal Basis production resolver + provider

SHARED-DOCUMENT-V4-FOUNDATION
  -> D02-I02 — Receivable Document exact-version consumer adapter

D02-I01 + D02-I02 + I02B + I03
  -> D02-I03 — dormant Nest composition, authorization adapter,
                transaction-consistent deferred executor, default-off gates

D02-I03
  -> S08-I04 — web / convenience route migration

S08-I04
  -> S08-I05 — containment retirement, separately owner-gated
```

İlk bounded prerequisite `RCV-CLAIM-FORM-P02-S08-D02-F01 — Legal Basis Signed
Release Foundation`dır. Bu yalnız ayrı owner GO ile başlar; artifact formatı, deterministic
serialization/checksum, signature/trust-root, legal-ratifier evidence ve first authorized
release gate'ini kapatmalıdır. Shared Document V4 foundation paralel bir dependency olabilir,
fakat RECEIVABLE kendi adına başlatamaz.

### 23.27.9. Ratification ve non-authorizations

```text
RCV-CLAIM-FORM-P02-S08-D02-R01  RATIFIED DESIGN / CANONICAL
D02 IMPLEMENTATION              NOT STARTED / NOT AUTHORIZED
I04                             BLOCKED BY D02-BLK-DOC-01 + D02-BLK-LB-01 +
                                D02-BLK-PORT-01 + D02-BLK-EXEC-01 +
                                D02-BLK-NEST-01
PRODUCTION CALL-SITE            NONE
RUNTIME                         DEFAULT DISABLED
HUMAN CREATE CONTAINMENT        ACTIVE / UNCHANGED
SCHEMA / MIGRATION CHANGE       NONE
HISTORICAL BACKFILL             NONE
NEXT ELIGIBLE TASK              RCV-CLAIM-FORM-P02-S08-D02-F01
NEXT TASK AUTHORITY             OWNER GO REQUIRED
```

## 23.28. S08-D02-F01-R01 Legal Basis release ve trust-root contract — 2026-07-24

Owner ve final legal ratifier Ulaş Hüseyin Telli,
`RCV-CLAIM-FORM-P02-S08-D02-F01-R01` ile D02-F01 implementation'ının ihtiyaç duyduğu
release-format, canonical serialization, checksum, signature, trust-root ve legal-ratification
evidence contract'ını ratifiye etmiştir. Bu kayıt production artifact veya key üretmez; ilk
hukuki içerik, ayrı legal reviewer ve production public keys sağlanmadığı için first authorized
release hâlâ yoktur.

### 23.28.1. Release identity ve unsigned payload

```text
schemaVersion       RECEIVABLE_LEGAL_BASIS_RELEASE_V1
releaseVersion      POSITIVE DECIMAL STRING / NO LEADING ZERO
releaseId           RCV-LB-R<releaseVersion>
effectiveAt         UTC RFC3339 / YYYY-MM-DDTHH:mm:ssZ
legalBases          NON-EMPTY FOR PRODUCTION
```

`releaseId` ve `releaseVersion` global release identity'sidir; artifact oluşturulduktan sonra
değiştirilemez veya yeniden kullanılamaz. `legalBasisCode` formatı
`^[A-Z][A-Z0-9_]{2,63}$`; `releaseVersion` ve `legalBasisVersion` formatı leading-zero içermeyen
pozitif decimal string'dir. Runtime version sırasından current/latest çıkaramaz; yalnız exact
requested identity çözülebilir.

Her `legalBases[]` entry'si en az:

```text
legalBasisCode
legalBasisVersion
effectiveFrom
effectiveUntil
legalAuthorityReferences[]
subtypeRegistryBinding {
  registryId
  registryVersion
  registryChecksum
  allowedSubtypeCodes[]
}
sourceEvidenceCompatibility
liabilityCompatibility
interestEligibility
legalContent
```

taşır. `legalBasisCode` stable uppercase domain code; `legalBasisVersion` pozitif decimal string
ve immutable semantic version'dır. `effectiveUntil` yalnız açık-ended değilse bulunur; omit ile
`null` eşit değildir. Subtype Registry ayrı authority olarak kalır fakat exact
registryId/version/checksum ve açık allowed subtype listesiyle version-bound tüketilir. Tenant
overlay yalnız daha sıkı operational/evidence kısıtı ekleyebilir; legal content, category/subtype
mapping, effective interval, liability veya interest semantics'i gevşetemez/değiştiremez.

Initial release'in releaseId/version/effectiveAt değeri ve `legalBasisCode` listesi owner
tarafından sağlanmamıştır. Schema production'da non-empty liste ister; boş/demo/test payload
production release sayılamaz.

### 23.28.2. Canonical serialization ve checksum

Canonical unsigned release payload için:

1. Encoding UTF-8, BOM yasak; bütün string'ler Unicode NFC'dir.
2. Object key'leri Unicode code-point lexicographic sıradadır; duplicate/unknown key yasaktır.
3. Array'ler contract-defined sırada sağlanır: `legalBases[]` ve `entryChecksums[]`
   `(legalBasisCode, legalBasisVersion)` lexicographic; `allowedSubtypeCodes[]` lexicographic;
   `signatures[]` önce `LEGAL_REVIEWER`, sonra `FINAL_LEGAL_RATIFIER` sırasındadır.
   `legalAuthorityReferences[]` ratified author order'ını korur ve bu sıra signed content'tir.
   Serializer implicit sort yapmaz; yanlış sıra reddedilir, sıra değişikliği payload/checksum
   değişikliğidir.
4. Timestamp yalnız UTC, saniye hassasiyetli `YYYY-MM-DDTHH:mm:ssZ`dir; offset/fraction yasaktır.
5. Integer JSON integer veya canonical decimal string olabilir; leading plus/zero yoktur. Para
   değeri decimal string; float, exponent, `NaN` ve infinity yasaktır.
6. Optional alan yoksa omit edilir. Schema açıkça izin vermedikçe `null` yasaktır; null/omit
   birbirine dönüştürülemez.
7. Line ending LF; trailing whitespace ve terminal normalization side-effect'i yasaktır.

Her Legal Basis entry checksum'u entry'nin canonical byte'larının SHA-256 digest'idir.
`releaseChecksum`, canonical unsigned release payload byte'larının SHA-256 digest'inin
64-karakter lowercase hexadecimal gösterimidir. Signed manifest, signatures, ratification
evidence ve append-only lifecycle metadata checksum preimage'ine girmez. Checksum alanı payload'a
geri yazılıp circular hash üretilemez.

### 23.28.3. Signed manifest ve exact preimage

Signed release manifest en az:

```text
manifestSchemaVersion = RECEIVABLE_LEGAL_BASIS_RELEASE_MANIFEST_V1
releaseId
releaseVersion
payloadChecksum
entryChecksums[] { legalBasisCode, legalBasisVersion, checksum }
signatures[] {
  role
  signerId
  keyId
  algorithm
  signature
  signedAt
  authorityEvidenceRef
}
ratificationEvidence[] {
  evidenceSchemaVersion = RECEIVABLE_LEGAL_BASIS_RATIFICATION_EVIDENCE_V1
  ...
}
lifecycleEvidenceRefs[] {
  lifecycleSchemaVersion = RECEIVABLE_LEGAL_BASIS_RELEASE_LIFECYCLE_V1
  ...
}
```

taşır. Production algorithm yalnız `Ed25519`dır. Exact signed preimage byte dizisi:

```text
UTF8("RECEIVABLE_LEGAL_BASIS_RELEASE_V1")
+ 0x0A
+ ASCII(releaseChecksum)
```

olup sonunda newline/NUL yoktur. Signature, raw 64-byte Ed25519 çıktısının unpadded base64url
encoding'idir. `keyId`, raw 32-byte public key'in SHA-256 fingerprint'inden türeyen
`rcv-lb-ed25519-<64-lowercase-hex>` değeridir.

Production global activation iki farklı cryptographic signature gerektirir:

1. `LEGAL_REVIEWER`
2. `FINAL_LEGAL_RATIFIER`

Roller aynı signer identity, kişi veya key ile birleştirilemez. Final legal ratifier Ulaş Hüseyin
Telli'dir; reviewer ayrı ve owner-authorized legal professional olmalıdır. Developer, staff,
administrator, OfficeApproval veya runtime service bu rollerden birini üstlenemez. Eksik imza,
signature mismatch veya role/key reuse fail-closed'dur.

### 23.28.4. Production trust-root lifecycle

Production trusted-signer allowlist entry'si `keyId`, Ed25519 public key, signer identity,
professional authority evidence reference, allowed role, `validFrom`, optional `validUntil` ve
`ACTIVE / RETIRED / REVOKED / COMPROMISED` lifecycle state taşır.

- `ACTIVE`: geçerli interval içinde yeni ve historical verification.
- `RETIRED`: yeni signature yasak; yalnız kendi geçerli interval'indeki historical verification.
- `REVOKED`: yeni admission/finalization yok; disposition `REVOKED`.
- `COMPROMISED`: known cutoff sonrası bütün signatures reddedilir; cutoff güvenilir değilse key'in
  bütün release'leri fail-closed bloke edilir.

Rotation yeni append-only key entry'sidir; eski key, manifest, signature veya release mutate
edilemez. Historical verification, signing time + key validity + release lifecycle evidence'ını
birlikte doğrular. Production ve test trust roots farklı dosya/config/provider/allowlist
yüzeyleridir; test key'i production verifier tarafından yüklenemez. Private key repository,
database, logs, fixtures veya bu governance task'ında bulunamaz/üretilemez.

Production public keys henüz owner tarafından sağlanmamıştır. Bu nedenle trust-root contract
`RATIFIED`, trust-root key material ise `MISSING / OWNER PUBLIC-KEY INPUT REQUIRED`dır.

### 23.28.5. Legal-ratification evidence

Her release için checksum-bound evidence:

```text
ratifierIdentity
professionalAuthority
role
releaseId
releaseVersion
releaseChecksum
ratifiedAt
approvalStatement
evidenceSignatureOrReference
```

taşır. Legal reviewer ve final legal ratifier evidence'ı aynı exact checksum'a bağlanır.
Checksum'sız, başka checksum'a bağlı, mutable veya yalnız OfficeApproval içeren evidence geçersizdir.
Initial content için böyle bir evidence sağlanmadığından first release ratified değildir.

### 23.28.6. Verification dispositions ve lifecycle

```text
PAYLOAD / ENTRY CHECKSUM MISMATCH     CHECKSUM_MISMATCH
MALFORMED OR INVALID SIGNATURE        AUTHORITY_UNAVAILABLE / NON-RETRYABLE
MISSING SECOND SIGNATURE              AUTHORITY_UNAVAILABLE / NON-RETRYABLE
UNKNOWN / UNTRUSTED KEY               AUTHORITY_UNAVAILABLE / NON-RETRYABLE
TRANSIENT TRUST SOURCE OUTAGE         AUTHORITY_UNAVAILABLE / BOUNDED RETRY
REVOKED / COMPROMISED KEY             REVOKED / NON-RETRYABLE
SIGNED RELEASE SUPERSESSION           SUPERSEDED / NON-RETRYABLE
MISSING EXACT RELEASE                 RELEASE_NOT_FOUND / NON-RETRYABLE
```

Lifecycle release payload'ını mutate etmez. Activation, revoke ve supersession kararları exact
releaseId/checksum'a bağlı append-only, signed lifecycle evidence'dır. Automatic replacement,
current/latest fallback, historical inference, ClaimItem/snapshot mutation veya backfill
yasaktır.

### 23.28.7. Readiness ve implementation input checklist

```text
RELEASE ID / PAYLOAD SCHEMA            RATIFIED
CANONICAL SERIALIZATION                RATIFIED
SHA-256 CHECKSUM CONTRACT              RATIFIED
ED25519 PREIMAGE / ENCODING            RATIFIED
TWO-SIGNATURE / FOUR-EYES CONTRACT      RATIFIED
TRUST-ROOT LIFECYCLE CONTRACT           RATIFIED
RATIFICATION EVIDENCE CONTRACT          RATIFIED
INITIAL LEGAL CONTENT                   MISSING — OWNER CONTENT REQUIRED
INITIAL RELEASE ID / VERSION / DATE     MISSING — CONTENT NOT RATIFIED
LEGAL REVIEWER                          MISSING — OWNER APPOINTMENT REQUIRED
PRODUCTION PUBLIC KEYS                  MISSING — OWNER INPUT REQUIRED
FIRST AUTHORIZED RELEASE                NOT CREATED / NOT RATIFIED
D02-F01 IMPLEMENTATION                  BLOCKED
PRODUCTION RESOLVER / PROVIDER          NOT IMPLEMENTED
RUNTIME                                 DORMANT / DEFAULT DISABLED
I04                                     BLOCKED / NOT AUTHORIZED
```

Bu task docs-only contract ratification'dır. Production code, key generation/private-key
handling, artifact, schema/migration, projection, resolver/provider, runtime activation, Document
authority, I04/I05 veya historical data değişikliği yoktur.

---

# 24. Related documents ve zorunlu pointer'lar

Canonical repository'de en az şu pointer'lar bulunmalıdır:

```text
SYSTEM-CONSTITUTION.md
GOVERNANCE-INDEX.md
DEBTOR-GOVERNANCE.md
DOCUMENT-SOURCE-GOVERNANCE.md
ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md
ADR-013-FEE-HARC-SNAPSHOT-JOURNAL.md
ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md
master-triage-register.md
canonicalization-register.md
decision-log.md
```

`AGENTS.md` içinde şu mandatory-read pointer bulunmalıdır:

> ClaimItem, Due, collection effect, allocation, interest authority, legal balance, reversal veya consumer cutover değişikliğine başlamadan önce `RECEIVABLE-GOVERNANCE.md` okunmalıdır.

---

# Appendix A — Proposed / not ratified kararlar

Bu appendix implementation authority değildir.

```text
peşin harç minimum/floor politikası
tahsil harcı stage matrix
cezaevi harcı modeli
frozen FX observation contract candidate details:
  source / observationDate / rateType / applicationReason / value /
  retrievedAt / sourceHash / frozenState
official snapshot candidate details:
  lifecycle candidate: DRAFT → OFFICIAL_LOCKED → SUPERSEDED → VOIDED
  field/hash candidates: inputHash / resultHash / engineVersion / policyVersion /
  rateSourceReferences / generatedAt / generatedBy / lifecycleStatus
exact UYAP rich-interest mapping
partial reversal/refund modeli
```

Her madde ilgili ADR/contract altında ayrıca ratifiye edilmelidir.

---

# Appendix B — Future product architecture programı

Aşağıdaki konular gelecekte değerlendirilebilecek aday cross-domain architecture programı
başlıklarıdır. Bu liste ihtiyaç, öncelik, program kimliği, roadmap yükümlülüğü veya
implementation zorunluluğu oluşturmaz:

```text
Domain Ownership Constitution
Aggregate Boundaries
Lifecycle & State Machines
Event Constitution
Concurrency & Idempotency
Repository & Persistence Boundaries
Integration Constitution
Presentation / API Contracts
Versioning & Migration Policy
```

## B.1. Bu belgeyle ilişkisi

- Bu belge receivable domaininin stable authority ve boundary kurallarını tanımlar.
- Gelecekteki PAC-Full bu kuralları cross-domain mimariye bağlayabilir.
- PAC çalışması, ratifiye receivable invariant'larını sessizce değiştiremez.

```text
Status: FUTURE CANDIDATE / NOT RATIFIED / NOT IMPLEMENTATION AUTHORITY
```

---

# Appendix C — Non-normative current-state snapshot

```text
Status: VOLATILE / NON-NORMATIVE
Canonicalization review tarihi: 2026-07-12
Canonicalization review baseline: 298ed65a801c08d865c19372dc303ee29c08d0d3
Kural: Her karar öncesi canonical main'den yeniden doğrulanır.
```

## C.1. ADR-014

| Alan | Son gözlemlenen durum |
|---|---|
| W0 → PR-10 | CLOSED / CANONICAL within defined pre-cutover scope |
| Calculation completeness | PARTIAL / NOT COMPLETE |
| Production readiness | NOT READY |
| Compatibility adapter | ADDITIVE_SHADOW_ONLY |
| `consumerSwitchAuthorized` | false |
| `primaryDisplayEligible` | false |
| Legacy production consumer | PRIMARY / ACTIVE |
| Cutover authorization policy | DEFINED / CANONICAL; PR-11 authorization NOT AUTHORIZED |
| PR-11 → PR-14 | NOT AUTHORIZED |
| Runtime cutover | NOT AUTHORIZED |

## C.2. Evidence ve blocker

| Alan | Son gözlemlenen durum |
|---|---|
| Synthetic evidence | AVAILABLE |
| Exporter-model parity | VERIFIED within synthetic scope |
| Production empirical evidence | ABSENT |
| Selected D1–D9 crosswalk cells | OWNER_LEGAL_ACCEPTED / CANONICAL |
| Other crosswalk cells | UNVERIFIED / FAIL-CLOSED |
| Crosswalk contract | IMPLEMENTED / DORMANT (PR #1158, squash `4daac1375888a83abbe8e0eba267038299397cc1`) |
| Shared projection activation policy | OWNER-APPROVED / CANONICAL AFTER PR-A4-N0 MERGE; runtime authorization not granted |
| Numeric projection adapter | IMPLEMENTED / CANONICAL (PR #1172); consumed only by shared numeric XML path after PR-A4-N2 |
| Shared numeric XML projection consumer | ACTIVE in `UyapXmlService` preview/download/submit payload path (PR #1176); single consumer |
| Runtime projection consumption | ACTIVE / NUMERIC XML ONLY; production cutover authority not granted |
| Numeric / FAIZT exporter wiring | NOT AUTHORIZED |
| Submit enforcement | NOT AUTHORIZED |
| `VERIFIED_OFFICIAL` | NONE |
| PR-A4 | PARTIAL — R1 + N1 canonical; N2 shared numeric XML projection active; submit execution/FAIZT/cutover NOT AUTHORIZED |
| PR-A5 | PARTIAL — OD-A5-01..04 OWNER-APPROVED; PR-A5-1 dormant relation/projection/batch contract IMPLEMENTED; production consumer NONE; PR-A5-2/runtime activation NOT AUTHORIZED |
| VER-05 | OPEN |
| CAN-CUT-01 / CAN-CUT-02 | OPEN |

## C.3. İlgili programlar

| Program | Son gözlemlenen durum |
|---|---|
| ADR-013 | DRAFT / OWNER REVIEW |
| ADR-010 | Direction locked / execution gated |
| PAC-001-A | CLOSED / MERGED |
| PAC-Full | NOT DEFINED / NOT AUTHORIZED |

## C.4. Üst governance

| Belge | Son gözlemlenen durum |
|---|---|
| `SYSTEM-CONSTITUTION` | RATIFIED / BINDING / CANONICAL |
| `GOVERNANCE-INDEX` | RATIFIED / CANONICAL |

PR #1141 ratifikasyonu ve PR #1142 closure'ı canonical main'e merge edilmiştir.

---

# Appendix D — Owner ratification checklist

## D.1. Üst governance

- [x] `SYSTEM-CONSTITUTION` statüsü doğrulandı.
- [x] `GOVERNANCE-INDEX` statüsü doğrulandı.
- [x] Decision Log ile header statüleri uzlaştırıldı.

## D.2. Field authority

- [x] `ClaimItem.demandedAmount` canonical receivable amount olarak kabul edildi.
- [x] `ClaimItem.originalAmount` creation provenance olarak kilitlendi.
- [x] `ClaimItem.amount` compatibility-only olarak kabul edildi.
- [x] `ClaimItem.collectedAmount` non-authoritative olarak kabul edildi.
- [x] `ClaimItem.interestTypeCode` canonical calculation read authority olarak kabul edildi.
- [x] Due → ClaimItem tek yönlü bridge kabul edildi.
- [x] ClaimItem → Due reverse-write yasaklandı.

## D.3. Collection / allocation

- [x] Case-scoped payment workflow kabul edildi.
- [x] TBK100 sıra invariantı kabul edildi.
- [x] Principal/interest-base mutation kuralı kabul edildi.
- [x] Negatif payment ve float-dust kuralları kabul edildi.
- [x] Receivable policy / Collection orchestration / single-writer cross-domain boundary kabul edildi.

## D.4. Reversal / FX

- [x] Full reversal invariantı dar kapsamıyla kabul edildi.
- [x] Partial reversal/refund kapsam dışı bırakıldı.
- [x] Currency CURRENT/TARGET ayrımı kabul edildi.

## D.5. Cutover

- [x] Adapter hazır ≠ cutover ilkesi kabul edildi.
- [x] Owner cutover pack zorunluluğu kabul edildi.
- [x] PR-11 → PR-14 sırası ve ayrı gate'ler kabul edildi.
- [x] Synthetic evidence'in production evidence olmadığı kabul edildi.

## D.6. Fee / journal / snapshot

- [x] Fee özel politikalarının ADR-013'e bırakılması kabul edildi.
- [x] Journal / Trace / Snapshot ayrımı kabul edildi.
- [x] ADR-010 additive hardening istisnası kabul edildi.

## D.7. Repository governance

- [x] Evidence-before-closure statü zinciri kabul edildi.
- [x] `Master Register yap` kapanış kuralı kabul edildi.
- [x] `AGENTS.md` mandatory pointer kabul edildi.

## D.8. Ratifikasyon sonucu

```text
RATIFIED / CANONICAL
```

---

# Nihai anayasal hüküm

> **Alacak domaininde canonical olmak, tek bir model veya tek bir servis kullanmak değildir. Her hukuki semantiğin tek, açık ve kanıtlanabilir bir authority'si olması; ingress, collection, allocation, calculation, persistence ve presentation sınırlarının çift yönlü veya sessiz fallback üretmeden korunmasıdır. ADR-014 pre-cutover çekirdeği bu hedefin hesaplama katmanını kurar; production consumer cutover yalnız owner-gated contract ile yapılır. Fee, journal, snapshot, FX ve integration alanları kendi ratifiye authority sözleşmeleri olmadan receivable core'a gizlice eklenemez.**
