---
status: deferred
owner: ulas
review-trigger: "İlk Yargıtay yorum değişikliği gündeme gelir veya bir case'in geçmişe yönelik faiz hesabı gerekirse"
depends-on: "Faz 1 — INTEREST_POLICY_ASSIGNED event ve interpretation_profile_id zorunlu olmalı"
---

# Interpretation Profile Switching

## Why deferred

Şu an `interpretation_profile_id` event payload'ında zorunlu (Hard Rule #1) ama default profile ile çalışıyoruz. **Profile değiştirme** (örn `TBK100_v1` → `TBK100_v2`) ayrı bir event tipi gerektirir: `INTERPRETATION_PROFILE_CHANGED`.

Bu event:
- Bir case için yorumu değiştirir
- Past payments retroactive recalc edilir mi seçilir
- Gerekçe alanı zorunlu (Yargıtay X kararı sonrası vs.)

İlk kernel'de bir hata olursa: yeni `PAYMENT_REVERSED` + yeni `PAYMENT_RECEIVED` ile düzeltilir. Profile change yok.

## Trigger to start

- İlk Yargıtay yorum değişikliği gündeme gelir (örn TBK 100 mahsup sırası kararı)
- Bir case'in geçmişe yönelik faiz hesabı gerekirse (mahkeme bilirkişi raporu farklı yorum talep ederse)

## Risk if delayed

- Düşük. İlk kernel'de yorum değişimi nadir.
- Vocabulary'de yer ayrıldı (`INTERPRETATION_PROFILE_CHANGED` event tipi listede), implementation Faz 2.
