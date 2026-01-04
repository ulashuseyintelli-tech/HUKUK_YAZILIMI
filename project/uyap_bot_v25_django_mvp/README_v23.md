# UYAP Bot v23 – Extractors + Minimal Decision Loop

Yeni:
1) Extractor engine:
   - core/extractor_engine.py
   - read_table/query action sonucu rows -> Fact üretir (extractors listesi ile)

2) Minimal decision engine:
   - core/decision_engine.py
   - Fact türlerine göre bir sonraki recipe'leri job olarak enqueue eder (MVP mapping)

3) Runner hook:
   - recipe action içinde extractors alanı varsa Fact üretir + next jobs oluşturur

Örnek recipe action:
- type: read_table
  table: TABLE_VEHICLE_ROWS
  extractors:
    - fact_type: AssetFound
      key_fields: ["asset_fingerprint"]
      when: "plate != ''"
      map:
        asset_type: "vehicle"
        asset_fingerprint: "vehicle:plate:{plate}"
        attributes:
          plate: "{plate}"
          make: "{make}"
          model: "{model}"
          year: "{year}"

Not:
- Bu sürüm decision_rules bundle yerine MVP sabit mapping kullanır.
  Sonraki sürümde decision_rules_v4.yaml DB bundle'a bağlanır.

Tarih: 2026-01-04
