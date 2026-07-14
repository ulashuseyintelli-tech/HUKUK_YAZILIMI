# OFFICE Delivery Manifest — Authoritative Living Delivery Source

```text
Belge yolu    : project/docs/governance/OFFICE-DELIVERY-MANIFEST.md
Durum         : OWNER-APPROVED CANONICALIZATION v1.0 (2026-07-14); CANONICAL UPON APPROVED MERGE TO MAIN
Rol           : AUTHORITATIVE LIVING DELIVERY SOURCE — Finding/Decision/Slice/Wave/Milestone/
                Dependency ilişki modelinin TEK kaynağı; Phase 1 (Incremental Canonical Slice
                Delivery) boyunca YAŞAYAN, yerinde güncellenen tek belge (milestone başına yeni
                sürüm ÜRETİLMEZ).
Kapsam        : OFFICE domain, Phase 1 delivery tracking. Phase 0 (WS0.1-WS0.4) kapanmış
                foundation'ın çıktısını (12 Finding, 20 Decision, 3 Slice) girdi olarak alır.
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir slice'ı GO-IMPLEMENT ile başlatmaz; yalnız
                readiness'i hesaplar. Owner selection + explicit GO ayrı ve zorunludur.
```

## RELATED DOCUMENTS

- Domain Law: `OFFICE-GOVERNANCE.md` · Risk dossier: `OFFICE-RISK-REGISTER.md` (STF-PRD-*) ·
  Decision dossier: `OFFICE-OWNER-DECISIONS.md` (OFF/OD-*) · Evidence: `OFFICE-MASTER-SYNTHESIS.md`
- Global register pointer'ları (bu belge tarafından mutable durum KOPYALANMAZ): `active-roadmap.md`,
  `product-backlog.md` (MPB-031), `master-triage-register.md`
- Sibling precedent (analog, farklı domain): `COLLECTION-DECOMPOSITION.md`

## 1. Veri Modeli

```text
PHASE 1 (Incremental Canonical Slice Delivery)
 └─ WAVE                (sıralama konteyneri — hangi bölüm önce yürütülür)
     └─ SLICE            readinessStatus{NOT_READY,NEXT_ELIGIBLE} ·
                          ownerSelectionStatus{NOT_SELECTED,SELECTED} ·
                          implementationAuthorization{NONE,GO_IMPLEMENT_ISSUED} ·
                          implementationCategory{WIRING,HARDENING,EXTENSION,NEW_SUBSYSTEM}
                          (owner eklentisi, 2026-07-14 — WAVE 1 decomposition'da CANDIDATE-A/B'nin
                          aynı sınıfta olmadığını ayırt etmek için: WIRING = mevcut mekanizmayı
                          tetikleyen küçük değişiklik, NEW_SUBSYSTEM = sıfırdan altyapı)
         └─ MILESTONE     (derived event — Slice.status→CANONICAL olduğunda otomatik üretilir;
                            elle yazılmaz)

FINDING ──┬─(governance sorusu varsa)────────> DECISION ──┐
DOMAIN LAW/ADR ─(açık owner kapısı, ör. §6/§15)─> DECISION ─┼──> SLICE ──IMPLEMENTS──> DECISION
FINDING ──(salt mühendislik, karar gerekmez)────────────────┘        └──RESOLVES──> FINDING

DECISION   lifecycleStatus{OPEN,CLOSED_CANONICAL,DEFERRED,SUPERSEDED} ·
           resolutionMode{OWNER_SELECTED,SAFE_DEFAULT,NOT_RESOLVED} ·
           gateEffect{BLOCKING,NON_BLOCKING}

DEPENDENCY typed edge (HARD|SOFT): REQUIRES · BLOCKED_BY · IMPLEMENTS · RESOLVES · SUPERSEDES · EVIDENCED_BY
SLICE      ayrıca taskDecompositionRefs[] taşır (T0.3.x/PR/GO-IMPLEMENT kanıt zinciri)
```

