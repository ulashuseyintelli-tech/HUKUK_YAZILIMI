# WP-1d-5-10 — D4 Zero-Responsible Data Audit + Exactly-One Design

> **Tür:** DOCS / FORENSIC / READ-ONLY DATA AUDIT. Kod / endpoint / UI / migration / schema / DB-write YOK.
> **Bağlam:** Legal Responsibility write-path hattının D4 invariant değerlendirmesi. Codex domain DEĞİL.
> **Baseline:** main `89dd6f6` (WP-1d-5-9 / #483 merge sonrası), 2026-06-25.
> **Önceki:** D4 ERRATA (`wp1d5-...-product-legal-decisions.md` §7) · lifecycle karar notu (`wp1d5-caselawyer-lifecycle-...-decision-note.md`).

---

## 1. Amaç (Purpose)

`CaseLawyer.isResponsible` için **D4 exactly-one** invariant durumunu kanıtlamak:
- DB zaten **at-most-one** sağlıyor mu? (Evet — doğrulandı.)
- Aktif dosyalarda **zero-responsible** var mı? (Read-only veri audit.)
- Varsa kaynağı: runtime data cleanup mı, app-guard eksiği mi, meşru legacy/horizon mu?
- Exactly-one için sonraki adım: migration mı, data cleanup mı, app-guard mı, yoksa **no-action** mı?

Net çerçeve: **exactly-one = at-most-one + at-least-one.** at-most-one DB'de var; bu not at-least-one (zero-responsible) tarafını veriyle kanıtlar.

---

## 2. WP-1d-5-9 Sonrası Baseline

Hukuki sorumlu yazımı artık şu yollarla yönetiliyor:
- **Kanonik:** `PATCH /cases/:id/legal-responsible-lawyer` (#474; ADMIN+reason+changeType audit).
- **#480:** `updateCaseLawyer` responsible eksenini reddeder.
- **#483:** `addCaseLawyer` mevcut sorumlu varken RESPONSIBLE reddeder/ASSIGNED'a indirir; `removeCaseLawyer` mevcut sorumluyu silmeyi reddeder (auto-promote kaldırıldı).
- **Kabul edilmiş istisnalar:** `create()` dedupe (tam-1 normalizasyon) + ilk responsible initialization.

---

## 3. Mevcut DB Invariant: At-Most-One

DB partial unique index **`case_lawyer_one_responsible_per_case ON "CaseLawyer"("caseId") WHERE "isResponsible"=true`** (migration `20260619000000`, #229) → dosya başına **en fazla bir** responsible. P2002 → `toCaseLawyerConflict` → 409.

**Doğrulama (read-only):** `SELECT "caseId", COUNT(*) FROM "CaseLawyer" WHERE "isResponsible"=true GROUP BY "caseId" HAVING COUNT(*)>1` → **boş ([])**. >1 responsible olan dosya YOK. ✔

DB **at-least-one'ı zorlamaz** (partial unique sıfır-responsible'ı engellemez; bir relation "en az bir satır" DB-constraint'iyle ifade edilemez). Dolayısıyla at-least-one **uygulama/sinyal** katmanının sorumluluğudur.

---

## 4. App-Level Exactly-One Guards

| Akış | at-most-one | at-least-one |
|---|---|---|
| `create()` | planResponsible dedupe (çoklu→tek) | lawyer varsa fallback promote (≥1); **lawyer YOKSA sıfır=meşru (ownerless)** |
| `addCaseLawyer` (#483) | mevcut sorumlu korunur, 2.-yapılmaz | ilk lawyer PARTNER/MANAGER → RESPONSIBLE; **AUTHORIZED/LAWYER/INTERN ilk eklenirse ASSIGNED → o an 0-responsible mümkün** |
| `removeCaseLawyer` (#483) | — | mevcut sorumlu **silinemez** → 1→0'a düşürülemez |
| `updateCaseLawyer` (#480) | eksen reddedilir | eksen reddedilir |
| kanonik uç (#474) | clear-before-set | tam-1 invariant (409) |

**At-least-one boşluğu (yumuşak):** zero-responsible iki yoldan **meşruca** doğabilir — (a) **lawyer-siz/ownerless dosya** (allowNone; operasyon-sorumlusu ekseni), (b) **ilk ve tek lawyer'ın non-responsible (AUTHORIZED+) eklenmesi**. Bu durum `LEGAL_RESPONSIBLE_MISSING` **read-side warn sinyaliyle** (aktif + operasyon-owner PERSONEL + 0 responsible) görünür kılınır; **BLOCK yok** (WP-3a; `case.service.ts` getStats + filter).

---

## 5. Read-Only Data Audit Yöntemi

- **psql YOK** → standalone Prisma (kanonik `apps/api/node_modules/@prisma/client`) ile OS-temp `.cjs`; URL `.env`'den env-değişkeniyle geçirildi (parola loglanmadı/yazılmadı); script çalıştıktan sonra **SİLİNDİ**.
- **Yalnız** `count` / `groupBy` / `$queryRaw SELECT`. **Hiçbir write yok.**
- Aktif filtre = `Case.status = 'ACTIVE'` (`CaseStatus` enum; `LEGAL_RESPONSIBLE_MISSING` sinyali + getStats ile aynı kanonik tanım).

---

## 6. Local/Dev Audit Sonuçları

```
DB: postgresql://postgres:***@localhost:5432/hukuk_db   (tek deployment DB; ayrı prod YOK)
environment: local/dev   read-only: EVET   active filtresi: Case.status='ACTIVE'

totalCases:                          2
byStatus:                            ACTIVE=2 (CLOSED/SUSPENDED/ARCHIVED=0)
activeTotal:                         2
activeZeroLawyer:                    0
activeZeroResponsibleTotal:          0
activeZeroResponsibleWithLawyers:    0
activeWithResponsible:               2   (her aktif dosyada tam-1 responsible)
legalResponsibleMissingSignal:       0
gt1Responsible:                      []  (at-most-one index tutuyor)
tenantZeroRespActive:                []
nonActiveZeroResponsible:            0
```

**Caveat:** dev DB **2 test dosyası** içeriyor — temsili değil. Sonuç **CLEAN** ama örneklem küçük; uygulama henüz gerçek üretim kullanımında değil.

---

## 7. Production Audit Query / Owner-Run Requirement

**Bu repo'da ayrı bir production DB YOK** (`dev-db-connection`: tek DB). Yukarıdaki localhost DB tek deployment DB'sidir; gerçek veri biriktiğinde aynı read-only sorgu **owner tarafından** yeniden koşulmalıdır. Claude prod'da işlem yapmadı/yapmaz.

Owner-run (psql, read-only):

```sql
-- D4 zero-responsible audit. active = Case.status='ACTIVE'. SADECE SELECT.
WITH per_case AS (
  SELECT c.id, c."tenantId", c.status,
    (SELECT COUNT(*) FROM "CaseLawyer" cl WHERE cl."caseId" = c.id) AS lawyer_count,
    (SELECT COUNT(*) FROM "CaseLawyer" cl WHERE cl."caseId" = c.id AND cl."isResponsible" = true) AS resp_count
  FROM "Case" c
)
SELECT
  COUNT(*) FILTER (WHERE status='ACTIVE')                                   AS active_total,
  COUNT(*) FILTER (WHERE status='ACTIVE' AND lawyer_count=0)                AS active_zero_lawyer,
  COUNT(*) FILTER (WHERE status='ACTIVE' AND resp_count=0 AND lawyer_count>0) AS active_zero_resp_with_lawyers,
  COUNT(*) FILTER (WHERE status='ACTIVE' AND resp_count=1)                  AS active_exactly_one,
  COUNT(*) FILTER (WHERE status='ACTIVE' AND resp_count>1)                  AS active_gt1
FROM per_case;
```

---

## 8. Risk Sınıflandırması

| Durum | Bulundu mu (dev) | DB-zorunlu? | Risk | Not |
|---|:--:|:--:|:--:|---|
| >1 responsible / aktif | Hayır (0) | Evet (at-most-one) | YOK | partial unique index tutuyor |
| 0 responsible, lawyer var / aktif | Hayır (0) | Hayır | DÜŞÜK | addCaseLawyer non-responsible-first ile teorik mümkün; warn-surface'li |
| 0 responsible, 0 lawyer / aktif (ownerless) | Hayır (0) | Hayır | DÜŞÜK-MEŞRU | lawyer-siz dosya meşru; exactly-one zorlanamaz |
| operasyon-owner PERSONEL + 0 responsible (MISSING sinyal) | Hayır (0) | Hayır | DÜŞÜK | `LEGAL_RESPONSIBLE_MISSING` zaten kırmızı bayrak |
| legacy/import kaynaklı 0-responsible | Hayır (0) | — | — | dev'de yok; gerçek veride owner-run ile bakılır |

---

## 9. Karar Matrisi

| Kod | Uygulanır mı | Gerekçe |
|---|:--:|---|
| `D4_AUDIT_CLEAN_NO_ACTION` | **EVET (dev)** | 0 zero-responsible, 0 >1-responsible; at-most-one tutuyor. Migration/cleanup gereksiz. |
| `D4_REQUIRES_APP_GUARD_ONLY` | **EVET (çerçeve)** | exactly-one = **at-most-one (DB) + at-least-one-when-applicable (app/warn)**. at-least-one DB-constraint'le ifade edilemez (lawyer-siz dosya meşru). |
| `D4_REQUIRES_DATA_CLEANUP_PLAN` | HAYIR | temizlenecek zero-responsible kaydı yok. |
| `D4_REQUIRES_DB_DESIGN_BUT_NOT_NOW` | HAYIR | DB at-least-one constraint infeasible + gerekmiyor. |
| `D4_BLOCKED_PENDING_PROD_DB_AUDIT` | KISMEN | ayrı prod yok; gerçek veri birikince owner-run §7 sorgusu (düşük öncelik). |

**Karar:** `D4_AUDIT_CLEAN_NO_ACTION` + `D4_REQUIRES_APP_GUARD_ONLY`. Migration/schema/cleanup AÇILMAZ. Exactly-one, "at-most-one DB + at-least-one app/warn" olarak **kabul edilmiş istisnalarla** (ownerless / lawyer-siz dosya) birlikte **karşılanmış** sayılır.

**Tek açık yumuşak boşluk (DÜŞÜK):** `addCaseLawyer` ilk ve tek lawyer'ı non-responsible (AUTHORIZED/LAWYER/INTERN) eklerse aktif dosya 0-responsible kalabilir. Şu an veri 0; `LEGAL_RESPONSIBLE_MISSING` görünürlük veriyor. İstenirse (ayrı, düşük-öncelikli gate) `addCaseLawyer`'da "aktif dosyada hiç responsible yoksa ilk lawyer responsible olsun veya warn" app-guard'ı eklenebilir — **bu gate'in kapsamında DEĞİL, gerekli DEĞİL.**

---

## 10. Açık Non-Goals

Kod · migration · schema · DB write · data cleanup · endpoint · UI · audit-write implementation · full RBAC · permission store · owner clear-to-none · Codex domain = **YOK.** Bu not yalnız **kanıtlar + karar altına alır.**

---

## 11. Önerilen Sonraki Gate

```
D4 durumu: AUDIT_CLEAN_NO_ACTION (dev veri temiz) + APP_GUARD_ONLY çerçevesi.
→ ZORUNLU sonraki gate YOK. Migration/cleanup gerekmiyor.

Opsiyonel / düşük öncelik (yalnız açık onayla):
- Gerçek veri birikince §7 owner-run audit tekrarı.
- (İstenirse) addCaseLawyer at-least-one soft app-guard — ayrı küçük gate.
```

**WP-1d-5 write-path stratejisi sonuç durumu:** generic update bypass KAPANDI (#480) · lifecycle silent replacement/removal bypass KAPANDI (#483) · kanonik change path KURULDU (#474) · at-most-one DB-enforced + veri temiz (#229 + bu audit) · at-least-one app/warn ile karşılandı + kabul edilmiş istisnalar (ownerless / initial / create-dedupe) belgelendi. **D4 dahil WP-1d-5 hattı kapanışa hazır; kalan tüm öğeler düşük-öncelik/opsiyonel ve açık-onay-gerektiren.**
