# PR-1: ExpenseBlockReason — Uygulama Planı (PLAN-ONLY, kısa)

> **Durum:** PR-1 uygulama planı. **KOD YOK** — onaylanınca additive kodlanır.
> **Kaynak:** [client-finance-approval-center-phase2-plan.md](client-finance-approval-center-phase2-plan.md) · 6 karar KİLİTLİ (aşağıda).
> **Amaç:** "İşlem neden başlamadı?" sorusuna kalıcı, silinemez savunma kaydı. Örn: *"Masraf talep edildi, ödeme gelmedi, bu nedenle araç haczi başlatılmadı."*

## 0. Kilitli kararlar (bu PR'ı bağlar)
K-D1 **Restrict** · K-I1 servis-level immutability + PATCH/DELETE route YOK · K-M1 ayrı modül `expense-block-reason`. (K-A1/K-S1/K-AP1 → PR-2/PR-3, bu PR'da yok.)

## 1. Kapsam
**VAR:** ExpenseBlockReason modeli + 2 enum + migration + service + `POST create` + `POST resolve` + `POST cancel` + `GET case-level list` + testler + audit kuralı.
**YOK:** ClientApprovalRequest · ClientStatement · mail · frontend · ExpenseRequest state değişikliği · Collection/TBK100 · **otomatik işlem bloklama** (bu PR yalnız KAYIT tutar, hiçbir işlemi otomatik durdurmaz).

## 2. Model (final)
```
model ExpenseBlockReason {
  id               String  @id @default(cuid())
  tenantId         String                                   // scalar + index (Tenant relation YOK)
  caseId           String
  case             Case    @relation(fields: [caseId], references: [id], onDelete: Restrict)
  expenseRequestId String?
  expenseRequest   ExpenseRequest? @relation(fields: [expenseRequestId], references: [id], onDelete: Restrict)

  // ÇEKİRDEK (immutable — create sonrası DEĞİŞMEZ)
  blockedActionCode String                                  // örn. HACIZ_BASLAT, SATIS_TALEBI (serbest string — §7 micro-karar)
  reasonCode        ExpenseBlockReasonCode
  note              String?

  // LIFECYCLE (yalnız bunlar değişebilir)
  status       ExpenseBlockStatus @default(OPEN)
  createdById  String
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
  resolvedById String?
  cancelledAt  DateTime?
  cancelledById String?
  resolutionNote String?

  @@index([tenantId])
  @@index([caseId])
  @@index([expenseRequestId])
  @@index([status])
  @@index([createdAt])
}

enum ExpenseBlockReasonCode { PAYMENT_NOT_RECEIVED  APPROVAL_PENDING  INSUFFICIENT_ADVANCE  OTHER }
enum ExpenseBlockStatus     { OPEN  RESOLVED  CANCELLED }
```
> Not: `updatedAt` **yok** (çekirdek immutable; lifecycle alanları tek-seferlik damga). Senin ayrımın: resolve ve cancel **ayrı** zaman/kişi alanları.

## 3. Mevcut modellere dokunuş (TEK — ORM-only, DB kolonu üretmez)
- `Case` → `expenseBlockReasons ExpenseBlockReason[]` (geri-relation)
- `ExpenseRequest` → `blockReasons ExpenseBlockReason[]` (geri-relation)
- `Tenant`/`Client` → **dokunulmaz**.
> **onDelete=Restrict etkisi (kasıtlı):** açık/var olan blok kaydı varken o `Case` veya o `ExpenseRequest` **hard-delete edilemez** → savunma izi korunur. Case zaten cancel-only; bu, sessiz cascade-silmeyi DB seviyesinde de kapatır.

## 4. Migration
- İçerik: 1 yeni tablo + 2 yeni enum (additive; mevcut tabloya kolon eklemez). Geri-relation'lar SQL üretmez.
- Uygula: dev-apply (`migrate dev`), prod N/A (mevcut pratik). Migration adı: `add_expense_block_reason`.
- Risk: **Düşük** (additive). Tek dikkat: Restrict FK'ler — ileride Case/ExpenseRequest silme denemesi blok kaydı varsa hata verir (kasıtlı, §3).

## 5. Modül yapısı (NestJS — mevcut `expense-request`/`debtor` desenine birebir)
```
modules/expense-block-reason/
  expense-block-reason.module.ts
  expense-block-reason.controller.ts
  expense-block-reason.service.ts
  dto/create-expense-block-reason.dto.ts
  dto/resolve-expense-block-reason.dto.ts   (note?)
  dto/cancel-expense-block-reason.dto.ts    (note?)
  expense-block-reason.service.spec.ts
```

## 6. Service metotları (imza + kural; her birinde `/// <remarks> Çağrıldığı yerler:` — CLAUDE.md)
- `create(tenantId, caseId, dto, userId)` → OPEN kayıt. **Tenant guard:** caseId (ve verilirse expenseRequestId) aynı tenant'a mı — değilse 403/404. expenseRequestId verilirse o request caseId'ye mi ait — doğrula.
- `resolve(tenantId, id, userId, note?)` → yalnız `OPEN→RESOLVED`; resolvedAt/By set. OPEN değilse hata (idempotent değil, geçersiz geçiş reddi).
- `cancel(tenantId, id, userId, note?)` → yalnız `OPEN→CANCELLED`; cancelledAt/By set.
- `listByCase(tenantId, caseId, statusFilter?)` → default `OPEN`; tenant+case filtreli.
- **YOK:** `update`, `delete`, `patchContent` — hiç yazılmaz (immutability §8).

## 7. Validation
- `blockedActionCode`: zorunlu, non-empty string. **Micro-karar M-1:** şimdilik serbest string (kontrollü vocabulary yok); ileride enum'a alınabilir. *(Öneri: serbest string.)*
- `reasonCode`: enum zorunlu. `note`: opsiyonel. DTO'larda `whitelist`/`forbidNonWhitelisted` (mevcut global pipe deseni).

## 8. Immutability (servis + endpoint katmanı — K-I1)
- Çekirdek (`blockedActionCode/reasonCode/note/caseId/expenseRequestId`) yazıldıktan sonra **hiçbir metot değiştirmez**.
- **PATCH/PUT/DELETE route AÇILMAZ.** Yalnız create + resolve + cancel + list.
- Yanlış kayıt → `cancel` (silinmez).
- DB-level trigger zorunluluğu → **backlog** (bu PR'da değil).

## 9. Endpoint'ler (4)
| Method | Path | Gövde | Auth |
|---|---|---|---|
| POST | `/cases/:caseId/expense-block-reasons` | `{ blockedActionCode, reasonCode, note?, expenseRequestId? }` | JWT, tenant from CurrentUser |
| POST | `/expense-block-reasons/:id/resolve` | `{ note? }` | JWT |
| POST | `/expense-block-reasons/:id/cancel` | `{ note? }` | JWT |
| GET | `/cases/:caseId/expense-block-reasons` | `?status=OPEN` (default) | JWT |
> `tenantId`/`userId` **CurrentUser'dan**, body'den ASLA.

## 10. Testler
**Unit:** create→OPEN · resolve OPEN→RESOLVED (resolvedAt/By) · cancel OPEN→CANCELLED (cancelledAt/By) · **RESOLVED/CANCELLED üzerinde tekrar resolve/cancel reddi** (geçersiz geçiş) · çekirdek alanı değiştiren metot **yok** · cross-tenant caseId/expenseRequestId **reddi** · expenseRequestId başka case'e aitse **reddi**.
**E2e (canlı DB):** create→list(OPEN)→resolve→list(boş/closed) gerçek DB'de; Restrict FK doğrulaması (blok kayıt varken ilişkili silme denemesi hata).
**Negatif:** PATCH/DELETE route **bulunmamalı** (404/route-yok).

## 11. Impact scope (CLAUDE.md — kim/neyi etkiler)
- **Yeni** modül; mevcut çağrı yok → kıracak bir tüketici yok.
- Mevcut dosya diff'i: `schema.prisma` (yeni model+enum + Case/ExpenseRequest geri-relation), `app.module` (modül kaydı). `ExpenseRequest`/`CaseBalance`/`Collection` servisleri **değişmez**.
- Multitenant: korunur (tenantId + guard). Akış bozulmaz (additive, kimse çağırmıyor).

## 12. Rollback
- Bağımsız modül + bağımsız tablo → PR revert tek başına; mevcut hat etkilenmez.
- Migration geri alınırsa yalnız bu tablo+enum düşer (FK kolonları bu tabloda; mevcut tablolarda kolon yok).

## 13. Kodlamadan önce micro-kararlar
- **M-1** `blockedActionCode` serbest string mi enum mu? → öneri: **serbest string** (vocabulary olgunlaşınca enum).
- **M-2** Aynı (caseId, blockedActionCode, açık) için duplicate OPEN engellensin mi? → öneri: **engelleme yok** (soft; ileride bakılır), unique constraint koymuyoruz.

> Onaylarsan (ve M-1/M-2 seçimini verirsen) bu PR'ı plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
