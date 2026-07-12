# OFFICE Master Synthesis — Evidence, Analysis and Scenario Source

```text
Belge yolu : project/docs/governance/OFFICE-MASTER-SYNTHESIS.md
Durum      : DRAFT — EVIDENCE REVIEW REQUIRED
Rol        : SYNTHESIS / EVIDENCE / NON-NORMATIVE — CANNOT OVERRIDE DOMAIN LAW
```

## 1. Status and Role

Bu belge `Avukat_Personel_Konsolide_Mimari_ve_Risk_Raporu`'nun (kullanıcının Desktop'ındaki kaynak dosya) analiz/kanıt/senaryo içeriğini korur. **Norm üretmez.** Herhangi bir ilke ifadesi `OFFICE-GOVERNANCE.md` ile çelişirse, **OFFICE-GOVERNANCE.md esas alınır** ve çelişki bir bulgu olarak `decision-log.md`'ye taşınır — burada sessizce çözülmez.

## RELATED DOCUMENTS

- Domain Law: `project/docs/governance/OFFICE-GOVERNANCE.md`
- Risk dossier: `project/docs/governance/OFFICE-RISK-REGISTER.md`
- Owner decision dossier: `project/docs/governance/OFFICE-OWNER-DECISIONS.md`
- Karar kaydı: `project/docs/governance/decision-log.md`

## 2. Provenance and Evidence Chain

```text
Kaynak A: Yapıştırılan metin, özellikle satırlar 14–78, 164–230, 233–328, 342–361.
Kaynak B: Yapıştırılan metin, özellikle satırlar 13–25, 33–48, 51–119, 141–215, 228–260.
```

**Evidence gap:** Kaynak A/B repo içinde doğrulanamayan, önceki/loglanmamış bir oturumun yapıştırılmış çıktılarıdır — SHA-anchored, commit-anchored veya CI-anchored bir kanıt zinciri **yoktur**. Bu belgedeki tüm teknik iddialar bu nedenle varsayılan olarak `REVALIDATION_REQUIRED` statüsündedir (`SYS-COMP-002`), `CONFIRMED` değil.

## 3. Current-State vs Target-State Summary

| Alan | Durum |
|---|---|
| Audit content | COMPLETE (candidate rapor kapsamında) |
| Independent evidence certification | CONDITIONAL — line-level kanıt + yeni-PC baseline gerekir |
| Implementation authorization | NOT GRANTED |
| Overall transformation | CANONICAL IMPLEMENTATION NOT STARTED |
| PR #1147 | OPEN / UNMERGED / NON-CANONICAL CANDIDATE (bkz. §11 — repository-wide dependency, OFFICE kapsamı dışı) |

## 4. Epistemic Status Legend

Candidate rapordaki "Disposition" değerleri şu taksonomiye eşlenir (merkezi eşleme tablosu; satır-satır yeniden etiketleme yapılmamıştır — orijinal Disposition zaten bu ayrımı daha ince granülerlikte taşır):

| Bu belgenin taksonomisi | Candidate rapordaki karşılık gelen Disposition değerleri |
|---|---|
| OBSERVED | REACHABLE / *, PREVENTED / REJECTED, OBSERVED * |
| INFERRED | LIKELY PREVENTED, LIKELY REACHABLE |
| CONDITIONAL | DERIVED CONDITIONAL, MITIGATED / RECHECK, PARTIALLY PREVENTED, CONDITIONAL / * |
| UNKNOWN | UNKNOWN, UNKNOWN / * |
| NOT APPLICABLE | NOT APPLICABLE CURRENTLY |
| SUPERSEDED | *(bu turda yok — ileride bir bulgu güncel kanıtla değiştirilirse kullanılır)* |

## 5. Lifecycle Scenarios (45) — `LF-RT-*`

