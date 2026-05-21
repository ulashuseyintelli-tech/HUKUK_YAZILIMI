---
status: active
review-trigger: monthly
---

# Deferred Work

Yapılacak ama şimdi değil. Her madde:
- **Why deferred:** Niye şimdi değil
- **Trigger to start:** Hangi koşulda başlar
- **Depends on:** Önce ne tamamlanmalı
- **Risk if delayed:** Ertelemenin maliyeti
- **Decision owner:** Karar sahibi
- **Next review:** Tarih veya trigger

## Format

Her deferred item kendi `.md` dosyasında, frontmatter zorunlu:

```yaml
---
status: deferred
owner: <kişi>
review-trigger: <açıklama veya YYYY-MM-DD>
depends-on: <belge veya iş>
---

# Item Name

## Why deferred
...

## Trigger to start
...

## Risk if delayed
...
```

## Mevcut Items

Bkz dosya listesi.
