# P7-B01 — CAP-09A DORMANT_CANONICAL DISPOSITION KAYDI

- **Taban**: `76cd85f38324a9b4a79c192c5da10be2e4f54402` · **Ölçüm**: 2026-08-13 · **Yöntem**: statik kod taraması (grep + dosya okuma) + read-only DB sayımı
- Kanıt etiketleri: `OBSERVED` (dosya içeriği), `VERIFIED` (bu oturumda komutla doğrulandı)

## 1. Şema ve taşıyıcı (OFFICE'in sahip olduğu yüzey)

| Yüzey | Konum | Durum |
|---|---|---|
| AuditLog 7 attribution kolonu | `apps/api/prisma/schema.prisma:5896-5903` | OBSERVED — nullable, indexsiz ("bu slice'ta yalnız kolon eklenir") |
| Migration | `prisma/migrations/20260722213239_office_phase2_cap09a_foundation_audit_attribution/migration.sql` | OBSERVED — 7× `ADD COLUMN` (actorType, correlationId, decisionResult, policyRef, policyVersion, reasonCode, requestId) |
| Taşıyıcı sözleşme | `modules/audit/audit.service.ts` — `AuditLogInput:20-27` opsiyonel attribution alanları; `log():52-58` ve `logInTransaction():91-97` alanları geçirir | OBSERVED — AuditService **kendisi hiçbir attribution değeri üretmez**; çağıran verirse yazar |

## 2. Kolon × üretici matrisi (kod-seviyesi, birinci-sınıf kolonlar)

AuditLog'a giden iki yol tarandı: (a) doğrudan `auditLog.create` (test-dışı 7 dosya),
(b) `AuditService.log()/logInTransaction()` çağıranları (multiline blok taramasıyla
attribution içerenler süzüldü). Sonuç — **6 üretici çağrı noktası, tamamı OFFICE dışı**:

| # | Üretici (dosya:satır) | Yol | actorType | decisionResult | reasonCode | correlationId | requestId | policyRef | policyVersion | Bounded context |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `modules/collection/collection.service.ts:1067-1087` (`auditCollectionIdempotencyConflict`) | AuditService.log | ✓ :1074 | — | ✓ :1076 | — | — | — | — | COLLECTION |
| 2 | `modules/bank/bank.service.ts:763-787` (idempotency conflict, BANK_TRANSACTION) | AuditService.log | ✓ :769 | — | ✓ :771 | ✓ :770 | — | — | — | BANK |
| 3 | `modules/calc-preview/diagnostics/playbook/playbook-audit.interceptor.ts:55-63` | AuditService.log | ✓ :61 | ✓ :62 | — | ✓ :63 | — | — | — | CALC-PREVIEW (diagnostics) |
| 4 | `modules/client-financial-disclosure/client-financial-disclosure-publication.service.ts:670-692` (`writeAudit`) | **tx.auditLog.create — AuditService BYPASS** | ✓ :682 | ✓ :683 | ✓ :684 | — | — | — | — | CLIENT-FINANCIAL-DISCLOSURE |
| 5 | `modules/claim-item/formation-intent/claim-item-formation-office-approval.adapter.ts:250-266` | AuditService.logInTransaction | — | — | — | ✓ :256 | — | — | — | CLAIM-ITEM |
| 6 | `modules/claim-item/formation-finalizer/transactional-claim-item-formation-finalizer.service.ts:313-328` | AuditService.logInTransaction | — | — | — | ✓ :319 | — | — | — | CLAIM-ITEM |

**Hiçbir kod yolunun doldurmadığı kolonlar**: `requestId`, `policyRef`, `policyVersion`
(kod-seviyesi üretici: 0). `decisionResult` yalnız #3 ve #4'te.

## 3. OFFICE tarafı — negatif kanıt (üretici SIFIR)

