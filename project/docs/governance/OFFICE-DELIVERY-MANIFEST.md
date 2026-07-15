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
     └─ SLICE            readinessStatus{NOT_READY,NEXT_ELIGIBLE,READY_FOR_CONTRACT}
                          (READY_FOR_CONTRACT owner eklentisi, 2026-07-14 — bir Candidate owner
                          tarafından SELECTED edildiğinde ama Contract henüz taslak DEĞİLKEN ara
                          durumu adlandırmak için; NEXT_ELIGIBLE'ın yerini almaz, iki değer
                          arasındaki kesin sınır ileride ayrıca netleştirilebilir) ·
                          ownerSelectionStatus{NOT_SELECTED,SELECTED,NOT_A_SELECTABLE_SLICE}
                          (NOT_A_SELECTABLE_SLICE owner eklentisi, 2026-07-14 — ürün niyeti
                          netleşmeden Contract'a giremeyecek adaylar için; NOT_SELECTED'tan farkı:
                          NOT_SELECTED "seçilebilir ama seçilmedi", bu ise "seçilebilir hâle
                          gelmemiş") ·
                          implementationAuthorization{NONE,GO_IMPLEMENT_ISSUED,CONSUMED}
                          (CONSUMED owner eklentisi, 2026-07-14 — GO_IMPLEMENT_ISSUED'ın
                          implementasyon merge sonrası vardığı son durum; yetki "harcanmıştır",
                          aynı slice için tekrar implementasyon açmaz) ·
                          implementationCategory{WIRING,HARDENING,EXTENSION,NEW_SUBSYSTEM}
                          (owner eklentisi, 2026-07-14 — WAVE 1 decomposition'da CANDIDATE-A/B'nin
                          aynı sınıfta olmadığını ayırt etmek için: WIRING = mevcut mekanizmayı
                          tetikleyen küçük değişiklik, NEW_SUBSYSTEM = sıfırdan altyapı) ·
                          contractStatus{NOT_DRAFTED,DRAFT,RATIFIED} (owner eklentisi, 2026-07-14 —
                          Contract Draft/Validation/Ratification akışının kendi durumu; SLICE'ın
                          implementationAuthorization'ından AYRI — Contract RATIFIED olması
                          implementasyonu başlatmaz, yalnız GO-IMPLEMENT için hazır kılar)
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
| STF-PRD-PRIV-001 | P2 | OFF/OD-18 | CLOSED_CANONICAL | LINKED TO SLICE | = SLICE-03 → CANDIDATE-F1/F2/G/H decomp (WAVE 3). F1 CANONICAL (list-display maskeli, PHASE 1 MILESTONE 04); STF-PRD-PRIV-001 OPEN / NOT CLOSED — F1 bunu KAPATMAZ |
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
| `staff.controller.ts:remove()` HTTP exception swallowing (her exception `{error: message}` ile HTTP 200'e düşüyor; `update()` metodundaki `instanceof HttpException` re-throw guard'ı bu metotta YOK — mevcut asimetri) | CANDIDATE-A Contract Validation (kod okunarak doğrulandı; `lawyer.controller.ts`'in `delete()`'i aynı sorunu TAŞIMIYOR, try/catch yok, exception'lar doğru status'la geçiyor) | — (spesifik OFF-INV atanmadı — genel mühendislik/hata-yönetimi bulgusu) | NEW FINDING — FUTURE WAVE / NOT AUTHORIZED |

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

| ID | status | readinessStatus | relatedDecision | relatedFinding | ownerSelectionStatus | implementationAuthorization | implementationCategory | contractStatus | taskDecompositionRefs | Not |
|---|---|---|---|---|---|---|---|---|---|---|
| SLICE-01 | DEFERRED | NOT_READY | OFF/OD-21 (CLOSED) | — | — | — | — | — | T0.3.1, T0.3.3, T0.3.4 | Karar kapalı ama implementation surface yok (User rol/deaktivasyon hiç inşa edilmemiş) |
| SLICE-02 | CANONICAL | — | OFF/OD-11 (CLOSED) | — | SELECTED | GO_IMPLEMENT_ISSUED (tamamlandı) | — | RATIFIED (tamamlandı) | T0.3.1 REV2, T0.3.3 REV2/3, T0.3.4 REV3, GO-IMPLEMENT | PR #1226, mergeSha `a3eee8b8` |
| SLICE-03 | DEFERRED | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | — | — | — | — | T0.3.1 REV2 | Karar kapalı; WAVE 3 Candidate Decomposition ile CANDIDATE-F1/F2/G/H'e ayrıldı (2026-07-15). bkz. §4d |
| CANDIDATE-A | **CANONICAL** | — | OFF/OD-14 (CLOSED) | STF-PRD-SES-001 | SELECTED (2026-07-14) | **CONSUMED** (2026-07-14) | WIRING | RATIFIED (2026-07-14) | GO-ANALYZE + Contract Draft/Validation + GO-IMPLEMENT | Offboarding → User Deactivation Wiring — bkz. §4b. PR #1239, branch commit `55dc2374`, squash SHA `b0ce36db`, CI 4/4 PASS |
| CANDIDATE-B | **DEFERRED** (2026-07-14) | NOT_READY | OFF/OD-15 (CLOSED) | STF-PRD-SES-002 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | NOT_DRAFTED | GO-ANALYZE (WAVE 1 decomposition) | JWT/Session Revocation Mechanism (tokenVersion) — bkz. §4b. DEFERRED gerekçesi: CANDIDATE-A ile WAVE 1'in acil offboarding riski kapatıldı; bu, geniş auth/session altyapısı gerektiren ayrı bir iş |
| CANDIDATE-C | **CANONICAL** | — | OFF/OD-05, OFF/OD-09 (ikisi de CLOSED) | STF-PRD-RBAC-001 | **SELECTED** (2026-07-14) | **CONSUMED** (2026-07-15) | **HARDENING** | **RATIFIED_WITH_RECORDED_LIMITATIONS** (2026-07-14) | GO-ANALYZE (WAVE 2 decomposition) + Owner Re-scope + Contract Draft/Validation/Ratification + GO-IMPLEMENT | Canonical Actor Capacity Read Consolidation — bkz. §4c. PR #1255, branch commit `33cc6710`, squash SHA `038dbbb9`, CI 4/4 PASS |
| CANDIDATE-D | **PRODUCT_DECISION_REQUIRED** | NOT_READY | — | STF-PRD-RBAC-001 (dolaylı) | **NOT_A_SELECTABLE_SLICE** (2026-07-14) | NONE | — | — | GO-ANALYZE (WAVE 2 decomposition) | Ürün niyeti netleşmeden Contract açılamaz. Detay: private evidence (bkz. §4c) |
| CANDIDATE-E | **BLOCKED** | NOT_READY | OFF/OD-05, OFF/OD-09 (CLOSED) + OFF/OD-08 (**OPEN — blocker**) | STF-PRD-RBAC-001 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | NOT_DRAFTED | GO-ANALYZE (WAVE 2 decomposition) | Blocker: OFF/OD-08 OPEN. Detay: private evidence (bkz. §4c) |
| CANDIDATE-F1 | **CANONICAL** | — | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | **SELECTED** (2026-07-15) | **CONSUMED** (2026-07-15) | **HARDENING** | **RATIFIED_WITH_RECORDED_LIMITATIONS** (2026-07-15) | GO-ANALYZE (WAVE 3 decomposition) + Contract Draft/Validation/Ratification + GO-IMPLEMENT | Personnel List Masked Default — mevcut masking altyapısı REUSE; OFF/OD-18 yeterli. bkz. §4d. PR #1270, branch commit `a08932fb`, squash SHA `a170da3e`, CI 4/4 PASS |
| CANDIDATE-F2 | **DORMANT** | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | — | — | GO-ANALYZE (WAVE 3 decomposition) | Personnel Export Masking — IMPLEMENTATION SURFACE NOT FOUND (owner disposition 2026-07-15). bkz. §4d |
| CANDIDATE-G | **BLOCKED** | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | **NEW_SUBSYSTEM** | NOT_DRAFTED | GO-ANALYZE (WAVE 3 decomposition) | Detail Masking + Field-Level Unmask Permission — blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED. bkz. §4d |
| CANDIDATE-H | **EVIDENCE_REVALIDATION_REQUIRED** | NOT_READY | OFF/OD-18 (CLOSED) | STF-PRD-PRIV-001 | NOT_SELECTED | NONE | HARDENING | — | GO-ANALYZE (WAVE 3 decomposition) | Audit/Read-Model Minimization Verification. bkz. §4d |

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

CONTRACT STATUS: RATIFIED (2026-07-14) — RATIFIED WITH RECORDED LIMITATIONS
IMPLEMENTATION: CANONICAL (2026-07-14) — PR #1239, branch commit `55dc2374`,
  squash SHA `b0ce36db`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
  Client Workspace Live Smoke), mergeStateStatus CLEAN

