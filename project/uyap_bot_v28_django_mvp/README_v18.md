# UYAP Bot v18 – RealUiWorker (Playwright) Adapter

Yeni:
- core/real_ui_worker_playwright.py
  - PlaywrightUiWorker: UiWorker arayüzünü gerçek tarayıcıyla uygular
  - locator_resolver.py ile UiMapBundle.content içindeki `locator_bindings` anahtarlarını gerçek selector'a çevirir
  - screenshot evidence üretir (exports/evidence)

- core/recipe_runner.py
  - env REAL_UI=1 ise PlaywrightUiWorker kullanır, değilse MockUiWorker
  - env:
    - REAL_UI=1
    - PW_HEADLESS=0/1
    - PW_BASE_URL=<landing page>
    - PW_SLOWMO_MS=100 (opsiyonel)

Kurulum:
1) pip install -r requirements.txt
2) python -m playwright install chromium

UiMapBundle örnek locator_bindings:
locator_bindings:
  buttons:
    BTN_SORGULA: "css=button:has-text('Sorgula')"
  tables:
    TABLE_ETEBLIGAT_ROWS: "css=table tbody tr"
  fields:
    FIELD_DOSYA_NO: "css=input[name='dosyaNo']"

Uyarı:
- Bu adapter framework'tür. Hedef uygulamaya özel selector'lar sizin UiMap bundle'ınızda olmalı.

Tarih: 2026-01-04
