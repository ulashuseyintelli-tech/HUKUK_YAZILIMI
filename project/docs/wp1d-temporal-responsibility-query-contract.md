# WP-1d-0 — Temporal Responsibility Query Contract

> Durum: **SÖZLEŞME (WP-1d-0).** Kod/endpoint/migration/read-model YOK. Cevap modeli + confidence +
> horizon + tenant sınırı + event taxonomy + alt-PR planı sabitlenir.
> Tarih: 2026-06-23 · Baz: `main` (WP-1c hattı kapalı) · Üst bağlam: [[case-responsibility-canonical-model-design.md]] §5.2
> Karar veren: Ulaş · İlke: temporal sorgu YANLIŞ KESİNLİK üretmez (epistemik statü her cevapta açık).

---

## 0. Amaç — cevaplanacak sorular

```text
X tarihinde bu dosyanın Dosya Operasyon Sorumlusu kimdi?
X tarihinde bu dosyanın Hukuki Sorumlu Avukatı kimdi?
Bu (her) sorumluluğu en son kim değiştirdi?
Bu cevap kesin event'e mi dayanıyor, yoksa snapshot/legacy'den mi inferred, yoksa ufuk-öncesi bilinmiyor mu?
```

Temporal sorgunun asıl riski kod değil, **cevabın epistemik statüsü**. Bu yüzden ilk gate = sözleşme.

---

## 1. Confidence modeli (her cevapta ZORUNLU)

| Confidence | Anlam |
|---|---|
| `EVENT_CONFIRMED` | `AuditLog` event-stream'inden kesin: `asOf`'tan önceki son ilgili event bulundu, değer ondan okundu. |
| `INFERRED_FROM_SNAPSHOT` | Event yok; current snapshot (Case/CaseLawyer mevcut hali) veya legacy alandan ÇIKARIM. "Şu an böyle; geçmişe kesin teşmil edilemez." |
| `UNKNOWN_BEFORE_HORIZON` | `asOf`, enstrümantasyon ufkundan (audit yazımının başladığı an) ÖNCE → kesin kayıt yok. |

> **Hukuki dürüstlük kuralı:** Yanlış `EVENT_CONFIRMED` üretmek, hiç cevap vermemekten TEHLİKELİDİR.
> Şüphede → `INFERRED_FROM_SNAPSHOT` veya `UNKNOWN_BEFORE_HORIZON`'a düş.

---

## 2. Cevap modeli (response shape — dondurulur)

```ts
type ResponsibilityConfidence =
  | "EVENT_CONFIRMED"
  | "INFERRED_FROM_SNAPSHOT"
  | "UNKNOWN_BEFORE_HORIZON";

type TemporalResponsibilityResult = {
  caseId: string;
  tenantId: string;
  asOf: string;                       // ISO; sorgu anı
  operationOwner: {
    type: "LAWYER" | "STAFF" | "NONE" | "UNKNOWN";
    id: string | null;                // responsibleLawyerId | responsibleStaffId | null
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;           // AuditLog.id (EVENT_CONFIRMED'de)
    changedByUserId?: string | null;  // AuditLog.userId
    effectiveAt?: string;             // event createdAt
  };
  legalResponsibleLawyer: {
    lawyerId: string | null;
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;
    changedByUserId?: string | null;
    effectiveAt?: string;
  };
  horizon: {
    operationOwnerInstrumentationStartedAt?: string;   // WP-1a/WP-1d-pre merge tarihi ~ ilk owner audit
    legalResponsibleInstrumentationStartedAt?: string;  // CASE_LAWYER audit başlangıcı
    note?: string;
  };
};
```

---

## 3. Event taxonomy — temporal sorgunun OKUYACAĞI event'ler

### 3.1. Operasyon owner (Case.responsibleLawyerId / responsibleStaffId)
**Kaynak: `entityType:'CASE'` AuditLog event'leri.** `entityId === caseId` (caseId DOĞRUDAN var → caseId ile filtrelenebilir ✅).