| ID | Senaryo | Disposition | Kontrol/not |
|---|---|---|---|
| LF-RT-01 | User oluşturulur, Staff oluşturma başarısız olur | UNKNOWN | Creation transaction/orphan davranışı yeni PC'de doğrulanmalı |
| LF-RT-02 | Staff oluşturulur, Membership oluşturma başarısız olur | UNKNOWN | Membership/Employment ayrımı ve transaction sınırı belirsiz |
| LF-RT-03 | Membership ve role oluşur, invitation gönderilemez | DERIVED CONDITIONAL | Preboarding'de authority activation sırası doğrulanmalı |
| LF-RT-04 | Invitation iki kez kabul edilir | LIKELY PREVENTED | Idempotency line-level revalidation gerekir |
| LF-RT-05 | Expired invitation kabul edilir | LIKELY PREVENTED | Gerçek route testi önerilir |
| LF-RT-06 | Başka User'a ait invitation token kullanılır | LIKELY PREVENTED | Integration kanıtı korunmalı |
| LF-RT-07 | Staff active olmadan session oluşturulur | UNKNOWN | Ayrı end-to-end kanıt yok |
| LF-RT-08 | User active, Membership inactive iken tenant erişimi | REACHABLE / P1 FAMILY | Active-state conflation; SES-001 ile aynı kök neden |
| LF-RT-09 | Staff inactive, User active token ile işlem | REACHABLE / P1 | PRD-SES-001 doğrudan kanıtı |
| LF-RT-10 | LawyerCredential inactive iken case assignment | UNKNOWN / CONTROL GAP | Eligibility model dağınık |
| LF-RT-11 | Takım transferinde eski team permission kalır | DERIVED CONDITIONAL | Scope/role cleanup orchestration eksik |
| LF-RT-12 | Demotion sonrası eski token geniş yetkiyi kullanır | REACHABLE / P3 | JWT stale-authority |
| LF-RT-13 | İzin delegation'ı bitişte iptal edilmez | UNKNOWN | Delegation lifecycle tam kanıtlı değil |
| LF-RT-14 | Suspension sırasında pending approval onaylanır | DERIVED CONDITIONAL | Staff/Membership active enforcement belirsiz |
| LF-RT-15 | Pasifleştirme sırasında yeni task atanır | DERIVED CONDITIONAL | Lifecycle lock yok |
| LF-RT-16 | Termination sırasında refresh token kullanılır | REACHABLE / P1 | Session/refresh revocation yokluğu |
| LF-RT-17 | Membership kapanır, global role aktif kalır | DERIVED CONDITIONAL | RoleAssignment owner/scope belirsiz |
| LF-RT-18 | Permission revoke sonrası cache eski permission döndürür | DERIVED CONDITIONAL | JWT/cache stale family |
| LF-RT-19 | Staff deactivate yalnız flag değiştirir, session aktif kalır | REACHABLE / P1 | staff.remove yalnız isActive=false |
| LF-RT-20 | User deactivate tüm tenant üyeliklerini yanlış kapatır | NOT APPLICABLE CURRENTLY | Aktif endpoint yok |
| LF-RT-21 | Offboarding replacement olmadan sorumlu avukatı kaldırır | REACHABLE AS GAP | Orchestration yok |
| LF-RT-22 | Replacement farklı tenant personeli | UNKNOWN / HIGH CONTROL NEED | Cross-tenant constraint kanıtı eksik |
| LF-RT-23 | Replacement pasif/izinli personel | DERIVED CONDITIONAL | Candidate eligibility eksik |
| LF-RT-24 | Replacement avukat değilken ResponsibleLawyer atanır | UNKNOWN / CONTROL GAP | Credential eligibility target invariant |
| LF-RT-25 | Case reassignment, ClientAccess eski personelde kalır | DERIVED CONDITIONAL | Assignment/access ayrımı belirsiz |
| LF-RT-26 | Task reassignment yarıda kalır | UNKNOWN | Transaction/partial failure matrisi eksik |
| LF-RT-27 | Recurring task eski personele üretilir | DERIVED CONDITIONAL | Scheduled work cleanup yok |
| LF-RT-28 | Authority revoke sonrası eski approver onaylar | DERIVED CONDITIONAL | Authority snapshot hardening açığı |
| LF-RT-29 | Approval reassignment self-approval oluşturur | LIKELY PREVENTED / RECHECK | Reassignment sonrası yeniden kontrol doğrulanmalı |
| LF-RT-30 | Delegator terminate olur, delegation aktif kalır | DERIVED CONDITIONAL | Delegation/offboarding entegrasyonu eksik |
| LF-RT-31 | Delegate terminate olur, effective permission'a dahil kalır | DERIVED CONDITIONAL | Active-state enforcement eksik |
| LF-RT-32 | Signed file URL termination sonrası çalışır | UNKNOWN | File/signed URL lifecycle hardening |
| LF-RT-33 | Scheduled export eski personel için üretilir | UNKNOWN | Job recipient/actor recheck kanıtı yok |
| LF-RT-34 | Reminder ayrılan personele gönderilir | UNKNOWN / PRODUCT GAP | Notification cleanup tanımlı değil |
| LF-RT-35 | Offboarding DB commit olur, session revoke başarısız | REACHABLE ARCHITECTURAL RISK | Orchestrator/partial failure görünürlüğü yok |
| LF-RT-36 | Session revoke olur, offboarding transaction rollback | UNKNOWN | Compensation/idempotency tasarlanmalı |
| LF-RT-37 | Offboarding event iki kez işlenir | NOT APPLICABLE CURRENTLY | Orchestrator yok |
| LF-RT-38 | Aynı personel için iki offboarding aynı anda başlar | NOT APPLICABLE CURRENTLY | Workflow lock/idempotency gerekir |
| LF-RT-39 | Scheduled termination ile manual reactivation yarışır | UNKNOWN | Scheduled lifecycle davranışı doğrulanmadı |
| LF-RT-40 | Bulk offboarding kısmi başarı üretir | NOT APPLICABLE CURRENTLY | Bulk workflow yok |
| LF-RT-41 | Last TenantOwner offboard edilir | UNKNOWN / OWNER DECISION | Safe default: engelle |
| LF-RT-42 | Reactivation eski role/permission'ları geri getirir | REACHABLE / P2 | PRD-LIFE-001 |
| LF-RT-43 | Rehire eski delegation/approval authority'yi açar | DERIVED CONDITIONAL | Rehire semantics belirsiz |
| LF-RT-44 | Hard delete approval/audit actor referanslarını siler | PREVENTED / REJECTED RISK | Hard delete yok |
| LF-RT-45 | Search index terminated personeli active gösterir | UNKNOWN | Search projection/lifecycle reindex kanıtı yok |

