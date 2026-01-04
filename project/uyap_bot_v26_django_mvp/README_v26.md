# UYAP Bot v26 – 'then' actions executor (enqueue/locks/flags/emit)

Yeni:
- decision engine artık sadece enqueue etmiyor.
- then içinde şu aksiyonlar çalışır:
  - enqueue: [recipe_id...]
  - open_lock: "LOCK_..."
  - set_flag: {key: value}
  - emit: "EVENT_NAME" veya ["E1","E2"]

Uygulama:
- core/decision_engine.py -> run_decision_rules()
- runner Fact ürettiğinde run_decision_rules çağırır.

Not:
- compute (risk/recovery) hala sonraki sürüm (v27) konusu.
- set_flag ve emit şimdilik Fact tablosuna Flag/Event olarak yazılır.

Tarih: 2026-01-04
