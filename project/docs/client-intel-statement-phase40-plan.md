# Faz 4.0 — ClientIntelStatement Backend — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Bu, [client-intel-form-design.md](client-intel-form-design.md) (Faz 1) tasarımının BACKEND hâlidir** — Faz 4 dış-formun "yumuşak istihbarat" promote hedefi. Faz 4 koduna geçmeden ÖNCE gelir (F4-K5).
> **İlgili:** [client-intake-link-design.md](client-intake-link-design.md) (Faz 4 — promote bu modele yazacak).

## 0. Sınır (değişmez)
- **Yalnız "yumuşak istihbarat"** (gelir/ticari/aile/dijital/tahsilat-beyanı/strateji). Adres → `DebtorAddress(source=CLIENT)`, varlık → `Asset`, iletişim → `Debtor`/`DebtorCommunication` **bu modele YAZILMAZ** (anti-tekrar; mevcut modeller).
- **Party / IR-0 / cross-case yayma / oto-merge YOK** (Faz 1 HOLD ile aynı). Bu PR yalnız **dosya+borçlu bazlı** tekil beyan kaydı.
- Mevcut kanonik modellere **dokunulmaz** (yalnız Case/Debtor'a ORM geri-relation).

## 1. Model: `ClientIntelStatement`
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `caseId` | `String` | FK → `Case` (onDelete **Restrict** — 40-1) |
| `debtorId` | `String` | FK → `Debtor` (onDelete **Restrict**) |
| `category` | `ClientIntelCategory` | aşağıda |
| `label` | `String?` | soru/etiket ("Borçlu nasıl para kazanıyor?") |
| `value` | `String` | müvekkil beyanı (**immutable**) |
| `note` | `String?` | |
| `source` | `ClientIntelSource @default(CLIENT_DECLARATION)` | |
| `confidence` | `ClientIntelConfidence @default(DECLARED)` | beyan = en zayıf katman |
| `status` | `ClientIntelStatus @default(ACTIVE)` | §3 lifecycle |
| `supersededById` | `String?` | yerine geçen kayıt (self-ref, FK YOK — gevşek) |
| `supersededAt` | `DateTime?` | |
| `revokedAt` | `DateTime?` | retract/false-positive damgası |
| `revokedById` | `String?` | |
| `lifecycleNote` | `String?` | geçiş gerekçesi (içerik değil) |
| `createdById` | `String` | beyanı giren personel |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | yalnız lifecycle geçişinde değişir |

### Enum'lar (yeni — 4)
- `ClientIntelCategory { INCOME_SOURCE, COMMERCIAL_RELATION, FAMILY_CIRCLE, DIGITAL_FOOTPRINT, PAYMENT_HISTORY, STRATEGY }`
- `ClientIntelSource { CLIENT_DECLARATION }` *(40-3: CLIENT_PORTAL/INTAKE sonraki faz — Faz 4'te additive eklenir)*
- `ClientIntelConfidence { DECLARED }`
- `ClientIntelStatus { ACTIVE, RETRACTED, SUPERSEDED, FALSE_POSITIVE }`

### Index
`@@index([tenantId, debtorId])` · `@@index([caseId])` · `@@index([debtorId, status])` · `@@index([status])` · `@@index([createdAt])`

## 2. Append-only / immutability
- **`value`/`category`/`label`/`caseId`/`debtorId` create sonrası DEĞİŞMEZ.** Düzeltme = **supersede** (eski SUPERSEDED + yeni ACTIVE).
- Yanlış çıkan beyan **silinmez**: `RETRACTED` (müvekkil geri aldı) / `FALSE_POSITIVE` (yanlış çıktı) / `SUPERSEDED` (yenisiyle). "Kim neye dayanarak haciz görevi açtı?" cevabı korunur.
- Servis **content update/delete metodu SUNMAZ**; içerik PATCH/PUT/DELETE route **yok**. Yalnız create + transition (retract/false-positive/supersede) + read.

## 3. Durum makinesi
```
ACTIVE ──retract────────► RETRACTED       (terminal)
ACTIVE ──falsePositive──► FALSE_POSITIVE   (terminal)
ACTIVE ──supersede──────► SUPERSEDED       (terminal; yeni ACTIVE kayıt üretilir, supersededById bağlar)
```
- Yalnız `ACTIVE` geçiş yapar; terminal kayıt değişmez (geçersiz geçiş → `BadRequestException`).
- retract/false-positive: `revokedAt/revokedById/lifecycleNote` damgası. supersede: `supersededAt/supersededById`.

## 4. Mevcut modellere dokunuş (ORM-only, DB kolonu üretmez)
- `Case` → `clientIntelStatements ClientIntelStatement[]`
- `Debtor` → `clientIntelStatements ClientIntelStatement[]`
- `Tenant`'a dokunulmaz (tenantId scalar).

## 5. Tenant guard
- `tenantId` scalar+index; tüm okuma/yazma tenant filtreli.
- create'te `caseId` + `debtorId` aynı tenant doğrulanır; `debtorId` o case'e bağlı mı **opsiyonel soft kontrol** (CaseDebtor) — 40-2 kararı (öneri: soft, bulunamazsa da kabul; cross-case yok ama dosya-borçlu eşleşmesi gevşek). `tenantId`/`userId` `CurrentUser`'dan.

## 6. Endpoint'ler (TARİF — kod yok)
| Method | Path | Gövde |
|---|---|---|
| POST | `/client-intel-statements/case/:caseId` | `{ debtorId, category, label?, value, note? }` → ACTIVE |
| POST | `/client-intel-statements/:id/retract` | `{ note? }` → RETRACTED |
| POST | `/client-intel-statements/:id/false-positive` | `{ note? }` → FALSE_POSITIVE |
| POST | `/client-intel-statements/:id/supersede` | `{ value, label?, note? }` → eski SUPERSEDED + yeni ACTIVE |
| GET | `/client-intel-statements/case/:caseId` | `?status=ACTIVE` (default) |
| GET | `/client-intel-statements/debtor/:debtorId` | `?status=ACTIVE` (default) — borçlu bazlı |
> İçerik PATCH/PUT/DELETE **yok**.

## 7. Anti-tekrar duplicate
- Aynı `(debtorId, category, value)` ACTIVE varsa **soft uyarı** (blok yok; Faz 1 K2) — personel yine girebilir. Unique constraint YOK.

## 8. Test planı
**Unit:** create→ACTIVE · retract/false-positive/supersede geçişleri (+damga) · terminal sonrası geçiş reddi · supersede zinciri (eski SUPERSEDED + supersededById, içerik aynen) · content update/delete metodu **yok** · cross-tenant case/debtor reddi · list by case/debtor default ACTIVE.
**E2e (canlı DB):** izole throwaway case+debtor → create→list(ACTIVE)→supersede(eski SUPERSEDED, list yalnız yeni)→retract→false-positive · **Restrict** (intel varken Case/Debtor delete reddi) · tenant izolasyonu · immutability (value değişmez). Temizlenir.
**Negatif:** PATCH/DELETE route yok.

## 9. Migration / rollback
- Additive: 1 tablo + 4 enum + Case/Debtor geri-relation. Risk **düşük**. Ad: `add_client_intel_statement`.
- `migrate diff`'teki alakasız `IcrabotTimelineEntry` DROP INDEX **kasten** hariç (Faz 2/3 ile aynı drift).
- Rollback: bağımsız modül `client-intel-statement` + bağımsız tablo → tek PR revert; mevcut hat etkilenmez.

## 10. Bu PR'da YAPILMAYACAKLAR
Adres/varlık/iletişim yönlendirmesi (mevcut modeller, ayrı) · dış form / intake link (Faz 4.2+) · CLIENT_PORTAL source · Party/IR-0/cross-case · mail · frontend · cron.

## 11. Açık micro-kararlar
| # | Karar | Öneri |
|---|---|---|
| 40-1 | onDelete case/debtor: Restrict mi Cascade mi? | **Restrict** (savunma/istihbarat kaydı kaybolmamalı; Faz 2/3 ile tutarlı) |
| 40-2 | debtorId case'e ait mi soft-validate? | **soft** (bulunamazsa da kabul; cross-case yok ama esnek) |
| 40-3 | source enum'a şimdi CLIENT_PORTAL eklensin mi? | **Hayır** — Faz 4'te additive; bu PR yalnız CLIENT_DECLARATION |
| 40-4 | supersede gövdesi yeni `value` ister mi? | **Evet** (düzeltme = yeni içerik) |

> Onaylarsan (40-1..40-4 dahil) bu PR'ı plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
