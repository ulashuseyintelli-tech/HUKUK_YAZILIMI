# DEBTOR DBP-06 — PARTY, IDENTITY & MATCHING ARCHITECTURE v1.0

> **Canonical Phase 1 L5-kimlik artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT
> CHARTER v1.0` §9 kapsamındaki DBP-06 work package'ının owner-onaylı çıktısıdır (Charter
> artefaktı #16 Party & PartyMatch Spec'in aday/karar-zemini katmanı). İçerik GO-ANALYZE
> (DBP-06 R0.1 → R0.2 → R0.2.1) çıktısıdır; bu GO-DOCS turunda yeni analiz, owner kararı veya
> LDO sign-off'u üretilmemiştir. **OD-04 alt kararlarının HİÇBİRİ verilmemiştir; Party
> semantic owner KESİNLEŞTİRİLMEMİŞTİR; exact auto-link AKTİVE EDİLMEMİŞTİR.**

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-06 — PARTY, IDENTITY & MATCHING ARCHITECTURE (L5-kimlik)
VERSION            : v1.0 (R0.2.1 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 LIMITED IDENTITY CORRECTION → R0.2.1
                     MICRO-CORRECTION); canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[J] — bkz. §22)
REVIEW DISPOSITION : OWNER-APPROVED WITH OPEN OD-04 DECISIONS — yeni bir repository lifecycle
                     state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : OD-04A hosting/semantic owner · OD-04B identifier type-policy içeriği ·
                     OD-04C lifecycle aktivasyon ayrıntıları · OD-04D exact auto-link
                     aktivasyonu · OD-04E fuzzy confidence modeli · OD-04F suppression/reopen ·
                     OD-04G Party canonicalization realization · OD-04H exact-undo/compensating-
                     split politikası · OD-04I Party Registry başlama zamanı · OD-04J IR-0 ara
                     dönem disposition'ı · EstateHeir/PublicInstitution/legal-succession hukuki
                     sınıflandırmaları (LSO) · verdict/link/canonicalization işlem rolleri (ODR)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları origin/main @ bc63737a; GO-DOCS drift kontrolü ve bu
                     belgenin base'i origin/main @ 54ef79af (fetch 2026-07-15; DBP-06 girdi
                     kaynaklarında — blueprint/, DEBTOR-GOVERNANCE, SYSTEM-CONSTITUTION,
                     party-registry-design(+review), IR-0, schema.prisma — SIFIR değişiklik)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir model/servis/migration için implementasyon,
                     schema, cutover, backfill, workstream açılışı veya register genişletmesi
                     yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : IDC/IDF/MC/OPT kimlikleri DBP-06-local PROPOSED'dur (DBP-12'ye kadar).
                     OD-04A..J bu paketin decomposed owner-karar kimlikleridir; kararların
                     kendisi VERİLMEMİŞTİR.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md`