## 6. Product/Operations Scenarios (45) — `OP-RT-*`

| ID | Senaryo | Disposition | Kontrol/not |
|---|---|---|---|
| OP-RT-01 | Manager başka takım personelini görür | DERIVED CONDITIONAL | Flat intra-tenant scope P2 |
| OP-RT-02 | Listede active, Membership inactive | REACHABLE | Active-state conflation |
| OP-RT-03 | Aynı kişi User/Staff nedeniyle iki satır | DERIVED CONDITIONAL | Identity/source-of-truth ambiguity |
| OP-RT-04 | Detail User ID ile açılır, action Staff ID bekler | DERIVED CONDITIONAL | ID-type conflation |
| OP-RT-05 | Personel 360 role gösterir, direct grant göstermez | OBSERVED PRODUCT GAP | Effective permission explainability yok |
| OP-RT-06 | Kişi dosyayı global permission ile görür, neden açıklanmaz | OBSERVED GAP | Effective access source görünmüyor |
| OP-RT-07 | ResponsibleLawyer ve CaseTeamMember aynı etiket | DERIVED CONDITIONAL | Assignment semantics ambiguous |
| OP-RT-08 | Client owner ve ClientAccess aynı sayı | DERIVED CONDITIONAL | Ownership/access ayrımı hedefte zorunlu |
| OP-RT-09 | Inactive personel assignee selector'da | LIKELY REACHABLE | Task assignee validation eksik |
| OP-RT-10 | İzinli personel yüksek uygunlukla önerilir | UNKNOWN | Leave/capacity model kanıtı yok |
| OP-RT-11 | Credential inactive personel case sorumlusu seçilir | UNKNOWN / CONTROL GAP | Credential eligibility doğrulanmalı |
| OP-RT-12 | Assignment başarılı, gerekli access oluşmaz | DERIVED CONDITIONAL | Assignment/access coupling belirsiz |
| OP-RT-13 | Backend fail, optimistic UI geri alınmaz | UNKNOWN | Frontend mutation davranışı doğrulanmadı |
| OP-RT-14 | Task duplicate assign, workload iki kez artar | DERIVED CONDITIONAL | Uniqueness/race + workload lineage eksik |
| OP-RT-15 | Reassignment sonrası eski owner görünür | DERIVED CONDITIONAL | Cache/history/read-model drift |
| OP-RT-16 | Recurring task ayrılan personele üretilir | DERIVED CONDITIONAL | Lifecycle/job cleanup yok |
| OP-RT-17 | Workload yalnız task count kullanır | PARTIAL / MISLEADING | Canonical formula yok |
| OP-RT-18 | İzinli/part-time personel tam kapasite sayılır | UNKNOWN / LIKELY GAP | Capacity/availability model kanıtlanmadı |
| OP-RT-19 | Join çoğalması workload'u şişirir | DERIVED CONDITIONAL | Metric lineage/count-distinct eksik |
| OP-RT-20 | Dashboard count ile liste count uyuşmaz | DERIVED CONDITIONAL | Farklı query/read-model riski |
| OP-RT-21 | Workload cache eski, detail canlı | DERIVED CONDITIONAL | Freshness/cache invalidation eksik |
| OP-RT-22 | Metric backend hatasında sıfır görünür | UNKNOWN | Error/empty/partial UX kanıtı eksik |
| OP-RT-23 | Completed task count doğrudan performans skoru | CONDITIONAL / NOT RECOMMENDED | Performans yönetişimi yok |
| OP-RT-24 | Farklı roller aynı leaderboard'da | OBSERVED/MISLEADING | Case-count leaderboard bağlamdan kopuk |
| OP-RT-25 | Approval inbox aynı request'i iki kez gösterir | UNKNOWN | Projection/dedupe kanıtı yok |
| OP-RT-26 | Delegated approval normal approval gibi görünür | UNKNOWN / UX GAP | Delegation explainability eksik |
| OP-RT-27 | Approval içeriği değişti, UI uyarmaz | UNKNOWN | UI version/change indicator doğrulanmadı |
| OP-RT-28 | Stale approval item optimistic approved görünür | UNKNOWN | Cache/mutation rollback kanıtı yok |
| OP-RT-29 | Expired delegation UI'da aktif | UNKNOWN | Delegation state/freshness kanıtı yok |
| OP-RT-30 | Role revoke sonrası Personel 360 eski permission gösterir | DERIVED CONDITIONAL | JWT/cache stale + P360 yokluğu |
| OP-RT-31 | Frontend title üzerinden admin aksiyonu gösterir | DERIVED CONDITIONAL | Role/title drift, UI-only gate |
| OP-RT-32 | Offboarding success alt job'lar bitmeden gösterilir | NOT APPLICABLE CURRENTLY | Workflow yok |
| OP-RT-33 | Offboarding partial failure görünmez | OBSERVED CAPABILITY GAP | Orchestrator/progress yok |
| OP-RT-34 | Reactivation grants restore eder, UI açıklamaz | REACHABLE / P2 | PRD-LIFE-001 + explainability gap |
| OP-RT-35 | Bulk reassignment kısmi fail, tümü başarılı görünür | UNKNOWN | Bulk/item result kanıtı yok |
| OP-RT-36 | Export UI filtresinden geniş veri içerir | UNKNOWN / PRIVACY CHECK | Export/list consistency doğrulanmalı |
| OP-RT-37 | Dashboard 403 sonucu empty data gösterir | UNKNOWN | Error/deny UX doğrulanmadı |
| OP-RT-38 | Tenant switch sonrası cache eski personeli gösterir | DERIVED CONDITIONAL | Tenant-aware query key doğrulaması eksik |
| OP-RT-39 | Liste hassas termination/leave verisini geniş gösterir | OBSERVED PRIVACY FAMILY | TCKN/IBAN kanıtı var |
| OP-RT-40 | Analytics click completion olarak kaydedilir | UNKNOWN | Instrumentasyon doğrulanmadı |
| OP-RT-41 | Organization tree inactive managerı aktif gösterir | UNKNOWN | Organization tree eksik/partial |
| OP-RT-42 | İki manager var, UI yalnız birini gösterir | UNKNOWN | Cardinality/history modeli belirsiz |
| OP-RT-43 | Case detail ve Personel 360 farklı responsible lawyer | DERIVED CONDITIONAL | Farklı read source riski |
| OP-RT-44 | Approval count ve inbox farklı scope kullanır | UNKNOWN | Count/list lineage doğrulanmadı |
| OP-RT-45 | Workload listesinde N+1 | OBSERVED / P3 | STF-PRD-PERF-001 |