| Event | action | metadata.changeType | Okunacak alanlar |
|---|---|---|---|
| Create ilk-owner (WP-1d-pre #413) | `CREATE` | `OPERATION_OWNER_INITIALIZED` | `newValues.responsibleLawyerId/StaffId`, `userId`, `createdAt` |
| Owner değişim (WP-1a #410) | `UPDATE` | `OPERATION_OWNER` | `oldValues`/`newValues.responsibleLawyerId/StaffId`, `userId`, `createdAt` |

> Filtre: `entityType='CASE'` AND `entityId=caseId` AND `metadata.changeType IN ('OPERATION_OWNER','OPERATION_OWNER_INITIALIZED')` AND `createdAt <= asOf`, en yeni → owner. Tenant: `tenantId=tenant`.
> NOT: genel CASE UPDATE/DELETE/batch audit'leri (WP-1c-1/2) owner taşımaz; `changeType` filtresi onları DIŞLAR.

### 3.2. Hukuki sorumlu avukat (CaseLawyer.isResponsible)
**Kaynak: `entityType:'CASE_LAWYER'` AuditLog event'leri.** ⚠️ **KRİTİK SINIR:** `entityId === caseLawyerId` (JUNCTION id), **caseId DOĞRUDAN YOK.**

| Event | action | Okunacak alanlar | isResponsible sinyali |
|---|---|---|---|
| addCaseLawyer | `CREATE` | `newValues.{lawyerId,role,isResponsible}`, `userId` | newValues.isResponsible |
| updateCaseLawyer / promote / demote | `UPDATE` | `newValues.{isResponsible,role,demotedCaseLawyerIds}`, `userId` | newValues.isResponsible |
| removeCaseLawyer | `DELETE` | `oldValues.{lawyerId,role,isResponsible}`, `userId` | oldValues.isResponsible |

> **caseId-mapping problemi (WP-1d-0 doğruladı, code-grounded):** CASE_LAWYER audit satırı caseId taşımıyor.
> "caseId X için hukuki sorumlu" sorusu için `caseLawyerId → caseId` eşlemesi gerekir:
> - **Canlı CaseLawyer satırı varsa:** `CaseLawyer.findUnique(caseLawyerId).caseId` ile eşle → `EVENT_CONFIRMED` olabilir.
> - **Silinmiş junction (removeCaseLawyer):** satır yok → caseId'ye eşlenemez → `INFERRED_FROM_SNAPSHOT` veya `UNKNOWN_BEFORE_HORIZON`.
> Bu yüzden **legal-responsible temporal, operation-owner'dan DAHA AZ kesin.** Sözleşme bunu açıkça kabul eder.

---

## 4. Kararlar (kilitli)

**Karar 1 — Tek otorite `AuditLog`.** Ayrı temporal history tablosu YOK. AuditLog = source; temporal service = read/query layer; read-model YALNIZ performans için (sonra, türetilmiş, authoritative değil).

**Karar 2 — Geriye dönük kesinlik yok.** Enstrümantasyon ufku öncesi → `UNKNOWN_BEFORE_HORIZON` (veya snapshot/legacy varsa `INFERRED_FROM_SNAPSHOT`). Uydurma `EVENT_CONFIRMED` yasak.

**Karar 3 — İlk implementation READ-ONLY.** No mutation · no repair · no backfill · no automatic owner correction.

**Karar 4 — Tenant boundary ZORUNLU.** Her sorgu `caseId + tenantId` ile. Başka tenant audit event'i ASLA okunmaz (`AuditLog.tenantId=tenant` her query'de).

**Karar 5 — caseId-mapping sınırı (yeni, code-grounded).** Legal-responsible için CASE_LAWYER→caseId eşlemesi best-effort; eşlenemeyen (silinmiş junction) event confidence'ı düşürür. *İsteğe bağlı ileri-iyileştirme (WP-1d-2-pre): CASE_LAWYER audit'lerine `metadata.caseId` eklemek → ileriye dönük EVENT_CONFIRMED. WP-1d-0 kapsamı DIŞI; ayrı küçük gate.*

---

## 5. Horizon kuralı
- `operationOwnerInstrumentationStartedAt` ≈ ilk `OPERATION_OWNER*` audit'in `createdAt`'i (tenant başına; yoksa null).
- `legalResponsibleInstrumentationStartedAt` ≈ ilk `CASE_LAWYER` audit'in `createdAt`'i.
- `asOf < horizon` → ilgili alan `UNKNOWN_BEFORE_HORIZON`. Snapshot/legacy çıkarımı varsa `INFERRED_FROM_SNAPSHOT` + `note`.

---

## 6. Test matrisi (WP-1d-1/1d-2 için bağlayıcı)

| Senaryo | operationOwner.confidence | Beklenti |
|---|---|---|
| asOf, owner-change event'inden SONRA | EVENT_CONFIRMED | son event'in newValues owner'ı + userId |
| asOf, iki event ARASI | EVENT_CONFIRMED | önceki event'in değeri |
| asOf, create ilk-owner'dan ÖNCE ama instrumentation içinde | EVENT_CONFIRMED veya UNKNOWN | dosya o tarihte yoktu → NONE/UNKNOWN |
| asOf, instrumentation ufku ÖNCESİ, snapshot var | INFERRED_FROM_SNAPSHOT | current owner + "geçmişe teşmil edilemez" note |
| asOf, ufuk öncesi, hiç sinyal yok | UNKNOWN_BEFORE_HORIZON | id=null |
| legal-responsible, canlı CaseLawyer eşlenebilir | EVENT_CONFIRMED | son isResponsible event'i |
| legal-responsible, silinmiş junction (caseId eşlenemez) | INFERRED_FROM_SNAPSHOT / UNKNOWN | confidence düşürülür |
| cross-tenant caseId | — | başka tenant event'i okunmaz; boş/NONE |

---

## 7. Alt-PR planı
| WP | İş | Kod? |
|---|---|---|
| **WP-1d-0** | Bu sözleşme | docs (kod yok) |
| **WP-1d-1** | Operation owner temporal query (read-only servis; CASE events; caseId doğrudan) | evet, read-only |
| **WP-2** | Terminoloji kilidi (ara kazanım) | frontend |
| **WP-1d-2** | Legal responsible temporal query (CASE_LAWYER; caseId-mapping best-effort + confidence) | evet, read-only |
| **WP-1d-3** | Combined: `GET /cases/:id/responsibility-at?asOf=...` (iç servis + rapor) | evet, read-only |
| **WP-1d-4** | UI/report surface | sonra (backend güvenilir olunca) |

**WP-1d-0 merge olmadan WP-1d-1 koduna geçilmez.**

---

## 8. Non-goals
- ❌ Kod / endpoint / read-model / migration / backfill (WP-1d-0'da).
- ❌ Ayrı temporal history tablosu (AuditLog tek otorite).
- ❌ Otomatik owner düzeltme / repair.
- ❌ Geçmiş için uydurma kesinlik.
- ❌ CASE_LAWYER audit'lerine caseId ekleme (ayrı opsiyonel gate WP-1d-2-pre).

## 9. WP-1d-0 kabul kriteri
- ✅ Kod yok (yalnız docs).
- ✅ Confidence modeli (3 seviye) + response shape + horizon + tenant + event taxonomy yazıldı.
- ✅ caseId-mapping sınırı (CASE_LAWYER audit caseId taşımaz) code-grounded olarak belgelendi.
- ✅ Alt-PR planı + test matrisi çıktı.