BINDING RULE (fail-closed + atomic — owner düzeltmesi, ilk taslaktaki "best-effort" REDDEDİLDİ):
  userId dolu ise:
    tx.user.updateMany({ where: { id: existing.userId, tenantId }, data: { isActive: false } })
    result.count !== 1  →  ConflictException fırlatılır, TÜM transaction (Staff/Lawyer write'ı
                            dahil) rollback edilir. "Profil inactive + User active" durumu
                            YAPISAL OLARAK üretilemez.
    result.count === 1  →  devam (Staff/Lawyer isActive=false write'ı aynı tx'te tamamlanır)
  userId null ise:
    mevcut profile-only davranış korunur (User write hiç denenmez)

RECORDED LIMITATIONS (4) — CARRIED FORWARD post-implementation (implementasyon bunları
ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
  1. Dar TOCTOU relink senaryosu (fetch↔transaction arası userId farklı bir User'a relink
     edilirse) — düşük olasılık, satır kilitleme ile pratikte ihmal edilebilir
  2. Staff offboarding audit eksikliği bu Contract'la DÜZELTİLMEZ (§2b, ayrı FUTURE WAVE)
  3. CANDIDATE-B'nin kapsadığı senaryolar (tokenVersion/tekil-oturum iptali) bu Contract'ta YOK
  4. staff.controller.ts'in exception-to-200 asimetrisi bu Contract'la DÜZELTİLMEZ (§2b, ayrı
     NEW FINDING — FUTURE WAVE/NOT AUTHORIZED); fail-closed rollback SERVİS/VERİ katmanında
     tam çalışır, yalnız HTTP status'u Staff tarafında 200'e düşer (pre-existing davranış)

Exact affected files (IMPLEMENTED, main @ b0ce36db):
  DEĞİŞTİ: lawyer.service.ts (delete()) · staff.service.ts (remove(), $transaction eklendi)
           · lawyer-deactivate-lifecycle.spec.ts (+5 senaryo, 18 mevcut DEĞİŞMEDEN geçti)
  YENİ:    staff/__tests__/staff-deactivate-lifecycle.spec.ts (6 senaryo)
  DEĞİŞMEDİ: controller'lar (imza aynı) · schema.prisma (migration yok)
  Test: Lawyer 23/23 · Staff 6/6 · regresyon (staff 43/43, lawyer 89/89, invite 32/32,
        auth 73/74+1 pre-existing skip) · tsc --noEmit: 4 dosyada sıfır yeni hata

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

OWNER DISPOSITION: DEFERRED (2026-07-14)
REASON: CANDIDATE-A ile WAVE 1'in acil offboarding riski kapatıldı. CANDIDATE-B geniş
  auth/session altyapısı gerektiren ayrı bir iştir.
Contract başlatılmadı, implementationAuthorization NONE — DEFERRED, iptal DEĞİLDİR; owner'ın
  ayrı, açık bir GO'suyla ileride yeniden ele alınabilir.
```

### 4c. WAVE 2 Candidate Detay (redakte — güvenlik containment, 2026-07-14)

```text
Bu bölüm, WAVE 2 GO-ANALYZE sırasında üretilen ayrıntılı teknik kod-kanıtını KASITLI OLARAK
içermez. Gerekçe: bulgular hâlâ UNPATCHED'tır (WAVE 2 için henüz hiçbir Contract veya
implementasyon başlamadı) ve bu repo PUBLIC'tir; mekanizma-seviyesi açıklama (etkilenen
dosya/metot isimleri, enforcement/bypass ayrıntıları, hangi permission flag'in nerede
tüketilmediği) exploitation-grade bilgi teşkil eder ve owner talimatıyla (2026-07-14,
containment kararı) public manifest'ten çıkarılmıştır.

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-C   name: Canonical Actor Capacity Read Consolidation (owner re-scope 2026-07-14) ·
              status CANONICAL (2026-07-15) · implementationCategory HARDENING ·
              ownerSelectionStatus SELECTED · implementationAuthorization CONSUMED (2026-07-15) ·
              contractStatus RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-14)
              OWNER RE-SCOPE (2026-07-14, APPROVED): Eski "resolver enforcement mode" hedefi
              SUPERSEDED BY OWNER RE-SCOPE. #503 observe-only invariant KORUNUR (enforce/assert
              modu EKLENMEZ, permission semantiği değişmez). Yeni objective: authorization
              davranışını birebir koruyarak, aynı actor-capacity okuma desenini tek canonical
              kaynağa taşıyan davranış-nötr HARDENING. Prior Contract Draft verdict: NOT READY —
              SUPERSEDED, tarihsel evidence olarak korunur. Ayrıntılı teknik gerekçe (dosya/metot
              ismi, consumer sayısı, mekanizma detayı) yalnız private evidence'ta — public'e YAZILMAZ.

              CONTRACT STATUS: RATIFIED (2026-07-14) — WITH RECORDED LIMITATIONS
              BINDING SCOPE (redakte governance metadata):
                - capacity mapping tek canonical kaynağa taşınır
                - eşdeğer consumer'lar ve resolver mapping'i buna bağlanır
                - fetch/query davranışları korunur (yalnız mapping ortaklaşır)
                - mevcut authorization sonucu değişmez
                - #503 observe-only invariant korunur (resolver sorgu/metadata/decision/mode/
                  enforced:false dokunulmaz)
              RECORDED LIMITATIONS (4) — CARRIED FORWARD post-implementation (implementasyon
              bunları ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
                1. Fetch/query katmanı ortaklaştırılmaz (yalnız capacity mapping).
                2. Runtime Capacity doğrulaması eklenmez.
                3. Resolver yalnız leaf-mapping için delege edilir.
                4. Davranış-eşdeğerlik, capacity-kaynak alanlarının non-null schema invariant'ına
                   bağlıdır (invariant değişirse yeniden doğrulanmalı).
              IMPLEMENTATION: CANONICAL (2026-07-15) — PR #1255, branch commit `33cc6710`,
              squash SHA `038dbbb9`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
              Client Workspace Live Smoke), mergeStateStatus CLEAN. Davranış-nötr HARDENING;
              regresyon + yeni unit testleri PASS. Ayrıntılı teknik Contract (kanonik helper imzası,
              exact affected files, silinecek yerel duplicate'ler, non-null invariant kanıtı, test
              sayıları) yalnız private evidence'ta — public'e YAZILMAZ.
