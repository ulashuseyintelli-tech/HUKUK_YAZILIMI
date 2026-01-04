# UYAP Bot v27 – compute + decisions (risk/recovery)

Yeni:
- decision_rules 'then' bloğu artık:
  - compute:
    - "risk = RiskScoring"
    - "expected_recovery = RecoverySimulator"
  - decisions:
    - if: "risk.score >= 85"
      then: open_lock / set_flag / emit / enqueue ...
    - if: "expected_recovery.flags.ok_for_cost_actions == false" ...

Çıktılar:
- Hesaplanan sonuçlar Fact(fact_type="Computed") olarak yazılır:
  - key="risk"
  - key="expected_recovery"

MVP kısıt:
- Compute input'ları DB'deki son ValuationEstimate ve ContextUpdated fact'lerinden toplanır.
- Parametrik eşikler şu an varsayılan (85 ve min_net=25000). v28'de ParamBundle'dan gelir.

Tarih: 2026-01-04
