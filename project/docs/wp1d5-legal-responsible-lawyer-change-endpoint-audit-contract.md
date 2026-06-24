# WP-1d-5-3 — Legal Responsible Lawyer Change Endpoint + Audit Contract

> **Tür:** DOCS-ONLY endpoint + audit sözleşmesi. **Kod YOK · endpoint impl YOK · controller/service değişikliği YOK · UI YOK · mutation impl YOK · migration YOK · schema YOK · audit-write impl YOK · full RBAC YOK · permission store YOK · role template UI YOK · Codex domaini YOK.**
> **Tarih:** 2026-06-25 · **Base:** origin/main `1b84257` · **Kaynak:** #470 contract · #471 matrix · #472 product/legal decisions.
> **Codex (girilmez):** NAFAKA / scheduler / DueType / balance / computeBalance / cutover / tahsil / payment-allocation / due-generation / financial-ledger.

## 1. Purpose

#472'deki **D2** (hukuki sorumlu avukat değişimi izinli, ama "devir" değil) + **D3** (birinci-sınıf endpoint gerekli) kararlarını **endpoint + audit sözleşmesine** çevirir. Bu doküman **implementation DEĞİL**; semantic contract'ı kilitler. Kod ayrı, onaylı gate'te (WP-1d-5-4) yazılır.

> **Kanonik cümle:** "Hukuki sorumlu avukat **devredilmez**; hukuki sorumlu avukat **kaydı kurallı şekilde değiştirilir**."

## 2. Baseline and Decisions

- **Legal responsible lawyer** = `CaseLawyer.isResponsible` (yapısal yalnız Lawyer; staff olamaz). App-layer **tam-1** invariant (`planResponsible`). Coupling (doğrulandı, `case.service.ts:1868`): **`isResponsible ⇔ role==='RESPONSIBLE'`** (`CaseLawyerRole` enum: RESPONSIBLE/ASSIGNED/ASSISTANT/INTERN).
- Bugün değişim **CaseLawyer CRUD yan-etkisi** (birinci-sınıf değil) → bu sözleşme birinci-sınıf action'ı tanımlar.
- **Operation owner** (`Case.responsibleLawyerId` XOR `responsibleStaffId`) ayrı eksen; bu action onu **değiştirmez**.
- **`LEGAL_RESPONSIBLE_MISSING` mevcut bir read-side warn/report sinyalidir** — legal-responsible **write action veya audit changeType DEĞİLDİR.** Bu gate yeni write audit contract'ı tasarlar ama implementation yapmaz; iki kavram **karıştırılmaz.**

## 3. Endpoint Candidate

```
PATCH /cases/:id/legal-responsible-lawyer
```

**Bu ad implementation örneği değil, contract adayıdır. Kod yazılmayacak.** Nihai route/method implementation gate'te mevcut backend pattern'larıyla kesinlenir.

## 4. Request Contract

```json
{ "lawyerId": "string", "reason": "string", "note": "string | optional" }
```

Kurallar:
- `lawyerId` **zorunlu.**
- `reason` **zorunlu**, trim sonrası boş olamaz.
- `note` opsiyonel.
- `effectiveAt` / `asOf` / backdate parametresi **YOK.** İlk sürümde custom effective date yok.
- **Etkin tarih = server-side audit timestamp** (changedAt).

## 5. Validation Contract

- case **aynı tenant** içinde bulunmalı (yoksa 404).
- actor **ADMIN** olmalı (değilse 403).
- target lawyer **aynı tenant** içinde bulunmalı.
- target lawyer **staff olamaz** (yapısal + açık ret).
- target lawyer **case'e bağlı mevcut `CaseLawyer` kaydı** olmalı; **ilk sürümde** case'e bağlı olmayan lawyer **otomatik eklenmez** (yoksa 404 TARGET_CASE_LAWYER_NOT_FOUND).
- mevcut **tam-1 responsible invariant doğrulanmalı**; mevcut responsible **yoksa veya birden fazlaysa işlem yapılmaz** (409 INVARIANT_VIOLATION; endpoint **kendiliğinden repair yapmaz**).
- target lawyer **zaten current responsible ise işlem yapılmaz** (409 ALREADY_CURRENT).
- `reason` zorunlu.