CANDIDATE-D   PRODUCT DECISION REQUIRED · NOT A SELECTABLE SLICE
CANDIDATE-E   implementationCategory NEW_SUBSYSTEM · status BLOCKED ·
              blocker OFF/OD-08 OPEN

Ayrıntılı teknik evidence (call-chain, dosya/metot isimleri, mekanizma açıklaması,
kod-kanıtı) yalnız private handoff/scratchpad kaydındadır — bu public repo'ya
taşınmayacaktır. Contract Draft aşamasına geçildiğinde bu evidence o aşamanın kendi
sürecinde ayrıca ele alınacaktır.
```

### 4d. WAVE 3 Candidate Detay (redakte — privacy containment, 2026-07-15)

```text
Bu bölüm, WAVE 3 GO-ANALYZE'nin (SLICE-03 scope narrowing) ayrıntılı teknik kanıtını KASITLI
OLARAK içermez. Gerekçe: STF-PRD-PRIV-001 açık (unpatched) bir gizlilik/minimizasyon boşluğudur
ve bu repo PUBLIC'tir; hangi yüzeylerin hassas alanı maskesiz döndürdüğüne ilişkin dosya/metot/
mekanizma ayrıntısı exploitation-grade bilgidir ve public manifest'ten çıkarılmıştır (STF-PRD-
PRIV-001'in Risk Register'daki mevcut redaksiyonuyla tutarlı). Governance kökenleri: OFF-INV-10
(OFFICE-GOVERNANCE §20) + OFF/OD-18 (Option B CLOSED/CANONICAL: maskeli varsayılan + field-level
permission + export allowlist).

Tutulan güvenli seviye — yalnız governance metadata (bkz. §4 Slice Register):

