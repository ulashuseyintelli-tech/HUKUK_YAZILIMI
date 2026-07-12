# Borçlu Platformu Governance — Kanonik Operasyonel Referans

```text
Belge yolu   : project/docs/governance/DEBTOR-GOVERNANCE.md
Durum        : RATIFIED — CANONICAL GOVERNANCE (owner ratifikasyonu: 2026-07-12)
Sürüm        : v1.0 (ratifiye, 2026-07-12)
Önceki ad    : debtor-platform-governance.md (ratifikasyon öncesi taslak çalışma adı)
Kaynak       : "BORÇLU PLATFORMU — MASTER SYNTHESIS, DECISION ARCHITECTURE & EXECUTION ROADMAP" (v2)
               → repo'da: project/docs/analysis/debtor-master-synthesis-v2.md
               (bundan sonra: Master Synthesis; kanıt ve gerekçe katmanı)
Kimlik uzayı : `MS/` öneki Master Synthesis içi kimlikleri işaretler (MS/DEC-xx, MS/ADR-xx, MS/OD-xx,
               MS/EXEC-xx, MS/GATE-x, MS/LG-xx, MS/EPIC-xx, MS/CAP-xx, MS/FND-xx). Bu kimlikler repo
               ADR kütüğünün (project/docs/governance/architecture-index.md, project/docs/adr/)
               kimlikleri DEĞİLDİR ve onlarla çakıştırılamaz.
Yol sözleşmesi: Bu belgedeki tüm repo yolları repo köküne göredir ve `project/` önekiyle yazılır.
               Örnek: repo ADR-013 (Fee/Harç/Snapshot/Journal) ve repo ADR-014 (CCB-001 Canonical Legal
               Calculation Core), MS/ADR-013 (kanonik DebtorScore) ve MS/ADR-014 (feature store ilk faz)
               ile İLGİSİZDİR. Bir MS/ADR önerisi repo ADR'ına dönüşecekse, repo kanonik ADR numarası ile
               yeni ADR açılır; MS numarası taşınmaz.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Okuma sırası: `project/docs/governance/GOVERNANCE-INDEX.md`
- Kanıt/gerekçe (derived from): `project/docs/analysis/debtor-master-synthesis-v2.md`
- Karar kaydı: `project/docs/governance/decision-log.md`
- ADR kütüğü: `project/docs/governance/architecture-index.md` + `project/docs/adr/`
- Register'lar: `project/docs/governance/product-backlog.md`, `project/docs/governance/master-triage-register.md`, `project/docs/governance/active-roadmap.md`
- Ajan baseline: `AGENTS.md` (repo kökü; bu belge onu override etmez)

---

## 1. Document Authority

### System Constitution v1.0 Alignment

`SYSTEM-CONSTITUTION.md` sistem çapında üst semantik normdur; bu belge ratifiye edilmiş
Debtor Domain Law olarak onu borçlu domaininde ayrıntılandırır, değiştiremez veya
zayıflatamaz. Bu belgedeki `Party`, `Liability`, `LegalServiceDate`, `LegalStatus`,
`EnforcementEligibility` ve `LegalGuard` ifadeleri aksi açıkça belirtilmedikçe **target
domain authority**'dir; belgede bulunmaları current runtime implementation veya cutover
kanıtı değildir. Current runtime statüsü System Constitution'ın current/target modeli,
repository evidence ve ilgili compliance kayıtlarından okunur.

`LegalServiceDate = Tebligat.tebligSayilmaDate` bu Domain Law'ın target authority
ifadesidir; cutover tamamlanmadan production current authority olarak kullanılamaz.
Competing legal-time authority varsa `PRODUCTION_NO_GO` uygulanır. Finansal kesişimlerde
DBIND, TM3 ve Constitution'ın `Collection Receipt ≠ Legal Allocation / TBK 100 ≠
Creditor Disposition ≠ Payout / Offset ≠ Accounting Journal Posting` ayrımı korunur.
`SettlementOffer`, `LegalSettlement / Sulh` ile `ClientSettlement / Creditor Disposition`
ayrımını bozamaz.

§8 foundation order ve Master Synthesis roadmap'i implementation sırasıdır; tek başına
canonical authority, runtime izni, cutover veya owner approval oluşturmaz. Alignment
note ile çözülemeyen gerçek norm çatışması owner-governance amendment gerektirir.

**Amaç.** Bu belge, borçlu platformu hattındaki bütün ajan görevleri (Claude, Codex veya başka bir ajan) için **bağlayıcı başlangıç referansıdır**. Master Synthesis'te uzlaştırılmış kanonik kararları kısa, kesin ve operasyonel kurallara çevirir. Analiz, tasarım, implementation, review ve governance görevleri bu belgedeki terminoloji, sahiplik, invariant, sıra ve gate kurallarına uymak zorundadır.

**Kapsam.** §2'de listelenen borçlu hattı alanları. Bu alanlardaki model, servis, controller, migration, event, read-model, UI yüzeyi ve governance işleri kapsamdadır.

**Zorunlu okuma.** Aşağıdaki görev tiplerinden herhangi biri §2 kapsamındaki bir alana dokunuyorsa, göreve başlamadan önce bu belge okunur ve §14 Pre-Task Checklist cevaplanır:
analiz (GO-ANALYZE) · tasarım/ADR taslağı · implementation (GO-IMPLEMENT/GO-COMPLETE) · code review · migration/backfill · test/CI değişikliği · governance kaydı güncellemesi.

**Master Synthesis ile ilişki.** Master Synthesis kanıt, gerekçe, çelişki-çözümü ve yol haritası katmanıdır; **audit kaynağı olarak korunur**. Bu belge onun operasyonel damıtmasıdır: kural burada, kanıt orada. İki belge çelişirse çelişki raporlanır ve governance PR ile düzeltilir; ratifiye edilmiş olan bu belge operasyonda esas alınır.

**Bu belgenin source-of-truth OLMADIĞI alanlar:**

- Mevcut runtime davranışı → repo kodu (AS-IS gerçeği her görevde repo state'ten doğrulanır).
- Backlog ve görev durumu → `project/docs/governance/product-backlog.md`.
- Karar geçmişi ve kapanış kayıtları → `project/docs/governance/decision-log.md`.
- Repo ADR kütüğü → `project/docs/governance/architecture-index.md` + `project/docs/adr/`.
- Fee/Harç/Snapshot/Journal hattı → repo ADR-013; claim-balance/kanonik hesaplama hattı → repo ADR-014 (CCB-001); finansal otorite → `project/docs/governance/dbind-financial-authority-decisions.md`. Bu belge bu hatları **override etmez**; Collection/Liability kesişimlerinde koordinasyon zorunludur (MS/DEC-05b).
- Verilmemiş owner kararları → §8.2'deki owner kapıları AÇIK'tır; bu belge hiçbirini verilmiş saymaz.

**Governance değişikliği.** Bu dosya yalnız governance PR'ı ile değiştirilir; karar değişiklikleri `decision-log.md`'ye kaydedilir (ayrıntı: §17).

---

## 2. Scope

| Alan grubu | Kapsanan kavram/model |
|---|---|
| Kimlik | Party, PartyIdentity, PartyMatch (merge/split), PartyAlias, PartyEvolution |
| Borçlu | Debtor, CaseDebtor, LegalRole, Liability (LiabilityGroup/Allocation dahil) |
| Adres & Tebligat | AddressEvidence, ServiceAttempt, NotificationResult, LegalServiceDate |
| Hukuki durum | DebtorLegalStatus, EnforcementEligibility, EligibilityFact |
| Finansal davranış | Collection (ledger), PaymentPromise, SettlementOffer |
| Event altyapısı | DomainEvent, EventOutbox, Timeline projection |
| Zekâ katmanı | BehaviorFeature, FeatureSnapshot, DebtorScore, LegalGuard, NextBestAction, HumanApproval |
| Ürün yüzeyleri | Digital Twin, Borçlu 360, AIRecommendation (AIContextBuilder dahil) |
| Yatay | Tenant izolasyonu, KVKK, AuditLog/LegalEvidence ayrımı |

**Kapsam dışı (ayrı hatlar):** Fee/Harç policy (repo ADR-013), claim-balance cutover (repo ADR-014 / CCB-001), muhasebe otoritesi (DBIND). Bu hatlarla kesişen değişiklik koordinasyon gerektirir, bu belge tek başına yetki vermez.

---

## 3. Canonical Glossary

Kısa ve bağlayıcı tanımlar. Ayrıntılı tanım tablosu Master Synthesis §C'dedir; çelişkide ratifiye edilmiş bu belge esas alınır.

| Kavram | Bağlayıcı tanım |
|---|---|
| Party | Dış taraf kimlik kökü (tenant-local — MS/ADR-001) |
| PartyIdentity | Party'nin doğrulanabilir kimlik numaraları (TCKN/VKN/MERSIS/DETSIS/KEP) |
| PartyMatch | İki kaydın aynı kişi olduğunun eşleştirmesi; exact auto-link, fuzzy insan-onaylı, merge geri alınabilir (MS/ADR-003) |
| Debtor | Party'nin borçlu profili |
| CaseDebtor | Dosyadaki borçlu ilişkisi + rol |
| LegalRole | Dosyadaki hukuki sıfat (CaseDebtor seviyesi) |
| Liability | Hangi borçtan ne kadar / hangi rejimde sorumluluk |
| AddressEvidence | Adresin kaynağı + kanıtı + güveni; immutable |
| ServiceAttempt | Tek bir tebligat denemesi; kanıt-korumalı |
| NotificationResult | Tebligat denemesinin sonucu (hatırlatma bildirimi değil) |
| LegalServiceDate | Kanonik tebliğ / tebliğ-sayılma tarihi (`Tebligat.tebligSayilmaDate` — MS/ADR-005) |
| DebtorLegalStatus | Ölüm/iflas/konkordato/tasfiye durumu; delilli, insan-onaylı geçiş |
| EnforcementEligibility | Bu an hangi aksiyonun hukuken mümkün olduğu (fact üretir) |
| LegalGuard | Aksiyonu hukuki kurala göre ALLOW/BLOCK/WARN eden deterministik kapı |
| LegalEvidence | Hukuki delil; immutable/WORM, silinemez |
| DomainEvent | Davranış sinyali ve replay kaynağı; transactional outbox ile yayınlanır |
| EventOutbox | DomainEvent'in transactional yayınlama kuyruğu |
| AuditLog | Kullanıcı işlem izi; sanitize edilir (repo ADR-011) |
| Collection | Tahsilat/mahsup ledger'ı; idempotent, yeniden yazılamaz |
| PaymentPromise | Ödeme vaadi + tutma sonucu (KEPT/BROKEN) |
| SettlementOffer | Sulh teklifi + karar + müvekkil onayı |
| BehaviorFeature | Ölçülebilir, açıklanabilir davranış türev-değeri |
| FeatureSnapshot | Skor hesabında kullanılan immutable feature seti |
| DebtorScore | İstatistiksel olasılık/öncelik; versiyonlu, tek motor (MS/ADR-013 — repo ADR-013 ile ilgisiz) |
| NextBestAction (NBA) | Guard'dan geçmiş öneri/görev; komut değil |
| HumanApproval | İnsan onay kaydı (OfficeApproval REUSE) |
| AIContextBuilder | LLM'e giden tenant-safe, PII-minimize bağlam üreticisi |
| AIRecommendation | LLM üretimi özet/açıklama/taslak; işlem değil |
| Digital Twin | Read-model birleşimi; türev görünüm |
| Borçlu 360 | Kanonik veriden beslenen karar deneyimi yüzeyi (read-only başlar) |
| Tenant / KVKK | Her kayıt tenant-scoped; kişisel veri işleme KVKK'ya tabi, fail-closed (MS/ADR-019) |

**Bağlayıcı ayrımlar (karıştırma yasağı):**

```text
Party ≠ Debtor                       (kimlik kökü ≠ borçlu profili)
Debtor ≠ CaseDebtor                  (profil ≠ dosyadaki ilişki/rol)
LegalRole ≠ Liability                (hukuki sıfat ≠ tutar/rejim sorumluluğu)
ServiceAttempt/Tebligat ≠ NotificationQueue   (hukuki tebligat ≠ hatırlatma kuyruğu)
DebtorScore ≠ hukuki karar           (olasılık ≠ hüküm; skor hukuki sonuç doğurmaz)
EnforcementEligibility ≠ NextBestAction        (hukuken mümkün ≠ önerilen)
LegalGuard ≠ AI                      (deterministik hukuki kural ≠ istatistik/LLM)
DomainEvent ≠ AuditLog               (davranış sinyali ≠ kullanıcı işlem izi)
LegalEvidence ≠ AuditLog             (WORM hukuki delil ≠ işlem izi)
Digital Twin ≠ Source of Truth       (türev görünüm ≠ transactional kaynak)
AIRecommendation ≠ Action Command    (öneri/taslak ≠ yürütülen işlem)
```

---

## 4. Canonical Source-of-Truth Register

| Alan | Kanonik kaynak | Yazma yetkisi | Türev/read-model | Yasak alternatif |
|---|---|---|---|---|
| Kimlik | Party + PartyIdentity | PartyRegistryService | kimlik kartı | Debtor'u kimlik kökü saymak; cross-tenant global Party |
| Borçlu profili | Debtor | DebtorIdentityService | Borçlu 360 | profili Case seviyesine gömmek |
| Dosya-borçlu ilişkisi | CaseDebtor | CaseDebtorRelationService | rol kartı | dosya ilişkisini Debtor'a gömmek |
| Hukuki rol | CaseDebtorLegalRole (CaseDebtor) | LiabilityService (rol+sorumluluk adımı — MS §I; CaseDebtor ilişkisinin kendisi CaseDebtorRelationService) | rol/sorumluluk görünümü | rolü Liability tutarından türetmek |
| Sorumluluk | Liability / LiabilityGroup / LiabilityAllocation | LiabilityService (Accounting koordineli — MS/DEC-05b) | sorumluluk görünümü | düz `liabilityAmount` tek alanı; Collection'dan türetme |
| Adres delili | AddressEvidence (immutable) | Address&Evidence servisleri | adres görünümü | DebtorAddress satırını delil saymak |
| Tebligat sonucu | ServiceAttempt + NotificationResult | ServiceOfProcessService (insan onaylı) | tebligat paneli | NotificationQueue; mock PTT/UETS provider yazımı |
| Hukuki tebliğ tarihi | LegalServiceDate (= `Tebligat.tebligSayilmaDate`) | ServiceOfProcessService | süre göstergesi | `NotificationQueue.deliveredAt` |
| LegalStatus | DebtorLegalStatus + LegalStatusHistory | DebtorLegalStatusService (insan-onaylı geçiş) | engel banner | serbest metin / hayalet alan; risk flag |
| EnforcementEligibility | EnforcementEligibility + EligibilityFact | EnforcementEligibilityService | engel kartı | NBA çıktısını uygunluk saymak |
| Tahsilat | Collection ledger (REUSE) | Collection Ledger context servisleri | rapor read-model | ledger yeniden yazımı; bypass; NBA/AI yazımı |
| Ödeme vaadi | PaymentPromise + Outcome | PaymentPromise&Settlement servisleri | kept-ratio feature | vaadi Collection'a gömmek |
| Sulh | SettlementOffer (+ OfficeApproval kaydı) | PaymentPromise&Settlement + OfficeApprovalService | onay merkezi | otomatik sulh; AI sulh uygulaması |
| Domain event | DomainEvent + EventOutbox (mevcut altyapı EXTEND — MS/ADR-007) | DomainEventService (transactional outbox) | timeline projection | AuditLog'u event kaynağı saymak; ikinci/rakip event altyapısı |
| Skor | DebtorScore + ScoreFactor + ScoreSnapshot | DebtorScoringService (tek motor; girdisi context 11'in FeatureSnapshot'ı — ona yazamaz) | skor + açıklama UI | `Case.riskScore`; rakip skor motorları |
| NBA | NBARecommendation + NBAOutcome | NextBestActionService (LegalGuard zorunlu) | NBA paneli | NBA çıktısını doğrudan komuta çevirmek |
| AI | AIRecommendationLog (stateless öneri kaydı) | AIRecommendationService + AIContextBuilder | açıklama paneli | AI'nin kanonik alana yazması; ham/PII bağlam |
| Digital Twin | — (kanonik kaynağı YOKTUR; tamamen türev) | ReportingReadModelService (yalnız read-model) | Digital Twin / Borçlu 360 | twin'i SoT saymak; twin'den kanonik modele geri yazma |

---

## 5. Non-Negotiable Invariants

Her kural test edilebilirdir; parantezde zorunlu test gate'i (§13).

```text
INV-01  Tenant-owned bütün okumalar ve yazmalar tenant-scoped olmak zorundadır.        (TENANT_ISOLATION)
INV-02  Batch işlemler tüm girdilerin tenant ownership'ini tek tek doğrular.           (TENANT_ISOLATION, AUTHORIZATION)
INV-03  Mock/random/demo veri kanonik hukuki veya finansal state'e yazılamaz.          (NO_MOCK_PRODUCTION)
INV-04  NotificationQueue hukuki süre otoritesi değildir.                              (LEGAL_CORRECTNESS)
INV-05  Kanonik hukuki süre LegalServiceDate üzerinden yürür.                          (LEGAL_CORRECTNESS)
INV-06  AI/NBA doğrudan hukuki veya finansal işlem yapamaz.                            (NBA_NO_SIDE_EFFECT, LEGAL_GUARD)
INV-07  Party fuzzy match insan onayı olmadan merge edilemez; merge geri alınabilirdir. (AUTHORIZATION)
INV-08  AuditLog, DomainEvent veya LegalEvidence yerine kullanılamaz.                  (EVENT_REPLAY, LEGAL_CORRECTNESS)
INV-09  Digital Twin ve read-model transactional source of truth değildir;
        read-model'den kanonik modele yazma yolu yoktur.                               (EVENT_REPLAY, UI_DECISION_SAFETY)
