# UYAP Bot v19 – DSL + Degraded Mode + Evidence in Audit Export

Yeni:
1) DSL action genişletme:
   - wait_for (selector_key, timeout_ms)
   - expect_text (selector_key, text, timeout_ms)

2) Degraded mode:
   - core/degraded_mode.py
   - Degraded mode açıkken controlled_write/high_impact_write job'lar BLOCKED olur.

3) Audit export artık screenshot'ları da zip'e ekler:
   - core/audit_export.py

Not:
- Degraded mode işaretini şimdilik UiMapBundle içinde "degraded_mode: true" ile tutuyoruz (MVP hack).
  Üretimde ayrı config tablosu önerilir.

Tarih: 2026-01-04
