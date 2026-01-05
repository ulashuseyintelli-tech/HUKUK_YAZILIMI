# UYAP Bot v25 – Predicates in decision_rules (fact filters)

Yeni:
- decision_rules artık koşul destekli:
  - fact:Type(field=='value')
  - fact:Type(field!='value')
  - fact:Type(field in ['a','b'])
  - nested field: attributes.plate gibi

Örnek:
when: "fact:AssetFound(asset_type=='vehicle')"

Runner:
- extractor snapshot'ından üretilen Fact kayıtlarını alır
- decision engine'e Fact objesi vererek predicate'i değerlendirir
- eşleşen rule -> enqueue recipes

Tarih: 2026-01-04
