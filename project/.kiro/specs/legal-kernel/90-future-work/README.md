---
status: active
review-trigger: continuous
---

# Future Work Registry

Bu klasör, **şu an aktif olmayan ama gelecekte ele alınacak / alınmayacak / araştırılacak** mimari öğeleri tutar.

## Alt Klasörler

| Klasör | İçerik | Sorumluluk |
|---|---|---|
| `deferred/` | Yapılacak ama şimdi değil | Trigger veya date ile review zorunlu |
| `rejected/` | Bilinçli reddedilmiş yönler | Reopen trigger ile review |
| `pending/` | Bilgi eksik, karar verilemedi | **One-cycle timeout** zorunlu |
| `runtime-lab/` | Araştırma/deney alanı | Periyodik value check |
| `escalation-triggers/` | Capability ↔ trigger eşlemesi | Tek tablo, sürekli güncel |

## Anayasal Kural

> **Nothing disappears, but every item must have a review trigger or review date.**

Her dosyanın frontmatter'ı zorunlu:

```yaml
---
status: deferred | rejected | experimental | pending
review-trigger: <açıklama veya tarih>
owner: <isim>           # deferred/pending için zorunlu
---
```

Bkz: `92-architectural-memory.md`
