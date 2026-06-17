# Müvekkil Finans/Onay Merkezi — FAZ 2 Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca faz-içi parçalara bölünüp tek tek (plan→onay→additive kod→test→PR) uygulanır.
> **Tasarım kaynağı:** [client-finance-approval-center-design.md](client-finance-approval-center-design.md)
> **Kapsam:** Yalnız 3 additive yapı — `ClientApprovalRequest`, `ClientStatement`/`ClientStatementLine`, `ExpenseBlockReason`.

---

## 0. Sınır (değişmez)

**Korunacak — DOKUNULMAYACAK mevcut hat:**
- `ExpenseRequest` (schema:3194), `ExpenseRequestItem`, `ExpensePayment`, `ExpenseAuditLog`
- `CaseBalance` (4719) + `BalanceLedger` (4742) + `BalanceLedgerType` enum
- `ExpenseRequestStatus` 9-state enum — **değiştirilmeyecek** (yeni durum eklenmeyecek)
- `Collection` / `CollectionAllocation` / TBK100 / borçlu tahsilatı — **bu faza GİRMEYECEK**

**Faz 2'de mevcut modellere yapılacak TEK dokunuş:** yeni modellerin FK ilişkileri için **geri-relation (back-relation) dizileri** eklemek (Prisma şema-içi; **DB kolonu/migration üretmez** — FK kolonu yeni tablolarda durur). Detay §4.

---

## 1. Model: `ClientApprovalRequest` (+ opsiyonel `ClientApprovalEvent`)

**Amaç:** Müvekkil onayının **state'ini** kalıcı tutmak. CPE `APPROVE_EXPENSE` gate karar verir ama state saklamaz → onay zinciri ayrı kayıt olmalı.

