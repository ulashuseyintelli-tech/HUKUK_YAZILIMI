# DEBTOR DBP-09 — DIGITAL TWIN & BORÇLU 360 READ-MODEL ARCHITECTURE v1.0

> **Canonical Phase 1 L7-read-model artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT
> CHARTER v1.0` §9 kapsamındaki DBP-09 work package'ının owner-onaylı çıktısıdır (Charter
> artefaktları #21 Min/Full Digital Twin Spec · #22 Borçlu 360 Product Architecture; Charter
> BR-16 Min vs Full Twin sınırı · BR-17 Borçlu 360 read-model kompozisyonu · BR-21 M8 faz sınırı).
> İçerik GO-ANALYZE (DBP-09 R0.1 → R0.2) çıktısıdır; bu GO-DOCS turunda yeni analiz veya owner
> kararı üretilmemiştir. **DIGITAL TWIN IMPLEMENTATION HOLD.** Digital Twin source-of-truth
> DEĞİLDİR (N-11); read-model UPSTREAM fact'i DEĞİŞTİREMEZ (INV-09); tile görünürlüğü mimari-aday
> sınıflandırmadır, nihai izin DEĞİLDİR → DBP-10 default-deny.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-09 — DIGITAL TWIN & BORÇLU 360 READ-MODEL ARCHITECTURE (L7-read-model)
VERSION            : v1.0 (R0.2 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 SUBJECT-ROOT & READ-MODEL CORRECTION);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[M] — bkz. §15)
REVIEW DISPOSITION : OWNER-APPROVED / DIGITAL TWIN IMPLEMENTATION HOLD — yeni bir repository
                     lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : Digital Twin Implementation HOLD unlock koşulları (DBP-10 authz/visibility/
                     KVKK matrisi · office tenant-only read gap remediation · DBP-11 freshness/
                     conflict/rebuild/failure test-gate · OutstandingExposure/CaseFullyPaid
                     published-contract · explicit owner GO-IMPLEMENT) · A22 tile-permission
                     nihai kararı (DBP-10) · Behavior Summary user-facing (KVKK) · Party
                     Foundation (yalnız Party-root Twin/Party Target View/Party-level cutover için)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları Phase 1 GO-ANALYZE (2026-07-15); GO-DOCS drift kontrolü ve bu
                     belgenin AS-IS kanıt re-verification base'i origin/main @ 3cd4b11c (fetch
                     2026-07-16): Party modeli YOK (targetPartyId çözülemez) · cross-case okuma
                     CrossFileService (tenant-filtreli) + getCrossFileDebtorAlerts (AuditLog
                     advisory) · tile freshness/staleness hesabı YOK — SIFIR davranış değişikliği
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir read-model/twin/tile için implementasyon, schema,
                     cutover veya aktivasyon yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : TW/T360/TILE/TL kimlikleri DBP-09-local PROPOSED'dur (DBP-12'ye kadar).
                     BR/BC/OBD/OD/N/INV kimlikleri Charter/DBP-03/DEBTOR-GOVERNANCE'ındır.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md` (SYS-AI §11
Twin≠SoT) → `DEBTOR-GOVERNANCE.md` (INV-09 geri-yazma yok; §8.1 MS/DEC-16 Min Twin NBA'dan önce) →
tasarım kaynakları. Execution/safety — `AGENTS.md` + task authorization. `N-11`: Digital Twin SoT
değildir. `N-15`: Minimum Digital Twin NBA'yı beklemez.

## RELATED DOCUMENTS

- Charter: `.../DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` (BR-16/17/21)
- DBP-03 (L2): `.../DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md` (BC-16 Read Models & Reporting ·
  BC-17 Product Surfaces 360 — `SOURCE SEMANTICS: UPSTREAM · PROJECTION OWNERSHIP: DEBTOR ·
  INDEPENDENT SEMANTIC AUTHORITY: NONE`; INV-09 tek-yön CF)
- DBP-04/05/06/07/08: legal fact/eligibility/guard (DBP-04) · event/timeline (DBP-05) · Party/
  identity (DBP-06; targetPartyId kaynağı) · LegalRole/Responsibility (DBP-07; Representation/
  financial tile semantiği) · Behavior/Score/NBA (DBP-08; NBA→read-model, shadow-only)
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md` (§3 Digital Twin ≠ SoT; §8.1)

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC / S-OWN / HOST / EXEC — DBP-02..08 sözlüğüyle aynı.
DEC ∈ { CANONICALLY DEFINED (CD) · PROPOSED · OWNER DECISION REQUIRED (ODR) ·
        VERIFICATION REQUIRED (VR) }
DTIB = DIGITAL TWIN IMPLEMENTATION BLOCKER — yeni Twin/tile aktivasyonunu engelleyen kalem
       (blueprint-analysis-blocker'dan AYRI: analiz kapanabilir, aktivasyon kapanmaz).
Aksi yazılmadıkça: S-OWN=DEBTOR (projection) · TENANT SCOPE=tenant-local · EXEC=NOT AUTHORIZED.
```

---

## 3. Twin Temel İlkeleri — OWNER-APPROVED [A] (Twin ≠ SoT; authz sınırı değil)

```text
- DIGITAL TWIN ≠ SOURCE OF TRUTH (N-11): Twin/read-model yalnız kendi TÜRETİLMİŞ projection
  sürümünün otoritesidir (`PROJECTION-STATE AUTHORITY: YES`); business/legal SEMANTIC AUTHORITY:
  NONE; UPSTREAM FACT MUTATION: PROHIBITED (INV-09; geri-yazma yok).
- TWIN BİR AUTHORIZATION BOUNDARY DEĞİLDİR (RC): her okuma field/record seviyesinde YENİDEN
  yetkilendirilir (tenant + actor-capacity + resource-scope + case/client/portfolio-relationship
  + need-to-know + field-data-classification). Twin/cache authz SONUCUNU kalıcı SAKLAYAMAZ.
- Read-model CROSS-CONTEXT ORCHESTRATOR DEĞİLDİR: frontend paralel authz birleştirme / client-side
  finansal hesap / sessiz conflict çözümü YAPAMAZ (RC).
```

---

## 4. Twin Subject Root — OWNER-APPROVED [B] (BR-16; OPTION C — Party target + transitional)

```text
TWIN SUBJECT ROOT = OPTION C: Party TARGET kök + transitional projeksiyonlar:
  - DEBTOR-ROOT TWIN     : cross-case borçlu görünümü (transitional; Party yoksa).
  - CASEDEBTOR-ROOT TWIN : dosya-özgü görünüm (transitional).
  - PARTY-ROOT TWIN      : hedef (Party Foundation gerektirir — P1'de GEREKMEZ; §8).
SUBJECT-SCOPED PROJECTIONS AYRI (RC): CaseDebtor Twin / Debtor Twin / Party Twin farklı; case-fact'ler
  Debtor/Party köküne KONTROLSÜZ YÜKSELTİLEMEZ.
targetPartyId RESOLUTION (RC): Party yoksa NULL / UNRESOLVED — SAHTE placeholder YASAK. PartyLinkStatus
  metadata: `NOT_AVAILABLE · UNRESOLVED · LINKED · CONFLICTING`.
AS-IS (VERIFIED @3cd4b11c): Party modeli YOK → P1 Twin yalnız Debtor/CaseDebtor köküyle çalışır;
  Party Foundation P1 transitional Twin için GEREKMEZ (RC-DBP09-12).
```

---

## 5. Minimum Digital Twin Contract (A21 / #21) — OWNER-APPROVED [C] (kritik tile'lar; DTIB)

Minimum Twin'in kritik tile'ları — her biri **source + as-of + freshness + missingness + conflict +
lineage** olmadan AKTİVE EDİLEMEZ (yalnız `staleDays` hesaplayıp GÖSTERMEMEK yetmez):

| TILE | Kaynak | Not |
|---|---|---|
| LegalStatus / Legal Condition | DBP-04 AX-C / DA-07 | coverage sonucu ≠ condition |
| Eligibility | DBP-04 AE-01 | üç-değerli; NOT_EVALUABLE≠NOT_ELIGIBLE |
| LegalGuard | DBP-04 AE-02 | ALLOW/BLOCK/WARN/NOT_EVALUABLE |
| OutstandingExposure | DBP-07 EX-01 (Alacak derived) | **responsibility-limit ≠ açık-borç; collection-total ≠ outstanding-balance; missing-exposure ≠ 0** |
| CaseFinancialStatus / CaseFullyPaid | Alacak/Muhasebe published-contract | **accounting ≠ hukuki-tam-ödeme** |
| Representation / LegalResponsibility | DBP-07 RP/RS | temsil yetki vermez; responsibility parasal değil |

```text
KURAL (RC — IMPLEMENTATION BLOCKER): kritik tile source/as-of/freshness/missingness/conflict/lineage
metadata'sı olmadan üretilemez. FINANSAL TILE SEMANTİĞİ (RC): responsibility-limit ≠ açık borç ·
collection-total ≠ outstanding balance · missing-exposure ≠ sıfır · accounting ≠ hukuki tam ödeme.
```

---

## 6. Borçlu 360 Read-Model (A22 / #22) — OWNER-APPROVED [D] (BR-17; OPTION C Hybrid)

```text
READ-MODEL COMPOSITION = OPTION C (Hybrid): upstream context'lerden türetilen projeksiyon
  kompozisyonu; BC-16 → BC-17 tek yön (INV-09; geri-yazma yok); BC-15 → BC-17 advisory.
TILE-VISIBILITY (RC): A22 tile-görünürlük mimari-ADAY sınıflandırmadır; G-7 NİHAİ permission DEĞİL
  → DBP-10 default-deny nihai kararı verir.
BEHAVIOR SUMMARY (RC): P1 internal/authorized/read-only; KVKK sign-off olmadan müvekkil/borçlu/
  personele GÖSTERİLMEZ (→ DBP-10). Score/NBA görünürlüğü DBP-08 shadow-only ile aynı (user-facing OFF).
EVIDENCE LINK (RC): evidence-link görünürlüğü ≠ content erişim yetkisi (tenant+scope+access-class+
  actor-authz+legal-hold/export AYRICA); read-model'de belge KOPYALANMAZ.
ACTION AFFORDANCE (RC): kabul + execution ANLARINDA güncel fact/eligibility/guard/authz YENİDEN
  çalışır; eski snapshot/CPE execution yetkisi DEĞİL.
```

---

## 7. Read-Model Composition Boundaries (BC-16/BC-17) — OWNER-APPROVED [E]

BC-16 (Read Models & Reporting) ve BC-17 (Product Surfaces / 360): `SOURCE SEMANTICS: UPSTREAM ·
PROJECTION OWNERSHIP: DEBTOR · INDEPENDENT SEMANTIC AUTHORITY: NONE`. Akış: `upstream/BC-10 → BC-16 →
BC-17` (CF tek yön; INV-09). NBA → read-model (DBP-08; shadow-only). Min Twin NBA'dan BAĞIMSIZ
(N-15; NBA'dan önce gelir). Read-model UPSTREAM fact semantiğini yeniden yorumlayamaz/değiştiremez.

---

## 8. Digital Twin Implementation HOLD — OWNER-APPROVED [F] (unlock koşulları)

```text
DIGITAL TWIN IMPLEMENTATION = HOLD. Unlock koşulları (HEPSİ + explicit owner GO-IMPLEMENT):
  (1) DBP-10 authorization/visibility/KVKK matrisi (default-deny; tile-permission nihai).
  (2) OFFICE tenant-only read gap remediation (§9; DTIB YES).
  (3) DBP-11 freshness / conflict / rebuild / failure test-gate.
  (4) OutstandingExposure / CaseFullyPaid published-contract (DBP-05 event + DBP-07 koordinasyon;
      final publisher DBP-12 reconciliation).
  (5) explicit owner GO-IMPLEMENT.
PARTY FOUNDATION: yalnız Party Target View / Party-root Twin / Party-level cutover için GEREKLİDİR;
  P1 transitional Debtor/CaseDebtor Twin için GEREKMEZ (RC-DBP09-12; OD-04 HOLD'u P1 Twin'i bloke etmez).
```

---

## 9. OFFICE Tenant-Only Read Gap — OWNER-APPROVED [G] (RC-DBP09-05; DTIB: YES)

```text
BULGU (VERIFIED @analiz): mevcut okuma yüzeylerinde tenant-only scoping var; iş-yetki (actor-capacity/
need-to-know/relationship) katmanı EKSİK. → office tenant-only read gap = HIGH.
SINIFLANDIRMA: DIGITAL TWIN IMPLEMENTATION BLOCKER = YES (yeni Twin/tile aktivasyonu bu gap kapanmadan
  açılamaz). BLUEPRINT-ANALYSIS-BLOCKER = NO (analiz kapanabilir). Remediation + kesin authz matrisi
  DBP-10; test-gate DBP-11. Bu belge gap'i KAPATMAZ.
```

---

## 10. Aggregate / Record Candidates + Lifecycle — OWNER-APPROVED [H]

Twin/360 read-model'leri **PROJECTION** kayıtlarıdır: yeni SoT KURMAZ; kendi türetilmiş projection
sürümünün otoritesidir; upstream fact'i mutate etmez (INV-09). Record model/lifecycle/immutability =
**VR → DBP-05**. Cache/materialization authz sonucunu kalıcı saklayamaz (§3).

---

## 11. AS-IS Evidence (VERIFIED @3cd4b11c — bu belge davranış değiştirmez)

Party modeli YOK → targetPartyId NULL/UNRESOLVED (transitional Debtor/CaseDebtor kök) · cross-case
okuma `CrossFileService` (address-discovery/cross-file.service.ts; TCKN/VKN/MERSİS tenant-filtreli) +
`getCrossFileDebtorAlerts` (AuditLog advisory) · tile freshness/staleness/conflict/lineage hesabı YOK
(kritik tile aktivasyonu için eksik) · office tenant-only read gap (iş-yetki katmanı eksik) · Min/Full
Twin modeli YOK · Borçlu 360 birleşik read-model YOK.

---

## 12. DBP-10/11/12 Routing

| Hedef | Giden |
|---|---|
| **DBP-10** | tile-permission nihai kararı (default-deny) · office tenant-only gap remediation authz · Behavior Summary KVKK · evidence-content erişim ayrımı · masking sınıfları |
| **DBP-11** | freshness/conflict/rebuild/failure test-gate · read-model reconciliation · DTIB kalemleri Master Blocker Register'a |
| **DBP-12** | Twin Subject Root/Read-Model final disposition · OutstandingExposure/CaseFullyPaid published-contract + publisher · financial-tile semantik register |

---

## 13. ODR / Open Kayıtları (bu belge hiçbirini vermez/kapatmaz)

**HOLD/unlock:** Digital Twin Implementation (§8 beş koşul + owner GO-IMPLEMENT).
**ODR/DBP-10:** A22 tile-permission nihai kararı · office tenant-only gap authz matrisi · Behavior
Summary/score/NBA user-facing (KVKK).
**DBP-11:** freshness/conflict/rebuild/failure test-gate.
**DBP-12:** exposure/CaseFullyPaid published-contract + publisher; Party-root Twin (Party Foundation).

---

## 14. Exit Blocker Matrisi (iki gate ayrı)

| Konu | (i) ANALYSIS APPROVAL WITH OPEN ITEMS? | (ii) FULLY RESOLVED L7 ARCHITECTURE? |
|---|---|---|
| Twin ≠ SoT + authz-değil ilkeleri (§3) | NO | **YES** |
| Twin Subject Root (OPTION C) | NO | **YES** |
| Min Twin critical-tile contract (§5) | NO | **YES** |
| Borçlu 360 read-model (OPTION C Hybrid) | NO | **YES** |
| Digital Twin Implementation HOLD | NO | CONDITIONAL (§8 unlock) |
| Office tenant-only read gap (DTIB) | NO | CONDITIONAL (DBP-10 remediation) |
| Tile freshness/conflict/lineage | NO | CONDITIONAL (DBP-11 test-gate) |
| Tile-permission nihai | NO | CONDITIONAL (DBP-10 default-deny) |

DBP-09, açık kalemleri görünür taşıyarak **OWNER-APPROVED / DIGITAL TWIN IMPLEMENTATION HOLD**
disposition'ıyla kapanmıştır (2026-07-15); Twin aktivasyonu §8 unlock koşulları + owner GO-IMPLEMENT
tamamlanmadan VERİLEMEZ.

---

## 15. Owner Approval Record

```text
APPROVE DBP-09 R0.2 — OWNER-APPROVED / DIGITAL TWIN IMPLEMENTATION HOLD (2026-07-15, chat-only owner
kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[M]): Twin temel ilkeleri (Twin≠SoT; authz-boundary-değil; cross-context-orchestrator-
değil) · Twin Subject Root (OPTION C; targetPartyId NULL/UNRESOLVED; subject-scoped projections ayrı) ·
Minimum Digital Twin critical-tile contract (source/as-of/freshness/missingness/conflict/lineage;
financial-tile semantiği) · Borçlu 360 read-model (OPTION C Hybrid; tile-visibility mimari-aday;
Behavior Summary internal; evidence-link≠content; action-affordance re-guard) · Read-Model Composition
boundaries (BC-16/17 UPSTREAM; INV-09) · Digital Twin Implementation HOLD (unlock koşulları) · office
tenant-only read gap (DTIB YES) · Aggregate/Record projection ayrımı.
KARARLAR: Twin Subject Root = OPTION C · Read-Model Composition = OPTION C (Hybrid) · Digital Twin
Implementation = HOLD.
ONAYLANMAMIŞ/AÇIK: §8 unlock koşulları (DBP-10 authz/KVKK · office gap remediation · DBP-11 test-gate ·
exposure/CaseFullyPaid published-contract · owner GO-IMPLEMENT) · A22 tile-permission nihai (DBP-10) ·
Behavior Summary user-facing (KVKK) · Party Foundation (Party-root Twin) — statüleri HOLD / ODR /
SIGN-OFF PENDING olarak korunur.
```

**Revizyon geçmişi (özet):** R0.1 ilk L7 analizi (Min/Full Twin + Borçlu 360; Twin≠SoT; AS-IS Party-yok
+ cross-case read tespiti) → R0.2 SUBJECT-ROOT & READ-MODEL CORRECTION (Twin Subject Root OPTION C +
subject-scoped projections; targetPartyId NULL/UNRESOLVED + PartyLinkStatus; critical-tile source/
freshness/lineage IMPLEMENTATION BLOCKER; financial-tile semantiği; Twin authz-boundary-değil + her-
okuma-re-authz; tile-visibility mimari-aday→DBP-10; evidence-link≠content; action-affordance re-guard;
office tenant-only read gap DTIB; Party Foundation P1-transitional-için-gerekmez) → GO-DOCS pre-
normalizasyonu (repo BR-16/17/21 + BC-16/17 + N-11/15 + INV-09 cross-ref'leri; AS-IS @3cd4b11c
re-verification; RC clarification'ların gövdeye absorbe edilmesi). Ara revizyon metinleri görev
sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Digital Twin SoT olarak mı sunuldu:                          NO (§3; N-11/INV-09)
- Read-model upstream fact'i değiştiriyor mu:                  NO (§3/§7; INV-09 geri-yazma yok)
- Twin bir authorization boundary olarak mı:                   NO (§3; her okuma re-authz)
- targetPartyId sahte placeholder üretti mi:                   NO (§4; NULL/UNRESOLVED + PartyLinkStatus)
- case-fact'ler Debtor/Party köküne kontrolsüz yükseldi mi:    NO (§4; subject-scoped ayrı)
- Kritik tile freshness/lineage'sız aktive edildi mi:          NO (§5; IMPLEMENTATION BLOCKER)
- Finansal tile semantiği karıştırıldı mı:                     NO (§5/§6; limit≠borç, accounting≠hukuki)
- Tile-visibility nihai permission olarak mı sunuldu:          NO (§6; mimari-aday → DBP-10 default-deny)
- Behavior Summary KVKK'sız user-facing mı:                    NO (§6; internal/read-only)
- Evidence-link content erişimi olarak mı:                     NO (§6; ayrı authz)
- Action affordance eski snapshot'la execution veriyor mu:     NO (§6; kabul+execution re-guard)
- Frontend cross-context orchestrator mı:                      NO (§3; paralel authz/hesap yasak)
- Digital Twin Implementation HOLD korundu mu:                 YES (§8; unlock + owner GO)
- Office tenant-only read gap kapatıldı/gizlendi mi:           NO (§9; DTIB YES → DBP-10)
- Party Foundation P1 transitional Twin için şart mı denildi:  NO (§8; RC-DBP09-12)
- Record immutability çözülmüş gösterildi mi:                  NO (VR — DBP-05; §10)
- IMPLEMENTATION AUTHORITY: NONE korundu:                      YES
- Register/decision-log değişikliği:                           NO
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
