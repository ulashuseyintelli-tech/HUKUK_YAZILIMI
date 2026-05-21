---
status: active
review-trigger: continuous
---

# Architectural Memory System

**Tarih:** 2026-05-19  
**Durum:** ACTIVE — sürekli yürürlükte  
**Kapsam:** Bu belge, projenin mimari hafızasının nasıl korunacağını tanımlar. İki şey amaçlar: (1) "neden bu kararı aldık?" sorusunun 6 ay sonra cevabını korumak, (2) yapılmayan işlerin kaybolmasını engellemek.

---

## Anayasal Kural

> **Nothing disappears, but every item must have a review trigger or review date.**

Her mimari öğe (fikir, karar, ertelenmiş iş, reddedilmiş yön, deney) **explicit olarak bir kategoriye** atanır. Kategorisiz hiçbir öğe sistemde yer alamaz. Her ertelenmiş öğe ya bir tetikleyici (trigger) ya da bir tarih (date) taşır — sonsuz belirsizlik yasaktır.

---

## Sınıflandırma Kategorileri

Her mimari öğe şu altı kategoriden birine atanır:

| Kategori | Anlamı | Yer | Review Disiplini |
|---|---|---|---|
| **active** | Şu an üzerinde çalışılan iş | `legal-kernel/` ana belgeleri | Sprint review |
| **deferred** | Yapılacak ama şimdi değil | `90-future-work/deferred/` | Trigger veya tarih bazlı |
| **rejected** | Bilinçli reddedilmiş, tekrar tartışmaya açma kuralı var | `90-future-work/rejected/` | Reopen trigger ile |
| **experimental** | Araştırma/deney, üretim path'ında değil | `90-future-work/runtime-lab/` | Çıktı belirsiz, periyodik value check |
| **completed** | Tamamlanmış, historical record | `legal-kernel/` veya `_archive/` | Audit trail için kalıcı |
| **pending** | Bilgi eksik, karar verilemedi | `90-future-work/pending/` | **One-cycle timeout** (aşağıda) |

### Pending-Investigation Timeout Kuralı

> Pending kategorisindeki bir öğe, **bir review cycle içinde** active / deferred / rejected / experimental durumlarından birine geçmek zorundadır.

Bir review cycle = Faz 1 boyunca **2 hafta**, sonra sprint cadence'ına göre.

Pending kategorisi, "bilmiyoruz, araştıracağız" demektir — sonsuz belirsizlik çöplüğüne dönüşmemesi için **timeout zorunludur**. Timeout aşılırsa varsayılan: `deferred` (Decision Owner zorunlu).

---

## Hard Rule #19: Mandatory Classification

`.kiro/specs/legal-kernel/` ve `90-future-work/`'ün altındaki **her .md dosyası** YAML frontmatter ile başlamalı:

```yaml
---
status: active | deferred | rejected | experimental | completed | pending
review-trigger: <trigger-açıklaması veya tarih>
owner: <kişi veya rol>          # deferred/pending için zorunlu
rejection-date: YYYY-MM-DD      # rejected için zorunlu
rejected-by: <kişi>              # rejected için zorunlu
---
```

CI gate: Frontmatter eksik veya geçersiz status değeri olan dosya commit kabul edilmez.