### Alanlar
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | konvansiyon |
| `tenantId` | `String` | scalar + index (ExpenseRequest deseni; Tenant relation YOK → churn yok) |
| `caseId` | `String` | FK → `Case` (relation, onDelete §6) |
| `clientId` | `String` | FK → `Client` (relation, onDelete §6) |
| `subjectType` | `ClientApprovalSubjectType` | `EXPENSE_REQUEST \| OPERATION \| OTHER` |
| `subjectId` | `String?` | **polimorfik** — FK relation YOK (sadece scalar), gevşek bağ |
| `status` | `ClientApprovalStatus @default(DRAFT)` | §3 makine |
| `channel` | `ClientApprovalChannel @default(EMAIL)` | `EMAIL \| PORTAL \| MANUAL` |
| `title` / `description` | `String?` | ne onaylanıyor |
| `requestedById` | `String` | talep eden personel (User.id, scalar) |
| `sentAt` | `DateTime?` | müvekkile gidiş |
| `decidedAt` | `DateTime?` | karar anı |
| `decision` | `String?` | `APPROVE \| REJECT` (son karar; geçmiş event'te) |
| `decisionNote` | `String?` | gerekçe |
| `expiresAt` | `DateTime?` | EXPIRED tetiği |
| `createdAt` / `updatedAt` | konvansiyon | `updatedAt` yalnız state geçişinde değişir |

### Enum'lar (yeni)
- `ClientApprovalSubjectType { EXPENSE_REQUEST, OPERATION, OTHER }`
- `ClientApprovalStatus { DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED }`
- `ClientApprovalChannel { EMAIL, PORTAL, MANUAL }`

### Append-only / immutability
- Onay **kararı geri alınmaz**: APPROVED/REJECTED **terminal**. Yanlışsa → yeni `ClientApprovalRequest` (eski CANCELLED). Karar alanı üzerine yazılmaz.
- **Opsiyonel `ClientApprovalEvent` (KARAR K-A1):** her state geçişini append-only log'la (`ExpenseAuditLog` deseni: `approvalRequestId, fromStatus, toStatus, byUserId, note, createdAt`). Savunma izi için önerilir; yoksa geçiş geçmişi yalnız `updatedAt`'te kaybolur. **Öneri: ekle.**

### Index
`@@index([tenantId])` · `@@index([caseId])` · `@@index([clientId])` · `@@index([status])` · `@@index([subjectType, subjectId])` · `@@index([createdAt])`

---

## 2. Model: `ClientStatement` + `ClientStatementLine`

**Amaç:** Dosya bazlı müvekkil ekstresi **snapshot'ı**. Üretildiği andaki masraf/ödeme/bakiye durumunu dondurur; sonradan değişen kayıtlar **eski ekstreyi oynatmaz** (senin sert kararın: immutable savunma kaydı).

### `ClientStatement` (başlık)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `caseId` | `String` | FK → `Case` |
| `clientId` | `String` | FK → `Client` |
| `periodStart` / `periodEnd` | `DateTime` | ekstre dönemi |
| `openingBalance` / `closingBalance` | `Decimal @db.Decimal(15,2)` | snapshot |
| `currency` | `String @default("TRY")` | |
| `status` | `ClientStatementStatus @default(ACTIVE)` | `ACTIVE \| SUPERSEDED \| VOID` |
| `supersededById` | `String?` | yerine geçen ekstre id'si |
| `generatedById` | `String` | üreten personel |
| `createdAt` | `DateTime @default(now())` | **`updatedAt` YOK** (immutable; yalnız status/supersededById tek seferlik) |
| `lines` | `ClientStatementLine[]` | |

### `ClientStatementLine` (satır — immutable snapshot)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `statementId` | `String` | FK → `ClientStatement` (onDelete Cascade — satır başlığa ait) |
| `lineDate` | `DateTime` | hareket tarihi |
| `lineType` | `ClientStatementLineType` | `EXPENSE_REQUESTED \| EXPENSE_ACTUAL \| CLIENT_PAYMENT \| ADVANCE_CREDIT \| REFUND \| ADJUST` |
| `refType` | `String?` | kaynak model adı (ExpenseRequest/ExpensePayment/BalanceLedger) |
| `refId` | `String?` | kaynak kayıt id (snapshot anındaki) |
| `debit` / `credit` | `Decimal @db.Decimal(15,2) @default(0)` | |
| `runningBalance` | `Decimal @db.Decimal(15,2)` | satır sonrası bakiye |
| `note` | `String?` | |
| `createdAt` | `DateTime @default(now())` | **update/delete YOK** |

### Enum'lar (yeni)
- `ClientStatementStatus { ACTIVE, SUPERSEDED, VOID }`
- `ClientStatementLineType { EXPENSE_REQUESTED, EXPENSE_ACTUAL, CLIENT_PAYMENT, ADVANCE_CREDIT, REFUND, ADJUST }`

### Immutability
- Satırlar **yalnız üretim anında** yazılır (tek transaction). Sonradan UPDATE/DELETE **yok** (servis katmanı + endpoint katmanı kapatır; §7).
- Düzeltme = yeni `ClientStatement` üret, eskisini `SUPERSEDED` + `supersededById`. Eski snapshot **aynen durur**.
- `refId` snapshot'tır: kaynak kayıt sonradan değişse/silinse bile satır değeri sabit (tarihsel doğruluk).

### Index
`ClientStatement`: `@@index([tenantId])` · `@@index([caseId])` · `@@index([clientId])` · `@@index([status])` · `@@index([createdAt])`
`ClientStatementLine`: `@@index([statementId])` · `@@index([lineType])` · `@@index([lineDate])`

---

## 3. Model: `ExpenseBlockReason`

**Amaç:** "İşlem neden başlamadı?" sorusunu **görünür + kalıcı** kılmak. Örnek: *"Masraf talep edildi, ödeme gelmedi, bu nedenle araç haczi başlatılmadı."* — savunma kaydı, **silinmez**, lifecycle alır.

### Alanlar
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `caseId` | `String` | FK → `Case` |
| `expenseRequestId` | `String?` | FK → `ExpenseRequest` (opsiyonel — her blok masrafa bağlı olmayabilir) |
| `blockedActionCode` | `String` | yapılmayan işlem (örn. `HACIZ_BASLAT`, `SATIS_TALEBI`) |
| `reasonCode` | `ExpenseBlockReasonCode` | `PAYMENT_NOT_RECEIVED \| APPROVAL_PENDING \| INSUFFICIENT_ADVANCE \| OTHER` |
| `note` | `String?` | serbest açıklama |
| `status` | `ExpenseBlockStatus @default(OPEN)` | `OPEN \| RESOLVED \| CANCELLED` |
| `createdById` | `String` | kaydı açan |
| `createdAt` | `DateTime @default(now())` | |
| `resolvedAt` | `DateTime?` | ödeme/onay gelince |
| `resolvedById` | `String?` | |
| `resolutionNote` | `String?` | nasıl çözüldü |

### Enum'lar (yeni)
- `ExpenseBlockReasonCode { PAYMENT_NOT_RECEIVED, APPROVAL_PENDING, INSUFFICIENT_ADVANCE, OTHER }`
- `ExpenseBlockStatus { OPEN, RESOLVED, CANCELLED }`

### Lifecycle / immutability (senin kararın)
- **Silinmez.** Yalnız `OPEN → RESOLVED` veya `OPEN → CANCELLED` geçişi (+ `resolvedAt/By/Note`).
- `blockedActionCode` / `reasonCode` / `note` **değiştirilmez** (savunma çekirdeği). Düzeltme gerekiyorsa CANCELLED + yeni kayıt.
- Açık (`OPEN`) kayıtlar dosya ekranında görünür (operatör "neden bekliyor" görür).

### Index
`@@index([tenantId])` · `@@index([caseId])` · `@@index([expenseRequestId])` · `@@index([status])` · `@@index([createdAt])`

---

## 4. Mevcut modellere FK geri-relation eklemeleri (TEK dokunuş)

Prisma'da relation çift taraflıdır → yeni modeller `Case`/`Client`/`ExpenseRequest`'e relation kuruyorsa, o modellere **geri dizi** eklenir. **Bu alanlar DB kolonu DEĞİL** (FK kolonu yeni tablolarda); migration SQL'i yalnız yeni tabloları + yeni enum'ları yaratır.

- `Case` modeline: `clientApprovalRequests ClientApprovalRequest[]`, `clientStatements ClientStatement[]`, `expenseBlockReasons ExpenseBlockReason[]`
- `Client` modeline: `clientApprovalRequests ClientApprovalRequest[]`, `clientStatements ClientStatement[]`
- `ExpenseRequest` modeline: `blockReasons ExpenseBlockReason[]`
- `Tenant`'a **dokunulmaz** (tenantId scalar tutulur, relation kurulmaz — ExpenseRequest/CaseBalance deseni).

> Bu, mevcut tabloların **verisini/şemasını değiştirmez**; yalnız ORM ilişki görünürlüğü ekler. Risk düşük, ama dosya diff'i `Case`/`Client`/`ExpenseRequest` modellerine dokunur → impact bölümünde bildirilecek.

---

## 5. Tenant izolasyonu

- Üç modelin tümü `tenantId String` taşır + `@@index([tenantId])` (mevcut desen birebir).
- Tenant relation **kurulmaz** (scalar yeterli; Tenant modelini şişirmemek için — ExpenseRequest aynen böyle).
- **Servis kuralı:** her read/write `tenantId` ile filtrelenir; FK hedefleri (Case/Client/ExpenseRequest) de aynı tenant'a ait mi **doğrulanır** (cross-tenant referans yasak). Bu, kod fazında guard olarak yazılacak; planda kayıt altında.
- Yazımda `tenantId`, çağıran context'ten (`CurrentUser`) alınır — body'den ASLA. (Mevcut `POST /debtors/:id/intelligence` deseni.)

---

## 6. `onDelete` kararı (savunma kayıtları için kritik — K-D1)

Mevcut konvansiyon `onDelete: Cascade` (Case silinince alt kayıtlar gider). Ama bunlar **savunma kayıtları** → Case hard-delete olursa silinmeleri istenmeyebilir.

- **Gerçek durum:** memory'de "case update/delete cancel-only" kararı var — Case'ler **hard-delete edilmiyor** (iptal ediliyor). Yani pratikte Cascade tetiklenmez.
- **Öneri (K-D1):** Tutarlılık için `caseId`/`clientId` relation'larında **`onDelete: Cascade`** (mevcut hatla aynı) **AMA** asıl koruma Case'in cancel-only olması. Alternatif: `onDelete: Restrict` (savunma kaydı varken Case silinemez) — daha sağlam ama mevcut desenden sapar. **Karar Faz 2 onayında netleşir.**
- `ClientStatementLine → ClientStatement`: `onDelete: Cascade` (satır başlığa ait, sorun değil).

---

## 7. Immutability/append-only nerede uygulanır

| Katman | Uygulama |
|---|---|
| **Şema** | `ClientStatementLine`/`ClientStatement` için `updatedAt` yok; düzeltme = supersede. `ExpenseBlockReason` çekirdek alanları yazıldıktan sonra dokunulmaz. |
| **Servis** | Statement satırları tek transaction'da yazılır; servis UPDATE/DELETE metodu **sunmaz**. BlockReason yalnız `resolve()`/`cancel()` transition metodu sunar; `updateContent` yok. ClientApproval kararı terminal. |
| **Endpoint** | Bu kayıtlar için `PATCH`/`PUT`/`DELETE` (içerik) endpoint'i **açılmaz**. Yalnız create + transition (resolve/cancel/supersede) uçları. |
| **DB (opsiyonel, K-I1)** | İleride trigger/permission ile UPDATE engeli — DO-NOW'da servis+endpoint katmanı yeterli; DB-level zorlama backlog. |

---

## 8. Gerekecek endpoint'ler (TARİF — kod yok)

> Hepsi mevcut modül desenine (`debtor.controller` / `expense-request` controller) oturur. `tenantId`/`userId` `CurrentUser`'dan.

**ClientApprovalRequest**
- `POST   /cases/:caseId/client-approvals` — onay talebi oluştur (DRAFT)
- `POST   /client-approvals/:id/send` — müvekkile gönder (SENT) + mail tetiği
- `POST   /client-approvals/:id/decision` — APPROVE/REJECT kaydı (terminal)
- `POST   /client-approvals/:id/cancel` — CANCELLED
- `GET    /cases/:caseId/client-approvals` — liste (status filtreli)
- *(EXPIRED: cron/lazy-check — ayrı; mevcut scheduler deseni)*

**ClientStatement**
- `POST   /cases/:caseId/client-statements` — dönem ver, snapshot üret (tek transaction)
- `GET    /cases/:caseId/client-statements` — liste (ACTIVE default)
- `GET    /client-statements/:id` — başlık + satırlar
- `POST   /client-statements/:id/supersede` — yeni üretip eskisini SUPERSEDED yap
- *(PDF export: mevcut export deseni — Faz 6)*

**ExpenseBlockReason**
- `POST   /cases/:caseId/expense-block-reasons` — gerekçe aç (OPEN)
- `POST   /expense-block-reasons/:id/resolve` — RESOLVED
- `POST   /expense-block-reasons/:id/cancel` — CANCELLED
- `GET    /cases/:caseId/expense-block-reasons` — liste (OPEN default)

> **İçerik PATCH/DELETE yok** (§7). Yalnız create + transition.

---

## 9. Yazılacak testler

**Unit / servis**
- ClientApproval state makinesi: DRAFT→SENT→APPROVED/REJECTED, EXPIRED, CANCELLED; **APPROVED sonrası tekrar karar reddedilir** (terminal).
- ClientStatement: snapshot üretimi doğru `runningBalance`; üretim sonrası kaynak kayıt değişse bile satır **sabit** (immutability testi); supersede zinciri.
- ExpenseBlockReason: OPEN→RESOLVED/CANCELLED; çekirdek alan **update edilemez**; silme **yok**.
- Tenant izolasyonu: cross-tenant `caseId`/`clientId` referansı **reddedilir**; read başka tenant'ı görmez.

**Entegrasyon (canlı DB e2e — mevcut disiplin)**
- 3 model için create→transition→list akışı gerçek DB'de.
- ExpenseRequest BLOCKING gate + ExpenseBlockReason birlikte: ödeme yok → blok kaydı OPEN → ödeme gelince RESOLVED.

**Negatif**
- PATCH/DELETE içerik endpoint'i **yok** (route bulunmamalı).

---

## 10. Migration riskleri

| Risk | Seviye | Not |
|---|---|---|
| Yeni tablolar + 8 yeni enum (additive) | **Düşük** | yalnız CREATE; mevcut tabloya kolon eklemez |
| `Case`/`Client`/`ExpenseRequest` model dosyasına geri-relation | **Düşük** | DB kolonu üretmez; yalnız ORM; ama diff bu modellere dokunur |
| `onDelete` seçimi (Cascade vs Restrict) | **Orta** | K-D1; yanlış seçim savunma kaydını silebilir → onayda netleş |
| Enum değer kümesi sonradan büyürse | **Düşük** | `ALTER TYPE ADD VALUE` additive (mevcut BANK_INTEGRATION deseni) |
| Prod skew | **Yok (DO-NOW)** | Faz 2 dev-applied; prod N/A (mevcut pratik) |
| Mevcut ExpenseRequest 9-state'e dokunma | **Yasak** | bu faza alınmıyor |

---

## 11. Geri alma (rollback) planı

- **Şema:** yeni tablolar/enum'lar bağımsız → `migration` geri alınırsa yalnız 3 yapı düşer; mevcut hat etkilenmez (FK'ler yeni tablolarda, mevcut tablolarda kolon yok).
- **Kod:** modüller ayrı (`client-approval`, `client-statement`, `expense-block-reason`) → PR bazında revert; mevcut `expense-request`/`case-balance` servisleri değişmediği için revert onları kırmaz.
- **Veri:** üç tablo da additive ve referans-veren değil referans-alan; drop edilince mevcut veri bütünlüğü bozulmaz (Case/Client/ExpenseRequest kayıtları sağlam kalır).
- **Geri-relation:** Case/Client/ExpenseRequest'ten eklenen dizi alanlarının geri alınması da şema-içi (DB'siz).
- **Sıra:** her yapı ayrı PR → sorun çıkan parça tek başına geri alınır (hepsi birden değil).