## 7. Production Red-Team Scenarios (60) — `PR-RT-*`

| ID | Senaryo | Disposition | Kanıt/sonraki kontrol |
|---|---|---|---|
| PR-RT-01 | Başka User invitation token'ı kullanır | LIKELY PREVENTED | Integration gate korunmalı |
| PR-RT-02 | Expired invitation yeniden kullanılır | LIKELY PREVENTED | Expiry kontrolü raporlandı |
| PR-RT-03 | Staff inactive, User aktif token ile işlem | REACHABLE / P1 | SES-001 |
| PR-RT-04 | Membership kapalıyken refresh token | CONDITIONAL / P1 FAMILY | Refresh yolunda doğrulanmalı |
| PR-RT-05 | JWT tenant ile path/header tenant farklı | PARTIALLY PREVENTED | Source precedence revalidate |
| PR-RT-06 | Body tenantId başka tenant | PARTIALLY PREVENTED | Kritik istisnalar var |
| PR-RT-07 | Tenant A, Tenant B Staff detail | LIKELY PREVENTED | Route recheck gerekir |
| PR-RT-08 | Tenant A, Tenant B Staff update | LIKELY PREVENTED | Aynı sınırlama |
| PR-RT-09 | Mixed-tenant bulk payload | UNKNOWN | Bulk item-level matrix eksik |
| PR-RT-10 | Tenant içermeyen cache key ile permission sızıntısı | UNKNOWN | Cache key kanıtı eksik |
| PR-RT-11 | Generic Staff PATCH ile roleIds/isAdmin | CONDITIONAL / P2 | Mass assignment/RBAC gap |
| PR-RT-12 | Aktör kendi role'ünü değiştirir | CONDITIONAL / P2 | Grant ceiling doğrulaması eksik |
| PR-RT-13 | Aktör sahip olmadığı permission'ı verir | CONDITIONAL / P2 | Canonical grant ceiling yok |
| PR-RT-14 | Protected role clone edilir | UNKNOWN | Protected role modeli belirsiz |
| PR-RT-15 | Son TenantOwner kaldırılır | UNKNOWN / OWNER DECISION | Invariant doğrulanmadı |
| PR-RT-16 | Expired/soft-deleted RoleAssignment effective olur | UNKNOWN / P3 | Soft-delete/filter audit eksik |
| PR-RT-17 | Role revoke sonrası eski JWT kullanılır | REACHABLE / P3 | JWT stale |
| PR-RT-18 | Delegation scope/limit büyütür | UNKNOWN / HIGH CONTROL NEED | Model hedefte ayrılmalı |
| PR-RT-19 | Kullanıcı kendi işlemini onaylar | PREVENTED | Approval self-check çekirdeği güçlü |
| PR-RT-20 | Aynı Person ikinci User ile self-approval | MITIGATED / RECHECK | Stable Person identity zorunlu |
| PR-RT-21 | Düşük approval policy ID payload ile seçilir | LIKELY PREVENTED | Approval policy core güçlü |
| PR-RT-22 | Approval amount/currency sonradan değişir | LIKELY PREVENTED / HARDEN | Authority snapshot eksik |
| PR-RT-23 | Approval step paralel iki kez onaylanır | PREVENTED | Concurrency kontrolleri pozitif |
| PR-RT-24 | Approval sırası atlanır | PREVENTED | Step/state guard pozitif |
| PR-RT-25 | Authority revoke sonrası pending onay | CONDITIONAL | Authority snapshot eksik |
| PR-RT-26 | Bulk approval self-check atlar | UNKNOWN | Bulk yüzeyi doğrulanmadı |
| PR-RT-27 | Impersonation ile approval | NOT APPLICABLE CURRENTLY | Impersonation yok |
| PR-RT-28 | Approved resource finalize öncesi değişir | LIKELY PREVENTED | Version snapshot önerilir |
| PR-RT-29 | Offboarding commit, session revoke fail | REACHABLE ARCHITECTURAL | Orchestrator yok |
| PR-RT-30 | Session revoke, offboarding rollback | UNKNOWN | Compensation konusu |
| PR-RT-31 | Staff terminate, RoleAssignment aktif | REACHABLE / P1-P2 FAMILY | Lifecycle residue |
| PR-RT-32 | Delegator terminate, delegation aktif | CONDITIONAL | Entegrasyon yok |
| PR-RT-33 | Case reassigned, ClientAccess eski kişide | CONDITIONAL | Assignment/access residue |
| PR-RT-34 | Pending approval eski approverda | CONDITIONAL | Offboarding handoff yok |
| PR-RT-35 | Offboarding sırasında yeni task | CONDITIONAL | Lifecycle lock yok |
| PR-RT-36 | Reactivation eski grants'i açar | REACHABLE / P2 | LIFE-001 |
| PR-RT-37 | Rehire eski authority/delegation'ı açar | CONDITIONAL | Rehire yeni Employment değil |
| PR-RT-38 | Last owner/admin offboard edilir | UNKNOWN | Owner decision/invariant |
| PR-RT-39 | Paralel aynı Person için Staff create | CONDITIONAL / P3 | DB uniqueness/race |
| PR-RT-40 | Paralel ResponsibleLawyer kayıtları | CONDITIONAL / P3 | Cardinality constraint belirsiz |
| PR-RT-41 | Task iki manager tarafından farklı assign | CONDITIONAL | Version/locking/idempotency belirsiz |
| PR-RT-42 | Role grant ve revoke aynı anda | CONDITIONAL | JWT/cache + DB race |
| PR-RT-43 | Membership kapanırken tenant switch | CONDITIONAL / P1 FAMILY | Session/membership state race |
| PR-RT-44 | ApprovalRequest ve resource version ayrışır | MITIGATED / HARDEN | Explicit snapshot önerilir |
| PR-RT-45 | Hard delete AuditEvent actoru siler | PREVENTED / REJECTED | Hard delete yok |
| PR-RT-46 | Soft-deleted grant effective query'ye girer | UNKNOWN / P3 | Filter/constraint revalidation |
| PR-RT-47 | File ID değiştirip başka belge indirme | UNKNOWN / HARDENING | File object authorization eksik |
| PR-RT-48 | Export create auth, download auth yok | UNKNOWN / HARDENING | İki aşamalı authorization doğrulanmalı |
| PR-RT-49 | CSV formula payload export | UNKNOWN | Escaping doğrulanmadı |
| PR-RT-50 | Personel export hassas alanları geniş | CONDITIONAL / P2 PRIVACY | Field allowlist/masking gerekli |
| PR-RT-51 | Search başka tenant personelini döndürür | LIKELY PREVENTED / RECHECK | Search/index yüzeyi doğrulanmalı |
| PR-RT-52 | Dashboard 403/error'u sıfır gösterir | UNKNOWN / OPS | Error/empty semantics eksik |
| PR-RT-53 | Workload join çoğalması load'u şişirir | CONDITIONAL / P2 OPS | Metric lineage eksik |
| PR-RT-54 | Tenant switch sonrası eski cache | CONDITIONAL | Cache key revalidation |
| PR-RT-55 | Offboarding event iki kez işlenir | NOT APPLICABLE CURRENTLY | Future idempotency |
| PR-RT-56 | Export bütün dataset'i memory'ye alır | CONDITIONAL / P3 | Streaming/limit kanıtı yok |
| PR-RT-57 | Workload listesinde N+1 | OBSERVED / P3 | PERF-001 |
| PR-RT-58 | Search index tenant filtresi client parametresi | UNKNOWN | Search evidence gap |
| PR-RT-59 | Queue retry duplicate approval/assignment | UNKNOWN | Event/job idempotency eksik |
| PR-RT-60 | Cache/queue outage fail-open | UNKNOWN / RELEASE GATE | Fail-closed doğrulanmalı |