Açık no-op / hata kuralları:
- **Same current lawyer:** state değişmez · audit yazılmaz · önerilen `409 LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT`.
- **Invariant bozuk (none/multiple):** endpoint repair etmez · state değişmez · audit yazılmaz · önerilen `409 LEGAL_RESPONSIBLE_INVARIANT_VIOLATION`.

## 6. State Transition Contract

Başarılı değişiklikte:
- **eski** `CaseLawyer`: `isResponsible=false`, `role='ASSIGNED'` (coupling korunur).
- **yeni** `CaseLawyer`: `isResponsible=true`, `role='RESPONSIBLE'` (coupling korunur — `isResponsible ⇔ role==='RESPONSIBLE'`).
- **tam-1 invariant korunur.**
- **DEĞİŞMEZ:** `Case.responsibleLawyerId` / `responsibleStaffId` · `Case.sorumluPersonelId` · `CaseStaff.roleOnCase` · `Task.assigneeId` / `completedByUserId`.

Role notu (doğrulandı, tahmin değil): legal-responsible kaynağı **`CaseLawyer.isResponsible`'dır**; `role` ona **bağlı tutarlılık alanıdır** (kaynak değil). Mevcut helper/kod `isResponsible` ile `role`'ü birlikte günceller; bu sözleşme aynı coupling'i şart koşar.

## 7. Audit Contract

