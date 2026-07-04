# WP-4c-0 — Phase 0: Permission Enforcement Inventory / Audit

> **Durum:** Envanter / audit (docs-only). **Kod YOK · permission check YOK · migration YOK · schema YOK · UI YOK ·
> davranış değişikliği YOK.** Yalnız mevcut yetkilendirme yüzeylerini haritalar.
> **Bağlam:** WP-4b kararının ([`wp4b-permission-enforcement-decision.md`](./wp4b-permission-enforcement-decision.md))
> Phase 0 adımı. WP-4a current-state haritasına dayanır.
> **Yöntem:** 4-grup read-only endpoint taraması (case+task · staff/user/lawyer+office · reports+finance ·
> audit/escalation/auth), **170 endpoint satırı**. **Ön sürüm:** origin/main `2beb032`.

---

## 1. Kısa hüküm

- **170 endpoint'in 140'ı `TENANT_ONLY`** — yani tek koruma tenant-scoping (JwtAuthGuard + tenantId). Tenant İÇİNDE
  yetki ayrımı YOK: kimliği doğrulanmış herhangi bir kullanıcı bu işlemleri yapabilir.
- **12 `DECORATIVE_ONLY`** — saklanan ama enforce edilmeyen izin alanları (UserRole, CaseStaff canEdit/canApprove/canView,
  CaseLawyer.casePermissions, Task closure alanları, responsible* alanları query-düzeyinde kullanılır ama erişim kapısı değil).
- **10 `HARD_LEGAL_GUARD_EXISTS` + 6 legal-hard-guard satırı** — hukuki sıfat zaten servis düzeyinde korunuyor
  (CaseLawyer.isResponsible → yalnız Lawyer, ASSIGN-4b tam-1-sorumlu). Bunlar gün-1 sert kalmalı.
- **2 `CPE_GUARDED`** (expense finalize APPROVE_EXPENSE · expense payment RECORD_COLLECTION) — gerçek capability-policy.
- **3 `NO_EXPLICIT_PERMISSION` + 2 `UNKNOWN_NEEDS_REVIEW`** — auth guard'ı hiç olmayan/şüpheli uçlar (güvenlik dikkati).
- **Güvenlik-kritik (acil aday):** `PUT /office/smtp-settings` ve `/office/sms-settings` herhangi bir kullanıcı
  tarafından değiştirilebilir (kimlik bilgileri); `POST /cases/suggest-type` ve `/payment-instructions/purposes*`
  auth guard'sız.
- **Faz dağılımı:** PHASE_0=96 · PHASE_1=20 · PHASE_2_WARN=37 · PHASE_3_HARD=12 · LEGAL_HARD_GUARD_NOW=3 · DO_NOT_ENFORCE=2.

> **Davranış değişmedi.** Bu yalnız haritadır; enforcement WP-4d+ ile fazlı gelecek.

## 2. Methodology

4 paralel read-only ajan, controller grubu başına tüm HTTP uçlarını tarayıp her biri için: method+path · işlem ·
mevcut guard · dokunulan stored permission alanı · `enforcementStatus` · önerilen permission leaf + scope ·
legal-hard-guard? · phase önerisi · not üretti. Sınıflandırma kuralları WP-4b'ye göre (tenant-scope ≠ enforcement;
CPE = capability-policy, RBAC değil; stored-but-not-checked = decorative). Toplam 170 satır; aşağıda **aktif/aksiyon
gerektiren** satırlar tam, rutin `TENANT_ONLY` satırlar grup-özeti olarak verilir.

## 3. Existing authorization layers (özet)