## 8. Evidence Gaps

- Kaynak A/B'nin repo-verifiable kanıt zinciri yok (bkz. §2).
- Bu synthesis'in hiçbir maddesi bu workstream içinde canonical repository HEAD'e karşı yeniden doğrulanmadı (runtime analizi bu turlarda FORBIDDEN'dı).
- LawyerCredential eligibility, cross-tenant replacement constraint, ve delegation lifecycle gibi alanlar için ayrı end-to-end kanıt eksikliği tekrarlayan bir temadır (bkz. UNKNOWN etiketli maddeler).

## 9. Excluded Content Note

"Yeni-PC Start Protocol" ve dış kaynak meta-anlatımı kasıtlı olarak bu belgeye alınmadı — operasyonel/session-bootstrap içeriği olup ne Domain Law ne de Synthesis/Evidence katmanına ait değildir.

## 10. Non-Normativity Statement

Bu belge **norm üretmez**. Yalnız `OFFICE-GOVERNANCE.md`'nin invariant'ları bağlayıcıdır. Bu belge yalnız o invariant'ların kanıt/gerekçe/senaryo temelini taşır.

## 11. Reclassified Items

**Former candidate `OD-20`** (PR #1147'nin kaderi): OFFICE domain owner-decision setinden çıkarılmıştır. Reclassified outside OFFICE domain authority — cross-program governance dependency (PR #1147 yalnız OFFICE'e özgü değil, repository-wide non-canonical candidate statüsü taşır). Bu madde artık `OFFICE-OWNER-DECISIONS.md`'de aktif bir dossier olarak yer almaz; `OFF/OD-20` numarası yeniden kullanılmaz. Kapanışı ayrı, repository-wide bir governance kararını gerektirir; OFFICE workstream'i tarafından tek başına yönlendirilemez.
