# WP-1d-4c-0 — Responsibility History Endpoint Contract

> **Durum:** Sözleşme / tasarım (docs-only). **Kod YOK · migration YOK · UI YOK · mutation YOK · audit yazımı YOK ·
> davranış değişikliği YOK.** Gerçek bir sorumluluk timeline'ı için gereken read-only history endpoint'inin
> sözleşmesini sabitler.
> **Bağlam:** WP-1d-4a point-in-time panel (#437) geldi; WP-1d-4b inventory ([`wp1d4b-temporal-ui-timeline-inventory.md`](./wp1d4b-temporal-ui-timeline-inventory.md))
> gerçek timeline'ın **backend-gated** olduğunu gösterdi. Sözleşme: [`wp1d-temporal-responsibility-query-contract.md`](./wp1d-temporal-responsibility-query-contract.md).
> **Ön sürüm:** origin/main `4ec3e6f`.

## 1. Kısa hüküm

- Bir **read-only** `GET /cases/:id/responsibility-history` endpoint'i, dosyanın sorumluluk **değişim olaylarını**
  kronolojik liste olarak döndürür (point-in-time değil, **timeline**).
- Kaynak: mevcut `AuditLog` (CASE owner event'leri + CASE_LAWYER isResponsible geçişleri). **Yeni tablo/yazım YOK.**
- **Yanlış kesinlik YASAK:** her olay kendi `confidence`'ı (EVENT_CONFIRMED / INFERRED_FROM_SNAPSHOT / UNKNOWN_BEFORE_HORIZON).
- Mevcut **point-in-time** service ([`temporal-responsibility.service.ts`](../apps/api/src/modules/case/temporal-responsibility.service.ts))
  **DEĞİŞMEZ**; history ayrı, ek bir okuma yoludur.

## 2. Neden gerekli?

- WP-1d-4a paneli "asOf tarihinde kim sorumluydu" (point-in-time) cevaplıyor; "kim→kim, ne zaman, kim değiştirdi"
  **değişim listesini** veremiyor.
- WP-1d-4b: mevcut `GET /cases/:id/timeline` `caseLifecycle` okuyor (CREATED/STATUS/TEBLIGAT/HACIZ…) → **sorumluluk
  olaylarını İÇERMEZ**. Sorumluluk değişim verisi yalnız AuditLog'ta; onu **listeleyen** endpoint yok (servis yalnız
  `findFirst` ≤ asOf). → gerçek timeline için bu endpoint ön-koşul.

## 3. Mevcut durum: point-in-time var, timeline yok

- `getOperationOwnerAt`, `getLegalResponsibleLawyerAt`, `getResponsibilityAt` = **point-in-time** (`findFirst` ≤ asOf).
- History = aynı kaynakların **`findMany` + kronolojik replay**'i; her geçiş bir event satırı. Mantık (özellikle
  CASE_LAWYER caseId eşleme + güven düşürme) point-in-time service ile **tutarlı** olmalı (çift-otorite yok; ortak
  yardımcılar tercih edilir).

## 4. Data sources