INV-10  Collection ledger yeniden yazılamaz veya bypass edilemez.                      (FINANCIAL_INVARIANT)
INV-11  Geçmiş tebligat, tahsilat ve hukuki delil kayıtları geriye dönük mutasyonla
        bozulamaz; LegalEvidence WORM'dur.                                             (LEGAL_CORRECTNESS, FINANCIAL_INVARIANT)
INV-12  DomainEvent yayını transactional ve idempotenttir (outbox disiplini).          (EVENT_IDEMPOTENCY)
```

---

## 6. Bounded Context Ownership

Master Synthesis §H'deki kanonik ayrım aynen korunur (18 context):

| Context | Sorumluluk | Yazdığı modeller | Ürettiği event | Bağımlılık |
|---|---|---|---|---|
| 1 Party & Identity | kimlik kökü + eşleştirme | Party, PartyIdentifier, PartyAlias, PartyEvolution, MatchCandidate, MergeLog | PARTY_CREATED, PARTY_IDENTITY_ADDED, PARTY_MERGED | — |
| 2 Debtor Profile | borçlu profili | Debtor | DEBTOR_CREATED, DEBTOR_UPDATED | 1 |
| 3 CaseDebtor & Liability | dosya rolü + sorumluluk | CaseDebtor, CaseDebtorLegalRole, Liability, LiabilityGroup, LiabilityAllocation | CASE_DEBTOR_ADDED, ROLE_CHANGED | 2, 7 |
| 4 Address & Evidence | adres + kanıt | DebtorAddress, AddressEvidence | ADDRESS_EVIDENCE_ADDED | 2 |
| 5 Service of Process | tebligat + kanonik tarih | Tebligat, ServiceAttempt, ServiceHistory | SERVICE_RESULT_RECORDED, SERVICE_LEGAL_DATE_CONFIRMED | 3, 4 |
| 6 Legal Status & Eligibility | hukuki durum + uygunluk | DebtorLegalStatus, LegalStatusHistory, EnforcementEligibility, EligibilityFact | LEGAL_STATUS_CHANGED | 2, 3, 5 |
| 7 Collection Ledger (REUSE) | tahsilat/mahsup | Collection, Allocation, Overpayment | COLLECTION_RECORDED | 3 |
| 8 Intelligence & Asset | saha istihbaratı + varlık | DebtorIntelligence, AssetSignal | ASSET_SIGNAL_FOUND | 2, 3 |
| 9 PaymentPromise & Settlement | vaat + sulh | PaymentPromise, Outcome, SettlementOffer | PROMISE_KEPT/BROKEN, SETTLEMENT_* | 3, 7 |
| 10 Domain Events & Outbox | event + yayın | DomainEvent, EventOutbox | (tümü) | tüm yazan context'ler |
| 11 Behavior & Features | feature türetme | BehaviorFeature, FeatureSnapshot | — | 10 |
| 12 Scoring | skor | DebtorScore, ScoreFactor, ScoreSnapshot | — | 11 |
| 13 LegalGuard | hukuki kural | GuardRule, GuardEvaluation | GUARD_BLOCKED_ACTION | 6 |
| 14 Next Best Action | öneri/görev | NBARecommendation, NBAOutcome | NBA_PROPOSED/ACCEPTED/REJECTED | 6, 12, 13 |
| 15 AI Recommendation | açıklama/taslak | AIRecommendationLog | AI_RECOMMENDATION_CREATED | 11, 13 |
| 16 Read Models & Reporting | okuma modeli | matview / read tabloları | — | 10 |
| 17 Product Surfaces (360) | karar deneyimi | — (yalnız okur) | — | 6, 10, 12, 14 |
| 18 Audit & Evidence | delil/iz | AuditLog, LegalEvidence | — | tümü |

Kural: bir context başka context'in kanonik modeline **yazamaz**; iletişim DomainEvent veya servis sözleşmesi üzerindendir. Read Models (16-17) hiçbir kanonik modele yazmaz.

---

## 7. Legal and Financial Action Boundaries

**Sınıf tanımları:**

```text
SAFE_AUTO                : Guard'lı otomatik yürütülebilir; hukuki/finansal state yazmaz veya
                           yalnız kendi kanonik alanına yazar.