(SYS-ID-001..005; §7 identity SoT; SYS-GOV-019) → `DEBTOR-GOVERNANCE.md` (INV-07; §4 kimlik
satırları) → tasarım kaynakları. Execution/safety — `AGENTS.md` + task authorization.

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`
- DBP-02..05: `project/docs/blueprint/DEBTOR-DBP-02-BUSINESS-CAPABILITY-VALUE-STREAM-v1.0.md`,
  `.../DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md`, `.../DEBTOR-DBP-04-LEGAL-STATE-LEGALGUARD-v1.0.md`,
  `.../DEBTOR-DBP-05-EVENT-EVIDENCE-TIMELINE-v1.0.md`
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md`
- Kaynak tasarımlar: `project/docs/party-registry-design.md` (PR-3 design-only) ·
  `project/docs/party-registry-design-review.md` (NET KARARLAR: şimdi kodlanmaz; IR-0
  standalone edilmez; Staff/User Party'ye girmez) · `project/docs/debtor-identity-resolution-ir0.md`
  (IR-0 — owner-onaylı sabit kararlar, 2026-06-17) · `project/docs/real-person-dedup-forensic-m2g0.md`
  (iç-personel dedup — Party kapsamı DIŞI evren)

---

## 2. Statü Sözlüğü

DBP-02..05 eksenleri aynen (AUTH/MAT/EVD/DEC/S-OWN/HOST/EXEC + CD/ODR/PROPOSED/VR + LSO/NI/ABSENT).
Ek eksenler: **TENANT SCOPE** (aksi yazılmadıkça tenant-local) · **HUMAN REVIEW REQUIREMENT**.

---

## 3. Identity & Party Concept Catalog + Temel İnvariantlar — OWNER-APPROVED [A-öncülü, R0.1/R0.2 tabanı]

| IDC | Kavram | Bağlayıcı anlam | AUTH·MAT·EVD |
|---|---|---|---|
| IDC-01 | Party (dış-taraf kimlik kökü; REAL/LEGAL) | 5 parçalı kimliğin (Client/Debtor/ThirdParty/EstateHeir/PublicInstitution) konsolidasyon HEDEFİ — greenfield değil | TARGET·NONE·VERIFIED (model yok) |
| IDC-02 | Identifier katmanları (assertion/link) | §6-§7 modeli | TARGET·NONE |
| IDC-03 | Debtor / Client profilleri | kimlik kökü DEĞİL — profil | CURRENT·PARTIAL·VERIFIED |
| IDC-04 | CaseDebtor (hedef: CaseParty junction) | dosyadaki ROL | CURRENT·PARTIAL |
| IDC-05 | Duplicate Guard (write-time) | `SIMILAR_NAME_REVIEW`/`DUPLICATE_IDENTITY` — bloklamaz, review açar | CURRENT·PARTIAL·VERIFIED |
| IDC-06 | Match Candidate (IR-0 → PartyMatch süperseti) | advisory; verdict tek başına veri DEĞİŞTİRMEZ; **IR-0 standalone implement EDİLMEZ (review NET KARARI)** | NI·NONE·VERIFIED (IR-1 açılmadı) |
| IDC-07 | Confirmed Identity Link | §9 lifecycle — candidate'tan AYRI kayıt | TARGET·NONE |
| IDC-08 | Party canonicalization + recovery | §12-§13 | TARGET·NONE |
| IDC-09 | Evolution/Succession kayıtları | §15 | TARGET·NONE |

**Dondurulmuş invariantlar:** Identity≠Role · Identity≠Debtor/Client Profile · Role≠Liability ·
Match Candidate≠Confirmed Identity Link · **Exact Match≠Auto-Link≠Merge** · Fuzzy→NEVER
AUTO-MERGE · Cross-Tenant Link/Merge→PROHIBITED (SYS-ID-003) · NO DESTRUCTIVE MERGE · NO SILENT
FK REWRITE · SOURCE SUBJECT HISTORY PRESERVED · Missing Identifier≠Different Person · Same
Name≠Same Person · Historical Identity→APPEND/SUPERSESSION (silent overwrite YOK) ·
Big-bang migration→PROHIBITED (N-18).

---

## 4. Semantic Ownership Options (OD-04A — SEÇİM YOK)

| OPT | Model | Etki/Kısıt |
|---|---|---|
| OPT-A | DEBTOR-hosted tenant-local registry | hızlı; CLIENT kimliği de konsolide olacağından CLIENT sınır sözleşmesi ŞART (SYS-GOV-015 taşınamaz) |
| OPT-B | Shared-kernel Party Registry (SYS-GOV-019; SC §7 "Target Party Registry", SB-001 HOLD hizası) | konsolidasyonun doğal sahibi; cross-domain governance ister |
| OPT-C | Statüko+ (guard'lar + IR ile devam) | migration riski yok; istihbarat bölünmesi + FND-13 sürer |

`PARTY SEMANTIC OWNER: OPEN — OWNER DECISION REQUIRED (OD-04A)`.

---

## 5. Identifier Taxonomy (IDF) ve AS-IS

| IDF | Tanımlayıcı | AS-IS (VERIFIED @pin) |
|---|---|---|
| IDF-01/02/03 | TCKN(11)/VKN(10)/MERSİS | `Debtor`/`Client` alanları VAR; **@@unique YOK** (yalnız tenant-scoped @@index) → aynı tenant'ta aynı TCKN'li çoklu kayıt yapısal olarak mümkün |
| IDF-04 | DETSİS | PublicInstitution ekseni (kapsam kararı AÇIK) |
| IDF-05 | Pasaport/yabancı kimlik | özel alan YOK |
| IDF-06 | Kurum sicil / dış-sistem kimlikleri | evidence-sınıfı girdi; SYS-ID-004: doğrulanmadan canonical OLMAZ (CDC-06 ACL) |
| — | `identityNo` | @deprecated çift-okuma alanı VAR |

---

## 6. Identifier Model — OWNER-APPROVED [D-öncülü] (solution-neutral; PROPOSED)

**Alanlar (14):** identifier type · normalized value · issuing authority · issuing country/
jurisdiction · subject kind compatibility · validFrom/validTo · assertion source · provenance/
evidence reference · verification status · verifiedAt · verification method · revocation/
supersession zinciri · confidentiality/masking class · tenant scope. (`verified: boolean` tek
başına YETERSİZDİR.)

### 6.1 Assertion / Verification Evidence / Assessment / Approval ayrımı — OWNER-APPROVED [D]

```text
A. IDENTIFIER ASSERTION RECORD       : kaynağın identifier'ı subject'e atfetmesi — OBSERVED record
                                       (provenance ZORUNLU; kaynaksız identity fact ÜRETİLEMEZ)
B. VERIFICATION EVIDENCE / RESPONSE  : MERNİS/UYAP vb. authoritative doğrulama CEVABI — OBSERVED
                                       record (CDC-06B/C ACL'den; ham cevap canonical kimlik DEĞİL)
C. IDENTIFIER VERIFICATION ASSESSMENT: A+B üzerinden VERSİYONLU değerlendirme (DA sınıfı)
D. IDENTITY LINK APPROVAL            : insan onayı gerektiğinde HUMAN-DECISION record (HD)
Owner-aktive safe auto-link'te (OD-04D) human approval OLMAYABİLİR; ancak AUTOMATED-LINK
DECISION RECORD zorunludur (bkz. §9.1). Identifier value değişikliği silent overwrite ile
YAPILAMAZ — supersession/history zorunlu.
```

---

## 7. Identifier Uniqueness Policy — OWNER-APPROVED [E] (katmanlı; blanket kural YOK)

```text
A. ASSERTION LAYER             : unique constraint YOK — çelişen assertion'lar KANIT olarak saklanır.
B. CANONICAL ACTIVE LINK LAYER : ACTIVE-LINK UNIQUENESS ANAHTARI (en az):
                                 { tenantId · identifier type · normalized identifier value ·
                                   identifier-type policy'nin gerektirdiği issuing authority /
                                   jurisdiction scope'u · active-link status }
                                 Aynı scope'ta birden fazla AKTİF canonical subject → FAIL-CLOSED
                                 CONFLICT. Partial/conditional constraint modeli kullanılır;
                                 repository-genel blanket unique kural ÜRETİLMEZ.
C. HISTORICAL LINK LAYER       : superseded/revoked/unlinked link'ler unique kontrolün DIŞINDA
                                 tarihsel kayıt olarak korunur.
IDENTIFIER TYPE POLICY (tip başına 9 alan — içerik OD-04B'de): normalization rule · issuing
authority · jurisdiction · compatible subject kinds · uniqueness scope · reassignment/reuse
hukuken mümkün mü · validity overlap rule · authoritative verification requirement · masking class.
```

---

## 8. Exact-Match Result Taxonomy — OWNER-APPROVED [A] (assessment sonucu ≠ workflow aksiyonu)

```text
ASSESSMENT SONUÇ KÜMESİ (yalnız değerlendirme sonucu):
  EXACT_IDENTIFIER_SIGNAL      (sinyal — tek başına sonuç değil)
  AUTO_LINK_ELIGIBLE           (tüm gate koşulları sağlandı; aktivasyon yine OD-04D'ye tabi)
  NOT_AUTO_LINK_ELIGIBLE       (owner activation yok · cross-domain contract tanımsız · politika kapalı)
  INSUFFICIENT_VERIFICATION
  SUBJECT_KIND_MISMATCH
  OUTSIDE_VALIDITY_PERIOD
  IDENTIFIER_CONFLICT          (YALNIZ gerçekten çelişen verified assertion/aktif link varlığında)

NEXT ACTION (ayrı alan — sonuç kümesinin ÜYESİ DEĞİL):
  HUMAN REVIEW REQUIRED  ·  NONE  ·  (ilgili workflow yönlendirmeleri)

AKTİVASYON GATE KOŞULLARI (AUTO_LINK_ELIGIBLE için tümü): aynı tenant · aynı identifier type ·
normalize aynı değer · format geçerli · authoritative verification mevcut · subject kind uyumlu ·
geçerlilik dönemi uyumlu · çelişen verified assertion yok · exclusion/suppression yok ·
cross-domain contract izinli · activation owner-gated (OD-04D).
FAIL-CLOSED KAPSAMI: canonical link oluşturmayı, auto-link'i ve merge/canonicalization'ı
engeller; YENİ assertion/evidence kaydının alınmasını ENGELLEMEZ.
```

---

## 9. Match Candidate ve Confirmed Identity Link Lifecycle'ları — OWNER-APPROVED [B]/[C] (AYRI döngüler)

### 9.1 Match Candidate

```text
CANDIDATE → UNDER_REVIEW → { RESOLVED_SAME_SUBJECT | RESOLVED_DIFFERENT_SUBJECT | IGNORED }
· Resolution durumları İLGİLİ EVALUATION İÇİN TERMİNALDİR.
· SUPERSEDED otomatik devam DEĞİLDİR: yeni evidence, policy version veya candidate-generation
  eski evaluation'ı geçersiz kılarsa "SUPERSEDED BY: <yeni evaluation>" ilişkisiyle gösterilir.
· Candidate doğrudan link state'ine DÖNÜŞMEZ: resolution → AYRI ConfirmedIdentityLink kaydı →
  candidate üzerinde link reference.
· Verdict tek başına VERİ DEĞİŞTİRMEZ (IR-0 sabit kararı korunur).
```

### 9.2 Confirmed Identity Link

```text
ACTIVE → { SUPERSEDED | REVOKED | UNLINKED }
ORIGIN MODELİ: ORIGINATING CANDIDATE: OPTIONAL (safe auto-link'te candidate olmayabilir)
               ORIGIN DECISION SOURCE: REQUIRED — yalnız:
                 · MATCH CANDIDATE RESOLUTION REFERENCE, veya
                 · AUTOMATED LINK DECISION RECORD REFERENCE
AUTOMATED LINK DECISION RECORD (zorunlu içerik): policy version · gate results (§8 taksonomisi) ·
identifier assertion references · verification assessment reference · tenantId · operation
identity · createdAt.
KURAL: candidate OLMADAN link kurulabilir; KANITSIZ ve DECISION-RECORD'SUZ link KURULAMAZ.
Diğer link alanları: link type · source profile · target Party · approval/automation basis ·
effectiveFrom/To · supersedes · revocation reason.
Link ŞUNLARI YAPMAZ: profil silmez · profil semantiğini Party'ye taşımaz · Liability/CaseRole
üretmez · merge/canonicalization DEĞİLDİR.
```

---

## 10. Stable Subject Pair / Evaluation Key / Suppression — OWNER-APPROVED [F]

```text
STABLE SUBJECT REFERENCE (Party henüz yokken de çalışır):
  { tenantId · subject type · source namespace/domain · immutable source record id }
  (Party mevcutsa Party reference kullanılabilir.)
STABLE SUBJECT PAIR ID : ordered left subject reference + ordered right subject reference
  — değişebilir isim, identifier value, policy version veya evidence fingerprint İÇERMEZ.
CANDIDATE EVALUATION KEY : stable pair id + matching policy version + evidence fingerprint +
  candidate-generation version.
SUPPRESSION: stable pair'e bağlıdır; YALNIZ ilgili evidence fingerprint + policy version
kapsamında uygulanır. MATERIAL NEW EVIDENCE veya POLICY CHANGE → yeni evaluation (pair kimliği
değişmez). Reimport eşlemesi provenance/source-record identity üzerinden yapılır (isim imzasıyla
DEĞİL). Suppression kaydı: resolved pair · evidence fingerprint · policy version · resolution ·
actor · reason · resolvedAt · reopen conditions. `ignored`(geçici) ≠ `different_person`(verdict).
```

---

## 11. Fuzzy Matching Matrix ve Confidence (OD-04E — DC-CONFLICT-01 kaydıyla)

| MC | Sinyal | Davranış |
|---|---|---|
| MC-02 | çelişkili TCKN/VKN | IDENTIFIER_CONFLICT → link/merge FAIL-CLOSED → NEXT ACTION: HUMAN REVIEW |
| MC-03/04/05 | telefon+isim / adres+isim / yalnız isim | FUZZY → insan review; **NEVER AUTO-MERGE** |
| MC-06 | IR tetiği (kimlik sonradan girildi; karşı taraf kimliksiz) | advisory candidate; otomatik HİÇBİR ŞEY yapılmaz |

**DC-CONFLICT-01 (design-level; çözüm OD-04E):** IR-0 sabit kararı "numeric skor YOK — ham
sinyal listesi" ↔ party-registry-design `matchScore` alanı. Seçenekler: sinyal-listesi / numeric
/ hibrit — bu belge SEÇMEZ.

---

## 12. Linking / Consolidation / Canonicalization / Relationship Migration — OWNER-APPROVED [G]

| Operasyon | Tanım | Sınıf |
|---|---|---|
| A. PROFILE-TO-PARTY LINKING | profil Party'ye bağlanır; profil KORUNUR | linking |
| B. IDENTITY LINK CONSOLIDATION | birden fazla profil AYNI Party'ye bağlanır; **Party merge YAPILMAZ** — merge seçeneği DEĞİLDİR | linking stratejisi |
| C. PARTY CANONICALIZATION | iki Party subject arasında canonical survivor / alias / redirect kararı | OD-04G'nin konusu |
| D. RELATIONSHIP MIGRATION | FK/domain ilişki taşıma | AYRI, yüksek riskli; ayrı migration + invariant analizi ŞART |

Default güvenli ilke: **NO DESTRUCTIVE MERGE · NO SILENT FK REWRITE · SOURCE SUBJECT HISTORY
PRESERVED.** Etki boyutları (her canonicalization önerisinde gösterilmek zorunda): historical
references · external identifiers · event history · audit/evidence links · post-merge writes ·
concurrent writes.

---

## 13. Reversibility & Recovery — OWNER-APPROVED [H-öncülü] (politika OD-04H)

```text
İLKE: her consolidation/canonicalization işlemi EN AZ BİR compensating recovery yoluna sahip
olmalıdır: link revocation · redirect supersession · split · relationship remediation.
EXACT UNDO                     : yalnız güvenli pencere (post-merge write YOK) + concurrency
                                 koşulları içinde mümkün.
COMPENSATING SPLIT/REMEDIATION : exact undo mümkün olmadığında ZORUNLU recovery yolu.
`undoPayload` hiçbir durumda TEK BAŞINA yeterli garanti DEĞİLDİR.
```

**Concurrency & Integrity gereksinimleri (mimari; implementasyon yetkisi üretmez):** optimistic
version/CAS · tenant-scoped advisory lock (veya eşdeğeri) · merge-chain cycle prevention ·
**single active canonical target** · idempotent canonicalization command (retry-safe operation
identity) · explicit post-merge-write policy. Riskler: review↔işlem arasında yeni kayıt · paralel
canonicalization · A→B→C zinciri · cross-domain write · split'te post-merge kayıt sahipliği.

---

## 14. Corporate Evolution vs Legal Succession — OWNER-APPROVED [I] (sınıflandırma kuralları LSO)

```text
ADDRESS / PROFILE CONTEXT CHANGE (identity evolution DEĞİL): adres ve benzeri profil/bağlam
değişimleri — BC-04/profil katmanı.
SAME LEGAL SUBJECT IDENTITY EVOLUTION: unvan değişikliği · aynı tüzel kişiliğin sicil/kimlik
bilgilerinde tarihsel güncelleme · LDO tarafından aynı-legal-subject sayılan tür değişiklikleri.
LEGAL SUCCESSION (AYRI — DBP-07 + LDO): birleşme (devralma/yeni kuruluş) · bölünme · halefiyet ·
tereke/mirasçılık — yeni Party OLUŞTURABİLİR · eski Party KORUNUR · **Liability/Receivable
aktarımı OTOMATİK DEĞİLDİR**. EstateHeir temsili (PartyRelation(HEIR_OF) vs alt-Party) ve
PublicInstitution kapsamı AÇIK (LSO/ODR).
```

---

## 15. Tenant & Identifier Privacy Matrix — OWNER-APPROVED [R0.2 §9 tabanı]

| Kural | Statü |
|---|---|
| Tenant-local uniqueness (aktif-link katmanında, §7 anahtarıyla) | hedef kural |
| Global TCKN/VKN unique constraint | **YOK ve KURULMAZ** |
| Cross-tenant lookup / candidate generation / link / merge | **PROHIBITED** (SYS-ID-003) |
| Başka tenant'ta eşleşme varlığını İMA EDEN hata/davranış | **YASAK** (varlık-ifşası da leakage'dır) |
| Identifier hash/search index kurulursa | tenant-bound salt/key ZORUNLU |
| Logs/audit/events içinde tam identifier | varsayılan TAŞINMAZ (SYS-AUTH-012) |
| UI masking sınıfları | → DBP-10 (OFFICE F1 masking deseniyle hizalı) |
| Global gerçek kişi aynı olsa bile | tenant'lar arası otomatik canonical subject PAYLAŞILMAZ |

---

## 16. Identity Event Status Matrix (tümü PROPOSED)

| Event adayı | EVENT STATUS | PL/DELIVERY | SCHEMA VERSION | SEMANTIC OWNER |
|---|---|---|---|---|
| PARTY_CREATED · PARTY_IDENTITY_ADDED · PARTY_MERGED · IDENTITY_MATCH_CANDIDATE_CREATED/RESOLVED · IDENTITY_LINK_CREATED/REVOKED · PARTY_SPLIT | PROPOSED | **OBD-07 DEPENDENT** | NOT DEFINED | **OD-04 DEPENDENT** |

MergeLog / verdict / suppression / link kayıtları **append-only İLAN EDİLMEZ** — lifecycle/
immutability DBP-05 kuralı: `RECORD MODEL: PROPOSED · INTENDED LIFECYCLE: APPEND-NEW-REVISION /
SUPERSESSION CANDIDATE · IMMUTABILITY: VERIFICATION REQUIRED`.

---

## 17. Current Repository Gap Analysis (VERIFIED @pin)

Party/PartyIdentifier/PartyMatchCandidate/PartyMergeLog/DebtorIdentityCandidate modelleri YOK ·
kimlik alanlarında @@unique YOK (yalnız tenant-scoped index) · `identityNo` @deprecated
çift-okuma sürüyor · write-time Duplicate Guard VAR · IR-1..7 PR'ları açılmadı · 5-tablo parçalı
kimlik + bölünmüş istihbarat (design §0) · FND-13 STILL OPEN · matching kodu yalnız OCR-hattı
client/lawyer-match (farklı amaç) + K1 linkage teşhisleri · EstateHeir tenant kapsamı
**VERIFICATION REQUIRED** · iç-personel dedup'u (M2-G0) forensic-tamam/execution-bekliyor —
**Party kapsamı DIŞI evren (Staff/User/Lawyer Party'ye GİRMEZ — review NET KARARI)**.

---

## 18. Migration / Backfill Constraints — OWNER-APPROVED [J]

Faz 0–6 strangler çerçevesi + Faz-0 ön-koşulları (gerçek veri girişi · istihbarat yüzeyi
stabilizasyonu + characterization · açık kararların netleşmesi · **Av. sign-off**) korunur;
big-bang YASAK. Backfill'in ayrık işlemleri: Party record creation · identifier assertion
import · profile-to-Party link creation · duplicate candidate generation · human-confirmed
consolidation · Party canonicalization · relationship migration.

```text
BACKFILL DEFAULT YETKİSİ (yalnız): Party oluşturma + assertion taşıma + DOĞRULANABİLİR TEKİL
link oluşturma. BACKFILL İÇİNDE OTOMATİK YAPILAMAZ: fuzzy consolidation · Party merge/
canonicalization · relationship move. NULL-kimlik → AYRI party (merge YOK). Backfill
tasarımı OD-04G'den önce KİLİTLENEMEZ. Dual-write doğrulama + count/drift reconciliation +
rollback yolu her fazda zorunlu (MS §N; SYS-MIG-003/010).
```

---

## 19. OD-04 Decomposed Decision Package (kararlar OWNER'ın — bu belge SEÇMEZ)

| Alt karar | Kapsam | O/L | FR etkisi |
|---|---|---|---|
| **OD-04A** | Party semantic owner / hosting (OPT-A/B/C — §4) | O | **YES-blocker** |
| **OD-04B** | Identifier **type-policy** kesin içeriği (9 alan) + canonical active-link uniqueness | O | YES |
| **OD-04C** | Candidate lifecycle ve Confirmed Link lifecycle **aktivasyon ayrıntıları** (ayrı onay kalemleri) | O | YES |
| **OD-04D** | Exact auto-link **result taxonomy (§8) + activation gate** + automated-decision-record zorunlulukları | O | YES |
| **OD-04E** | Fuzzy confidence modeli (**DC-CONFLICT-01 çözümü**) | O | YES |
| **OD-04F** | Stable Pair / Evaluation Key / suppression-reopen politikası | O | CONDITIONAL |
| **OD-04G** | **Party canonicalization realization** (survivor/alias/redirect vs relationship-migration; link consolidation merge DEĞİLDİR) | O | YES |
| **OD-04H** | **Exact undo vs compensating split/remediation** politikası | O | CONDITIONAL |
| **OD-04I** | Party Registry başlama zamanı (Faz-0 ön-koşul değerlendirmesi) | O (+Av. sign-off ön-koşulu) | CONDITIONAL |
| **OD-04J** | IR-0 ara-dönem disposition'ı ("standalone edilmez" teyidi/revizyonu) | O | CONDITIONAL |
| (bağlı LSO) | EstateHeir · PublicInstitution · succession sınıflandırma kuralları | O+**LDO** | YES |

---

## 20. DBP-07/08/09/10 Routing

| Hedef | Giden |
|---|---|
| **DBP-07** | legal succession × Liability (birleşme/bölünme/tereke — Liability aktarımı otomatik DEĞİL) · Identity≠Liability sınırı · EstateHeir kesişimi |
| **DBP-08** | match sinyalleri BehaviorFeature DEĞİLDİR (karışma yasağı) |
| **DBP-09** | kimlik kartı / 360 read-model · dedupe UI (D-5; admin-only istisna) · cross-case istihbarat görünümü |
| **DBP-10** | identifier masking sınıfları + KVKK minimizasyonu + retention · tenant-privacy guard testleri (§15) |

---

## 21. Analysis Approval / Fully Resolved Blocker Matrisi

| Konu | (i) ANALYSIS APPROVAL? | (ii) FULLY RESOLVED IDENTITY ARCHITECTURE? |
|---|---|---|
| OD-04A/B/C/D/E/G | NO | **YES** |
| Succession/EstateHeir/PublicInstitution (LSO) | NO | **YES** |
| OD-04F/H/I/J | NO | CONDITIONAL |
| EstateHeir tenant VR + record lifecycle VR'ları | NO | CONDITIONAL |
| Verdict/link/canonicalization rol atamaları (ODR) | NO | CONDITIONAL (OPEN taşınabilir) |

DBP-06, açık kalemleri görünür taşıyarak **OWNER-APPROVED WITH OPEN OD-04 DECISIONS**
disposition'ıyla kapanmıştır (2026-07-15); **FULLY RESOLVED** statüsü yukarıdaki kararlar/
sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 22. Owner Approval Record

```text
APPROVE DBP-06 R0.2.1 WITH OPEN OD-04 DECISIONS (2026-07-15, chat-only owner kararı; bu belge
kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[J]): Exact-Match Result Taxonomy · Match Candidate Lifecycle · Confirmed
Identity Link Lifecycle · Assertion/VerificationEvidence/Assessment/Approval ayrımı ·
Identifier Uniqueness Policy · Stable Pair/Evaluation Key/Suppression modeli ·
Linking/Consolidation/Canonicalization/RelationshipMigration ayrımı · Reversibility ve
compensating-recovery modeli · Evolution/Succession ayrımı · Migration/backfill sınırları.
ONAYLANMAMIŞ/AÇIK: OD-04A..J alt kararları · EstateHeir/PublicInstitution/succession hukuki
sınıflandırmaları (LSO) · verdict/link/canonicalization işlem rolleri (ODR).
```

**Revizyon geçmişi (özet):** R0.1 ilk L5-kimlik analizi (dört kaynak belge + şema/kod kanıtı;
OD-04 opsiyon zemini; DC-CONFLICT-01 tespiti) → R0.2 LIMITED IDENTITY CORRECTION (14-alanlı
identifier modeli; link lifecycle; 11-koşullu exact gate; pairKey/suppression revizyonu;
merge seçenekleri + concurrency; evolution/succession ayrımı; privacy matrisi; OD-04A..J
decomposition) → R0.2.1 MICRO-CORRECTION (result/next-action ayrımı; candidate↔link lifecycle
ayrıştırması; assertion/verification-evidence/assessment/approval dörtlüsü; üç-katman
uniqueness + type-policy; stable-pair/evaluation-key bölünmesi; link-consolidation'ın merge'ten
çıkarılması; compensating-recovery; adres değişikliğinin evolution'dan çıkarılması; backfill
yetki daraltması) → GO-DOCS pre-normalizasyonu (result-enum'dan HUMAN_REVIEW_REQUIRED'ın NEXT
ACTION alanına taşınması; ORIGINATING CANDIDATE: OPTIONAL + ORIGIN DECISION SOURCE: REQUIRED;
Party-öncesi stable subject reference bileşenleri; aktif-link uniqueness anahtarı; terminal
resolution + SUPERSEDED BY ilişkisi; disposition ifadesi). Ara revizyon metinleri görev
sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Party semantic owner kesinleştirildi mi:                     NO (OD-04A ODR)
- Exact auto-link aktive edildi mi:                            NO (OD-04D; gate + taxonomy ayrık)
- HUMAN_REVIEW_REQUIRED sonuç-enum'unda mı:                    NO (NEXT ACTION alanında)
- Candidate → link dönüşümü var mı:                            NO (ayrı kayıt + origin modeli)
- Kanıtsız/decision-record'suz link mümkün mü:                 NO (§9.2 kuralı)
- Blanket UNIQUE(tenantId,value) önerildi mi:                  NO (üç katman + type-policy)
- pairKey policy/fingerprint içeriyor mu:                      NO (stable pair ↔ evaluation key)
- Link consolidation merge seçeneği olarak mı:                 NO (§12 ayrık operasyonlar)
- Destructive merge / silent FK rewrite önerildi mi:           NO
- Cross-tenant search/candidate/link/merge:                    NO (PROHIBITED; ifşa-yasağı dahil)
- Adres değişikliği identity evolution mı:                     NO (profile-context change)
- Fuzzy → otomatik link/merge:                                 NO
- Identity↔profil/rol/Liability dönüşümü:                      NO
- Event adayları PROPOSED + OBD-07/OD-04 bağlı mı:             YES
- Record immutability çözülmüş gösterildi mi:                  NO (VR — DBP-05 kuralı)
- Migration/backfill implementasyon yetkisi üretildi mi:       NO
- IMPLEMENTATION AUTHORITY: NONE korundu:                      YES
- Register/decision-log değişikliği:                           NO
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