| Olay grubu | Kaynak | caseId eşleme | Güven |
|---|---|---|---|
| **Operation owner** | AuditLog `entityType=CASE`, `entityId=caseId`, `metadata.changeType ∈ {OPERATION_OWNER, OPERATION_OWNER_INITIALIZED}`; owner değerleri `newValues.responsibleLawyerId`/`responsibleStaffId` | doğrudan (entityId=caseId) | **EVENT_CONFIRMED** |
| **Legal responsible lawyer** | AuditLog `entityType=CASE_LAWYER` (CREATE/UPDATE/DELETE), `isResponsible` geçişleri; `entityId=caseLawyerId` | `metadata.caseId===caseId` varsa **reliable**; yoksa canlı `CaseLawyer` junction (entityId→caseId) fallback | `metadata.caseId` ile → **EVENT_CONFIRMED**; junction fallback ile → **INFERRED_FROM_SNAPSHOT**; eşlenemezse → atlanır veya **UNKNOWN** (includeInferred'e göre) |

> Bilinen audit-shape sınırı (WP-1d-2): CASE_LAWYER event'leri `lawyerId`'yi yalnız CREATE(newValues)/DELETE(oldValues)'da
> taşır; promote/update taşımaz → caseLawyerId→lawyerId map (CREATE/DELETE) + canlı junction ile çözülür; çözülemezse
> güven düşürülür / lawyerId null.

## 5. Endpoint proposal

```
GET /cases/:id/responsibility-history
```

| Query | Tip | Anlam |
|---|---|---|
| `from` | ISO date? | başlangıç (varsa `createdAt >= from`) |
| `to` | ISO date? | bitiş (varsa `createdAt <= to`) |
| `includeInferred` | boolean? | INFERRED/UNKNOWN olayları dahil et (default: true; false → yalnız EVENT_CONFIRMED) |
| `type` | `operationOwner` \| `legalResponsibleLawyer` \| `all`? | olay türü filtresi (default: `all`) |

- Read-only (yalnız GET). Geçersiz `from`/`to` → 400 (mevcut asOf parse deseniyle tutarlı).

## 6. Response shape

```json
{
  "caseId": "...",
  "from": "...",
  "to": "...",
  "events": [
    {
      "id": "...",
      "type": "operationOwner | legalResponsibleLawyer",
      "effectiveAt": "...",
      "changedByUserId": "...",
      "confidence": "EVENT_CONFIRMED | INFERRED_FROM_SNAPSHOT | UNKNOWN_BEFORE_HORIZON",
      "oldValue": { "type": "LAWYER | STAFF | NONE | UNKNOWN", "id": "..." },
      "newValue": { "type": "LAWYER | STAFF | NONE | UNKNOWN", "id": "..." },
      "sourceEventId": "...",
      "note": "..."
    }
  ],
  "horizon": { "note": "..." }
}
```

- `events` kronolojik (artan `effectiveAt`).
- İsim çözümü endpoint'in işi DEĞİL (id döner; isim çözümü UI/ayrı katman — WP-1d-4a panelindeki gibi best-effort).
- `legalResponsibleLawyer` olaylarında `oldValue/newValue.id` = lawyerId; `type` LAWYER (veya NONE/UNKNOWN).

## 7. Confidence / horizon rules

1. **Yanlış kesinlik YOK.**
2. **EVENT_CONFIRMED:** yalnız AuditLog event'i doğrudan case'e bağlanabiliyorsa (CASE entityId=caseId, veya
   CASE_LAWYER metadata.caseId===caseId).
3. **INFERRED_FROM_SNAPSHOT:** yalnız canlı junction/snapshot ile eşleştirilebiliyorsa (eski CASE_LAWYER event'leri).
4. **UNKNOWN_BEFORE_HORIZON:** enstrümantasyon ufku öncesi / yeterli kayıt yok → kullanıcıya **"kesin kayıt yok"**.
   `horizon.note` ufku açıklar.
5. Mevcut point-in-time service **değişmez**; history ayrı endpoint.
6. Endpoint **read-only**.
7. **Tenant boundary zorunlu** (her sorgu tenantId ile; case tenant'a ait değilse 404/empty).
8. **Başka tenant event'i ASLA dönmez** (AuditLog sorguları tenantId-scoped).

## 8. Tenant / authz rules

- Mevcut davranış: **tenant-scoped** (JwtAuthGuard + tenantId).
- Future permission leaf: **`cases.viewResponsibilityHistory`** (WP-4c-1 diagnostics map'inde zaten var).
- **WP-4 closure** nedeniyle full RBAC YOK → şimdilik mevcut guard pattern (tenant-only) korunur.
- İstersen ileride bu endpoint'e warn-only audit (PERMISSION_WOULD_DENY) **ayrıca** değerlendirilebilir; **bu PR'da yok.**

## 9. Edge cases

- Hiç sorumluluk event'i yok → `events: []` + `horizon.note` ("bu dosya için kayıtlı sorumluluk değişimi yok / ufuk öncesi").
- `from`/`to` aralığı event içermiyor → boş liste (hata değil).
- `includeInferred=false` → yalnız EVENT_CONFIRMED; inferred/unknown atlanır (UI "bazı eski kayıtlar gösterilmiyor" uyarabilir).
- CASE_LAWYER junction silinmiş (caseId çözülemiyor) → olay atlanır (yanlış case'e atfetme YOK) — note ile belirtilebilir.
- Aynı anda birden çok responsible (invariant ihlali, eski veri) → replay dürüstçe yansıtır; "AMBIGUOUS" note.
- Çok sayıda event → pagination GEREKEBİLİR (ilk sürümde basit limit + note; ya da from/to ile sınırla) — WP-1d-4c-1'de karar.

## 10. Test strategy (WP-1d-4c-1 için)

1. Operation owner event'leri kronolojik + EVENT_CONFIRMED döner (CASE entityId=caseId).
2. CASE_LAWYER metadata.caseId===caseId → EVENT_CONFIRMED; junction fallback → INFERRED_FROM_SNAPSHOT.
3. `includeInferred=false` → yalnız EVENT_CONFIRMED.
4. `type` filtresi doğru çalışır.
5. `from`/`to` aralık filtresi; geçersiz tarih → 400.
6. **Tenant boundary:** başka tenant'ın event'i ASLA dönmez; case başka tenant'ta → 404/empty.
7. Hiç event yok → boş liste + horizon.note.
8. Read-only: hiçbir mutation/audit-yazımı yapılmaz.
9. Point-in-time service çağrı sonuçları DEĞİŞMEZ (ayrı yol; regresyon yok).

## 11. Non-goals

- UI timeline YOK · frontend değişikliği YOK · mutation YOK · audit event yazımı YOK · backfill YOK ·
  migration/schema YOK · permission enforcement YOK · full RBAC YOK · balance/shadow-display YOK.

## 12. Next PR plan

- **WP-1d-4c-1 — backend read-only responsibility-history service + endpoint (kod):**
  - Önce **service** testleri (replay + confidence + tenant boundary + edge cases).
  - Sonra **controller** testleri (query parse + 400 + delegation).
  - Mevcut `temporal-responsibility.service` mantığıyla tutarlı; ortak yardımcılar reuse.
  - **UI YOK.** Bu doc (WP-1d-4c-0) merge edilmeden başlanmaz.
- Sonra (opsiyonel, ayrı): WP-1d-4c-2 frontend timeline UI (panelin yanında).