| OFFICE yüzeyi | Kanıt | Sonuç |
|---|---|---|
| `office-approval.service.ts:597-617` (`auditLog` helper) | attribution alanı YOK; kimlik/durum bilgisi yalnız `metadata` | üretici DEĞİL |
| `office-approval-shadow.service.ts:112-130` (OFFICE_APPROVAL_SHADOW_EVALUATED) | `decision`, `reasonCode` **metadata İÇİNDE** (:121-124); birinci-sınıf kolon kullanılmıyor | üretici DEĞİL |
| `office-approval-shadow.service.ts:339-346` (CAP02 telemetry) | yalnız temel alanlar + metadata | üretici DEĞİL |
| `scripts/office-cap02-telemetry-perf.ts:424-433` | attribution alanı YOK (ve script — runtime producer değil) | üretici DEĞİL |
| `modules/staff`, `modules/lawyer`, `modules/user`, `modules/auth`, diğer `office-*` | tüm-src multiline taramasında attribution'lı log çağrısı çıkmadı | üretici DEĞİL |

Attribution DOLDURMAYAN diğer doğrudan yazıcılar (tamlık için): `case/legal-responsible-lawyer.service.ts:113`,
`uyap/uyap.service.ts:1113`, `client/arc07-i08-legacy-flat-reduction.core.ts:148` — üçü de yalnız
temel alanlar + metadata.

**Metadata-taşıyıcı desen (birinci-sınıf üretici SAYILMAZ)**: `claim-item/claim-item-lifecycle-contract.ts:225-258`
`tx.auditLog.create` yapar ama `actorType/policyRef/correlationId` kavramlarını **metadata JSON'ına**
yazar (:242-247), CAP-09A kolonlarına değil. `collection/collection-audit.ts:90-121`
(`logCollectionMutationInTransaction`) aynı şekilde `actorType`'ı metadata'ya koyar (:96).
Bu desen, envelope-tabanlı attribution'ın CAP-09A kolonlarından BAĞIMSIZ yaşadığını gösterir.

## 4. DB ölçümü (AUTHORITATIVE_LOCAL_OPERATIONAL_DB, read-only, VERIFIED 2026-08-13)

```
SELECT COUNT(*), COUNT(kolon)... FROM "AuditLog"
TOPLAM: 931
actorType: 4 · decisionResult: 4 · reasonCode: 4
correlationId: 0 · requestId: 0 · policyRef: 0 · policyVersion: 0
```

Attribution'lı 4 satırın action dağılımı:
`CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED` ×2 · `CLIENT_FINANCIAL_DISCLOSURE_SENT` ×2
— tamamı üretici #4'ten (CFD publication; 2026-08-11 FD yayın canary'sinin gerçek izleri).

## 5. Talimat-vs-ölçüm farkları (fresh doğrulama bulguları)

1. **Satır sayısı/doluluk drift'i**: Görev talimatı "829 satır, actorType dolu 0" diyordu.
   Güncel ölçüm: 931 satır, 4 dolu. Neden: talimat ölçümünden sonra FD publication canary'si
   (2026-08-11) gerçek attribution'lı satırlar üretti. **Tez değişmez**: dolduran üretici
   OFFICE dışıdır; OFFICE üreticisi hâlâ SIFIR.
2. **Claim-item üreticisinin kapsamı**: Talimat formation-intent adapter + formation-finalizer'ı
   genel "dolduran" sayıyordu. Ölçüm: bu iki nokta YALNIZ `correlationId` doldurur ve DB'de
   `correlationId=0` → bu kod yolu canlıda bugüne dek hiç attribution'lı satır üretmemiştir.
3. **SLICE 3**: SUPERSEDED / WITHDRAWN — decision-log satır 378 (2026-07-27) OBSERVED;
   bu lane'de yeniden açılmadı, açılmayacak.

## 6. Owner D3 sınırına uygunluk

| D3 maddesi | Bu kayıttaki karşılığı |
|---|---|
| CAP-09A = DORMANT_CANONICAL | §2-4 ölçümleriyle desteklendi; README'deki disposition cümlesi |
| Yeni OFFICE producer YOK | Hiçbir kod değişikliği yapılmadı; evidence-only |
| Kolon/model kaldırma YOK | Şema/migration'a dokunulmadı; kolonlar dış üreticilerce kullanımda (kaldırılamaz) |
| Ownership transferi YOK | Sahiplik kaydı: şema+taşıyıcı OFFICE'te, üretim dış context'lerde — devir önerilmedi |
| Production activation YOK | Runtime/deployment/flag mutasyonu yapılmadı; DB yalnız READ |
