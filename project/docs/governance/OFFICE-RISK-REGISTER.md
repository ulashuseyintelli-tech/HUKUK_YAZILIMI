# OFFICE Risk Register — Domain Risk Dossier and Traceability Source

```text
Belge yolu : project/docs/governance/OFFICE-RISK-REGISTER.md
Durum      : CANONICAL DOMAIN RISK DOSSIER (owner text-ratification: 2026-07-13; canonical SHA `6fa8395dc9d7f25d37a9330fe454b1d6724522a5`)
Rol        : DOMAIN RISK DOSSIER AND TRACEABILITY SOURCE
             GLOBAL TRIAGE / EXECUTION STATUS SOURCE OF TRUTH DEĞİL
```

## SECURITY-SENSITIVE PUBLICATION NOTICE

Bu belge **public repository** içindedir. Henüz giderilmemiş (unremediated) güvenlik bulguları için bu belge kasıtlı olarak somut route/endpoint, controller/service/dosya:satır, çalışan request/payload, authentication/tenant bypass sırası, reproduction adımları veya istismarı kolaylaştıran ön-koşulları **içermez**. Risk ID, severity, domain/evidence status, hedef kontrol (mimari düzeyde) ve traceability korunur. Tam teknik kanıt owner'ın local ortamında tutulur ve bu repository'nin parçası değildir.

**Statü otoritesi ayrımı:** Risklerin global triage/çalışma durumu yalnız `project/docs/governance/master-triage-register.md`'den türetilir. Bu belgedeki `DOMAIN STATUS` alanı **`CANDIDATE / NOT YET TRIAGED`** veya **`TRIAGED (cross-ref)`** olabilir; `OPEN`/`CLOSED` yürütme statüsü bu belgede **hiçbir zaman** birincil kaynak değildir. Bu dosya hiçbir riski kendiliğinden global backlog'a eklemez, yetkilendirmez veya kapatmaz. Sanitizasyon severity'yi düşürmez, riski çözülmüş göstermez, kanıtı onaylanmış saymaz.

## RELATED DOCUMENTS

- Domain Law: `project/docs/governance/OFFICE-GOVERNANCE.md`
- Evidence/senaryo: `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md`
- Owner decision dossier: `project/docs/governance/OFFICE-OWNER-DECISIONS.md`
- Global triage otoritesi: `project/docs/governance/master-triage-register.md`
- Yetkili iş sırası: `project/docs/governance/product-backlog.md`

**Evidence Status Legend** (`SYS-COMP-002`): `CONFIRMED` · `REVALIDATION_REQUIRED` · `UNVERIFIABLE` · `REFUTED`.

---

