---
status: active
review-trigger: quarterly
---

# Runtime Lab

Araştırma / deney alanı. Üretim path'ında değil. Mevcut `apps/api/src/modules/calc-preview/diagnostics/` altındaki bileşenlerin (drift guard, adaptive control, shadow rollout, chaos harness, synthetic load) kavramsal listesi.

## Amaç

Bu klasör **kod tutmaz**, sadece bu bileşenlerin **statüsünü, hangi değer ürettiğini, ne zaman silineceğini veya production path'ina çıkacağını** belgeler.

## Format

```yaml
---
status: experimental
review-trigger: quarterly
value-check-cycle: 90 days
---

# Lab Item Name

## What It Does
Teknik olarak ne yapıyor?

## Why Experimental
Üretim path'ında olmama nedeni?

## Value So Far
3 ayda ne öğrendik? Bulduğu sorunlar?

## Promotion Criteria
Hangi koşulda production path'a çıkar?

## Removal Criteria
Hangi koşulda silinir?
```

## Mevcut Lab Bileşenleri

Mevcut `calc-preview/diagnostics/` altındaki bileşenler (Faz 1'de **dokunulmaz**, Faz 2'de buraya yeniden adlandırılarak taşınacak):

- drift-guard
- adaptive-control (sd-2, sd-3, sd-25, sd-26)
- shadow-rollout (stage-0, stage-1)
- chaos-harness
- synthetic-load
- governance-experiments (ironic — burayı bu sistem yedi)

Faz 1 sonunda her birinin promotion / removal değerlendirmesi yapılır.

## Disiplin

- Lab silinse domain çalışmaya devam eder (core-runtime'a bağımlılık tek yönlü)
- Lab → core-runtime'ı observe edebilir
- Domain → lab'i import edemez (CI gate)

## Mevcut Items

Bkz dosya listesi.
