# SUPERSEDED PLAN HASHES — T5

<!-- GOV-COORD-AUTHORITY kind=PLAN_SUPERSESSION recordId=T5-PLAN-BASE-POLICY-REFRESH-R01 -->

```text
Record ID  : T5-PLAN-BASE-POLICY-REFRESH-R01
Owner task : T5-PLAN-BASE-POLICY-REFRESH-AND-EXECUTION-RESUME-R01
Date       : 2026-07-27
Scope      : yalnız aşağıdaki iki task. Contract'ı veya gelecekteki
             task'ları değiştirmez.
```

Bu dosya hiçbir planı silmez. Hangi hash'lerin **çalıştırılamaz** olduğunu
kaydeder. Tarihsel plan, review ve kanıt belgeleri yerinde durur ve okunabilir.

## Neden

`STRICT_PINNED_BASE` bu iş akışında **inşa gereği** sağlanamıyor:

```text
plan ratification ve execution grant kanıtı canonical main'e MERGE edilmek zorunda
  ( ownerRatificationEvidence commit'i main ancestor'ı olmalı )
her merge main'i planın üretim base'inin ötesine taşır
  -> preflight'ta origin/main != baseSha
  -> BLOCKED_BASE_SHA_DRIFT
```

Yani plan, kendi yetki artefaktları kanonikleştikten sonra kendi preflight'ını
geçemez. Owner bu iki task için `REFRESH_BEFORE_EXECUTION` politikasını
onaylamıştır.

Bu, kapının zayıflatılması değildir: drift kapısının **çalışır hâle gelmesi**
(PR #1649) bu çelişkiyi görünür kıldı. Kapı bozukken iki plan da bayat base
üzerinde sessizce koşacaktı.

## Superseded — base refresh nedeniyle

```text
COLLECTION  RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
  hash       4a84fe4c658d0370219840bbc4fc9af29b1fe5747e9be9494fd43c5586bd407e
  plan       task-plans/COLLECTION/plan.v1.json
  policy     STRICT_PINNED_BASE   baseSha 64d54732ffffc3246ac03af242e0ec9611fc0222
  disposition SUPERSEDED_BY_BASE_REFRESH
              NOT VALID FOR NEW GRANT · NOT VALID FOR T5 EXECUTION
              HISTORICAL REVIEW EVIDENCE PRESERVED
  replaced by task-plans/COLLECTION/plan.v2.json

OFFICE      OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
  hash       056cd7584ffb2eca95b0d06f6dfe33998a633ada18016f1e0d6652038ea0689b
  plan       task-plans/OFFICE/plan.v2.json
  policy     STRICT_PINNED_BASE   baseSha 6ec070d41b83bb89860f8401965250717f563672
  disposition SUPERSEDED_BY_BASE_REFRESH
              NOT VALID FOR NEW GRANT · NOT VALID FOR T5 EXECUTION
              HISTORICAL REVIEW EVIDENCE PRESERVED
  replaced by task-plans/OFFICE/plan.v3.json
```

Her iki hash'in adversarial review kanıtı geçerliliğini korur ve yenilenen
planların review'ında temel alınır — çünkü **semantik içerik değişmemiştir**;
yalnız `baseDriftPolicy` ve `baseSha` yenilenmiştir. Tur sayıları artefakta göre
farklıdır:

```text
COLLECTION  boundary-review.v1.md            3 tur
OFFICE      boundary-review.v1.md            3 tur
OFFICE      plan.v2 adversarial review       4 tur (R1/R2/R3 FAIL, R4 PASS)
```

Yenilenen planlar bunlara ek olarak kendi bağımsız review'larından geçmiştir;
immutable bayt ve hash değiştiği için önceki turlar tek başına yeterli
sayılmamıştır.

## Ayrıca yasak — daha önceki OFFICE hash'i

```text
c337cae59c0a28da4018d7666e64701881bc4fc5892098428fd572eea3af3b27
  disposition SUPERSEDED / NOT RATIFIABLE
  kaynak      decision-log.md -> OFFICE-CAP02-REPORTINGLINE-READ-
              CHARACTERIZATION-R01-AUTHORITY
  not         base refresh ile ilgisizdir; CAP-09A SLICE 3 dönemine aittir ve
              owner tarafından ayrıca reddedilmiştir. Şablonu
              grant.template.SUPERSEDED.json olarak yeniden adlandırılmıştır.
```

## Grant kuralı

```text
T5 execution grant'ları YALNIZ yenilenen hash'leri referans alabilir.
Yukarıdaki üç hash'ten herhangi birini pinleyen bir grant geçersizdir.
```

---

**IMPLEMENTATION AUTHORITY: NONE.** Bu kayıt bir disposition kaydıdır; hiçbir
task, grant veya merge yetkisi üretmez.