(Implementasyon: bu kural önce **lint warning** olarak başlar, vocabulary unification spec imzalandığı tarih + 2 hafta sonra **CI fail**'a yükseltilir — kademeli geçiş.)

---

## Klasör Yapısı (final)

```
.kiro/specs/legal-kernel/
├── 00-architecture.md                    [active]
├── 01-stabilization-status.md            [completed]
├── 02-frontend-seam-scan.md              [completed]
├── 03-vocabulary-unification.md          [active]
├── 04-deep-scan-findings.md              [completed]
├── 05-engine-consolidation-decision.md   [active]
├── 06-aggregate-boundaries.md            [active — gelecek]
├── 07-event-taxonomy-v1.md               [active — gelecek]
│   ... (Faz 1 belgeleri 06-89 aralığında)
│
├── 90-future-work/                       [governance]
│   ├── README.md
│   ├── deferred/
│   │   ├── README.md
│   │   └── *.md (her bir deferred item)
│   ├── rejected/
│   │   ├── README.md
│   │   └── *.md (her bir rejected idea)
│   ├── runtime-lab/
│   │   ├── README.md
│   │   └── *.md (deneyler, calc-preview kalıntıları)
│   ├── escalation-triggers/
│   │   ├── README.md
│   │   └── triggers.md (capability + technical + business trigger tablosu)
│   └── pending/
│       ├── README.md
│       └── *.md (her pending investigation, timeout date'i ile)
│
├── 91-decision-log/                      [governance — ADR]
│   ├── README.md
│   ├── _template.md
│   ├── ADR-0001-formalize-vs-rewrite.md
│   ├── ADR-0002-policy-vs-runtime-split.md
│   ├── ADR-0003-no-frontend-legal-inference.md
│   ├── ADR-0004-keep-both-engines.md
│   └── ...
│
└── 92-architectural-memory.md            [bu belge — governance]
```

**Numaralandırma kuralı:** İçerik belgeleri 00-89, governance/meta belgeleri 90-99. 90/91/92 her zaman listenin sonunda görünür.

---

## Governance Strangler Fig

Bu sistem **kendi inşa diline tabidir**. Yani:
- Aynı zamanda bir governance system'i olduğumuz için governance'ı kurmaya çalışırken governance'ı genişletmek tuzağına düşmek kolay
- Bu yüzden minimal scaffolding ile başla, organic genişlet
- Bulk historical audit (mevcut 57 spec'in classification'ı) **şimdi yapılmaz** — `93-historical-audit.md` ayrı bir görev olarak deferred kategoride bekler

Strangler kuralı: **Governance ana işi boğmamalıdır.** Ana iş = Faz 1 (vocabulary freeze + aggregate boundaries + event taxonomy + kernel formalize).

---

## Review Cadence (Faz 1 boyunca)

| Frekans | İş |
|---|---|
| Her sprint sonu (2 hafta) | Active items review (`legal-kernel/00-89`) |
| Her sprint sonu | Pending items: timeout aşan var mı? |
| Ay sonu | Deferred items: trigger yaklaşan var mı? |
| Çeyrek sonu | Rejected items: reopen trigger gerçekleşti mi? |
| Çeyrek sonu | Runtime-lab: hangi deney domain'e döndü, hangisi silindi? |

---

## Mevcut 57 Spec'in Durumu

`.kiro/specs/` ve `HUKUK_YAZILIMI/project/.kiro/specs/` altındaki diğer 50+ spec **şu an classify edilmemiştir**. Bu bilinçli bir karardır:

- Şimdi yapmak ana işi (Faz 1 vocabulary freeze) boğar
- Tek seferlik bulk audit ayrı bir görev olarak `93-historical-audit-plan.md` belgesinde **deferred** durumda bekler
- Bu görevin trigger'ı: "Faz 1 vocabulary freeze tamamlandığında"

Bu istisna **Hard Rule #19'un istisnası değildir** — Hard Rule #19 sadece `legal-kernel/` ve `90-future-work/` altındaki dosyalar için geçerli. Diğer spec'ler şimdilik Hard Rule kapsamı dışında.

---

## Anayasal Cümleler (Tüm projede)

Tek yerde toplanmış halde:

1. **Legal facts are immutable. Interpretations are rebuildable.** (00-architecture)
2. **Policy karar verir, runtime kayıt altına alır.** (05-engine-consolidation)
3. **Frontend may not infer legal truth.** (Hard Rule #13)
4. **Nothing disappears, but every item must have a review trigger or review date.** (bu belge)
5. **Governance ana işi boğmamalıdır.** (governance strangler fig)

---

## Onay

**v1 onay:** 2026-05-19 (ulas / dev)