AUTO_PREPARE_ONLY        : Sistem yalnız taslak/öneri hazırlar; yürütme insandadır.
SHADOW_ONLY              : Üretilir ama kullanıcıya gösterilmez ve hiçbir yan etki yaratmaz;
                           yalnız log/karşılaştırma.
REQUIRES_HUMAN_APPROVAL  : Kanonik kayıt/yürütme yalnız insan onayıyla (gerekiyorsa HumanApproval
                           kaydıyla) gerçekleşir.
NEVER_AUTO               : Hiçbir otomasyon/AI/NBA tetikleyemez; her zaman insan yürütür.
REJECT                   : Talep sınıf olarak reddedilir; hiçbir koşulda yapılmaz.
```

| Aksiyon | Sınıf | Guard / Not |
|---|---|---|
| Adres araştırma görevi | SAFE_AUTO | tenant scope; yalnız görev üretir |
| Adres önerisi | AUTO_PREPARE_ONLY | kanonik adres/delil yazımı insan onaylı |
| Tebligat taslağı | AUTO_PREPARE_ONLY | gönderim insanda |
| Tebligat sonucu (kanonik kayıt) | REQUIRES_HUMAN_APPROVAL | NO-MOCK (MS/LG-06); ServiceAttempt kanıt-korumalı |
| Süre hesabı | SAFE_AUTO | yalnız LegalServiceDate'ten; zamanaşımında WARN zorunlu (MS/LG-10) |
| Kesinleşme değerlendirmesi | REQUIRES_HUMAN_APPROVAL | LegalGuard'dan geçer |
| Malvarlığı sorgusu önerisi | SAFE_AUTO | eligibility fact şartı; yalnız öneri/görev |
| Haciz taslağı | AUTO_PREPARE_ONLY | MS/LG-01/02/03 (tebligatsız/itirazda/ölümde BLOK) |
| Haciz gönderimi | REQUIRES_HUMAN_APPROVAL | guard + insan onayı olmadan gönderilemez |
| Ödeme vaadi takibi | SAFE_AUTO | PaymentPromise kendi kanonik alanı |
| Sulh taslağı | AUTO_PREPARE_ONLY | MS/LG-08; müvekkil onayı şartı |
| Otomatik sulh (self-service) | REJECT | MS/ADR-020 |
| İndirim uygulama | NEVER_AUTO | — |
| Tahsilat tahsisi | NEVER_AUTO | Collection ledger'a otomasyon yazamaz |
| Borçlu iletişimi | REQUIRES_HUMAN_APPROVAL | KVKK izni yoksa BLOK (MS/LG-09) |
| Müvekkil onayı | REQUIRES_HUMAN_APPROVAL | OfficeApproval REUSE; onay insan aksiyonudur |
| Dosya kapama | REQUIRES_HUMAN_APPROVAL | LegalGuard'dan geçer |
| NBA görev üretimi | SHADOW_ONLY → SAFE_AUTO | MS/GATE-6 (shadow, sıfır yan etki) geçilmeden kullanıcıya çıkamaz; sonrasında guard'lı görev üretimi |
| AI açıklaması | AUTO_PREPARE_ONLY | AIContextBuilder zorunlu; tenant-safe, PII-min |
| Party merge (fuzzy) | REQUIRES_HUMAN_APPROVAL | undo/SPLIT zorunlu; exact kimlik eşleşmesi auto-link olabilir (MS/ADR-003) |
| LegalStatus transition | REQUIRES_HUMAN_APPROVAL | delil (Evidence) zorunlu |
| AI → doğrudan işlem | REJECT | MS/ADR-016; MS/LG-07 |

**LegalGuard kural kataloğu referansı (MS/LG):** LG-01 tebligatsız haciz BLOK · LG-02 itirazda haciz BLOK · LG-03 ölümde takip BLOK · LG-04 konkordatoda haciz/satış BLOK · LG-05 iflasta ferdi takip BLOK · LG-06 mock ≠ legal fact · LG-07 AI finansal yazamaz · LG-08 NBA sulh indirimi REQUIRE_APPROVAL · LG-09 KVKK izni yoksa iletişim BLOK · LG-10 zamanaşımı WARN zorunlu. Tam katalog ve madde dayanakları Master Synthesis §U'dadır; implementation öncesi LegalGuard Rule Catalogue dokümanı zorunludur (sahibi: Legal Domain Owner — LDO).

---

## 8. Mandatory Foundation Order

### 8.1 Bağlayıcı sıra

```text
Security/tenant stabilization
→ canonical legal truth and time authority
→ Party/CaseDebtor/LegalRole/Liability
→ LegalStatus/EnforcementEligibility
→ DomainEvent/Outbox/Timeline
→ behavior signals
→ Feature/DebtorScore
→ LegalGuard
→ NBA shadow
→ user-facing NBA
→ Borçlu 360
→ tenant-safe AI explanation
→ Digital Twin
```

Bu sıra bir **release-gate sırasıdır**: bir halka production-ready sayılmadan sonraki halka user-facing olamaz. Halka sırası, Master Synthesis'in aşağıdaki kanonik paralellik izinlerini kısıtlamaz:

- **MS/DEC-15** — DomainEvent v1, Party'yi beklemez; Debtor/CaseDebtor aggregate ile başlar, Party event'leri additive eklenir.
- **MS/DEC-17** — LegalGuard Core v1 mevcut fact'lerle P0 sonrası başlar; Full sürüm LegalStatus/Eligibility sonrası.
- **MS/DEC-18** — Rule-based NBA Shadow, Score'u beklemez; Score-ranked NBA, LegalGuard Full + Score'u bekler.
- **MS/DEC-16** — Minimum Twin read-model NBA'dan önce gelir (context sağlar); full Digital Twin en sondadır.
- **MS §J paralel hattı** — demo temizliği, EnforcementAction FK, Müvekkil Onay Merkezi (OfficeApproval REUSE; zincir dışı, P0 sonrası paralel user-facing yüzey) ve Party (P0 sonrası; DomainEvent'i beklemez) foundation zincirine paralel yürüyebilir.
- **Liability notu** — üçüncü halkadaki Liability, MS/OD-07 kapısına bağlıdır ve MS yol haritasında LegalStatus'tan sonra da tamamlanabilir; halka sırası LegalStatus/Eligibility'yi Liability'ye **bekletmez** (MS bozulamaz sırası: P0 → {DomainEvent v1, LegalStatus, LegalGuard Core} → {Eligibility, LegalGuard Full} → Score-NBA).

```text
Foundation tamamlanmadan advanced AI/NBA/Digital Twin capability'leri
production-ready veya user-facing kabul edilemez.
```

Sıranın ihlali `AI_NBA_FOUNDATION_ORDER_VIOLATION` üretir ve Hard Stop'tur (§16).

### 8.2 Owner kapıları (tümü AÇIK — bu belge hiçbirini verilmiş saymaz)

| Kapı | Konu | Bloke ettiği |
|---|---|---|
| MS/EXEC-01 | P0 stabilizasyonunu (tenant/mock/süre) implementation'a açma onayı | tüm program |
| MS/OD-02 | Tenant stratejisi (katmanlı savunma) | tenant hardening |
| MS/OD-03 | Süre rebase yöntemi (shadow→cutover) | legal time rebase |
| MS/OD-04 | Party Faz 0 açılışı | Party, cross-case kimlik |
| MS/OD-05 | `Case.riskScore` RETIRE | kanonik skor |
| MS/OD-06, MS/OD-13 | LegalStatus seviyesi; tereke/mirasçı/birleşme | LegalStatus |
| MS/OD-07 | Liability + Accounting koordinasyonu | Liability |
| MS/OD-08, MS/OD-09 | NBA kapsamı; AI kapsamı | NBA/AI yüzeyleri |
| MS/OD-10, MS/OD-11 | Müvekkil görünürlüğü; self-service | müvekkil yüzeyleri |
| MS/OD-12 | Demo/mock FE kaldırma | demo temizliği |

Bir görev bu kapılardan birinin arkasındaysa ve kapı kaydı (decision-log) yoksa: başlatılamaz (§16).

---

## 9. Preserve / Reuse Register

Aşağıdaki alanlar **korunur**; zayıflatma, bypass veya yeniden yazım yasaktır:

| Alan | Neden | İzinli | Yasak |
|---|---|---|---|
| Collection ledger | idempotency + FK Restrict doğrulanmış | okuma, Liability'ye bağlama | yeniden yazım, şema bozma, bypass |
| İdempotency ve finansal invariant'lar | çift-sayım/çift-etki engeli | test genişletme | invariant gevşetme |
| FK Restrict kararları | referans bütünlüğü | additive FK ekleme | Restrict→Cascade dönüşümü onaysız |
| Passivation/lifecycle guard | testli davranış | — | guard zayıflatma |
| Tenant-safe Debtor/CaseDebtor çekirdeği | scoped erişim doğrulanmış | ek savunma katmanı | filtre kaldırma |
| Audit sanitization | KVKK (repo ADR-011) | — | ham PII yazımı |
| Kanonik tebligat senkron kapısı | tek yol atomik kayıt | fact ekleme | bypass, ikinci yazım yolu |
| Mevcut doğrulanmış DomainEvent/outbox temeli (DomainEventIngest) | transactional + advisory-lock | aggregate EXTEND | disiplini bozma, rakip altyapı |
| D6A-1/2 çekirdeği | owner-locked | — | dokunma |

---

## 10. Retire / Deprecate Register

| Alan | Neden | Yerine (replacement) | Silme gate'i |
|---|---|---|---|
| `Case.riskScore` | non-canonical skor | DebtorScore (tek motor) | MS/OD-05 + shadow korelasyon + MS/GATE-4 sonrası |
| Rakip risk motorları (risk/automation/ai) | çelişkili sonuç | DebtorScoringService | konsolidasyon + MS/GATE-4 |
| NotificationQueue süre rolü | hukuki hata kaynağı | LegalServiceDate (Tebligat rebase) | shadow-read delta=0 + MS/GATE-2 |
| Mock provider write-path (PTT/UETS/notification) | sahte hukuki state | gerçek entegrasyon veya NO-OP `NOT_INTEGRATED` | NO-MOCK gate + MS/GATE-1 |
| Demo frontend veri yüzeyleri (DEAD_CODE) | latent sahte-güven | kanonik veriden beslenen yüzeyler | build yeşil + MS/GATE-1 (paralel), MS/OD-12 |
| AuditLog üzerinden business fact çıkarımı | sinyal/iz karışması | DomainEvent tüketimi | okuyucular taşındı + MS/GATE-3 |
| Deprecated adres/notification alanları (`addressType`/`isMernis`/`notification_*_old`) | çift-okuma | kanonik alanlar | okuyucu=0 kanıtı + CONTRACT fazı (en son, DESTRUCTIVE) |
| Ölü DebtorIssue kodları | emit eden yok | — (silinir) | temizlik PR'ı + build/test yeşil |

Kural: hiçbir retire kaydı, replacement'ı production'da doğrulanmadan ve silme gate'i geçilmeden fiziksel olarak silinemez.

---

## 11. AI / NBA Boundary

**AI şunları yapabilir:** özet · açıklama · taslak · alternatif üretme · eksik bilgi gösterme. Tamamı AIContextBuilder'dan geçen tenant-safe, PII-minimize bağlamla ve `AIRecommendationLog`'a kayıtla.

**AI şunları yapamaz:** kanonik state yazma · tebligat sonucu oluşturma · kesinleşme kararı · haciz · finansal kayıt (Collection/Allocation/indirim) · sulh uygulama · Party merge · dosya kapama. (MS/ADR-016, MS/LG-06/07)

**NBA kuralı:** NBA yalnız öneri/görev üretir. Bir NBA çıktısı, `LegalGuard` değerlendirmesinden geçmeden ve sınıfı gerektiriyorsa `HumanApproval` kaydı olmadan **command'a dönüşemez**. Zorunlu zincir:

```text
canonical data → DomainEvent → Feature → versioned Score → Eligibility
→ LegalGuard → NBA candidate → human review → approved task → outcome → feedback
```

Zincir atlanırsa `AI_NBA_FOUNDATION_ORDER_VIOLATION` (§16). NBA shadow fazında (MS/GATE-6 öncesi) çıktılar SHADOW_ONLY'dir: kullanıcıya gösterilmez, hiçbir yan etki üretmez.

---

## 12. Migration Rules

Bağlayıcı geçiş hattı:

```text
EXPAND → BACKFILL → SHADOW/DUAL-WRITE → RECONCILE → SHADOW-READ → CUTOVER → DEPRECATE → CONTRACT
```

İlkeler:

1. İlk fazda **destructive migration yapılmaz**; CONTRACT her zaman en son fazdır ve "okuyucu=0" kanıtı ister.
2. Backfill **idempotent ve restart edilebilir** olmalıdır (checkpoint disiplini).
3. **Reconciliation olmadan cutover yapılamaz**; dual-write divergence ölçülür, eşik aşımında cutover durur.
4. Hukuki veya finansal veri migration'larında (Liability, süre rebase, LegalStatus) **hukuk sign-off'u (LDO — Legal Domain Owner) zorunludur**; ilgili owner kapısı (MS/OD-03, MS/OD-06, MS/OD-07) ayrıca geçerlidir.
5. **Geçmiş delil kayıtları yeniden yazılamaz**; bootstrap event'leri `source=BOOTSTRAP` ile organik event'lerden ayrılır.
6. Her migration'ın tanımlı rollback yolu ve failure threshold'u olmadan PR açılamaz.

---

## 13. Test and Release Gates

| Gate | Amaç | Zorunlu olduğu değişiklik |
|---|---|---|
| TENANT_ISOLATION | cross-tenant sızıntı yok | tenant-owned her okuma/yazma |
| AUTHORIZATION | yetkisiz erişim/onay yok | onay akışları, merge, rol |
| NO_MOCK_PRODUCTION | mock kanonik alana yazamaz | provider/entegrasyon yolları |
| LEGAL_CORRECTNESS | süre/durum hukuken doğru | tebligat, süre, LegalStatus |
| MIGRATION | migration ileri/geri güvenli | her şema değişikliği |
| DATA_RECONCILIATION | eski=yeni sayım/tutar | her backfill/dual-write |
| EVENT_IDEMPOTENCY | çift event = tek etki | event üretim/tüketim |
| EVENT_REPLAY | replay = canlı durum | projection/read-model |
| CONCURRENCY | eşzamanlı yazımda yarış/çift-etki yok | event üretim/outbox/consumer yolları |
| FINANCIAL_INVARIANT | Σ tutarlar eşleşir | Collection/Liability kesişimi |
| LEGAL_GUARD | guard bypass edilemez | guard kuralları, aksiyon yolları |
| SCORE_DETERMINISM | aynı snapshot → aynı skor | skor motoru |
| NBA_NO_SIDE_EFFECT | shadow sıfır yan etki | NBA üretimi |
| AI_CONTEXT_ISOLATION | AI bağlamı tenant-safe/PII-min | AI yüzeyleri |
| UI_DECISION_SAFETY | UI'da mock/kanıtsız karar verisi yok | karar yüzeyleri |

Kurallar:

- **Required DB testleri sessizce skip edilirse CI başarısız olmalıdır** (`fail-if-skipped`); required job'larda `--passWithNoTests` yasaktır (MS/DEC-12).
- LOAD ve BACKUP_RESTORE aileleri required değildir (staging/drill kapsamı — MS §S); bu tabloya bilinçli alınmamıştır.
- DB-gated testler yalnız disposable container'da koşulur (CLAUDE.md §6); production/local dev DB'ye karşı test koşulmaz.
- Release sırası MS/GATE-0..8 zinciriyle yönetilir (Evidence → Security → Legal Truth → Event → Feature/Score → LegalGuard → NBA Shadow → User Decision → AI Explanation); ayrıntı Master Synthesis §R/§S.

---

## 14. Mandatory Pre-Task Checklist

Borçlu hattında her görev başlamadan önce ajan şu soruları cevaplamak zorundadır:

```text
1.  Görev hangi bounded context'e aittir?                          (§6)
2.  Kanonik source of truth nedir?                                 (§4)
3.  Tenant boundary nedir?                                         (INV-01/02)
4.  LegalGuard gerekiyor mu?                                       (§7)
5.  HumanApproval gerekiyor mu?                                    (§7)
6.  Hukuki veya finansal invariant etkileniyor mu?                 (§5)
7.  Geçmiş delil/audit kaydı etkileniyor mu?                       (INV-11)
8.  Yeni DomainEvent gerekiyor mu?                                 (§6/10. context)
9.  Read-model mi transactional model mi değişiyor?                (INV-09)
10. Migration türü nedir?                                          (§12)
11. Backward compatibility korunuyor mu?                           (§12)
12. Hangi test/release gate zorunludur?                            (§13)
13. Hangi owner decision veya ADR gereklidir?                      (§8.2, repo decision-log)
14. Korunması gereken owner-locked alan var mı?                    (§9)
15. Master Register/governance güncellemesi gerekiyor mu?          (§17)
```

Bu sorular cevaplanmadan implementation başlatılamaz.

---

## 15. Mandatory Completion Checklist

Her görev sonunda ajan şunları raporlamak zorundadır:

```text
- Değişen bounded context
- Değişen source of truth (değişmediyse "değişmedi")
- Tenant/security sonucu
- LegalGuard sonucu
- Migration/backfill sonucu
- Event/audit sonucu
- Test gate sonucu (koşulan gate'ler + sonuç)
- Backward compatibility sonucu
- Feature flag/rollout sonucu
- Rollback durumu (yolu doğrulandı mı)
- Governance/Master Register sonucu
- Kalan blocker ve owner decision ihtiyacı
```

---

## 16. Hard Stops

Aşağıdaki durumlarda ajan durur ve `NO-GO` raporlar; implementation başlatılmaz veya sürdürülen iş askıya alınır:

```text
- Source of truth belirsizse
- Tenant isolation kanıtlanamıyorsa
- Mock veri kanonik state'e yazılacaksa
- Hukuki süre kaynağı belirsizse
- Finansal invariant açıklanamıyorsa
- Gerekli owner kararı yoksa (§8.2 kapıları dahil)
- Destructive migration için reconciliation/rollback yoksa
- Required DB testleri çalışmıyorsa
- AI/NBA foundation sırası ihlal ediliyorsa (AI_NBA_FOUNDATION_ORDER_VIOLATION)
- Geçmiş hukuki delil bozulacaksa
```

Hard Stop, CLAUDE.md §8 stop-condition rejimine tabidir: dur, raporla, owner kararı bekle.

---

## 17. Governance Update Rules

- Bu dosya yalnız **governance PR'ı** ile değiştirilebilir.
- Karar değişiklikleri `decision-log.md`'ye kaydedilir; bu belge yalnız sonucu taşır.
- Ratifiye edilmemiş ürün fikirleri kanonik kural olarak eklenmez (Backlog akışı: Triage → Product Backlog → READY → Active Roadmap).
- Master Synthesis'in kanıt ve gerekçeleri **audit kaynağı olarak korunur**; bu belgeye kopyalanmaz, referans verilir.
- Bu belge kısa ve operasyonel tutulur; ayrıntılı analizler buraya kopyalanmaz.
- Çelişki halinde: **güncel repo davranışı mevcut (AS-IS) durumu belirler; ratifiye edilmiş governance hedef (TO-BE) kararı belirler.** İkisi arasındaki fark bir bulgu olarak raporlanır, sessizce çözülmez.
- **Hukuki zorunluluk koddan üstündür**: kod ile hukuk çelişirse hukuk esas alınır ve kod düzeltme backlog'una girer.
- MS/ADR önerilerinin repo ADR'ına dönüşümü yalnız repo kanonik ADR numarasıyla yapılır (başlık bloğundaki kimlik uzayı kuralı).

---

## GOVERNANCE DOCUMENT SELF-CHECK

```text
GOVERNANCE DOCUMENT SELF-CHECK:
- Canonical terminology complete:        YES  (§3 — zorunlu 11 ayrım dahil)
- Source-of-truth register complete:     YES  (§4 — 18 alan)
- Tenant boundaries explicit:            YES  (INV-01/02, §4, §13)
- Legal/financial invariants explicit:   YES  (§5)
- Automation boundaries explicit:        YES  (§7 — 6 sınıf, 22 aksiyon)
- Foundation order explicit:             YES  (§8.1 + paralellik istisnaları)
- Preserve/retire registers complete:    YES  (§9, §10)
- AI/NBA boundary explicit:              YES  (§11)
- Migration rules explicit:              YES  (§12)
- Test/release gates explicit:           YES  (§13 — 15 gate + fail-if-skipped)
- Pre-task checklist complete:           YES  (§14 — 15 soru)
- Completion checklist complete:         YES  (§15 — 12 alan)
- Hard stops complete:                   YES  (§16 — 10 koşul)
- Orphan references:                     NO   (tüm MS/* kimlikleri Master Synthesis'te tanımlı;
                                               repo referansları mevcut dosyalara işaret eder)
- Unsupported new decisions:             NO   (owner kapıları §8.2'de AÇIK olarak işaretlendi;
                                               yeni ürün/mimari karar üretilmedi)
```
