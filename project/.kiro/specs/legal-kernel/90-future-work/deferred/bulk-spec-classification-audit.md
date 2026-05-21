---
status: deferred
owner: ulas
review-trigger: "Faz 1 (vocabulary freeze + aggregate boundaries + event taxonomy) tamamlandığında"
depends-on: "Faz 1 active belgeler kapanır"
---

# Bulk Classification Audit (57 Spec)

## Why deferred

`.kiro/specs/` ve `HUKUK_YAZILIMI/project/.kiro/specs/` altında 57+ spec var (sd-1, sd-2, sd-25, sd-26, stage-0, stage-1, phase-9-13, ci-carrier, vs.). Bunların çoğu hâlihazırda completed durumda ama **hiçbir yere classified değil**.

Şimdi yapmak:
- Ana iş (Faz 1 vocabulary freeze + aggregate boundaries) zihinsel context switch yaratır
- Tarihsel cleanup'a dönüştürür momentumu öldürür
- Governance system'i kendi başına bir iş haline getirir (governance strangler ihlali)

## Trigger to start

- Faz 1 vocabulary freeze tamamlandığında (`03-vocabulary-unification.md` matris dolduğunda)
- Veya: yeni geliştirici onboarding gerektiğinde (mevcut spec haritası gerekli olur)

## Plan (yapılacağı zaman)

1. `.kiro/specs/` ve `HUKUK_YAZILIMI/project/.kiro/specs/` altındaki 57 spec'i tara
2. Her birine status öner (most likely "completed" veya "experimental")
3. ulas onayı
4. `.kiro/specs/_archive/completed/` ve `_archive/experimental/` klasörlerine taşı
5. Aktif spec listesi `legal-kernel/` ve birkaç tane Faz 1 spec'iyle sınırlı kalır

## Risk if delayed

- Düşük (governance system zaten Hard Rule #19 ile yeni spec'lere classification zorunlu kılıyor)
- Mevcut 57 spec dağınık ama mevcut kullanım path'inde değil
