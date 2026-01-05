# UYAP Bot v22 – Concurrency Guard + Fact Extractor + Recorder Spec

Yeni:
1) Case-level concurrency guard:
   - CaseRunLock modeli
   - core/case_lock.py
   - write job'lar aynı case üzerinde aynı anda çalışmaz (CASE_LOCKED -> BLOCKED)

2) Fact extractor utility:
   - core/fact_extractor.py
   - structured table rows -> Fact kayıtları (snapshot referanslı)

3) Recorder mode spec:
   - core/recorder_spec_v22.md

Not:
- CaseRunLock için migrate gerekir.

Tarih: 2026-01-04
