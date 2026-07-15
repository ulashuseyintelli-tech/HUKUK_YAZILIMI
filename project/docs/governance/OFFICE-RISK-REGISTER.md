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
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
RISK STATUS (S1–S4 scope only): REMEDIATED / CLOSED — DOMAIN STATUS ve EVIDENCE STATUS alanları (yukarıda) BİLEREK DEĞİŞTİRİLMEDİ: bu belgenin kendi "Statü otoritesi ayrımı" kuralı (yukarıda) OPEN/CLOSED yürütme statüsünü yalnız `master-triage-register.md`'ye ayırır; bu satır yalnız S1–S4 remediation kanıtını taşır, global triage/domain-status kararı DEĞİLDİR.
IMPLEMENTATION: PR #1291
SQUASH SHA: 328dcdf6689575da8a4849f4b632a737079c22ad
EVIDENCE: CI 4/4 SUCCESS (Architectural Guardrails, Test Suite, Web Tests vitest, Client Workspace Live Smoke) · S1–S4 regression coverage (4 test suite, 16 test, wired into CI)
PREVIOUS PR: PR #1147 — CLOSED / SUPERSEDED BY PR #1291 (merge edilmedi; kodu main'e girmedi)
SCOPE NOTE: Remediation, tespit edilen authentication/tenant-scope/object-ownership exposure'ını kapatır. OFF/OD-08'in daha geniş intra-tenant access-scope kararını ÇÖZMEZ.
NOTES: PR #1147 kapatıldı (2026-07-15, superseded by PR #1291) — artık "OFFICE kapsamı dışı, ilişkili olabilir" belirsizliği taşımaz. Owner kararı ve tam kanıt zinciri: `decision-log.md` CLIENT-SEC-H1 kaydı; güncel PR #1147 durumu: `OFFICE-MASTER-SYNTHESIS.md` §11. EK (2026-07-16): OFF/OD-08 owner tarafından Option B ile ayrıca CLOSED/CANONICAL kapatıldı (Access-Scope Owner Decision Package — bkz. `decision-log.md` § 2026-07-16 Access-Scope Owner Decision Package Closure). Bu, SCOPE NOTE'ta ayrı tutulan geniş intra-tenant access-scope kararının owner tarafından seçilmesidir; PR #1291'in dar remediation kapsamını değiştirmez ve bu bulguyu KAPATMAZ (DOMAIN STATUS/EVIDENCE STATUS değişmedi). Decision kapanmasıyla READY_FOR_CANDIDATE_DECOMPOSITION durumuna geçen ilişkili kayıt CANDIDATE-E'dir (bkz. `OFFICE-DELIVERY-MANIFEST.md` §4/§4c/§8) — henüz owner tarafından seçilmedi/başlatılmadı.

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
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: —

**STF-PRD-SCP-001** — Tenant içi nesne düzeyi kapsam kontrol boşluğu
SEVERITY: P2 · DOMAIN STATUS: CANDIDATE / NOT YET TRIAGED · EVIDENCE STATUS: REVALIDATION_REQUIRED
PUBLIC SUMMARY: Tenant içi (manager/team/office) erişim kapsamının nesne düzeyinde yeterince daraltılmamış olabileceği bir kontrol boşluğu. Reproduction kanıtı ve etkilenen runtime konumları kasıtlı olarak public repository dışında tutulur.
PRIVATE EVIDENCE: RETAINED LOCALLY / NOT PUBLISHED
CURRENT CANONICAL EVIDENCE: NOT PUBLICLY DISCLOSED / REVALIDATION REQUIRED
TARGET CONTROL / DESIRED OUTCOME: Object-scope evaluation manager/team kapsamını uygular (OFF-INV-05)
RELATED OFF-INV: OFF-INV-05 · RELATED OFF/OD: OFF/OD-08
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: OFF/OD-08 owner tarafından Option B ile CLOSED/CANONICAL kapatıldı (2026-07-16, Access-Scope Owner Decision Package — bkz. `decision-log.md`). Bu bulgunun kendisi KAPANMADI (DOMAIN STATUS/EVIDENCE STATUS değişmedi); decision kapanışıyla READY_FOR_CANDIDATE_DECOMPOSITION haline geldi, henüz candidate seçilmedi/başlatılmadı (bkz. `OFFICE-DELIVERY-MANIFEST.md` §2/§7).

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
GLOBAL TRIAGE REGISTER ID: NOT YET ASSIGNED · PRODUCT BACKLOG ID: NOT YET ASSIGNED · IMPLEMENTATION WORKSTREAM: NOT YET ASSIGNED · LAST VERIFIED SHA: NONE
NOTES: OFF/OD-10 owner tarafından Option B ile CLOSED/CANONICAL kapatıldı (2026-07-16, Access-Scope Owner Decision Package — bkz. `decision-log.md`). Bu bulgunun kendisi KAPANMADI (DOMAIN STATUS/EVIDENCE STATUS değişmedi); decision kapanışıyla READY_FOR_CANDIDATE_DECOMPOSITION haline geldi, henüz candidate seçilmedi/başlatılmadı (bkz. `OFFICE-DELIVERY-MANIFEST.md` §2/§7).

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