**STF-PRD-BOLA-001** — Yetkilendirme/nesne-kapsam kontrol boşluğu (belge erişim yüzeyi)
SEVERITY: P1 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Belge erişim yüzeyinde nesne düzeyi yetkilendirme/tenant kapsam kontrolünde bir boşluk olabilir. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Object-scope evaluation tüm belge erişim yollarında zorunlu (OFF-INV-05)
RELATED OFF-INV: OFF-INV-05 · RELATED OFF/OD: OFF/OD-08, OFF/OD-09
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: WAVE 4+ · LAST VERIFIED SHA: `05e73579`
RISK STATUS (S1–S4 scope only): REMEDIATED / CLOSED — DOMAIN STATUS ve EVIDENCE STATUS alanları (yukarıda) BİLEREK DEĞİŞTİRİLMEDİ: bu belgenin kendi "Statü otoritesi ayrımı" kuralı (yukarıda) OPEN/CLOSED yürütme statüsünü yalnız `master-triage-register.md`'ye ayırır; bu satır yalnız S1–S4 remediation kanıtını taşır, global triage/domain-status kararı DEĞİLDİR.
IMPLEMENTATION: PR #1291
SQUASH SHA: 328dcdf6689575da8a4849f4b632a737079c22ad
EVIDENCE: CI 4/4 SUCCESS (Architectural Guardrails, Test Suite, Web Tests vitest, Client Workspace Live Smoke) · S1–S4 regression coverage (4 test suite, 16 test, wired into CI)
PREVIOUS PR: PR #1147 — CLOSED / SUPERSEDED BY PR #1291 (merge edilmedi; kodu main'e girmedi)
SCOPE NOTE: Remediation, tespit edilen authentication/tenant-scope/object-ownership exposure'ını kapatır. OFF/OD-08'in daha geniş intra-tenant access-scope kararını ÇÖZMEZ.
MITIGATION STATUS: OPEN / PARTIALLY MITIGATED
DELIVERED SLICES: CANDIDATE-I1 — CANONICAL (additive-only Team/Manager-Hiyerarşi `ReportingLine` şema temeli)
EVIDENCE (CANDIDATE-I1): PR #1320 (Contract Draft canonical) + PR #1325 (squash `05e73579f295615db8a0f3f3ff5816caa958acd5`, implementasyon) — bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4e/§7
RESIDUALS (CARRIED FORWARD): tam object-scope enforcement kapsamı (CANDIDATE-I'nin kalan scope'u — case/client'ın tüm nesne-erişim yüzeyine gerçek bir kapsam-değerlendirme adımı) TESLİM EDİLMEDİ, ayrı/HENÜZ candidate ID'si olmayan owner-gated future scope
FINDING VERDICT: OPEN / NOT CLOSED — teslim edilen slice (I1: hiyerarşi şema temeli) riskin TARGET CONTROL'ünü (object-scope evaluation'ın tüm belge erişim yollarında zorunlu kılınması) henüz sağlamıyor; sıfır enforcement/runtime davranış değişikliğiyle geldi. Asıl davranışsal kapanış, hâlâ owner-gated kalan tam object-scope enforcement'ı gerektirir.
NOTES: PR #1147 kapatıldı (2026-07-15, superseded by PR #1291) — artık "OFFICE kapsamı dışı, ilişkili olabilir" belirsizliği taşımaz. Owner kararı ve tam kanıt zinciri: `decision-log.md` CLIENT-SEC-H1 kaydı; güncel PR #1147 durumu: `OFFICE-MASTER-SYNTHESIS.md` §11. EK (2026-07-16): OFF/OD-08 owner tarafından Option B ile ayrıca CLOSED/CANONICAL kapatıldı (Access-Scope Owner Decision Package — bkz. `decision-log.md` § 2026-07-16 Access-Scope Owner Decision Package Closure). Bu, SCOPE NOTE'ta ayrı tutulan geniş intra-tenant access-scope kararının owner tarafından seçilmesidir; PR #1291'in dar remediation kapsamını değiştirmez ve bu bulguyu KAPATMAZ (DOMAIN STATUS/EVIDENCE STATUS değişmedi). Decision kapanmasıyla READY_FOR_CANDIDATE_DECOMPOSITION durumuna geçen ilişkili kayıt **CANDIDATE-I**'dir (bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4e/§8) — düzeltme (2026-07-16/17 fresh-read): bu satır önceki bir turda yanlışlıkla "CANDIDATE-E"/"§4c" referansı taşıyordu (RBAC-001'in kendi decomposition'ı — BOLA-001'le ilgisiz); doğru referans CANDIDATE-I/CANDIDATE-I1/§4e olarak düzeltildi. CANDIDATE-I'nin ilk dilimi **CANDIDATE-I1 CANONICAL/CONSUMED** (2026-07-16/17, PR #1325) — kalan tam object-scope enforcement kapsamı hâlâ owner tarafından seçilmedi/başlatılmadı.

**STF-PRD-SES-001** — Lifecycle/oturum kontrol boşluğu (offboarding sonrası erişim)
SEVERITY: P1 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Personel lifecycle/offboarding ile oturum/erişim yüzeyi arasındaki senkronizasyonda bir kontrol boşluğu olabilir. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Offboarding'de session/membership derhal kapanır (OFF-INV-06, OFF-INV-07)
RELATED OFF-INV: OFF-INV-06, OFF-INV-07 · RELATED OFF/OD: OFF/OD-14, OFF/OD-15
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: SES-002 ile birlikte triage edilmeli.

