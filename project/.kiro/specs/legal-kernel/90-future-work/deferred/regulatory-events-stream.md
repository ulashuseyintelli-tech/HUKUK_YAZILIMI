---
status: deferred
owner: ulas
review-trigger: "İlk içtihat değişimi case hesabını etkilediğinde"
depends-on: "Interpretation profile switching aktif olmalı"
---

# Regulatory Events Stream

## Why deferred

`reference_data_events` stream'inin ileri seviye versiyonu. İçtihat değişiklikleri, mevzuat değişikliği, Yargıtay yorum kaymaları için ayrı stream:

```
case_events           — case'e özel hukuki olaylar
reference_data_events — TCMB rate, tarife yıl değişimi (Faz 1'de var)
regulatory_events     — içtihat, mevzuat (Faz 2/3)
```

Şu an `interpretation_profiles` tablosu (per-firm/avukat) yeterli — Yargıtay'ın yayın tarihi değil, firmanın karara uyma tarihi kayıt altına alınıyor.

## Trigger to start

- Bir Yargıtay kararı somut olarak case faiz hesabını değiştirir
- Birden fazla case için aynı yorum değişikliği uygulanmak istenirse (toplu profile change)

## Risk if delayed

- Düşük. Mevcut `interpretation_profiles` (per-case) yeterli kapsama sağlıyor.
