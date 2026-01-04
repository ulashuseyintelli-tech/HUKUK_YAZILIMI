# UYAP Bot v17 – UI Worker Adapter Interface

Yeni:
- core/ui_worker.py
  - UiWorker arayüzü (navigate/click/read_table/fill_form/select_row)
  - MockUiWorker: gerçek UYAP olmadan test için deterministik dummy data

- core/recipe_runner.py
  - Artık ui_worker adapter ile action type dispatch yapıyor
  - Her UI op -> Snapshot + JobStep
  - UI fail -> RunnerError -> job FAILED

Test:
1) ACTIVE recipe pack içine actions ekle:
   actions:
     - type: click
       button: BTN_SORGULA
     - type: read_table
       table: TABLE_ETEBLIGAT_ROWS
2) MockUiWorker ile 2 satır döner, job steps loglanır.

Sonraki:
- RealUiWorker (Playwright/Selenium/Windows UIA) adapter'i.
- Evidence: screenshot capture + raw DOM.
Tarih: 2026-01-04