**STF-PRD-RBAC-001** — Rol/izin modeli enforcement tutarlılık boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Rol/izin (title/SystemRole/PermissionGrant) ayrımının enforcement yüzeyinde tutarsız uygulanabileceği bir mimari boşluk olabilir. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Title/SystemRole/PermissionGrant ayrımı tutarlı uygulanır (OFF-INV-03)
RELATED OFF-INV: OFF-INV-03 · RELATED OFF/OD: OFF/OD-05, OFF/OD-09
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: WAVE 2 · LAST VERIFIED SHA: `fa6851c0`
MITIGATION STATUS: OPEN / PARTIALLY MITIGATED
DELIVERED SLICES: CANDIDATE-C — CANONICAL (davranış-nötr actor-capacity read consolidation) · CANDIDATE-E1 — CANONICAL (additive-only PermissionGrant/SystemRole şema temeli)
EVIDENCE: PR #1255 (squash `038dbbb9`) · PR #1308 (Contract Draft canonical) + PR #1312 (squash `fa6851c0`, implementasyon) — bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4c/§7
RESIDUALS (CARRIED FORWARD): tam consumer-migration kapsamı (CANDIDATE-E'nin kalan scope'u — mevcut sert yetkilendirme noktaları + StaffMember izin bayrakları + gerçek enforcement wiring) TESLİM EDİLMEDİ, ayrı/HENÜZ candidate ID'si olmayan owner-gated future scope · CANDIDATE-D hâlâ PRODUCT_DECISION_REQUIRED
FINDING VERDICT: OPEN / NOT CLOSED — teslim edilen iki slice (C: okuma-tarafı konsolidasyon; E1: şema temeli) riskin TARGET CONTROL'ünü (title/SystemRole/PermissionGrant ayrımının tutarlı UYGULANMASI) henüz sağlamıyor; ikisi de sıfır enforcement/runtime davranış değişikliğiyle geldi. Asıl davranışsal kapanış, hâlâ owner-gated kalan tam consumer-migration'ı gerektirir.
NOTES: Owner policy required (tam consumer-migration kapsamının ne zaman/nasıl candidate'a dönüşeceği).

**STF-PRD-SCP-001** — Tenant içi nesne düzeyi kapsam kontrol boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Tenant içi (manager/team/office) erişim kapsamının nesne düzeyinde yeterince daraltılmamış olabileceği bir kontrol boşluğu. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Object-scope evaluation manager/team kapsamını uygular (OFF-INV-05)
RELATED OFF-INV: OFF-INV-05 · RELATED OFF/OD: OFF/OD-08
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: WAVE 4+ · LAST VERIFIED SHA: `05e73579`
MITIGATION STATUS: OPEN / PARTIALLY MITIGATED
DELIVERED SLICES: CANDIDATE-I1 — CANONICAL (additive-only Team/Manager-Hiyerarşi `ReportingLine` şema temeli)
EVIDENCE (CANDIDATE-I1): PR #1320 (Contract Draft canonical) + PR #1325 (squash `05e73579f295615db8a0f3f3ff5816caa958acd5`, implementasyon) — bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4e/§7
RESIDUALS (CARRIED FORWARD): tam object-scope enforcement kapsamı (SCP-001'in kapsadığı geniş case/client CRUD yüzeyi) TESLİM EDİLMEDİ, ayrı/HENÜZ candidate ID'si olmayan owner-gated future scope
FINDING VERDICT: OPEN / NOT CLOSED — teslim edilen slice (I1: hiyerarşi şema temeli) riskin TARGET CONTROL'ünü (object-scope evaluation'ın manager/team kapsamını uygulaması) henüz sağlamıyor; sıfır enforcement/runtime davranış değişikliğiyle geldi. Asıl davranışsal kapanış, hâlâ owner-gated kalan tam object-scope enforcement'ı gerektirir.
NOTES: OFF/OD-08 owner tarafından Option B ile CLOSED/CANONICAL kapatıldı (2026-07-16, Access-Scope Owner Decision Package — bkz. `decision-log.md`). Bu bulgunun kendisi KAPANMADI (DOMAIN STATUS/EVIDENCE STATUS değişmedi); decision kapanışıyla READY_FOR_CANDIDATE_DECOMPOSITION haline geldi, **CANDIDATE-I** ile mapping yapıldı, ilk dilimi **CANDIDATE-I1 CANONICAL/CONSUMED** (2026-07-16/17, PR #1325) — kalan tam object-scope enforcement kapsamı hâlâ owner tarafından seçilmedi/başlatılmadı (bkz. `OFFICE-DELIVERY-MANIFEST.md` §2/§7/§4e).

**STF-PRD-CFG-001** — Yapılandırma yüzeyi erişim kontrol boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Office/branch configuration yüzeyinde yeterli authorization gate bulunmayabilir. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: §13/§14 authorization zinciri office config'e tam uygulanır (OFF-INV-05)
RELATED OFF-INV: OFF-INV-05 · RELATED OFF/OD: —
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: Safe default available (owner decision dossier'inde).

**STF-PRD-LIFE-001** — Lifecycle durum-geçiş kontrol boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Personel lifecycle durum geçişlerinde (offboarding/reactivation) residue veya kontrolsüz yeniden-yetkilendirme oluşabilecek bir mimari boşluk. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Reactivation grants otomatik restore etmez; rehire ayrı ele alınır (OFF-INV-07)
RELATED OFF-INV: OFF-INV-07 · RELATED OFF/OD: OFF/OD-16, OFF/OD-17
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: —

**STF-PRD-PRIV-001** — Hassas kişisel veri görünürlük/minimizasyon boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Personel yüzeylerinde hassas kişisel veri alanlarının varsayılan olarak yeterince maskelenmediği bir gizlilik/minimizasyon boşluğu. Hangi alanların/yüzeylerin etkilendiğine ilişkin ayrıntılar kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Maskeli varsayılan + field-level permission + export allowlist (OFF-INV-10)
RELATED OFF-INV: OFF-INV-10 · RELATED OFF/OD: OFF/OD-18
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: WAVE 3 — Privacy Revival · LAST VERIFIED SHA: `2e2108aa`
MITIGATION STATUS: OPEN / PARTIALLY MITIGATED
DELIVERED SLICES: CANDIDATE-F1 — CANONICAL · CANDIDATE-H1 — CANONICAL
EVIDENCE: PR #1270 (squash `a170da3e`) · PR #1283 (squash `29eb6384`) · WAVE 3 closure record — bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4d/§7
RESIDUALS (CARRIED FORWARD): OFF-INV-10 → PARTIAL · CANDIDATE-F2 → DORMANT · CANDIDATE-G → BLOCKED
FINDING VERDICT: OPEN / NOT CLOSED — WAVE 3 teslimat kapanışı bu bulguyu KAPATMAZ; kalan detay/export yüzeyleri owner-gated residual olarak taşınır.
NOTES: Owner policy required.

**STF-PRD-OPS-001** — Karar-destek metrik güvenilirlik boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Karar ekranlarında gösterilen bazı metriklerin gerçek operasyonel veriyle örtüşmediği bir read-model güvenilirlik boşluğu (istismar riski taşımaz; veri kalitesi/güven konusu).
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Read model kaynağını açıklar, mock'u gerçek gibi sunmaz (OFF-INV-09)
RELATED OFF-INV: OFF-INV-09 · RELATED OFF/OD: OFF/OD-19
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: Safe default: remove/empty.

**STF-PRD-PERF-001** — Sorgu performansı iyileştirme ihtiyacı
SEVERITY: P3 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Personel raporlama yüzeyinde sorgu performansı iyileştirme fırsatı (mühendislik/performans konusu; yetkisiz erişim riski taşımaz).
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Sorgu performansı — mühendislik iyileştirmesi (domain invariant ihlali değil)
RELATED OFF-INV: OFF-INV-09 · RELATED OFF/OD: —
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: Mühendislik/performans; domain invariant ihlali değil.

**STF-PRD-BOLA-002** — Görev ataması uygunluk/kapsam kontrol boşluğu
SEVERITY: P3 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Görev atama yüzeyinde assignee uygunluk/kapsam doğrulamasının eksik olabileceği bir kontrol boşluğu. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Assignment/access ayrımı + eligibility kontrolü (OFF-INV-04)
RELATED OFF-INV: OFF-INV-04 · RELATED OFF/OD: OFF/OD-10
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: WAVE 4+ · LAST VERIFIED SHA: `7210ea7c`
MITIGATION STATUS: OPEN / PARTIALLY MITIGATED (Task-atama baseline IMPLEMENTED; Case porsiyonu + rol/kapasite policy açık)
DELIVERED SLICES: CANDIDATE-J1 — CANONICAL (Task Assignee Baseline Eligibility Gate; aynı-tenant + aktiflik, ileriye-dönük write-time enforcement; PR #1338, squash `7210ea7c`, CI 4/4 PASS)
MAPPED SLICES: CANDIDATE-J1 (Task-atama baseline; CANONICAL/CONSUMED) · CANDIDATE-K1 (Case ekip-ekleme baseline; OWNER_SELECTED/CONTRACT_RATIFIED 2026-07-17, implementationAuthorization NONE — henüz implement edilmedi) · CANDIDATE-K2 (Bulk Case-Assignment; ASSIGN-4d ürün-kararına BLOKE/DEFERRED) · CANDIDATE-K3 (Legal-Responsible Promotion Active Re-check; DEFERRED minor)
EVIDENCE (CANDIDATE-J1): PR #1338 (squash `7210ea7c`, implementasyon; görev servisi write-yolu tenant+aktiflik doğrulaması, 4 senaryo testi, 1873 regresyon PASS, differential-tsc-clean) — bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4f/§5/§7; `decision-log.md` § 2026-07-17 CANDIDATE-J1 Implementation Closure
RESIDUALS (CARRIED FORWARD): J1 yalnız Task-atama baseline (aynı-tenant + aktiflik, ileriye-dönük) alt-boşluğunu KAPATTI. Case-atama tarafı CANDIDATE-K DECOMPOSED (2026-07-17) → K1 (ekip-ekleme baseline) OWNER_SELECTED/CONTRACT_RATIFIED ama HENÜZ IMPLEMENT EDİLMEDİ; K2 (toplu atama, ASSIGN-4d'ye BLOKE) + K3 (legal-sorumlu terfi re-check, minor) + kalan J rol/kapasite policy AYRI, owner-gated future scope — TESLİM EDİLMEDİ
FINDING VERDICT: OPEN / NOT CLOSED — teslim edilen tek slice (J1) yalnız Task-atama porsiyonunun baseline'ını kapattı; Case-atama tarafında K1 Contract RATIFIED ama henüz implement edilmedi, K2 (bulk) ASSIGN-4d'ye bağlı, K3 (terfi re-check) deferred. Riskin TARGET CONTROL'ü (assignment/access ayrımı + eligibility tüm atama yüzeylerinde) henüz tam sağlanmıyor. Asıl davranışsal kapanış, hâlâ owner-gated kalan Case-atama enforcement zincirini (K1 implementation + K2/ASSIGN-4d + K3 + opsiyonel rol/kapasite policy) gerektirir.
NOTES: OFF/OD-10 owner tarafından Option B ile CLOSED/CANONICAL kapatıldı (2026-07-16, Access-Scope Owner Decision Package — bkz. `decision-log.md`). Bu bulgunun kendisi KAPANMADI (DOMAIN STATUS/EVIDENCE STATUS değişmedi); decision kapanışıyla READY_FOR_CANDIDATE_DECOMPOSITION haline geldi, **CANDIDATE-J (Task) + CANDIDATE-K (Case) ile mapping yapıldı** (2026-07-17). J-tarafı: CANDIDATE-J DECOMPOSED → **CANDIDATE-J1 CANONICAL/CONSUMED** (PR #1338/#1344). K-tarafı: **CANDIDATE-K DECOMPOSED (K1/K2/K3)** (2026-07-17) → ilk dilimi **CANDIDATE-K1 OWNER_SELECTED/CONTRACT_RATIFIED** (implementationAuthorization NONE); K2 ASSIGN-4d'ye BLOKE (DEFERRED), K3 deferred (bkz. `OFFICE-DELIVERY-MANIFEST.md` §2/§7/§4f).

**STF-PRD-DATA-001** — Veri bütünlüğü / eşzamanlılık kontrol boşluğu
SEVERITY: P3 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Uniqueness/cardinality invariant'larının yalnız uygulama katmanında (DB-level constraint olmadan) doğrulanabileceği bir veri bütünlüğü boşluğu.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: DB-level constraint (cardinality kararına bağımlı)
RELATED OFF-INV: — · RELATED OFF/OD: OFF/OD-01, OFF/OD-03
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: Cardinality kararına bağımlı.

**STF-PRD-SES-002** — Yetkilendirme/oturum bilgisinin gecikmeli yenilenmesi
SEVERITY: P3 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Yetki değişikliğinin oturum/token yüzeyine yansımasında bir gecikme penceresi olabilir. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Session/token revocation stratejisi uygulanır (OFF-INV-06)
RELATED OFF-INV: OFF-INV-06 · RELATED OFF/OD: OFF/OD-15
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: SES-001 ile birlikte ele alınmalı.

---

**STF-PRD-* toplam: 12.** Bu dosya hiçbir riski kendiliğinden global backlog'a eklemez, yetkilendirmez veya kapatmaz.

---

## CLIENT-SEC-H2 Structural Findings (STF-PRD-* ailesinden ayrı, CLIENT domain provenance)

Aşağıdaki iki kart, MÜVEKKİL/CLIENT Canonical Analysis programının CLIENT-SEC-H2 hattından (bkz. `decision-log.md` CLIENT-SEC-H2 kaydı) gelir; OFFICE'in kendi `OFF/OD` karar setine bağlı değildir ve yukarıdaki "STF-PRD-* toplam: 12" sayımına dahil değildir. Bu dosyanın "Statü otoritesi ayrımı" kuralı (yukarıda) bu iki karta da aynen uygulanır.

**CLIENT-SEC-H2-STRUCT-01** — Audit/entegrasyon log yüzeyinde tenant ownership boşluğu (şema-seviyesi, I)
SEVERITY: P1 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Bir entegrasyon/audit log yüzeyinde tenant kolonu veya tenant'a giden bir ilişki bulunmuyor olabilir; okuma yolları H2A ile fail-closed containment altına alındı. Etkilenen model/tablo adı, alan adları ve runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Owner ratifikasyonu (2026-07-16) nullable-first additive schema yönünü seçti — kalıcı emeklilik seçeneği bu round'da seçilmedi. NOT NULL/FK hardening ve endpoint restoration AYRI, sonraki owner GO gerektirir.
RELATED OFF-INV: — (CLIENT domain finding, OFFICE invariant setine bağlı değil) · RELATED OFF/OD: —
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: CLIENT-SEC-H2C-P01/P02/P02-R1 CANONICAL · P03 ANALYSIS COMPLETE · LAST VERIFIED SHA: `cfc59b74`
CURRENT SAFETY POSITION: H2A fail-closed containment (PR #1304, squash `676eead29cc2249051398ba20d504c82ba937402`) ilgili okuma yollarını service/Prisma katmanına hiç ulaşmadan kapatıyor; live exposure CONTAINED. Nullable tenant ownership kolonu eklendi (P01, PR #1329) ve yeni yazımlar authenticated trusted context'ten ownership populate ediyor (P02/P02-R1, PR #1334/#1339) — mevcut satırlar DEĞİŞMEDİ.
STRUCTURAL FINDING (H2C, read-only analiz): **STRUCTURAL REMEDIATION: FEASIBLE (yüksek güven)** — bir tenant-ilişkilendirme yolu için yüksek-güvenilirlikli kanıt bulundu; bir alt-küme kayıt için ilişkilendirme başarısız olabilir.
P03 EVIDENCE (backfill closure, 2026-07-17): **TECHNICAL BACKFILL LOGIC: VALIDATED** (disposable synthetic üzerinde deterministic match + orphan rejection + conflict detection + idempotency + rollback doğrulandı, tek-transaction ROLLBACK, kalıcı mutasyon yok). **REPRESENTATIVE DATA EVIDENCE: ABSENT** (local dev DB boş, repo fixture yok). **REAL DATA DISTRIBUTION: UNKNOWN** (gerçek satır/orphan/conflict oranı MATERIAL UNKNOWN). **STRUCTURAL RISK: OPEN.** **P04 PRODUCTION BACKFILL: BLOCKED — REPRESENTATIVE EVIDENCE REQUIRED.** Mekanizma ayrıntısı kasıtlı olarak public repository dışında tutulur.
RATIFIED DIRECTION (2026-07-16): Nullable tenant ownership kolonu + index — additive-only, sıfır davranış değişikliği. Backfill/hardening/endpoint-restoration bu ratifikasyonla YETKİLENDİRİLMEDİ.
IMPLEMENTATION AUTHORITY: NONE — production backfill, NOT NULL/FK hardening veya endpoint restoration için hiçbir yetki bu kartla verilmez.
NOTES: H2A containment MANDATORY — yapısal çözüm + owner-onaylı temsili-veri backfill kanıtı olmadan KALDIRILAMAZ. İki owner rotası açık: P03-R1 (representative data evidence) veya permanent endpoint retirement (bkz. `decision-log.md` CLIENT-SEC-H2C-P03 kaydı). Detaylı backfill/cutover analizi owner'ın local ortamında tutulur.

**CLIENT-SEC-H2-STRUCT-02** — Audit/entegrasyon log yüzeyinde tenant ownership boşluğu (şema-seviyesi, II — kısmen çözülemez)
SEVERITY: P1 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Ayrı bir entegrasyon/audit log yüzeyinde tenant kolonu bulunmuyor olabilir. Okuma yolları H2A ile fail-closed containment altına alındı. Etkilenen model/tablo adı, alan adları ve runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Owner ratifikasyonu (2026-07-16) nullable-first additive schema yönünü seçti; UNRESOLVABLE sınıfı için kalıcı nullable altküme kabulü açıkça bırakıldı. Kalıcı emeklilik seçeneği bu round'da seçilmedi.
RELATED OFF-INV: — (CLIENT domain finding, OFFICE invariant setine bağlı değil) · RELATED OFF/OD: —
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: CLIENT-SEC-H2C-P01/P02/P02-R1 CANONICAL · P03 ANALYSIS COMPLETE · LAST VERIFIED SHA: `cfc59b74`
CURRENT SAFETY POSITION: H2A fail-closed containment (PR #1304, squash `676eead29cc2249051398ba20d504c82ba937402`) ilgili okuma yollarını service/Prisma katmanına hiç ulaşmadan kapatıyor; live exposure CONTAINED. H2B (PR #1311, squash `a46d320072c6e80f983832be02aba305fc8b5940`) ayrıca ayrı bir kod-seviyesi sorguyu tenant-scoped hale getirdi. Nullable tenant ownership kolonu eklendi (P01, PR #1329); yeni yazımlar trusted context'ten ownership populate ediyor (P02/P02-R1, PR #1334/#1339) — bunların hiçbiri log tablosunun mevcut satırlarının yapısal boşluğunu KAPATMAZ.
STRUCTURAL FINDING (H2C, read-only analiz): **STRUCTURAL REMEDIATION: PARTIALLY FEASIBLE** — bir alt-küme kayıt için deterministik ilişkilendirme yolu bulundu; ayrı bir alt-küme ise ilgili işlemin doğası gereği retroaktif olarak çözülemez (UNRESOLVABLE sınıfı mevcut, kalıcı olabilir) — **tam deterministik backfill mümkün DEĞİL.** Ayrıca meşru, tasarım-gereği tenant-nötr bir sistem-içi tüketici mevcut — herhangi bir gelecekteki tenant-filtre zorunluluğu bunu KIRMAMALI.
P03 EVIDENCE (backfill closure, 2026-07-17): **TECHNICAL BACKFILL LOGIC: VALIDATED** (disposable synthetic üzerinde requestType-kırılımlı deterministic/unresolvable sınıflandırma + orphan rejection + conflict detection + idempotency doğrulandı, tek-transaction ROLLBACK). **REPRESENTATIVE DATA EVIDENCE: ABSENT.** **REAL DATA DISTRIBUTION: UNKNOWN.** **STRUCTURAL RISK: OPEN.** **P04 PRODUCTION BACKFILL: BLOCKED — REPRESENTATIVE EVIDENCE REQUIRED.** Mekanizma ayrıntısı kasıtlı olarak public repository dışında tutulur.
RATIFIED DIRECTION (2026-07-16): Nullable tenant ownership kolonu + index — additive-only, sıfır davranış değişikliği; sistem-içi tenant-nötr tüketicinin korunması ratifikasyonda açıkça belirtildi. Backfill/hardening/endpoint-restoration bu ratifikasyonla YETKİLENDİRİLMEDİ.
IMPLEMENTATION AUTHORITY: NONE — production backfill, NOT NULL/FK hardening veya endpoint restoration için hiçbir yetki bu kartla verilmez.
NOTES: H2A containment MANDATORY — yapısal çözüm + owner-onaylı temsili-veri backfill kanıtı olmadan KALDIRILAMAZ. İki owner rotası açık: P03-R1 (representative data evidence) veya permanent endpoint retirement. Detaylı backfill/cutover analizi ve owner karar listesi: `decision-log.md` CLIENT-SEC-H2 + CLIENT-SEC-H2C-P03 kayıtları.