1. **Tenant-scoping** (JwtAuthGuard + tenantId) — 140/170 uçta TEK koruma. Enforcement DEĞİL.
2. **CPE capability-policy** (CpeRequiredGuard) — 2 uçta (expense finalize/payment). RBAC değil.
3. **Hardcoded role check** — `GET /reports/task-performance` yalnız `role==='ADMIN'` (controller'da elle).
4. **Servis-düzeyi legal guard** — CaseLawyer.isResponsible = Lawyer + ASSIGN-4b (tam 1 sorumlu). Gerçek + korunmalı.
5. **Break-glass/diagnostics guard'ları** (InternalOpsGuard/DiagnosticsRBACGuard/BreakGlass) — yalnız internal-ops.
6. **Dekoratif alanlar** — saklanan ama okunmayan izinler (bkz. §5).

## 4. Endpoint/service inventory — aktif (aksiyon gerektiren) satırlar

| ID | Endpoint | İşlem | Current guard | Stored perm field | Status | Proposed perm | Scope | Legal? | Phase |
|---|---|---|---|---|---|---|---|---|---|
| case-003 | GET /cases/responsible-candidates | aday liste | tenant | Lawyer.canBeResponsible/isActive | DECORATIVE_ONLY | cases.view | OFFICE | – | P0 |
| case-004 | GET /cases/:id/responsible-person | owner oku | tenant | responsibleLawyerId/StaffId/sorumluPersonel | DECORATIVE_ONLY | cases.view | OWN | – | P0 |
| case-005 | GET /cases/:id/responsibility-at | temporal sorumluluk | tenant | AuditLog metadata | DECORATIVE_ONLY | cases.viewResponsibilityHistory | OWN | – | P0 |
| case-006 | PATCH /cases/:id/responsible-person | owner ata/değiştir | tenant | responsibleLawyerId/StaffId | DECORATIVE_ONLY | cases.assignOperationOwner | OWN | – | P2 |
| case-013 | POST /cases/suggest-type | tip öner (OCR) | **YOK** | – | NO_EXPLICIT_PERMISSION | NEW:cases.classifyDocument | – | P0 |
| case-011 | DELETE /cases/:id | dosya sil | tenant | – | TENANT_ONLY | cases.delete | OWN | – | **P3** |
| case-014 | POST /cases/batch-update | toplu güncelle | tenant | – | TENANT_ONLY | cases.update | OFFICE | – | **P3** |
| case-023 | POST /cases/:id/lawyers | avukat ekle | tenant+service | CaseLawyer.isResponsible | DECORATIVE_ONLY | cases.update | OWN | **EVET** | LEGAL_NOW |
| case-024 | DELETE /cases/:id/lawyers/:id | avukat çıkar | tenant+service | CaseLawyer.isResponsible | DECORATIVE_ONLY | cases.update | OWN | **EVET** | LEGAL_NOW |
| case-025 | PATCH /cases/:id/lawyers/:id | avukat rol/imza/perm | tenant+service | CaseLawyer.role/canSign/isResponsible/**casePermissions** | DECORATIVE_ONLY | cases.update | OWN | **EVET** | LEGAL_NOW |
| case-027 | POST /cases/:id/staff | personel ekle | tenant | StaffMember.isActive | DECORATIVE_ONLY | cases.update | OWN | – | P1 |
| case-029 | PATCH /cases/:id/staff/:id | personel rol/perm | tenant+wl | CaseStaff.**canEdit/canApprove/canView** | DECORATIVE_ONLY | cases.update | OWN | – | P1 |
| case-033 | DELETE /cases/:id/dues/:id | kalem sil | tenant | – | TENANT_ONLY | finance.manage | OWN | – | **P3** |
| case-038 | DELETE /cases/:id/collections/:id | tahsilat sil | tenant | – | TENANT_ONLY | finance.manage | OWN | – | **P3** |
| task-004 | PUT /tasks/:id | görev güncelle/kapat | tenant | Task.completedByUserId/resolutionType | DECORATIVE_ONLY | tasks.assign | OWN | – | P1 |
| task-005 | DELETE /tasks/:id | görev sil | tenant | – | TENANT_ONLY | tasks.view→NEW:tasks.delete? | OWN | – | **P3** |
| user_01 | GET /users | kullanıcı liste | tenant | **UserRole** (okunmuyor) | DECORATIVE_ONLY | staff.view | TEAM | – | P1 |
| rep_003 | GET /reports/personel | personel raporu | tenant | responsible*/sorumluPersonelId | DECORATIVE_ONLY | reports.view | TEAM | – | P0 |
| rep_004 | GET /reports/task-performance | performans raporu | **role==='ADMIN' hardcoded** | – | HARD_LEGAL_GUARD_EXISTS | reports.view | OFFICE | – | P1 |
| office_07 | PUT /office/smtp-settings | SMTP kimlik | tenant | Office.smtp* | TENANT_ONLY | office.manageSettings | OFFICE | – | **P3 (acil)** |
| office_09 | PUT /office/sms-settings | SMS kimlik | tenant | Office.sms* | TENANT_ONLY | office.manageSettings | OFFICE | – | **P3 (acil)** |
| fin_043 | POST /expense-requests/:id/finalize | masraf finalize | **CPE APPROVE_EXPENSE** | – | CPE_GUARDED | finance.manage | ASSIGNED | – | **P3** |
| fin_044 | POST /expense-requests/:id/payment | masraf ödeme | **CPE RECORD_COLLECTION** | – | CPE_GUARDED | finance.manage | ASSIGNED | – | **P3** |
| fin_063 | GET /payment-instructions/purposes | amaç metadata | **YOK** | – | UNKNOWN_NEEDS_REVIEW | finance.view | ALL | – | P1 |
| fin_064 | GET /payment-instructions/purposes-by-payer | amaç metadata | **YOK** | – | UNKNOWN_NEEDS_REVIEW | finance.view | ALL | – | P1 |
| auth-register | POST /auth/register | kayıt | RateLimit (public) | – | NO_EXPLICIT_PERMISSION | – | – | DO_NOT_ENFORCE |
| auth-login | POST /auth/login | giriş | RateLimit | user.role | NO_EXPLICIT_PERMISSION | – | – | DO_NOT_ENFORCE |
| escalation-run | POST /escalation/run | eskalasyon tetik | tenant (auth) | – | TENANT_ONLY | NEW:office.runEscalation? | OFFICE | – | P2 |

### Rutin `TENANT_ONLY` satırlar (grup-özeti; 140 satırın çoğunluğu)

| Grup | Tipik uçlar | Pattern | Önerilen leaf / scope | Phase |
|---|---|---|---|---|
| case (read) | GET /cases, /:id, /stats, /notes, /lawyers, /staff, /dues, /collections, /finance-summary, /calculation-summary | tenant-only read | `cases.view`/`finance.view`/`reports.view` @ OWN/OFFICE | P0 |
| case (write) | POST /cases, PUT/PATCH /cases/:id, dues/collections create/update | tenant-only write | `cases.create`/`cases.update`/`finance.manage` @ OWN/OFFICE | P2 |
| task | GET/POST /tasks, PUT /tasks/:id (assign/complete/reopen) | tenant-only | `tasks.view`/`create`/`assign`/`completeManual`/`reopen` @ OWN/ASSIGNED | P1–P2 |
| staff/user/lawyer | GET/POST/PUT staff·lawyer·user (CRUD, reorder) | tenant-only | `staff.view`/`staff.manage`/`office.manageUsers` @ TEAM/OFFICE | P1–P2 |
| office/settings | GET/PUT /office/* (ayarlar) | tenant-only | `office.manageSettings`/`manageUsers` @ OFFICE | P2 (creds P3) |
| reports | GET /reports/* + export | tenant-only | `reports.view`/`reports.export` @ TEAM/OFFICE | P0–P1 |
| finance | collection/payment/expense CRUD | tenant-only / CPE | `finance.view`/`finance.manage` @ ASSIGNED/OFFICE | P2–P3 |
| audit/escalation | GET audit, POST escalation/run | tenant-only | `audit.view` / NEW:office.runEscalation @ OFFICE | P1–P2 |

## 5. Decorative stored fields (stored but NOT enforced)

| Alan | Nerede | Durum |
|---|---|---|
| `UserRole` (ADMIN/USER/VIEWER) | User.role, JWT | saklanır, **kod kontrol etmez** (yalnız task-performance'ta hardcoded ADMIN) |
| `CaseStaff.canEdit/canApprove/canView` | PATCH /cases/:id/staff/:id | yazılır, **erişimde okunmaz** |
| `CaseLawyer.casePermissions` (JSON) + `permissionSource` | PATCH /cases/:id/lawyers/:id | yazılır, **enforce edilmez** ("future grant model") |
| `StaffMember` izin bool'ları (canCreateCase…) | staff CRUD | saklanır, **gate yok** |
| `Lawyer.defaultPermissions` + canSign/permissionsLocked | lawyer CRUD | saklanır, **gate yok** (canSign↔hasSignatureAuthority sync var ama erişim gate'i değil) |
| `Task.completedByUserId/resolutionType` | PUT /tasks/:id | audit amaçlı (PR-PERF-1), erişim gate'i değil |
| `responsibleLawyerId/StaffId`, `canBeResponsible`, `isActive` | candidates/owner | query-düzeyi filtre, **permission gate değil** |

> Bu alanlar WP-4b kararına göre **ya enforce edilecek (WP-4d+) ya da WP-4g cleanup'ta düşürülecek.**

## 6. CPE guarded operations

- `POST /expense-requests/:id/finalize` → `@CpeRequired(APPROVE_EXPENSE, caseIdFromExpenseParam)` — HIGH risk.
- `POST /expense-requests/:id/payment` → `@CpeRequired(RECORD_COLLECTION, caseIdFromExpenseParam)` — MEDIUM risk.

Bunlar gerçek capability-policy kapılarıdır; permission tree bunları **fact ile besler**, yeniden yazmaz.
(Diğer yüksek-riskli finans kısayolları — ör. fee/court payment instruction — CPE-dışı; CPE'ye alınması önerilir.)

## 7. Tenant-only operations

140/170 uç yalnız tenant-scoped. Bunlar permission tree'nin asıl gövdesidir: çoğu read `@OWN/OFFICE`, write `@OWN`,
toplu/silme `@OFFICE` + P3. Hiçbiri bugün rol/yetki ayrımı yapmaz.

## 8. Legal hard guard candidates

| Uç | Hukuki kural | Mevcut durum |
|---|---|---|
| POST/DELETE/PATCH /cases/:id/lawyers[/:id] | `isResponsible=RESPONSIBLE` → yalnız Lawyer; ASSIGN-4b tam-1-sorumlu | **servis düzeyinde MEVCUT** → gün-1 sert (LEGAL_HARD_GUARD_NOW) |
| (gelecek) hukuki review / sign-off | yalnız avukat | henüz uç yok; eklenince legal-gated |
| cases.changeLegalResponsibleLawyer (leaf) | yalnız avukat | leaf + legal guard çift-kapı |

> **Personel Dosya Operasyon Sorumlusu olabilir (responsibleStaffId meşru); Hukuki Sorumlu Avukat OLAMAZ.** Bu guard
> permission tree ile override edilemez.

## 9. Proposed permission leaf map (özet)

WP-4b 23-yaprak ağacı yeterli; envanterde **2 yeni aday** doğdu (öneri, zorunlu değil):
- `NEW: cases.classifyDocument` (suggest-type/OCR yardımcı uçları)
- `NEW: tasks.delete` (DELETE /tasks/:id şu an `tasks.view`'a düşüyor — silme için ayrı leaf mantıklı)
- (değerlendir) `cases.syncUYAP`, `office.runEscalation` — sistem/bakım uçları için.

Geri kalan tüm uçlar mevcut 23 yaprağa eşlendi (bkz. §4).

## 10. Scope recommendations

- **OWN/ASSIGNED:** dosya-bağlı read/write (cases.view/update, tasks.*) — kullanıcının atandığı dosyalar.
- **TEAM:** personel/rapor listeleri (staff.view, reports.view).
- **OFFICE:** toplu işlemler, ayarlar, owner ataması, office.* (manageUsers/Roles/Settings).
- **ALL:** yalnız public/metadata (gözden geçirilecek fin_063/064) veya sistem.

## 11. Phase 1 diagnostics plan

- Salt-okuma diagnostics endpoint/report: her istek için "bu işlem ileride hangi capability'yi gerektirecek + kullanıcı
  buna sahip mi?" hesapla, **block etmeden** raporla. P1 işaretli ~20 uç + tüm P2/P3 adayları kapsanır.
- Çıktı: "etkilenecek işlem sayısı" raporu (WP-4b migration ön-koşulu).

## 12. Phase 2 warn-only plan

- 37 P2 uç (çoğu case/task/finance write): capability eksikse işlem GEÇER + `PERMISSION_WOULD_DENY` audit.
- Amaç: gerçek kullanım verisiyle yanlış-pozitifleri görmek (hard enforce öncesi).

## 13. Phase 3 hard enforcement candidates

- **Acil/güvenlik:** `PUT /office/smtp-settings`, `PUT /office/sms-settings` (kimlik bilgileri — herkes değiştirebilir).
- **Geri-alınamaz mutasyonlar:** DELETE /cases/:id, POST /cases/batch-update, DELETE dues/collections, DELETE /tasks/:id.
- **Finans CPE:** expense finalize/payment (zaten CPE; permission tree ile birleştir).
- **Legal (gün-1):** lawyers add/remove/update (LEGAL_HARD_GUARD_NOW).

## 14. Risks / open questions

1. **Güvenlik (yüksek):** SMTP/SMS ayar uçları herhangi bir kullanıcıya açık → kimlik bilgisi sızması/değişimi riski.
   Permission enforce edilene kadar açık kalır (bu PR davranış değiştirmez) — WP-4d/f'de **ilk** ele alınmalı.
2. **Auth guard eksikliği:** `POST /cases/suggest-type` ve `/payment-instructions/purposes*` guard'sız — kasıtlı mı
   (public metadata) yoksa atlanmış mı? **Doğrulanmalı** (UNKNOWN_NEEDS_REVIEW).
3. **task-performance ADMIN hardcoded:** tek gerçek rol-check; tree'ye taşınınca tutarlı olur.
4. **casePermissions/CaseStaff perms:** "future grant model" olarak yazılıyor ama enforce edilmiyor → WP-4g'de
   enforce-or-drop kararı.
5. **Yeni leaf'ler (classifyDocument/tasks.delete):** ağaca eklensin mi, yoksa mevcut leaf'e mi düşsün?

## 15. Non-goals

- Kod enforcement / permission check YOK · migration YOK · schema YOK · UI / permission tree ekranı YOK · role-template
  uygulaması YOK · davranış değişikliği YOK · timeline UI · balance/shadow-display · staff capability matrix · legal
  review/sign-off implementasyonu YOK.

## 16. Next PR plan

- **WP-4c-1 — Phase 1 diagnostics (kod):** salt-okuma diagnostics endpoint/report (block yok; `PERMISSION_WOULD_DENY`
  henüz değil — yalnız "gerektirir mi + var mı" raporu). Bu envanter (WP-4c-0) merge edilmeden başlanmaz.
- Sonra WP-4d (warn-only guard) → WP-4e (hard, güvenlik-kritik uçlardan başlayarak) → WP-4g (decorative cleanup).
- **Timeline (WP-1d-4c):** backend-gated; WP-4 enforcement sonrası.
