---
status: active
review-trigger: continuous
---

# Rejected Ideas

Bilinçli olarak reddedilmiş mimari yönler. Burada olmaları sürekli reddedildikleri anlamına gelmez — her birinin bir **reopen trigger**'ı var. Trigger gerçekleşirse karar yeniden değerlendirilir.

## Format

Her rejected item kendi `.md` dosyasında:

```yaml
---
status: rejected
rejection-date: YYYY-MM-DD
rejected-by: <kişi>
review-trigger: <reopen koşulu>
---

# Idea Name

## Reason for Rejection
...

## Reopen Trigger
Bu fikir şu durumda yeniden gündeme gelir: ...

## What Was Considered Instead
...
```

## Disiplin

- Reject etmek **silmek değildir**. Tarih + kişi + sebep zorunlu.
- Aynı fikir 6 ay sonra tekrar gündeme gelirse: önce buradan oku.
- Reopen trigger gerçekleştiyse, ADR aç ve kararı revize et.

## Mevcut Items

Bkz dosya listesi.
