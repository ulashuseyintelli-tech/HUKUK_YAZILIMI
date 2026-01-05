## Job Leasing (multi-worker)

Problem: 2 worker aynı QUEUED job'u aynı anda alabilir.

Çözüm:
- JobRun'a alan ekle:
  - leased_until (datetime)
  - leased_by (worker_id)
- Worker job almadan önce:
  - select_for_update skip_locked ile job seç
  - leased_until = now + lease_ttl
  - leased_by = worker_id
- Worker job bitince:
  - status DONE/FAILED
  - lease clear

Bu paket sadece tasarım + pseudo-code verir.
