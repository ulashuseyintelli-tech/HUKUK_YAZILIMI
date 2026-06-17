# Faz 4.2 — ClientIntakeLink / Submission / Field (Persistence) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** Faz 4.0 (ClientIntelStatement backend) MERGED → main `3e0557e` (promote hedefi hazır). ✅
> **Kaynak:** [client-intake-link-design.md](client-intake-link-design.md) (Faz 4 tasarım §3/§5).
> **Kapsam:** Yalnız **persistence katmanı** (3 model + enum + migration). Link üretimi (4.3), public submit (4.4), review (4.5), **promote (4.6) bu PR'da YOK.**

## 0. Sınır (değişmez — Faz 4 omurgası)
- **Dış formdan gelen veri DOĞRUDAN kanonik dosya verisi OLMAZ.** Gönderim önce `CLIENT_SUBMITTED` → review queue. (Bu PR yalnız o havuzun **şemasını** kurar.)
- **promote YOK · frontend YOK · portal YOK · Party/IR-0/cross-case YOK.**
- Bu PR **endpoint/servis içermez** (42-5): yalnız tablolar. Tüketici 4.3+'ta gelir. Mevcut kanonik modellere dokunulmaz (yalnız Case/Client'a ORM geri-relation).

## 1. Model: `ClientIntakeLink` (tokenli dış-form linki)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `caseId` | `String` | FK → `Case` (onDelete **Restrict**) |
| `clientId` | `String` | FK → `Client` (onDelete **Restrict**) |
| `tokenHash` | `String` | opak token'ın **HASH'i** (ham token DB'de YOK — §5 güvenlik; 42-4) |
| `status` | `ClientIntakeLinkStatus @default(ACTIVE)` | `ACTIVE \| USED \| EXPIRED \| REVOKED` |
| `scope` | `ClientIntakeFieldCategory[]` | hangi kategoriler isteniyor (42-2: PG array) |
| `expiresAt` | `DateTime?` | süre |
| `maxUses` | `Int @default(1)` | kullanım limiti |
| `useCount` | `Int @default(0)` | |
| `createdById` | `String` | |
| `createdAt` | `DateTime @default(now())` | |
| `submissions` | `ClientIntakeSubmission[]` | |
| index | `@@index([tenantId])` `@@index([caseId])` `@@index([clientId])` `@@index([tokenHash])` `@@index([status])` | tokenHash index → submit'te hızlı doğrulama |

## 2. Model: `ClientIntakeSubmission` (gönderim — review queue kaydı)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `tenantId` | `String` | scalar + index |
| `intakeLinkId` | `String` | FK → `ClientIntakeLink` (onDelete **Restrict**) |
| `caseId` | `String` | FK → `Case` (Restrict) — sorgu kolaylığı (linkten türetilir) |
| `clientId` | `String` | FK → `Client` (Restrict) |
| `status` | `ClientIntakeSubmissionStatus @default(CLIENT_SUBMITTED)` | `CLIENT_SUBMITTED \| IN_REVIEW \| PARTIALLY_PROMOTED \| COMPLETED \| REJECTED` |
| `submittedAt` | `DateTime @default(now())` | |
| `reviewedById` | `String?` | |
| `reviewedAt` | `DateTime?` | |
| `sourceMeta` | `Json?` | PII-min: ip **hash**/ua özeti (denetim) — ham IP DB'de YOK |
| `createdAt` | `DateTime @default(now())` | |
| `fields` | `ClientIntakeField[]` | |
| index | `@@index([tenantId])` `@@index([intakeLinkId])` `@@index([caseId])` `@@index([status])` `@@index([createdAt])` | |

## 3. Model: `ClientIntakeField` (tek alan — immutable ham beyan)
| Alan | Tip | Not |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `submissionId` | `String` | FK → `ClientIntakeSubmission` (onDelete **Cascade** — alan gönderime ait) |
| `category` | `ClientIntakeFieldCategory` | 42-1: yumuşak istihbarat + ADDRESS/ASSET/CONTACT |
| `label` | `String?` | |
| `value` | `String` | ham beyan (**immutable**) |
| `note` | `String?` | |
| `reviewStatus` | `ClientIntakeFieldReviewStatus @default(PENDING)` | `PENDING \| APPROVED \| REJECTED` |
| `reviewNote` | `String?` | |
| `promotedRefType` | `String?` | onaylanınca yazıldığı kanonik model (4.6 doldurur) |
| `promotedRefId` | `String?` | |
| `createdAt` | `DateTime @default(now())` | |
| index | `@@index([submissionId])` `@@index([category])` `@@index([reviewStatus])` | |

## 4. Enum'lar (yeni — 4)
- `ClientIntakeLinkStatus { ACTIVE, USED, EXPIRED, REVOKED }`
- `ClientIntakeSubmissionStatus { CLIENT_SUBMITTED, IN_REVIEW, PARTIALLY_PROMOTED, COMPLETED, REJECTED }`
- `ClientIntakeFieldReviewStatus { PENDING, APPROVED, REJECTED }`
- `ClientIntakeFieldCategory { INCOME_SOURCE, COMMERCIAL_RELATION, FAMILY_CIRCLE, DIGITAL_FOOTPRINT, PAYMENT_HISTORY, STRATEGY, ADDRESS, ASSET, CONTACT }` *(42-1: yumuşak 6 + adres/varlık/iletişim; promote 4.6'da kategoriye göre kanonik hedefe router'lar)*

## 5. Güvenlik (model seviyesi — mantık 4.3/4.4)
- **Ham token DB'de YOK:** yalnız `tokenHash` (sha256). Üretim/karşılaştırma 4.3/4.4'te; bu PR yalnız kolonu kurar.
- **PII-min:** `sourceMeta` ham IP değil hash/özet.
- `value`/`category` immutable (review yalnız `reviewStatus`/`promotedRef` lifecycle damgası — 4.5/4.6).
- onDelete=Restrict (link/submission case/client/link FK) → denetim izi kaybolmaz; field→submission Cascade.

## 6. Mevcut modellere dokunuş (ORM-only)
- `Case` → `clientIntakeLinks ClientIntakeLink[]`, `clientIntakeSubmissions ClientIntakeSubmission[]`
- `Client` → `clientIntakeLinks ClientIntakeLink[]`, `clientIntakeSubmissions ClientIntakeSubmission[]`
- `Tenant`'a dokunulmaz.

## 7. Bu PR'da YOK (sonraki alt-fazlar)
- Link üretimi + tokenHash hesaplama + `INTAKE_LINK` mail → **4.3**
- Public submit endpoint (tokenli, rate-limit) → **4.4**
- Review queue API → **4.5**
- Promote (onaylı alanı kanonik modele yaz, ClientIntelStatement/DebtorAddress/Asset reuse) → **4.6**
- frontend → **4.7** · captcha/portal/cross-case → **4.8 HOLD**
- **Servis/endpoint/modül bu PR'da YOK** (42-5: yalnız şema).

## 8. Test planı
**E2e (canlı DB, raw prisma — servis yok):** izole throwaway case+client → link create (tokenHash, scope array, status ACTIVE) → submission (CLIENT_SUBMITTED) → 2 field (biri INCOME_SOURCE, biri ADDRESS) → **Restrict** (link/submission varken Case/Client + link delete reddi) · field→submission Cascade (submission silinince field gider) · tenant filtre · scope array round-trip. Temizlenir.
**Şema:** `prisma validate` + `migrate diff` yalnız bizim tablolar (IcrabotTimelineEntry drift hariç).
> Unit servis testi YOK (servis bu PR'da yok).

## 9. Migration / rollback
- Additive: 3 tablo + 4 enum + Case/Client geri-relation. Risk **düşük**. Ad: `add_client_intake_models`.
- `migrate diff`'teki alakasız `IcrabotTimelineEntry` DROP INDEX **kasten** hariç.
- Rollback: bağımsız 3 tablo → PR revert; mevcut hat etkilenmez (tüketici yok).

## 10. Açık micro-kararlar
| # | Karar | Öneri |
|---|---|---|
| 42-1 | Field.category: yumuşak-6 mı, +ADDRESS/ASSET/CONTACT mi? | **+ADDRESS/ASSET/CONTACT** (intake hepsini toplar; promote router'lar) |
| 42-2 | Link.scope: PG `String[]`/enum[] mi, Json mı? | **enum[]** (`ClientIntakeFieldCategory[]`) — tipli, sorgulanabilir |
| 42-3 | onDelete: Restrict (case/client/link) + Cascade (field→submission)? | **Evet** |
| 42-4 | tokenHash: yalnız hash kolonu (ham token yok)? | **Evet** (güvenlik) |
| 42-5 | 4.2 = yalnız şema mı (servis/endpoint 4.3+)? | **Evet** — şema-only, tüketici sonra |

> Onaylarsan (42-1..42-5 dahil) 4.2'yi plan→additive şema+migration→canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