---

## 12. Kodlamadan önce netleşecek kararlar

| # | Karar | Öneri |
|---|---|---|
| K-A1 | ClientApprovalEvent (append-only geçiş log'u) eklensin mi? | **Evet** — savunma izi; ucuz, ExpenseAuditLog deseni |
| K-D1 | `onDelete`: Cascade (tutarlı) vs Restrict (savunma kaydı korur)? | Cascade + Case cancel-only güvencesi; Restrict alternatif |
| K-I1 | Immutability DB-level (trigger) mi, servis/endpoint-level mi? | DO-NOW: servis+endpoint yeterli; DB-trigger backlog |
| K-S1 | Ekstre satırları nereden derlenir? | ExpenseRequest(talep) + ExpensePayment(ödeme) + BalanceLedger(gerçekleşen/avans) birleşimi; **Collection DAHİL DEĞİL** |
| K-AP1 | ClientApproval `subjectId` polimorfik (FK yok) mü? | **Evet** — EXPENSE_REQUEST/OPERATION'a sıkı FK kurmadan gevşek bağ |
| K-M1 | Modüller ayrı mı, tek `client-finance` modülü mü? | 3 ayrı küçük modül (bağımsız PR/rollback) |

---

## 13. Özet

- **3 additive yapı**, mevcut hat korunur, paralel masraf sistemi yok.
- **Savunma kayıtları immutable:** ClientStatement snapshot (update yok, supersede), ExpenseBlockReason silinmez (OPEN→RESOLVED/CANCELLED), ClientApproval kararı terminal.
- **Tenant** scalar+index+servis guard; **onDelete** karar K-D1; **mevcut modellere tek dokunuş** geri-relation (DB'siz).
- **Endpoint'ler create + transition** (içerik PATCH/DELETE yok).
- **Bu faz: kod/migration/endpoint YAZILMADI** — yalnız plan. Onay sonrası 3 ayrı PR.