CANDIDATE-F1  name: Personnel List Masked Default · status CANONICAL (2026-07-15) ·
              implementationCategory HARDENING · ownerSelectionStatus SELECTED ·
              implementationAuthorization CONSUMED (2026-07-15) ·
              contractStatus RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15)
              Objective (soyut): personel LIST yüzeyinde hassas alanları mevcut masking
              altyapısını REUSE ederek varsayılan maskele. OFF/OD-18 YETERLİ (Option B doğrudan
              "maskeli varsayılan"ı yetkilendirir). Davranış değişir (açık gösterim kısıtlanır —
              OD-18 bunu MANDATE ediyor); round-trip gerektirmeyen görüntüleme yüzeyi.

              CONTRACT STATUS: RATIFIED (2026-07-15) — WITH RECORDED LIMITATIONS
              BINDING SCOPE (redakte governance metadata):
                - personel liste yüzeyleri varsayılan maskeli olur
                - yalnız ratifiye hassas alanlar kapsanır
                - mevcut masking altyapısı REUSE edilir (yeni algoritma yok)
                - null değer semantiği korunur (null→null; sentinel response'a yazılmaz)
                - detail/edit/search davranışları DEĞİŞMEZ
              ACCEPTED RECORDS (CARRIED FORWARD post-implementation — implementasyon bunları
              ÇÖZMEDİ, hâlâ geçerli açık kayıtlar):
                - exact-identity list-search residual vector → NEW FINDING / FUTURE WAVE / NOT AUTHORIZED
                - ek contact/tax PII alanları (F1-dışı) → OWNER REVIEW REQUIRED
                - OFF-INV-10 → PARTIAL IMPLEMENTATION (F1 yalnız list-display boşluğunu daraltır)
                - STF-PRD-PRIV-001 → OPEN / NOT CLOSED (F1 bunu KAPATMAZ)
              IMPLEMENTATION: CANONICAL (2026-07-15) — PR #1270, branch commit `a08932fb`,
              squash SHA `a170da3e`, CI 4/4 PASS (Architectural Guardrails/Test Suite/Web Tests/
              Client Workspace Live Smoke), mergeStateStatus CLEAN. List-display HARDENING;
              regresyon + yeni unit testleri PASS. Ayrıntılı teknik Contract (metot isimleri,
              alan-endpoint eşlemesi, masking util adı, null-preserving contract, test contract)
              yalnız private evidence'ta — public'e YAZILMAZ.
CANDIDATE-F2  name: Personnel Export Masking · status DORMANT ·
              reason: IMPLEMENTATION SURFACE NOT FOUND (owner disposition 2026-07-15) ·
              ownerSelectionStatus NOT_SELECTED · implementationAuthorization NONE
CANDIDATE-G   name: Detail Masking + Field-Level Unmask Permission ·
              implementationCategory NEW_SUBSYSTEM · status BLOCKED ·
              blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED
              (OFF/OD-18 policy'yi belirler ama unmask MEKANİZMA tasarımı — kim/purpose-binding —
              tanımsız; olası ek owner decision gerekir)
CANDIDATE-H   name: Audit/Read-Model Minimization Verification · status EVIDENCE_REVALIDATION_REQUIRED ·
              ownerSelectionStatus NOT_SELECTED · implementationAuthorization NONE ·
              implementationCategory HARDENING (doğrulama ağırlıklı)

DORMANT (slice DEĞİL): "leave/termination reason" masking — ŞEMA SURFACE'İ BULUNAMADI
(OFF-INV-10 bu alanları sayar ama karşılık gelen şema alanı yok; SLICE-01 emsali dormant).

Ayrıntılı teknik evidence (etkilenen yüzeyler, mevcut masking util envanteri, kod-kanıtı) yalnız
private handoff/scratchpad + memory kaydındadır — public repo'ya taşınmayacaktır.
```

## 5. Milestone Register (yalnız CANONICAL slice'lardan türetilir)

```text
PHASE 1 MILESTONE 01
SLICE-02 · IMPLEMENTED · MERGED · CANONICAL (main @ a3eee8b8, 2026-07-13)

PHASE 1 MILESTONE 02
CANDIDATE-A · IMPLEMENTED · MERGED · CANONICAL (main @ b0ce36db, 2026-07-14, PR #1239)

PHASE 1 MILESTONE 03
CANDIDATE-C · IMPLEMENTED · MERGED · CANONICAL (main @ 038dbbb9, 2026-07-15, PR #1255)

PHASE 1 MILESTONE 04
CANDIDATE-F1 · IMPLEMENTED · MERGED · CANONICAL (main @ a170da3e, 2026-07-15, PR #1270)
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
  status: PARTIALLY DELIVERED (2026-07-14) — CANDIDATE-A CANONICAL, CANDIDATE-B DEFERRED
  SONUÇ: SES-001+SES-002 TEK slice ÜRETMEDİ — farklı implementationCategory'de 2 candidate:
    CANDIDATE-A (WIRING) → CANONICAL, main @ b0ce36db (PHASE 1 MILESTONE 02)
    CANDIDATE-B (NEW_SUBSYSTEM) → DEFERRED (2026-07-14, owner kararı — bkz. §4b), NOT_SELECTED,
      implementationAuthorization NONE — DEFERRED iptal DEĞİL, ayrı bir GO ile yeniden açılabilir
  Detay: §4 Slice Register + §4b

WAVE 2 — Authority/RBAC Consistency            [P2, karar TAM kapalı]
  Kapsam: STF-PRD-RBAC-001 (OD-05 + OD-09 CLOSED_CANONICAL)
  status: PARTIALLY DELIVERED (2026-07-15) — CANDIDATE-C CANONICAL, CANDIDATE-D/E teslim edilmedi
  SONUÇ: RBAC-001 TEK slice ÜRETMEDİ — 3 candidate, 3 farklı disposition:
    CANDIDATE-C (HARDENING) → CANONICAL, main @ 038dbbb9 (PHASE 1 MILESTONE 03); "Canonical Actor
      Capacity Read Consolidation" davranış-nötr; eski EXTENSION/enforcement-mode SUPERSEDED,
      #503 observe-only invariant korundu. Contract RATIFIED_WITH_RECORDED_LIMITATIONS (4 CARRIED FORWARD)
    CANDIDATE-D → PRODUCT DECISION REQUIRED / NOT A SELECTABLE SLICE
    CANDIDATE-E (NEW_SUBSYSTEM) → BLOCKED (blocker: OFF/OD-08 OPEN)
  Detay: §4 Slice Register + §4c (teknik mekanizma detayı redakte — bkz. §4c gerekçe)

WAVE 3 — Privacy Revival (Sensitive Field Masking)  [P2, karar kapalı]
  Kapsam: SLICE-03 revival (OD-18 CLOSED_CANONICAL, STF-PRD-PRIV-001)
  status: PARTIALLY DELIVERED (2026-07-15) — CANDIDATE-F1 CANONICAL; F2 DORMANT, G BLOCKED,
    H revalidation (teslim edilmedi)
  SONUÇ: SLICE-03 TEK slice ÜRETMEDİ — 4 candidate + 1 dormant not:
    CANDIDATE-F1 (HARDENING) → CANONICAL, main @ a170da3e (PHASE 1 MILESTONE 04); Personnel List
      Masked Default; mevcut masking REUSE; OFF/OD-18 yeterli. Contract RATIFIED_WITH_RECORDED_LIMITATIONS
      (accepted records CARRIED FORWARD: OFF-INV-10 PARTIAL, STF-PRD-PRIV-001 OPEN/NOT CLOSED)
    CANDIDATE-F2 → DORMANT (Personnel Export Masking — IMPLEMENTATION SURFACE NOT FOUND, owner disposition)
    CANDIDATE-G (NEW_SUBSYSTEM) → BLOCKED (Detail Masking + Field-Level Unmask Permission;
      blocker: FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED)
    CANDIDATE-H → EVIDENCE_REVALIDATION_REQUIRED (Audit/Read-Model Minimization Verification)
    DORMANT not: "leave/termination reason" masking — ŞEMA SURFACE'İ BULUNAMADI (slice değil)
  Detay: §4 Slice Register + §4d (teknik mekanizma detayı redakte — bkz. §4d gerekçe)

WAVE 4+ — Gated (henüz decision-tarafı kapanmadı)
  BOLA-001/SCP-001 ← OD-08 OPEN · BOLA-002 ← OD-10 OPEN · DATA-001 ← OD-03 OPEN ·
  OPS-001 ← OD-19 OPEN · LIFE-001 ← OD-16 OPEN(non-blocking, teyit gerekir)

UNMAPPED (owner review required, decision-graph dışı)
  STF-PRD-CFG-001, STF-PRD-PERF-001
```

## 8. NEXT ELIGIBLE UNIT (readiness ≠ authorization)

```text
NEXT ELIGIBLE UNIT: YOK — implementasyona hazır birim yok. WAVE 3'ün seçili candidate'ı
CANDIDATE-F1 CANONICAL/CONSUMED'a ulaştı (PHASE 1 MILESTONE 04); implementationAuthorization
CONSUMED — aynı slice için tekrar implementasyon açılmaz. Geriye kalan candidate'ların TÜMÜ
owner-gated ve implementasyona hazır DEĞİL; bu belge hiçbirini SEÇMEZ/başlatmaz, her biri owner'ın
ayrı, açık bir GO'sunu bekler:
  · CANDIDATE-D (WAVE 2) — product decision (canApproveFinance ürün niyeti) gerekir · NOT_A_SELECTABLE_SLICE
  · CANDIDATE-E (WAVE 2) — OFF/OD-08 (blocker) kapanışı gerekir · BLOCKED
  · CANDIDATE-F2 (WAVE 3) — DORMANT (IMPLEMENTATION SURFACE NOT FOUND, owner disposition)
  · CANDIDATE-G (WAVE 3) — field-level unmask governance/mechanism çözülmeli (olası ek owner decision) · BLOCKED
  · CANDIDATE-H (WAVE 3) — evidence revalidation gerekir · EVIDENCE_REVALIDATION_REQUIRED
  · CANDIDATE-B (WAVE 1) — DEFERRED, ayrı owner GO ile yeniden açılabilir

status (CANDIDATE-A)                      : CANONICAL (2026-07-14, main @ b0ce36db)
ownerSelectionStatus (CANDIDATE-A)        : SELECTED (2026-07-14)
contractStatus (CANDIDATE-A)              : RATIFIED (2026-07-14, WITH RECORDED LIMITATIONS)
implementationAuthorization (CANDIDATE-A) : CONSUMED (2026-07-14) — PR #1239, squash `b0ce36db`
status (CANDIDATE-B)                      : DEFERRED (2026-07-14) — bkz. §4b OWNER DISPOSITION
ownerSelectionStatus (CANDIDATE-B)        : NOT_SELECTED (değişmedi)
contractStatus (CANDIDATE-B)              : NOT_DRAFTED (değişmedi)
implementationAuthorization (CANDIDATE-B) : NONE (değişmedi)
name (CANDIDATE-C)                        : Canonical Actor Capacity Read Consolidation
status (CANDIDATE-C)                      : CANONICAL (2026-07-15, main @ 038dbbb9) — PHASE 1 MILESTONE 03
implementationCategory (CANDIDATE-C)      : HARDENING
ownerSelectionStatus (CANDIDATE-C)        : SELECTED (2026-07-14)
contractStatus (CANDIDATE-C)              : RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-14) — 4 CARRIED FORWARD, bkz. §4c
implementationAuthorization (CANDIDATE-C) : CONSUMED (2026-07-15) — PR #1255, squash `038dbbb9`, CI 4/4 PASS
ownerSelectionStatus (CANDIDATE-D)        : NOT_A_SELECTABLE_SLICE (2026-07-14) — PRODUCT
                                             DECISION REQUIRED
ownerSelectionStatus (CANDIDATE-E)        : NOT_SELECTED — status BLOCKED (blocker: OFF/OD-08
                                             OPEN)
name (CANDIDATE-F1)                       : Personnel List Masked Default (WAVE 3, SLICE-03 decomp)
status (CANDIDATE-F1)                     : CANONICAL (2026-07-15, main @ a170da3e) — PHASE 1 MILESTONE 04
implementationCategory (CANDIDATE-F1)     : HARDENING
ownerSelectionStatus (CANDIDATE-F1)       : SELECTED (2026-07-15)
contractStatus (CANDIDATE-F1)             : RATIFIED_WITH_RECORDED_LIMITATIONS (2026-07-15) — accepted records CARRIED FORWARD, bkz. §4d
implementationAuthorization (CANDIDATE-F1): CONSUMED (2026-07-15) — PR #1270, squash `a170da3e`, CI 4/4 PASS
status (CANDIDATE-F2)                     : DORMANT — IMPLEMENTATION SURFACE NOT FOUND (owner disposition)
status (CANDIDATE-G)                      : BLOCKED — FIELD-LEVEL UNMASK GOVERNANCE / MECHANISM UNRESOLVED
                                             (implementationCategory NEW_SUBSYSTEM)
status (CANDIDATE-H)                      : EVIDENCE_REVALIDATION_REQUIRED — NOT_SELECTED / NONE
```
```text
NEXT ELIGIBLE ≠ AUTHORIZED.
CANDIDATE-F1 artık CANONICAL/CONSUMED'dur (PHASE 1 MILESTONE 04) — implementationAuthorization
GO_IMPLEMENT_ISSUED → CONSUMED'a vardı; aynı slice için tekrar implementasyon açılmaz. CANDIDATE-A
ve CANDIDATE-C de CANONICAL/CONSUMED'dur. Bu belgenin kurallarına göre implementasyona hazır bir
NEXT ELIGIBLE UNIT YOKTUR: geriye kalan candidate'ların tümü owner-gated (CANDIDATE-B DEFERRED ·
D PRODUCT_DECISION/NOT_A_SELECTABLE_SLICE · E ve G BLOCKED · F2 DORMANT · H EVIDENCE_REVALIDATION_REQUIRED).
Hiçbiri bu belge tarafından SEÇİLMEZ/başlatılmaz; her biri owner'ın ayrı, açık bir GO'sunu bekler.
Bu canonicalization yalnız CANDIDATE-F1'in IMPLEMENTED/MERGED/CANONICAL durumunu + accepted records'un
CARRIED FORWARD statüsünü (OFF-INV-10 PARTIAL, STF-PRD-PRIV-001 OPEN/NOT CLOSED dahil) kaydeder;
yeni Contract/decision package/candidate/implementasyon başlatmaz.
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
- CANDIDATE-A Contract RATIFIED işlendi (§4/§4b/§8):     YES — binding fail-closed/atomic
                                                        kural + 4 recorded limitation birebir
- 2. NEW FINDING (staff controller) §2b'ye eklendi:      YES — FUTURE WAVE/NOT AUTHORIZED,
                                                        spesifik OFF-INV icat edilmedi
- NEXT ELIGIBLE UNIT güncellendi:                        YES — "CANDIDATE-A — GO-IMPLEMENT"
- Kod/schema/migration değişikliği:                      NONE
- Implementasyon başlatıldı mı:                          NO
- Başka Wave/Slice durumu değiştirildi mi:               NO (yalnız CANDIDATE-A + §2b)
- CANDIDATE-A status→CANONICAL, implementationAuthorization  YES — §4/§4b/§5(MILESTONE 02)/§8,
  →CONSUMED, PR/commit/squash/CI kaydı işlendi:                PR #1239, `55dc2374`→`b0ce36db`
- 4 recorded limitation CARRIED FORWARD işaretlendi:      YES — §4b, "implementasyon bunları
                                                        ÇÖZMEDİ" notuyla
- WAVE 1 → PARTIALLY DELIVERED:                          YES — §7
- CANDIDATE-B durumu (NOT_SELECTED/NONE) korundu:         YES — değiştirilmedi, §4/§8'de teyitli
- NEXT ELIGIBLE UNIT → OWNER REVIEW/SELECTION CANDIDATE-B: YES — §8, Contract başlatma yetkisi
                                                        DEĞİL olduğu açıkça yazıldı
- CANDIDATE-B Contract başlatıldı mı:                     NO
- Yeni slice üretildi mi:                                 NO
- Kod/schema/migration değişikliği (bu PR):               NONE
- Başka Wave durumu (2/3/4+) değiştirildi mi:              NO
- WAVE 2 Candidate Decomposition kaydedildi mi (§4/§4c):  YES — yalnız güvenli governance
                                                           metadata seviyesinde (bkz. altı)
- Güvenlik containment (2026-07-14):                      Bu PR'ın ilk sürümü (commit
                                                           67bbc27c, branch codex/
                                                           wave2-decomposition) mekanizma-
                                                           seviyesi teknik detay içeriyordu;
                                                           auto-mode sınıflandırıcısı PR
                                                           açılmadan ENGELLEDİ (public repo +
                                                           unpatched finding). Owner kararıyla
                                                           remote branch silindi, local
                                                           history origin/main'den sıfırdan
                                                           yeniden kuruldu, bu redakte sürüm
                                                           onun yerine geçti. Ayrıntılı
                                                           teknik evidence yalnız private
                                                           handoff/scratchpad kaydındadır.
- CANDIDATE-C (EXTENSION/SELECTED/READY_FOR_CONTRACT)     YES — §4/§4c/§8, Contract henüz
  işlendi mi (yalnız governance metadata):                NOT_DRAFTED
- CANDIDATE-D (PRODUCT_DECISION_REQUIRED/                 YES — §4/§4c, owner'ın disposition'ı
  NOT_A_SELECTABLE_SLICE) işlendi mi:                     birebir, mekanizma detayı YOK
- CANDIDATE-E (NEW_SUBSYSTEM/BLOCKED,                     YES — §4/§4c, blocker OFF/OD-08 OPEN
  blocker OD-08) işlendi mi:                              olarak kaydedildi, detay YOK
- NEXT ELIGIBLE UNIT → CANDIDATE-C Contract Draft:        YES — §8, CANDIDATE-A/B tarihi
                                                           korunarak
- Yeni enum değerleri (READY_FOR_CONTRACT,                YES — §1, owner eklentisi 2026-07-14
  NOT_A_SELECTABLE_SLICE) §1 Veri Modeli'ne işlendi mi:   olarak işaretli
- CANDIDATE-D/E için owner kararı varsayıldı mı:          NO — yalnız brief'te verilen
                                                           disposition'lar birebir işlendi
- CANDIDATE-B (WAVE 1) chat-seviyesi "NOT_SELECTED/       NO — bu PR'ın SCOPE'u dışında;
  DEFERRED" beyanı bu PR'a dahil edildi mi:               §8'de açıkça flagged, ayrı bir
                                                           GO-CANONICALIZE bekliyor
- Dosya/metot ismi, bypass/enforcement mekanizma          NO — §4c'nin kendisi bunun
  açıklaması, permission flag tüketilmeme ayrıntısı       yerine yalnız redaksiyon
  bu belgede var mı:                                      gerekçesini açıklıyor
- Contract başlatıldı mı (CANDIDATE-C/D/E):               NO
- Kod/schema/migration değişikliği:                       NONE
- Başka Wave (1/3/4+) durumu değiştirildi mi:              NO (yalnız WAVE 2 kendi §7 satırı)
- CANDIDATE-B status→DEFERRED işlendi mi (§4/§4b/§7/§8):  YES — ownerSelectionStatus
                                                           (NOT_SELECTED) ve implementationAuthorization
                                                           (NONE) değişmedi, yalnız status alanı
                                                           ve REASON eklendi
- CANDIDATE-B Contract başlatıldı mı:                     NO
- CANDIDATE-C Contract başlatıldı mı:                     NO
- NEXT ELIGIBLE UNIT (CANDIDATE-C — Implementation         YES — hiç değiştirilmedi (owner'ın
  Contract Draft) PRESERVE edildi mi:                      açık "PRESERVE" talimatı)
- Kod/schema/migration değişikliği:                       NONE
- Başka durum (CANDIDATE-C/D/E, WAVE 2/3/4+) değiştirildi  NO (yalnız CANDIDATE-B'nin kendi
  mi:                                                      status/REASON alanı, §7'de yalnız
                                                            WAVE 1'in kendi CANDIDATE-B satırı)
- CANDIDATE-C owner re-scope işlendi mi (§4/§4c/§7/§8):   YES — name→"Canonical Actor Capacity
                                                           Read Consolidation", category
                                                           EXTENSION→HARDENING
- Eski "resolver enforcement mode" hedefi SUPERSEDED       YES — §4/§4c/§7'de "SUPERSEDED BY
  BY OWNER RE-SCOPE olarak kaydedildi mi:                  OWNER RE-SCOPE" birebir
- #503 observe-only invariant korunduğu belirtildi mi:    YES — §4c, "enforce/assert modu
                                                           EKLENMEZ, permission semantiği değişmez"
- Yeni objective (davranış-nötr, tek canonical kaynak)    YES — §4/§4c/§7
  kaydedildi mi:
- Korunan alanlar (SELECTED/READY_FOR_CONTRACT/            YES — §4 satırı + §8, hiçbiri
  NOT_DRAFTED/NONE) değişmeden kaldı mı:                   değiştirilmedi
- NEXT ELIGIBLE UNIT (CANDIDATE-C — Contract Draft)        YES — §8, hiç değiştirilmedi
  korundu mu:
- PUBLIC CONTENT RULE: dosya/metot ismi, consumer sayısı,  NO — hiçbiri eklenmedi; yalnız
  bypass/mekanizma ayrıntısı manifest'e eklendi mi:        redakte governance metadata
                                                           (grep ile doğrulandı)
- Contract başlatıldı mı (CANDIDATE-C):                    NO
- Kod/schema/migration değişikliği:                       NONE
- Başka candidate/wave durumu değiştirildi mi:             NO (yalnız CANDIDATE-C re-scope alanları)
- CANDIDATE-C contractStatus RATIFIED işlendi mi           YES — NOT_DRAFTED →
  (§4/§4c/§8):                                             RATIFIED_WITH_RECORDED_LIMITATIONS
- BINDING SCOPE redakte governance metadata olarak         YES — §4c, 5 madde soyut
  kaydedildi mi:                                           (mapping tek kaynak / consumer+resolver
                                                           delege / fetch korunur / auth sonucu
                                                           değişmez / #503 korunur)
- 4 RECORDED LIMITATION kaydedildi mi:                     YES — §4c (fetch ortaklaştırılmaz /
                                                           runtime doğrulama yok / resolver leaf-only /
                                                           non-null schema invariant bağımlılığı)
- Korunan alanlar (SELECTED / NONE) değişmedi mi:          YES — §4 satırı + §8, ikisi de korundu
- NEXT ELIGIBLE UNIT → CANDIDATE-C — GO-IMPLEMENT:         YES — §8 (ratifikasyon ≠ GO-IMPLEMENT
                                                           açıkça yazıldı, implementationAuthorization
                                                           NONE korundu)
- PUBLIC CONTENT RULE (ratifikasyon delta'sı): dosya/metot  NO — hiçbiri eklenmedi; helper adı/imzası,
  ismi, consumer sayısı, helper imzası, mekanizma detayı   silinecek dosyalar, non-null kolon isimleri
  eklendi mi:                                              private evidence'ta (grep ile doğrulandı)
- Kod/schema/migration / implementasyon başlatıldı mı:     NO / NONE
- Başka candidate (D/E) veya wave durumu değiştirildi mi:  NO (yalnız CANDIDATE-C ratifikasyon alanları)
- CANDIDATE-C status→CANONICAL, implementationAuthorization  YES — §4/§4c/§5(MILESTONE 03)/§8,
  →CONSUMED işlendi mi (§4/§4c/§8):                         PR #1255, `33cc6710`→`038dbbb9`, CI 4/4
- PHASE 1 MILESTONE 03 eklendi mi (§5):                    YES — CANDIDATE-C, main @ 038dbbb9, PR #1255
- 4 RECORDED LIMITATION CARRIED FORWARD işaretlendi mi:    YES — §4c, "implementasyon bunları ÇÖZMEDİ"
- WAVE 2 → PARTIALLY DELIVERED (§7):                       YES — CANDIDATE-C CANONICAL, D/E teslim edilmedi
- CANDIDATE-D/E durumu değiştirildi mi:                    NO — aynen korundu (D PRODUCT_DECISION_REQUIRED,
                                                           E BLOCKED/OD-08 OPEN)
- NEXT ELIGIBLE UNIT yeniden hesaplanıp yalnız raporlandı  YES — §8: WAVE 2'de teslim edilebilir
  mı (yeni candidate/decision package başlatılmadan):      slice YOK; owner-gated seçenekler
                                                           SEÇİLMEDEN listelendi
- Yalnızca-operasyonel (repo-dışı) bulgular manifest'e      NO — owner BOUNDARY gereği manifest'e
  eklendi mi:                                              GİRMEDİ (yalnız memory/runbook)
- PUBLIC CONTENT RULE (canonicalization delta'sı): dosya/  NO — yalnız governance metadata + PR/SHA/CI;
  metot ismi, consumer sayısı, helper imzası eklendi mi:   teknik detay private evidence'ta
- Kod/schema/migration değişikliği / yeni candidate:       NONE / NO
- WAVE 3 decomposition kaydedildi mi (§4/§4d/§7/§8):       YES — SLICE-03 → CANDIDATE-F1/F2/G/H +
                                                           dormant not; §7 CANDIDATE DECOMPOSITION COMPLETE
- CANDIDATE-F1 SELECTED/READY_FOR_CONTRACT/HARDENING       YES — §4/§4d/§8, Contract henüz NOT_DRAFTED
  işlendi mi:
- CANDIDATE-F2 DORMANT (IMPLEMENTATION SURFACE NOT FOUND)  YES — §4/§4d, owner disposition birebir
  işlendi mi:
- CANDIDATE-G BLOCKED (FIELD-LEVEL UNMASK GOVERNANCE/      YES — §4/§4d, blocker birebir; category
  MECHANISM UNRESOLVED, NEW_SUBSYSTEM) işlendi mi:         NEW_SUBSYSTEM
- CANDIDATE-H EVIDENCE_REVALIDATION_REQUIRED işlendi mi:   YES — §4/§4d
- leave/termination-reason DORMANT/SCHEMA SURFACE NOT      YES — §4d + §7 dormant not (slice değil)
  FOUND kaydedildi mi:
- NEXT ELIGIBLE UNIT → CANDIDATE-F1 Contract Draft:        YES — §8
- HOLD (CANDIDATE-B DEFERRED / D PRODUCT_DECISION /        YES — hiçbiri değiştirilmedi
  E BLOCKED) korundu mu:
- PUBLIC CONTENT RULE (privacy): açık privacy yüzeyi       NO — §4d yalnız redaksiyon gerekçesi +
  dosya/metot/mekanizma ayrıntısı manifest'e eklendi mi:   governance metadata; STF-PRD-PRIV-001
                                                           redaksiyonuyla tutarlı (grep doğrulandı)
- Contract başlatıldı mı / kod-schema-migration / yeni     NO / NONE / NO (yalnız WAVE 3 governance metadata)
  candidate seçildi mi:
- CANDIDATE-F1 contractStatus RATIFIED işlendi mi          YES — §4/§4d/§8, NOT_DRAFTED →
  (§4/§4d/§8):                                             RATIFIED_WITH_RECORDED_LIMITATIONS
- BINDING SCOPE redakte governance metadata (5 soyut       YES — §4d (liste maskeli / ratifiye alanlar /
  madde) kaydedildi mi:                                    mevcut util reuse / null semantiği / detail-edit-search değişmez)
- 4 ACCEPTED RECORD kaydedildi mi:                         YES — §4d (exact-identity search NEW FINDING /
                                                           contact+tax PII OWNER REVIEW / OFF-INV-10 PARTIAL /
                                                           STF-PRD-PRIV-001 OPEN-NOT-CLOSED)
- Korunan alanlar (SELECTED / NONE) değişmedi mi:          YES — §4 satırı + §8
- NEXT ELIGIBLE UNIT → CANDIDATE-F1 — GO-IMPLEMENT:        YES — §8 (ratifikasyon ≠ GO-IMPLEMENT açık)
- CANDIDATE-F2/G/H durumu değiştirildi mi:                 NO — aynen korundu
- PUBLIC CONTENT RULE (F1 ratifikasyonu): metot/dosya       NO — §4d ABSTRACT; metot/util/alan-endpoint
  ismi, alan-endpoint eşlemesi, masking util eklendi mi:   eşlemesi private evidence'ta
- Kod/schema/migration / implementasyon başlatıldı mı /    NO / NONE / NO
  başka wave-candidate:
- CANDIDATE-F1 status→CANONICAL, implementationAuthorization  YES — §4/§4d/§5(MILESTONE 04)/§8,
  →CONSUMED işlendi mi (§4/§4d/§8):                          PR #1270, `a08932fb`→`a170da3e`, CI 4/4
- PHASE 1 MILESTONE 04 eklendi mi (§5):                     YES — CANDIDATE-F1, main @ a170da3e, PR #1270
- recorded limitations + accepted records CARRIED FORWARD   YES — §4d korundu (OFF-INV-10 PARTIAL +
  işaretlendi mi:                                           STF-PRD-PRIV-001 OPEN/NOT CLOSED dahil)
- OFF-INV-10 → PARTIAL IMPLEMENTATION korundu mu:           YES — §4d ACCEPTED RECORDS
- STF-PRD-PRIV-001 → OPEN / NOT CLOSED korundu mu:          YES — §4d ACCEPTED RECORDS + §2 Finding note
- WAVE 3 → PARTIALLY DELIVERED (§7):                        YES — F1 CANONICAL; F2 DORMANT/G BLOCKED/H revalidation
- CANDIDATE-F2/G/H durumu değiştirildi mi:                  NO — aynen korundu (owner BOUNDARY)
- NEXT ELIGIBLE UNIT yeniden hesaplanıp yalnız raporlandı   YES — §8: implementasyona hazır birim YOK;
  mı (yeni candidate/decision package başlatılmadan):       tüm kalan candidate'lar owner-gated, SEÇİLMEDEN
- Operasyonel worktree/junction bulgusu manifest'e eklendi  NO — owner BOUNDARY gereği (yalnız memory)
  mi:
- PUBLIC CONTENT RULE (F1 canonicalization): metot/dosya    NO — yalnız governance metadata + PR/SHA/CI;
  ismi, alan-endpoint eşlemesi, masking util eklendi mi:    teknik detay private evidence'ta (grep doğrulandı)
- Kod/schema/migration değişikliği / yeni candidate:        NONE / NO
```
