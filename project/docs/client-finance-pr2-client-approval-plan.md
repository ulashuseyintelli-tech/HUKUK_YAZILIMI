# PR-2: ClientApprovalRequest + ClientApprovalEvent — Uygulama Planı (PLAN-ONLY, kısa)

> **Durum:** PR-2 uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** PR-1 (#155) MERGED → main `dc6ad42`, migrate up-to-date. ✅
> **Kaynak:** [client-finance-approval-center-phase2-plan.md](client-finance-approval-center-phase2-plan.md) (§1, K-A1/K-AP1/K-D1)

## 0. Çekirdek ayrım (en kritik)
`ClientApprovalRequest` bir **DEFTER**'dir: *"müvekkile ne gönderildi, ne zaman onaylandı/reddedildi?"*. **Karar motoru DEĞİL.**
- CPE (`policy-engine`) hâlâ tek **karar** otoritesi. Bu modül CPE'yi çağırmaz, CPE kararını değiştirmez.
- `ExpenseRequest.status` ve 9-state makinesi **DEĞİŞMEZ**.
- Bağ yalnız **gevşek/yumuşak**: `subjectType + subjectId + subjectLabel`. **Otomatik gate entegrasyonu YOK** (ileride CPE bu defteri OKUyabilir; bu PR'da yazılmaz).

## 1. Model: `ClientApprovalRequest`
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index (Tenant relation YOK) |
| `caseId` | `String` | FK → `Case` (onDelete: **Restrict**) |
| `clientId` | `String` | FK → `Client` (onDelete: **Restrict**) |
| `subjectType` | `ClientApprovalSubjectType` | `EXPENSE_REQUEST \| OPERATION \| OTHER` |
| `subjectId` | `String?` | **polimorfik — FK YOK** (K-AP1) |
| `subjectLabel` | `String?` | insan-okur etiket ("Haciz masrafı onayı") — FK join olmadığından görünürlük buradan |
| `status` | `ClientApprovalStatus @default(DRAFT)` | §3 makine |
| `channel` | `ClientApprovalChannel @default(EMAIL)` | `EMAIL \| PORTAL \| MANUAL` |
| `title` / `description` | `String?` | |
| `requestedById` | `String` | talep eden personel (plain string, FK yok — PR-1 deseni) |
| `sentAt` | `DateTime?` | |
| `decidedAt` | `DateTime?` | |
| `decision` | `ClientApprovalDecision?` | `APPROVE \| REJECT` (son karar; geçmiş event'te) |
| `decisionNote` | `String?` | |
| `expiresAt` | `DateTime?` | EXPIRED için |
| `createdAt` / `updatedAt` | konvansiyon | `updatedAt` yalnız state geçişinde değişir |
| `events` | `ClientApprovalEvent[]` | append-only alt-defter |

### Enum'lar (yeni — 4)
- `ClientApprovalSubjectType { EXPENSE_REQUEST, OPERATION, OTHER }`
- `ClientApprovalStatus { DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED }`
- `ClientApprovalChannel { EMAIL, PORTAL, MANUAL }`
- `ClientApprovalDecision { APPROVE, REJECT }`

### Index
`@@index([tenantId])` · `@@index([caseId])` · `@@index([clientId])` · `@@index([status])` · `@@index([subjectType, subjectId])` · `@@index([createdAt])`

## 2. Model: `ClientApprovalEvent` (append-only — K-A1)
Her state geçişinin/işleminin değişmez kaydı. Savunma izi: "kim, ne zaman, neyi gönderdi/onayladı."

| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `approvalRequestId` | `String` | FK → `ClientApprovalRequest` (onDelete: **Cascade** — alt-defter parent'a ait) |
| `eventType` | `ClientApprovalEventType` | `CREATED \| SENT \| APPROVED \| REJECTED \| CANCELLED \| EXPIRED` |
| `fromStatus` | `ClientApprovalStatus?` | geçiş öncesi |
| `toStatus` | `ClientApprovalStatus` | geçiş sonrası |
| `byUserId` | `String?` | işlemi yapan (sistem/expire için null olabilir) |
| `note` | `String?` | |
| `createdAt` | `DateTime @default(now())` | **update/delete YOK** |

- `ClientApprovalEventType { CREATED, SENT, APPROVED, REJECTED, CANCELLED, EXPIRED }`
- `tenantId` event'te **tutulmaz** (PR-1/ExpenseAuditLog deseni: alt-log parent üzerinden tenant-filtrelenir; sorgu daima parent guard'ından geçer).
- Index: `@@index([approvalRequestId])` · `@@index([createdAt])`

## 3. Durum makinesi + terminal değişmezlik
```
DRAFT ──send──► SENT ──decision(APPROVE)──► APPROVED   (terminal)
  │                │  ──decision(REJECT)───► REJECTED   (terminal)
  │                │  ──expire────────────► EXPIRED     (terminal)
  └──cancel──► CANCELLED (terminal)   SENT ──cancel──► CANCELLED (terminal)
```
- **Terminal:** APPROVED / REJECTED / EXPIRED / CANCELLED. Terminale ulaşınca **hiçbir geçiş yok**; `decision`/`decisionNote` üzerine yazılmaz. Düzeltme = **yeni** `ClientApprovalRequest` (eskisi olduğu gibi kalır).
- Geçersiz geçiş → `BadRequestException` (PR-1 deseni).
- **EXPIRED:** bu PR'da yalnız **açık/lazy** geçiş (explicit `expire` ya da okuma-anında kontrol). **Cron/otomatik tarama YOK** (backlog) — kapsamı dar tutmak için.
- Her başarılı geçiş **tek transaction**'da: request update + `ClientApprovalEvent` create.

## 4. Mevcut modellere dokunuş (ORM-only, DB kolonu üretmez)
- `Case` → `clientApprovalRequests ClientApprovalRequest[]`
- `Client` → `clientApprovalRequests ClientApprovalRequest[]`
- `ExpenseRequest`/`Tenant` → **dokunulmaz** (subjectId polimorfik, FK yok).

## 5. Tenant guard
- `tenantId` scalar+index; tüm okuma/yazma tenant filtreli (PR-1 `findOwned` deseni).
- `caseId` + `clientId` create'te aynı tenant'a mı doğrulanır.
- `subjectId`: **polimorfik, FK doğrulaması yok.** Yalnız `subjectType=EXPENSE_REQUEST` ise opsiyonel **soft** kontrol (var mı + aynı tenant+case) — bulunamazsa reddetmek yerine kabul (gevşek bağ korunur). *(Micro-karar M2-1: soft-validate EXPENSE_REQUEST mı, hiç doğrulama mı? Öneri: soft-validate.)*

## 6. Endpoint'ler (TARİF — kod yok)
| Method | Path | Gövde | Geçiş |
|---|---|---|---|
| POST | `/client-approvals/case/:caseId` | `{ clientId, subjectType, subjectId?, subjectLabel?, title?, description?, channel?, expiresAt? }` | → DRAFT |
| POST | `/client-approvals/:id/send` | `{ note? }` | DRAFT → SENT |
| POST | `/client-approvals/:id/decision` | `{ decision: APPROVE\|REJECT, note? }` | SENT → APPROVED/REJECTED |
| POST | `/client-approvals/:id/cancel` | `{ note? }` | DRAFT\|SENT → CANCELLED |
| POST | `/client-approvals/:id/expire` | `{ note? }` | SENT → EXPIRED (manuel) |
| GET | `/client-approvals/case/:caseId` | `?status=` | liste |
| GET | `/client-approvals/:id` | — | detay + events |

- `send` **mail GÖNDERMEZ** (mail kapsam dışı) — yalnız state + event + `sentAt`. Gerçek gönderim PR-5.
- İçerik **PATCH/PUT/DELETE route YOK** (immutability). Yalnız create + transition + read.
- `tenantId`/`userId` daima `CurrentUser`'dan.

## 7. Test planı
**Unit:** DRAFT→SENT→APPROVED · DRAFT→SENT→REJECTED · cancel (DRAFT & SENT) · expire (SENT) · **terminal sonrası her geçiş reddi** · her geçişte **ClientApprovalEvent yazıldı** (fromStatus/toStatus/byUserId doğru) · cross-tenant caseId/clientId reddi · polimorfik subjectId (FK yok, OPERATION tipinde subjectId serbest) · servis update/delete metodu **yok**.
**E2e (canlı DB):** izole throwaway Case+Client (PR-1 deseni) → create→send→decision→list→detay(events) gerçek DB'de; **Restrict FK** (açık approval varken Case/Client delete reddi); terminal-immutability; tenant izolasyonu. Test verisi temizlenir.
**Negatif:** PATCH/DELETE route bulunmamalı.

## 8. Migration / rollback
- Additive: 2 tablo + 4 enum + 2 ORM geri-relation. Risk **düşük**. Migration adı: `add_client_approval_request`.
- `migrate diff`'te yine alakasız `IcrabotTimelineEntry` DROP INDEX çıkarsa **dahil edilmez** (PR-1'deki drift).
- Rollback: bağımsız modül `client-approval` + bağımsız tablolar → tek PR revert; mevcut hat etkilenmez.

## 9. Bu PR'da YAPILMAYACAKLAR
ClientStatement YOK · mail GÖNDERİMİ YOK · frontend YOK · `ExpenseRequest` state değişikliği YOK · **CPE otomatik gate entegrasyonu YOK** · cron EXPIRED taraması YOK.

## 10. Micro-kararlar (kodlamadan önce)
- **M2-1** subjectId: `EXPENSE_REQUEST` tipinde soft-validate mı, hiç mi? → öneri: **soft-validate** (gevşek; bulunamazsa yine kabul).
- **M2-2** `expire` endpoint'i bu PR'a girsin mi, yoksa yalnız lazy-on-read mi? → öneri: **manuel `expire` endpoint** (basit, test edilebilir); cron backlog.

> Onaylarsan (M2-1/M2-2 dahil) PR-2'yi plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
