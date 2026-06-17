# PR-3: ClientStatement + ClientStatementLine — Uygulama Planı (PLAN-ONLY, kısa)

> **Durum:** PR-3 uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** PR-1 (#155) + PR-2 (#156) MERGED → main `654d681`, migrate up-to-date. ✅
> **Kaynak:** [client-finance-approval-center-phase2-plan.md](client-finance-approval-center-phase2-plan.md) (§2, K-S1/K-I1/K-D1)

## 0. En kritik kural — ekstre = FİNANSAL BELGE, immutable snapshot
Ekstre üretildiği andaki finansal durumu **dondurur**. *"Sonradan hesaplar değişti, eski ekstre de değişsin"* **kesinlikle YASAK.** Eski ekstre eski haliyle kalır. Düzeltme = **yeni** statement + `supersededById`; eskisi `SUPERSEDED` olur ama içeriği değişmez.

## 1. Snapshot üretim zamanı + para kaynağı (çift-sayım önleme)
**Kanıt (kod):** `ExpenseRequest.recordPayment` → `CaseBalanceService.credit` → `BalanceLedger` CREDIT. Yani müvekkil ödemesi (ExpensePayment) ve avukat-karşıladı **zaten BalanceLedger'a** düşüyor.
→ **Sonuç (M3-1):** runningBalance'ın **TEK kanonik kaynağı `BalanceLedger`** (CREDIT/DEBIT). `ExpenseRequest` (talep) ve `ExpensePayment` (ödeme) satırları **bilgi amaçlı** (debit=credit=0), çünkü para zaten BalanceLedger'da. Böylece çift-sayım olmaz (anti-mud "tek kaynak" kuralı).

- **Üretim:** `POST` ile dönem (periodStart/End) verilir; servis o an `BalanceLedger` (para) + opsiyonel `ExpenseRequest`/`ExpensePayment` (bilgi) kayıtlarını okuyup **tek transaction**'da statement + tüm satırları yazar. Sonrası okunmaz/yeniden hesaplanmaz.
- **openingBalance:** `periodStart` ÖNCESİ tüm BalanceLedger hareketlerinin toplamı (devreden). **closingBalance:** opening + dönem-içi net. Snapshot anında hesaplanır, dondurulur.

## 2. Model: `ClientStatement` (başlık — immutable)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `caseId` | `String` | FK → `Case` (onDelete: **Restrict**) |
| `clientId` | `String` | FK → `Client` (onDelete: **Restrict**) |
| `periodStart` / `periodEnd` | `DateTime` | dönem (ikisi de zorunlu — M3-3) |
| `openingBalance` / `closingBalance` | `Decimal @db.Decimal(15,2)` | snapshot (M3-4: finans hattıyla aynı tip) |
| `currency` | `String @default("TRY")` | |
| `status` | `ClientStatementStatus @default(ACTIVE)` | `ACTIVE \| SUPERSEDED \| VOID` |
| `supersededById` | `String?` | yerine geçen statement id (self-ref, FK YOK — gevşek) |
| `note` | `String?` | |
| `generatedById` | `String` | üreten personel (plain string) |
| `createdAt` | `DateTime @default(now())` | **`updatedAt` YOK** (immutable) |
| `lines` | `ClientStatementLine[]` | |

> `updatedAt` **bilinçli yok** — başlık immutable. Yalnız `status`/`supersededById` tek-seferlik supersede damgası alır (içerik değil).

## 3. Model: `ClientStatementLine` (satır — immutable snapshot)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `statementId` | `String` | FK → `ClientStatement` (onDelete: **Cascade** — satır başlığa ait) |
| `lineDate` | `DateTime` | hareket/kayıt tarihi |
| `lineType` | `ClientStatementLineType` | aşağıda |
| `refType` | `String?` | kaynak model adı: `ExpenseRequest`/`ExpensePayment`/`BalanceLedger` |
| `refId` | `String?` | kaynak kayıt id — **snapshot anındaki**; sonradan kaynak değişse/silinse satır SABİT |
| `debit` / `credit` | `Decimal @db.Decimal(15,2) @default(0)` | yalnız para-hareketi satırlarında dolu |
| `runningBalance` | `Decimal @db.Decimal(15,2)` | satır sonrası bakiye (BalanceLedger sırasına göre) |
| `note` | `String?` | |
| `createdAt` | `DateTime @default(now())` | **update/delete YOK** |

### Enum'lar (yeni)
- `ClientStatementStatus { ACTIVE, SUPERSEDED, VOID }`
- `ClientStatementLineType { ADVANCE_CREDIT, CLIENT_PAYMENT, EXPENSE_ACTUAL, EXPENSE_REQUESTED, REFUND, ADJUST }`
  - Para hareketi (runningBalance'ı oynatır): `ADVANCE_CREDIT`/`CLIENT_PAYMENT`/`REFUND` (credit), `EXPENSE_ACTUAL` (debit), `ADJUST` (±). Kaynak: BalanceLedger.
  - Bilgi amaçlı (debit=credit=0, bakiyeyi oynatmaz): `EXPENSE_REQUESTED`. Kaynak: ExpenseRequest.

## 4. refType/refId snapshot davranışı
- Satır, kaynağına **gevşek** bağlanır: `refType` + `refId` **scalar** (FK YOK). Kaynak kayıt sonradan değişse, silinse, supersede olsa bile satır **aynen kalır** (tarihsel doğruluk = finansal belge ilkesi).
- Bu yüzden satırdan kaynağa **Restrict gerekmez** (snapshot bağımsız). Restrict yalnız `Case`/`Client` başlık FK'lerinde.

## 5. Supersede lifecycle
```
ACTIVE ──supersede──► SUPERSEDED   (yeni statement üretilir; eskisi supersededById ile bağlanır)
ACTIVE ──void───────► VOID         (geçersiz işaretlenir; içerik yine değişmez)
```
- Satır/başlık **hiç update edilmez**; düzeltme yalnız yeni ACTIVE statement üretip eskisini SUPERSEDED yapmakla olur.
- Liste default `ACTIVE`; SUPERSEDED/VOID ayrı görünümde (denetim izi).

## 6. onDelete (K-D1 hattı)
- `caseId` / `clientId` → **Restrict** (finansal belge; Case/Client silinse de ekstre kaybolmamalı; PR-1/PR-2 ile tutarlı).
- `ClientStatementLine → ClientStatement` → **Cascade** (satır başlığa ait; başlık silinmezse sorun yok — zaten silme yok).

## 7. Tenant guard
- `tenantId` scalar+index; tüm okuma/yazma tenant filtreli.
- Üretimde `caseId`+`clientId` aynı tenant doğrulanır; kaynak kayıtlar (BalanceLedger/ExpenseRequest/ExpensePayment) **yalnız aynı tenant+case** sorgulanır.
- `tenantId`/`userId` `CurrentUser`'dan.

## 8. Immutability nerede (K-I1)
- Şema: `updatedAt` yok; satır update/delete yok.
- Servis: üretim tek transaction; **update/delete metodu SUNULMAZ**; yalnız `generate` + `supersede` + `void` + read.
- Endpoint: içerik **PATCH/PUT/DELETE route YOK**.
- DB-trigger zorlama → **backlog** (M3-2: DO-NOW servis+endpoint yeterli).

## 9. Endpoint'ler (TARİF — kod yok)
| Method | Path | Gövde | Not |
|---|---|---|---|
| POST | `/client-statements/case/:caseId` | `{ clientId, periodStart, periodEnd, note? }` | snapshot üret (ACTIVE) |
| POST | `/client-statements/:id/supersede` | `{ periodStart, periodEnd, note? }` | yeni üret + eskisini SUPERSEDED |
| POST | `/client-statements/:id/void` | `{ note? }` | VOID |
| GET | `/client-statements/case/:caseId` | `?status=ACTIVE` | liste (default ACTIVE) |
| GET | `/client-statements/:id` | — | başlık + satırlar |

> İçerik PATCH/DELETE yok. PDF export → **PR/Faz sonrası** (mevcut export deseni), bu PR'da yok.

## 10. Test planı
**Unit:** snapshot üretimi doğru `openingBalance`/`runningBalance`/`closingBalance` (BalanceLedger sırası) · EXPENSE_REQUESTED satırı bakiyeyi **oynatmaz** (debit=credit=0) · çift-sayım yok (ödeme yalnız BalanceLedger CREDIT olarak, ExpensePayment bilgi satırı) · supersede zinciri (eski SUPERSEDED + supersededById) · void · cross-tenant reddi · servis update/delete **yok**.
**E2e (canlı DB):** izole throwaway Case+Client + BalanceLedger CREDIT/DEBIT kayıtları → generate → satır/bakiye doğrula → **kaynak BalanceLedger'ı değiştir/sil → eski statement satırı SABİT** (immutability çekirdek testi) → supersede → list(ACTIVE) eskisini göstermez · **Restrict** (statement varken Case/Client delete reddi) · tenant izolasyonu. Temizlenir.
**Negatif:** PATCH/DELETE route yok.

## 11. Migration / rollback
- Additive: 2 tablo + 2 enum + `Case`/`Client`'a ORM geri-relation. Risk **düşük**. Ad: `add_client_statement`.
- `migrate diff`'teki alakasız `IcrabotTimelineEntry` DROP INDEX **dahil edilmez** (PR-1/2 drift).
- Rollback: bağımsız modül `client-statement` + bağımsız tablolar → tek PR revert; mevcut hat etkilenmez.

## 12. Bu PR'da YAPILMAYACAKLAR
Collection/TBK100 YOK · mail YOK · frontend YOK · portal YOK · otomatik mahsup YOK · PDF export YOK · müvekkil-global (cross-case) ekstre YOK (dosya bazlı).

## 13. Micro-kararlar (kodlamadan önce)
- **M3-1** runningBalance kaynağı = **yalnız BalanceLedger** (ExpenseRequest/ExpensePayment bilgi satırı). → öneri: **evet** (çift-sayım önler; kanıt §1).
- **M3-2** Immutability DB-trigger mı, servis-level mi? → öneri: **servis+endpoint** (DB-trigger backlog).
- **M3-4** Tutar tipi = **Decimal(15,2)** (finans hattıyla aynı; Collection/TBK100'ün bigint-cents dünyası DEĞİL, o kapsam dışı). → öneri: **Decimal(15,2)**.
- **M3-5** EXPENSE_REQUESTED satırları ekstreye dahil mi, yoksa yalnız para hareketleri mi? → öneri: **dahil ama bilgi amaçlı** (debit=credit=0); istenirse `?includeRequests=false` ile kapatılır.

> Onaylarsan (M3-1/2/4/5 dahil) PR-3'ü plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
