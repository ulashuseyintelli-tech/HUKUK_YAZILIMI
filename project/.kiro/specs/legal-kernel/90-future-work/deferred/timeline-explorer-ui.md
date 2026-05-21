---
status: deferred
owner: ulas
review-trigger: "Tek bir case 10k+ timeline entry'ye ulaşır veya audit/debug ekibi günlük 5+ kez timeline taraması yapar"
depends-on: "Faz 1 (event taxonomy + projection) stabilize"
---

# Timeline Explorer UI / Visual Tooling

## Why deferred

Faz 1'de event sayısı az (~9 event tipi başlangıç) → console SQL + mevcut TimelineService API yeterli. Faz 2'de tebligat domain'i eklenince timeline karmaşıklaşır → o zaman görsel araç şart olur.

Visual tooling kapsamı:
- Timeline explorer (zaman çizelgesi görselleştirme)
- Causality inspector (caused_by zinciri görselleştirme)
- Event graph viewer (case-level event ağacı)
- Replay UI (geçmiş bir tarihteki state'i yeniden inşa et + göster)

## Trigger to start

- Bir case'in timeline'ı 10k+ entry'ye ulaşır → console manuel tarama yetersiz kalır
- Audit/debug ekibi günlük 5+ kez timeline taraması yapar (operasyonel sıklık)
- Hukuk müşteri "şu tarihte ne oldu görmek istiyorum" özelliğini explicit talep eder

## Risk if delayed

- Düşük (Faz 1'de ihtiyaç yok)
- Faz 2'de tebligat geldikten sonra ihtiyaç kritikleşir