- **AuditLog tek otorite kalır. Yeni audit store/table YOK.**
- **Önerilen changeType:** `LEGAL_RESPONSIBLE_LAWYER_CHANGED`. *(Nihai enum/name implementation gate'te mevcut AuditLog changeType pattern'larına göre kesinlenir; `LEGAL_RESPONSIBLE_MISSING` ile KARIŞTIRILMAZ.)*
- **Audit metadata contract:**
```json
{
  "caseId": "string",
  "previousLawyerId": "string",
  "newLawyerId": "string",
  "reason": "string",
  "note": "string | optional",
  "source": "LEGAL_RESPONSIBLE_LAWYER_CHANGE_ENDPOINT"
}
```
- Gereksinimler:
  - actor `userId` **zorunlu**; tenant scope korunur.
  - previous/new değerler audit'te **açık** olmalı; `reason` audit metadata'da **bulunmalı**.
  - başarısız validation'da **audit yazılmaz**; same-current no-op'ta **yazılmaz**; invariant violation'da **yazılmaz**.
  - **başarıda audit + state transition AYNI transaction boundary içinde** olmalı. *(Not: mevcut owner-change audit best-effort/try-catch; legal-responsible değişimi hukuki ağırlığı nedeniyle transactional şart koşulur — implementation gate'te uygulanır.)*

## 8. Temporal History Contract

- Başarılı değişiklik `responsibility-history` endpoint'inde **Hukuki Sorumlu Avukat değişikliği** olarak görünmeli.
- **Confidence: `EVENT_CONFIRMED`** · **Label: "Audit kaydıyla doğrulandı".**
- `UNKNOWN_BEFORE_HORIZON` / `INFERRED_FROM_SNAPSHOT` **üretilmez** (bu explicit audit event'tir; `metadata.caseId` + açık changeType ile güvenilir okunur).
- **Sınır:** Bu gate `responsibility-history` reconstruction **kodunu değiştirmez.** Yalnız gelecekteki implementation'ın bu history contract'ına **uymasını** şart koşar (örn. yeni changeType'ın history servisinin legal-responsible yolunda EVENT_CONFIRMED üretmesi).

## 9. Authorization Contract

- İlk implementation için **ADMIN-only hard guard.**
- **Full RBAC açılmaz · permission store açılmaz · role template UI açılmaz** ([[wp4z-authorization-strand-closure-note]]).
- **Açık ayrım:** *tenant scoping = güvenlik sınırı* (hangi veriye erişilebilir); *ADMIN-only hard guard = yetki sınırı* (kim bu aksiyonu yapabilir). **Bunlar aynı şey değildir** ve birlikte uygulanır.

## 10. Response and Error Contract

**Önerilen başarılı response:**
```json
{ "data": { "caseId": "string", "previousLawyerId": "string", "newLawyerId": "string", "changedAt": "ISO timestamp", "auditLogId": "string" } }
```
Not: İsim çözümleme UI/API helper katmanında yapılabilir; **response ham id dönebilir, UI ham id GÖSTERMEMELİDİR.**

**Önerilen hata tablosu (semantic; exact HTTP/code naming implementation gate'te mevcut backend error pattern'larıyla kesinlenir):**

| Durum | Önerilen kod |
|---|---|
| Geçersiz payload | `400 INVALID_LEGAL_RESPONSIBLE_PAYLOAD` |
| reason eksik/boş | `400 LEGAL_RESPONSIBLE_REASON_REQUIRED` |
| actor ADMIN değil | `403 LEGAL_RESPONSIBLE_CHANGE_FORBIDDEN` |
| case yok (tenant) | `404 CASE_NOT_FOUND` |
| target case-lawyer yok | `404 TARGET_CASE_LAWYER_NOT_FOUND` |
| target zaten current | `409 LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT` |
| invariant none/multiple | `409 LEGAL_RESPONSIBLE_INVARIANT_VIOLATION` |

## 11. Transaction and Invariant Requirements

- State transition (eski demote + yeni promote) + audit **tek transaction boundary** içinde; kısmi başarı olmaz.
- **tam-1 invariant** işlem sonunda korunur; endpoint mevcut bozuk invariant'ı **onarmaz** (reddeder).
- `isResponsible ⇔ role==='RESPONSIBLE'` coupling korunur.
- Hata/no-op/violation yollarında **hiçbir yazma + hiçbir audit** olmaz.

## 12. Future Implementation Test Matrix

1. ADMIN target case lawyer seçince eski responsible demote, yeni responsible promote edilir.
2. Audit event `LEGAL_RESPONSIBLE_LAWYER_CHANGED` metadata ile yazılır.
3. Responsibility history olayı **EVENT_CONFIRMED** gösterir.
4. `reason` yoksa işlem reddedilir, audit yazılmaz.
5. target lawyer case'e bağlı değilse reddedilir (404).
6. target **staff olamaz** (ret).
7. target zaten current responsible ise **409 / no audit**.
8. mevcut invariant none/multiple ise işlem reddedilir, endpoint **repair yapmaz**.
9. non-admin reddedilir (403).
10. tenant isolation korunur (cross-tenant case/lawyer → ret).
11. operation owner alanları (`responsibleLawyerId`/`responsibleStaffId`) **değişmez**.
12. `sorumluPersonelId` **değişmez**.
13. `CaseStaff.roleOnCase` **değişmez**.
14. full RBAC / permission-store **gerektirmez** (yalnız ADMIN-only hard guard).

## 13. Explicit Non-Goals

endpoint kodu · service kodu · controller kodu · DTO kodu · test kodu · audit yazımı · DB migration · schema değişikliği · UI action · permission store · full RBAC · Codex domaini — **HİÇBİRİ YOK.**

## 14. Next Gates

**Implementation DEĞİL.** Sıradaki olası gate (yalnız ayrı, açık onayla):
- **WP-1d-5-4 — Legal Responsible Lawyer Change Backend Implementation** (kod gate'i) — **şimdi başlatılmaz.**
- Alternatif: **pause.**

Bu doküman merge edilse bile sonraki adım **otomatik code gate DEĞİLDİR.**

---

## DECISION

**`ENDPOINT_AUDIT_CONTRACT_READY`** — D2/D3 endpoint + audit + validation + state-transition + temporal + authz + error + test-matrix sözleşmesi kilitlendi (mevcut model + coupling **doğrulanarak**).

**`IMPLEMENTATION_STILL_BLOCKED_PENDING_SEPARATE_CODE_GATE`** — hiçbir kod/endpoint/migration/audit-write başlatılmaz; WP-1d-5-4 yalnız ayrı açık onayla.

**Kod yazılmadı.**
