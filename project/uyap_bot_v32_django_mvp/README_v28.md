# UYAP Bot v28 – Parametrik compute (risk/recovery bundles)

Yeni:
- compute modülleri artık ParamBundle'dan parametre okur:
  - bundle_kind='risk' ACTIVE -> risk params
  - bundle_kind='recovery' ACTIVE -> recovery params

Dosyalar:
- core/compute_params_loader.py
- core/compute_modules.py (parametreli)
- core/decision_engine.py (param bundle entegre)

Kurulum:
1) migrate (ParamBundle.bundle_kind zaten var)
2) Admin'den 3 ParamBundle oluştur ve ACTIVE yap:
   - decision_rules (bundle_kind=decision_rules) -> core/example_decision_rules.yaml
   - risk (bundle_kind=risk) -> core/example_risk_params.yaml
   - recovery (bundle_kind=recovery) -> core/example_recovery_params.yaml

Tarih: 2026-01-04