**Wave seviyesi readiness (owner düzeltmesi, 2026-07-14):** Bir Wave'in altındaki bağımlılıklar
(Decision'lar) kapansa bile, somut bir Slice kaydı henüz OLUŞTURULMADIYSA Wave `NEXT_ELIGIBLE`
DEĞİLDİR — `READY_FOR_CANDIDATE_DECOMPOSITION`'dır. `NEXT_ELIGIBLE`, yalnız gerçek bir Slice kaydı
var olduğunda ve o Slice'ın kendi bağımlılıkları kapandığında kullanılır (bkz. SLICE-01/02/03,
§4). Bir Wave'in kaç slice'a böleceği candidate decomposition sırasında belirlenir, önceden
varsayılmaz.

## 2. Finding Register (12/12 — hepsi bir disposition aldı)

| ID | Sev | İlgili Decision(lar) | Decision Durumu | DISPOSITION | Not |
|---|---|---|---|---|---|
| STF-PRD-BOLA-001 | P1 | OFF/OD-08, OFF/OD-09 | OD-08 OPEN(BLOCKING) · OD-09 CLOSED | LINKED TO DECISION | OD-08 kapanmadan slice başlamaz |
| STF-PRD-SES-001 | P1 | OFF/OD-14, OFF/OD-15 | ikisi de CLOSED_CANONICAL | LINKED TO DECISION | WAVE 1 kapsamına giriyor (SES-002 ile birlikte triyaj edilecek) |
| STF-PRD-RBAC-001 | P2 | OFF/OD-05, OFF/OD-09 | ikisi de CLOSED_CANONICAL | LINKED TO DECISION | WAVE 2 kapsamına giriyor |
| STF-PRD-SCP-001 | P2 | OFF/OD-08 | OPEN(BLOCKING) | LINKED TO DECISION | BOLA-001 ile aynı gate |
| STF-PRD-CFG-001 | P2 | — | yok | UNMAPPED — OWNER REVIEW REQUIRED | Hiçbir OD'ye bağlı değil; owner karar-gerekmez mi onaylamalı |
| STF-PRD-LIFE-001 | P2 | OFF/OD-16, OFF/OD-17 | OD-16 OPEN(NON_BLOCKING) · OD-17 CLOSED | LINKED TO DECISION | OD-16 non-blocking — owner bunun gerçekten gate olup olmadığını teyit etmeli |
| STF-PRD-PRIV-001 | P2 | OFF/OD-18 | CLOSED_CANONICAL | LINKED TO SLICE | = SLICE-03 (DEFERRED, minimum-safe-slice'a daraltılmalı) |
| STF-PRD-OPS-001 | P2 | OFF/OD-19 | OPEN(BLOCKING) | LINKED TO DECISION | — |
| STF-PRD-PERF-001 | P3 | — | yok | UNMAPPED — OWNER REVIEW REQUIRED | Karar gerekmez (salt mühendislik) ama henüz slice'a triyaj edilmedi |
| STF-PRD-BOLA-002 | P3 | OFF/OD-10 | OPEN(BLOCKING) | LINKED TO DECISION | — |
| STF-PRD-DATA-001 | P3 | OFF/OD-01, OFF/OD-03 | OD-01 CLOSED · OD-03 OPEN(BLOCKING) | LINKED TO DECISION | OD-03 kapanmadan DB-constraint işi başlamaz |
| STF-PRD-SES-002 | P3 | OFF/OD-15 | CLOSED_CANONICAL | LINKED TO DECISION | WAVE 1 kapsamına giriyor (SES-001 ile birlikte triyaj edilecek) |

### 2b. Yeni Bulgular (WAVE 1 decomposition sırasında keşfedildi — Risk Register kaydı BEKLİYOR)

Bu bölümdeki kayıtlar `OFFICE-RISK-REGISTER.md`'nin resmi `STF-PRD-*` register'ında HENÜZ YOKTUR —
kanonik risk otoritesi hâlâ o dosyadır, bu tablo yalnız keşif anını ve disposition'ı kaydeder.
Bu satır tek başına global triage/backlog yetkisi üretmez.

| Kayıt | Keşif Bağlamı | relatedInvariant | DISPOSITION |
|---|---|---|---|
| Staff offboarding audit trail eksikliği | WAVE 1 Candidate Decomposition (`staff.service.ts:remove()`'un hiç audit log yazmadığı, `lawyer.service.ts:delete()`'in aksine, kod okunarak doğrulandı) | OFF-INV-08 | NEW FINDING — FUTURE WAVE |

## 3. Decision Register (20/20 — 3-eksen model)

| ID | lifecycleStatus | resolutionMode | gateEffect | dependsOn (REQUIRES) |
|---|---|---|---|---|
| OFF/OD-01 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-02, OD-11 |
| OFF/OD-02 | OPEN | NOT_RESOLVED | NON_BLOCKING | OD-01, OD-07 |
| OFF/OD-03 | OPEN | NOT_RESOLVED | BLOCKING | OD-04 |
| OFF/OD-04 | DEFERRED | NOT_RESOLVED | NON_BLOCKING | OD-03 |
| OFF/OD-05 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-06, OD-09, ADR-009 |
| OFF/OD-06 | OPEN | NOT_RESOLVED | NON_BLOCKING | OD-05, DBIND§5 |
| OFF/OD-07 | OPEN | NOT_RESOLVED | BLOCKING | OD-02 |
| OFF/OD-08 | OPEN | NOT_RESOLVED | BLOCKING | OD-09, OD-10 |
| OFF/OD-09 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-05, OD-08 |
| OFF/OD-10 | OPEN | NOT_RESOLVED | BLOCKING | OD-08 |
| OFF/OD-11 | CLOSED_CANONICAL | OWNER_SELECTED | NON_BLOCKING | OD-01, ADR-009 — IMPLEMENTS→SLICE-02 |
| OFF/OD-12 | OPEN | NOT_RESOLVED | BLOCKING | OD-11, ADR-009 |
| OFF/OD-13 | OPEN | NOT_RESOLVED | BLOCKING | OD-12 |
| OFF/OD-14 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-15 |
| OFF/OD-15 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-14, Platform |
| OFF/OD-16 | OPEN | NOT_RESOLVED | NON_BLOCKING | §18 orchestration |
| OFF/OD-17 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | OD-03, OD-16 |
| OFF/OD-18 | CLOSED_CANONICAL | OWNER_SELECTED | BLOCKING | Privacy, HR — IMPLEMENTS→SLICE-03 (deferred) |
| OFF/OD-19 | OPEN | NOT_RESOLVED | BLOCKING | Product, HR |
| OFF/OD-21 | CLOSED_CANONICAL | OWNER_SELECTED | NON_BLOCKING | OD-05 |

*(11 OPEN: OD-02,03,04,06,07,08,10,12,13,16,19 · 9 CLOSED_CANONICAL: OD-01,05,09,11,14,15,17,18,21
— `OFFICE-OWNER-DECISIONS.md` ile birebir tutarlı, 2026-07-14 itibarıyla.)*

## 4. Slice Register

| ID | status | readinessStatus | relatedDecision | relatedFinding | ownerSelectionStatus | implementationAuthorization | implementationCategory | taskDecompositionRefs | Not |
|---|---|---|---|---|---|---|---|---|---|
| SLICE-01 | DEFERRED | NOT_READY | OFF/OD-21 (CLOSED) | — | — | — | — | T0.3.1, T0.3.3, T0.3.4 | Karar kapalı ama implementation surface yok (User rol/deaktivasyon hiç inşa edilmemiş) |
| SLICE-02 | CANONICAL | — | OFF/OD-11 (CLOSED) | — | SELECTED | GO_IMPLEMENT_ISSUED (tamamlandı) | — | T0.3.1 REV2, T0.3.3 REV2/3, T0.3.4 REV3, GO-IMPLEMENT | PR #1226, mergeSha `a3eee8b8` |
| SLICE-03 | DEFERRED | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | — | — | — | T0.3.1 REV2 | Karar kapalı, scope minimum-safe-slice'a daraltılmalı |
| CANDIDATE-A | CANDIDATE | NEXT_ELIGIBLE | OFF/OD-14 (CLOSED) | STF-PRD-SES-001 | **SELECTED** (2026-07-14) | NONE | **WIRING** | GO-ANALYZE (WAVE 1 decomposition) | Offboarding → User Deactivation Wiring — bkz. §4b |
| CANDIDATE-B | CANDIDATE | NOT_READY | OFF/OD-15 (CLOSED) | STF-PRD-SES-002 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | GO-ANALYZE (WAVE 1 decomposition) | JWT/Session Revocation Mechanism (tokenVersion) — bkz. §4b |

### 4b. WAVE 1 Candidate Detay (Objective/Scope/Risk — GO-ANALYZE'den kanonikleştirildi)

```text
CANDIDATE-A — Offboarding → User Deactivation Wiring
Objective     Staff/Lawyer pasifleştirmesi bağlı User hesabını da (varsa) deaktive etsin —
              mevcut per-request enforcement'ı (auth.service.ts:validateUser(), her istekte
              User.isActive kontrol eder) tetiklesin.
Scope         staff.service.ts:remove() · lawyer.service.ts:delete()
Dependencies  Yok
Est. impl. surface   KÜÇÜK — schema/migration YOK (User.isActive + Lawyer/StaffMember.userId
                     FK zaten var)
Risk                 DÜŞÜK — additive
Suggested order      1.

CANDIDATE-B — JWT/Session Revocation Mechanism (tokenVersion)
Objective     OD-15'in seçtiği mekanizma: kısa access TTL + refresh-time DB check +
              tokenVersion.
Scope         schema migration (User.tokenVersion) · JwtPayload + validateUser() genişletmesi ·
              tokenVersion increment tetikleyicileri · muhtemelen yeni refresh-token akışı
              (şu an YOK — grep: 0 eşleşme)
Dependencies  Yok (teknik blok yok) — CANDIDATE-A'nın önce gitmesi önerilir
Est. impl. surface   ORTA-BÜYÜK — migration + auth çekirdeğine dokunan geniş blast-radius
Risk                 ORTA-YÜKSEK — Contract fazı muhtemelen High/Ultra çalışma seviyesi gerektirir
Suggested order      2.
```

## 5. Milestone Register (yalnız CANONICAL slice'lardan türetilir)

```text
PHASE 1 MILESTONE 01
SLICE-02 · IMPLEMENTED · MERGED · CANONICAL (main @ a3eee8b8, 2026-07-13)
```

## 6. Mapping Completeness ve Orphan Kontrolü

```text
Finding toplam: 12 · disposition atanan: 12/12 (2 UNMAPPED — OWNER REVIEW REQUIRED, açıklamalı)
Decision toplam: 20 · her biri en az bir kökene bağlı (Finding VEYA Domain Law §referansı) — orphan YOK
Slice toplam: 3 · her biri bir Decision'a bağlı — orphan YOK
Decision→Decision dependsOn referansları: tamamı OFFICE-OWNER-DECISIONS.md'nin kendi
  DEPENDENCIES alanından türetildi, ekleme/çıkarma yapılmadı
Yeni bulgu (§2b): 1 — Risk Register'ın 12'sine DAHİL DEĞİL, ayrı izleniyor, sayıya karışmıyor
```

## 7. Wave Önerisi

```text
WAVE 1 — Session/Lifecycle Safety              [P1, karar TAM kapalı]
  Kapsam: STF-PRD-SES-001 + STF-PRD-SES-002 (OD-14 + OD-15 CLOSED_CANONICAL)
  readinessStatus: CANDIDATE DECOMPOSITION COMPLETE (2026-07-14, kod-kanıtlı)
  SONUÇ: SES-001+SES-002 TEK slice ÜRETMEDİ — farklı implementationCategory'de 2 candidate:
    CANDIDATE-A (WIRING, SELECTED) · CANDIDATE-B (NEW_SUBSYSTEM, NOT_SELECTED)
  Detay: §4 Slice Register + §4b

WAVE 2 — Authority/RBAC Consistency            [P2, karar TAM kapalı]
  Kapsam: STF-PRD-RBAC-001 (OD-05 + OD-09 CLOSED_CANONICAL)
  readinessStatus: READY_FOR_CANDIDATE_DECOMPOSITION

WAVE 3 — Privacy Field-Masking (revival)        [P2, karar kapalı, scope daraltma gerekir]
  Kapsam: SLICE-03 revival (OD-18 CLOSED_CANONICAL, STF-PRD-PRIV-001)
  readinessStatus: NOT_READY (scope narrowing required first)

WAVE 4+ — Gated (henüz decision-tarafı kapanmadı)
  BOLA-001/SCP-001 ← OD-08 OPEN · BOLA-002 ← OD-10 OPEN · DATA-001 ← OD-03 OPEN ·
  OPS-001 ← OD-19 OPEN · LIFE-001 ← OD-16 OPEN(non-blocking, teyit gerekir)

UNMAPPED (owner review required, decision-graph dışı)
  STF-PRD-CFG-001, STF-PRD-PERF-001
```

## 8. NEXT ELIGIBLE UNIT (readiness ≠ authorization)

```text
NEXT ELIGIBLE UNIT: CANDIDATE-A — Implementation Contract Draft

Proposed sequence: CANDIDATE-A → CANDIDATE-B (WAVE 1 içinde) → WAVE 2
(Bu bir sıralama ÖNERİSİDİR — implementation authorization DEĞİLDİR.)

ownerSelectionStatus (CANDIDATE-A)        : SELECTED (2026-07-14)
implementationAuthorization (CANDIDATE-A) : NONE
ownerSelectionStatus (CANDIDATE-B)        : NOT_SELECTED
implementationAuthorization (CANDIDATE-B) : NONE
```
```text
NEXT ELIGIBLE ≠ AUTHORIZED.
CANDIDATE-A'nın ownerSelectionStatus'u SELECTED olsa bile implementationAuthorization hâlâ NONE'dur.
Contract fazının başlaması için owner'ın ayrı, açık bir GO'su gerekir. Bu belge onu üretmez.
```

## 9. Document Self-Check

```text
- WAVE varlığı eklendi:                                YES
- Milestone yalnız CANONICAL slice'tan türetildi:      YES (yalnız SLICE-02)
- readinessStatus/ownerSelectionStatus/                YES (SLICE §4'te ayrı alanlar)
  implementationAuthorization ayrı alanlar:
- Decision 3 eksene ayrıldı:                           YES (§3)
- Dependency tipli + HARD/SOFT:                        Kayıtlı ama bu sürümde tüm mevcut
                                                        edge'ler REQUIRES/IMPLEMENTS/RESOLVES
                                                        tipinde ve HARD (OFF/OD'nin kendi
                                                        DEPENDENCIES alanı hiçbir SOFT ayrımı
                                                        yapmıyor) — SOFT örnek yok, icat edilmedi
- 12/12 Finding disposition aldı:                      YES
- 20/20 Decision işlendi:                              YES
- 3/3 mevcut Slice işlendi:                             YES
- Wave 1/2 kendisi NEXT_ELIGIBLE OLARAK işaretlenmedi:  YES (WAVE 1: CANDIDATE DECOMPOSITION
                                                        COMPLETE, kendi candidate'ları readiness
                                                        taşır · WAVE 2: hâlâ
                                                        READY_FOR_CANDIDATE_DECOMPOSITION)
- Global register'larda mutable durum çoğaltılmadı:     YES (yalnız pointer, bkz. bu PR'ın
                                                        active-roadmap.md/product-backlog.md/
                                                        master-triage-register.md değişiklikleri)
- Kod/schema/implementation değişikliği:                NONE
- implementationCategory eklendi (§1):                  YES (WIRING/HARDENING/EXTENSION/NEW_SUBSYSTEM)
- CANDIDATE-A/B §4 Slice Register'a işlendi:             YES (CANDIDATE statüsünde, SLICE-0N'e
                                                        yeniden numaralandırılmadı — owner'ın
                                                        kendi kullandığı ID korundu)
- Yeni bulgu (audit gap) UNMAPPED yerine NEW FINDING/    YES (§2b, OFF-INV-08, FUTURE WAVE —
  FUTURE WAVE olarak kaydedildi:                        Risk Register'a henüz eklenmedi, ayrıca
                                                        işaretlendi)
- WAVE 2/3/4+ veya orijinal 12 Finding değiştirildi mi:  NO (brief'in BOUNDARY'sine uyuldu)
- Contract başlatıldı mı:                                NO (yalnız manifest bookkeeping)
```
